/**
 * 敌人：东方风格的小妖怪（视觉层重做）。
 *
 * 行为与判定跟上一版完全一致（update / 碰撞 / 数值 / 公开 API 一行没动）：
 *  - 'fairy'  地面巡逻，遇边缘或墙转身，用身体撞人   → 视觉升级为「怨灵 / 小亡灵」
 *  - 'flyer'  空中悬停，周期性朝玩家射单发弹         → 视觉升级为「妖精」
 *
 * 造型语言（两型共用的四段光照）：
 *   白热核心 → 主色中间层 → 深色描边/暗部 → 大范围柔光晕
 *   外轮廓永远朝上有一道 rim light（不依赖主题主光方向，镜像后也不穿帮），
 *   内轮廓用深色描边把亮部从深色背景里「压」出来。
 *
 * 性能：
 *   一切不随帧变化的部件（外发光晕、幽体、破碎面具、飘带尾焰两节、妖精身体、
 *   两对薄纱翅、咒弹、接触影、受击白闪剪影）都按 (类型, 颜色) 一次性预渲染到
 *   离屏 canvas（2.5x 超采样，匹配渲染器 backing 上限），运行时只做 drawImage
 *   与少量 translate/rotate —— 每帧不产生任何 fill/stroke，也不会新建渐变。
 *   实测（假 ctx 统计）：单只怨灵 12 次 drawImage + 22 次状态调用；
 *   单只妖精 5 次 drawImage + 17 次状态调用；同屏 30 只 ≈ 255 drawImage
 *   + 585 次状态调用，60fps 无压力。
 *
 * 坐标：draw(ctx, cam) 里 ctx 已应用相机平移，敌人坐标即世界坐标；
 *   _drawFairy 内部把原点挪到包围盒中心，再按 facing 水平镜像。
 */
import { T } from './level.js';
import { drawGenFairy } from '../art/genfairy.js';

/**
 * 五色宝石色系。
 * 键名与 body/wing/glow 三个字段被外部逻辑（弹幕颜色、粒子颜色）依赖，不能改名；
 * 新增 hot/rim/deep 供绘制层使用：
 *   hot  = 白热核心 / 高光     rim = 轮廓光     deep = 暗部环境色
 * blue 青金 / red 绯红 / green 翠绿 / yellow 琥珀 / purple 紫晶
 */
export const FAIRY_COLORS = {
  blue: {
    body: '#2d63c8', wing: '#a9d4ff', glow: '#59b8ff',
    hot: '#eaf7ff', rim: '#9fe4ff', deep: '#0d1c38',
  },
  red: {
    body: '#c62a48', wing: '#ffc0cd', glow: '#ff5c7a',
    hot: '#fff2f4', rim: '#ffb0c0', deep: '#3a0a14',
  },
  green: {
    body: '#1c9a62', wing: '#b6f2d2', glow: '#3fe098',
    hot: '#eafff4', rim: '#8ff0c2', deep: '#062a1e',
  },
  yellow: {
    body: '#cf8b1c', wing: '#ffe6ae', glow: '#ffc247',
    hot: '#fff8e6', rim: '#ffdb8a', deep: '#33200a',
  },
  purple: {
    body: '#7448cf', wing: '#d8c6ff', glow: '#a97cff',
    hot: '#f4edff', rim: '#c8a8ff', deep: '#211136',
  },
};

const COLOR_ORDER = ['blue', 'red', 'green', 'yellow', 'purple'];

/**
 * 按关卡主色挑妖精配色：约六成主色，其余从点缀色里轮换。
 * 主色保证整关一眼能认出主题，点缀色让队伍不至于单调。
 */
function pickFairyColor(tint, idx) {
  const t = tint || {};
  const main = t.main && FAIRY_COLORS[t.main] ? t.main : COLOR_ORDER[0];
  const mix = (t.mix || []).filter((k) => FAIRY_COLORS[k]);
  if (!mix.length) return main;
  // 每 5 只一批：3 只主色（60%）+ 2 只点缀，点缀色按批轮换 → 小样本也不会失衡
  const slot = idx % 5;
  if (slot < 3) return main;
  const group = Math.floor(idx / 5);
  return mix[(group * 2 + (slot - 3)) % mix.length];
}

function makeFairy(type, x, y, idx, tint) {
  const colorKey = pickFairyColor(tint, idx);
  return {
    type,
    colorKey,
    colors: FAIRY_COLORS[colorKey],
    x, y,
    prevX: x, prevY: y,
    w: type === 'flyer' ? 30 : 28,
    h: type === 'flyer' ? 34 : 36,
    vx: type === 'flyer' ? 0 : 52,
    vy: 0,
    facing: -1,
    hp: 2,
    maxHp: 2,
    alive: true,
    hitFlash: 0,
    baseY: y,
    phase: Math.random() * 6.28,
    shootCd: 1.2 + Math.random() * 1.6,
    animTime: Math.random() * 6.28,
    deadT: 0,
    stompGrace: 0,
  };
}

/* =====================================================================
 *  绘制层：颜色工具 / 离屏精灵缓存
 * ===================================================================== */

const TAU = Math.PI * 2;
const SS = 2.5;           // 离屏超采样倍率（渲染器 backing 最高 2.5x）

/** '#rrggbb' | 'rgb(...)' → [r,g,b]，容错到白色 */
function hexRgb(hex) {
  if (typeof hex !== 'string') return [255, 255, 255];
  let h = hex.trim();
  if (h.startsWith('rgb')) {
    const v = h.slice(h.indexOf('(') + 1, h.indexOf(')')).split(',');
    return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  }
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** 两色混合，返回 '#rrggbb'（必须是 hex，才能再喂给 rgba/hexRgb） */
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  let out = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.max(0, Math.min(255, Math.round(A[i] + (B[i] - A[i]) * t)));
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * 创建一张离屏精灵：makeSprite(逻辑宽, 逻辑高, paint)。
 * paint 里的局部原点在精灵中心，单位是逻辑像素。
 */
function makeSprite(w, h, paint) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * SS));
  cv.height = Math.max(1, Math.ceil(h * SS));
  const g = cv.getContext('2d');
  g.scale(SS, SS);
  g.translate(w / 2, h / 2);
  paint(g);
  return { img: cv, w, h };
}

/** 一次性预渲染的精灵仓库：key = 'wraith|flyer' + ':' + colorKey */
const KITS = new Map();

function getKit(kind, colorKey) {
  const key = kind + ':' + colorKey;
  let kit = KITS.get(key);
  if (kit) return kit;
  const c = FAIRY_COLORS[colorKey] || FAIRY_COLORS.blue;
  kit = kind === 'flyer' ? buildFlyer(c) : buildWraith(c);
  KITS.set(key, kit);
  return kit;
}

