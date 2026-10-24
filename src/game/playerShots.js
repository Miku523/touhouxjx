/**
 * 玩家的射击弹（御札 / 魔弹）。
 *
 * 两名自机的每一轮开火都是「固定直射主弹 + 特殊副弹」的混合弹幕：
 *   主弹：沿 aim / fan 笔直飞出，负责稳定命中；
 *   副弹：每两轮开火追加一发——
 *     灵梦 = 白纸御札 + 追踪：自动咬住最近的敌人，以有限转向速率掰弯弹道；
 *     魔理沙 = 星形魔弹 + 穿透：命中不消失，继续穿透后续目标（同一目标只吃一次）。
 *
 * 射程：主弹 life 1.65–1.7s、副弹 2.2–2.4s，从自机位置能打到 1280 宽画面的
 * 另一头，不再飞半屏就消失。
 *
 * 数量很少（同屏十几发），视觉仍然预渲染成离屏精灵；运行时只做
 * drawImage + 旋转/翻转，尾迹复用同一张精灵，不新建渐变。
 *
 * 视觉尺寸 ≈ 2r（与 hitRect 的 ±r 判定盒一致），保证「打中了」看起来合理。
 */

import { scalePlayerDamage } from './balance.js';

const MAX_SHOTS = 160;
const SS = 2; // 超采样倍率

/**
 * 两名自机的弹道参数表。
 *
 * damage 是「单发基准伤害」，最终仍乘 balance.js 的全局攻击倍率；
 * 魔理沙主弹的 8 = 普通弹 4 的两倍（保留原来的特长）。
 * special 是每两轮开火追加的一发特殊副弹：灵梦追踪、魔理沙穿透。
 */
const SHOT_PROFILE = {
  reimu: {
    damage: 4,
    speed: 980,
    life: 1.7,          // 射程 ≈ 1666px：能横穿整个 1280 画面
    r: 7,
    homing: false,      // 主弹固定直射
    homingTurn: 0,
    homingRange: 0,
    pierce: false,
    fanFlat: 0.14,      // 平射总张角（≈8°，比旧版更散；Shift 低速时收束到 ≈1.2°）
    fanAim: 0.65,       // 抬头 / 低头射击时的总张角（覆盖不同高度）
    special: {
      // 2026-10-20 反馈 #6：降低子机（特殊副弹）伤害 2.4 → 1.55（−35%）
      damage: 1.55,
      speed: 760,
      life: 2.4,
      r: 6.5,
      homing: true,     // 副弹自动追踪
      homingTurn: 7.4,
      homingRange: 1100,
      pierce: false,
      every: 2,         // 每 2 轮开火补一发
      scale: 1.18,
    },
  },
  marisa: {
    damage: 8,          // 主弹单发 8 = 普通弹 4 的两倍
    speed: 1040,
    life: 1.65,
    r: 9,
    homing: false,      // 主弹固定直射
    homingTurn: 0,
    homingRange: 0,
    pierce: false,
    fanFlat: 0.32,      // 扩散：平射也有明显扇形（≈18° 总张角），Shift 低速时同样收束
    fanAim: 0.7,        // 仰射散得更开，像一蓬流星雨
    special: {
      // 2026-10-20 反馈 #6：降低子机（特殊副弹）伤害 3.2 → 2.05（−36%）
      damage: 2.05,
      speed: 900,
      life: 2.2,
      r: 8,
      homing: false,
      homingTurn: 0,
      homingRange: 0,
      pierce: true,     // 副弹命中后继续穿透
      every: 2,
      scale: 1.26,
    },
  },
};

/**
 * 按住 Shift 低速（显示判定点）时的收束系数（2026-10-24 手感调整）：
 * 常态为「扩散感」把扇形调宽；低速时反而把弹道收成一束——
 * 扇形的张角乘 FOCUS_FAN_MUL，出生点的纵向错位乘 FOCUS_OFFSET_MUL，
 * 火力集中在判定点正前方，用机动性换精准度。
 */
const FOCUS_FAN_MUL = 0.14;   // 2026-10-24：初版 0.12 → 0.14（0.16 过宽，回退一档），比初版略放宽
const FOCUS_OFFSET_MUL = 0.25;

const PI2 = Math.PI * 2;

