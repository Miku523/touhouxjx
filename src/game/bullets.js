/**
 * 弹幕系统：对象池 + 离屏精灵缓存 + 判定。
 *
 * 冰晶家族（《东方冰之勇者记》式的冷色玻璃质感）：
 *   B_CIRCLE 六棱切面宝石   B_RICE 细长冰棱   B_BIG 六瓣冰花结晶
 *   B_STAR 六角雪花结晶     B_LASER 冰晶光束
 *
 * 每颗弹幕的绘制顺序（全部烤进精灵，运行时只有 drawImage）：
 *   ① 柔光晕（最外层，alpha 很低，只交代「冰在发光」）
 *   ② 近黑蓝描边（#040612 混主色 → 量化后仍是深蓝，亮背景也压得住）
 *   ③ 切面主体：按朝向打光的多边形面，光源固定在左上
 *   ④ 内侧冷色亮棱线（#dff4ff 混主色，只留在描边内半边）
 *   ⑤ 白热内芯（半径约 0.26size，占剪影 23%）
 *
 * 可读性（16~24px 下）：
 *   - 绘制尺寸 = 判定半径 × 1.16，剪影外沿 = 1.30r（判定数值一字不动）；
 *   - 所有弹型都是多边形/尖角剪影，没有一个是圆；
 *   - 五色身份来自 b.color（HSL 夹到中间调 + 拉饱和），但共用同一套冷色打光
 *     （青白高光 / 深蓝紫暗部 / 近黑蓝描边），所以看起来是一个冰晶家族；
 *   - 快速弹（>300px/s）沿速度方向叠 2 帧拖尾，长度 ~1.2r。
 *
 * 性能要点：
 *   每颗弹幕如果用 createRadialGradient 现算，1200 发会直接把帧率打死。
 *   所以所有弹幕外观都按 (type, color, size) 一次性预渲染到离屏 canvas，
 *   运行时只做 drawImage（单颗 1 次本体 + 低负载时 1 次加法辉光）。
 *   碎冰闪点也是烤进精灵的，逐帧不新建任何渐变/路径。
 *   注意：精灵按 2x 超采样预渲染（渲染器 backing store 最高 2.5x，2x 足够清晰）。
 *
 * 坐标：全部是世界坐标（ctx 已由相机平移）。
 */

/* 弹幕类型 */
export const B_CIRCLE = 0;  // 六棱切面宝石
export const B_RICE = 1;    // 细长冰棱（可旋转）
export const B_BIG = 2;     // 六瓣冰花结晶（缓慢自转）
export const B_STAR = 3;    // 六角雪花结晶
export const B_LASER = 4;   // 冰晶光束

const MAX_BULLETS = 1400;

/* ---------------- 离屏精灵缓存 ---------------- */

const SS = 2;              // 精灵超采样倍率（渲染器 backing 最高 2.5x，2x 足够）
const VIS = 1.16;          // 绘制放大系数：剪影半径 ≈ 判定半径 × 1.30（判定数值一字不动）
const GLOW_MAX = 560;      // 活跃弹幕低于此数才叠加额外辉光层（保住峰值帧率）
const CACHE_LIMIT = 520;   // 精灵缓存条目上限（约 7~10MB；超限逐条淘汰最旧）

/* 冰晶家族的几何比例（相对 size = 判定半径）：
 * 每个形状的外接半径 + 半个描边 ≈ 1.12size，绘制时再 ×1.16 = **1.30r**，
 * 也就是「看见的冰晶 = 判定圆 × 1.3」，判定数值一字不动。
 * 亮棱线只画在内半边，保证 16px 下仍有一圈清楚的冷色边。 */
const GEM_R = 0.99;       // 六棱宝石外接（+描边 0.13 → 1.12size）
const RICE_W = 0.42;      // 冰棱半宽（含描边 ≈1.05size → 1.22r 宽）
const RICE_H = 1.16;      // 冰棱半长（长宽比 2.76:1）
const STAR_R = 1.02;      // 雪花星外接（+描边 → 1.13size）
const BLOOM_R = 1.02;     // 冰花外接
const LASER_L = 2.93;     // 光束长度（×VIS = 3.4r 视觉长，横向厚度仍贴合判定）
const LASER_W = 0.62;     // 光束半厚（视觉厚度 ≈1.7r）
const GLOW_EXT = 1.95;    // 加法辉光精灵外接半径

/* 冷色玻璃打光：高光偏青白、暗部偏深蓝紫、描边近黑蓝。
 * 主色仍由 b.color 决定，所以五色（粉/青/金/紫/绿/白）依旧分得开。 */
const HI = [223, 244, 255];   // #dff4ff 冰面高光
const COLD = [26, 20, 60];    // 暗部：深蓝紫
const EDGE = [4, 6, 18];      // 描边：近黑蓝
const WHITE = [255, 255, 255];
const LIGHT_ANG = -Math.PI * 0.75; // 光源在左上

