/**
 * AI 生成的妖精精灵
 *
 * 素材：src/art/gen/fairy.webp（透明底，145×160）
 * 加载不到时 drawGenFairy 返回 false，enemies.js 只铺该色柔光，不回退程序化人物。
 */
import { preloadWhenIdle } from '../engine/lazy_preload.js';

const BASE = new URL('./gen/fairy.webp', import.meta.url);
/** 游戏内显示高度（flyer 包围盒 h=34，画大一点点更饱满） */
const DRAW_H = 42;

/** 五色妖精对应的光晕色（与 FAIRY_COLORS 的 glow 对齐语义） */
const AURA = {
  blue: 'rgba(110,190,255,0.55)',
  red: 'rgba(255,110,130,0.55)',
  green: 'rgba(130,235,150,0.55)',
  yellow: 'rgba(255,225,110,0.55)',
  purple: 'rgba(200,140,255,0.55)',
};

const COLOR_KEYS = ['blue', 'red', 'green', 'yellow', 'purple'];
/** 图片对象懒创建：首屏（标题画面）不抢带宽，见文件末尾的 preloadWhenIdle */
const IMGS = {};
let FALLBACK = null;

function ensureColor(k) {
  let im = IMGS[k];
  if (!im) {
    if (typeof Image === 'undefined') return null;
    im = new Image();
    im.decoding = 'async';
    im.src = new URL(`./gen/fairy/${k}.webp`, import.meta.url).href;
    IMGS[k] = im;
  }
  return im;
}

function ensureFallback() {
  if (FALLBACK) return FALLBACK;
  if (typeof Image === 'undefined') return null;
  FALLBACK = new Image();
  FALLBACK.decoding = 'async';
  FALLBACK.src = BASE.href;
  return FALLBACK;
}

/** 按颜色取贴图，取不到时退回通用妖精图 */
function imageFor(colorKey) {
  const im = ensureColor(colorKey);
  if (im && im.naturalWidth) return im;
  const fb = ensureFallback();
  if (fb && fb.naturalWidth) return fb;
  return null;
}

// 首屏稳定后的空闲时段把六张妖精图下好（弱网受限链路会跳过，进关第一次绘制时按需加载）
preloadWhenIdle(() => {
  for (const k of COLOR_KEYS) ensureColor(k);
  ensureFallback();
});

/**
 * @param {CanvasRenderingContext2D} ctx 原点在妖精包围盒中心
 * @returns {boolean}
 */
export function drawGenFairy(ctx, o) {
  const img = imageFor(o.colorKey);
  if (!img) return false;

  const t = o.t || 0;
  const alpha = o.alpha == null ? 1 : o.alpha;
  const dead = o.dead || 0;

  const h = (o.size || DRAW_H) * (1 + dead * 0.25);
  const s = h / img.naturalHeight;
  const w = img.naturalWidth * s;

  ctx.save();
  ctx.globalAlpha = alpha * (1 - dead * 0.75);
  if ((o.facing || 1) < 0) ctx.scale(-1, 1);

  // 死亡时上飘 + 放大淡出
  const rise = -dead * 26;
  ctx.translate(0, rise);

  // 彩色光环（区分五色妖精，同时给暗背景一个发光轮廓）
  const aura = AURA[o.colorKey] || AURA.blue;
  ctx.globalCompositeOperation = 'lighter';
  const r = h * 0.62 * (0.94 + 0.06 * Math.sin(t * 3.4));
  const g = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
  g.addColorStop(0, aura);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha * 0.55 * (1 - dead * 0.6);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // 本体：轻微上下浮动 + 翅膀带动的一点点横向挤压
  const bob = Math.sin(t * 3.2) * 1.6;
  const wing = 1 + Math.sin(t * 11) * 0.03;
  ctx.globalAlpha = alpha * (1 - dead * 0.55);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (-w / 2) * wing, -h / 2 + bob, w * wing, h);

  // 受击白闪
  if (o.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * Math.min(1, o.flash) * 0.55;
    ctx.drawImage(img, (-w / 2) * wing, -h / 2 + bob, w * wing, h);
  }

  ctx.restore();
  return true;
}

export function genFairyReady() {
  return ready();
}
