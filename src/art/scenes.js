/**
 * 场景美术：天空 / 三层视差 / 地形瓦片 / 环境粒子
 * ------------------------------------------------------------------
 * 《东方新纪行》—— 1280x720 逻辑分辨率，纯 Canvas2D 程序化矢量绘制，零依赖。
 *
 * 设计要点：
 *  1. 七套主题共享同一套绘制骨架，每套有独立的天空渐变、天体、视差剪影、
 *     地形配色与环境粒子，气质差异靠"配色 + 剪影元素 + 粒子行为"三者共同建立。
 *  2. 所有粒子 / 视差元素都由下标哈希派生，纯确定性，绝不调用 Math.random，
 *     所以暂停、回放、低帧率时都不会闪烁。
 *  3. drawTiles 只遍历相机可见范围（约 42x24 个），单瓦片控制在 ~10 次路径操作内，
 *     不使用 shadowBlur，也不在瓦片里创建渐变（渐变只出现在天空 / 视差层）。
 *  4. 每个导出函数都在 save()/restore() 内完成，不污染调用方状态。
 *
 * 坐标：cam.x / cam.y 为相机左上角的世界坐标；屏幕坐标 = 世界坐标 - cam。
 */

const VIEW_W = 1280;
const VIEW_H = 720;
const T = 32;          // 与 level.js 保持一致（自包含，不 import）
const TAU = Math.PI * 2;

/* 瓦片类型（与 level.js 的常量数值一致） */
const EMPTY = 0;
const SOLID = 1;
const GRASS = 2;
const BRICK = 3;
const PLATFORM = 4;
const SPIKE = 5;
const ICE = 6;
const MUSHROOM = 7;
const WATER = 8;
const VINE = 9;

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

/** 整数哈希 -> [0,1)：同一下标每帧结果完全一致 */
function hash1(n) {
  let x = n | 0;
  x = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** 小型确定性随机数发生器（用于一次性生成剪影造型） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

const _mixCache = new Map();
/** 两色线性混合，结果缓存（颜色计算量很小，但可以省点 GC） */
function mix(a, b, t) {
  const tt = clamp(t, 0, 1);
  const key = a + '|' + b + '|' + tt.toFixed(3);
  let v = _mixCache.get(key);
  if (v) return v;
  if (_mixCache.size > 900) _mixCache.clear();
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(lerp(ca[0], cb[0], tt));
  const g = Math.round(lerp(ca[1], cb[1], tt));
  const bl = Math.round(lerp(ca[2], cb[2], tt));
  v = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  _mixCache.set(key, v);
  return v;
}

const _rgbaCache = new Map();
/** hex + 透明度 -> rgba 字符串（带缓存） */
function rgba(hex, a) {
  const alpha = clamp(a, 0, 1);
  const key = hex + '|' + alpha.toFixed(2);
  let v = _rgbaCache.get(key);
  if (v) return v;
  if (_rgbaCache.size > 900) _rgbaCache.clear();
  const c = hexToRgb(hex);
  v = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  _rgbaCache.set(key, v);
  return v;
}

/**
 * 柔光精灵：把径向渐变预先烘焙成小画布并按颜色缓存。
 * 云、雾、辉光、萤火都复用它们，避免每帧创建大量渐变对象。
 */
const _glowCache = new Map();
function glowSprite(color) {
  if (typeof document === 'undefined') return null;
  let c = _glowCache.get(color);
  if (c) return c;
  if (_glowCache.size > 24) _glowCache.clear();
  const S = 128;
  c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, rgba(color, 1));
  grd.addColorStop(0.32, rgba(color, 0.5));
  grd.addColorStop(0.68, rgba(color, 0.12));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  _glowCache.set(color, c);
  return c;
}

/** 画一团柔光。add=true 时用 lighter 叠加，适合月光 / 萤火 / 雾 */
function glow(ctx, x, y, rx, ry, color, alpha, add) {
  const sp = glowSprite(color);
  if (!sp) return;
  ctx.save();
  if (add !== false) ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.drawImage(sp, x - rx, y - ry, rx * 2, ry * 2);
  ctx.restore();
}

/** 平滑折线（二次贝塞尔穿过中点），用于山脊 / 丘陵轮廓 */
function traceSmooth(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  if (!n) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (n === 2) {
    ctx.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const xc = (pts[i][0] + pts[i + 1][0]) * 0.5;
    const yc = (pts[i][1] + pts[i + 1][1]) * 0.5;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], xc, yc);
  }
  ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
}

/** 折线（保留硬角），用于尖峰、建筑 */
function traceLine(ctx, pts) {
  ctx.beginPath();
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

/**
 * 把一条从左到右的天际线补成闭合多边形并做垂直渐变填充。
 * @param {number} yTop 渐变起点
 * @param {number} yBot 渐变终点（一般 760）
 */
function fillSkylineGrad(ctx, pts, yTop, yBot, cTop, cBot) {
  if (pts.length < 2) return;
  traceSmooth(ctx, pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  ctx.lineTo(last[0], yBot);
  ctx.lineTo(first[0], yBot);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, cTop);
  g.addColorStop(1, cBot);
  ctx.fillStyle = g;
  ctx.fill();
}

/** 同上，但保留硬角（尖峰） */
function fillPeaksGrad(ctx, pts, yTop, yBot, cTop, cBot) {
  if (pts.length < 2) return;
  traceLine(ctx, pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  ctx.lineTo(last[0], yBot);
  ctx.lineTo(first[0], yBot);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, cTop);
  g.addColorStop(1, cBot);
  ctx.fillStyle = g;
  ctx.fill();
}

/** 平行重复绘制两遍（周期 >= 1280，两遍足够铺满屏幕） */
function repeatX(period, ox, fn) {
  fn(ox);
  fn(ox + period);
}

/* ------------------------------------------------------------------ */
/* 主题表                                                              */
/* ------------------------------------------------------------------ */

/**
 * 每套主题字段：
 *   sky       天空三元渐变
 *   accent    点缀色（花瓣 / 萤火 / 新月辉光等）
 *   far/mid/near  三层视差基色
 *   glow      天体与灯光辉光色
 *   haze      低空雾气 / 地平线霞光
 *   cloud     云带颜色
 *   stars     星星数量（0 = 不画）
 *   celestial 天体 { kind, x, y, r, color, core }
 *   ground    草皮上的小点缀类型
 *   tile      地形配色
 */
export const THEMES = {
  shrine: {
    name: '博丽神社 · 黄昏樱',
    sky: ['#100a1e', '#3c1631', '#b2544a'],
    accent: '#ff9ecb',
    far: '#1d1024',
    mid: '#150a18',
    near: '#0a040d',
    glow: '#ffb070',
    haze: '#d08a78',
    cloud: '#b4646a',
    clouds: 7,
    stars: 34,
    celestial: { kind: 'sun', x: 962, y: 372, r: 78, color: '#ffb877', core: '#fff0cc' },
    ground: 'petal',
    tile: {
      soil: '#452c22', soilDark: '#26160f', soilLight: '#6e4630', pebble: '#8a6448',
      grass: '#8fa63f', grassDark: '#4a5824', grassLight: '#cad874', grassTip: '#f2e79c',
      brick: '#8a7264', brickDark: '#584438', brickLight: '#a8917e',
      wood: '#8a5a3c', woodDark: '#553322', woodLight: '#b7845c',
      ice: '#a9d6e0', iceLight: '#e8fbff', iceDark: '#6fa6b8',
      water: '#537d99', waterLight: '#a8d8e8', waterDark: '#2f4a5e',
      cap: '#d64a5a', capDark: '#8c2434', stem: '#e8dccb',
      spike: '#c9b9a6', spikeDark: '#7e6c5e',
      vine: '#3f5a34', leaf: '#7fa04e',
    },
  },

  forest: {
    name: '魔法森林 · 萤火夜雾',
    sky: ['#050f0d', '#0b2019', '#1c3a2c'],
    accent: '#d9f56e',
    far: '#0a1a15',
    mid: '#0c241c',
    near: '#04100c',
    glow: '#9fe86a',
    haze: '#2f6b52',
    cloud: '#173a2e',
    clouds: 4,
    stars: 120,
    celestial: { kind: 'moon', x: 300, y: 132, r: 40, color: '#dff5c0', core: '#f6ffe8' },
    ground: 'spore',
    tile: {
      soil: '#26301f', soilDark: '#151b11', soilLight: '#3a4630', pebble: '#556047',
      grass: '#4f7a3a', grassDark: '#2e4a26', grassLight: '#7fae4e', grassTip: '#b6d96a',
      brick: '#3c4638', brickDark: '#232b22', brickLight: '#56624f',
      wood: '#4a3a28', woodDark: '#2a2016', woodLight: '#6d5638',
      ice: '#8cc6bd', iceLight: '#d8f7ee', iceDark: '#4f8a84',
      water: '#3f6b5e', waterLight: '#7fbcae', waterDark: '#244238',
      cap: '#c0473f', capDark: '#7a2620', stem: '#d8cdb8',
      spike: '#a8b09a', spikeDark: '#5f6a58',
      vine: '#2f4a28', leaf: '#5c8a3a',
    },
  },

  lake: {
    name: '雾之湖 · 冰蓝晨曦',
    sky: ['#0a1622', '#24445c', '#9fc3cf'],
    accent: '#c6f2ff',
    far: '#2c4557',
    mid: '#1b3042',
    near: '#0c1922',
    glow: '#eaf9ff',
    haze: '#a8cad6',
    cloud: '#cfe6ec',
    clouds: 6,
    stars: 96,
    celestial: { kind: 'moon', x: 942, y: 168, r: 62, color: '#eafcff', core: '#ffffff' },
    ground: 'frost',
    tile: {
      soil: '#33454f', soilDark: '#1e2b31', soilLight: '#4a606c', pebble: '#6d8691',
      grass: '#6f9a8e', grassDark: '#42655c', grassLight: '#a5c9bd', grassTip: '#d8f2e8',
      brick: '#5a7080', brickDark: '#36474f', brickLight: '#7d94a4',
      wood: '#6a5a4a', woodDark: '#40362c', woodLight: '#8d7862',
      ice: '#bfe6f2', iceLight: '#f2fdff', iceDark: '#7fb3c6',
      water: '#4c7f9c', waterLight: '#a9dcef', waterDark: '#2b4f66',
      cap: '#c8556a', capDark: '#7d2c3d', stem: '#e6e2d8',
      spike: '#c4d8de', spikeDark: '#78939e',
      vine: '#33524a', leaf: '#6f9e88',
    },
  },

  mountain: {
    name: '妖怪之山 · 瀑布溪谷',
    sky: ['#16222c', '#40596a', '#b9ced2'],
    accent: '#d6ffe8',
    far: '#4b6577',
    mid: '#2b4149',
    near: '#131f1e',
    glow: '#fff3d8',
    haze: '#a9c3c9',
    cloud: '#e2eef0',
    clouds: 9,
    stars: 18,
    celestial: { kind: 'sun', x: 318, y: 128, r: 52, color: '#fff0c4', core: '#ffffff' },
    ground: 'moss',
    tile: {
      soil: '#3b4038', soilDark: '#24271f', soilLight: '#555c4f', pebble: '#79806e',
      grass: '#617f4a', grassDark: '#3d5430', grassLight: '#8fb064', grassTip: '#cfe0a0',
      brick: '#6a6a60', brickDark: '#42423b', brickLight: '#8d8d80',
      wood: '#5f4a34', woodDark: '#392a1d', woodLight: '#82684a',
      ice: '#c6e2ea', iceLight: '#f0fbff', iceDark: '#84a8b4',
      water: '#52788a', waterLight: '#a5c9d6', waterDark: '#2f4d5c',
      cap: '#b85048', capDark: '#732923', stem: '#ddd6c4',
      spike: '#b6b6a6', spikeDark: '#6d6d60',
      vine: '#3d5236', leaf: '#6f9150',
    },
  },

  nether: {
    name: '白玉楼 · 冥界花海',
    sky: ['#0b0410', '#241032', '#582a5a'],
    accent: '#ff7aa8',
    far: '#2c1434',
    mid: '#190b22',
    near: '#08030e',
    glow: '#efe2ff',
    haze: '#8a5a9a',
    cloud: '#5a3a6a',
    clouds: 5,
    stars: 90,
    celestial: { kind: 'moon', x: 902, y: 176, r: 88, color: '#f2e6ff', core: '#fffaff' },
    ground: 'soul',
    tile: {
      soil: '#2a1a2e', soilDark: '#180d1b', soilLight: '#3d2942', pebble: '#5a4160',
      grass: '#6f4a72', grassDark: '#43294a', grassLight: '#9a6f9c', grassTip: '#d9a8d0',
      brick: '#4a3350', brickDark: '#2c1d31', brickLight: '#6a4d72',
      wood: '#4a2a38', woodDark: '#2a1520', woodLight: '#70445a',
      ice: '#c9b8e8', iceLight: '#f0e8ff', iceDark: '#8a74ad',
      water: '#4a3a6a', waterLight: '#9a86c9', waterDark: '#2a1b40',
      cap: '#b03a5a', capDark: '#6a1c33', stem: '#e0d4dc',
      spike: '#b9a8c6', spikeDark: '#6f5c80',
      vine: '#3a2a48', leaf: '#7a5a8a',
    },
  },

  moon: {
    name: '月都 · 永远亭',
    sky: ['#040814', '#0e1830', '#2b3a68'],
    accent: '#eaf2ff',
    far: '#3b4c7c',
    mid: '#1f2b4d',
    near: '#0a1024',
    glow: '#fff6dc',
    haze: '#8ea0cf',
    cloud: '#8ea0cf',
    clouds: 4,
    stars: 150,
    celestial: { kind: 'moon', x: 640, y: 196, r: 138, color: '#fffbe8', core: '#ffffff' },
    ground: 'dew',
    tile: {
      soil: '#2c3448', soilDark: '#191e2b', soilLight: '#414c64', pebble: '#66738c',
      grass: '#4f7a6a', grassDark: '#2f5045', grassLight: '#7fb09a', grassTip: '#c6ecd8',
      brick: '#4c5a78', brickDark: '#2c374a', brickLight: '#6d7d9c',
      wood: '#5a5040', woodDark: '#332d24', woodLight: '#7d7058',
      ice: '#d4e8f5', iceLight: '#ffffff', iceDark: '#94b4cc',
      water: '#4a6a9c', waterLight: '#a5c6ea', waterDark: '#2a3f63',
      cap: '#b04a68', capDark: '#70283f', stem: '#e4e4e8',
      spike: '#c8d2de', spikeDark: '#7a8898',
      vine: '#384a3a', leaf: '#6f9a7a',
    },
  },

  mansion: {
    name: '红魔馆地下 · 血月水晶',
    sky: ['#0e0308', '#2b0714', '#5e1024'],
    accent: '#ff4a63',
    far: '#2b0a18',
    mid: '#1a0610',
    near: '#090205',
    glow: '#ff3148',
    haze: '#7d1128',
    cloud: '#5a1020',
    clouds: 6,
    stars: 42,
    celestial: { kind: 'bloodmoon', x: 954, y: 186, r: 92, color: '#ff3a4e', core: '#ffd0c0' },
    ground: 'ember',
    tile: {
      soil: '#3a2026', soilDark: '#211014', soilLight: '#54303a', pebble: '#78464e',
      grass: '#7a2e3a', grassDark: '#4a1622', grassLight: '#a54a56', grassTip: '#d4808a',
      brick: '#5a2a34', brickDark: '#351720', brickLight: '#7d3e4a',
      wood: '#4a2830', woodDark: '#281218', woodLight: '#6e3f48',
      ice: '#c8a8d8', iceLight: '#f4e6ff', iceDark: '#8a5f9c',
      water: '#5c2a3f', waterLight: '#b05a76', waterDark: '#33131f',
      cap: '#d63a4a', capDark: '#8a1622', stem: '#d8c8cc',
      spike: '#b89aa2', spikeDark: '#6d4a52',
      vine: '#3a1a24', leaf: '#7a2f3f',
    },
  },
};

const THEME_KEYS = Object.keys(THEMES);
const DEFAULT_THEME = 'shrine';

function themeKey(name) {
  return THEMES[name] ? name : DEFAULT_THEME;
}

function themeOf(name) {
  return THEMES[themeKey(name)] || THEMES[DEFAULT_THEME];
}

function camOf(cam) {
  return cam && typeof cam.x === 'number'
    ? cam
    : { x: 0, y: 0 };
}

/* ------------------------------------------------------------------ */
/* 天空：渐变 + 星空 + 天体 + 云带 + 地平线霞光                        */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* 预渲染缓存：离屏 canvas / 渐变 / 噪点 / 雾团                         */
/* ------------------------------------------------------------------ */

function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

const _spriteCache = new Map();
/**
 * 按 key 预渲染一张离屏 canvas：复杂细节只画一次，运行时只 drawImage。
 * key 必须包含所有影响像素的参数（主题 / 变体 / 颜色）。
 */
function sprite(key, w, h, paint) {
  let cv = _spriteCache.get(key);
  if (cv) {
    // 命中后移到队尾：LRU 只淘汰真正冷的贴图，不做整表 clear()
    _spriteCache.delete(key);
    _spriteCache.set(key, cv);
    return cv;
  }
  cv = makeCanvas(w, h);
  if (!cv) return null;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.save();
  paint(g, cv.width, cv.height);
  g.restore();
  // 旧实现「超过 200 就 clear()」，一旦键数逼近上限会每帧把整套云/雾/树贴图重烘一遍；
  // 这里改为只淘汰最旧的若干张，保证常用贴图常驻。
  _spriteCache.set(key, cv);
  if (_spriteCache.size > 200) {
    const it = _spriteCache.keys();
    for (let i = 0; i < 24; i++) {
      const n = it.next();
      if (n.done) break;
      _spriteCache.delete(n.value);
    }
  }
  return cv;
}

const _gradCache = new Map();
/** 纵向渐变缓存（同一主题同一用途只创建一次渐变对象） */
function vGrad(ctx, y0, y1, stops, key) {
  let g = _gradCache.get(key);
  if (g) return g;
  const gg = ctx.createLinearGradient(0, y0, 0, y1);
  for (let i = 0; i < stops.length; i++) gg.addColorStop(stops[i][0], stops[i][1]);
  if (_gradCache.size > 80) _gradCache.clear();
  _gradCache.set(key, gg);
  return gg;
}

/** 细噪点图块：叠在大面积渐变上打散色带（屏幕空间平铺，不随相机移动） */
function grainSprite() {
  const S = 96;
  return sprite('grain', S, S, (g) => {
    for (let i = 0; i < 1100; i++) {
      const hx = hash1(i * 31 + 7);
      const hy = hash1(i * 79 + 13);
      const hs = hash1(i * 17 + 3);
      g.globalAlpha = 0.05 + hs * 0.12;
      g.fillStyle = hs > 0.5 ? '#ffffff' : '#000000';
      g.fillRect((hx * S) | 0, (hy * S) | 0, 1, 1);
    }
  });
}

const _patternCache = new Map();
function grainPattern(ctx) {
  let p = _patternCache.get('grain');
  if (p) return p;
  const s = grainSprite();
  if (!s || !ctx.createPattern) return null;
  p = ctx.createPattern(s, 'repeat');
  _patternCache.set('grain', p);
  return p;
}

/**
 * 云团精灵：一堆柔光斑叠出有体积的云。
 * 所有光斑中心留在 [0.15,0.85]，保证贴图边缘透明、平铺不出直线接缝。
 */
function cloudSprite(color, variant) {
  const W = 320;
  const H = 96;
  // 水墨式卷云：拉长的细椭圆 + 几条扫笔，不再是一团团圆气云朵
  return sprite('cloud:' + color + ':' + variant, W, H, (g) => {
    const r = mulberry32(900 + variant * 131);
    const streaks = 5 + variant * 2;
    for (let i = 0; i < streaks; i++) {
      const u = (i + 0.5) / streaks;
      const cx = W * (0.2 + 0.6 * u) + (r() - 0.5) * W * 0.05;
      const cy = H * (0.42 + (r() - 0.5) * 0.24);
      const rx = W * (0.11 + r() * 0.08);
      const ry = H * (0.035 + r() * 0.045);
      const rot = -0.05 + (r() - 0.5) * 0.1;
      const grd = g.createLinearGradient(cx - rx, cy, cx + rx, cy);
      grd.addColorStop(0, rgba(color, 0));
      grd.addColorStop(0.42, rgba(color, 0.26 + r() * 0.12));
      grd.addColorStop(0.62, rgba(color, 0.3 + r() * 0.12));
      grd.addColorStop(1, rgba(color, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, rot, 0, TAU);
      g.fill();
    }
    // 少量飞白，让云有笔触边缘
    for (let i = 0; i < 9; i++) {
      const cx = W * (0.16 + r() * 0.68);
      const cy = H * (0.36 + r() * 0.3);
      const rx = W * (0.03 + r() * 0.06);
      g.fillStyle = rgba(color, 0.08 + r() * 0.12);
      g.beginPath();
      g.ellipse(cx, cy, rx, H * (0.02 + r() * 0.02), -0.08, 0, TAU);
      g.fill();
    }
  });
}

/** 横向雾带精灵：边缘完全透明，可无缝平铺 */
function mistSprite(color, variant) {
  const W = 512;
  const H = 128;
  return sprite('mist:' + color + ':' + variant, W, H, (g) => {
    const r = mulberry32(200 + variant * 77);
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5) / 8;
      const cx = W * (0.18 + 0.64 * u) + (r() - 0.5) * 18;
      const cy = H * (0.52 + (r() - 0.5) * 0.22);
      const rx = W * (0.075 + r() * 0.05);
      const ry = H * (0.16 + r() * 0.1);
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grd.addColorStop(0, rgba(color, 0.42));
      grd.addColorStop(0.55, rgba(color, 0.14));
      grd.addColorStop(1, rgba(color, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      g.fill();
    }
  });
}

/** 暗角：压住四角，把视线收进画面中心 */
function vignetteSprite() {
  return sprite('vignette', 320, 180, (g, w, h) => {
    const grd = g.createRadialGradient(w * 0.5, h * 0.47, h * 0.16, w * 0.5, h * 0.47, h * 0.95);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.09)');
    grd.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

/**
 * 蓬松的树冠 / 花冠：先铺暗团块定轮廓，再叠中调与受光碎团，
 * 让剪影边缘是碎叶而不是几个光滑的大椭圆。
 */
function drawCanopy(ctx, cx, cy, w, h, base, mid, rim, seed, lightX) {
  const r = mulberry32((seed * 1e9) | 0);
  const lx = lightX === undefined ? 0.18 : lightX;
  const minWH = Math.min(w, h);
  // 调用方可能传 rgba() 字符串，暗化时不能直接喂给 mix()
  const darken = (col, k) => (col.charAt(0) === '#' ? mix(col, '#04040a', k) : col);
  // 叶团互相重叠并成一个实心剪影：先保证没有空隙，再谈层次
  const blob = (col, sc, ox, oy, count, sizeK) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = r() * TAU;
      const rad = Math.sqrt(r());
      const ex = cx + Math.cos(a) * rad * w * sc + ox;
      const ey = cy + Math.sin(a) * rad * h * sc + oy;
      const er = Math.max(3.5, minWH * (sizeK + r() * 0.1) * sc);
      ctx.moveTo(ex + er, ey);
      ctx.ellipse(ex, ey, er, er * (0.72 + r() * 0.36), (r() - 0.5) * 0.8, 0, TAU);
    }
    ctx.fill();
  };
  // 1) 剪影（故意压到比天空暗很多，保住剪影轮廓）
  blob(darken(base, 0.34), 1, -lx * w * 0.1, h * 0.14, 30, 0.3);
  // 2) 外圈碎叶：破掉规则的圆形轮廓
  const edgeCol = darken(base, 0.34);
  ctx.fillStyle = edgeCol;
  ctx.beginPath();
  for (let i = 0; i < 18; i++) {
    const a = r() * TAU;
    const ex = cx + Math.cos(a) * w * (0.9 + r() * 0.2);
    const ey = cy + Math.sin(a) * h * (0.86 + r() * 0.26) + h * 0.1;
    const er = Math.max(2.6, minWH * (0.12 + r() * 0.1));
    ctx.moveTo(ex + er, ey);
    ctx.ellipse(ex, ey, er, er * 0.82, r() * TAU, 0, TAU);
  }
  ctx.fill();
  // 3) 中间调：朝光源偏移，且仍暗于天空
  blob(mid, 0.78, lx * w * 0.18, -h * 0.14, 20, 0.26);
  // 4) 受光侧 rim：只沿光来的那一条边，不整圈描边
  if (rim) {
    ctx.fillStyle = rim;
    ctx.beginPath();
    const la = lx >= 0 ? 0 : Math.PI;
    for (let i = 0; i < 14; i++) {
      const a = la + (r() - 0.5) * 1.7;
      const ex = cx + Math.cos(a) * w * 0.72 + lx * w * 0.16;
      const ey = cy + Math.sin(a) * h * 0.72 - h * 0.2;
      const er = Math.max(1.4, minWH * (0.045 + r() * 0.045));
      ctx.moveTo(ex + er, ey);
      ctx.ellipse(ex, ey, er, er * 0.8, 0, 0, TAU);
    }
    ctx.fill();
  }
}

const _themeKeyCache = new WeakMap();
function themeKeyOf(th) {
  let k = _themeKeyCache.get(th);
  if (k) return k;
  for (let i = 0; i < THEME_KEYS.length; i++) {
    if (THEMES[THEME_KEYS[i]] === th) {
      _themeKeyCache.set(th, THEME_KEYS[i]);
      return THEME_KEYS[i];
    }
  }
  return DEFAULT_THEME;
}

/**
 * 星空：三层亮度。暗星只是一像素点，亮星带柔光与十字芒，整体缓慢闪烁。
 * 整片星空在屏幕空间里只做极缓的视差（0.015 / 0.02），不随世界坐标跳动。
 */
function drawStars(ctx, th, cam, t) {
  const n = th.stars | 0;
  if (n <= 0) return;
  const spanX = 1440;
  const spanY = 470;
  const starCol = mix('#ffffff', th.accent, 0.32);
  ctx.save();

  // —— 暗星层：纯 1px 点，密度最高，负责"夜空不空"
  ctx.fillStyle = starCol;
  for (let i = 0; i < n; i++) {
    if (i % 9 === 0) continue;
    const hx = hash1(i * 733 + 17);
    const hy = hash1(i * 977 + 53);
    const hs = hash1(i * 131 + 7);
    let x = (hx * spanX - cam.x * 0.015) % spanX;
    if (x < 0) x += spanX;
    x -= 80;
    const y = 6 + hy * spanY;
    const tw = 0.5 + 0.5 * Math.sin(t * (0.25 + hs * 1.1) + hx * TAU);
    ctx.globalAlpha = 0.18 + tw * 0.55;
    const s = 0.7 + hs * 1.1;
    ctx.fillRect(x, y, s, s);
    if (hs > 0.74) {
      ctx.globalAlpha = 0.12 + tw * 0.24;
      ctx.fillRect(x - 1.5, y + s * 0.5 - 0.35, s + 3, 0.7);
      ctx.fillRect(x + s * 0.5 - 0.35, y - 1.5, 0.7, s + 3);
    }
  }

  // —— 亮星层：柔光 + 四芒，节奏慢，作为"视线锚点"
  ctx.globalCompositeOperation = 'lighter';
  const sp = glowSprite(mix('#ffffff', th.accent, 0.12));
  const brightCol = mix('#ffffff', th.accent, 0.22);
  for (let i = 0; i < n; i += 9) {
    const hx = hash1(i * 733 + 17);
    const hy = hash1(i * 977 + 53);
    let x = (hx * spanX - cam.x * 0.02) % spanX;
    if (x < 0) x += spanX;
    x -= 80;
    const y = 14 + hy * 330;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.7);
    const sc = 14 + hash1(i * 53 + 3) * 16;
    if (sp) {
      ctx.globalAlpha = 0.42 * (0.45 + pulse * 0.55);
      ctx.drawImage(sp, x - sc / 2, y - sc / 2, sc, sc);
    }
    ctx.globalAlpha = 0.7 + pulse * 0.3;
    ctx.fillStyle = brightCol;
    const rl = 4.5 + pulse * 3.5;
    ctx.fillRect(x - rl, y - 0.4, rl * 2, 0.8);
    ctx.fillRect(x - 0.4, y - rl * 0.8, 0.8, rl * 1.6);
    ctx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2);
  }
  ctx.restore();
}

