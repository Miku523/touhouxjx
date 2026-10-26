/**
 * 逐卡调参数据（stage1–6 共 28 张 + 5 面中途妖梦 3 张 + EXTRA 12 张 = 43 张全量）。
 *
 * 契约见 docs/BOSS_TIMING_SPEC.md 3.1；逐卡表见 docs/BOSS_TIMING_TABLE.md；
 * effect / fx / accent / densityMul / speedMul 按 docs/BOSS_CREATIVE_DESIGN.md §一 / §五 回填。
 *
 * 字段：
 * - limit   该卡限时（秒）                          —— damage 卡超出即失败奖励；survival 卡到点自动切卡
 * - mode    'damage' 打空血条进下一张
 *           'survival' Boss 免疫伤害、坚持到 limit 自动进下一张
 *           'both' 双条件卡：撑满 limit 算过关，打空血条也算过关（谁先满足都行）
 * - tier    该卡的单卡难度档 1–5（2026-10-24 新增），映射见 CARD_TIER_MUL：
 *           在 E/N/H/L 全局倍率之上再乘一次弹数与弹速，只影响这张卡的弹幕手感，不影响血量。
 * - fx      卡面屏幕叠加特效键，合法键见 src/game/cardfx.js 的 FX_KEYS
 *           （none / darkSpot / darkVeil / fireflies / hail / freeze / wind / petals /
 *            night / moon / butterfly / voidFlame / fairyDust / redMist）
 * - accent  该卡主题色，取设计表 §一 主色（与 BOSS_DEFS 卡内主色一致）
 * - effect  卡面玩家效果键，合法键见 src/game/cardEffects.js 的 EFFECT_KEYS
 *           （none / darkSpot / devourPull / frostSlide / diamondFocus / tailwind /
 *            stormEye / sinGravity / jewelGaze / dreamBough / bloomGrace）
 * - dps     三挡火力（Lv3 = power 48）基准 hp/s = 2026-10-25 当前构建实测有效 DPS（主线 3 seeds / EXTRA 8 seeds 取中位）。
 *           运行期血量 = Math.max(1, Math.round(limit * dps * CARD_HP_ANCHOR))，不乘难度血量系数。
 *           survival 卡不承伤、不参与血量反推 → null。
 * - hp      可选：直接钉死该卡基础血量，优先于 limit × dps × CARD_HP_ANCHOR（EXTRA 12 张里的击破 / 双条件卡走这条）。
 * - densityMul / speedMul  该卡自身的基础密度 / 弹速倍率（默认 1），会与 tier 相乘。
 * - name    与 src/game/boss.js 里 BOSS_DEFS[key].phases[i].name 完全一致，仅供数据校验 / 调试；
 *           运行期卡名仍以 BOSS_DEFS 为准。
 * - note    人类可读备注（非运行期字段）。
 *
 * 2026-10-24 重定标（用户口述）：
 *  - 所有限时按用户新给的秒数整体压缩（主线 3189s → 1736s），EXTRA 12 张首次接入限时与结算奖励。
 *  - 血量保底线从「满火力 Lv4」下调到「火力 Lv2 / Lv3」：见 CARD_HP_ANCHOR（2026-10-25 三挡重定标起统一为 Lv3）。
 *  - 存活卡收敛为 4 张：4-5、5-4、6-7、芙-4（芙-7 QED 深夜改回击破卡 90s）；芙-10 为双条件卡。
 *    （4-2 / 6-1 / 6-8 用户拍定改回普通击破卡）
 *
 * 2026-10-25 三挡重定标（用户口述）：「1 面到 EX 面血量都偏低，适当往上调高，保证三挡火力
 * 打完还能剩 5~6 秒（60 秒卡）」；EXTRA 再硬 15~20%（用户要求 1:1.15~1.2）。
 *  - 主线：每卡 dps 换成当前构建 Lv3 实测 DPS，锚点 CARD_LV3_SHARE = 0.655（bot 口径占限时 65.5%，
 *    真人折算 0.79~0.88 → 60 秒卡剩 7~13 秒，典型 9~10 秒）。
 *    （2026-10-25 下午用户再要求「都下调一些血量，中下程度」：锚点 0.72 → 0.655，妖梦 3 张再降 10%。）
 *  - EXTRA：11 张击破 / 双条件卡显式 hp = round(CARD_EX_SHARE × limit × 实测dps)，CARD_EX_SHARE = 0.77 = 0.655 × 1.18。

 * 暂不写入的可选字段：patterns（覆盖该卡 pattern 数组）。
 */