/* ---------------- 共用：接触影 ---------------- */

let SHADOW_SPRITE = null;

function getShadow() {
  if (SHADOW_SPRITE) return SHADOW_SPRITE;
  SHADOW_SPRITE = makeSprite(44, 20, (g) => {
    const grd = g.createRadialGradient(0, 0, 0.5, 0, 0, 19);
    grd.addColorStop(0, 'rgba(4,3,10,0.66)');
    grd.addColorStop(0.5, 'rgba(4,3,10,0.30)');
    grd.addColorStop(1, 'rgba(4,3,10,0)');
    g.fillStyle = grd;
    g.save();
    g.scale(1, 0.44);
    g.beginPath();
    g.arc(0, 0, 19, 0, TAU);
    g.fill();
    g.restore();
  });
  return SHADOW_SPRITE;
}

/* ---------------- 共用：受击白闪剪影 ---------------- */

const FLASH_SPRITES = {};

function getFlash(kind) {
  if (FLASH_SPRITES[kind]) return FLASH_SPRITES[kind];
  const spr = kind === 'flyer'
    ? makeSprite(46, 42, (g) => {
      // 妖精：头 + 帽 + 裙 + 翅 的合并剪影
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.ellipse(0, -9.5, 6.2, 6.6, 0, 0, TAU);
      g.fill();
      g.beginPath();
      g.moveTo(-6, -12);
      g.quadraticCurveTo(0, -22, 4.2, -21);
      g.quadraticCurveTo(1.6, -15, 6, -11.6);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(-5.2, -4.5);
      g.quadraticCurveTo(-8, 3, -7.2, 7.4);
      g.quadraticCurveTo(0, 9.6, 7.2, 7.2);
      g.quadraticCurveTo(8, 3, 5.2, -4.5);
      g.closePath();
      g.fill();
      g.globalAlpha = 0.55;
      for (const s of [-1, 1]) {
        g.save();
        g.scale(s, 1);
        g.beginPath();
        g.ellipse(13, -5, 13, 6.5, -0.22, 0, TAU);
        g.fill();
        g.restore();
      }
    })
    : makeSprite(40, 46, (g) => {
      // 怨灵：兜帽幽体剪影
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.moveTo(0, -20.5);
      g.bezierCurveTo(-8.5, -19.5, -12, -12, -10.5, -3);
      g.bezierCurveTo(-13, 4, -9.5, 11.5, -4, 14.5);
      g.bezierCurveTo(-1, 16.6, 2.5, 15.6, 4.6, 12);
      g.bezierCurveTo(9, 9.5, 13, 3, 10.5, -3);
      g.bezierCurveTo(12, -12, 8.5, -19.5, 0, -20.5);
      g.closePath();
      g.fill();
    });
  FLASH_SPRITES[kind] = spr;
  return spr;
}

/* ---------------- 共用：飘带尾焰的一段 ---------------- */

/**
 * 飘带的一节：上宽下窄、末端渐隐，按段旋转就能拼出摆动的 S 形尾巴。
 * 预渲染后每帧只 drawImage，避免逐帧建渐变。
 */
function buildRibbon(c, w, len, aTop, aBot) {
  return makeSprite(w + 3, len + 2, (g) => {
    const h = len, hw = w / 2;
    const grd = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grd.addColorStop(0, rgba(mixHex(c.body, c.glow, 0.35), aTop));
    grd.addColorStop(0.55, rgba(mixHex(c.body, c.deep, 0.25), aTop * 0.78));
    grd.addColorStop(1, rgba(c.deep, aBot));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-hw, -h / 2);
    g.quadraticCurveTo(-hw * 0.7, 0, -hw * 0.22, h / 2);
    g.quadraticCurveTo(hw * 0.05, h / 2 + 0.6, hw * 0.3, h / 2);
    g.quadraticCurveTo(hw * 0.75, 0, hw, -h / 2);
    g.closePath();
    g.fill();
    // 亮芯：一条细亮线，越往下越弱
    g.strokeStyle = rgba(c.hot, aTop * 0.8);
    g.lineWidth = 0.8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(hw * 0.05, -h / 2 + 0.8);
    g.quadraticCurveTo(hw * 0.32, 0, -hw * 0.05, h / 2 - 0.9);
    g.stroke();
  });
}

/* =====================================================================
 *  地面型：怨灵 / 小亡灵
 *  半透明幽体、兜帽、破碎面具 + 注连绳、空洞发光眼、飘带尾焰、脚下接触影
 * ===================================================================== */

