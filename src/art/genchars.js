/**
 * AI 生成的游戏内角色帧
 *
 * 资源：src/art/gen/run/<char>_run_<i>.webp（4 帧循环）
 *       src/art/gen/run/<char>_idle.webp
 *       src/art/gen/run/<char>_jump.webp
 *       src/art/gen/run/<char>_fall.webp
 * 缺哪个动作就回退到 run 帧；整张图未就绪时返回 false，由调用方留柔光占位（不画程序化人物）。
 *
 * 加载时会做一次预处理（同源图片可读像素）：
 *   1. 去掉抠图残留的半透明白边（近白且 alpha 低的像素直接透明）；
 *   2. 记录角色实际包围盒，绘制时按「包围盒高度」统一缩放 + 脚底中心对齐，
 *      不同尺寸的帧（240×252 / 260×268）也能严丝合缝地对齐地面；
 *   3. 生成一张纯白剪影，用于受击闪白。
 */

import { preloadWhenIdle, setPriority } from '../engine/lazy_preload.js';

const BASE = new URL('./gen/run/', import.meta.url);
const FRAME_N = 4;
/** 画到游戏里的角色身高（碰撞盒 56，视觉 104 更有立绘感） */
export const DRAW_H = 104;
/** 轮廓分离：暗贴纸 + 上缘受光，保证角色在暗角/亮背景里都不糊进去 */
const HALO_K = 1.065;
const RIM_DX = -1.1;
const RIM_DY = -1.5;

/** 各动作相对身高的归一化系数：起跳屈腿会矮一点，落下略伸展 */
export const POSE_RATIO = { idle: 1, run: 1, jump: 0.93, fall: 0.97, dash: 1, fly: 0.86 };

const SHEETS = {};
const SUPPORTED = ['reimu', 'marisa'];

/** 落地压缩 / 起跳拉长的一次性形变状态（每个角色各一份） */
const JUICE = {};
const SQUASH_T = 0.13;
const SQUASH_K = 0.20;

function updateJuice(char, st, t) {
  let j = JUICE[char];
  if (!j) {
    j = JUICE[char] = { st, timer: 0, lastT: t, sy: 1 };
    return j;
  }
  const dt = Math.max(0.001, Math.min(0.1, t - j.lastT));
  j.lastT = t;
  const airborne = (s) => s === 'jump' || s === 'fall' || s === 'hurt';
  if (j.st !== st) {
    if (!airborne(j.st) && (st === 'jump' || st === 'dash')) {
      j.timer = 0.10;         // 起跳/起步：拉长
      j.kind = 'stretch';
    } else if (airborne(j.st) && !airborne(st)) {
      j.timer = SQUASH_T;     // 落地：压扁
      j.kind = 'squash';
    }
    j.st = st;
  }
  if (j.timer > 0) j.timer = Math.max(0, j.timer - dt);
  return j;
}

function prep(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0);
  let data;
  try {
    data = c.getImageData(0, 0, w, h);
  } catch (e) {
    // 读不到像素（理论上不会发生）时退化为原图
    return { img, w, h, bbox: { x: 0, y: 0, w, h }, white: null };
  }
  const px = data.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] === 0) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
      // 抠图白边：半透明且接近白色 -> 直接抹掉
      if (a < 210 && r > 205 && g > 205 && b > 205) {
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

  // 白色剪影（受击闪白用），与帧同尺寸
  const white = document.createElement('canvas');
  white.width = w;
  white.height = h;
  const wc = white.getContext('2d');
  wc.drawImage(cv, 0, 0);
  wc.globalCompositeOperation = 'source-in';
  wc.fillStyle = '#fff';
  wc.fillRect(0, 0, w, h);

  // 暗贴纸光晕（预渲染模糊，避免每帧 filter）
  const pad = 12;
  const halo = document.createElement('canvas');
  halo.width = w + pad * 2;
  halo.height = h + pad * 2;
  const hc = halo.getContext('2d');
  hc.filter = 'blur(2.2px)';
  hc.save();
  hc.translate(pad + w / 2, pad + h / 2);
  hc.scale(HALO_K, HALO_K);
  hc.translate(-w / 2, -h / 2);
  hc.drawImage(white, 0, 0);
  hc.restore();
  hc.filter = 'none';
  hc.globalCompositeOperation = 'source-in';
  hc.fillStyle = '#100812';
  hc.fillRect(0, 0, halo.width, halo.height);

  // 上缘受光剪影
  const rim = document.createElement('canvas');
  rim.width = w;
  rim.height = h;
  const rc = rim.getContext('2d');
  rc.drawImage(white, 0, 0);
  rc.globalCompositeOperation = 'source-in';
  rc.fillStyle = '#ffdcb4';
  rc.fillRect(0, 0, w, h);

  return { img: cv, white, halo, haloPad: pad, rim, w, h, bbox };
}

