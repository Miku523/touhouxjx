/**
 * cardfx.js —— 符卡「卡面氛围」叠加层（屏幕空间 canvas 2D，纯视觉，不改世界）。
 *
 * 调用约定（由 stage.js 在弹幕绘制之后调用）：
 *   drawCardFx(ctx, fxKey, { w, h, px, py, playerR, time, accent })
 *   - ctx      : 主画布 2D 上下文（屏幕坐标，原点左上）
 *   - fxKey    : fx 键名，见 FX_KEYS；'none' / 未知键 = 直接返回（安全 no-op）
 *   - opts.px/py : 玩家屏幕坐标（darkSpot 的亮区中心）
 *   - opts.time  : 累计秒数（动画相位）
 *   - opts.accent: 可选强调色（默认各 fx 自带配色）
 *
 * 设计原则：
 *  - 每帧只做 1 次全屏 fill + 少量 drawImage / path；不建大数组、不每帧 new gradient（除全屏暗角）。
 *  - 所有「粒子」用确定性 hash 伪随机，不持有粒子池 → 无 GC 抖动、无状态漂移。
 *  - 只用 globalAlpha / globalCompositeOperation，不改 shadowBlur（避免慢）。
 */

const TAU = Math.PI * 2;

/** 确定性伪随机：同一 (i, seed) 永远得到同一值 [0,1) */
function h1(i, seed = 0) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 缓存一个圆形径向光斑贴图（发光点用 drawImage，避免每点建 gradient） */
let _glowCache = null;
function glowSprite(color = '255,244,170', size = 64) {
  if (_glowCache && _glowCache.key === color + size) return _glowCache.canvas;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `rgba(${color},1)`);
  grad.addColorStop(0.35, `rgba(${color},0.55)`);
  grad.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  _glowCache = { key: color + size, canvas: c };
  return c;
}

/* ───────────────────────── 各 fx 实现 ───────────────────────── */

/** 全屏近黑 + 玩家周围圆形亮区（莉格露 3 卡「萤火虫之夜」）
 *  验收口径（Lead）：中心 → ~170px 保持全亮；170 → ~300px 快速衰减；
 *  300px 外亮度 ≤5%（近黑）。径向渐变以 pr=160 为基准：fullR=1.06pr≈170，
 *  之后 130px 内从 alpha 0 陡升到 0.985，300px 外整屏保持近黑。
 */
function fxDarkSpot(ctx, o) {
  const { w, h, px, py, time } = o;
  const pr = o.playerR || 160;
  const breathe = 1 + Math.sin(time * 1.7) * 0.035;
  const fullR = Math.max(120, pr * 1.06) * breathe;   // 全亮保持半径 ≈170
  const fadeR = Math.max(fullR + 90, pr * 1.875) * breathe; // 衰减结束半径 ≈300
  const g = ctx.createRadialGradient(px, py, fullR, px, py, fadeR);
  // 归一化位置 (r-fullR)/(fadeR-fullR)：0~170 全亮，170~300 快速压暗，300 外 ≤5% 亮度
  g.addColorStop(0, 'rgba(3,4,10,0)');        // ~170px 仍全亮
  g.addColorStop(0.23, 'rgba(3,4,10,0.10)');  // ~200px 亮度 ~90%
  g.addColorStop(0.46, 'rgba(3,4,10,0.50)');  // ~230px 亮度 ~50%
  g.addColorStop(0.615, 'rgba(2,3,8,0.82)');  // ~250px 亮度 ~18%
  g.addColorStop(0.77, 'rgba(2,3,8,0.94)');   // ~270px 亮度 ~6%
  g.addColorStop(1, 'rgba(1,1,3,0.985)');     // ~300px 外 ≤5% 亮度（四角 ≈4/255）
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 亮区边缘的暖色萤光（让「能看见」这件事本身有边界感）
  const ring = ctx.createRadialGradient(px, py, pr * 0.55, px, py, pr * 1.18);
  ring.addColorStop(0, 'rgba(190,255,140,0)');
  ring.addColorStop(0.72, 'rgba(190,255,140,0.035)');
  ring.addColorStop(1, 'rgba(150,220,120,0)');
  ctx.fillStyle = ring;
  ctx.fillRect(0, 0, w, h);
}

