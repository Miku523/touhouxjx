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
import { drawCharacter } from '../art/chars.js';
import { drawGenChar } from '../art/genchars.js';
import { drawGenFairy } from '../art/genfairy.js';
import { drawHitbox } from '../art/hitbox.js';
import { POWER, powerLevel, canSpell, spendPower } from './power.js';
import { scaleEnemyHp } from './balance.js';
import { isInvincible } from './cheat.js';

const SPEED = 340;
const ACCEL = 3200;
const FRICTION = 2600;
const DASH_SPEED = 900;
const DASH_TIME = 0.16;
// 玩家判定半径（东方风：判定点比视觉小得多；魔理沙比灵梦小一点）
const HIT_R = { reimu: 4.2, marisa: 3.6 };

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
    return { x: this.worldX, y: this.worldY + 6, r: this.hitRadius };
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

    const ax = input.axisX;
    const ay = input.down('down') ? 1 : 0;
    const up = input.down('up') ? 1 : 0;
    // 屏幕坐标 y 向下为正：按住「下」应该往下走，所以是 ay - up。
    // （原来写成 up - ay，导致弹幕关上下完全反了：按 ↑ 一路沉底，按 ↓ 顶到天花板。）
    const ayAll = ay - up;

    // 按住 Shift 低速移动：移速降到 50%，并显示判定点
    this.focus = !!input.down('fast');
    const spd = this.focus ? SPEED * 0.5 : SPEED;

    if (ax !== 0) this.facing = ax;

    // 冲刺
    if (input.pressed('dash') && this.dashCd <= 0 && !this.dashing && !this.casting) {
      this.dashing = true;
      this.dashT = DASH_TIME;
      this.dashCd = 0.6;
      this.dashDirX = ax !== 0 ? ax : this.facing;
      this.dashDirY = ayAll;
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
    // 秘籍「无敌模式」：完全免疫伤害
    if (isInvincible()) return;
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
    ctx.translate(0, 38);
    const drewAI = drawGenChar(ctx, {
      ...charOpts,
      state: (this.state === 'idle' || this.state === 'cast') ? 'fly' : this.state,
      rot: Math.max(-0.1, Math.min(0.1, this.vx * 0.00035)),
    });
    ctx.restore();
    if (!drewAI) drawCharacter(ctx, { ...charOpts, scale: 0.9 });

    ctx.restore();

    // 判定点：只在按住 Shift 低速移动时显示。
    // 画在角色之后（不被立绘盖住），位置严格取 hitPoint，不跟随上下浮动。
    if (this.focus && this.alive) {
      drawHitbox(ctx, this.sx, this.sy + 6, this.hitRadius, this.animTime,
        this.char === 'marisa' ? '#ffd23f' : '#ff5ea8');
    }
  }
}


/* ============================================================
   飞行关的敌机与关卡导演
   ============================================================ */

const ENEMY_KINDS = {
  scout: { hp: 4, w: 26, h: 30, color: '#8fd8ff', aura: 'blue', speed: 150, rate: 1.5, aim: true },
  gunner: { hp: 8, w: 34, h: 38, color: '#ff9ad0', aura: 'red', speed: 90, rate: 1.0, aim: false },
  diver: { hp: 3, w: 24, h: 28, color: '#ffd27a', aura: 'yellow', speed: 240, rate: 2.4, aim: true },
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
  }

  update(dt, bullets, px, py, mods = null) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.x += this.vx * dt;
    this.y = this.baseY + Math.sin(this.t * 2.2 + this.phase) * 22;

    const speedMul = mods ? mods.speed : 1;
    const fireMul = mods ? mods.fire : 1;
    const cap = mods ? mods.cap : 520;
    const shotSpeed = (base) => Math.min(cap, base * speedMul);

    if (this.k.aim) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.k.rate * fireMul;
        const n = mods ? mods.scout : 1;
        const sp = shotSpeed(230);
        const a = Math.atan2(py - this.y, px - this.x);
        if (n > 1) {
          // 高难度：单发瞄准变成一小束瞄准扇，方向仍然指向玩家，缝还在
          bullets.fan(this.x, this.y, n, 0.18, a, sp, {
            color: this.k.color, r: 6, life: 5,
          });
        } else {
          bullets.spawn({
            x: this.x, y: this.y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            color: this.k.color, r: 6, life: 5,
          });
        }
      }
    } else {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.k.rate * fireMul;
        const n = mods ? mods.gunner : 3;
        bullets.fan(this.x, this.y, n, 0.4, Math.PI * 0.86, shotSpeed(190), {
          color: this.k.color, r: 6, life: 5,
        });
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
      size: Math.max(k.w, k.h) * 1.25,
    });
    if (drewAi) {
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

    // 分面密度：2–6 面道中更稀（齐射发数变少、开火间隔变长）；Extra 传 0 → 1.00
    const dens = Math.min(1.5, Math.max(0.4, Number(stageDensity) || 1));

    // 道中敌机的难度倍率：弹速 / 开火间隔 / 每次齐射发数
    this.enemyBulletScale = Number(diff?.enemyBulletScale) || 1;
    this.enemyFireScale = (Number(diff?.enemyFireScale) || 1) / dens;
    this.enemySpeedCap = Number(diff?.bulletSpeedCap) || 520;
    this.enemyMods = {
      speed: this.enemyBulletScale,
      fire: this.enemyFireScale,
      cap: this.enemySpeedCap,
      scout: Math.max(1, Math.round((Number(diff?.stgScoutShots) || 1) * dens)),
      gunner: Math.max(1, Math.round((Number(diff?.stgGunnerShots) || 3) * dens)),
    };

    // 按关卡主色给三类敌机分配配色：主色给最常见的 scout，点缀色分给另外两类
    const tint = (level.def && level.def.fairyTint) || null;
    if (tint && tint.main) {
      const mix = (tint.mix || []).filter(Boolean);
      this.auras = {
        scout: tint.main,
        gunner: mix[0] || tint.main,
        diver: mix[1] || mix[0] || tint.main,
      };
    } else {
      this.auras = { scout: 'blue', gunner: 'red', diver: 'yellow' };
    }

    this._buildWaves();
  }

  _buildWaves() {
    const levelW = this.level.w;
    const usable = levelW - 1280 - 200;
    const step = 520;
    let n = 0;
    for (let s = 400; s < usable; s += step) {
      const roll = n % 5;
      if (roll === 0) {
        this.waves.push({ at: s, kind: 'scout', count: 4, gapY: 0 });
      } else if (roll === 1) {
        this.waves.push({ at: s, kind: 'gunner', count: 2, gapY: 130 });
      } else if (roll === 2) {
        this.waves.push({ at: s, kind: 'diver', count: 6, gapY: 0 });
      } else if (roll === 3) {
        this.waves.push({ at: s, kind: 'scout', count: 3, gapY: 180 });
        this.waves.push({ at: s + 180, kind: 'diver', count: 3, gapY: -160 });
      } else {
        this.waves.push({ at: s, kind: 'gunner', count: 3, gapY: 0 });
      }
      n++;
    }
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

    // 波次生成
    while (this.waveIdx < this.waves.length && this.waves[this.waveIdx].at <= this.scroll + 1400) {
      const w = this.waves[this.waveIdx++];
      for (let i = 0; i < w.count; i++) {
        const x = this.scroll + 1400 + i * 70;
        const y = 200 + w.gapY + (i % 3) * 110;
        this.enemies.push(new StgEnemy(w.kind, x, y, this.auras[w.kind]));
      }
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
          e.hp -= 6;
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
