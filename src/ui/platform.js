/**
 * 多端平台层：环境识别 / PWA 安装与离线 / 内置 WebView 修复 / 全屏 / 安全区 / 返回键
 *
 * 设计原则：
 *   1) 桌面端零影响 —— 所有「移动端才需要」的行为都用 <html> 上的 class
 *      （ios / android / harmony / wechat / qq / webview / standalone / touch）门控，
 *      没有这些 class 时本文件只做「无副作用」的事（注册 SW、更新 --vh、挂空监听）。
 *   2) 幂等 —— initPlatform() 可以随便重复调用，只有第一次真正初始化，之后只更新 onBack。
 *   3) 平台层永远不许把游戏搞崩 —— 每一步都包在 safely() 里，出错就静默跳过。
 *
 * 版本：改动本文件后记得同步 index.html 里的 ?v= 与 sw.js 的 CACHE_VERSION。
 */

export const PLATFORM_VERSION = '1.6.53';

const VERSION = PLATFORM_VERSION;
/** 只在同一个 origin + 安全上下文里注册（GitHub Pages / 本地 8138 都满足） */
const SW_URL = './sw.js';
const SW_SCOPE = './';
const CSS_HREF = './src/ui/platform.css?v=' + VERSION;

/** localStorage：装过 / 用户主动关掉过安装条 */
const LS_INSTALL = 'hks.install.v1';
/** localStorage：iOS「添加到主屏幕」图文提示只弹一次 */
const LS_A2HS = 'hks.a2hs.v1';
/** sessionStorage：HTML/平台层版本对账「本会话已重载过一次」（值 = 发起重载时的 PLATFORM_VERSION） */
const SS_HTMLVER = 'hks.htmlver.v1';

const CAN = typeof window !== 'undefined' && !!(window && window.document);
const W = CAN ? window : null;
const D = CAN ? window.document : null;
/** 内置 WebView（微信/QQ/App 壳）里浏览器外壳高度经常压住画面，--vh 只用可见高度 */
const noop = () => {};

function safely(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    return fallback;
  }
}

function mq(query) {
  return safely(() => !!(W && W.matchMedia && W.matchMedia(query).matches), false);
}

function safeGet(key) {
  return safely(() => (W && W.localStorage ? W.localStorage.getItem(key) : null), null);
}

function safeSet(key, val) {
  safely(() => {
    if (W && W.localStorage) W.localStorage.setItem(key, String(val));
  });
}

/* ============================================================
   1) 环境识别
   UA + Client Hints + navigator.standalone + display-mode + pointer 媒体查询
   ============================================================ */

function detectEnv() {
  const nav = (W && W.navigator) || {};
  const ua = String(nav.userAgent || '');
  const ual = ua.toLowerCase();
  const maxTouch = Number(nav.maxTouchPoints || 0);
  const uaData = nav.userAgentData || null; // Chromium Client Hints（可能没有）
  const hintPlatform = String((uaData && uaData.platform) || '').toLowerCase();
  const hintMobile = !!(uaData && uaData.mobile);

  // iPadOS 13+ 默认伪装成 macOS 桌面版 Safari，只能靠触点数拆穿
  const ipadDesktopUA = /macintosh/.test(ual) && maxTouch > 1;
  const ios = /iphone|ipod/.test(ual) || /\bipad\b/.test(ual) || ipadDesktopUA;

  const android = !ios && (/android/.test(ual) || hintPlatform === 'android' || (hintMobile && /linux/.test(hintPlatform)));

  // 鸿蒙：HarmonyOS 2~4 的 UA 带 HarmonyOS；HarmonyOS NEXT 的 ArkWeb 带 OpenHarmony / ArkWeb
  const harmony =
    /openharmony|harmonyos|arkweb/i.test(ua) ||
    /harmony/.test(hintPlatform) ||
    (!ios && !android && /\bhuawei\b/i.test(ua));

  const wechat = /micromessenger/i.test(ua);

  // QQ 内置浏览器：手机 QQ 的 UA 里有 "QQ/8.9.x"；老版/QQ 浏览器是 MQQBrowser。
  // 微信自己也可能带 QQBrowser 字段，所以先排除微信。
  const qq = !wechat && (/\bqq\/\d/.test(ual) || /mqqbrowser|qzone/.test(ual));

  // iOS 的 WKWebView 不带 Safari/；安卓 WebView 通常有 "; wv)"
  const iosWebView = ios && !/safari\//.test(ual);
  const androidWebView = android && /;\s*wv\)/i.test(ua);
  const webview = wechat || qq || iosWebView || androidWebView;

  // 真 Safari（排除 iOS 上的 Chrome/Edge/Firefox/微信/QQ 等套壳）
  const safari =
    /safari\//i.test(ua) && !/(chrome|crios|fxios|edg|opr|opios|micromessenger|mqqbrowser|qq\/\d|android)/i.test(ua);

  const standalone = isStandalone();
  const coarse = mq('(pointer: coarse)');
  // 「主输入是手指」才算 touch：桌面触屏本仍按鼠标处理，避免给桌面套上移动端修复。
  const touch = coarse || (maxTouch > 0 && (ios || android || harmony));

  return {
    ios: !!ios,
    android: !!android,
    harmony: !!harmony,
    wechat: !!wechat,
    qq: !!qq,
    webview: !!webview,
    standalone: !!standalone,
    touch: !!touch,
    coarse: !!coarse,
    safari: !!safari,
  };
}

