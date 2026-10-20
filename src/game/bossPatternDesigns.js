/**
 * bossPatternDesigns.js —— 28 张符卡的逐卡弹幕设计表（创造模式）。
 *
 * 契约（docs/BOSS_TIMING_SPEC.md §3.4 / Lead 接线）：
 *   - CARD_PATTERNS[bossKey][cardIndex] = [patternSpec, …]（每卡 4 个变体）
 *   - boss.js 构造时：卡弹幕优先取 tuning.patterns，其次 patternsFor(key, i)；
 *     返回空数组则回退原 BOSS_DEFS patterns。**所以这里必须非空，否则玩家看到的还是旧弹幕。**
 *   - patternSpec 沿用 firePattern 的发射器字段：typeName / rate / n / speed / spread /
 *     angle / spin / arms / rings / r / life / color / weight …
 *     本表只写「本卡要 override 的字段」，其余走 firePattern 的默认与逐招变体。
 *   - typeName 一律用 bossBullets.js 里注册的自定义签名弹型（全 28 个键均已在
 *     CUSTOM_PATTERNS 中实现），不引入未实现的类型名。
 *
 * 变体编排原则：
 *   1. 每卡至少 1 个「卡名签名」变体（weight 最高，玩家最常看到）；
 *   2. 其余变体是同一机制的节奏 / 密度 / 相位错开（n、rate、speed、spin、radius 不同），
 *      避免每一拍观感完全一样，也不让单招看起来像重复播放；
 *   3. 每卡都留「呼吸」：没有一张卡的变体全部是高速高密度 —— 至少一个变体偏慢 / 偏疏；
 *   4. 数组顺序 = 玩家实际可能的开场顺序；开场招是随机的，所以第一项必须最像这张卡。
 */

/** 1 面 · 露米娅：两卡都在「暗」里做文章，一卡月相、一卡吞噬。 */
const RUMIA = [
  // #1 宵暗「月之暗面」——月亮一点点转过去：正反月牙 + 缓缓下坠的大月亮
  [
    { typeName: 'moonHalo', rate: 0.52, n: 10, speed: 92, spin: 0.55, r: 5, weight: 3 },
    { typeName: 'moonHalo', rate: 0.72, n: 14, speed: 76, spin: -0.4, r: 4.5, weight: 2 },
    { typeName: 'devour', rate: 1.05, n: 11, speed: 88, radius: 320, weight: 1.4 },
    { typeName: 'moonHalo', rate: 1.15, n: 7, speed: 120, spin: 0.9, r: 6, weight: 1.2 },
  ],
  // #2 暗符「黑暗吞噬」——被漩涡卷进去：反向螺旋 + 顶端碎屑
  [
    { typeName: 'devour', rate: 0.5, n: 14, speed: 104, radius: 300, r: 5, weight: 3 },
    { typeName: 'devour', rate: 0.85, n: 20, speed: 82, radius: 340, rain: 5, weight: 2 },
    { typeName: 'moonHalo', rate: 0.9, n: 8, speed: 70, spin: -0.3, r: 4, weight: 1.3 },
    { typeName: 'devour', rate: 1.35, n: 9, speed: 130, radius: 280, rain: 3, weight: 1.2 },
  ],
];

