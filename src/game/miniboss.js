/**
 * 小头目（Miniboss）：道中沿途悬浮的强化妖精。
 *
 * 设计目标（docs/ENEMY_VARIETY_SPEC.md §6-D）：
 *  - 平台关 1/2/3/5/6 面的道中不再只有杂鱼：沿途布置 1~3 只小头目，
 *    血量 = 该面 Boss 单张伤害符卡血量的平均值的一半（bossHalfCardHp），
 *    击破奖励 1/32 管 POWER（POWER.pickup = 4）。
 *  - 小头目不锁场、不算 Boss、不走检查点：玩家可以绕过去继续跑图，
 *    打过就多一份资源，打不过就跑，和 Boss 战/存档/结算完全解耦。
 *  - 三种原型（sniper / dancer / bomber）各带两套弹幕循环，进场方案 5 选 1，
 *    同一关每次进入的位置/原型/进场方式固定（关卡 gen.seed 派生的确定性 RNG）。
 *
 * 生命周期：
 *   idle ──(玩家接近)──▶ enter ──(0.8~1.5s 无敌)──▶ fight ⇄ (远离 1600px 2s) ──▶ leave ──▶ retired
 *                                                      │
 *                                                      └─(HP≤0)─▶ dead（爆裂 + 奖励 + 清弹）
 *
 * 所有坐标都是世界坐标（Stage.draw 里 minibosses.draw 处在 camera.apply 之后）。
 */
import { drawGenFairy } from '../art/genfairy.js';
import { getDifficulty } from './difficulty.js';
import { POWER } from './power.js';
import { B_CIRCLE, B_RICE, B_BIG } from './bullets.js';

const T = 32;

/** 小头目包围盒：比大妖精大一圈，但仍是「妖精」的视觉量级。 */
const BODY = { w: 132, h: 128 };

/** 悬停高度：本地地面以上 150px（玩家平射弹道在枪口高度，打不到这么高，需要跳/向上射）。 */
const HOVER_ABOVE_GROUND = 150;

/** 进场期间无敌，且不发射：0.8~1.5s，按原型/进场方案随机。 */
const ENTRY_INVULN_MIN = 0.8;
const ENTRY_INVULN_MAX = 1.5;

/** 玩家离小头目超过这个距离持续 FAR_LEAVE_SEC，就淡出退场（本局不再触发）。 */
const FAR_DIST = 1600;
const FAR_LEAVE_SEC = 2.0;

/** 超过这个距离不更新、不绘制（与 EnemyManager 的剔除口径一致）。 */
const SIM_DIST = 2400;

/** 三原型：颜色 / 标签 / 体型。 */
const ARCH_LOOK = {
  // 蓝：狙
  sniper: { colorKey: 'blue', accent: '#7fc4ff', label: 'SNIPER', size: 96 },
  // 紫：舞
  dancer: { colorKey: 'purple', accent: '#c9a2ff', label: 'DANCER', size: 100 },
  // 红：爆
  bomber: { colorKey: 'red', accent: '#ff9d6e', label: 'BOMBER', size: 94 },
};

const ARCHETYPES = ['sniper', 'dancer', 'bomber'];

/** 进场方案：左右滑入 / 天降 / 闪现（0.4s 预警） / 斜插。 */
const ENTRIES = ['slideR', 'slideL', 'drop', 'blink', 'diagonal'];

/** 进场预警时长（blink 在目标点先画 0.4s 光圈）。 */
const BLINK_WARN = 0.4;

// ───────────────────────────── 小工具 ─────────────────────────────

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function easeOutCubic(x) {
  const p = 1 - x;
  return 1 - p * p * p;
}

/** 角度差归一化到 (-PI, PI]。 */
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 确定性 32 位 RNG（与 enemies.js / levelgen 同款 mulberry32）。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 求某世界 x 下方的「本地地面」顶部（像素 y）。
 * 从屏幕顶往下扫第一块实心砖：小头目就悬在它上方 150px 处。
 * 找不到实心砖时退回关卡 gen.ground 行的地表高度。
 */
function surfaceYAt(level, x) {
  const cx = clamp(Math.floor(x / T), 0, level.cols - 1);
  for (let cy = 1; cy < level.rows - 1; cy++) {
    if (level.isSolidTile(cx, cy)) return cy * T;
  }
  const g = level.gen && Number(level.gen.ground);
  return (Number.isFinite(g) ? g : level.rows - 3) * T;
}

// ───────────────────────────── 管理器 ─────────────────────────────

/**
 * 小头目管理器：布置 + 更新 + 受击 + 绘制。
 *
 * 构造参数（Stage 在平台分支创建时传入）：
 *   level         当前 Level（取 cols / rows / bossArena / midbossArena / gen.seed）
 *   difficulty    'E'|'N'|'H'|'L'|'EX'，用于缩放弹量与弹速
 *   stageNumber   第几面（1 起，仅用于日志/确定性种子）
 *   halfCardHp    单只血量（= bossHalfCardHp(stage.def.boss)；2026-10-27 第六轮起 = 平均符卡血量 ×0.25）
 *   rngSeed       可选：覆盖确定性 RNG 种子（重开一致性验证用）
 */
