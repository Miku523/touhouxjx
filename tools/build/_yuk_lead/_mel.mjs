import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss; const bar = 4*60/S.bpm;
const t0 = 22*bar, t1 = 24*bar; // bars 23-24
const tracks = {}; for (const t of S.tracks) tracks[t.name]=t.notes;
const out = {};
for (const [id,notes] of Object.entries(tracks)) {
  const sel = notes.filter(n=>n[0]>=t0&&n[0]<t1).map(n=>[+(n[0]-t0).toFixed(3), n[1], n[2], n[3]]);
  if (sel.length) out[id]=sel;
}
console.log(JSON.stringify(out));