function isStandalone() {
  if (!CAN) return false;
  // iOS 从主屏幕启动：navigator.standalone === true
  if (safely(() => W.navigator.standalone === true, false)) return true;
  return mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)');
}

/** 把环境 boolean 映射到 <html class="...">，false 的一律移除（幂等） */
function applyEnvClasses(env) {
  if (!D) return;
  const list = D.documentElement.classList;
  const keys = ['ios', 'android', 'harmony', 'wechat', 'qq', 'webview', 'standalone', 'touch'];
  for (const key of keys) {
    if (env[key]) list.add(key);
    else list.remove(key);
  }
}

/* ============================================================
   2) 平台对象（契约 API）
   ============================================================ */

const state = {
  /** 当前视图：{ w, h, vw, vh, dpr, portrait, orientation, scale, offsetTop, standalone } */
  viewport: null,
  inited: false,
  backGuard: false,
  /** 我们压在历史栈上的「拦截层」数量（正常只有 1 层） */
  guardDepth: 0,
  /** 自己退栈时产生的 popstate 不要当成用户按返回 */
  suppressPop: 0,
  installEvent: null,
  /** main.js 同步过来的游戏状态：title|menu|settings|play|paused|dialogue|ending|gameover|clear */
  gameState: 'title',
  /** 游戏进行中本该显示的安装条，等回到菜单再补上 */
  installPending: false,
  /** 1.6s 定时器到点时正在游戏里，等回到菜单再弹 A2HS */
  a2hsPending: false,
  swPromise: null,
  swRegistered: false,
  swReg: null,
  warmed: false,
};

const fullscreenCbs = new Set();
const installCbs = new Set();
const audioCbs = new Set();
const viewportCbs = new Set();

let toastEl = null;
let toastTimer = 0;
let installBarEl = null;
let a2hsEl = null;
let rAF = 0;
const env = detectEnv();

export const platform = {
  version: VERSION,
  /** 环境识别结果（initPlatform 后与返回值同一个对象） */
  env,
  /** 最近一次视口快照（initPlatform 之后有值） */
  viewport: null,
  /** 业务传入的返回键处理（setBackGuard(true) 时被调用） */
  onBack: null,

  isStandalone,
  isWeChat: () => platform.env.wechat,
  isFullscreen,
  toggleFullscreen,
  onFullscreenChange,
  onInstallPrompt,
  promptInstall,
  showToast,
  setBackGuard,
  setGameState,
  /** 当前 gameState（只读，调试/QA 用）：title|menu|settings|play|... */
  get gameState() { return state.gameState; },
  /** 额外便利 API（契约之外，向后兼容，见 docs/PLATFORMS.md） */
  canInstall: () => !!state.installEvent,
  onAudioUnlock,
  onViewport,
  refreshViewport: () => updateViewport(),
  registerSW,
  warmCache: () => warmCache(state.swReg),
};

/* ============================================================
   3) 视口：--vh / --app-h / hks:viewport
   折叠屏展开、分屏拖动、地址栏伸缩都会走到这里。
   注意：平台层只广播尺寸，不碰 canvas（渲染器自己决定要不要 resize）。
   ============================================================ */

let lastPortrait = null;

function updateViewport() {
  if (!CAN) return null;
  const vv = W.visualViewport || null;
  const w = Math.round(W.innerWidth || 0);
  const h = Math.round(W.innerHeight || 0);
  const vw = Math.round((vv && vv.width) || w);
  const vh = Math.round((vv && vv.height) || h);

  const detail = {
    w,
    h,
    vw,
    vh,
    dpr: W.devicePixelRatio || 1,
    portrait: h >= w,
    orientation: safely(() => String((W.screen && W.screen.orientation && W.screen.orientation.type) || ''), ''),
    scale: safely(() => (vv && vv.scale) || 1, 1),
    offsetTop: Math.round(safely(() => (vv && vv.offsetTop) || 0, 0)),
    standalone: !!platform.env.standalone,
  };

  state.viewport = detail;
  platform.viewport = detail;
  lastPortrait = detail.portrait;

  const root = D.documentElement;
  // 老写法兼容：height: calc(var(--vh) * 100)，--vh 是「1vh 的像素值」
  safely(() => root.style.setProperty('--vh', vh / 100 + 'px'));
  safely(() => root.style.setProperty('--app-h', vh + 'px'));
  safely(() => root.style.setProperty('--app-w', vw + 'px'));

  for (const cb of viewportCbs) safely(() => cb(detail));
  safely(() => W.dispatchEvent(new CustomEvent('hks:viewport', { detail })));
  return detail;
}

