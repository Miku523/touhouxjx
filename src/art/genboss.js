/**
 * AI 生成的 Boss 战斗立绘
 *
 * 图片：src/art/gen/boss/<key>.webp（抠白底透明，内容高 560、脚底贴底）
 * 加载不到时 drawGenBoss 返回 false，boss.js 只铺柔光占位（不再回退程序化人物）。
 *
 * 加载时预处理（同源图片可读像素）：
 *   1. 抹掉抠图残留的半透明白边；
 *   2. 记录角色包围盒，按「内容高度」缩放，脚底精确对齐；
 *   3. 生成纯白剪影（受击闪白）、暗贴纸光晕（从亮背景里分离）、上缘受光剪影。
 */

import { preloadWhenIdle, setPriority } from '../engine/lazy_preload.js';
import { artUrl, onArtError } from './img.js';

const BASE = new URL('./gen/boss/', import.meta.url);
const KEYS = ['rumia', 'wriggle', 'cirno', 'aya', 'yuyuko', 'kaguya', 'flandre', 'remilia', 'youmu', 'sakuya'];
/** 游戏内显示高度（旧版占位框为 240，AI 立绘略高） */
const DRAW_H = 236;
/** 逐角色视觉身高微调：身形偏窄的（妖精系）放大一点，长裙系保持原样，避免同屏看起来大小不一致 */
const BOSS_H = {
  rumia: 242,
  wriggle: 254,
  cirno: 250,
  aya: 244,
  yuyuko: 236,
  kaguya: 238,
  // EX 的芙兰要压场：动作幅度大，视觉身高再抬一点，别和 5/6 面看起来一样大
  flandre: 256,
  // 中途 Boss：翼展比芙兰宽，身高压一点，头顶才不会顶到 Boss 血条
  remilia: 236,
  // 中途 Boss 魂魄妖梦：比关底略矮，双刀举过头时也不顶血条
  youmu: 238,
  // 连环 Rush 的咲夜：比雷米再矮一点点，双场都能和血条拉开距离
  sakuya: 232,
};
/* 立绘一律走 AI 素材（src/art/gen/boss/<key>.webp）；缺图由调用方铺柔光占位，不画矢量小人。 */
/** 暗贴纸放大倍率 / 光晕模糊半径 */
const HALO_K = 1.05;
const HALO_BLUR = 3;

const IMGS = {};

function prep(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0);
  let data;
  try {
    data = c.getImageData(0, 0, w, h);
  } catch (e) {
    return null;
  }
  const px = data.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] === 0) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
      if (a < 210 && r > 200 && g > 200 && b > 200) {
        px[i + 3] = 0;
        continue;
      }
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  c.putImageData(data, 0, 0);
  if (x1 < 0) return null;
  const bbox = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };

  // 纯白剪影
  const white = document.createElement('canvas');
  white.width = w;
  white.height = h;
  const wc = white.getContext('2d');
  wc.drawImage(cv, 0, 0);
  wc.globalCompositeOperation = 'source-in';
  wc.fillStyle = '#fff';
  wc.fillRect(0, 0, w, h);

  // 暗贴纸光晕（预渲染模糊）
  const pad = 18;
  const halo = document.createElement('canvas');
  halo.width = w + pad * 2;
  halo.height = h + pad * 2;
  const hc = halo.getContext('2d');
  hc.filter = 'blur(' + HALO_BLUR + 'px)';
  hc.save();
  hc.translate(pad + w / 2, pad + h / 2);
  hc.scale(HALO_K, HALO_K);
  hc.translate(-w / 2, -h / 2);
  hc.drawImage(white, 0, 0);
  hc.restore();
  hc.filter = 'none';
  hc.globalCompositeOperation = 'source-in';
  hc.fillStyle = '#120a14';
  hc.fillRect(0, 0, halo.width, halo.height);

  // 上缘受光剪影（暖白）
  const rim = document.createElement('canvas');
  rim.width = w;
  rim.height = h;
  const rc = rim.getContext('2d');
  rc.drawImage(white, 0, 0);
  rc.globalCompositeOperation = 'source-in';
  rc.fillStyle = '#ffe0bc';
  rc.fillRect(0, 0, w, h);

  return { img: cv, white, halo, haloPad: pad, rim, w, h, bbox };
}

function loadOne(src) {
  const img = new Image();
  img.decoding = 'async';
  setPriority(img, 'low');
  const holder = { art: null };
  img.onload = () => { holder.art = prep(img); };
  // src 一直是 .webp 地址：AVIF 加载失败就回退到它（prep 读不到像素时 holder.art 保持 null）
  img.onerror = () => onArtError(img, src);
  img.src = artUrl(src);
  return holder;
}

/**
 * 强制加载某位 Boss 的战斗立绘（高优先级，幂等）。
 * Boss 战开始前调用，避免玩家先看到柔光占位再被 AI 立绘顶替。
 * @returns {Promise<boolean>} 是否拿到了可用素材
 */
const LOADING = new Map();
export function ensureBossArt(key) {
  const holder = IMGS[key];
  if (holder && holder.art) return Promise.resolve(true);
  if (LOADING.has(key)) return LOADING.get(key);
  if (typeof Image === 'undefined' || !KEYS.includes(key)) return Promise.resolve(false);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    setPriority(img, 'high');
    img.onload = () => {
      const art = prep(img);
      IMGS[key] = { art };
      LOADING.delete(key);
      resolve(!!art);
    };
    const webp = new URL(key + '.webp', BASE).href;
    img.onerror = () => {
      if (onArtError(img, webp)) return; // AVIF 不可用：先退回 .webp，不算失败
      LOADING.delete(key);
      resolve(false);
    };
    img.src = artUrl(webp);
  });
  LOADING.set(key, p);
  return p;
}

