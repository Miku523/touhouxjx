/**
 * 曲库数据体检：node tools/validate_songs.mjs
 * 退出码 0 = 全部通过；1 = 有问题。
 */
import { SONGS } from '../src/engine/songs/index.js';

const REQUIRED = ['title', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'extra', 'gameover', 'ending'];
let bad = 0;
const fail = (msg) => { bad++; console.error('  ✗ ' + msg); };

const keys = Object.keys(SONGS);
console.log(`共 ${keys.length} 首：${keys.join(', ') || '(空)'}`);
for (const k of REQUIRED) if (!SONGS[k]) fail(`缺少曲目 ${k}`);

for (const [name, song] of Object.entries(SONGS)) {
  console.log(`\n[${name}] ${song.title || ''}`);
  if (!(song.duration > 0)) { fail(`${name}.duration 无效`); continue; }
  if (!Array.isArray(song.tracks) || !song.tracks.length) fail(`${name}.tracks 为空`);
  let notes = 0;
  for (const tr of song.tracks || []) {
    if (!['square', 'triangle', 'sawtooth', 'sine'].includes(tr.wave)) fail(`${name} wave 非法: ${tr.wave}`);
    if (!(tr.gain > 0 && tr.gain <= 0.3)) fail(`${name} gain 越界: ${tr.gain}`);
    let prev = -1;
    for (const n of tr.notes || []) {
      notes++;
      const [t, m, d, v] = n;
      if (!(t >= 0 && t < song.duration + 4)) fail(`${name} 音符时间越界 ${t}`);
      if (!(m >= 12 && m <= 120)) fail(`${name} midi 越界 ${m}`);
      if (!(d > 0 && d <= 8)) fail(`${name} 时值越界 ${d}`);
      if (!(v > 0 && v <= 127)) fail(`${name} 力度越界 ${v}`);
      if (t < prev - 1e-6) fail(`${name} 音符未按时间排序`);
      prev = t;
    }
  }
  let prev = -1;
  for (const d of song.drums || []) {
    if (!(d[0] >= 0 && d[0] < song.duration + 4)) fail(`${name} 鼓时间越界 ${d[0]}`);
    // kind 0..4：曲库标准鼓（src/engine/audio.js 的 _scheduleDrum 实时合成）；
    // kind 5..9：离线渲染扩展鼓（通鼓/ride/反向吊镲等），只在 src/assets/bgm/*.wav
    // 成品里发声，实时合成回退会静默跳过——见 tools/build/_exsr_render.py:571 的对照表。
    if (d[1] < 0 || d[1] > 9) fail(`${name} 鼓 kind 非法 ${d[1]}`);
    if (d[0] < prev - 1e-6) fail(`${name} 鼓未按时间排序`);
    prev = d[0];
  }
  console.log(`  duration=${song.duration.toFixed(2)}s tracks=${(song.tracks || []).length} notes=${notes} drums=${(song.drums || []).length}`);
}

if (bad) { console.error(`\n${bad} 处问题`); process.exit(1); }
console.log('\n全部通过 ✓');