function scheduleViewport() {
  if (rAF) return;
  const raf = W.requestAnimationFrame || ((f) => setTimeout(f, 16));
  rAF = raf(() => {
    rAF = 0;
    updateViewport();
  });
}

function initViewport() {
  const onChange = () => scheduleViewport();
  W.addEventListener('resize', onChange, { passive: true });
  W.addEventListener('orientationchange', onChange, { passive: true });
  // visualViewport：软键盘、微信地址栏、分屏拖拽都只在这里生效
  if (W.visualViewport) {
    W.visualViewport.addEventListener('resize', onChange, { passive: true });
    W.visualViewport.addEventListener('scroll', onChange, { passive: true });
  }
  if (W.screen && W.screen.orientation && W.screen.orientation.addEventListener) {
    W.screen.orientation.addEventListener('change', onChange, { passive: true });
  }
  updateViewport();
}

/** 订阅视口变化（返回取消函数） */
function onViewport(cb) {
  if (typeof cb !== 'function') return noop;
  viewportCbs.add(cb);
  return () => viewportCbs.delete(cb);
}

/* ============================================================
   4) Toast（极简，单例复用，不进 DOM 队列）
   ============================================================ */

function showToast(text, ms = 2200) {
  if (!D || !text) return;
  if (!toastEl) {
    toastEl = D.createElement('div');
    toastEl.className = 'hks-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    (D.body || D.documentElement).appendChild(toastEl);
  }
  toastEl.textContent = String(text);
  void toastEl.offsetWidth; // 强制 reflow，让动画每次都能重播
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  const dur = Number.isFinite(ms) && ms > 0 ? ms : 2200;
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.classList.remove('show');
  }, dur);
}

/* ============================================================
   5) 全屏 + 横屏
   iOS Safari 没有元素全屏 API：直接返回 false 并提示用「添加到主屏幕」。
   ============================================================ */

function fsElement() {
  if (!D) return null;
  return D.fullscreenElement || D.webkitFullscreenElement || D.msFullscreenElement || null;
}

function isFullscreen() {
  return !!fsElement();
}

function notifyFullscreen(on) {
  for (const cb of fullscreenCbs) safely(() => cb(on));
}

function tryLockLandscape() {
  const so = W && W.screen && W.screen.orientation;
  if (so && typeof so.lock === 'function') {
    const p = safely(() => so.lock('landscape'), null);
    if (p && typeof p.catch === 'function') p.catch(noop);
    return;
  }
  // 老安卓 / 老浏览器的前缀版本
  const legacy =
    (W && W.screen && (W.screen.lockOrientation || W.screen.webkitLockOrientation || W.screen.mozLockOrientation)) || null;
  safely(() => legacy && legacy.call(W.screen, 'landscape'));
}

function requestFs(el) {
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!req) return null;
  let p;
  safely(() => {
    p = req.call(el, { navigationUI: 'hide' });
  });
  if (p) return p;
  // 老实现不接受参数 / 接受参数会抛
  return safely(() => req.call(el), null);
}

function exitFs() {
  const out = D.exitFullscreen || D.webkitExitFullscreen || D.msExitFullscreen;
  if (!out) return null;
  return safely(() => out.call(D), null);
}

/**
 * 切换全屏。返回 true 表示已发起（或已退出），false 表示不支持/被拒绝。
 * 进入全屏后顺手尝试锁横屏（横版弹幕游戏体验更好）。
 */
function toggleFullscreen() {
  if (!CAN) return false;
  if (fsElement()) {
    const p = exitFs();
    if (p && typeof p.catch === 'function') p.catch(noop);
    return true;
  }
  if (platform.env.standalone) {
    showToast('当前已是应用全屏模式');
    return false;
  }
  const el = D.documentElement || D.body;
  if (!el) return false;
  const p = requestFs(el);
  if (!p) {
    if (platform.env.ios) showToast('iOS 不支持网页全屏：点「分享 → 添加到主屏幕」，从桌面启动即可全屏');
    else showToast('当前浏览器不支持全屏');
    return false;
  }
  if (typeof p.catch === 'function') p.catch(() => showToast('全屏请求被浏览器拒绝'));
  tryLockLandscape();
  return true;
}

function onFullscreenChange(cb) {
  if (typeof cb !== 'function') return noop;
  fullscreenCbs.add(cb);
  return () => fullscreenCbs.delete(cb);
}

function initFullscreen() {
  const h = () => {
    const on = isFullscreen();
    if (on) tryLockLandscape();
    notifyFullscreen(on);
  };
  D.addEventListener('fullscreenchange', h);
  D.addEventListener('webkitfullscreenchange', h);
  D.addEventListener('msfullscreenchange', h);
}

/* ============================================================
   6) 安装：beforeinstallprompt + 底部安装条 + iOS「添加到主屏幕」
   ============================================================ */

