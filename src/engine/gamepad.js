/**
 * 蓝牙 / USB 手柄支持（Gamepad API）。
 *
 * 设计目标：
 *  - 手柄只是「又一个输入源」：键盘 / 触屏不受任何影响，手柄拔掉也照常能玩；
 *  - 游戏每个逻辑帧调用一次 poll()，由本模块把物理状态翻译成游戏动作，再交给输入层；
 *  - 浏览器不给手柄时（内嵌 WebView、权限策略、桌面没插）全部静默降级，不刷 console；
 *  - 模块顶层不访问 navigator / window，只有 start() / poll() 里才碰宿主环境，
 *    这样在 Node 里也能 import 进来做纯逻辑测试。
 *
 * 与输入层的接缝（Input 需要实现 setGamepadState）：
 *
 *   input.setGamepadState({
 *     x, y,                    // 左摇杆模拟量原值 -1..1（y 向下为正），死区交给 Input 端统一处理
 *     actions: Set<string>,    // 本帧按住的实体按钮动作（A/B/X/Y/LB/RB/LT/RT/Start/Back/D-pad）
 *     pressed: Set<string>,    // 本帧新按下的动作 + 菜单方向重复边沿 + 摇杆菜单方向边沿
 *     released: Set<string>,   // 本帧松开的动作 / 摇杆菜单方向回中
 *   })
 *
 *   Input 侧建议：actions 合并进 held；pressed / released 合并进 justPressed / justReleased；
 *   endFrame() 照旧清边沿。手柄松开某动作时，如果键盘还按着同一个动作，合并逻辑不能把
 *   held 直接删掉（本模块只发「手柄这一路」的完整状态，合并语义在 Input）。
 *
 * 摇杆值的两层约定：
 *  - 发给 Input 的 x/y 是原值，不做死区裁剪：Input 端还会做 0.12 的径向死区重归一化，
 *    这里再裁一次会二次死区，手感变钝；
 *  - 本模块的 deadzone（默认 0.25）只用于自己的判断：菜单方向导航的阈值判定。
 *    菜单里摇杆归一化超过 0.6 时，按「方向键连发」的节奏只生成 pressed 边沿
 *    （首次 300ms，之后每 120ms 一次），回中时给 released 边沿，全程不进 actions。
 *
 * 边沿为什么在这里生成：
 *  - 每帧只 poll 一次，天然和逻辑帧对齐，不需要往 Input 里塞事件；
 *  - 方向键 / 摇杆在菜单里需要「按住连发」，重复边沿不是物理状态变化，只能按时间生成。
 *
 * 默认映射（标准布局，pad.mapping === 'standard'）：
 *   A/0 = jump      B/1 = cast      X/2 = shoot     Y/3 = dash
 *   LB/4 = slow     RB/5 = dash     LT/6 = slow     RT/7 = shoot
 *   Back/8 = confirm                Start/9 = pause
 *   Dpad 上/下/左/右 = 12/13/14/15
 *   左摇杆：只输出模拟量 x/y（移动）；菜单导航用 0.6 阈值生成方向 pressed 边沿
 *
 * 持久化：localStorage['hks.gamepad.v1'] = { deadzone, vibration, mapping }
 *   mapping 是「按键序号 → 动作名」的覆盖表；resetMapping() 清空覆盖、回到默认布局。
 */

/** 默认径向死区：摇杆偏移量小于它时视为回中 */
export const DEFAULT_DEADZONE = 0.25;

/** 菜单里摇杆输出超过该值（死区归一化后）才当作方向键导航 */
const MENU_STICK_THRESHOLD = 0.6;

/** 菜单方向重复：按住后首次延迟 / 之后每次间隔（毫秒） */
const REPEAT_DELAY_MS = 300;
const REPEAT_INTERVAL_MS = 120;

/** 模拟扳机当成「按下」的阈值（LT/RT 的 value 是 0..1 连续量） */
const BUTTON_VALUE_THRESHOLD = 0.4;

/** 存档键与默认值 */
const STORE_KEY = 'hks.gamepad.v1';
const DEADZONE_MIN = 0;
const DEADZONE_MAX = 0.9;

