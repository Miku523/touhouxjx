import {TILLWHEN_PRE5} from '../../src/engine/songs/tillwhen_pre5.js';
const s=TILLWHEN_PRE5.pre5; const bar=1.5484;
const lead=s.tracks.find(t=>t.name==='lead').notes;
const sh=s.tracks.find(t=>t.name==='counter'&&t.notes.length>200).notes;
const w=ns=>ns.filter(n=>n[0]>=22*bar&&n[0]<31*bar);
let same=0,diff=0,dup=0;
for(const n of w(sh)){
  let best=1e9,bm=0;
  for(const m of w(lead)){const d=Math.abs(m[0]-n[0]); if(d<best){best=d;bm=m[1];}}
  if(best<0.06){ if(bm===n[1]) dup++; else same++; } else diff++;
}
console.log('B shadow vs lead: dupPitch='+dup+' sameTimeDiffPitch='+same+' offset='+diff);
