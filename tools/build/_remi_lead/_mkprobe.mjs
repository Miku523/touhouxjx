import { writeFileSync } from 'node:fs';
import { REMILIA_EX } from '../../../src/engine/songs/remilia_septette.js';
const song = REMILIA_EX.ex_mid;
const DUR = 20.0;
const tracks = [];
for (const t of song.tracks) {
  const notes = t.notes.filter(n => n[0] < DUR);
  if (notes.length) tracks.push({ ...t, notes });
}
const drums = song.drums.filter(d => d[0] < DUR);
const out = { title: 'probe', duration: DUR, bpm: song.bpm, tracks, drums };
writeFileSync('tools/build/_remi_lead/_stereo_probe.js', 'export const PROBE = { ex_mid: ' + JSON.stringify(out) + ' };\n', 'utf8');
console.log('tracks', tracks.length, 'notes', tracks.reduce((s,t)=>s+t.notes.length,0), 'drums', drums.length);