/** 斜向星云：一层离屏噪声色的柔光带，把天空从"平涂"变成"有星尘的深空" */
function drawNebula(ctx, key, th, cam, t) {
  if (th.stars < 40) return;
  const col = mix(th.haze, th.accent, 0.4);
  const neb = sprite('neb:' + col, 640, 300, (g, w, h) => {
    const r = mulberry32(741);
    for (let i = 0; i < 26; i++) {
      const cx = w * (0.1 + r() * 0.8);
      const cy = h * (0.32 + (r() - 0.5) * 0.5);
      const rx = w * (0.06 + r() * 0.1);
      const ry = rx * (0.32 + r() * 0.26);
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grd.addColorStop(0, rgba(col, 0.16));
      grd.addColorStop(0.5, rgba(col, 0.05));
      grd.addColorStop(1, rgba(col, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, -0.24, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 210; i++) {
      g.globalAlpha = 0.08 + r() * 0.42;
      g.fillStyle = '#ffffff';
      g.fillRect(w * r(), h * (0.2 + r() * 0.6), 0.8, 0.8);
    }
  });
  if (!neb) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55;
  ctx.translate(VIEW_W * 0.54, 138);
  ctx.rotate(-0.19);
  ctx.drawImage(neb, -VIEW_W * 0.64, -140, VIEW_W * 1.28, 320);
  ctx.restore();
}

/**
 * 天体本体（热核 + 内晕 + 冷边）预渲染成精灵。
 * 太阳偏"过曝"，月亮偏"冷白 + 环形山"，血月偏"暗红 + 云影"。
 */
function celestialSprite(key, th) {
  const c = th.celestial;
  const r = c.r;
  const S = Math.ceil(r * 2.34);
  const blood = key === 'bloodmoon' || (c.kind === 'moon' && th.moonBlood);
  const isSun = c.kind === 'sun' && !blood;
  return sprite('cel:' + key, S, S, (g, w) => {
    const cx = w / 2;
    const cy = w / 2;
    // 亮度是硬指标：月亮整体压到 中心≈235 / 边缘≈200，否则 bloom 会洗成纯白
    const ivory = blood ? mix('#dda58c', c.color, 0.18) : mix('#d8d5e4', c.color, 0.1);
    const darkSide = blood ? mix('#7d3f3c', c.color, 0.1) : mix('#9a97a8', c.color, 0.06);
    const core = blood ? mix('#f0c4b0', c.color, 0.1) : mix('#e9e6f2', c.color, 0.06);
    // 本体：受光侧（左上）暖白 → 中间象牙 → 背光侧灰蓝，三段以上
    const grd = g.createRadialGradient(cx - r * 0.34, cy - r * 0.36, r * 0.04, cx - r * 0.08, cy - r * 0.06, r * 1.02);
    grd.addColorStop(0, isSun ? mix(core, '#ffffff', 0.3) : core);
    grd.addColorStop(0.2, mix(core, ivory, 0.5));
    grd.addColorStop(0.52, ivory);
    grd.addColorStop(0.74, mix(ivory, darkSide, isSun ? 0.5 : 0.32));
    grd.addColorStop(0.9, isSun ? mix(ivory, darkSide, 0.88) : mix(ivory, darkSide, 0.72));
    grd.addColorStop(1, isSun ? mix(darkSide, th.sky[0], 0.42) : mix(darkSide, '#6a6779', 0.35));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.fill();

    // 太阳：中心过曝核，没有环形山
    if (isSun) {
      const hot = g.createRadialGradient(cx - r * 0.1, cy - r * 0.12, 0, cx - r * 0.1, cy - r * 0.12, r * 0.78);
      hot.addColorStop(0, rgba('#ffffff', 0.9));
      hot.addColorStop(0.45, rgba(mix('#ffffff', core, 0.35), 0.42));
      hot.addColorStop(1, rgba(core, 0));
      g.fillStyle = hot;
      g.beginPath();
      g.arc(cx, cy, r * 0.92, 0, TAU);
      g.fill();
      // 日冕细毛
      g.strokeStyle = rgba(core, 0.18);
      g.lineWidth = Math.max(0.8, r * 0.014);
      g.beginPath();
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU + hash1(i * 7) * 0.2;
        const r0 = r * (1.0 + hash1(i * 11) * 0.02);
        const r1 = r * (1.05 + hash1(i * 13) * 0.07);
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      }
      g.stroke();
    } else {
    // 月海 + 环形山：斑块有暗芯与亮边（先裁进圆盘，避免溢出）
    g.save();
    g.beginPath();
    g.arc(cx, cy, r * 0.995, 0, TAU);
    g.clip();
    const rr = mulberry32(blood ? 31 : 17);
    const maria = blood ? 6 : 6;
    for (let i = 0; i < maria; i++) {
      const a = rr() * TAU;
      const rad = Math.sqrt(rr()) * r * 0.6;
      const ex = cx + Math.cos(a) * rad;
      const ey = cy + Math.sin(a) * rad;
      const er = r * (0.16 + rr() * 0.16);
      const mg = g.createRadialGradient(ex, ey, 0, ex, ey, er);
      const mc = blood ? '#571820' : '#8f8ca0';
      mg.addColorStop(0, rgba(mc, 0.62));
      mg.addColorStop(0.7, rgba(mc, 0.34));
      mg.addColorStop(1, rgba(mc, 0));
      g.fillStyle = mg;
      g.beginPath();
      g.ellipse(ex, ey, er, er * (0.62 + rr() * 0.4), rr() * TAU, 0, TAU);
      g.fill();
    }
    const craters = blood ? 12 : 18;
    for (let i = 0; i < craters; i++) {
      const a = rr() * TAU;
      const rad = Math.sqrt(rr()) * r * 0.78;
      const ex = cx + Math.cos(a) * rad;
      const ey = cy + Math.sin(a) * rad;
      const er = r * (0.035 + rr() * 0.1) * (1 - rad / (r * 1.3));
      if (er < r * 0.012) continue;
      // 暗芯
      const cg = g.createRadialGradient(ex - er * 0.25, ey - er * 0.25, 0, ex, ey, er);
      cg.addColorStop(0, rgba(blood ? '#3d0e14' : '#7a7688', 0.62));
      cg.addColorStop(0.75, rgba(blood ? '#4a1218' : '#8f8ca0', 0.38));
      cg.addColorStop(1, rgba(blood ? '#5a1a20' : '#9aa4c6', 0));
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(ex, ey, er, er * (0.72 + rr() * 0.4), rr() * TAU, 0, TAU);
      g.fill();
      // 亮边（受光侧半圈）
      g.strokeStyle = rgba(blood ? '#ffd0b0' : '#ffffff', 0.3 + rr() * 0.18);
      g.lineWidth = Math.max(0.7, r * 0.012);
      g.beginPath();
      g.arc(ex, ey, er * 0.9, Math.PI * 0.95, Math.PI * 1.85);
      g.stroke();
    }
    // 月面细颗粒
    for (let i = 0; i < 260; i++) {
      const a = rr() * TAU;
      const rad = Math.sqrt(rr()) * r * 0.98;
      g.globalAlpha = 0.05 + rr() * 0.16;
      g.fillStyle = rr() > 0.5 ? '#ffffff' : '#1a2236';
      g.fillRect(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 0.9, 0.9);
    }
    g.globalAlpha = 1;
    // 明暗分界线：下半与右侧压暗，球体有体积
    const term = g.createRadialGradient(cx - r * 0.3, cy - r * 0.32, r * 0.25, cx, cy, r * 1.12);
    term.addColorStop(0, 'rgba(0,0,0,0)');
    term.addColorStop(0.66, 'rgba(0,0,0,0)');
    term.addColorStop(1, rgba(mix(darkSide, '#000000', 0.35), isSun ? 0.5 : 0.62));
    g.fillStyle = term;
    g.fillRect(0, 0, w, w);
    g.restore();
    }

    // 收边：月亮做暗边，太阳留一圈暖亮环
    if (isSun) {
      g.strokeStyle = rgba(mix(core, '#fff2c8', 0.5), 0.26);
      g.lineWidth = Math.max(1, r * 0.014);
      g.beginPath();
      g.arc(cx, cy, r * 0.982, 0, TAU);
      g.stroke();
    } else {
      const limb = g.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
      limb.addColorStop(0, rgba(mix(darkSide, '#000000', 0.2), 0));
      limb.addColorStop(0.45, rgba(mix(darkSide, '#000000', 0.22), 0.1));
      limb.addColorStop(0.78, rgba(mix(darkSide, '#000000', 0.3), 0.24));
      limb.addColorStop(0.95, rgba(mix(darkSide, '#000000', 0.4), 0.42));
      limb.addColorStop(1, rgba(mix(darkSide, '#000000', 0.5), 0.6));
      g.fillStyle = limb;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.fill();
      // 只留朝光侧的一丝外缘反光
      g.strokeStyle = rgba(mix(core, '#ffffff', 0.2), 0.18);
      g.lineWidth = Math.max(0.8, r * 0.01);
      g.beginPath();
      g.arc(cx, cy, r * 0.972, Math.PI * 1.04, Math.PI * 1.7);
      g.stroke();
    }
  });
}

/** 天体：三段辉光 + 静光束 / 呼吸光带 + 本体 + 云影 */
function drawCelestial(ctx, key, th, cam, t) {
  const c = th.celestial;
  if (!c) return;
  const x = c.x - cam.x * 0.016;
  const y = c.y - cam.y * 0.02;
  const r = c.r;
  const isSun = c.kind === 'sun';
  const core = c.core || mix(c.color, '#ffffff', 0.5);

  ctx.save();
  // 大范围色晕：让天顶到地平线都被主光源染色
  glow(ctx, x, y, r * 1.62, r * 1.62, isSun ? '#ff7a30' : mix(c.color, '#7ea6ff', 0.4), isSun ? 0.13 : 0.09, true);
  glow(ctx, x, y, r * 1.16, r * 1.16, isSun ? '#ffb060' : mix(core, '#bcd4ff', 0.45), 0.11, true);

  // 光束（丁达尔）：太阳用暖色宽光束，月亮用极淡的冷色光晕
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = isSun ? '#ff9a44' : '#8fb4f0';
  const beams = isSun ? 14 : 10;
  for (let i = 0; i < beams; i++) {
    const a = (i / beams) * TAU + 0.23 + hash1(i * 37) * 0.1;
    const len = 520 + hash1(i * 53 + 5) * 430;
    const wid = 0.01 + hash1(i * 11 + 2) * 0.014;
    ctx.globalAlpha = (isSun ? 0.03 : 0.016) * (0.6 + hash1(i * 29 + 3) * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - wid) * len, Math.sin(a - wid) * len);
    ctx.lineTo(Math.cos(a + wid) * len, Math.sin(a + wid) * len);
    ctx.closePath();
    ctx.fill();
  }
  // 呼吸的宽光带
  for (let i = 0; i < 4; i++) {
    const a = 0.18 + i * 0.78 + Math.sin(t * 0.05 + i) * 0.03;
    const wid = 0.085;
    ctx.globalAlpha = (isSun ? 0.014 : 0.008) * (0.7 + 0.3 * Math.sin(t * 0.3 + i));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - wid) * 880, Math.sin(a - wid) * 880);
    ctx.lineTo(Math.cos(a + wid) * 880, Math.sin(a + wid) * 880);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 本体
  const body = celestialSprite(key, th);
  if (body) {
    ctx.drawImage(body, x - body.width / 2, y - body.height / 2);
  }

  // 血月的云影：几道暗色横云切过月盘，制造"不祥"
  if (key === 'mansion' || key === 'nether') {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.99, 0, TAU);
    ctx.clip();
    const r2 = mulberry32(88);
    for (let i = 0; i < 3; i++) {
      const yy = y + (r2() - 0.5) * r * 1.2;
      const hh = r * (0.06 + r2() * 0.07);
      const grd2 = ctx.createLinearGradient(x - r, yy, x + r, yy);
      grd2.addColorStop(0, rgba(mix(th.sky[0], '#000000', 0.3), 0));
      grd2.addColorStop(0.5, rgba(mix(th.sky[0], '#000000', 0.3), 0.5));
      grd2.addColorStop(1, rgba(mix(th.sky[0], '#000000', 0.3), 0));
      ctx.fillStyle = grd2;
      ctx.fillRect(x - r, yy - hh / 2, r * 2, hh);
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * 云层：三层不同速度与高度，越远越淡越蓝。
 * 云团是预渲染精灵，每帧只 drawImage；移动靠 hash 定位 + 时间平移 + 视差。
 */
function drawCloudBands(ctx, key, th, cam, t) {
  const count = th.clouds | 0;
  if (count <= 0) return;
  const skyCol = th.sky[2] || th.sky[1];
  const layers = [
    { n: Math.max(1, Math.round(count * 0.45)), speed: 3, y0: 56, y1: 140, alpha: 0.46, scale: 1.3, col: mix(th.cloud, skyCol, 0.55) },
    { n: Math.max(1, Math.round(count * 0.35)), speed: 7, y0: 142, y1: 236, alpha: 0.4, scale: 1.0, col: mix(th.cloud, skyCol, 0.34) },
    { n: Math.max(1, Math.floor(count * 0.25)), speed: 13, y0: 226, y1: 330, alpha: 0.3, scale: 0.8, col: mix(th.cloud, skyCol, 0.12) },
  ];
  let idx = 0;
  for (let L = 0; L < layers.length; L++) {
    const ly = layers[L];
    for (let i = 0; i < ly.n; i++, idx++) {
      const sp = cloudSprite(ly.col, idx % 2);
      if (!sp) continue;
      const hy = hash1(idx * 211 + 31);
      const hx = hash1(idx * 313 + 7);
      const span = 1780;
      let x = (hx * span + t * ly.speed + idx * 173 - cam.x * 0.02) % span;
      if (x < 0) x += span;
      x -= 210;
      const y = ly.y0 + hy * (ly.y1 - ly.y0);
      const w = (330 + hy * 330) * ly.scale;
      const h = w * 0.32;
      ctx.save();
      ctx.globalAlpha = ly.alpha * (0.55 + hy * 0.45);
      ctx.drawImage(sp, x, y, w, h);
      ctx.restore();
    }
  }
}

/** 天空：多段渐变 + 星云 + 星空 + 天体 + 云 + 地平雾 + 底部压暗 + 抖动噪点 */
function drawSky(ctx, theme, cam, t) {
  const key = themeKeyOf(themeOf(theme));
  const th = THEMES[key];
  const c = camOf(cam);
  const time = typeof t === 'number' ? t : 0;
  const sky2 = th.sky[2] || th.sky[1];

  ctx.save();
  const grad = vGrad(ctx, 0, VIEW_H, [
    [0, th.sky[0]],
    [0.3, mix(th.sky[0], th.sky[1], 0.62)],
    [0.56, th.sky[1]],
    [0.82, sky2],
    [1, mix(sky2, th.haze, 0.45)],
  ], 'sky:' + key);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // 星云（只对夜空主题）
  drawNebula(ctx, key, th, c, time);
  // 星空
  drawStars(ctx, th, c, time);
  // 天体
  drawCelestial(ctx, key, th, c, time);
  // 云层（在月/日前方飘过，增加空气感）
  drawCloudBands(ctx, key, th, c, time);

  // 地平线附近的雾霭：两层，把天空底部和远景山脊融在一起
  ctx.save();
  ctx.globalAlpha = 0.5;
  glow(ctx, VIEW_W * 0.5, VIEW_H - 54, VIEW_W * 0.72, 120, th.haze, 0.13, false);
  ctx.globalAlpha = 1;
  glow(ctx, VIEW_W * 0.42, VIEW_H - 96, VIEW_W * 0.6, 90, mix(th.haze, th.accent, 0.35), 0.08, false);
  ctx.restore();

  // 地平线以下的压暗：让地面/sky 交界处沉下去
  const bot = ctx.createLinearGradient(0, VIEW_H * 0.6, 0, VIEW_H);
  bot.addColorStop(0, rgba(sky2, 0));
  bot.addColorStop(1, rgba(mix(sky2, '#000000', 0.45), 0.5));
  ctx.fillStyle = bot;
  ctx.fillRect(0, VIEW_H * 0.6, VIEW_W, VIEW_H * 0.4);

  // 确定性抖动：用噪点图案打散 8bit 色带（这是"渐变有颗粒"的关键）
  const pat = grainPattern(ctx);
  if (pat) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 视差剪影元素                                                        */
/* ------------------------------------------------------------------ */


/**
 * 松：细主干 + 稀疏的分层针叶扇。刻意留出层间空隙，
 * 让剪影是"有枝干骨架的松"而不是一棵圆润的圣诞树。
 */
function drawPine(ctx, x, baseY, h, w, color, alpha) {
  const a = alpha === undefined ? 1 : alpha;
  ctx.save();
  ctx.globalAlpha = a;
  const dark = mix(color, '#04060b', 0.42);
  const mid = color;
  const lit = mix(color, '#ffffff', 0.22);
  const trunkW = Math.max(1.3, w * 0.05);
  ctx.lineCap = 'round';

  // 主干：略微弯曲，上细下粗
  ctx.strokeStyle = dark;
  ctx.lineWidth = trunkW;
  ctx.beginPath();
  ctx.moveTo(x, baseY + 2);
  ctx.quadraticCurveTo(x + w * 0.035, baseY - h * 0.42, x + w * 0.008, baseY - h * 0.88);
  ctx.stroke();
  ctx.strokeStyle = rgba(lit, 0.12);
  ctx.lineWidth = Math.max(0.7, trunkW * 0.4);
  ctx.beginPath();
  ctx.moveTo(x + trunkW * 0.4, baseY - h * 0.06);
  ctx.quadraticCurveTo(x + trunkW * 0.4 + w * 0.03, baseY - h * 0.44, x + w * 0.008 + trunkW * 0.3, baseY - h * 0.84);
  ctx.stroke();

  // 5 层针叶扇，左右各一，越靠上越短
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const yy = baseY - h * (0.2 + u * 0.68);
    const reach = w * (0.54 - u * 0.34) * (0.9 + hash1(i * 31 + 7) * 0.24);
    const rootX = x + w * 0.012;
    const rootY = yy;
    for (let s = -1; s <= 1; s += 2) {
      const tipX = x + s * reach;
      const tipY = yy + h * (0.085 - u * 0.03);
      // 针叶扇：上缘一条弧，下缘锯齿
      ctx.fillStyle = i % 2 === 0 ? mid : mix(mid, dark, 0.32);
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo((rootX + tipX) * 0.5, rootY - h * 0.035, tipX, tipY);
      for (let k = 1; k <= 5; k++) {
        const tt = k / 5;
        const px = lerp(tipX, rootX, tt);
        const py = lerp(tipY, rootY + h * 0.01, tt) + (k % 2 ? h * 0.014 : h * 0.002);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // 受光的上缘
      ctx.strokeStyle = rgba(lit, 0.2);
      ctx.lineWidth = Math.max(0.7, w * 0.013);
      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.quadraticCurveTo((rootX + tipX) * 0.5, rootY - h * 0.035, tipX, tipY);
      ctx.stroke();
    }
  }
  ctx.restore();
}


/**
 * 樱：有骨架的枝干 + 不规则花簇。花簇用多层椭圆碎团拼出蓬松轮廓，
 * 受光侧只有零散亮点，避免"粉色棉花糖"的童话感。
 */
function drawCherry(ctx, x, baseY, h, seed, dark, rim) {
  const r = mulberry32((seed * 9301 + 49297) | 0);
  const trunkW = Math.max(2.4, h * 0.052);
  const lean = (r() - 0.5) * h * 0.18;
  const crownX = x + lean;
  const crownY = baseY - h * 0.76;
  const cw = h * 0.4;
  const ch = h * 0.23;
  const base = mix(dark, '#05060b', 0.2);
  const mid = rim ? mix(dark, rim, 0.22) : mix(dark, '#ffffff', 0.08);
  const lit = rim ? mix(rim, '#ffffff', 0.18) : null;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 接触阴影
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + lean * 0.1, baseY + 1, trunkW * 3.4, Math.max(2, trunkW * 0.8), 0, 0, TAU);
  ctx.fill();

  // 主枝干两段
  ctx.strokeStyle = base;
  ctx.lineWidth = trunkW;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + lean * 0.24, baseY - h * 0.32, x + lean * 0.7, baseY - h * 0.54);
  ctx.stroke();
  ctx.lineWidth = trunkW * 0.6;
  ctx.beginPath();
  ctx.moveTo(x + lean * 0.7, baseY - h * 0.54);
  ctx.quadraticCurveTo(crownX - h * 0.03, baseY - h * 0.66, crownX, crownY + ch * 0.34);
  ctx.stroke();

  // 树皮纹理：两三道短暗线
  ctx.strokeStyle = rgba('#000000', 0.25);
  ctx.lineWidth = Math.max(0.7, trunkW * 0.18);
  for (let i = 0; i < 3; i++) {
    const t0 = 0.12 + i * 0.22;
    const px = lerp(x, x + lean * 0.7, t0);
    const py = lerp(baseY, baseY - h * 0.54, t0);
    ctx.beginPath();
    ctx.moveTo(px - trunkW * 0.3, py);
    ctx.quadraticCurveTo(px, py - h * 0.03, px + trunkW * 0.25, py - h * 0.015);
    ctx.stroke();
  }

  // 三根伸向花簇的细枝
  const branch = (dx, dy, wd) => {
    ctx.strokeStyle = base;
    ctx.lineWidth = wd;
    ctx.beginPath();
    ctx.moveTo(crownX + dx * 0.08, crownY + ch * 0.3);
    ctx.quadraticCurveTo(crownX + dx * 0.66, crownY + ch * 0.14 + dy * 0.4, crownX + dx, crownY + dy);
    ctx.stroke();
  };
  branch(-cw * 0.78, -ch * 0.12, trunkW * 0.42);
  branch(cw * 0.84, -ch * 0.06, trunkW * 0.4);
  branch(cw * 0.1, -ch * 0.72, trunkW * 0.32);

  // 树干受光边
  if (rim) {
    ctx.strokeStyle = rgba(rim, 0.15);
    ctx.lineWidth = Math.max(0.8, trunkW * 0.2);
    ctx.beginPath();
    ctx.moveTo(x + trunkW * 0.3, baseY - 2);
    ctx.quadraticCurveTo(x + trunkW * 0.3 + lean * 0.24, baseY - h * 0.32, x + lean * 0.7 + trunkW * 0.14, baseY - h * 0.52);
    ctx.stroke();
  }

  // 花簇：先并成一个实心暗调剪影（叶团互相重叠、没有空隙），
  // 再压中间调，最后只在朝光侧（右上）点碎花，避免"灰色气泡云"
  const crownBlob = (col, sc, ox, oy) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const a2 = r() * TAU;
      const rad = Math.sqrt(r());
      const ex = crownX + Math.cos(a2) * rad * cw * sc + ox;
      const ey = crownY + Math.sin(a2) * rad * ch * sc + oy;
      const er = Math.max(4.5, h * (0.092 + r() * 0.06) * sc);
      ctx.moveTo(ex + er, ey);
      ctx.ellipse(ex, ey, er, er * (0.7 + r() * 0.4), (r() - 0.5) * 0.8, 0, TAU);
    }
    ctx.fill();
  };
  const crownDark = mix(base, '#04040a', 0.42);
  crownBlob(crownDark, 1, 0, ch * 0.16);
  // 破轮廓：外圈零星叶团，让冠缘不规则
  ctx.fillStyle = crownDark;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a2 = r() * TAU;
    const ex = crownX + Math.cos(a2) * cw * (0.92 + r() * 0.18);
    const ey = crownY + Math.sin(a2) * ch * (0.9 + r() * 0.22) + ch * 0.1;
    const er = Math.max(2.4, h * (0.028 + r() * 0.026));
    ctx.moveTo(ex + er, ey);
    ctx.ellipse(ex, ey, er, er * 0.82, r() * TAU, 0, TAU);
  }
  ctx.fill();
  // 中间调：整体朝光偏移，仍保持暗于天空
  crownBlob(mid, 0.74, h * 0.026, -ch * 0.16);
  // 从花簇里透出来的枝干（有分叉、加粗）
  ctx.strokeStyle = crownDark;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, trunkW * 0.36);
  ctx.beginPath();
  ctx.moveTo(crownX - cw * 0.1, crownY + ch * 0.52);
  ctx.quadraticCurveTo(crownX + cw * 0.16, crownY - ch * 0.06, crownX + cw * 0.52, crownY - ch * 0.48);
  ctx.moveTo(crownX - cw * 0.12, crownY + ch * 0.26);
  ctx.quadraticCurveTo(crownX - cw * 0.46, crownY - ch * 0.16, crownX - cw * 0.68, crownY - ch * 0.3);
  ctx.stroke();
  // 受光侧（右上）碎花：只贴在光来的那一侧
  if (lit) {
    ctx.fillStyle = lit;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a2 = -Math.PI * (0.04 + r() * 0.56);
      const rad = 0.6 + r() * 0.36;
      const ex = crownX + Math.cos(a2) * rad * cw * 1.02;
      const ey = crownY + Math.sin(a2) * rad * ch * 1.02;
      const er = Math.max(1, h * (0.009 + r() * 0.012));
      ctx.moveTo(ex + er, ey);
      ctx.arc(ex, ey, er, 0, TAU);
    }
    ctx.fill();
    // 飘出轮廓的花点
    ctx.fillStyle = rgba(lit, 0.72);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a2 = -Math.PI * (0.02 + r() * 0.68);
      const rad = 1.0 + r() * 0.24;
      const ex = crownX + Math.cos(a2) * rad * cw;
      const ey = crownY + Math.sin(a2) * rad * ch * 0.92;
      const er = Math.max(1, h * 0.008);
      ctx.arc(ex, ey, er, 0, TAU);
    }
    ctx.fill();
  }
  ctx.restore();
}


/** 鸟居：柱础 + 内倾柱身 + 双层笠木 + 额束，全部带受光边与投影 */
function drawTorii(ctx, x, baseY, h, color, rim) {
  const w = h * 0.68;
  const top = baseY - h;
  const postW = Math.max(1.6, w * 0.045);
  const dark = mix(color, '#04060b', 0.42);
  const lit = rim ? mix(color, rim, 0.45) : mix(color, '#ffffff', 0.16);
  ctx.save();
  ctx.lineCap = 'butt';

  // 柱础石（两个，带顶面受光）
  for (let s = -1; s <= 1; s += 2) {
    const bx = x + s * w * 0.34;
    ctx.fillStyle = mix(dark, '#000000', 0.25);
    ctx.beginPath();
    ctx.moveTo(bx - postW * 2.2, baseY + 1);
    ctx.quadraticCurveTo(bx - postW * 1.7, baseY - postW * 1.3, bx, baseY - postW * 1.3);
    ctx.quadraticCurveTo(bx + postW * 1.7, baseY - postW * 1.3, bx + postW * 2.2, baseY + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(lit, 0.18);
    ctx.fillRect(bx - postW * 1.5, baseY - postW * 1.25, postW * 3, Math.max(1, postW * 0.35));
  }

  // 柱身 + 头顶构件（同一路径填充）
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let s = -1; s <= 1; s += 2) {
    const bx = x + s * w * 0.34;
    const tx = x + s * w * 0.27;
    ctx.moveTo(bx - postW, baseY);
    ctx.lineTo(bx + postW, baseY);
    ctx.lineTo(tx + postW * 0.82, top + h * 0.31);
    ctx.lineTo(tx - postW * 0.82, top + h * 0.31);
    ctx.closePath();
  }
  // 笠木（上梁，两端上翘）
  ctx.moveTo(x - w * 0.58, top + h * 0.09);
  ctx.quadraticCurveTo(x, top - h * 0.035, x + w * 0.58, top + h * 0.09);
  ctx.lineTo(x + w * 0.57, top + h * 0.15);
  ctx.quadraticCurveTo(x, top + h * 0.02, x - w * 0.57, top + h * 0.15);
  ctx.closePath();
  // 岛木（下梁）
  ctx.moveTo(x - w * 0.44, top + h * 0.19);
  ctx.lineTo(x + w * 0.44, top + h * 0.19);
  ctx.lineTo(x + w * 0.44, top + h * 0.235);
  ctx.lineTo(x - w * 0.44, top + h * 0.235);
  ctx.closePath();
  // 贯（中横梁）
  ctx.moveTo(x - w * 0.34, top + h * 0.4);
  ctx.lineTo(x + w * 0.34, top + h * 0.4);
  ctx.lineTo(x + w * 0.34, top + h * 0.44);
  ctx.lineTo(x - w * 0.34, top + h * 0.44);
  ctx.closePath();
  // 额束（中央小匾）
  ctx.moveTo(x - w * 0.055, top + h * 0.245);
  ctx.lineTo(x + w * 0.055, top + h * 0.245);
  ctx.lineTo(x + w * 0.055, top + h * 0.395);
  ctx.lineTo(x - w * 0.055, top + h * 0.395);
  ctx.closePath();
  ctx.fill();

  // 受光边：笠木上缘 + 柱身外缘
  ctx.strokeStyle = rgba(lit, rim ? 0.55 : 0.3);
  ctx.lineWidth = Math.max(0.9, w * 0.012);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.58, top + h * 0.09);
  ctx.quadraticCurveTo(x, top - h * 0.035, x + w * 0.58, top + h * 0.09);
  ctx.stroke();
  ctx.strokeStyle = rgba(lit, 0.26);
  ctx.beginPath();
  ctx.moveTo(x + w * 0.34 - postW, baseY);
  ctx.lineTo(x + w * 0.27 + postW * 0.82, top + h * 0.31);
  ctx.stroke();

  // 笠木底面 / 柱脚的暗部
  ctx.strokeStyle = rgba(dark, 0.7);
  ctx.lineWidth = Math.max(0.9, w * 0.014);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.55, top + h * 0.152);
  ctx.quadraticCurveTo(x, top + h * 0.028, x + w * 0.55, top + h * 0.152);
  ctx.stroke();
  ctx.restore();
}


