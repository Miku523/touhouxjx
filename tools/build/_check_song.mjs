import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [file, exp, key] = process.argv.slice(2);
const mod = await import(pathToFileURL(path.resolve(file)).href);
const s = mod[exp][key];
const all = s.tracks.flatMap(t => t.notes);
const bad = all.filter(n => n[1] < 12 || n[1] > 120 || n[2] <= 0 || n[2] > 8 || n[0] >= s.duration);
const sorted = s.tracks.every(t => t.notes.every((n, i, a) => i === 0 || n[0] >= a[i - 1][0]));
const sortedD = s.drums.every((d, i, a) => i === 0 || d[0] >= a[i - 1][0]);
const kinds = [0, 0, 0, 0, 0];
for (const d of s.drums) kinds[d[1]]++;
const last = all.reduce((m, n) => Math.max(m, n[0] + n[2]), 0);
console.log(JSON.stringify({
  key, title: s.title, dur: s.duration, bpm: s.bpm, notes: all.length,
  bad: bad.length, sorted, sortedD, kinds, lastNote: +last.toFixed(3),
  tracks: s.tracks.map(t => ({ wave: t.wave, gain: t.gain, n: t.notes.length })),
}));