function makeInstallBar() {
  const bar = D.createElement('div');
  bar.className = 'hks-install';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', '安装应用到桌面');
  bar.innerHTML =
    '<span class="hks-install-icon"><img src="./src/art/pwa-192.png" alt="" width="44" height="44" decoding="async" /></span>' +
    '<span class="hks-install-text"><b>把《东方新纪行》装到桌面</b><i>离线也能玩 · 启动更快 · 全屏无地址栏</i></span>' +
    '<button type="button" class="hks-install-go">安装</button>' +
    '<button type="button" class="hks-install-x" aria-label="关闭">×</button>';
  bar.querySelector('.hks-install-go').addEventListener('click', () => {
    promptInstall();
  });
  bar.querySelector('.hks-install-x').addEventListener('click', () => {
    safeSet(LS_INSTALL, 'dismissed');
    hideInstallBar();
  });
  (D.body || D.documentElement).appendChild(bar);
  return bar;
}

function installBarAllowed() {
  if (!platform.env.touch) return false; // 桌面不自动弹安装条（桌面想装可以自己调 promptInstall）
  if (platform.env.standalone) return false;
  return safeGet(LS_INSTALL) !== 'dismissed' && safeGet(LS_INSTALL) !== 'installed';
}

/* 安装条/A2HS 只在标题页（gameState === 'title'）允许出现。
   设置页、暂停页、对话、战斗、结算都可能被底部卡片挡住操作，一律先收起，
   把「有安装能力」记成 pending，等玩家回到标题页再补显示。 */
const KNOWN_STATES = {
  title: true,
  menu: true,
  settings: true,
  play: true,
  paused: true,
  dialogue: true,
  ending: true,
  gameover: true,
  clear: true,
};

function inTitleState() {
  return state.gameState === 'title';
}
/** 现在真的有可触发的安装事件，且用户没有关过、不在 standalone 里 */
function installPendingNow() {
  return !!state.installEvent && installBarAllowed();
}

/**
 * 同步游戏状态（main.js 每次状态变化调用）。
 * 只有 title 允许显示安装条/A2HS；其它状态立刻收起并记账，回 title 再补。
 * @param {'title'|'menu'|'settings'|'play'|'paused'|'dialogue'|'ending'|'gameover'|'clear'} name
 */
function setGameState(name) {
  if (typeof name !== 'string') return;
  if (!KNOWN_STATES[name]) return;
  if (state.gameState === name) return;
  state.gameState = name;
  // A2HS 是模态层：只在标题页允许出现，进设置/暂停/对局立刻收起（已经看过就不再补弹）
  if (!inTitleState()) hideA2hs();
  applyInstallVisibility();
  if (inTitleState() && state.a2hsPending && safeGet(LS_A2HS) !== 'seen') {
    state.a2hsPending = false;
    showA2hs();
  }
}

/** 安装条的唯一显示入口：只有标题页且真的能装时才 add('show') */
function applyInstallVisibility() {
  if (!D) return;
  if (!inTitleState() || !installPendingNow()) {
    state.installPending = installPendingNow();
    hideInstallBar();
    return;
  }
  state.installPending = false;
  if (!installBarEl) installBarEl = makeInstallBar();
  installBarEl.classList.add('show');
}

function showInstallBar() {
  applyInstallVisibility();
}

function hideInstallBar() {
  if (installBarEl) installBarEl.classList.remove('show');
}

function makeA2hs() {
  const el = D.createElement('div');
  el.className = 'hks-a2hs';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '添加到主屏幕');
  el.innerHTML =
    '<div class="hks-a2hs-card">' +
    '<div class="hks-a2hs-head"><b>添加到主屏幕，全屏开打</b><button type="button" class="hks-a2hs-x" aria-label="关闭">×</button></div>' +
    '<ol class="hks-a2hs-steps">' +
    '<li><span class="hks-a2hs-ico">⤴</span><span>点浏览器底部的「分享」按钮</span></li>' +
    '<li><span class="hks-a2hs-ico">＋</span><span>在菜单里选「添加到主屏幕」</span></li>' +
    '<li><span class="hks-a2hs-ico">◈</span><span>从桌面图标启动：无地址栏、可离线玩</span></li>' +
    '</ol>' +
    '<p class="hks-a2hs-foot">弹窗只在第一次出现，关掉后不再打扰</p>' +
    '</div>';
  el.addEventListener('click', (e) => {
    // 点背景关闭
    if (e.target === el) closeA2hs();
  });
  el.querySelector('.hks-a2hs-x').addEventListener('click', () => closeA2hs());
  (D.body || D.documentElement).appendChild(el);
  return el;
}

function hideA2hs() {
  if (a2hsEl) a2hsEl.classList.remove('show');
}

function closeA2hs() {
  safeSet(LS_A2HS, 'seen');
  hideA2hs();
}

function showA2hs() {
  if (!D) return;
  if (!a2hsEl) a2hsEl = makeA2hs();
  a2hsEl.classList.add('show');
  safeSet(LS_A2HS, 'seen');
}

function emitInstall(available) {
  state.installEvent = available ? state.installEvent : null;
  for (const cb of installCbs) safely(() => cb(!!available));
}

