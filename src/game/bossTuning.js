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
 * - dps     满火力（POWER 64 → 火力 Lv4）基准 hp/s = 早期验收实测有效 DPS ×0.76。
 *           运行期血量 = Math.max(1, Math.round(limit * dps * CARD_HP_ANCHOR))，不乘难度血量系数。
 *           survival 卡不承伤、不参与血量反推 → null。
 * - hp      可选：直接钉死该卡基础血量，优先于 limit × dps × CARD_HP_ANCHOR。
 * - densityMul / speedMul  该卡自身的基础密度 / 弹速倍率（默认 1），会与 tier 相乘。
 * - name    与 src/game/boss.js 里 BOSS_DEFS[key].phases[i].name 完全一致，仅供数据校验 / 调试；
 *           运行期卡名仍以 BOSS_DEFS 为准。
 * - note    人类可读备注（非运行期字段）。
 *
 * 2026-10-24 重定标（用户口述）：
 *  - 所有限时按用户新给的秒数整体压缩（主线 3189s → 1736s），EXTRA 12 张首次接入限时与结算奖励。
 *  - 血量保底线从「满火力 Lv4」下调到「火力 Lv2 / Lv3」：见 CARD_HP_ANCHOR。
 *  - 存活卡仅保留 5 张：4-5、5-4、6-7、芙-4、芙-7；芙-10 为双条件卡。
 *    （4-2 / 6-1 / 6-8 用户拍定改回普通击破卡）
 *
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
 * 血量保底火力档（换算成「当前自机攻击力」下的血量系数）。
 *
 * 推导：
 *  - 0.4 = 2026-10-24 校准时的火力 Lv2 与 Lv4 主弹数比（2 发 / 5 发）→ Lv2 输出 ≈ 0.4 × Lv4；
 *    之后 Lv4 主弹减到 4 发（同日手感调整），这里保留 0.4 不重算：Lv2 卡的血量与耗时不变，
 *    满火力清卡反而稍慢，与「减少弹数、降低攻击」的方向一致；
 *  - PLAYER_ATK_SCALE = 自机攻击力相对「dps 标定那一版」的倍数。本表里的 dps 是
 *    2026-10-21 攻击力上调 1.35→2.7 之前测的，所以运行期要把它补回来，否则同样血量
 *    现在只要 1/2.7 的时间就打空，手感会整体偏软；
 *  - 两者相乘，再乘 CARD_DPS_CAL（实测折损 0.85）就是「Lv2 玩家按当前攻击力打完这张卡所需血量」。
 * 效果（2026-10-24 bot 实测校准后）：Lv2 ≈ 0.76×limit 打空、Lv3 ≈ 0.51×、Lv4 ≈ 0.30×
 * （Lv4 主弹 5→4 后约 0.38×，即满火力击破同样一张卡比校准时稍慢）。
 * 用户原话（2026-10-24）：「保证 60 秒内可以击破，需要玩家三档火力…或者说两档吧，
 * 三档到两档这个区间之内；反正玩家不能死，死了就过不去。」
 *  （Lv2 时约 0.76×limit，掉一条命降到 Lv1 ≈ 0.2 → 需要 1.5×limit，必超时）
 */
