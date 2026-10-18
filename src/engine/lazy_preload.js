/**
 * 素材预加载调度
 *
 * 首屏（标题画面）只需要 title_bg + 两张主角立绘，但各模块的立绘 / 底图预加载
 * 在 import 阶段就会一起排队，弱网下会把标题素材挤到后面，看起来像「图没加载」。
 * 这里统一把「非首屏必需」的预加载推迟到首屏素材就绪之后的空闲时段，
 * 让浏览器先把标题素材的连接占满。
 */

const queue = [];
let armed = false;
let drained = false;

function runAll() {
  if (drained) return;
  drained = true;
  const idle = 'requestIdleCallback' in window
    ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 })
    : (fn) => setTimeout(fn, 120);
  const step = () => {
    const fn = queue.shift();
    if (!fn) return;
    try { fn(); } catch (e) { /* 预加载失败不影响运行 */ }
    if (queue.length) idle(step);
  };
  step();
}

function whenCriticalArtReady(cb) {
  const imgs = (typeof window !== 'undefined' && Array.isArray(window.__titleArt)) ? window.__titleArt : [];
  const pending = imgs.filter((im) => im && !im.complete);
  if (!pending.length) { cb(); return; }
  let left = pending.length;
  const tick = () => { if (--left <= 0) cb(); };
  for (const im of pending) {
    im.addEventListener('load', tick, { once: true });
    im.addEventListener('error', tick, { once: true });
  }
}

function arm() {
  if (armed || typeof window === 'undefined' || typeof document === 'undefined') return;
  armed = true;
  const go = () => whenCriticalArtReady(() => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(runAll, { timeout: 2000 });
    else setTimeout(runAll, 250);
  });
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
  // 兜底：首屏素材迟迟不完成时也必须开始预加载
  setTimeout(() => { if (!drained) whenCriticalArtReady(runAll); }, 8000);
}

/**
 * 注册一段预加载逻辑：首屏素材就绪后按注册顺序执行。
 * 若调度已经跑过，则立刻（下一帧）执行。
 * @param {() => void} fn
 */
export function preloadWhenIdle(fn) {
  if (typeof fn !== 'function') return;
  if (drained) {
    const run = () => { try { fn(); } catch (e) { /* ignore */ } };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 100);
    return;
  }
  queue.push(fn);
  arm();
}

/** 给图片打上资源的相对优先级（Chrome 生效，其他浏览器忽略） */
export function setPriority(img, level) {
  try {
    if (img && 'fetchPriority' in img) img.fetchPriority = level;
  } catch (e) { /* ignore */ }
  return img;
}