function onInstallPrompt(cb) {
  if (typeof cb !== 'function') return noop;
  installCbs.add(cb);
  return () => installCbs.delete(cb);
}

/**
 * 触发安装。
 *  - 有 beforeinstallprompt：拉起浏览器原生安装框
 *  - iOS Safari：没有原生安装 API，弹出「分享 → 添加到主屏幕」图文说明
 */
async function promptInstall() {
  const evt = state.installEvent;
  if (evt) {
    state.installEvent = null;
    let accepted = false;
    try {
      const p = evt.prompt();
      if (p && typeof p.catch === 'function') p.catch(noop);
      const choice = evt.userChoice ? await evt.userChoice : null;
      accepted = !!(choice && choice.outcome === 'accepted');
    } catch (err) {
      accepted = false;
    }
    hideInstallBar();
    safeSet(LS_INSTALL, accepted ? 'installed' : 'dismissed');
    emitInstall(false);
    return accepted;
  }
  if (platform.env.ios && !platform.env.standalone) {
    showA2hs();
    return false;
  }
  showToast('当前环境不支持一键安装：请用浏览器菜单里的「添加到主屏幕」');
  return false;
}

function initInstall() {
  W.addEventListener('beforeinstallprompt', (e) => {
    // 一定要 preventDefault，否则 Chrome 会自己弹一个我们控制不了的横幅
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    state.installEvent = e;
    // 走状态判断：游戏里只记账，回到菜单再显示
    applyInstallVisibility();
    emitInstall(true);
  });
  W.addEventListener('appinstalled', () => {
    safeSet(LS_INSTALL, 'installed');
    hideInstallBar();
    emitInstall(false);
  });

  // iOS Safari（非 standalone、非套壳）：首次访问给一次「添加到主屏幕」图文提示
  if (platform.env.ios && platform.env.safari && !platform.env.standalone) {
    const go = () => {
      if (safeGet(LS_A2HS) === 'seen') return;
      setTimeout(() => {
        if (safeGet(LS_A2HS) === 'seen') return;
        if (!inTitleState()) {
          // 1.6s 到点时不在标题页：挂起，等回到 title 再弹
          state.a2hsPending = true;
          return;
        }
        showA2hs();
      }, 1600);
    };
    if (D.readyState === 'complete') go();
    else W.addEventListener('load', go, { once: true });
  }
}

/* ============================================================
   7) 返回键拦截（WebView / 浏览器手势返回）
   setBackGuard(true)：压一层历史 → 用户按返回时不退出页面，而是回调 onBack 再压一层。
   setBackGuard(false)：把我们压的层退回去（不触发 onBack）。
   ============================================================ */

function pushGuardState() {
  safely(() => {
    const cur = W.history.state;
    const base = cur && typeof cur === 'object' ? cur : {};
    const guard = Number(base.hksGuard || 0) + 1;
    W.history.pushState({ ...base, hksGuard: guard }, '', W.location.href);
    state.guardDepth++;
  });
}

function onPopState() {
  if (state.suppressPop > 0) {
    // 是我们自己退栈产生的，忽略
    state.suppressPop--;
    state.guardDepth = Math.max(0, state.guardDepth - 1);
    return;
  }
  state.guardDepth = Math.max(0, state.guardDepth - 1);
  if (!state.backGuard) return;
  safely(() => {
    if (typeof platform.onBack === 'function') platform.onBack();
  });
  // 不管有没有回调，都再压一层：保证「返回」永远不会把页面退掉
  pushGuardState();
}

function setBackGuard(on) {
  if (!CAN) return;
  const want = !!on;
  if (want === state.backGuard) return;
  if (want) {
    state.backGuard = true;
    pushGuardState();
    return;
  }
  state.backGuard = false;
  if (state.guardDepth > 0) {
    state.suppressPop++;
    safely(() => W.history.back());
  }
}

/* ============================================================
   8) 移动端触屏修复（全部只在 .touch/.wechat/.qq 下生效）
   - 双击缩放 / gesturestart
   - canvas 长按菜单
   - 微信/QQ 下拉刷新
   - WeixinJSBridgeReady 解锁音频
   ============================================================ */

function initTouchGuards() {
  const env = platform.env;
  if (!env.touch) return; // 桌面完全不动

  // iOS 双指缩放（Safari 专有 gesture 事件）
  D.addEventListener(
    'gesturestart',
    (e) => {
      if (e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  D.addEventListener(
    'gesturechange',
    (e) => {
      if (e.cancelable) e.preventDefault();
    },
    { passive: false }
  );

  // 双击缩放：两次 touchend 间隔 < 320ms 时掐掉后一次（单击不受影响）
  let lastEnd = 0;
  D.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastEnd < 320) {
        if (e.cancelable) e.preventDefault();
        lastEnd = 0;
      } else {
        lastEnd = now;
      }
    },
    { passive: false }
  );

  // 长按 canvas / 游戏画面弹系统菜单（安卓 Chrome / 微信）
  D.addEventListener(
    'contextmenu',
    (e) => {
      const t = e.target;
      const hit = t && (t.tagName === 'CANVAS' || (t.closest && t.closest('canvas')));
      if (hit) e.preventDefault();
    },
    { passive: false }
  );
}

