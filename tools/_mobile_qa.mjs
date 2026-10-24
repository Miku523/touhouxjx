#!/usr/bin/env node
/**
 * tools/_mobile_qa.mjs —— 多端自动化 QA（手机 / 平板 / 折叠屏 + PWA + Gamepad）
 *
 * 原理：headless Edge + CDP。每个「设备 × 方向」起一个干净浏览器实例，
 * 用 Emulation.setDeviceMetricsOverride 设视口/DPR/屏幕方向，setTouchEmulationEnabled
 * 打开真实触摸，Network.setUserAgentOverride 换 iOS Safari / Android Chrome / 微信 UA。
 * 流程全部用 Input.dispatchTouchEvent 发真实触摸，Runtime.evaluate click 仅作兜底并标注。
 *
 * 用法：
 *   node tools/_mobile_qa.mjs                          # 全部设备 × 横竖屏 + PWA
 *   node tools/_mobile_qa.mjs --device=iphone13        # 只跑 iPhone 13
 *   node tools/_mobile_qa.mjs --device=iphone13,pixel7 --orientation=landscape
 *   node tools/_mobile_qa.mjs --device=wechat          # 微信 MicroMessenger UA
 *   node tools/_mobile_qa.mjs --headful                # 有界面（调试用）
 *   node tools/_mobile_qa.mjs --list                   # 打印设备矩阵
 *
 * 产物：
 *   _shots_mobile/report.json   完整结构化结果（机器读）
 *   _shots_mobile/report.md     人读报告（首屏/进关截图、console、FPS、重叠、旋转、PWA）
 *   _shots_mobile/<device>/<orientation>/*.png
 *
 * 只写 tools/、docs/、_shots_mobile/，不改 src。
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DEFAULT = join(ROOT, '_shots_mobile');

const EDGE = [
  process.env.MQA_EDGE,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const pad2 = (n) => String(n).padStart(2, '0');
const log = (...a) => console.log('[qa-mobile]', ...a);

/* ------------------------------ CLI ------------------------------ */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
      else out[a.slice(2)] = '1';
    }
  }
  return out;
}
const ARG = parseArgs(process.argv.slice(2));
const CFG = {
  device: (ARG.device || 'all').toLowerCase(),
  orientation: (ARG.orientation || 'both').toLowerCase(),
  base: (ARG.base || process.env.MQA_BASE || 'http://127.0.0.1:8137').replace(/\/+$/, ''),
  out: ARG.out ? resolve(ROOT, ARG.out) : OUT_DEFAULT,
  port: Number(ARG.port || 9350),
  headless: ARG.headful !== '1' && ARG.headless !== '0',
  skipPwa: ARG['skip-pwa'] === '1',
  skipGamepad: ARG['skip-gamepad'] === '1',
  strict: ARG.strict === '1',
  timeout: Number(ARG.timeout || 150000),
  only: (ARG.only || '').split(',').map((s) => s.trim()).filter(Boolean),
};

/* --------------------------- 设备矩阵 --------------------------- */
const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
  wechat: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x1800312c) NetType/WIFI Language/zh_CN',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
};

/** 设备基准尺寸按「竖屏」书写，横屏自动交换宽高 */
const DEVICES = [
  { id: 'iphone-se', label: 'iPhone SE', base: [375, 667], dpr: 2, ua: UA.ios, platform: 'iPhone', kind: 'iphone' },
  { id: 'iphone13', label: 'iPhone 13', base: [390, 844], dpr: 3, ua: UA.ios, platform: 'iPhone', kind: 'iphone' },
  { id: 'pixel7', label: 'Pixel 7', base: [412, 915], dpr: 2.625, ua: UA.android, platform: 'Linux armv8l', kind: 'android' },
  { id: 'ipad', label: 'iPad', base: [1024, 768], dpr: 2, ua: UA.ipad, platform: 'iPad', kind: 'ipad' },
  { id: 'fold', label: '折叠屏', base: [717, 512], dpr: 2, ua: UA.android, platform: 'Linux armv8l', kind: 'android' },
  { id: 'wechat', label: '微信 WebView (iPhone 13)', base: [390, 844], dpr: 3, ua: UA.wechat, platform: 'iPhone', kind: 'wechat' },
  { id: 'desktop', label: '桌面 1280x800', base: [1280, 800], dpr: 1, ua: UA.desktop, platform: 'Win32', kind: 'desktop' },
];

function orientationDims(dev, orientation) {
  const long = Math.max(dev.base[0], dev.base[1]);
  const short = Math.min(dev.base[0], dev.base[1]);
  return orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}
function selectedDevices() {
  if (CFG.device === 'all') return DEVICES;
  const ids = CFG.device.split(',').map((s) => s.trim()).filter(Boolean);
  const list = DEVICES.filter((d) => ids.includes(d.id));
  const unknown = ids.filter((id) => !DEVICES.some((d) => d.id === id));
  if (unknown.length) throw new Error('未知设备: ' + unknown.join(', ') + '（可选: ' + DEVICES.map((d) => d.id).join(', ') + ', all）');
  return list;
}
function selectedOrientations() {
  if (CFG.orientation === 'both' || CFG.orientation === 'all') return ['landscape', 'portrait'];
  if (CFG.orientation === 'landscape' || CFG.orientation === 'portrait') return [CFG.orientation];
  throw new Error('未知方向: ' + CFG.orientation);
}
function makeCases() {
  const cases = [];
  for (const dev of selectedDevices()) {
    for (const orientation of selectedOrientations()) {
      if (dev.kind === 'desktop' && orientation !== 'landscape') continue;
      const id = dev.id + ':' + orientation;
      if (CFG.only.length && !CFG.only.includes(id)) continue;
      cases.push({ dev, orientation, id });
    }
  }
  return cases;
}