/** 塔：多层屋檐 + 瓦垄 + 栏杆 + 相轮，窗内有暖光 */
function drawPagoda(ctx, x, baseY, h, color, tiers, rim) {
  const n = Math.max(2, tiers | 0 || 3);
  const dark = mix(color, '#04060b', 0.45);
  const lit = rim ? mix(color, rim, 0.5) : mix(color, '#ffffff', 0.18);
  const bodyW = h * 0.42;
  ctx.save();
  ctx.lineCap = 'butt';

  // 塔基
  ctx.fillStyle = mix(dark, '#000000', 0.2);
  ctx.fillRect(x - bodyW * 0.62, baseY - h * 0.05, bodyW * 1.24, h * 0.05);

  for (let i = 0; i < n; i++) {
    const u = i / n;
    const yy = baseY - h * (0.06 + u * 0.82);
    const bw = bodyW * (1 - u * 0.44);
    const bh = h * (0.8 / n) * 0.62;
    // 塔身
    ctx.fillStyle = mix(color, '#000000', 0.12);
    ctx.fillRect(x - bw * 0.5, yy - bh, bw, bh);
    // 塔身受光侧
    ctx.fillStyle = rgba(lit, 0.16);
    ctx.fillRect(x + bw * 0.5 - Math.max(1, bw * 0.09), yy - bh, Math.max(1, bw * 0.09), bh);
    // 窗：暗框 + 暖光点
    ctx.fillStyle = rgba(lit, 0.5);
    const winW = Math.max(1.2, bw * 0.12);
    ctx.fillRect(x - bw * 0.16, yy - bh * 0.72, winW, bh * 0.4);
    ctx.fillRect(x + bw * 0.06, yy - bh * 0.72, winW, bh * 0.4);

    // 屋檐：外挑，两端上翘，底下压暗
    const ew = bw * 1.72;
    const eTop = yy - bh;
    ctx.fillStyle = mix(color, '#000000', 0.28);
    ctx.beginPath();
    ctx.moveTo(x - ew * 0.5, eTop + h * 0.035);
    ctx.quadraticCurveTo(x - ew * 0.34, eTop - h * 0.012, x, eTop - h * 0.032);
    ctx.quadraticCurveTo(x + ew * 0.34, eTop - h * 0.012, x + ew * 0.5, eTop + h * 0.035);
    ctx.lineTo(x + ew * 0.46, eTop + h * 0.062);
    ctx.quadraticCurveTo(x, eTop + h * 0.012, x - ew * 0.46, eTop + h * 0.062);
    ctx.closePath();
    ctx.fill();
    // 瓦垄：几条短竖线，制造屋顶材质
    ctx.strokeStyle = rgba(dark, 0.55);
    ctx.lineWidth = Math.max(0.6, h * 0.004);
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      const px = x + (k / 2) * ew * 0.36;
      ctx.moveTo(px, eTop - h * 0.022 + Math.abs(k) * h * 0.008);
      ctx.lineTo(px, eTop + h * 0.05);
    }
    ctx.stroke();
    // 檐口受光
    ctx.strokeStyle = rgba(lit, 0.4);
    ctx.lineWidth = Math.max(0.7, h * 0.005);
    ctx.beginPath();
    ctx.moveTo(x - ew * 0.48, eTop + h * 0.038);
    ctx.quadraticCurveTo(x, eTop - h * 0.03, x + ew * 0.48, eTop + h * 0.038);
    ctx.stroke();
  }

  // 相轮（顶部尖针 + 三颗宝珠）
  const tipY = baseY - h * 0.9;
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, h * 0.012);
  ctx.beginPath();
  ctx.moveTo(x, baseY - h * 0.88);
  ctx.lineTo(x, tipY - h * 0.07);
  ctx.stroke();
  ctx.fillStyle = lit;
  for (let i = 0; i < 3; i++) {
    const rr = Math.max(1.2, h * (0.016 - i * 0.003));
    ctx.beginPath();
    ctx.arc(x, tipY - h * 0.06 + i * h * 0.028, rr, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}


/**
 * 竹：分节竹竿（节环 + 受光侧 + 背光侧）+ 顶部垂叶。
 * sway 由调用方按风相位传入，越靠上摆动越大。
 */
function drawBamboo(ctx, x, baseY, h, w, color, light, sway, seed) {
  const r = mulberry32((seed * 131 + 17) | 0);
  const dark = mix(color, '#0a0d0a', 0.35);
  const mid = color;
  const lit = mix(light, '#ffffff', 0.2);
  const nodes = Math.max(3, Math.round(h / 38));
  const curve = (u) => x + sway * u * u;
  const halfW = (u) => Math.max(0.9, w * (1 - u * 0.45) * 0.5);

  ctx.save();
  // 接触阴影
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, baseY + 1, w * 1.6, Math.max(1.6, w * 0.5), 0, 0, TAU);
  ctx.fill();

  // 竿身：逐节填充，左右明暗分开
  for (let i = 0; i < nodes; i++) {
    const u0 = i / nodes;
    const u1 = (i + 1) / nodes;
    const y0 = baseY - h * u0;
    const y1 = baseY - h * u1;
    const x0 = curve(u0);
    const x1 = curve(u1);
    const w0 = halfW(u0);
    const w1 = halfW(u1);
    ctx.fillStyle = i % 2 ? mid : mix(mid, dark, 0.16);
    ctx.beginPath();
    ctx.moveTo(x0 - w0, y0);
    ctx.lineTo(x1 - w1, y1);
    ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x0 + w0, y0);
    ctx.closePath();
    ctx.fill();
    // 受光面
    ctx.fillStyle = rgba(lit, 0.3);
    ctx.beginPath();
    ctx.moveTo(x0 - w0 * 0.92, y0);
    ctx.lineTo(x1 - w1 * 0.92, y1);
    ctx.lineTo(x1 - w1 * 0.2, y1);
    ctx.lineTo(x0 - w0 * 0.2, y0);
    ctx.closePath();
    ctx.fill();
    // 背光面
    ctx.fillStyle = rgba(dark, 0.4);
    ctx.beginPath();
    ctx.moveTo(x0 + w0 * 0.5, y0);
    ctx.lineTo(x1 + w1 * 0.5, y1);
    ctx.lineTo(x1 + w1, y1);
    ctx.lineTo(x0 + w0, y0);
    ctx.closePath();
    ctx.fill();
    // 节环：暗环 + 上缘受光
    ctx.strokeStyle = rgba(dark, 0.75);
    ctx.lineWidth = Math.max(0.7, w * 0.16);
    ctx.beginPath();
    ctx.moveTo(x1 - w1 * 1.12, y1);
    ctx.quadraticCurveTo(x1, y1 + w * 0.24, x1 + w1 * 1.12, y1);
    ctx.stroke();
    ctx.strokeStyle = rgba(lit, 0.35);
    ctx.lineWidth = Math.max(0.5, w * 0.1);
    ctx.beginPath();
    ctx.moveTo(x1 - w1 * 1.04, y1 - 1.1);
    ctx.quadraticCurveTo(x1, y1 + w * 0.14 - 1.1, x1 + w1 * 1.04, y1 - 1.1);
    ctx.stroke();
  }

  // 斜向细枝 + 成簇竹叶：一竿 4~6 簇，每簇 8~14 片细长叶朝不同方向下垂
  const leafCol = mix(mid, light, 0.34);
  const leafDark = mix(mid, dark, 0.38);
  const clusters = 4 + Math.round(r() * 2);
  for (let cI = 0; cI < clusters; cI++) {
    const u = 0.4 + (cI / clusters) * 0.58 + (r() - 0.5) * 0.05;
    const by = baseY - h * u;
    const bx = curve(u);
    const side = cI % 2 === 0 ? 1 : -1;
    const blen = 14 + r() * 30;
    // 细枝（略斜向垂）
    ctx.strokeStyle = rgba(mix(mid, dark, 0.18), 0.9);
    ctx.lineWidth = Math.max(0.7, w * 0.11);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + side * blen * 0.55, by - blen * 0.22, bx + side * blen, by + blen * 0.18);
    ctx.stroke();
    const tx = bx + side * blen;
    const ty = by + blen * 0.18;
    const leafN = 8 + Math.round(r() * 6);
    for (let k = 0; k < leafN; k++) {
      const a = (side > 0 ? 0.15 : Math.PI - 0.15) + (r() - 0.5) * 1.7;
      const len = 9 + r() * 16;
      const droop = 3 + r() * 8;
      const lx = tx + (r() - 0.5) * blen * 0.7;
      const ly = ty + (r() - 0.5) * blen * 0.34;
      ctx.fillStyle = k % 4 === 0 ? rgba(lit, 0.5) : k % 3 === 0 ? rgba(leafCol, 0.82) : rgba(leafDark, 0.85);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.quadraticCurveTo(
        lx + Math.cos(a) * len * 0.55, ly + Math.sin(a) * len * 0.4 - 2.4,
        lx + Math.cos(a) * len, ly + Math.sin(a) * len * 0.55 + droop
      );
      ctx.quadraticCurveTo(
        lx + Math.cos(a) * len * 0.5, ly + Math.sin(a) * len * 0.4 - droop * 0.35,
        lx, ly + 1.1
      );
      ctx.closePath();
      ctx.fill();
    }
  }
  // 梢头几片叶子，避免竿顶光秃
  for (let i = 0; i < 3; i++) {
    const ty = baseY - h * 0.99;
    const tx = curve(1) + (r() - 0.5) * w * 1.4;
    const dir = r() > 0.5 ? 1 : -1;
    ctx.fillStyle = rgba(leafCol, 0.7);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + dir * 8, ty - 5, tx + dir * 16, ty + 3);
    ctx.quadraticCurveTo(tx + dir * 8, ty + 1, tx, ty + 1.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** 枯树：递归分叉但每段都带锥度与受光边，末端再补细枝 */
function drawDeadTree(ctx, x, baseY, h, seed, color) {
  const r = mulberry32((seed * 7919 + 104729) | 0);
  const dark = mix(color, '#04060b', 0.35);
  const lit = mix(color, '#ffffff', 0.24);
  ctx.save();
  ctx.lineCap = 'round';
  const grow = (px, py, ang, len, wd, depth) => {
    const ex = px + Math.cos(ang) * len;
    const ey = py - Math.sin(ang) * len;
    ctx.strokeStyle = depth > 1 ? dark : color;
    ctx.lineWidth = Math.max(0.6, wd);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(
      px + Math.cos(ang - 0.16) * len * 0.55,
      py - Math.sin(ang - 0.16) * len * 0.55,
      ex, ey
    );
    ctx.stroke();
    // 受光侧细线
    if (depth >= 2) {
      ctx.strokeStyle = rgba(lit, 0.14);
      ctx.lineWidth = Math.max(0.5, wd * 0.32);
      ctx.beginPath();
      ctx.moveTo(px + 0.6, py - 0.6);
      ctx.lineTo(ex + 0.6, ey - 0.9);
      ctx.stroke();
    }
    if (depth <= 0) {
      // 末端细枝
      for (let i = 0; i < 2; i++) {
        const a2 = ang + (r() - 0.5) * 1.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.5, wd * 0.3);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(a2) * len * 0.5, ey - Math.sin(a2) * len * 0.5);
        ctx.stroke();
      }
      return;
    }
    const forks = 2 + (r() > 0.55 ? 1 : 0);
    for (let i = 0; i < forks; i++) {
      const spread = (i - (forks - 1) / 2) * (0.52 + r() * 0.34);
      grow(ex, ey, ang + spread, len * (0.62 + r() * 0.14), wd * 0.64, depth - 1);
    }
  };
  // 根部
  ctx.fillStyle = rgba('#000000', 0.3);
  ctx.beginPath();
  ctx.ellipse(x, baseY + 1, h * 0.035, h * 0.012, 0, 0, TAU);
  ctx.fill();
  grow(x, baseY, Math.PI / 2 + (r() - 0.5) * 0.16, h * 0.42, Math.max(1.6, h * 0.028), 3);
  ctx.restore();
}


/** 石灯笼：石础 + 灯杆 + 火袋 + 笠，灯室有暖光与地面光池 */
function drawLantern(ctx, x, baseY, h, color, lightColor, t, phase) {
  const w = h * 0.34;
  const dark = mix(color, '#04060b', 0.4);
  const lit = mix(color, '#ffffff', 0.2);
  const flick = 0.86 + 0.14 * Math.sin(t * 2.1 + phase) * Math.sin(t * 0.9 + phase * 1.7);
  ctx.save();
  ctx.lineCap = 'butt';

  // 地面光池
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * flick;
  ctx.fillStyle = rgba(lightColor, 0.12);
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, w * 1.7, Math.max(3, w * 0.42), 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 石础
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.42, baseY + 1);
  ctx.lineTo(x + w * 0.42, baseY + 1);
  ctx.lineTo(x + w * 0.3, baseY - h * 0.08);
  ctx.lineTo(x - w * 0.3, baseY - h * 0.08);
  ctx.closePath();
  ctx.fill();
  // 灯杆
  ctx.fillStyle = color;
  ctx.fillRect(x - w * 0.14, baseY - h * 0.62, w * 0.28, h * 0.55);
  ctx.fillStyle = rgba(lit, 0.14);
  ctx.fillRect(x + w * 0.02, baseY - h * 0.62, Math.max(0.8, w * 0.1), h * 0.55);

  // 火袋（灯室）
  const boxY = baseY - h * 0.78;
  const boxH = h * 0.17;
  ctx.fillStyle = color;
  ctx.fillRect(x - w * 0.42, boxY, w * 0.84, boxH);
  // 灯窗（暖光）
  ctx.fillStyle = rgba(lightColor, 0.35 + 0.4 * flick);
  ctx.fillRect(x - w * 0.3, boxY + boxH * 0.2, w * 0.6, boxH * 0.6);
  ctx.fillStyle = rgba('#fff6d8', 0.3 * flick);
  ctx.fillRect(x - w * 0.16, boxY + boxH * 0.32, w * 0.32, boxH * 0.36);
  // 窗棂
  ctx.strokeStyle = rgba(dark, 0.7);
  ctx.lineWidth = Math.max(0.6, w * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, boxY + boxH * 0.2);
  ctx.lineTo(x, boxY + boxH * 0.8);
  ctx.moveTo(x - w * 0.3, boxY + boxH * 0.5);
  ctx.lineTo(x + w * 0.3, boxY + boxH * 0.5);
  ctx.stroke();

  // 笠（伞盖）
  ctx.fillStyle = mix(color, '#000000', 0.2);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, boxY + h * 0.01);
  ctx.quadraticCurveTo(x, boxY - h * 0.1, x + w * 0.62, boxY + h * 0.01);
  ctx.lineTo(x + w * 0.4, boxY + h * 0.05);
  ctx.lineTo(x - w * 0.4, boxY + h * 0.05);
  ctx.closePath();
  ctx.fill();
  // 宝顶
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.arc(x, boxY - h * 0.085, Math.max(1, w * 0.1), 0, TAU);
  ctx.fill();

  // 灯火辉光（发光用加法，结构已经画完了）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, boxY + boxH * 0.5, w * 2.6, w * 2.2, lightColor, 0.2 * flick, true);
  glow(ctx, x, boxY + boxH * 0.5, w * 1.1, w * 1.0, '#fff4d0', 0.3 * flick, true);
  ctx.restore();
  ctx.restore();
}


/** 芦苇：细长草叶 + 穗头，风来时整簇同向倾，穗尖带一点冷光 */
function drawReeds(ctx, x, baseY, h, color, headColor, t, phase) {
  const dark = mix(color, '#04060b', 0.35);
  const sway = Math.sin(t * 1.1 + phase) * h * 0.045;
  const sway2 = Math.sin(t * 0.7 + phase * 0.6) * h * 0.03;
  ctx.save();
  ctx.lineCap = 'round';
  // 叶片几何逐叶算，但按「亮色 / 暗色 / 叶缘」合并成 3 条路径批量描边：
  // 湖面芦苇层每帧要画 32 簇，旧实现每簇 ~18 次 stroke（每帧 600+ 次），这里压到 5 次。
  const lwBlade = Math.max(0.8, h * 0.014);
  const lwEdge = Math.max(0.5, h * 0.006);
  const bxOf = (i) => x + (hash1(i * 37 + phase * 13 + 3) - 0.5) * h * 0.34;
  const bhOf = (i) => h * (0.45 + hash1(i * 17 + 5) * 0.55);
  const leanOf = (i) => (hash1(i * 29 + 7) - 0.5) * h * 0.2 + sway * (0.4 + hash1(i * 37 + phase * 13 + 3));

  for (const pass of [0, 1]) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < 9; i++) {
      if ((i % 3 === 0) !== (pass === 1)) continue;
      const bx = bxOf(i), bh = bhOf(i), lean = leanOf(i);
      ctx.moveTo(bx, baseY);
      ctx.quadraticCurveTo(bx + lean * 0.35, baseY - bh * 0.55, bx + lean, baseY - bh);
      any = true;
    }
    if (any) {
      ctx.strokeStyle = pass === 1 ? dark : color;
      ctx.lineWidth = lwBlade;
      ctx.stroke();
    }
  }
  // 叶缘亮线（细叶才有"草"的质感）
  ctx.beginPath();
  for (let i = 0; i < 9; i += 2) {
    const bx = bxOf(i), bh = bhOf(i), lean = leanOf(i);
    ctx.moveTo(bx + 0.5, baseY - bh * 0.1);
    ctx.quadraticCurveTo(bx + lean * 0.4 + 0.5, baseY - bh * 0.55, bx + lean, baseY - bh);
  }
  ctx.strokeStyle = rgba(mix(color, '#ffffff', 0.25), 0.16);
  ctx.lineWidth = lwEdge;
  ctx.stroke();

  // 穗头：4 根杆一次 stroke，4 颗穗粒一次 fill
  const plumX = [], plumY = [];
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const u = hash1(i * 53 + phase * 7 + 11);
    const bx = x + (u - 0.5) * h * 0.3;
    const bh = h * (0.82 + hash1(i * 11 + 2) * 0.18);
    const tx = bx + sway;
    const ty = baseY - bh;
    plumX.push(tx); plumY.push(ty);
    ctx.moveTo(bx, baseY);
    ctx.quadraticCurveTo(bx + sway * 0.4, baseY - bh * 0.6, tx, ty);
  }
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(0.8, h * 0.012);
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    ctx.ellipse(plumX[i] + sway2 * 0.2, plumY[i], Math.max(1.2, h * 0.018), Math.max(3, h * 0.055), sway * 0.02, 0, TAU);
  }
  ctx.fillStyle = rgba(headColor, 0.75);
  ctx.fill();
  ctx.restore();
}


/** 水晶：多根锐利晶柱，每根有受光面 / 暗面 / 棱线，底部有接触阴影与冷光 */
function drawCrystal(ctx, x, baseY, h, w, color, light) {
  const dark = mix(color, '#0a0614', 0.45);
  const lit = mix(color, light || '#ffffff', 0.45);
  ctx.save();
  // 接触阴影
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, baseY + 2, w * 0.62, Math.max(3, w * 0.14), 0, 0, TAU);
  ctx.fill();

  const shards = 5;
  for (let i = 0; i < shards; i++) {
    const u = (i + 0.5) / shards;
    const bx = x + (u - 0.5) * w * 0.92;
    const bh = h * (0.42 + hash1(i * 31 + 7) * 0.58);
    const bw = w * (0.1 + hash1(i * 17 + 3) * 0.12);
    const lean = (hash1(i * 47 + 5) - 0.5) * w * 0.3;
    const tipX = bx + lean;
    const tipY = baseY - bh;
    // 主体
    ctx.fillStyle = mix(color, '#000000', 0.16 + i * 0.02);
    ctx.beginPath();
    ctx.moveTo(bx - bw, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(bx + bw, baseY);
    ctx.closePath();
    ctx.fill();
    // 受光面
    ctx.fillStyle = rgba(lit, 0.32);
    ctx.beginPath();
    ctx.moveTo(bx - bw, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(bx - bw * 0.1, baseY);
    ctx.closePath();
    ctx.fill();
    // 暗面
    ctx.fillStyle = rgba(dark, 0.55);
    ctx.beginPath();
    ctx.moveTo(bx + bw, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(bx + bw * 0.25, baseY);
    ctx.closePath();
    ctx.fill();
    // 棱线
    ctx.strokeStyle = rgba(lit, 0.55);
    ctx.lineWidth = Math.max(0.7, w * 0.008);
    ctx.beginPath();
    ctx.moveTo(bx - bw * 0.1, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  }
  // 底部的冷光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, baseY - h * 0.18, w * 1.1, h * 0.32, light || color, 0.16, true);
  ctx.restore();
  ctx.restore();
}


/** 岩石：多面体剪影 + 顶面受光 + 底部接触阴影 + 苔痕 */
function drawRock(ctx, x, baseY, w, h, color) {
  const dark = mix(color, '#04060b', 0.38);
  const lit = mix(color, '#ffffff', 0.18);
  const r = mulberry32(((w * 31 + h * 17) | 0) + 7);
  ctx.save();
  // 接触阴影
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x, baseY + 1, w * 0.52, Math.max(3, h * 0.12), 0, 0, TAU);
  ctx.fill();
  // 主体轮廓
  ctx.fillStyle = color;
  ctx.beginPath();
  const pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const px = x + (u - 0.5) * w;
    const py = baseY - Math.sin(u * Math.PI) * h * (0.72 + hash1(i * 29 + (w | 0)) * 0.28) - (i === 0 || i === n ? 0 : r() * h * 0.06);
    pts.push([px, py]);
  }
  ctx.moveTo(pts[0][0], baseY);
  for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineTo(pts[pts.length - 1][0], baseY);
  ctx.closePath();
  ctx.fill();
  // 顶面受光
  ctx.fillStyle = rgba(lit, 0.2);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], lerp(pts[i][1], baseY, 0.32));
  ctx.closePath();
  ctx.fill();
  // 暗部与裂纹
  ctx.strokeStyle = rgba(dark, 0.5);
  ctx.lineWidth = Math.max(0.8, h * 0.016);
  for (let i = 0; i < 3; i++) {
    const px = x + (r() - 0.5) * w * 0.6;
    const py = baseY - h * (0.2 + r() * 0.5);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (r() - 0.5) * w * 0.18, py + h * (0.12 + r() * 0.2));
    ctx.stroke();
  }
  // 苔痕
  ctx.fillStyle = rgba(mix(color, '#6a8a4a', 0.5), 0.2);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const px = x + (r() - 0.5) * w * 0.72;
    const py = baseY - h * (0.05 + r() * 0.2);
    ctx.moveTo(px + 3, py);
    ctx.ellipse(px, py, 3 + r() * 4, 1.4 + r() * 2, 0, 0, TAU);
  }
  ctx.fill();
  ctx.restore();
}


/** 竹栅栏：竖杆带竹节 + 两道横档，顶端削尖并受光 */
function drawFence(ctx, x, y, w, h, color, tipColor) {
  const dark = mix(color, '#04060b', 0.35);
  const lit = tipColor || mix(color, '#ffffff', 0.25);
  ctx.save();
  // 底色板（避免缝里透出天空）
  ctx.fillStyle = rgba(mix(color, '#000000', 0.35), 0.5);
  ctx.fillRect(x, y - h * 0.12, w, h * 0.16);

  const step = Math.max(9, h * 0.34);
  for (let px = x + step * 0.4; px < x + w; px += step) {
    const hh = h * (0.85 + hash1(px * 0.37) * 0.3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px - 1.4, y);
    ctx.lineTo(px + 1.4, y);
    ctx.lineTo(px + 1.1, y - hh + 3);
    ctx.lineTo(px + 0.5, y - hh - 3);
    ctx.lineTo(px - 0.5, y - hh - 3);
    ctx.lineTo(px - 1.1, y - hh + 3);
    ctx.closePath();
    ctx.fill();
    // 竹节
    ctx.fillStyle = rgba(dark, 0.55);
    ctx.fillRect(px - 1.3, y - hh * 0.55, 2.6, 1);
    // 受光侧
    ctx.fillStyle = rgba(lit, 0.22);
    ctx.fillRect(px + 0.2, y - hh + 3, 0.9, hh - 3);
  }
  // 横档
  for (let i = 0; i < 2; i++) {
    const yy = y - h * (0.28 + i * 0.42);
    ctx.fillStyle = mix(color, '#000000', 0.18);
    ctx.fillRect(x, yy, w, h * 0.06);
    ctx.fillStyle = rgba(lit, 0.12);
    ctx.fillRect(x, yy, w, Math.max(0.7, h * 0.012));
  }
  ctx.restore();
}


/** 神社社殿：石基 + 木柱 + 格子墙 + 大屋顶（瓦垄/翘檐/檐下暗部）+ 窗内火光 */
function drawShrineBuilding(ctx, x, baseY, h, color, rim, windowColor, t) {
  const w = h * 1.42;
  const dark = mix(color, '#04060b', 0.45);
  const lit = rim ? mix(color, rim, 0.4) : mix(color, '#ffffff', 0.16);
  const flick = 0.8 + 0.2 * Math.sin(t * 1.7) * Math.sin(t * 0.8 + 1.3);
  ctx.save();
  ctx.lineCap = 'butt';

  // 石基
  ctx.fillStyle = mix(dark, '#000000', 0.15);
  ctx.fillRect(x - w * 0.5, baseY - h * 0.07, w, h * 0.07);
  ctx.fillStyle = rgba(lit, 0.1);
  ctx.fillRect(x - w * 0.5, baseY - h * 0.07, w, Math.max(0.8, h * 0.008));

  // 墙体（木色，下半更深）
  const bodyTop = baseY - h * 0.5;
  ctx.fillStyle = color;
  ctx.fillRect(x - w * 0.38, bodyTop, w * 0.76, h * 0.43);
  const bodyGrad = ctx.createLinearGradient(0, bodyTop, 0, baseY - h * 0.07);
  bodyGrad.addColorStop(0, rgba(lit, 0.1));
  bodyGrad.addColorStop(1, rgba(dark, 0.55));
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(x - w * 0.38, bodyTop, w * 0.76, h * 0.43);

  // 落柱
  for (let i = -1; i <= 1; i += 2) {
    ctx.fillStyle = mix(color, '#000000', 0.22);
    ctx.fillRect(x + i * w * 0.33, bodyTop, Math.max(1.4, w * 0.035), h * 0.43);
    ctx.fillStyle = rgba(lit, 0.16);
    ctx.fillRect(x + i * w * 0.33 + Math.max(1, w * 0.022), bodyTop, Math.max(0.7, w * 0.008), h * 0.43);
  }
  // 格子墙（横行）
  ctx.strokeStyle = rgba(dark, 0.4);
  ctx.lineWidth = Math.max(0.6, h * 0.005);
  ctx.beginPath();
  for (let i = 1; i <= 5; i++) {
    const yy = bodyTop + (h * 0.43 * i) / 6;
    ctx.moveTo(x - w * 0.36, yy);
    ctx.lineTo(x - w * 0.06, yy);
    ctx.moveTo(x + w * 0.06, yy);
    ctx.lineTo(x + w * 0.36, yy);
  }
  ctx.stroke();

  // 中央门洞 + 窗（暖光）
  ctx.fillStyle = rgba(dark, 0.85);
  ctx.fillRect(x - w * 0.05, bodyTop + h * 0.05, w * 0.1, h * 0.4);
  ctx.fillStyle = rgba(windowColor, 0.3 + 0.45 * flick);
  ctx.fillRect(x - w * 0.2, bodyTop + h * 0.1, w * 0.1, h * 0.1);
  ctx.fillRect(x + w * 0.1, bodyTop + h * 0.1, w * 0.1, h * 0.1);

  // 大屋顶
  const roofY = bodyTop;
  ctx.fillStyle = mix(color, '#000000', 0.3);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.56, roofY + h * 0.06);
  ctx.quadraticCurveTo(x - w * 0.3, roofY - h * 0.1, x, roofY - h * 0.16);
  ctx.quadraticCurveTo(x + w * 0.3, roofY - h * 0.1, x + w * 0.56, roofY + h * 0.06);
  ctx.lineTo(x + w * 0.52, roofY + h * 0.13);
  ctx.quadraticCurveTo(x, roofY - h * 0.06, x - w * 0.52, roofY + h * 0.13);
  ctx.closePath();
  ctx.fill();
  // 瓦垄
  ctx.strokeStyle = rgba(dark, 0.5);
  ctx.lineWidth = Math.max(0.6, h * 0.006);
  ctx.beginPath();
  for (let k = -4; k <= 4; k++) {
    const u = k / 4;
    ctx.moveTo(x + u * w * 0.5, roofY + h * 0.055 - Math.abs(u) * h * 0.045);
    ctx.lineTo(x + u * w * 0.42, roofY + h * 0.1);
  }
  ctx.stroke();
  // 檐口受光 + 檐下阴影
  ctx.strokeStyle = rgba(lit, 0.5);
  ctx.lineWidth = Math.max(0.9, h * 0.008);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.55, roofY + h * 0.062);
  ctx.quadraticCurveTo(x, roofY - h * 0.16, x + w * 0.55, roofY + h * 0.062);
  ctx.stroke();
  ctx.fillStyle = rgba('#000000', 0.4);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, roofY + h * 0.09);
  ctx.quadraticCurveTo(x, roofY - h * 0.05, x + w * 0.5, roofY + h * 0.09);
  ctx.lineTo(x + w * 0.5, roofY + h * 0.13);
  ctx.lineTo(x - w * 0.5, roofY + h * 0.13);
  ctx.closePath();
  ctx.fill();

  // 屋檐下的暖光（灯笼位置）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x - w * 0.22, roofY + h * 0.16, h * 0.22, h * 0.16, windowColor, 0.16 * flick, true);
  glow(ctx, x + w * 0.22, roofY + h * 0.16, h * 0.22, h * 0.16, windowColor, 0.16 * flick, true);
  ctx.restore();
  ctx.restore();
}


/** 洋馆：扶壁 + 尖顶 + 拱窗暖光 + 屋脊瓦线，整体压成高对比剪影 */
function drawGothicMansion(ctx, x, baseY, h, color, rim, windowColor, t) {
  const w = h * 0.9;
  const dark = mix(color, '#04060b', 0.45);
  const lit = rim ? mix(color, rim, 0.45) : mix(color, '#ffffff', 0.16);
  const flick = 0.75 + 0.25 * Math.sin(t * 1.3) * Math.sin(t * 0.6 + 2.1);
  ctx.save();

  // 主体
  const bodyTop = baseY - h * 0.62;
  ctx.fillStyle = color;
  ctx.fillRect(x - w * 0.5, bodyTop, w, h * 0.62);
  const grd = ctx.createLinearGradient(0, bodyTop, 0, baseY);
  grd.addColorStop(0, rgba(lit, 0.1));
  grd.addColorStop(0.6, rgba(dark, 0.2));
  grd.addColorStop(1, rgba(dark, 0.65));
  ctx.fillStyle = grd;
  ctx.fillRect(x - w * 0.5, bodyTop, w, h * 0.62);
  // 受光侧竖边
  ctx.fillStyle = rgba(lit, 0.14);
  ctx.fillRect(x + w * 0.5 - Math.max(1, w * 0.035), bodyTop, Math.max(1, w * 0.035), h * 0.62);

  // 扶壁
  for (let i = -2; i <= 2; i++) {
    const px = x + i * w * 0.24;
    ctx.fillStyle = mix(color, '#000000', 0.3);
    ctx.fillRect(px - w * 0.02, bodyTop + h * 0.06, w * 0.04, h * 0.5);
    ctx.fillStyle = rgba(lit, 0.08);
    ctx.fillRect(px + w * 0.014, bodyTop + h * 0.06, w * 0.006, h * 0.5);
  }

  // 拱窗（两排，暖光，少量窗熄着）
  const winW = w * 0.075;
  const winH = h * 0.1;
  for (let row = 0; row < 2; row++) {
    for (let i = -1; i <= 1; i++) {
      if (row === 0 && i === 0) continue;
      const wx = x + i * w * 0.26;
      const wy = bodyTop + h * 0.14 + row * h * 0.2;
      const on = hash1(i * 37 + row * 53 + 7) > 0.28;
      ctx.fillStyle = rgba(dark, 0.9);
      ctx.beginPath();
      ctx.moveTo(wx - winW * 0.5, wy + winH);
      ctx.lineTo(wx - winW * 0.5, wy + winH * 0.36);
      ctx.quadraticCurveTo(wx, wy - winH * 0.12, wx + winW * 0.5, wy + winH * 0.36);
      ctx.lineTo(wx + winW * 0.5, wy + winH);
      ctx.closePath();
      ctx.fill();
      if (on) {
        ctx.fillStyle = rgba(windowColor, 0.24 + 0.34 * flick);
        ctx.fillRect(wx - winW * 0.34, wy + winH * 0.42, winW * 0.68, winH * 0.5);
        ctx.strokeStyle = rgba(dark, 0.7);
        ctx.lineWidth = Math.max(0.5, w * 0.004);
        ctx.beginPath();
        ctx.moveTo(wx, wy + winH * 0.4);
        ctx.lineTo(wx, wy + winH);
        ctx.stroke();
      }
    }
  }

  // 主屋顶（陡坡尖顶）
  ctx.fillStyle = mix(color, '#000000', 0.34);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.56, bodyTop + h * 0.035);
  ctx.lineTo(x, bodyTop - h * 0.16);
  ctx.lineTo(x + w * 0.56, bodyTop + h * 0.035);
  ctx.lineTo(x + w * 0.5, bodyTop + h * 0.075);
  ctx.lineTo(x, bodyTop - h * 0.1);
  ctx.lineTo(x - w * 0.5, bodyTop + h * 0.075);
  ctx.closePath();
  ctx.fill();
  // 屋脊瓦线
  ctx.strokeStyle = rgba(dark, 0.55);
  ctx.lineWidth = Math.max(0.6, h * 0.004);
  ctx.beginPath();
  for (let k = -3; k <= 3; k++) {
    const u = k / 3;
    ctx.moveTo(x + u * w * 0.46, bodyTop + h * 0.04 - Math.abs(u) * h * 0.05);
    ctx.lineTo(x + u * w * 0.2, bodyTop - h * 0.11 + Math.abs(u) * h * 0.02);
  }
  ctx.stroke();
  // 屋脊受光
  ctx.strokeStyle = rgba(lit, 0.4);
  ctx.lineWidth = Math.max(0.8, h * 0.006);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.55, bodyTop + h * 0.038);
  ctx.lineTo(x, bodyTop - h * 0.158);
  ctx.lineTo(x + w * 0.55, bodyTop + h * 0.038);
  ctx.stroke();

  // 侧塔尖顶
  for (let s = -1; s <= 1; s += 2) {
    const tx = x + s * w * 0.52;
    const ty = bodyTop + h * 0.02;
    ctx.fillStyle = mix(color, '#000000', 0.3);
    ctx.beginPath();
    ctx.moveTo(tx - w * 0.09, ty);
    ctx.lineTo(tx, ty - h * 0.2);
    ctx.lineTo(tx + w * 0.09, ty);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(lit, 0.3);
    ctx.lineWidth = Math.max(0.7, h * 0.005);
    ctx.beginPath();
    ctx.moveTo(tx - w * 0.085, ty);
    ctx.lineTo(tx, ty - h * 0.19);
    ctx.lineTo(tx + w * 0.085, ty);
    ctx.stroke();
    // 塔尖宝珠
    ctx.fillStyle = rgba(lit, 0.8);
    ctx.beginPath();
    ctx.arc(tx, ty - h * 0.205, Math.max(1, w * 0.012), 0, TAU);
    ctx.fill();
  }

  // 窗光外溢
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, bodyTop + h * 0.2, w * 0.5, h * 0.28, windowColor, 0.08 * flick, true);
  ctx.restore();
  ctx.restore();
}


