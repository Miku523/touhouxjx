/**
 * 火力（POWER）全局规则 —— 一处定义，玩家 / 关卡 / HUD 共用。
 *
 * 设计（对齐东方原作的手感）：
 *  - 吃 P 点 → POWER 上升 → 火力等级上升 → 自机弹变多、变强
 *  - 放符卡（Bomb）→ 清空全屏弹幕 + 对 Boss / 敌人造成大伤害 + 短暂无敌
 *  - 符卡从 POWER 里扣费 → 火力等级随之下降（"烧火力"）
 *  - 被弹 / 落命也会损失一部分 POWER，火力跟着掉
 *
 * POWER 是连续值（0–128），每 32 点一个火力等级：
 *   Lv.1  0–31    Lv.2  32–63    Lv.3  64–95    Lv.4  96–128
 */
export const POWER = Object.freeze({
  max: 128,
  perLevel: 32,
  levels: 4,
  castCost: 50,      // 符卡消耗（POWER 点）
  pickup: 12,        // 吃一枚 P 点回复
  kill: 2,           // 击破杂兵
  killStg: 1.5,      // STG 关击破
  graze: 0.6,        // STG 擦弹（每颗）
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