/* --------------------------- 端口 / 浏览器 --------------------------- */
async function freePort(start, tries = 60) {
  for (let p = start; p < start + tries; p++) {
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('从 ' + start + ' 起找不到空闲端口');
}

function metricsParams(dims, dpr, orientation, dev) {
  const mobile = !dev || dev.kind !== 'desktop';
  return {
    width: dims.w,
    height: dims.h,
    deviceScaleFactor: dpr,
    mobile,
    screenWidth: dims.w,
    screenHeight: dims.h,
    screenOrientation: {
      type: orientation === 'landscape' ? 'landscapePrimary' : 'portraitPrimary',
      angle: mobile && orientation === 'landscape' ? 90 : 0,
    },
  };
}

function uaMetadata(dev) {
  const ios = dev.kind === 'iphone' || dev.kind === 'ipad' || dev.kind === 'wechat';
  const desktop = dev.kind === 'desktop';
  const brands = ios
    ? []
    : [
        { brand: 'Not.A/Brand', version: '24' },
        { brand: 'Chromium', version: '127' },
        { brand: 'Google Chrome', version: '127' },
      ];
  return {
    brands,
    fullVersionList: ios
      ? []
      : [
          { brand: 'Not.A/Brand', version: '24.0.0.0' },
          { brand: 'Chromium', version: '127.0.0.0' },
          { brand: 'Google Chrome', version: '127.0.0.0' },
        ],
    platform: desktop ? 'Windows' : ios ? 'iOS' : 'Android',
    platformVersion: desktop ? '10.0.0' : ios ? '17.5.0' : '14.0.0',
    architecture: desktop ? 'x86' : '',
    model: desktop ? '' : ios ? (dev.kind === 'ipad' ? 'iPad' : 'iPhone') : dev.id === 'fold' ? 'SM-F946B' : 'Pixel 7',
    mobile: !desktop,
    bitness: '64',
  };
}

const BOOTSTRAP = String.raw`
(() => {
  if (window.__mqa) return;
  const norm = (s) => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
  };
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05;
  };
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const h = document.elementFromPoint(x, y);
    let tag = null;
    if (h) {
      tag = (h.id ? '#' + h.id : h.tagName.toLowerCase());
      if (typeof h.className === 'string' && h.className) tag += '.' + h.className.split(' ').filter(Boolean).slice(0, 2).join('.');
    }
    return { tag, self: !!(h && (h === el || el.contains(h))) };
  };
  const label = (el) => norm(el.getAttribute('data-hks-pad') || el.getAttribute('data-k') || el.getAttribute('aria-label') || el.innerText || el.textContent || el.id || '');
  const overlapArea = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    return w > 1 && h > 1 ? +(w * h).toFixed(0) : 0;
  };
  window.__mqa = {
    norm, rect, visible, hit, label,
    buttons() {
      const els = [...document.querySelectorAll('#overlay button, #overlay .btn')].filter(visible);
      return els.map((el) => {
        const r = rect(el);
        return { text: norm(el.innerText || el.textContent), cls: typeof el.className === 'string' ? el.className : '',
          x: +(r.x + r.w / 2).toFixed(1), y: +(r.y + r.h / 2).toFixed(1), rect: r, hit: hit(el) };
      });
    },
    click(pred) {
      const els = [...document.querySelectorAll('#overlay button, #overlay .btn')].filter(visible);
      const bs = this.buttons();
      const i = bs.findIndex(pred);
      if (i < 0 || !els[i]) return false;
      els[i].click();
      return true;
    },
    padControls() {
      return [...document.querySelectorAll('[data-hks-pad]')].filter(visible).map((el) => ({
        label: label(el), role: el.getAttribute('role') || el.tagName.toLowerCase(), rect: rect(el),
      }));
    },
    legacyPad() {
      return [...document.querySelectorAll('#touch button[data-k]')].filter(visible).map((el) => ({
        k: el.getAttribute('data-k'), label: label(el), rect: rect(el), x: +(rect(el).x + rect(el).w / 2).toFixed(1), y: +(rect(el).y + rect(el).h / 2).toFixed(1),
      }));
    },
    hints() {
      const pick = (sel, closeSel) => {
        const el = document.querySelector(sel);
        if (!el || !visible(el)) return null;
        const x = el.querySelector(closeSel);
        return { text: norm(el.innerText).slice(0, 200), rect: rect(el), close: x ? rect(x) : null };
      };
      return { a2hs: pick('.hks-a2hs.show', '.hks-a2hs-x'), install: pick('.hks-install.show', '.hks-install-x') };
    },
    scrollButton(pred) {
      const els = [...document.querySelectorAll('#overlay button, #overlay .btn')].filter(visible);
      const bs = this.buttons();
      const i = bs.findIndex(pred);
      if (i < 0 || !els[i]) return null;
      try { els[i].scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) {}
      return new Promise((resolve) => setTimeout(() => {
        const r = rect(els[i]);
        resolve({ x: +(r.x + r.w / 2).toFixed(1), y: +(r.y + r.h / 2).toFixed(1), rect: r });
      }, 240));
    },
    dialogueState() {
      const g = window.__game;
      const btn = document.querySelector('[data-hks-pad="continue"]');
      const bs = btn && visible(btn) ? rect(btn) : null;
      return { active: !!(g && g.dialogue && g.dialogue.active), state: g && g.state, stage: !!(g && g.stage), continueBtn: bs ? { rect: bs, x: +(bs.x + bs.w / 2).toFixed(1), y: +(bs.y + bs.h / 2).toFixed(1) } : null };
    },
    settingsInfo() {
      const overlay = document.getElementById('overlay');
      if (!overlay) return null;
      const groups = [...overlay.querySelectorAll('.set-group')].map((el) => ({
        g: el.getAttribute('data-g') || '', title: norm((el.querySelector('.set-group-title') || {}).textContent || ''), rect: rect(el),
        rows: [...el.querySelectorAll('.btn')].map((b) => norm(b.innerText || b.textContent || '').slice(0, 40)),
      }));
      const foot = [...overlay.querySelectorAll('.set-foot-btn')].map((el) => ({ text: norm(el.innerText).slice(0, 40), rect: rect(el), visible: visible(el) }));
      const info = (el) => el ? { rect: rect(el), scrollH: el.scrollHeight, clientH: el.clientHeight, scrollTop: el.scrollTop, scrollable: el.scrollHeight > el.clientHeight + 2, overflowY: getComputedStyle(el).overflowY } : null;
      return {
        groups, foot, vh: innerHeight, vw: innerWidth,
        panel: info(overlay.querySelector('.panel')),
        grid: info(overlay.querySelector('.set-grid')),
        text: norm(overlay.innerText).slice(0, 900),
        bodyOverflow: document.body ? getComputedStyle(document.body).overflowY : null,
        docOverflow: getComputedStyle(document.documentElement).overflowY,
      };
    },
    padInputTargets() {
      const els = [...document.querySelectorAll('[data-hks-pad]')].filter(visible);
      const center = (el) => { const r = rect(el); return { x: +(r.x + r.w / 2).toFixed(1), y: +(r.y + r.h / 2).toFixed(1), rect: r }; };
      const stick = els.find((el) => el.getAttribute('data-hks-pad') === 'stick');
      const shoot = els.find((el) => el.getAttribute('data-hks-pad') === 'shoot');
      return { stick: stick ? center(stick) : null, shoot: shoot ? center(shoot) : null, viewport: { w: innerWidth, h: innerHeight } };
    },
    layout() {
      const g = window.__game || null;
      const vw = innerWidth, vh = innerHeight;
      const de = document.documentElement;
      const canvas = document.querySelector('#wrap canvas') || document.querySelector('canvas');
      const cr = rect(canvas);
      const wrap = rect(document.getElementById('wrap'));
      const letterbox = cr ? { left: cr.x, right: +(vw - cr.right).toFixed(1), top: cr.y, bottom: +(vh - cr.bottom).toFixed(1) } : null;
      const hud = document.getElementById('hud');
      const overlay = document.getElementById('overlay');
      const hudEls = [];
      for (const sel of ['#hud .hud-left', '#hud .hud-mid', '#hud .hud-right', '#lives', '#powerBar', '#timer', '#stageName', '#settingsBtn', '#bossBar']) {
        const el = document.querySelector(sel);
        if (el && visible(el)) hudEls.push({ sel, rect: rect(el) });
      }
      const padEls = [...document.querySelectorAll('[data-hks-pad]')].filter(visible);
      const controls = padEls.map((el) => ({ label: label(el), rect: rect(el) }));
      const padHudOverlaps = [], padSelfOverlaps = [];
      for (let i = 0; i < controls.length; i++) {
        const c = controls[i];
        c.outOfViewport = c.rect.x < -0.5 || c.rect.y < -0.5 || c.rect.right > vw + 0.5 || c.rect.bottom > vh + 0.5;
        for (const h of hudEls) { const a = overlapArea(c.rect, h.rect); if (a) padHudOverlaps.push({ pad: c.label, hud: h.sel, area: a }); }
        for (let j = i + 1; j < controls.length; j++) { const a = overlapArea(c.rect, controls[j].rect); if (a) padSelfOverlaps.push({ a: c.label, b: controls[j].label, area: a }); }
      }
      const legacyEls = [...document.querySelectorAll('#touch button[data-k]')].filter(visible);
      const legacy = legacyEls.map((el) => ({ k: el.getAttribute('data-k'), rect: rect(el) }));
      const legacyHudOverlaps = [];
      for (const c of legacy) for (const h of hudEls) { const a = overlapArea(c.rect, h.rect); if (a) legacyHudOverlaps.push({ pad: c.k, hud: h.sel, area: a }); }
      let safeRules = 0;
      for (const sh of document.styleSheets) {
        try { for (const rule of sh.cssRules) { if ((rule.cssText || '').includes('safe-area-inset')) safeRules++; } } catch (e) {}
      }
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);pointer-events:none;';
      (document.body || de).appendChild(probe);
      const pcs = getComputedStyle(probe);
      const env = { top: pcs.paddingTop, right: pcs.paddingRight, bottom: pcs.paddingBottom, left: pcs.paddingLeft };
      probe.remove();
      const vpMeta = document.querySelector('meta[name="viewport"]');
      const overlayVisible = overlay ? !overlay.classList.contains('hidden') : false;
      return {
        url: location.href, title: document.title, lang: de.lang || '',
        vw, vh, dpr: +devicePixelRatio.toFixed(3),
        visual: visualViewport ? { w: +visualViewport.width.toFixed(1), h: +visualViewport.height.toFixed(1), scale: +visualViewport.scale.toFixed(2) } : null,
        screen: { w: screen.width, h: screen.height, orient: (screen.orientation && screen.orientation.type) || '', angle: (screen.orientation && screen.orientation.angle) || 0 },
        doc: { scrollW: de.scrollWidth, scrollH: de.scrollHeight, bodyW: document.body ? document.body.scrollWidth : 0, bodyH: document.body ? document.body.scrollHeight : 0, overflowX: de.scrollWidth > vw + 0.5, overflowY: de.scrollHeight > vh + 0.5 },
        root: (() => { const b = document.body; const hs = getComputedStyle(de); const bs = b ? getComputedStyle(b) : null; return { html: rect(de), body: b ? rect(b) : null, htmlDisplay: hs.display, htmlPos: hs.position, bodyDisplay: bs ? bs.display : null, bodyPos: bs ? bs.position : null, htmlPad: hs.padding, bodyMar: bs ? bs.margin : null, bodyW: bs ? bs.width : null, scroll: [scrollX, scrollY], vvOff: visualViewport ? [visualViewport.offsetLeft, visualViewport.offsetTop, visualViewport.pageLeft, visualViewport.pageTop] : null }; })(),
        state: g ? g.state : null, page: g ? g._page : null, bootDone: !!(g && g._bootDone), lang2: g ? g.lang : null,
        scale: parseFloat(getComputedStyle(de).getPropertyValue('--s')) || null,
        canvas: cr, wrap, letterbox,
        centered: !!(cr && letterbox && Math.abs(letterbox.left - letterbox.right) <= 2 && Math.abs(letterbox.top - letterbox.bottom) <= 2),
        fits: !!(cr && cr.w <= vw + 1 && cr.h <= vh + 1),
        hud: { exists: !!hud, hidden: hud ? hud.classList.contains('hidden') : null, rect: rect(hud), els: hudEls },
        overlay: {
          hidden: !overlayVisible, panel: overlayVisible ? rect(overlay.querySelector('.panel')) : null,
          screenMode: overlay ? overlay.classList.contains('screen-mode') : null,
          text: overlayVisible ? norm(overlay.innerText).slice(0, 600) : '',
        },
        pad: {
          selector: '[data-hks-pad]', implemented: padEls.length > 0, count: controls.length,
          controls, hudOverlaps: padHudOverlaps, selfOverlaps: padSelfOverlaps,
          outOfViewport: controls.filter((c) => c.outOfViewport).map((c) => c.label),
          legacy: { count: legacy.length, controls: legacy, hudOverlaps: legacyHudOverlaps },
        },
        safeArea: {
          env, cssRuleCount: safeRules,
          viewportFit: vpMeta ? (/viewport-fit\s*=\s*cover/.test(vpMeta.content) ? 'cover' : 'missing') : 'no-meta',
          meta: vpMeta ? vpMeta.content : null,
        },
        rotateHint: (() => { const el = document.querySelector('.rotate-hint'); return { exists: !!el, display: el ? getComputedStyle(el).display : null, visible: el ? visible(el) : false }; })(),
        media: { coarse: matchMedia('(pointer: coarse)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches, hoverNone: matchMedia('(hover: none)').matches, portrait: matchMedia('(orientation: portrait)').matches },
        game: g ? { state: g.state, difficulty: g.difficulty, char: g.char, levelIndex: g.levelIndex, paused: g.state === 'paused' } : null,
      };
    },
    fpsProbe(ms) {
      return new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = (t) => {
          n++;
          if (t - t0 < ms) requestAnimationFrame(tick);
          else resolve({ frames: n, ms: +(t - t0).toFixed(1), fps: +(n * 1000 / (t - t0)).toFixed(1) });
        };
        requestAnimationFrame(tick);
      });
    },
    inputState() {
      const g = window.__game;
      if (!g || !g.input) return null;
      const inp = g.input;
      return { held: [...(inp.held ? inp.held.keys() : [])], left: !!inp.down('left'), right: !!inp.down('right'), shoot: !!inp.down('shoot'), jump: !!inp.down('jump'), pause: !!inp.down('pause'),
        moveX: typeof inp.moveX === 'number' ? +inp.moveX.toFixed(2) : null, moveY: typeof inp.moveY === 'number' ? +inp.moveY.toFixed(2) : null };
    },
  };
})();
`;

const GAMEPAD_MOCK = String.raw`
(() => {
  try {
    const mk = (i) => ({
      id: 'MQA Mock Pad (' + i + ')', index: i, connected: true, mapping: 'standard',
      timestamp: performance.now(), axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    });
    const pads = [mk(0)];
    const calls = { count: 0, lastAt: 0 };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: function getGamepads() { calls.count++; calls.lastAt = performance.now(); return pads; },
    });
    window.__mqaGamepad = { pads, calls, mock: true };
  } catch (e) {
    window.__mqaGamepad = { mock: false, error: String(e) };
  }
})();
`;

/* --------------------------- CDP harness --------------------------- */
async function launchBrowser(opts) {
  if (!EDGE) throw new Error('找不到 Edge（msedge.exe）；可用环境变量 MQA_EDGE 指定路径');
  const profile = mkdtempSync(join(tmpdir(), 'mqa-edge-'));
  const args = [
    ...(opts.headless ? ['--headless=new'] : []),
    '--disable-gpu',
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-extensions',
    '--disable-sync', '--disable-default-apps', '--disable-background-networking',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--window-size=' + Math.max(900, opts.width) + ',' + Math.max(700, opts.height),
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + opts.port,
    'about:blank',
  ];
  const proc = spawn(EDGE, args, { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
  let exited = false;
  proc.on('exit', () => { exited = true; });

  const target = await (async () => {
    for (let i = 0; i < 120; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:' + opts.port + '/json/list')).json();
        const p = list.find((t) => t.type === 'page');
        if (p && p.webSocketDebuggerUrl) return p;
      } catch (e) {}
      await sleep(200);
    }
    throw new Error('Edge DevTools 端口无响应: ' + opts.port);
  })();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP WebSocket 连接失败'));
  });

  let closed = false;
  const pending = new Map();
  const failAll = (why) => {
    if (closed) return;
    closed = true;
    for (const [, p] of pending) p.rej(new Error('浏览器连接中断: ' + why));
    pending.clear();
  };
  ws.onclose = (ev) => failAll('close ' + ev.code);
  ws.onerror = () => failAll('socket error');
  proc.on('exit', (code, sig) => failAll('process exit ' + code + '/' + sig));

  let seq = 0;
  const rec = { errors: [], warns: [], httpBad: [], netFails: [], logs: [], consoleAll: [] };
  const requests = new Map();

  const send = (method, params = {}, opt = {}) => new Promise((res, rej) => {
    const id = ++seq;
    const timeoutMs = opt.timeoutMs ?? 20000;
    const timer = setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      rej(new Error('CDP 超时(' + timeoutMs + 'ms): ' + method));
    }, timeoutMs);
    pending.set(id, {
      res: (v) => { clearTimeout(timer); res(v); },
      rej: (e) => { clearTimeout(timer); rej(e); },
    });
    try { ws.send(JSON.stringify({ id, method, params })); }
    catch (e) { clearTimeout(timer); pending.delete(id); rej(e); }
  });

  ws.onmessage = (m) => {
    let d;
    try { d = JSON.parse(m.data); } catch (e) { return; }
    if (d.id && pending.has(d.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) p.rej(new Error('CDP ' + d.method + ': ' + JSON.stringify(d.error)));
      else p.res(d.result);
      return;
    }
    switch (d.method) {
      case 'Runtime.exceptionThrown': {
        const x = d.params.exceptionDetails || {};
        const txt = String((x.exception && x.exception.description) || x.text || '');
        T.record('exception', txt.split('\n').slice(0, 4).join(' | '));
        break;
      }
      case 'Runtime.consoleAPICalled': {
        const args = d.params.args || [];
        const txt = args.map((a) => (a.value !== undefined ? String(a.value) : a.description || '')).join(' ').slice(0, 600);
        rec.consoleAll.push({ type: d.params.type, text: txt });
        if (d.params.type === 'error') T.record('console.error', txt);
        else if (d.params.type === 'warning') T.record('console.warn', txt);
        break;
      }
      case 'Log.entryAdded': {
        const e = d.params.entry || {};
        rec.logs.push({ level: e.level, text: e.text, url: e.url });
        if (e.level === 'error') T.record('log.error', (e.text || '') + (e.url ? ' @' + e.url : ''));
        else if (e.level === 'warning') T.record('log.warn', e.text || '');
        break;
      }
      case 'Network.requestWillBeSent': {
        const q = d.params.request || {};
        requests.set(d.params.requestId, q.url || '');
        break;
      }
      case 'Network.responseReceived': {
        const r = d.params.response || {};
        if ((r.status || 0) >= 400) {
          T.recordHttpBad({ status: r.status, url: r.url, type: d.params.type, favicon: /favicon\.ico/.test(r.url || '') });
        }
        break;
      }
      case 'Network.loadingFailed': {
        const p = d.params;
        const url = requests.get(p.requestId) || '?';
        if (/^(data|blob|chrome-extension):/.test(url)) break;
        rec.netFails.push({ url, error: p.errorText, canceled: !!p.canceled, type: p.type });
        break;
      }
      case 'Inspector.targetCrashed':
        T.record('crash', 'renderer target crashed');
        break;
      default:
        break;
    }
  };

  const phase = { name: 'boot' };
  const T = {
    port: opts.port, proc, profile, rec, requests,
    dpr: opts.dpr, viewport: { w: opts.width, h: opts.height }, orientation: opts.orientation,
    get phase() { return phase.name; },
    setPhase(name) { phase.name = name; },
    record(kind, text) {
      const item = { phase: phase.name, kind, text: String(text || '').slice(0, 600), t: Date.now() };
      if (kind === 'console.warn' || kind === 'log.warn') rec.warns.push(item);
      else rec.errors.push(item);
    },
    recordHttpBad(item) { rec.httpBad.push(Object.assign({ phase: phase.name, t: Date.now() }, item)); },
    send,
    async eval(expr, opt = {}) {
      const r = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: opt.awaitPromise !== false,
        returnByValue: true,
        userGesture: true,
      }, { timeoutMs: opt.timeoutMs ?? 20000 });
      if (r.exceptionDetails) {
        const x = r.exceptionDetails;
        const msg = String((x.exception && x.exception.description) || x.text || 'unknown');
        if (opt.soft) return undefined;
        throw new Error('页面求值异常: ' + msg.split('\n')[0] + '\n>>> ' + String(expr).slice(0, 240));
      }
      return r.result ? r.result.value : undefined;
    },
    async probe(expr, opt = {}) {
      try { return { ok: true, value: await T.eval(expr, Object.assign({}, opt, { soft: true })) }; }
      catch (e) { return { ok: false, error: String(e.message || e) }; }
    },
    async waitFor(expr, timeout = 8000, step = 100) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try {
          if (await T.eval(expr, { awaitPromise: false, soft: true })) return true;
        } catch (e) {}
        await sleep(step);
      }
      return false;
    },
    async nav(url, timeout = 25000) {
      await send('Page.navigate', { url }, { timeoutMs: timeout });
      await sleep(60);
    },
    async reload() {
      await send('Page.reload', { ignoreCache: true });
      await sleep(80);
    },
    async shot(file) {
      mkdirSync(dirname(file), { recursive: true });
      const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }, { timeoutMs: 20000 });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async touchTap(x, y, opt = {}) {
      const px = +(+x).toFixed(1), py = +(+y).toFixed(1);
      const id = opt.id || 1;
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py, id, radiusX: 8, radiusY: 8, force: 1 }] });
      await sleep(opt.holdMs ?? 45);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(opt.settle ?? 140);
      return { x: px, y: py };
    },
    async touchHold(points, ms = 400) {
      const pts = points.map((p, i) => ({ x: +(+p.x).toFixed(1), y: +(+p.y).toFixed(1), id: p.id || i + 1, radiusX: 10, radiusY: 10, force: 1 }));
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
      await sleep(ms);
      return pts;
    },
    async touchRelease() {
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(120);
    },
    async setMetrics(dims, orientation) {
      await send('Emulation.setDeviceMetricsOverride', metricsParams(dims, opts.dpr, orientation, opts.dev));
      const ok = await T.waitFor('innerWidth === ' + dims.w + ' && innerHeight === ' + dims.h, 8000);
      await sleep(650);
      T.viewport = { w: dims.w, h: dims.h };
      T.orientation = orientation;
      return ok;
    },
    async close() {
      try { ws.close(); } catch (e) {}
      try { proc.kill(); } catch (e) {}
      await sleep(250);
      try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    },
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', metricsParams({ w: opts.width, h: opts.height }, opts.dpr, opts.orientation, opts.dev));
  if (opts.dev && opts.dev.kind === 'desktop') {
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  } else {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  await send('Network.setUserAgentOverride', {
    userAgent: opts.ua,
    acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.6',
    platform: opts.platform,
    userAgentMetadata: opts.metadata,
  });
  try { await send('Emulation.setLocaleOverride', { locale: 'zh-CN' }); } catch (e) {}
  try { await send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' }); } catch (e) {}

  await send('Page.addScriptToEvaluateOnNewDocument', { source: BOOTSTRAP });
  if (!opts.skipGamepad) await send('Page.addScriptToEvaluateOnNewDocument', { source: GAMEPAD_MOCK });

  return T;
}

/* --------------------------- 页面操作助手 --------------------------- */
function reSrc(re) {
  if (re instanceof RegExp) return 'new RegExp(' + JSON.stringify(re.source) + ', ' + JSON.stringify(re.flags || '') + ')';
  return 'new RegExp(' + JSON.stringify(String(re)) + ')';
}
const GAME_EXPR = '(window.__game)';

const waitText = (T, re, timeout = 8000) =>
  T.waitFor('(() => { const el = document.getElementById("overlay"); return !!el && !el.classList.contains("hidden") && ' + reSrc(re) + '.test(el.innerText || ""); })()', timeout);

async function waitForButton(T, pred, timeout = 8000) {
  const expr = '(() => { const b = window.__mqa && window.__mqa.buttons().find(' + pred + '); return b || null; })()';
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const b = await T.eval(expr, { soft: true, awaitPromise: false });
    if (b) return b;
    await sleep(120);
  }
  return null;
}