/** 山脊上的草丛剪影：细叶、两色、带一点受光叶尖 */
function drawGrassSilhouette(ctx, pts, color, seed, count, maxH) {
  const dark = mix(color, '#04060b', 0.3);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const u = hash1(seed + i * 31 + 7);
    const idx = Math.min(pts.length - 1, Math.floor(u * (pts.length - 1)));
    const a = pts[idx];
    const b = pts[Math.min(pts.length - 1, idx + 1)];
    const uu = u * (pts.length - 1) - idx;
    const x = lerp(a[0], b[0], uu) + (hash1(seed + i * 17 + 3) - 0.5) * 18;
    const y = lerp(a[1], b[1], uu) + 4;
    const hh = 7 + hash1(seed + i * 53 + 11) * maxH;
    const lean = (hash1(seed + i * 11 + 5) - 0.5) * 14;
    ctx.strokeStyle = i % 3 === 0 ? dark : color;
    ctx.lineWidth = 1.1 + hash1(seed + i * 7 + 1) * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + lean * 0.35, y - hh * 0.62, x + lean, y - hh);
    ctx.stroke();
    if (i % 4 === 0) {
      ctx.strokeStyle = rgba(mix(color, '#ffffff', 0.3), 0.2);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x + 0.4, y - hh * 0.3);
      ctx.quadraticCurveTo(x + lean * 0.4, y - hh * 0.66, x + lean, y - hh);
      ctx.stroke();
    }
  }
  ctx.restore();
}


/** 彼岸花：细长花茎 + 反卷花瓣 + 长花丝 + 花心冷光 */
function drawSpiderLily(ctx, x, baseY, h, petalCol, stemCol, t, phase) {
  const sway = Math.sin(t * 0.8 + phase) * 3.2;
  const tipX = x + sway;
  const tipY = baseY - h;
  const headR = Math.max(10, h * 0.2);
  ctx.save();
  ctx.lineCap = 'round';

  // 地面接触阴影
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x, baseY + 1, h * 0.05, Math.max(2, h * 0.012), 0, 0, TAU);
  ctx.fill();

  // 花茎（两段，带一点粗度变化）
  ctx.strokeStyle = stemCol;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + sway * 0.35, baseY - h * 0.55, tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = rgba(mix(stemCol, '#ffffff', 0.3), 0.2);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + 0.6, baseY - h * 0.1);
  ctx.quadraticCurveTo(x + sway * 0.35 + 0.6, baseY - h * 0.55, tipX + 0.5, tipY + 0.4);
  ctx.stroke();

  // 花瓣（七枚反卷）
  for (let i = 0; i < 7; i++) {
    const a = (TAU * i) / 7 + phase * 0.3 + Math.sin(t * 0.7 + i) * 0.05;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    ctx.fillStyle = rgba(petalCol, i % 2 ? 0.9 : 1);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(
      tipX + ca * headR * 0.85, tipY + sa * headR * 0.5,
      tipX + ca * headR * 1.05, tipY + sa * headR * 0.55 - headR * 0.35
    );
    ctx.quadraticCurveTo(
      tipX + ca * headR * 0.5, tipY + sa * headR * 0.24 + 1.5,
      tipX, tipY
    );
    ctx.fill();
    // 花瓣受光亮边
    ctx.strokeStyle = rgba(mix(petalCol, '#ffffff', 0.45), 0.22);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(
      tipX + ca * headR * 0.85, tipY + sa * headR * 0.5,
      tipX + ca * headR * 1.05, tipY + sa * headR * 0.55 - headR * 0.35
    );
    ctx.stroke();
  }

  // 花丝
  ctx.strokeStyle = rgba(mix(petalCol, '#ffffff', 0.35), 0.8);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (TAU * i) / 7 + 0.42 + phase * 0.28;
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(
      tipX + Math.cos(a) * headR * 0.9, tipY + Math.sin(a) * headR * 0.45,
      tipX + Math.cos(a) * headR * 1.55, tipY + Math.sin(a) * headR * 0.75 + headR * 0.55
    );
  }
  ctx.stroke();

  // 花心冷光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, tipX, tipY, headR * 1.5, headR * 1.2, petalCol, 0.16, true);
  ctx.restore();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 七套主题的三层视差                                                   */
/* ------------------------------------------------------------------ */

const PERIOD_FAR = 2400;
const PERIOD_MID = 2000;
const PERIOD_NEAR = 1600;

const PARALLAX = {
  shrine: {
    far(ctx, th, ox, oy, t) {
      repeatX(PERIOD_FAR, ox, (x0) => {
        // 最远一层：淡色起伏山脊
        const farPts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          farPts.push([
            x0 + u * PERIOD_FAR,
            402 + oy - 74 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.6)) - 18 * Math.sin(TAU * 5 * u + 2.1),
          ]);
        }
        fillSkylineGrad(
          ctx, farPts, 300, 770,
          mix(th.far, th.sky[2], 0.46),
          mix(th.far, th.sky[2], 0.08)
        );

        // 稍近一层
        const midPts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          midPts.push([
            x0 + u * PERIOD_FAR,
            452 + oy - 36 * (0.5 + 0.5 * Math.sin(TAU * 3 * u + 1.7)) - 12 * Math.sin(TAU * 7 * u + 0.4),
          ]);
        }
        fillSkylineGrad(
          ctx, midPts, 390, 770,
          mix(th.far, th.sky[2], 0.2),
          mix(th.far, '#000000', 0.12)
        );

        // 山脊上的小神社 + 鸟居剪影
        const shrineCol = mix(th.far, '#000000', 0.3);
        drawTorii(ctx, x0 + 430, 466 + oy, 46, shrineCol);
        drawPagoda(ctx, x0 + 1480, 492 + oy, 58, shrineCol, 3);
        drawTorii(ctx, x0 + 1870, 484 + oy, 38, shrineCol);
        drawPine(ctx, x0 + 1010, 470 + oy, 50, 30, shrineCol);
        drawPine(ctx, x0 + 1050, 474 + oy, 36, 22, shrineCol);

        // 归鸟
        ctx.save();
        ctx.strokeStyle = rgba(mix(th.far, '#000000', 0.2), 0.5);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const bx = x0 + 260 + i * 52 + Math.sin(t * 0.5 + i) * 16;
          const by = 216 + i * 13 + Math.cos(t * 0.42 + i * 1.7) * 7;
          const s = 5 + (i % 2) * 2;
          ctx.moveTo(bx - s, by);
          ctx.quadraticCurveTo(bx - s * 0.45, by - s * 0.55, bx, by - s * 0.15);
          ctx.quadraticCurveTo(bx + s * 0.45, by - s * 0.55, bx + s, by);
        }
        ctx.stroke();
        ctx.restore();
      });

      glow(ctx, 640, 458 + oy, 780, 130, th.haze, 0.12, false);
    },

    mid(ctx, th, ox, oy, t) {
      repeatX(PERIOD_MID, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          pts.push([
            x0 + u * PERIOD_MID,
            548 + oy - 32 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.9)) - 10 * Math.sin(TAU * 6 * u),
          ]);
        }
        fillSkylineGrad(
          ctx, pts, 470, 770,
          mix(th.mid, th.sky[2], 0.13),
          mix(th.mid, '#000000', 0.3)
        );

        // 樱树林
        for (let i = 0; i < 7; i++) {
          const px = x0 + 110 + i * 288 + hash1(i * 19 + 5) * 70;
          const hh = 128 + hash1(i * 29 + 7) * 82;
          drawCherry(
            ctx, px, 566 + oy, hh, i * 3 + 1,
            mix(th.mid, '#000000', 0.22),
            mix(th.mid, th.accent, 0.3)
          );
        }

        // 大鸟居
        drawTorii(ctx, x0 + 1040, 594 + oy, 196, mix(th.mid, '#000000', 0.44), th.accent);

        // 石灯笼
        drawLantern(ctx, x0 + 420, 596 + oy, 90, mix(th.mid, '#000000', 0.5), th.glow, t, 0.4);
        drawLantern(ctx, x0 + 1560, 600 + oy, 72, mix(th.mid, '#000000', 0.5), th.glow, t, 2.1);
      });
      glow(ctx, 320, 620 + oy, 560, 110, th.haze, 0.1, false);
    },

    near(ctx, th, ox, oy, t) {
      repeatX(PERIOD_NEAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([
            x0 + u * PERIOD_NEAR,
            664 + oy - 20 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 2.2)) - 8 * Math.sin(TAU * 5 * u + 1),
          ]);
        }
        fillSkylineGrad(ctx, pts, 630, 780, mix(th.near, th.sky[2], 0.05), th.near);
        drawGrassSilhouette(ctx, pts, th.near, 7, 26, 26);

        // 从画面顶端垂下的樱花枝
        const nearDark = mix(th.near, '#000000', 0.25);
        ctx.save();
        ctx.strokeStyle = nearDark;
        ctx.lineCap = 'round';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(x0 + 20, -30);
        ctx.quadraticCurveTo(x0 + 180, 40, x0 + 430, 108);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x0 + 300, 62);
        ctx.quadraticCurveTo(x0 + 360, 104, x0 + 420, 132);
        ctx.moveTo(x0 + 190, 26);
        ctx.quadraticCurveTo(x0 + 230, 62, x0 + 236, 100);
        ctx.stroke();

        // 花团：沿枝条挂下的几簇小花，每簇由多个圆瓣组成
        const tuffBase = mix(th.near, th.accent, 0.3);
        const tuffLit = mix(th.accent, '#ffffff', 0.25);
        for (let c = 0; c < 5; c++) {
          const u = 0.36 + c * 0.145;
          const iu = 1 - u;
          const bx = iu * iu * 20 + 2 * u * iu * 180 + u * u * 430;
          const by = iu * iu * -30 + 2 * u * iu * 40 + u * u * 108;
          const cx0 = x0 + bx;
          const cy0 = by + 8 + hash1(c * 31 + 9) * 18;
          ctx.save();
          ctx.fillStyle = tuffBase;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU + c;
            const rr = 5.5 + hash1(c * 17 + k * 23 + 1) * 4.5;
            const ex = cx0 + Math.cos(a) * (7 + hash1(c * 7 + k) * 6);
            const ey = cy0 + Math.sin(a) * (5 + hash1(c * 11 + k) * 4);
            ctx.moveTo(ex + rr, ey);
            ctx.arc(ex, ey, rr, 0, TAU);
          }
          ctx.fill();
          // 受光的小亮点
          ctx.fillStyle = tuffLit;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const ex = cx0 - 6 + hash1(c * 41 + k * 13) * 16;
            const ey = cy0 - 6 + hash1(c * 19 + k * 7) * 10;
            const rr = 1.6 + hash1(c * 5 + k * 3) * 1.6;
            ctx.moveTo(ex + rr, ey);
            ctx.arc(ex, ey, rr, 0, TAU);
          }
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();

        // 近景石灯笼
        drawLantern(ctx, x0 + 1330, 716 + oy, 186, mix(th.near, '#000000', 0.3), th.glow, t, 1.3);
      });
    },
  },

  forest: {
    far(ctx, th, ox, oy, t) {
      repeatX(PERIOD_FAR, ox, (x0) => {
        // 针叶林山脊：一条贝塞尔天际线 + 连续小三角树
        const pts = [];
        for (let i = 0; i <= 18; i++) {
          const u = i / 18;
          pts.push([
            x0 + u * PERIOD_FAR,
            420 + oy - 40 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 1.2)) - 14 * Math.sin(TAU * 6 * u),
          ]);
        }
        fillSkylineGrad(
          ctx, pts, 340, 780,
          mix(th.far, th.sky[2], 0.3),
          mix(th.far, '#000000', 0.3)
        );

        // 树尖
        ctx.save();
        ctx.fillStyle = mix(th.far, th.sky[2], 0.12);
        ctx.beginPath();
        for (let i = 0; i < 46; i++) {
          const bx = x0 + (i + 0.5) * (PERIOD_FAR / 46);
          const bh = 26 + hash1(i * 37 + 9) * 66;
          const bw = 11 + hash1(i * 19 + 3) * 14;
          const by = 420 + oy - 4 - hash1(i * 71 + 5) * 26;
          ctx.moveTo(bx, by - bh);
          ctx.lineTo(bx - bw, by);
          ctx.lineTo(bx + bw, by);
          ctx.closePath();
        }
        ctx.fill();
        ctx.restore();

        // 极淡的月光树隙
        glow(ctx, x0 + 620, 330 + oy, 180, 240, th.haze, 0.05);
      });

      glow(ctx, 640, 452 + oy, 820, 120, th.haze, 0.1, false);
    },

    mid(ctx, th, ox, oy, t) {
      repeatX(PERIOD_MID, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          pts.push([
            x0 + u * PERIOD_MID,
            572 + oy - 24 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.3)) - 8 * Math.sin(TAU * 5 * u),
          ]);
        }
        fillSkylineGrad(ctx, pts, 520, 780, mix(th.mid, th.sky[2], 0.1), mix(th.mid, '#000000', 0.35));

        // 密林树干
        for (let i = 0; i < 12; i++) {
          const px = x0 + 60 + i * 168 + hash1(i * 23 + 3) * 40;
          const hh = 300 + hash1(i * 41 + 7) * 180;
          const lean = (hash1(i * 13 + 9) - 0.5) * 50;
          const wd = 15 + hash1(i * 17 + 1) * 16;
          const col = mix(th.mid, '#000000', 0.15 + (i % 3) * 0.06);
          ctx.save();
          ctx.fillStyle = col;
          ctx.beginPath();
          // 根部外扩、向上收细的树干
          ctx.moveTo(px - wd * 1.25, 646 + oy);
          ctx.quadraticCurveTo(px - wd * 0.75 + lean * 0.35, 520 + oy, px + lean - wd * 0.34, 150 + oy);
          ctx.lineTo(px + lean + wd * 0.4, 150 + oy);
          ctx.quadraticCurveTo(px + wd * 0.8 + lean * 0.35, 520 + oy, px + wd * 1.15, 646 + oy);
          ctx.closePath();
          ctx.fill();

          // 板根
          ctx.beginPath();
          ctx.moveTo(px - wd * 1.25, 646 + oy);
          ctx.lineTo(px - wd * 2.6, 648 + oy);
          ctx.quadraticCurveTo(px - wd * 1.6, 620 + oy, px - wd * 0.9, 612 + oy);
          ctx.closePath();
          ctx.moveTo(px + wd * 1.15, 646 + oy);
          ctx.lineTo(px + wd * 2.5, 649 + oy);
          ctx.quadraticCurveTo(px + wd * 1.7, 620 + oy, px + wd * 1.0, 612 + oy);
          ctx.closePath();
          ctx.fill();

          // 侧枝
          ctx.strokeStyle = col;
          ctx.lineCap = 'round';
          for (let b = 0; b < 2; b++) {
            const brY = 300 + hash1(i * 31 + b * 17 + 5) * 150 + oy;
            const dir = (i + b) % 2 ? 1 : -1;
            ctx.lineWidth = wd * (0.32 - b * 0.08);
            ctx.beginPath();
            ctx.moveTo(px + lean * 0.6, brY);
            ctx.quadraticCurveTo(px + dir * 56, brY - 22, px + dir * 96, brY - 58);
            ctx.stroke();
          }
          ctx.restore();

          // 树冠：三层碎叶团（暗底 / 中调 / 受光），边缘是碎叶轮廓而不是大椭圆
          const cy = 168 + oy + hash1(i * 29 + 7) * 76;
          const cwx = px + lean * 0.8;
          drawCanopy(ctx, cwx, cy, 118, 50,
            rgba(mix(th.mid, '#000000', 0.42), 0.96),
            rgba(mix(th.mid, th.accent, 0.12), 0.85),
            rgba(mix(th.mid, th.haze, 0.45), 0.5),
            i * 7 + 3, 0.55);
        }

        // 悬垂的藤蔓
        ctx.save();
        ctx.strokeStyle = mix(th.mid, th.accent, 0.12);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const px = x0 + 90 + i * 240 + hash1(i * 31 + 13) * 60;
          const len = 80 + hash1(i * 19 + 5) * 130;
          ctx.moveTo(px, 120 + oy);
          ctx.quadraticCurveTo(px + 18, 120 + len * 0.55 + oy, px + 6, 120 + len + oy);
        }
        ctx.stroke();
        ctx.restore();

        // 发光小蘑菇
        for (let i = 0; i < 4; i++) {
          const px = x0 + 220 + i * 430;
          const py = 604 + oy;
          ctx.save();
          ctx.fillStyle = rgba(th.accent, 0.5);
          ctx.beginPath();
          ctx.ellipse(px, py, 9, 4.5, 0, Math.PI, TAU);
          ctx.fill();
          glow(ctx, px, py - 2, 34, 26, th.accent, 0.3);
          ctx.restore();
        }
      });

      for (let i = 0; i < 3; i++) {
        const fx = ((i * 640 + 200 - (ox * 0.35)) % (VIEW_W + 400)) - 200;
        glow(ctx, fx, 600 + oy, 360, 90, th.haze, 0.1, false);
      }
    },

    near(ctx, th, ox, oy, t) {
      repeatX(PERIOD_NEAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([
            x0 + u * PERIOD_NEAR,
            676 + oy - 18 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 1.4)) - 9 * Math.sin(TAU * 5 * u),
          ]);
        }
        fillSkylineGrad(ctx, pts, 640, 780, mix(th.near, th.sky[2], 0.03), th.near);
        drawGrassSilhouette(ctx, pts, th.near, 11, 30, 24);

        // 左右两根巨大前景树干
        const col = mix(th.near, '#000000', 0.35);
        for (let s = 0; s < 2; s++) {
          const px = x0 + (s === 0 ? 90 : 1470);
          const wd = 44 + s * 12;
          ctx.save();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(px - wd * 0.5, 760);
          ctx.quadraticCurveTo(px - wd * 0.7, 520 + oy, px - wd * 0.4, 220 + oy);
          ctx.lineTo(px + wd * 0.35, 220 + oy);
          ctx.quadraticCurveTo(px + wd * 0.62, 520 + oy, px + wd * 0.55, 760);
          ctx.closePath();
          ctx.fill();
          // 树根
          ctx.beginPath();
          ctx.moveTo(px - wd * 0.5, 760);
          ctx.quadraticCurveTo(px - wd * 1.6, 704, px - wd * 2.2, 760);
          ctx.lineTo(px - wd * 0.4, 760);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // 蕨类 / 灌木
        const fernCol = mix(th.near, '#000000', 0.2);
        ctx.save();
        ctx.strokeStyle = fernCol;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const bx = x0 + 200 + i * 82 + hash1(i * 27 + 5) * 30;
          const by = 700 + oy;
          const hh = 30 + hash1(i * 41 + 11) * 50;
          const dir = i % 2 ? 1 : -1;
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + dir * hh * 0.5, by - hh * 0.7, bx + dir * hh * 0.8, by - hh);
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx - dir * hh * 0.4, by - hh * 0.6, bx - dir * hh * 0.6, by - hh * 0.95);
        }
        ctx.stroke();
        ctx.restore();
      });
    },
  },

  lake: {
    far(ctx, th, ox, oy, t) {
      repeatX(PERIOD_FAR, ox, (x0) => {
        // 低缓的湖岸丘陵
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          pts.push([
            x0 + u * PERIOD_FAR,
            430 + oy - 46 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 2.6)) - 14 * Math.sin(TAU * 4 * u + 0.8),
          ]);
        }
        fillSkylineGrad(
          ctx, pts, 360, 780,
          mix(th.far, th.sky[2], 0.52),
          mix(th.far, th.sky[2], 0.16)
        );

        // 更近一脉冷色丘陵
        const pts2 = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          pts2.push([
            x0 + u * PERIOD_FAR,
            470 + oy - 22 * (0.5 + 0.5 * Math.sin(TAU * 3 * u + 0.4)) - 8 * Math.sin(TAU * 7 * u),
          ]);
        }
        fillSkylineGrad(ctx, pts2, 430, 780, mix(th.far, th.sky[2], 0.24), mix(th.far, '#000000', 0.1));

        // 湖心小岛与鸟居
        const island = mix(th.far, '#000000', 0.22);
        drawRock(ctx, x0 + 1160, 470 + oy, 150, 34, island);
        drawTorii(ctx, x0 + 1150, 460 + oy, 58, island);

        // 远处冷杉
        for (let i = 0; i < 6; i++) {
          const px = x0 + 260 + i * 360 + hash1(i * 13 + 3) * 90;
          drawPine(ctx, px, 466 + oy, 54 + hash1(i * 7 + 1) * 34, 30, mix(th.far, '#000000', 0.16));
        }
      });

      // 水面之上的晨雾
      glow(ctx, 700, 470 + oy, 820, 90, th.haze, 0.14, false);
    },

    mid(ctx, th, ox, oy, t) {
      repeatX(PERIOD_MID, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          pts.push([
            x0 + u * PERIOD_MID,
            560 + oy - 20 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 1.1)) - 7 * Math.sin(TAU * 6 * u),
          ]);
        }
        fillSkylineGrad(ctx, pts, 510, 780, mix(th.mid, th.sky[2], 0.14), mix(th.mid, '#000000', 0.28));

        // 岸边芦苇丛
        for (let i = 0; i < 16; i++) {
          const px = x0 + 40 + i * 124 + hash1(i * 31 + 5) * 40;
          drawReeds(ctx, px, 590 + oy, 74 + hash1(i * 11 + 7) * 40, th.mid, mix(th.mid, th.accent, 0.4), t, i * 0.7);
        }

        // 冰蓝色的小树
        for (let i = 0; i < 6; i++) {
          const px = x0 + 170 + i * 330;
          drawPine(ctx, px, 592 + oy, 92 + hash1(i * 17 + 9) * 60, 42, mix(th.mid, '#000000', 0.2));
        }

        // 漂在雾里的薄冰
        ctx.save();
        ctx.fillStyle = rgba(th.accent, 0.12);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const px = x0 + 130 + i * 320;
          const py = 618 + oy + Math.sin(t * 0.4 + i) * 2;
          ctx.moveTo(px + 26, py);
          ctx.ellipse(px, py, 26, 4.5, 0, 0, TAU);
        }
        ctx.fill();
        ctx.restore();
      });

      // 缓慢漂移的雾带
      for (let i = 0; i < 3; i++) {
        const fx = ((i * 520 + 160 + t * (7 + i * 3) - ox * 0.4) % (VIEW_W + 500)) - 250;
        glow(ctx, fx, 590 + oy, 400, 70, th.haze, 0.13, false);
      }
    },

    near(ctx, th, ox, oy, t) {
      repeatX(PERIOD_NEAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([
            x0 + u * PERIOD_NEAR,
            668 + oy - 24 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.2)) - 10 * Math.sin(TAU * 5 * u + 2),
          ]);
        }
        fillSkylineGrad(ctx, pts, 630, 780, mix(th.near, th.sky[2], 0.06), th.near);
        drawGrassSilhouette(ctx, pts, th.near, 13, 24, 20);

        // 前景冰岩
        for (let i = 0; i < 5; i++) {
          const px = x0 + 90 + i * 330 + hash1(i * 19 + 7) * 70;
          drawRock(ctx, px, 716 + oy, 120 + hash1(i * 29 + 3) * 90, 60 + hash1(i * 7 + 5) * 50, mix(th.near, '#000000', 0.24));
          // 冰棱高光
          ctx.save();
          ctx.fillStyle = rgba(th.accent, 0.22);
          ctx.beginPath();
          ctx.moveTo(px - 18, 700 + oy);
          ctx.lineTo(px - 6, 660 + oy);
          ctx.lineTo(px + 5, 700 + oy);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // 左下方近景芦苇
        for (let i = 0; i < 5; i++) {
          drawReeds(ctx, x0 + 90 + i * 26, 748, 90 + hash1(i * 13 + 3) * 40, th.near, mix(th.near, th.accent, 0.3), t, i);
        }
      });
    },
  },

  mountain: {
    far(ctx, th, ox, oy, t) {
      repeatX(PERIOD_FAR, ox, (x0) => {
        const baseBack = 508 + oy;
        const baseFront = 534 + oy;

        const gBack = ctx.createLinearGradient(0, 150 + oy, 0, baseBack);
        gBack.addColorStop(0, mix(th.far, th.sky[2], 0.7));
        gBack.addColorStop(1, mix(th.far, th.sky[2], 0.34));
        const gFront = ctx.createLinearGradient(0, 120 + oy, 0, baseFront);
        gFront.addColorStop(0, mix(th.far, th.sky[2], 0.44));
        gFront.addColorStop(1, mix(th.far, '#000000', 0.2));

        const peakPts = (px, baseY, topY, halfW, seed) => {
          const H = baseY - topY;
          const jx = (k) => (hash1(seed * 31 + k * 7) - 0.5) * halfW * 0.05;
          const jy = (k) => (hash1(seed * 17 + k * 11) - 0.5) * H * 0.035;
          const left = [
            [px - halfW, baseY],
            [px - halfW * 0.74 + jx(1), topY + H * 0.74 + jy(1)],
            [px - halfW * 0.47 + jx(2), topY + H * 0.47 + jy(2)],
            [px - halfW * 0.22 + jx(3), topY + H * 0.22 + jy(3)],
          ];
          const right = [
            [px + halfW * 0.24 + jx(4), topY + H * 0.24 + jy(4)],
            [px + halfW * 0.5 + jx(5), topY + H * 0.5 + jy(5)],
            [px + halfW * 0.78 + jx(6), topY + H * 0.78 + jy(6)],
            [px + halfW, baseY],
          ];
          return { left, right, tip: [px + jx(7) * 0.4, topY], halfW, topY, H };
        };

        const drawPeak = (s, grad, snowAlpha) => {
          ctx.save();
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(s.left[0][0], s.left[0][1]);
          for (let i = 1; i < s.left.length; i++) ctx.lineTo(s.left[i][0], s.left[i][1]);
          ctx.lineTo(s.tip[0], s.tip[1]);
          for (const p of s.right) ctx.lineTo(p[0], p[1]);
          ctx.closePath();
          ctx.fill();

          // 背光面：右侧山体压暗，制造体积感
          ctx.beginPath();
          ctx.moveTo(s.tip[0], s.tip[1]);
          for (const p of s.right) ctx.lineTo(p[0], p[1]);
          ctx.lineTo(s.tip[0] + s.halfW * 0.06, s.left[0][1]);
          ctx.closePath();
          ctx.fillStyle = rgba('#04080e', snowAlpha > 0.6 ? 0.26 : 0.18);
          ctx.fill();

          // 迎光棱线
          ctx.beginPath();
          ctx.moveTo(s.tip[0], s.tip[1]);
          for (let i = s.left.length - 1; i >= 1; i--) ctx.lineTo(s.left[i][0], s.left[i][1]);
          ctx.strokeStyle = rgba('#eaf6ff', 0.16);
          ctx.lineWidth = 2;
          ctx.stroke();

          if (snowAlpha > 0) {
            const tx = s.tip[0];
            const ty = s.tip[1];
            const H = s.H;
            const cw = s.halfW * 0.36;
            ctx.globalAlpha = snowAlpha;
            ctx.fillStyle = mix(th.far, '#eef8fb', 0.62);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + cw * 0.55, ty + H * 0.2);
            ctx.lineTo(tx + cw, ty + H * 0.36);
            ctx.lineTo(tx + cw * 0.58, ty + H * 0.32);
            ctx.lineTo(tx + cw * 0.22, ty + H * 0.4);
            ctx.lineTo(tx - cw * 0.16, ty + H * 0.31);
            ctx.lineTo(tx - cw * 0.6, ty + H * 0.39);
            ctx.lineTo(tx - cw, ty + H * 0.34);
            ctx.lineTo(tx - cw * 0.55, ty + H * 0.19);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        };

        const backPeaks = [
          [0.02, 300, 175, 11], [0.16, 210, 250, 13], [0.3, 360, 190, 15],
          [0.46, 250, 270, 17], [0.62, 330, 200, 19], [0.78, 230, 250, 21],
          [0.92, 300, 180, 23],
        ];
        for (const p of backPeaks) {
          drawPeak(peakPts(x0 + p[0] * PERIOD_FAR, baseBack, baseBack - p[1], p[2], p[3]), gBack, 0.4);
        }

        const frontPeaks = [
          [0.07, 330, 260, 12], [0.28, 400, 300, 16], [0.52, 360, 280, 20],
          [0.74, 300, 250, 24], [0.9, 260, 230, 26],
        ];
        for (const p of frontPeaks) {
          drawPeak(peakPts(x0 + p[0] * PERIOD_FAR, baseFront, baseFront - p[1], p[2], p[3]), gFront, 0.92);
        }

        // 山腰云带
        for (let i = 0; i < 4; i++) {
          const cx0 = x0 + 180 + i * 560 + Math.sin(t * 0.12 + i) * 30;
          glow(ctx, cx0, 400 + oy + i * 26, 300, 42, th.cloud, 0.16, false);
        }
      });
    },

    mid(ctx, th, ox, oy, t) {
      repeatX(PERIOD_MID, ox, (x0) => {
        // 崖壁
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          pts.push([
            x0 + u * PERIOD_MID,
            566 + oy - 26 * (0.5 + 0.5 * Math.sin(TAU * 3 * u + 0.7)) - 10 * Math.sin(TAU * 9 * u),
          ]);
        }
        fillSkylineGrad(ctx, pts, 500, 780, mix(th.mid, th.sky[2], 0.12), mix(th.mid, '#000000', 0.3));

        // 崖壁纹理
        ctx.save();
        ctx.strokeStyle = rgba(mix(th.mid, '#000000', 0.4), 0.5);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const px = x0 + i * 200 + 40;
          ctx.moveTo(px, 590 + oy);
          ctx.quadraticCurveTo(px + 20, 630 + oy, px - 4, 700 + oy);
        }
        ctx.stroke();
        ctx.restore();

        // 瀑布：从崖顶尖缺口垂落，越往下越宽、越碎
        const wx = x0 + 1180;
        const wy0 = 544 + oy;
        const wy1 = 644 + oy;
        const wTop = 18;
        const wBot = 50;
        const fallH = wy1 - wy0;
        ctx.save();
        ctx.lineCap = 'round';

        // 崖壁缺口：上缘淡出，避免出现"画框"
        const ng = ctx.createLinearGradient(0, wy0 - 70, 0, wy0 + 80);
        ng.addColorStop(0, rgba('#08131a', 0));
        ng.addColorStop(0.45, rgba('#08131a', 0.42));
        ng.addColorStop(1, rgba('#08131a', 0.55));
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.moveTo(wx - wTop - 8, wy0 - 70);
        ctx.lineTo(wx + wTop + 8, wy0 - 70);
        ctx.quadraticCurveTo(wx + wBot + 20, wy0 + fallH * 0.55, wx + wBot + 10, wy1 + 4);
        ctx.lineTo(wx - wBot - 10, wy1 + 4);
        ctx.quadraticCurveTo(wx - wBot - 20, wy0 + fallH * 0.55, wx - wTop - 8, wy0 - 70);
        ctx.closePath();
        ctx.fill();

        // 水幕：三层同形不同宽，形成纵向水流带；边缘带波浪抖动
        const fallPath = (k) => {
          const edge = (side, u) => {
            const w = (wTop + (wBot - wTop) * u * u) * k;
            const wob =
              Math.sin(u * 7.4 + side * 1.9 + t * 0.9) * 2.4 * k +
              Math.sin(u * 17.3 + side * 2.7) * 1.3 * k;
            return [wx + side * (w + wob), wy0 + fallH * u];
          };
          ctx.beginPath();
          ctx.moveTo(...edge(-1, 0));
          for (let i = 1; i <= 8; i++) ctx.lineTo(...edge(-1, i / 8));
          for (let i = 8; i >= 0; i--) ctx.lineTo(...edge(1, i / 8));
          ctx.closePath();
        };
        const vg = ctx.createLinearGradient(0, wy0, 0, wy1);
        vg.addColorStop(0, rgba('#ffffff', 0.08));
        vg.addColorStop(0.08, rgba(th.accent, 0.5));
        vg.addColorStop(0.6, rgba(th.accent, 0.36));
        vg.addColorStop(1, rgba('#ffffff', 0.12));
        ctx.fillStyle = vg;
        fallPath(1);
        ctx.fill();

        ctx.fillStyle = rgba(th.accent, 0.2);
        fallPath(0.72);
        ctx.fill();

        ctx.fillStyle = rgba('#ffffff', 0.16);
        fallPath(0.4);
        ctx.fill();

        // 下落的水线：明确向下运动
        ctx.strokeStyle = rgba('#ffffff', 0.46);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const sp = 0.5 + hash1(i * 19 + 5) * 0.34;
          const u = (t * sp + hash1(i * 11 + 3)) % 1;
          const w = wTop + (wBot - wTop) * u * u;
          const px = wx + (hash1(i * 7 + 13) - 0.5) * w * 1.6;
          const py = wy0 + u * fallH;
          const len = 10 + hash1(i * 23 + 7) * 18;
          const tilt = (hash1(i * 31 + 9) - 0.5) * 2.2;
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + tilt, py + len * 0.5, px + tilt * 1.4, py + len);
        }
        ctx.stroke();

        // 落点：水花与雾
        ctx.fillStyle = rgba('#ffffff', 0.32);
        ctx.beginPath();
        ctx.ellipse(wx, wy1 - 2, wBot * 0.95, 7, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba('#ffffff', 0.24);
        ctx.beginPath();
        ctx.ellipse(wx - wBot * 0.5, wy1 - 3, wBot * 0.42, 4.6, -0.18, 0, TAU);
        ctx.ellipse(wx + wBot * 0.52, wy1 - 3, wBot * 0.4, 4.2, 0.2, 0, TAU);
        ctx.fill();
        // 溅起的小水珠
        ctx.fillStyle = rgba('#ffffff', 0.6);
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const ph = t * 2.1 + i * 1.7;
          const bx = wx + (hash1(i * 29 + 1) - 0.5) * wBot * 1.7;
          const by = wy1 - Math.abs(Math.sin(ph)) * (6 + hash1(i * 5) * 12);
          ctx.moveTo(bx + 1.4, by);
          ctx.arc(bx, by, 1.4, 0, TAU);
        }
        ctx.fill();
        glow(ctx, wx, wy1 - 12, 140, 74, '#ffffff', 0.2);
        glow(ctx, wx, wy1 - 34, 70, 52, th.accent, 0.22);
        glow(ctx, wx, wy0 + 8, 46, 14, '#ffffff', 0.14);
        ctx.restore();

        // 崖上松树
        for (let i = 0; i < 8; i++) {
          const px = x0 + 90 + i * 240 + hash1(i * 31 + 3) * 80;
          drawPine(ctx, px, 578 + oy, 60 + hash1(i * 13 + 7) * 60, 34, mix(th.mid, '#000000', 0.3));
        }
      });

      // 谷底水汽
      glow(ctx, 500, 680 + oy, 620, 90, th.haze, 0.13, false);
      glow(ctx, 1120, 690 + oy, 480, 80, th.haze, 0.11, false);
    },

    near(ctx, th, ox, oy, t) {
      repeatX(PERIOD_NEAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([
            x0 + u * PERIOD_NEAR,
            672 + oy - 30 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 2.8)) - 12 * Math.sin(TAU * 6 * u),
          ]);
        }
        fillSkylineGrad(ctx, pts, 620, 780, mix(th.near, th.sky[2], 0.04), th.near);
        drawGrassSilhouette(ctx, pts, th.near, 17, 34, 28);

        // 前景巨石
        drawRock(ctx, x0 + 190, 748, 230, 90, mix(th.near, '#000000', 0.3));
        drawRock(ctx, x0 + 1360, 752, 280, 110, mix(th.near, '#000000', 0.28));

        // 左下角松枝
        const col = mix(th.near, '#000000', 0.3);
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(x0 - 20, 60);
        ctx.quadraticCurveTo(x0 + 140, 60, x0 + 300, 130);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const bx = x0 + 40 + i * 44;
          const by = 66 + i * 11;
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + 34, by + 16);
        }
        ctx.stroke();
        ctx.restore();

        // 松针团
        ctx.save();
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const bx = x0 + 90 + i * 52;
          const by = 74 + i * 14;
          ctx.moveTo(bx + 30, by);
          ctx.ellipse(bx, by, 34, 12, -0.2, 0, TAU);
        }
        ctx.fill();
        ctx.restore();
      });
    },
  },

  nether: {
    far(ctx, th, ox, oy, t) {
      repeatX(PERIOD_FAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          pts.push([
            x0 + u * PERIOD_FAR,
            448 + oy - 42 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.2)) - 16 * Math.sin(TAU * 5 * u + 1.6),
          ]);
        }
        fillSkylineGrad(
          ctx, pts, 380, 780,
          mix(th.far, th.sky[2], 0.34),
          mix(th.far, '#000000', 0.22)
        );

        // 白玉楼：层叠的殿宇与五重塔
        const col = mix(th.far, '#000000', 0.28);
        drawShrineBuilding(ctx, x0 + 700, 486 + oy, 150, col, th.glow, th.glow, t);
        drawPagoda(ctx, x0 + 1240, 488 + oy, 120, col, 4, th.glow);
        drawTorii(ctx, x0 + 240, 474 + oy, 74, col);
        drawDeadTree(ctx, x0 + 1600, 480 + oy, 130, 4, col);

        // 飘浮的灵体光点
        for (let i = 0; i < 5; i++) {
          const px = x0 + 180 + i * 440 + Math.sin(t * 0.4 + i * 1.7) * 24;
          const py = 300 + oy + hash1(i * 17 + 3) * 120 + Math.cos(t * 0.33 + i) * 12;
          glow(ctx, px, py, 26, 26, th.glow, 0.24);
          ctx.save();
          ctx.fillStyle = rgba(th.glow, 0.5);
          ctx.beginPath();
          ctx.arc(px, py, 2.4, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      });

      glow(ctx, 640, 470 + oy, 820, 110, th.haze, 0.12, false);
    },

    mid(ctx, th, ox, oy, t) {
      repeatX(PERIOD_MID, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          pts.push([
            x0 + u * PERIOD_MID,
            576 + oy - 24 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 1.9)) - 9 * Math.sin(TAU * 6 * u),
          ]);
        }
        fillSkylineGrad(ctx, pts, 520, 780, mix(th.mid, th.sky[2], 0.12), mix(th.mid, '#000000', 0.3));

        // 枯树
        for (let i = 0; i < 6; i++) {
          const px = x0 + 120 + i * 340 + hash1(i * 31 + 5) * 90;
          drawDeadTree(ctx, px, 600 + oy, 150 + hash1(i * 13 + 3) * 90, i * 7 + 2, mix(th.mid, '#000000', 0.24));
        }

        // 鸟居
        drawTorii(ctx, x0 + 880, 610 + oy, 168, mix(th.mid, '#000000', 0.38), th.accent);

        // 墓碑
        ctx.save();
        ctx.fillStyle = mix(th.mid, '#000000', 0.4);
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const px = x0 + 400 + i * 150 + hash1(i * 17 + 9) * 40;
          const hh = 20 + hash1(i * 11 + 5) * 18;
          ctx.moveTo(px - 7, 604 + oy);
          ctx.lineTo(px - 7, 604 + oy - hh);
          ctx.quadraticCurveTo(px, 604 + oy - hh - 9, px + 7, 604 + oy - hh);
          ctx.lineTo(px + 7, 604 + oy);
          ctx.closePath();
        }
        ctx.fill();
        ctx.restore();

        // 地面薄雾
        for (let i = 0; i < 3; i++) {
          const fx = ((i * 700 + 200 + t * 5 - ox * 0.35) % (VIEW_W + 500)) - 250;
          glow(ctx, fx, 620 + oy, 420, 70, th.haze, 0.12, false);
        }
      });
    },

    near(ctx, th, ox, oy, t) {
      repeatX(PERIOD_NEAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([
            x0 + u * PERIOD_NEAR,
            682 + oy - 22 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.5)) - 9 * Math.sin(TAU * 5 * u + 2.4),
          ]);
        }
        fillSkylineGrad(ctx, pts, 650, 780, mix(th.near, th.sky[2], 0.02), th.near);
        drawGrassSilhouette(ctx, pts, th.near, 23, 30, 22);

        // 前景彼岸花
        const petalCol = mix(th.accent, '#ffd0d8', 0.2);
        const stemCol = mix(th.near, '#000000', 0.2);
        for (let i = 0; i < 9; i++) {
          const px = x0 + 80 + i * 180 + hash1(i * 37 + 7) * 50;
          drawSpiderLily(ctx, px, 742 + oy, 90 + hash1(i * 19 + 3) * 50, petalCol, stemCol, t, i * 1.3);
        }
        // 花瓣的微光
        glow(ctx, 500, 700 + oy, 420, 60, th.accent, 0.08);
      });
    },
  },

  moon: {
    far(ctx, th, ox, oy, t) {
      repeatX(PERIOD_FAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          pts.push([
            x0 + u * PERIOD_FAR,
            456 + oy - 34 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 1.5)) - 12 * Math.sin(TAU * 4 * u + 0.3),
          ]);
        }
        snowHill(ctx, pts, 390, 780,
          mix(th.far, th.sky[2], 0.34),
          mix(th.far, '#000000', 0.2), 4171, th);

        // 永远亭：长殿 + 二层檐
        drawShrineBuilding(ctx, x0 + 900, 480 + oy, 120, mix(th.far, '#000000', 0.22), th.accent, th.accent, t);
        drawPagoda(ctx, x0 + 1720, 476 + oy, 70, mix(th.far, '#000000', 0.22), 3);
        drawTorii(ctx, x0 + 320, 464 + oy, 60, mix(th.far, '#000000', 0.22));

        // 远处的竹影
        for (let i = 0; i < 16; i++) {
          const px = x0 + 40 + i * 150 + hash1(i * 13 + 5) * 52;
          drawBamboo(
            ctx, px, 470 + oy, 90 + hash1(i * 7 + 3) * 70, 4,
            mix(th.far, '#000000', 0.18), mix(th.far, th.accent, 0.2),
            Math.sin(t * 0.35 + i) * 2, i * 3 + 1
          );
        }
      });

      // 月光薄雾
      glow(ctx, 700, 470 + oy, 900, 100, th.haze, 0.1, false);
    },

    mid(ctx, th, ox, oy, t) {
      repeatX(PERIOD_MID, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          pts.push([
            x0 + u * PERIOD_MID,
            584 + oy - 20 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 2.4)) - 7 * Math.sin(TAU * 5 * u),
          ]);
        }
        snowHill(ctx, pts, 540, 780, mix(th.mid, th.sky[2], 0.08), mix(th.mid, '#000000', 0.36), 9137, th);

        // 竹林：成簇生长，避免排成栅栏
        for (let i = 0; i < 13; i++) {
          const px = x0 + 24 + i * 150 + hash1(i * 31 + 7) * 46;
          const hh = 300 + hash1(i * 23 + 3) * 190;
          const sway = Math.sin(t * 0.45 + i * 0.8) * (4 + hash1(i * 17 + 9) * 4);
          const colA = i % 3 ? mix(th.mid, th.sky[2], 0.3) : mix(th.mid, th.sky[2], 0.42);
          drawBamboo(
            ctx, px, 620 + oy, hh, 7 + hash1(i * 11 + 1) * 4,
            colA, mix(th.accent, '#ffffff', 0.35), sway, i * 5 + 3
          );
          if (i % 2 === 0) {
            drawBamboo(
              ctx, px + 16 + hash1(i * 7) * 14, 620 + oy, hh * 0.82, 5.2,
              mix(th.mid, th.sky[2], 0.18), mix(th.accent, th.mid, 0.4),
              sway * 0.7, i * 5 + 8
            );
          }
        }
      });

      // 竹根处的微光
      glow(ctx, 400, 630 + oy, 500, 70, th.haze, 0.08, false);
      glow(ctx, 1000, 636 + oy, 460, 60, th.haze, 0.07, false);
    },

    near(ctx, th, ox, oy, t) {
      repeatX(PERIOD_NEAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([
            x0 + u * PERIOD_NEAR,
            686 + oy - 18 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 1.2)) - 8 * Math.sin(TAU * 4 * u + 2),
          ]);
        }
        fillSkylineGrad(ctx, pts, 656, 780, mix(th.near, th.sky[2], 0.02), th.near);
        drawGrassSilhouette(ctx, pts, th.near, 29, 26, 18);

        // 前景粗竹（两三竿，做画框）
        const col = mix(th.near, '#000000', 0.52);
        const frame = [[120, 600, 17], [1420, 640, 13], [760, 560, 7]];
        for (let i = 0; i < frame.length; i++) {
          const [fx, fh, fw] = frame[i];
          drawBamboo(
            ctx, x0 + fx, 780, fh, fw, col, mix(th.near, th.accent, 0.3),
            Math.sin(t * 0.35 + i * 2) * 3, i * 11 + 5
          );
        }

        // 垂下来的竹叶（画面顶部）
        ctx.save();
        ctx.fillStyle = mix(th.near, th.accent, 0.1);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const bx = x0 + 60 + i * 90 + hash1(i * 13 + 3) * 40;
          const by = -4 + hash1(i * 7 + 5) * 30;
          const len = 46 + hash1(i * 17 + 9) * 60;
          const dir = i % 2 ? 1 : -1;
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + dir * len * 0.6, by + 18, bx + dir * len, by + 30);
          ctx.quadraticCurveTo(bx + dir * len * 0.5, by + 6, bx, by + 4);
          ctx.closePath();
        }
        ctx.fill();
        ctx.restore();
      });
    },
  },

  mansion: {
    far(ctx, th, ox, oy, t) {
      repeatX(PERIOD_FAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          pts.push([
            x0 + u * PERIOD_FAR,
            462 + oy - 30 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.8)) - 12 * Math.sin(TAU * 5 * u + 1.2),
          ]);
        }
        fillSkylineGrad(
          ctx, pts, 390, 780,
          mix(th.far, th.sky[2], 0.28),
          mix(th.far, '#000000', 0.24)
        );

        // 红魔馆的尖塔群
        const col = mix(th.far, '#000000', 0.3);
        drawGothicMansion(ctx, x0 + 780, 486 + oy, 220, col, th.accent, th.accent, t);
        drawGothicMansion(ctx, x0 + 1690, 492 + oy, 140, col, th.accent, th.accent, t + 1);
        // 远处的尖塔
        ctx.save();
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const px = x0 + 120 + i * 180;
          const hh = 60 + hash1(i * 13 + 7) * 70;
          ctx.moveTo(px, 466 + oy - hh);
          ctx.lineTo(px - 14, 466 + oy);
          ctx.lineTo(px + 14, 466 + oy);
          ctx.closePath();
        }
        ctx.fill();
        ctx.restore();

        // 血月照在雾上的红光
        glow(ctx, x0 + 780, 470 + oy, 380, 90, th.accent, 0.1);
      });

      glow(ctx, 640, 470 + oy, 820, 100, th.haze, 0.12, false);
    },

    mid(ctx, th, ox, oy, t) {
      repeatX(PERIOD_MID, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const u = i / 16;
          pts.push([
            x0 + u * PERIOD_MID,
            586 + oy - 30 * (0.5 + 0.5 * Math.sin(TAU * 3 * u + 0.4)) - 12 * Math.sin(TAU * 8 * u + 1.8),
          ]);
        }
        fillSkylineGrad(ctx, pts, 520, 780, mix(th.mid, th.sky[2], 0.1), mix(th.mid, '#000000', 0.34));

        // 水晶簇
        for (let i = 0; i < 7; i++) {
          const px = x0 + 130 + i * 290 + hash1(i * 19 + 3) * 70;
          const hh = 70 + hash1(i * 31 + 5) * 130;
          drawCrystal(
            ctx, px, 606 + oy, hh, hh * 0.34,
            mix(th.mid, '#7fe6e0', 0.22), mix(th.mid, '#c8fff8', 0.5)
          );
          // 水晶内芯的冷光
          glow(ctx, px, 606 + oy - hh * 0.55, hh * 0.5, hh * 0.55, '#7fe6e0', 0.1);
        }

        // 铁栅栏
        drawFence(ctx, x0 + 120, 640 + oy, 620, 54, mix(th.mid, '#000000', 0.35), mix(th.mid, th.accent, 0.3));
        drawFence(ctx, x0 + 1180, 644 + oy, 500, 50, mix(th.mid, '#000000', 0.35), mix(th.mid, th.accent, 0.3));

        // 地面红雾
        for (let i = 0; i < 3; i++) {
          const fx = ((i * 720 + 220 + t * 4 - ox * 0.35) % (VIEW_W + 500)) - 250;
          glow(ctx, fx, 640 + oy, 420, 80, th.haze, 0.13, false);
        }
      });
    },

    near(ctx, th, ox, oy, t) {
      repeatX(PERIOD_NEAR, ox, (x0) => {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          pts.push([
            x0 + u * PERIOD_NEAR,
            678 + oy - 26 * (0.5 + 0.5 * Math.sin(TAU * 2 * u + 0.9)) - 11 * Math.sin(TAU * 5 * u + 2.6),
          ]);
        }
        fillSkylineGrad(ctx, pts, 640, 780, mix(th.near, th.sky[2], 0.03), th.near);

        // 前景水晶巨簇
        drawCrystal(ctx, x0 + 160, 760, 260, 86, mix(th.near, '#5a2a6a', 0.4), mix(th.near, '#7fe6e0', 0.35));
        drawCrystal(ctx, x0 + 240, 768, 170, 62, mix(th.near, '#4a1a48', 0.4), mix(th.near, '#7fe6e0', 0.25));
        drawCrystal(ctx, x0 + 1370, 768, 300, 96, mix(th.near, '#5a2a6a', 0.4), mix(th.near, '#7fe6e0', 0.35));

        // 铁栅栏近景
        drawFence(ctx, x0 + 520, 730, 480, 80, mix(th.near, '#000000', 0.4), mix(th.near, th.accent, 0.35));

        // 地面残光
        glow(ctx, x0 + 760, 740, 520, 60, th.accent, 0.08);
        glow(ctx, x0 + 170, 700, 220, 220, '#7fe6e0', 0.06);
      });
    },
  },
};