export const CARD_LV2_SHARE = 0.4;
/** 实测折损：2026-10-24 bot 实测满火力 DPS 只有「2.7 倍线性外推」的 ~0.85（站位/命中率所致）。 */
export const CARD_DPS_CAL = 0.85;
export const CARD_HP_ANCHOR = CARD_LV2_SHARE * PLAYER_ATK_SCALE * CARD_DPS_CAL;   // ≈ 0.884 → 0.88

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
        effect: 'none', dps: 176,
      },
      {
        name: '暗符「黑暗吞噬」', note: '黑暗吞噬氛围；被漩涡吸住',
        limit: 60, mode: 'damage', tier: 3, fx: 'night', accent: '#8f6bd8',
        effect: 'devourPull', dps: 178,
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
        effect: 'none', dps: 164,
      },
      {
        name: '蠢符「小虫风暴」', note: '2026-10-24 用户改为 60s（原 105）',
        limit: 60, mode: 'damage', tier: 3, fx: 'fireflies', accent: '#a8ff8f',
        effect: 'none', dps: 170,
      },
      {
        name: '隐虫「萤火虫之夜」',
        note: '2026-10-24 用户改为 70s（原 90）；黑暗聚光：玩家周围亮、其余全黑，fx 必须为 darkSpot',
        limit: 70, mode: 'damage', tier: 3, fx: 'darkSpot', accent: '#a8ff8f',
        effect: 'darkSpot', dps: 156,
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
        effect: 'none', dps: 166,
      },
      {
        name: '雹符「冰雹风暴」', note: '2026-10-24 用户改为 60s（原 120）',
        limit: 60, mode: 'damage', tier: 3, fx: 'hail', accent: '#bfeaff',
        effect: 'none', dps: 156,
      },
      {
        name: '冻符「完美冻结」', note: '2026-10-24 用户改为 80s（原 90）；脚下打滑',
        limit: 80, mode: 'damage', tier: 4, fx: 'freeze', accent: '#a8e8ff',
        effect: 'frostSlide', dps: 162,
      },
      {
        name: '雪符「钻石风暴」', note: '限时不变 99s；冰晶风暴氛围，晶光晃眼',
        limit: 99, mode: 'damage', tier: 4, fx: 'freeze', accent: '#bfeaff',
        effect: 'diamondFocus', dps: 150,
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
        effect: 'none', dps: 125,
      },
      {
        name: '疾风「风神少女」',
        note: '2026-10-24 用户改为 40s（原 30），并拍定为「击破卡」而非存活卡；'
          + 'dps 按实测回填（整关跑满火力 Lv4 击破耗时 18.1s / 原血量 5581 ≈ 308 dps → dps 取 102）',
        limit: 40, mode: 'damage', tier: 4, fx: 'wind', accent: '#ff6b6b',
        effect: 'tailwind', dps: 102,
      },
      {
        name: '岐符「天之八衢」', note: '2026-10-24 用户改为 60s（原 90）',
        limit: 60, mode: 'damage', tier: 4, fx: 'wind', accent: '#ff9a9a',
        effect: 'none', dps: 137,
      },
      {
        name: '风神「天狗颪」', note: '2026-10-24 用户改为 80s（原 90）',
        limit: 80, mode: 'damage', tier: 4, fx: 'wind', accent: '#ff6b6b',
        effect: 'none', dps: 122,
      },
      {
        name: '「幻想风靡」',
        note: '打不到 Boss；2026-10-24 用户改为 60s（原 180s）',
        limit: 60, mode: 'survival', tier: 5, fx: 'wind', accent: '#ff6b6b',
        effect: 'stormEye', dps: null,
      },
    ],
  },

  // 5 面 · 西行寺幽幽子（6 张）#4 为 survival 卡
  yuyuko: {
    hpMul: 5.79,
    cards: [
      {
        name: '幽雅「死出诱蛾灯」', note: '2026-10-24 用户改为 30s（原 50）',
        limit: 30, mode: 'damage', tier: 3, fx: 'night', accent: '#ffa8d8',
        effect: 'none', dps: 153,
      },
      {
        name: '蝶符「花之舞」', note: '2026-10-24 用户改为 45s（原 60）；花瓣氛围',
        limit: 45, mode: 'damage', tier: 3, fx: 'petals', accent: '#ffa8d8',
        effect: 'none', dps: 154,
      },
      {
        name: '蝶符「死蝶之华尔兹」', note: '2026-10-24 用户改为 90s（原 150）',
        limit: 90, mode: 'damage', tier: 4, fx: 'petals', accent: '#ffa8d8',
        effect: 'none', dps: 154,
      },
      {
        name: '亡乡「亡我乡 -宿罪-」',
        note: '2026-10-24 用户改为 60s（原 44s）；罪业压身、身体半透明',
        limit: 60, mode: 'survival', tier: 4, fx: 'night', accent: '#ffa8d8',
        effect: 'sinGravity', dps: null,
      },
      {
        name: '冥符「常夜樱」', note: '2026-10-24 用户改为 90s（原 120）；夜樱花瓣氛围',
        limit: 90, mode: 'damage', tier: 4, fx: 'petals', accent: '#ff8fd0',
        effect: 'none', dps: 154,
      },
      {
        name: '反魂蝶「八分咲」', note: '2026-10-24 用户改为 100s（原 180）；花开八分、节奏被带快',
        limit: 100, mode: 'damage', tier: 5, fx: 'petals', accent: '#ffa8d8',
        effect: 'bloomGrace', dps: 148,
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
        effect: 'jewelGaze', dps: 152,
      },
      {
        name: '神宝「耀眼的龙玉」', note: '2026-10-24 用户改为 60s（原 99）；宝玉夜光氛围',
        limit: 60, mode: 'damage', tier: 4, fx: 'night', accent: '#fff8d0',
        effect: 'none', dps: 154,
      },
      {
        name: '难题「佛御石之钵 -不碎的意志-」', note: '2026-10-24 用户改为 80s（原 120）',
        limit: 80, mode: 'damage', tier: 4, fx: 'darkVeil', accent: '#fff8d0',
        effect: 'none', dps: 152,
      },
      {
        name: '神宝「佛体的金刚石」', note: '2026-10-24 用户改为 60s（原 180）',
        limit: 60, mode: 'damage', tier: 4, fx: 'freeze', accent: '#fff8d0',
        effect: 'none', dps: 147,
      },
      {
        name: '难题「火鼠的皮衣 -不焦躁的内心-」', note: '2026-10-24 用户改为 90s（原 360）',
        limit: 90, mode: 'damage', tier: 5, fx: 'voidFlame', accent: '#ffe9b0',
        effect: 'none', dps: 150,
      },
      {
        name: '神宝「火蜥蜴之盾」', note: '2026-10-24 用户拍定 30s（原 240s，此前待确认）',
        limit: 30, mode: 'damage', tier: 5, fx: 'voidFlame', accent: '#ffe9b0',
        effect: 'none', dps: 148,
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
        effect: 'dreamBough', dps: 152,
      },
    ],
  },

  // ── 5 面 · 中途 Boss · 魂魄妖梦（半灵二天一流）────────────────────────
  // 中途 Boss：血量按限时 × dps × CARD_HP_ANCHOR 走，单卡比关底短。
  // system/phantom（半灵实体 + 断灵槽）写在 boss.js 的 BOSS_DEFS.youmu 里，
  // 本表只管「限时 / HUD / 卡特效」；不写 hpMul（中途 Boss 靠 dps × limit 定量）。
  youmu: {
    cards: [
      {
        name: '人符「现世斩」', note: '中途 Boss；2026-10-24 用户改为 30s（原 34）',
        limit: 30, mode: 'damage', tier: 3, fx: 'fairyDust', accent: '#9fe8d0',
        effect: 'none', dps: 150,
      },
      {
        name: '人鬼「未来永劫斩」', note: '中途 Boss；2026-10-24 用户改为 30s（原 38）',
        limit: 30, mode: 'damage', tier: 3, fx: 'petals', accent: '#7fe0c8',
        effect: 'none', dps: 146,
      },
      {
        name: '断灵「剑楼阁」', note: '中途 Boss 终盘；2026-10-24 用户改为 45s（原 46）',
        limit: 45, mode: 'damage', tier: 4, fx: 'night', accent: '#c8ffe8',
        effect: 'none', dps: 155,
      },
    ],
  },

  // ── EXTRA · 中途 Boss · 蕾米莉亚·斯卡雷特（2 张）─────────────────────
  // 2026-10-24 首次接入逐卡限时：此前 EXTRA 完全不在本表 → 不限时、无卡面 fx、无结算奖励。
  // 血量标定：本表其余卡的 dps 是 2026-10-21 攻击力上调前的旧标定，靠 CARD_HP_ANCHOR 补偿；
  // EXTRA 这 12 张没有历史 dps，用 20 seeds 的「带 tier 的实测 Lv4 dps」直接反推 hp
  // = round(0.304 × limit × 实测dps)（0.304 让 Lv4 ≈ 30%、Lv3 ≈ 51%、Lv2 ≈ 76% 限时）。
  // 下面 dps 字段保留的是「裸血量时期」的测量值，仅供对照，不参与 hp 计算（EX 一律显式 hp）。
  remilia: {
    cards: [
      {
        name: '咒诅「弗拉德·特佩斯」',
        note: 'EXTRA 中途第 1 卡；用户 2026-10-24 定 60s，要求 2–3 档火力可在 60s 内击破；'
          + '带 tier 实测 Lv4 dps 318.7（20 seeds），hp 按 0.304×60×318.7 反推',
        limit: 60, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 318.7, hp: 5813,
      },
      {
        name: '天罚「大卫之星」',
        note: 'EXTRA 中途第 2 卡；用户 2026-10-24 定 60s，难度「中偏高」；'
          + '带 tier 实测 Lv4 dps 273.5（20 seeds），hp 按 0.304×60×273.5 反推',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 273.5, hp: 4989,
      },
    ],
  },

  // ── EXTRA · 关底 Boss · 芙兰朵露（10 张；#4 #7 存活、#10 双条件）────────
  flandre: {
    cards: [
      {
        name: '禁忌「蔓越莓陷阱」',
        note: 'EXTRA #1；用户定 60s；实测 Lv4 dps 226.6',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 226.6, hp: 4133,
      },
      {
        name: '禁忌「雷瓦汀」',
        note: 'EXTRA #2；用户定 60s；实测 Lv4 dps 343.9',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 343.9, hp: 6273,
      },
      {
        name: '禁忌「四重存在」',
        note: 'EXTRA #3；用户定 60s；实测 Lv4 dps 298',
        limit: 60, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 298, hp: 5436,
      },
      {
        name: '秘弹「然后就一个人都不剩了？」',
        note: 'EXTRA #4；用户 2026-10-24 拍定为「存活卡」，坚持 30s 即过关',
        limit: 30, mode: 'survival', tier: 4, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: null,
      },
      {
        name: '禁弹「星弧破碎」',
        note: 'EXTRA #5；用户定 45s；实测 Lv4 dps 190.1',
        limit: 45, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 190.1, hp: 2601,
      },
      {
        name: '禁弹「折反射」',
        note: 'EXTRA #6；用户定 60s；实测 Lv4 dps 345',
        limit: 60, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 345, hp: 6293,
      },
      {
        name: 'QED「495年的波纹」',
        note: 'EXTRA #7；用户 2026-10-24 拍定为「存活卡」，坚持 120s 即过关',
        limit: 120, mode: 'survival', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: null,
      },
      {
        name: '禁忌「吸血鬼之宴」',
        note: 'EXTRA #8；用户定 40s；实测 Lv4 dps 215.2',
        limit: 40, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 215.2, hp: 2617,
      },
      {
        name: '禁忌「破坏之瞳」',
        note: 'EXTRA #9；用户定 30s；实测 Lv4 dps 272.5',
        limit: 30, mode: 'damage', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 272.5, hp: 2485,
      },
      {
        name: '未明「长夜不醒之约」',
        note: 'EXTRA #10 终盘；用户定 60s，并拍定为「双条件卡」：撑满 60s 或打空血条都算过关。'
          + '用户要求「它的血量肯定是最高的」→ 血量给 0.55×limit×实测 dps = 6778，仍是全 EXTRA 最高；'
          + '满火力约 33s 打空（55%），三档 ~92% 勉强能杀，二档只能走「撑满 60s」',
        limit: 60, mode: 'both', tier: 5, fx: 'redMist', accent: '#ff4d6a',
        effect: 'none', dps: 205.4, hp: 6778,
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
