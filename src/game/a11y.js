/**
 * 无障碍（a11y）选项：弹幕高对比、自定义弹幕配色、降低闪烁。
 *
 * 为什么单独一个模块：这三个开关会被三方同时读——设置页写、绘制层读、fx/camera 读。
 * 而本模块不允许改 fx.js / camera.js / bullets.js / main.js，
 * 所以采取「集中存状态 + 导出纯函数 + 可选猴补丁」的形式：
 * 状态的读写、颜色推导、对比度遮罩全在这里，外部只负责在几个固定位置调用一次。
 *
 * 设计要点：**所有改动都发生在「数据层」，不碰任何绘制逻辑的结构**。
 * 弹幕靠 `b.color` 这个实例字段上色（bullets.js:817），因此换色 = 改字段值；
 * 高对比不靠拉饱和度（弹幕原本就有暗描边 + 白热内芯，bullets.js palette()），
 * 而是「提亮内核明度 + 背景压一层暗遮罩」双管齐下，保证弹幕与厚涂背景之间有明度差。
 */

const STORE_KEY = 'hks.a11y.v1';

/** 调色板预设。label 是中文源文，调用方过 tr()。 */
export const A11Y_PALETTES = [
  {
    id: 'default',
    label: '默认',
    // 仅用于设置页色块预览与判定点，实际弹幕色保持原样
    dots: ['#ff5ea8', '#8fd8ff', '#ffd23f'],
    hitbox: '#ff5ea8',
    veil: 0,
    map: 'identity',
  },
  {
    id: 'contrast',
    label: '高对比',
    dots: ['#ffffff', '#7fe6ff', '#ffe066'],
    hitbox: '#ffffff',
    // 背景压到 42% 亮度：亮樱花、亮瀑布也不会把弹幕吃掉
    veil: 0.42,
    map: 'contrast',
  },
  {
    id: 'deutan',
    label: '红绿色弱友好',
    dots: ['#ff9d2e', '#3f8cff', '#ffd9a8'],
    hitbox: '#ffe066',
    // 蓝-橙对色：红绿锥体分不清的红/绿被拉开到色轮两端
    veil: 0.3,
    map: 'duoRG',
  },
  {
    id: 'tritan',
    label: '蓝黄色弱友好',
    dots: ['#ff4d5e', '#39e0ff', '#ffe9a8'],
    hitbox: '#ffd23f',
    // 蓝-黄混淆改走红-青对色
    veil: 0.3,
    map: 'duoBY',
  },
];

const PALETTE_IDS = A11Y_PALETTES.map((p) => p.id);

/**
 * 默认值。刻意保守：不改画面，只跟随系统的减少动态偏好
 * （用「或」而不是覆盖：系统要求减少动态时，默认就该安静）。
 */
function defaults() {
  return {
    v: 1,
    contrast: false,
    palette: 'default',
    fxLevel: prefersReducedMotion() ? 'reduced' : 'full',
  };
}

/** 当前状态。单例：绘制层要零成本读，不能每帧造对象。 */
const state = defaults();

const listeners = new Set();
/** 已注册的弹池：换预设时要就地重刷存活子弹的颜色 */
const pools = new Set();

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 设置读写：照 hks.settings.v1 / hks.touch.v1 的风格——白名单 + try/catch
 * ------------------------------------------------------------------ */

/** 读存档。任何损坏（JSON 坏、字段类型不对、版本不认识）都退回默认值而不是抛。 */
export function loadA11y() {
  // 先从默认值起步再逐字段覆盖：这样「坏一个字段」只丢那一个，
  // 而整份坏掉时不会残留上一次的运行时状态。
  const next = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && typeof raw === 'object' && raw.v === 1) {
      if (typeof raw.contrast === 'boolean') next.contrast = raw.contrast;
      if (PALETTE_IDS.includes(raw.palette)) next.palette = raw.palette;
      if (raw.fxLevel === 'full' || raw.fxLevel === 'reduced') next.fxLevel = raw.fxLevel;
    }
  } catch {
    // 无 localStorage / 数据损坏：用默认值继续，不让设置页崩
  }
  Object.assign(state, next);
  return { ...state };
}

/** 写存档。写失败（隐私模式、配额满）不能影响游戏本身。 */
export function saveA11y() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {}
}

/** 读当前状态（冻结副本，防止外部拿到内部对象改着玩）。 */
export function getA11y() {
  return { ...state };
}

/**
 * 改设置并**立刻生效**（设置页是「即时生效，自动保存」）。
 * 生效包含四件事：写 DOM 变量、重刷存活子弹颜色、通知订阅者、落盘。
 */
