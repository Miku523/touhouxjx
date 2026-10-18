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
import { TITLE_CHRONICLE } from './title_chronicle.js';
import { EXTRA_ENDING } from './extra_ending.js';

export const SONGS = {
  ...ORIGINAL_SONGS,
  ...BOSS_SONGS,
  // 标题画面：13 作主题曲融合 medley（见 tools/build_medley.py）
  title: TITLE_CHRONICLE,
  // EXTRA 结局 W1/W2：《魔法少女達の百年祭》8-bit 柔和版（见 tools/build_extra_ending.py）
  ...EXTRA_ENDING,
};
