/**
 * bulletArt/index.js —— 专属弹型的注册表（唯一聚合点）。
 *
 * bullets.js 只从这里取 { ext, autoSpin, glowKey, build, name }：
 *   ext     剪影外沿 = ext * size（size 是判定半径，绘制时再乘 VIS）
 *   build   (g, size, color) 在弹体中心作画，长轴朝上
 *   autoSpin  true = 绘制时按 b.rot 旋转（有明确朝向的弹型设 false）
 *   glowKey 用 _lib.mat() 的哪套材质取辉光色
 *
 * 新弹型只要在 types.js 里加编号、在对应模块里加条目、在这里合并即可。
 */
import { SKIN_IDS, SKIN_NAMES } from './types.js';
import { mat } from './_lib.js';
import dark from './dark.js';
import bug from './bug.js';
import ice from './ice.js';
import leaf from './leaf.js';
import sakura from './sakura.js';
import jewel from './jewel.js';
import stone from './stone.js';
import flame from './flame.js';
import bird from './bird.js';
import blade from './blade.js';
import bat from './bat.js';
import spear from './spear.js';
import crystal from './crystal.js';
import lava from './lava.js';
import knife from './knife.js';

/** 弹型编号 → 美术定义 */
export const SKIN_META = Object.freeze({
  ...dark,
  ...bug,
  ...ice,
  ...leaf,
  ...sakura,
  ...jewel,
  ...stone,
  ...flame,
  ...bird,
  ...blade,
  ...bat,
  ...spear,
  ...crystal,
  ...lava,
  ...knife,
});

export { SKIN_IDS, SKIN_NAMES };

/** 取某个编号的美术定义（未知返回 null） */
export function skinMeta(type) {
  return SKIN_META[type] || null;
}

/**
 * 专属弹型的辉光色（bullets.js 的加法辉光层用）。
 * 冰晶家族返回 null，让调用方回退到自己的冷色 palette。
 */
export function skinGlow(type, color) {
  const m = SKIN_META[type];
  return m ? mat(color, m.glowKey || 'cold').glow : null;
}
