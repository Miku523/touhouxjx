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
 * - hpAdjust 可选：该卡专属血量微调倍率（默认 1），乘在 limit × dps × CARD_HP_ANCHOR（或显式 hp）之后、
 *           finalHpMulFor(key) 之前；只用于 1% 以内的单卡微调，不动限时 / dps 标定。
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
 *    「西行寺幽幽子加3.8%」→ 1.0899（= 1.05 × 1.038，按伤害卡合计 +3.8% 标定）；
 *    第三轮又「妖梦降 0.5%」「幽幽子降 1%」→ 1.0761 / 1.079。
 *  - 同日第四轮（1–4 面）：射命丸文 +2.8%、琪露诺 +2.6%、莉格露 +1.3%、露米娅 +1.8%，
 *    对应倍率 = 1.05 × 各自增量（见下表四个新键）。
 *  - 同日第五轮（EXTRA）：十六夜咲夜 +3.8% → 1.0899（= 1.05 × 1.038，新增键，此前走全局 1.05）；
 *    雷米莉亚 +4% → 1.1232（= 1.08 × 1.04）；芙兰朵露 +5% → 1.155（= 1.10 × 1.05）。
 *  - 同日第七轮（EXTRA 再各 +4%）：用户口述「EX 面各个再加 4%」→ 三个 EX Boss 在第五轮
 *    覆盖值上再乘 1.04：sakuya 1.1335、remilia 1.1681、flandre 1.2012。
 * 口径：这是「单场 Boss 总血量」的倍率，逐卡四舍五入后相加；存活卡（survival）的血条只是
 * 拖时间的底、不影响判定，也一起加厚。以后想再整体调松紧只改这里，不用逐张改 hp。
 * 注意：覆盖值都是「自己那条线再乘本轮增量」，不是把增量再乘到全局 1.05 上。
 */
export const BOSS_FINAL_HP_MUL = 1.05;
/** 单独覆盖的 Boss（值 = 该 Boss 自己的总血量倍率，覆盖 BOSS_FINAL_HP_MUL，不是再乘）。 */
export const BOSS_FINAL_HP_MUL_OVERRIDE = {
  sakuya: 1.1335,  // 2026-10-27 第七轮「EX 面各个再加 4%」= 1.0899 × 1.04（第五轮 3.8% 之上）
  remilia: 1.1681, // 2026-10-27 第七轮「EX 面各个再加 4%」= 1.1232 × 1.04（第五轮 4% 之上）
  flandre: 1.2012, // 2026-10-27 第七轮「EX 面各个再加 4%」= 1.155 × 1.04（第五轮 5% 之上）
  youmu: 1.0761,   // 2026-10-26「再加 3%」后「降 0.5%」= 1.05 × 1.03 × 0.995
  yuyuko: 1.079,   // 2026-10-26「加 3.8%」后「降 1%」= 1.05 × 1.038 × 0.99
  aya: 1.0794,     // 2026-10-26 第四轮「射命丸文血量提高 2.8%」= 1.05 × 1.028
  cirno: 1.0773,   // 2026-10-26 第四轮「琪露诺提高 2.6%」= 1.05 × 1.026
  wriggle: 1.06365, // 2026-10-26 第四轮「莉格露提高 1.3%」= 1.05 × 1.013
  rumia: 1.0689,   // 2026-10-26 第四轮「露米娅提高 1.8%」= 1.05 × 1.018
};
/** 取某个 Boss 的终局血量倍率；未登记的 Boss 用全局值。 */
export function finalHpMulFor(key) {
  const override = Number(BOSS_FINAL_HP_MUL_OVERRIDE[key]);
  return Number.isFinite(override) && override > 0 ? override : BOSS_FINAL_HP_MUL;
}

/**
 * 道中血量基准（2026-10-27 第六轮建立，第八、九、十轮各再收一刀）：
 *  - 第六轮用户口述：「小头目血量减少 1/2，各个小怪血量增到现在小头目的 1/3」
 *    → 小头目 = 平均承伤符卡血量 × 0.25，小怪 = 平均 × 1/6（基准兵种 fairy）；
 *  - 第八轮用户口述：「小怪血量削去 1/2，小头目削去 1/3」
 *    → 小头目 ×0.25 再 ×2/3 = 平均 × 1/6；小怪 ×1/6 再 ×1/2 = 平均 × 1/12；
 *  - 第九轮用户口述：「小怪再砍 1/2，小头目砍 1/5」
 *    → 小头目 ×1/6 再 ×4/5 = 平均 × 2/15；小怪 ×1/12 再 ×1/2 = 平均 × 1/24；
 *  - 第十轮用户口述：「小怪再削 1/2」
 *    → 小怪 ×1/24 再 ×1/2 = 平均 × 1/48，小头目保持 平均 × 2/15。
 *    此时小怪约为小头目的 5/32（≈16%）。
 *  - 第十一轮用户口述：「这是最高血量的小怪，但是现在我不想小怪都是这个血量，这样太难打了」
 *    → 小怪改成分层：普通兵 = 基准 × 1/2（很脆，绝大多数），精英兵 = 基准 × 2（少数），
 *    每只按 MOB_ELITE_CHANCE 抽精英（独立随机流，不影响种类/进场分布）。
 *  - 第十二轮用户口述：「全部小怪小头目血量再下降 1/4 且小怪血量随机性延续」
 *    → 小头目 ×2/15 再 ×3/4 = 平均 × 1/10；小怪 ×1/48 再 ×3/4 = 平均 × 1/64，分层与随机性保持不变。
 * 其余兵种仍按 PLATFORM_KINDS.hp 的 6:9:12:15 权重等比放大（见 enemies.js 的 EnemyManager）。
 * 只有平台面道中走这套；STG 杂兵（stg.js）与 Boss 血量完全不受影响。
 * 想整体调松紧只改这几个常量。
 */
