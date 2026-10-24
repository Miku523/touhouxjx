/**
 * 全局数值平衡开关。
 *
 * 想整体调整手感时只改下面两个数，不用去翻各关散落的常量：
 *   - PLAYER_ATK_SCALE：自机（灵梦 / 魔理沙）所有直接伤害的倍率
 *   - ENEMY_HP_SCALE  ：所有敌人血量的倍率（Boss 各符卡血条、总血条与道中杂兵）
 *
 * 2026-10-21：按需求「两名自机攻击力翻一倍」，PLAYER_ATK_SCALE 由 1.35 上调到 2.7。
 * 2026-10-24：按需求「略微降低一点点玩家攻击力」，2.7 → 2.6（−3.7%）；
 *   同时主弹 Lv.4 由 5 发减到 4 发、常态散布加大、按住 Shift 低速时收束（见 playerShots.js / stage.js）。
 * 当前 2.6 / 0.9 表示自机输出为初版的 2.6 倍、敌人血量为初版的 0.9 倍，
 * 击杀耗时约为初版的 0.9 / 2.6 ≈ 0.35，仍比 1.35 那一版快将近一倍。
 */

/** 自机输出倍率（普通弹、符卡、冲刺撞击、踩踏/撞击杂兵都吃这个倍率） */
export const PLAYER_ATK_SCALE = 2.6;

/** 敌人血量倍率（Boss 各符卡血条、总血条、道中杂兵） */
export const ENEMY_HP_SCALE = 0.9;

/** 玩家造成伤害时统一走这里缩放 */
export function scalePlayerDamage(dmg) {
  return dmg * PLAYER_ATK_SCALE;
}

/** 敌人血量统一走这里缩放：保留小数，避免小血量杂兵被 round 抹平 */
export function scaleEnemyHp(hp) {
  return hp * ENEMY_HP_SCALE;
}