function buildWraith(c) {
  const glowR = 23;

  // ① 外发光晕（加法混合用）
  const glow = makeSprite(glowR * 2, glowR * 2, (g) => {
    const grd = g.createRadialGradient(0, 0, 1, 0, 0, glowR);
    grd.addColorStop(0, rgba(c.glow, 0.44));
    grd.addColorStop(0.40, rgba(c.glow, 0.15));
    grd.addColorStop(1, rgba(c.glow, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, glowR, 0, TAU);
    g.fill();
  });

  // ② 幽体本体：兜帽 + 长袍，破下摆；主体压暗成宝石暗部，只留边缘光
  const shade = mixHex(c.body, c.deep, 0.46);
  const body = makeSprite(40, 46, (g) => {
    const grad = g.createLinearGradient(0, -22, 1.5, 16);
    grad.addColorStop(0, rgba(mixHex(shade, c.rim, 0.30), 0.96));
    grad.addColorStop(0.26, rgba(mixHex(shade, c.body, 0.45), 0.93));
    grad.addColorStop(0.58, rgba(shade, 0.86));
    grad.addColorStop(0.80, rgba(mixHex(shade, c.deep, 0.55), 0.62));
    grad.addColorStop(1, rgba(c.deep, 0.10));
    g.fillStyle = grad;
    g.beginPath();
    // 兜帽尖 → 左肩 → 破碎下摆（锯齿）→ 右肩 → 回兜帽
    g.moveTo(0.5, -22.6);
    g.bezierCurveTo(-5.0, -20.8, -8.5, -16.2, -8.7, -9.6);
    g.bezierCurveTo(-10.0, -4.2, -9.4, 1.6, -8.3, 6.4);
    g.lineTo(-7.1, 13.8);
    g.lineTo(-4.6, 7.2);
    g.lineTo(-1.4, 14.6);
    g.lineTo(1.0, 7.8);
    g.lineTo(3.7, 14.2);
    g.lineTo(6.1, 7.1);
    g.lineTo(7.9, 12.6);
    g.bezierCurveTo(9.4, 5.6, 10.1, -2.0, 8.8, -9.6);
    g.bezierCurveTo(9.2, -16.0, 6.4, -21.0, 0, -21.4);
    g.closePath();
    g.fill();

    // 兜帽内的暗腔：把面具和发光眼托出来
    g.fillStyle = rgba(c.deep, 0.80);
    g.beginPath();
    g.ellipse(0, -13.2, 7.2, 8.2, 0, 0, TAU);
    g.fill();
    // 暗腔口沿的冷光（一点就够，别糊）
    g.strokeStyle = rgba(c.glow, 0.34);
    g.lineWidth = 0.8;
    g.beginPath();
    g.ellipse(0, -13.2, 7.2, 8.2, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();

    // 外轮廓：顶部与两侧的冷边缘光（左右对称，镜像不穿帮）
    g.strokeStyle = rgba(c.rim, 0.62);
    g.lineWidth = 1.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-8.3, 6.4);
    g.bezierCurveTo(-9.4, 1.6, -10.0, -4.2, -8.7, -9.6);
    g.bezierCurveTo(-8.5, -16.2, -5.0, -20.8, 0.5, -22.6);
    g.bezierCurveTo(5.4, -20.8, 8.5, -16.2, 8.8, -9.6);
    g.bezierCurveTo(10.1, -2.0, 9.4, 5.6, 8.3, 6.4);
    g.stroke();
    // 外侧更暗的压边，让剪影在亮背景上也分得开
    g.strokeStyle = rgba(mixHex(c.deep, '#000000', 0.35), 0.55);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-8.3, 6.4);
    g.bezierCurveTo(-9.4, 1.6, -10.0, -4.2, -8.7, -9.6);
    g.bezierCurveTo(-8.5, -16.2, -5.0, -20.8, 0.5, -22.6);
    g.bezierCurveTo(5.4, -20.8, 8.5, -16.2, 8.8, -9.6);
    g.bezierCurveTo(10.1, -2.0, 9.4, 5.6, 8.3, 6.4);
    g.stroke();

    // 下摆内侧的暗压：让袍子有厚度，但不画亮线（亮线会读成抽绳）
    g.fillStyle = rgba(mixHex(c.deep, '#000000', 0.4), 0.5);
    g.beginPath();
    g.moveTo(-7.4, 9.2);
    g.quadraticCurveTo(0, 12.6, 7.2, 9.0);
    g.lineTo(7.0, 15.0);
    g.lineTo(-7.2, 15.0);
    g.closePath();
    g.fill();

    // 胸口残余魂火：一点暗红余烬，不是发光肚皮
    g.globalCompositeOperation = 'lighter';
    const core = g.createRadialGradient(0, 2.6, 0.3, 0, 2.6, 4.6);
    core.addColorStop(0, rgba(c.glow, 0.34));
    core.addColorStop(0.45, rgba(c.glow, 0.12));
    core.addColorStop(1, rgba(c.glow, 0));
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 2.6, 4.6, 0, TAU);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  });

  // ③ 破碎面具 + 注连绳 + 纸垂（能面：歪戴、缺一角、眼窝是空洞）
  const mask = makeSprite(24, 24, (g) => {
    g.save();
    g.translate(0.4, 0.4);
    g.rotate(-0.13);

    // 面具本体：上宽下窄的能面，右下一块碎掉
    const mg = g.createLinearGradient(-6, -7, 4, 6);
    mg.addColorStop(0, mixHex('#bcb09a', c.deep, 0.30));
    mg.addColorStop(0.5, mixHex('#948872', c.deep, 0.34));
    mg.addColorStop(1, mixHex('#4a4335', c.deep, 0.26));
    g.fillStyle = mg;
    g.beginPath();
    g.moveTo(-6.4, -4.6);
    g.quadraticCurveTo(-6.9, -7.4, -1.6, -7.6);
    g.quadraticCurveTo(4.2, -7.6, 6.2, -4.8);
    g.quadraticCurveTo(7.0, -2.0, 5.4, 0.6);
    g.lineTo(6.0, 2.0);
    g.lineTo(3.6, 1.4);
    g.lineTo(2.6, 3.0);
    g.lineTo(1.6, 0.9);
    g.quadraticCurveTo(-2.4, 3.2, -5.4, 1.6);
    g.quadraticCurveTo(-6.6, -1.0, -6.4, -4.6);
    g.closePath();
    g.fill();

    // 暗描边：把它从背后的幽光里拉出来，不然又是一张白脸
    g.strokeStyle = 'rgba(18,14,12,0.78)';
    g.lineWidth = 0.85;
    g.stroke();

    // 眼窝：两条微微上挑的杏仁空洞（不是圆眼睛，没有高光）
    g.fillStyle = '#0a0810';
    g.beginPath();
    g.moveTo(-4.6, -0.6);
    g.quadraticCurveTo(-3.2, -2.6, -1.6, -1.0);
    g.quadraticCurveTo(-1.4, 1.3, -3.4, 1.5);
    g.quadraticCurveTo(-4.6, 1.1, -4.6, -0.6);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(1.9, -2.0);
    g.quadraticCurveTo(3.1, -3.3, 4.3, -2.1);
    g.quadraticCurveTo(4.5, -0.5, 2.9, -0.2);
    g.quadraticCurveTo(1.9, -0.7, 1.9, -2.0);
    g.closePath();
    g.fill();

    // 眼窝深处的冷光：烤进精灵里，加法层只负责呼吸
    for (const [ex, ey, er] of [[-3.0, -0.6, 1.2], [3.0, -1.4, 1.2]]) {
      g.fillStyle = rgba(c.glow, 0.40);
      g.beginPath();
      g.arc(ex, ey, er, 0, TAU);
      g.fill();
      g.fillStyle = rgba(c.hot, 0.95);
      g.beginPath();
      g.arc(ex, ey, er * 0.48, 0, TAU);
      g.fill();
    }

    // 鼻梁：一条极淡的暗线，只给一点「面」的结构
    g.strokeStyle = 'rgba(24,18,14,0.5)';
    g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(-0.2, -1.2);
    g.lineTo(0.7, 2.0);
    g.stroke();

    // 裂纹：从右下碎口发散，别画成嘴
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo(3.6, 1.4);
    g.lineTo(2.3, -0.3);
    g.lineTo(3.0, -2.6);
    g.stroke();
    g.beginPath();
    g.moveTo(6.0, 2.0);
    g.lineTo(4.4, 2.4);
    g.stroke();

    // 注连绳：压在面具上缘（暗草绳，不要亮成发带）
    g.strokeStyle = '#6d5528';
    g.lineWidth = 1.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-6.6, -5.6);
    g.quadraticCurveTo(0, -7.8, 6.4, -5.2);
    g.stroke();
    g.strokeStyle = 'rgba(196,168,104,0.5)';
    g.lineWidth = 0.5;
    for (let i = 0; i < 9; i++) {
      const tt = i / 8;
      const x = -6.2 + tt * 12.6;
      const y = -6.6 + Math.sin(tt * Math.PI) * -0.6 + tt * 1.3;
      g.beginPath();
      g.moveTo(x - 0.45, y - 0.8);
      g.lineTo(x + 0.6, y + 0.8);
      g.stroke();
    }

    // 纸垂（shide）：两片折纸垂在绳头
    g.strokeStyle = 'rgba(206,200,188,0.62)';
    g.lineWidth = 0.9;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(6.0, -5.4);
    g.lineTo(7.1, -3.0);
    g.lineTo(5.9, -2.8);
    g.lineTo(6.9, -0.3);
    g.stroke();
    g.lineWidth = 0.75;
    g.beginPath();
    g.moveTo(-6.2, -5.6);
    g.lineTo(-7.3, -3.2);
    g.lineTo(-6.1, -3.0);
    g.lineTo(-7.0, -0.8);
    g.stroke();

    g.restore();
  });

  // ④ 眼睛的加法小光点（每帧叠一层，做呼吸式明灭）
  const eye = makeSprite(12, 12, (g) => {
    const grd = g.createRadialGradient(0, 0, 0.2, 0, 0, 6);
    grd.addColorStop(0, rgba(c.hot, 1));
    grd.addColorStop(0.2, rgba(c.hot, 0.7));
    grd.addColorStop(0.5, rgba(c.glow, 0.22));
    grd.addColorStop(1, rgba(c.glow, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, 6, 0, TAU);
    g.fill();
  });

  // ⑤ 飘带尾焰：三段，上段定长、下段渐隐，靠旋转做摆动
  const ribA = buildRibbon(c, 9.6, 10, 0.50, 0.06);
  const ribB = buildRibbon(c, 8.2, 13, 0.38, 0);
  const ribC = buildRibbon(c, 6.4, 11, 0.28, 0);

  return { glow, body, mask, eye, glowR, ribA, ribB, ribC };
}

