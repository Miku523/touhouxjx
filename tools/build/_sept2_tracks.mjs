import { REMILIA_EX } from '../../src/engine/songs/septette_ex.js';
const s = REMILIA_EX.ex_mid;
console.log('duration', s.duration, 'tracks', s.tracks.length);
s.tracks.forEach((t, i) => {
  const ns = t.notes || [];
  const t0 = ns.length ? Math.min(...ns.map(n => n.t)) : -1;
  const t1 = ns.length ? Math.max(...ns.map(n => n.t)) : -1;
  console.log(i, t.wave, t.gain, ns.length, 't', t0.toFixed(2), '-', t1.toFixed(2));
});