export const MINIBOSS_CARD_SHARE = 1 / 10;
export const MOB_CARD_SHARE = 1 / 64;
/**
 * 道中小怪血量分层（2026-10-28 第十一轮）：
 *  - 普通兵 = 基准 × MOB_TRASH_SCALE（1/2）→ 很脆，占绝大多数
 *  - 精英兵 = 基准 × MOB_ELITE_SCALE（2）→ 少数硬骨头
 * 「基准」= 平均承伤符卡血量 × MOB_CARD_SHARE × 兵种权重（6:9:12:15）。
 * 抽取走独立随机流（enemies.js 的 hpRng），不影响敌人种类与进场方案的分布。
 */
export const MOB_TRASH_SCALE = 1 / 2;
export const MOB_ELITE_SCALE = 2;
export const MOB_ELITE_CHANCE = 0.15;
/**
 * 精英兵的外观放大倍数（2026-10-28 第十一轮，用户：「可以稍微大一点」）。
 * 只放大 `drawGenFairy` 的绘制尺寸，碰撞框（w/h）与击破判定不变。
 */
export const MOB_ELITE_SIZE_SCALE = 1.2;

/**
 * 该 Boss 所有「承伤符卡」（跳过 survival）运行期血量的平均值。
 * 逐卡口径与 Boss 构造器完全一致：显式 hp 优先，否则 limit × dps × CARD_HP_ANCHOR，
 * 再乘该卡 hpAdjust（默认 1），最后 × finalHpMulFor(key)，每步都四舍五入。
 * 没有符卡数据时返回 0。
 * 小头目血量（bossHalfCardHp）与小怪血量都以它为基准，保证道中永远跟 Boss 一起缩放。
 */
