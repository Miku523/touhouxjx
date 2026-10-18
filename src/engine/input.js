/**
 * 输入管理：键盘 + 触摸按钮，统一抽象成「动作」。
 * - down(action)     当前是否按住
 * - pressed(action)  本逻辑帧是否刚按下（边沿）
 * - released(action) 本逻辑帧是否刚松开（边沿）
 * 使用后必须调用 endFrame() 清掉边沿状态。
 *
 * 键位可在设置界面重绑定：
 *  - 每个动作有「主键 primary」和「副键 alt」，只改主键；
 *  - 副键永远是默认的第二键（例如移动的左/右仍有 A/D），
 *    这样即使用户改坏了键位，也总有一套能用的操作；
 *  - 新主键若被别的动作占着，两者互换，绝不会让某个动作失去按键；
 *  - 绑定存 localStorage，刷新后仍然生效。
 */

/** 动作定义：主键可改，副键固定 */
export const ACTION_DEFS = [
  { action: 'left',    label: '左移',        primary: 'ArrowLeft',  alt: 'KeyA' },
  { action: 'right',   label: '右移',        primary: 'ArrowRight', alt: 'KeyD' },
  { action: 'up',      label: '上移 / 上选', primary: 'ArrowUp',    alt: 'KeyW' },
  { action: 'down',    label: '下移 / 下选', primary: 'ArrowDown',  alt: 'KeyS' },
  { action: 'jump',    label: '跳跃',        primary: 'Space',      alt: null },
  { action: 'shoot',   label: '射击',        primary: 'KeyZ',       alt: 'KeyJ' },
  { action: 'fast',    label: '加速移动',    primary: 'ShiftLeft',  alt: 'ShiftRight' },
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
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return '小键盘' + code.slice(6);
  return code;
}

/** 动作 → 中文名 */
export function actionLabel(action) {
  return ACTION_DEFS.find((d) => d.action === action)?.label || action;
}

const STORE_KEY = 'hks.keybinds.v1';

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

export class Input {
  constructor() {
    /** @type {Map<string, boolean>} */
    this.held = new Map();
    /** @type {Set<string>} */
    this.justPressed = new Set();
    /** @type {Set<string>} */
    this.justReleased = new Set();

    // 说明：边沿集合在事件发生时就写入，由主循环在每次逻辑帧末调用 endFrame() 清空。
    // 这样 60Hz 的边沿不会因为一个渲染帧跑 0 或 2 次逻辑而丢失。

    this.anyKey = false;

    /** @type {Map<string, {primary:string, alt:string|null}>} */
    this.binds = loadBinds();

    this._onKeyDown = (e) => {
      const action = this.actionOf(e.code);
      // 空格与方向键会滚动页面 / 移动焦点，一律拦掉
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.anyKey = true;
      this._emitAction(action);
    };
    this._onKeyUp = (e) => {
      const action = this.actionOf(e.code);
      if (action) {
        this._set(action, false);
        this.justReleased.add(action);
      }
    };
    this._onBlur = () => {
      // 失去焦点时全部松开，避免「卡键」
      for (const a of this.held.keys()) this.justReleased.add(a);
      this.held.clear();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);

    this.pointerHandler = null; // 由 main 设置的首次交互回调
    window.addEventListener('pointerdown', () => this._markGesture(), { once: true });
    window.addEventListener('keydown', () => this._markGesture(), { once: true });

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
   * 改主键。若新键已被别的动作用作主键，则两者互换。
   * @returns {boolean} 是否真的发生了改动
   */
  setBind(action, code) {
    const target = this.binds.get(action);
    if (!target || !code || target.primary === code) return false;
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

  _emitAction(action) {
    if (!action) return;
    this._set(action, true);
    this.justPressed.add(action);
  }

  _set(action, value) {
    if (value) this.held.set(action, true);
    else this.held.delete(action);
  }

  _bindTouch() {
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const pad = document.getElementById('touch');
    if (pad && isTouch) pad.classList.remove('hidden');
    if (!pad) return;

    for (const btn of pad.querySelectorAll('button[data-k]')) {
      const action = btn.dataset.k;
      const on = (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        this._markGesture();
        this._emitAction(action);
      };
      const off = (e) => {
        e.preventDefault();
        this._set(action, false);
        this.justReleased.add(action);
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', (e) => {
        if (btn.hasPointerCapture?.(e.pointerId)) return;
        off(e);
      });
    }
  }

  down(action) {
    return !!this.held.get(action);
  }

  pressed(action) {
    return this.justPressed.has(action);
  }

  released(action) {
    return this.justReleased.has(action);
  }

  /** 水平轴：-1 / 0 / 1 */
  get axisX() {
    const l = this.down('left') ? -1 : 0;
    const r = this.down('right') ? 1 : 0;
    return l + r;
  }

  /** 每个逻辑帧末调用：清掉本帧的按下/松开边沿 */
  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
