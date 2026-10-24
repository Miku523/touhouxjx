/**
 * 输入管理：键盘 + 虚拟手柄（触屏）+ 蓝牙手柄，统一抽象成「动作」。
 * - down(action)     当前是否按住（任意来源）
 * - pressed(action)  本逻辑帧是否刚按下（边沿，任意来源）
 * - released(action) 本逻辑帧是否刚松开（边沿，任意来源）
 * - pressedBy(action, source) / releasedBy(action, source)  分来源边沿
 * 使用后必须调用 endFrame() 清掉边沿状态。
 *
 * 来源：
 *  - 'key' 键盘
 *  - 'pad' 手机虚拟手柄（虚拟摇杆 + 按钮）
 *  - 'gp'  蓝牙 / 有线手柄（Gamepad API）
 *
 * 模拟量：
 *  - moveX / moveY 输出 -1..1 的模拟量（键盘为 ±1），带径向死区；
 *  - axisX / axisY 保留旧接口，返回 -1 / 0 / 1 的数字轴。
 *
 * 键位可在设置界面重绑定：
 *  - 每个动作有「主键 primary」和「副键 alt」，只改主键；
 *  - 副键永远是默认的第二键（例如移动的左/右仍有 A/D），
 *    这样即使用户改坏了键位，也总有一套能用的操作；
 *  - 新主键若被别的动作占着，两者互换，绝不会让某个动作失去按键；
 *  - 绑定存 localStorage，刷新后仍然生效。
 */

import { tr } from '../i18n/index.js';

/** 动作定义：主键可改，副键固定 */
export const ACTION_DEFS = [
  { action: 'left',    label: '左移',        primary: 'ArrowLeft',  alt: 'KeyA' },
  { action: 'right',   label: '右移',        primary: 'ArrowRight', alt: 'KeyD' },
  { action: 'up',      label: '上移 / 上选', primary: 'ArrowUp',    alt: 'KeyW' },
  { action: 'down',    label: '下移 / 下选', primary: 'ArrowDown',  alt: 'KeyS' },
  { action: 'jump',    label: '跳跃',        primary: 'Space',      alt: null },
  { action: 'shoot',   label: '射击',        primary: 'KeyZ',       alt: 'KeyJ' },
  { action: 'slow',    label: '低速移动',    primary: 'ShiftLeft',  alt: 'ShiftRight' },
  { action: 'dash',    label: '冲刺',        primary: 'KeyK',       alt: 'KeyC' },
  { action: 'cast',    label: '符卡',        primary: 'KeyX',       alt: 'KeyL' },
  { action: 'confirm', label: '确认',        primary: 'Enter',      alt: 'NumpadEnter' },
  { action: 'pause',   label: '暂停 / 菜单', primary: 'Escape',     alt: 'KeyP' },
  { action: 'restart', label: '重开本关',    primary: 'KeyR',       alt: null },
  { action: 'mute',    label: '静音',        primary: 'KeyM',       alt: null },
  { action: 'quit',    label: '退出',        primary: 'KeyQ',       alt: null },
];

/** 键码 → 显示名 */
const KEY_NAMES = {
  Space: '空格',
  Escape: 'Esc',
  Enter: '回车',
  NumpadEnter: '小键盘回车',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ShiftLeft: '左Shift',
  ShiftRight: '右Shift',
  ControlLeft: '左Ctrl',
  ControlRight: '右Ctrl',
  AltLeft: '左Alt',
  AltRight: '右Alt',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Backspace: '退格',
  Tab: 'Tab',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Delete: 'Del',
  Insert: 'Ins',
  Home: 'Home',
  End: 'End',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  NumpadAdd: '小键盘+',
  NumpadSubtract: '小键盘-',
  NumpadMultiply: '小键盘*',
  NumpadDivide: '小键盘/',
  NumpadDecimal: '小键盘.',
};

/** 键码 → 玩家看得懂的名字 */
export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return tr(KEY_NAMES[code]);
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return tr('小键盘') + code.slice(6);
  return code;
}

/** 动作 → 中文名 */
export function actionLabel(action) {
  return tr(ACTION_DEFS.find((d) => d.action === action)?.label || action);
}

const STORE_KEY = 'hks.keybinds.v1';

/** 摇杆死区：低于它视为没推（虚拟摇杆与蓝牙手柄共用） */
const STICK_DEADZONE = 0.12;

function defaultBinds() {
  /** @type {Map<string, {primary:string, alt:string|null}>} */
  const map = new Map();
  for (const d of ACTION_DEFS) map.set(d.action, { primary: d.primary, alt: d.alt || null });
  return map;
}