/**
 * 远景补层：比 far 更远的一层山脊。颜色几乎被天光吃掉，
 * 只留下极淡的起伏轮廓，用来撑开景深。
 */
function drawDistantRidge(ctx, key, th, cam, t) {
  const skyB = th.sky[2] || th.sky[1];
  const base = th.far;
  // 三层山脊：最远最淡、几乎溶进天空；越近轮廓越实、脊线越亮，
  // 每层脚下压一条雾带，形成真正的层间空气透视（而不是一张剪影贴纸）。
  const layers = [
    { par: 0.011, period: 3600, y0: 342, amp: 80, haze: 0.91, shade: 0.04, rim: 0.05, seed: 0.9, freq: [2, 5, 9], trees: 0 },
    { par: 0.025, period: 3200, y0: 364, amp: 66, haze: 0.76, shade: 0.1, rim: 0.09, seed: 2.1, freq: [3, 7, 11], trees: 0 },
    { par: 0.041, period: 2800, y0: 386, amp: 54, haze: 0.58, shade: 0.18, rim: 0.13, seed: 3.7, freq: [2, 6, 13], trees: 1 },
  ];
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    const ox = -((cam.x * L.par) % L.period);
    const oy = -cam.y * 0.02;
    repeatX(L.period, ox, (x0) => {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const y = L.y0 + oy
          - L.amp * (0.5 + 0.5 * Math.sin(TAU * L.freq[0] * u + L.seed))
          - L.amp * 0.34 * Math.sin(TAU * L.freq[1] * u + L.seed * 2.3)
          - L.amp * 0.16 * Math.sin(TAU * L.freq[2] * u + L.seed * 3.1);
        pts.push([x0 + u * L.period, y]);
      }
      fillSkylineGrad(
        ctx, pts, L.y0 - 140, 760,
        mix(base, skyB, L.haze),
        mix(mix(base, skyB, L.haze * 0.8), '#000000', L.shade)
      );

      // 山脚雾：把这一层的底部推进空气里
      const hz = ctx.createLinearGradient(0, L.y0 + 26, 0, 520);
      hz.addColorStop(0, rgba(th.haze, 0));
      hz.addColorStop(1, rgba(th.haze, 0.14 + li * 0.03));
      ctx.fillStyle = hz;
      ctx.fillRect(x0 - 8, L.y0 + 26, L.period + 16, 512 - L.y0);

      // 受光山脊线：越近越亮，把轮廓从天空里拔出来
      ctx.strokeStyle = rgba(mix(base, '#ffffff', 0.42), L.rim);
      ctx.lineWidth = 1.2 + li * 0.25;
      traceSmooth(ctx, pts);
      ctx.stroke();

      // 最近一层：沿脊线点一排针叶树剪影，远景就有了"量级"与辨识度
      if (L.trees) {
        const tr = mulberry32(4931);
        ctx.fillStyle = rgba(mix(base, skyB, 0.34), 0.55);
        for (let i = 2; i < pts.length - 2; i++) {
          if (tr() > 0.42) continue;
          const px = pts[i][0] + (tr() - 0.5) * 46;
          const py = pts[i][1] + tr() * 5;
          const ph = 3.5 + tr() * 6.5;
          const pw = 1.5 + tr() * 2.4;
          ctx.beginPath();
          ctx.moveTo(px, py - ph);
          ctx.lineTo(px + pw, py + 1.6);
          ctx.lineTo(px - pw, py + 1.6);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
  }
}

/**
 * 带材质的雪原山体：先用垂直渐变铺底，再裁进轮廓里画层理/雪脊/颗粒，
 * 最后沿山脊补一条月光 rim。只用于烘焙层，所以可以画得很细。
 */
function snowHill(ctx, pts, yTop, yBot, cTop, cBot, seed, th) {
  if (pts.length < 2) return;
  const r = mulberry32(seed | 0);
  const col = mix(th.far, '#dfeaf8', 0.5);
  const dark = mix(th.far, '#000000', 0.35);
  // 轮廓
  traceSmooth(ctx, pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  ctx.lineTo(last[0], yBot);
  ctx.lineTo(first[0], yBot);
  ctx.closePath();

  ctx.save();
  ctx.clip();

  // 底色渐变
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, cTop);
  g.addColorStop(0.55, cBot);
  g.addColorStop(1, mix(cBot, '#000000', 0.18));
  ctx.fillStyle = g;
  ctx.fillRect(pts[0][0] - 4, yTop - 60, last[0] - pts[0][0] + 8, yBot - yTop + 120);

  // 横向雪脊层理：近水平的柔和扫笔
  for (let i = 0; i < 7; i++) {
    const yy = yTop + 18 + i * 34 + r() * 16;
    ctx.strokeStyle = rgba(mix(col, '#ffffff', 0.3), 0.055 + r() * 0.04);
    ctx.lineWidth = 6 + r() * 12;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] - 20, yy);
    ctx.bezierCurveTo(
      first[0] + (last[0] - first[0]) * 0.3, yy - 8 - r() * 8,
      first[0] + (last[0] - first[0]) * 0.7, yy + 7 + r() * 8,
      last[0] + 20, yy - 2
    );
    ctx.stroke();
  }
  // 暗部层理
  for (let i = 0; i < 4; i++) {
    const yy = yTop + 46 + i * 52 + r() * 20;
    ctx.strokeStyle = rgba(dark, 0.05 + r() * 0.04);
    ctx.lineWidth = 10 + r() * 16;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], yy);
    ctx.quadraticCurveTo(first[0] + (last[0] - first[0]) * 0.5, yy + 10, last[0], yy - 4);
    ctx.stroke();
  }

  // 雪脊小丘：亮面 + 下缘投影，做出起伏
  for (let i = 0; i < 10; i++) {
    const dx = first[0] + r() * (last[0] - first[0]);
    const dy = yTop + 10 + r() * (yBot - yTop - 30) * 0.7;
    const dw = 30 + r() * 70;
    const dh = 3 + r() * 5;
    ctx.fillStyle = rgba(mix(col, '#ffffff', 0.4), 0.12 + r() * 0.1);
    ctx.beginPath();
    ctx.ellipse(dx, dy, dw, dh, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(dark, 0.12);
    ctx.beginPath();
    ctx.ellipse(dx, dy + dh * 0.8, dw * 0.92, dh * 0.5, 0, 0, Math.PI);
    ctx.fill();
  }

  // 雪粒/冰晶颗粒
  for (let i = 0; i < 260; i++) {
    const px = first[0] + r() * (last[0] - first[0]);
    const py = yTop + r() * (yBot - yTop);
    const a = 0.04 + r() * 0.12;
    ctx.fillStyle = r() > 0.5 ? rgba('#ffffff', a) : rgba(dark, a * 0.9);
    ctx.fillRect(px, py, r() > 0.88 ? 1.8 : 1, 1);
  }

  // 前景一层更亮的雪面（近地平线处）
  const gr = ctx.createLinearGradient(0, yBot - 120, 0, yBot);
  gr.addColorStop(0, rgba(col, 0));
  gr.addColorStop(1, rgba(mix(col, '#ffffff', 0.45), 0.16));
  ctx.fillStyle = gr;
  ctx.fillRect(pts[0][0] - 10, yBot - 120, last[0] - pts[0][0] + 20, 120);
  ctx.restore();

  // 山脊月光 rim
  ctx.strokeStyle = rgba(mix('#ffffff', th.accent, 0.25), 0.4);
  ctx.lineWidth = 1.3;
  traceSmooth(ctx, pts);
  ctx.stroke();
  ctx.strokeStyle = rgba(dark, 0.28);
  ctx.lineWidth = 2.6;
  ctx.save();
  ctx.translate(0, 2.4);
  traceSmooth(ctx, pts);
  ctx.stroke();
  ctx.restore();
}

/** 层间雾带：半透明、缓慢漂移，负责"空气透视" */
function drawMistBand(ctx, key, th, cam, y, h, alpha, speed, phase, time) {
  const sp = mistSprite(th.haze, phase % 2);
  if (!sp) return;
  const span = 1500;
  let base = (time * (2.5 + phase * 1.5) - cam.x * speed + phase * 733) % span;
  if (base < 0) base += span;
  base -= 500;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let k = 0; k < 2; k++) ctx.drawImage(sp, base + k * span, y - h * 0.5, span, h);
  ctx.restore();
}

const _layerCache = new Map();

/**
 * 把静态视差层整体烘焙成一条 PERIOD 宽的长条精灵（内容可平铺），
 * 运行时只做 2 次 drawImage。用于绘制调用极密的层（如月都的竹林）。
 */
function bakedStrip(ck, w, yBase, h, th, paint, time) {
  let cv = _layerCache.get(ck);
  if (cv !== undefined) return cv;
  if (_layerCache.size > 10) _layerCache.clear();
  cv = makeCanvas(w, h);
  if (!cv) { _layerCache.set(ck, null); return null; }
  const g = cv.getContext('2d');
  if (!g) { _layerCache.set(ck, null); return null; }
  g.save();
  g.translate(0, -yBase);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  paint(g, th, 0, 0, time);
  g.restore();
  _layerCache.set(ck, cv);
  return cv;
}

function drawBakedStrip(ctx, sp, period, x, y) {
  if (!sp) return;
  ctx.drawImage(sp, x, y);
  ctx.drawImage(sp, x + period, y);
}

/**
 * 前景剪影：一张可平铺的离屏条带，只占画面最底部约 64px，
 * 用细长草叶和少量主题植物做"眼前一层"，给画面加上最近的一档景深。
 */
