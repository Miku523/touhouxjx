import { REMILIA_EX } from '../../src/engine/songs/septette_ex.js';
const s = REMILIA_EX.ex_mid;
const BAR = 1.125;
const win = (name) => { const a = JSON.parse(name)[0]*BAR, b = JSON.parse(name)[1]*BAR;
  const rows = s.tracks.map((t, i) => {
    const ns = (t.notes||[]).filter(n => n[0] >= a - 1e-6 && n[0] < b);
    return [i, ns.length, ns.reduce((z,n)=>z+n[3],0)];
  });
  return rows;
};
for (const w of ['[12,18]','[24,30]','[30,33]','[33,39]']) {
  const rows = win(w);
  console.log(w, rows.map(r => r[0]+':'+r[1]+'/'+r[2]).join(' '));
}