function loadBinds() {
  const map = defaultBinds();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return map;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return map;
    // 动作改名：'fast' 曾是「低速移动」的动作名，已统一为 'slow'。
    // 老存档里存的还是 fast，这里搬过来，避免玩家改动过的键位被静默丢弃。
    if (typeof saved.fast === 'string' && saved.fast && !saved.slow) saved.slow = saved.fast;
    for (const d of ACTION_DEFS) {
      const code = saved[d.action];
      if (typeof code === 'string' && code) map.get(d.action).primary = code;
    }
    // 存档里的主键可能和别人的副键撞车（例如把 J 绑给左移，而射击的副键就是 J）：
    // 以主键为准，清掉冲突的副键
    for (const [action, b] of map) {
      if (!b.alt) continue;
      for (const [other, ob] of map) {
        if (other !== action && ob.primary === b.alt) {
          b.alt = null;
          break;
        }
      }
    }
  } catch (e) {
    // 隐私模式 / 无 localStorage：静默回退到默认键位
  }
  return map;
}

function saveBinds(binds) {
  try {
    const out = {};
    for (const [action, b] of binds) out[action] = b.primary;
    window.localStorage.setItem(STORE_KEY, JSON.stringify(out));
  } catch (e) {
    // 写不进去不影响本局使用
  }
}

