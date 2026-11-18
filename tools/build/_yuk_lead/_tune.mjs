import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss; const bar = 4*60/S.bpm;
const t0=(7-1)*bar, t1=22*bar;
const tr={}; for (const t of S.tracks) { tr[t.name]=(tr[t.name]||[]).concat(t.notes); }
const sel = n => n.filter(x=>x[0]>=t0&&x[0]<t1);
const lead = sel(tr.lead), ctr = sel(tr.counter||[]), bell = sel(tr.bell||[]), brass=sel(tr.brass||[]);
function intervals(base, other, label){
  const hist = {}; let count=0;
  for (const o of other){
    let best=null, bd=1e9;
    for (const b of base){ const d=Math.abs(b[0]-o[0]); if(d<bd){bd=d;best=b;} }
    if(best && bd<0.06){ const iv=((o[1]-best[1])%12+12)%12; hist[iv]=(hist[iv]||0)+1; count++; }
  }
  return {label, count, hist};
}
const res = [intervals(lead, ctr, 'counter-vs-lead'), intervals(lead, bell, 'bell-vs-lead'), intervals(lead, brass, 'brass-vs-lead')];
// pitch-class histogram for lead in A
const pc = {}; for(const n of lead) pc[n[1]%12]=(pc[n[1]%12]||0)+1;
console.log(JSON.stringify({res, leadPitchClasses: pc, leadCount: lead.length}, null, 1));
