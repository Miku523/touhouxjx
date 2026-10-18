/**
 * 特效层：粒子、残影、光晕、圆环。
 *
 * 全部在世界坐标系下绘制（ctx 已按相机平移）。
 * 粒子用定长数组池，满池时覆盖最老的，永不 new。
 *
 * 性能要点：
 *   旧版在加法混合那一遍里对每颗粒子现场 createRadialGradient（最坏 900 次/帧）。
 *   现在所有「光点 / 星光」形状都按颜色预渲染成离屏精灵并缓存，运行时只 drawImage。
 *   同一颗粒子的所有随机量在出生时确定（确定性 PRNG），整段生命周期外观稳定不闪烁。
 */

const MAX_PARTICLES = 900;
const SS = 2;              // 精灵超采样倍率
const GLOW_R = 2.4;        // 光点精灵绘制半径 = size * GLOW_R
const STAR_R = 2.15;       // 星光精灵绘制半径 = size * STAR_R

/** 粒子类型 */
const P_DOT = 0;
const P_SPARK = 1;
const P_RING = 2;
const P_GHOST = 3;
const P_STAR = 4;
const P_PETAL = 5;

/* ---------------- 确定性随机 ---------------- */

// xorshift32：固定种子 → 每次运行的粒子散布完全一致，同一粒子外观稳定
let _rng = 0x9e3779b9;
function rnd() {
  let x = _rng;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  _rng = x;
  return x / 4294967296;
}

/* ---------------- 小工具 ---------------- */

function cs(r, g, b, a) {
  const R = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  const G = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  const B = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return a === undefined ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
}

/* ---------------- 离屏精灵缓存 ---------------- */

