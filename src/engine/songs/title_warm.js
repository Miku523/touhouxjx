/**
 * 标题曲「去 8-bit 化」版本 ——《東方新紀行 ～ Chronicle of Gensokyo》。
 *
 * 作曲、旋律、节奏、段落顺序一律不动：主旋律音符数组直接从 title_chronicle.js
 * 继承（同一个 notes 引用的拷贝），只换「发声方式」。
 *
 * 取消 8-bit 味做了三件事：
 * 1) 声部换音色 —— 主音方波 → 锯齿（谐波更密、没有方波的空心感）；
 *    高音对句方波 → 正弦（削掉刺耳的高频硬边）；分解和弦方波 → 三角。
 * 2) 鼓组抽稀 —— 闭镲 504 击降到 ~252 击、力度 ×0.62（原来是一秒 5 下机枪镲）。
 * 3) warm: true → 走 audio.js 的「温总线」（5.2kHz 低通 + 0.21s 短反射），
 *    补空间感，避免干声听上去像游戏机。
 *
 * 由 tools/preview_song.py 渲染试听时同样会复刻这条温总线。
 */

import { TITLE_CHRONICLE as BASE } from './title_chronicle.js';

/** 逐声部的新音色（顺序与 title_chronicle.js 的 tracks 一致） */
const VOICES = [
  { wave: 'sawtooth', gain: 0.2 },   // 0 主旋律
  { wave: 'triangle', gain: 0.09 },  // 1 高音对句
  { wave: 'triangle', gain: 0.13 },  // 2 贝斯
  { wave: 'sawtooth', gain: 0.056 }, // 3 分解和弦
  { wave: 'sine', gain: 0.085 },     // 4 内声部
];

/** 鼓的处理：闭镲隔一击留一击并降力度，开镲略降，其余不动 */
const DRUM_RULES = {
  2: { keepEvery: 2, velScale: 0.62 },
  3: { keepEvery: 1, velScale: 0.75 },
};

function buildWarm(base) {
  const tracks = base.tracks.map((tr, i) => {
    const v = VOICES[i];
    if (!v) return tr;
    return { wave: v.wave, gain: v.gain, notes: tr.notes };
  });

  const seen = {};
  const drums = [];
  for (const [t, kind, vel] of base.drums || []) {
    const rule = DRUM_RULES[kind];
    if (rule && rule.keepEvery > 1) {
      seen[kind] = (seen[kind] || 0) + 1;
      if (seen[kind] % rule.keepEvery !== 0) continue;
    }
    drums.push([t, kind, rule ? Math.round(vel * rule.velScale) : vel]);
  }

  return {
    title: '東方新紀行 ～ Chronicle of Gensokyo',
    duration: base.duration,
    bpm: base.bpm,
    warm: true,
    tracks,
    drums,
  };
}

export const TITLE_WARM = buildWarm(BASE);

/** 给 tools/preview_song.py 用的 { key: song } 包装 */
export const TITLE_WARM_SET = { titleWarm: TITLE_WARM };
