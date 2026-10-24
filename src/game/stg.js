/**
 * 飞行关（STG 模式）：横向卷轴弹幕射击。
 *
 * 坐标约定：
 *  - 关卡像平台关一样有世界坐标（宽 = level.w）
 *  - 相机固定以 scrollSpeed 向右推进，玩家的「屏幕位置」由输入控制，
 *    世界坐标 = scroll + 屏幕位置。判定与弹幕全部用世界坐标。
 *
 * 操作：方向键自由移动，Z/J 连射，Shift 低速移动（显示判定点），K/C 冲刺（短无敌位移），X/L/V 符卡。
 */
import { drawGenChar, drawCharAura, DRAW_H, POSE_RATIO } from '../art/genchars.js';
import { drawGenFairy } from '../art/genfairy.js';
import { drawHitbox } from '../art/hitbox.js';
import { POWER, powerLevel, canSpell, spendPower } from './power.js';
import { scaleEnemyHp, scalePlayerDamage } from './balance.js';

const SPEED = 340;
const ACCEL = 3200;
const FRICTION = 2600;
const DASH_SPEED = 900;
const DASH_TIME = 0.16;
// 玩家判定半径（东方风：判定点比视觉小得多；魔理沙比灵梦小一点）
const HIT_R = { reimu: 4.2, marisa: 3.6 };

/* 判定点位置：立绘画在 translate(sx, sy + 浮动) 后再 translate(0, HIT_FEET_DY)，
 * 脚底就在 sy + HIT_FEET_DY；飞行姿势高 DRAW_H*POSE_RATIO.fly = 89.44，
 * 所以视觉中心在 sy + 38 - 44.72 = sy - 6.72。
 * 判定圆落在「人物中心微微偏下」→ 中心再往下 HIT_CENTER_DROP=6px ≈ sy - 0.7。
 * 绘制与碰撞都从 HIT_OFFSET_Y 取，不各写一份。 */
const HIT_FEET_DY = 38;
const HIT_CENTER_DROP = 6;
const HIT_OFFSET_Y = HIT_FEET_DY - (DRAW_H * POSE_RATIO.fly) / 2 + HIT_CENTER_DROP;

