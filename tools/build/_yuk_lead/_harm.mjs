import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss; const bar = 4*60/S.bpm;
const t0=(7-1)*bar, t1=22*bar;
const tr={}; for (const t of S.tracks) { tr[t.name]=(tr[t.name]||[]).concat(t.notes); }
const get = name => tr[name].filter(x=>x[0]>=t0&&x[0]<t1);
const lead=get('lead'), bass=get('bass'), pad=get('pad'), str=get('strings');
// sounding notes at time t from track list (note = [t,midi,dur,vel])
function sounding(list, t){ return list.filter(n=> n[0]<=t+1e-6 && t < n[0]+n[2]).map(n=>n[1]); }
const hist={}; let clashes=[];
for (const n of lead){
  const harm = [...sounding(bass,n[0]), ...sounding(pad,n[0]), ...sounding(str,n[0])];
  if(!harm.length) continue;
  const ivs = harm.map(h=>((n[1]-h)%12+12)%12);
  const bad = ivs.filter(iv=> iv===1||iv===11||iv===6);
  for(const iv of ivs) hist[iv]=(hist[iv]||0)+1;
  if(bad.length && clashes.length<15) clashes.push({t:+n[0].toFixed(2), lead:n[1], harm:harm.slice(0,8), badIvs:bad});
}
const pc={}; for(const n of lead) pc[n[1]%12]=(pc[n[1]%12]||0)+1;
const bpc={}; for(const n of bass) bpc[n[1]%12]=(bpc[n[1]%12]||0)+1;
console.log(JSON.stringify({leadPC:pc, bassPC:bpc, ivsVsHarmony:hist, clashes}, null, 1));