/* =====================================================================
 *  空中型：妖精
 *  细长身形、两对薄纱翅（带翅脉）、短发 + 小尖帽、连衣裙、手中小咒弹
 * ===================================================================== */

function buildFlyer(c) {
  const glowR = 25;

  const glow = makeSprite(glowR * 2, glowR * 2, (g) => {
    const grd = g.createRadialGradient(0, 0, 1, 0, 0, glowR);
    grd.addColorStop(0, rgba(c.glow, 0.40));
    grd.addColorStop(0.42, rgba(c.glow, 0.13));
    grd.addColorStop(1, rgba(c.glow, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, glowR, 0, TAU);
    g.fill();
  });

  // 上翅一对：宽大、薄纱、带翅脉，翅尖更亮
  const wingU = makeSprite(54, 34, (g) => {
    for (const s of [-1, 1]) {
      g.save();
      g.scale(s, 1);

      const wg = g.createLinearGradient(2, 0, 23, -9);
      wg.addColorStop(0, rgba(c.wing, 0.24));
      wg.addColorStop(0.5, rgba(c.wing, 0.46));
      wg.addColorStop(1, rgba(mixHex(c.wing, c.glow, 0.55), 0.72));
      g.fillStyle = wg;
      g.beginPath();
      g.moveTo(1.5, -1.5);
      g.bezierCurveTo(7.0, -14.5, 19.0, -17.0, 23.5, -9.5);
      g.bezierCurveTo(26.0, -4.0, 14.0, 2.0, 1.5, 4.2);
      g.closePath();
      g.fill();

      // 翅缘：先压一道暗边（亮背景上不糊），再压一道亮边
      g.strokeStyle = rgba(mixHex(c.wing, c.deep, 0.42), 0.55);
      g.lineWidth = 1.1;
      g.stroke();
      g.strokeStyle = rgba(c.wing, 0.85);
      g.lineWidth = 0.6;
      g.stroke();

      // 翅脉
      g.strokeStyle = rgba(mixHex(c.wing, '#ffffff', 0.4), 0.42);
      g.lineWidth = 0.55;
      g.beginPath();
      g.moveTo(2.5, 0.4);
      g.quadraticCurveTo(13.0, -8.0, 22.5, -9.0);
      g.stroke();
      g.beginPath();
      g.moveTo(2.5, 1.0);
      g.quadraticCurveTo(11.0, -4.0, 19.0, -5.2);
      g.stroke();
      g.beginPath();
      g.moveTo(3.0, 1.6);
      g.quadraticCurveTo(9.0, -1.0, 13.5, -2.6);
      g.stroke();
      g.restore();
    }
  });

  // 下翅一对：更小、更暗、下垂
  const wingL = makeSprite(44, 26, (g) => {
    for (const s of [-1, 1]) {
      g.save();
      g.scale(s, 1);

      const wg = g.createLinearGradient(1.5, 0, 18, 6);
      wg.addColorStop(0, rgba(c.wing, 0.18));
      wg.addColorStop(0.55, rgba(c.wing, 0.34));
      wg.addColorStop(1, rgba(mixHex(c.wing, c.deep, 0.25), 0.52));
      g.fillStyle = wg;
      g.beginPath();
      g.moveTo(1.4, 0.5);
      g.bezierCurveTo(8.0, 7.5, 17.0, 11.5, 18.6, 5.0);
      g.bezierCurveTo(19.6, 0.8, 11.0, -4.2, 1.4, -3.4);
      g.closePath();
      g.fill();
      g.strokeStyle = rgba(mixHex(c.wing, c.deep, 0.42), 0.5);
      g.lineWidth = 0.95;
      g.stroke();
      g.strokeStyle = rgba(c.wing, 0.6);
      g.lineWidth = 0.5;
      g.stroke();
      g.strokeStyle = rgba(mixHex(c.wing, '#ffffff', 0.4), 0.3);
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(2.2, 0);
      g.quadraticCurveTo(10.0, 4.0, 18.0, 4.6);
      g.stroke();
      g.restore();
    }
  });

  // 身体：腿 / 连衣裙 / 手臂 / 短发 / 尖帽 / 脸
  const body = makeSprite(32, 44, (g) => {
    // 配色：皮肤/头发保持高明度但不纯白；裙子用宝石色 + 深一档描边
    const skin = mixHex(c.body, '#f6e2cf', 0.74);
    const hairDark = mixHex(c.body, c.deep, 0.62);
    const hairLit = mixHex(c.body, '#ffffff', 0.16);
    const clothDark = mixHex(c.body, c.deep, 0.52);
    const line = rgba(mixHex(c.body, '#07060e', 0.58), 0.92);

    g.lineCap = 'round';
    g.lineJoin = 'round';

    // ---- 后侧手臂（在裙子后面） ----
    g.strokeStyle = rgba(skin, 0.95);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-3.2, -4.4);
    g.quadraticCurveTo(-6.0, -2.0, -7.0, 1.4);
    g.stroke();

    // ---- 腿与靴 ----
    g.strokeStyle = rgba(skin, 0.95);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-2.2, 6.6);
    g.lineTo(-2.9, 12.6);
    g.stroke();
    g.beginPath();
    g.moveTo(2.0, 6.6);
    g.lineTo(2.7, 12.4);
    g.stroke();
    g.fillStyle = rgba(clothDark, 1);
    g.beginPath();
    g.ellipse(-2.9, 13.2, 1.75, 1.15, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.ellipse(2.7, 13.0, 1.75, 1.15, 0, 0, TAU);
    g.fill();

    // ---- 连衣裙 ----
    const dg = g.createLinearGradient(0, -5, 0, 8);
    dg.addColorStop(0, rgba(mixHex(c.body, '#ffffff', 0.10), 1));
    dg.addColorStop(0.5, rgba(c.body, 1));
    dg.addColorStop(1, rgba(clothDark, 1));
    g.fillStyle = dg;
    g.beginPath();
    g.moveTo(-4.5, -4.4);
    g.quadraticCurveTo(-6.6, 1.5, -7.0, 6.2);
    g.quadraticCurveTo(-4.3, 8.6, -2.2, 7.0);
    g.quadraticCurveTo(0.2, 8.8, 2.4, 7.0);
    g.quadraticCurveTo(4.9, 8.4, 7.0, 6.0);
    g.quadraticCurveTo(6.6, 1.4, 4.5, -4.4);
    g.closePath();
    g.fill();
    // 深一档描边：25px 缩到最小也能看出「裙子」这块色
    g.strokeStyle = line;
    g.lineWidth = 0.8;
    g.stroke();

    // 裙摆亮边
    g.strokeStyle = rgba(c.hot, 0.45);
    g.lineWidth = 0.75;
    g.beginPath();
    g.moveTo(-7.0, 6.2);
    g.quadraticCurveTo(-4.3, 8.6, -2.2, 7.0);
    g.quadraticCurveTo(0.2, 8.8, 2.4, 7.0);
    g.quadraticCurveTo(4.9, 8.4, 7.0, 6.0);
    g.stroke();

    // 裙褶
    g.strokeStyle = 'rgba(255,255,255,0.14)';
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-1.4, -3.6);
    g.quadraticCurveTo(-2.4, 2.0, -1.8, 6.6);
    g.stroke();
    g.beginPath();
    g.moveTo(1.9, -3.6);
    g.quadraticCurveTo(2.9, 2.0, 2.4, 6.6);
    g.stroke();

    // ---- 上衣 / 肩 ----
    g.fillStyle = rgba(mixHex(c.body, '#ffffff', 0.12), 1);
    g.beginPath();
    g.moveTo(-4.3, -5.6);
    g.quadraticCurveTo(0, -3.4, 4.3, -5.6);
    g.lineTo(4.6, -3.5);
    g.quadraticCurveTo(0, -1.4, -4.6, -3.5);
    g.closePath();
    g.fill();
    g.strokeStyle = line;
    g.lineWidth = 0.7;
    g.stroke();
    // 领口亮线
    g.strokeStyle = rgba(c.hot, 0.5);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-4.1, -5.3);
    g.quadraticCurveTo(0, -3.2, 4.1, -5.3);
    g.stroke();

    // ---- 前侧手臂：举着小咒弹 ----
    g.strokeStyle = rgba(skin, 1);
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(3.1, -4.4);
    g.quadraticCurveTo(6.0, -2.0, 7.0, 1.2);
    g.stroke();
    g.fillStyle = rgba(skin, 1);
    g.beginPath();
    g.arc(7.0, 1.5, 1.25, 0, TAU);
    g.fill();

    // ---- 脖子 ----
    g.fillStyle = rgba(skin, 1);
    g.fillRect(-1.0, -6.6, 2.0, 2.2);

    // ---- 后发 ----
    g.fillStyle = rgba(hairDark, 1);
    g.beginPath();
    g.ellipse(0, -10.6, 6.1, 6.6, 0, 0, TAU);
    g.fill();
    // 鬓发两缕垂到肩
    g.strokeStyle = rgba(hairDark, 1);
    g.lineWidth = 1.7;
    g.beginPath();
    g.moveTo(-5.2, -10.0);
    g.quadraticCurveTo(-6.6, -6.0, -5.6, -3.4);
    g.stroke();
    g.beginPath();
    g.moveTo(5.2, -10.0);
    g.quadraticCurveTo(6.6, -6.0, 5.6, -3.4);
    g.stroke();

    // ---- 脸 ----
    const fg = g.createLinearGradient(0, -14.5, 0, -6.0);
    fg.addColorStop(0, rgba(mixHex(skin, '#ffffff', 0.12), 1));
    fg.addColorStop(1, rgba(mixHex(skin, c.body, 0.42), 1));
    g.fillStyle = fg;
    g.beginPath();
    g.ellipse(0, -10.4, 5.0, 5.2, 0, 0, TAU);
    g.fill();
    g.strokeStyle = rgba(mixHex(c.body, c.deep, 0.5), 0.5);
    g.lineWidth = 0.55;
    g.stroke();

    // ---- 刘海 ----
    g.fillStyle = rgba(hairDark, 1);
    g.beginPath();
    g.moveTo(-5.3, -11.4);
    g.quadraticCurveTo(-4.4, -16.4, 0.4, -16.2);
    g.quadraticCurveTo(5.0, -16.0, 5.3, -11.0);
    g.quadraticCurveTo(3.4, -13.4, 1.6, -12.6);
    g.quadraticCurveTo(0.2, -14.2, -1.6, -12.4);
    g.quadraticCurveTo(-3.4, -13.8, -5.3, -11.4);
    g.closePath();
    g.fill();
    // 发丝高光
    g.strokeStyle = rgba(hairLit, 0.55);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-3.6, -14.6);
    g.quadraticCurveTo(-1.6, -15.6, 1.4, -15.2);
    g.stroke();

    // ---- 帽檐下的阴影（压低上半张脸，避免"两个黑点"） ----
    g.fillStyle = rgba(c.deep, 0.46);
    g.beginPath();
    g.ellipse(0.2, -12.4, 5.1, 2.3, -0.04, 0, TAU);
    g.fill();

    // ---- 眼：细长、内有热光 ----
    for (const s of [-1, 1]) {
      g.fillStyle = rgba(c.deep, 0.92);
      g.beginPath();
      g.ellipse(s * 2.0, -10.0, 1.35, 1.75, s * 0.12, 0, TAU);
      g.fill();
      g.fillStyle = rgba(mixHex(c.glow, c.hot, 0.45), 0.98);
      g.beginPath();
      g.ellipse(s * 2.0, -9.95, 1.0, 1.3, s * 0.12, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.beginPath();
      g.arc(s * 2.0 - 0.3, -10.5, 0.4, 0, TAU);
      g.fill();
    }
    // 嘴
    g.strokeStyle = rgba(mixHex(c.deep, c.body, 0.25), 0.8);
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(-0.7, -7.7);
    g.quadraticCurveTo(0, -7.2, 0.7, -7.7);
    g.stroke();

    // ---- 小尖帽 ----
    g.fillStyle = rgba(mixHex(c.body, c.deep, 0.28), 1);
    g.beginPath();
    g.moveTo(-5.4, -13.4);
    g.quadraticCurveTo(-1.6, -20.8, 3.4, -20.4);
    g.quadraticCurveTo(1.4, -15.6, 5.4, -13.2);
    g.closePath();
    g.fill();
    g.strokeStyle = line;
    g.lineWidth = 0.7;
    g.stroke();
    // 帽尖高光
    g.strokeStyle = rgba(c.rim, 0.6);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(-4.6, -14.0);
    g.quadraticCurveTo(-1.4, -20.2, 3.0, -20.0);
    g.stroke();
    // 帽檐
    g.fillStyle = rgba(mixHex(c.body, c.deep, 0.62), 1);
    g.beginPath();
    g.ellipse(0.2, -13.2, 6.2, 1.95, -0.05, 0, TAU);
    g.fill();
    g.strokeStyle = rgba(c.rim, 0.4);
    g.lineWidth = 0.6;
    g.beginPath();
    g.ellipse(0.2, -13.4, 6.0, 1.6, -0.05, Math.PI * 1.06, Math.PI * 1.94);
    g.stroke();
    // 帽带 + 小蝴蝶结
    g.strokeStyle = rgba(c.hot, 0.7);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-4.6, -13.6);
    g.quadraticCurveTo(0.2, -12.5, 4.8, -13.4);
    g.stroke();
    g.fillStyle = rgba(mixHex(c.glow, c.hot, 0.3), 0.95);
    g.beginPath();
    g.ellipse(4.6, -13.0, 1.3, 0.85, -0.5, 0, TAU);
    g.fill();

    // ---- 呆毛 ----
    g.strokeStyle = rgba(hairDark, 0.95);
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(2.4, -18.6);
    g.quadraticCurveTo(4.6, -21.4, 3.2, -22.0);
    g.stroke();
  });

  // 手中咒弹（加法叠加，会脉动）
  const orb = makeSprite(20, 20, (g) => {
    const grd = g.createRadialGradient(0, 0, 0.3, 0, 0, 9);
    grd.addColorStop(0, rgba('#ffffff', 0.95));
    grd.addColorStop(0.22, rgba(c.hot, 0.9));
    grd.addColorStop(0.5, rgba(c.glow, 0.45));
    grd.addColorStop(1, rgba(c.glow, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, 9, 0, TAU);
    g.fill();
  });

  // 死亡/飘散用的柔光点
  const eye = makeSprite(18, 18, (g) => {
    const grd = g.createRadialGradient(0, 0, 0.2, 0, 0, 8.6);
    grd.addColorStop(0, rgba(c.hot, 0.95));
    grd.addColorStop(0.32, rgba(c.glow, 0.5));
    grd.addColorStop(1, rgba(c.glow, 0));
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, 8.6, 0, TAU);
    g.fill();
  });

  return { glow, wingU, wingL, body, orb, eye, glowR };
}

