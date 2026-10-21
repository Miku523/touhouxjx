import { BOSS_SONGS } from '../../src/engine/songs/touhou.js';
const s = BOSS_SONGS.stage4;
console.log('title', s.title, 'dur', s.duration, 'bpm', s.bpm);
for (const t of s.tracks) {
  const n = t.notes;
  console.log(`track wave=${t.wave} gain=${t.gain} n=${n.length} first=${JSON.stringify(n[0])} last=${JSON.stringify(n[n.length-1])} durRange=${Math.min(...n.map(x=>x[2])).toFixed(2)}-${Math.max(...n.map(x=>x[2])).toFixed(2)}`);
}
const lead = s.tracks[0].notes;
console.log('lead first 24:', lead.slice(0,24).map(n=>`${n[0].toFixed(2)}:${n[1]}`).join(' '));
