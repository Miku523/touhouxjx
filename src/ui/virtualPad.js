/**
 * 手机端虚拟手柄 TouchPad
 * ------------------------------------------------------------------
 * - 只在触屏设备激活（input.touchDevice === true；undefined 时看 pointer:coarse）。
 *   桌面直接不渲染任何 DOM，对 PC 零影响。
 * - 三种方案：stick（摇杆 + 右手按钮）、gesture（全屏手势）、keys（实体按键排布）。
 * - 外部只通过 input.setStick(x, y) / input.padPress(action) / input.padRelease(action)
 *   驱动 Input，不碰 input.held / justPressed；每个 pointerId 自己配对按下/松开。
 * - 持久化 localStorage 'hks.touch.v1'；手势提示单独存 'hks.touch.hints.v1'。
 * - CSS 在 src/ui/mobile.css（由 index.html 引入），本文件不注入样式。
 */

import { tr, onChange as onLangChange } from '../i18n/index.js';

const STORE_KEY = 'hks.touch.v1';
const HINT_KEY = 'hks.touch.hints.v1';
const SCHEMES = ['stick', 'gesture', 'keys'];
const SCHEME_LABEL = { stick: '摇杆', gesture: '手势', keys: '按键' };
const TOUCH_STATES = ['menu', 'paused', 'play', 'dialogue', 'ending', 'gameover', 'clear'];