async function pressButton(T, pred, label, waitFn, opts = {}) {
  const t0 = Date.now();
  let b = await waitForButton(T, pred, opts.findTimeout ?? 8000);
  if (!b) return { label, ok: false, error: '按钮未出现', ms: Date.now() - t0 };
  let scrolled = null;
  const outside = (p) => p.x < 1 || p.y < 1 || p.x > T.viewport.w - 1 || p.y > T.viewport.h - 1;
  if (outside(b)) {
    const s = await T.eval('window.__mqa.scrollButton(' + pred + ')', { soft: true });
    if (s && s.x != null) {
      scrolled = { from: { x: b.x, y: b.y }, to: { x: s.x, y: s.y }, before: b.rect, after: s.rect };
      b = Object.assign({}, b, { x: s.x, y: s.y, rect: s.rect });
      await sleep(180);
    }
  }
  await T.touchTap(b.x, b.y, { holdMs: 50, settle: 160 });
  let ok = false;
  try { ok = await waitFn(); } catch (e) {}
  let mode = 'touch';
  if (!ok && opts.fallback !== false) {
    const clicked = await T.eval('window.__mqa.click(' + pred + ')', { soft: true, awaitPromise: false });
    if (clicked) {
      try { ok = await waitFn(); } catch (e) {}
      mode = 'eval-click-fallback';
    }
    if (!ok) mode = 'touch+fallback-failed';
  }
  return {
    label, ok, mode, at: { x: b.x, y: b.y }, scrolled,
    hitSelf: b.hit ? b.hit.self : null,
    hitTag: b.hit ? b.hit.tag : null,
    occluded: !!(b.hit && !b.hit.self),
    ms: Date.now() - t0,
  };
}

async function pressSettingsBtn(T) {
  const t0 = Date.now();
  // 触屏端 HUD 右上齿轮被 mobile.css 隐藏，暂停入口改为虚拟手柄的 pause 键；两者都探，优先真实触摸。
  const probe = '(v) => { const el = v.__mqa; if (!el) return null; const pick = (target, via) => { const r = el.rect(target); const h = el.hit(target); return { via, x: +(r.x + r.w / 2).toFixed(1), y: +(r.y + r.h / 2).toFixed(1), hitSelf: h.self, hitTag: h.tag, rect: r }; }; const gear = document.getElementById("settingsBtn"); if (gear && el.visible(gear)) return pick(gear, "hud"); const pad = document.querySelector(\'[data-hks-pad="pause"]\'); if (pad && el.visible(pad)) return pick(pad, "pad-pause"); return null; }';
  const b = await T.eval('(() => { const f = ' + probe + '; return f(window); })()', { soft: true, awaitPromise: false });
  if (!b) return { label: 'settingsBtn|pad-pause', ok: false, error: '暂停入口不存在或不可见（HUD 齿轮与虚拟手柄 pause 均不可用）', ms: Date.now() - t0 };
  await T.touchTap(b.x, b.y, { holdMs: 50, settle: 180 });
  let ok = await waitText(T, /游戏已暂停/, 5000);
  let mode = b.via === 'pad-pause' ? 'pad-pause' : 'hud';
  if (!ok) {
    // 再补一次触摸（首次可能落在 HUD 动画/布局过渡中）
    await T.touchTap(b.x, b.y, { holdMs: 60, settle: 220 });
    ok = await waitText(T, /游戏已暂停/, 3000);
    if (ok) mode += '+retry';
  }
  if (!ok) {
    const clicked = await T.eval('(() => { const el = (window.__mqa.visible(document.getElementById("settingsBtn")) && document.getElementById("settingsBtn")) || document.querySelector(\'[data-hks-pad="pause"]\'); if (!el) return false; el.click(); return true; })()', { soft: true, awaitPromise: false });
    if (clicked) {
      ok = await waitText(T, /游戏已暂停/, 4000);
      mode = 'eval-click-fallback';
    }
  }
  return { label: b.via === 'pad-pause' ? 'pad-pause' : 'settingsBtn', ok, mode, at: b, occluded: b.hitSelf === false, ms: Date.now() - t0 };
}

/** 关闭平台层引导（A2HS 弹层 / 底部安装条），使用真实触摸，记录关闭方式 */
async function dismissHints(T, viewport, opts = {}) {
  const skipInstall = !!opts.skipInstall;
  let a2hs = null, install = null, attempts = 0;
  for (let i = 0; i < 3; i++) {
    const h = await T.eval('window.__mqa.hints()', { soft: true, awaitPromise: false });
    if (!h || (!h.a2hs && (!h.install || skipInstall))) break;
    if (h.a2hs) {
      const rec = a2hs || (a2hs = { present: true, text: h.a2hs.text, closed: false, via: null });
      if (h.a2hs.close) {
        const c = h.a2hs.close;
        await T.touchTap(c.x + c.w / 2, c.y + c.h / 2, { holdMs: 45, settle: 210 });
        rec.via = 'x';
      } else {
        await T.touchTap(6, Math.round(viewport.h * 0.5), { holdMs: 45, settle: 210 });
        rec.via = 'backdrop';
      }
      attempts++;
      let after = await T.eval('window.__mqa.hints()', { soft: true, awaitPromise: false });
      rec.closed = !(after && after.a2hs);
      if (!rec.closed) {
        await T.touchTap(6, Math.round(viewport.h * 0.5), { holdMs: 45, settle: 230 });
        rec.via = (rec.via || '') + '+backdrop';
        after = await T.eval('window.__mqa.hints()', { soft: true, awaitPromise: false });
        rec.closed = !(after && after.a2hs);
      }
    }
    if (h.install && !skipInstall) {
      const rec = install || (install = { present: true, text: h.install.text, closed: false });
      if (h.install.close) {
        const c = h.install.close;
        await T.touchTap(c.x + c.w / 2, c.y + c.h / 2, { holdMs: 45, settle: 190 });
        attempts++;
        const after = await T.eval('window.__mqa.hints()', { soft: true, awaitPromise: false });
        rec.closed = !(after && after.install);
      }
    }
  }
  return { a2hs, install, attempts, touched: !!(a2hs || install) };
}

/** 设置页 footer 在首屏外时：真实触摸上滑面板，验证能否滚动到达 */
async function probeSettingsScroll(T, viewport, S) {
  const out = { ok: false };
  const panel = S && S.panel && S.panel.rect;
  if (!panel) return Object.assign(out, { note: 'panel rect 缺失' });
  const x = +(panel.x + panel.w / 2).toFixed(1);
  const y0 = +Math.min(panel.bottom - 24, viewport.h - 30).toFixed(1);
  const y1 = +Math.max(panel.y + 24, y0 - Math.min(240, panel.h * 0.7)).toFixed(1);
  out.from = { x, y: y0 };
  out.to = { x, y: y1 };
  try {
    await T.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0, id: 1, radiusX: 10, radiusY: 10, force: 1 }] });
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const y = +(y0 + (y1 - y0) * (i / steps)).toFixed(1);
      await T.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1, radiusX: 10, radiusY: 10, force: 1 }] });
      await sleep(28);
    }
    await T.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(650);
    const after = await T.eval('window.__mqa.settingsInfo()', { soft: true, awaitPromise: false });
    out.after = after ? { panel: after.panel, foot: after.foot, vh: after.vh } : null;
    const back = after && (after.foot || []).find((f2) => /返回/.test(f2.text));
    out.afterFoot = back ? back.rect : null;
    out.ok = !!(back && back.rect && back.rect.y < after.vh - 2 && back.rect.bottom <= after.vh + 1);
    if (after && after.panel) out.scrollTop = after.panel.scrollTop;
  } catch (e) {
    out.error = String((e && e.message) || e);
    try { await T.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } catch (e2) {}
  }
  return out;
}

function settingsChecks(S, isTouch, phase, scroll) {
  const out = [];
  if (!S) { out.push({ sev: 'warn', code: 'settings-missing', phase, msg: '设置页 DOM 读取失败' }); return out; }
  const dev = (S.groups || []).find((g) => g.g === 'device');
  const opText = dev ? dev.rows.join(' | ') : '';
  if (isTouch) {
    if (!dev) out.push({ sev: 'fail', code: 'settings-op-group-missing', phase, msg: '触屏设备设置页缺少「操作」组（.set-group[data-g=device]）' });
    else {
      for (const [name, re] of [['触屏方案', /触屏方案/], ['触屏震动', /触屏震动/], ['自定义按键布局', /自定义按键布局/], ['全屏', /全屏/]]) {
        if (!re.test(opText)) out.push({ sev: 'warn', code: 'settings-op-item-missing', phase, msg: '「操作」组缺少「' + name + '」' });
      }
    }
  } else if (dev) {
    out.push({ sev: 'fail', code: 'settings-op-group-desktop', phase, msg: '桌面（无触屏/无手柄）设置页不应出现「操作」组' });
  }
  const foot = (S.foot || []).filter((f) => f.visible);
  const back = foot.find((f) => /返回/.test(f.text)) || null;
  const scrollable = !!((S.panel && S.panel.scrollable) || (S.grid && S.grid.scrollable));
  if (!back) out.push({ sev: 'fail', code: 'settings-back-missing', phase, msg: '设置页未见可见的「返回」按钮' });
  else if (back.rect.bottom > S.vh + 1 || back.rect.y >= S.vh - 2) {
    if (scrollable && scroll && scroll.ok) {
      out.push({ sev: 'warn', code: 'settings-footer-below-fold', phase, msg: '「' + back.text + '」首屏在视口外 y=' + back.rect.y + '，触摸上滑后可达 y=' + (scroll.afterFoot ? scroll.afterFoot.y : '?') + '（面板可滚动，建议压缩行高或固定 footer）' });
    } else {
      out.push({ sev: 'fail', code: 'settings-footer-below-fold', phase, msg: '「' + back.text + '」在视口外 y=' + back.rect.y + '（视口高 ' + S.vh + '，面板可滚动=' + scrollable + '，触摸上滑可达=' + !!(scroll && scroll.ok) + '）' });
    }
  }
  return out;
}

