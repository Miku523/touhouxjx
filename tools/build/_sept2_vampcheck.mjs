import { REMILIA_EX } from '../../src/engine/songs/septette_ex.js';
const s = REMILIA_EX.ex_mid;
const BEAT = 0.375;
const lo = 74 * BEAT, hi = 84 * BEAT;
for (const [i, t] of s.tracks.entries()) {
  const ns = (t.notes||[]).filter(n => n[0] >= lo && n[0] < hi);
  if (!ns.length) continue;
  console.log(i, t.wave, t.gain, ns.slice(0, 60).map(n => 'b' + (n[0]/BEAT).toFixed(1) + ':' + n[1]).join(' '));
}