export const DEFAULT_TOUCH_SETTINGS = Object.freeze({
  scheme: 'stick',
  size: 1,
  opacity: 0.85,
  deadzone: 0.18,
  snap8: true,
  haptics: true,
  hints: true,
  layout: {},
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const copy = (v) => {
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
};

function readSettings() {
  const out = {
    scheme: 'stick', size: 1, opacity: 0.85, deadzone: 0.18,
    snap8: true, haptics: true, hints: true, layout: {},
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return out;
    if (SCHEMES.includes(raw.scheme)) out.scheme = raw.scheme;
    out.size = clamp(num(raw.size, out.size), 0.8, 1.4);
    out.opacity = clamp(num(raw.opacity, out.opacity), 0.3, 1);
    out.deadzone = clamp(num(raw.deadzone, out.deadzone), 0.04, 0.5);
    if (raw.snap8 === false) out.snap8 = false;
    if (raw.haptics === false) out.haptics = false;
    if (raw.hints === false) out.hints = false;
    if (raw.layout && typeof raw.layout === 'object' && !Array.isArray(raw.layout)) out.layout = raw.layout;
  } catch (e) { /* localStorage 不可用 → 默认值 */ }
  return out;
}

/* ------------------------------- 图标 ------------------------------- */

const ICONS = {
  shoot: '<circle cx="12" cy="12" r="3.1" fill="currentColor" stroke="none"/>' +
    '<path d="M12 2.4v3.4M12 18.2v3.4M2.4 12h3.4M18.2 12h3.4M5.2 5.2l2.4 2.4M16.4 16.4l2.4 2.4M18.8 5.2l-2.4 2.4M7.6 16.4l-2.4 2.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  jump: '<path d="M12 3.4v12.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
    '<path d="M6.6 9.6 12 4.2l5.4 5.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M4.8 19.8h14.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  slow: '<path d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4 4 16.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  dash: '<path d="M3.6 5.4 10.8 12l-7.2 6.6M12.2 5.4 19.4 12l-7.2 6.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  cast: '<path d="M12 2.2 14.5 9l7 2.5-7 2.5L12 21l-2.5-7-7-2.5 7-2.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="11.5" r="1.8" fill="currentColor" stroke="none"/>',
  left: '<path d="M15.2 4.6 7.4 12l7.8 7.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  right: '<path d="M8.8 4.6 16.6 12l-7.8 7.4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  pause: '<rect x="6.6" y="4.6" width="3.8" height="14.8" rx="1.2" fill="currentColor"/>' +
    '<rect x="13.6" y="4.6" width="3.8" height="14.8" rx="1.2" fill="currentColor"/>',
  gear: '<path d="M4 7h9M18 7h2M4 17h4M13 17h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
    '<circle cx="15" cy="7" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
    '<circle cx="10" cy="17" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  stick: '<path d="M12 4.4v15.2M4.4 12h15.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>' +
    '<path d="m12 4.4-2 2M12 4.4l2 2M12 19.6l-2-2M12 19.6l2-2M4.4 12l2-2M4.4 12l2 2M19.6 12l-2-2M19.6 12l-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>',
};

const svg = (name) => '<svg class="hks-pad-svg" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';

const ACTIONS = {
  shoot: { label: '射击', icon: 'shoot', tone: 'rose' },
  jump: { label: '跳跃', icon: 'jump', tone: 'cyan' },
  slow: { label: '低速', icon: 'slow', tone: 'cyan' },
  dash: { label: '冲刺', icon: 'dash', tone: 'sakura' },
  cast: { label: '符卡', icon: 'cast', tone: 'gold' },
  left: { label: '左', icon: 'left', tone: 'plain' },
  right: { label: '右', icon: 'right', tone: 'plain' },
};

const ACTION_IDS = Object.keys(ACTIONS);

const sheetSchemeHTML = SCHEMES.map((s) =>
  '<button type="button" class="hks-pad-segbtn" data-scheme-set="' + s + '">' + SCHEME_LABEL[s] + '</button>'
).join('');

const editbarSchemeHTML = sheetSchemeHTML;

/**
 * 手机端虚拟手柄。
 * @example
 * const pad = new TouchPad({ input });
 * pad.setGameState('play');
 */
export class TouchPad {
  constructor({ input, host = document.body } = {}) {
    this.input = input || null;
    this.host = host || (typeof document !== 'undefined' ? document.body : null);
    this.doc = this.host ? this.host.ownerDocument : (typeof document !== 'undefined' ? document : null);
    this.win = this.doc ? this.doc.defaultView : null;

    this.active = false;
    this.disabled = false;
    this.destroyed = false;

    this._settings = readSettings();
    this._state = 'menu';
    this._mode = 'off';
    this._editing = false;
    this._sheetOpen = false;
    this._hintOpen = false;
    this._hintSeen = this._readHintSeen();

    this._pointers = new Map();      // pointerId -> Set<action>
    this._holds = new Map();         // action -> count
    this._pulseSeq = 0;
    this._timers = new Set();
    this._listeners = new Set();     // onChange 回调
    this._i18nOff = null;            // 语言切换订阅的取消函数

    this._vw = 1;
    this._vh = 1;
    this._safe = { top: 0, right: 0, bottom: 0, left: 0 };
    this._metrics = null;
    this._sizes = {};
    this._centers = {};
    this._stickPointer = 0;
    this._stickCenter = null;
    this._stickR = 0;
    this._knobTravel = 8;
    this._lastStick = { x: 0, y: 0 };
    this._lastDir = 0;
    this._gestureLeft = null;
    this._gestureRight = [];
    this._lastLeftTapAt = 0;
    this._lastLeftTapPos = null;
    this._drag = null;
    this._refreshTimer = 0;
    this._toastTimer = 0;
    this._hintTimer = 0;
    this._mo = null;

    if (!this.doc || !this.host) {
      this.disabled = true;
      this._warn('找不到 document/body，虚拟手柄已禁用');
      return;
    }
    if (!this._hasInputApi()) {
      this.disabled = true;
      this._warn('input 缺少 setStick/padPress/padRelease，虚拟手柄已禁用');
      return;
    }
    if (!this._shouldActivate()) return; // 桌面：完全不渲染，active 保持 false

    this.active = true;
    this._buildDom();
    this._rebuildI18n();
    this._bind();
    this._i18nOff = onLangChange(() => {
      if (!this.destroyed) this._rebuildI18n();
    });
    this._applyMode();
    this.refresh();
    this._syncSheet();
  }

  /* ------------------------------ 公开 API ------------------------------ */

  /** 当前方案 */
  get scheme() {
    return this._settings.scheme;
  }

  /** 布局编辑器或内部设置面板是否开着（安卓返回键判断用） */
  get overlayOpen() {
    return !!(this._editing || this._sheetOpen);
  }

  /** 当前是否真的渲染了（桌面 false） */
  get rendered() {
    return this.active && !this.destroyed;
  }

  /** 设置页读的完整设置副本 */
  getSettings() {
    return {
      scheme: this._settings.scheme,
      size: this._settings.size,
      opacity: this._settings.opacity,
      deadzone: this._settings.deadzone,
      snap8: this._settings.snap8,
      haptics: this._settings.haptics,
      hints: this._settings.hints,
      layout: copy(this._settings.layout || {}),
    };
  }

  getScheme() {
    return this.scheme;
  }

  /** 切换方案；返回当前方案（非法值忽略） */
  setScheme(scheme) {
    if (!SCHEMES.includes(scheme) || this.destroyed) return this.scheme;
    if (scheme === this._settings.scheme) return this.scheme;
    this._releaseAll();
    this._settings.scheme = scheme;
    this._save();
    if (this.active) {
      this._applyMode();
      this._applyLayout();
      this._syncSheet();
      this._toast(tr('操作方案') + ' · ' + tr(SCHEME_LABEL[scheme]));
      if (scheme === 'gesture' && this._mode === 'play') this._maybeShowHint();
    }
    this._emitChange();
    return this.scheme;
  }

  /** 顺/逆循环方案（dir < 0 反向），返回新方案 */
  cycleScheme(dir = 1) {
    const step = num(dir, 1) < 0 ? -1 : 1;
    const i = SCHEMES.indexOf(this._settings.scheme);
    return this.setScheme(SCHEMES[(i + step + SCHEMES.length) % SCHEMES.length]);
  }

  /**
   * 游戏语义状态。
   * play=完整控件；dialogue=只显示大号「继续」；menu/paused/ending/gameover/clear=隐藏。
   */
  setGameState(state) {
    if (!this.active || this.disabled || this.destroyed) return;
    const next = TOUCH_STATES.includes(state) ? state : 'menu';
    if (next === this._state) return;
    this._state = next;
    this._applyMode();
    if (next === 'play') {
      this._applyLayout();
      this._scheduleRefresh(20);
      this._maybeShowHint();
    }
  }

  /** 重新测量视口 / 安全区并重排（resize / orientation / visualViewport 自动调用） */
  refresh() {
    if (!this.active || this.disabled || this.destroyed) return;
    const vw = Math.max(1, Math.floor(this.win.innerWidth || this.doc.documentElement.clientWidth || 1));
    const vh = Math.max(1, Math.floor(this.win.innerHeight || this.doc.documentElement.clientHeight || 1));
    const safe = this._readSafeInsets();
    const minSide = Math.min(vw, vh);
    const unit = clamp(minSide * 0.08, 44, 72);
    const b = clamp(unit * this._settings.size, 40, 84);
    const m = clamp(b * 0.36, 10, 22);
    const pauseS = clamp(b * 0.8, 34, 46);
    const gearS = clamp(b * 0.76, 32, 44);
    const baseS = Math.min(b * 2.7, vw * 0.3, vh * 0.42);
    const installLift = this._installLift();

    this._vw = vw;
    this._vh = vh;
    this._safe = safe;
    this._metrics = { vw, vh, b, m, safe, pauseS, gearS, baseS, installLift };
    this._sizes = {
      shoot: b * 1.18, jump: b, slow: b, dash: b, cast: b,
      left: b * 1.36, right: b * 1.36,
      pause: pauseS, gear: gearS, stick: baseS,
    };
    this._stickR = baseS / 2;
    this._knobTravel = Math.max(10, this._stickR - baseS * 0.22 - 3);
    this._applyLayout();
    this._applyVisual();
    this._syncSheet();
  }

  /** 打开布局编辑器（拖动按钮 / 重置 / 完成），可盖在游戏菜单之上 */
  openLayoutEditor() {
    if (!this.active || this.disabled || this.destroyed) return false;
    if (this._editing) return true;
    this._closeSheet(true);
    this._releaseAll();
    this._editing = true;
    this.refs.root.classList.add('is-overlay');
    this._applyMode();
    this._applyLayout();
    this._syncSheet();
    this._toast(tr('拖动控件调整位置'));
    return true;
  }

  /** 关掉编辑器 / 内部设置面板；确实关掉了才返回 true（安卓返回键） */
  closeOverlay() {
    if (this.destroyed) return false;
    let closed = false;
    if (this._editing) {
      this._editing = false;
      this.refs?.root?.classList.remove('is-overlay');
      this._applyMode();
      if (this.active) this._applyLayout();
      closed = true;
    }
    if (this._sheetOpen) {
      this._closeSheet();
      closed = true;
    }
    return closed;
  }

  /** 修改一项设置并持久化；成功返回 true */
  setSetting(key, value) {
    if (this.destroyed) return false;
    const s = this._settings;
    switch (key) {
      case 'scheme': {
        if (!SCHEMES.includes(value)) return false;
        this.setScheme(value);
        return true;
      }
      case 'size': {
        const v = clamp(num(value, s.size), 0.8, 1.4);
        if (v === s.size) return false;
        s.size = v;
        break;
      }
      case 'opacity': {
        const v = clamp(num(value, s.opacity), 0.3, 1);
        if (v === s.opacity) return false;
        s.opacity = v;
        if (this.active) this._applyVisual();
        break;
      }
      case 'deadzone': {
        const v = clamp(num(value, s.deadzone), 0.04, 0.5);
        if (v === s.deadzone) return false;
        s.deadzone = v;
        break;
      }
      case 'snap8':
      case 'haptics':
      case 'hints': {
        const v = !!value;
        if (s[key] === v) return false;
        s[key] = v;
        if (key === 'hints' && !v) this._hideHint();
        break;
      }
      case 'layout': {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        s.layout = copy(value);
        break;
      }
      default:
        return false;
    }
    this._save();
    if (this.active) {
      if (key === 'size' || key === 'layout') this._applyLayout();
      this._syncSheet();
      if (this._mode === 'off') this._applyMode();
    }
    this._emitChange();
    return true;
  }

  /** 轻/重震动；老设备静默降级 */
  haptic(kind) {
    if (!this._settings.haptics) return;
    if (!this.win || !this.win.navigator || typeof this.win.navigator.vibrate !== 'function') return;
    const ua = this.win.navigator.userActivation;
    if (ua && ua.hasBeenActive === false) return;
    try {
      this.win.navigator.vibrate(kind === 'heavy' ? [16, 26, 18] : [8]);
    } catch (e) { /* 忽略 */ }
  }

  /** 订阅设置变化（内部齿轮面板改完通知设置页重画）；返回取消函数 */
  onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    this._listeners.add(cb);
    return () => { this._listeners.delete(cb); };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    try { this._releaseAll(); } catch (e) {}
    if (this._ac) {
      try { this._ac.abort(); } catch (e) {}
      this._ac = null;
    }
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    clearTimeout(this._refreshTimer);
    clearTimeout(this._toastTimer);
    clearTimeout(this._hintTimer);
    if (this._mo) {
      try { this._mo.disconnect(); } catch (e) {}
      this._mo = null;
    }
    if (this._i18nOff) {
      try { this._i18nOff(); } catch (e) {}
      this._i18nOff = null;
    }
    if (this._installMo) {
      try { this._installMo.disconnect(); } catch (e) {}
      this._installMo = null;
    }
    if (this._bodyMo) {
      try { this._bodyMo.disconnect(); } catch (e) {}
      this._bodyMo = null;
    }
    if (this.refs && this.refs.root) {
      try { this.refs.root.remove(); } catch (e) {}
    }
    try { this.doc.body.classList.remove('hks-pad-on'); } catch (e) {}
    this._listeners.clear();
    this.active = false;
    this._mode = 'off';
    this._editing = false;
    this._sheetOpen = false;
  }

  /* ------------------------------ 初始化 ------------------------------ */

  _warn(text) {
    try { console.warn('[TouchPad] ' + text); } catch (e) {}
  }

  _hasInputApi() {
    const i = this.input;
    return !!(i && typeof i.setStick === 'function' && typeof i.padPress === 'function' && typeof i.padRelease === 'function');
  }

  _shouldActivate() {
    const i = this.input;
    if (i && typeof i.touchDevice === 'boolean') return i.touchDevice === true;
    try {
      return !!(this.win.matchMedia && this.win.matchMedia('(pointer: coarse)').matches);
    } catch (e) {
      return false;
    }
  }

  _readHintSeen() {
    try {
      const raw = JSON.parse(localStorage.getItem(HINT_KEY) || 'null');
      return !!(raw && raw.gestureSeen);
    } catch (e) {
      return false;
    }
  }

  _writeHintSeen() {
    try { localStorage.setItem(HINT_KEY, JSON.stringify({ gestureSeen: true })); } catch (e) {}
  }

  _save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this._settings)); } catch (e) {}
  }

  _emitChange() {
    if (!this.active || !this.refs) return;
    const detail = this.getSettings();
    for (const cb of [...this._listeners]) {
      try { cb(detail); } catch (e) {}
    }
    try {
      this.refs.root.dispatchEvent(new CustomEvent('hks-pad-settings', { detail }));
    } catch (e) {}
  }

  /** 语言切换 / 首次渲染：把带 data-i18n 的界面文案与 aria-label 重刷一遍 */
  _rebuildI18n() {
    if (!this.active || !this.refs || !this.refs.root) return;
    const root = this.refs.root;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = tr(key);
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) el.setAttribute('aria-label', tr(key));
    });
    root.querySelectorAll('[data-scheme-set]').forEach((el) => {
      const scheme = el.getAttribute('data-scheme-set');
      if (SCHEME_LABEL[scheme]) el.textContent = tr(SCHEME_LABEL[scheme]);
    });
    ACTION_IDS.forEach((id) => {
      const btn = root.querySelector('[data-action="' + id + '"]');
      if (!btn) return;
      const label = tr(ACTIONS[id].label);
      const span = btn.querySelector('.hks-pad-btn-label');
      if (span) span.textContent = label;
      btn.setAttribute('aria-label', label);
    });
  }

  _buildDom() {
    const root = this.doc.createElement('div');
    root.id = 'hksTouchPad';
    root.className = 'hks-pad';
    root.setAttribute('data-mode', 'off');
    root.setAttribute('data-scheme', this._settings.scheme);
    root.setAttribute('aria-hidden', 'true');

    const actionHTML = ACTION_IDS.map((id) => {
      const def = ACTIONS[id];
      return '<div class="hks-pad-slot" data-slot="' + id + '">' +
        '<button type="button" class="hks-pad-btn hks-pad-btn--' + def.tone + '" data-hks-pad="' + id + '" data-action="' + id + '">' +
        '<span class="hks-pad-btn-ico">' + svg(def.icon) + '</span>' +
        '<span class="hks-pad-btn-label"></span>' +
        '</button></div>';
    }).join('');

    root.innerHTML =
      '<div class="hks-pad-layer hks-pad-layer-stick">' +
        '<div class="hks-pad-stick-zone" data-stick-zone></div>' +
        '<div class="hks-pad-slot" data-slot="stick">' +
          '<div class="hks-pad-stick" data-hks-pad="stick" role="button" data-i18n-aria="虚拟摇杆">' +
            '<span class="hks-pad-stick-ring"></span>' +
            '<span class="hks-pad-stick-knob">' + svg('stick') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="hks-pad-layer hks-pad-layer-gesture">' +
        '<div class="hks-pad-zone hks-pad-zone--left" data-gesture-zone="left"><span class="hks-pad-zone-tip" data-i18n="左半屏拖动移动 · 双击冲刺">左半屏拖动移动 · 双击冲刺</span></div>' +
        '<div class="hks-pad-zone hks-pad-zone--right" data-gesture-zone="right"><span class="hks-pad-zone-tip" data-i18n="按住射击 · 上滑跳跃 · 下滑低速 · 双指符卡">按住射击 · 上滑跳跃 · 下滑低速 · 双指符卡</span></div>' +
      '</div>' +
      '<div class="hks-pad-layer hks-pad-layer-keys"></div>' +
      '<div class="hks-pad-layer hks-pad-layer-actions">' + actionHTML + '</div>' +
      '<div class="hks-pad-layer hks-pad-layer-top">' +
        '<div class="hks-pad-slot" data-slot="pause">' +
          '<button type="button" class="hks-pad-btn hks-pad-btn--plain hks-pad-btn--mini" data-hks-pad="pause" data-top-action="pause" data-i18n-aria="暂停">' +
            '<span class="hks-pad-btn-ico">' + svg('pause') + '</span>' +
          '</button>' +
        '</div>' +
        '<div class="hks-pad-slot" data-slot="gear">' +
          '<button type="button" class="hks-pad-btn hks-pad-btn--plain hks-pad-btn--mini" data-hks-pad="gear" data-top-action="gear" data-i18n-aria="触屏手柄设置">' +
            '<span class="hks-pad-btn-ico">' + svg('gear') + '</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="hks-pad-layer hks-pad-layer-dialogue">' +
        '<button type="button" class="hks-pad-continue" data-hks-pad="continue" data-continue data-i18n-aria="继续">' +
          '<span class="hks-pad-continue-arrow">▼</span><span data-i18n="继续">继续</span>' +
        '</button>' +
      '</div>' +
      '<div class="hks-pad-shade" hidden></div>' +
      '<div class="hks-pad-hint" hidden>' +
        '<div class="hks-pad-hint-card">' +
          '<div class="hks-pad-hint-title" data-i18n="手势操作">手势操作</div>' +
          '<ul class="hks-pad-hint-list">' +
            '<li data-i18n="左半屏 按住拖动移动 · 双击冲刺">左半屏 按住拖动移动 · 双击冲刺</li>' +
            '<li data-i18n="右半屏 按住射击 · 上滑跳跃 · 下滑低速">右半屏 按住射击 · 上滑跳跃 · 下滑低速</li>' +
            '<li data-i18n="右半屏双指 轻点释放符卡">右半屏双指 轻点释放符卡</li>' +
          '</ul>' +
          '<button type="button" class="hks-pad-chip is-primary" data-hint-close data-i18n="知道了">知道了</button>' +
        '</div>' +
      '</div>' +
      '<div class="hks-pad-editbar" hidden>' +
        '<div class="hks-pad-editbar-tip" data-i18n="拖动控件调整位置">拖动控件调整位置</div>' +
        '<div class="hks-pad-seg">' + editbarSchemeHTML + '</div>' +
        '<div class="hks-pad-editbar-btns">' +
          '<button type="button" class="hks-pad-chip hks-pad-chip--icon" data-sheet-open data-i18n-aria="触屏手柄设置">' + svg('gear') + '</button>' +
          '<button type="button" class="hks-pad-chip" data-edit-reset data-i18n="重置">重置</button>' +
          '<button type="button" class="hks-pad-chip is-primary" data-edit-done data-i18n="完成">完成</button>' +
        '</div>' +
      '</div>' +
      '<div class="hks-pad-sheet-layer" hidden>' +
        '<div class="hks-pad-sheet-backdrop" data-sheet-close></div>' +
        '<div class="hks-pad-sheet" role="dialog" aria-modal="true" data-i18n-aria="触屏手柄设置">' +
          '<div class="hks-pad-sheet-head"><b data-i18n="触屏手柄设置">触屏手柄设置</b><button type="button" class="hks-pad-sheet-close" data-sheet-close data-i18n-aria="关闭">✕</button></div>' +
          '<div class="hks-pad-sheet-body">' +
            '<div class="hks-pad-row"><span class="hks-pad-row-label" data-i18n="操作方案">操作方案</span><div class="hks-pad-seg hks-pad-seg--sm">' + sheetSchemeHTML + '</div></div>' +
            '<label class="hks-pad-row"><span class="hks-pad-row-label" data-i18n="按键大小">按键大小</span><input type="range" data-setting="size" min="0.8" max="1.4" step="0.05"><b class="hks-pad-val" data-val="size"></b></label>' +
            '<label class="hks-pad-row"><span class="hks-pad-row-label" data-i18n="不透明度">不透明度</span><input type="range" data-setting="opacity" min="0.3" max="1" step="0.05"><b class="hks-pad-val" data-val="opacity"></b></label>' +
            '<label class="hks-pad-row"><span class="hks-pad-row-label" data-i18n="摇杆死区">摇杆死区</span><input type="range" data-setting="deadzone" min="0.04" max="0.4" step="0.01"><b class="hks-pad-val" data-val="deadzone"></b></label>' +
            '<div class="hks-pad-row"><span class="hks-pad-row-label" data-i18n="8 方向吸附">8 方向吸附</span><button type="button" class="hks-pad-switch" data-setting="snap8" role="switch" aria-checked="true"><i></i></button></div>' +
            '<div class="hks-pad-row"><span class="hks-pad-row-label" data-i18n="震动反馈">震动反馈</span><button type="button" class="hks-pad-switch" data-setting="haptics" role="switch" aria-checked="true"><i></i></button></div>' +
            '<div class="hks-pad-row"><span class="hks-pad-row-label" data-i18n="手势提示">手势提示</span><button type="button" class="hks-pad-switch" data-setting="hints" role="switch" aria-checked="true"><i></i></button></div>' +
            '<div class="hks-pad-row hks-pad-row--btns">' +
              '<button type="button" class="hks-pad-chip" data-sheet-edit data-i18n="布局编辑">布局编辑</button>' +
              '<button type="button" class="hks-pad-chip" data-sheet-reset data-i18n="恢复默认">恢复默认</button>' +
            '</div>' +
            '<p class="hks-pad-note" data-i18n="摇杆松手自动回中；设置保存在本机。">摇杆松手自动回中；设置保存在本机。</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="hks-pad-toast" aria-live="polite"></div>';

    this.host.appendChild(root);
    this.doc.body.classList.add('hks-pad-on');

    const q = (sel) => root.querySelector(sel);
    const slots = {};
    root.querySelectorAll('.hks-pad-slot[data-slot]').forEach((slot) => {
      slots[slot.dataset.slot] = { slot, el: slot.querySelector('[data-hks-pad]') };
    });
    const actionBtns = {};
    root.querySelectorAll('[data-action]').forEach((el) => { actionBtns[el.dataset.action] = el; });

    this.refs = {
      root,
      stickLayer: q('.hks-pad-layer-stick'),
      gestureLayer: q('.hks-pad-layer-gesture'),
      keysLayer: q('.hks-pad-layer-keys'),
      actionsLayer: q('.hks-pad-layer-actions'),
      topLayer: q('.hks-pad-layer-top'),
      dialogueLayer: q('.hks-pad-layer-dialogue'),
      hintLayer: q('.hks-pad-hint'),
      editbar: q('.hks-pad-editbar'),
      sheetLayer: q('.hks-pad-sheet-layer'),
      shade: q('.hks-pad-shade'),
      sheet: q('.hks-pad-sheet'),
      toast: q('.hks-pad-toast'),
      stickZone: q('[data-stick-zone]'),
      zones: {
        left: q('[data-gesture-zone="left"]'),
        right: q('[data-gesture-zone="right"]'),
      },
      stickSlot: slots.stick ? slots.stick.slot : null,
      stickEl: slots.stick ? slots.stick.el : null,
      stickKnob: q('.hks-pad-stick-knob'),
      pauseBtn: q('[data-top-action="pause"]'),
      gearBtn: q('[data-top-action="gear"]'),
      continueBtn: q('[data-continue]'),
      slots,
      actionBtns,
    };
    this._hintOpen = false;
  }

  _bind() {
    this._ac = typeof AbortController === 'function' ? new AbortController() : null;
    const signal = this._ac ? this._ac.signal : undefined;
    const opts = signal ? { signal } : {};
    const refs = this.refs;
    const root = refs.root;

    root.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    root.addEventListener('dragstart', (e) => e.preventDefault(), opts);
    root.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false, ...opts });

    // 布局编辑：捕获阶段拦截，避免按钮自己的按下逻辑
    root.addEventListener('pointerdown', (e) => this._onEditDown(e), { capture: true, ...opts });
    root.addEventListener('pointermove', (e) => this._onDragMove(e), { capture: true, ...opts });
    root.addEventListener('pointerup', (e) => this._onDragEnd(e), { capture: true, ...opts });
    root.addEventListener('pointercancel', (e) => this._onDragEnd(e), { capture: true, ...opts });
    root.addEventListener('lostpointercapture', (e) => this._onDragEnd(e), { capture: true, ...opts });

    for (const id of ACTION_IDS) {
      if (refs.actionBtns[id]) this._bindHoldButton(refs.actionBtns[id], id);
    }
    if (refs.pauseBtn) this._bindHoldButton(refs.pauseBtn, 'pause');
    if (refs.continueBtn) this._bindHoldButton(refs.continueBtn, 'confirm');
    if (refs.gearBtn) {
      refs.gearBtn.addEventListener('pointerdown', (e) => {
        if (this._editing) return;
        if (this._mode !== 'play') return;
        e.preventDefault();
        e.stopPropagation();
        this._openSheet();
      }, opts);
    }

    this._bindStick();
    this._bindGesture();

    root.addEventListener('click', (e) => this._onClick(e), opts);
    root.addEventListener('input', (e) => this._onInput(e), opts);
    refs.sheetLayer.addEventListener('pointerdown', (e) => e.stopPropagation(), opts);
    refs.editbar.addEventListener('pointerdown', (e) => e.stopPropagation(), opts);

    // 视口 / 安全区 / 前后台
    this.win.addEventListener('resize', () => this._scheduleRefresh(80), { passive: true, ...opts });
    this.win.addEventListener('orientationchange', () => {
      this._releaseAll();
      this._scheduleRefresh(120);
      this._later(() => this.refresh(), 420);
    }, { passive: true, ...opts });
    if (this.win.visualViewport) {
      this.win.visualViewport.addEventListener('resize', () => this._scheduleRefresh(80), { passive: true, ...opts });
    }
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'hidden') this._releaseAll();
    }, opts);
    this.win.addEventListener('blur', () => this._releaseAll(), opts);
    this.win.addEventListener('pagehide', () => this._releaseAll(), opts);

    this._observeHud();
    this._observeInstallBar();
  }

  _bindHoldButton(el, action) {
    const signal = this._ac ? this._ac.signal : undefined;
    const opts = signal ? { signal } : {};
    const down = (e) => {
      if (this.destroyed || this._editing) return;
      if (!this._canPress(action)) return;
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      el.classList.add('is-pressed');
      this._setHold(e.pointerId, action);
      if (action !== 'confirm') this.haptic(action === 'dash' || action === 'cast' ? 'heavy' : 'light');
    };
    const up = (e) => {
      if (this.destroyed) return;
      const set = this._pointers.get(e.pointerId);
      if (!set || !set.has(action)) return;
      e.preventDefault?.();
      this._clearHold(e.pointerId, action);
      if (!(this._holds.get(action) > 0)) el.classList.remove('is-pressed');
    };
    el.addEventListener('pointerdown', down, opts);
    el.addEventListener('pointerup', up, opts);
    el.addEventListener('pointercancel', up, opts);
    el.addEventListener('lostpointercapture', up, opts);
  }

  _bindStick() {
    const zone = this.refs.stickZone;
    const signal = this._ac ? this._ac.signal : undefined;
    const opts = signal ? { signal } : {};
    const down = (e) => {
      if (this._mode !== 'play' || this._editing || this._stickPointer) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { zone.setPointerCapture(e.pointerId); } catch (err) {}
      this._stickPointer = e.pointerId;
      const dock = this._centers.stick || { x: this._vw * 0.16, y: this._vh * 0.82 };
      const dist = Math.hypot(e.clientX - dock.x, e.clientY - dock.y);
      const center = dist <= this._stickR * 1.15 ? { x: dock.x, y: dock.y } : { x: e.clientX, y: e.clientY };
      this._stickCenter = center;
      this.refs.stickSlot.classList.add('is-active');
      this._setSlotCenter('stick', center.x, center.y);
      this._updateStick(e.clientX, e.clientY);
      this.haptic('light');
    };
    const move = (e) => {
      if (e.pointerId !== this._stickPointer) return;
      e.preventDefault();
      this._updateStick(e.clientX, e.clientY);
    };
    const up = (e) => {
      if (e.pointerId !== this._stickPointer) return;
      this._stickPointer = 0;
      this._stickCenter = null;
      this._setStickOut(0, 0);
      if (this.refs.stickKnob) this.refs.stickKnob.style.transform = 'translate3d(0,0,0)';
      this.refs.stickSlot.classList.remove('is-active');
      const dock = this._centers.stick;
      if (dock) this._setSlotCenter('stick', dock.x, dock.y);
    };
    zone.addEventListener('pointerdown', down, opts);
    zone.addEventListener('pointermove', move, opts);
    zone.addEventListener('pointerup', up, opts);
    zone.addEventListener('pointercancel', up, opts);
    zone.addEventListener('lostpointercapture', up, opts);
  }

  _bindGesture() {
    const signal = this._ac ? this._ac.signal : undefined;
    const opts = signal ? { signal } : {};

    const left = this.refs.zones.left;
    if (left) {
      left.addEventListener('pointerdown', (e) => {
        if (this._mode !== 'play' || this._editing || this._gestureLeft) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try { left.setPointerCapture(e.pointerId); } catch (err) {}
        const now = Date.now();
        const doubleTap = this._lastLeftTapAt > 0 && now - this._lastLeftTapAt < 320 &&
          this._lastLeftTapPos && Math.hypot(e.clientX - this._lastLeftTapPos.x, e.clientY - this._lastLeftTapPos.y) < 46;
        this._lastLeftTapAt = doubleTap ? 0 : now;
        this._lastLeftTapPos = { x: e.clientX, y: e.clientY };
        this._gestureLeft = { pid: e.pointerId, sx: e.clientX, sy: e.clientY };
        if (doubleTap) this._gestureDash();
      }, opts);

      left.addEventListener('pointermove', (e) => {
        const rec = this._gestureLeft;
        if (!rec || rec.pid !== e.pointerId) return;
        e.preventDefault();
        const dx = e.clientX - rec.sx;
        const dy = e.clientY - rec.sy;
        const v = this._analog(dx, dy, 64);
        this._setStickOut(v.x, v.y);
      }, opts);

      const leftUp = (e) => {
        const rec = this._gestureLeft;
        if (!rec || rec.pid !== e.pointerId) return;
        this._gestureLeft = null;
        this._setStickOut(0, 0);
      };
      left.addEventListener('pointerup', leftUp, opts);
      left.addEventListener('pointercancel', leftUp, opts);
      left.addEventListener('lostpointercapture', leftUp, opts);
    }

    const right = this.refs.zones.right;
    if (right) {
      right.addEventListener('pointerdown', (e) => {
        if (this._mode !== 'play' || this._editing) return;
        if (this._gestureRight.length >= 2) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try { right.setPointerCapture(e.pointerId); } catch (err) {}
        const first = this._gestureRight.length === 0;
        const rec = {
          pid: e.pointerId, sx: e.clientX, sy: e.clientY,
          first, jumped: false, slowed: false,
        };
        this._gestureRight.push(rec);
        if (first) {
          this._setHold(e.pointerId, 'shoot');
          this.haptic('light');
        } else {
          this._setHold(e.pointerId, 'cast');
          this.haptic('heavy');
        }
      }, opts);

      right.addEventListener('pointermove', (e) => {
        const rec = this._gestureRight.find((r) => r.pid === e.pointerId);
        if (!rec || !rec.first) return;
        e.preventDefault();
        const dx = e.clientX - rec.sx;
        const dy = e.clientY - rec.sy;
        const threshold = Math.max(14, Math.min(26, (this._metrics ? this._metrics.b : 44) * 0.42));
        if (!rec.jumped && dy < -threshold && Math.abs(dy) > Math.abs(dx) * 1.1) {
          rec.jumped = true;
          this._setHold(e.pointerId, 'jump');
          this.haptic('light');
        } else if (!rec.slowed && dy > threshold && Math.abs(dy) > Math.abs(dx) * 1.1) {
          rec.slowed = true;
          this._setHold(e.pointerId, 'slow');
          this.haptic('light');
        }
      }, opts);

      const rightUp = (e) => {
        const i = this._gestureRight.findIndex((r) => r.pid === e.pointerId);
        if (i < 0) return;
        this._gestureRight.splice(i, 1);
        this._clearPointer(e.pointerId);
      };
      right.addEventListener('pointerup', rightUp, opts);
      right.addEventListener('pointercancel', rightUp, opts);
      right.addEventListener('lostpointercapture', rightUp, opts);
    }
  }

  _observeInstallBar() {
    if (typeof this.win.MutationObserver !== 'function' || !this.doc.body) return;
    this._installBarEl = null;
    const bind = (el) => {
      if (!el || el === this._installBarEl) return;
      this._installBarEl = el;
      try {
        this._installMo = new this.win.MutationObserver(() => this._scheduleRefresh(40));
        this._installMo.observe(el, { attributes: true, attributeFilter: ['class'] });
      } catch (e) { /* 忽略 */ }
    };
    bind(this.doc.querySelector('.hks-install'));
    try {
      this._bodyMo = new this.win.MutationObserver((muts) => {
        for (const m of muts) {
          for (const node of m.addedNodes || []) {
            if (node && node.nodeType === 1) {
              if (node.classList && node.classList.contains('hks-install')) bind(node);
              else if (node.querySelector) bind(node.querySelector('.hks-install'));
            }
          }
        }
        this._scheduleRefresh(40);
      });
      this._bodyMo.observe(this.doc.body, { childList: true });
    } catch (e) { /* 忽略 */ }
  }

  _observeHud() {
    if (typeof this.win.MutationObserver !== 'function') return;
    try {
      this._mo = new this.win.MutationObserver(() => this._scheduleRefresh(40));
      for (const sel of ['#hud', '#bossBar', '#dialogue']) {
        const el = this.doc.querySelector(sel);
        if (el) this._mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
      }
    } catch (e) { /* 忽略 */ }
  }

  /* ------------------------------ 布局 / 尺寸 ------------------------------ */

  _readSafeInsets() {
    const fallback = { top: 0, right: 0, bottom: 0, left: 0 };
    try {
      const probe = this.doc.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      this.doc.body.appendChild(probe);
      const cs = this.win.getComputedStyle(probe);
      const out = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
      probe.remove();
      return out;
    } catch (e) {
      return fallback;
    }
  }

  /** 平台层底部安装条可见时，把控件整体抬到它上方，避免被 z9000 的安装条盖住 */
  _installLift() {
    try {
      const el = this.doc.querySelector('.hks-install.show');
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const cs = this.win.getComputedStyle(el);
      if (!r || r.height < 4) return 0;
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.1) return 0;
      return Math.min(130, Math.round(r.height) + 10);
    } catch (e) { return 0; }
  }

  _idsForScheme(scheme) {
    if (scheme === 'keys') return ['left', 'right', 'shoot', 'jump', 'slow', 'dash', 'cast', 'pause', 'gear'];
    if (scheme === 'stick') return ['stick', 'shoot', 'jump', 'slow', 'dash', 'cast', 'pause', 'gear'];
    return ['pause', 'gear'];
  }

  _defaultPositions(scheme) {
    const { vw, vh, b, m, safe, installLift } = this._metrics;
    const S = this._sizes.shoot;
    const B = b;
    const gap = Math.max(8, b * 0.34);
    const lift = installLift || 0;
    const bottomY = vh - safe.bottom - m - lift - S / 2;
    const jumpX = vw - safe.right - m - B / 2;
    const shootX = jumpX - B / 2 - gap - S / 2;
    const slowX = shootX - S / 2 - gap - B / 2;
    const topY = bottomY - S / 2 - Math.max(8, b * 0.28) - B / 2;
    const pause = { x: vw - safe.right - 6 - this._sizes.pause / 2, y: safe.top + 6 + this._sizes.pause / 2 };
    const gear = { x: pause.x - this._sizes.pause - Math.max(8, b * 0.2), y: pause.y };
    const out = { pause, gear };
    if (scheme === 'stick') {
      const R = this._baseSize() / 2;
      out.stick = { x: safe.left + m + R, y: vh - safe.bottom - m - lift - R };
      out.shoot = { x: shootX, y: bottomY };
      out.jump = { x: jumpX, y: bottomY };
      out.slow = { x: slowX, y: bottomY };
      out.dash = { x: (slowX + shootX) / 2, y: topY };
      out.cast = { x: (shootX + jumpX) / 2, y: topY };
    } else if (scheme === 'keys') {
      const K = this._sizes.left;
      const gapK = Math.max(10, b * 0.4);
      const ky = vh - safe.bottom - m - lift - K / 2;
      const lx = safe.left + m + K / 2;
      out.left = { x: lx, y: ky };
      out.right = { x: lx + K + gapK, y: ky };
      out.shoot = { x: shootX, y: bottomY };
      out.jump = { x: jumpX, y: bottomY };
      out.slow = { x: slowX, y: bottomY };
      out.dash = { x: (slowX + shootX) / 2, y: topY };
      out.cast = { x: (shootX + jumpX) / 2, y: topY };
    }
    return out;
  }

  _baseSize() {
    return (this._sizes && this._sizes.stick) || Math.min(this._vw * 0.3, this._vh * 0.42);
  }

  _applyLayout() {
    if (!this.refs || !this._metrics) return;
    const { vw, vh } = this._metrics;
    const scheme = this._settings.scheme;
    const ids = this._idsForScheme(scheme);
    const defs = this._defaultPositions(scheme);
    const saved = (this._settings.layout && this._settings.layout[scheme]) || {};
    for (const [id, slotRef] of Object.entries(this.refs.slots)) {
      if (!slotRef || !slotRef.slot) continue;
      slotRef.slot.classList.toggle('is-off', !ids.includes(id));
    }
    for (const id of ids) {
      const def = defs[id];
      if (!def) continue;
      const savedPos = saved[id];
      let px = def.x;
      let py = def.y;
      if (savedPos && Number.isFinite(+savedPos.x) && Number.isFinite(+savedPos.y)) {
        px = clamp(+savedPos.x, 0, 1) * vw;
        py = clamp(+savedPos.y, 0, 1) * vh;
      }
      const c = this._clampCenter(id, px, py);
      if ((id === 'pause' || id === 'gear') && !this._editing) {
        c.y = this._clampCenter(id, c.x, this._avoidHudY(id, c.x, c.y)).y;
      } else if ((id === 'pause' || id === 'gear') && this._editing && this.refs.editbar) {
        const bar = this.refs.editbar.getBoundingClientRect();
        if (bar.height > 0) {
          const minY = bar.bottom + 8 + (this._sizes[id] || 44) / 2;
          if (c.y < minY) c.y = this._clampCenter(id, c.x, minY).y;
        }
      }
      this._centers[id] = c;
      this._setSlotCenter(id, c.x, c.y);
      this._sizeSlot(id);
    }
    this._applyVisual();
  }

  _setSlotCenter(id, x, y) {
    const s = this.refs && this.refs.slots && this.refs.slots[id];
    if (!s || !s.slot) return;
    const size = (this._sizes && this._sizes[id]) || 44;
    s.slot.style.width = size + 'px';
    s.slot.style.height = size + 'px';
    s.slot.style.transform = 'translate3d(' + Math.round(x - size / 2) + 'px,' + Math.round(y - size / 2) + 'px,0)';
  }

  _sizeSlot(id) {
    const s = this.refs && this.refs.slots && this.refs.slots[id];
    if (!s || !s.el) return;
    const size = this._sizes[id] || this._sizes.jump || 44;
    s.el.style.width = size + 'px';
    s.el.style.height = size + 'px';
    s.el.style.setProperty('--hks-btn-size', size + 'px');
  }

  _clampCenter(id, x, y) {
    const { vw, vh, safe } = this._metrics;
    const size = this._sizes[id] || this._metrics.b;
    const half = size / 2;
    let minX = safe.left + 2 + half;
    let maxX = vw - safe.right - 2 - half;
    let minY = safe.top + 2 + half;
    let maxY = vh - safe.bottom - 2 - half;
    if (id === 'stick') {
      const z = this._stickZoneRect();
      minX = z.left + half + 2;
      maxX = z.right - half - 2;
      minY = z.top + half + 2;
      maxY = z.bottom - half - 2;
    }
    if (maxX < minX) return { x: vw / 2, y: clamp(y, minY, Math.max(minY, maxY)) };
    if (maxY < minY) return { x: clamp(x, minX, Math.max(minX, maxX)), y: vh / 2 };
    return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
  }

  _stickZoneRect() {
    const { vw, vh, safe } = this._metrics;
    return {
      left: safe.left,
      right: safe.left + vw * 0.42,
      top: vh - vh * 0.62,
      bottom: vh - safe.bottom,
    };
  }

  _hudRects() {
    if (!this.doc) return [];
    const out = [];
    for (const sel of ['#hud', '#bossBar', '#settingsBtn']) {
      const el = this.doc.querySelector(sel);
      if (!el) continue;
      try {
        const cs = this.win.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        out.push(r);
      } catch (e) { /* 忽略 */ }
    }
    return out;
  }

  _avoidHudY(id, x, y) {
    const rects = this._hudRects();
    if (!rects.length) return y;
    const half = (this._sizes[id] || 44) / 2 + 4;
    let yy = y;
    for (let i = 0; i < 8; i++) {
      const box = { left: x - half, right: x + half, top: yy - half, bottom: yy + half };
      const hit = rects.find((r) => box.right > r.left && box.left < r.right && box.bottom > r.top && box.top < r.bottom);
      if (!hit) break;
      yy = hit.bottom + 8 + half;
    }
    return yy;
  }

  _applyVisual() {
    if (!this.refs || !this.refs.root) return;
    this.refs.root.style.setProperty('--hks-opacity', String(this._settings.opacity));
  }

  _applyMode() {
    if (!this.refs) return;
    let mode = 'off';
    if (this._editing) mode = 'edit';
    else if (this._state === 'play') mode = 'play';
    else if (this._state === 'dialogue') mode = 'dialogue';
    this._mode = mode;
    const root = this.refs.root;
    root.dataset.mode = mode;
    root.dataset.scheme = this._settings.scheme;
    root.classList.toggle('is-dialogue', mode === 'dialogue');
    if (mode !== 'play' && mode !== 'edit') this._releaseAll();
    if (mode !== 'play') this._hideHint();
    this._applyLayers();
    this._refreshPressed();
  }

  _applyLayers() {
    if (!this.refs) return;
    const r = this.refs;
    const scheme = this._settings.scheme;
    const canPlay = this._mode === 'play' || this._mode === 'edit';
    if (r.stickLayer) r.stickLayer.hidden = !(canPlay && scheme === 'stick');
    if (r.gestureLayer) r.gestureLayer.hidden = !(canPlay && scheme === 'gesture');
    if (r.keysLayer) r.keysLayer.hidden = !(canPlay && scheme === 'keys');
    if (r.actionsLayer) r.actionsLayer.hidden = !(canPlay && (scheme === 'stick' || scheme === 'keys'));
    if (r.topLayer) r.topLayer.hidden = !canPlay;
    if (r.dialogueLayer) r.dialogueLayer.hidden = this._mode !== 'dialogue';
    if (r.editbar) r.editbar.hidden = this._mode !== 'edit';
    if (r.hintLayer) r.hintLayer.hidden = !(this._hintOpen && this._mode === 'play');
    if (r.shade) r.shade.hidden = this._mode !== 'edit';
    if (r.sheetLayer) r.sheetLayer.hidden = !this._sheetOpen;
  }

  /* ------------------------------ 输入动作 ------------------------------ */

  _canPress(action) {
    if (this._editing) return false;
    if (action === 'confirm') return this._mode === 'dialogue';
    if (action === 'pause') return this._mode === 'play';
    return this._mode === 'play';
  }

  _setHold(pointerId, action) {
    let set = this._pointers.get(pointerId);
    if (set && set.has(action)) return;
    if (!set) {
      set = new Set();
      this._pointers.set(pointerId, set);
    }
    set.add(action);
    const n = (this._holds.get(action) || 0) + 1;
    this._holds.set(action, n);
    if (n === 1) {
      try { this.input.padPress(action); } catch (e) { /* 老缓存 */ }
    }
    this._refreshPressed();
  }

  _clearHold(pointerId, action) {
    const set = this._pointers.get(pointerId);
    if (!set || !set.has(action)) return;
    set.delete(action);
    if (set.size === 0) this._pointers.delete(pointerId);
    const n = Math.max(0, (this._holds.get(action) || 1) - 1);
    if (n === 0) {
      this._holds.delete(action);
      try { this.input.padRelease(action); } catch (e) {}
    } else {
      this._holds.set(action, n);
    }
    this._refreshPressed();
  }

  _clearPointer(pointerId) {
    const set = this._pointers.get(pointerId);
    if (!set) return;
    for (const action of [...set]) this._clearHold(pointerId, action);
  }

  _releaseAll() {
    if (this.destroyed && !this.refs) return;
    const held = new Set(this._holds.keys());
    this._holds.clear();
    this._pointers.clear();
    for (const action of held) {
      try { this.input && this.input.padRelease(action); } catch (e) {}
    }
    if (this.input && typeof this.input.setStick === 'function') {
      try { this.input.setStick(0, 0); } catch (e) {}
    }
    this._lastStick = { x: 0, y: 0 };
    this._stickPointer = 0;
    this._stickCenter = null;
    this._gestureLeft = null;
    this._gestureRight.length = 0;
    if (this.refs) {
      if (this.refs.stickSlot) this.refs.stickSlot.classList.remove('is-active');
      if (this.refs.stickKnob) this.refs.stickKnob.style.transform = 'translate3d(0,0,0)';
      const dock = this._centers.stick;
      if (dock && this.refs.stickSlot) this._setSlotCenter('stick', dock.x, dock.y);
      this._refreshPressed();
    }
  }

  _refreshPressed() {
    if (!this.refs) return;
    const held = this._holds;
    for (const [id, el] of Object.entries(this.refs.actionBtns)) {
      if (el) el.classList.toggle('is-pressed', (held.get(id) || 0) > 0);
    }
    if (this.refs.pauseBtn) this.refs.pauseBtn.classList.toggle('is-pressed', (held.get('pause') || 0) > 0);
    if (this.refs.continueBtn) this.refs.continueBtn.classList.toggle('is-pressed', (held.get('confirm') || 0) > 0);
  }

  _setStickOut(x, y) {
    const nx = clamp(x, -1, 1);
    const ny = clamp(y, -1, 1);
    if (Math.abs(nx - this._lastStick.x) < 0.002 && Math.abs(ny - this._lastStick.y) < 0.002) return;
    this._lastStick.x = nx;
    this._lastStick.y = ny;
    try { this.input.setStick(nx, ny); } catch (e) {}
  }

  _analog(dx, dy, radius) {
    const dist = Math.hypot(dx, dy);
    const dz = this._settings.deadzone;
    const raw = Math.min(1, dist / Math.max(1, radius));
    if (dist < 0.001 || raw <= dz) return { x: 0, y: 0 };
    if (this._settings.snap8) {
      const idx = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const dirs = [
        [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
      ];
      const d = dirs[idx];
      if (Math.abs(d[0]) > 0) this._lastDir = d[0];
      // 方向吸附、幅度保留：对角线按单位向量缩放，交给 Input 的径向死区再归一化
      const len = Math.hypot(d[0], d[1]);
      return { x: d[0] / len * raw, y: d[1] / len * raw };
    }
    const ux = dx / dist;
    const uy = dy / dist;
    if (Math.abs(ux) > 0.25) this._lastDir = Math.sign(ux);
    // 非吸附分支同样只做死区门控、保留幅度，避免和 Input 的 0.12 死区二次压缩
    return { x: ux * raw, y: uy * raw };
  }

  _updateStick(px, py) {
    const c = this._stickCenter;
    if (!c) return;
    const dx = px - c.x;
    const dy = py - c.y;
    const dist = Math.hypot(dx, dy);
    const R = this._stickR || 1;
    const raw = Math.min(1, dist / R);
    const dz = this._settings.deadzone;
    let ox = 0;
    let oy = 0;
    let vx = 0;
    let vy = 0;
    if (dist > 0.001 && raw > dz) {
      if (this._settings.snap8) {
        const v = this._analog(dx, dy, R);
        ox = v.x;
        oy = v.y;
        const len = Math.hypot(ox, oy) || 1;
        const travel = Math.min(dist, this._knobTravel);
        vx = (ox / len) * travel;
        vy = (oy / len) * travel;
      } else {
        const ux = dx / dist;
        const uy = dy / dist;
        ox = ux * raw;
        oy = uy * raw;
        if (Math.abs(ux) > 0.25) this._lastDir = Math.sign(ux);
        vx = ux * Math.min(dist, this._knobTravel);
        vy = uy * Math.min(dist, this._knobTravel);
      }
    }
    this._setStickOut(ox, oy);
    if (this.refs.stickKnob) {
      this.refs.stickKnob.style.transform = 'translate3d(' + vx.toFixed(1) + 'px,' + vy.toFixed(1) + 'px,0)';
    }
  }

  _gestureDash() {
    const moving = this._gestureLeft && (Math.abs(this._lastStick.x) > 0.2 || Math.abs(this._lastStick.y) > 0.2);
    const stamp = 'dash:' + (++this._pulseSeq);
    this._setHold(stamp, 'dash');
    let dirStamp = null;
    if (!moving && this._lastDir !== 0) {
      dirStamp = stamp + ':dir';
      this._setHold(dirStamp, this._lastDir < 0 ? 'left' : 'right');
    }
    this.haptic('heavy');
    this._later(() => {
      this._clearHold(stamp, 'dash');
      if (dirStamp) this._clearHold(dirStamp, this._lastDir < 0 ? 'left' : 'right');
    }, 130);
  }

  _pulse(action, ms = 90) {
    const stamp = 'pulse:' + (++this._pulseSeq);
    this._setHold(stamp, action);
    this._later(() => this._clearHold(stamp, action), ms);
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this._timers.add(id);
    return id;
  }

  /* ------------------------------ 面板 / 编辑器 ------------------------------ */

  _onClick(e) {
    if (this.destroyed) return;
    const t = e.target;
    const schemeBtn = t.closest && t.closest('[data-scheme-set]');
    if (schemeBtn) {
      e.preventDefault();
      this.setScheme(schemeBtn.dataset.schemeSet);
      return;
    }
    const settingBtn = t.closest && t.closest('[data-setting]');
    if (settingBtn && settingBtn.classList.contains('hks-pad-switch')) {
      e.preventDefault();
      const key = settingBtn.dataset.setting;
      this.setSetting(key, !this._settings[key]);
      return;
    }
    if (t.closest && t.closest('[data-edit-reset]')) { e.preventDefault(); this._resetLayout(); return; }
    if (t.closest && t.closest('[data-edit-done]')) { e.preventDefault(); this.closeOverlay(); return; }
    if (t.closest && t.closest('[data-sheet-open]')) { e.preventDefault(); this._openSheet(); return; }
    if (t.closest && t.closest('[data-sheet-close]')) { e.preventDefault(); this._closeSheet(); return; }
    if (t.closest && t.closest('[data-sheet-edit]')) { e.preventDefault(); this._closeSheet(); this.openLayoutEditor(); return; }
    if (t.closest && t.closest('[data-sheet-reset]')) { e.preventDefault(); this._resetAll(); return; }
    if (t.closest && t.closest('[data-hint-close]')) { e.preventDefault(); this._dismissHint(); return; }
  }

  _onInput(e) {
    const input = e.target && e.target.closest ? e.target.closest('input[data-setting]') : null;
    if (!input) return;
    this.setSetting(input.dataset.setting, parseFloat(input.value));
  }

  _openSheet() {
    if (!this.active || this.disabled || this.destroyed) return;
    if (this._sheetOpen) return;
    this._releaseAll();
    this._sheetOpen = true;
    this.refs.root.classList.add('is-overlay');
    this._syncSheet();
    this._applyLayers();
    if (this._mode === 'play') {
      // 打开面板时冻结游戏：暂停菜单会在面板关掉后留在下面
      this._pulse('pause', 90);
    }
    this.haptic('light');
  }

  _closeSheet(keepOverlay = false) {
    if (!this._sheetOpen) return;
    this._sheetOpen = false;
    if (!keepOverlay && !this._editing) this.refs.root.classList.remove('is-overlay');
    this._applyLayers();
  }

  _syncSheet() {
    if (!this.refs || !this.refs.sheet) return;
    const s = this._settings;
    for (const el of this.refs.sheet.querySelectorAll('[data-setting]')) {
      const key = el.dataset.setting;
      if (!(key in s)) continue;
      if (el.matches('input[type="range"]')) {
        el.value = String(s[key]);
      } else if (el.classList.contains('hks-pad-switch')) {
        el.setAttribute('aria-checked', String(!!s[key]));
      }
    }
    for (const el of this.refs.sheet.querySelectorAll('[data-val]')) {
      const key = el.dataset.val;
      if (key === 'size') el.textContent = Number(s.size).toFixed(2) + '×';
      else if (key === 'opacity') el.textContent = Math.round(s.opacity * 100) + '%';
      else if (key === 'deadzone') el.textContent = Number(s.deadzone).toFixed(2);
    }
    if (this.refs.root) {
      for (const btn of this.refs.root.querySelectorAll('[data-scheme-set]')) {
        btn.classList.toggle('is-on', btn.dataset.schemeSet === s.scheme);
      }
    }
  }

  _resetLayout() {
    const scheme = this._settings.scheme;
    if (this._settings.layout && this._settings.layout[scheme]) {
      delete this._settings.layout[scheme];
      this._save();
    }
    this._applyLayout();
    this._emitChange();
    this._toast(tr('已重置「{name}」布局', { name: tr(SCHEME_LABEL[scheme]) }));
  }

  _resetAll() {
    const keepScheme = this._settings.scheme;
    this._settings = {
      scheme: keepScheme, size: 1, opacity: 0.85, deadzone: 0.18,
      snap8: true, haptics: true, hints: true, layout: {},
    };
    this._releaseAll();
    this._save();
    this._applyMode();
    this._applyLayout();
    this._syncSheet();
    this._emitChange();
    this._toast(tr('触屏手柄已恢复默认'));
  }

  _toast(text) {
    const el = this.refs && this.refs.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('is-on'), 1600);
  }

  _maybeShowHint() {
    if (!this.active) return;
    if (!this._settings.hints || this._hintSeen) return;
    if (this._settings.scheme !== 'gesture') return;
    if (this._mode !== 'play') return;
    this._hintSeen = true;
    this._writeHintSeen();
    this._hintOpen = true;
    this._applyLayers();
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._hideHint(), 9000);
  }

  _hideHint() {
    if (!this._hintOpen) return;
    this._hintOpen = false;
    clearTimeout(this._hintTimer);
    this._applyLayers();
  }

  _dismissHint() {
    this._hintSeen = true;
    this._writeHintSeen();
    this._hideHint();
  }

  /* ------------------------------ 布局编辑拖拽 ------------------------------ */

  _onEditDown(e) {
    if (!this._editing || this.destroyed) return;
    const el = e.target && e.target.closest ? e.target.closest('[data-hks-pad]') : null;
    if (!el || el.hasAttribute('data-continue')) return;
    const slot = el.closest('.hks-pad-slot');
    if (!slot) return;
    if (slot.closest('.hks-pad-sheet-layer')) return;
    const id = slot.dataset.slot;
    const center = this._centers[id];
    if (!center) return;
    e.preventDefault();
    e.stopPropagation();
    this._hideHint();
    this._drag = {
      pid: e.pointerId,
      id,
      slot,
      startX: e.clientX,
      startY: e.clientY,
      cx: center.x,
      cy: center.y,
      moved: false,
    };
    slot.classList.add('is-dragging');
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  }

  _onDragMove(e) {
    const d = this._drag;
    if (!d || d.pid !== e.pointerId) return;
    e.preventDefault();
    const x = d.cx + (e.clientX - d.startX);
    const y = d.cy + (e.clientY - d.startY);
    const c = this._clampCenter(d.id, x, y);
    this._centers[d.id] = c;
    this._setSlotCenter(d.id, c.x, c.y);
    d.moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 2;
  }

  _onDragEnd(e) {
    const d = this._drag;
    if (!d || d.pid !== e.pointerId) return;
    this._drag = null;
    d.slot.classList.remove('is-dragging');
    if (!d.moved) return;
    const c = this._centers[d.id];
    if (!c) return;
    const scheme = this._settings.scheme;
    if (!this._settings.layout[scheme]) this._settings.layout[scheme] = {};
    this._settings.layout[scheme][d.id] = {
      x: +(c.x / this._vw).toFixed(4),
      y: +(c.y / this._vh).toFixed(4),
    };
    this._save();
    this._emitChange();
    this._toast(tr('已保存位置'));
  }

  /* ------------------------------ 视口 ------------------------------ */

  _scheduleRefresh(delay = 80) {
    if (!this.active || this.destroyed) return;
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = 0;
      this.refresh();
    }, Math.max(0, delay));
  }
}