const glowCache = new Map();
const starCache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** 光点精灵：白热核心 → 颜色中间层 → 柔光晕，一张图就是完整的发光体 */
function buildGlow(r, g, b) {
  const dim = 48 * SS;
  const c = makeCanvas(dim, dim);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  const cx = 24;
  const cr = Math.min(255, r + (255 - r) * 0.66);
  const cg = Math.min(255, g + (255 - g) * 0.66);
  const cb = Math.min(255, b + (255 - b) * 0.66);
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, 24);
  grad.addColorStop(0, cs(cr, cg, cb, 1));
  grad.addColorStop(0.16, cs(cr, cg, cb, 0.95));
  grad.addColorStop(0.3, cs(r, g, b, 0.5));
  grad.addColorStop(0.56, cs(r, g, b, 0.18));
  grad.addColorStop(0.8, cs(r, g, b, 0.04));
  grad.addColorStop(1, cs(r, g, b, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cx, 24, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

/** 星光精灵：八芒星 + 中心白热 + 四向长针（环境萤火 / 收集星屑） */
function buildStar(r, g, b) {
  const dim = 32 * SS;
  const c = makeCanvas(dim, dim);
  const ctx = c.getContext('2d');
  ctx.scale(SS, SS);
  const cx = 16;

  // 外晕
  const halo = ctx.createRadialGradient(cx, cx, 1, cx, cx, 16);
  halo.addColorStop(0, cs(r, g, b, 0.5));
  halo.addColorStop(0.4, cs(r, g, b, 0.16));
  halo.addColorStop(1, cs(r, g, b, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cx, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cx);
  // 八芒星主体
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rad = (i & 1) ? 2.6 : 6.4;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 6.4);
  sg.addColorStop(0, '#ffffff');
  sg.addColorStop(0.45, cs(r, g, b, 0.95));
  sg.addColorStop(1, cs(r, g, b, 0));
  ctx.fillStyle = sg;
  ctx.fill();

  // 四向长针（十字辉光）
  ctx.strokeStyle = cs(r, g, b, 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
  ctx.moveTo(0, -12); ctx.lineTo(0, 12);
  ctx.stroke();

  // 中心白热
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 3.2);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return c;
}

function getGlow(r, g, b) {
  const key = `${r | 0},${g | 0},${b | 0}`;
  let s = glowCache.get(key);
  if (!s) {
    if (glowCache.size > 48) glowCache.clear();
    s = buildGlow(r | 0, g | 0, b | 0);
    glowCache.set(key, s);
  }
  return s;
}

function getStar(r, g, b) {
  const key = `${r | 0},${g | 0},${b | 0}`;
  let s = starCache.get(key);
  if (!s) {
    if (starCache.size > 48) starCache.clear();
    s = buildStar(r | 0, g | 0, b | 0);
    starCache.set(key, s);
  }
  return s;
}

/* ---------------- 粒子池 ---------------- */

export class Fx {
  constructor() {
    this.pool = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool[i] = {
        active: false, type: 0,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 3,
        r: 255, g: 255, b: 255, a: 1,
        grav: 0, drag: 0, spin: 0, rot: 0,
        grow: 0,
        seed: 0, depth: 1, sway: 0, flutter: 0,
        trail: 0, stretch: 0, flat: 0,
      };
    }
    this.cursor = 0;
    this.time = 0;
  }

  _take() {
    // 从游标开始找，最多找一圈
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const p = this.pool[(this.cursor + n) % MAX_PARTICLES];
      if (!p.active) {
        this.cursor = (this.cursor + n + 1) % MAX_PARTICLES;
        p.active = true;
        return p;
      }
    }
    // 池满：覆盖游标位置
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.active = true;
    return p;
  }

  _base(p, x, y, r, g, b, life) {
    p.x = x; p.y = y;
    p.vx = 0; p.vy = 0;
    p.life = life; p.maxLife = life;
    p.r = r; p.g = g; p.b = b; p.a = 1;
    p.grav = 0; p.drag = 0; p.rot = 0; p.spin = 0;
    p.grow = 0; p.size = 3;
    p.seed = rnd();
    p.depth = 1; p.sway = 0; p.flutter = 0;
    p.trail = 0; p.stretch = 0; p.flat = 0;
    return p;
  }

  _hexToRgb(hex) {
    if (typeof hex !== 'string') return [255, 255, 255];
    const h = hex.replace('#', '');
    if (h.length === 6) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    if (h.length === 3) {
      return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    }
    return [255, 255, 255];
  }

  /* ---------------- 常用特效 ---------------- */

  /** 起跳/二段跳的上升气环 */
  jumpRing(x, y, color = '#bfe6ff') {
    const [r, g, b] = this._hexToRgb(color);
    const p = this._base(this._take(), x, y, r, g, b, 0.34);
    p.type = P_RING;
    p.size = 8;
    p.grow = 90;
    p.drag = 3.2;
    p.a = 0.8;
    p.flat = 0.45; // 贴上地面看是横向扁环
  }

  /** 落地尘土：左右两侧向外扬，沿速度方向拉长 → 有方向感 */
  landDust(x, y, color = '#d8c8b0', n = 7) {
    const [r, g, b] = this._hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const side = (i & 1) ? 1 : -1;
      const p = this._base(this._take(), x + (rnd() - 0.5) * 16, y - rnd() * 4, r, g, b, 0.3 + rnd() * 0.22);
      p.type = P_DOT;
      p.vx = side * (70 + rnd() * 120);
      p.vy = -30 - rnd() * 80;
      p.grav = 560;
      p.drag = 2.6;
      p.size = 1.8 + rnd() * 2.4;
      p.a = 0.62;
      p.stretch = 1;  // 沿速度拉长
      p.trail = 1;    // 高速时补一小颗拖尾
    }
    // 冲击尘环：横向压扁的一条，交代落点
    const q = this._base(this._take(), x, y, r, g, b, 0.26);
    q.type = P_RING;
    q.size = 6;
    q.grow = 170;
    q.a = 0.42;
    q.flat = 0.3;
  }

  /** 冲刺残影（椭圆剪影） */
  dashGhost(x, y, w, h, facing, color) {
    const [r, g, b] = this._hexToRgb(color);
    const p = this._base(this._take(), x, y, r, g, b, 0.26);
    p.type = P_GHOST;
    p.size = w;
    p.spin = h; // 用 spin 字段存高度
    p.a = 0.5;
  }

  /** 击破/受击的爆散光点 */
  burst(x, y, color, n = 12, speed = 260) {
    const [r, g, b] = this._hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd() * 0.6;
      const sp = speed * (0.45 + rnd() * 0.75);
      const p = this._base(this._take(), x, y, r, g, b, 0.28 + rnd() * 0.34);
      p.type = rnd() < 0.5 ? P_SPARK : P_DOT;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.drag = 3.4;
      p.grav = 160;
      p.size = 2 + rnd() * 3.2;
      p.a = 0.9;
      p.rot = ang;
      p.trail = 1;
    }
  }

  /** 闪光扩散环（双环：亮芯 + 外扩散） */
  shockwave(x, y, color, size = 20, grow = 420, life = 0.4) {
    const [r, g, b] = this._hexToRgb(color);
    const p = this._base(this._take(), x, y, r, g, b, life);
    p.type = P_RING;
    p.size = size;
    p.grow = grow;
    p.drag = 0;
    p.a = 0.85;
  }

  /** 金币/点数收集 */
  sparkle(x, y, color = '#ffd23f') {
    const [r, g, b] = this._hexToRgb(color);
    for (let i = 0; i < 5; i++) {
      const p = this._base(this._take(), x, y, r, g, b, 0.3 + rnd() * 0.2);
      p.type = P_STAR;
      p.vx = (rnd() - 0.5) * 110;
      p.vy = -35 - rnd() * 90;
      p.grav = 250;
      p.drag = 2.2;
      p.size = 1.6 + rnd() * 1.6;
      p.spin = 6 + rnd() * 8;
      p.rot = rnd() * 6.28;
      p.trail = 1;
    }
  }

  /**
   * 环境花瓣/萤火（持续粒子，用于场景氛围）
   * 近大远小：按 seed 分 3 档景深，越「近」越大越亮、摆动越明显。
   */
  ambient(x, y, color, opts = {}) {
    const [r, g, b] = this._hexToRgb(color);
    const p = this._base(this._take(), x, y, r, g, b, opts.life || 3.2);
    const star = !!opts.star;
    p.type = star ? P_STAR : P_PETAL;
    // 景深：0.55（远）~ 1.4（近）
    const d = 0.55 + p.seed * 0.85;
    p.depth = d;
    const speedK = 0.55 + d * 0.6;
    p.vx = (opts.vx !== undefined ? opts.vx : -20 - rnd() * 30) * speedK;
    p.vy = (opts.vy !== undefined ? opts.vy : 10 + rnd() * 24) * speedK;
    p.drag = 0;
    p.grav = opts.grav || 0;
    p.size = (opts.size || 2.2) * d;
    p.a = (opts.alpha !== undefined ? opts.alpha : 0.7) * (0.45 + 0.55 * d);
    p.spin = opts.spin || (star ? 1.2 : 0.9);
    p.rot = p.seed * 6.283;
    p.flutter = p.seed * 6.283;
    p.sway = 7 + p.seed * 15;      // 风摆幅度
    return p;
  }

  /** 冲击波式的方框闪（Boss 出场／符卡宣告）：克制，不刺眼 */
  flash(x, y, color, size = 40) {
    const [r, g, b] = this._hexToRgb(color);
    const p = this._base(this._take(), x, y, r, g, b, 0.26);
    p.type = P_RING;
    p.size = size;
    p.grow = 880;
    p.a = 0.5; // 旧版是 1.0，太亮
  }

  /* ---------------- 更新与绘制 ---------------- */

  update(dt) {
    this.time += dt;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }

      if (p.type === P_GHOST) continue; // 残影原地淡出

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav) p.vy += p.grav * dt;
      if (p.drag) {
        const d = 1 - Math.min(0.98, p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      if (p.grow) p.size += p.grow * dt;
      if (p.spin) p.rot += p.spin * dt;
      // 花瓣的翻面（绕自身长轴转动）与风摆
      if (p.type === P_PETAL) {
        p.flutter += dt * (2.4 + p.depth * 1.6);
        if (p.sway) p.x += Math.sin(p.seed * 6.283 + this.time * 1.9) * p.sway * dt;
      }
    }
  }

  draw(ctx) {
    const pool = this.pool;
    ctx.save();

    /* ---------- 第一遍：冲刺残影（普通混合的剪影，不能被加亮） ---------- */
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active || p.type !== P_GHOST) continue;
      const k = p.life / p.maxLife;
      const alpha = p.a * Math.min(1, k * 1.6);
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = cs(p.r, p.g, p.b);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 0.42, p.spin * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      // 外轮廓一点亮边，残影不至于糊成一块
      ctx.globalAlpha = alpha * 0.22;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    /* ---------- 第二遍：其余粒子统一加法混合 ---------- */
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active || p.type === P_GHOST) continue;
      const k = p.life / p.maxLife;                 // 1 → 0
      const alpha = p.a * Math.min(1, k * 1.6);
      if (alpha <= 0.01) continue;
      // 出生后一小段时间偏白（热衰减），之后回落到主题色
      const hot = k > 0.72 ? (k - 0.72) / 0.28 : 0;
      const cr = p.r + (255 - p.r) * hot;
      const cg = p.g + (255 - p.g) * hot;
      const cb = p.b + (255 - p.b) * hot;

      if (p.type === P_RING) {
        // 双环：外圈宽而柔（主题色） + 内圈细而亮（白热芯）
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.flat) ctx.scale(1, p.flat);
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = cs(p.r, p.g, p.b);
        ctx.lineWidth = Math.max(1.2, p.size * 0.12);
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = alpha * 0.8 * k;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = Math.max(1, p.size * 0.05);
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (p.type === P_SPARK) {
        // 短拖尾：尾线（亮→暗两段）
        const len = p.size * 3.4;
        const tx = p.x - Math.cos(p.rot) * len;
        const ty = p.y - Math.sin(p.rot) * len;
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = cs(cr, cg, cb);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1, p.size * 0.62);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.28;
        ctx.lineWidth = Math.max(0.8, p.size * 0.34);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - Math.cos(p.rot) * len * 0.9, ty - Math.sin(p.rot) * len * 0.9);
        ctx.stroke();
        // 头：光点精灵
        const rad = p.size * 1.7;
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(getGlow(p.r, p.g, p.b), p.x - rad, p.y - rad, rad * 2, rad * 2);
        continue;
      }

      if (p.type === P_STAR) {
        const rad = p.size * STAR_R;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha * 0.95;
        ctx.drawImage(getStar(p.r, p.g, p.b), -rad, -rad, rad * 2, rad * 2);
        ctx.restore();
        continue;
      }

      if (p.type === P_PETAL) {
        // 花瓣：绕长轴翻面（水平压缩）+ 中脉高光
        const flip = Math.cos(p.flutter);
        const w = p.size * (0.32 + 0.68 * Math.abs(flip));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = alpha * 0.92;
        ctx.fillStyle = cs(cr, cg, cb);
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 1.45, p.size * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-w * 1.2, 0);
        ctx.lineTo(w * 1.2, 0);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      /* P_DOT：光点（尘土 / 雾 / 一般光点） */
      let rad = p.size * GLOW_R;
      if (p.stretch) {
        // 沿速度方向拉长，尘土才有「方向感」
        const sp = Math.hypot(p.vx, p.vy);
        const ex = 1 + Math.min(1.5, sp / 240) * 0.95;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.scale(ex, 1);
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(getGlow(p.r, p.g, p.b), -rad, -rad, rad * 2, rad * 2);
        ctx.restore();
      } else {
        ctx.globalAlpha = alpha * 0.9;
        ctx.drawImage(getGlow(p.r, p.g, p.b), p.x - rad, p.y - rad, rad * 2, rad * 2);
        // 高速粒子补一小颗拖尾（同一张精灵，只改缩放/透明度）
        if (p.trail) {
          const sp2 = p.vx * p.vx + p.vy * p.vy;
          if (sp2 > 22500) { // >150px/s
            const tw = rad * 1.2;
            ctx.globalAlpha = alpha * 0.4;
            ctx.drawImage(getGlow(p.r, p.g, p.b),
              p.x - p.vx * 0.014 - tw, p.y - p.vy * 0.014 - tw, tw * 2, tw * 2);
          }
        }
      }
    }

    ctx.restore();
  }

  clear() {
    for (let i = 0; i < MAX_PARTICLES; i++) this.pool[i].active = false;
  }
}