export class StgPlayer {
  constructor(opts = {}) {
    this.char = opts.char || 'reimu';
    this.w = 28;
    this.h = 56;
    this.maxLives = opts.lives || 3;
    this.lives = this.maxLives;
    this.hearts = 3;
    this.maxPower = POWER.max;
    this.power = Math.min(POWER.max, opts.power || 0);

    this.sx = 260;       // 屏幕内位置
    this.sy = 400;
    this.vx = 0;
    this.vy = 0;
    this.scroll = 0;
    this.worldX = this.scroll + this.sx;
    this.worldY = this.sy;

    this.facing = 1;
    this.dashing = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDirX = 1;
    this.dashDirY = 0;

    this.invuln = 0;
    this.hitFlash = 0;
    this.alive = true;
    this.animTime = 0;
    this.deadT = 0;
    this.hurtT = 0;

    this.shootCd = 0;
    this.casting = false;
    this.castT = 0;

    this.events = [];
    this.focus = false;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** 当前火力等级（1–4） */
  get fireLevel() {
    return powerLevel(this.power);
  }

  /** 是否满足放符卡的条件 */
  canCast() {
    return this.alive && !this.casting && canSpell(this.power);
  }

  syncWorld(scroll) {
    this.scroll = scroll;
    this.worldX = scroll + this.sx;
    this.worldY = this.sy;
  }

  /** 判定半径：真正的受伤判定圆（魔理沙比灵梦小一点） */
  get hitRadius() {
    return HIT_R[this.char] || HIT_R.reimu;
  }

  get hitPoint() {
    return { x: this.worldX, y: this.worldY + HIT_OFFSET_Y, r: this.hitRadius };
  }

  update(dt, input, scroll) {
    this.animTime += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.scroll = scroll;

    if (!this.alive) {
      this.focus = false;
      this.deadT += dt;
      this.sy += 60 * dt;
      this.syncWorld(scroll);
      return;
    }

    if (this.casting) {
      this.castT -= dt;
      if (this.castT <= 0) this.casting = false;
      this.vx *= 0.9;
      this.vy *= 0.9;
    }

    // 摇杆给的是 -1..1 模拟量（键盘仍是 ±1）：幅度决定速度，方向只用于朝向/冲刺。
    // 方向键仍然走数字输入，所以键盘手感和原来完全一致。
    const ax = input.moveX || 0;
    const ayAll = input.moveY || 0;
    const fdx = Math.abs(ax) > 0.2 ? Math.sign(ax) : 0;
    const fdy = Math.abs(ayAll) > 0.2 ? Math.sign(ayAll) : 0;

    // 按住 Shift 低速移动：移速降到 50%，并显示判定点
    this.focus = !!input.down('slow');
    const spd = this.focus ? SPEED * 0.5 : SPEED;

    if (fdx !== 0) this.facing = fdx;

    // 冲刺
    if (input.pressed('dash') && this.dashCd <= 0 && !this.dashing && !this.casting) {
      this.dashing = true;
      this.dashT = DASH_TIME;
      this.dashCd = 0.6;
      this.dashDirX = fdx !== 0 ? fdx : this.facing;
      this.dashDirY = fdy;
      const len = Math.hypot(this.dashDirX, this.dashDirY) || 1;
      this.dashDirX /= len;
      this.dashDirY /= len;
      this.invuln = Math.max(this.invuln, DASH_TIME + 0.12);
      this.emit('dash', { x: this.worldX, y: this.worldY });
    }

    if (this.dashing) {
      this.dashT -= dt;
      this.sx += this.dashDirX * DASH_SPEED * dt;
      this.sy += this.dashDirY * DASH_SPEED * dt;
      if (this.dashT <= 0) {
        this.dashing = false;
        this.vx = this.dashDirX * SPEED * 0.6;
        this.vy = this.dashDirY * SPEED * 0.6;
      }
    } else if (!this.casting) {
      if (ax !== 0) this.vx += Math.sign(ax * spd - this.vx) * Math.min(ACCEL * dt, Math.abs(ax * spd - this.vx));
      else this.vx = approach(this.vx, 0, FRICTION * dt);
      if (ayAll !== 0) this.vy += Math.sign(ayAll * spd - this.vy) * Math.min(ACCEL * dt, Math.abs(ayAll * spd - this.vy));
      else this.vy = approach(this.vy, 0, FRICTION * dt);

      this.sx += this.vx * dt;
      this.sy += this.vy * dt;
    }

    // 屏幕边界钳制
    const minX = 90;
    const maxX = 1280 - 200;
    const minY = 70;
    const maxY = 690;
    if (this.sx < minX) { this.sx = minX; this.vx = Math.max(0, this.vx); }
    if (this.sx > maxX) { this.sx = maxX; this.vx = Math.min(0, this.vx); }
    if (this.sy < minY) { this.sy = minY; this.vy = Math.max(0, this.vy); }
    if (this.sy > maxY) { this.sy = maxY; this.vy = Math.min(0, this.vy); }

    // 符卡：扣 POWER，火力等级随之下降（清屏与伤害由 Stage 统一处理）
    if (input.pressed('cast') && this.canCast()) {
      const before = this.power;
      this.power = spendPower(before);
      this.casting = true;
      this.castT = 0.5;
      this.invuln = Math.max(this.invuln, 2.2);
      this.emit('cast', {
        x: this.worldX,
        y: this.worldY,
        char: this.char,
        cost: POWER.castCost,
        before,
        after: this.power,
        levelBefore: powerLevel(before),
        levelAfter: powerLevel(this.power),
      });
    }

    this.syncWorld(scroll);
  }

  hurt(dir = 1) {
    if (this.invuln > 0 || !this.alive) return;
    this.hearts--;
    this.invuln = 1.4;
    this.hitFlash = 0.3;
    this.hurtT = 0.28;
    this.emit('hurt', { x: this.worldX, y: this.worldY, hearts: this.hearts });
    if (this.hearts <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    this.hearts = 0;
    this.emit('die', { x: this.worldX, y: this.worldY });
  }

  respawn() {
    this.lives--;
    if (this.lives <= 0) return false;
    this.alive = true;
    this.hearts = 3;
    this.invuln = 2.4;
    this.deadT = 0;
    this.sx = 260;
    this.sy = 400;
    this.vx = 0;
    this.vy = 0;
    this.power = Math.floor(this.power * POWER.respawnKeep.stg);
    return true;
  }

  get state() {
    if (!this.alive) return 'hurt';
    if (this.casting) return 'cast';
    if (this.hurtT > 0) return 'hurt';
    if (this.dashing) return 'dash';
    return 'idle';
  }

  /**
   * 在「屏幕坐标系」下绘制。
   */
  draw(ctx) {
    if (!this.alive && this.deadT > 1.2) return;
    let a = 1;
    if (this.invuln > 0) {
      const f = Math.floor(this.invuln * 20) % 2;
      a = f === 0 ? 0.3 : 1;
    }
    if (!this.alive) a = Math.max(0, 1 - this.deadT / 1.2);

    ctx.save();
    ctx.translate(this.sx, this.sy + Math.sin(this.animTime * 2.6) * 2.5);

    // 飞行光环（角色身后），让自机看起来是「在飞」而不是「悬空站着」
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(0, 14, 2, 0, 14, 46);
    halo.addColorStop(0, this.char === 'marisa' ? 'rgba(255,238,150,0.30)' : 'rgba(255,175,215,0.30)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 13, 29, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 优先用 AI 帧（与平台关同一套立绘）：飞行姿势 + 随横移轻微前倾
    const charOpts = {
      char: this.char,
      state: this.state,
      t: this.animTime + 1.3,
      facing: this.facing,
      vx: this.vx,
      vy: this.vy,
      flash: this.hitFlash > 0 ? Math.min(1, this.hitFlash * 4) : 0,
      alpha: a,
    };
    ctx.save();
    ctx.translate(0, HIT_FEET_DY);
    const drewAI = drawGenChar(ctx, {
      ...charOpts,
      state: (this.state === 'idle' || this.state === 'cast') ? 'fly' : this.state,
      rot: Math.max(-0.1, Math.min(0.1, this.vx * 0.00035)),
    });
    ctx.restore();
    if (!drewAI) {
      ctx.save();
      ctx.translate(0, HIT_FEET_DY);
      drawCharAura(ctx, this.char, a);
      ctx.restore();
    }

    ctx.restore();

    // 判定点：只在按住 Shift 低速移动时显示。
    // 画在角色之后（不被立绘盖住），位置严格取 hitPoint，不跟随上下浮动。
    if (this.focus && this.alive) {
      drawHitbox(ctx, this.sx, this.sy + HIT_OFFSET_Y, this.hitRadius, this.animTime,
        this.char === 'marisa' ? '#ffd23f' : '#ff5ea8');
    }
  }
}


/* ============================================================
   飞行关的敌机与关卡导演
   ============================================================ */

const ENEMY_KINDS = {
  scout: { hp: 13, w: 26, h: 30, color: '#8fd8ff', aura: 'blue', speed: 150, rate: 1.5, aim: true },
  gunner: { hp: 26, w: 34, h: 38, color: '#ff9ad0', aura: 'red', speed: 90, rate: 1.0, aim: false },
  diver: { hp: 10, w: 24, h: 28, color: '#ffd27a', aura: 'yellow', speed: 240, rate: 2.4, aim: true },
  // 扩展兵种（同样按幻想乡的妖精 / 妖怪设计）：弓妖精 / 魔法妖精 / 提灯妖精 / 大妖精
  sniper: { hp: 20, w: 28, h: 32, color: '#9ad0ff', aura: 'blue', speed: 118, rate: 1.9, aim: true },
  spinner: { hp: 23, w: 32, h: 34, color: '#c79bff', aura: 'purple', speed: 96, rate: 0.18 },
  bomber: { hp: 33, w: 40, h: 38, color: '#ffb066', aura: 'yellow', speed: 72, rate: 2.6 },
  turret: { hp: 39, w: 40, h: 44, color: '#9fe6a0', aura: 'green', speed: 108, rate: 2.1 },
};

class StgEnemy {
  constructor(kind, x, y, aura) {
    const k = ENEMY_KINDS[kind];
    this.kind = kind;
    this.k = k;
    this.aura = aura || k.aura;
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.hp = scaleEnemyHp(k.hp);
    this.maxHp = scaleEnemyHp(k.hp);
    this.w = k.w;
    this.h = k.h;
    this.vx = -k.speed;
    this.t = 0;
    this.alive = true;
    this.hitFlash = 0;
    this.fireT = Math.random() * 0.8;
    this.phase = Math.random() * 6.28;
    this.spinA = Math.random() * 6.28;
    this.ringA = Math.random() * 6.28;
    // 弹幕变体计数（对向双环 / 交叉双线交替用）
    this.shotAlt = 0;
    this.enterT = kind === 'turret' ? 1.7 : 0;
    this.size = Math.max(k.w, k.h) * 1.25;
  }

  /** 各兵种轨迹：统一向左推进，但速度 / 悬浮幅度不同；大妖精进场后定点 */
  _move(dt) {
    const k = this.k;
    if (this.kind === 'turret') {
      this.enterT -= dt;
      if (this.enterT <= 0) this.vx = 0;
    }
    this.x += this.vx * dt;

    let amp = 22;
    let hz = 2.2;
    if (this.kind === 'spinner') { amp = 34; hz = 1.7; }
    else if (this.kind === 'sniper') { amp = 26; hz = 1.5; }
    else if (this.kind === 'bomber') { amp = 16; hz = 1.4; }
    else if (this.kind === 'turret') { amp = 6; hz = 1.1; }
    this.y = this.baseY + Math.sin(this.t * hz + this.phase) * amp;
  }

  update(dt, bullets, px, py, mods = null) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this._move(dt);

    const speedMul = mods ? mods.speed : 1;
    const fireMul = mods ? mods.fire : 1;
    const cap = mods ? mods.cap : 520;
    const budget = mods ? (mods.budget || 1200) : 1200;
    const shotSpeed = (base) => Math.min(cap, base * speedMul);
    // 射速：所有齐射冷却统一再快 12%（配合难度表的 stgScoutShots / stgGunnerShots 提高齐射数）
    const rate = (base) => base * fireMul * 0.88;
    // 快慢混编：同一轮弹幕按发序轮换速度倍率，不再整屏一个速度。
    // 倍率来自难度表 stgSpeedBands（EX 快/中/慢三层，E 同速），叠在 shotSpeed 之上、
    // 再各自被 cap 夹住，所以快档也不会把弹速护栏顶穿。
    const bands = mods && Array.isArray(mods.bands) && mods.bands.length ? mods.bands : null;
    const mix = bands ? { speedVar: bands, speedCap: cap } : null;
    const banded = (sp, i) => {
      const m = bands ? bands[i % bands.length] : 1;
      return Math.min(cap, sp * m);
    };

    // 魔法妖精：持续螺旋（不占齐射冷却；弹幕池有软上限）
    if (this.kind === 'spinner') {
      this.spinA += 2.3 * dt;
      this.fireT -= dt;
      if (this.fireT > 0 || !bullets) return;
      this.fireT = Math.max(0.1, rate(this.k.rate));
      if (bullets.count() >= budget) return;
      const arms = mods && mods.scout >= 4 ? 3 : mods && mods.scout > 2 ? 2 : 1;
      for (let k = 0; k < arms; k++) {
        // 每条螺旋臂吃一档速度：EX 三臂 = 快 / 中 / 慢三条不同转速的螺线叠在一起
        bullets.spiral(this.x, this.y, this.spinA + (k / arms) * Math.PI, banded(shotSpeed(155), k), {
          color: this.k.color, r: 5, life: 5, type: 0,
        });
      }
      return;
    }

    this.fireT -= dt;
    if (this.fireT > 0 || !bullets || bullets.count() >= budget) return;

    const n = mods ? mods.gunner : 3;
    const nScout = mods ? mods.scout : 1;
    switch (this.kind) {
      case 'sniper': {
        // 交叉双线（新弹幕样式）：左右两个发射点各射一束瞄准米弹，两股流线在玩家附近交叉；
        // 每束里快慢弹交替，两条交叉线的「到达时间」不再整齐划一。
        this.fireT = rate(this.k.rate);
        const streams = Math.max(1, nScout);
        for (const side of [-1, 1]) {
          const bx = this.x + side * 24;
          const by = this.y + side * 6;
          const aa = Math.atan2(py - by, px - bx);
          bullets.fan(bx, by, streams, 0.05, aa, shotSpeed(320), {
            color: this.k.color, r: 5, life: 5, type: 1, ...(mix || {}),
          });
        }
        break;
      }
      case 'turret': {
        // 大妖精定点：主环 + 每两轮追加一圈反向慢速环（新弹幕样式：对向双环）
        this.fireT = rate(this.k.rate);
        const count = 6 + Math.min(2, Math.max(0, n - 3));
        bullets.ring(this.x, this.y, count, shotSpeed(145), {
          angle: this.ringA, color: this.k.color, r: 6, life: 5, type: 0, ...(mix || {}),
        });
        if ((this.shotAlt = (this.shotAlt || 0) + 1) % 2 === 0) {
          // 反向慢环整体再压一档，和主环拉开明显的「慢一截」
          bullets.ring(this.x, this.y, Math.max(4, count - 2), shotSpeed(92) * (bands ? bands[bands.length - 1] : 1), {
            angle: -this.ringA * 1.4, color: this.k.aura === 'green' ? '#bfffc0' : this.k.color,
            r: 5, life: 5.5, type: 0,
          });
        }
        this.ringA += Math.PI / count;
        break;
      }
      case 'bomber': {
        // 抛物延迟雨：下坠加速，落地前有时间闪避；
        // 奇偶两档初速/加速度 → 同一串雨里有的快落、有的慢慢飘下来
        this.fireT = rate(this.k.rate);
        const count = Math.max(2, Math.round(n * 0.7));
        for (let k = 0; k < count; k++) {
          const bx = this.x + (k - (count - 1) / 2) * 22;
          const heavy = k % 2 === 1;
          bullets.spawn({
            x: bx, y: this.y + 12, vx: -18, vy: heavy ? 58 : 20,
            accel: heavy ? 300 : 130,
            color: this.k.color, r: 6, life: 6, type: 1,
          });
        }
        break;
      }
      case 'gunner': {
        this.fireT = rate(this.k.rate);
        bullets.fan(this.x, this.y, n, 0.5, Math.PI * 0.86, shotSpeed(190), {
          color: this.k.color, r: 6, life: 5, ...(mix || {}),
        });
        break;
      }
      default: {
        // scout / diver：单发瞄准，高难度变成小扇
        this.fireT = rate(this.k.rate);
        const a = Math.atan2(py - this.y, px - this.x);
        if (nScout > 1) {
          bullets.fan(this.x, this.y, nScout, 0.2, a, shotSpeed(230), {
            color: this.k.color, r: 6, life: 5, ...(mix || {}),
          });
        } else {
          bullets.spawn({
            x: this.x, y: this.y,
            vx: Math.cos(a) * shotSpeed(230),
            vy: Math.sin(a) * shotSpeed(230),
            color: this.k.color, r: 6, life: 5,
          });
        }
        break;
      }
    }
  }

  draw(ctx) {
    const k = this.k;
    ctx.save();
    ctx.translate(this.x, this.y);

    // AI 妖精优先（尺寸跟随敌机包围盒）
    const drewAi = drawGenFairy(ctx, {
      colorKey: this.aura || 'blue',
      t: this.t,
      alpha: 1,
      facing: 1,
      dead: 0,
      flash: this.hitFlash > 0 ? Math.min(1, this.hitFlash / 0.12) * 0.7 : 0,
      size: this.size,
    });
    if (drewAi) {
      this._drawKindDecor(ctx);
      ctx.restore();
      return;
    }

    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    g.addColorStop(0, `${k.color}88`);
    g.addColorStop(1, `${k.color}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 菱形机体 + 翅膀
    const flap = Math.sin(this.t * 12) * 4;
    ctx.fillStyle = k.color;
    ctx.strokeStyle = '#1a1230';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-this.w * 0.5, -3 + flap);
    ctx.lineTo(-this.w * 0.8, -8 + flap);
    ctx.lineTo(-this.w * 0.5, 2 + flap);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.w * 0.5, -3 - flap);
    ctx.lineTo(this.w * 0.8, -8 - flap);
    ctx.lineTo(this.w * 0.5, 2 - flap);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : k.color;
    ctx.beginPath();
    ctx.moveTo(0, -this.h * 0.5);
    ctx.lineTo(this.w * 0.34, 0);
    ctx.lineTo(0, this.h * 0.5);
    ctx.lineTo(-this.w * 0.34, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#241838';
    ctx.stroke();

    // 核心
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 妖精本体：圆头 + 眼睛，让人一眼看出「小妖精骑在弹幕里」
    const hr = Math.max(8, this.w * 0.42);
    const hy = -this.h * 0.78;
    ctx.fillStyle = '#ffe6da';
    ctx.strokeStyle = '#241838';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, hy, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 发色
    ctx.fillStyle = k.color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, hy - hr * 0.42, hr * 0.92, Math.PI * 1.02, Math.PI * 1.98);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 眼睛
    ctx.fillStyle = '#241838';
    ctx.beginPath();
    ctx.arc(-hr * 0.36, hy - hr * 0.02, 2.2, 0, Math.PI * 2);
    ctx.arc(hr * 0.36, hy - hr * 0.02, 2.2, 0, Math.PI * 2);
    ctx.fill();

    this._drawKindDecor(ctx);
    ctx.restore();
  }

  /** 扩展兵种的附加装饰：弓 / 魔法阵 / 鬼火 / 大妖精的光轮（全部是幻想乡的符与妖火） */
  _drawKindDecor(ctx) {
    const k = this.k;
    const t = this.t;
    ctx.save();
    if (this.kind === 'sniper') {
      // 弓妖精：一张月牙长弓，弦随开火节奏拉满，箭尖始终指着自机方向
      const pull = 1.5 + 2.5 * Math.max(0, Math.sin(t * 2.2));
      ctx.strokeStyle = `${k.color}dd`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.w * 0.55, 0, this.w * 0.55, Math.PI * 0.62, Math.PI * 1.38);
      ctx.stroke();
      const ax0 = this.w * 0.55 + Math.cos(Math.PI * 0.62) * this.w * 0.55;
      const ay0 = Math.sin(Math.PI * 0.62) * this.w * 0.55;
      const ax1 = this.w * 0.55 + Math.cos(Math.PI * 1.38) * this.w * 0.55;
      const ay1 = Math.sin(Math.PI * 1.38) * this.w * 0.55;
      ctx.strokeStyle = `${k.color}88`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax0, ay0);
      ctx.lineTo(this.w * 0.55 - pull, 0);
      ctx.lineTo(ax1, ay1);
      ctx.stroke();
      // 搭在弦上的箭
      ctx.strokeStyle = `${k.color}f0`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(this.w * 0.55 - pull, 0);
      ctx.lineTo(-this.w * 0.85, 0);
      ctx.stroke();
      ctx.fillStyle = `${k.color}f0`;
      ctx.beginPath();
      ctx.moveTo(-this.w * 0.85 - 4, 0);
      ctx.lineTo(-this.w * 0.85 + 1, -2.2);
      ctx.lineTo(-this.w * 0.85 + 1, 2.2);
      ctx.closePath();
      ctx.fill();
    } else if (this.kind === 'spinner') {
      // 魔法妖精：一圈星之魔法阵 + 四颗绕行星点
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `${k.color}88`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, this.w * 0.68, t * 2.6, t * 2.6 + Math.PI * 1.4);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a = t * 3.2 + (i * Math.PI) / 2;
        ctx.fillStyle = `${k.color}cc`;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * this.w * 0.7, Math.sin(a) * this.w * 0.7, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.kind === 'bomber') {
      // 提灯妖精：两簇青白色鬼火悬在身下，火苗随呼吸一明一暗
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      ctx.globalCompositeOperation = 'lighter';
      for (const sx of [-1, 1]) {
        const bx = sx * this.w * 0.3 + Math.sin(t * 2.4 + sx) * 1.5;
        const by = this.h * 0.56 + Math.sin(t * 3.1 + sx * 2) * 1.4;
        const hgt = 11 + pulse * 3;
        // 外晕
        ctx.fillStyle = `${k.color}22`;
        ctx.beginPath();
        ctx.arc(bx, by - hgt * 0.25, 8.5 + pulse * 2.4, 0, Math.PI * 2);
        ctx.fill();
        // 鬼火：上尖下圆的水滴，尖端轻轻摇曳
        const tipX = bx + Math.sin(t * 5.2 + sx) * 1.6;
        ctx.fillStyle = `rgba(186,232,255,${0.5 + pulse * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(tipX, by - hgt);
        ctx.bezierCurveTo(bx + 5, by - hgt * 0.34, bx + 4.4, by + 3.8, bx, by + 5);
        ctx.bezierCurveTo(bx - 4.4, by + 3.8, bx - 5, by - hgt * 0.34, tipX, by - hgt);
        ctx.fill();
        // 内焰
        ctx.fillStyle = `rgba(255,255,255,${0.48 + pulse * 0.42})`;
        ctx.beginPath();
        ctx.ellipse(bx, by - 0.5, 1.5, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        // 飘散的火星
        for (let m = 0; m < 2; m++) {
          const ea = t * 1.9 + m * 2.4 + sx;
          ctx.fillStyle = `rgba(200,240,255,${0.25 + 0.3 * (0.5 + 0.5 * Math.sin(ea * 2))})`;
          ctx.beginPath();
          ctx.arc(bx + Math.sin(ea) * 3.2, by - hgt - 2 - ((ea * 4) % 9), 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (this.kind === 'turret') {
      // 大妖精：立定后张开背后一圈薄光轮，头顶三颗魔力星缓缓公转
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `${k.color}55`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.w * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `${k.color}88`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, this.w * 0.58, t * 0.9, t * 0.9 + Math.PI * 1.25);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.55 + Math.sin(t * 0.8) * 0.12;
        const px = Math.cos(a) * this.w * 0.5;
        const py = Math.sin(a) * this.h * 0.78;
        ctx.fillStyle = `${k.color}dd`;
        ctx.beginPath();
        ctx.arc(px, py, 2.1 + Math.sin(t * 3 + i) * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/**
 * 飞行关导演：滚动、波次、Boss 触发。
 */
export class StgStage {
  /**
   * @param {import('./level.js').Level} level
   * @param {object} [diff] 难度配置（DIFFICULTIES 里的一项）；不传则按 N 处理
   * @param {number} [stageDensity] 分面弹幕密度系数（2–6 面 < 1；Extra / 缺省 1）
   */
  constructor(level, diff = null, stageDensity = 1) {
    this.level = level;
    this.diff = diff || null;
    this.scroll = 0;
    this.speed = 165;
    this.t = 0;
    this.enemies = [];
    this.waves = [];
    this.waveIdx = 0;
    this.finished = false;
    this.reachedBoss = false;
    // Boss 战期间暂停刷道中敌机（由 Stage 按时间轴置位）
    this.spawnPaused = false;

    // 分面密度：2–6 面道中更稀（齐射发数变少、开火间隔变长）；Extra 传 0 → 1.00
    const dens = Math.min(1.5, Math.max(0.4, Number(stageDensity) || 1));

    // 道中敌机的难度倍率：弹速 / 开火间隔 / 每次齐射发数
    this.enemyBulletScale = Number(diff?.enemyBulletScale) || 1;
    this.enemyFireScale = (Number(diff?.enemyFireScale) || 1) / dens;
    this.enemySpeedCap = Number(diff?.bulletSpeedCap) || 520;
    const budget = Number(diff?.bulletBudget) || 950;
    this.enemyBulletBudget = Math.min(1250, Math.max(300, budget * 0.88));
    // 弹速分档：同一轮弹幕里快慢混编（见 StgEnemy.update 的 mix / banded）。
    // 难度表 stgSpeedBands 决定快慢差：E 同速好读，越往上拉得越开，EX 快 / 中 / 慢三层。
    const bands = Array.isArray(diff?.stgSpeedBands) && diff.stgSpeedBands.length
      ? diff.stgSpeedBands.slice()
      : null;
    this.stgSpeedBands = bands;
    this.enemyMods = {
      speed: this.enemyBulletScale,
      fire: this.enemyFireScale,
      cap: this.enemySpeedCap,
      scout: Math.max(1, Math.round((Number(diff?.stgScoutShots) || 1) * dens)),
      gunner: Math.max(1, Math.round((Number(diff?.stgGunnerShots) || 3) * dens)),
      budget: this.enemyBulletBudget,
      bands,
    };

    // 按关卡主色给各敌机分配配色：主色给最常见的 scout / sniper，点缀色分给其余
    const tint = (level.def && level.def.fairyTint) || null;
    if (tint && tint.main) {
      const mix = (tint.mix || []).filter(Boolean);
      this.auras = {
        scout: tint.main,
        gunner: mix[0] || tint.main,
        diver: mix[1] || mix[0] || tint.main,
        sniper: tint.main,
        spinner: mix[1] || 'purple',
        bomber: mix[2] || 'yellow',
        turret: mix[2] || mix[0] || 'green',
      };
    } else {
      this.auras = {
        scout: 'blue', gunner: 'red', diver: 'yellow',
        sniper: 'blue', spinner: 'purple', bomber: 'yellow', turret: 'green',
      };
    }

    this._buildWaves();
  }

  _buildWaves() {
    const levelW = this.level.w;
    const usable = levelW - 1280 - 200;
    // 波次间隔 500→400 列 + 每个编队 +1~2 架：杂兵总数约 +50%
    const step = 400;
    let n = 0;
    for (let s = 400; s < usable; s += step) {
      const roll = n % 9;
      if (roll === 0) {
        // V 字：两翼张开，中间留缝
        this.waves.push({ at: s, kind: 'scout', count: 6, gapY: 0, form: 'v' });
      } else if (roll === 1) {
        // 纵列：上下排开，一起扇形齐射
        this.waves.push({ at: s, kind: 'gunner', count: 4, gapY: 120, form: 'column' });
      } else if (roll === 2) {
        // 交叉：两条对角线交错俯冲
        this.waves.push({ at: s, kind: 'diver', count: 7, gapY: 0, form: 'cross' });
      } else if (roll === 3) {
        // 上下夹击的狙击手
        this.waves.push({ at: s, kind: 'sniper', count: 3, gapY: 170, form: 'pincer' });
      } else if (roll === 4) {
        this.waves.push({ at: s, kind: 'spinner', count: 3, gapY: 0, form: 'column' });
      } else if (roll === 5) {
        this.waves.push({ at: s, kind: 'bomber', count: 4, gapY: 60, form: 'line' });
      } else if (roll === 6) {
        // 大妖精压场 + 后续 V 字突进
        this.waves.push({ at: s, kind: 'turret', count: 1, gapY: 30, form: 'line' });
        this.waves.push({ at: s + 200, kind: 'scout', count: 4, gapY: 180, form: 'v' });
      } else if (roll === 7) {
        this.waves.push({ at: s, kind: 'scout', count: 5, gapY: -150, form: 'v' });
        this.waves.push({ at: s + 160, kind: 'gunner', count: 2, gapY: 160, form: 'column' });
      } else {
        this.waves.push({ at: s, kind: 'diver', count: 5, gapY: 60, form: 'cross' });
        this.waves.push({ at: s + 240, kind: 'sniper', count: 1, gapY: 210, form: 'line' });
      }
      n++;
    }
  }

  /** 按编队形状计算第 i 架敌机的相对位置 */
  _spawnWave(w) {
    const n = Math.max(1, w.count | 0);
    const form = w.form || 'line';
    const gapY = w.gapY || 0;
    for (let i = 0; i < n; i++) {
      const off = waveOffsets(form, i, n);
      const x = this.scroll + 1400 + off.dx;
      let y = 200 + gapY + off.dy;
      y = Math.max(90, Math.min(this.level.h - 90, y));
      this.enemies.push(new StgEnemy(w.kind, x, y, this.auras[w.kind]));
    }
  }

  /**
   * EXTRA 的波次表在 stage.js 里生成（那边只认识 scout/gunner/diver），
   * 这里在第一次 update 时做确定性扩编：把一部分波次换成新兵种 + 新编队，
   * 并穿插几组夹击 / 弧线 / 横墙。不改变原有 at 顺序与总量级。
   *
   * 3:00 版道中比原先 6:00 版更短，为了「道中密度不掉、弹幕样式更丰富」，
   * 这里把换兵种比例 28%→40%、插波比例 28%→30%、整体加密 1.32→1.72（单波上限 8 架）：
   * 敌机/秒约 +25%，同时 sniper/spinner/bomber/turret 四种弹幕样式出现得更频繁。
   */
  _enrichExtraWaves() {
    if (this._extraEnriched) return;
    this._extraEnriched = true;
    const def = this.level.def || {};
    if (def.id !== 'extra') return;
    let a = (hashSeed('extra') ^ 0x9e3779b9) >>> 0;
    const rng = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const kinds = ['sniper', 'spinner', 'bomber', 'turret'];
    const forms = ['v', 'column', 'pincer', 'cross', 'arc', 'wall'];
    const usable = this.level.w - 1280 - 200;
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      const r = rng();
      if (r < 0.40) {
        const kind = kinds[Math.floor(rng() * kinds.length)];
        w.kind = kind;
        w.form = forms[Math.floor(rng() * forms.length)];
        if (kind === 'turret') { w.count = 1; w.gapY = 30; w.form = 'line'; }
        else if (kind === 'sniper') w.count = Math.max(1, Math.min(2, w.count - 1));
        else if (kind === 'bomber') w.count = Math.max(2, Math.min(4, w.count));
      } else if (r < 0.70) {
        const at = w.at + 90;
        if (at > usable) continue;
        const kind = kinds[Math.floor(rng() * kinds.length)];
        this.waves.splice(i + 1, 0, {
          at,
          kind,
          count: kind === 'turret' ? 1 : 4,
          gapY: (rng() < 0.5 ? -1 : 1) * (90 + Math.floor(rng() * 90)),
          form: forms[Math.floor(rng() * forms.length)],
        });
        i++;
      }
    }
    // 整体加密：EX 目标敌机/秒比 6:00 版再密一档。均匀放大每波数量、不改变兵种构成，
    // 这样平均血量倍率不被拉高（EX 的杂兵已经比道中重一档）。单波 8 架封顶，
    // 免得 wall / column 编队竖排到画面外。
    for (const w of this.waves) w.count = Math.max(1, Math.min(8, Math.round(w.count * 1.72)));
    this.waves.sort((x, y) => x.at - y.at);
  }

  get bossTriggerScroll() {
    return Math.max(0, this.level.w - 1280 - 120);
  }

  update(dt, player, bullets, shots, fx, opts = {}) {
    this.t += dt;
    if (this.finished) return;

    if (!this.reachedBoss) {
      this.scroll = Math.min(this.bossTriggerScroll, this.scroll + this.speed * dt);
      if (this.scroll >= this.bossTriggerScroll - 0.5) {
        this.reachedBoss = true;
        opts.onReachBoss?.();
      }
    }

    // EXTRA 波次表由 stage.js 生成，第一次 update 时确定性扩编（只跑一次）
    this._enrichExtraWaves();

    // 波次生成
    while (!this.spawnPaused && this.waveIdx < this.waves.length && this.waves[this.waveIdx].at <= this.scroll + 1400) {
      const w = this.waves[this.waveIdx++];
      this._spawnWave(w);
    }

    // 敌人更新
    const px = player.worldX;
    const py = player.worldY;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.update(dt, bullets, px, py, this.enemyMods);
      if (e.x < this.scroll - 200) e.alive = false;

      // 玩家子弹命中（传 e 作为 targetRef，穿透弹对同一敌人只结算一次）
      shots?.hitRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, (dmg, hx, hy) => {
        e.hp -= dmg;
        e.hitFlash = 0.1;
        fx?.sparkle(hx, hy, e.k.color);
        opts.onHit?.(dmg, hx, hy);
        if (e.hp <= 0) {
          e.alive = false;
          fx?.burst(e.x, e.y, e.k.color, 12, 280);
          opts.onKill?.(e);
        }
      }, e);
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    // 冲刺撞击
    if (player.dashing) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.abs(e.x - px) < 44 && Math.abs(e.y - py) < 44) {
          // 冲刺撞击同样走全局自机倍率：攻击力翻倍后杂兵基本一冲带走
          e.hp -= scalePlayerDamage(12);
          if (e.hp <= 0) {
            e.alive = false;
            fx?.burst(e.x, e.y, e.k.color, 14, 300);
          }
        }
      }
    }
  }

  draw(ctx) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.x < this.scroll - 120 || e.x > this.scroll + 1420) continue;
      e.draw(ctx);
    }
  }
}

function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return target;
}

/** 编队形状 → 第 i / n 架敌机的相对偏移（x 向右、y 向下，世界坐标） */
function waveOffsets(form, i, n) {
  const mid = (n - 1) / 2;
  switch (form) {
    case 'v': {
      // V 字：楔尖朝左，两翼向右上下张开
      return { dx: Math.abs(i - mid) * 74, dy: (i - mid) * 78 };
    }
    case 'column': {
      return { dx: (i % 2) * 26, dy: (i - mid) * 74 };
    }
    case 'pincer': {
      // 夹击：上下两排交替
      const row = Math.floor(i / 2);
      return { dx: row * 34 + (i % 2) * 22, dy: (i % 2 ? 1 : -1) * (110 + row * 55) };
    }
    case 'cross': {
      // 交叉：两半各走一条对角线，在中线交错
      const half = Math.max(1, Math.ceil(n / 2));
      const j = i % half;
      const dir = i < half ? 1 : -1;
      return { dx: j * 34, dy: dir * (60 + j * 62) };
    }
    case 'arc': {
      // 弧线：两翼沿抛物线向后收，整队像一张向右张开的弓
      const u = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
      return { dx: u * u * 150 + Math.abs(u) * 30, dy: u * (110 + n * 8) };
    }
    case 'wall': {
      // 横墙：同一列上下排开，整队像一堵墙一起平推
      return { dx: 0, dy: (i - mid) * 88 };
    }
    default:
      return { dx: i * 70, dy: (i % 3) * 110 };
  }
}

function hashSeed(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
