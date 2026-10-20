/**
 * cardEffects.js —— 符卡「玩家副作用」层（安全属性 only）。
 *
 * 调用约定（由 stage.js 每帧调用，Boss 战期间）：
 *   updateCardEffect(player, effectKey, dt)
 *
 * 硬规则（本文件自我约束）：
 *  - 只改「可安全调整」的属性：移动速率、受击判定半径（原型 getter 的实例影子）、
 *    开火节奏（通过增减 shootCd 冷却的每帧扣减量）。不碰 hurt / die / respawn，
 *    不改 bullets 碰撞逻辑，不改玩家坐标硬钳制。
 *  - 未识别的 effectKey → 直接 no-op，并且会把上一个效果干净地还原。
 *  - 可重入：每帧调用同一个 key 只施加一次「持续效果」；apply 必须幂等。
 *  - 只对 STG 玩家（有 sx / 原型 update）生效；平台关玩家调用直接 no-op。
 *
 * 状态：
 *  - 每个 player 上挂 `player._cardEffect = { key, base }`；切 key 时先 restore。
 *  - `base` 只在首次进入某效果时记录（例如原始判定半径），切走时还原。
 *
 * 效果是「进入这张卡 → 玩家能感觉到」的物理侧写：
 *   moveMul >1 更飘 / <1 更沉；hitAdd 负=判定更小（更宽容）；
 *   fireMul >1 开火更密，<1 更疏（只影响手感，不改变伤害数值）。
 */

/** 安全位移：按倍率补偿一帧位移；有边界钳制兜底，不改变 update 内部常量 */
function shiftBy(player, mul, dt) {
  if (!(mul > 0) || mul === 1) return;
  player.sx += (player.vx || 0) * (mul - 1) * dt;
  player.sy += (player.vy || 0) * (mul - 1) * dt;
}

