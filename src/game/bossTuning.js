/**
 * 逐卡调参数据（stage1–6，共 28 张符卡）。
 *
 * 注：spec / 任务写“30 张”，但 spec §1 表格实际 28 行，且 2+3+4+5+6+8 = 28，
 * 与 src/game/boss.js 的 BOSS_DEFS 卡数一致；本文件以表格 + BOSS_DEFS 为准（28 张）。
 *
 * 契约见 docs/BOSS_TIMING_SPEC.md 3.1；逐卡表见 docs/BOSS_TIMING_TABLE.md；
 * effect / fx / accent / densityMul / speedMul 按 docs/BOSS_CREATIVE_DESIGN.md §一 / §五 回填。
 *
 * 字段：
 * - limit   该卡限时（秒，Normal 目标时长）       —— damage 卡超出即失败奖励；survival 卡到点自动切卡
 * - mode    'damage' 打空血条进下一张 | 'survival' Boss 免疫伤害、坚持到 limit 自动进下一张
 * - fx      卡面屏幕叠加特效键，合法键见 src/game/cardfx.js 的 FX_KEYS
 *           （none / darkSpot / darkVeil / fireflies / hail / freeze / wind / petals /
 *            night / moon / butterfly / voidFlame / fairyDust / redMist）
 * - accent  该卡主题色，取设计表 §一 主色（与 BOSS_DEFS 卡内主色一致）
 * - effect  卡面玩家效果键，合法键见 src/game/cardEffects.js 的 EFFECT_KEYS
 *           （none / darkSpot / devourPull / frostSlide / diamondFocus / tailwind /
 *            stormEye / sinGravity / jewelGaze / dreamBough / bloomGrace）
 * - dps     Normal 满火力基准 hp/s = 2026-10-20 验收实测有效 DPS ×0.76（含正常玩家余量）。
 *           2026-10-21 按用户要求下调：原「×0.95 贴线」→ 全表 ×0.8，使满火力约 0.76×limit
 *           击破、掉一级火力（Lv3）约 1.3×limit，给正常玩家留出 ~25% 时间余量。
 *           限时卡运行期血量 = Math.max(1, Math.round(limit * dps))，不乘难度系数；
 *           survival 卡不承伤、不参与血量反推 → null。EXTRA 面（remilia / flandre）不在本表内，未调整。
 * - densityMul / speedMul  仅 5 张 survival 卡提供（默认 1），来源创意设计 §五：
 *           aya[1] 1.28/1.12、aya[4] 1.35/1.10、yuyuko[3] 1.15/1.05、
 *           kaguya[0] 1.12/1.08、kaguya[7] 1.10/1.0。
 * - name    与 src/game/boss.js 里 BOSS_DEFS[key].phases[i].name 完全一致，仅供数据校验 / 调试；
 *           运行期卡名仍以 BOSS_DEFS 为准。
 * - note    人类可读备注（非运行期字段）。
 *
 * 暂不写入的可选字段：hp（直接给基础血量，优先于 limit×dps 反推）、patterns（覆盖该卡 pattern 数组）。
 */