export function setA11y(patch = {}) {
  let dirty = false;
  if (typeof patch.contrast === 'boolean' && patch.contrast !== state.contrast) {
    state.contrast = patch.contrast;
    dirty = true;
  }
  if (PALETTE_IDS.includes(patch.palette) && patch.palette !== state.palette) {
    state.palette = patch.palette;
    dirty = true;
  }
  if ((patch.fxLevel === 'full' || patch.fxLevel === 'reduced') && patch.fxLevel !== state.fxLevel) {
    state.fxLevel = patch.fxLevel;
    dirty = true;
  }
  if (!dirty) return getA11y();

  applyDom();
  repaintPools();
  saveA11y();
  for (const cb of listeners) {
    try {
      cb(getA11y());
    } catch {}
  }
  return getA11y();
}

/** 订阅变化，返回退订函数。 */
export function onA11yChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 循环切预设（设置页左右方向键用）。 */
export function cyclePalette(dir = 1) {
  const i = PALETTE_IDS.indexOf(state.palette);
  const next = PALETTE_IDS[(i + dir + PALETTE_IDS.length) % PALETTE_IDS.length];
  return setA11y({ palette: next });
}

export function getPalette(id = state.palette) {
  return A11Y_PALETTES.find((p) => p.id === id) || A11Y_PALETTES[0];
}

/* ------------------------------------------------------------------ *
 * 降低闪烁：给 fx.js / camera.js 读的全局开关
 * ------------------------------------------------------------------ */

/**
 * 'reduced' 时调用方应该：
 *  - camera.shake() 不产生位移（或直接把 camera.shakeEnabled 置 false）
 *  - fx.flash() 跳过、shockwave 不来、burst 数量减半
 *  - 符卡演出的径向模糊/缩放不做
 * 比 prefers-reduced-motion 更细：那只是系统偏好，这里是玩家显式开关。
 */
export function getFxLevel() {
  return state.fxLevel;
}

/** 便捷布尔，省得调用方到处写 === 'reduced'。 */
export function isReducedFx() {
  return state.fxLevel === 'reduced';
}

/**
 * 把一个 Camera 实例接到当前设置上：reduced 就关震屏。
 * 这不是改 camera.js，只是替它设已有的公开字段。
 * Lead 在每次 afterStageStart 后调一次即可（换关会 new Camera）。
 */
export function bindCamera(camera) {
  if (!camera) return;
  camera.shakeEnabled = !isReducedFx();
}

/* ------------------------------------------------------------------ *
 * 弹幕配色：只在颜色字段上做映射
 * ------------------------------------------------------------------ */