/** 推进开场对话：优先触摸虚拟手柄「继续」，没有再点覆盖层中心（pointerdown → advance） */
async function driveDialogueToPlay(T, viewport, maxMs = 30000) {
  const t0 = Date.now();
  let centerTaps = 0, continueTaps = 0;
  let last = null;
  while (Date.now() - t0 < maxMs) {
    last = await T.eval('window.__mqa.dialogueState()', { soft: true, awaitPromise: false });
    if (last && last.state === 'play' && last.stage) {
      return { ok: true, taps: centerTaps + continueTaps, centerTaps, continueTaps, method: continueTaps ? 'hks-continue(touch)' : 'touch-center', ms: Date.now() - t0, last };
    }
    if (last && last.continueBtn) {
      await T.touchTap(last.continueBtn.x, last.continueBtn.y, { holdMs: 45, settle: 130 });
      continueTaps++;
    } else if (last && last.state === 'dialogue') {
      await T.touchTap(viewport.w / 2, viewport.h / 2, { holdMs: 40, settle: 110 });
      centerTaps++;
    } else {
      await sleep(180);
    }
  }
  return { ok: false, taps: centerTaps + continueTaps, centerTaps, continueTaps, ms: Date.now() - t0, last };
}

async function waitForHud(T, timeout = 3000) {
  return T.waitFor('(() => { const el = document.getElementById("hud"); if (!el) return false; const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && !el.classList.contains("hidden"); })()', timeout);
}

function compactLayout(L) {
  if (!L) return null;
  if (!L) return null;
  return {
    vw: L.vw, vh: L.vh, dpr: L.dpr, scale: L.scale, screen: L.screen,
    canvas: L.canvas, letterbox: L.letterbox, centered: L.centered, fits: L.fits,
    doc: L.doc, state: L.state, page: L.page,
    hud: { hidden: L.hud.hidden, rect: L.hud.rect },
    overlay: { hidden: L.overlay.hidden, panel: L.overlay.panel },
    pad: {
      implemented: L.pad.implemented, count: L.pad.count, controls: L.pad.controls,
      hudOverlaps: L.pad.hudOverlaps, selfOverlaps: L.pad.selfOverlaps, outOfViewport: L.pad.outOfViewport,
      legacy: L.pad.legacy,
    },
    safeArea: L.safeArea, rotateHint: L.rotateHint,
  };
}

function layoutIssues(L, expected, phase) {
  const out = [];
  if (!L) { out.push({ sev: 'fail', code: 'layout-missing', phase, msg: '布局读取失败' }); return out; }
  if (expected && (L.vw !== expected.w || L.vh !== expected.h)) {
    out.push({ sev: 'fail', code: 'viewport-size', phase, msg: '视口 ' + L.vw + 'x' + L.vh + '，预期 ' + expected.w + 'x' + expected.h });
  }
  if (L.canvas) {
    if (!L.fits) out.push({ sev: 'fail', code: 'canvas-overflow', phase, msg: '画布 ' + L.canvas.w + 'x' + L.canvas.h + ' 超出视口 ' + L.vw + 'x' + L.vh });
    if (!L.centered) out.push({ sev: 'warn', code: 'canvas-offcenter', phase, msg: '画布未居中 letterbox=' + JSON.stringify(L.letterbox) });
    const pct = L.vh ? +(L.canvas.h / L.vh * 100).toFixed(1) : 0;
    if (pct < 55) out.push({ sev: 'info', code: 'canvas-small', phase, msg: '画布仅占视口高度 ' + pct + '%（' + L.canvas.w + 'x' + L.canvas.h + '，竖屏 letterbox）' });
  }
  if (L.doc && L.doc.overflowX) out.push({ sev: 'warn', code: 'h-overflow', phase, msg: '页面水平溢出 ' + Math.round(L.doc.scrollW - L.vw) + 'px' });
  if (L.doc && L.doc.overflowY) out.push({ sev: 'warn', code: 'v-overflow', phase, msg: '页面垂直溢出 ' + Math.round(L.doc.scrollH - L.vh) + 'px' });
  if (L.overlay && L.overlay.panel) {
    const p = L.overlay.panel;
    if (p.x < -1 || p.y < -1 || p.right > L.vw + 1 || p.bottom > L.vh + 1) {
      out.push({ sev: 'warn', code: 'panel-out', phase, msg: '面板越界 x=' + p.x + ' y=' + p.y + ' w=' + p.w + ' h=' + p.h });
    }
  }
  if (L.pad && L.pad.implemented) {
    for (const o of L.pad.hudOverlaps || []) out.push({ sev: 'fail', code: 'pad-hud-overlap', phase, msg: '虚拟键「' + o.pad + '」与 ' + o.hud + ' 重叠 ' + o.area + 'px²' });
    for (const o of L.pad.selfOverlaps || []) out.push({ sev: 'fail', code: 'pad-self-overlap', phase, msg: '虚拟键「' + o.a + '」与「' + o.b + '」重叠 ' + o.area + 'px²' });
    for (const k of L.pad.outOfViewport || []) out.push({ sev: 'fail', code: 'pad-out-of-viewport', phase, msg: '虚拟键「' + k + '」超出视口' });
  }
  if (L.safeArea && L.safeArea.viewportFit === 'missing') {
    out.push({ sev: 'warn', code: 'viewport-fit', phase, msg: 'viewport meta 缺少 viewport-fit=cover（刘海/安全区无法铺满）' });
  }
  return out;
}

async function probeMultiTouch(T, dir) {
  const out = { mode: 'none', ok: false };
  let targets = [];
  let mode = 'none';
  const pads = await T.eval('window.__mqa.padControls()', { soft: true, awaitPromise: false });
  if (Array.isArray(pads) && pads.length >= 2) {
    mode = 'hks-pad';
    targets = pads.slice(0, 2).map((p) => ({ label: p.label, x: +(p.rect.x + p.rect.w / 2).toFixed(1), y: +(p.rect.y + p.rect.h / 2).toFixed(1) }));
  } else {
    const legacy = await T.eval('window.__mqa.legacyPad()', { soft: true, awaitPromise: false });
    const left = (legacy || []).find((b) => b.k === 'left');
    const shoot = (legacy || []).find((b) => b.k === 'shoot');
    if (left && shoot) {
      mode = 'legacy';
      targets = [{ label: 'left', x: left.x, y: left.y }, { label: 'shoot', x: shoot.x, y: shoot.y }];
    }
  }
  if (!targets.length) {
    return Object.assign(out, { ok: true, mode: 'N/A', note: '未找到可见虚拟按键（data-hks-pad 未集成，legacy #touch 也没有可点按钮）' });
  }
  try {
    await T.touchHold(targets, 450);
    const held = await T.eval('window.__mqa.inputState()', { soft: true, awaitPromise: false });
    await T.shot(join(dir, '07-multi-touch.png'));
    await T.touchRelease();
    await sleep(420);
    const released = await T.eval('window.__mqa.inputState()', { soft: true, awaitPromise: false });
    out.mode = mode;
    out.targets = targets;
    out.held = held;
    out.released = released;
    out.ok = !!(held && ((held.held && held.held.length) || held.left || held.shoot));
    out.releasedOk = !(released && (released.left || released.shoot));
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  return out;
}

/** 摇杆 + 射击多指实测：触摸摇杆右推，再按住射击，读 window.__game.input.moveX/shot */
async function probePadInput(T, dir) {
  const out = { implemented: false, ok: false };
  const t = await T.eval('window.__mqa.padInputTargets()', { soft: true, awaitPromise: false });
  if (!t || !t.stick || !t.shoot) return Object.assign(out, { note: 'stick/shoot 未找到（data-hks-pad 未集成或当前方案非 stick）' });
  out.implemented = true;
  out.targets = { stick: t.stick, shoot: t.shoot };
  const vw = t.viewport.w, vh = t.viewport.h;
  const clamp = (x, y) => ({ x: +Math.min(Math.max(x, 2), vw - 2).toFixed(1), y: +Math.min(Math.max(y, 2), vh - 2).toFixed(1) });
  const s = clamp(t.stick.x, t.stick.y);
  const s2 = clamp(t.stick.x + 55, t.stick.y);
  const sh = clamp(t.shoot.x, t.shoot.y);
  const pt = (p, id) => ({ x: p.x, y: p.y, id, radiusX: 10, radiusY: 10, force: 1 });
  try {
    await T.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(s, 1)] });
    await sleep(80);
    await T.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(s2, 1)] });
    await sleep(130);
    out.stickOnly = await T.eval('window.__mqa.inputState()', { soft: true, awaitPromise: false });
    await T.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(s2, 1), pt(sh, 2)] });
    await sleep(190);
    out.held = await T.eval('window.__mqa.inputState()', { soft: true, awaitPromise: false });
    try { await T.shot(join(dir, '07-pad-input.png')); } catch (e) {}
    await T.touchRelease();
    await sleep(340);
    out.released = await T.eval('window.__mqa.inputState()', { soft: true, awaitPromise: false });
    out.ok = !!(out.held && out.held.moveX > 0.3 && out.held.shoot === true);
    out.releasedOk = !(out.released && (out.released.shoot || Math.abs(out.released.moveX || 0) > 0.2));
  } catch (e) {
    out.error = String((e && e.message) || e);
    try { await T.touchRelease(); } catch (e2) {}
  }
  return out;
}

/** 读虚拟摇杆写到 Input 的原始向量（_padStick，未经径向死区） */
async function readStickState(T) {
  return T.eval(`(() => {
    const g = window.__game, i = g && g.input, p = i && i._padStick, pad = g && g.pad;
    return {
      x: p ? +p.x.toFixed(3) : null, y: p ? +p.y.toFixed(3) : null,
      mag: p ? +Math.hypot(p.x, p.y).toFixed(3) : null,
      moveX: i ? +(i.moveX || 0).toFixed(3) : null, moveY: i ? +(i.moveY || 0).toFixed(3) : null,
      snap8: !!(pad && pad._settings && pad._settings.snap8),
    };
  })()`, { soft: true, awaitPromise: false });
}

/**
 * 摇杆「方向吸附 + 幅度保留」断言：半径 50%、方位 20°（右偏上）。
 * snap8=on 应吸附到水平轴（|y|≈0，模长≈0.5）；snap8=off 应保留原始方向（|y|≈0.17，模长≈0.5）。
 * 松手后 _padStick 必须回 0。
 */
async function probeStickSnap(T, dir, targets) {
  const out = { implemented: false, ok: false, expectedMag: 0.5, tolerance: 0.08 };
  if (!targets || !targets.stick || !targets.stick.rect) return out;
  const c = targets.stick;
  const R = Math.min(c.rect.w, c.rect.h) / 2;
  if (!(R > 8)) return out;
  out.implemented = true;
  out.stick = { center: { x: c.x, y: c.y }, radius: +R.toFixed(1) };
  const angle = 20 * Math.PI / 180;
  const frac = 0.5;
  const dx = Math.cos(angle) * R * frac, dy = -Math.sin(angle) * R * frac;
  out.point = { x: +(c.x + dx).toFixed(1), y: +(c.y + dy).toFixed(1), frac };
  const push = async (snap) => {
    const before = await T.eval(`(() => { const p = window.__game && window.__game.pad; if (!p || typeof p.setSetting !== "function") return null; p.setSetting("snap8", ${snap}); return { snap8: !!(p._settings && p._settings.snap8) }; })()`, { soft: true, awaitPromise: false });
    await sleep(90);
    const pt = (x, y, id) => ({ x, y, id, radiusX: 12, radiusY: 12, force: 1 });
    try {
      await T.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(c.x, c.y, 1)] });
      await sleep(90);
      await T.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [pt(c.x + dx, c.y + dy, 1)] });
      await sleep(190);
      const held = await readStickState(T);
      await T.touchRelease();
      await sleep(320);
      const released = await readStickState(T);
      return { settingApplied: !!(before && before.snap8 === snap), held, released };
    } catch (e) {
      try { await T.touchRelease(); } catch (e2) {}
      return { error: String((e && e.message) || e) };
    }
  };
  out.snapOn = await push(true);
  out.snapOff = await push(false);
  await T.eval(`(() => { const p = window.__game && window.__game.pad; if (p && p.setSetting) p.setSetting("snap8", true); })()`, { soft: true, awaitPromise: false }).catch(() => {});
  try { await T.shot(join(dir, "07-stick-snap.png")); } catch (e) {}
  const inRange = (m) => typeof m === "number" && Math.abs(m - 0.5) <= 0.08;
  const axisOk = (h) => h && (Math.abs(h.x) < 0.06 || Math.abs(h.y) < 0.06 || Math.abs(Math.abs(h.x) - Math.abs(h.y)) < 0.06);
  out.on = {
    magOk: inRange(out.snapOn && out.snapOn.held && out.snapOn.held.mag),
    moveOk: !!(out.snapOn && out.snapOn.held && Math.abs(out.snapOn.held.moveX) > 0.2),
    axisOk: axisOk(out.snapOn && out.snapOn.held),
    releasedOk: !!(out.snapOn && out.snapOn.released && out.snapOn.released.mag < 0.05),
  };
  out.off = {
    magOk: inRange(out.snapOff && out.snapOff.held && out.snapOff.held.mag),
    moveOk: !!(out.snapOff && out.snapOff.held && Math.abs(out.snapOff.held.moveX) > 0.2),
    analogOk: !!(out.snapOff && out.snapOff.held && Math.abs(out.snapOff.held.y) > 0.08),
    releasedOk: !!(out.snapOff && out.snapOff.released && out.snapOff.released.mag < 0.05),
  };
  out.ok = out.on.magOk && out.on.moveOk && out.on.axisOk && out.on.releasedOk && out.off.magOk && out.off.moveOk && out.off.analogOk && out.off.releasedOk;
  return out;
}