function clampAxis(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

export class Input {
  constructor() {
    /** 键盘按住的动作 */
    this._keyHeld = new Set();
    /** 虚拟手柄按住的动作 */
    this._padHeld = new Set();
    /** 蓝牙手柄按住的动作 */
    this._gpHeld = new Set();

    /** 所有来源的并集（兼容旧代码直接读 input.held 的写法） */
    this.held = new Map();
    /** @type {Set<string>} */
    this.justPressed = new Set();
    /** @type {Set<string>} */
    this.justReleased = new Set();

    /** 分来源边沿：action -> Set<source> */
    this._pressedBy = new Map();
    this._releasedBy = new Map();

    /** 虚拟摇杆 / 蓝牙手柄的模拟量（y 向下为正） */
    this._padStick = { x: 0, y: 0 };
    this._gpStick = { x: 0, y: 0 };

    /** 是否连接了蓝牙手柄（由 GamepadManager 维护） */
    this.gamepadConnected = false;

    // 说明：边沿集合在事件发生时就写入，由主循环在每次逻辑帧末调用 endFrame() 清空。
    // 这样 60Hz 的边沿不会因为一个渲染帧跑 0 或 2 次逻辑而丢失。
    this.anyKey = false;

    // 触屏设备判定：主指针是粗指针，且确实支持触摸。
    // 桌面（含带触摸屏的 Windows 笔记本）主指针是细指针，不会误判。
    const mq = (q) => {
      try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; }
    };
    const hasTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    this.touchDevice = !!(hasTouch && (mq('(pointer: coarse)') || !mq('(hover: hover)')));
    this.pointerCoarse = mq('(pointer: coarse)');

    /** @type {Map<string, {primary:string, alt:string|null}>} */
    this.binds = loadBinds();

    this._onKeyDown = (e) => {
      const action = this.actionOf(e.code);
      // 空格与方向键会滚动页面 / 移动焦点，一律拦掉
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.anyKey = true;
      if (action) this._setSource(this._keyHeld, action, true, 'key');
    };
    this._onKeyUp = (e) => {
      const action = this.actionOf(e.code);
      if (action) this._setSource(this._keyHeld, action, false, 'key');
    };
    this._onBlur = () => {
      // 失去焦点时全部松开，避免「卡键」
      this._releaseAll();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    this.pointerHandler = null; // 由 main 设置的首次交互回调
    const markGesture = () => this._markGesture();
    window.addEventListener('pointerdown', markGesture, { once: true });
    window.addEventListener('keydown', markGesture, { once: true });

    this._bindTouch();
  }

  /* ------------------------------------------------------------------ */
  /* 键位                                                                */
  /* ------------------------------------------------------------------ */

  /** 键码属于哪个动作（主键/副键都算），没有则 null */
  actionOf(code) {
    if (!code) return null;
    for (const [action, b] of this.binds) {
      if (b.primary === code || b.alt === code) return action;
    }
    return null;
  }

  /** 某动作的主键码 */
  keyOf(action) {
    return this.binds.get(action)?.primary || '';
  }

  /** 某动作的按键显示名（主键 / 副键） */
  labelFor(action) {
    const b = this.binds.get(action);
    if (!b) return '—';
    const main = keyLabel(b.primary);
    return b.alt ? `${main} / ${keyLabel(b.alt)}` : main;
  }

  /**
   * 改主键。若新键已被别的动作用主键，则两者互换。
   * @returns {boolean} 是否真的发生了改动
   */
  setBind(action, code) {
    const target = this.binds.get(action);
    if (!target || !code || target.primary === code) return false;
    // 选的正好是本动作当前的副键：把主副对调，别让 UI 显示成「A / A」
    if (target.alt === code) {
      const prev = target.primary;
      target.primary = code;
      target.alt = prev;
      saveBinds(this.binds);
      return true;
    }
    for (const [other, b] of this.binds) {
      if (other !== action && b.primary === code) {
        b.primary = target.primary; // 互换，保证没人失去按键
        break;
      }
    }
    target.primary = code;
    // 新主键若正好是别人的副键，清掉那条副键，避免同一个键触发两个动作
    for (const [other, b] of this.binds) {
      if (other !== action && b.alt === code) b.alt = null;
    }
    saveBinds(this.binds);
    return true;
  }

  /** 恢复默认键位并持久化 */
  resetBinds() {
    this.binds = defaultBinds();
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch (e) {
      // 忽略
    }
  }

  _markGesture() {
    if (this.pointerHandler) this.pointerHandler();
  }

  /* ------------------------------------------------------------------ */
  /* 多来源动作状态                                                       */
  /* ------------------------------------------------------------------ */

  /** 某个动作当前是否被任意来源按住 */
  _anyHeld(action) {
    return this.held.has(action);
  }

  /** 重新计算并集（held） */
  _recomputeHeld() {
    this.held.clear();
    for (const a of this._keyHeld) this.held.set(a, true);
    for (const a of this._padHeld) this.held.set(a, true);
    for (const a of this._gpHeld) this.held.set(a, true);
  }

  _addEdge(map, action, source) {
    let set = map.get(action);
    if (!set) {
      set = new Set();
      map.set(action, set);
    }
    set.add(source);
  }

  /**
   * 更新一个来源的按住状态，并在「并集状态发生变化」时记录边沿。
   * 这样键盘与触屏同时按同一个动作不会产生两次 pressed()。
   */
  _setSource(sourceSet, action, value, source) {
    const was = this._anyHeld(action);
    if (value) sourceSet.add(action);
    else sourceSet.delete(action);
    this._recomputeHeld();
    const now = this._anyHeld(action);
    if (!was && now) {
      this._addEdge(this._pressedBy, action, source);
      this.justPressed.add(action);
    } else if (was && !now) {
      this._addEdge(this._releasedBy, action, source);
      this.justReleased.add(action);
    } else if (now) {
      // 已经被别的来源按住：仍记录分来源边沿，方便菜单区分「谁按的」
      this._addEdge(this._pressedBy, action, source);
    }
  }

  _releaseAll() {
    const wasHeld = [...this.held.keys()];
    this._keyHeld.clear();
    this._padHeld.clear();
    this._gpHeld.clear();
    this._recomputeHeld();
    for (const a of wasHeld) {
      this._addEdge(this._releasedBy, a, 'key');
      this.justReleased.add(a);
    }
    this._padStick.x = 0;
    this._padStick.y = 0;
    this._gpStick.x = 0;
    this._gpStick.y = 0;
  }

  /* ------------------------------------------------------------------ */
  /* 虚拟手柄（触屏）接口                                                 */
  /* ------------------------------------------------------------------ */

  /** 设置虚拟摇杆位置：x 右正、y 下正，范围 -1..1 */
  setStick(x, y) {
    this._padStick.x = clampAxis(x);
    this._padStick.y = clampAxis(y);
  }

  /** 虚拟手柄按钮按下 */
  padPress(action) {
    if (!action) return;
    this._markGesture();
    this._setSource(this._padHeld, action, true, 'pad');
  }

  /** 虚拟手柄按钮松开 */
  padRelease(action) {
    if (!action) return;
    this._setSource(this._padHeld, action, false, 'pad');
  }

  /** 摇杆回中、所有虚拟按键松开（切场景 / 失焦时调用） */
  padClear() {
    for (const a of [...this._padHeld]) this._setSource(this._padHeld, a, false, 'pad');
    this._padStick.x = 0;
    this._padStick.y = 0;
  }

  /* ------------------------------------------------------------------ */
  /* 蓝牙手柄接口                                                         */
  /* ------------------------------------------------------------------ */

  /** 是否收到过手柄输入 */
  get gamepadActive() {
    return this.gamepadConnected;
  }

  /**
   * GamepadManager 每个逻辑帧调用一次，喂入当前状态。
   * - actions：本帧按住的动作（按钮 + D-pad），Input 会 diff 出边沿；
   * - pressed / released：显式边沿，供菜单方向键「按住重复」这类
   *   按住状态没变化、但需要再触发一次 pressed 的场景使用。
   * 注意：摇杆方向不要塞进 actions（否则会退化成数字轴），
   * 摇杆只走 x/y，由 moveX / moveY 提供模拟量。
   * @param {{x?:number, y?:number, actions?:Iterable<string>, pressed?:Iterable<string>, released?:Iterable<string>}} state
   */
  setGamepadState(state = {}) {
    const next = new Set(state.actions || []);
    // 先处理松开，再处理按下，保证同一帧内方向翻转的边沿正确
    for (const a of [...this._gpHeld]) {
      if (!next.has(a)) this._setSource(this._gpHeld, a, false, 'gp');
    }
    for (const a of next) {
      if (!this._gpHeld.has(a)) this._setSource(this._gpHeld, a, true, 'gp');
    }
    // 显式边沿：用于菜单里摇杆/方向键「按住重复」
    if (state.pressed) {
      for (const a of state.pressed) {
        this._addEdge(this._pressedBy, a, 'gp');
        this.justPressed.add(a);
      }
    }
    if (state.released) {
      for (const a of state.released) {
        this._addEdge(this._releasedBy, a, 'gp');
        if (!this._anyHeld(a)) this.justReleased.add(a);
      }
    }
    this._gpStick.x = clampAxis(state.x);
    this._gpStick.y = clampAxis(state.y);
    this.gamepadConnected = true;
  }

  /** 手柄断开：松开所有手柄动作并回中 */
  clearGamepad() {
    for (const a of [...this._gpHeld]) this._setSource(this._gpHeld, a, false, 'gp');
    this._gpStick.x = 0;
    this._gpStick.y = 0;
    this.gamepadConnected = false;
  }

  /* ------------------------------------------------------------------ */
  /* 查询接口                                                             */
  /* ------------------------------------------------------------------ */

  down(action) {
    return this.held.has(action);
  }

  pressed(action) {
    return this.justPressed.has(action);
  }

  released(action) {
    return this.justReleased.has(action);
  }

  /** 本帧该动作是否由某个来源按下 */
  pressedBy(action, source) {
    return !!this._pressedBy.get(action)?.has(source);
  }

  /** 本帧该动作是否由某个来源松开 */
  releasedBy(action, source) {
    return !!this._releasedBy.get(action)?.has(source);
  }

  /** 合并后的摇杆值：取虚拟摇杆与蓝牙手柄中幅度更大的一个 */
  _stick() {
    const p = this._padStick;
    const g = this._gpStick;
    const pm = Math.hypot(p.x, p.y);
    const gm = Math.hypot(g.x, g.y);
    return pm >= gm ? p : g;
  }

  /** 把径向死区内的抖动滤掉，并按死区重新归一化，保留推杆幅度 */
  _axisFromStick(raw, mag) {
    if (mag <= STICK_DEADZONE) return 0;
    const scaled = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
    return (raw / mag) * scaled;
  }

  /** 水平模拟量：-1..1（键盘为 ±1，摇杆保留幅度） */
  get moveX() {
    const d = (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0);
    if (d !== 0) return d;
    const s = this._stick();
    return this._axisFromStick(s.x, Math.hypot(s.x, s.y));
  }

  /** 垂直模拟量：-1..1，向下为正 */
  get moveY() {
    const d = (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0);
    if (d !== 0) return d;
    const s = this._stick();
    return this._axisFromStick(s.y, Math.hypot(s.x, s.y));
  }

  /** 水平轴：-1 / 0 / 1（旧接口，菜单与老逻辑仍可用） */
  get axisX() {
    return Math.sign(this.moveX);
  }

  /** 垂直轴：-1 / 0 / 1（旧接口） */
  get axisY() {
    return Math.sign(this.moveY);
  }

  /** 每个逻辑帧末调用：清掉本帧的按下/松开边沿 */
  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this._pressedBy.clear();
    this._releasedBy.clear();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  /* ------------------------------------------------------------------ */
  /* 旧版静态触屏按钮（index.html #touch，作为虚拟手柄未加载时的兜底）      */
  /* ------------------------------------------------------------------ */

  _bindTouch() {
    const isTouch = this.touchDevice;
    const pad = document.getElementById('touch');
    if (pad && isTouch) pad.classList.remove('hidden');
    if (!pad) return;

    for (const btn of pad.querySelectorAll('button[data-k]')) {
      const action = btn.dataset.k;
      const on = (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        this.padPress(action);
      };
      const off = (e) => {
        e.preventDefault();
        this.padRelease(action);
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', (e) => {
        if (btn.hasPointerCapture?.(e.pointerId)) return;
        this.padRelease(action);
      });
    }
  }
}