function paintForeground(g, key, th, W, H) {
  const col = mix(th.near, '#000000', 0.55);
  const col2 = mix(th.near, '#000000', 0.34);
  const accent = mix(mix(th.near, th.accent, 0.3), '#000000', 0.42);
  const r = mulberry32(4242 + key.length * 977);
  const groundY = H;

  // 底部渐隐的暗带（压住画面下沿）
  const grd = g.createLinearGradient(0, H - 78, 0, H);
  grd.addColorStop(0, rgba(col, 0));
  grd.addColorStop(1, rgba(col, 0.46));
  g.fillStyle = grd;
  g.fillRect(0, H - 78, W, 78);

  // 细长草叶（两色，少量受光叶尖）
  const blades = key === 'lake' ? 170 : 240;
  g.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    const x = r() * W;
    const tall = key === 'moon' ? 44 : 52;
    const bh = 8 + r() * tall;
    const lean = (r() - 0.5) * 30;
    g.strokeStyle = i % 4 === 0 ? col2 : col;
    g.lineWidth = 0.9 + r() * 1.6;
    g.beginPath();
    g.moveTo(x, groundY);
    g.quadraticCurveTo(x + lean * 0.3, groundY - bh * 0.62, x + lean, groundY - bh);
    g.stroke();
    if (i % 7 === 0) {
      g.strokeStyle = rgba(mix(col, th.accent, 0.35), 0.3);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(x + 0.5, groundY - bh * 0.3);
      g.quadraticCurveTo(x + lean * 0.4, groundY - bh * 0.66, x + lean, groundY - bh);
      g.stroke();
    }
  }

  // 主题植物：各 3~5 丛，位置固定，避免每帧抖动
  const plant = (px, scale, fn) => {
    g.save();
    g.translate(px, groundY);
    g.scale(scale, scale);
    fn();
    g.restore();
  };

  if (key === 'shrine') {
    for (let i = 0; i < 3; i++) {
      plant(W * (0.14 + i * 0.31) + r() * 60, 0.9 + r() * 0.4, () => {
        g.strokeStyle = col;
        g.lineWidth = 1.8;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(-14, -26, -34, -44);
        g.stroke();
        g.fillStyle = rgba(accent, 0.55);
        for (let k = 0; k < 7; k++) {
          g.beginPath();
          g.arc(-10 - k * 3.4, -16 - k * 3.8 + (k % 2) * 4, 1.8, 0, TAU);
          g.fill();
        }
      });
    }
  } else if (key === 'forest') {
    for (let i = 0; i < 4; i++) {
      plant(W * (0.1 + i * 0.24) + r() * 50, 0.9 + r() * 0.5, () => {
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) {
          const a = -1.9 + k * 0.32;
          const len = 26 + k * 5;
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(Math.cos(a) * len * 0.6, Math.sin(a) * len * 0.6, Math.cos(a) * len, Math.sin(a) * len);
          g.stroke();
          // 蕨叶小裂片
          for (let m = 1; m <= 4; m++) {
            const u = m / 4;
            const lx = Math.cos(a) * len * u;
            const ly = Math.sin(a) * len * u;
            g.beginPath();
            g.moveTo(lx, ly);
            g.lineTo(lx + 4, ly - 3.4);
            g.stroke();
          }
        }
      });
    }
  } else if (key === 'lake') {
    for (let i = 0; i < 5; i++) {
      plant(W * (0.06 + i * 0.2) + r() * 40, 0.9 + r() * 0.5, () => {
        g.strokeStyle = col;
        g.lineWidth = 1.3;
        const len = 46 + r() * 18;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(6, -len * 0.6, 14, -len);
        g.stroke();
        g.fillStyle = rgba(accent, 0.5);
        g.beginPath();
        g.ellipse(14, -len, 2.4, 6, 0.1, 0, TAU);
        g.fill();
      });
    }
  } else if (key === 'mountain') {
    for (let i = 0; i < 4; i++) {
      plant(W * (0.12 + i * 0.26) + r() * 50, 0.9 + r() * 0.4, () => {
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(10, -30, 6, -52);
        g.stroke();
        for (let k = 0; k < 7; k++) {
          const u = k / 7;
          g.lineWidth = 1.1;
          g.beginPath();
          g.moveTo(4 * u * 6, -8 - u * 42);
          g.lineTo(4 * u * 6 - 15, -8 - u * 42 - 8);
          g.moveTo(4 * u * 6, -8 - u * 42);
          g.lineTo(4 * u * 6 + 15, -8 - u * 42 - 8);
          g.stroke();
        }
      });
    }
  } else if (key === 'nether') {
    for (let i = 0; i < 5; i++) {
      plant(W * (0.08 + i * 0.21) + r() * 40, 0.8 + r() * 0.4, () => {
        g.strokeStyle = col;
        g.lineWidth = 1.2;
        const len = 34 + r() * 16;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(3, -len * 0.6, 6, -len);
        g.stroke();
        g.strokeStyle = rgba(accent, 0.6);
        g.lineWidth = 0.9;
        for (let k = 0; k < 5; k++) {
          const a = -2.6 + k * 0.55;
          g.beginPath();
          g.moveTo(6, -len);
          g.quadraticCurveTo(6 + Math.cos(a) * 9, -len + Math.sin(a) * 5, 6 + Math.cos(a) * 15, -len + Math.sin(a) * 9 - 4);
          g.stroke();
        }
      });
    }
  } else if (key === 'moon') {
    for (let i = 0; i < 4; i++) {
      plant(W * (0.1 + i * 0.25) + r() * 50, 0.9 + r() * 0.4, () => {
        const p = 0.7 + r() * 0.5;
        g.strokeStyle = col;
        g.lineWidth = 1.7;
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(-6 * p, -34, -2 * p, -58);
        g.stroke();
        g.fillStyle = rgba(col, 0.9);
        for (let k = 0; k < 6; k++) {
          const yy = -26 - k * 6;
          const s = 12 - k;
          g.beginPath();
          g.moveTo(-2 * p, yy);
          g.quadraticCurveTo(-14 * p, yy - s * 0.4, -24 * p, yy + s * 0.3);
          g.quadraticCurveTo(-12 * p, yy + 1.6, -2 * p, yy);
          g.fill();
        }
      });
    }
  } else {
    // mansion：晶簇 + 血色细草
    for (let i = 0; i < 4; i++) {
      plant(W * (0.1 + i * 0.25) + r() * 40, 0.9 + r() * 0.4, () => {
        g.fillStyle = rgba(mix(col, '#7fe6e0', 0.35), 0.75);
        for (let k = 0; k < 3; k++) {
          const bx = (k - 1) * 7;
          const bh = 22 + k * 9;
          g.beginPath();
          g.moveTo(bx - 3, 0);
          g.lineTo(bx + (k % 2 ? 2 : -1), -bh);
          g.lineTo(bx + 3, 0);
          g.closePath();
          g.fill();
        }
        g.strokeStyle = rgba(accent, 0.5);
        g.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          g.beginPath();
          g.moveTo(-14 + k * 7, 0);
          g.quadraticCurveTo(-14 + k * 7 + 3, -14, -14 + k * 7 + 7, -22);
          g.stroke();
        }
      });
    }
  }
}

function foreStrip(key, th) {
  return sprite('fore:' + key, 1520, 110, (g, w, h) => paintForeground(g, key, th, w, h));
}

function drawForeground(ctx, key, th, cam, t) {
  const strip = foreStrip(key, th);
  if (!strip) return;
  const span = strip.width;
  let ox = -((cam.x * 0.62) % span);
  if (ox > 0) ox -= span;
  const y = VIEW_H - strip.height;
  ctx.save();
  for (let i = 0; i < 3; i++) ctx.drawImage(strip, ox - span + i * span, y);
  ctx.restore();
}

function drawParallax(ctx, theme, cam, t) {
  if (!ctx) return;
  const key = themeKey(theme);
  const th = THEMES[key];
  const c = camOf(cam);
  const time = typeof t === 'number' ? t : 0;
  const build = PARALLAX[key] || PARALLAX[DEFAULT_THEME];
  if (!build) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const oxF = -((c.x * 0.08) % PERIOD_FAR);
  const oxM = -((c.x * 0.22) % PERIOD_MID);
  const oxN = -((c.x * 0.45) % PERIOD_NEAR);

  // 0) 最远山脊（空气透视最重）
  drawDistantRidge(ctx, key, th, c, time);

  // 1) 远层 + 层间雾
  if (key === 'moon') {
    // 月都：远/中两层竹林烘焙成静态长条（每帧 2x2 次 drawImage）
    drawBakedStrip(ctx, bakedStrip('moon:far', PERIOD_FAR, 380, 400, th, build.far, time), PERIOD_FAR, oxF, 380 - c.y * 0.03);
  } else {
    build.far(ctx, th, oxF, -c.y * 0.03, time);
  }
  drawMistBand(ctx, key, th, c, 462, 118, 0.5, 0.13, 0, time);

  // 2) 中层 + 更浓的雾
  if (key === 'moon') {
    drawBakedStrip(ctx, bakedStrip('moon:mid', PERIOD_MID, 520, 260, th, build.mid, time), PERIOD_MID, oxM, 520 - c.y * 0.06);
  } else {
    build.mid(ctx, th, oxM, -c.y * 0.06, time);
  }
  drawMistBand(ctx, key, th, c, 566, 150, 0.42, 0.3, 1, time);

  // 3) 近层（剪影最重）
  build.near(ctx, th, oxN, -c.y * 0.12, time);

  // 3.5) 地面之上的地平雾：柔化地平线，把地面推进空气里
  if (key === 'moon' || key === 'lake') {
    drawMistBand(ctx, key, th, c, 452, 132, key === 'moon' ? 0.3 : 0.24, 0.42, 2, time);
    drawMistBand(ctx, key, th, c, 648, 120, key === 'moon' ? 0.36 : 0.26, 0.55, 3, time);
  }

  // 4) 前景：压在画面最下沿，玩家仍在其上方
  drawForeground(ctx, key, th, c, time);

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 地形瓦片                                                            */
/* ------------------------------------------------------------------ */

function isSolidType(v) {
  return v === SOLID || v === GRASS || v === BRICK || v === ICE || v === MUSHROOM || v === VINE;
}

/* ------------------------------------------------------------------ */
/* 地形瓦片：全部按「主题 + 类型 + 变体 + 开口掩码」预渲染到离屏缓存      */
/* ------------------------------------------------------------------ */

const TILE_SS = 2;        // 瓦片纹理超采样倍率
const TILE_PAD_S = 2;     // 左右出血，避免相邻瓦片出现接缝
const TILE_PAD_T = 16;    // 顶部留白，给草叶伸出瓦片
const TILE_PAD_B = 2;
const _tileCache = new Map();
// 单主题可出现的键上界 ≈ 土/草/砖各 3 变体 × 16 开口 × 2 明暗 + 冰/浮台/尖刺 ≈ 370。
// 旧上限 240 一旦超出就整表 clear()，下一帧会把屏幕内所有瓦片重新烘焙一遍（卡顿主因之一）。
const TILE_CACHE_MAX = 700;

/** 取（或烘焙）一张瓦片纹理。mask: 1上 2右 4下 8左 开口 */
function tileSprite(key, th, type, variant, mask, lit) {
  const ck = 'tile:' + key + ':' + type + ':' + variant + ':' + mask + ':' + lit;
  let sp = _tileCache.get(ck);
  if (sp) {
    // 命中后移到队尾，让 LRU 淘汰真正冷的瓦片
    _tileCache.delete(ck);
    _tileCache.set(ck, sp);
    return sp;
  }
  const LW = T + TILE_PAD_S * 2;
  const LH = T + TILE_PAD_T + TILE_PAD_B;
  sp = makeCanvas(LW * TILE_SS, LH * TILE_SS);
  if (!sp) return null;
  const g = sp.getContext('2d');
  if (!g) return null;
  g.scale(TILE_SS, TILE_SS);
  g.translate(TILE_PAD_S, TILE_PAD_T);
  const pal = th.tile;
  switch (type) {
    case GRASS: paintGrassTile(g, th, pal, variant, mask, lit); break;
    case SOLID: paintSoilTile(g, th, pal, variant, mask, lit); break;
    case BRICK: paintBrickTile(g, th, pal, variant, mask, lit); break;
    case ICE: paintIceTile(g, th, pal, variant, mask, lit); break;
    case PLATFORM: paintPlatformTile(g, pal, variant, mask, lit); break;
    case SPIKE: paintSpikeTile(g, pal, variant, mask, lit); break;
    default: break;
  }
  _tileCache.set(ck, sp);
  if (_tileCache.size > TILE_CACHE_MAX) {
    const it = _tileCache.keys();
    for (let i = 0; i < 48; i++) {
      const n = it.next();
      if (n.done) break;
      _tileCache.delete(n.value);
    }
  }
  return sp;
}

function blitTile(ctx, sp, x, y) {
  if (!sp) return;
  ctx.drawImage(sp, x - TILE_PAD_S, y - TILE_PAD_T, T + TILE_PAD_S * 2, T + TILE_PAD_T + TILE_PAD_B);
}

const _soilPatCache = new Map();

/**
 * 土体内部无缝纹理（128² 平铺）：被包住的整片地不再是一块纯色，而是能看出「泥土」。
 * 层次：大尺度湿土明暗 → 沉积层理（周期波形，天然无缝）→ 砾石团（接触影 + 受光顶）
 *       → 细根网络（暗线 + 亮边做浮雕）→ 颗粒 → 石英微光 → 暗部环境色。
 * 贴边形状按 3×3 偏移补画，平铺时不会出现直线接缝。
 */
function soilPattern(key, pal, th) {
  const ck = 'soil:' + key;
  let cv = _soilPatCache.get(ck);
  if (cv) return cv;
  const S = 128;
  cv = makeCanvas(S, S);
  if (!cv) return null;
  const g = cv.getContext('2d');
  if (!g) return null;
  const r = mulberry32(9182 + key.length * 131);
  const sky0 = (th && th.sky && th.sky[0]) || pal.soilDark;
  const env = mix(sky0, pal.soilDark, 0.42); // 暗部环境色（偏天空色，不要中性灰）
  const wrap = (x, y, rad, fn) => {
    for (let dx = -S; dx <= S; dx += S) {
      for (let dy = -S; dy <= S; dy += S) {
        const px = x + dx;
        const py = y + dy;
        if (px + rad < 0 || px - rad > S || py + rad < 0 || py - rad > S) continue;
        fn(px, py);
      }
    }
  };

  g.fillStyle = pal.soil;
  g.fillRect(0, 0, S, S);

  // 1) 大尺度湿土块：亮暗交替，低 alpha 的软过渡
  for (let i = 0; i < 12; i++) {
    const x = r() * S;
    const y = r() * S;
    const rx = 14 + r() * 26;
    const ry = 8 + r() * 17;
    const rot = r() * TAU;
    const light = i % 2 === 0;
    g.fillStyle = rgba(light ? pal.soilLight : pal.soilDark, light ? 0.045 + r() * 0.035 : 0.10 + r() * 0.07);
    wrap(x, y, rx, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, rx, ry, rot, 0, TAU);
      g.fill();
    });
  }

  // 2) 沉积层理：周期波形贯穿整块，横向天然无缝
  for (let i = 0; i < 9; i++) {
    const base = r() * S;
    const amp = 1.2 + r() * 3.2;
    const ph = r() * TAU;
    const ph2 = r() * TAU;
    const dark = i % 3 !== 0;
    g.strokeStyle = rgba(dark ? pal.soilDark : pal.soilLight, dark ? 0.15 + r() * 0.09 : 0.09 + r() * 0.05);
    g.lineWidth = 0.7 + r() * 1.6;
    g.beginPath();
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const y = base + amp * Math.sin(TAU * u + ph) + amp * 0.55 * Math.sin(TAU * 2 * u + ph2);
      if (k === 0) g.moveTo(-2, y);
      else g.lineTo(u * S + (k === 12 ? 2 : 0), y);
    }
    g.stroke();
  }

  // 3) 砾石团：每团 3~6 颗，接触阴影 + 石体 + 受光顶 + 下缘暗边
  for (let c = 0; c < 6; c++) {
    const gx = r() * S;
    const gy = r() * S;
    const n = 3 + ((r() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const x = gx + (r() - 0.5) * 34;
      const y = gy + (r() - 0.5) * 26;
      const rad = 1.8 + r() * 3.4;
      const rot = (r() - 0.5) * 1.1;
      const sx = 0.92 + r() * 0.42;
      const body = mix(pal.pebble, pal.soilDark, 0.30 + r() * 0.44);
      g.fillStyle = rgba(pal.soilDark, 0.5);
      wrap(x, y, rad * 2, (px, py) => {
        g.beginPath();
        g.ellipse(px, py + rad * 0.42, rad * 1.18 * sx, rad * 0.6, rot, 0, TAU);
        g.fill();
      });
      g.fillStyle = rgba(body, 0.82);
      wrap(x, y, rad * 2, (px, py) => {
        g.beginPath();
        g.ellipse(px, py, rad * sx, rad * 0.72, rot, 0, TAU);
        g.fill();
      });
      g.fillStyle = rgba(mix(pal.soilLight, '#ffffff', 0.3), 0.4);
      wrap(x, y, rad * 2, (px, py) => {
        g.beginPath();
        g.ellipse(px - rad * 0.24, py - rad * 0.26, rad * 0.58 * sx, rad * 0.3, rot, 0, TAU);
        g.fill();
      });
      g.fillStyle = rgba(pal.soilDark, 0.46);
      wrap(x, y, rad * 2, (px, py) => {
        g.beginPath();
        g.ellipse(px + rad * 0.16, py + rad * 0.36, rad * 0.66 * sx, rad * 0.26, rot, 0, TAU);
        g.fill();
      });
    }
  }

  // 4) 细根：暗线 + 偏移半像素的亮边，做出压在土里的浮雕感
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const x = r() * S;
    const y = r() * S;
    const len = 10 + r() * 26;
    const lean = (r() - 0.5) * 16;
    const w = 0.7 + r() * 0.8;
    const rad = len + Math.abs(lean) + 3;
    wrap(x, y, rad, (px, py) => {
      g.strokeStyle = rgba(pal.soilLight, 0.13);
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(px - 0.9, py - 0.9);
      g.quadraticCurveTo(px + lean * 0.3 - 0.9, py + len * 0.55 - 0.9, px + lean - 0.9, py + len - 0.9);
      g.stroke();
      g.strokeStyle = rgba(pal.soilDark, 0.42);
      g.beginPath();
      g.moveTo(px, py);
      g.quadraticCurveTo(px + lean * 0.3, py + len * 0.55, px + lean, py + len);
      g.stroke();
    });
  }

  // 4.5) 翻起的土块：圆钝团块 + 亮顶暗底，土体才有「被挖过」的结构，不只是噪点
  for (let i = 0; i < 5; i++) {
    const x = r() * S;
    const y = r() * S;
    const rx = 14 + r() * 20;
    const ry = 7 + r() * 10;
    const rot = (r() - 0.5) * 0.5;
    const a1 = 0.10 + r() * 0.06;
    const a2 = 0.10 + r() * 0.05;
    g.fillStyle = rgba(pal.soilDark, a1);
    wrap(x, y, rx + 2, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, rx, ry, rot, 0, TAU);
      g.fill();
    });
    g.fillStyle = rgba(mix(pal.soil, pal.soilLight, 0.45), a2);
    wrap(x, y, rx + 2, (px, py) => {
      g.beginPath();
      g.ellipse(px, py - ry * 0.52, rx * 0.8, ry * 0.4, rot, 0, TAU);
      g.fill();
    });
  }

  // 4.6) 干裂缝：细折线，暗缝 + 偏移半像素的亮边
  g.lineJoin = 'round';
  for (let i = 0; i < 4; i++) {
    const x0 = r() * S;
    const y0 = r() * S;
    const ptsA = [[0, 0]];
    let ang = r() * TAU;
    for (let k = 0; k < 4; k++) {
      ang += (r() - 0.5) * 1.2;
      const len = 6 + r() * 12;
      ptsA.push([ptsA[k][0] + Math.cos(ang) * len, ptsA[k][1] + Math.sin(ang) * len]);
    }
    wrap(x0, y0, 40, (px, py) => {
      const dx = px - x0;
      const dy = py - y0;
      g.strokeStyle = rgba(pal.soilLight, 0.1);
      g.lineWidth = 0.6;
      g.beginPath();
      for (let k = 0; k < ptsA.length; k++) {
        const qx = x0 + ptsA[k][0] + dx - 0.8;
        const qy = y0 + ptsA[k][1] + dy - 0.8;
        if (k === 0) g.moveTo(qx, qy);
        else g.lineTo(qx, qy);
      }
      g.stroke();
      g.strokeStyle = rgba(pal.soilDark, 0.26);
      g.lineWidth = 0.9;
      g.beginPath();
      for (let k = 0; k < ptsA.length; k++) {
        const qx = x0 + ptsA[k][0] + dx;
        const qy = y0 + ptsA[k][1] + dy;
        if (k === 0) g.moveTo(qx, qy);
        else g.lineTo(qx, qy);
      }
      g.stroke();
    });
  }

  // 5) 颗粒（亮暗各半，1px 为主）
  for (let i = 0; i < 230; i++) {
    const hs = r();
    g.fillStyle = hs > 0.5 ? rgba(pal.soilLight, 0.08 + hs * 0.13) : rgba(pal.soilDark, 0.16 + hs * 0.24);
    const sz = hs > 0.92 ? 2 : 1;
    g.fillRect(r() * S, r() * S, sz, sz);
  }

  // 6) 石英微光：短划线，给大片暗土一点"矿物"质感
  for (let i = 0; i < 14; i++) {
    const x = r() * S;
    const y = r() * S;
    const a = r() * TAU;
    const l = 1.2 + r() * 2.2;
    const ca = Math.cos(a) * l;
    const sa = Math.sin(a) * l;
    g.strokeStyle = rgba(mix(pal.pebble, '#ffffff', 0.5), 0.12 + r() * 0.12);
    g.lineWidth = 0.6;
    wrap(x, y, 5, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + ca, py + sa);
      g.stroke();
    });
  }

  // 7) 暗部环境色：几块很大的冷色软斑，避免整片土变成中性棕
  for (let i = 0; i < 3; i++) {
    const x = r() * S;
    const y = r() * S;
    const rx = 20 + r() * 26;
    const ry = 16 + r() * 24;
    g.fillStyle = rgba(env, 0.04 + r() * 0.03);
    wrap(x, y, rx, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, rx, ry, 0, 0, TAU);
      g.fill();
    });
  }

  // 整体压深一档：前景地形必须比背景更沉，不能是一片浅棕
  g.fillStyle = rgba(mix(pal.soil, '#000000', 0.30), 0.08);
  g.fillRect(0, 0, S, S);

  _soilPatCache.set(ck, cv);
  return cv;
}

/** 泥土：底色 + 湿土暗块 + 颗粒 + 碎石 + 根系 + 边缘 AO */
function paintSoilTile(g, th, pal, v, mask, lit) {
  const r = mulberry32((v * 733 + 11) | 0);
  // 底色（带出血）
  g.fillStyle = pal.soil;
  g.fillRect(-TILE_PAD_S, 0, T + TILE_PAD_S * 2, T + TILE_PAD_B);
  const grd = g.createLinearGradient(0, 0, 0, T);
  grd.addColorStop(0, mix(pal.soil, pal.soilLight, 0.34));
  grd.addColorStop(0.42, pal.soil);
  grd.addColorStop(1, mix(pal.soil, pal.soilDark, 0.6));
  g.fillStyle = grd;
  g.fillRect(-TILE_PAD_S, 0, T + TILE_PAD_S * 2, T);

  // 表土湿暗带：紧贴开口上缘，土色由上往下「变干变浅」，地表与土体不再是硬线
  if (mask & 1) {
    const wet = g.createLinearGradient(0, 0, 0, 14);
    wet.addColorStop(0, rgba(mix(pal.soilDark, '#000000', 0.18), 0.5));
    wet.addColorStop(0.55, rgba(pal.soilDark, 0.16));
    wet.addColorStop(1, rgba(pal.soilDark, 0));
    g.fillStyle = wet;
    g.fillRect(-TILE_PAD_S, 0, T + TILE_PAD_S * 2, 14);
  }

  // 湿土暗块，让平面不是一块纯色
  g.fillStyle = rgba(pal.soilDark, 0.32);
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const ex = 4 + r() * (T - 8);
    const ey = 8 + r() * (T - 16);
    g.moveTo(ex + 6, ey);
    g.ellipse(ex, ey, 4 + r() * 7, 2 + r() * 4, r() * TAU, 0, TAU);
  }
  g.fill();

  // 颗粒
  for (let i = 0; i < 56; i++) {
    const hx = r();
    const hy = r();
    const hs = r();
    g.fillStyle = hs > 0.52 ? rgba(pal.soilLight, 0.18 + hs * 0.24) : rgba(pal.soilDark, 0.2 + hs * 0.26);
    g.fillRect(hx * T, hy * T, hs > 0.86 ? 1.8 : 1, 1);
  }

  // 沉积纹
  g.strokeStyle = rgba(pal.soilDark, 0.32);
  g.lineWidth = 1.1;
  g.beginPath();
  for (let i = 0; i < 2; i++) {
    const yy = 11 + i * 11 + (r() - 0.5) * 3;
    g.moveTo(-1, yy);
    g.quadraticCurveTo(T * 0.3, yy - 1.7, T * 0.62, yy + 0.8);
    g.quadraticCurveTo(T * 0.85, yy + 2.2, T + 1, yy - 0.6);
  }
  g.stroke();

  // 碎石：顶部受光、底部接触阴影
  for (let i = 0; i < 2; i++) {
    const px = 4 + r() * (T - 8);
    const py = 8 + r() * (T - 14);
    const rr = 1.5 + r() * 2;
    g.fillStyle = rgba(pal.soilDark, 0.4);
    g.beginPath();
    g.ellipse(px, py + 0.9, rr * 1.1, rr * 0.7, 0, 0, TAU);
    g.fill();
    g.fillStyle = rgba(pal.pebble, 0.55);
    g.beginPath();
    g.ellipse(px, py, rr, rr * 0.66, (r() - 0.5) * 0.7, 0, TAU);
    g.fill();
    g.fillStyle = rgba(pal.soilLight, 0.5);
    g.beginPath();
    g.ellipse(px - rr * 0.3, py - rr * 0.3, rr * 0.5, rr * 0.26, 0, 0, TAU);
    g.fill();
  }

  // 表层碎砾：半埋在土表的小石子，受光顶 + 1px 接触影，给地平线加碎质感
  if (mask & 1) {
    for (let i = 0; i < 3; i++) {
      const px = 2 + r() * (T - 4);
      const py = 2.6 + r() * 4.4;
      const rr = 1.1 + r() * 1.5;
      const rot = (r() - 0.5) * 0.9;
      g.fillStyle = rgba(pal.soilDark, 0.45);
      g.beginPath();
      g.ellipse(px, py + rr * 0.5, rr * 1.15, rr * 0.5, rot, 0, TAU);
      g.fill();
      g.fillStyle = rgba(mix(pal.pebble, pal.soilLight, 0.35 + r() * 0.4), 0.9);
      g.beginPath();
      g.ellipse(px, py, rr, rr * 0.62, rot, 0, TAU);
      g.fill();
      g.fillStyle = rgba(mix(pal.soilLight, '#ffffff', 0.3), 0.55);
      g.beginPath();
      g.ellipse(px - rr * 0.25, py - rr * 0.24, rr * 0.5, rr * 0.24, rot, 0, TAU);
      g.fill();
    }
  }

  // 矿物斜纹：两道极淡的浅色层理，让土里有"岩层"的方向感
  g.strokeStyle = rgba(mix(pal.pebble, pal.soilLight, 0.5), 0.13);
  g.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) {
    const yy = 10 + r() * (T - 20);
    g.beginPath();
    g.moveTo(-1, yy + 4);
    g.lineTo(T + 1, yy - 4);
    g.stroke();
  }

  // 根系：从上缘垂下来的细根
  if (mask & 1) {
    g.strokeStyle = rgba(pal.soilDark, 0.45);
    for (let i = 0; i < 3; i++) {
      const rx = 3 + r() * (T - 6);
      const rl = 4 + r() * 9;
      g.lineWidth = 0.7 + r() * 0.7;
      g.beginPath();
      g.moveTo(rx, 1);
      g.quadraticCurveTo(rx + (r() - 0.5) * 4, rl * 0.6, rx + (r() - 0.5) * 7, rl);
      g.stroke();
    }
  }

  // 霜雪主题：地表的霜晶颗粒 + 上缘积雪
  if (th && th.ground === 'dew') {
    const sf = mulberry32((v * 311 + 7) | 0);
    for (let i = 0; i < 26; i++) {
      const fx = sf() * T;
      const fy = sf() * T;
      const fs2 = 0.6 + sf() * 1.2;
      g.fillStyle = rgba(mix('#ffffff', pal.iceLight, 0.3), 0.25 + sf() * 0.5);
      g.fillRect(fx, fy, fs2, fs2);
    }
    for (let i = 0; i < 5; i++) {
      const fx = sf() * T;
      const fy = 2 + sf() * 14;
      g.strokeStyle = rgba('#ffffff', 0.35);
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(fx - 1.6, fy);
      g.lineTo(fx + 1.6, fy);
      g.moveTo(fx, fy - 1.6);
      g.lineTo(fx, fy + 1.6);
      g.stroke();
    }
    if (mask & 1) {
      g.fillStyle = rgba(mix('#dfeaf8', pal.iceLight, 0.35), 0.5);
      g.beginPath();
      g.moveTo(-TILE_PAD_S, 0);
      for (let i = 0; i <= 6; i++) {
        const sx = -TILE_PAD_S + (i / 6) * (T + TILE_PAD_S * 2);
        g.lineTo(sx, 1.4 + sf() * 2.6);
      }
      g.lineTo(T + TILE_PAD_S, 0);
      g.closePath();
      g.fill();
    }
  }

  // 上缘低矮草簇剪影：给地面加一层毛边
  if (mask & 1) {
    const tf = mulberry32((v * 577 + 23) | 0);
    g.fillStyle = rgba(mix(pal.soilDark, pal.grassDark, 0.45), 0.55);
    g.beginPath();
    for (let i = 0; i < 9; i++) {
      const gx = tf() * T;
      const gh = 2 + tf() * 5;
      const lean = (tf() - 0.5) * 4;
      g.moveTo(gx - 0.8, 1);
      g.lineTo(gx + lean, -gh);
      g.lineTo(gx + 0.8, 1);
      g.closePath();
    }
    g.fill();
  }

  edgeShading(g, pal, mask, lit, 0);

  // 月光 rim：露出的上缘压一条冷白细线，把地形从背景里拔出来
  if (th && th.ground === 'dew' && mask & 1) {
    g.fillStyle = rgba(mix('#e8f2ff', pal.iceLight, 0.35), 0.4);
    g.fillRect(-TILE_PAD_S, 0.2, T + TILE_PAD_S * 2, 1.1);
    g.fillStyle = rgba('#ffffff', 0.16);
    g.fillRect(-TILE_PAD_S, 1.3, T + TILE_PAD_S * 2, 0.8);
  }
}