/** 2 面 · 莉格露：萤火（引导）/ 虫群（扰乱）/ 黑暗里的光（最高优先卡）。 */
const WRIGGLE = [
  // #1 灯符「萤火虫现象」——一小群萤火散开，偶尔一只直扑
  [
    { typeName: 'fireflySwarm', rate: 0.5, n: 6, speed: 72, weight: 3 },
    { typeName: 'fireflySwarm', rate: 0.8, n: 9, speed: 58, weight: 2 },
    { typeName: 'nightFireflies', rate: 0.95, n: 7, lit: 2, speed: 60, weight: 1.4 },
    { typeName: 'fireflySwarm', rate: 1.2, n: 4, speed: 96, weight: 1.2 },
  ],
  // #2 蠢符「小虫风暴」——两股反向虫群穿插，风向每拍偏移
  [
    { typeName: 'bugStorm', rate: 0.46, n: 8, speed: 132, burst: 5, weight: 3 },
    { typeName: 'bugStorm', rate: 0.7, n: 11, speed: 110, burst: 6, weight: 2 },
    { typeName: 'fireflySwarm', rate: 0.9, n: 8, speed: 84, weight: 1.4 },
    { typeName: 'bugStorm', rate: 1.1, n: 6, speed: 150, burst: 4, weight: 1.2 },
  ],
  // #3 隐虫「萤火虫之夜」——全屏近黑，只有玩家周围亮；暗弹多、亮萤少
  [
    { typeName: 'nightFireflies', rate: 0.44, n: 11, lit: 3, litSpeed: 88, speed: 62, weight: 3 },
    { typeName: 'nightFireflies', rate: 0.68, n: 16, lit: 4, litSpeed: 76, speed: 54, weight: 2 },
    { typeName: 'fireflySwarm', rate: 0.95, n: 5, speed: 64, weight: 1.3 },
    { typeName: 'nightFireflies', rate: 1.2, n: 8, lit: 2, litSpeed: 108, speed: 74, weight: 1.2 },
  ],
];

/** 3 面 · 琪露诺：落下（冰柱）/ 风暴（冰雹）/ 冻结（定点→碎）/ 钻石（旋转晶阵）。 */
const CIRNO = [
  // #1 冰符「冰柱落下」——竖直冰棱加速砸下，每三拍底部碎冰上浮
  [
    { typeName: 'icicleFall', rate: 0.4, n: 5, speed: 175, shards: 4, weight: 3 },
    { typeName: 'icicleFall', rate: 0.62, n: 8, speed: 150, shards: 6, weight: 2 },
    { typeName: 'diamondMatrix', rate: 0.9, n: 4, arms: 4, rows: 1, spark: 3, speed: 110, weight: 1.3 },
    { typeName: 'icicleFall', rate: 1.05, n: 3, speed: 220, shards: 3, weight: 1.1 },
  ],
  // #2 雹符「冰雹风暴」——斜向冰雹，gust 波一阵紧一阵松
  [
    { typeName: 'hailSurge', rate: 0.34, n: 8, speed: 210, weight: 3 },
    { typeName: 'hailSurge', rate: 0.52, n: 12, speed: 185, weight: 2 },
    { typeName: 'icicleFall', rate: 0.8, n: 4, speed: 190, shards: 4, weight: 1.4 },
    { typeName: 'hailSurge', rate: 0.95, n: 6, speed: 250, weight: 1.2 },
  ],
  // #3 冻符「完美冻结」——先钉一圈静止结晶，半秒后同时炸开
  [
    { typeName: 'perfectFreeze', rate: 0.95, n: 14, speed: 190, weight: 3 },
    { typeName: 'perfectFreeze', rate: 1.35, n: 20, speed: 160, weight: 2 },
    { typeName: 'hailSurge', rate: 0.7, n: 6, speed: 170, weight: 1.4 },
    { typeName: 'perfectFreeze', rate: 0.65, n: 10, speed: 220, weight: 1.2 },
  ],
  // #4 雪符「钻石风暴」——会自转的菱形晶阵，角度逐拍错开
  [
    { typeName: 'diamondMatrix', rate: 0.42, n: 4, arms: 4, rows: 2, spark: 4, speed: 135, weight: 3 },
    { typeName: 'diamondMatrix', rate: 0.66, n: 5, arms: 5, rows: 2, spark: 6, speed: 120, weight: 2 },
    { typeName: 'perfectFreeze', rate: 1.1, n: 16, speed: 200, weight: 1.3 },
    { typeName: 'diamondMatrix', rate: 1.0, n: 3, arms: 3, rows: 3, spark: 2, speed: 160, weight: 1.2 },
  ],
];

