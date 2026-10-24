/**
 * cardSkins.js —— 符卡专属弹型映射表（28 张符卡 + 5 面中途妖梦）
 *
 * 契约：
 *   - CARD_SKINS[bossKey][cardIndex] = 卡规则；
 *   - 卡规则 { skin?, map? }：
 *       skin  = 兜底弹型（该卡里 0-3 号弹默认换成它）；
 *       map   = 精确覆盖 { 原 type → 新 type }，优先于 skin；
 *       map[4] 写了才会替换激光（默认激光保持原样，避免光束被图案弹替代后丢掉观感）。
 *   - bossBullets.js 的自定义弹幕在 firePattern 里通过 bullets.skinMap 生效：
 *     只在「自定义签名弹幕」执行期间设置，普通内置弹幕不受影响。
 *   - 弹型编号真源见 types.js；这里的 skin 全部用常量，禁止写裸数字。
 *
 * 设计原则（对应用户要求 m00001）：
 *   1. 每张符卡的弹幕必须有该角色的专属弹型，但**只换皮不换弹道**——原弹幕的
 *      n / speed / spread / rate / turn 等参数一律不动，观感是「美化」不是「重做」；
 *   2. 一个角色一套视觉母题：露米娅=红/暗月牙与吞噬球，莉格露=虫与萤，
 *      琪露诺=小冰块，文=枫叶，幽幽子=樱，妖梦=刀，辉夜=八件蓬莱宝物；
 *   3. 同卡内部保留层次：大弹、小弹按 map 区分，避免整卡只有一种图案而糊成一片。
 */

import {
  B_CRESCENT,
  B_DARKORB,
  B_FIREFLY,
  B_BUG,
  B_ICECUBE,
  B_MAPLE,
  B_SAKURA,
  B_PETAL,
  B_FIVEJEWEL,
  B_DRAGONORB,
  B_STONE,
  B_DIAMOND,
  B_FLAME,
  B_SCALE,
  B_SWALLOW,
  B_BRANCH,
  B_BLADE,
  B_SLASHARC,
  B_SPIRIT,
  B_BAT,
  B_SPEAR,
  B_CRYSTAL,
  B_LAVA,
} from './types.js';

/** 激光：默认保留（不做图案替换） */
const LASER = 4;

/** 生成一张卡规则的小工具，只为让表更好读 */
const card = (skin, map) => (map ? { skin, map } : { skin });

