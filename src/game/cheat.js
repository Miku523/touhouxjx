/**
 * 隐藏秘籍：无敌模式（Invincible Mode）。
 *
 * 只在设置画面有效：
 *   Shift 起手 → Q Q Q Q Q V V V V → 空格 ×5
 *
 * 规则：
 *  - 起手后每按对一个键就往前推进一格；按错序列里的键整串作废，重新按 Shift 起手。
 *  - 序列外的一般按键（方向键、Esc 等）忽略，不会打断输入。
 *  - 这个开关是「切换」：无敌模式开着时再输入一遍同一串即可解除。
 *  - 状态写进 localStorage 的 hks.cheat.v1，刷新浏览器后仍然记得。
 *
 * 序列只在这里维护一次；游戏里的所有伤害判定统一询问 isInvincible()。
 */

const STORE_KEY = 'hks.cheat.v1';

/** 起手键：左右 Shift 都行 */
const ARM_KEYS = new Set(['ShiftLeft', 'ShiftRight']);

/** 完整输入序列（KeyboardEvent.code） */
export const CHEAT_SEQUENCE = [
  'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ', 'KeyQ',
  'KeyV', 'KeyV', 'KeyV', 'KeyV',
  'Space', 'Space', 'Space', 'Space', 'Space',
];

const SEQ_SET = new Set(CHEAT_SEQUENCE);

let armed = false;
let progress = 0;
let invincible = false;

function load() {
  try {
    invincible = window.localStorage.getItem(STORE_KEY) === '1';
  } catch {
    invincible = false;
  }
}

function save() {
  try {
    window.localStorage.setItem(STORE_KEY, invincible ? '1' : '0');
  } catch {
    /* 隐私模式 / 存储被禁用时忽略：本局内依旧有效 */
  }
}

load();

/** 无敌模式是否生效（供伤害判定调用） */
export function isInvincible() {
  return invincible;
}

/** 放弃当前这一串输入（离开标题画面等场合） */
export function resetCheatInput() {
  armed = false;
  progress = 0;
}

/**
 * 处理标题画面的一次 keydown。
 * @param {string} code KeyboardEvent.code
 * @returns {null | {handled:true, ok?:boolean, started?:boolean, reset?:boolean, toggled?:boolean, invincible?:boolean}}
 *   null = 与秘籍无关的键，交给正常菜单逻辑；其余情况调用方都应吞掉。
 */
export function cheatKey(code) {
  if (!code) return null;

  if (!armed) {
    if (ARM_KEYS.has(code)) {
      armed = true;
      progress = 0;
      return { handled: true, started: true, ok: true };
    }
    return null;
  }

  if (ARM_KEYS.has(code)) return null; // 起手键重复按，不算输错

  if (!SEQ_SET.has(code)) {
    if (code === 'Escape') resetCheatInput(); // 退出标题菜单时清掉进度
    return null; // 序列外的键：不吞、不打断
  }

  if (code !== CHEAT_SEQUENCE[progress]) {
    resetCheatInput();
    return { handled: true, ok: false, reset: true };
  }

  progress++;
  if (progress < CHEAT_SEQUENCE.length) {
    return { handled: true, ok: true, progress };
  }

  resetCheatInput();
  invincible = !invincible;
  save();
  return { handled: true, ok: true, toggled: true, invincible };
}