function initWebViewTouch() {
  const env = platform.env;
  if (!(env.wechat || env.qq || (env.webview && env.android))) return;

  // 微信 / QQ / 安卓 WebView 的「下拉刷新」和「地址栏回弹」：
  // 页面本来就不滚动（body overflow:hidden），只在顶部继续往下拉时吞掉手势。
  let startY = 0;
  let pulling = false;

  D.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) {
        pulling = false;
        return;
      }
      const t = e.target;
      // 虚拟按键区自己处理手势，别抢
      if (t && t.closest && t.closest('#touch, [data-hks-no-pull], input, textarea, select')) {
        pulling = false;
        return;
      }
      startY = e.touches[0].clientY;
      pulling = true;
      // 微信地址栏可能把 body 顶下去，touchstart 时归零最稳
      safely(() => {
        if ((W.scrollY || 0) !== 0 || (D.documentElement.scrollTop || 0) !== 0) W.scrollTo(0, 0);
      });
    },
    { passive: true }
  );

  D.addEventListener(
    'touchmove',
    (e) => {
      if (!pulling || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      const atTop = (W.scrollY || 0) <= 0 && (D.documentElement.scrollTop || 0) <= 0;
      if (atTop && dy > 0) {
        if (e.cancelable) e.preventDefault();
      } else if (dy < -6) {
        // 往上滚：交给页面（正常不会滚），停止拦截
        pulling = false;
      }
    },
    { passive: false }
  );

  D.addEventListener(
    'touchend',
    () => {
      pulling = false;
    },
    { passive: true }
  );
}

function initAudioUnlock() {
  const env = platform.env;
  if (!env.wechat) return;
  let fired = false;
  const fire = (via) => {
    if (fired) return;
    fired = true;
    emitAudioUnlock({ via });
  };
  // 微信 iOS：WeixinJSBridgeReady 之后 AudioContext 才能真正启动
  if (safely(() => !!W.WeixinJSBridge, false)) {
    setTimeout(() => fire('bridge'), 0);
  } else {
    D.addEventListener('WeixinJSBridgeReady', () => fire('bridge'), { once: true });
  }
  // 兜底：第一次触摸也算用户手势
  const onGesture = () => fire('gesture');
  D.addEventListener('touchend', onGesture, { once: true, passive: true });
  D.addEventListener('pointerdown', onGesture, { once: true, passive: true });
}

let audioUnlockDetail = null;

function emitAudioUnlock(detail) {
  audioUnlockDetail = detail || { via: 'unknown' };
  for (const cb of audioCbs) safely(() => cb(audioUnlockDetail));
  safely(() => W.dispatchEvent(new CustomEvent('hks:audio-unlock', { detail: audioUnlockDetail })));
}

/**
 * 订阅「音频可以解锁了」：微信里桥就绪 / 首次触摸 / 手动 unlockAudio() 时触发。
 * 音频层（src/engine/audio.js）收到后自行 ctx.resume()。
 */
function onAudioUnlock(cb) {
  if (typeof cb !== 'function') return noop;
  audioCbs.add(cb);
  // 已经解锁过了：立刻补一次，避免业务层注册晚于 WeixinJSBridgeReady 而永远收不到
  if (audioUnlockDetail) {
    const detail = audioUnlockDetail;
    setTimeout(() => safely(() => cb(detail)), 0);
  }
  return () => audioCbs.delete(cb);
}

/* ============================================================
   9) Service Worker：只在 http(s) + 安全上下文注册，失败静默
   ============================================================ */

/** 快链路阈值（字节/秒）：低于这个实测吞吐就不预热，跟 lazy_preload 的 SLOW_BYTES_PER_SEC 对齐 */
const WARM_MIN_BYTES_PER_SEC = 350 * 1024;

/**
 * linkTier() 判不出来（'unknown'）时的兜底探针：用 ResourceTiming 里已经下完的同源资源
 * 实测一次吞吐。量不出来（全是缓存命中 / 样本太小）返回 null。
 * @returns {number|null} 字节/秒
 */
function measureWarmThroughput() {
  return safely(() => {
    const entries = W.performance.getEntriesByType('resource') || [];
    let bytes = 0;
    let t0 = Infinity;
    let t1 = -Infinity;
    for (const e of entries) {
      if (!e || !e.name || !/^https?:/i.test(e.name)) continue;
      const b = e.encodedBodySize || e.transferSize || 0;
      if (b <= 0 || !(e.responseEnd > 0)) continue;
      bytes += b;
      if (e.startTime < t0) t0 = e.startTime;
      if (e.responseEnd > t1) t1 = e.responseEnd;
    }
    const wall = (t1 - t0) / 1000;
    if (bytes > 0 && wall > 0.25) return bytes / wall;
    return null;
  }, null);
}