export class MinibossManager {
  constructor({ level, difficulty, stageNumber, halfCardHp, rngSeed } = {}) {
    this.level = level || null;
    this.stageNumber = Math.max(1, Number(stageNumber) || 1);
    this.halfCardHp = Math.max(1, Math.round(Number(halfCardHp) || 1));
    this.diff = getDifficulty(difficulty || 'N');

    // 弹量与弹速按难度缩放：口径对齐 EnemyManager（150 * enemyBulletScale），
    // 小头目作为「强化妖精」稍微快一点（190 基数）。
    const bs = clamp(Number(this.diff && this.diff.enemyBulletScale) || 1, 0.75, 1.4);
    const cap = Number(this.diff && this.diff.bulletSpeedCap) || 520;
    this.bulletScale = bs;
    this.speedMul = clamp(Math.min(cap, 190 * bs) / 190, 0.7, 1.45);
    this.fireScale = clamp(Number(this.diff && this.diff.enemyFireScale) || 1, 0.5, 1.6);
    this.bulletCap = Math.max(200, (Number(this.diff && this.diff.bulletBudget) || 720) * 0.5);

    /** @type {object[]} 本关所有小头目（含已击破/已退场，用于统计与探针） */
    this.list = [];
    /** @type {object[]} 漂浮字（'+1/32P'）；Stage 没有通用漂浮字系统，自己存。 */
    this.floaters = [];
    /** @type {object[]} 本帧被打死、待结算的列表（保证伤害回调全部走完再爆） */
    this._pendingKills = [];
    this.t = 0;
    this.animTime = 0;

    this._build(level, rngSeed);
  }

  /** 当前还在场（进场中或战斗中）的数量。 */
  get activeCount() {
    let n = 0;
    for (const m of this.list) if (this._isActive(m)) n++;
    return n;
  }

  /** 本局已击破数量（重开一局时管理器重建，自然清零）。 */
  get defeatedCount() {
    let n = 0;
    for (const m of this.list) if (m.defeated) n++;
    return n;
  }

  _isActive(m) {
    return !m.defeated && !m.retired && (m.state === 'enter' || m.state === 'fight' || m.state === 'leave');
  }

  // ───────────────────────── 布置（§6-D2） ─────────────────────────

  /**
   * 数量/位置算法：
   *  1. 只在平台关、且有关底 Boss 的面布置；排除起点 30 列、Boss 场地前 8 列、
   *     以及 S5 妖梦中 Boss 舞台（含进出走廊，避免和妖梦演出打架）。
   *  2. 剩余空闲区总长 L → count = clamp(round(L / (420*32)), 1, 3)。
   *  3. 按区间长度用「最大余数法」分配数量（最长区间至少 1 只）。
   *  4. 区间内按 62% 等分点取 x，并夹到 [60*32, bossArena.left - 12*32]。
   *  5. 原型/进场方式由 gen.seed + 面数派生的确定性 RNG 轮换。
   */
  _build(level, rngSeed) {
    this.list.length = 0;
    if (!level || level.mode === 'stg' || !level.gen) return;
    const cols = level.cols;
    const arenaLeft = level.bossArena ? level.bossArena.left : (cols - 50) * T;
    const lo = 30 * T;
    const hi = arenaLeft - 8 * T;
    if (cols < 40 || hi - lo < 14 * T) return;

    // 需要避开的窗口（世界坐标）：S5 妖梦舞台 + 进出走廊
    const windows = [];
    if (level.midbossArena) {
      windows.push([level.midbossArena.left - 6 * T, level.midbossArena.right + 16 * T]);
    }

    let spans = [[lo, hi]];
    for (const [wa, wb] of windows) {
      const next = [];
      for (const [a, b] of spans) {
        if (wb <= a || wa >= b) { next.push([a, b]); continue; }
        if (wa > a) next.push([a, Math.min(b, wa)]);
        if (wb < b) next.push([Math.max(a, wb), b]);
      }
      spans = next.filter(([a, b]) => b - a > 0);
    }
    const total = spans.reduce((sum, [a, b]) => sum + (b - a), 0);
    if (total < 10 * T) return;

    const count = clamp(Math.round(total / (420 * T)), 1, 3);

    // 最大余数法：按区间长度比例分 count 只
    const shares = spans.map(([a, b], i) => {
      const len = b - a;
      const raw = (len / total) * count;
      const base = Math.floor(raw);
      return { i, len, base, frac: raw - base };
    });
    let left = count - shares.reduce((s, x) => s + x.base, 0);
    const longest = shares.reduce((best, x) => (x.len > best.len ? x : best), shares[0]);
    if (left > 0 && longest.base === 0) { longest.base = 1; left--; }
    while (left > 0) {
      let pick = null;
      for (const s of shares) if (!pick || s.frac > pick.frac) pick = s;
      if (!pick) break;
      pick.base++;
      pick.frac = -1; // 每轮只加一次，避免同一区间吃掉全部余数
      left--;
    }

    const seedBase = Number.isFinite(Number(rngSeed))
      ? Number(rngSeed)
      : ((((Number(level.gen && level.gen.seed) || 1) >>> 0) * 2654435761) ^ ((Number(level.index) || 0) * 101)) >>> 0;
    const rng = mulberry32(seedBase || 0x51ed270b);
    const archOff = Math.floor(rng() * ARCHETYPES.length);
    const entryOff = Math.floor(rng() * ENTRIES.length);

    const maxX = arenaLeft - 12 * T;
    let index = 0;
    for (const s of shares) {
      const k = s.base;
      if (k <= 0) continue;
      const [a, b] = spans[s.i];
      const seg = (b - a) / k;
      for (let j = 0; j < k; j++) {
        let x = a + seg * (j + 0.62);
        x = clamp(x, 60 * T, maxX);
        // 夹取后再守一次妖梦窗口（S5 的硬性要求）
        for (const [wa, wb] of windows) {
          if (x > wa && x < wb) x = Math.min(maxX, wb + T * 2);
        }
        this.list.push(this._makeMini(index, x, rng, archOff, entryOff));
        index++;
      }
    }
    // 按推进方向排序，index 即玩家遇到顺序
    this.list.sort((p, q) => p.planX - q.planX);
    this.list.forEach((m, i) => { m.index = i; });
  }

