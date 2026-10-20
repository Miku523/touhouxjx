/**
 * 火力（POWER）全局规则 —— 一处定义，玩家 / 关卡 / HUD 共用。
 *
 * 设计（对齐东方原作的手感）：
 *  - 吃 P 点 → POWER 上升 → 火力等级上升 → 自机弹变多、变强
 *  - 放符卡（Bomb）→ 清空全屏弹幕 + 对 Boss / 敌人造成大伤害 + 短暂无敌
 *  - 符卡从 POWER 里扣费 → 火力等级随之下降（"烧火力"）
 *  - 被弹 / 落命也会损失一部分 POWER，火力跟着掉
 *  - 累计拾取 99 点 POWER → 恢复 1 条残机（1UP），计数清零后循环
 *
 * POWER 是连续值（0–64），每 16 点一个火力等级：
 *   Lv.1  0–15    Lv.2  16–31    Lv.3  32–47    Lv.4  48–64
 *
 * 上限 64 是「加长」过的：满槽是早先 16 的四倍，一整条 64 点。
 * 为了不让条变成「吃了没反应」的长条，P 的供给同时改成「稀但值钱」：
 * 掉落率 ×0.5（src/assets/levelgen.js 的 P_DROP_SCALE），单颗 1 → 4 点，
 * 吃一颗条跳 6%，前两面满打满吃约 2.8 条满槽。
 */
export const POWER = Object.freeze({
  max: 64,
  perLevel: 16,
  levels: 4,
  castCost: 24,      // 符卡消耗（约 4 成槽，和原作的 Bomb 费用手感一致）
  pickup: 4,         // 吃一枚 P 点回复（掉落率砍半换来的「值钱 P」：4 点 = 满槽的 1/16）
  kill: 1,           // 击破杂兵
  killStg: 1,        // STG 关击破
  graze: 0.075,      // STG 擦弹（每颗）
  extend: 99,        // 累计拾取 99 点 POWER → 恢复 1 命（循环）
  respawnKeep: { platform: 0.5, stg: 0.6 },
});

/** POWER → 火力等级（1–4） */
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