/**
 * 预热闸门：只有「确认是快链路」才预热。
 * 受限链路 / 省流模式下预热等于把整站再下一遍，只会跟首屏还需要的立绘、音乐抢带宽；
 * 离线可用性由 SW 的导航壳 PRECACHE 保证，不依赖预热。
 * 复用 lazy_preload 的自适应档位（saveData / effectiveType / 首屏素材实测吞吐），
 * 动态 import 拿不到就自己量一次；两种都量不出来时按「不预热」处理（保守）。
 * @returns {Promise<'fast'|'constrained'|'unknown'>}
 */
async function warmGate() {
  const conn = safely(
    () =>
      (W &&
        W.navigator &&
        (W.navigator.connection || W.navigator.mozConnection || W.navigator.webkitConnection)) ||
      null,
    null
  );
  if (conn && conn.saveData === true) return 'constrained';
  let tier = 'unknown';
  try {
    const mod = await import('../engine/lazy_preload.js');
    if (mod && typeof mod.linkTier === 'function') tier = mod.linkTier();
  } catch (err) {
    /* 模块拿不到就自己量 */
  }
  if (tier === 'fast' || tier === 'constrained') return tier;
  const bps = measureWarmThroughput();
  if (bps === null) return 'unknown';
  return bps >= WARM_MIN_BYTES_PER_SEC ? 'fast' : 'constrained';
}

/**
 * 把「本次页面实际请求过的资源」交给 SW 预热缓存。
 * 作用：首访之后即使立刻断网，也能真正进入标题页，而不只是一个空的 index.html。
 * 只在确认是快链路时才发；受限链路 / 省流 / 量不出来一律不发（见 warmGate）。
 * 全程静默、异步，绝不影响启动，失败也不影响游戏。
 */
function warmCache(reg) {
  return (async () => {
    try {
      if (!reg) return false;
      const sw = (W && W.navigator && W.navigator.serviceWorker) || null;
      if (!sw) return false;
      // 先过链路闸门：这一步是异步的、在 postMessage 之前，不会阻塞启动；
      // 受限链路 / saveData / 量不出来 → 直接不发（弱网下预热只会跟前台抢带宽）。
      let gate = 'unknown';
      try {
        gate = await warmGate();
      } catch (err) {
        gate = 'unknown';
      }
      const allowed = gate === 'fast';
      safely(() => {
        W.__hksWarm = { tier: gate, allowed: allowed, at: Date.now() };
      });
      if (!allowed) {
        state.warmed = 'skip:' + gate;
        return false;
      }
      // 首次安装时页面还没被 SW 接管，controller 为 null，等它一下（最多 4s）
      if (!sw.controller) {
        await new Promise((resolve) => {
          const done = () => {
            clearTimeout(timer);
            resolve();
          };
          const timer = setTimeout(done, 4000);
          sw.addEventListener('controllerchange', done, { once: true });
        });
      }
      const target = sw.controller || reg.active;
      if (!target || typeof target.postMessage !== 'function') return false;
      const urls = new Set();
      safely(() => urls.add(W.location.href));
      safely(() => {
        const entries = W.performance.getEntriesByType('resource') || [];
        for (const e of entries) {
          if (e && e.name && /^https?:/i.test(e.name)) urls.add(e.name);
        }
      });
      target.postMessage({ type: 'hks:warm', version: VERSION, urls: Array.from(urls).slice(0, 400) });
      state.warmed = true;
      safely(() => {
        if (W.__hksWarm) W.__hksWarm.sent = urls.size;
      });
      return true;
    } catch (err) {
      return false;
    }
  })();
}

function registerSW() {
  if (!CAN) return Promise.resolve(false);
  if (state.swPromise) return state.swPromise;
  const nav = W.navigator || {};
  state.swPromise = (async () => {
    try {
      if (!('serviceWorker' in nav)) return false;
      if (W.__HKS_NO_SW === true) return false;
      const proto = W.location.protocol;
      if (proto !== 'http:' && proto !== 'https:') return false;
      if (!W.isSecureContext) return false;
      if (/[?&]nosw=1\b/.test(W.location.search)) return false; // 开发/QA 逃生口
      const reg = await nav.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
      state.swRegistered = true;
      state.swReg = reg;
      // 预热离线缓存：不阻塞注册结果，异常不外抛
      warmCache(reg).catch(noop);
      setTimeout(() => warmCache(reg).catch(noop), 3500); // 兜底一次，补上晚加载的图片
      return !!reg;
    } catch (err) {
      // 注册失败必须静默：无痕模式 / 老 WebView / 服务器 MIME 不对都可能失败
      return false;
    }
  })();
  return state.swPromise;
}

function initSW() {
  const start = () => {
    registerSW();
  };
  if (D.readyState === 'complete') start();
  else W.addEventListener('load', start, { once: true });
}

/* ============================================================
   10) 样式兜底：页面没加 <link href="platform.css"> 时自己补一份
   （Lead 在 index.html 里加了 link 的话这里什么都不做）
   ============================================================ */