/** 紫黑纱幕 + 心跳脉动（露米娅「宵暗」系） */
function fxDarkVeil(ctx, o) {
  const { w, h, time, px, py } = o;
  const pulse = 0.5 + Math.sin(time * 1.15) * 0.5;
  const g = ctx.createRadialGradient(px, py, 60, px, py, Math.max(w, h) * (0.62 + pulse * 0.10));
  g.addColorStop(0, 'rgba(12,4,26,0)');
  g.addColorStop(0.55, `rgba(14,4,30,${0.24 + pulse * 0.07})`);
  g.addColorStop(1, 'rgba(4,1,12,0.72)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 两条缓慢游走的紫色雾带
  for (let k = 0; k < 2; k++) {
    const yy = h * (0.32 + 0.22 * k) + Math.sin(time * 0.5 + k * 2.1) * 46;
    const gg = ctx.createLinearGradient(0, yy - 90, 0, yy + 90);
    gg.addColorStop(0, 'rgba(96,44,160,0)');
    gg.addColorStop(0.5, `rgba(110,52,180,${0.055 + 0.02 * Math.sin(time * 0.8 + k)})`);
    gg.addColorStop(1, 'rgba(96,44,160,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, yy - 90, w, 180);
  }
}

/** 萤火虫：暖黄绿光点群，缓慢盘旋 + 明灭 */
function fxFireflies(ctx, o) {
  const { w, h, time } = o;
  const spr = glowSprite('214,255,140', 64);
  const n = 46;
  for (let i = 0; i < n; i++) {
    const sp = 0.28 + h1(i, 3) * 0.5;
    const x = (h1(i, 7) * 1.15 - 0.08) * w + Math.sin(time * sp + i * 1.7) * (24 + h1(i, 11) * 46);
    const y = (h1(i, 13) * 1.08 - 0.04) * h + Math.cos(time * sp * 0.8 + i * 2.3) * (18 + h1(i, 17) * 40);
    const blink = 0.35 + 0.65 * Math.max(0, Math.sin(time * (1.1 + h1(i, 19) * 1.6) + i));
    const s = 12 + h1(i, 23) * 18;
    ctx.globalAlpha = 0.35 + blink * 0.6;
    ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  // 整体压一点冷暗，衬托暖光
  ctx.fillStyle = 'rgba(10,18,14,0.10)';
  ctx.fillRect(0, 0, w, h);
}

/** 冰雹：斜向白色划线雨 */
function fxHail(ctx, o) {
  const { w, h, time } = o;
  ctx.strokeStyle = 'rgba(200,238,255,0.55)';
  ctx.lineWidth = 1.6;
  const n = 70;
  for (let i = 0; i < n; i++) {
    const sp = 620 + h1(i, 5) * 520;
    const len = 20 + h1(i, 9) * 34;
    const x = ((h1(i, 2) * w + time * 170) % (w + 120)) - 60;
    const y = ((h1(i, 4) * h + time * sp) % (h + 120)) - 60;
    ctx.globalAlpha = 0.25 + h1(i, 6) * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.36, y - len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 冷色底与霜角
  ctx.fillStyle = 'rgba(120,180,230,0.07)';
  ctx.fillRect(0, 0, w, h);
}

/** 冰结：边角霜晶 + 冷蓝暗角（琪露诺系） */
function fxFreeze(ctx, o) {
  const { w, h, time } = o;
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.30, w / 2, h / 2, h * 0.92);
  g.addColorStop(0, 'rgba(160,220,255,0)');
  g.addColorStop(1, 'rgba(120,190,240,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 四角的霜晶尖刺
  ctx.save();
  ctx.strokeStyle = 'rgba(225,248,255,0.42)';
  ctx.lineWidth = 2;
  const corners = [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]];
  for (let c = 0; c < 4; c++) {
    const [cx, cy, sx, sy] = corners[c];
    for (let i = 0; i < 5; i++) {
      const len = 40 + h1(i + c * 7, 3) * 130;
      const ang = (0.18 + h1(i + c * 7, 5) * 0.5) * Math.PI * 0.5;
      const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      ctx.globalAlpha = 0.18 + 0.3 * (0.5 + 0.5 * Math.sin(time * 0.9 + i));
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * sx, cy + dy * sy);
      ctx.stroke();
      // 冰棱小分叉
      ctx.beginPath();
      ctx.moveTo(cx + dx * sx * 0.55, cy + dy * sy * 0.55);
      ctx.lineTo(cx + dx * sx * 0.55 + dy * 0.24 * sx, cy + dy * sy * 0.55 - dx * 0.10 * sy);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 风：横向流动的丝状风线（射命丸文系） */
function fxWind(ctx, o) {
  const { w, h, time } = o;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const y = (h1(i, 3) * 1.06 - 0.03) * h;
    const speed = 420 + h1(i, 29) * 520;
    const x = ((h1(i, 31) * w + time * speed) % (w + 300)) - 150;
    const len = 90 + h1(i, 37) * 190;
    const wob = Math.sin(time * 2 + i) * 10;
    ctx.strokeStyle = `rgba(240,248,255,${0.10 + h1(i, 41) * 0.16})`;
    ctx.lineWidth = 1 + h1(i, 43) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x - len, y + wob);
    ctx.quadraticCurveTo(x - len * 0.4, y - 8 + wob, x, y + wob * 0.4);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(220,240,255,0.035)';
  ctx.fillRect(0, 0, w, h);
}

/** 樱瓣：粉白花瓣飘落（幽幽子 / 辉夜） */
function fxPetals(ctx, o) {
  const { w, h, time } = o;
  const n = 40;
  for (let i = 0; i < n; i++) {
    const sp = 46 + h1(i, 3) * 74;
    const y = ((h1(i, 7) * h + time * sp) % (h + 80)) - 40;
    const sway = Math.sin(time * (0.7 + h1(i, 9) * 0.8) + i * 1.7) * (26 + h1(i, 11) * 40);
    const x = ((h1(i, 13) * w + sway + time * 20) % (w + 80)) - 40;
    const rot = time * (0.6 + h1(i, 17) * 1.4) + i;
    const s = 3.4 + h1(i, 19) * 4.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, 0.55 + h1(i, 23) * 0.3);
    ctx.fillStyle = h1(i, 27) > 0.5 ? 'rgba(255,205,225,0.75)' : 'rgba(255,240,246,0.65)';
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** 夜：深蓝天幕 + 星点 + 大暗角 */
function fxNight(ctx, o) {
  const { w, h, time } = o;
  ctx.fillStyle = 'rgba(6,10,34,0.26)';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(time * (0.5 + h1(i, 2) * 1.4) + i));
    const x = h1(i, 3) * w, y = h1(i, 5) * h * 0.82;
    const s = h1(i, 7) > 0.9 ? 2.2 : 1.2;
    ctx.globalAlpha = 0.25 + tw * 0.55;
    ctx.fillStyle = h1(i, 11) > 0.75 ? 'rgba(190,215,255,1)' : 'rgba(255,255,240,1)';
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.36, w / 2, h / 2, h * 0.95);
  g.addColorStop(0, 'rgba(2,4,18,0)');
  g.addColorStop(1, 'rgba(2,4,18,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** 月：右上角大月亮 + 冷光雾（露米娅 / 辉夜） */
function fxMoon(ctx, o) {
  const { w, h, time } = o;
  const mx = w * 0.80, my = h * 0.20, mr = h * 0.20;
  const glow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 4.2);
  glow.addColorStop(0, 'rgba(255,250,220,0.20)');
  glow.addColorStop(0.35, 'rgba(220,230,255,0.08)');
  glow.addColorStop(1, 'rgba(200,220,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,253,235,0.86)';
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, TAU);
  ctx.fill();
  // 月海（固定几块淡灰）
  ctx.fillStyle = 'rgba(200,205,190,0.30)';
  const seas = [[-0.3, -0.2, 0.30], [0.16, 0.10, 0.22], [-0.10, 0.38, 0.16], [0.34, -0.34, 0.12]];
  for (const [dx, dy, rr] of seas) {
    ctx.beginPath();
    ctx.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, TAU);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.40, mx, my, h * 1.05);
  g.addColorStop(0, 'rgba(10,14,40,0.02)');
  g.addColorStop(1, 'rgba(8,10,30,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** 蝶：幽蓝蝶影（幽幽子符卡签名视觉） */
function fxButterfly(ctx, o) {
  const { w, h, time } = o;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const sp = 0.34 + h1(i, 3) * 0.5;
    const x = (h1(i, 5) * 1.1 - 0.05) * w + Math.sin(time * sp + i) * 120;
    const y = (h1(i, 7) * 1.05 - 0.02) * h + Math.cos(time * sp * 1.3 + i * 2) * 80;
    const flap = 0.45 + 0.55 * Math.abs(Math.sin(time * (2.2 + h1(i, 9) * 2) + i));
    const s = 9 + h1(i, 11) * 12;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.30 + 0.35 * flap;
    ctx.fillStyle = h1(i, 13) > 0.5 ? 'rgba(150,190,255,1)' : 'rgba(190,150,255,1)';
    ctx.beginPath();
    ctx.ellipse(-s * 0.55, -s * 0.18, s * 0.62, s * 0.46 * flap, -0.5, 0, TAU);
    ctx.ellipse(s * 0.55, -s * 0.18, s * 0.62, s * 0.46 * flap, 0.5, 0, TAU);
    ctx.ellipse(-s * 0.36, s * 0.4, s * 0.42, s * 0.32 * flap, 0.4, 0, TAU);
    ctx.ellipse(s * 0.36, s * 0.4, s * 0.42, s * 0.32 * flap, -0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(30,16,54,0.10)';
  ctx.fillRect(0, 0, w, h);
}

/** 隙间紫焰：底部上飘的紫/青火焰粒子 */
function fxVoidFlame(ctx, o) {
  const { w, h, time } = o;
  const spr = glowSprite('160,120,255', 64);
  for (let i = 0; i < 34; i++) {
    const life = (time * (0.30 + h1(i, 3) * 0.35) + h1(i, 5)) % 1;
    const x = h1(i, 7) * w + Math.sin(time * 1.3 + i) * 26;
    const y = h + 30 - life * (h * 1.05);
    const s = (18 + h1(i, 11) * 30) * (1 - life * 0.4);
    ctx.globalAlpha = (1 - life) * 0.42;
    ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

/** 金尘：辉夜系的飘金微光（与 petals 叠加成「玉枝」） */
function fxFairyDust(ctx, o) {
  const { w, h, time } = o;
  const spr = glowSprite('255,232,150', 64);
  for (let i = 0; i < 40; i++) {
    const sp = 0.18 + h1(i, 3) * 0.5;
    const x = (h1(i, 5) * 1.1 - 0.05) * w + Math.sin(time * sp + i) * 60;
    const y = ((h1(i, 7) * h - time * (30 + h1(i, 9) * 60)) % (h + 80) + h + 80) % (h + 80) - 40;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (1.2 + h1(i, 11) * 2) + i));
    const s = 8 + h1(i, 13) * 14;
    ctx.globalAlpha = 0.25 + tw * 0.5;
    ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

/** 红雾：满月/永夜系的暗红薄雾 */
function fxRedMist(ctx, o) {
  const { w, h, time } = o;
  const g = ctx.createRadialGradient(w * 0.5, h * 0.44, h * 0.12, w * 0.5, h * 0.5, h * 0.95);
  g.addColorStop(0, 'rgba(120,10,26,0)');
  g.addColorStop(0.5, `rgba(120,10,26,${0.06 + 0.03 * Math.sin(time * 0.7)})`);
  g.addColorStop(1, 'rgba(60,4,14,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** fx 键表（供预览页 & 文档引用；新增键请同步 BOSS_CREATIVE_DESIGN.md） */
export const FX_KEYS = [
  'none',
  'darkSpot', 'darkVeil', 'fireflies', 'hail', 'freeze', 'wind', 'petals',
  'night', 'moon', 'butterfly', 'voidFlame', 'fairyDust', 'redMist',
];

const FX_IMPL = {
  darkSpot: fxDarkSpot,
  darkVeil: fxDarkVeil,
  fireflies: fxFireflies,
  hail: fxHail,
  freeze: fxFreeze,
  wind: fxWind,
  petals: fxPetals,
  night: fxNight,
  moon: fxMoon,
  butterfly: fxButterfly,
  voidFlame: fxVoidFlame,
  fairyDust: fxFairyDust,
  redMist: fxRedMist,
};

/**
 * 主入口：绘制当前符卡的屏幕叠加层。
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} fxKey
 * @param {{w?:number,h?:number,px?:number,py?:number,playerR?:number,time?:number,accent?:string}} [opts]
 */
export function drawCardFx(ctx, fxKey, opts = {}) {
  if (!ctx || !fxKey || fxKey === 'none') return;
  const fn = FX_IMPL[fxKey];
  if (!fn) return;
  const o = {
    w: opts.w || 1280,
    h: opts.h || 720,
    px: opts.px != null ? opts.px : (opts.w || 1280) * 0.5,
    py: opts.py != null ? opts.py : (opts.h || 720) * 0.62,
    playerR: opts.playerR || 160,
    time: opts.time || 0,
    accent: opts.accent,
  };
  ctx.save();
  try {
    fn(ctx, o);
  } finally {
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export default drawCardFx;
