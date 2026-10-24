/**
 * bulletArt/_lib.js —— 专属弹型的美术基座。
 *
 * 只给 src/game/bulletArt/*.js 的「角色专属弹型」用，不改原冰晶家族（0~4）。
 *
 * 关键约定：
 *   - build(g, size, color) 在弹体中心 (0,0) 作画；size = 判定半径（css px），
 *     画出的剪影必须落在 ext*size 内（ext 由弹型在注册表里声明，惯例 1.35~1.55，
 *     刀 / 燕尾这类长条 1.8~2.1）。长轴统一朝上（-Y）。
 *   - 这些函数只在「精灵烘焙」时执行（每个 type|color|size 只跑一次），
 *     可以用渐变和路径，但禁止 Math.random / 逐帧调用；随机一律用 hash01(i) 派生。
 *   - 画笔 ctx 已由 bullets.js 做 2x 超采样并 translate 到中心，这里 1 单位 = 1 css px。
 *   - 视觉口径沿用 ART_DIRECTION.md：白热核心 → 主题色中间层 → 柔光晕；
 *     近黑描边压住亮背景；暗部带环境色，不用中性灰。
 */

export const WHITE = [255, 255, 255];
export const TAU = Math.PI * 2;

/* ============================================================
   颜色
   ============================================================ */

export function hexToRgb(hex) {
  if (typeof hex !== 'string') return WHITE;
  let h = hex.trim();
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length >= 6) {
    const n = parseInt(h.slice(0, 6), 16);
    if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return WHITE;
}

export function rgbToHsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s, l };
}