export const CARD_SKINS = {
  /* ---------------- 1 面 · 露米娅：红 + 暗 ---------------- */
  rumia: [
    /* 1-1 宵暗「月之暗面」 */ card(B_CRESCENT),
    /* 1-2 暗符「黑暗吞噬」 */ card(B_DARKORB),
  ],

  /* ---------------- 2 面 · 莉格露：虫 / 萤 ---------------- */
  wriggle: [
    /* 2-1 灯符「萤火虫现象」 */ card(B_FIREFLY),
    /* 2-2 蠢符「小虫风暴」   */ card(B_BUG),
    /* 2-3 隐虫「萤火虫之夜」 */ card(B_FIREFLY, { 2: B_BUG }),
  ],

  /* ---------------- 3 面 · 琪露诺：小冰块 ---------------- */
  cirno: [
    /* 3-1 冰符「冰柱落下」 */ card(B_ICECUBE),
    /* 3-2 雹符「冰雹风暴」 */ card(B_ICECUBE),
    /* 3-3 冻符「完美冻结」 */ card(B_ICECUBE),
    /* 3-4 雪符「钻石风暴」 */ card(B_ICECUBE),
  ],

  /* ---------------- 4 面 · 射命丸文：枫叶 ---------------- */
  aya: [
    /* 4-1 风符「风神一扇」   */ card(B_MAPLE),
    /* 4-2 疾风「风神少女」   */ card(B_MAPLE),
    /* 4-3 岐符「天之八衢」   */ card(B_MAPLE),
    /* 4-4 风神「天狗颪」     */ card(B_MAPLE),
    /* 4-5 「幻想风靡」       */ card(B_MAPLE),
  ],

  /* ---------------- 5 面 · 幽幽子：樱花 ---------------- */
  yuyuko: [
    /* 5-1 幽雅「死出诱蛾灯」       */ card(B_SAKURA, { 2: B_PETAL }),
    /* 5-2 蝶符「花之舞」           */ card(B_PETAL),
    /* 5-3 蝶符「死蝶之华尔兹」     */ card(B_PETAL, { 2: B_SAKURA }),
    /* 5-4 亡乡「亡我乡 -宿罪-」    */ card(B_SAKURA, { 1: B_PETAL }),
    /* 5-5 冥符「常夜樱」           */ card(B_SAKURA),
    /* 5-6 反魂蝶「八分咲」         */ card(B_SAKURA, { 2: B_PETAL }),
  ],

  /* ---------------- 5 面中途 · 魂魄妖梦：刀 ---------------- */
  youmu: [
    /* 5-0 人符「现世斩」     */ card(B_SLASHARC, { 1: B_BLADE, 3: B_SLASHARC }),
    /* 5-1 人鬼「未来永劫斩」 */ card(B_BLADE, { 1: B_SLASHARC, 3: B_BLADE }),
    /* 5-2 断灵「剑楼阁」     */ card(B_BLADE, { 3: B_SPIRIT }),
  ],

  /* ---------------- 6 面 · 蓬莱山辉夜：八件宝物 ---------------- */
  kaguya: [
    /* 6-1 龙颈之玉 -五色的弹丸- */ card(B_FIVEJEWEL, { 2: B_DRAGONORB }),
    /* 6-2 耀眼的龙玉             */ card(B_DRAGONORB),
    /* 6-3 佛御石之钵             */ card(B_STONE),
    /* 6-4 佛体的金刚石           */ card(B_DIAMOND),
    /* 6-5 火鼠的皮衣             */ card(B_FLAME),
    /* 6-6 火蜥蜴之盾             */ card(B_SCALE),
    /* 6-7 燕的子安贝             */ card(B_SWALLOW),
    /* 6-8 蓬莱的玉枝             */ card(B_BRANCH, { 2: B_BRANCH }),
  ],

  /* ---------------- EXTRA · 雷米莉亚·斯卡雷特：蝙蝠 / 血枪 ---------------- */
  remilia: [
    /* 咒诅「弗拉德·特佩斯」：蝙蝠群为主，螺旋（type 3）是穿刺血枪 */
    card(B_BAT, { 3: B_SPEAR }),
    /* 天罚「大卫之星」：血月为主，反向螺旋（type 3）是蝙蝠 */
    card(B_CRESCENT, { 3: B_BAT }),
  ],

  /* ---------------- EXTRA · 芙兰朵露：血水晶 / 熔岩 / 蝙蝠 ---------------- */
  flandre: [
    /* 0 禁忌「蔓越莓陷阱」：水晶浆果 + 泡弹(type 2)是蝙蝠 */
    card(B_CRYSTAL, { 2: B_BAT }),
    /* 1 禁忌「雷瓦汀」：熔岩雨 */
    card(B_LAVA),
    /* 2 禁忌「四重存在」：水晶分身 + 花瓣(type 3)是蝙蝠 */
    card(B_CRYSTAL, { 3: B_BAT }),
    /* 3 秘弹「然后就一个人都不剩了？」：熔岩 + 泡弹(type 2)是蝙蝠 */
    card(B_LAVA, { 2: B_BAT }),
    /* 4 禁弹「星弧破碎」：血晶碎片 + 螺旋/弧(type 3)是蝙蝠 */
    card(B_CRYSTAL, { 3: B_BAT }),
    /* 5 禁弹「折反射」：血晶棱镜 */
    card(B_CRYSTAL),
    /* 6 QED「495年的波纹」：熔岩波纹 + 大环(type 2)是血晶 */
    card(B_LAVA, { 2: B_CRYSTAL }),
    /* 7 禁忌「吸血鬼之宴」：蝙蝠群（本卡的母题就是蝙蝠） */
    card(B_BAT),
    /* 8 禁忌「破坏之瞳」：熔岩之瞳 */
    card(B_LAVA),
    /* 9 未明「明けない夜の約束」：血月 + 螺旋/花瓣/涡(type 3)是蝙蝠 */
    card(B_CRESCENT, { 3: B_BAT }),
  ],
};

/** 取某张卡的规则；没有规则的 Boss（EX 中途/关底等）返回 null */
export function cardSkin(key, index) {
  const list = CARD_SKINS[key];
  if (!list) return null;
  return list[index] || null;
}

/**
 * 把原弹型换算成专属弹型。
 * - 已经是专属弹型（>=5）不再二次替换；
 * - 激光（4）默认保留，除非规则里显式写了 map[4]；
 * - 其余 0-3 号：map 命中优先，否则用卡片兜底 skin。
 */
export function mapBulletType(rule, type) {
  if (!rule) return type;
  if (type >= 5) return type;
  const mapped = rule.map && rule.map[type];
  if (mapped !== undefined) return mapped;
  if (type === LASER) return type;
  if (rule.skin !== undefined) return rule.skin;
  return type;
}

/** 给 bullets.spawn 用的类型映射函数；无规则返回 null（= 不接管） */
export function skinMapper(key, index) {
  const rule = cardSkin(key, index);
  if (!rule) return null;
  return (type) => mapBulletType(rule, type);
}

export default CARD_SKINS;