function stickSnapChecks(S) {
  const out = [];
  if (!S || !S.implemented) return [{ sev: "info", code: "stick-snap-na", phase: "stick-snap", msg: "虚拟摇杆未暴露（data-hks-pad stick 不存在），幅度/吸附断言 N/A" }];
  const on = S.on || {}, off = S.off || {};
  if (!on.magOk) out.push({ sev: "fail", code: "stick-mag", phase: "stick-snap", msg: "snap8=on 50% 推杆模长=" + JSON.stringify(S.snapOn && S.snapOn.held && S.snapOn.held.mag) + "，预期 0.5±0.08" });
  if (!off.magOk) out.push({ sev: "fail", code: "stick-mag", phase: "stick-snap", msg: "snap8=off 50% 推杆模长=" + JSON.stringify(S.snapOff && S.snapOff.held && S.snapOff.held.mag) + "，预期 0.5±0.08" });
  if (!on.moveOk) out.push({ sev: "fail", code: "stick-movex", phase: "stick-snap", msg: "snap8=on 50% 推杆 input.moveX=" + JSON.stringify(S.snapOn && S.snapOn.held && S.snapOn.held.moveX) + "（应非 0）" });
  if (!on.axisOk) out.push({ sev: "fail", code: "stick-snap-dir", phase: "stick-snap", msg: "snap8=on 方向未吸附到 8 轴之一：_padStick=" + JSON.stringify(S.snapOn && S.snapOn.held && { x: S.snapOn.held.x, y: S.snapOn.held.y }) });
  if (!off.analogOk) out.push({ sev: "warn", code: "stick-analog-dir", phase: "stick-snap", msg: "snap8=off 方向未保留原始分量（y≈0）：" + JSON.stringify(S.snapOff && S.snapOff.held && { x: S.snapOff.held.x, y: S.snapOff.held.y }) });
  if (!on.releasedOk || !off.releasedOk) out.push({ sev: "fail", code: "stick-release", phase: "stick-snap", msg: "松手后摇杆未回中：on=" + JSON.stringify(S.snapOn && S.snapOn.released && S.snapOn.released.mag) + " off=" + JSON.stringify(S.snapOff && S.snapOff.released && S.snapOff.released.mag) });
  return out;
}

async function readGamepadState(T) {
  const s = await T.eval('(() => { const g = window.__game; const mock = window.__mqaGamepad || null; const gp = g && (g.gamepad || (g.input && g.input.gamepad) || null); let status = null; try { if (gp && typeof gp.statusText === "function") status = gp.statusText(); } catch (e) { status = "statusText threw: " + e; } return { mockPresent: !!(mock && mock.mock), mockCalls: mock ? mock.calls.count : null, mockPads: mock && mock.pads ? mock.pads.length : null, exposed: !!gp, ctor: gp && gp.constructor ? gp.constructor.name : null, statusText: status, connected: gp && typeof gp.connected !== "undefined" ? gp.connected : null, polledByGame: !!(mock && mock.calls && mock.calls.count > 0) }; })()', { soft: true, awaitPromise: false });
  if (!s) return { implemented: false, note: 'Gamepad 状态读取失败' };
  s.implemented = !!s.exposed || !!s.polledByGame;
  s.note = s.implemented ? 'Gamepad 已集成（mock getGamepads 被调用）' : 'N/A：window.__game.gamepad 未暴露，mock getGamepads 未被调用（gp-dev 未落地）';
  return s;
}

/** 读取平台层 UI 状态：gameState、A2HS/安装条可见性、pad 控件、html class */
async function readUiState(T) {
  return T.eval(`(() => {
    const g = window.__game;
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity < 0.05) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
    };
    const pad = [...document.querySelectorAll('[data-hks-pad]')].filter((el) => {
      const st = getComputedStyle(el); const r = el.getBoundingClientRect();
      return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 1;
    }).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-hks-pad'), rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) } };
    });
    return {
      gameState: g && g.platform && g.platform.gameState,
      state: g && g.state, page: g && g._page,
      a2hs: vis('.hks-a2hs.show'), install: vis('.hks-install.show'),
      padCount: pad.length, pad,
      touchDevice: !!(g && g.input && g.input.touchDevice),
      padActive: !!(g && g.pad && g.pad.active),
      htmlClass: document.documentElement.className,
      bodyClass: document.body ? document.body.className : '',
      hksEls: document.querySelectorAll('[class*="hks-"]').length,
    };
  })()`, { soft: true, awaitPromise: false }).catch(() => null);
}

/** 安装条 / A2HS 只允许在标题页出现；非标题页出现即 fail，回标题应补显示安装条（未手动关闭时） */
function hintChecks(ui, kind) {
  const out = [];
  if (!ui) return out;
  const phases = [['menu', '难度/选人页'], ['settings', '设置页'], ['paused', '暂停页'], ['play', '战斗']];
  for (const [phase, label] of phases) {
    const s = ui[phase];
    if (!s) continue;
    if (s.a2hs) out.push({ sev: 'fail', code: 'a2hs-nontitle', phase, msg: 'A2HS 引导层出现在' + label + '（gameState=' + s.gameState + '），应立即收起' });
    if (s.install) out.push({ sev: 'fail', code: 'install-nontitle', phase, msg: '安装条出现在' + label + '（gameState=' + s.gameState + '，pad=' + s.padCount + '），应只在标题页' });
  }
  const tb = ui.titleBack;
  if (tb) {
    if (kind !== 'desktop' && !tb.install) out.push({ sev: 'warn', code: 'install-not-restored', phase: 'title-back', msg: '回到标题页后安装条未恢复显示（gameState=' + tb.gameState + '；未手动关闭安装条时应补显示）' });
    if (kind === 'desktop' && (tb.a2hs || tb.install || tb.padCount)) out.push({ sev: 'fail', code: 'desktop-platform-ui', phase: 'title-back', msg: '桌面端出现平台层移动 UI（pad=' + tb.padCount + ' a2hs=' + !!tb.a2hs + ' install=' + !!tb.install + '）' });
  }
  return out;
}

/** 桌面回归：无触屏 pad DOM / 无 .hks-* / html 无触屏 class / 设置页无「操作」组 */
function desktopChecks(R) {
  const out = [];
  if (R.kind !== 'desktop') return out;
  const t = R.ui && R.ui.title;
  if (!t) return out;
  if (t.touchDevice) out.push({ sev: 'fail', code: 'desktop-touch-device', phase: 'title', msg: '桌面端 input.touchDevice=true（触屏判定误命中）' });
  if (t.padCount) out.push({ sev: 'fail', code: 'desktop-pad-dom', phase: 'title', msg: '桌面端出现 ' + t.padCount + ' 个 [data-hks-pad] 虚拟键' });
  if (/\btouch\b|hks-/.test(String(t.htmlClass || ''))) out.push({ sev: 'fail', code: 'desktop-html-class', phase: 'title', msg: '桌面 html.class 含触屏标记：' + t.htmlClass });
  if (t.hksEls > 0) out.push({ sev: 'fail', code: 'desktop-hks-dom', phase: 'title', msg: '桌面端出现 ' + t.hksEls + ' 个 .hks-* 平台层元素' });
  if (t.a2hs || t.install) out.push({ sev: 'fail', code: 'desktop-install-ui', phase: 'title', msg: '桌面端出现安装引导/A2HS' });
  if (R.layout && R.layout.play && R.layout.play.pad && R.layout.play.pad.count) out.push({ sev: 'fail', code: 'desktop-pad-play', phase: 'play', msg: '桌面战斗页出现虚拟键 ' + R.layout.play.pad.count + ' 个' });
  return out;
}

function padSig(pad) {
  if (!pad || !pad.implemented) return null;
  return (pad.controls || []).map((c) => c.label + '@' + c.rect.x + ',' + c.rect.y + ',' + c.rect.w + ',' + c.rect.h).sort().join('|');
}