/** 4 面 · 射命丸文：一扇（单侧风刃）/ 少女（高速螺旋，生存 30s）/ 八衢（八向依次）/
 *  天狗颪（下压风）/ 风靡（三拍风暴，生存 180s）。 */
const AYA = [
  // #1 风符「风神一扇」——一把巨大单侧风刃横扫，扇轴处一颗风眼
  [
    { typeName: 'kamaitachi', rate: 0.44, n: 11, speed: 330, weight: 3 },
    { typeName: 'kamaitachi', rate: 0.66, n: 15, speed: 300, weight: 2 },
    { typeName: 'crossroad', rate: 0.9, n: 3, speed: 195, weight: 1.4 },
    { typeName: 'kamaitachi', rate: 0.95, n: 8, speed: 380, weight: 1.2 },
  ],
  // #2 疾风「风神少女」（生存 30s）——风压全开：高速螺旋风墙 + 反向补环 + 瞄准快风
  [
    { typeName: 'windRush', rate: 0.3, arms: 6, speed: 175, ring: 14, ringSpeed: 125, aimed: 3, weight: 3 },
    { typeName: 'windRush', rate: 0.42, arms: 8, speed: 205, ring: 18, ringSpeed: 150, aimed: 4, weight: 2 },
    { typeName: 'kamaitachi', rate: 0.62, n: 13, speed: 360, weight: 1.4 },
    { typeName: 'windRush', rate: 0.5, arms: 4, speed: 230, ring: 10, ringSpeed: 180, aimed: 2, weight: 1.2 },
  ],
  // #3 岐符「天之八衢」——八条放射「衢」依次点亮，骨架圈缓慢旋转
  [
    { typeName: 'crossroad', rate: 0.3, n: 3, speed: 195, weight: 3 },
    { typeName: 'crossroad', rate: 0.46, n: 4, speed: 230, weight: 2 },
    { typeName: 'kamaitachi', rate: 0.8, n: 9, speed: 320, weight: 1.4 },
    { typeName: 'crossroad', rate: 0.62, n: 2, speed: 300, weight: 1.2 },
  ],
  // #4 风神「天狗颪」——大片下压风带加速度，两侧回旋风往中间挤
  [
    { typeName: 'downburst', rate: 0.42, n: 8, speed: 150, wing: 2, weight: 3 },
    { typeName: 'downburst', rate: 0.64, n: 12, speed: 130, wing: 3, weight: 2 },
    { typeName: 'windRush', rate: 0.9, arms: 4, speed: 160, ring: 10, ringSpeed: 110, aimed: 2, weight: 1.3 },
    { typeName: 'downburst', rate: 1.0, n: 6, speed: 190, wing: 1, weight: 1.2 },
  ],
  // #5 「幻想风靡」（生存 180s）——三拍循环风暴，每段留一条能跟着转的安全带
  [
    { typeName: 'fantasyStorm', rate: 0.34, cycle: 5.5, ring: 16, arms: 2, rain: 9, weight: 3 },
    { typeName: 'fantasyStorm', rate: 0.46, cycle: 7.0, ring: 20, arms: 3, rain: 12, weight: 2 },
    { typeName: 'windRush', rate: 0.7, arms: 5, speed: 190, ring: 12, ringSpeed: 140, aimed: 3, weight: 1.3 },
    { typeName: 'fantasyStorm', rate: 0.55, cycle: 4.5, ring: 12, arms: 2, rain: 7, weight: 1.2 },
  ],
];

/** 5 面 · 西行寺幽幽子：诱蛾灯（引导）/ 花舞（镜像花瓣）/ 华尔兹（三拍）/
 *  亡我乡（罪网，生存 44s）/ 常夜樱（夜樱暴雪）/ 八分咲（八拍渐开）。 */