  _makeMini(index, planX, rng, archOff, entryOff) {
    const archetype = ARCHETYPES[(index + archOff) % ARCHETYPES.length];
    const entry = ENTRIES[(index + entryOff) % ENTRIES.length];
    const look = ARCH_LOOK[archetype] || ARCH_LOOK.sniper;
    const groundY = surfaceYAt(this.level, planX);
    const baseY = clamp(groundY - HOVER_ABOVE_GROUND, 150, Math.max(150, this.level.h - 150));
    const entryDur = ENTRY_INVULN_MIN + rng() * (ENTRY_INVULN_MAX - ENTRY_INVULN_MIN);
    return {
      index,
      archetype,
      entry,
      look,
      planX,
      baseY,
      // 运行期坐标
      x: planX,
      y: baseY,
      fromX: planX,
      fromY: baseY,
      w: BODY.w,
      h: BODY.h,
      // 战斗数据
      hp: this.halfCardHp,
      maxHp: this.halfCardHp,
      state: 'idle',
      stateT: 0,
      entryDur,
      entryWarn: entry === 'blink' ? BLINK_WARN : 0,
      alpha: 1,
      facing: -1,
      animT: rng() * 6.28,
      phase: rng() * 6.28,
      driftPhase: rng() * 6.28,
      driftAmp: 120,
      hitFlash: 0,
      invuln: 0,
      farT: 0,
      leaveT: 0,
      deadT: 0,
      defeated: false,
      retired: false,
      dying: false,
      tSpawn: null,
      tDeath: null,
      // 弹幕循环状态
      fireT: 0,
      pattern: 0,
      patternT: 0,
      spinA: rng() * 6.28,
      volley: 0,
      burstLeft: 0,
      burstT: 0,
      side: rng() < 0.5 ? -1 : 1,
    };
  }

  // ───────────────────────────── 更新 ─────────────────────────────

  /**
   * @param {number} dt
   * @param {object} stage 当前 Stage（要 stage.player / stage.bullets / stage.fx / stage._addPower / stage.onEvent）
   */
  update(dt, stage) {
    if (!this.list.length && !this.floaters.length && !this._pendingKills.length) return;
    if (!(dt > 0)) return;
    // 注意：这里不要缓存 stage 引用。manager 挂在 stage.minibosses 上，
    // 反向引用会形成环，CDP 每帧快照（returnByValue）会因对象链过深而失败。
    this.t += dt;
    this.animTime += dt;

    const p = stage && stage.player;

    // 漂浮字上浮淡出
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 32 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }

    // 上一帧的致命伤在这里统一结算（爆裂/奖励/清弹）
    this.flushPendingKills(stage);

    if (!p) return;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;