export function hslToRgb(h, s, l) {
  if (s <= 0.001) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 颜色字符串；a 省略 = 不透明 */
export function rgba(c, a) {
  const r = c[0] | 0, g = c[1] | 0, b = c[2] | 0;
  return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
export const cs = rgba;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }

/** 确定性伪随机：同一个 i 永远同一个值（禁止 Math.random 造成闪烁 / 重烤不一致） */
export function hash01(i) {
  let x = Math.imul(i | 0, 0x27d4eb2d) ^ 0x9e3779b9;
  x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return ((x >>> 0) % 100000) / 100000;
}

/* ============================================================
   材质表：所有专属弹型共用同一套「打光语言」
   key 供 mat() 使用；每种材质给高光 / 暗部 / 描边一个固定色调，
   弹幕本身的色相仍由 b.color 决定（逐卡配色不丢）。
   ============================================================ */

const MATS = {
  /** 近黑 + 血红受光：露米娅的暗 */
  dark:   { hi: [255, 96, 120], dark: [10, 4, 18], edge: [2, 1, 6], sat: [0.70, 0.95], lum: [0.24, 0.36], glowMix: [255, 40, 80] },
  /** 虫壳：暗橄榄 + 暖黄高光 */
  bug:    { hi: [232, 255, 160], dark: [16, 24, 8], edge: [4, 8, 2], sat: [0.55, 0.85], lum: [0.34, 0.48], glowMix: [210, 255, 120] },
  /** 冰：沿用原冰晶家族口径 */
  cold:   { hi: [223, 244, 255], dark: [26, 20, 60], edge: [4, 6, 18], sat: [0.78, 0.92], lum: [0.42, 0.58], glowMix: [223, 244, 255] },
  /** 秋枫 / 火：暖橙金高光 + 焦糖暗部 */
  warm:   { hi: [255, 236, 170], dark: [84, 28, 8], edge: [18, 6, 3], sat: [0.72, 0.92], lum: [0.46, 0.60], glowMix: [255, 150, 60] },
  /** 焰：比 warm 更红更亮 */
  flame:  { hi: [255, 250, 210], dark: [96, 16, 6], edge: [22, 5, 2], sat: [0.80, 0.96], lum: [0.52, 0.66], glowMix: [255, 120, 50] },
  /** 樱：粉白高光 + 洋红暗部 */
  pink:   { hi: [255, 232, 244], dark: [104, 30, 70], edge: [26, 6, 20], sat: [0.52, 0.76], lum: [0.58, 0.72], glowMix: [255, 170, 210] },
  /** 钢（太刀）：冷白刃光 + 深蓝灰背 */
  steel:  { hi: [240, 250, 255], dark: [22, 32, 46], edge: [5, 9, 14], sat: [0.08, 0.22], lum: [0.52, 0.66], glowMix: [190, 240, 255] },
  /** 石：暖灰 + 冷高光 */
  stone:  { hi: [240, 232, 214], dark: [52, 44, 36], edge: [12, 10, 8], sat: [0.08, 0.26], lum: [0.44, 0.56], glowMix: [200, 190, 170] },
  /** 玉/枝：翠绿高光 + 深翡翠暗部 */
  jade:   { hi: [224, 255, 228], dark: [10, 70, 50], edge: [3, 18, 12], sat: [0.50, 0.78], lum: [0.48, 0.62], glowMix: [150, 255, 190] },
  /** 金：暖金高光 + 焦褐暗部 */
  gold:   { hi: [255, 248, 200], dark: [88, 56, 8], edge: [20, 12, 2], sat: [0.70, 0.90], lum: [0.52, 0.66], glowMix: [255, 220, 120] },
};

/** 取材质定义（未知 key 回退 cold） */
export function matDef(key) { return MATS[key] || MATS.cold; }

/**
 * 由 b.color + 材质派生一套明度阶梯（和 bullets.js 的 palette 同一思路，
 * 但按时材质的明度 / 饱和度区间夹住，保证「枫叶像枫叶、刀像刀」）。
 *
 * @param {string} color 弹幕主题色
 * @param {'dark'|'bug'|'cold'|'warm'|'flame'|'pink'|'steel'|'stone'|'jade'|'gold'} key
 * @returns {{base:number[],light:number[],hi:number[],hot:number[],shade:number[],deep:number[],edge:number[],glow:number[],rgb:number[]}}
 */
export function mat(color, key = 'cold') {
  const M = matDef(key);
  const src = hexToRgb(color);
  const hsl = rgbToHsl(src);
  const sat = clamp(hsl.s > 0.12 ? hsl.s * 1.25 : 0.35, M.sat[0], M.sat[1]);
  const lum = clamp(hsl.s > 0.12 ? hsl.l : (M.lum[0] + M.lum[1]) * 0.5, M.lum[0], M.lum[1]);
  const base = hslToRgb(hsl.h, sat, lum);
  return {
    rgb: src,
    base,
    light: mix(base, M.hi, 0.46),
    hi: mix(base, M.hi, 0.82),
    hot: mix(base, WHITE, 0.88),
    shade: mix(base, M.dark, 0.36),
    deep: mix(base, M.dark, 0.62),
    edge: mix(base, M.edge, 0.84),
    glow: mix(base, M.glowMix, 0.32),
  };
}

/** 该类弹型在加法辉光层用的颜色（bullets.js 用它烤 glow 精灵） */
export function glowColor(color, key = 'cold') {
  return mat(color, key).glow;
}

/* ============================================================
   路径工具
   ============================================================ */

/** 只描路径（不 fill / stroke），pts = [[x,y], …] */
export function path(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

/** 正多边形顶点 */
export function ringPts(R, n, rot = 0) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    p.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  return p;
}

/** 尖角星顶点（外 R / 内 r 交替） */
export function starPts(R, r, n, rot = 0) {
  const p = [];
  const step = Math.PI / n;
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * step;
    p.push([Math.cos(a) * (i & 1 ? r : R), Math.sin(a) * (i & 1 ? r : R)]);
  }
  return p;
}

/** 圆角多边形（用于石片 / 花瓣这类软轮廓），pts 里每个顶点切圆 */
export function roundPath(g, pts, r) {
  const n = pts.length;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
    const rr = Math.min(r, d1 * 0.5, d2 * 0.5);
    const ax = p1[0] + ((p0[0] - p1[0]) / d1) * rr;
    const ay = p1[1] + ((p0[1] - p1[1]) / d1) * rr;
    const bx = p1[0] + ((p2[0] - p1[0]) / d2) * rr;
    const by = p1[1] + ((p2[1] - p1[1]) / d2) * rr;
    if (i === 0) g.moveTo(ax, ay); else g.lineTo(ax, ay);
    g.quadraticCurveTo(p1[0], p1[1], bx, by);
  }
  g.closePath();
}