import { PLAYER_ATK_SCALE } from './balance.js';

/**
 * 单卡难度档 → 弹数 / 弹速倍率。
 * 值是「相对 E/N/H/L 全局倍率的额外乘数」，档 3 = 1.0 即维持现有基准。
 * 口径来源：用户 2026-10-24 选择「每张卡一个 1–5 档」，档位只调弹幕密度与弹速。
 */
export const CARD_TIER_MUL = Object.freeze({
  1: { density: 0.75, speed: 0.9 },   // 很松
  2: { density: 0.88, speed: 0.95 },  // 偏松
  3: { density: 1.0, speed: 1.0 },    // 标准（现基准）
  4: { density: 1.15, speed: 1.06 },  // 偏紧
  5: { density: 1.3, speed: 1.12 },   // 很紧
});

/**
 * 血量锚点：三挡火力（Lv3 = power 48）打完还剩 5~6 秒（按 60 秒卡折算）。
 *
 * 2026-10-25 重定标（用户口述）：「1 面到 EX 面血量都偏低，适当往上调高；保证三挡火力打完
 * 还能剩 5~6 秒（60 秒卡），换算到别的限时按同一比例」。
 *  - 本表每张卡的 dps = 当前构建下、三挡火力（Lv3 / power 48）实测有效 DPS
 *    （CDP 无头 Edge + tools/sim_bot.js，god + 不放炸弹；主线 3 seeds、EXTRA 8 seeds 取中位）。
 *    旧口径的 dps 是「2026-10-21 攻击力上调前的满火力实测 ×0.76」，靠 CARD_HP_ANCHOR 补偿；
 *    现在 dps 直接换成当前构建的 Lv3 实测值，锚点只表示「目标占比」，不再需要 ×PLAYER_ATK_SCALE。
 *  - CARD_LV3_SHARE = 0.655：bot 口径占限时 65.5%。真人对同一张卡通常比 bot 慢 1.2~1.35×
 *    （bot 开 god 敢贴脸输出），折算约 0.79~0.88 → 60 秒卡打完剩 7~13 秒（典型 9~10 秒）。
 *    2026-10-25 下午用户觉得上一版（0.72）偏紧，要求整体再下调一档、并把妖梦降得更多。
 *  - 想整体更紧/更松只改这一个常量：血量与它线性相关，改完复跑
 *    `node tools/_verify_bosscards.mjs --plan "N:1-6" --power 48 --lockPower 48 --targetRatio 0.655`。
 */
export const CARD_LV3_SHARE = 0.655;
export const CARD_HP_ANCHOR = CARD_LV3_SHARE;
/** EXTRA 单独口径：在主线目标占比之上再 ×1.18（用户要求 EX 比正常比例再硬 15~20%）。 */
export const CARD_EX_SHARE = 0.77;
/**
 * 旧锚点（火力 Lv2 口径，2026-10-24 用，已废弃）：0.884 = 0.4 × 2.6 × 0.85。
 * 保留导出仅为文档 / 旧脚本引用，运行期不再使用。
 */
export const CARD_LV2_SHARE = 0.4;
export const CARD_DPS_CAL = 0.85;
export const CARD_HP_ANCHOR_LEGACY = CARD_LV2_SHARE * PLAYER_ATK_SCALE * CARD_DPS_CAL;   // ≈ 0.884

/**
 * 终局血量倍率（2026-10-26 用户口述）：作用在「逐卡血量」（显式 hp / limit × dps × 锚点）之后，
 * 用来整体加厚 Boss 血条，不重新标定 0.655 / 0.77 这两个目标占比。
 *  - 「将全BOSS血量上调5%左右」→ 主线 7 个 Boss（含 5 面中途妖梦）统一 ×1.05；
 *  - 「蕾米莉亚上调8%」→ EXTRA 中途战雷米莉亚的总血量 ×1.08（是覆盖值，不是 5% 再叠 8%）；
 *  - 「芙兰朵路上调10%」→ EXTRA 关底芙兰朵露的总血量 ×1.10（同上，覆盖值）。
 *  - 同日第二轮：「魂魄妖梦再加3%」→ 1.0815（= 1.05 × 1.03，覆盖值）；
 *    「西行寺幽幽子加3.8%」→ 1.0899（= 1.05 × 1.038，按伤害卡合计 +3.8% 标定）。
 * 口径：这是「单场 Boss 总血量」的倍率，逐卡四舍五入后相加；存活卡（survival）的血条只是
 * 拖时间的底、不影响判定，也一起加厚。以后想再整体调松紧只改这里，不用逐张改 hp。
 */