/* ---------------- 精灵缓存 ---------------- */

const sprCache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function cs(r, g, b, a) {
  const R = r | 0, G = g | 0, B = b | 0;
  return a === undefined ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
}

/* ---------------- 灵梦：御札 ---------------- */

/**
 * 御札精灵：竖直符纸。
 * 纸边不是直线，而是带毛边的折线（一次性烘焙，静态确定）。
 */
function buildTalisman(r) {
  const W = r * 1.18;        // 纸宽
  const H = r * 2.85;        // 纸高
  const ext = H * 0.86;      // 外接半径（含光晕与拖尾余量）
  const dim = Math.ceil(ext * 2 * SS);
  const c = makeCanvas(dim, dim);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dim / (2 * SS);

  g.save();
  g.translate(cx, cx);

  // ① 柔光：粉白暖光（加法混合时是尾迹的底光）
  const halo = g.createRadialGradient(0, 0, r * 0.2, 0, 0, ext);
  halo.addColorStop(0, 'rgba(255,232,244,0.5)');
  halo.addColorStop(0.35, 'rgba(255,120,180,0.22)');
  halo.addColorStop(0.72, 'rgba(255,80,150,0.07)');
  halo.addColorStop(1, 'rgba(255,80,150,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, ext, 0, Math.PI * 2);
  g.fill();

  // ② 符纸：白底 + 纸纤维毛边（左右边缘各 7 段小锯齿）
  const hw = W / 2;
  const hh = H / 2;
  g.beginPath();
  g.moveTo(-hw, -hh);
  g.lineTo(hw, -hh);
  // 右边
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    g.lineTo(hw + ((i & 1) ? 0.55 : -0.15), -hh + H * t);
  }
  g.lineTo(hw, hh);
  g.lineTo(-hw, hh);
  // 左边
  for (let i = 6; i >= 0; i--) {
    const t = (i + 0.5) / 7;
    g.lineTo(-hw + ((i & 1) ? -0.55 : 0.15), -hh + H * t);
  }
  g.closePath();

  const paper = g.createLinearGradient(-hw, -hh, hw, hh);
  paper.addColorStop(0, '#fffdfe');
  paper.addColorStop(0.34, '#fff6fa');
  paper.addColorStop(0.72, '#ffe9f2');
  paper.addColorStop(1, '#f7d6e4');
  g.fillStyle = paper;
  g.fill();

  // ③ 深色细描边（朱红，不用纯黑，避免脏）
  g.strokeStyle = 'rgba(168,26,66,0.9)';
  g.lineWidth = 0.75;
  g.stroke();

  // 纸边压暗：下缘与右缘薄薄一层，做出纸的厚度
  const edge = g.createLinearGradient(0, hh - H * 0.22, 0, hh);
  edge.addColorStop(0, 'rgba(190,120,150,0)');
  edge.addColorStop(1, 'rgba(150,60,95,0.28)');
  g.fillStyle = edge;
  g.fillRect(-hw, hh - H * 0.22, W, H * 0.22);

  // ④ 朱红符纹：竖笔 + 两道横笔 + 下方朱印
  g.strokeStyle = '#e8245f';
  g.lineCap = 'round';
  g.lineWidth = Math.max(0.8, W * 0.17);
  g.beginPath();
  g.moveTo(0, -hh * 0.66);
  g.lineTo(0, hh * 0.28);
  g.stroke();
  g.lineWidth = Math.max(0.6, W * 0.13);
  g.beginPath();
  g.moveTo(-W * 0.3, -hh * 0.4);
  g.lineTo(W * 0.3, -hh * 0.4);
  g.moveTo(-W * 0.24, -hh * 0.1);
  g.lineTo(W * 0.24, -hh * 0.1);
  g.stroke();
  // 朱印（小方块 + 内部留白）
  g.fillStyle = '#e8245f';
  g.fillRect(-W * 0.22, hh * 0.38, W * 0.44, W * 0.44);
  g.fillStyle = 'rgba(255,246,250,0.9)';
  g.fillRect(-W * 0.1, hh * 0.47, W * 0.2, W * 0.1);

  // ⑤ 白热核心：中段一小团，标出判定中心
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.5, 'rgba(255,214,234,0.55)');
  core.addColorStop(1, 'rgba(255,170,210,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  g.fill();

  g.restore();
  return { img: c, w: dim / SS, ext };
}

