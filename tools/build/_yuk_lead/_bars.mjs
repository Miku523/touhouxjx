import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss; const bar = 4*60/S.bpm;
const t0=(7-1)*bar, t1=(9-1)*bar;
const tr={}; for (const t of S.tracks) { tr[t.name]=(tr[t.name]||[]).concat(t.notes); }
const out={};
for (const [name,notes] of Object.entries(tr)) {
  const sel=notes.filter(n=>n[0]>=t0&&n[0]<t1).map(n=>[+(n[0]-t0).toFixed(3), n[1], n[3]]);
  if(sel.length) out[name]=sel;
}
console.log(JSON.stringify(out));