/* --------------------------- 单个用例 --------------------------- */
async function runCase(c, cfg) {
  const { dev, orientation } = c;
  const dims = orientationDims(dev, orientation);
  const dir = join(cfg.out, dev.id, orientation);
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const port = await freePort(cfg.port);
  const T = await launchBrowser({
    port, width: dims.w, height: dims.h, dpr: dev.dpr, orientation, dev,
    ua: dev.ua, platform: dev.platform, metadata: uaMetadata(dev),
    headless: cfg.headless, skipGamepad: cfg.skipGamepad || dev.kind === 'desktop',
  });
  const R = {
    id: c.id, device: dev.id, label: dev.label, kind: dev.kind, orientation,
    viewport: dims, dpr: dev.dpr, ua: dev.ua,
    startedAt: nowIso(), flow: {}, shots: {}, layout: {}, fps: {}, rotate: {},
    multiTouch: {}, padInput: {}, stickSnap: {}, gamepad: {}, hints: [], settings: null, ui: {}, checks: [], findings: [],
    errors: [], warns: [], httpBad: [], netFails: [], console: [], durations: {},
    status: 'PASS',
  };
  const shotName = async (name) => {
    const f = join(dir, name);
    await T.shot(f);
    R.shots[name.replace(/\.png$/, '')] = f;
    return f;
  };

  try {
    T.setPhase('boot');
    await T.nav(cfg.base + '/index.html?nosw=1&mqa=' + Date.now() + '&d=' + dev.id + '&o=' + orientation);
    const gameUp = await T.waitFor('!!(window.__game)', 25000);
    if (!gameUp) throw new Error('25s 内 window.game / window.__game 都未出现（游戏未启动：查 console 是否有模块 404）');
    const bootDone = await T.waitFor('(() => { const g = window.__game; return !!g && g._bootDone === true; })()', 30000);
    const menuReady = await T.waitFor('(() => { const g = window.__game; const o = document.getElementById("overlay"); return !!g && g.state === "menu" && !!o && !o.classList.contains("hidden"); })()', 8000);
    R.boot = { gameUp, bootDone, menuReady };
    const isTouch = dev.kind !== 'desktop';
    const hintWrap = async (tag, opts = {}) => {
      const d = await dismissHints(T, dims, opts);
      if (d.touched) R.hints.push(Object.assign({ tag }, d));
      return d;
    };
    R.ui.title = await readUiState(T);
    // A2HS 在 load 后 1.6s 才弹（platform.js:589），可能晚于 boot 完成；先等它出现再关，
    // 否则模态层会在 pressStart 时盖住「开始游戏」，导致只能 eval 兜底。
    const a2hsShown = await T.waitFor('!!document.querySelector(".hks-a2hs.show")', 2400).catch(() => false);
    if (a2hsShown) {
      const d0 = await dismissHints(T, dims, { skipInstall: true });
      if (d0.touched) R.hints.push(Object.assign({ tag: 'title-a2hs' }, d0));
    }
    // 标题页：关掉 A2HS 模态层以点开始按钮，但保留安装条（验证离开标题后自动收起、回来补显示）
    await hintWrap('title', { skipInstall: true });
    // 标题开屏动画选项最后一拍才落位：点一下标题区（非按钮）让 main.js 的全局 pointerdown 跳过 intro
    const introOn = () => T.eval('(() => { const o = document.getElementById("overlay"); return !!o && o.classList.contains("intro"); })()', { soft: true, awaitPromise: false }).catch(() => false);
    const startBtn = () => T.eval('(() => { const b = window.__mqa.buttons().find((x) => /开始游戏/.test(x.text)); return b ? { x: b.x, y: b.y } : null; })()', { soft: true, awaitPromise: false }).catch(() => null);
    const skipPoint = { x: Math.round(dims.w * 0.5), y: Math.round(dims.h * 0.12) };
    if (await introOn()) {
      await T.touchTap(skipPoint.x, skipPoint.y, { holdMs: 40, settle: 220 });
      R.boot.introSkipped = true;
    }
    let startAt = await startBtn();
    if (!startAt) {
      await T.touchTap(skipPoint.x, skipPoint.y, { holdMs: 40, settle: 350 });
      await hintWrap('title-retry');
      startAt = await startBtn();
    }
    R.boot.startReady = !!startAt;
    if (!startAt) {
      R.bootDiag = await T.eval('(() => { const g = window.__game; const o = document.getElementById("overlay"); const b = document.getElementById("boot"); return { state: g && g.state, page: g && g._page, bootDone: !!(g && g._bootDone), boot: window.__boot ? { pct: window.__boot.pct, target: window.__boot.target, done: window.__boot.done, timeline: (window.__boot.timeline || []).slice(-3) } : null, overlayHidden: o ? o.classList.contains("hidden") : null, overlayIntro: o ? o.classList.contains("intro") : null, overlayText: ((o && o.innerText) || "").replace(/\\s+/g, " ").slice(0, 300), bootEl: b ? { cls: b.className, style: b.getAttribute("style") } : null, buttons: [...document.querySelectorAll("#overlay button, #overlay .btn")].map((el) => { const r = el.getBoundingClientRect(); return { text: (el.innerText || el.textContent || "").trim().slice(0, 20), cls: String(el.className), w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.left.toFixed(1), y: +r.top.toFixed(1), display: getComputedStyle(el).display, opacity: getComputedStyle(el).opacity }; }) }; })()', { soft: true }).catch(() => null);
      throw new Error('标题页「开始游戏」按钮未出现（bootDone=' + bootDone + '，state=' + (R.bootDiag && R.bootDiag.state) + '；console 里若有模块 404 需先修集成）');
    }
    await sleep(300);
    R.env = await T.eval('({ ua: navigator.userAgent, platform: navigator.platform, lang: navigator.language, langs: navigator.languages, maxTouchPoints: navigator.maxTouchPoints, dpr: devicePixelRatio, innerW: innerWidth, innerH: innerHeight, screenW: screen.width, screenH: screen.height, orient: screen.orientation && screen.orientation.type, uaData: navigator.userAgentData ? { platform: navigator.userAgentData.platform, mobile: navigator.userAgentData.mobile } : null })', { soft: true });
    R.layout.title = await T.eval('window.__mqa.layout()');
    R.checks.push(...layoutIssues(R.layout.title, dims, 'title'));
    await shotName('01-title.png');
    R.flow.boot = { ok: !!(gameUp && menuReady), gameUp, menuReady, ms: Date.now() - t0 };
    R.durations.toTitle = Date.now() - t0;

    // 标题 → 难度
    T.setPhase('title->difficulty');
    const pressStart = () => pressButton(T, '(b) => /开始游戏/.test(b.text)', '开始游戏', () => waitText(T, /选择难度/, 7000));
    R.flow.start = await pressStart();
    if (!R.flow.start.ok) {
      const d = await dismissHints(T, dims);
      if (d.touched) R.hints.push(Object.assign({ tag: 'title-retry' }, d));
      R.flow.start = await pressStart();
    }
    if (!R.flow.start.ok) throw new Error('点击「开始游戏」后未进入难度选择页（' + JSON.stringify(R.flow.start) + '）');
    await sleep(380);
    R.ui.menu = await readUiState(T);
    R.checks.push(...hintChecks({ menu: R.ui.menu }, dev.kind));
    R.layout.difficulty = await T.eval('window.__mqa.layout()');
    R.checks.push(...layoutIssues(R.layout.difficulty, dims, 'difficulty'));
    await shotName('02-difficulty.png');

    // 难度 → 选人
    T.setPhase('difficulty->char');
    R.flow.difficulty = await pressButton(T, '(b) => /diff-card/.test(b.cls)', '难度卡片', () => waitText(T, /选择主角/, 7000));
    if (!R.flow.difficulty.ok) throw new Error('点击难度卡后未进入选人页');
    await sleep(340);
    R.layout.char = await T.eval('window.__mqa.layout()');
    R.checks.push(...layoutIssues(R.layout.char, dims, 'char-select'));
    await shotName('03-select.png');

    // 选人 → 开场对话 → 进关
    T.setPhase('char->dialogue');
    R.flow.char = await pressButton(
      T,
      '(b) => /cc-card/.test(b.cls) && !/locked/.test(b.cls)',
      '角色卡',
      () => T.waitFor('(() => { const g = window.__game; const o = document.getElementById("overlay"); return !!g && (g.state === "play" || (g.state === "dialogue" && !!g.dialogue) || (o && o.classList.contains("hidden"))); })()', 5000),
      { fallback: false }
    );
    if (!R.flow.char.ok) throw new Error('点击角色卡后既没进对话也没进关（' + JSON.stringify(R.flow.char) + '）');
    const dlg = await driveDialogueToPlay(T, dims, 30000);
    R.flow.dialogue = dlg;
    if (!dlg.ok) throw new Error('开场对话推进 ' + dlg.taps + ' 次仍未进入 play（state=' + (dlg.last && dlg.last.state) + '）');
    R.durations.toPlay = Date.now() - t0;

    // 进关后等 3s
    T.setPhase('play');
    await sleep(3000);
    await waitForHud(T, 2500);
    R.layout.play = await T.eval('window.__mqa.layout()');
    R.checks.push(...layoutIssues(R.layout.play, dims, 'play'));
    R.ui.play = await readUiState(T);
    R.checks.push(...hintChecks({ play: R.ui.play }, dev.kind));
    await shotName('04-play.png');
    await hintWrap('play');
    if (R.hints.length) {
      R.layout.play = await T.eval('window.__mqa.layout()');
      await shotName('04b-play-clean.png');
    }
    if (!isTouch && R.layout.play.pad.implemented) {
      R.checks.push({ sev: 'fail', code: 'desktop-pad-dom', phase: 'play', msg: '桌面模式出现 data-hks-pad 虚拟手柄 ' + R.layout.play.pad.count + ' 个' });
    }

    // FPS
    T.setPhase('play-fps');
    try { R.fps.raf = await T.eval('window.__mqa.fpsProbe(1500)', { timeoutMs: 12000 }); }
    catch (e) { R.fps.raf = { error: String(e.message || e) }; }
    const loops = [];
    for (let i = 0; i < 4; i++) {
      const s = await T.eval('(() => { const g = window.__game; if (!g || !g.loop) return null; return { fps: +(g.loop.fps || 0).toFixed(1), steps: +(g.loop.stepsPerSec || 0).toFixed(1), lastStepMs: +(g.loop.lastStepMs || 0).toFixed(2) }; })()', { soft: true, awaitPromise: false });
      if (s) loops.push(s);
      await sleep(260);
    }
    R.fps.loop = loops;

    // 横竖屏运行中切换
    T.setPhase('rotate');
    const other = orientation === 'landscape' ? 'portrait' : 'landscape';
    const otherDims = orientationDims(dev, other);
    const beforeCanvas = R.layout.play && R.layout.play.canvas ? R.layout.play.canvas : null;
    const beforePadSig = padSig(R.layout.play && R.layout.play.pad);
    const metricsOut = await T.setMetrics(otherDims, other);
    const rotLayout = await T.eval('window.__mqa.layout()');
    R.layout.rotated = rotLayout;
    const rotIssues = layoutIssues(rotLayout, otherDims, 'rotate->' + other);
    R.checks.push(...rotIssues);
    await shotName('05-rotate-' + other + '.png');
    const backMetrics = await T.setMetrics(dims, orientation);
    const backLayout = await T.eval('window.__mqa.layout()');
    R.layout.rotatedBack = backLayout;
    const backIssues = layoutIssues(backLayout, dims, 'rotate-back');
    R.checks.push(...backIssues);
    await shotName('06-rotate-back.png');
    R.rotate = {
      from: orientation, to: other, viewport: otherDims,
      metricsOk: !!metricsOut,
      layout: compactLayout(rotLayout), issues: rotIssues,
      back: {
        metricsOk: !!backMetrics,
        layout: compactLayout(backLayout),
        issues: backIssues,
        restored: !!(backLayout && backLayout.vw === dims.w && backLayout.vh === dims.h && beforeCanvas && backLayout.canvas && Math.abs(backLayout.canvas.w - beforeCanvas.w) <= 2 && Math.abs(backLayout.canvas.h - beforeCanvas.h) <= 2),
        padRestored: (() => { const after = padSig(backLayout && backLayout.pad); return beforePadSig == null && after == null ? true : beforePadSig === after; })(),
      },
    };
    if (R.rotate.back.restored === false) {
      R.checks.push({ sev: 'warn', code: 'rotate-not-restored', phase: 'rotate-back', msg: '切回原方向后画布未恢复原尺寸' });
    }
    if (R.rotate.back.padRestored === false) {
      R.checks.push({ sev: 'warn', code: 'rotate-pad-not-restored', phase: 'rotate-back', msg: '切回原方向后虚拟键位置未恢复' });
    }

    // 多点触摸（虚拟键）
    T.setPhase('multi-touch');
    R.multiTouch = await probeMultiTouch(T, dir);
    if (R.multiTouch.mode === 'legacy' && R.multiTouch.ok === false) {
      R.checks.push({ sev: 'warn', code: 'multitouch-legacy', phase: 'multi-touch', msg: 'legacy 触摸板双点按住未反映到 input 状态' });
    }
    R.padInput = await probePadInput(T, dir);
    if (R.padInput.implemented && !R.padInput.ok) {
      R.checks.push({ sev: 'fail', code: 'pad-input', phase: 'pad-input', msg: '摇杆右推 + 射击按住后 input.moveX=' + JSON.stringify(R.padInput.held && R.padInput.held.moveX) + ' / shoot=' + JSON.stringify(R.padInput.held && R.padInput.held.shoot) });
    }
    R.stickSnap = await probeStickSnap(T, dir, R.padInput && R.padInput.targets);
    R.checks.push(...stickSnapChecks(R.stickSnap));

    // 暂停
    T.setPhase('pause');
    R.flow.pause = await pressSettingsBtn(T);
    if (!R.flow.pause.ok) throw new Error('右上 settingsBtn 未能暂停（' + JSON.stringify(R.flow.pause) + '）');
    await sleep(320);
    R.layout.paused = await T.eval('window.__mqa.layout()');
    R.checks.push(...layoutIssues(R.layout.paused, dims, 'paused'));
    R.ui.paused = await readUiState(T);
    R.checks.push(...hintChecks({ paused: R.ui.paused }, dev.kind));
    await shotName('08-paused.png');

    // 设置页
    T.setPhase('settings');
    R.flow.settings = await pressButton(
      T, '(b) => /设置/.test(b.text)', '暂停-设置',
      () => T.waitFor('(() => { const g = window.__game; return !!g && g._page === "settings"; })()', 6000)
    );
    if (!R.flow.settings.ok) throw new Error('暂停页「设置」未打开设置页');
    await sleep(320);
    await hintWrap('settings');
    R.layout.settings = await T.eval('window.__mqa.layout()');
    R.checks.push(...layoutIssues(R.layout.settings, dims, 'settings'));
    R.settings = await T.eval('window.__mqa.settingsInfo()', { soft: true, awaitPromise: false });
    R.ui.settings = await readUiState(T);
    R.checks.push(...hintChecks({ settings: R.ui.settings }, dev.kind));
    const backBelow = (R.settings && R.settings.foot || []).some((f2) => /返回/.test(f2.text) && f2.rect && f2.rect.y >= (R.settings.vh || dims.h) - 2);
    if (backBelow) {
      R.settingsScroll = await probeSettingsScroll(T, dims, R.settings);
      if (R.settingsScroll.after) R.settings.afterScroll = R.settingsScroll.after;
    }
    R.checks.push(...settingsChecks(R.settings, isTouch, 'settings', R.settingsScroll));
    await shotName('09-settings.png');
    if (R.settingsScroll && R.settingsScroll.ok) await shotName('09b-settings-scrolled.png');

    // 返回暂停菜单
    T.setPhase('settings-back');
    R.flow.back = await pressButton(T, '(b) => /返回暂停菜单/.test(b.text)', '返回暂停菜单', () => waitText(T, /游戏已暂停/, 6000));
    if (!R.flow.back.ok) throw new Error('「返回暂停菜单」未回到暂停页');
    await sleep(280);

    // 退出到标题（二次确认）
    T.setPhase('quit-confirm');
    R.flow.quit = await pressButton(T, '(b) => /退出到标题/.test(b.text)', '暂停-退出到标题', () => waitText(T, /当前进度不会保存/, 6000));
    if (!R.flow.quit.ok) throw new Error('「退出到标题」未弹出二次确认');
    await sleep(280);
    await shotName('10-quit-confirm.png');

    T.setPhase('quit');
    R.flow.titleBack = await pressButton(
      T,
      '(b) => /退出到标题/.test(b.text) && /danger/.test(b.cls)',
      '确认退出到标题',
      () => T.waitFor('(() => { const g = window.__game; const o = document.getElementById("overlay"); return !!g && g._page === "title" && !!o && !o.classList.contains("hidden"); })()', 8000)
    );
    if (!R.flow.titleBack.ok) throw new Error('二次确认退出后未回到标题页');
    await sleep(500);
    R.layout.final = await T.eval('window.__mqa.layout()');
    R.checks.push(...layoutIssues(R.layout.final, dims, 'title-back'));
    if (dev.kind !== 'desktop') {
      await T.waitFor('(() => { const el = document.querySelector(".hks-install.show"); return !!el; })()', 2500).catch(() => false);
    }
    R.ui.titleBack = await readUiState(T);
    R.checks.push(...hintChecks({ titleBack: R.ui.titleBack }, dev.kind));
    R.checks.push(...desktopChecks(R));
    await shotName('11-title-back.png');
    await hintWrap('title-back');

    // Gamepad（mock 注入后的集成探测）
    T.setPhase('gamepad');
    R.gamepad = await readGamepadState(T);
  } catch (e) {
    R.fatal = String((e && e.message) || e);
    R.checks.push({ sev: 'fail', code: 'case-abort', phase: T.phase, msg: R.fatal });
    // 失败现场：布局快照 + 截图（boot 崩溃时也留下证据）
    try {
      R.failSnapshot = await T.eval('(() => { const g = window.__game; const o = document.getElementById("overlay"); return { phase: ' + JSON.stringify(T.phase) + ', hasGame: !!g, state: g && g.state, bootDone: !!(g && g._bootDone), overlayHidden: !!(o && o.classList.contains("hidden")), overlayText: ((o && o.innerText) || "").replace(/\\s+/g, " ").slice(0, 200), layout: window.__mqa ? window.__mqa.layout() : null }; })()', { soft: true, awaitPromise: false }).catch(() => null);
      await shotName('00-fail-' + String(T.phase || 'unknown').replace(/[^a-z0-9-]+/gi, '-') + '.png');
    } catch (e2) { /* 忽略失败现场采集错误 */ }
  } finally {
    R.errors = T.rec.errors.slice();
    R.warns = T.rec.warns.slice();
    R.httpBad = T.rec.httpBad.slice();
    R.netFails = T.rec.netFails.filter((f) => !f.canceled && !/favicon\.ico/.test(f.url));
    R.console = T.rec.consoleAll.slice(0, 250);
    R.durationMs = Date.now() - t0;
    await T.close().catch(() => {});
  }

  const exceptions = R.errors.filter((e) => e.kind === 'exception' || e.kind === 'crash');
  const consoleErrors = R.errors.filter((e) => e.kind !== 'exception' && e.kind !== 'crash');
  const httpBadApp = R.httpBad.filter((b) => !b.favicon);
  const flowEntries = Object.entries(R.flow).filter(([k]) => k !== 'boot');
  const flowBroken = flowEntries.some(([, v]) => v && v.ok === false);
  const failLayout = R.checks.some((x) => x.sev === 'fail');
  const warnLayout = R.checks.some((x) => x.sev === 'warn');
  const infoLayout = R.checks.some((x) => x.sev === 'info');
  R.summary = {
    flowOk: !flowBroken && !R.fatal,
    steps: flowEntries.length,
    stepsOk: flowEntries.filter(([, v]) => v && v.ok).length,
    exceptions: exceptions.length,
    consoleErrors: consoleErrors.length,
    warns: R.warns.length,
    httpBad: httpBadApp.length,
    netFails: R.netFails.length,
    fpsRaf: R.fps.raf && R.fps.raf.fps != null ? R.fps.raf.fps : null,
    fpsLoop: R.fps.loop && R.fps.loop.length ? R.fps.loop[R.fps.loop.length - 1].fps : null,
    safeArea: R.layout.play ? R.layout.play.safeArea : null,
    padImplemented: R.layout.play ? R.layout.play.pad.implemented : null,
    padCount: R.layout.play ? R.layout.play.pad.count : null,
    padInputOk: R.padInput ? !!R.padInput.ok : null,
    padInputHeld: R.padInput && R.padInput.held ? R.padInput.held : null,
    stickSnapOk: R.stickSnap ? !!R.stickSnap.ok : null,
    stickSnapOn: R.stickSnap && R.stickSnap.snapOn ? R.stickSnap.snapOn.held : null,
    stickSnapOff: R.stickSnap && R.stickSnap.snapOff ? R.stickSnap.snapOff.held : null,
    settingsGroups: R.settings ? (R.settings.groups || []).map((g) => g.g) : null,
    hints: R.hints ? R.hints.length : 0,
    gamepadImplemented: R.gamepad ? !!R.gamepad.implemented : null,
    multitouchMode: R.multiTouch ? R.multiTouch.mode : null,
  };
  R.findings = R.checks.filter((x) => x.sev !== 'info').map((x) => ({ sev: x.sev, code: x.code, msg: x.msg }));
  if (R.checks.some((x) => x.code === 'canvas-small')) {
    R.findings.push({ sev: 'info', code: 'canvas-small', msg: (R.checks.find((x) => x.code === 'canvas-small') || {}).msg });
  }
  if (R.multiTouch && R.multiTouch.mode === 'N/A') R.findings.push({ sev: 'info', code: 'pad-na', msg: R.multiTouch.note });
  if (R.gamepad && R.gamepad.implemented === false) R.findings.push({ sev: 'info', code: 'gamepad-na', msg: R.gamepad.note });
  if (R.padInput && R.padInput.implemented && R.padInput.ok) R.findings.push({ sev: 'info', code: 'pad-input-ok', msg: '摇杆/射击多指触摸已驱动 input（moveX=' + R.padInput.held.moveX + '）' });
  for (const h of R.hints || []) for (const k of ['a2hs', 'install']) if (h[k]) R.findings.push({ sev: 'info', code: k + '-shown', msg: (k === 'a2hs' ? 'A2HS 引导层' : '底部安装条') + '出现过（' + h.tag + '，closed=' + h[k].closed + '）' });
  R.status = (R.fatal || flowBroken || exceptions.length || failLayout)
    ? 'FAIL'
    : ((consoleErrors.length || R.warns.length || httpBadApp.length || R.netFails.length || warnLayout) ? 'WARN' : 'PASS');
  R.infoCount = infoLayout ? R.checks.filter((x) => x.sev === 'info').length : 0;
  return R;
}