/** 给实例挂一个遮蔽原型 getter 的判定半径（不触发严格模式的 setter 报错） */
function overrideHitRadius(player, value) {
  Object.defineProperty(player, 'hitRadius', {
    value: Math.max(1.6, value),
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

/** 还原判定半径：删除实例影子属性，原型 getter 重新生效 */
function restoreHitRadius(player) {
  try {
    delete player.hitRadius;
  } catch (_) { /* 极端情况下被设为不可配置，忽略 */ }
}

/** 开火节奏：从 shootCd 里额外扣一点（fireMul>1）或补一点（fireMul<1） */
function rapidFire(player, fireMul, dt) {
  const cd = player.shootCd;
  if (!(cd > 0)) return;
  if (fireMul > 1) {
    player.shootCd = Math.max(0, cd - (fireMul - 1) * dt);
  } else if (fireMul < 1) {
    // 只往「变慢」方向补，且不越过一次射击的基础冷却（0.075/0.085），避免卡死扳机
    player.shootCd = Math.min(0.16, cd + (1 - fireMul) * dt);
  }
}

/**
 * 效果表。字段含义：
 *   moveMul  位移倍率（1 = 原速；0.9 = 略沉；1.2 = 被风推着走）
 *   hitAdd   判定半径增量（负 = 更宽容；正 = 更危险）
 *   fireMul  开火节奏倍率（>1 更密，<1 更疏）
 *   note     给文档 / 预览用的中文说明
 * 每张卡最多挂一个效果；全部都是「可还原」的临时改写。
 */
const EFFECTS = {
  none: null,

  // ── 黑暗聚光（莉格露 #3「萤火虫之夜」）：视野被黑吃掉，脚下发虚 → 判定略小护身
  darkSpot: { moveMul: 0.93, hitAdd: -0.3, fireMul: 1, note: '黑暗聚光：移速 ×0.93，判定 -0.3（摸黑护身）' },

  // ── 吞噬引力（露米娅 #2「黑暗吞噬」）：被漩涡往中心拖，走不快但身体被压「实」一点
  devourPull: { moveMul: 0.9, hitAdd: 0.15, fireMul: 1, note: '吞噬引力：移速 ×0.9，判定 +0.15（被吸住）' },

  // ── 冰面滑行（琪露诺 #3「完美冻结」）：脚下打滑 → 移速略快，但刹不住
  frostSlide: { moveMul: 1.1, hitAdd: 0.1, fireMul: 1, note: '冰面滑行：移速 ×1.1，判定 +0.1（滑）' },

  // ── 钻石折射（琪露诺 #4「钻石风暴」）：晶光晃眼、弹道难判 → 判定更宽容
  diamondFocus: { moveMul: 0.96, hitAdd: -0.35, fireMul: 1.15, note: '钻石折射：移速 ×0.96，判定 -0.35，开火 ×1.15' },

  // ── 疾风加速（文 #2「风神少女」·生存 30s）：顺风推背，快但要更小心
  tailwind: { moveMul: 1.18, hitAdd: 0.2, fireMul: 1.25, note: '疾风加速：移速 ×1.18，判定 +0.2，开火 ×1.25' },

  // ── 风暴之眼（文 #5「幻想风靡」·生存 180s）：站在风暴眼中心，判定缩到最小、移速拉满
  stormEye: { moveMul: 1.22, hitAdd: -0.45, fireMul: 1.35, note: '风暴之眼：移速 ×1.22，判定 -0.45，开火 ×1.35' },

  // ── 宿罪之重（幽幽子 #4「亡我乡 -宿罪-」·生存 44s）：罪业压身走得慢，但身体半透明
  sinGravity: { moveMul: 0.88, hitAdd: -0.5, fireMul: 1, note: '宿罪之重：移速 ×0.88，判定 -0.5（半透明化）' },

  // ── 龙玉凝望（辉夜 #1「龙颈之玉」·生存 60s）：五色宝光定身，判定线被折射
  jewelGaze: { moveMul: 0.9, hitAdd: -0.5, fireMul: 1.1, note: '龙玉凝望：移速 ×0.9，判定 -0.5，开火 ×1.1' },

  // ── 梦枝庇护（辉夜 #8「蓬莱的玉枝 -梦色之乡-」·生存 66s）：金枝托底，动作轻快
  dreamBough: { moveMul: 1.12, hitAdd: -0.35, fireMul: 1.6, note: '梦枝庇护：移速 ×1.12，判定 -0.35，开火 ×1.6' },

  // ── 花咲余韵（幽幽子 #6「反魂蝶 -八分咲」）：花开到八分，节奏被带快
  bloomGrace: { moveMul: 0.95, hitAdd: -0.25, fireMul: 1.5, note: '花咲余韵：移速 ×0.95，判定 -0.25，开火 ×1.5' },
};

/** 判断是不是 STG 玩家（平台关玩家没有 sx / 原型 update） */
function isStgPlayer(p) {
  return p && typeof p.sx === 'number' && typeof p.update === 'function';
}

/** 应用一帧效果（所有字段都是可叠加的安全改写；判定半径每帧重遮蔽，幂等） */
function tick(player, dt, eff, st) {
  if (typeof eff.moveMul === 'number') shiftBy(player, eff.moveMul, dt);
  if (typeof eff.hitAdd === 'number') {
    if (typeof st.base.hitRadius !== 'number') st.base.hitRadius = player.hitRadius;
    overrideHitRadius(player, st.base.hitRadius + eff.hitAdd);
  }
  if (typeof eff.fireMul === 'number') rapidFire(player, eff.fireMul, dt);
}

/**
 * 主入口（安全 no-op 约定）。
 * @param {object} player StgPlayer 实例
 * @param {string} effectKey
 * @param {number} dt 秒
 */
export function updateCardEffect(player, effectKey, dt) {
  if (!isStgPlayer(player) || !(dt > 0)) return;
  const key = effectKey || 'none';
  let st = player._cardEffect;
  if (!st) {
    st = { key: 'none', base: {} };
    player._cardEffect = st;
  }
  if (st.key !== key) {
    restoreHitRadius(player); // 上一效果的判定影子先清掉，新的再按自己的 base 重新记
    st.key = key;
    st.base = {};
  }
  const eff = EFFECTS[key];
  if (!eff) return; // 未识别 key / none：no-op（已还原上一个效果）
  try {
    tick(player, dt, eff, st);
  } catch (_) {
    // 单帧异常不允许打断主循环；下一帧仍会尝试（幂等，不会累积破坏）
  }
}

/** 露出的只读信息：供 docs / preview / debug 使用 */
export const EFFECT_KEYS = ['none', 'darkSpot', 'devourPull', 'frostSlide', 'diamondFocus', 'tailwind', 'stormEye', 'sinGravity', 'jewelGaze', 'dreamBough', 'bloomGrace'];

/** 逐 key 的中文说明（docs 直接引用） */
export const EFFECT_INFO = {
  none: '无效果',
  darkSpot: EFFECTS.darkSpot.note,
  devourPull: EFFECTS.devourPull.note,
  frostSlide: EFFECTS.frostSlide.note,
  diamondFocus: EFFECTS.diamondFocus.note,
  tailwind: EFFECTS.tailwind.note,
  stormEye: EFFECTS.stormEye.note,
  sinGravity: EFFECTS.sinGravity.note,
  jewelGaze: EFFECTS.jewelGaze.note,
  dreamBough: EFFECTS.dreamBough.note,
  bloomGrace: EFFECTS.bloomGrace.note,
};

/** 供预览 / 自检读数值（返回副本，避免外部改表） */
export function effectStats(key) {
  const eff = EFFECTS[key];
  if (!eff) return null;
  return { moveMul: eff.moveMul, hitAdd: eff.hitAdd, fireMul: eff.fireMul, note: eff.note };
}

export default updateCardEffect;
