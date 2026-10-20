/**
 * 玩家（平台跳跃模式）：全部手感参数与碰撞逻辑都在这里。
 *
 * 手感设计要点：
 *  - 土狼时间（coyote time）：离开平台后 0.1s 内仍可起跳
 *  - 跳跃缓冲（jump buffer）：落地前 0.12s 按跳，落地立刻弹起
 *  - 可变跳跃高度：松开跳键会截断上升速度
 *  - 顶点滞空：接近最高点时重力减小，感觉更"飘"
 *  - 上升轻 / 下落重：落地干脆
 *  - 空中二段跳 + 冲刺（带无敌帧）
 *  - 单向平台、拐角修正、冰面打滑、蘑菇弹床
 *
 * 尺寸基准：tile = 32px。碰撞盒 28x56（约 1.75 格高），视觉角色约 3 格高（大头 chibi）。
 */
import { T } from './level.js';
import { drawGenChar, drawCharAura, DRAW_H } from '../art/genchars.js';
import { drawHitbox } from '../art/hitbox.js';
import { POWER, powerLevel, canSpell, spendPower } from './power.js';

/**
 * 判定圆相对「立绘视觉中心」再往下多少像素。
 * 立绘脚底对齐玩家底边、身高 DRAW_H=104，所以视觉中心在脚底上方 52；
 * 判定点落在中心下方 6px，就是玩家要的「人物中心微微偏下」。
 */
const HIT_CENTER_DROP = 6;

/** 调参集中在这里（32px tile 尺度） */
export const TUNE = {
  w: 28,
  h: 56,

  maxRun: 380,
  focusMul: 0.55,         // 按住 Shift「低速移动」时的速度倍率（并显示判定点）
  accelGround: 2600,
  accelAir: 1700,
  accelTurn: 3600,
  frictionGround: 3600,
  frictionAir: 450,

  // 冰面：摩擦大幅降低，加速度也降低
  iceFrictionMul: 0.10,
  iceAccelMul: 0.35,

  maxFall: 900,
  gravityRise: 2200,
  gravityFall: 2900,
  apexSpeed: 90,
  apexMul: 0.60,

  jumpVel: 750,
  minJumpVel: -450,     // 松开跳键时钳制到的上升速度
  doubleJumpVel: 640,

  coyote: 0.10,
  buffer: 0.12,

  dashSpeed: 900,
  dashTime: 0.14,
  dashCooldown: 0.55,

  hurtKnockX: 420,
  hurtKnockY: -480,
  invuln: 1.15,

  heartsPerLife: 3,

  mushroomBounce: 1250,

  // 游泳：水里重力变轻、下落变慢、水平略慢，按跳给一次划水冲量
  swimGravityMul: 0.3,
  swimMaxFall: 240,
  swimRunMul: 0.8,
  swimStroke: 640,
  swimStrokeCd: 0.26,

  castTime: 0.42,
  castCost: POWER.castCost,
  castInvuln: 2.0,
};

const approach = (v, target, delta) => {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return target;
};