export const BOSS_CARD_TUNING = {
  // 1 面 · 露米娅（2 张）
  rumia: {
    hpMul: 12.74,
    cards: [
      {
        name: '宵暗「月之暗面」', note: '黑暗氛围',
        limit: 50, mode: 'damage', fx: 'moon', accent: '#b48cff',
        effect: 'none', dps: 176,
      },
      {
        name: '暗符「黑暗吞噬」', note: '黑暗吞噬氛围；被漩涡吸住',
        limit: 60, mode: 'damage', fx: 'night', accent: '#8f6bd8',
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
        limit: 60, mode: 'damage', fx: 'fireflies', accent: '#a8ff8f',
        effect: 'none', dps: 164,
      },
      {
        name: '蠢符「小虫风暴」', note: '用户区间 90–120s，取中值 105',
        limit: 105, mode: 'damage', fx: 'fireflies', accent: '#a8ff8f',
        effect: 'none', dps: 170,
      },
      {
        name: '隐虫「萤火虫之夜」',
        note: '用户区间 60–120s，取中值 90；黑暗聚光：玩家周围亮、其余全黑，fx 必须为 darkSpot',
        limit: 90, mode: 'damage', fx: 'darkSpot', accent: '#a8ff8f',
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
        limit: 30, mode: 'damage', fx: 'hail', accent: '#bfeaff',
        effect: 'none', dps: 166,
      },
      {
        name: '雹符「冰雹风暴」', note: '冰雹氛围',
        limit: 120, mode: 'damage', fx: 'hail', accent: '#bfeaff',
        effect: 'none', dps: 156,
      },
      {
        name: '冻符「完美冻结」', note: '用户区间 60–120s，取中值 90；脚下打滑',
        limit: 90, mode: 'damage', fx: 'freeze', accent: '#a8e8ff',
        effect: 'frostSlide', dps: 162,
      },
      {
        name: '雪符「钻石风暴」', note: '冰晶风暴氛围；晶光晃眼',
        limit: 99, mode: 'damage', fx: 'freeze', accent: '#bfeaff',
        effect: 'diamondFocus', dps: 150,
      },
    ],
  },

  // 4 面 · 射命丸文（5 张）#2 / #5 为 survival 卡（打不到 Boss）
  aya: {
    hpMul: 7.12,
    cards: [
      {
        name: '风符「风神一扇」', note: '风压氛围',
        limit: 66, mode: 'damage', fx: 'wind', accent: '#ff9a9a',
        effect: 'none', dps: 125,
      },
      {
        name: '疾风「风神少女」', note: '打不到 Boss；弹幕密度与弹速显著加大（顺风推背）',
        limit: 30, mode: 'survival', fx: 'wind', accent: '#ff6b6b',
        effect: 'tailwind', dps: null, densityMul: 1.28, speedMul: 1.12,
      },
      {
        name: '岐符「天之八衢」', note: '风压氛围',
        limit: 90, mode: 'damage', fx: 'wind', accent: '#ff9a9a',
        effect: 'none', dps: 137,
      },
      {
        name: '风神「天狗颪」', note: '风压氛围',
        limit: 90, mode: 'damage', fx: 'wind', accent: '#ff6b6b',
        effect: 'none', dps: 122,
      },
      {
        name: '「幻想风靡」', note: '打不到 Boss；只能用符卡清弹幕；坚持 3 分钟（站在风暴眼）',
        limit: 180, mode: 'survival', fx: 'wind', accent: '#ff6b6b',
        effect: 'stormEye', dps: null, densityMul: 1.35, speedMul: 1.10,
      },
    ],
  },

  // 5 面 · 西行寺幽幽子（6 张）#4 为 survival 卡
  yuyuko: {
    hpMul: 5.79,
    cards: [
      {
        name: '幽雅「死出诱蛾灯」', note: '幽冥夜氛围',
        limit: 50, mode: 'damage', fx: 'night', accent: '#ffa8d8',
        effect: 'none', dps: 153,
      },
      {
        name: '蝶符「花之舞」', note: '花瓣氛围',
        limit: 60, mode: 'damage', fx: 'petals', accent: '#ffa8d8',
        effect: 'none', dps: 154,
      },
      {
        name: '蝶符「死蝶之华尔兹」', note: '用户区间 120–180s，取中值 150',
        limit: 150, mode: 'damage', fx: 'petals', accent: '#ffa8d8',
        effect: 'none', dps: 154,
      },
      {
        name: '亡乡「亡我乡 -宿罪-」', note: '坚持 44 秒；罪业压身、身体半透明',
        limit: 44, mode: 'survival', fx: 'night', accent: '#ffa8d8',
        effect: 'sinGravity', dps: null, densityMul: 1.15, speedMul: 1.05,
      },
      {
        name: '冥符「常夜樱」', note: '夜樱花瓣氛围',
        limit: 120, mode: 'damage', fx: 'petals', accent: '#ff8fd0',
        effect: 'none', dps: 154,
      },
      {
        name: '反魂蝶「八分咲」', note: '花瓣满开氛围；花开八分、节奏被带快',
        limit: 180, mode: 'damage', fx: 'petals', accent: '#ffa8d8',
        effect: 'bloomGrace', dps: 148,
      },
    ],
  },

  // 6 面 · 蓬莱山辉夜（8 张）#1 / #8 为 survival 卡
  kaguya: {
    hpMul: 3.62,
    cards: [
      {
        name: '难题「龙颈之玉 -五色的弹丸-」', note: '坚持 60 秒（宝光定身）',
        limit: 60, mode: 'survival', fx: 'moon', accent: '#ffe9b0',
        effect: 'jewelGaze', dps: null, densityMul: 1.12, speedMul: 1.08,
      },
      {
        name: '神宝「耀眼的龙玉」', note: '宝玉夜光氛围',
        limit: 99, mode: 'damage', fx: 'night', accent: '#fff8d0',
        effect: 'none', dps: 154,
      },
      {
        name: '难题「佛御石之钵 -不碎的意志-」', note: '石钵氛围',
        limit: 120, mode: 'damage', fx: 'darkVeil', accent: '#fff8d0',
        effect: 'none', dps: 152,
      },
      {
        name: '神宝「佛体的金刚石」', note: '金刚石氛围',
        limit: 180, mode: 'damage', fx: 'freeze', accent: '#fff8d0',
        effect: 'none', dps: 147,
      },
      {
        name: '难题「火鼠的皮衣 -不焦躁的内心-」', note: '火鼠皮衣氛围',
        limit: 360, mode: 'damage', fx: 'voidFlame', accent: '#ffe9b0',
        effect: 'none', dps: 150,
      },
      {
        name: '神宝「火蜥蜴之盾」', note: '⚠ 用户未指定时长，暂定 240s，待确认',
        limit: 240, mode: 'damage', fx: 'voidFlame', accent: '#ffe9b0',
        effect: 'none', dps: 148,
      },
      {
        name: '难题「燕的子安贝 -永命线-」',
        note: '⚠ spec 表写「难题「燕之子安贝 -不死之药-」」，与 BOSS_DEFS 现名不一致；本数据以 BOSS_DEFS 为准，待 Lead 定夺',
        limit: 300, mode: 'damage', fx: 'wind', accent: '#ffe9b0',
        effect: 'none', dps: 142,
      },
      {
        name: '神宝「蓬莱的玉枝 -梦色之乡-」', note: '坚持 66 秒；金枝托底、动作轻快',
        limit: 66, mode: 'survival', fx: 'fairyDust', accent: '#ffe9b0',
        effect: 'dreamBough', dps: null, densityMul: 1.10, speedMul: 1.0,
      },
    ],
  },

  // ── 5 面 · 中途 Boss · 魂魄妖梦（半灵二天一流）────────────────────────
  // 中途 Boss：血量按限时 × dps 走，单卡比关底短，三卡合计目标 ≈95–110s。
  // system/phantom（半灵实体 + 断灵槽）写在 boss.js 的 BOSS_DEFS.youmu 里，
  // 本表只管「限时 / HUD / 卡特效」；不写 hpMul（中途 Boss 靠 dps × limit 定量）。
  youmu: {
    cards: [
      {
        name: '人符「现世斩」', note: '中途 Boss；突进宽斩压迫，半灵反向斜斩',
        limit: 34, mode: 'damage', fx: 'fairyDust', accent: '#9fe8d0',
        effect: 'none', dps: 150,
      },
      {
        name: '人鬼「未来永劫斩」', note: '中途 Boss；本体一刀 + 半灵三连追踪斩',
        limit: 38, mode: 'damage', fx: 'petals', accent: '#7fe0c8',
        effect: 'none', dps: 146,
      },
      {
        name: '断灵「剑楼阁」', note: '中途 Boss 终盘；半灵剑环 + 头顶剑柱',
        limit: 46, mode: 'damage', fx: 'night', accent: '#c8ffe8',
        effect: 'none', dps: 155,
      },
    ],
  },
};

/**
 * 取某个 Boss 的逐卡调参；EXTRA 的 remilia / flandre 返回 null。
 * @param {string} key BOSS_DEFS 的键（'rumia' | 'wriggle' | 'cirno' | 'aya' | 'yuyuko' | 'youmu' | 'kaguya'）
 * @param {number|null} [index] 卡序号（0-based）。省略 = 返回整个 Boss 的 tuning；越界 = null
 * @returns {{hpMul:number, cards:Array<object>}|object|null}
 */
export function cardTuningFor(key, index = null) {
  const tuning = BOSS_CARD_TUNING[key];
  if (!tuning) return null;
  if (index == null) return tuning;
  return tuning.cards[index] || null;
}