/** 方向类动作：菜单里允许按住连发 */
const DIRECTION_ACTIONS = Object.freeze(['up', 'down', 'left', 'right']);
const DIRECTION_SET = new Set(DIRECTION_ACTIONS);

/** 游戏动作全集（校验存档 mapping 用） */
const VALID_ACTIONS = new Set([
  'left', 'right', 'up', 'down',
  'jump', 'shoot', 'slow', 'dash', 'cast',
  'confirm', 'pause', 'restart', 'mute', 'quit',
]);

/**
 * 标准布局的「按键序号 → 动作」默认表。
 * 一个动作可以对应多个键（shoot 同时吃 X 和 RT，dash 同时吃 Y 和 RB，slow 同时吃 LB 和 LT）。
 */
export const DEFAULT_BUTTON_MAPPING = Object.freeze({
  0: 'jump',     // A
  1: 'cast',     // B
  2: 'shoot',    // X
  3: 'dash',     // Y
  4: 'slow',     // LB
  5: 'dash',     // RB
  6: 'slow',     // LT
  7: 'shoot',    // RT
  8: 'confirm',  // Back / Share
  9: 'pause',    // Start / Options
  12: 'up',      // Dpad 上
  13: 'down',    // Dpad 下
  14: 'left',    // Dpad 左
  15: 'right',   // Dpad 右
});

/** 手柄品牌分类的展示名 */
const TYPE_LABELS = {
  xbox: 'Xbox',
  playstation: 'PlayStation',
  switch: 'Switch',
  generic: '通用手柄',
};

/** 手柄分类（用于状态栏文案；映射仍然按标准布局走） */
export function gamepadTypeLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.generic;
}

/** 连接方式只能从 id 关键字推测：Gamepad API 本身不暴露蓝牙 / USB */
function classifyTransport(id) {
  const s = String(id || '').toLowerCase();
  if (/bluetooth|\bbt\b|蓝牙/.test(s)) return 'bluetooth';
  if (/\busb\b|wired|有线/.test(s)) return 'usb';
  return 'unknown';
}

