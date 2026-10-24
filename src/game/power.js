/**
 * 火力（POWER）全局规则 —— 一处定义，玩家 / 关卡 / HUD 共用。
 *
 * 设计（对齐东方原作的手感）：
 *  - 吃 P 点 → POWER 上升 → 火力等级上升 → 自机弹变多、变强
 *  - 放符卡（Bomb）→ 清空全屏弹幕 + 对 Boss / 敌人造成大伤害 + 短暂无敌
 *  - 符卡从 POWER 里扣费 → 火力等级随之下降（"烧火力"）
 *  - 被弹 / 落命也会损失一部分 POWER，火力跟着掉
 *  - 累计 99 点（拾取 POWER / 擦弹 0.02 点 / 符卡奖励）→ 恢复 1 条残机（1UP），计数清零后循环
 *
 * POWER 是连续值（0–128），每 24 点一个火力等级（共 5 级）：
 *   Lv.1  0–23    Lv.2  24–47    Lv.3  48–71    Lv.4  72–95    Lv.5  96–128
 *
 * 上限 128 是「加长」过的：满槽是早先 16 的八倍，一整条 128 点（32 颗 P）。
 * 槽变长时单颗 P 的点数不跟着涨（仍是 4 点）：吃一颗条跳 3.1%，
 * 前两面满打满吃约 2.8 条满槽（掉落率 ×0.5 见 src/assets/levelgen.js 的 P_DROP_SCALE）。
 * 因为满槽变长了，升满 5 级需要的补给也更多：Lv.5 要 96 点 = 24 颗 P。
 */
export const POWER = Object.freeze({
  max: 128,
  perLevel: 24,
  levels: 5,
  castCost: 48,      // 符卡消耗（约 4 成槽，和原作的 Bomb 费用手感一致）
  pickup: 4,         // 吃一枚 P 点回复（不随上限变：4 点 = 满槽的 1/32，约 3.1%）
  kill: 1,           // 击破杂兵
  killStg: 1,        // STG 关击破
  graze: 0.075,      // STG 擦弹（每颗）：POWER（不再重复计入 1UP）
  grazePoints: 0.02, // STG 擦弹（每颗）：1UP 累计点数（99 点 = 1 残机；擦弹总 1UP = 此值）
  cardClear: 0.25,   // 符卡结算奖励：满槽的 1/4（1/4P）
  cardNoHit: 0.5,    // 符卡无伤额外奖励：满槽的 1/2（1/2P）
  extend: 99,        // 累计 99 点（POWER / 擦弹 / 符卡奖励）→ 恢复 1 命（循环）
  respawnKeep: { platform: 0.5, stg: 0.6 },
});

/** 符卡击破 / 存活到点的基础奖励：1/4P（按满槽比例换算，当前 32） */
export function cardClearPower() {
  return Math.round(POWER.max * POWER.cardClear);
}

/** 符卡无伤额外奖励：1/2P（按满槽比例换算，当前 64） */
export function cardNoHitPower() {
  return Math.round(POWER.max * POWER.cardNoHit);
}

/** POWER → 火力等级（1–5） */
export function powerLevel(power = 0) {
  const p = Math.max(0, power);
  return Math.min(POWER.levels, 1 + Math.floor(p / POWER.perLevel));
}

/** 距离下一级还差多少 POWER（满级返回 0） */
export function powerToNextLevel(power = 0) {
  const lv = powerLevel(power);
  if (lv >= POWER.levels) return 0;
  return lv * POWER.perLevel - Math.max(0, power);
}

/** 当前能否放符卡 */
export function canSpell(power = 0) {
  return power >= POWER.castCost;
}

/** 扣掉符卡费用后的 POWER（不会为负） */
export function spendPower(power = 0, cost = POWER.castCost) {
  return Math.max(0, power - cost);
}