/* --------------------------- PWA --------------------------- */
const BT = String.fromCharCode(96);

async function runPwa(dev, cfg) {
  const startMs = Date.now();
  const orientation = 'landscape';
  const dims = orientationDims(dev, orientation);
  const dir = join(cfg.out, 'pwa');
  mkdirSync(dir, { recursive: true });
  const port = await freePort(cfg.port);
  const T = await launchBrowser({
    port, width: dims.w, height: dims.h, dpr: dev.dpr, orientation, dev,
    ua: dev.ua, platform: dev.platform, metadata: uaMetadata(dev),
    headless: cfg.headless, skipGamepad: true,
  });
  const R = { device: dev.id, viewport: dims, startedAt: nowIso(), status: 'PASS', manifest: {}, sw: {}, offline: {}, errors: [], warns: [], httpBad: [], netFails: [] };
  try {
    T.setPhase('pwa-boot');
    await T.nav(cfg.base + '/index.html?mqa=' + Date.now() + '&pwa=1');
    const up = await T.waitFor('!!(window.__game)', 20000);
    if (!up) throw new Error('PWA 用例：游戏未启动');
    await T.waitFor('(() => { const g = window.__game; return !g || g._bootDone === true; })()', 8000);
    await sleep(500);

    T.setPhase('pwa-manifest');
    const links = await T.eval('[...document.querySelectorAll("link[rel=manifest]")].map((l) => l.href)', { soft: true });
    if (!links || !links.length) {
      R.manifest = { status: 'N/A', note: 'index.html 没有 <link rel="manifest">（平台层尚未落地）' };
    } else {
      let res = null;
      try { res = await fetch(links[0], { cache: 'no-store' }); }
      catch (e) { R.manifest = { status: 'FAIL', error: String(e.message || e), url: links[0] }; }
      if (!R.manifest.status) {
        const text = await res.text().catch(() => '');
        let json = null, parseError = null;
        try { json = JSON.parse(text); } catch (e) { parseError = String(e.message || e); }
        const icons = json && Array.isArray(json.icons) ? json.icons : [];
        R.manifest = {
          status: 'PASS', url: links[0], http: res.status, parseError,
          name: json && json.name, short_name: json && json.short_name,
          start_url: json && json.start_url, display: json && json.display,
          icons: icons.length, iconSizes: icons.map((i) => i.sizes).slice(0, 6),
        };
        R.manifest.checks = {
          httpOk: res.ok,
          jsonOk: !!json,
          nameOk: !!(json && (json.name || json.short_name)),
          displayOk: !!(json && /standalone|fullscreen|minimal-ui/.test(String(json.display || ''))),
          startOk: !!(json && json.start_url),
          iconsOk: icons.some((i) => /192|512/.test(String(i.sizes || '') + ' ' + String(i.src || ''))),
        };
        if (!R.manifest.checks.httpOk || !R.manifest.checks.jsonOk || !R.manifest.checks.nameOk || !R.manifest.checks.displayOk || !R.manifest.checks.iconsOk) R.manifest.status = 'FAIL';
      }
    }

    T.setPhase('pwa-sw');
    R.sw = await T.eval('(async () => { if (!("serviceWorker" in navigator)) return { supported: false }; const regs = await navigator.serviceWorker.getRegistrations(); let ready = false; try { ready = !!(await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 7000))])); } catch (e) {} return { supported: true, count: regs.length, ready, controller: !!navigator.serviceWorker.controller, regs: regs.map((r) => ({ scope: r.scope, active: r.active ? r.active.scriptURL : null, waiting: !!r.waiting, installing: !!r.installing })) }; })()', { soft: true, timeoutMs: 12000 });
    if (!R.sw) R.sw = { supported: false, error: 'serviceWorker 状态读取失败' };

    T.setPhase('pwa-offline');
    const swActive = !!(R.sw && R.sw.count > 0 && R.sw.regs && R.sw.regs.some((r) => r.active));
    if (!swActive) {
      R.offline = {
        status: 'N/A',
        note: R.manifest.status === 'N/A'
          ? 'PWA 未集成：无 manifest、无 service worker，离线不可测'
          : '有 manifest 但没有 active service worker，离线不可测',
      };
    } else {
      if (!R.sw.controller) {
        await T.reload();
        await T.waitFor('!!(window.__game)', 20000);
        await sleep(700);
      }
      await T.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
      await T.reload();
      const ok = await T.waitFor('(() => { const g = window.__game; const o = document.getElementById("overlay"); return !!g && g.state === "menu" && !!o && !o.classList.contains("hidden"); })()', 10000);
      const info = await T.eval('({ url: location.href, title: document.title, bodyText: (document.body && document.body.innerText || "").slice(0, 160), overlay: !!document.getElementById("overlay"), game: !!(window.__game) })', { soft: true }).catch((e) => ({ error: String(e.message || e) }));
      R.offline = { status: ok ? 'PASS' : 'FAIL', ok, info };
      try { R.offline.shot = join(dir, 'offline-reload.png'); await T.shot(R.offline.shot); } catch (e) {}
      await T.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
      await T.reload();
      R.offline.restored = await T.waitFor('!!(window.__game)', 15000);
    }
    R.status = (R.manifest.status === 'FAIL' || R.offline.status === 'FAIL') ? 'FAIL'
      : ((R.manifest.status === 'N/A' && R.offline.status === 'N/A') ? 'N/A' : 'PASS');
  } catch (e) {
    R.fatal = String(e.message || e);
    R.status = 'FAIL';
    R.checks = [{ sev: 'fail', code: 'pwa-abort', msg: R.fatal }];
  } finally {
    R.errors = T.rec.errors.slice();
    R.warns = T.rec.warns.slice();
    R.httpBad = T.rec.httpBad.slice();
    R.netFails = T.rec.netFails.filter((f) => !f.canceled && !/favicon\.ico/.test(f.url));
    R.durationMs = Date.now() - startMs;
    await T.close().catch(() => {});
  }
  return R;
}

/* --------------------------- 汇总 / 报告 --------------------------- */
const STATUS_ICON = { PASS: '✅', WARN: '⚠️', FAIL: '❌', 'N/A': '➖' };