function loadOne(src, priority = 'low') {
  const img = new Image();
  img.decoding = 'async';
  setPriority(img, priority);
  const holder = { frame: null, failed: false, img };
  holder.promise = new Promise((resolve) => {
    img.onload = () => {
      const f = prep(img);
      if (f) { holder.frame = f; resolve(true); }
      else { holder.failed = true; resolve(false); }
    };
    img.onerror = () => { holder.failed = true; resolve(false); };
  });
  img.src = src;
  return holder;
}

function sheetHolders(sheet) {
  return [sheet.idle, sheet.jump, sheet.fall, sheet.fly, ...sheet.run];
}

/** 建立 / 取回某角色的动作帧表；priority='high' 时把已排队的图提到高优先级 */
function ensureSheet(ch, priority = 'low') {
  let sheet = SHEETS[ch];
  if (sheet) {
    if (priority === 'high') for (const h of sheetHolders(sheet)) setPriority(h.img, 'high');
    return sheet;
  }
  if (!SUPPORTED.includes(ch)) return null;
  const run = [];
  for (let i = 0; i < FRAME_N; i++) {
    run.push(loadOne(new URL(ch + '_run_' + i + '.webp', BASE).href, priority));
  }
  sheet = {
    run,
    idle: loadOne(new URL(ch + '_idle.webp', BASE).href, priority),
    jump: loadOne(new URL(ch + '_jump.webp', BASE).href, priority),
    fall: loadOne(new URL(ch + '_fall.webp', BASE).href, priority),
    fly: loadOne(new URL(ch + '_fly.webp', BASE).href, priority),
  };
  SHEETS[ch] = sheet;
  return sheet;
}

/**
 * 高优先级预载某位自机的动作帧（幂等）。
 * 进关卡前调用，避免开局几帧只有柔光占位。
 * @returns {Promise<boolean>} 4 帧 run 是否齐了
 */
export function ensureCharArt(ch) {
  const sheet = ensureSheet(ch, 'high');
  if (!sheet) return Promise.resolve(false);
  return Promise.all(sheetHolders(sheet).map((h) => (h.frame ? true : h.promise)))
    .then(() => ready(sheet));
}

// 首屏只需要标题素材：角色帧等首屏稳定后再排队（未就绪时调用方留柔光占位）
preloadWhenIdle(() => {
  if (typeof Image === 'undefined') return;
  for (const ch of SUPPORTED) ensureSheet(ch);
});

function ready(sheet) {
  if (!sheet) return false;
  // 只要 4 张 run 帧齐了就能画，其余动作按需回退
  return sheet.run.every((h) => h.frame);
}

function pickFrame(sheet, state, t, vx) {
  const usable = (h) => (h && h.frame ? h.frame : null);
  if (state === 'run' || state === 'dash') {
    const speed = Math.abs(vx) || 200;
    const fps = (state === 'dash' ? 16 : 8) + Math.min(6, speed / 90);
    const i = Math.floor(t * fps) % FRAME_N;
    return usable(sheet.run[i]) || usable(sheet.run[0]);
  }
  if (state === 'jump') return usable(sheet.jump) || usable(sheet.run[2]) || usable(sheet.run[0]);
  if (state === 'fall') return usable(sheet.fall) || usable(sheet.run[3]) || usable(sheet.run[0]);
  if (state === 'fly') return usable(sheet.fly) || usable(sheet.idle) || usable(sheet.run[0]);
  if (state === 'hurt') return usable(sheet.fall) || usable(sheet.run[3]) || usable(sheet.run[0]);
  if (state === 'cast') return usable(sheet.idle) || usable(sheet.run[0]);
  return usable(sheet.idle) || usable(sheet.run[0]);
}

/**
 * 画 AI 角色帧。ctx 必须已经 translate 到「脚底中心」。
 * @param {CanvasRenderingContext2D} ctx
 * @param {{char:string,state?:string,t?:number,facing?:number,vx?:number,vy?:number,
 *          flash?:number,alpha?:number,scale?:number,progAlpha?:number,shadow?:number}} o
 * @returns {boolean} 是否真的画了
 */
