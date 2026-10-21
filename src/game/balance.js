/**
 * 全局数值平衡开关。
 *
 * 想整体调整手感时只改下面两个数，不用去翻各关散落的常量：
 *   - PLAYER_ATK_SCALE：自机（灵梦 / 魔理沙）所有直接伤害的倍率
 *   - ENEMY_HP_SCALE  ：所有敌人血量的倍率（Boss 各符卡血条、总血条与道中杂兵）
 *
 * 2026-10-21：按需求「两名自机攻击力翻一倍」，PLAYER_ATK_SCALE 由 1.35 上调到 2.7。
 * 当前 2.7 / 0.9 表示自机输出为初版的 2.7 倍、敌人血量为初版的 0.9 倍，
 * 击杀耗时约为初版的 0.9 / 2.7 ≈ 0.33，也就是比上一版（1.35）正好快一倍。
 */

/** 自机输出倍率（普通弹、符卡、冲刺撞击、踩踏/撞击杂兵都吃这个倍率） */
export const PLAYER_ATK_SCALE = 2.7;

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
