import fs from 'fs';
const d = JSON.parse(fs.readFileSync('tools/build/_pret_ref/necrofantasia/midi_flat.json','utf8'));
const N=d.notes, beat=d.beat;
const byCh={}; for(const n of N){ (byCh[n.ch]=byCh[n.ch]||[]).push(n); }
const chans=Object.keys(byCh).map(Number).sort((a,b)=>a-b);
const rows=[];
for(const c of chans){
  const arr=byCh[c];
  const phase={};
  for(const n of arr){ const p=+(((n.t/beat)%1+1)%1).toFixed(3); phase[p]=(phase[p]||0)+1; }
  const top=Object.entries(phase).sort((a,b)=>b[1]-a[1]).slice(0,3);
  rows.push({ch:c, n:arr.length, barmin:Math.min(...arr.map(x=>x.bar)), barmax:Math.max(...arr.map(x=>x.bar)), pc:[...new Set(arr.map(x=>((x.m%12)+12)%12))].sort((a,b)=>a-b).join(','), topPhase:top.map(([p,k])=>p+'@'+k).join(' ')});
}
console.log(rows.map(r=>JSON.stringify(r)).join('\n'));
