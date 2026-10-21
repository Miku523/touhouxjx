import { BOSS_SONGS } from '../../src/engine/songs/touhou.js';
const s = BOSS_SONGS.stage5;
const bar = 4*60/s.bpm;
const NM = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const pn = m => NM[m%12] + (Math.floor(m/12)-1);
for (const ti of [0, 2, 1]) {
  const tr = s.tracks[ti];
  console.log('== track'+ti, tr.wave, tr.gain);
  const byBar = {};
  for (const [t,m,d,v] of tr.notes) { if (t >= 20) continue; const b = Math.floor(t/bar); (byBar[b] ||= []).push([t,m,d,v]); }
  for (const b of Object.keys(byBar).map(Number).sort((a,c)=>a-c)) {
    console.log(' bar'+b, byBar[b].map(([t,m,d,v])=>pn(m)+'/'+d).join(' '));
  }
}
const hr = {};
for (const [t,m] of s.tracks[0].notes) hr[m%12]=(hr[m%12]||0)+1;
console.log('track0 音级', JSON.stringify(hr));