function classifyGamepad(id) {
  const s = String(id || '').toLowerCase();
  if (/xbox|xinput|microsoft|8bitdo|gamesir|betop|北通|飞智/.test(s)) return 'xbox';
  if (/dualsense|dualshock|playstation|sony|ps5|ps4/.test(s)) return 'playstation';
  if (/switch|joy-con|joycon|nintendo|pro controller/.test(s)) return 'switch';
  return 'generic';
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 默认时钟：优先 performance.now（单调，不受系统时间调整影响） */
function defaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export class GamepadManager {
  /**
   * @param {object} opts
   * @param {object} opts.input 输入层（需要 setGamepadState；没有这个方法时手柄静默不生效）
   * @param {() => number} [opts.now] 时钟注入，测试菜单重复用；默认 performance.now
   */
  constructor({ input, now } = {}) {
    /** @type {object|null} */
    this.input = input || null;
    this._now = typeof now === 'function' ? now : defaultNow;

    this._started = false;
    this._supported = false;
    this._apiError = false;
    this._apiBroken = false;
    this._apiRetryAt = 0;
    this._hidden = false;

    this._deadzone = DEFAULT_DEADZONE;
    this._vibration = true;
    /** 用户覆盖：buttonIndex -> action */
    this._mapping = {};
    /** 合并默认表后的生效映射（缓存） */
    this._effective = null;

    /** @type {Map<number, Gamepad>} 最近一次扫描到的手柄 */
    this._padObjs = new Map();
    /** @type {number|null} 当前接管手感的手柄 index */
    this._activeIndex = null;

    /** 上一帧动作集合：本模块自己保存，和 Input.endFrame() 无关 */
    this._prevActions = new Set();
    /** 上一帧「菜单方向」集合（D-pad 或摇杆），用来生成方向边沿 */
    this._prevDirs = new Set();
    /** 方向键 / 摇杆的重复计时：action -> 下次允许重复的时间戳 */
    this._repeatAt = new Map();
    this._lastX = 0;
    this._lastY = 0;
    /** 最近一次发给输入层的状态（调试 / 探针用） */
    this._lastState = null;
    /** 环境是否提供 Gamepad API；start/poll 会再扫一次确认 */
    this._supported = this._detectApi();

    /* 事件处理器都做成箭头函数，start/stop 才能成对摘挂 */
    this._onConnected = () => {
      try {
        this._scan();
      } catch (e) {
        // 浏览器实现异常时保持静默：手柄不可用不应该影响游戏
      }
      this._refreshActive();
    };
    this._onDisconnected = () => {
      try {
        this._scan();
      } catch (e) {
        // 同上
      }
      this._refreshActive();
      // 拔掉手柄的瞬间就把按着的动作放掉，避免角色一直朝一个方向跑
      if (!this._padObjs.size) {
        this._emitEmpty(0, 0);
        this._clearGamepad();
      }
    };
    this._onVisibility = () => {
      const hidden = this._isDocumentHidden();
      if (hidden === this._hidden) return;
      this._hidden = hidden;
      if (hidden) {
        // 后台不震：省电，也避免手机放兜里一直嗡
        this._stopRumble();
        this._emitEmpty(0, 0);
      } else {
        // 回前台后清掉重复计时，下一次 poll 按当前物理状态重新来
        this._repeatAt.clear();
      }
    };

    this._loadPrefs();
  }

  /* ------------------------------------------------------------------ */
  /* 生命周期                                                            */
  /* ------------------------------------------------------------------ */

  /** 挂上连接事件并做一次初始扫描；重复调用无副作用 */
  start() {
    if (this._started) return this;
    this._started = true;
    this._hidden = this._isDocumentHidden();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('gamepadconnected', this._onConnected);
      window.addEventListener('gamepaddisconnected', this._onDisconnected);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', this._onVisibility);
    }

    this._scan();
    this._refreshActive();
    return this;
  }

  /**
   * 摘掉监听并释放手柄按住的全部动作。
   * 切到纯键盘 / 触屏时调用，防止「关掉手柄支持后角色还在射击」。
   */
  stop() {
    if (!this._started) return this;
    this._started = false;

    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('gamepadconnected', this._onConnected);
      window.removeEventListener('gamepaddisconnected', this._onDisconnected);
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }

    this._stopRumble();
    this._emitEmpty(0, 0);
    this._clearGamepad();
    this._padObjs.clear();
    this._activeIndex = null;
    this._prevActions.clear();
    this._prevDirs.clear();
    this._repeatAt.clear();
    return this;
  }

  /* ------------------------------------------------------------------ */
  /* 每逻辑帧                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 游戏每个逻辑帧调用一次。未 start 时是 no-op；没有手柄时只做一次空扫描。
   * 不要把 dt 传进来：菜单重复用的是真实时间，和逻辑帧的固定步长解耦。
   */
  poll() {
    if (!this._started) return;

    // 页面在后台时浏览器可能仍会跑逻辑帧：不读手柄，也把状态放掉
    if (this._hidden) {
      this._emitEmpty(0, 0);
      return;
    }

    const pads = this._scan();
    const pad = this._pickPad(pads);
    const now = this._now();

    if (!pad) {
      this._activeIndex = null;
      this._emitEmpty(0, 0);
      return;
    }
    this._activeIndex = pad.index;

    const rawX = this._axis(pad, 0);
    const rawY = this._axis(pad, 1);

    /** 本帧按住的全部动作：只放实体按钮 / 扳机 / D-pad，摇杆不合成数字动作 */
    const actions = new Set();

    // 1) 数字键 / 扳机 / D-pad
    const mapping = this._effectiveMapping();
    for (const key of Object.keys(mapping)) {
      const buttonIndex = Number(key);
      if (this._buttonDown(pad, buttonIndex)) actions.add(mapping[key]);
    }

    // 2) 菜单方向：D-pad 或左摇杆（扣掉本模块 deadzone 并归一化后过 0.6）都算「按住方向」。
    //    摇杆只产生菜单边沿，不塞进 actions —— 移动继续吃模拟量 x/y，
    //    否则 Input 的轴会退化成满速数字轴，摇杆的细腻度就没了。
    const stickDir = this._stickMenuDir(rawX, rawY);
    const directions = new Set();
    for (const dir of DIRECTION_ACTIONS) {
      if (actions.has(dir) || stickDir === dir) directions.add(dir);
    }

    // 3) 动作边沿：和上一帧对比
    const pressed = new Set();
    const released = new Set();
    for (const action of actions) {
      if (!this._prevActions.has(action)) pressed.add(action);
    }
    for (const action of this._prevActions) {
      if (!actions.has(action)) released.add(action);
    }

    // 4) 菜单方向边沿：首次立即产生，按住 300ms 后每 120ms 补一个 pressed 边沿。
    //    重复只进 pressed，不重复写 actions（D-pad 按住状态由 Input 的 diff 维护）。
    for (const dir of DIRECTION_ACTIONS) {
      const held = directions.has(dir);
      const wasHeld = this._prevDirs.has(dir);
      if (held && !wasHeld) {
        pressed.add(dir);
        this._repeatAt.set(dir, now + REPEAT_DELAY_MS);
      } else if (!held && wasHeld) {
        released.add(dir);
        this._repeatAt.delete(dir);
      } else if (held && wasHeld) {
        const due = this._repeatAt.get(dir);
        if (due != null && now >= due) {
          pressed.add(dir);
          this._repeatAt.set(dir, now + REPEAT_INTERVAL_MS);
        }
      }
    }

    this._prevActions = new Set(actions);
    this._prevDirs = directions;
    this._lastX = rawX;
    this._lastY = rawY;
    this._lastState = { x: rawX, y: rawY, actions: new Set(actions), pressed, released };
    // x/y 原值直发：Input 端有 0.12 径向死区重归一化，这里不再预先裁剪
    this._emit(rawX, rawY, actions, pressed, released);
  }

  /* ------------------------------------------------------------------ */
  /* 对外状态                                                            */
  /* ------------------------------------------------------------------ */

  /** 当前连接的手柄数组 [{ index, id, type, mapping }] */
  get connected() {
    const list = [];
    for (const pad of this._padObjs.values()) list.push(this._infoOf(pad));
    list.sort((a, b) => a.index - b.index);
    return list;
  }

  /**
   * 状态快照，给设置页 / 提示条用。
   * @returns {{connected:number, active:boolean, activeIndex:number|null, deadzone:number,
   *            vibration:boolean, supported:boolean, text:string, pads:Array<object>}}
   */
  getStatus() {
    const pads = this.connected;
    const active = this._activeIndex != null && pads.some((p) => p.index === this._activeIndex);
    let text;

    if (!this._supported) {
      text = '本环境不支持 Gamepad API（内嵌浏览器 / 权限策略常见）';
    } else if (this._apiError) {
      text = '手柄接口被浏览器拦截，暂时读不到手柄';
    } else if (!pads.length) {
      text = '未检测到手柄（先按一下手柄上的任意键）';
    } else {
      const names = pads.map((p) => this._displayName(p)).join('、');
      text = pads.length > 1 ? '已连接 ' + pads.length + ' 个手柄：' + names : '已连接：' + names;
      const pad = this._padObjs.get(this._activeIndex);
      if (pad && pad.mapping && pad.mapping !== 'standard') text += ' · 非标准布局';
      if (!this._vibration) text += ' · 震动已关闭';
    }

    return {
      connected: pads.length,
      active,
      activeIndex: active ? this._activeIndex : null,
      deadzone: this._deadzone,
      vibration: this._vibration,
      supported: this._supported,
      text,
      pads,
    };
  }

  /**
   * 设置页用的短状态文案：未连接 / 已连接：名字（· 蓝牙）。
   * 和 getStatus().text（长句、带操作提示）分开，避免设置页排版被撑开。
   */
  statusText() {
    if (!this._supported) return '不支持';
    if (this._apiError) return '接口受限';
    const pads = this.connected;
    if (!pads.length) return '未连接';
    const first = pads[0];
    let text = '已连接：' + this._displayName(first);
    if (pads.length > 1) text += '（共 ' + pads.length + ' 个）';
    if (first.transport === 'bluetooth') text += ' · 蓝牙';
    else if (first.transport === 'usb') text += ' · USB';
    return text;
  }

  /* ------------------------------------------------------------------ */
  /* 设置                                                                */
  /* ------------------------------------------------------------------ */

  /** 设置径向死区（0..0.9），立即持久化；返回真正生效的值 */
  setDeadzone(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return this._deadzone;
    this._deadzone = clampNumber(n, DEADZONE_MIN, DEADZONE_MAX);
    this._savePrefs();
    return this._deadzone;
  }

  getDeadzone() {
    return this._deadzone;
  }

  /** 开 / 关震动。关掉时立即停掉正在震的手柄 */
  setVibration(on) {
    this._vibration = !!on;
    if (!this._vibration) this._stopRumble();
    this._savePrefs();
    return this._vibration;
  }

  getVibration() {
    return this._vibration;
  }

  /** 恢复默认按键映射（不动死区 / 震动） */
  resetMapping() {
    this._mapping = {};
    this._effective = null;
    this._savePrefs();
    return this;
  }

  /**
   * 单独改一个键位：buttonIndex 上的按键改触发 action；action 传 null 表示删除覆盖。
   * 设置页以后要做手柄改键可以直接用；不做也不影响默认布局。
   * @returns {boolean} 是否改动成功
   */
  setMapping(buttonIndex, action) {
    const index = Number(buttonIndex);
    if (!Number.isInteger(index) || index < 0 || index > 31) return false;
    if (action == null) {
      delete this._mapping[index];
    } else if (VALID_ACTIONS.has(action)) {
      this._mapping[index] = action;
    } else {
      return false;
    }
    this._effective = null;
    this._savePrefs();
    return true;
  }

  /** 生效中的映射表副本（默认 + 覆盖） */
  getMapping() {
    const out = {};
    const effective = this._effectiveMapping();
    for (const key of Object.keys(effective)) out[key] = effective[key];
    return out;
  }

  /**
   * 触发手柄震动（双马达）。
   * @param {number} [strong=0.6] 强马达（低频 / 大转子）幅度 0..1
   * @param {number} [weak=0.3]   弱马达（高频 / 小转子）幅度 0..1
   * @param {number} [ms=120]     持续时间（毫秒）
   * @returns {boolean} 是否真的下发了震动（无手柄 / 关震动 / 页面后台 / 不支持时 false）
   */
  rumble(strong = 0.6, weak = 0.3, ms = 120) {
    if (!this._vibration || this._hidden) return false;
    const pad = this._activePad();
    if (!pad) return false;

    const strongMagnitude = clamp01(Number(strong));
    const weakMagnitude = clamp01(Number(weak));
    const duration = Number.isFinite(Number(ms)) ? clampNumber(Number(ms), 0, 5000) : 120;
    const actuator = pad.vibrationActuator;

    if (actuator && typeof actuator.playEffect === 'function') {
      try {
        const effects = Array.isArray(actuator.effects) ? actuator.effects : null;
        let type = 'dual-rumble';
        if (effects && effects.length && !effects.includes('dual-rumble')) {
          if (effects.includes('vibration')) type = 'vibration';
          else return false;
        }
        const params = type === 'dual-rumble'
          ? { startDelay: 0, duration, strongMagnitude, weakMagnitude }
          : { startDelay: 0, duration, strongMagnitude };
        const result = actuator.playEffect(type, params);
        if (result && typeof result.catch === 'function') result.catch(() => {});
        return true;
      } catch (e) {
        return false;
      }
    }

    // 老式 / 非标准实现：只有 vibrate(duration) 可用
    if (typeof pad.vibrate === 'function') {
      try {
        const result = pad.vibrate(duration);
        if (result && typeof result.catch === 'function') result.catch(() => {});
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* 内部：扫描 / 状态翻译                                                */
  /* ------------------------------------------------------------------ */

  /** 读一次 navigator.getGamepads。任何异常都吞掉并退避，绝不每帧刷错误。 */
  _scan() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const getter = nav && (typeof nav.getGamepads === 'function'
      ? nav.getGamepads
      : (typeof nav.webkitGetGamepads === 'function' ? nav.webkitGetGamepads : null));

    if (!getter) {
      this._supported = false;
      this._apiError = false;
      this._padObjs.clear();
      return [];
    }
    this._supported = true;

    const now = this._now();
    if (this._apiBroken && now < this._apiRetryAt) return [];
    if (this._apiBroken) {
      // 退避到期，允许再试一次
      this._apiBroken = false;
    }

    let raw;
    try {
      raw = getter.call(nav) || [];
    } catch (e) {
      // 隐私策略 / WebView 里 getGamepads 可能直接抛：退避 2s，不再每帧尝试
      this._apiBroken = true;
      this._apiRetryAt = now + 2000;
      this._apiError = true;
      this._padObjs.clear();
      this._activeIndex = null;
      return [];
    }

    this._apiError = false;
    const pads = [];
    const seen = new Set();
    const length = typeof raw.length === 'number' ? raw.length : 0;
    for (let i = 0; i < length; i++) {
      const pad = raw[i];
      // 某些浏览器会返回 connected=false 的占位槽，必须跳过
      if (!pad || pad.connected === false) continue;
      const index = typeof pad.index === 'number' ? pad.index : i;
      seen.add(index);
      this._padObjs.set(index, pad);
      pads.push(pad);
    }
    // getGamepads 是权威列表：清掉已经不在列表里的旧手柄
    if (seen.size !== this._padObjs.size) {
      for (const index of [...this._padObjs.keys()]) {
        if (!seen.has(index)) this._padObjs.delete(index);
      }
    }
    return pads;
  }

  /** 多手柄时固定接管一个：优先当前这个，其次标准布局，最后第一个 */
  _pickPad(pads) {
    if (!Array.isArray(pads) || !pads.length) return null;
    let active = pads.find((p) => p.index === this._activeIndex);
    if (active) return active;
    active = pads.find((p) => p.mapping === 'standard');
    if (!active) active = pads[0];
    return active;
  }

  _refreshActive() {
    const pads = [...this._padObjs.values()].sort((a, b) => a.index - b.index);
    const pad = this._pickPad(pads);
    this._activeIndex = pad ? pad.index : null;
  }

  _activePad() {
    if (this._activeIndex != null) {
      const pad = this._padObjs.get(this._activeIndex);
      if (pad) return pad;
    }
    for (const pad of this._padObjs.values()) return pad;
    return null;
  }

  _infoOf(pad) {
    return {
      index: typeof pad.index === 'number' ? pad.index : 0,
      id: pad.id || '',
      type: classifyGamepad(pad.id),
      transport: classifyTransport(pad.id),
      mapping: pad.mapping || '',
    };
  }

  _displayName(info) {
    const raw = String(info.id || '')
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return raw || gamepadTypeLabel(info.type);
  }

  _axis(pad, index) {
    const axes = pad && pad.axes;
    const value = axes ? axes[index] : 0;
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(-1, value));
  }

  /** 按下判定：兼容 {pressed,value} 对象和旧实现的裸数值 */
  _buttonDown(pad, index) {
    const buttons = pad && pad.buttons;
    const button = buttons ? buttons[index] : null;
    if (!button) return false;
    if (typeof button === 'number') return button >= BUTTON_VALUE_THRESHOLD;
    if (button.pressed) return true;
    const value = typeof button.value === 'number' ? button.value : 0;
    return value >= BUTTON_VALUE_THRESHOLD;
  }

  /**
   * 摇杆菜单方向：先扣本模块 deadzone 做径向归一化，取主导轴，过 0.6 才算。
   * 只影响菜单导航阈值判断，不发往 Input（发出去的是原值）。
   * @returns {'up'|'down'|'left'|'right'|null} null 表示回中 / 未过阈值
   */
  _stickMenuDir(rawX, rawY) {
    const magnitude = Math.hypot(rawX, rawY);
    if (!(magnitude > this._deadzone)) return null;
    const scaled = Math.min(1, (magnitude - this._deadzone) / (1 - this._deadzone));
    if (scaled < MENU_STICK_THRESHOLD) return null;
    const x = rawX / magnitude;
    const y = rawY / magnitude;
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (ax > ay) return x < 0 ? 'left' : 'right';
    if (ay > ax) return y < 0 ? 'up' : 'down';
    // 正对角线时优先纵向：菜单里上下选择更常用
    return y < 0 ? 'up' : 'down';
  }

  _effectiveMapping() {
    if (this._effective) return this._effective;
    const map = {};
    for (const key of Object.keys(DEFAULT_BUTTON_MAPPING)) {
      map[Number(key)] = DEFAULT_BUTTON_MAPPING[key];
    }
    for (const key of Object.keys(this._mapping)) {
      map[Number(key)] = this._mapping[key];
    }
    this._effective = map;
    return map;
  }

  /* ------------------------------------------------------------------ */
  /* 内部：与输入层通信 / 释放                                            */
  /* ------------------------------------------------------------------ */

  _emit(x, y, actions, pressed, released) {
    const input = this.input;
    if (!input || typeof input.setGamepadState !== 'function') return;
    try {
      // 拷贝后交出：输入层怎么改都不会污染本模块的上一帧状态
      input.setGamepadState({
        x,
        y,
        actions: new Set(actions),
        pressed: new Set(pressed),
        released: new Set(released),
      });
    } catch (e) {
      // 输入层异常不能拖垮主循环；也不刷 console（每帧都会走到这里）
    }
  }

  /** 断开 / stop 时让输入层把手柄这一路的按住状态清干净 */
  _clearGamepad() {
    const input = this.input;
    if (!input || typeof input.clearGamepad !== 'function') return;
    try {
      input.clearGamepad();
    } catch (e) {
      // 输入层异常不影响停用手柄
    }
  }

  /** 手柄消失 / 页面后台 / stop 时把按住的动作全部放掉（只发一次） */
  _emitEmpty(x, y) {
    const released = new Set(this._prevActions);
    for (const dir of this._prevDirs) released.add(dir);
    if (!released.size && this._lastX === 0 && this._lastY === 0) return;
    this._prevActions.clear();
    this._prevDirs.clear();
    this._repeatAt.clear();
    this._lastX = x;
    this._lastY = y;
    this._lastState = { x, y, actions: new Set(), pressed: new Set(), released: new Set(released) };
    this._emit(x, y, new Set(), new Set(), released);
  }

  _stopRumble() {
    const pad = this._activePad();
    if (!pad) return;
    const actuator = pad.vibrationActuator;
    try {
      if (actuator && typeof actuator.reset === 'function') {
        const result = actuator.reset();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } else if (actuator && typeof actuator.playEffect === 'function') {
        const result = actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: 0,
          strongMagnitude: 0,
          weakMagnitude: 0,
        });
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } else if (typeof pad.vibrate === 'function') {
        pad.vibrate(0);
      }
    } catch (e) {
      // 手柄不支持 / 已断开：忽略
    }
  }

  /** 只看接口存在性，不触发 getGamepads：模块顶层不允许访问 navigator，构造时探测是安全的 */
  _detectApi() {
    try {
      if (typeof navigator === 'undefined') return false;
      return typeof navigator.getGamepads === 'function'
        || typeof navigator.webkitGetGamepads === 'function';
    } catch (e) {
      return false;
    }
  }

  _isDocumentHidden() {
    try {
      return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 内部：持久化                                                        */
  /* ------------------------------------------------------------------ */

  _loadPrefs() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object') return;

      if (Number.isFinite(Number(saved.deadzone))) {
        this._deadzone = clampNumber(Number(saved.deadzone), DEADZONE_MIN, DEADZONE_MAX);
      }
      if (typeof saved.vibration === 'boolean') this._vibration = saved.vibration;
      if (saved.mapping && typeof saved.mapping === 'object') {
        const mapping = {};
        for (const key of Object.keys(saved.mapping)) {
          const index = Number(key);
          const action = saved.mapping[key];
          if (!Number.isInteger(index) || index < 0 || index > 31) continue;
          if (!VALID_ACTIONS.has(action)) continue;
          mapping[index] = action;
        }
        this._mapping = mapping;
      }
    } catch (e) {
      // 隐私模式 / 存档损坏：静默用默认值，不影响开局
    }
    this._effective = null;
  }

  _savePrefs() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORE_KEY, JSON.stringify({
        deadzone: this._deadzone,
        vibration: this._vibration,
        mapping: this._mapping,
      }));
    } catch (e) {
      // 写不进去（隐私模式 / 配额满）不影响本局使用
    }
  }
}