function ensureStyles() {
  if (!D) return;
  const has = D.querySelector('link[data-hks-platform], link[href*="platform.css"]');
  if (has) return;
  const link = D.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-hks-platform', '');
  (D.head || D.documentElement).appendChild(link);
}

/* ============================================================
   10.5) HTML / 平台层版本对账（net.md R5）
   ------------------------------------------------------------
   GitHub Pages 给 HTML 的缓存只有 max-age=600：发布后最多 10 分钟里，
   访问者可能拿到「旧 index.html + 新 ?v= 资源」的混合体（旧壳配新核）。
   index.html 末尾的内联脚本把入口 ?v= 写进 window.__hksHtmlVer；
   这里拿它和 PLATFORM_VERSION 比对，不一致就带 ?hks_v=<htmlVer> 重载一次 ——
   query 变了，CDN 的 cache key 也跟着变，直接绕开那份旧 HTML。

   绝不循环，两道互相独立的闸：
     1) 本会话已经为它重载过（sessionStorage，值 = 发起重载时的 PLATFORM_VERSION）；
     2) 当前 URL 已经带过 hks_v（别的标签页/手动刷新留下的也算）。
   离线时跳过（重载只会把页面换成离线错误页）；
   老归档页/直接用平台层做单页测试时没有 __hksHtmlVer → 一律跳过。
   ============================================================ */

/** @returns {string|false} 触发的重载目标 URL（QA 用），没触发返回 false */
function htmlVersionGuard() {
  if (!CAN) return false;
  const htmlVer = typeof W.__hksHtmlVer === 'string' ? W.__hksHtmlVer.trim() : '';
  if (!htmlVer || htmlVer === VERSION) return false;
  const nav = W.navigator || {};
  if (nav.onLine === false) return false;
  const loc = W.location || {};
  const search = String(loc.search || '');
  if (/[?&]hks_v=/.test(search)) return false;
  const seen = safely(() => (W.sessionStorage ? W.sessionStorage.getItem(SS_HTMLVER) : null), null);
  if (seen === VERSION) return false;
  safely(() => {
    if (W.sessionStorage) W.sessionStorage.setItem(SS_HTMLVER, VERSION);
  });
  const target =
    String(loc.pathname || './') +
    search +
    (search.indexOf('?') >= 0 ? '&' : '?') +
    'hks_v=' + encodeURIComponent(htmlVer) +
    String(loc.hash || '');
  // 让当前这一帧的模块图先落定再跳，别在 index.html 引导脚本还在解析时打断它
  setTimeout(() => {
    try {
      loc.replace(target);
    } catch (err) {
      /* 跳转被内置 WebView 拦下就什么都不做，页面照常跑 */
    }
  }, 0);
  return target;
}

/* ============================================================
   11) 入口
   ============================================================ */

/**
 * 初始化平台层（幂等）。桌面端调用零副作用、零报错。
 * @param {{ onBack?: (() => void) }} [opts]
 * @returns 环境识别结果 { ios, android, harmony, wechat, qq, webview, standalone, touch, coarse, safari }
 */
export function initPlatform(opts = {}) {
  if (!CAN) return platform.env;
  const o = opts && typeof opts === 'object' ? opts : {};
  if (typeof o.onBack === 'function') platform.onBack = o.onBack;
  if (state.inited) return platform.env;

  state.inited = true;

  // R5：旧 HTML + 新平台层 → 带 ?hks_v= 重载一次绕开 CDN 旧缓存（详见 htmlVersionGuard）
  safely(htmlVersionGuard);

  // 环境识别 → <html> class
  const detected = detectEnv();
  for (const k of Object.keys(detected)) env[k] = detected[k];
  platform.env = env;
  safely(() => applyEnvClasses(env));

  safely(ensureStyles);
  safely(initViewport);
  safely(initFullscreen);
  safely(initInstall);
  // popstate 只在 window 上派发（document 收不到，别挂错目标）
  safely(() => W.addEventListener('popstate', onPopState));
  safely(initTouchGuards);
  safely(initWebViewTouch);
  safely(initAudioUnlock);
  safely(initSW);

  // QA / 控制台调试用（只读对象，业务代码请用 import 的 platform）
  safely(() => {
    W.__hksPlatform = platform;
    W.__hksEnv = env;
    W.__hksHtmlVerGuard = htmlVersionGuard; // QA/自动化：手动复跑版本对账
  });

  return platform.env;
}

/* ============================================================
   12) 自动初始化
   index.html 只要引这一个模块就能用：
     <script type="module" src="./src/ui/platform.js?v=1.6.53"></script>
   业务需要 onBack 时，再调一次 initPlatform({ onBack })（幂等，只更新回调）。
   测试若想「只 import 不生效」，先设 window.__HKS_PLATFORM_NO_AUTO = true。
   ============================================================ */
if (CAN) {
  const auto = safely(() => W.__HKS_PLATFORM_NO_AUTO !== true, true);
  if (auto) safely(() => initPlatform());
}
