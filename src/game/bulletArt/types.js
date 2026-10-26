/**
 * bulletArt/types.js —— 角色专属弹型的编号表（唯一真源）。
 *
 * 编号 0~4 是原「冰晶家族」（见 src/game/bullets.js 顶部注释），保持不动；
 * 5 起为本次「符卡专属弹幕」新增的角色特色弹型。
 * 任何模块（bullets.js / bossBullets.js / 预览页）都必须从这里取编号，禁止硬编码数字。
 */

/* ---------- 1 面 · 露米娅：红 + 暗 ---------- */
export const B_CRESCENT = 5;   // 月牙（暗铁色月体 + 猩红受光刃）
export const B_DARKORB = 6;    // 吞噬暗球（近黑球体 + 血色日冕）

/* ---------- 2 面 · 莉格露：萤火 / 虫 ---------- */
export const B_FIREFLY = 7;    // 萤火虫（暗色鞘身 + 发光腹节 + 薄翅）
export const B_BUG = 8;        // 小虫（甲虫俯视：鞘翅中缝 + 六足）

/* ---------- 3 面 · 琪露诺：小冰块 ---------- */
export const B_ICECUBE = 9;    // 小冰块（等距立方体：顶面高光 + 内裂）

/* ---------- 4 面 · 射命丸文：枫叶（四面秋瀑） ---------- */
export const B_MAPLE = 10;     // 枫叶（五裂掌叶 + 叶脉 + 叶柄）

/* ---------- 5 面 · 西行寺幽幽子：樱花 ---------- */
export const B_SAKURA = 11;    // 樱花（五瓣樱花，瓣尖带缺）
export const B_PETAL = 12;     // 单枚樱瓣（半透明，可自转）

/* ---------- 6 面 · 蓬莱山辉夜：一卡一弹 ---------- */
export const B_FIVEJEWEL = 13; // 五色的弹丸（棱玉 + 五色棱边）
export const B_DRAGONORB = 14; // 耀眼的龙玉（大玉 + 环带）
export const B_STONE = 15;     // 佛御石之钵（碎石片）
export const B_DIAMOND = 16;   // 佛体的金刚石（钻石切面）
export const B_FLAME = 17;     // 火鼠的皮衣（不灭火舌）
export const B_SCALE = 18;     // 火蜥蜴之盾（火鳞碎片）
export const B_SWALLOW = 19;   // 燕之子安贝（燕尾双叉）
export const B_BRANCH = 20;    // 蓬莱的玉枝（金枝玉叶）

/* ---------- 5 面中途 Boss · 魂魄妖梦：刀 ---------- */
export const B_BLADE = 21;     // 太刀刀身（刃口带薄荷色刀光）
export const B_SLASHARC = 22;  // 刀斩弧（新月刀光）
export const B_SPIRIT = 23;    // 半灵（半透明的灵体残影）

/* ---------- EXTRA · 雷米莉亚 / 芙兰朵露：血与破碎 ---------- */
export const B_BAT = 24;       // 血蝠（张开的蝠翼剪影 + 血红眼睛）
export const B_SPEAR = 25;     // 血枪（高速穿刺的猩红长枪）
export const B_CRYSTAL = 26;   // 血水晶（晶簇：一主两副的棱面晶体）
export const B_LAVA = 27;      // 熔岩（暗红岩浆球 + 裂纹 + 飞溅）

/* ---------- EXTRA · 十六夜咲夜：飞刀 ---------- */
export const B_KNIFE = 28;     // 飞刀（细长短刃：钢刀身 + 同色发光刃口，朝向 = 速度方向）

/** 全部专属弹型编号（预览页 / 预热 / 自检用） */
export const SKIN_IDS = [
  B_CRESCENT, B_DARKORB,
  B_FIREFLY, B_BUG,
  B_ICECUBE,
  B_MAPLE,
  B_SAKURA, B_PETAL,
  B_FIVEJEWEL, B_DRAGONORB, B_STONE, B_DIAMOND, B_FLAME, B_SCALE, B_SWALLOW, B_BRANCH,
  B_BLADE, B_SLASHARC, B_SPIRIT,
  B_BAT, B_SPEAR, B_CRYSTAL, B_LAVA,
  B_KNIFE,
];

/** 编号 → 中文名（调试 / 预览页标签） */
export const SKIN_NAMES = {
  [B_CRESCENT]: '月牙',
  [B_DARKORB]: '吞噬暗球',
  [B_FIREFLY]: '萤火虫',
  [B_BUG]: '小虫',
  [B_ICECUBE]: '小冰块',
  [B_MAPLE]: '枫叶',
  [B_SAKURA]: '樱花',
  [B_PETAL]: '樱瓣',
  [B_FIVEJEWEL]: '五色玉',
  [B_DRAGONORB]: '龙玉',
  [B_STONE]: '碎石',
  [B_DIAMOND]: '金刚石',
  [B_FLAME]: '不灭火',
  [B_SCALE]: '火鳞',
  [B_SWALLOW]: '燕尾',
  [B_BRANCH]: '玉枝',
  [B_BLADE]: '太刀',
  [B_SLASHARC]: '刀斩',
  [B_SPIRIT]: '半灵',
  [B_BAT]: '血蝠',
  [B_SPEAR]: '血枪',
  [B_CRYSTAL]: '血水晶',
  [B_LAVA]: '熔岩',
  [B_KNIFE]: '飞刀',
};