    for (const m of this.list) {
      // 已击破：只跑死亡余韵计时
      if (m.defeated) {
        if (m.deadT < 0.6) m.deadT += dt;
        continue;
      }
      if (m.retired) continue;

      // 触发：玩家距计划位置约 700px 时开始进场，进场的后半段正好落在屏内。
      // （进场动画 0.8~1.5s，玩家在这段时间内继续接近，动画放完时已快走到面前。）
      if (m.state === 'idle') {
        if (px < m.planX - 700) continue;
        this._startEntry(m);
      }

      // 距离过远：冻结（不漂移/不发射/不碰撞），避免玩家回头时弹幕凭空出现
      const far = Math.abs(px - m.x) > SIM_DIST;

      if (m.state === 'enter') {
        m.stateT += dt;
        const k = clamp(m.stateT / m.entryDur, 0, 1);
        const e = easeOutCubic(k);
        m.x = m.fromX + (m.planX - m.fromX) * e;
        m.y = m.fromY + (m.baseY - m.fromY) * e;
        m.invuln = 0.2;
        m.hitFlash = Math.max(0, m.hitFlash - dt);
        // blink 前 0.4s 完全隐形（只画预警圈），之后淡入
        m.alpha = m.entry === 'blink'
          ? clamp((k * m.entryDur - BLINK_WARN) / Math.max(0.15, m.entryDur - BLINK_WARN), 0, 1)
          : clamp(k * 3, 0, 1);
        m.facing = px < m.x ? -1 : 1;
        if (k >= 1) {
          m.state = 'fight';
          m.stateT = 0;
          m.x = m.planX;
          m.y = m.baseY;
          m.alpha = 1;
          m.invuln = 0;
          m.fireT = 0.9; // 进场后先给玩家半秒喘息
        }
        continue;
      }

      m.stateT += dt;
      m.hitFlash = Math.max(0, m.hitFlash - dt);
      m.invuln = Math.max(0, m.invuln - dt);

      // 玩家远离 1600px 持续 2s → 淡出退场，本局不再触发
      if (Math.abs(px - m.x) > FAR_DIST) m.farT += dt;
      else m.farT = 0;
      if (m.state === 'fight' && m.farT > FAR_LEAVE_SEC) {
        m.state = 'leave';
        m.leaveT = 0.45;
      }
      if (m.state === 'leave') {
        m.leaveT -= dt;
        m.alpha = clamp(m.leaveT / 0.45, 0, 1);
        m.y -= 60 * dt;
        if (m.leaveT <= 0) {
          // 退场：回到待机（满血），本局不再触发
          m.state = 'idle';
          m.retired = true;
          m.alpha = 1;
          m.x = m.planX;
          m.y = m.baseY;
          m.hp = m.maxHp;
          m.farT = 0;
        }
        continue;
      }

      if (far) continue;

      // 悬停：x 为计划位置左右 ±120 漂移，y 为本地地面 -150 上下 ±10
      const amp = m.archetype === 'dancer' ? 140 : m.driftAmp;
      const freq = m.archetype === 'dancer' ? 0.85 : 0.6;
      const minX = T * 2;
      const arenaLeft = this.level && this.level.bossArena ? this.level.bossArena.left : Infinity;
      const maxX = Math.min(this.level ? this.level.w : Infinity, arenaLeft - 100);
      m.x = clamp(m.planX + Math.sin(m.stateT * freq + m.driftPhase) * amp, minX, maxX);
      m.y = m.baseY + Math.sin(m.stateT * 1.25 + m.phase) * 10;
      m.facing = px < m.x ? -1 : 1;

      // 接触伤害（只在自己没死、玩家无敌帧结束时由 Player.hurt 内部挡掉）
      if (p.alive && this._touches(m, p)) p.hurt(1, m.x);

      // 弹幕循环（进场无敌期已过）
      this._updateFire(m, stage, px, py, dt);
    }
  }

  _startEntry(m) {
    m.state = 'enter';
    m.stateT = 0;
    m.tSpawn = Math.round(this.t * 100) / 100;
    m.alpha = 0;
    m.farT = 0;
    const by = m.baseY;
    switch (m.entry) {
      case 'slideR':
        m.fromX = m.planX + 680;
        m.fromY = by + 10;
        break;
      case 'slideL':
        m.fromX = m.planX - 680;
        m.fromY = by + 10;
        break;
      case 'drop':
        m.fromX = m.planX;
        m.fromY = Math.max(110, by - 520);
        break;
      case 'blink':
        m.fromX = m.planX;
        m.fromY = by;
        break;
      case 'diagonal':
      default:
        m.fromX = m.planX + 520;
        m.fromY = Math.max(110, by - 400);
        break;
    }
    m.x = m.fromX;
    m.y = m.fromY;
    // 进场时长也用来做无敌窗口（0.8~1.5s）
    if (!(m.entryDur >= ENTRY_INVULN_MIN)) m.entryDur = ENTRY_INVULN_MIN;
  }

  /** 小头目与玩家的 AABB 重叠（用近似 Boss 矩形，比视觉小一圈，手感更宽容）。 */
  _touches(m, p) {
    const hw = m.w * 0.42;
    const hh = m.h * 0.72;
    return (
      p.x < m.x + hw && p.x + p.w > m.x - hw &&
      p.y < m.y && p.y + p.h > m.y - hh
    );
  }

  // ───────────────────────── 弹幕循环（每原型 2 套） ─────────────────────────

  _mayFire(stage) {
    const bl = stage && stage.bullets;
    if (!bl || typeof bl.spawn !== 'function') return false;
    return typeof bl.count !== 'function' || bl.count() < this.bulletCap;
  }

  _updateFire(m, stage, px, py, dt) {
    if (!this._mayFire(stage)) return;
    const bl = stage.bullets;
    const sp = this.speedMul;
    m.fireT -= dt;
    m.patternT += dt;

    if (m.archetype === 'sniper') {
      // 循环 A：瞄准 5 连扇（带提前量）；循环 B：3 连快速点射
      if (m.patternT > 6.2) {
        m.patternT = 0;
        m.pattern ^= 1;
        m.burstLeft = 0;
        m.fireT = Math.min(m.fireT, 0.7);
      }
      const lowHp = m.hp <= m.maxHp * 0.5;
      if (m.pattern === 0) {
        if (m.fireT > 0) return;
        m.fireT = 1.55 * this.fireScale * (lowHp ? 0.86 : 1);
        const lead = clamp((px - m.x) * 0.055, -70, 70);
        const ang = Math.atan2(py - (m.y - m.h * 0.3), px + lead - m.x);
        const n = Math.max(3, Math.round(5 * this.bulletScale));
        bl.fan(m.x, m.y - m.h * 0.3, n, 0.62, ang, 208 * sp, {
          color: '#7fc4ff', r: 5.5, type: B_CIRCLE, life: 6.2,
        });
        m.volley++;
        // HP 低于 50%：每两轮追加一圈「缺口环」，缺口朝向玩家留出生路
        if (lowHp && m.volley % 2 === 0) {
          this._ringGap(bl, m.x, m.y - m.h * 0.2, 16, 152 * sp, Math.atan2(py - m.y, px - m.x), 0.42, '#9fd8ff', B_RICE);
        }
        return;
      }
      // 点射：0.16s 间隔连打 3 发
      if (m.burstLeft > 0) {
        m.burstT -= dt;
        if (m.burstT > 0) return;
        m.burstT = 0.16;
        m.burstLeft--;
        bl.aimed(m.x, m.y - m.h * 0.3, px, py, 268 * sp, {
          color: '#bfe4ff', r: 4.5, type: B_RICE, life: 5.2, rot: Math.atan2(py - m.y, px - m.x),
        });
        return;
      }
      if (m.fireT > 0) return;
      m.fireT = 2.0 * this.fireScale;
      m.burstLeft = 3;
      m.burstT = 0;
      return;
    }

    if (m.archetype === 'dancer') {
      // 循环 A：3 臂旋转螺旋；循环 B：左右交替双向扇
      if (m.patternT > 6.8) {
        m.patternT = 0;
        m.pattern ^= 1;
        m.fireT = Math.min(m.fireT, 0.5);
      }
      if (m.pattern === 0) {
        if (m.fireT > 0) return;
        m.fireT = 0.17 * this.fireScale;
        m.spinA += 0.27;
        for (let arm = 0; arm < 3; arm++) {
          bl.spiral(m.x, m.y - m.h * 0.3, m.spinA + (arm * Math.PI * 2) / 3, 168 * sp, {
            color: '#c9a2ff', r: 5, type: B_CIRCLE, life: 6.8,
          });
        }
        m.volley++;
        if (m.volley % 10 === 0) {
          // 螺旋中偶尔补一发慢速瞄准弹，逼迫玩家换位
          bl.aimed(m.x, m.y - m.h * 0.3, px, py, 120 * sp, {
            color: '#e4ccff', r: 7, type: B_BIG, life: 6,
          });
        }
        return;
      }
      if (m.fireT > 0) return;
      m.fireT = 0.95 * this.fireScale;
      m.side = -m.side;
      const base = m.side > 0 ? 0.16 : Math.PI - 0.16;
      bl.fan(m.x, m.y - m.h * 0.3, 5, 0.6, base, 196 * sp, {
        color: '#d7b8ff', r: 5.5, type: B_CIRCLE, life: 6.4,
      });
      return;
    }

    // bomber
    // 循环 A：抛射簇（向上抛，重力下坠 + 横向摆动）；循环 B：慢速落雨 + 周期 8 向爆发
    if (m.patternT > 7.2) {
      m.patternT = 0;
      m.pattern ^= 1;
      m.fireT = Math.min(m.fireT, 0.4);
    }
    if (m.pattern === 0) {
      if (m.fireT > 0) return;
      m.fireT = 1.5 * this.fireScale;
      const n = Math.max(3, Math.round(4 * this.bulletScale));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        bl.spawn({
          x: m.x, y: m.y - m.h * 0.3,
          vx: t * 190 * sp + (px - m.x) * 0.06,
          // 真抛物线：初速向上 + 竖直重力，顶点约在头顶 55px，0.9s 后落回原高度再往下压。
          // （旧写法给的是 accel——那是「沿速度方向」加速，弹会一路上冲、加速飞出屏幕上方。）
          vy: (-238 - Math.abs(t) * 40) * sp,
          gravity: 520 * sp * sp,
          wobbleAmp: 13,
          wobbleFreq: 4.6,
          color: '#ff9d6e', r: 7.5, type: B_BIG, life: 5.6,
        });
      }
      m.volley++;
      return;
    }
    if (m.fireT > 0) return;
    m.fireT = 0.42 * this.fireScale;
    m.volley++;
    // 慢速延迟落雨：从身体两侧落下、带摆动
    bl.spawn({
      x: m.x + (m.volley % 2 ? 46 : -46), y: m.y - m.h * 0.15,
      vx: (m.volley % 2 ? 26 : -26) * sp, vy: 96 * sp,
      accel: 165, wobbleAmp: 26, wobbleFreq: 2.1,
      color: '#ffb98f', r: 6, type: B_CIRCLE, life: 6.5,
    });
    if (m.volley % 8 === 0) {
      this._ringGap(bl, m.x, m.y - m.h * 0.3, 10, 158 * sp, Math.atan2(py - m.y, px - m.x), 0.34, '#ffd0a8', B_CIRCLE);
    }
  }

  /** 带缺口的环形弹幕：缺口朝向 keepAway 反方向（给玩家留一条生路）。 */
  _ringGap(bl, x, y, n, speed, dangerA, gapHalf, color, type) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.animTime * 0.6;
      if (Math.abs(angleDiff(a, dangerA)) < gapHalf) continue;
      bl.spawn({
        x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        color, r: 5.5, type, life: 6.5,
      });
    }
  }

  // ───────────────────────────── 受击 ─────────────────────────────

  /**
   * 玩家子弹结算：用近似 Boss 矩形（w*0.46 / h*0.78）判定，命中闪白 + 火花。
   * @param {object} shots PlayerShots
   * @param {object} fx
   * @param {(dmg:number,hx:number,hy:number,m:object)=>void} [onHit]
   */
  damageWithShots(shots, fx, onHit) {
    if (!shots || typeof shots.hitRect !== 'function') return;
    for (const m of this.list) {
      if (m.defeated || m.retired || m.dying) continue;
      if (m.state !== 'enter' && m.state !== 'fight') continue;
      if (m.invuln > 0) continue;
      const hw = m.w * 0.46;
      const hh = m.h * 0.78;
      const hit = shots.hitRect(m.x - hw, m.y - hh, hw * 2, hh, (dmg, hx, hy) => {
        m.hp -= dmg;
        m.hitFlash = 0.12;
        if (fx && fx.sparkle) fx.sparkle(hx, hy, '#ffffff');
        if (onHit) onHit(dmg, hx, hy, m);
      }, m);
      if (!hit) continue;
      if (m.hp <= 0) {
        m.hp = 0;
        m.dying = true;
        this._pendingKills.push(m);
      } else if (fx && fx.burst && Math.random() < 0.3) {
        fx.burst(m.x, m.y - m.h * 0.4, m.look.accent, 3, 130);
      }
    }
  }

  /** 击破结算：爆裂 + 冲击波 + 震屏 + 1/32P + 事件 + 清弹。 */
  _kill(m, stage) {
    m.dying = false;
    m.defeated = true;
    m.state = 'dead';
    m.deadT = 0;
    m.alpha = 1;
    m.tDeath = Math.round(this.t * 100) / 100;
    const fx = stage && stage.fx;
    const cx = m.x;
    const cy = m.y - m.h * 0.4;
    if (fx) {
      if (fx.burst) {
        fx.burst(cx, cy, '#ffe9a0', 26, 460);
        fx.burst(cx, cy, m.look.accent, 20, 320);
      }
      if (fx.shockwave) fx.shockwave(cx, cy, m.look.accent, 26, 900, 0.55);
      if (fx.flash) fx.flash(cx, cy, m.look.accent, 30);
    }
    if (stage && stage.camera && stage.camera.shake) stage.camera.shake(14, 0.45);
    // +1/32P：POWER.pickup = 4 → 4/128 = 1/32
    if (stage && typeof stage._addPower === 'function') stage._addPower(POWER.pickup);
    this.floaters.push({
      x: cx, y: cy - 44, text: '+1/32P',
      life: 1.1, maxLife: 1.1, color: '#ffe9a0',
    });
    if (stage && typeof stage.onEvent === 'function') {
      stage.onEvent('minibossClear', { key: (stage.def && stage.def.boss) || null, index: m.index });
    }
    // 小头目爆裂清场：给玩家一个喘息窗口（与 midboss 击破同款处理）
    if (stage && stage.bullets && typeof stage.bullets.clear === 'function') stage.bullets.clear();
  }

  /**
   * 结算上一帧的致命伤。
   *
   * 正常路径是 update 开头结算；但玩家死亡倒计时（0.9s）里 Stage 不再调 update，
   * 而在途子弹仍然会补掉小头目（stage.damageWithShots 没有 state 门），
   * 于是这一击会留在 _pendingKills 里直到复活——复活会把在场者满血重置，
   * 等于玩家白白丢了一个 +1/32P 和一次击杀。所以复活前必须先补结算一次。
   */
  flushPendingKills(stage) {
    if (!this._pendingKills.length) return;
    const kills = this._pendingKills;
    this._pendingKills = [];
    for (const m of kills) this._kill(m, stage);
  }

  /** 玩家复活：未击破的在场者退回待机+满血；已击破的保持不变。 */
  onPlayerRespawn() {
    for (const m of this.list) {
      if (m.defeated) continue;
      m.state = 'idle';
      m.stateT = 0;
      m.retired = false;
      m.x = m.planX;
      m.y = m.baseY;
      m.alpha = 1;
      m.hp = m.maxHp;
      m.hitFlash = 0;
      m.invuln = 0;
      m.farT = 0;
      m.leaveT = 0;
      m.dying = false;
      m.fireT = 0;
      m.pattern = 0;
      m.patternT = 0;
      m.volley = 0;
      m.burstLeft = 0;
    }
    this._pendingKills.length = 0;
    this.floaters.length = 0;
  }

  /** 进入 Boss 战：所有未击破的在場小头目撤回待机（不锁场、不参与 Boss 流程）。 */
  clearActive() {
    for (const m of this.list) {
      if (m.defeated) continue;
      m.state = 'idle';
      m.stateT = 0;
      m.retired = false;
      m.x = m.planX;
      m.y = m.baseY;
      m.alpha = 1;
      m.hp = m.maxHp;
      m.hitFlash = 0;
      m.invuln = 0;
      m.farT = 0;
      m.leaveT = 0;
      m.dying = false;
      m.fireT = 0;
      m.burstLeft = 0;
    }
    this._pendingKills.length = 0;
    this.floaters.length = 0;
  }

  /** 供探针/调试读取的结构化快照。 */
  snapshot() {
    return this.list.map((m) => ({
      index: m.index,
      x: Math.round(m.x),
      planX: Math.round(m.planX),
      y: Math.round(m.y),
      baseY: Math.round(m.baseY),
      hp: m.hp,
      maxHp: m.maxHp,
      halfCardHp: this.halfCardHp,
      entry: m.entry,
      archetype: m.archetype,
      state: m.state,
      defeated: m.defeated,
      retired: m.retired,
      tSpawn: m.tSpawn,
      tDeath: m.tDeath,
    }));
  }

  // ───────────────────────────── 绘制 ─────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx 已 apply 相机（世界坐标）
   * @param {{x:number,y:number}} cam camera.viewAt(alpha)
   */
  draw(ctx, cam) {
    if (!ctx) return;
    const cx = cam ? cam.x : 0;
    const cy = cam ? cam.y : 0;
    const VIEW_W = 1280;
    const VIEW_H = 720;

    for (const m of this.list) {
      if (m.defeated) {
        if (m.deadT < 0.6) this._drawDead(ctx, m, cx, cy);
        continue;
      }
      if (m.state === 'idle' || m.retired || m.state === 'leave') continue;
      const sx = m.x - cx;
      const sy = m.y - cy;
      if (sx < -180 || sx > VIEW_W + 180 || sy < -200 || sy > VIEW_H + 200) continue;
      // blink 预警：入场前 0.4s 只在目标点画收缩光圈
      if (m.state === 'enter' && m.entry === 'blink') {
        const left = m.entryDur - m.stateT;
        if (left > 0 && left <= BLINK_WARN + 0.001) {
          this._drawWarn(ctx, m, 1 - left / BLINK_WARN);
          continue;
        }
      }
      if (m.state === 'enter') this._drawEntryTrail(ctx, m);
      this._drawBody(ctx, m);
      this._drawHpBar(ctx, m);
    }
    this._drawFloaters(ctx, cx, cy);
  }

  /** 进场拖尾：残影 + 沿轨迹的速度线，静止画面也能看出滑入/落下方向。 */
  _drawEntryTrail(ctx, m) {
    const dx = m.fromX - m.planX;
    const dy = m.fromY - m.baseY;
    const len = Math.hypot(dx, dy);
    if (!(len > 80)) return;
    const a = clamp(m.alpha === undefined ? 1 : m.alpha, 0, 1);
    if (a <= 0.02) return;
    const k = clamp(m.stateT / m.entryDur, 0, 1);
    const fade = a * (1 - k * 0.5);          // 越接近落位拖尾越淡
    const cy = m.y - m.h * 0.38;             // 与本体同心
    const look = m.look;

    // 残影：沿进场轨迹回退两档，轮廓本身就能读出方向
    for (let i = 2; i >= 1; i--) {
      const ga = fade * (0.24 / i);
      if (ga <= 0.01) continue;
      ctx.save();
      ctx.translate(m.x + dx * 0.18 * i, cy + dy * 0.18 * i);
      drawGenFairy(ctx, {
        colorKey: look.colorKey,
        t: this.animTime + m.animT - i * 0.12,
        alpha: ga,
        facing: m.facing,
        dead: 0,
        flash: 0,
        size: look.size,
      });
      ctx.restore();
    }

    // 速度线：沿进场方向 3 道短渐隐光条
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const back = Math.min(240, len * 0.42);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // 进场地帧里会画 1s 左右：先转到「进场方向 = +x」的局部坐标，
    // 于是三条光条只是同一个渐变沿 +y 平移（渐变长度也只由 back 决定），
    // 每帧新建 3 个 LinearGradient 的开销省掉，像素结果不变。
    ctx.translate(m.x, cy);
    ctx.rotate(Math.atan2(uy, ux));
    let g = m._trailGrad;
    if (!g || g.ctx !== ctx || g.back !== back || g.accent !== look.accent) {
      const ng = ctx.createLinearGradient(30, 0, 30 + back, 0);
      ng.addColorStop(0, look.accent);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      g = m._trailGrad = { ctx, back, accent: look.accent, g: ng };
    }
    ctx.strokeStyle = g.g;
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 26;
      ctx.globalAlpha = fade * (0.5 - Math.abs(i - 1) * 0.18);
      ctx.lineWidth = 3.2 - Math.abs(i - 1) * 1.2;
      ctx.beginPath();
      ctx.moveTo(30, off);
      ctx.lineTo(30 + back, off);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** blink 落地预警：两圈收缩光环 + 竖直光柱。 */
  _drawWarn(ctx, m, k) {
    const t = clamp(k, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = m.look.accent;
    ctx.globalAlpha = 0.25 + t * 0.55;
    ctx.lineWidth = 2 + t * 2;
    ctx.beginPath();
    ctx.arc(m.planX, m.baseY - m.h * 0.38, 70 - t * 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.12 + t * 0.3;
    ctx.beginPath();
    ctx.arc(m.planX, m.baseY - m.h * 0.38, 34 - t * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawBody(ctx, m) {
    const a = clamp(m.alpha === undefined ? 1 : m.alpha, 0, 1);
    if (a <= 0.01) return;
    const look = m.look;
    const t = this.animTime + m.animT;
    const bodyCy = m.y - m.h * 0.38;

    ctx.save();
    ctx.translate(m.x, bodyCy);
    ctx.globalAlpha = a;

    // 原型光环：旋转的菱形轨道（和普通妖精一眼区分开）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.rotate(t * 0.8);
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = a * 0.42;
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 24, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * 58, Math.sin(ang) * 24, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 头顶原型徽记（尖冠 / 舞环 / 引信火花）：第十一轮用户要求去掉（「小BOSS上面不要出现图标」），
    // 原型信息改为只看 HP 条右侧的英文标签，本体视觉只保留下面这圈旋转菱形光环。

    // 本体：放大版妖精（drawGenFairy 的原点就是包围盒中心）
    ctx.save();
    ctx.globalAlpha = a;
    drawGenFairy(ctx, {
      colorKey: look.colorKey,
      t,
      alpha: a,
      facing: m.facing,
      dead: 0,
      flash: clamp(m.hitFlash / 0.12, 0, 1),
      size: look.size,
    });
    ctx.restore();

    ctx.restore();
  }

  /** 世界坐标 HP 条：MINI BOSS 小字 + 原型英文标签 + 120px 细条。 */
  _drawHpBar(ctx, m) {
    const w = 120;
    const h = 5;
    const x = m.x - w / 2;
    const y = m.y - m.h * 0.78 - 30;
    const ratio = clamp(m.hp / m.maxHp, 0, 1);

    ctx.save();
    ctx.globalAlpha = 0.9;
    // 底槽
    ctx.fillStyle = 'rgba(6, 9, 20, 0.62)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    // 满血条
    ctx.fillStyle = m.look.accent;
    ctx.fillRect(x, y, w * ratio, h);
    // 高光：血条顶部一条白线，读起来更利落
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w * ratio, 1);
    ctx.globalAlpha = 0.9;
    // 文案
    ctx.font = 'bold 9px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(226, 238, 255, 0.82)';
    ctx.fillText('MINI BOSS', x, y - 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = m.look.accent;
    ctx.fillText(m.look.label, x + w, y - 6);
    ctx.restore();
  }

  _drawDead(ctx, m, camX, camY) {
    const k = clamp(m.deadT / 0.6, 0, 1);
    const sx = m.x - camX;
    const sy = m.y - camY;
    if (sx < -180 || sx > 1280 + 180 || sy < -220 || sy > 720 + 220) return;
    ctx.save();
    ctx.translate(m.x, m.y - m.h * 0.38);
    ctx.globalAlpha = 1 - k;
    drawGenFairy(ctx, {
      colorKey: m.look.colorKey,
      t: this.animTime + m.animT + 1.4,
      alpha: 1 - k,
      facing: m.facing,
      dead: 1,
      flash: 0,
      size: m.look.size,
    });
    ctx.restore();
  }

  _drawFloaters(ctx, camX, camY) {
    if (!this.floaters.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 所有漂浮字同字号：字体在循环外设一次，别每个字都重设（每帧 3 次 → 1 次）
    ctx.font = 'bold 14px "Microsoft YaHei", "PingFang SC", sans-serif';
    for (const f of this.floaters) {
      const sx = f.x - camX;
      const sy = f.y - camY;
      if (sx < -120 || sx > 1400 || sy < -120 || sy > 840) continue;
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8, 10, 18, 0.65)';
      ctx.fillText(f.text, sx + 1, sy + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.restore();
  }
}
