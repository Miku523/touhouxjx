/**
 * 全局数值平衡开关。
 *
 * 想整体调整手感时只改下面两个数，不用去翻各关散落的常量：
 *   - PLAYER_ATK_SCALE：自机（灵梦 / 魔理沙）所有直接伤害的倍率
 *   - ENEMY_HP_SCALE  ：所有敌人血量的倍率（Boss 各符卡血条、总血条与道中杂兵）
 *
 * 当前 1.35 / 0.9 表示自机输出提高 35%、敌人血量下调 10%，
 * 击杀耗时约为原来的 0.9 / 1.35 ≈ 0.67，也就是快了约三分之一。
 */

/** 自机输出倍率（普通弹、符卡、冲刺撞击都吃这个倍率） */
export const PLAYER_ATK_SCALE = 1.35;

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