const YUYUKO = [
  // #1 幽雅「死出诱蛾灯」——一盏大灯缓缓坠向玩家，小弹同向绕灯
  [
    { typeName: 'mothLure', rate: 0.5, m: 13, speed: 82, lampSpeed: 52, flare: 6, weight: 3 },
    { typeName: 'mothLure', rate: 0.78, m: 18, speed: 68, lampSpeed: 44, flare: 8, weight: 2 },
    { typeName: 'butterflyWaltz', rate: 0.95, n: 3, speed: 110, weight: 1.3 },
    { typeName: 'mothLure', rate: 1.15, m: 9, speed: 100, lampSpeed: 62, flare: 4, weight: 1.2 },
  ],
  // #2 蝶符「花之舞」——成对花瓣镜像旋出，单边永远有路
  [
    { typeName: 'flowerDance', rate: 0.46, petals: 5, speed: 118, weight: 3 },
    { typeName: 'flowerDance', rate: 0.7, petals: 7, speed: 100, weight: 2 },
    { typeName: 'nightSakura', rate: 0.95, n: 8, speed: 110, weight: 1.4 },
    { typeName: 'flowerDance', rate: 0.36, petals: 4, speed: 140, weight: 1.2 },
  ],
  // #3 蝶符「死蝶之华尔兹」——三拍一组镜像蝶翼，拍间旋转 120°
  [
    { typeName: 'butterflyWaltz', rate: 0.3, n: 3, beat: 0.42, speed: 128, weight: 3 },
    { typeName: 'butterflyWaltz', rate: 0.44, n: 4, beat: 0.5, speed: 112, weight: 2 },
    { typeName: 'flowerDance', rate: 0.8, petals: 6, speed: 108, weight: 1.3 },
    { typeName: 'butterflyWaltz', rate: 0.58, n: 2, beat: 0.36, speed: 148, weight: 1.2 },
  ],
  // #4 亡乡「亡我乡 -宿罪-」（生存 44s）——缓慢收拢的罪网：纵列 + 横向锁链
  [
    { typeName: 'sinfulRealm', rate: 0.5, cols: 7, speed: 96, chain: 6, chainSpeed: 74, weight: 3 },
    { typeName: 'sinfulRealm', rate: 0.72, cols: 9, speed: 84, chain: 8, chainSpeed: 64, weight: 2 },
    { typeName: 'mothLure', rate: 1.0, m: 10, speed: 74, lampSpeed: 42, flare: 5, weight: 1.3 },
    { typeName: 'sinfulRealm', rate: 1.1, cols: 5, speed: 112, chain: 4, chainSpeed: 88, weight: 1.2 },
  ],
  // #5 冥符「常夜樱」——夜樱暴雪：大量带自转花瓣压下 + 稀疏花环
  [
    { typeName: 'nightSakura', rate: 0.36, n: 9, speed: 118, ring: 10, weight: 3 },
    { typeName: 'nightSakura', rate: 0.52, n: 13, speed: 100, ring: 14, weight: 2 },
    { typeName: 'flowerDance', rate: 0.85, petals: 6, speed: 120, weight: 1.3 },
    { typeName: 'nightSakura', rate: 1.0, n: 5, speed: 150, ring: 6, weight: 1.2 },
  ],
  // #6 反魂蝶「八分咲」——八拍开一分，第八拍满开补大环
  [
    { typeName: 'resurrectionBloom', rate: 0.36, n: 16, speed: 96, ring: 16, weight: 3 },
    { typeName: 'resurrectionBloom', rate: 0.5, n: 20, speed: 84, ring: 20, weight: 2 },
    { typeName: 'nightSakura', rate: 0.9, n: 8, speed: 110, ring: 8, weight: 1.3 },
    { typeName: 'resurrectionBloom', rate: 0.66, n: 12, speed: 120, ring: 12, weight: 1.2 },
  ],
];

/** 6 面 · 蓬莱山辉夜：五色玉（生存 60s）/ 龙玉（大玉+射线）/ 石钵（缺口围栏）/
 *  金刚石（晶阵+激光）/ 火鼠（慢速不灭火）/ 火蜥蜴（半圈盾弧）/ 燕（高速双叉）/
 *  玉枝（分形金枝，生存 66s）。 */