export function cardAvgRuntimeHp(key) {
  const tune = cardTuningFor(key);
  const cards = tune && Array.isArray(tune.cards) ? tune.cards : null;
  if (!cards || !cards.length) return 0;
  const mul = finalHpMulFor(key);
  const hps = [];
  for (const t of cards) {
    if (!t) continue;
    if (t.mode === 'survival') continue;
    const hpOverride = Number(t.hp);
    const dps = Number(t.dps);
    const limit = Number(t.limit);
    let hp = 0;
    if (Number.isFinite(hpOverride) && hpOverride > 0) {
      hp = Math.max(1, Math.round(hpOverride));
    } else if (Number.isFinite(dps) && dps > 0 && Number.isFinite(limit) && limit > 0) {
      hp = Math.max(1, Math.round(limit * dps * CARD_HP_ANCHOR));
    }
    if (hp <= 0) continue;
    const adjust = Number(t.hpAdjust) > 0 ? Number(t.hpAdjust) : 1;
    if (adjust !== 1) hp = Math.max(1, Math.round(hp * adjust));
    hps.push(Math.max(1, Math.round(hp * mul)));
  }
  if (!hps.length) return 0;
  return hps.reduce((a, b) => a + b, 0) / hps.length;
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
        hpAdjust: 0.992, // 2026-10-28 第十二轮：第一面第一张卡血量 −0.8%
      },
      {
        name: '暗符「黑暗吞噬」', note: '黑暗吞噬氛围；被漩涡吸住',
        limit: 60, mode: 'damage', tier: 3, fx: 'night', accent: '#8f6bd8',
        effect: 'devourPull', dps: 240.9,
        hpAdjust: 0.982, // 2026-10-28 第十二轮：第一面第二张卡血量 −1.8%
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

  // 5 面 · 西行寺幽幽子（6 张）#5 为 survival 卡（2026-10-26 二次对调：常夜樱变生存、反魂蝶回攻击）
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
        note: '2026-10-26 用户把原生存符改为可被攻击的击破卡（60s 不变）；罪业压身、身体半透明。显式 hp 按「常夜樱转生存、反魂蝶回伤害池后伤害合计 51,964（-1%）」反推',
        limit: 60, mode: 'damage', tier: 4, fx: 'night', accent: '#ffa8d8',
        effect: 'sinGravity', dps: 359, hp: 14108,
      },
      {
        name: '冥符「常夜樱」',
        note: '2026-10-26 用户改为生存卡（原 90s 击破卡，限时不变）；夜樱花瓣氛围，撑满 90 秒即过关',
        limit: 90, mode: 'survival', tier: 4, fx: 'petals', accent: '#ff8fd0',
        effect: 'none', dps: null,
      },
      {
        name: '反魂蝶「八分咲」',
        note: '2026-10-26 用户改回攻击卡（100s 击破 → 66s 生存 → 66s 击破）；不写死 hp，按 0.655 锚点（66 × 215.4 × 0.655 ≈ 9,317 → 终局 10,053，与其他卡同为 −1%）',
        limit: 66, mode: 'damage', tier: 5, fx: 'petals', accent: '#ffa8d8',
        effect: 'bloomGrace', dps: 215.4,
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
        note: 'EXTRA #7；2026-10-24 深夜：用户要求满火力（power 128 / Lv5）约 40–45s 打空，本卡取 42.0s → hp = 7686（10-seed 实测时的血量）× 42.0 / 中位耗时 53.37s。2026-10-26 深夜：用户反馈「这张根本过不去」，只降弹幕密度 —— 档 5→4（弹数 ×1.30→×1.15、弹速 ×1.12→×1.06），另外 boss.js 里把环弹 n 36→26、内环 18→14 且环数 3→2、脉冲间隔 0.07→0.085s，同屏环弹 126→80 发（−37%）；限时 90s 与血量不动。',
        limit: 90, mode: 'damage', tier: 4, fx: 'redMist', accent: '#ff4d6a',
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

  // ── EXTRA · 连环 Boss Rush · 十六夜咲夜（4 张；由 boss.js 的 cardFrom 切片成两场）──
  // 2026-10-27 用户口述：EX 面改成连环 Rush —— 咲夜(第 1/2 卡) → 蕾米莉亚(2 张) →
  // 咲夜(第 3/4 卡) → 芙兰。四张卡只建一次（key = sakuya），stage.js 用
  // new Boss('sakuya', x, y, { cardFrom, cardCount }) 切两场；切片发生在逐卡调参之后，
  // 所以这里的下标永远对「完整四卡」成立，不需要把表拆成两段。
  // 限时：四张都 45s（用户口述「90s 总限时压两卡合计」，单卡 45s 只是节奏参考；
  //   damage 卡超时不结束战斗，只失去限时奖励）。
  // 血量口径：EX 同款显式 hp = round(0.77 × limit × dps)，逐卡再乘终局倍率
  //   （2026-10-27 第五轮 1.0899 = 1.05 × 1.038，第七轮再 ×1.04 = 1.1335）：
  //   终局 9622 / 9820 / 10016 / 10212，合计 39670 = BOSS_DEFS.sakuya 的 maxHp。
  // fx / accent：七色飞刀配色四卡各取一色（绯红 → 青 → 紫罗兰 → 琥珀）；
  //   effect 一律 'none'（同 remilia：卡面特效不再额外改玩家手感）。
  sakuya: {
    cards: [
      {
        name: '银符「Perfect Maid」',
        note: 'EX 连环 Rush 第 1 卡（咲夜前半场）；五连扇形银刃 + 七色钟面环。极限 45s，dps 245 → hp = round(0.77 × 45 × 245) = 8489',
        limit: 45, mode: 'damage', tier: 4, fx: 'fairyDust', accent: '#ff6b8a',
        effect: 'none', dps: 245, hp: 8489,
      },
      {
        name: '时符「Private Square」',
        note: 'EX 连环 Rush 第 2 卡（咲夜前半场）；时停是真的时停：bullets.freezeAll(1.2) 让场上所有弹幕原地凝滞（b.holdT），同时凝出一圈紫罗兰静止刃，领域结束同一拍补发。dps 250 → hp = round(0.77 × 45 × 250) = 8663',
        limit: 45, mode: 'damage', tier: 4, fx: 'freeze', accent: '#7fd8ff',
        effect: 'none', dps: 250, hp: 8663,
      },
      {
        name: '奇术「Time Paradox」',
        note: 'EX 连环 Rush 第 3 卡（咲夜后半场）；四个残影站位（上/右/下/左）轮流换色齐射 + 反向七色环。dps 255 → hp = round(0.77 × 45 × 255) = 8836',
        limit: 45, mode: 'damage', tier: 5, fx: 'voidFlame', accent: '#b48cff',
        effect: 'none', dps: 255, hp: 8836,
      },
      {
        name: '终符「Chronos Rule」',
        note: 'EX 连环 Rush 第 4 卡（咲夜后半场，压轴给芙兰）；12 组钟面刻度 × 七色同心刀环，整环顺时针转、玩家逆时针穿行。dps 260 → hp = round(0.77 × 45 × 260) = 9009',
        limit: 45, mode: 'damage', tier: 5, fx: 'night', accent: '#ffb347',
        effect: 'none', dps: 260, hp: 9009,
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