/* =====================================================================
 *  EnemyManager
 * ===================================================================== */

export class EnemyManager {
  /**
   * @param {import('./level.js').Level} level
   * @param {object} [opts]
   * @param {'easy'|'normal'|'hard'} [opts.difficulty='normal']
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.difficulty = opts.difficulty || 'normal';
    this.list = [];
    this.t = 0;

    let i = 0;
    const tint = level.def && level.def.fairyTint;
    for (const e of level.entities) {
      if (e.type === 'fairy' || e.type === 'flyer') {
        // 实体的 (x,y) 是瓦片左上角，敌人居中偏下
        const x = e.x + (T - (e.type === 'flyer' ? 30 : 28)) / 2;
        const y = e.y + (T - (e.type === 'flyer' ? 34 : 36));
        this.list.push(makeFairy(e.type, x, y, i++, tint));
      }
    }
    this.bulletCooldownMul = this.difficulty === 'easy' ? 1.5 : this.difficulty === 'hard' ? 0.7 : 1;

    // 难度细节：优先用难度表给的精确倍率（能区分 H / L），否则退回三档 enemyDifficulty
    const d = opts.diff || null;
    this.fireScale = Number(d?.enemyFireScale) || this.bulletCooldownMul;
    this.bulletCooldownMul = this.fireScale;
    this.bulletSpeed = Math.min(Number(d?.bulletSpeedCap) || 520, 150 * (Number(d?.enemyBulletScale) || 1));
    this.bulletShots = Math.max(1, Number(d?.flyerShots) || 1);
  }

  update(dt, player, bullets, fx, opts = {}) {
    this.t += dt;
    const level = this.level;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;

    for (const e of this.list) {
      if (!e.alive) {
        e.deadT += dt;
        continue;
      }
      e.prevX = e.x;
      e.prevY = e.y;
      e.animTime += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.stompGrace = Math.max(0, e.stompGrace - dt);
      e.phase += dt;

      if (e.type === 'fairy') {
        // 地面巡逻
        e.x += e.vx * dt;
        // 撞墙 / 悬崖 就转身
        const aheadX = e.vx > 0 ? e.x + e.w + 4 : e.x - 4;
        const footY = e.y + e.h + 4;
        const cx = Math.floor(aheadX / T);
        const cyFoot = Math.floor(footY / T);
        const wallHit = level.isSolidTile(cx, Math.floor((e.y + e.h / 2) / T));
        const noFloor = !level.isSolidTile(cx, cyFoot) && !level.isPlatformTile(cx, cyFoot);
        if (wallHit || noFloor) {
          e.vx *= -1;
          e.facing = e.vx > 0 ? 1 : -1;
          e.x += e.vx * dt * 2;
        }
        // 重力贴地（简单版）
        let gy = e.y;
        let steps = 0;
        while (level.rectHitsSolid(e.x, gy, e.w, e.h) && steps < 40) { gy -= 2; steps++; }
        steps = 0;
        while (!level.rectHitsSolid(e.x, gy + 2, e.w, e.h) && steps < 60) { gy += 2; steps++; }
        e.y = gy;
      } else {
        // 飞行：正弦上下漂浮 + 缓慢靠近玩家
        e.y = e.baseY + Math.sin(e.phase * 1.6) * 12;
        const dx = px - (e.x + e.w / 2);
        e.x += Math.sign(dx) * Math.min(26, Math.abs(dx) * 0.6) * dt;
        e.facing = dx > 0 ? 1 : -1;

        // 射击
        e.shootCd -= dt * (1 / this.bulletCooldownMul);
        if (e.shootCd <= 0 && !opts.freeze && bullets) {
          e.shootCd = 2.4 + Math.random() * 1.8;
          const ox = e.x + e.w / 2;
          const oy = e.y + e.h * 0.6;
          if (this.bulletShots > 1) {
            // 高难度：一束小瞄准扇（弹速同样受难度倍率与上限约束）
            const a = Math.atan2(py - oy, px - ox);
            bullets.fan(ox, oy, this.bulletShots, 0.22, a, this.bulletSpeed, {
              r: 5,
              color: e.colors.glow,
              type: 0,
              life: 5,
            });
          } else {
            bullets.aimed(ox, oy, px, py, this.bulletSpeed, {
              r: 6,
              color: e.colors.glow,
              type: 0,
              life: 5,
            });
          }
        }
      }

      // 与玩家碰撞：踩 vs 撞
      if (e.stompGrace <= 0 && this._overlap(e, player)) {
        const playerBottom = player.y + player.h;
        const isStomp = player.vy > 60 && playerBottom < e.y + e.h * 0.62;
        if (isStomp) {
          e.hp -= 2;
          player.vy = -560;
          player.jumpsLeft = 1;
          e.stompGrace = 0.2;
          fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.glow, 8, 200);
          if (e.hp <= 0) this._kill(e, fx, opts);
        } else if (player.dashing) {
          e.hp -= 3;
          fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.glow, 10, 240);
          if (e.hp <= 0) this._kill(e, fx, opts);
        } else {
          player.hurt(1, e.x + e.w / 2);
        }
      }
    }

    // 清理很久的尸体
    this.list = this.list.filter((e) => e.alive || e.deadT < 1.2);
  }

  _overlap(e, p) {
    return e.x < p.x + p.w && e.x + e.w > p.x && e.y < p.y + p.h && e.y + e.h > p.y;
  }

  _kill(e, fx, opts) {
    if (!e.alive) return;
    e.alive = false;
    e.deadT = 0;
    fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.glow, 14, 300);
    fx?.shockwave(e.x + e.w / 2, e.y + e.h / 2, e.colors.wing, 8, 320, 0.34);
    opts.onKill?.(e);
  }

  /** 玩家子弹命中检测 */
  damageWithShots(shots, fx, opts = {}) {
    if (!shots) return;
    for (const e of this.list) {
      if (!e.alive) continue;
      const hit = shots.hitRect(e.x, e.y, e.w, e.h, (dmg, hx, hy) => {
        e.hp -= dmg;
        e.hitFlash = 0.12;
        fx?.sparkle(hx, hy, e.colors.wing);
      });
      if (hit) {
        if (e.hp <= 0) this._kill(e, fx, opts);
        else fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.wing, 4, 140);
      }
    }
  }

  /** 半径内伤害（符卡） */
  damageArea(x, y, r, dmg, fx, opts = {}) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      if (Math.hypot(cx - x, cy - y) <= r && Math.hypot(cx - x, cy - y) <= r) {
        e.hp -= dmg;
        if (e.hp <= 0) this._kill(e, fx, opts);
      }
    }
  }

  aliveCount() {
    return this.list.filter((e) => e.alive).length;
  }

  /** 绘制（世界坐标系，已应用相机） */
  draw(ctx, cam) {
    for (const e of this.list) {
      const alpha = e.alive ? 1 : Math.max(0, 1 - e.deadT / 0.5);
      if (alpha <= 0) continue;
      // 视野剔除
      if (cam) {
        const sx = e.x - cam.x;
        const sy = e.y - cam.y;
        if (sx < -120 || sx > 1400 || sy < -120 || sy > 840) continue;
      }
      this._drawFairy(ctx, e, alpha);
    }
  }

  _drawFairy(ctx, e, alpha) {
    if (typeof document === 'undefined') return;
    const kind = e.type === 'flyer' ? 'flyer' : 'wraith';
    const dead0 = e.alive ? 0 : Math.min(1, e.deadT / 0.5);

    // 优先使用 AI 生成的妖精素材（两类共用同一张图，配色靠光环区分）
    const aiOpts = {
      colorKey: e.colorKey,
      t: e.animTime,
      alpha,
      facing: e.facing,
      dead: dead0,
      flash: e.hitFlash > 0 ? Math.min(1, e.hitFlash / 0.12) * 0.62 : 0,
    };
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    const drewAi = drawGenFairy(ctx, aiOpts);
    ctx.restore();
    if (drewAi) return;

    const kit = getKit(kind, e.colorKey);
    if (!kit) return;

    const t = e.animTime;
    const dead = e.alive ? 0 : Math.min(1, e.deadT / 0.5);
    const bob = Math.sin(t * 3) * (kind === 'flyer' ? 2.0 : 1.3);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2 + bob - dead * 22);
    if (dead > 0) {
      const grow = 1 + dead * 0.3;
      ctx.scale(grow, grow);
    }
    // 朝向镜像：造型左右对称（帽子微歪、面具碎口很小），镜像不会穿帮
    ctx.scale(e.facing < 0 ? -1 : 1, 1);

    if (kind === 'flyer') this._drawFlyer(ctx, e, kit, t, alpha, dead);
    else this._drawWraith(ctx, e, kit, t, alpha, dead);

    // 受击白闪：叠一层白色剪影，0.12s 内快速衰减
    if (e.hitFlash > 0) {
      const f = getFlash(kind);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * Math.min(1, e.hitFlash / 0.12) * 0.62;
      ctx.drawImage(f.img, -f.w / 2, -f.h / 2, f.w, f.h);
    }

    ctx.restore();
  }

  /* ---------------- 地面型：怨灵 ---------------- */

  _drawWraith(ctx, e, kit, t, alpha, dead) {
    // ① 脚下接触影：幽体悬在草地之上，影子留在下面，才有「浮」的感觉
    const sh = getShadow();
    ctx.globalAlpha = alpha * 0.46 * (1 - dead);
    ctx.drawImage(sh.img, -sh.w / 2, 17.6 - sh.h / 2, sh.w, sh.h);

    // ② 外发光晕（压薄，只当环境光，不盖本体）
    const hr = kit.glowR * (0.95 + 0.05 * Math.sin(t * 2.4));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.30;
    ctx.drawImage(kit.glow.img, -hr, -hr - 3, hr * 2, hr * 2);
    ctx.globalCompositeOperation = 'source-over';

    // ③ 飘带尾焰：三条长短不一，随 animTime 摆动，末端渐隐在雾里
    const ph = e.phase;
    const RIG = [
      { bx: -1.9, lean: -0.10, k: 1.0, ph: 0.0 },
      { bx: 1.8, lean: 0.08, k: 0.88, ph: 2.1 },
      { bx: 0.0, lean: 0.0, k: 0.70, ph: 4.0 },
    ];
    for (let i = 0; i < 3; i++) {
      const rg = RIG[i];
      const sw = Math.sin(t * 2.1 + ph * 0.9 + rg.ph);
      const a1 = rg.lean + sw * 0.17;
      const l1 = kit.ribA.h * rg.k;
      ctx.save();
      ctx.translate(rg.bx, 10.4);
      ctx.rotate(a1);
      ctx.globalAlpha = alpha * (0.72 + 0.12 * Math.sin(t * 3 + rg.ph));
      ctx.drawImage(kit.ribA.img, -kit.ribA.w / 2, 0, kit.ribA.w, l1);
      // 第二段接在末端，再偏一点 → 尾巴是弯的
      ctx.translate(0, l1 - 1.2);
      ctx.rotate(sw * 0.20 - rg.lean * 0.55);
      const l2 = kit.ribB.h * rg.k;
      ctx.globalAlpha = alpha * (0.52 + 0.1 * Math.sin(t * 2.6 + rg.ph));
      ctx.drawImage(kit.ribB.img, (-kit.ribB.w / 2) * rg.k, 0, kit.ribB.w * rg.k, l2);
      ctx.restore();
    }

    // ④ 幽体本体
    ctx.globalAlpha = alpha;
    ctx.drawImage(kit.body.img, -kit.body.w / 2, -kit.body.h / 2 + 1.0, kit.body.w, kit.body.h);

    // ⑤ 破碎面具 + 注连绳
    const ms = 0.82;
    ctx.drawImage(kit.mask.img, (-kit.mask.w / 2) * ms - 0.4, -kit.mask.h / 2 * ms - 11.0, kit.mask.w * ms, kit.mask.h * ms);

    // ⑥ 空洞眼窝里的冷光呼吸（加法，尺寸压小，别变成两只大眼）
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1 + e.phase * 0.4);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * (0.20 + 0.12 * pulse) * (1 + dead * 0.5);
    let s = 8.0;
    ctx.drawImage(kit.eye.img, -3.4 - s / 2, -12.0 - s / 2, s, s);
    s = 6.2;
    ctx.drawImage(kit.eye.img, 2.0 - s / 2, -12.9 - s / 2, s, s);
    ctx.globalCompositeOperation = 'source-over';

    // ⑦ 死亡飘散：几点魂火向上散开
    if (dead > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = e.phase + i * 1.7;
        const rr = 3 + dead * 15;
        const dx = Math.cos(a) * rr * 0.85;
        const dy = -6 - dead * 26 - i * 2.4 + Math.sin(a) * 3;
        const ds = (7.2 - i * 1.0) * (1 - dead * 0.35);
        ctx.globalAlpha = alpha * (1 - dead) * 0.6;
        ctx.drawImage(kit.eye.img, dx - ds, dy - ds, ds * 2, ds * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------------- 空中型：妖精 ---------------- */

  _drawFlyer(ctx, e, kit, t, alpha, dead) {
    // ① 外发光晕：只当背后的轮廓光，压薄、收小，不允许盖过本体
    const hr = 22 * (0.94 + 0.06 * Math.sin(t * 2.2));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * 0.30;
    ctx.drawImage(kit.glow.img, -hr, -hr - 1, hr * 2, hr * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;

    // ② 两对薄纱翅：快速扇动（整对一起抬落 + 纵向压缩）
    const flap = Math.sin(t * 12.5);
    const flap2 = Math.sin(t * 12.5 + 1.9);

    ctx.save();
    ctx.translate(0, -1.4);
    ctx.rotate(flap * 0.10 - 0.04);
    ctx.scale(1, 0.90 + 0.11 * flap);
    ctx.drawImage(kit.wingU.img, -kit.wingU.w / 2, -kit.wingU.h / 2, kit.wingU.w, kit.wingU.h);
    ctx.restore();

    ctx.save();
    ctx.translate(0, 1.6);
    ctx.rotate(-flap2 * 0.12 + 0.05);
    ctx.scale(1, 0.88 + 0.12 * flap2);
    ctx.drawImage(kit.wingL.img, -kit.wingL.w / 2, -kit.wingL.h / 2, kit.wingL.w, kit.wingL.h);
    ctx.restore();

    // ③ 身体（裙摆随浮动轻微倾斜）
    ctx.save();
    ctx.rotate(Math.sin(t * 2.6) * 0.03);
    ctx.drawImage(kit.body.img, -kit.body.w / 2, -kit.body.h / 2 + 2.0, kit.body.w, kit.body.h);
    ctx.restore();

    // ④ 手中小咒弹（脉动加法光）
    const pulse = 0.72 + 0.28 * Math.sin(t * 4.6);
    const os = 15 + pulse * 3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * pulse;
    ctx.drawImage(kit.orb.img, 7.0 - os / 2, 3.5 - os / 2, os, os);
    ctx.globalCompositeOperation = 'source-over';

    // ⑤ 死亡飘散
    if (dead > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const a = e.phase + i * 1.31;
        const rr = 4 + dead * 17;
        const dx = Math.cos(a) * rr;
        const dy = -4 - dead * 28 - i * 2.0 + Math.sin(a) * 3.2;
        const ds = (7.4 - i * 0.9) * (1 - dead * 0.35);
        ctx.globalAlpha = alpha * (1 - dead) * 0.6;
        ctx.drawImage(kit.eye.img, dx - ds, dy - ds, ds * 2, ds * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