function buildMarkdown(report) {
  const L = [];
  const m = report.meta;
  L.push('# 移动端自动化 QA 报告');
  L.push('');
  L.push('- 生成时间：' + m.startedAt + '（耗时 ' + Math.round((m.durationMs || 0) / 1000) + 's）');
  L.push('- dev server：' + m.base);
  L.push('- 浏览器：headless Edge（' + m.edge + '）');
  L.push('- 设备矩阵：' + (m.devices || []).join(' / '));
  L.push('- 复跑：' + BT + (m.command || '') + BT);
  L.push('');
  L.push('## 汇总');
  L.push('');
  L.push('| 用例 | 设备 | 方向 | 状态 | 流程 | console err / warn | HTTP>=400 | FPS raf/loop | 虚拟键·HUD | 旋转 |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const R of report.cases) {
    const s = R.summary || {};
    const pad = R.layout && R.layout.play
      ? (R.layout.play.pad.implemented
          ? '重叠 ' + (R.layout.play.pad.hudOverlaps.length + R.layout.play.pad.selfOverlaps.length)
          : 'N/A（legacy ' + (R.layout.play.pad.legacy.count || 0) + ' 键）')
      : '—';
    const rot = R.rotate && R.rotate.back ? (R.rotate.back.restored ? 'OK' : '未复位') : '—';
    L.push('| ' + R.id + ' | ' + R.label + ' | ' + R.orientation + ' | ' + STATUS_ICON[R.status] + ' ' + R.status + ' | '
      + (s.stepsOk || 0) + '/' + (s.steps || 0) + ' | ' + (s.exceptions || 0) + '/' + (s.consoleErrors || 0) + ' / ' + (s.warns || 0)
      + ' | ' + (s.httpBad || 0) + ' | ' + (s.fpsRaf != null ? s.fpsRaf : '—') + ' / ' + (s.fpsLoop != null ? s.fpsLoop : '—')
      + ' | ' + pad + ' | ' + rot + ' |');
  }
  L.push('');
  const counts = report.summary.byStatus || {};
  L.push('状态：' + ['PASS', 'WARN', 'FAIL', 'N/A'].map((k) => (STATUS_ICON[k] || '') + ' ' + k + ' ' + (counts[k] || 0)).join('　'));
  L.push('');
  if (report.findings && report.findings.length) {
    L.push('## 关键发现');
    L.push('');
    const seen = new Set();
    for (const f of report.findings) {
      const key = f.code + '|' + f.msg;
      if (seen.has(key)) continue;
      seen.add(key);
      L.push('- [' + f.sev + '] ' + BT + f.code + BT + ' ' + f.msg + (f.cases && f.cases.length ? '（' + f.cases.join('、') + '）' : ''));
    }
    L.push('');
  }
  L.push('## 逐用例明细');
  L.push('');
  for (const R of report.cases) {
    L.push('### ' + R.id + ' — ' + STATUS_ICON[R.status] + ' ' + R.status + (R.fatal ? '（中断：' + String(R.fatal).slice(0, 160) + '）' : ''));
    L.push('');
    L.push('- 视口 ' + R.viewport.w + 'x' + R.viewport.h + ' @' + R.dpr + 'x · ' + R.orientation);
    if (R.env) L.push('- UA ' + BT + String(R.env.ua || '').slice(0, 150) + BT + ' · platform=' + R.env.platform + ' · maxTouchPoints=' + R.env.maxTouchPoints + ' · inner=' + R.env.innerW + 'x' + R.env.innerH);
    if (R.layout && R.layout.play && R.layout.play.canvas) {
      const c = R.layout.play.canvas;
      L.push('- 画布 ' + c.w + 'x' + c.h + ' · letterbox ' + JSON.stringify(R.layout.play.letterbox) + ' · --s=' + R.layout.play.scale);
    }
    if (R.summary) {
      L.push('- 流程 ' + (R.summary.stepsOk || 0) + '/' + (R.summary.steps || 0) + ' · console err/warn ' + ((R.summary.exceptions || 0) + (R.summary.consoleErrors || 0)) + '/' + (R.summary.warns || 0) + ' · HTTP>=400 ' + (R.summary.httpBad || 0) + ' · netFail ' + (R.summary.netFails || 0));
      if (R.summary.fpsRaf != null) L.push('- FPS：rAF ' + R.summary.fpsRaf + (R.summary.fpsLoop != null ? ' · loop ' + R.summary.fpsLoop : ''));
    }
    if (R.flow && Object.keys(R.flow).length) {
      L.push('');
      L.push('| 步骤 | 结果 | 方式 | 耗时 |');
      L.push('| --- | --- | --- | --- |');
      for (const [k, v] of Object.entries(R.flow)) {
        if (!v) continue;
        L.push('| ' + k + ' | ' + (v.ok ? 'OK' : 'FAIL') + ' | ' + (v.mode || (v.taps != null ? 'touch x' + v.taps : '—')) + ' | ' + (v.ms != null ? v.ms + 'ms' : '—') + ' |');
      }
    }
    if (R.layout && R.layout.play && R.layout.play.pad) {
      const p = R.layout.play.pad;
      L.push('');
      L.push('- 虚拟键：' + (p.implemented ? 'data-hks-pad ' + p.count + ' 个；HUD 重叠 ' + p.hudOverlaps.length + '；自重叠 ' + p.selfOverlaps.length + '；出界 ' + p.outOfViewport.length : 'N/A（data-hks-pad 未集成）') + '；legacy #touch ' + (p.legacy.count || 0) + ' 个，HUD 重叠 ' + ((p.legacy.hudOverlaps || []).length));
    }
    if (R.multiTouch && R.multiTouch.mode && R.multiTouch.mode !== 'none') {
      L.push('- 多点触摸：' + R.multiTouch.mode + ' · held=' + JSON.stringify(R.multiTouch.held || null) + ' · 释放后=' + JSON.stringify(R.multiTouch.released || null));
    }
    if (R.gamepad) {
      L.push('- Gamepad：' + (R.gamepad.implemented ? '已集成（mock 调用 ' + R.gamepad.mockCalls + ' 次' + (R.gamepad.statusText ? '，status=' + R.gamepad.statusText : '') + '）' : 'N/A（未集成）'));
    }
    const nf = (R.checks || []).filter((x) => x.sev !== 'info');
    if (nf.length) {
      L.push('');
      for (const x of nf) L.push('- [' + x.sev + '] ' + BT + x.code + BT + ' ' + x.msg);
    }
    if (R.rotate) {
      L.push('- 旋转：' + R.rotate.from + ' → ' + R.rotate.to + '，视口 ' + (R.rotate.layout ? R.rotate.layout.vw + 'x' + R.rotate.layout.vh : '?') + '，切回画布 ' + (R.rotate.back && R.rotate.back.restored ? '已复位' : '未复位'));
    }
    if (R.errors && R.errors.length) {
      L.push('');
      L.push('console / pageerror：');
      for (const e of R.errors.slice(0, 12)) L.push('- [' + e.phase + '] ' + e.kind + ': ' + String(e.text).slice(0, 220));
      if (R.errors.length > 12) L.push('- …共 ' + R.errors.length + ' 条，见 report.json');
    }
    if (R.warns && R.warns.length) {
      L.push('');
      L.push('console warn：');
      for (const e of R.warns.slice(0, 8)) L.push('- [' + e.phase + '] ' + String(e.text).slice(0, 200));
    }
    const bads = (R.httpBad || []).filter((b) => !b.favicon);
    if (bads.length) {
      L.push('');
      L.push('HTTP>=400：');
      for (const b of bads.slice(0, 10)) L.push('- ' + b.status + ' ' + b.url);
    }
    if (R.shots && Object.keys(R.shots).length) {
      L.push('');
      L.push('截图：' + Object.values(R.shots).map((p) => BT + String(p).replace(ROOT + '/', '') + BT).join(' · '));
    }
    L.push('');
  }
  if (report.pwa) {
    L.push('## PWA');
    L.push('');
    L.push('- 状态：' + STATUS_ICON[report.pwa.status] + ' ' + report.pwa.status);
    L.push('- manifest：' + JSON.stringify(report.pwa.manifest));
    L.push('- serviceWorker：' + JSON.stringify(report.pwa.sw));
    L.push('- 离线 reload：' + JSON.stringify(report.pwa.offline));
    if (report.pwa.fatal) L.push('- 中断：' + report.pwa.fatal);
    L.push('');
  }
  L.push('## 说明');
  L.push('');
  L.push('- 真实触摸：菜单 / 暂停 / 设置操作优先走 Input.dispatchTouchEvent；Runtime.evaluate el.click() 只在触摸未生效时兜底，报告中 mode 字段会标 eval-click-fallback。');
  L.push('- N/A 含义：对应能力尚未集成（虚拟手柄 data-hks-pad、PWA manifest/SW、Gamepad），不是失败。');
  L.push('- 只读：本脚本只读页面与游戏遥测，不写 localStorage、不改 src。');
  L.push('');
  return L.join('\n');
}

function mergeFindings(cases) {
  const map = new Map();
  for (const R of cases) {
    for (const f of R.findings || []) {
      const key = f.sev + '|' + f.code + '|' + f.msg;
      if (!map.has(key)) map.set(key, { sev: f.sev, code: f.code, msg: f.msg, cases: [] });
      map.get(key).cases.push(R.id);
    }
  }
  const order = { fail: 0, warn: 1, info: 2 };
  return [...map.values()].sort((a, b) => (order[a.sev] ?? 9) - (order[b.sev] ?? 9));
}

async function assertServer(base) {
  try {
    const r = await fetch(base + '/index.html', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const t = await r.text();
    if (!/<canvas|__game|game\.js/i.test(t)) throw new Error('index.html 内容异常');
  } catch (e) {
    throw new Error('dev server 不可用：' + base + '（' + (e.message || e) + '）—— 先启动 dev server（默认 8137）或用 --base= 指定');
  }
}

function failedCase(c, e) {
  const msg = String((e && e.message) || e);
  return {
    id: c.id, device: c.dev.id, label: c.dev.label, kind: c.dev.kind, orientation: c.orientation,
    viewport: c.dims, dpr: c.dev.dpr, startedAt: nowIso(), durationMs: 0, status: 'FAIL', fatal: msg,
    flow: {}, shots: {}, checks: [{ sev: 'fail', code: 'case-abort', msg }],
    findings: [{ sev: 'fail', code: 'case-abort', msg }],
    errors: [], warns: [], httpBad: [], netFails: [],
    summary: { flowOk: false, steps: 0, stepsOk: 0, exceptions: 0, consoleErrors: 0, warns: 0, httpBad: 0, netFails: 0 },
  };
}

async function gitMeta() {
  try {
    const { execSync } = await import('node:child_process');
    const head = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean).length;
    return { head, dirtyFiles: dirty };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

/* --------------------------- main --------------------------- */
async function main() {
  if (ARG.list) {
    console.log('设备矩阵：');
    for (const d of DEVICES) console.log('  ' + d.id.padEnd(14) + d.base[0] + 'x' + d.base[1] + ' @' + d.dpr + 'x  ' + d.label + '  [' + d.kind + ']');
    console.log('');
    console.log('用法：node tools/_mobile_qa.mjs [--device=all|' + DEVICES.map((d) => d.id).join('|') + '] [--orientation=both|landscape|portrait]');
    return;
  }
  if (!EDGE) {
    console.error('找不到 Edge（msedge.exe）。可在环境变量 MQA_EDGE 指定路径。');
    process.exitCode = 2;
    return;
  }
  await assertServer(CFG.base);
  const cases = makeCases();
  if (!cases.length) {
    console.error('没有匹配的用例，检查 --device / --orientation / --only');
    process.exitCode = 2;
    return;
  }
  mkdirSync(CFG.out, { recursive: true });
  const startedAt = nowIso();
  const t0 = Date.now();
  const git = await gitMeta();
  const report = {
    meta: {
      startedAt,
      base: CFG.base,
      edge: EDGE,
      command: 'node tools/_mobile_qa.mjs ' + process.argv.slice(2).join(' '),
      devices: [...new Set(cases.map((c) => c.dev.id))],
      orientations: [...new Set(cases.map((c) => c.orientation))],
      git,
      node: process.version,
    },
    cases: [],
    pwa: null,
    findings: [],
    summary: {},
  };
  console.log('[qa] ' + cases.length + ' 个用例 → ' + CFG.out);

  for (const c of cases) {
    const cs = Date.now();
    process.stdout.write('[qa] ' + c.id + ' … ');
    let R;
    try {
      R = await runCase(c, CFG);
    } catch (e) {
      R = failedCase(c, e);
    }
    R.durationMs = R.durationMs || (Date.now() - cs);
    report.cases.push(R);
    try { writeFileSync(join(CFG.out, 'report.partial.json'), JSON.stringify(report, null, 2)); } catch (e) {}
    const s = R.summary || {};
    console.log(STATUS_ICON[R.status] + ' ' + R.status + '  flow ' + (s.stepsOk || 0) + '/' + (s.steps || 0)
      + '  err ' + (((s.exceptions || 0) + (s.consoleErrors || 0))) + '  warn ' + (s.warns || 0)
      + '  http ' + (s.httpBad || 0) + '  ' + Math.round(R.durationMs / 1000) + 's'
      + (R.fatal ? '  FATAL ' + String(R.fatal).slice(0, 90) : ''));
  }

  if (!CFG.skipPwa) {
    process.stdout.write('[qa] pwa … ');
    const pwaDev = DEVICES.find((d) => d.id === 'wechat') || DEVICES[0];
    let P;
    try { P = await runPwa(pwaDev, CFG); }
    catch (e) { P = { status: 'FAIL', fatal: String(e.message || e), device: pwaDev.id, manifest: {}, sw: {}, offline: {}, errors: [], warns: [], httpBad: [], netFails: [] }; }
    report.pwa = P;
    console.log(STATUS_ICON[P.status] + ' ' + P.status + (P.manifest && P.manifest.status ? '  manifest=' + P.manifest.status : '') + (P.offline && P.offline.status ? '  offline=' + P.offline.status : ''));
  }

  const byStatus = { PASS: 0, WARN: 0, FAIL: 0, 'N/A': 0 };
  for (const R of report.cases) byStatus[R.status] = (byStatus[R.status] || 0) + 1;
  report.summary = {
    byStatus,
    total: report.cases.length,
    durationMs: Date.now() - t0,
    pwaStatus: report.pwa ? report.pwa.status : 'SKIP',
  };
  report.meta.durationMs = report.summary.durationMs;
  report.findings = mergeFindings(report.cases);

  writeFileSync(join(CFG.out, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(CFG.out, 'report.md'), buildMarkdown(report));

  console.log('');
  console.log('════════ 移动端 QA 汇总 ════════');
  console.log('用例 ' + report.cases.length + ' · PASS ' + byStatus.PASS + ' · WARN ' + byStatus.WARN + ' · FAIL ' + byStatus.FAIL + ' · N/A ' + byStatus['N/A'] + ' · PWA ' + report.summary.pwaStatus);
  console.log('耗时 ' + Math.round(report.summary.durationMs / 1000) + 's');
  console.log('报告：' + join(CFG.out, 'report.md'));
  console.log('数据：' + join(CFG.out, 'report.json'));
  const fails = report.findings.filter((f) => f.sev === 'fail');
  if (fails.length) {
    console.log('阻塞项：');
    for (const f of fails.slice(0, 8)) console.log('  - ' + f.code + ' ' + f.msg + (f.cases.length ? '（' + f.cases.join('、') + '）' : ''));
  }
  if (CFG.strict && byStatus.FAIL > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('[qa] 致命错误：', (e && e.stack) || e);
  process.exitCode = 2;
});