/** 土壤类瓦片的四面开口明暗（顶亮、侧暗、底深） */
function edgeShading(g, pal, mask, lit, topOffset) {
  const t0 = topOffset || 0;
  if (mask & 1) {
    g.fillStyle = rgba(pal.soilLight, 0.5);
    g.fillRect(0, t0, T, 1.7);
    g.fillStyle = rgba(pal.soilLight, 0.18);
    g.fillRect(0, t0 + 1.7, T, 1.2);
    g.fillStyle = rgba(pal.soilDark, 0.28);
    g.fillRect(0, t0 + 3.2, T, 1);
  }
  if (mask & 4) {
    const gg = g.createLinearGradient(0, T - 13, 0, T);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gg;
    g.fillRect(-TILE_PAD_S, T - 13, T + TILE_PAD_S * 2, 13 + TILE_PAD_B);
  }
  if (mask & 8) {
    g.fillStyle = rgba(pal.soilDark, 0.32);
    g.fillRect(0, 0, 2.2, T);
    g.fillStyle = lit ? rgba(pal.soilDark, 0.4) : rgba(pal.soilLight, 0.22);
    g.fillRect(0, 0, 1, T);
  }
  if (mask & 2) {
    g.fillStyle = rgba(lit ? pal.soilLight : pal.soilDark, lit ? 0.3 : 0.34);
    g.fillRect(T - 2, 0, 2, T);
    g.fillStyle = rgba(lit ? pal.soilLight : pal.soilDark, lit ? 0.5 : 0.4);
    g.fillRect(T - 0.8, 0, 0.8, T);
  }
}

/** 草地：土壤 + 厚草皮（不规则下缘）+ 顶面高光 + 与泥土的 AO + 细叶 + 垂草 */
function paintGrassTile(g, th, pal, v, mask, lit) {
  paintSoilTile(g, th, pal, v, mask, lit);
  if (!(mask & 1)) return;
  const r = mulberry32((v * 977 + 37) | 0);
  const topY = -1.4;

  // 草皮暗底（下缘不规则）
  g.fillStyle = pal.grassDark;
  g.beginPath();
  g.moveTo(-TILE_PAD_S, topY);
  g.lineTo(T + TILE_PAD_S, topY);
  g.lineTo(T + TILE_PAD_S, 9 + r() * 2.4);
  for (let i = 5; i >= 0; i--) {
    const x = (i / 5) * T;
    g.quadraticCurveTo(x + 2.8, 12.6 + r() * 3, x - 2.8, 9.4 + r() * 2);
  }
  g.closePath();
  g.fill();

  // 草皮中调
  g.fillStyle = pal.grass;
  g.beginPath();
  g.moveTo(-TILE_PAD_S, topY);
  g.lineTo(T + TILE_PAD_S, topY);
  g.lineTo(T + TILE_PAD_S, 6.6);
  for (let i = 5; i >= 0; i--) {
    const x = (i / 5) * T;
    g.quadraticCurveTo(x + 2.4, 9.2 + r() * 2.2, x - 2.4, 6.6 + r() * 1.6);
  }
  g.closePath();
  g.fill();

  // 顶面受光（主光在上：[草皮顶边]亮、往下 2px 一层弱受光，像被光从后面打透）
  g.fillStyle = rgba(pal.grassLight, 0.7);
  g.fillRect(-TILE_PAD_S, topY, T + TILE_PAD_S * 2, 1.4);
  g.fillStyle = rgba(pal.grassTip, 0.5);
  g.fillRect(-TILE_PAD_S, topY, T + TILE_PAD_S * 2, 0.7);
  g.fillStyle = rgba(pal.grassLight, 0.16);
  g.fillRect(-TILE_PAD_S, topY + 1.4, T + TILE_PAD_S * 2, 1.8);

  // 草皮与泥土的接触 AO
  const ao = g.createLinearGradient(0, 5, 0, 17);
  ao.addColorStop(0, rgba(pal.soilDark, 0.6));
  ao.addColorStop(1, rgba(pal.soilDark, 0));
  g.fillStyle = ao;
  g.fillRect(-TILE_PAD_S, 5, T + TILE_PAD_S * 2, 12);

  // 草皮里的暗缝（碎草层次）
  g.strokeStyle = rgba(pal.grassDark, 0.55);
  g.lineWidth = 0.9;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const px = 2 + r() * (T - 4);
    g.moveTo(px, topY + 1.5);
    g.quadraticCurveTo(px + (r() - 0.5) * 5, 4.6, px + (r() - 0.5) * 8, 8.2);
  }
  g.stroke();

  // 草皮受光面的碎叶团：亮色短笔压住大片死绿，草皮不再是单一色块
  g.strokeStyle = rgba(pal.grassLight, 0.32);
  g.lineWidth = 1.1;
  g.beginPath();
  for (let i = 0; i < 7; i++) {
    const px = 1 + r() * (T - 3);
    const py = topY + 2 + r() * 3.6;
    g.moveTo(px, py);
    g.quadraticCurveTo(px + 1.6, py - 0.9, px + 3.4 + r() * 2, py + 0.5);
  }
  g.stroke();

  // 细长草叶（一部分伸出瓦片顶部，进入 padding）：位置带轻微聚簇，不做等距排布
  g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const bx = 0.5 + r() * (T - 1) + ((i % 3) - 1) * 1.6;
    const hh = 3.2 + r() * 9.8;
    const lean = (r() - 0.5) * 10;
    g.strokeStyle = i % 5 === 0 ? pal.grassTip : (i % 3 === 0 ? pal.grassLight : pal.grass);
    g.lineWidth = 0.7 + r() * 0.85;
    g.beginPath();
    g.moveTo(bx, topY + 2);
    g.quadraticCurveTo(bx + lean * 0.3, topY - hh * 0.55, bx + lean, topY - hh);
    g.stroke();
  }

  // 被风吹倒的草叶：贴着草皮顶面的短弧，让顶缘不是一排竖线
  g.strokeStyle = rgba(pal.grassTip, 0.3);
  g.lineWidth = 0.8;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const px = r() * (T - 6);
    g.moveTo(px, topY + 0.6);
    g.quadraticCurveTo(px + 3, topY - 1.5, px + 6, topY + 0.2);
  }
  g.stroke();

  // 垂草：草皮从侧面垂下去（只有开口的边才画）
  if (mask & 8) {
    g.strokeStyle = pal.grassDark;
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const px = 0.5 + r() * 2;
      g.moveTo(px, 1);
      g.quadraticCurveTo(px - 2.5, 5 + i * 2.4, px - 1.2 + r() * 2.4, 8 + i * 2.8);
    }
    g.stroke();
  }
  if (mask & 2) {
    g.strokeStyle = pal.grassDark;
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const px = T - 0.5 - r() * 2;
      g.moveTo(px, 1);
      g.quadraticCurveTo(px + 2.5, 5 + i * 2.4, px + 1.2 - r() * 2.4, 8 + i * 2.8);
    }
    g.stroke();
  }

  themeGroundAccents(g, th, r, topY);
}

/** 主题地表点缀：花瓣 / 孢子 / 霜 / 苔 / 冥火 / 露水 / 余烬 */
function themeGroundAccents(g, th, r, topY) {
  const a = th.accent;
  const gnd = th.ground;
  if (gnd === 'petal') {
    g.fillStyle = rgba(a, 0.8);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(3 + r() * (T - 6), topY + 1.6 + r() * 2.6, 1.9, 1.05, r() * TAU, 0, TAU);
      g.fill();
    }
  } else if (gnd === 'spore') {
    g.fillStyle = rgba(mix(a, '#e8ffb0', 0.3), 0.75);
    for (let i = 0; i < 5; i++) {
      const px = 2 + r() * (T - 4);
      const py = topY - 1 - r() * 6;
      const rr = 0.8 + r() * 1.1;
      g.beginPath();
      g.arc(px, py, rr, 0, TAU);
      g.fill();
    }
  } else if (gnd === 'frost') {
    g.strokeStyle = rgba('#eafcff', 0.55);
    g.lineWidth = 0.7;
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const px = 2 + r() * (T - 4);
      const py = topY + 0.6 + r() * 2;
      g.moveTo(px - 2, py);
      g.lineTo(px + 2, py);
      g.moveTo(px, py - 1.6);
      g.lineTo(px, py + 1.6);
    }
    g.stroke();
  } else if (gnd === 'moss') {
    g.fillStyle = rgba(th.tile.grassLight, 0.28);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(3 + r() * (T - 6), topY + 1 + r() * 2.4, 2 + r() * 3, 1 + r() * 1.6, 0, 0, TAU);
      g.fill();
    }
  } else if (gnd === 'soul') {
    g.fillStyle = rgba(mix(a, '#dfe6ff', 0.4), 0.7);
    for (let i = 0; i < 4; i++) {
      const px = 2 + r() * (T - 4);
      const py = topY - 2 - r() * 9;
      g.beginPath();
      g.arc(px, py, 0.9 + r() * 0.7, 0, TAU);
      g.fill();
    }
  } else if (gnd === 'dew') {
    g.fillStyle = rgba('#e8fbff', 0.6);
    for (let i = 0; i < 3; i++) {
      const px = 3 + r() * (T - 6);
      const py = topY + 1.4 + r() * 2;
      g.beginPath();
      g.arc(px, py, 0.9 + r() * 0.8, 0, TAU);
      g.fill();
      g.fillStyle = rgba('#ffffff', 0.5);
      g.beginPath();
      g.arc(px - 0.3, py - 0.3, 0.5, 0, TAU);
      g.fill();
      g.fillStyle = rgba('#e8fbff', 0.6);
    }
  } else if (gnd === 'ember') {
    g.fillStyle = rgba(mix(a, '#ffb060', 0.35), 0.6);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(3 + r() * (T - 6), topY + 0.8 + r() * 3, 0.8 + r() * 0.8, 0, TAU);
      g.fill();
    }
  } else {
    g.fillStyle = rgba(a, 0.5);
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(3 + r() * (T - 6), topY + 2 + r() * 2, 1, 0, TAU);
      g.fill();
    }
  }
}

/** 砖：4 皮错缝 + 倒角高光 + 砂浆暗缝 + 苔藓 + 裂纹 */
function paintBrickTile(g, th, pal, v, mask, lit) {
  const r = mulberry32((v * 419 + 23) | 0);
  g.fillStyle = pal.brickDark;
  g.fillRect(-TILE_PAD_S, 0, T + TILE_PAD_S * 2, T + TILE_PAD_B);

  const bh = 8;
  for (let row = 0; row < 4; row++) {
    const y0 = row * bh;
    const off = row % 2 ? -4 : 0;
    for (let k = -1; k < 5; k++) {
      const x0 = k * 8 + off + 0.6;
      const ww = 8 - 1.2;
      // 砖体
      const tint = (hash1(v * 13 + row * 7 + k * 3) - 0.5) * 0.16;
      g.fillStyle = mix(pal.brick, tint > 0 ? pal.brickLight : pal.brickDark, Math.abs(tint) * 1.6);
      g.fillRect(x0, y0 + 0.6, ww, bh - 1.2);
      // 上/左倒角受光
      g.fillStyle = rgba(pal.brickLight, 0.38);
      g.fillRect(x0, y0 + 0.6, ww, 0.9);
      g.fillRect(x0, y0 + 0.6, 0.9, bh - 1.2);
      // 下/右暗边
      g.fillStyle = rgba('#000000', 0.28);
      g.fillRect(x0, y0 + bh - 1.5, ww, 0.9);
      g.fillRect(x0 + ww - 0.9, y0 + 0.6, 0.9, bh - 1.2);
    }
  }
  // 砂浆缝里的苔藓
  g.fillStyle = rgba(mix(pal.grassDark, '#7fa04e', 0.25), 0.32);
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(r() * T, Math.floor(r() * 4) * 8 + r() * 2, 1.6 + r() * 2.6, 0.9 + r() * 1.2, 0, 0, TAU);
    g.fill();
  }
  // 裂纹
  if (v === 2) {
    g.strokeStyle = rgba('#000000', 0.35);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(T * 0.62, 0);
    g.lineTo(T * 0.56, 9);
    g.lineTo(T * 0.66, 18);
    g.lineTo(T * 0.6, T);
    g.stroke();
  }
  // 顶面与侧面
  if (mask & 1) {
    g.fillStyle = rgba(pal.brickLight, 0.55);
    g.fillRect(0, 0, T, 1.6);
  }
  if (mask & 4) {
    const gg = g.createLinearGradient(0, T - 10, 0, T);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = gg;
    g.fillRect(0, T - 10, T, 10);
  }
  if (mask & 8) {
    g.fillStyle = rgba('#000000', 0.3);
    g.fillRect(0, 0, 1.6, T);
    g.fillStyle = rgba(pal.brickLight, 0.2);
    g.fillRect(0, 0, 0.8, T);
  }
  if (mask & 2) {
    g.fillStyle = rgba(lit ? pal.brickLight : '#000000', lit ? 0.35 : 0.3);
    g.fillRect(T - 1.6, 0, 1.6, T);
  }
}

/** 冰：半透明层 + 内部斜向纹理 + 裂纹 + 表面反光 + 霜边 */
function paintIceTile(g, th, pal, v, mask, lit) {
  const r = mulberry32((v * 617 + 53) | 0);
  g.fillStyle = pal.iceDark;
  g.fillRect(-TILE_PAD_S, 0, T + TILE_PAD_S * 2, T + TILE_PAD_B);
  const grd = g.createLinearGradient(0, 0, T * 0.7, T);
  grd.addColorStop(0, rgba(pal.iceLight, 0.85));
  grd.addColorStop(0.45, rgba(pal.ice, 0.85));
  grd.addColorStop(1, rgba(pal.iceDark, 0.9));
  g.fillStyle = grd;
  g.fillRect(0, 0, T, T);

  // 内部斜向纹（冰的层理）
  g.strokeStyle = rgba(pal.iceLight, 0.35);
  g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const px = -6 + i * 12 + r() * 4;
    g.moveTo(px, T + 2);
    g.lineTo(px + 14, -2);
  }
  g.stroke();
  g.strokeStyle = rgba(pal.iceDark, 0.4);
  g.lineWidth = 0.9;
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const px = 2 + i * 12 + r() * 4;
    g.moveTo(px, T + 2);
    g.lineTo(px + 12, -2);
  }
  g.stroke();

  // 裂纹
  g.strokeStyle = rgba('#ffffff', 0.3);
  g.lineWidth = 0.7;
  g.beginPath();
  const cx0 = 4 + r() * (T - 8);
  g.moveTo(cx0, 2);
  g.lineTo(cx0 + 3, 9);
  g.lineTo(cx0 - 1, 15);
  g.lineTo(cx0 + 4, 24);
  g.stroke();

  // 顶部反光
  g.fillStyle = rgba('#ffffff', 0.55);
  g.fillRect(0, 0, T, 1.4);
  g.fillStyle = rgba(pal.iceLight, 0.4);
  g.fillRect(0, 1.4, T, 1.2);
  // 侧边暗
  if (mask & 8) {
    g.fillStyle = rgba(pal.iceDark, 0.5);
    g.fillRect(0, 0, 1.8, T);
  }
  if (mask & 2) {
    g.fillStyle = rgba(lit ? pal.iceLight : pal.iceDark, 0.5);
    g.fillRect(T - 1.8, 0, 1.8, T);
  }
  if (mask & 4) {
    g.fillStyle = rgba(pal.iceDark, 0.55);
    g.fillRect(0, T - 2, T, 2);
  }
  // 霜点
  g.fillStyle = rgba('#ffffff', 0.5);
  for (let i = 0; i < 4; i++) {
    g.fillRect(r() * T, r() * 4, 1.2, 0.7);
  }
}

/** 木平台：轻薄木板 + 木纹 + 顶面受光 + 端头暗边 */
function paintPlatformTile(g, pal, v, mask, lit) {
  const r = mulberry32((v * 311 + 71) | 0);
  const hh = 12;
  g.fillStyle = pal.woodDark;
  g.fillRect(-TILE_PAD_S, 0, T + TILE_PAD_S * 2, hh + TILE_PAD_B);

  // 板面
  const grd = g.createLinearGradient(0, 0, 0, hh);
  grd.addColorStop(0, mix(pal.wood, pal.woodLight, 0.35));
  grd.addColorStop(0.4, pal.wood);
  grd.addColorStop(1, mix(pal.wood, pal.woodDark, 0.55));
  g.fillStyle = grd;
  g.fillRect(0, 0, T, hh);
  // 木纹
  g.strokeStyle = rgba(pal.woodDark, 0.4);
  g.lineWidth = 0.8;
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const yy = 2.6 + i * 3.2;
    g.moveTo(0, yy);
    g.quadraticCurveTo(T * 0.3, yy + (r() - 0.5) * 1.2, T * 0.62, yy + (r() - 0.5) * 1.2);
    g.quadraticCurveTo(T * 0.85, yy + (r() - 0.5) * 1.2, T, yy);
  }
  g.stroke();
  // 顶面受光 / 底面暗 / 端头
  g.fillStyle = rgba(mix(pal.wood, '#ffffff', 0.3), 0.55);
  g.fillRect(0, 0, T, 1.3);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, hh - 1.6, T, 1.6);
  if (mask & 8) {
    g.fillStyle = rgba(pal.woodDark, 0.85);
    g.fillRect(0, 0, 1.6, hh);
  }
  if (mask & 2) {
    g.fillStyle = rgba(pal.woodDark, 0.7);
    g.fillRect(T - 1.6, 0, 1.6, hh);
  }
  // 铁钉
  g.fillStyle = rgba('#d8d0c0', 0.5);
  g.fillRect(3, 4, 1.2, 1.2);
  g.fillRect(T - 4.2, 4, 1.2, 1.2);
  // 悬挂阴影（平台下方）
  const gg = g.createLinearGradient(0, hh, 0, hh + 8);
  gg.addColorStop(0, 'rgba(0,0,0,0.3)');
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gg;
  g.fillRect(0, hh, T, 8);
}

/** 尖刺：三根锐利晶刺，两个面 + 尖端高光 + 底部阴影 */
function paintSpikeTile(g, pal, v, mask, lit) {
  g.fillStyle = rgba(pal.spikeDark, 0.25);
  g.fillRect(0, T - 5, T, 5 + TILE_PAD_B);
  for (let i = 0; i < 3; i++) {
    const bx = 5.5 + i * 10.5;
    const topY = 5 + hash1(v * 7 + i * 13) * 3;
    // 暗面
    g.fillStyle = pal.spikeDark;
    g.beginPath();
    g.moveTo(bx - 4.2, T - 3);
    g.lineTo(bx, topY);
    g.lineTo(bx + 4.2, T - 3);
    g.closePath();
    g.fill();
    // 受光面
    g.fillStyle = pal.spike;
    g.beginPath();
    g.moveTo(bx - 4.2, T - 3);
    g.lineTo(bx, topY);
    g.lineTo(bx - 0.4, T - 3);
    g.closePath();
    g.fill();
    // 棱线 + 尖端
    g.strokeStyle = rgba(mix(pal.spike, '#ffffff', 0.4), 0.5);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(bx - 0.4, T - 3);
    g.lineTo(bx, topY);
    g.stroke();
    g.fillStyle = rgba('#ffffff', 0.7);
    g.beginPath();
    g.arc(bx, topY + 1, 0.8, 0, TAU);
    g.fill();
  }
}

/* ---------------- 动态瓦片：水 / 藤 / 蘑菇（保留少量实时绘制） -------- */

/** 水面：底色 + 波动高光 + 水面亮线 + 月影反光 */
function drawWater(ctx, x, y, pal, level, cx, cy, t) {
  const above = level.tileAt(cx, cy - 1);
  const above2 = level.tileAt(cx, cy - 2);
  const surface = above !== WATER;
  const deep = above2 === WATER;
  ctx.save();
  ctx.fillStyle = pal.water;
  ctx.fillRect(x, y, T, T);
  if (!deep) {
    ctx.fillStyle = rgba(pal.waterLight, 0.1);
    ctx.fillRect(x, y, T, 9);
    ctx.fillStyle = rgba(pal.waterDark, 0.28);
    ctx.fillRect(x, y + T - 9, T, 9);
  }
  if (!deep) {
    const ph = t * 0.9 + cx * 0.7;
    ctx.strokeStyle = rgba(pal.waterLight, 0.32);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const yy = y + (surface ? 6 : 17) + i * 11;
      ctx.moveTo(x, yy);
      ctx.quadraticCurveTo(x + 8, yy - 1.6 + Math.sin(ph + i) * 1.3, x + 16, yy);
      ctx.quadraticCurveTo(x + 24, yy + 1.6 + Math.sin(ph + i + 1.7) * 1.3, x + T, yy);
    }
    ctx.stroke();
  }
  if (surface) {
    ctx.fillStyle = rgba(pal.waterLight, 0.6);
    ctx.fillRect(x, y, T, 1.6);
    const sp = Math.sin(t * 0.8 + cx) * 0.5 + 0.5;
    if (sp > 0.35) {
      ctx.fillStyle = rgba('#ffffff', 0.1 + sp * 0.16);
      ctx.fillRect(x + 4 + hash1(cx * 7) * 8, y + 2, 4 + hash1(cx * 3) * 6, 1.3);
    }
  }
  ctx.restore();
}