const spriteCache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function hexToRgb(hex) {
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

function rgbToHsl(c) {
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

function hslToRgb(h, s, l) {
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

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** 颜色字符串；a 省略时输出不透明 rgb */
function cs(c, a) {
  const r = c[0] | 0, g = c[1] | 0, b = c[2] | 0;
  return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/**
 * 由主题色派生一套「冰晶」明度阶梯。
 *
 * 色相全部来自 b.color（五色身份不丢），明度/饱和度仍按上一轮的规则夹到
 * 中间调；高光统一混向 #dff4ff、暗部统一混向深蓝紫、描边混向近黑蓝，
 * 这样所有弹幕共享同一套冷色玻璃打光。
 */
function palette(color) {
  const src = hexToRgb(color);
  const hsl = rgbToHsl(src);
  let base;
  if (hsl.s > 0.12) {
    const s = Math.min(0.92, Math.max(0.78, hsl.s * 1.35));
    const l = Math.min(0.58, Math.max(0.42, hsl.l));
    base = hslToRgb(hsl.h, s, l);
  } else {
    // 近白弹：淡蓝白。过 bloom 是冷调高光，不是一坨白珍珠。
    base = [214, 224, 250];
  }
  return {
    base,
    light: mix(base, HI, 0.42),   // 迎光面
    hi: mix(base, HI, 0.80),      // 棱线 / 高光
    hot: mix(base, WHITE, 0.86),  // 白热内芯
    shade: mix(base, COLD, 0.34), // 背光面
    deep: mix(base, COLD, 0.58),  // 切面暗部
    edge: mix(base, EDGE, 0.80),  // 近黑蓝描边
    glow: mix(base, HI, 0.28),    // 光晕（带一点冰蓝）
  };
}

function polyPath(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

/** 正多边形顶点（rot 为第一个顶点的角度） */
function polyPts(R, n, rot) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * Math.PI * 2) / n;
    p.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  return p;
}

/** 尖角星顶点 */
function starPts(R, r, n, rot) {
  const p = [];
  const step = Math.PI / n;
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * step;
    const rad = (i & 1) ? r : R;
    p.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return p;
}

/** 切面受光程度 0~1：法线朝左上（LIGHT_ANG）最亮 */
function facetT(mid) {
  return 0.5 + 0.5 * Math.cos(mid - LIGHT_ANG);
}

/** 冷色玻璃的「右下压暗」：统一在形状内叠一层朝右下加深的线性渐变 */
function iceShade(g, R, P, amount) {
  g.save();
  const sg = g.createLinearGradient(-R * 0.45, -R * 0.45, R * 0.85, R * 0.85);
  sg.addColorStop(0, cs(P.deep, 0));
  sg.addColorStop(0.55, cs(P.deep, amount * 0.35));
  sg.addColorStop(1, cs(P.deep, amount));
  g.fillStyle = sg;
  g.fillRect(-R * 1.3, -R * 1.3, R * 2.6, R * 2.6);
  g.restore();
}

/** 内侧亮棱线：先按轮廓裁剪再描边，只留内半边，紧贴深色描边内侧 */
function innerRim(g, pts, width, P, alpha) {
  g.save();
  polyPath(g, pts);
  g.clip();
  polyPath(g, pts);
  const R = Math.abs(pts[0][0]) + Math.abs(pts[0][1]) + width;
  const rg = g.createLinearGradient(-R, -R, R, R);
  rg.addColorStop(0, cs(P.hi, alpha));
  rg.addColorStop(0.5, cs(P.light, alpha * 0.75));
  rg.addColorStop(1, cs(P.hi, alpha * 0.35));
  g.strokeStyle = rg;
  g.lineWidth = width;
  g.lineJoin = 'miter';
  g.miterLimit = 4;
  g.stroke();
  g.restore();
}

/** 白热内芯 */
function hotCore(g, rx, ry, P) {
  const r = Math.max(rx, ry);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, cs(P.hot, 0.95));
  grad.addColorStop(0.8, cs(P.hi, 0.42));
  grad.addColorStop(1, cs(P.hi, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/** 碎冰闪点：四角菱形，烤进精灵，不参与逐帧计算 */
function glint(g, x, y, r, color, alpha) {
  polyPath(g, [[x, y - r], [x + r * 0.4, y], [x, y + r], [x - r * 0.4, y]]);
  g.fillStyle = cs(color, alpha);
  g.fill();
}

/* ---------------- 本体精灵 ---------------- */

/** ① 圆弹 → 六棱切面宝石 */
function buildGem(g, size, P) {
  const R = size * GEM_R;
  const rot = -Math.PI / 2; // 一个尖朝上，剪影一眼是晶体
  const v = polyPts(R, 6, rot);
  const tiny = size <= 7;

  /* 深色描边（先描后填，外侧留一半）；小尺寸加粗一点，亮背景才压得住 */
  polyPath(g, v);
  g.strokeStyle = cs(P.edge, 0.95);
  g.lineWidth = size * (tiny ? 0.30 : 0.26);
  g.lineJoin = 'miter';
  g.miterLimit = 3;
  g.stroke();

  /* 六个切面：按朝向打光 → 天然读出「切割面」而不是球。
   * 小尺寸（≤7，屏幕 16~18px）刻意加大明暗反差、收一点高光，
   * 否则六个面会被 postFX 的 bloom 糊成一个白点。 */
  for (let i = 0; i < 6; i++) {
    const mid = rot + (i * Math.PI) / 3 + Math.PI / 6;
    polyPath(g, [[0, 0], v[i], v[(i + 1) % 6]]);
    const t = facetT(mid);
    g.fillStyle = cs(mix(P.deep, P.light, tiny ? 0.05 + 0.70 * t : 0.12 + 0.88 * t));
    g.fill();
  }

  /* 右下压暗：必须裁剪到六边形内，否则会在精灵里留下一块方形暗块 */
  g.save();
  polyPath(g, v);
  g.clip();
  iceShade(g, R, P, 0.34);
  g.restore();

  /* 台面（内六边形）：两层折射面里的一层 */
  const tr = R * (tiny ? 0.44 : 0.52);
  const tv = polyPts(tr, 6, rot + Math.PI / 6);
  polyPath(g, tv);
  const tg = g.createRadialGradient(-tr * 0.25, -tr * 0.3, 0, 0, 0, tr);
  tg.addColorStop(0, cs(P.hot, 0.98));
  tg.addColorStop(0.45, cs(P.light, 0.92));
  tg.addColorStop(1, cs(P.base, 0.30));
  g.fillStyle = tg;
  g.fill();
  g.strokeStyle = cs(P.hi, 0.7);
  g.lineWidth = Math.max(0.6, size * 0.07);
  g.stroke();

  /* 内侧亮棱线 + 白热内芯 */
  innerRim(g, v, size * 0.20, P, 0.85);
  const coreR = size * (tiny ? 0.19 : 0.26);
  hotCore(g, coreR, coreR, P);
}

/** ② 米弹 → 细长冰棱（两端尖、侧面两条棱线） */
function buildShard(g, size, P) {
  const W = size * RICE_W;
  const H = size * RICE_H;
  const pts = [
    [0, -H],
    [W * 0.95, -H * 0.42],
    [W * 0.62, H * 0.52],
    [0, H],
    [-W * 0.62, H * 0.52],
    [-W * 0.95, -H * 0.42],
  ];

  /* 深色描边 */
  polyPath(g, pts);
  g.strokeStyle = cs(P.edge, 0.95);
  g.lineWidth = size * 0.24;
  g.lineJoin = 'miter';
  g.miterLimit = 3;
  g.stroke();

  /* 主体：沿长轴渐变，上端更亮（冰棱尖端透光） */
  polyPath(g, pts);
  const lg = g.createLinearGradient(0, -H, 0, H);
  lg.addColorStop(0, cs(P.hi, 0.95));
  lg.addColorStop(0.34, cs(P.light, 0.95));
  lg.addColorStop(0.72, cs(P.base, 0.95));
  lg.addColorStop(1, cs(P.shade, 0.95));
  g.fillStyle = lg;
  g.fill();

  /* 左半侧切面压暗，形成棱柱的两面 */
  g.save();
  polyPath(g, pts);
  g.clip();
  polyPath(g, [[-W * 1.1, -H * 1.1], [0, -H * 1.1], [0, H * 1.1], [-W * 1.1, H * 1.1]]);
  g.fillStyle = cs(P.deep, 0.30);
  g.fill();
  /* 内部冷光 */
  const cg = g.createLinearGradient(0, -H * 0.85, 0, H * 0.85);
  cg.addColorStop(0, cs(P.hi, 0.30));
  cg.addColorStop(0.4, cs(P.hi, 0.05));
  cg.addColorStop(1, cs(P.deep, 0.22));
  g.fillStyle = cg;
  g.fillRect(-W * 1.2, -H * 1.1, W * 2.4, H * 2.2);
  g.restore();

  /* 侧面两条棱线：冰棱的身份证 */
  g.strokeStyle = cs(P.hi, 0.62);
  g.lineWidth = Math.max(0.7, size * 0.075);
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * W * 0.30, -H * 0.52);
    g.lineTo(s * W * 0.40, H * 0.62);
    g.stroke();
  }

  /* 白热内芯 + 尖端高光 */
  hotCore(g, size * 0.20, size * 0.34, P);
  glint(g, 0, -H * 0.56, W * 0.62, WHITE, 0.9);
}

/** ③ 大玉 → 六瓣冰花结晶簇 */
function buildBloom(g, size, P) {
  const R = size * BLOOM_R;
  const petals = 6;

  /* 外圈描边：整簇先描一圈，保证边缘干净 */
  for (let k = 0; k < petals; k++) {
    const a = (k * Math.PI * 2) / petals - Math.PI / 2;
    g.save();
    g.rotate(a);
    const pp = [
      [0, -R * 0.26],
      [R * 0.30, -R * 0.52],
      [R * 0.15, -R * 0.96],
      [0, -R],
      [-R * 0.15, -R * 0.96],
      [-R * 0.30, -R * 0.52],
    ];
    polyPath(g, pp);
    g.strokeStyle = cs(P.edge, 0.9);
    g.lineWidth = size * 0.20;
    g.lineJoin = 'miter';
    g.miterLimit = 3;
    g.stroke();

    /* 瓣身：靠近花心亮、尖端透光 */
    const pg = g.createLinearGradient(0, -R * 0.3, 0, -R);
    pg.addColorStop(0, cs(P.light, 0.95));
    pg.addColorStop(0.55, cs(P.base, 0.95));
    pg.addColorStop(1, cs(P.hi, 0.85));
    g.fillStyle = pg;
    g.fill();

    /* 瓣内分层高光（一片亮一片暗，六瓣交替） */
    g.save();
    polyPath(g, pp);
    g.clip();
    g.fillStyle = cs(k % 2 ? P.deep : P.hi, k % 2 ? 0.26 : 0.12);
    g.fillRect(-R * 0.5, -R, R, R);
    /* 瓣中棱线 */
    g.strokeStyle = cs(P.hi, 0.5);
    g.lineWidth = Math.max(0.6, size * 0.055);
    g.beginPath();
    g.moveTo(0, -R * 0.34);
    g.lineTo(0, -R * 0.94);
    g.stroke();
    g.restore();
    g.restore();
  }

  /* 花心：亮六边形核 + 白热芯 */
  const cr = R * 0.42;
  const cv = polyPts(cr, 6, -Math.PI / 2);
  polyPath(g, cv);
  const cg = g.createRadialGradient(0, 0, 0, 0, 0, cr);
  cg.addColorStop(0, cs(P.hot, 1));
  cg.addColorStop(0.5, cs(P.light, 0.95));
  cg.addColorStop(1, cs(P.base, 0.45));
  g.fillStyle = cg;
  g.fill();
  g.strokeStyle = cs(P.hi, 0.75);
  g.lineWidth = Math.max(0.7, size * 0.07);
  g.stroke();
  hotCore(g, size * 0.24, size * 0.24, P);

  /* 烤进精灵的碎冰闪点（不参与逐帧绘制） */
  glint(g, R * 0.46, -R * 0.30, size * 0.20, WHITE, 0.85);
  glint(g, -R * 0.34, R * 0.52, size * 0.14, P.hi, 0.75);
}

/** ④ 星弹 → 六角雪花结晶 */
function buildFlake(g, size, P) {
  const R = size * STAR_R;
  const rot = -Math.PI / 2;
  const v = starPts(R, R * 0.36, 6, rot);   // 内径 0.30→0.36：臂更厚，小尺寸才有「面」而不是细线

  /* 深色描边（miter 保尖角）：亮底（雪原/月白）全靠这条立住，所以比其它弹型更重 */
  polyPath(g, v);
  g.strokeStyle = cs(mix(P.edge, EDGE, 0.40), 1);
  g.lineWidth = size * 0.26;
  g.lineJoin = 'miter';
  g.miterLimit = 3;
  g.stroke();

  /* 主体：主色铺满整片花瓣，只有尖端透光提亮；白色只留给中心核 */
  polyPath(g, v);
  const sg = g.createRadialGradient(0, 0, size * 0.05, 0, 0, R);
  sg.addColorStop(0, cs(P.base, 0.97));
  sg.addColorStop(0.52, cs(P.base, 0.97));
  sg.addColorStop(0.82, cs(P.shade, 0.95));
  sg.addColorStop(0.95, cs(P.light, 0.94));
  sg.addColorStop(1, cs(P.hi, 0.90));
  g.fillStyle = sg;
  g.fill();

  /* 右下压暗 + 内侧亮棱线 */
  g.save();
  polyPath(g, v);
  g.clip();
  iceShade(g, R, P, 0.38);
  g.restore();
  innerRim(g, v, size * 0.17, P, 0.8);

  /* 内嵌小雪花（转 30°） */
  const iv = starPts(R * 0.52, R * 0.16, 6, rot + Math.PI / 6);
  polyPath(g, iv);
  g.strokeStyle = cs(P.hi, 0.55);
  g.lineWidth = Math.max(0.6, size * 0.06);
  g.lineJoin = 'miter';
  g.stroke();

  /* 中心白核（收小一档）+ 一处碎冰闪点 */
  hotCore(g, size * 0.22, size * 0.22, P);
  glint(g, R * 0.42, -R * 0.36, size * 0.16, WHITE, 0.8);
}

/** ⑤ 激光段 → 冰晶光束（水平棱柱 + 贯穿亮芯） */
function buildBeam(g, size, P) {
  const L = size * LASER_L;
  const W = size * LASER_W;
  const pts = [
    [0, -L / 2],
    [W * 0.52, -L * 0.31],
    [W * 0.52, L * 0.31],
    [0, L / 2],
    [-W * 0.52, L * 0.31],
    [-W * 0.52, -L * 0.31],
  ];

  /* 深色描边 */
  polyPath(g, pts);
  g.strokeStyle = cs(P.edge, 0.95);
  g.lineWidth = size * 0.22;
  g.lineJoin = 'miter';
  g.miterLimit = 3;
  g.stroke();

  /* 棱柱横截面：上下深、中间亮 */
  polyPath(g, pts);
  const lg = g.createLinearGradient(0, -W * 0.55, 0, W * 0.55);
  lg.addColorStop(0, cs(P.deep, 0.95));
  lg.addColorStop(0.3, cs(P.base, 0.95));
  lg.addColorStop(0.5, cs(P.light, 0.96));
  lg.addColorStop(1, cs(P.deep, 0.95));
  g.fillStyle = lg;
  g.fill();

  /* 两条棱面反光：必须沿长轴（y）走，否则会变成横穿弹体、伸到外面的两条亮线 */
  g.strokeStyle = cs(P.hi, 0.55);
  g.lineWidth = Math.max(0.6, size * 0.06);
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * W * 0.26, -L * 0.30);
    g.lineTo(s * W * 0.26, L * 0.30);
    g.stroke();
  }

  /* 贯穿白热亮芯 */
  const cg = g.createLinearGradient(0, -W * 0.19, 0, W * 0.19);
  cg.addColorStop(0, cs(P.hi, 0.55));
  cg.addColorStop(0.5, 'rgba(255,255,255,1)');
  cg.addColorStop(1, cs(P.hi, 0.55));
  g.fillStyle = cg;
  polyPath(g, [
    [0, -L * 0.38],
    [W * 0.19, -L * 0.22],
    [W * 0.19, L * 0.22],
    [0, L * 0.38],
    [-W * 0.19, L * 0.22],
    [-W * 0.19, -L * 0.22],
  ]);
  g.fill();

  /* 端头亮斑 */
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (const s of [-1, 1]) {
    polyPath(g, [[0, s * L * 0.46], [W * 0.16, s * L * 0.34], [0, s * L * 0.24], [-W * 0.16, s * L * 0.34]]);
    g.fill();
  }
}

/** 本体精灵外接半径倍数（要装下弹体 + 描边 + 一层薄光晕） */
function bodyExt(type) {
  if (type === B_RICE) return 1.40;
  if (type === B_LASER) return 1.78;
  if (type === B_STAR) return 1.42;
  return 1.38;
}

function buildBody(type, color, size) {
  const ext = size * bodyExt(type);
  const dim = Math.ceil(ext * 2 * SS);
  const c = makeCanvas(dim, dim);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dim / (2 * SS);
  const P = palette(color);

  /* 柔光晕：最外层，alpha 很低，只交代「冰在发光」。
   * 小尺寸再压一档——16px 的弹幕外面裹一圈光晕就会变成「发光珍珠」。 */
  g.save();
  g.translate(cx, cx);
  const [hsx, hsy] = type === B_RICE ? [0.82, 1.14] : type === B_LASER ? [1.66, 0.85] : [1, 1];
  const hr = (ext * 0.97) / Math.max(hsx, hsy);
  const hk = size <= 7 ? 0.62 : 1;
  g.scale(hsx, hsy);
  const hg = g.createRadialGradient(0, 0, size * 0.6, 0, 0, hr);
  hg.addColorStop(0, cs(P.glow, 0.16 * hk));
  hg.addColorStop(0.45, cs(P.glow, 0.09 * hk));
  hg.addColorStop(0.78, cs(P.glow, 0.03 * hk));
  hg.addColorStop(1, cs(P.glow, 0));
  g.fillStyle = hg;
  g.beginPath();
  g.arc(0, 0, hr, 0, Math.PI * 2);
  g.fill();
  g.restore();

  /* 弹体 */
  g.save();
  g.translate(cx, cx);
  if (type === B_CIRCLE) buildGem(g, size, P);
  else if (type === B_RICE) buildShard(g, size, P);
  else if (type === B_BIG) buildBloom(g, size, P);
  else if (type === B_STAR) buildFlake(g, size, P);
  else buildBeam(g, size, P);
  g.restore();

  return c;
}

/* ---------------- 加法辉光精灵 ---------------- */

function buildGlow(color, size) {
  const ext = size * GLOW_EXT;
  const dim = Math.ceil(ext * 2 * SS);
  const c = makeCanvas(dim, dim);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dim / (2 * SS);
  const P = palette(color);

  g.save();
  g.translate(cx, cx);
  // 纯径向：这张精灵在 draw 里不旋转，保持旋转不变形；
  // 拉伸版光晕交给本体精灵（本体是跟着弹体一起转的）。
  const grad = g.createRadialGradient(0, 0, size * 0.5, 0, 0, ext);
  grad.addColorStop(0, cs(P.glow, 0.24));
  grad.addColorStop(0.28, cs(P.glow, 0.13));
  grad.addColorStop(0.6, cs(P.glow, 0.05));
  grad.addColorStop(0.84, cs(P.glow, 0.013));
  grad.addColorStop(1, cs(P.glow, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, ext, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return c;
}

function getSprites(type, color, size) {
  const key = `${type}|${color}|${size}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;

  // 超上限时只淘汰最旧的一条（Map 保插入序），不清空整张表：
  // 清空会造成「每帧重建几百张精灵」的卡顿，逐条淘汰则始终保留热变体。
  if (spriteCache.size >= CACHE_LIMIT) {
    const oldest = spriteCache.keys().next().value;
    if (oldest !== undefined) spriteCache.delete(oldest);
  }

  const body = buildBody(type, color, size);
  const glow = buildGlow(color, size);
  const s = {
    body, glow,
    w: body.width / SS,
    gw: glow.width / SS,
  };
  spriteCache.set(key, s);
  return s;
}

/* ---------------- 空闲预热 ---------------- */

/** 关卡 / Boss 里出现频率最高的弹幕颜色（粗取样后刻意保留冷暖各几支） */
const PREWARM_COLORS = [
  '#ffffff', '#ffd23f', '#ff5ea8', '#6ee7ff',
  '#ff4d6a', '#ff8fa8', '#ffe9b0', '#bfeaff',
];
/** 常见判定半径（实际 draw 会 round 到整数，这里只烤整数档） */
const PREWARM_SIZES = [4, 5, 6, 7, 8];

/**
 * 空闲预热精灵缓存：把最常见的 (类型, 颜色, 尺寸) 变体提前烘焙。
 *
 * 首次遇到新变体时要在主线程里烤两张渐变画布（实测约 0.06ms/张），
 * 一帧里突然冒出几十个新变体就会顶出一次长帧。提前在标题 / 进关的空闲帧里
 * 付掉这笔钱，budgetMs 之外的留给下一次空闲继续。
 * @param {{types?:number[],colors?:string[],sizes?:number[],budgetMs?:number}} [opts]
 * @returns {{baked:number,done:boolean}} baked=本次新烤数量，done=是否已经全烤完
 */
export function prewarmSpriteCache(opts = {}) {
  const types = opts.types || [B_CIRCLE, B_RICE, B_BIG, B_STAR, B_LASER];
  const colors = opts.colors || PREWARM_COLORS;
  const sizes = opts.sizes || PREWARM_SIZES;
  const budget = Number.isFinite(opts.budgetMs) ? opts.budgetMs : 4;
  const total = types.length * colors.length * sizes.length;
  let baked = 0;
  let seen = 0;

  const t0 = performance.now();
  for (const type of types) {
    for (const color of colors) {
      for (const size of sizes) {
        seen++;
        const key = `${type}|${color}|${size}`;
        if (spriteCache.has(key)) continue;
        getSprites(type, color, size);
        baked++;
        if (performance.now() - t0 >= budget) {
          return { baked, done: seen >= total };
        }
      }
    }
  }
  return { baked, done: true };
}

/* ---------------- 弹幕池 ---------------- */

function makeBullet() {
  return {
    active: false,
    type: B_CIRCLE,
    color: '#ff5ea8',
    r: 6,
    x: 0, y: 0,
    vx: 0, vy: 0,
    ax: 0, ay: 0,
    life: 0, maxLife: 6,
    rot: 0, spin: 0,
    wobbleAmp: 0, wobbleFreq: 0, wobblePhase: 0,
    grazed: false,
    homing: 0,
    damage: 1,
    pierce: false,
    spawnT: 0,
    accel: 0,
    turn: 0,
    scaleIn: 0.12,
    _spr: null,
    _sprKey: '',
  };
}

export class BulletPool {
  constructor(max = MAX_BULLETS) {
    this.max = max;
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = makeBullet();
    this.activeCount = 0;
    this.cursor = 0;
    this.grazeCount = 0;
  }

  _take() {
    const pool = this.pool;
    for (let n = 0; n < this.max; n++) {
      const idx = (this.cursor + n) % this.max;
      const b = pool[idx];
      if (!b.active) {
        this.cursor = (idx + 1) % this.max;
        return b;
      }
    }
    // 满了就抢最老的
    const b = pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    return b;
  }

  /**
   * 发射一颗弹幕
   * @param {object} o
   * @param {number} o.x
   * @param {number} o.y
   * @param {number} o.vx
   * @param {number} o.vy
   * @param {number} [o.r=6]        半径（视觉与判定共用）
   * @param {string} [o.color]
   * @param {number} [o.type]
   * @param {number} [o.life=7]
   * @param {number} [o.accel]      沿速度方向的加速度
   * @param {number} [o.turn]       每帧转向率（弧度/秒）
   * @param {number} [o.spin]       自转
   * @param {number} [o.wobbleAmp]  横向摆动幅度
   * @param {number} [o.wobbleFreq]
   * @param {number} [o.grazable]
   */
  spawn(o) {
    const b = this._take();
    if (!b.active) this.activeCount++;
    b.active = true;
    b.type = o.type || B_CIRCLE;
    b.color = o.color || '#ff5ea8';
    b.r = o.r || 6;
    b.x = o.x; b.y = o.y;
    b.vx = o.vx || 0; b.vy = o.vy || 0;
    b.ax = 0; b.ay = 0; b.accel = o.accel || 0;
    b.turn = o.turn || 0;
    b.life = o.life || 7;
    b.maxLife = b.life;
    b.rot = o.rot !== undefined ? o.rot : 0;
    b.spin = o.spin || 0;
    b.wobbleAmp = o.wobbleAmp || 0;
    b.wobbleFreq = o.wobbleFreq || 3;
    b.wobblePhase = 0;
    b.grazed = false;
    b.homing = o.homing || 0;
    b.damage = o.damage || 1;
    b.pierce = !!o.pierce;
    b.spawnT = 0;
    b.scaleIn = o.scaleIn !== undefined ? o.scaleIn : 0.12;
    b._spr = null;
    b._sprKey = b.type + '|' + b.color + '|' + Math.round(b.r);
    return b;
  }

  /** 圆形范围发射：一圈 n 发 */
  ring(x, y, n, speed, o = {}) {
    const base = o.angle || 0;
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2;
      this.spawn({
        ...o,
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
      });
    }
  }

  /** 扇形发射 */
  fan(x, y, n, spread, angle, speed, o = {}) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
      const a = angle + t * spread;
      this.spawn({ ...o, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
    }
  }

  /** 朝目标瞄准发射 */
  aimed(x, y, tx, ty, speed, o = {}) {
    const a = Math.atan2(ty - y, tx - x);
    this.spawn({ ...o, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
  }

  /** 螺旋发射（连续调用，由外部计时） */
  spiral(x, y, angle, speed, o = {}) {
    this.spawn({ ...o, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  }

  clear() {
    for (let i = 0; i < this.max; i++) this.pool[i].active = false;
    this.activeCount = 0;
  }

  /**
   * 更新所有弹幕
   * @param {number} dt
   * @param {{x:number,y:number,r:number}|null} target 玩家判定圆心（用于追踪弹）
   * @param {{x:number,y:number,w:number,h:number}} bounds 世界边界
   */
  update(dt, target, bounds) {
    const pool = this.pool;
    const bx0 = bounds ? bounds.x - 200 : -1e9;
    const bx1 = bounds ? bounds.x + bounds.w + 200 : 1e9;
    const by0 = bounds ? bounds.y - 200 : -1e9;
    const by1 = bounds ? bounds.y + bounds.h + 200 : 1e9;

    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;

      b.life -= dt;
      b.spawnT += dt;
      if (b.life <= 0) { b.active = false; if (this.activeCount > 0) this.activeCount--; continue; }

      if (b.homing > 0 && target) {
        b.homing -= dt;
        const dx = target.x - b.x;
        const dy = target.y - b.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const wantX = (dx / dist) * sp;
        const wantY = (dy / dist) * sp;
        const k = Math.min(1, dt * 2.6);
        b.vx += (wantX - b.vx) * k;
        b.vy += (wantY - b.vy) * k;
      }

      if (b.turn) {
        const cos = Math.cos(b.turn * dt);
        const sin = Math.sin(b.turn * dt);
        const nvx = b.vx * cos - b.vy * sin;
        const nvy = b.vx * sin + b.vy * cos;
        b.vx = nvx; b.vy = nvy;
      }

      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        b.vx += (b.vx / sp) * b.accel * dt;
        b.vy += (b.vy / sp) * b.accel * dt;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.wobbleAmp) {
        b.wobblePhase += b.wobbleFreq * dt;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const nx = -b.vy / sp;
        const ny = b.vx / sp;
        const off = Math.sin(b.wobblePhase) * b.wobbleAmp * dt;
        b.x += nx * off;
        b.y += ny * off;
      }

      b.rot += b.spin * dt;

      if (b.x < bx0 || b.x > bx1 || b.y < by0 || b.y > by1) {
        b.active = false;
        if (this.activeCount > 0) this.activeCount--;
      }
    }
  }

  /**
   * 与玩家判定圆碰撞检测
   * @returns {object|null} 命中的弹幕
   */
  hitTest(px, py, pr) {
    const pool = this.pool;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;
      const dx = b.x - px;
      const dy = b.y - py;
      const rr = b.r * 0.72 + pr;
      if (dx * dx + dy * dy <= rr * rr) return b;
    }
    return null;
  }

  /** 擦弹检测（靠近但未命中） */
  grazeTest(px, py, pr, grazeR) {
    const pool = this.pool;
    let n = 0;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active || b.grazed) continue;
      const dx = b.x - px;
      const dy = b.y - py;
      const d2 = dx * dx + dy * dy;
      const rr = b.r * 0.72 + pr;
      if (d2 > rr * rr && d2 < (grazeR + b.r) * (grazeR + b.r)) {
        b.grazed = true;
        n++;
      }
    }
    this.grazeCount += n;
    return n;
  }

  /** 清除半径内的弹幕，返回清除数量 */
  clearArea(x, y, r) {
    const pool = this.pool;
    let n = 0;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      if (dx * dx + dy * dy <= (r + b.r) * (r + b.r)) {
        b.active = false;
        n++;
      }
    }
    if (this.activeCount > 0) this.activeCount = Math.max(0, this.activeCount - n);
    return n;
  }

  draw(ctx, cam) {
    const pool = this.pool;
    // 低负载时才叠这一层：加法辉光最贵也最出效果，峰值 1000+ 时自动关掉
    const withGlow = this.activeCount <= GLOW_MAX;

    ctx.save();

    /* ---------- 第一层：快速弹短拖尾 + 加法辉光 ---------- */
    if (withGlow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.80;
      for (let i = 0; i < pool.length; i++) {
        const b = pool[i];
        if (!b.active) continue;
        if (cam) {
          const sx = b.x - cam.x;
          const sy = b.y - cam.y;
          if (sx < -100 || sx > 1380 || sy < -100 || sy > 820) continue;
        }
        const S = this._getSpr(b);
        const pop = this._pop(b);
        const wg = S.gw * pop;
        const hg = wg * 0.5;

        // 快弹短拖尾：沿速度方向叠 2 帧本体精灵（不同位置复用同一张图，不新建渐变）
        const sp2 = b.vx * b.vx + b.vy * b.vy;
        if (sp2 > 90000) { // 300px/s 以上
          const sp = Math.sqrt(sp2);
          const ux = b.vx / sp;
          const uy = b.vy / sp;
          const wb = S.w * VIS * pop;
          const rotated = b.type === B_RICE || b.type === B_STAR || b.type === B_LASER;
          for (let t = 1; t <= 2; t++) {
            const off = b.r * VIS * 0.62 * t;   // 0.62r / 1.24r ≈ 拖尾长 1.2r
            const tw = wb * (t === 1 ? 0.86 : 0.72);
            const th = tw * 0.5;
            const px = b.x - ux * off;
            const py = b.y - uy * off;
            ctx.globalAlpha = t === 1 ? 0.30 : 0.13;
            if (rotated) {
              ctx.save();
              ctx.translate(px, py);
              ctx.rotate(b.rot);
              ctx.drawImage(S.body, -th, -th, tw, tw);
              ctx.restore();
            } else {
              ctx.drawImage(S.body, px - th, py - th, tw, tw);
            }
          }
          ctx.globalAlpha = 0.80;
        }

        // 辉光压在本体下面、拖尾上面：本体能压得住，光又不抢戏
        ctx.drawImage(S.glow, b.x - hg, b.y - hg, wg, wg);
      }
    }

    /* ---------- 第二层：本体（白热核心 / 主题色 / 深色描边） ---------- */
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;
      if (cam) {
        const sx = b.x - cam.x;
        const sy = b.y - cam.y;
        if (sx < -100 || sx > 1380 || sy < -100 || sy > 820) continue;
      }
      const S = this._getSpr(b);
      // VIS：绘制尺寸 = 判定半径 × 1.16，剪影描边外沿正好落在 1.30r。
      // 判定（hitTest/grazeTest/clearArea）读的是 b.r，一个字都没动。
      const w = S.w * VIS * this._pop(b);
      const hw = w * 0.5;

      if (b.type === B_RICE || b.type === B_STAR || b.type === B_LASER || b.type === B_BIG) {
        // 大玉即使 spin 为 0 也让它缓慢自转，内层纹理才会有能量流动感
        const rot = b.type === B_BIG ? b.rot + b.spawnT * 0.85 : b.rot;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(rot);
        ctx.drawImage(S.body, -hw, -hw, w, w);
        ctx.restore();
      } else {
        ctx.drawImage(S.body, b.x - hw, b.y - hw, w, w);
      }
    }

    ctx.restore();
  }

  /** 出生缩放：0.08s 内从小弹到满，让弹幕「生」出来而不是硬闪 */
  _pop(b) {
    const t = b.spawnT;
    if (t >= 0.08) return 1;
    const k = t / 0.08;
    return 0.66 + 0.34 * (k * (2 - k));
  }

  _getSpr(b) {
    const sizeKey = Math.max(2, Math.round(b.r));
    const key = b.type + '|' + b.color + '|' + sizeKey;
    let S = b._spr;
    if (!S || b._sprKey !== key) {
      S = getSprites(b.type, b.color, sizeKey);
      b._spr = S;
      b._sprKey = key;
    }
    return S;
  }

  /** 统计当前活跃弹幕数（调试用） */
  count() {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) if (this.pool[i].active) n++;
    return n;
  }
}
