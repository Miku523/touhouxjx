/**
 * 曲库总表。
 *
 * 数据格式（每条曲子 = 一个可无缝循环的片段，时间单位：秒）：
 *
 * {
 *   title: '妖魔夜行',            // 显示名（可选）
 *   duration: 57.4,              // 循环长度（秒），必须 > 0
 *   bpm: 147,                    // 参考 BPM（可选，仅供维护）
 *   tracks: [                    // 0~4 条旋律/伴奏声部
 *     {
 *       wave: 'square',          // 'square' | 'triangle' | 'sawtooth' | 'sine'
 *       gain: 0.14,              // 该声部峰值增益（0~0.3，建议 0.03~0.16）
 *       notes: [                 // 按时间升序
 *         [time, midi, dur, vel], // time/dur 秒，midi 0~127，vel 0~127
 *       ],
 *     },
 *   ],
 *   drums: [                     // 可选，按时间升序
 *     [time, kind, vel],         // kind: 0=底鼓 1=军鼓 2=闭镲 3=开镲 4=吊镲
 *   ],
 * }
 *
 * 约定：同一时刻最多 4 个旋律声部发声；音符时间 0 <= t < duration。
 */

import { BOSS_SONGS } from './touhou.js';
import { ORIGINAL_SONGS } from './original.js';
import { EXTRA_ENDING } from './extra_ending.js';
import { TITLE_FULL } from './title_full.js';
import { PRE1_WARM } from './warm_variants.js';
import { PRE2_EURO } from './eurobeat_pre2.js';
import { MERGE_STAGE1 } from './merge_stage1.js';
import { MERGE_STAGE2 } from './merge_stage2.js';
import { YUUHEI_PRE3 } from './yuuhei_pre3.js';
import { ATEAM_STAGE3 } from './ateam_stage3.js';

export const SONGS = {
  ...ORIGINAL_SONGS,
  ...BOSS_SONGS,
  ...EXTRA_ENDING,
  // 标题画面：13 作主题曲融合 medley 的完整曲式版（去 8bit 音色，见 tools/title_arrange.py）
  title: TITLE_FULL.title,
  // 1 面道中：ほおずきみたいに紅い魂（骨架重置 + 柔和配器，见 tools/preboss_rewrite.py → tools/warmify.py）
  pre1: PRE1_WARM.pre1,
  // 2 面道中：幻視の夜 ～ Ghostly Eyes（EUROBEAT 157 BPM，见 tools/midi_to_eurobeat.py）
  pre2: PRE2_EURO.pre2,
  // 1 面 Boss：妖魔夜行 —— PHOENIX 版 × 游戏原本 ZUN 版 融合（见 tools/merge_stage1.py）
  stage1: MERGE_STAGE1.stage1orig,
  // 2 面 Boss：蠢々秋月 —— 融合版 × 游戏内原曲混合，贝斯贴原曲音高（见 tools/merge_stage2.py）
  stage2: MERGE_STAGE2.stage2,
  // 3 面道中：ルーネイトエルフ —— 幽閉サテライト 风重编（见 tools/yuuhei_pre3.py）
  pre3: YUUHEI_PRE3.pre3,
  // 3 面 Boss：おてんば恋娘 —— Ateam 重低频编 + 花映塚 + 完美教室（见 tools/ateam_stage3.py）
  stage3: ATEAM_STAGE3.stage3,
};