/* ---------------- 魔理沙：星形魔弹 ---------------- */

function starPath(g, R, r2, n, rot) {
  g.beginPath();
  const step = Math.PI / n;
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * step;
    const rad = (i & 1) ? r2 : R;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function buildStarShot(r) {
  const R = r * 1.5;
  const ext = R * 2.0;
  const dim = Math.ceil(ext * 2 * SS);
  const c = makeCanvas(dim, dim);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dim / (2 * SS);
  g.save();
  g.translate(cx, cx);

  // ① 金色柔光
  const halo = g.createRadialGradient(0, 0, r * 0.2, 0, 0, ext);
  halo.addColorStop(0, 'rgba(255,246,200,0.55)');
  halo.addColorStop(0.3, 'rgba(255,214,80,0.26)');
  halo.addColorStop(0.68, 'rgba(255,180,40,0.08)');
  halo.addColorStop(1, 'rgba(255,180,40,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, ext, 0, Math.PI * 2);
  g.fill();

  // ② 深色细描边
  starPath(g, R * 1.02, R * 0.44, 5, -Math.PI / 2);
  g.strokeStyle = 'rgba(120,52,0,0.85)';
  g.lineWidth = r * 0.22;
  g.lineJoin = 'round';
  g.stroke();

  // ③ 金色中间层
  const sg = g.createRadialGradient(0, 0, r * 0.08, 0, 0, R);
  sg.addColorStop(0, '#fffdf0');
  sg.addColorStop(0.32, '#ffe98a');
  sg.addColorStop(0.72, '#ffc72e');
  sg.addColorStop(1, '#e07f10');
  g.fillStyle = sg;
  starPath(g, R, R * 0.44, 5, -Math.PI / 2);
  g.fill();

  // 内层小星（错开 36°）
  starPath(g, R * 0.58, R * 0.3, 5, -Math.PI / 2 + Math.PI / 5);
  g.fillStyle = 'rgba(255,255,255,0.32)';
  g.fill();

  // ④ 白热核心
  const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.55, 'rgba(255,255,230,0.7)');
  core.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  g.fill();

  g.restore();
  return { img: c, w: dim / SS, ext };
}

/** 金色尾迹：横向拉长的软光条（按速度方向旋转后使用） */
function buildStreak(r) {
  const L = r * 7.5;
  const H = r * 2.6;
  const dimW = Math.ceil(L * 2 * SS);
  const dimH = Math.ceil(H * 2 * SS);
  const c = makeCanvas(dimW, dimH);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dimW / (2 * SS);
  const cy = dimH / (2 * SS);
  g.save();
  g.translate(cx, cy);

  const grad = g.createLinearGradient(-L * 0.6, 0, L * 0.6, 0);
  grad.addColorStop(0, 'rgba(255,170,40,0)');
  grad.addColorStop(0.45, 'rgba(255,205,80,0.42)');
  grad.addColorStop(0.86, 'rgba(255,246,200,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0.95)');
  g.fillStyle = grad;
  // 纺锤形：两端收窄
  g.beginPath();
  g.moveTo(-L * 0.6, 0);
  g.quadraticCurveTo(0, -H * 0.5, L * 0.6, 0);
  g.quadraticCurveTo(0, H * 0.5, -L * 0.6, 0);
  g.closePath();
  g.fill();

  g.restore();
  return { img: c, w: dimW / SS, h: dimH / SS };
}

const SHOTS = {
  reimu: (r) => buildTalisman(r),
  marisa: (r) => buildStarShot(r),
};

function getShotSprite(char, r) {
  const key = `${char}|${r}`;
  let s = sprCache.get(key);
  if (!s) {
    const base = (SHOTS[char] || SHOTS.reimu)(r);
    s = base;
    if (char === 'marisa') s.streak = buildStreak(r);
    sprCache.set(key, s);
  }
  return s;
}

/* ---------------- 自机弹池 ---------------- */

export class PlayerShots {
  constructor(max = MAX_SHOTS) {
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) {
      this.pool[i] = {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, r: 7, damage: 1, char: 'reimu', rot: 0, t: 0,
        homing: false, pierce: false, special: false,
        turn: 0,             // 单发追踪角速度（主弹 0，副弹按 special 表）
        range: 0,            // 单发追踪距离
        target: null,        // 追踪锁定的目标包装对象 { ref, x, y }
        hitTargets: [],      // 穿透弹已经打过的目标，避免同一敌人每帧重复扣血
      };
    }
    this.cursor = 0;
    this.cooldown = 0;
    this.fireCount = 0;   // 开火轮数：决定特殊副弹的节奏（每 2 轮一发）
  }

  _take() {
    for (let n = 0; n < this.pool.length; n++) {
      const i = (this.cursor + n) % this.pool.length;
      if (!this.pool[i].active) {
        this.cursor = (i + 1) % this.pool.length;
        return this.pool[i];
      }
    }
    const b = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return b;
  }

  /**
   * 开火。每一轮 = 固定直射主弹（数量随火力 1-5 成长）+ 每 2 轮的 1 发特殊副弹。
   * @param {number} x 枪口 x
   * @param {number} y 枪口 y
   * @param {number} dir 朝向 1 / -1
   * @param {'reimu'|'marisa'} char
   * @param {number} powerLevel 1-5
   * @param {number} [aim=0] 仰角（弧度，负数向上）
   * @param {number} [spread] 扇形总张角（默认按是否仰射自动取 fanAim / fanFlat）
   * @param {boolean} [focus=false] 按住 Shift 低速时收束扇形
   */
  fire(x, y, dir, char, powerLevel = 1, aim = 0, spread, focus = false) {
    const prof = SHOT_PROFILE[char] || SHOT_PROFILE.reimu;
    const lv = Math.min(5, Math.max(1, powerLevel | 0));
    // 主弹数成长：1 / 2 / 3 / 4 / 5 发（Lv.5 是 2026-10-24 新加的一档，回到旧版最高档的 5 发）；
    // 灵梦单发 4，魔理沙单发 8（普通弹两倍），最终都乘 balance.js 的全局攻击倍率
    const shots = [1, 2, 3, 4, 5][lv - 1];
    // 向上射击时用大扇形覆盖不同的高度/距离，平射用较小的散布；
    // 魔理沙的 fanFlat/fanAim 都比灵梦大，形成「扩散弹」
    let fan = spread === undefined ? (aim ? prof.fanAim : prof.fanFlat) : spread;
    // Shift 低速：扇形与出生错位一起压窄，弹道收成一束直线
    if (focus) fan *= FOCUS_FAN_MUL;
    const offsetMul = focus ? FOCUS_OFFSET_MUL : 1;
    for (let i = 0; i < shots; i++) {
      const t = shots === 1 ? 0 : (i / (shots - 1)) - 0.5;
      const ang = aim + t * fan;
      const b = this._take();
      b.active = true;
      b.x = x;
      b.y = y + t * 12 * offsetMul;
      b.vx = Math.cos(ang) * prof.speed * dir;
      b.vy = Math.sin(ang) * prof.speed;
      b.life = prof.life;
      b.r = prof.r;
      b.damage = scalePlayerDamage(prof.damage);
      b.char = char;
      // 主弹：固定直射，不追踪、不穿透
      b.homing = false;
      b.pierce = false;
      b.special = false;
      b.turn = 0;
      b.range = 0;
      b.target = null;
      b.hitTargets.length = 0;
      b.rot = dir > 0 ? 0 : Math.PI;
      b.t = 0;
    }

    // 特殊副弹：每 every 轮补一发，让「固定 + 追踪 / 固定 + 穿透」同时在场
    this.fireCount = (this.fireCount + 1) | 0;
    const sp = prof.special;
    if (sp && this.fireCount % (sp.every || 2) === 0) {
      const b = this._take();
      const ang = aim * 0.6; // 副弹比主弹更贴近直线，追踪/穿透自己会找目标
      b.active = true;
      b.x = x + 6 * dir;
      b.y = y + 3;
      b.vx = Math.cos(ang) * sp.speed * dir;
      b.vy = Math.sin(ang) * sp.speed;
      b.life = sp.life;
      b.r = sp.r;
      b.damage = scalePlayerDamage(sp.damage);
      b.char = char;
      b.homing = !!sp.homing;
      b.pierce = !!sp.pierce;
      b.special = true;
      b.turn = sp.homingTurn || 0;
      b.range = sp.homingRange || 0;
      b.scale = sp.scale || 1.2;
      b.target = null;
      b.hitTargets.length = 0;
      b.rot = dir > 0 ? 0 : Math.PI;
      b.t = 0;
    }
  }

  update(dt, bounds, targets) {
    const pad = 120;
    for (let i = 0; i < this.pool.length; i++) {
      const b = this.pool[i];
      if (!b.active) continue;
      b.t += dt;
      b.life -= dt;
      if (b.homing && targets && targets.length) this._steer(b, dt, targets);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0) { this._retire(b); continue; }
      if (bounds && (b.x < -pad || b.x > bounds.w + pad || b.y < -pad || b.y > bounds.h + pad)) {
        this._retire(b);
      }
    }
  }

  /** 回收一发弹：顺手把目标引用清掉，避免打死的敌人一直挂在池对象上 */
  _retire(b) {
    b.active = false;
    b.target = null;
    b.hitTargets.length = 0;
  }

  /**
   * 追踪转向：锁定最近的敌人（Boss / 杂兵一视同仁），以有限角速度把弹道掰过去。
   * targets 由 Stage 每帧重建：[{ ref, x, y }]，ref 是敌人 / Boss 本体。
   * 已锁定的目标只要还活着、还在射程内就继续追，避免每帧改目标导致弹道抖动。
   */
  _steer(b, dt, targets) {
    const prof = SHOT_PROFILE[b.char] || SHOT_PROFILE.reimu;
    let t = b.target;
    if (t && !this._targetLive(t, targets)) t = b.target = null;
    if (!t) t = b.target = this._nearestTarget(b, targets);
    if (!t) return;

    const dx = t.x - b.x;
    const dy = t.y - b.y;
    const dist2 = dx * dx + dy * dy;
    const range = b.range || prof.homingRange || 900;
    if (dist2 > range * range) { b.target = null; return; }

    const sp = Math.hypot(b.vx, b.vy) || 1;
    const cur = Math.atan2(b.vy, b.vx);
    const want = Math.atan2(dy, dx);
    let d = want - cur;
    while (d > Math.PI) d -= PI2;
    while (d < -Math.PI) d += PI2;
    const maxTurn = (b.turn || prof.homingTurn || 6) * dt;
    if (d > maxTurn) d = maxTurn;
    else if (d < -maxTurn) d = -maxTurn;
    const na = cur + d;
    b.vx = Math.cos(na) * sp;
    b.vy = Math.sin(na) * sp;
  }

  _targetLive(t, targets) {
    for (let i = 0; i < targets.length; i++) {
      if (targets[i].ref === t.ref) {
        t.x = targets[i].x;
        t.y = targets[i].y;
        return true;
      }
    }
    return false;
  }

  _nearestTarget(b, targets) {
    const prof = SHOT_PROFILE[b.char] || SHOT_PROFILE.reimu;
    const range = b.range || prof.homingRange || 900;
    let best = null;
    let bestD = range * range;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const dx = t.x - b.x;
      const dy = t.y - b.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  /**
   * 与矩形碰撞，返回本帧是否命中。
   * @param {*} [targetRef] 目标本体（敌人 / Boss）。穿透弹靠它记录「这一发已经打过谁」，
   *                        同一条穿透弹对同一个目标只会结算一次伤害。
   * 非穿透弹保持原来的行为：命中的第一发被消耗并立即返回。
   */
  hitRect(x, y, w, h, damageCb, targetRef) {
    let any = false;
    for (let i = 0; i < this.pool.length; i++) {
      const b = this.pool[i];
      if (!b.active) continue;
      if (!(b.x + b.r > x && b.x - b.r < x + w && b.y + b.r > y && b.y - b.r < y + h)) continue;
      if (b.pierce && targetRef) {
        if (b.hitTargets.indexOf(targetRef) >= 0) continue;
        b.hitTargets.push(targetRef);
        any = true;
        if (damageCb) damageCb(b.damage, b.x, b.y);
        continue; // 穿透：不消耗，继续飞
      }
      b.active = false;
      b.target = null;
      if (damageCb) damageCb(b.damage, b.x, b.y);
      return true;
    }
    return any;
  }

  clear() {
    for (let i = 0; i < this.pool.length; i++) this._retire(this.pool[i]);
  }

  draw(ctx, cam) {
    const pool = this.pool;
    ctx.save();
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;
      if (cam) {
        const sx = b.x - cam.x;
        const sy = b.y - cam.y;
        if (sx < -60 || sx > 1340 || sy < -60 || sy > 780) continue;
      }
      const alpha = Math.min(1, b.life * 6);
      const S = getShotSprite(b.char, b.r);
      const sc = b.special ? (b.scale || 1.2) : 1;
      const dir = b.vx >= 0 ? 1 : -1;
      const sp = Math.hypot(b.vx, b.vy) || 1;

      // 特殊副弹：额外一圈高亮光环 + 柔光核，和主弹一眼区分
      if (b.special) {
        const col = b.char === 'marisa' ? '150,225,255' : '255,160,210';
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.32;
        ctx.fillStyle = `rgba(${col},0.42)`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 1.25, 0, PI2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.72;
        ctx.strokeStyle = `rgba(${col},0.95)`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (1.85 + Math.sin(b.t * 20) * 0.12), 0, PI2);
        ctx.stroke();
        ctx.restore();
      }

      if (b.char === 'marisa') {
        /* ---- 魔理沙：金色尾迹 + 旋转星弹 + 穿透光环 ---- */
        const ang = Math.atan2(b.vy, b.vx);
        const streak = S.streak;
        if (streak) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.translate(b.x, b.y);
          ctx.rotate(ang);
          // 两段递减的尾迹（同一张精灵，只改 alpha/缩放；亮端贴在弹头）
          const lw = streak.w;
          const lh = streak.h;
          const s1 = lw;
          const s2 = lw * 0.7;
          ctx.globalAlpha = alpha * 0.3;
          ctx.drawImage(streak.img, -lw * 0.30 - s1 * 0.5, -lh * 0.5, s1, lh);
          ctx.globalAlpha = alpha * 0.45;
          ctx.drawImage(streak.img, -lw * 0.18 - s2 * 0.5, -lh * 0.36, s2, lh * 0.72);
          ctx.restore();
        }

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.t * 11); // 缓慢自转，星形更有生命力
        const w = S.w * sc;
        ctx.globalAlpha = alpha;
        ctx.drawImage(S.img, -w * 0.5, -w * 0.5, w, w);
        ctx.restore();

        // 穿透标记：一圈青白细环，和灵梦的普通御札一眼分得开
        if (b.pierce) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * 0.6;
          ctx.strokeStyle = 'rgba(150,225,255,0.9)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 1.55 + Math.sin(b.t * 16) * 1.2, 0, PI2);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        /* ---- 灵梦：御札 —— 两层残影 + 符纸（沿实际速度方向拖尾，水平镜像，不旋转） ---- */
        const w = S.w * sc;
        const s1 = w * 0.84;
        const s2 = w * 0.94;
        const ux = -b.vx / sp;
        const uy = -b.vy / sp;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.26;
        ctx.drawImage(S.img, b.x + ux * b.r * 2.6 - s1 * 0.5, b.y + uy * b.r * 2.6 - s1 * 0.5, s1, s1);
        ctx.globalAlpha = alpha * 0.4;
        ctx.drawImage(S.img, b.x + ux * b.r * 1.3 - s2 * 0.5, b.y + uy * b.r * 1.3 - s2 * 0.5, s2, s2);
        ctx.restore();

        // 追踪标记：一圈呼吸的粉色光环，提示这发会拐弯
        if (b.homing) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = alpha * 0.5;
          ctx.strokeStyle = 'rgba(255,130,190,0.85)';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 1.75 + Math.sin(b.t * 13) * 1.6, 0, PI2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.translate(b.x, b.y);
        // 飞行中的轻微飘动（纸被风掀起来一点）
        ctx.rotate(Math.sin(b.t * 22) * 0.06 * dir);
        ctx.scale(dir, 1);
        ctx.globalAlpha = alpha;
        ctx.drawImage(S.img, -w * 0.5, -w * 0.5, w, w);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