function hexToRgb(hex) {
  const s = String(hex).replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const v = parseInt(n, 16);
  if (!Number.isFinite(v)) return [255, 94, 168]; // 坏色值退回默认粉，别崩
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  return '#' + rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * 把一颗子弹的原色映射成当前预设下的颜色。纯函数，不依赖状态也能指定 preset。
 *
 * 为什么按「色相分区」而不是简单地全局旋转色相：
 * 色弱玩家的困难是**区分**，不是「颜色不好看」。所以对色弱预设把整条色相轴压到
 * 两组互为补色的窄带里（红绿 → 橙/蓝，蓝黄 → 红/青），明度差交给色调本身；
 * 高对比预设则保留原色相（保留弹型语义）只把明度推到 0.66 并顶满饱和度，
 * 这样每一颗弹的核心都比任何被遮罩压暗的背景亮，不靠「更艳」取胜。
 */
export function remapBulletColor(hex, presetId = state.palette) {
  const p = getPalette(presetId);
  if (p.map === 'identity') return hex;

  const [h, s, l] = rgbToHsl(...hexToRgb(hex));

  if (p.map === 'contrast') {
    // 原本就接近白的弹（palette() 里 s<=0.12 那一支）直接纯白，避免灰掉
    if (s <= 0.12) return '#ffffff';
    return hslToHex(h, 0.95, 0.68);
  }

  // 近白的弹保持白：它们本来就跟背景拉开了明度差，改动只会降低可辨性
  if (s <= 0.12 && l > 0.75) return '#ffffff';

  if (p.map === 'duoRG') {
    // 红/品红/黄 → 橙；绿/青/蓝/紫 → 蓝
    const warm = h < 70 || h >= 320;
    return warm ? hslToHex(28, 0.95, 0.62) : hslToHex(214, 0.95, 0.64);
  }

  // duoBY：黄/绿 → 青（亮度更高）；蓝/紫/红 → 红
  const yellowSide = h >= 45 && h < 165;
  return yellowSide ? hslToHex(190, 0.95, 0.66) : hslToHex(355, 0.92, 0.62);
}

/** 当前设置下判定点应该用的颜色。 */
export function getHitboxColor() {
  const p = getPalette();
  if (!state.contrast) return p.hitbox;
  return p.id === 'default' ? '#ffffff' : p.hitbox;
}

/**
 * 把一个 BulletPool 接进来：
 *  1) 补丁它的 spawn，新弹的颜色在出生时就被映射（只改 o.color，绘制结构不动）
 *  2) 记下原始色到 b._a11ySrc，这样切换预设时能重新映射而不是在映射结果上再映射
 *  3) 注册进 pools，之后 setA11y 会即时重刷存活弹
 * 幂等：重复调用同一个池只注册一次。
 */
export function installPool(pool) {
  if (!pool || typeof pool.spawn !== 'function' || pool.__a11yPatched) {
    if (pool) pools.add(pool);
    return pool;
  }
  const original = pool.spawn.bind(pool);
  // spawn(o) 返回单颗弹（bullets.js:844）。这里**不改 o**——ring/burst 会复用同一个
  // 选项对象，改它会把映射结果传回调用方、下次再映射一遍，色相越飘越远。
  // 改为「原样生成 → 生成后覆写 b.color」，原始色挂在 b._a11ySrc 上留档供换预设时重算。
  pool.spawn = function patchedSpawn(o) {
    const b = original(o);
    if (b) {
      const src = (o && typeof o.color === 'string') ? o.color : '#ff5ea8';
      b._a11ySrc = src;
      b.color = remapBulletColor(src);
    }
    return b;
  };
  pool.__a11yPatched = true;
  pools.add(pool);
  return pool;
}

/** 换预设后把所有已注册池里的存活弹重新上色（就地改字段，零分配）。 */
function repaintPools() {
  for (const pool of pools) {
    const arr = pool.pool || pool.bullets || [];
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      if (!b || !b.active) continue;
      const src = b._a11ySrc || b.color;
      b._a11ySrc = src;
      b.color = remapBulletColor(src);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 绘制辅助：后台压暗遮罩 + 判定点高亮
 * ------------------------------------------------------------------ */

/**
 * 背景压暗遮罩。必须画在**背景之后、相机变换之前**的屏幕空间（stage.js:2555~2558 之间），
 * 或者更省事：main.js 在 stage.draw 之后再叠一层（世界与背景一起吃点暗，效果最稳）。
 * 用纯黑而不是灰：黑只会降低背景明度，不改变色相，厚涂插画的观感损失最小。
 */
export function drawContrastVeil(ctx, w, h) {
  const p = getPalette();
  if (!p.veil || !state.contrast) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(4, 6, 18, ${p.veil})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * 判定点高亮：在 drawHitbox 之外再加一圈双层描边（暗垫底 + 亮外环）和一层柔光。
 * 现有 hitbox 只在 focus 时才出现（player.js:583），且白芯很细；
 * 这个覆盖层不替换它，只是把「我在哪」这个最要命的信息放大。
 * Lead 在 stage.draw 之后、present 之前调一次（world 坐标系，参数用 player.hitPoint）。
 */
export function drawHitboxAura(ctx, point, t = 0) {
  if (!point) return;
  const { x, y, r } = point;
  const accent = getHitboxColor();
  const pulse = 1 + Math.sin(t * 3.2) * (isReducedFx() ? 0.02 : 0.08);

  ctx.save();
  // 柔光：低 alpha 大半径，只提亮周围，不遮挡弹幕
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 4.2 * pulse);
  g.addColorStop(0, 'rgba(255,255,255,0.34)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 4.2 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  // 暗垫底：无论背景多亮，环的外侧都是暗的，环本身就浮起来了
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(6,8,22,0.85)';
  ctx.beginPath();
  ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
  ctx.stroke();
  // 亮环
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * DOM 侧：把设置写成 CSS 变量（a11y.css 里的色块预览靠它们上色）
 * ------------------------------------------------------------------ */

/**
 * 写 CSS 变量 + 挂 html 上的状态类。Node 环境（自测脚本）里静默跳过。
 * 变量名固定：--hks-bullet-1/2/3、--hks-hitbox、--hks-veil。
 */
export function applyDom() {
  if (typeof document === 'undefined' || !document.documentElement) return;
  const p = getPalette();
  const root = document.documentElement;
  root.style.setProperty('--hks-bullet-1', p.dots[0]);
  root.style.setProperty('--hks-bullet-2', p.dots[1]);
  root.style.setProperty('--hks-bullet-3', p.dots[2]);
  root.style.setProperty('--hks-hitbox', getHitboxColor());
  root.style.setProperty('--hks-veil', String(state.contrast ? p.veil : 0));
  root.classList.toggle('hks-a11y-contrast', !!state.contrast);
  root.classList.toggle('hks-a11y-reduced', state.fxLevel === 'reduced');
}

/** 设置页的色块 HTML 片段（a11y.css 提供 .hks-a11y-dots）。不需要 DOM 也能拼字符串。 */
export function paletteDotsHtml(presetId = state.palette) {
  const p = getPalette(presetId);
  return `<span class="hks-a11y-dots">${p.dots
    .map((c) => `<i style="background:${c}"></i>`)
    .join('')}</span>`;
}

/** 初始化：读存档 → 应用。Lead 在 main.js 构造时调一次。 */
export function initA11y() {
  loadA11y();
  applyDom();
  return getA11y();
}