const KAGUYA = [
  // #0 难题「龙颈之玉 -五色的弹丸-」（生存 60s）——五色轮流领唱，螺旋相位转动
  [
    { typeName: 'dragonJewel', rate: 0.42, arms: 5, speed: 125, weight: 3 },
    { typeName: 'dragonJewel', rate: 0.62, arms: 7, speed: 108, weight: 2 },
    { typeName: 'shiningJewel', rate: 0.9, rays: 6, speed: 280, orbSpeed: 58, weight: 1.3 },
    { typeName: 'dragonJewel', rate: 0.8, arms: 3, speed: 150, weight: 1.2 },
  ],
  // #1 神宝「耀眼的龙玉」——大玉缓缓飘，六向细长光矢
  [
    { typeName: 'shiningJewel', rate: 0.38, rays: 6, speed: 300, orbSpeed: 62, weight: 3 },
    { typeName: 'shiningJewel', rate: 0.55, rays: 8, speed: 265, orbSpeed: 50, weight: 2 },
    { typeName: 'dragonJewel', rate: 0.8, arms: 5, speed: 118, weight: 1.3 },
    { typeName: 'shiningJewel', rate: 0.72, rays: 4, speed: 340, orbSpeed: 74, weight: 1.2 },
  ],
  // #2 难题「佛御石之钵 -不碎的意志-」——缺口石钵围栏缓慢收缩 + 落石
  [
    { typeName: 'stoneBowl', rate: 0.62, n: 18, radius: 250, gaps: 2, speed: 74, stones: 2, weight: 3 },
    { typeName: 'stoneBowl', rate: 0.9, n: 24, radius: 280, gaps: 2, speed: 62, stones: 3, weight: 2 },
    { typeName: 'adamant', rate: 1.05, arms: 4, rays: 4, speed: 120, weight: 1.3 },
    { typeName: 'stoneBowl', rate: 0.48, n: 14, radius: 220, gaps: 3, speed: 86, stones: 1, weight: 1.2 },
  ],
  // #3 神宝「佛体的金刚石」——旋转菱形晶阵 + 定时硬直激光
  [
    { typeName: 'adamant', rate: 0.4, arms: 4, rays: 4, speed: 130, laserSpeed: 330, weight: 3 },
    { typeName: 'adamant', rate: 0.58, arms: 6, rays: 6, speed: 115, laserSpeed: 300, weight: 2 },
    { typeName: 'stoneBowl', rate: 0.95, n: 16, radius: 240, gaps: 2, speed: 70, stones: 2, weight: 1.3 },
    { typeName: 'adamant', rate: 0.75, arms: 3, rays: 8, speed: 155, laserSpeed: 280, weight: 1.2 },
  ],
  // #4 难题「火鼠的皮衣 -不焦躁的内心-」（360s）——极慢的不灭火涡轮 + 上窜火星
  [
    { typeName: 'fireRat', rate: 0.7, arms: 3, speed: 78, embers: 2, emberSpeed: 118, weight: 3 },
    { typeName: 'fireRat', rate: 1.05, arms: 5, speed: 62, embers: 3, emberSpeed: 96, weight: 2 },
    { typeName: 'lizardShield', rate: 1.25, dirs: 6, speed: 135, weight: 1.3 },
    { typeName: 'fireRat', rate: 0.55, arms: 2, speed: 96, embers: 1, emberSpeed: 140, weight: 1.2 },
  ],
  // #5 神宝「火蜥蜴之盾」——六面盾弧交替开合，永远只开一半方向
  [
    { typeName: 'lizardShield', rate: 0.46, dirs: 6, speed: 145, weight: 3 },
    { typeName: 'lizardShield', rate: 0.66, dirs: 8, speed: 125, weight: 2 },
    { typeName: 'fireRat', rate: 0.95, arms: 4, speed: 84, embers: 3, emberSpeed: 110, weight: 1.3 },
    { typeName: 'lizardShield', rate: 0.8, dirs: 4, speed: 170, weight: 1.2 },
  ],
  // #6 难题「燕之子安贝 -不死之药-」——极快燕尾双叉 + 慢速燕迹
  [
    { typeName: 'swallowTrail', rate: 0.3, n: 2, speed: 380, weight: 3 },
    { typeName: 'swallowTrail', rate: 0.44, n: 3, speed: 340, weight: 2 },
    { typeName: 'crossroad', rate: 0.85, n: 3, speed: 210, weight: 1.3 },
    { typeName: 'swallowTrail', rate: 0.56, n: 1, speed: 430, weight: 1.2 },
  ],
  // #7 神宝「蓬莱的玉枝 -梦色之乡-」（生存 66s）——金枝分叉，慢速铺开成一棵发光的树
  [
    { typeName: 'dreamBranch', rate: 0.55, stems: 3, speed: 92, weight: 3 },
    { typeName: 'dreamBranch', rate: 0.78, stems: 5, speed: 80, weight: 2 },
    { typeName: 'dragonJewel', rate: 1.0, arms: 5, speed: 105, weight: 1.3 },
    { typeName: 'dreamBranch', rate: 0.42, stems: 2, speed: 110, weight: 1.2 },
  ],
];