/** 藤蔓：两根主藤 + 叶片 + 轻微摆动 */
function drawVine(ctx, x, y, pal, cx, cy, t) {
  const sway = Math.sin(t * 0.8 + cx * 0.9) * 2.2;
  ctx.save();
  ctx.strokeStyle = pal.vine;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(x + 8, y);
  ctx.quadraticCurveTo(x + 10 + sway, y + T * 0.5, x + 8 + sway, y + T);
  ctx.moveTo(x + 22, y);
  ctx.quadraticCurveTo(x + 20 - sway, y + T * 0.5, x + 22 - sway, y + T);
  ctx.stroke();
  ctx.strokeStyle = rgba(mix(pal.vine, '#ffffff', 0.25), 0.25);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + 8.4, y);
  ctx.quadraticCurveTo(x + 10.4 + sway, y + T * 0.5, x + 8.4 + sway, y + T);
  ctx.stroke();
  ctx.fillStyle = pal.leaf;
  for (let i = 0; i < 4; i++) {
    const u = (i + 0.5) / 4;
    const baseX = i % 2 ? x + 22 : x + 8;
    const lx = baseX + (i % 2 ? -sway : sway) * u;
    const ly = y + u * T;
    ctx.beginPath();
    ctx.ellipse(lx + (i % 2 ? -5 : 5), ly, 4.6, 2.4, i % 2 ? 0.5 : -0.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** 蘑菇：压暗的红伞 + 斑点 + 接触阴影 */
function drawMushroom(ctx, x, y, pal, cx, cy, t) {
  const bx = x + T * 0.5;
  const by = y + T - 2;
  const h = T * 0.4;
  const w = T * 0.58;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(bx, by, w * 0.5, 2.4, 0, 0, TAU);
  ctx.fill();
  // 菌柄
  ctx.fillStyle = pal.stem;
  ctx.beginPath();
  ctx.moveTo(bx - 2.4, by);
  ctx.quadraticCurveTo(bx - 1.7, by - h, bx - 2, by - h * 1.2);
  ctx.lineTo(bx + 2, by - h * 1.2);
  ctx.quadraticCurveTo(bx + 1.7, by - h, bx + 2.4, by);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(pal.capDark, 0.2);
  ctx.fillRect(bx + 0.4, by - h * 1.1, 1.4, h * 1.05);
  // 菌盖
  ctx.fillStyle = pal.cap;
  ctx.beginPath();
  ctx.ellipse(bx, by - h * 1.16, w * 0.5, h * 0.6, 0, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(pal.capDark, 0.4);
  ctx.beginPath();
  ctx.ellipse(bx + w * 0.16, by - h * 1.1, w * 0.32, h * 0.48, 0, Math.PI, TAU);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.5);
  const sp = [[-4, -h * 1.28, 1.6], [1, -h * 1.4, 1.2], [5, -h * 1.24, 1.3]];
  for (let i = 0; i < sp.length; i++) {
    ctx.beginPath();
    ctx.arc(bx + sp[i][0], by + sp[i][1], sp[i][2], 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------- 主绘制循环 ---------------------------- */

function drawTiles(ctx, level, cam, t) {
  if (!ctx || !level) return;
  const th = themeOf(level.theme);
  const key = themeKey(level.theme);
  const pal = th.tile;
  const c = camOf(cam);
  const c0 = th.celestial;
  const lit = c0 && c0.x > VIEW_W * 0.5 ? 1 : 0;
  const cols = level.cols | 0;
  const rows = level.rows | 0;

  const cx0 = Math.floor(c.x / T) - 1;
  const cx1 = Math.floor((c.x + VIEW_W) / T) + 1;
  const cy0 = Math.floor(c.y / T) - 1;
  const cy1 = Math.floor((c.y + VIEW_H) / T) + 1;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cxA = Math.max(0, cx0);
  const cxB = Math.min(cols - 1, cx1);
  const cyA = Math.max(0, cy0);
  const cyB = Math.min(rows - 1, cy1);

  // 底色合并 pass：土/草地整行一次 fillRect，兜住被跳过的内部瓦片
  const patCv = soilPattern(key, pal, th);
  const pat = patCv ? ctx.createPattern(patCv, 'repeat') : null;
  ctx.fillStyle = pat || pal.soil;
  for (let cy = cyA; cy <= cyB; cy++) {
    let run = -1;
    for (let cx = cxA; cx <= cxB + 1; cx++) {
      const tt = cx <= cxB ? level.tileAt(cx, cy) : -1;
      const soil = tt === SOLID || tt === GRASS;
      if (soil && run < 0) run = cx;
      else if (!soil && run >= 0) {
        ctx.fillRect(run * T, cy * T, (cx - run) * T, T);
        run = -1;
      }
    }
  }

  // 深度压暗：越往土层深处越沉，土体不再是"一面平墙"。
  // 先按实体瓦片拼出裁剪区，再从每列顶面往下铺一条垂直渐变（同顶高的相邻列并成一段）。
  const deepC = mix(pal.soilDark, (th.sky && th.sky[0]) || '#000000', 0.28);
  const colN = cxB - cxA + 1;
  if (colN > 0) {
    const topRow = new Int16Array(colN).fill(-1);
    for (let i = 0; i < colN; i++) {
      for (let cy = cyA; cy <= cyB; cy++) {
        if (isSolidType(level.tileAt(cxA + i, cy))) { topRow[i] = cy; break; }
      }
    }
    let hasTop = false;
    for (let i = 0; i < colN; i++) if (topRow[i] >= 0) { hasTop = true; break; }
    if (hasTop) {
      ctx.save();
      ctx.beginPath();
      for (let cy = cyA; cy <= cyB; cy++) {
        let run = -1;
        for (let cx = cxA; cx <= cxB + 1; cx++) {
          const solid = cx <= cxB && isSolidType(level.tileAt(cx, cy));
          if (solid && run < 0) run = cx;
          else if (!solid && run >= 0) {
            ctx.rect(run * T, cy * T, (cx - run) * T, T);
            run = -1;
          }
        }
      }
      ctx.clip();
      let segStart = 0;
      for (let i = 1; i <= colN; i++) {
        if (i === colN || topRow[i] !== topRow[segStart]) {
          const tr = topRow[segStart];
          if (tr >= 0) {
            const y0 = tr * T;
            const grd = ctx.createLinearGradient(0, y0, 0, y0 + 330);
            grd.addColorStop(0, rgba(deepC, 0.05));
            grd.addColorStop(0.38, rgba(deepC, 0.15));
            grd.addColorStop(1, rgba(deepC, 0.30));
            ctx.fillStyle = grd;
            ctx.fillRect((cxA + segStart) * T, y0, (i - segStart) * T, VIEW_H + T * 2);
          }
          segStart = i;
        }
      }
      ctx.restore();
    }
  }

  const tileAt = (ax, ay) => level.tileAt(ax, ay);

  for (let cy = cyA; cy <= cyB; cy++) {
    for (let cx = cxA; cx <= cxB; cx++) {
      const type = tileAt(cx, cy);
      if (type === EMPTY) continue;
      const x = cx * T;
      const y = cy * T;
      const v3 = (cx * 7 + cy * 13) % 3;

      if (type === SOLID || type === GRASS) {
        const buried =
          isSolidType(tileAt(cx - 1, cy)) && isSolidType(tileAt(cx + 1, cy)) &&
          isSolidType(tileAt(cx, cy - 1)) && isSolidType(tileAt(cx, cy + 1));
        if (buried) continue;
        let mask = 0;
        if (!isSolidType(tileAt(cx, cy - 1))) mask |= 1;
        if (!isSolidType(tileAt(cx + 1, cy))) mask |= 2;
        if (!isSolidType(tileAt(cx, cy + 1))) mask |= 4;
        if (!isSolidType(tileAt(cx - 1, cy))) mask |= 8;
        const variant = type === GRASS ? (cx * 5 + cy * 7) % 3 : v3;
        blitTile(ctx, tileSprite(key, th, type, variant, mask, lit), x, y);
        continue;
      }

      switch (type) {
        case BRICK: {
          let mask = 0;
          if (!isSolidType(tileAt(cx, cy - 1))) mask |= 1;
          if (!isSolidType(tileAt(cx + 1, cy))) mask |= 2;
          if (!isSolidType(tileAt(cx, cy + 1))) mask |= 4;
          if (!isSolidType(tileAt(cx - 1, cy))) mask |= 8;
          blitTile(ctx, tileSprite(key, th, BRICK, (cx * 3 + cy * 5) % 3, mask, lit), x, y);
          break;
        }
        case ICE: {
          let mask = 0;
          if (tileAt(cx, cy - 1) !== ICE) mask |= 1;
          if (tileAt(cx + 1, cy) !== ICE) mask |= 2;
          if (tileAt(cx, cy + 1) !== ICE) mask |= 4;
          if (tileAt(cx - 1, cy) !== ICE) mask |= 8;
          blitTile(ctx, tileSprite(key, th, ICE, (cx + cy * 3) % 2, mask, lit), x, y);
          break;
        }
        case PLATFORM: {
          let mask = 0;
          if (tileAt(cx - 1, cy) !== PLATFORM) mask |= 8;
          if (tileAt(cx + 1, cy) !== PLATFORM) mask |= 2;
          blitTile(ctx, tileSprite(key, th, PLATFORM, cx % 2, mask, lit), x, y);
          break;
        }
        case SPIKE:
          blitTile(ctx, tileSprite(key, th, SPIKE, cx % 2, 0, lit), x, y);
          break;
        case MUSHROOM:
          drawMushroom(ctx, x, y, pal, cx, cy, t);
          break;
        case WATER:
          drawWater(ctx, x, y, pal, level, cx, cy, t);
          break;
        case VINE:
          drawVine(ctx, x, y, pal, cx, cy, t);
          break;
        default:
          break;
      }
    }
  }

  // 土壁嵌石：按世界坐标哈希摆放（不随 128px 花纹重复），给土层中景一点实体感
  {
    const stepW = 52;
    const span = stepW * 3;
    const x0 = Math.floor(cxA * T / stepW) * stepW - span;
    for (let wx = x0; wx <= cxB * T + span; wx += stepW) {
      const h = hash1(wx * 0.731 + 11.3);
      if (h > 0.78) continue;
      const ax = Math.floor((wx + (h - 0.5) * stepW * 0.7) / T);
      if (ax <= cxA || ax >= cxB) continue;
      let tr = -1;
      for (let cy = cyA; cy <= cyB; cy++) {
        if (isSolidType(tileAt(ax, cy))) { tr = cy; break; }
      }
      if (tr < 0) continue;
      const h2 = hash1(wx * 1.937 + 4.1);
      const ay = tr + 1 + Math.floor(h2 * 10);
      if (ay > cyB) continue;
      if (!isSolidType(tileAt(ax, ay)) || !isSolidType(tileAt(ax - 1, ay)) ||
          !isSolidType(tileAt(ax + 1, ay)) || !isSolidType(tileAt(ax, ay - 1))) continue;
      const h3 = hash1(wx * 3.31 + 7.7);
      const h4 = hash1(wx * 5.17 + 2.9);
      const cxw = ax * T + T * 0.5 + (h3 - 0.5) * 6;
      const cyw = ay * T + T * 0.5 + (h4 - 0.5) * 6;
      const rad = 5.0 + h3 * 10.0;
      const rot = (h4 - 0.5) * 0.9;
      const sxr = 0.86 + h4 * 0.4;
      const body = mix(pal.pebble, pal.soilDark, 0.26 + h2 * 0.32);
      ctx.save();
      // 接触阴影
      ctx.fillStyle = rgba(pal.soilDark, 0.42);
      ctx.beginPath();
      ctx.ellipse(cxw + rad * 0.2, cyw + rad * 0.46, rad * 1.16 * sxr, rad * 0.68, rot, 0, TAU);
      ctx.fill();
      // 石体
      ctx.fillStyle = rgba(body, 0.92);
      ctx.beginPath();
      ctx.ellipse(cxw, cyw, rad * sxr, rad * 0.74, rot, 0, TAU);
      ctx.fill();
      // 受光面（左上）
      ctx.fillStyle = rgba(mix(pal.pebble, '#ffffff', 0.42), 0.34);
      ctx.beginPath();
      ctx.ellipse(cxw - rad * 0.26, cyw - rad * 0.28, rad * 0.52 * sxr, rad * 0.3, rot, 0, TAU);
      ctx.fill();
      // 亮边 / 暗边
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(pal.soilDark, 0.3);
      ctx.beginPath();
      ctx.ellipse(cxw, cyw, rad * sxr, rad * 0.74, rot, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(mix(pal.soilLight, '#ffffff', 0.35), 0.34);
      ctx.beginPath();
      ctx.ellipse(cxw - rad * 0.06, cyw - rad * 0.1, rad * 0.9 * sxr, rad * 0.64, rot, Math.PI * 0.92, Math.PI * 1.72);
      ctx.stroke();
      ctx.strokeStyle = rgba(pal.soilDark, 0.52);
      ctx.beginPath();
      ctx.ellipse(cxw - rad * 0.06, cyw - rad * 0.1, rad * 0.9 * sxr, rad * 0.64, rot, Math.PI * -0.08, Math.PI * 0.66);
      ctx.stroke();
      // 石边碎屑
      for (let k = 0; k < 3; k++) {
        const hk = hash1(wx * 9.13 + k * 3.7);
        const ka = rot + hk * 6.28;
        const kd = rad * (1.15 + hk * 0.7);
        const kr = 1.1 + hk * 1.9;
        ctx.fillStyle = rgba(mix(pal.pebble, pal.soilDark, 0.3 + hk * 0.4), 0.8);
        ctx.beginPath();
        ctx.ellipse(cxw + Math.cos(ka) * kd, cyw + Math.sin(ka) * kd * 0.8, kr, kr * 0.75, ka, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 环境粒子                                                            */
/* ------------------------------------------------------------------ */

const wrapSpan = (v, span) => {
  let x = v % span;
  if (x < 0) x += span;
  return x;
};

/** 花瓣/花屑的基本形状：两瓣带缺口，比圆点更有方向感 */
function drawPetalShape(ctx, x, y, size, rot, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.95, -size * 0.35, size * 0.42, size * 0.8);
  ctx.quadraticCurveTo(0, size * 0.28, -size * 0.42, size * 0.8);
  ctx.quadraticCurveTo(-size * 0.95, -size * 0.35, 0, -size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 花瓣：远/近两层。远层小而慢、近层大而快并带 2 段拖尾，
 * 加上横向风相位，形成"有方向的飘落"而不是均匀下落。
 */
function ambientPetals(ctx, th, cam, t) {
  const col = mix(th.accent, '#ffffff', 0.15);
  const col2 = mix(th.accent, '#c04070', 0.3);
  for (let L = 0; L < 2; L++) {
    const near = L === 1;
    const n = near ? 15 : 32;
    const par = near ? 0.55 : 0.22;
    const spanX = VIEW_W + 260;
    const spanY = VIEW_H + 200;
    for (let i = 0; i < n; i++) {
      const id = i + L * 131;
      const s1 = hash1(id * 71 + 13);
      const s2 = hash1(id * 137 + 29);
      const s3 = hash1(id * 53 + 7);
      const speed = (near ? 42 : 17) + s1 * (near ? 28 : 13);
      const x = wrapSpan(s2 * spanX + t * speed - cam.x * par, spanX) - 130;
      const y = wrapSpan(s3 * spanY + t * (near ? 25 : 10) - cam.y * (near ? 0.3 : 0.12), spanY) - 100;
      const s = (near ? 4.4 : 1.7) + s1 * (near ? 3 : 1.1);
      const sway = Math.sin(t * (near ? 1.2 : 0.7) + s2 * TAU) * (near ? 32 : 18);
      const yy = y + Math.cos(t * 0.7 + s3 * TAU) * (near ? 9 : 5);
      const rot = t * (0.6 + s1) * (near ? 1.3 : 1) + i;
      const alpha = (near ? 0.62 : 0.36) + s2 * 0.24;
      const c = s3 > 0.72 ? col2 : col;
      if (near) {
        for (let k = 2; k >= 1; k--) {
          drawPetalShape(ctx, x + sway - k * 5, yy - k * 7, s * (1 - k * 0.14), rot - k * 0.22, c, alpha * (0.2 - k * 0.06));
        }
      }
      drawPetalShape(ctx, x + sway, yy, s, rot, c, alpha);
    }
  }
}

/** 萤火虫 + 孢子：远层小点，近层带光晕，呼吸节奏各不相同 */
function ambientFireflies(ctx, th, cam, t) {
  // 远层孢子
  ctx.save();
  ctx.fillStyle = rgba(th.accent, 0.22);
  ctx.beginPath();
  for (let i = 0; i < 30; i++) {
    const s = hash1(i * 17 + 9);
    const x = wrapSpan(s * 1400 + t * (5 + s * 9) - cam.x * 0.3, 1400);
    const y = 70 + hash1(i * 31 + 3) * 640 + Math.sin(t * 0.5 + i) * 14;
    ctx.moveTo(x, y);
    ctx.arc(x, y, 1.1, 0, TAU);
  }
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < 30; i++) {
    const near = i % 3 === 0;
    const s1 = hash1(i * 97 + 17);
    const s2 = hash1(i * 43 + 5);
    const s3 = hash1(i * 191 + 11);
    const spanX = VIEW_W + 200;
    const x = wrapSpan(s1 * spanX + Math.sin(t * 0.26 + i) * (near ? 52 : 34) - cam.x * (near ? 0.4 : 0.22), spanX) - 100;
    const y = 150 + s2 * 480 + Math.cos(t * 0.21 + i * 1.7) * (near ? 40 : 26) - cam.y * 0.15;
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1.1 + s3) + i * 2.3));
    const rr = (near ? 26 : 18) + s3 * 12;
    glow(ctx, x, y, rr, rr, th.accent, (near ? 0.3 : 0.2) * pulse);
    ctx.save();
    ctx.globalAlpha = 0.5 + pulse * 0.5;
    ctx.fillStyle = mix('#ffffff', th.accent, 0.35);
    ctx.beginPath();
    ctx.arc(x, y, (near ? 1.7 : 1.2) + s3 * 1.1, 0, TAU);
    ctx.fill();
    ctx.restore();
    // 近景萤火拖着一段短短的余光
    if (near) {
      ctx.save();
      ctx.globalAlpha = 0.16 * pulse;
      ctx.fillStyle = th.accent;
      ctx.beginPath();
      ctx.ellipse(x - 7, y + 3, 7, 2.2, -0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** 雪 / 冰晶：三层大小，近层带拖尾与旋转冰晶 */
function ambientSnow(ctx, th, cam, t) {
  for (let L = 0; L < 2; L++) {
    const near = L === 1;
    const n = near ? 20 : 48;
    const spanX = VIEW_W + 160;
    const spanY = VIEW_H + 140;
    for (let i = 0; i < n; i++) {
      const id = i + L * 157;
      const s1 = hash1(id * 61 + 23);
      const s2 = hash1(id * 113 + 7);
      const s3 = hash1(id * 37 + 11);
      const x = wrapSpan(s2 * spanX + Math.sin(t * (near ? 0.9 : 0.7) + i) * (near ? 26 : 16) - cam.x * (near ? 0.32 : 0.2), spanX) - 80;
      const y = wrapSpan(s3 * spanY + t * (near ? 30 : 12) + s1 * (near ? 22 : 10) - cam.y * (near ? 0.2 : 0.1), spanY) - 70;
      const s = (near ? 1.8 : 0.8) + s1 * (near ? 1.6 : 0.9);
      ctx.globalAlpha = (near ? 0.55 : 0.3) + s2 * 0.3;
      ctx.fillStyle = s1 > 0.9 ? th.accent : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, s, 0, TAU);
      ctx.fill();
      if (near && s1 > 0.6) {
        ctx.globalAlpha = 0.12 + s2 * 0.1;
        ctx.fillRect(x - 0.5, y - s * 5, 1, s * 5);
      }
    }
  }
  ctx.globalAlpha = 1;
  // 较大的六角冰晶
  for (let i = 0; i < 5; i++) {
    const s1 = hash1(i * 79 + 3);
    const x = wrapSpan(s1 * 1400 + t * (5 + s1 * 5) - cam.x * 0.14, 1400);
    const y = 60 + hash1(i * 29 + 7) * 560 + Math.sin(t * 0.5 + i) * 18;
    const r = 4 + s1 * 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.2 + i);
    ctx.strokeStyle = rgba('#ffffff', 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** 瀑布水沫：近大远小 + 上升水汽，底部加一层谷雾 */
function ambientSpray(ctx, th, cam, t) {
  for (let L = 0; L < 2; L++) {
    const near = L === 1;
    const n = near ? 16 : 30;
    const spanX = VIEW_W + 160;
    for (let i = 0; i < n; i++) {
      const id = i + L * 149;
      const s1 = hash1(id * 73 + 19);
      const s2 = hash1(id * 29 + 5);
      const s3 = hash1(id * 151 + 13);
      const x = wrapSpan(s2 * spanX + Math.sin(t * 0.9 + i * 1.3) * (near ? 30 : 20) - cam.x * (near ? 0.42 : 0.3), spanX) - 80;
      let y = VIEW_H + 60 - ((s3 * 900 + t * (near ? 26 : 15) + s1 * 120) % 900);
      y -= cam.y * 0.12;
      const r = (near ? 1.6 : 0.8) + s1 * (near ? 2.2 : 1.5);
      ctx.globalAlpha = (near ? 0.28 : 0.14) + Math.max(0, y / VIEW_H) * 0.26;
      ctx.fillStyle = mix(th.accent, '#ffffff', 0.4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {
    const fx = wrapSpan(i * 430 + 180 + t * (6 + i * 2) - cam.x * 0.3, VIEW_W + 500) - 250;
    glow(ctx, fx, VIEW_H - 60, 360, 80, th.haze, 0.11, false);
  }
}

/** 彼岸花屑 + 灵魂光点：花屑上升并带拖尾，灵体有呼吸光核 */
function ambientNether(ctx, th, cam, t) {
  const petalCol = mix(th.accent, '#ffd0d8', 0.2);
  for (let L = 0; L < 2; L++) {
    const near = L === 1;
    const n = near ? 13 : 28;
    const spanX = VIEW_W + 220;
    const spanY = VIEW_H + 200;
    for (let i = 0; i < n; i++) {
      const id = i + L * 173;
      const s1 = hash1(id * 83 + 7);
      const s2 = hash1(id * 47 + 29);
      const s3 = hash1(id * 173 + 3);
      const x = wrapSpan(s2 * spanX + t * (near ? 20 : 9) - cam.x * (near ? 0.36 : 0.24), spanX) - 110;
      const y = wrapSpan(s3 * spanY - t * (near ? 22 : 11) - cam.y * 0.14, spanY) - 100;
      const s = (near ? 3.8 : 1.8) + s1 * (near ? 2.6 : 1.4);
      const sway = Math.sin(t * 0.8 + s2 * TAU) * (near ? 28 : 18);
      const rot = t * (0.5 + s1) + i;
      const alpha = (near ? 0.55 : 0.3) + s2 * 0.3;
      if (near) {
        for (let k = 2; k >= 1; k--) {
          drawPetalShape(ctx, x + sway, y + k * 8, s * (1 - k * 0.16), rot - k * 0.3, petalCol, alpha * (0.18 - k * 0.05));
        }
      }
      drawPetalShape(ctx, x + sway, y, s, rot, petalCol, alpha);
    }
  }
  // 灵魂光点
  for (let i = 0; i < 9; i++) {
    const near = i % 2 === 0;
    const s1 = hash1(i * 101 + 31);
    const s2 = hash1(i * 59 + 17);
    const spanX = VIEW_W + 200;
    const x = wrapSpan(s1 * spanX + Math.sin(t * 0.22 + i * 1.4) * (near ? 52 : 34) - cam.x * 0.2, spanX) - 100;
    const y = 120 + s2 * 520 - ((t * (near ? 13 : 8) + i * 70) % 640);
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.9 + i * 2.1));
    glow(ctx, x, y, near ? 34 : 22, near ? 34 : 22, th.glow, (near ? 0.28 : 0.18) * pulse);
    ctx.save();
    ctx.globalAlpha = (near ? 0.6 : 0.4) * pulse;
    ctx.fillStyle = mix('#ffffff', th.glow, 0.4);
    ctx.beginPath();
    ctx.arc(x, y, near ? 2.6 : 1.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** 月尘：细密尘埃随呼吸明灭，远处两条极淡的星尘光带 */
function ambientDust(ctx, th, cam, t) {
  for (let i = 0; i < 80; i++) {
    const s1 = hash1(i * 67 + 13);
    const s2 = hash1(i * 127 + 5);
    const s3 = hash1(i * 41 + 23);
    const near = i % 4 === 0;
    const spanX = VIEW_W + 180;
    const spanY = VIEW_H + 160;
    const x = wrapSpan(s2 * spanX + Math.sin(t * 0.22 + i) * (near ? 40 : 24) - cam.x * (near ? 0.34 : 0.16), spanX) - 90;
    const y = wrapSpan(s3 * spanY - t * (near ? 9 : 4) + s1 * 120 - cam.y * 0.08, spanY) - 80;
    const tw = 0.15 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.4 + s1 * 0.9) + s2 * TAU));
    const r = (near ? 1.3 : 0.7) + s3 * (near ? 1.4 : 1);
    ctx.globalAlpha = tw * (near ? 1 : 0.8);
    ctx.fillStyle = s2 > 0.85 ? th.accent : mix('#ffffff', th.accent, 0.3);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  glow(ctx, 420, 260, 420, 220, th.haze, 0.05);
  glow(ctx, 980, 400, 500, 240, th.haze, 0.04);
}

/** 血雾 + 火星：底部厚雾、中层翻滚红雾、上层上升火星 */
function ambientBloodMist(ctx, th, cam, t) {
  for (let i = 0; i < 7; i++) {
    const s1 = hash1(i * 89 + 7);
    const s2 = hash1(i * 43 + 21);
    const spanX = VIEW_W + 500;
    const x = wrapSpan(s1 * spanX + t * (4 + s2 * 7) - cam.x * 0.22, spanX) - 250;
    const y = 140 + s2 * 500 - cam.y * 0.1;
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.5 + i);
    glow(ctx, x, y, 300 + s1 * 180, 90 + s2 * 60, th.haze, 0.07 * pulse, false);
  }
  for (let L = 0; L < 2; L++) {
    const near = L === 1;
    const n = near ? 12 : 26;
    const spanX = VIEW_W + 160;
    for (let i = 0; i < n; i++) {
      const id = i + L * 139;
      const s1 = hash1(id * 71 + 17);
      const s2 = hash1(id * 31 + 3);
      const x = wrapSpan(s2 * spanX + Math.sin(t * 0.6 + i) * (near ? 22 : 13) - cam.x * (near ? 0.4 : 0.28), spanX) - 80;
      let y = VIEW_H + 40 - ((s1 * 820 + t * (near ? 20 : 11) + s2 * 200) % 820);
      y -= cam.y * 0.1;
      const flick = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.4 + i * 3.1));
      ctx.globalAlpha = flick * (near ? 0.8 : 0.5);
      ctx.fillStyle = i % 4 === 0 ? '#ffb060' : th.accent;
      const sz = near ? 2.1 : 1.3;
      ctx.fillRect(x, y, sz, sz);
      if (near) {
        ctx.globalAlpha = flick * 0.2;
        ctx.fillRect(x - 1, y + 3, 1.4, 5);
      }
    }
  }
  ctx.globalAlpha = 1;
  glow(ctx, 640, VIEW_H + 30, 760, 220, th.accent, 0.07, false);
}

/* ------------------------------------------------------------------ */
/* 近景画框：底部草簇 + 顶部枝条，把视线收进画面                        */
/* ------------------------------------------------------------------ */

const _frameCache = new Map();

/** 一丛近景草/灌木（右下角形状，镜像后用于左下角） */
function paintFrameBush(g, key, th, W, H) {
  const r = mulberry32(7717 + key.length * 373);
  const col = mix(th.near, '#000000', 0.66);
  const col2 = mix(th.near, '#000000', 0.45);
  const rimC = mix(th.accent, '#ffffff', 0.25);
  const baseX = W * 0.62;
  const baseY = H;

  // 极薄的地面接触阴影，避免在画面底部形成黑块
  const shadow = g.createLinearGradient(0, baseY - 16, 0, baseY);
  shadow.addColorStop(0, rgba(col, 0));
  shadow.addColorStop(1, rgba(col, 0.4));
  g.fillStyle = shadow;
  g.fillRect(baseX - 60, baseY - 16, W - baseX + 60, 16);

  const n = key === 'lake' ? 46 : 62;
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const x = baseX - 60 + t0 * (W - baseX + 80);
    const hh = (10 + r() * 54) * (1.15 - t0 * 0.45);
    const lean = (r() - 0.35) * 46;
    g.strokeStyle = r() > 0.6 ? col2 : col;
    g.lineWidth = 1.1 + r() * 1.7;
    g.beginPath();
    g.moveTo(x, baseY + 6);
    g.quadraticCurveTo(x + lean * 0.25, baseY - hh * 0.6, x + lean, baseY - hh);
    g.stroke();
    // 朝光侧叶尖
    if (r() > 0.72) {
      g.strokeStyle = rgba(rimC, 0.28);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + lean * 0.62, baseY - hh * 0.66);
      g.quadraticCurveTo(x + lean * 0.85, baseY - hh * 0.84, x + lean, baseY - hh);
      g.stroke();
    }
  }
  // 主题植物
  if (key === 'lake') {
    for (let i = 0; i < 7; i++) {
      const x = baseX + r() * (W - baseX) * 0.9;
      const hh = 50 + r() * 46;
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, baseY + 4);
      g.quadraticCurveTo(x + 8, baseY - hh * 0.5, x + 14, baseY - hh);
      g.stroke();
      g.fillStyle = rgba(mix(th.accent, '#000000', 0.35), 0.75);
      g.beginPath();
      g.ellipse(x + 14, baseY - hh, 3.4, 9, 0.25, 0, TAU);
      g.fill();
    }
  } else if (key === 'mansion') {
    for (let i = 0; i < 5; i++) {
      const x = baseX + r() * (W - baseX) * 0.8;
      const hh = 26 + r() * 42;
      g.fillStyle = rgba(mix(th.near, th.accent, 0.35), 0.55);
      g.beginPath();
      g.moveTo(x, baseY - hh);
      g.lineTo(x + 7, baseY - hh * 0.55);
      g.lineTo(x + 2, baseY);
      g.lineTo(x - 6, baseY);
      g.lineTo(x - 4, baseY - hh * 0.5);
      g.closePath();
      g.fill();
    }
  } else if (key === 'nether') {
    for (let i = 0; i < 6; i++) {
      const x = baseX + r() * (W - baseX) * 0.85;
      const hh = 34 + r() * 40;
      g.strokeStyle = rgba(mix(th.near, th.accent, 0.5), 0.5);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x, baseY + 2);
      g.quadraticCurveTo(x - 6, baseY - hh * 0.55, x + 4, baseY - hh);
      g.stroke();
      g.fillStyle = rgba(mix(th.accent, '#ffd0d8', 0.3), 0.6);
      g.beginPath();
      g.arc(x + 4, baseY - hh, 2.6, 0, TAU);
      g.fill();
    }
  }
}

/** 顶部垂下的枝条（右上角形状），作为画面上沿的画框 */
function paintFrameBranch(g, key, th, W, H) {
  const r = mulberry32(3391 + key.length * 587);
  const col = mix(th.near, '#000000', 0.58);
  const col2 = mix(th.near, '#000000', 0.36);
  const rimC = mix(th.accent, '#ffffff', 0.3);
  const leafC = mix(th.near, th.accent, 0.22);

  // 从右上角斜插进来的主枝
  const seg = 9;
  let x = W + 6;
  let y = 16;
  let ang = Math.PI * 0.86;
  for (let i = 0; i < seg; i++) {
    const wd = 13 - i * 1.15;
    const len = 44 - i * 2.4;
    const nx = x + Math.cos(ang) * len;
    const ny = y - Math.sin(ang) * len + 6;
    g.strokeStyle = i < 5 ? col : col2;
    g.lineWidth = Math.max(1.6, wd);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo((x + nx) * 0.5, (y + ny) * 0.5 - 8, nx, ny);
    g.stroke();
    // 朝光侧枝条轮廓
    g.strokeStyle = rgba(rimC, 0.16);
    g.lineWidth = Math.max(0.8, wd * 0.3);
    g.beginPath();
    g.moveTo(x, y - wd * 0.4);
    g.quadraticCurveTo((x + nx) * 0.5, (y + ny) * 0.5 - 8 - wd * 0.4, nx, ny - wd * 0.4);
    g.stroke();
    // 侧枝
    if (i > 1 && i % 2 === 0) {
      const a2 = ang + 0.5 + r() * 0.3;
      const l2 = 20 + r() * 20;
      g.strokeStyle = col2;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(nx, ny);
      g.quadraticCurveTo(nx + Math.cos(a2) * l2 * 0.6, ny - Math.sin(a2) * l2 * 0.6 + 6, nx + Math.cos(a2) * l2, ny - Math.sin(a2) * l2 + 12);
      g.stroke();
    }
    x = nx;
    y = ny;
    ang += 0.09;
  }

  // 叶簇/花簇
  const clusters = [
    [W - 40, 70], [W - 96, 46], [W - 150, 96], [W - 210, 62],
    [W - 120, 130], [W - 60, 112], [W - 250, 118], [W - 275, 72]
  ];
  for (let i = 0; i < clusters.length; i++) {
    const cx = clusters[i][0];
    const cy = clusters[i][1] + (r() - 0.5) * 14;
    const n = key === 'mountain' ? 15 : 8;
    if (key === 'mountain') {
      // 松针扇
      for (let k = 0; k < n; k++) {
        const a = r() * TAU;
        const l = 12 + r() * 16;
        g.strokeStyle = k % 3 === 0 ? rgba(rimC, 0.2) : rgba(col2, 0.85);
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.72);
        g.stroke();
      }
      continue;
    }
    for (let k = 0; k < n; k++) {
      const ex = cx + (r() - 0.5) * 34;
      const ey = cy + (r() - 0.5) * 20;
      const er = 6 + r() * 9;
      g.fillStyle = k % 4 === 0 ? rgba(leafC, 0.85) : rgba(col2, 0.9);
      g.beginPath();
      g.ellipse(ex, ey, er, er * (0.5 + r() * 0.4), r() * TAU, 0, TAU);
      g.fill();
      if (k % 5 === 0) {
        g.strokeStyle = rgba(rimC, 0.24);
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(ex, ey - 1, er * 0.8, er * 0.4, r() * TAU, Math.PI, TAU);
        g.stroke();
      }
    }
    // 神社/月都：花与灯
    if (key === 'shrine') {
      for (let k = 0; k < 7; k++) {
        const px = cx + (r() - 0.5) * 40;
        const py = cy + (r() - 0.5) * 26;
        g.fillStyle = rgba(mix(th.accent, '#ffd8e8', 0.3), 0.55 + r() * 0.3);
        g.beginPath();
        g.arc(px, py, 1.4 + r() * 1.4, 0, TAU);
        g.fill();
      }
    }
  }
}

function frameSprite(key, th, kind) {
  const ck = 'frame:' + key + ':' + kind;
  let sp = _frameCache.get(ck);
  if (sp !== undefined) return sp;
  if (_frameCache.size > 24) _frameCache.clear();
  const W = kind === 'bush' ? 420 : 400;
  const H = kind === 'bush' ? 150 : 190;
  sp = makeCanvas(W, H);
  if (!sp) {
    _frameCache.set(ck, null);
    return null;
  }
  const g = sp.getContext('2d');
  if (kind === 'bush') paintFrameBush(g, key, th, W, H);
  else paintFrameBranch(g, key, th, W, H);
  _frameCache.set(ck, sp);
  return sp;
}

/**
 * 画面四角的近景画框：随镜头做一点轻微视差，形成最前一档景深。
 *
 * 位置必须始终钉在屏幕边缘。以前横向直接拿 cam.x*0.65 再对 74（右下 bush）、
 * 90（左下）、120（右上 branch）取模，相机每往前走一小段相位就归零重跳，
 * 玩家跑动时右下那丛草会在一个小范围里反复横跳、看起来像「一根草跟着我跑」；
 * 纵向又减 cam.y*0.16，34 行的 5/6 面（cam.y 最大 368）会把草丛顶高 76px，
 * 直接悬在画面中部的半空里。这里换成幅度封顶的正弦摆动：相位跟着相机连续走，
 * 位移最多几像素，永远压在画面边缘，也不会跟相机一起跑远。
 */
function drawFrameDecor(ctx, key, th, cam, t) {
  const bush = frameSprite(key, th, 'bush');
  const branch = frameSprite(key, th, 'branch');
  const sway = Math.sin(t * 0.55) * 2.2;
  const cx = cam.x || 0;
  const cy = cam.y || 0;
  // 有界视差：只用来做一点点「近景也在动」的呼吸感，绝不离开角落
  const ox = Math.sin(cx * 0.0013) * 7;
  const oy = Math.sin(cy * 0.004) * 4 + Math.sin(cx * 0.0007 + 1.1) * 2;

  if (bush) {
    // 右下：只压住底部 96px，不挡战斗区
    ctx.drawImage(bush, VIEW_W - 262 + ox + sway * 0.6, VIEW_H - 96 + oy, 269, 96);
    // 左下（镜像，略小，避免两角完全对称）
    ctx.save();
    ctx.translate(-34 + ox * 0.8, VIEW_H - 82 + oy);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(bush, 0, 0, 232, 83);
    ctx.restore();
  }

  const topKeys = { shrine: 1, forest: 1, mountain: 1, nether: 1, moon: 1 };
  if (branch && topKeys[key]) {
    ctx.save();
    ctx.translate(VIEW_W + 12 + ox * 0.6, -6 + sway * 0.5 + oy * 0.5);
    ctx.drawImage(branch, -340, 0, 340, 162);
    ctx.restore();
  }
}

/**
 * 前景层：底部薄雾 + 边缘近景草叶 + 暗角。
 * drawAmbient 画在所有角色之上，所以这里只压画面最下沿与四角，不挡战斗区域。
 */
function ambientForeground(ctx, key, th, cam, t) {
  drawFrameDecor(ctx, key, th, cam, t);

  // 底部雾幕（两层不同速度）
  const sp = mistSprite(mix(th.haze, th.sky[1], 0.4), 0);
  if (sp) {
    const span = 1500;
    const y = VIEW_H - 96;
    ctx.save();
    for (let i = 0; i < 2; i++) {
      const x = wrapSpan(t * (4 + i * 3) - cam.x * (0.9 + i * 0.15) + i * span * 0.5, span) - span;
      ctx.globalAlpha = 0.26 - i * 0.08;
      ctx.drawImage(sp, x, y, span, 120);
      ctx.drawImage(sp, x + span, y, span, 120);
    }
    ctx.restore();
  }

  // 近景草叶：贴着画面底边，速度快于场景（1.2x），形成最近一档景深
  ctx.save();
  ctx.lineCap = 'round';
  const span = VIEW_W + 160;
  const dark = rgba(mix(th.near, '#000000', 0.52), 0.72);
  const dark2 = rgba(mix(th.near, '#000000', 0.3), 0.55);
  for (let i = 0; i < 22; i++) {
    const s1 = hash1(i * 977 + 31);
    const s2 = hash1(i * 313 + 7);
    const s3 = hash1(i * 57 + 3);
    const x = wrapSpan(s1 * span + t * 2 - cam.x * 1.18, span) - 80;
    const hh = 10 + s2 * 22;
    const lean = (s3 - 0.5) * 22;
    ctx.strokeStyle = i % 3 === 0 ? dark2 : dark;
    ctx.lineWidth = 1.1 + s2 * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, VIEW_H + 4);
    ctx.quadraticCurveTo(x + lean * 0.3, VIEW_H - hh * 0.6, x + lean, VIEW_H - hh);
    ctx.stroke();
    // 叶尖受光
    if (i % 4 === 0) {
      ctx.strokeStyle = rgba(mix(th.near, th.accent, 0.35), 0.3);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x + lean * 0.55, VIEW_H - hh * 0.62);
      ctx.quadraticCurveTo(x + lean * 0.8, VIEW_H - hh * 0.8, x + lean, VIEW_H - hh);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 暗角：把视线收到画面中心
  const vg = vignetteSprite();
  if (vg) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(vg, 0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
}

function drawAmbient(ctx, theme, cam, t) {
  if (!ctx) return;
  const key = themeKey(theme);
  const th = THEMES[key];
  const c = camOf(cam);
  const time = typeof t === 'number' ? t : 0;

  ctx.save();
  switch (key) {
    case 'forest':
      ambientFireflies(ctx, th, c, time);
      break;
    case 'lake':
      ambientSnow(ctx, th, c, time);
      break;
    case 'mountain':
      ambientSpray(ctx, th, c, time);
      break;
    case 'nether':
      ambientNether(ctx, th, c, time);
      break;
    case 'moon':
      ambientDust(ctx, th, c, time);
      break;
    case 'mansion':
      ambientBloodMist(ctx, th, c, time);
      break;
    default:
      ambientPetals(ctx, th, c, time);
      break;
  }
  ambientForeground(ctx, key, th, c, time);
  ctx.restore();
}
/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

export { drawSky, drawParallax, drawTiles, drawAmbient };