// 首屏只需要标题素材：Boss 立绘等首屏稳定后再排队（未就绪时 drawGenBoss 返回 false，只留柔光占位）
preloadWhenIdle(() => {
  if (typeof Image === 'undefined') return;
  for (const k of KEYS) IMGS[k] = IMGS[k] || loadOne(new URL(k + '.webp', BASE).href);
});

/**
 * 立绘是否已就绪（供 boss.js 决定出场前要不要等图）。
 * 未就绪时 boss.js 会暂缓淡入，避免玩家先看到占位再被立绘顶替。
 */
export function bossArtReady(key) {
  const h = IMGS[key];
  return !!(h && h.art);
}

/**
 * @param {CanvasRenderingContext2D} ctx 已 translate 到 Boss 脚底中心
 * @returns {boolean}
 */
export function drawGenBoss(ctx, o) {
  const holder = IMGS[o.boss];
  const art = holder && holder.art;
  if (!art) {
    // 未就绪：按需拉一次，本帧返回 false 由调用方画占位
    ensureBossArt(o.boss);
    return false;
  }

  const scale = o.scale || 1;
  const h = (o.height || BOSS_H[o.boss] || DRAW_H) * scale;
  const s = h / art.bbox.h;
  const w = art.w * s;

  const t = o.t || 0;
  /*
   * 「有动作」= 悬浮感 + 惯性，而不是整张图上下来回平移：
   *   bob    上下浮沉（身体主运动）
   *   sway   左右漂移（比 bob 慢半个相位，看起来像被气流推着走）
   *   tilt   身体倾斜（再慢一点，带一点滞后，像被风吹得晃）
   *   breathe 呼吸缩放
   * 三者相位/频率都不同，叠起来就不会像机械升降。
   */
  const bob = Math.sin(t * 1.6) * 4;
  const sway = Math.sin(t * 0.83 + 1.1) * 3;
  const tilt = Math.sin(t * 1.13 + 0.6) * 0.021;
  const breathe = 1 + Math.sin(t * 1.9) * 0.012;
  // 发弹瞬间：整体向朝向前压 + 轻微放大，读完即衰减（由 boss.js 的 fireT 驱动）
  const cast = Math.max(0, Math.min(1, o.cast || 0));

  let dropY = 0;
  let fade = 1;
  let defeated = 0;
  if (o.state === 'defeat') {
    dropY = 30;
    fade = 0.55;
    defeated = 1;
  }

  const alpha = (o.alpha == null ? 1 : o.alpha) * fade;

  ctx.save();
  // Boss 默认朝左面向玩家；素材朝右，需要镜像
  if ((o.facing == null ? -1 : o.facing) < 0) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 绕脚底倾斜：离地面越远摆幅越大，像被气流托着晃
  ctx.translate(sway + cast * 7, bob + dropY - cast * 4);
  ctx.rotate(tilt * (1 - defeated * 0.6) - defeated * 0.05 + cast * 0.012);
  ctx.scale(breathe + cast * 0.018, breathe + cast * 0.018);

  // 以包围盒左下为基准：dx/dy 让内容脚底中心落在原点
  const dx = -(art.bbox.x + art.bbox.w / 2) * s;
  const dy = -(art.bbox.y + art.bbox.h) * s;
  const dw = art.w * s;
  const dh = art.h * s;

  // 暗贴纸：高亮背景（幽幽子/辉夜关）里把 Boss 抠出来；透明度跟着呼吸涨落当气场
  const hp = art.haloPad;
  ctx.globalAlpha = alpha * (0.44 + Math.sin(t * 1.3) * 0.07);
  ctx.drawImage(art.halo, dx - hp * s, dy - hp * s, (art.w + hp * 2) * s, (art.h + hp * 2) * s);

  // 上缘受光（轻微闪烁，像冰晶/月光的反光）
  ctx.globalAlpha = alpha * (0.3 + Math.sin(t * 2.4 + 0.5) * 0.08);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(art.rim, dx - 2.2, dy - 2.8, dw, dh);
  ctx.globalCompositeOperation = 'source-over';

  // 本体
  ctx.globalAlpha = alpha;
  ctx.drawImage(art.img, dx, dy, dw, dh);

  // 受击闪白：剪影叠加比整体 brightness 更像「被打亮」
  const flash = o.flash || 0;
  if (flash > 0) {
    ctx.globalAlpha = alpha * Math.min(1, flash) * 0.85;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(art.white, dx, dy, dw, dh);
  }

  ctx.restore();
  return true;
}

/** 立绘是否就绪（含程序化分支：妖梦永远就绪，不需要等图）。 */
/**
 * 立绘的显示高度（以脚底原点向上，像素）。
 * 近战提示（破势条 / 眩晕星）按这个高度定位头顶，别用 Boss 的碰撞盒 h——
 * 碰撞盒只有 132，立绘却有 236~256，直接按 h 算会把 UI 画到脸上。
 */
export function bossArtHeight(key) {
  return BOSS_H[key] || DRAW_H;
}