export function drawGenChar(ctx, o) {
  const sheet = SHEETS[o.char];
  if (!ready(sheet)) return false;

  const t = o.t || 0;
  const st = o.state || 'idle';
  const f = pickFrame(sheet, st, t, o.vx);
  if (!f) return false;

  const ratio = POSE_RATIO[st] || 1;
  const scale = o.scale || 1;
  const s = (DRAW_H * ratio * scale) / f.bbox.h;

  ctx.save();
  if ((o.facing || 1) < 0) ctx.scale(-1, 1);
  // 倾斜（飞行关随横移前倾）：放在朝向翻转之后，翻转时会自动镜像
  if (o.rot) ctx.rotate(o.rot);
  const alpha = (o.alpha == null ? 1 : o.alpha) * (o.progAlpha || 1);

  // 落地压扁 / 起跳拉长（以脚底为轴，不影响碰撞盒）
  const j = updateJuice(o.char, st, t);
  let sy = 1;
  let sx = 1;
  if (j.timer > 0) {
    const k = j.timer / (j.kind === 'squash' ? SQUASH_T : 0.10);
    const e = k * k;
    if (j.kind === 'squash') {
      sy = 1 - SQUASH_K * e;
      sx = 1 + SQUASH_K * 0.8 * e;
    } else {
      sy = 1 + SQUASH_K * 0.5 * e;
      sx = 1 - SQUASH_K * 0.35 * e;
    }
  }
  if (sy !== 1 || sx !== 1) ctx.scale(sx, sy);

  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 呼吸：待机轻微上下浮动；跑动随步频轻颠
  let bob = 0;
  if (st === 'idle') bob = Math.sin(t * 2.4) * 0.9;
  else if (st === 'fly') bob = Math.sin(t * 3.1) * 1.8;
  else if (st === 'run' || st === 'dash') bob = -Math.abs(Math.sin(t * 12)) * 1.2;

  // 接地阴影：只有在踏地状态画，踩地时才不显得「浮空」
  const grounded = st === 'idle' || st === 'run' || st === 'dash' || st === 'cast';
  if (grounded && o.shadow !== 0) {
    const k = o.shadow == null ? 1 : o.shadow;
    ctx.save();
    ctx.globalAlpha = alpha * 0.5 * k;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, 1, DRAW_H * 0.30, DRAW_H * 0.075, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.28 * k;
    ctx.beginPath();
    ctx.ellipse(0, 1, DRAW_H * 0.20, DRAW_H * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const dx = -(f.bbox.x + f.bbox.w / 2) * s;
  const dy = -(f.bbox.y + f.bbox.h) * s + bob;

  // 1) 暗贴纸：vignette / 亮地面对比不足时，把角色从背景里「抠」出来
  if (o.halo !== 0 && f.halo) {
    const hp = f.haloPad;
    ctx.globalAlpha = alpha * 0.55;
    ctx.drawImage(f.halo, dx - hp * s, dy - hp * s, (f.w + hp * 2) * s, (f.h + hp * 2) * s);
    ctx.globalAlpha = alpha;
  }

  // 2) 上缘受光：光源在上方（天空/月亮），给轮廓一条暖白边
  if (o.rim !== 0 && f.rim) {
    ctx.globalAlpha = alpha * 0.42;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(f.rim, dx + RIM_DX, dy + RIM_DY, f.w * s, f.h * s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }

  // 3) 本体
  ctx.drawImage(f.img, dx, dy, f.w * s, f.h * s);

  // 受击闪白：用预处理好的剪影叠一层，比整屏闪更清楚是谁挨打
  const flash = o.flash || 0;
  if (flash > 0 && f.white) {
    ctx.globalAlpha = alpha * Math.min(1, flash) * 0.9;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(f.white, dx, dy, f.w * s, f.h * s);
  }
  ctx.restore();
  return true;
}

export function genCharReady(char) {
  return ready(SHEETS[char]);
}

/**
 * 自机素材未就绪时的柔光占位：只画一团角色主色的光，绝不画人物轮廓。
 * ctx 已经 translate 到脚底中心，与 drawGenChar 的坐标系一致。
 */
export function drawCharAura(ctx, char, alpha = 1) {
  const rgb = char === 'marisa' ? '255,214,120' : '255,126,190';
  const cy = -DRAW_H * 0.45;
  const r = DRAW_H * 0.7;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(0, cy, 2, 0, cy, r);
  g.addColorStop(0, `rgba(${rgb},0.42)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