/* ============================================================
   打光 / 质感
   ============================================================ */

/** 叶片/刀身的「斜向受光」填充：左上亮 → 右下暗 */
export function facetFill(g, pts, P, bright = 1) {
  const R = Math.max(...pts.map((p) => Math.hypot(p[0], p[1]))) || 1;
  const grad = g.createLinearGradient(-R * 0.7, -R * 0.7, R * 0.7, R * 0.7);
  grad.addColorStop(0, rgba(mix(P.light, WHITE, 0.18 * bright), 1));
  grad.addColorStop(0.42, rgba(P.base, 1));
  grad.addColorStop(1, rgba(P.shade, 1));
  path(g, pts);
  g.fillStyle = grad;
  g.fill();
}

/** 近黑描边（可读性第一道保险） */
export function outline(g, pts, P, w = 0.11) {
  path(g, pts);
  g.lineWidth = w;
  g.strokeStyle = rgba(P.edge, 0.92);
  g.lineJoin = 'round';
  g.stroke();
}

/**
 * 受光内棱线：只在「朝左上」那半边描亮线。
 * 做法是先裁到多边形内部，再用「亮 → 透明」的线性渐变描一遍整条边。
 */
export function litRim(g, pts, P, w = 0.10, a = 0.95) {
  const R = Math.max(...pts.map((p) => Math.hypot(p[0], p[1]))) || 1;
  g.save();
  path(g, pts);
  g.clip();
  const grad = g.createLinearGradient(-R, -R, R * 0.35, R * 0.75);
  grad.addColorStop(0, rgba(P.hi, a));
  grad.addColorStop(0.45, rgba(P.hi, a * 0.35));
  grad.addColorStop(1, rgba(P.hi, 0));
  path(g, pts);
  g.lineWidth = w;
  g.lineJoin = 'round';
  g.strokeStyle = grad;
  g.stroke();
  g.restore();
}

/** 形状内部右下压暗（让平面有体积） */
export function shadeDown(g, pts, P, amount = 0.55) {
  const R = Math.max(...pts.map((p) => Math.hypot(p[0], p[1]))) || 1;
  g.save();
  path(g, pts);
  g.clip();
  const grad = g.createLinearGradient(-R * 0.5, -R * 0.5, R * 0.8, R * 0.9);
  grad.addColorStop(0, rgba(P.deep, 0));
  grad.addColorStop(1, rgba(P.deep, amount));
  g.fillStyle = grad;
  g.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
  g.restore();
}

/** 柔光晕（画在弹体外面那圈，alpha 低） */
export function softHalo(g, R, color, a = 0.20) {
  const grad = g.createRadialGradient(0, 0, R * 0.35, 0, 0, R);
  grad.addColorStop(0, rgba(color, a));
  grad.addColorStop(0.55, rgba(color, a * 0.45));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
}

/** 白热内芯 */
export function hotCore(g, r, P, a = 1) {
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, rgba(WHITE, a));
  grad.addColorStop(0.42, rgba(P.hot, a * 0.92));
  grad.addColorStop(1, rgba(P.hot, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
}

/** 高光小点 / 星芒（r 很小，别超过 0.2size） */
export function glint(g, x, y, r, colorStr, a = 0.95) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, rgba(WHITE, a));
  grad.addColorStop(0.5, colorStr);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** 一条渐隐光带（速度线 / 叶脉 / 裂纹） */
export function streak(g, x0, y0, x1, y1, color, w = 0.08, a = 0.8) {
  const grad = g.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, rgba(color, 0));
  grad.addColorStop(0.5, rgba(color, a));
  grad.addColorStop(1, rgba(color, 0));
  g.strokeStyle = grad;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