/**
 * 逐卡弹幕设计表：key = BOSS_DEFS 的键，value = 按卡序的 pattern 数组。
 * 只覆盖 stage1–6 的 28 张卡；EXTRA 的 remilia / flandre 不在此表（保持原样）。
 */
export const CARD_PATTERNS = {
  rumia: RUMIA,
  wriggle: WRIGGLE,
  cirno: CIRNO,
  aya: AYA,
  yuyuko: YUYUKO,
  kaguya: KAGUYA,
};

/**
 * 取某 Boss 第 i 张卡的弹幕覆盖表。
 * @param {string} key 'rumia' | 'wriggle' | 'cirno' | 'aya' | 'yuyuko' | 'kaguya'
 * @param {number} i 卡序号（0-based）
 * @returns {Array<object>|null} 没有覆盖时返回 null（boss.js 回退原 BOSS_DEFS patterns）
 */
export function patternsFor(key, i) {
  const cards = CARD_PATTERNS[key];
  if (!Array.isArray(cards) || i < 0 || i >= cards.length) return null;
  const pats = cards[i];
  return Array.isArray(pats) && pats.length ? pats : null;
}

/** 卡数与卡键的静态清单，供自检 / 文档 / HUD 调试引用 */
export const CARD_INDEX = {
  rumia: ['宵暗「月之暗面」', '暗符「黑暗吞噬」'],
  wriggle: ['灯符「萤火虫现象」', '蠢符「小虫风暴」', '隐虫「萤火虫之夜」'],
  cirno: ['冰符「冰柱落下」', '雹符「冰雹风暴」', '冻符「完美冻结」', '雪符「钻石风暴」'],
  aya: ['风符「风神一扇」', '疾风「风神少女」', '岐符「天之八衢」', '风神「天狗颪」', '「幻想风靡」'],
  yuyuko: ['幽雅「死出诱蛾灯」', '蝶符「花之舞」', '蝶符「死蝶之华尔兹」', '亡乡「亡我乡 -宿罪-」', '冥符「常夜樱」', '反魂蝶「八分咲」'],
  kaguya: ['难题「龙颈之玉 -五色的弹丸-」', '神宝「耀眼的龙玉」', '难题「佛御石之钵 -不碎的意志-」', '神宝「佛体的金刚石」', '难题「火鼠的皮衣 -不焦躁的内心-」', '神宝「火蜥蜴之盾」', '难题「燕之子安贝 -不死之药-」', '神宝「蓬莱的玉枝 -梦色之乡-」'],
};

export default CARD_PATTERNS;