export class Player {
  /**
   * @param {import('./level.js').Level} level
   * @param {object} [opts]
   * @param {'reimu'|'marisa'} [opts.char='reimu']
   * @param {number} [opts.lives=3]
   * @param {number} [opts.x] 出生点（世界坐标，脚底）
   * @param {number} [opts.y]
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.char = opts.char || 'reimu';
    this.maxLives = opts.lives || 3;
    this.lives = this.maxLives;

    const sp = level.playerSpawn || { x: T * 2, y: T * (level.rows - 4) };
    // 地图里的 'P' 标记的是玩家「脚底所在的格子」：出生点要抬到该格的底部
    // 再减去身高，否则会嵌进地面里，_moveX 每帧都被判定为撞墙而卡死。
    this.spawnX = opts.x !== undefined ? opts.x : sp.x;
    this.spawnY = opts.y !== undefined ? opts.y : sp.y + T - TUNE.h;
    this.checkpoint = { x: this.spawnX, y: this.spawnY };

    this.reset(this.spawnX, this.spawnY);
    // 火力继承：上一关累积的 POWER 带进新关（由 Game 传入）
    if (opts.power) this.power = Math.min(this.maxPower, opts.power);
  }

  reset(x = this.checkpoint.x, y = this.checkpoint.y) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.w = TUNE.w;
    this.h = TUNE.h;
    this.facing = 1;

    this.onGround = false;
    this.wasOnGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpsLeft = 1;
    this.jumping = false;

    this.dashing = false;
    this.dashTime = 0;
    this.dashCooldown = 0;
    this.dashDir = 1;

    this.swimCd = 0;

    this.invuln = 0;
    this.hearts = TUNE.heartsPerLife;
    this.alive = true;
    this.focus = false;
    this.power = 0;
    this.maxPower = POWER.max;

    this.casting = false;
    this.castTime = 0;

    this.animTime = 0;
    this.hurtFlash = 0;
    this.combo = 0;

    /** @type {{type:string,[k:string]:any}[]} */
    this.events = [];
  }

  /** 每帧产生的事件队列，读取后需清空 */
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  /** 加到检查点 */
  setCheckpoint(x, y) {
    this.checkpoint = { x, y };
  }

  addPower(n) {
    this.power = Math.min(this.maxPower, this.power + n);
  }

  /** 当前火力等级（1–4），POWER 每 16 点升一级 */
  get fireLevel() {
    return powerLevel(this.power);
  }

  /** 判定半径：真正的受伤判定圆（魔理沙比灵梦小一点） */
  get hitRadius() {
    return this.char === 'marisa' ? 5.4 : 6;
  }

  /**
   * 判定圆心的纵向偏移（相对玩家顶边 / y）。
   * 立绘高 DRAW_H，脚底贴玩家底边 —— 视觉中心 = y + h - DRAW_H/2，
   * 圆心再往下 HIT_CENTER_DROP，绘制与碰撞都从这一个值取，别再各写一份。
   */
  get hitPointOffsetY() {
    return this.h - DRAW_H / 2 + HIT_CENTER_DROP;
  }

  /** 判定点（真实受伤判定的圆心与半径） */
  get hitPoint() {
    return { x: this.x + this.w / 2, y: this.y + this.hitPointOffsetY, r: this.hitRadius };
  }

  /** 是否满足放符卡的条件 */
  canCast() {
    return this.alive && !this.casting && canSpell(this.power);
  }

  update(dt, input) {
    this.prevX = this.x;
    this.prevY = this.y;

    // 按住 Shift：低速移动 + 显示判定点
    this.focus = !!input.down('slow');

    if (!this.alive || this.casting) {
      this._tickDeadOrCast(dt, input);
      return;
    }

    const grounded = this.onGround;
    const onIce = grounded && this.level.isIceUnder(this.x, this.y, this.w, this.h);
    const inWater = this.level.isInWater(this.x, this.y, this.w, this.h);

    // ---------- 计时器 ----------
    this.coyote = grounded ? TUNE.coyote : Math.max(0, this.coyote - dt);
    this.swimCd = Math.max(0, this.swimCd - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.animTime += dt;

    if (grounded) this.jumpsLeft = 1;

    // ---------- 输入 ----------
    const dir = input.axisX;
    if (dir !== 0) this.facing = dir;

    if (input.pressed('jump')) this.jumpBuffer = TUNE.buffer;
    if (input.released('jump') && this.jumping && this.vy < TUNE.minJumpVel) {
      this.vy = TUNE.minJumpVel;
      this.jumping = false;
    }

    // ---------- 符卡 ----------
    if (input.pressed('cast') && this.canCast()) {
      const before = this.power;
      this.power = spendPower(before);
      this.casting = true;
      this.castTime = TUNE.castTime;
      this.invuln = Math.max(this.invuln, TUNE.castInvuln);
      this.vx *= 0.2;
      this.emit('cast', {
        x: this.x + this.w / 2,
        y: this.y + this.h / 2,
        char: this.char,
        cost: POWER.castCost,
        before,
        after: this.power,
        levelBefore: powerLevel(before),
        levelAfter: powerLevel(this.power),
      });
    }

    // ---------- 冲刺 ----------
    if (input.pressed('dash') && this.dashCooldown <= 0 && !this.dashing) {
      this.dashing = true;
      this.dashTime = TUNE.dashTime;
      this.dashCooldown = TUNE.dashCooldown;
      this.dashDir = dir !== 0 ? dir : this.facing;
      this.facing = this.dashDir;
      this.vx = this.dashDir * TUNE.dashSpeed;
      this.vy = 0;
      this.jumping = false;
      this.emit('dash', { x: this.x + this.w / 2, y: this.y + this.h / 2, dir: this.dashDir });
    }

    if (this.dashing) {
      this.dashTime -= dt;
      this.vx = this.dashDir * TUNE.dashSpeed;
      this.vy = 0;
      if (this.dashTime <= 0) {
        this.dashing = false;
        this.vx = this.dashDir * TUNE.maxRun;
      }
    }

    // ---------- 水平速度 ----------
    if (!this.dashing) {
      // 按住 Shift 低速移动：目标极速降到 55%，加速度/摩擦不变，手感更可控
      const maxRun = this.focus ? TUNE.maxRun * TUNE.focusMul : TUNE.maxRun;
      const runCap = inWater ? maxRun * TUNE.swimRunMul : maxRun;
      let accel = grounded ? TUNE.accelGround : TUNE.accelAir;
      let friction = grounded ? TUNE.frictionGround : TUNE.frictionAir;
      if (onIce) {
        accel *= TUNE.iceAccelMul;
        friction *= TUNE.iceFrictionMul;
      }
      if (dir !== 0) {
        let a = accel;
        if (this.vx * dir < 0) a = grounded ? TUNE.accelTurn : accel * 1.6;
        this.vx = approach(this.vx, dir * runCap, a * dt);
      } else {
        this.vx = approach(this.vx, 0, friction * dt);
      }
    }

    // ---------- 重力 ----------
    if (!this.dashing) {
      let g = this.vy < 0 ? TUNE.gravityRise : TUNE.gravityFall;
      if (Math.abs(this.vy) < TUNE.apexSpeed) g *= TUNE.apexMul;
      if (inWater) g *= TUNE.swimGravityMul;
      this.vy += g * dt;
      const fallCap = inWater ? TUNE.swimMaxFall : TUNE.maxFall;
      if (this.vy > fallCap) this.vy = fallCap;
    }

    // ---------- 游泳划水 ----------
    if (inWater && this.jumpBuffer > 0 && this.swimCd <= 0) {
      this.vy = -TUNE.swimStroke;
      this.jumpBuffer = 0;
      this.jumpsLeft = 1;
      this.jumping = false;
      this.onGround = false;
      this.swimCd = TUNE.swimStrokeCd;
    }

    // ---------- 跳跃 ----------
    if (this.jumpBuffer > 0 && !this.dashing) {
      if (this.coyote > 0) {
        this.vy = -TUNE.jumpVel;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.jumpsLeft = 1;
        this.jumping = true;
        this.onGround = false;
        this.emit('jump', { x: this.x + this.w / 2, y: this.y + this.h });
      } else if (this.jumpsLeft > 0) {
        this.jumpsLeft = 0;
        this.vy = -TUNE.doubleJumpVel;
        this.jumpBuffer = 0;
        this.jumping = true;
        this.emit('doubleJump', { x: this.x + this.w / 2, y: this.y + this.h });
      }
    }
    if (this.vy >= 0) this.jumping = false;

    // ---------- 移动与碰撞 ----------
    this.wasOnGround = grounded;
    this.onGround = false;
    this._moveX(this.vx * dt);
    this._moveY(this.vy * dt);

    // 落地
    if (!grounded && this.onGround) {
      this.emit('land', { x: this.x + this.w / 2, y: this.y + this.h, vy: this.vy, ice: onIce });
    }

    // ---------- 蘑菇弹床 ----------
    if (this.onGround && this.vy === 0) {
      const m = this.level.mushroomUnder(this.x, this.y, this.w, this.h);
      if (m) {
        this.vy = -TUNE.mushroomBounce;
        this.onGround = false;
        this.jumpsLeft = 1;
        this.emit('bounce', { x: m.x, y: m.y, cx: m.cx, cy: m.cy });
      }
    }

    // ---------- 尖刺 ----------
    if (this.invuln <= 0 && this.level.rectHitsSpike(this.x, this.y, this.w, this.h)) {
      this.hurt(this.facing * -1);
    }

    // ---------- 掉出地图 ----------
    if (this.y > this.level.h + 80) {
      this.die();
    }
  }

  _tickDeadOrCast(dt, input) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.animTime += dt;
    if (this.casting) {
      this.castTime -= dt;
      if (this.castTime <= 0) this.casting = false;
      // 施法中仍然受重力与碰撞约束，但不响应输入
      this.vy = Math.min(this.vy + TUNE.gravityFall * dt, TUNE.maxFall);
      this.vx *= 0.86;
      this._moveX(this.vx * dt);
      this._moveY(this.vy * dt);
      return;
    }
    // 死亡坠落动画
    this.vy = Math.min(this.vy + TUNE.gravityFall * dt, TUNE.maxFall);
    this.y += this.vy * dt;
  }

  _moveX(dx) {
    if (dx === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(dx) / 8));
    const sx = dx / steps;
    for (let i = 0; i < steps; i++) {
      this.x += sx;
      if (this.level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
        const blockedX = this.x;
        this.x -= sx;
        // 注意：必须在「被挡住的那个 x」上做抬升检测。
        // 若在回退后的 x 上检测，旧位置本来就不重叠，会每帧误判成功、
        // 把玩家往上顶 1px（贴墙时抖动 / 慢慢爬墙）。
        if (!this._cornerCorrectX(blockedX)) {
          this.vx = 0;
          this.dashing = false;
        }
        return;
      }
    }
  }

  /** 水平撞墙但头顶有余量时，把玩家往上推一点，避免卡在墙角 */
  _cornerCorrectX(blockedX) {
    for (let lift = 1; lift <= 10; lift++) {
      if (!this.level.rectHitsSolid(blockedX, this.y - lift, this.w, this.h)) {
        this.y -= lift;
        return true;
      }
    }
    return false;
  }

  _moveY(dy) {
    if (dy === 0) return;
    const steps = Math.max(1, Math.ceil(Math.abs(dy) / 8));
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      const prevBottom = this.y + this.h;
      this.y += sy;

      if (this.level.rectHitsSolid(this.x, this.y, this.w, this.h)) {
        this.y -= sy;
        if (sy < 0) {
          if (!this._cornerCorrectYHead()) this.vy = 0;
          else this.vy = 0;
          this.jumping = false;
        } else {
          this.onGround = true;
          this.vy = 0;
        }
        return;
      }

      // 单向平台：只在向下移动、且上一步脚底还在平台顶面之上时吸附
      if (sy > 0) {
        const bottom = this.y + this.h;
        const cx0 = Math.floor(this.x / T);
        const cx1 = Math.floor((this.x + this.w - 1) / T);
        const cy0 = Math.floor(prevBottom / T);
        const cy1 = Math.floor(bottom / T);
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            if (!this.level.isPlatformTile(cx, cy)) continue;
            const top = cy * T;
            if (prevBottom <= top + 1 && bottom >= top) {
              this.y = top - this.h;
              this.vy = 0;
              this.onGround = true;
              return;
            }
          }
        }
      }
    }
  }

  _cornerCorrectYHead() {
    for (let shift = 1; shift <= 8; shift++) {
      for (const s of [1, -1]) {
        const nx = this.x + shift * s;
        if (!this.level.rectHitsSolid(nx, this.y, this.w, this.h)) {
          this.x = nx;
          return true;
        }
      }
    }
    return false;
  }

  /** 受伤。dir：伤害来源方向（-1 从左边来，玩家被推向右边） */
  hurt(dir, sourceX = null) {
    if (this.invuln > 0 || !this.alive || this.casting) return;
    if (sourceX !== null) dir = this.x + this.w / 2 < sourceX ? -1 : 1;
    this.hearts--;
    this.invuln = TUNE.invuln;
    this.hurtFlash = 0.25;
    this.combo = 0;
    this.vx = dir * TUNE.hurtKnockX;
    this.vy = TUNE.hurtKnockY;
    this.dashing = false;
    this.jumping = false;
    this.onGround = false;
    this.emit('hurt', {
      x: this.x + this.w / 2,
      y: this.y + this.h / 2,
      hearts: this.hearts,
    });
    if (this.hearts <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hearts = 0;
    this.vy = -620;
    this.vx = 0;
    this.emit('die', { x: this.x + this.w / 2, y: this.y + this.h / 2 });
  }

  /** 消耗一条残机，回到检查点。返回是否还能继续 */
  respawn() {
    this.lives--;
    if (this.lives <= 0) return false;
    const keepsPower = Math.floor(this.power * POWER.respawnKeep.platform);
    this.reset(this.checkpoint.x, this.checkpoint.y);
    this.power = keepsPower;
    return true;
  }

  // ---------- 状态与绘制 ----------
  get state() {
    if (!this.alive) return 'hurt';
    if (this.casting) return 'cast';
    if (this.hurtFlash > 0) return 'hurt';
    if (this.dashing) return 'dash';
    if (!this.onGround) return this.vy < 0 ? 'jump' : 'fall';
    if (Math.abs(this.vx) > 30) return 'run';
    return 'idle';
  }

  /** 当前渲染位置（供相机与插值） */
  renderPos(alpha) {
    return {
      x: this.prevX + (this.x - this.prevX) * alpha,
      y: this.prevY + (this.y - this.prevY) * alpha,
    };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx 已经按相机偏移过的坐标系
   * @param {number} alpha 插值系数
   */
  draw(ctx, alpha = 1) {
    const p = this.renderPos(alpha);
    const cx = p.x + this.w / 2;
    const cy = p.y + this.h;

    let a = 1;
    if (this.invuln > 0) {
      const f = Math.floor(this.invuln * 20) % 2;
      a = f === 0 ? 0.32 : 1;
    }
    if (!this.alive) a = Math.max(0.15, 1 - (this.y - this.prevY) * 0.002);

    ctx.save();
    ctx.translate(cx, cy);
    const charOpts = {
      char: this.char,
      state: this.state,
      t: this.animTime,
      facing: this.facing,
      vx: this.vx,
      vy: this.vy,
      flash: this.hurtFlash > 0 ? Math.min(1, this.hurtFlash * 4) : 0,
      alpha: a,
      scale: 1,
    };
    if (!drawGenChar(ctx, charOpts)) drawCharAura(ctx, this.char, a);
    ctx.restore();

    // 低速移动时显示判定点：位置与 stage.playerHitPoint 保持一致
    if (this.focus && this.alive) {
      drawHitbox(
        ctx,
        cx,
        p.y + this.hitPointOffsetY,
        this.hitRadius,
        this.animTime,
        this.char === 'marisa' ? '#ffd23f' : '#ff5ea8'
      );
    }
  }
}
