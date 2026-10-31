/**
 * 素材预加载调度
 *
 * 首屏（标题画面）只需要 title_bg + 两张主角立绘，但各模块的立绘 / 底图预加载
 * 在 import 阶段就会一起排队，弱网下会把标题素材挤到后面，看起来像「图没加载」。
 * 这里统一把「非首屏必需」的预加载推迟到首屏素材就绪之后的空闲时段，
 * 让浏览器先把标题素材的连接占满。
 *
 * 自适应闸门（国内 / 弱网）：
 * 中国玩家到 GitHub Pages（Fastly 东京）单程 200ms+，首访全站图片 ~12MB，
 * 空闲预取会把整条链路占满十几秒，和玩家点「开始」之后的关卡素材抢带宽。
 * 因此首屏素材就绪后先估一次实际吞吐 / 看浏览器给的连接档位：
 *   - saveData、effectiveType 是 slow-2g / 2g / 3g，或实测吞吐低于 SLOW_BYTES_PER_SEC
 *     → 判定受限链路，跳过整条「空闲预取」队列；Boss 立绘 / 对话立绘 / 关卡背景
 *       仍由各自的按需加载保证（ensureBossArt、prefetchStageBg 直接请求，不走队列）。
 *   - 否则照旧全部预取，把之后的关卡素材提前下好。
 * 这样弱网不会出现「后台悄悄下 12MB、前台进关卡卡住」。
 */

/** 实测吞吐低于这个值（字节/秒，约 2.8Mbps）就只走按需加载 */
const SLOW_BYTES_PER_SEC = 350 * 1024;
/** 标题素材的 URL 特征：用来从 ResourceTiming 里量首屏真实吞吐 */
const CRITICAL_ART_RE = /(?:title_bg|_title)\.[a-z0-9]+(?:\?|$)/i;

const queue = [];
let armed = false;
let drained = false;
/** 门禁期间暂停整条空闲预取队列（见 holdIdleQueue） */
let held = false;
/** 'unknown' | 'fast' | 'constrained' —— 见 linkTier() */
let tier = 'unknown';

/**
 * 估当前链路的档位。
 * 只读不写，任何异常都退回 'unknown'（= 允许预取，保持旧行为）。
 * @returns {'fast'|'constrained'|'unknown'}
 */
export function linkTier() {
  if (tier !== 'unknown') return tier;
  if (typeof navigator === 'undefined' || typeof performance === 'undefined') return 'unknown';
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData === true) { tier = 'constrained'; return tier; }
      const et = String(conn.effectiveType || '');
      if (et === 'slow-2g' || et === '2g' || et === '3g') { tier = 'constrained'; return tier; }
    }
  } catch (e) { /* ignore */ }
  try {
    // 用标题素材的实际下载量 / 实际耗时量一次吞吐：比 effectiveType 更贴近当前链路。
    // 命中缓存（transferSize 为 0）时不作判断，交给后面的请求自然表现。
    const res = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
    let bytes = 0, t0 = Infinity, t1 = -Infinity;
    for (const e of res) {
      if (!e || !CRITICAL_ART_RE.test(e.name || '')) continue;
      const b = e.encodedBodySize || e.transferSize || 0;
      if (b > 0) bytes += b;
      if (e.startTime < t0) t0 = e.startTime;
      if (e.responseEnd > t1) t1 = e.responseEnd;
    }
    const wall = (t1 - t0) / 1000;
    if (bytes > 0 && wall > 0.25) {
      tier = (bytes / wall) < SLOW_BYTES_PER_SEC ? 'constrained' : 'fast';
      return tier;
    }
  } catch (e) { /* ignore */ }
  return tier; // 'unknown'
}

function runAll() {
  if (drained) return;
  // 门禁期间（启动幕要等 game kit + 曲库）先不放行：保持未 drained，释放后重新排队。
  // 见 main.js 的 _waitBootReady 与 holdIdleQueue。
  if (held) return;
  drained = true;
  // 受限链路：整条空闲预取队列直接作废（按需加载继续负责能用到的素材）
  if (linkTier() === 'constrained') {
    queue.length = 0;
    return;
  }
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

function scheduleRunAll() {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) window.requestIdleCallback(runAll, { timeout: 2000 });
  else setTimeout(runAll, 250);
}

/**
 * 门禁期间暂停空闲预取队列。
 *
 * 启动幕现在要等进关 game kit（整棵依赖图）和第 1 面曲库模块，这段时间里
 * 立绘 / 关卡背景 / 弹幕精灵的空闲预取会跟关键资源抢同一条链路（弱网下就是
 * 几百毫秒到几秒的揭幕延迟）。门禁开场先 hold，放行后如果队列还没跑过再照常排。
 * @param {boolean} on true = 暂停，false = 放行
 */
export function holdIdleQueue(on) {
  held = !!on;
  if (!held && armed && !drained) scheduleRunAll();
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
  const go = () => whenCriticalArtReady(() => scheduleRunAll());
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
  // 兜底：首屏素材迟迟不完成时也必须开始预加载
  setTimeout(() => { if (!drained) whenCriticalArtReady(runAll); }, 8000);
}

/**
 * 注册一段预加载逻辑：首屏素材就绪后按注册顺序执行。
 * 若调度已经跑过，则立刻（下一帧）执行（受限链路下直接丢弃）。
 * @param {() => void} fn
 */
export function preloadWhenIdle(fn) {
  if (typeof fn !== 'function') return;
  if (drained) {
    if (linkTier() === 'constrained') return;
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
