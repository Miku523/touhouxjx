import { MUSIC_TRACKS, MUSIC_TOTAL } from '../src/game/musicTracks.js';
import { SONGS } from '../src/engine/songs/index.js';
const bad = [];
for (const t of MUSIC_TRACKS) {
  const s = SONGS[t.key];
  if (!s) { bad.push(t.no + ' ' + t.key + ' 曲库缺失'); continue; }
  const d = Math.round(s.duration * 10) / 10;
  if (Math.abs(d - t.time) > 0.35) bad.push(t.no + ' ' + t.key + ' 时长不符 ' + d + ' vs ' + t.time);
}
console.log('唱片', MUSIC_TOTAL, '曲库', Object.keys(SONGS).length);
console.log('检查', bad.length ? bad.join('\n') : '全部一致 ✓');
console.log('keys:', MUSIC_TRACKS.map(t => t.no + ':' + t.key).join(' '));
