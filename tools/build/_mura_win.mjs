import { YUGA_STAGE5 as W } from '../../src/engine/songs/yuuga_stage5.js';
const S = W.stage5;
const bar = 60 / 144 * 4;
const names = ['lead','oct','desc','piano','epiano','p16','trumpet','strings','bass','sub','pad'];
for (let b = 68; b < 90; b += 2) {
  const t0 = b * bar, t1 = t0 + 2 * bar;
  const row = S.tracks.map((tr, i) => names[i] + ':' + tr.notes.filter(n => n[0] >= t0 && n[0] < t1).length);
  console.log(b, row.join(' '), 'drums:' + S.drums.filter(d => d[0] >= t0 && d[0] < t1).length);
}