export const BOSS_FINAL_HP_MUL = 1.05;
/** 单独覆盖的 Boss（值 = 该 Boss 自己的总血量倍率，覆盖 BOSS_FINAL_HP_MUL，不是再乘）。 */
export const BOSS_FINAL_HP_MUL_OVERRIDE = {
  remilia: 1.08,
  flandre: 1.10,
  youmu: 1.0815,   // 2026-10-26「再加 3%」= 1.05 × 1.03
  yuyuko: 1.0899,  // 2026-10-26「加 3.8%」= 1.05 × 1.038
};
/** 取某个 Boss 的终局血量倍率；未登记的 Boss 用全局值。 */
export function finalHpMulFor(key) {
  const override = Number(BOSS_FINAL_HP_MUL_OVERRIDE[key]);
  return Number.isFinite(override) && override > 0 ? override : BOSS_FINAL_HP_MUL;
}

/** 取档位对应的倍率；非法 / 未填 = 档 3（不改变现有手感） */
export function tierMultipliers(tier) {
  return CARD_TIER_MUL[Number(tier)] || CARD_TIER_MUL[3];
}

export const BOSS_CARD_TUNING = {
  // 1 面 · 露米娅（2 张）
  rumia: {
    hpMul: 12.74,
    cards: [
      {
        name: '宵暗「月之暗面」', note: '黑暗氛围',
        limit: 50, mode: 'damage', tier: 3, fx: 'moon', accent: '#b48cff',
        effect: 'none', dps: 235.7,
      },
      {
        name: '暗符「黑暗吞噬」', note: '黑暗吞噬氛围；被漩涡吸住',
        limit: 60, mode: 'damage', tier: 3, fx: 'night', accent: '#8f6bd8',
        effect: 'devourPull', dps: 240.9,
      },
    ],
  },

  // 2 面 · 莉格露（3 张）
  wriggle: {
    hpMul: 11.02,
    cards: [
      {
        name: '灯符「萤火虫现象」', note: '萤火虫氛围',
        limit: 60, mode: 'damage', tier: 3, fx: 'fireflies', accent: '#a8ff8f',
        effect: 'none', dps: 237.3,
      },
      {
        name: '蠢符「小虫风暴」', note: '2026-10-24 用户改为 60s（原 105）',
        limit: 60, mode: 'damage', tier: 3, fx: 'fireflies', accent: '#a8ff8f',
        effect: 'none', dps: 223.9,
      },
      {
        name: '隐虫「萤火虫之夜」',
        note: '2026-10-24 用户改为 70s（原 90）；黑暗聚光：玩家周围亮、其余全黑，fx 必须为 darkSpot',
        limit: 70, mode: 'damage', tier: 3, fx: 'darkSpot', accent: '#a8ff8f',
        effect: 'darkSpot', dps: 217.1,
      },
    ],
  },

  // 3 面 · 琪露诺（4 张）
  cirno: {
    hpMul: 8.99,
    cards: [
      {
        name: '冰符「冰柱落下」', note: '冰柱下落氛围',
        limit: 30, mode: 'damage', tier: 2, fx: 'hail', accent: '#bfeaff',
        effect: 'none', dps: 215.9,
      },
      {
        name: '雹符「冰雹风暴」', note: '2026-10-24 用户改为 60s（原 120）',
        limit: 60, mode: 'damage', tier: 3, fx: 'hail', accent: '#bfeaff',
        effect: 'none', dps: 217.6,
      },
      {
        name: '冻符「完美冻结」', note: '2026-10-24 用户改为 80s（原 90）；脚下打滑',
        limit: 80, mode: 'damage', tier: 4, fx: 'freeze', accent: '#a8e8ff',
        effect: 'frostSlide', dps: 214.1,
      },
      {
        name: '雪符「钻石风暴」', note: '限时不变 99s；冰晶风暴氛围，晶光晃眼',
        limit: 99, mode: 'damage', tier: 4, fx: 'freeze', accent: '#bfeaff',
        effect: 'diamondFocus', dps: 209.8,
      },
    ],
  },

  // 4 面 · 射命丸文（5 张）#2 / #5 为 survival 卡（打不到 Boss）
  aya: {
    hpMul: 7.12,
    cards: [
      {
        name: '风符「风神一扇」', note: '2026-10-24 用户改为 36s（原 66）',
        limit: 36, mode: 'damage', tier: 3, fx: 'wind', accent: '#ff9a9a',
        effect: 'none', dps: 354.5,
      },
      {
        name: '疾风「风神少女」',
        note: '2026-10-24 用户改为 40s（原 30），并拍定为「击破卡」而非存活卡；'
          + 'dps 按三挡实测回填 231.8（2026-10-25 重定标；旧满火力估算 102 作废）',
        limit: 40, mode: 'damage', tier: 4, fx: 'wind', accent: '#ff6b6b',
        effect: 'tailwind', dps: 231.8,
      },
      {
        name: '岐符「天之八衢」', note: '2026-10-24 用户改为 60s（原 90）',
        limit: 60, mode: 'damage', tier: 4, fx: 'wind', accent: '#ff9a9a',
        effect: 'none', dps: 288.9,
      },
      {
        name: '风神「天狗颪」', note: '2026-10-24 用户改为 80s（原 90）',
        limit: 80, mode: 'damage', tier: 4, fx: 'wind', accent: '#ff6b6b',
        effect: 'none', dps: 322.6,
      },
      {
        name: '「幻想风靡」',
        note: '打不到 Boss；2026-10-24 用户改为 60s（原 180s）',
        limit: 60, mode: 'survival', tier: 5, fx: 'wind', accent: '#ff6b6b',
        effect: 'stormEye', dps: null,
      },
    ],
  },

  // 5 面 · 西行寺幽幽子（6 张）#6 为 survival 卡（2026-10-26 起；原 #4 是生存卡）
  yuyuko: {
    hpMul: 5.79,
    cards: [
      {
        name: '幽雅「死出诱蛾灯」', note: '2026-10-24 用户改为 30s（原 50）',
        limit: 30, mode: 'damage', tier: 3, fx: 'night', accent: '#ffa8d8',
        effect: 'none', dps: 200.2,
      },
      {
        name: '蝶符「花之舞」', note: '2026-10-24 用户改为 45s（原 60）；花瓣氛围',
        limit: 45, mode: 'damage', tier: 3, fx: 'petals', accent: '#ffa8d8',
        effect: 'none', dps: 203.2,
      },
      {
        name: '蝶符「死蝶之华尔兹」', note: '2026-10-24 用户改为 90s（原 150）',
        limit: 90, mode: 'damage', tier: 4, fx: 'petals', accent: '#ffa8d8',
        effect: 'none', dps: 217.8,
      },
      {
        name: '亡乡「亡我乡 -宿罪-」',
        note: '2026-10-26 用户把原生存符改为可被攻击的击破卡（60s 不变）；罪业压身、身体半透明。显式 hp 按「反魂蝶退出伤害池后伤害合计 +3.8%」反推（≈ 359 dps 等效）',
        limit: 60, mode: 'damage', tier: 4, fx: 'night', accent: '#ffa8d8',
        effect: 'sinGravity', dps: 359, hp: 14109,
      },
      {
        name: '冥符「常夜樱」', note: '2026-10-24 用户改为 90s（原 120）；夜樱花瓣氛围',
        limit: 90, mode: 'damage', tier: 4, fx: 'petals', accent: '#ff8fd0',
        effect: 'none', dps: 191.5,
      },
      {
        name: '反魂蝶「八分咲」',
        note: '2026-10-26 用户改为 66s 的生存卡（原 100s 击破卡）；花开八分、撑满 66 秒即过关',
        limit: 66, mode: 'survival', tier: 5, fx: 'petals', accent: '#ffa8d8',
        effect: 'bloomGrace', dps: null,
      },
    ],
  },

  // 6 面 · 蓬莱山辉夜（8 张）#1 / #8 为 survival 卡
  kaguya: {
    hpMul: 3.62,
    cards: [
      {
        name: '难题「龙颈之玉 -五色的弹丸-」',
        note: '2026-10-24 用户改为 40s（原 60）并拍定为「击破卡」；宝光定身，dps 估算待实测',
        limit: 40, mode: 'damage', tier: 4, fx: 'moon', accent: '#ffe9b0',
        effect: 'jewelGaze', dps: 220.9,
      },
      {
        name: '神宝「耀眼的龙玉」', note: '2026-10-24 用户改为 60s（原 99）；宝玉夜光氛围',
        limit: 60, mode: 'damage', tier: 4, fx: 'night', accent: '#fff8d0',
        effect: 'none', dps: 208.9,
      },
      {
        name: '难题「佛御石之钵 -不碎的意志-」', note: '2026-10-24 用户改为 80s（原 120）',
        limit: 80, mode: 'damage', tier: 4, fx: 'darkVeil', accent: '#fff8d0',
        effect: 'none', dps: 222.6,
      },
      {
        name: '神宝「佛体的金刚石」', note: '2026-10-24 用户改为 60s（原 180）',
        limit: 60, mode: 'damage', tier: 4, fx: 'freeze', accent: '#fff8d0',
        effect: 'none', dps: 201.6,
      },
      {
        name: '难题「火鼠的皮衣 -不焦躁的内心-」', note: '2026-10-24 用户改为 90s（原 360）',
        limit: 90, mode: 'damage', tier: 5, fx: 'voidFlame', accent: '#ffe9b0',
        effect: 'none', dps: 213.4,
      },
      {
        name: '神宝「火蜥蜴之盾」', note: '2026-10-24 用户拍定 30s（原 240s，此前待确认）',
        limit: 30, mode: 'damage', tier: 5, fx: 'voidFlame', accent: '#ffe9b0',
        effect: 'none', dps: 196.2,
      },
      {
        name: '难题「燕的子安贝 -永命线-」',
        note: '2026-10-24 用户改为 50s（原 300）并拍定为「存活卡」；卡名以 BOSS_DEFS 现名为准',
        limit: 50, mode: 'survival', tier: 5, fx: 'wind', accent: '#ffe9b0',
        effect: 'none', dps: null,
      },
      {
        name: '神宝「蓬莱的玉枝 -梦色之乡-」',
        note: '限时不变 66s；2026-10-24 用户拍定为「击破卡」，金枝托底、动作轻快，dps 估算待实测',
        limit: 66, mode: 'damage', tier: 5, fx: 'fairyDust', accent: '#ffe9b0',
        effect: 'dreamBough', dps: 193.5,
      },
    ],
  },

  // ── 5 面 · 中途 Boss · 魂魄妖梦（半灵二天一流）────────────────────────
  // 中途 Boss：血量按限时 × dps × CARD_HP_ANCHOR 走，单卡比关底短。
  // system/phantom（半灵实体 + 断灵槽）写在 boss.js 的 BOSS_DEFS.youmu 里，
  // 本表只管「限时 / HUD / 卡特效」；不写 hpMul（中途 Boss 靠 dps × limit 定量）。
  // 2026-10-25 下午：用户要求「魂魄妖梦适当下调血量」→ 3 张改成显式 hp，比主线锚点再松 10%
  // （hp = round(limit × dps × CARD_LV3_SHARE × 0.90)），dps 仍保留三挡实测值供复算。
  // 2026-10-26：用户「魂魄妖梦再加 3%」→ 走 BOSS_FINAL_HP_MUL_OVERRIDE.youmu = 1.0815
  // （= 1.05 × 1.03），显式 hp 不动；终局血量 5,411 / 4,520 / 7,092 = 17,023。
  youmu: {
    cards: [
      {
        name: '人符「现世斩」', note: '中途 Boss；2026-10-24 用户改为 30s（原 34）',
        limit: 30, mode: 'damage', tier: 3, fx: 'fairyDust', accent: '#9fe8d0',
        effect: 'none', dps: 282.9, hp: 5003,
      },
      {
        name: '人鬼「未来永劫斩」', note: '中途 Boss；2026-10-24 用户改为 30s（原 38）',
        limit: 30, mode: 'damage', tier: 3, fx: 'petals', accent: '#7fe0c8',
        effect: 'none', dps: 236.3, hp: 4179,
      },
      {
        name: '断灵「剑楼阁」', note: '中途 Boss 终盘；2026-10-24 用户改为 45s（原 46）',
        limit: 45, mode: 'damage', tier: 4, fx: 'night', accent: '#c8ffe8',
        effect: 'none', dps: 247.2, hp: 6558,
      },
    ],
  },

  // ── EXTRA · 中途 Boss · 蕾米莉亚·斯卡雷特（2 张）─────────────────────
  // 2026-10-24 首次接入逐卡限时：此前 EXTRA 完全不在本表 → 不限时、无卡面 fx、无结算奖励。
  // 血量标定（2026-10-25 三挡重定标）：EXTRA 12 张一律显式 hp
  // = round(CARD_EX_SHARE × limit × 三挡实测dps)，CARD_EX_SHARE = 0.77 = 主线 0.655 × 1.18。
  // 2026-10-25 下午整体下调：11 张 hp 一并 ×(0.77/0.85) ≈ ×0.906。
  // 下面的 dps = 当前构建三挡火力（Lv3）实测有效 DPS（8 seeds 中位），供复算 / 对照。
  remilia: {
    cards: [
      {
        name: '咒诅「弗拉德·特佩斯」',
        note: 'EXTRA #1（中途）；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 13601（10-seed 实测时的血量）× 42.0 / 中位耗时 58.45s',
        limit: 60, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 246.3, hp: 10236,
      },
      {
        name: '天罚「大卫之星」',
        note: 'EXTRA #2（中途）；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 6105（10-seed 实测时的血量）× 42.0 / 中位耗时 20.95s',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 216.3, hp: 8463,
      },
    ],
  },

  // ── EXTRA · 关底 Boss · 芙兰朵露（10 张；#4 #7 存活、#10 双条件）────────
  flandre: {
    cards: [
      {
        name: '禁忌「蔓越莓陷阱」',
        note: 'EXTRA #1；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 9741（10-seed 实测时的血量）× 42.0 / 中位耗时 40.73s',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 241.9, hp: 10922,
      },
      {
        name: '禁忌「雷瓦汀」',
        note: 'EXTRA #2；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 17164（10-seed 实测时的血量）× 42.0 / 中位耗时 56.88s',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 315.4, hp: 14365,
      },
      {
        name: '禁忌「四重存在」',
        note: 'EXTRA #3；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 9384（10-seed 实测时的血量）× 42.0 / 中位耗时 38.22s',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 218.6, hp: 10731,
      },
      {
        name: '秘弹「然后就一个人都不剩了？」',
        note: 'EXTRA #4；用户 2026-10-24 拍定为「存活卡」，坚持 30s 即过关',
        limit: 30, mode: 'survival', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: null,
      },
      {
        name: '禁弹「星弧破碎」',
        note: 'EXTRA #5；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 38.3s → hp = 8760（10-seed 实测时的血量）× 38.3 / 中位耗时 34.82s',
        limit: 45, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 203.1, hp: 5689,
      },
      {
        name: '禁弹「折反射」',
        note: 'EXTRA #6；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 10810（10-seed 实测时的血量）× 42.0 / 中位耗时 36.85s',
        limit: 60, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 259.8, hp: 11587,
      },
      {
        name: 'QED「495年的波纹」',
        note: 'EXTRA #7；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 7686（10-seed 实测时的血量）× 42.0 / 中位耗时 53.37s',
        limit: 90, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 156.3, hp: 10324,
      },
      {
        name: '禁忌「吸血鬼之宴」',
        note: 'EXTRA #8；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 34.0s → hp = 2617（10-seed 实测时的血量）× 34.0 / 中位耗时 14.62s',
        limit: 40, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 199.5, hp: 7509,
      },
      {
        name: '禁忌「破坏之瞳」',
        note: 'EXTRA #9；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 25.5s → hp = 2485（10-seed 实测时的血量）× 25.5 / 中位耗时 7.88s',
        limit: 30, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 247.9, hp: 5674,
      },
      {
        name: '未明「长夜不醒之约」',
        note: 'EXTRA #10 双条件卡：限时 120s（用户口述），血量按用户口述在上一版 6778 的基础上翻一倍 = 13556（全 EXTRA 最高）；撑满 120s 或打空血条都算过关，5-seed 实测打空约 61–78s。',
        limit: 120, mode: 'both', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 206.9, hp: 17118,
      },
    ],
  },
};

/**
 * 取某个 Boss 的逐卡调参；未登记返回 null。
 * @param {string} key BOSS_DEFS 的键（'rumia' | 'wriggle' | 'cirno' | 'aya' | 'yuyuko' | 'youmu' | 'kaguya' | 'remilia' | 'flandre'）
 * @param {number|null} [index] 卡序号（0-based）。省略 = 返回整个 Boss 的 tuning；越界 = null
 * @returns {{hpMul:number, cards:Array<object>}|object|null}
 */
export function cardTuningFor(key, index = null) {
  const tuning = BOSS_CARD_TUNING[key];
  if (!tuning) return null;
  if (index == null) return tuning;
  return tuning.cards[index] || null;
}
