import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss;
const tr={}; for (const t of S.tracks) { tr[t.name]=(tr[t.name]||[]).concat(t.notes); }
const qs=[25.611,13.885,19.945,30.929,14.489];
for(const q of qs){
  const live={};
  for(const [name,notes] of Object.entries(tr)){
    const s=notes.filter(n=> n[0]<=q+0.02 && q < n[0]+Math.max(n[2],0.08)).map(n=>n[1]+'@'+n[3]);
    if(s.length) live[name]=s;
  }
  console.log(q, JSON.stringify(live));
}
