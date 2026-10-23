import { HONOU_PRE1 } from '../../src/engine/songs/honou_pre1.js';
const s = HONOU_PRE1.pre1;
const e16 = 60/s.bpm/4;
const bar = e16*16;
const names = ['底','军','闭','开','吊'];
const rows = [];
for (let b=0;b<20;b++){
  const t0=b*bar, t1=t0+bar;
  const cells = Array.from({length:16},()=>[]);
  for (const d of s.drums){ if (d[0]>=t0 && d[0]<t1){ const slot=Math.round((d[0]-t0)/e16); if(slot>=0&&slot<16) cells[slot].push(names[d[1]]); } }
  rows.push(('bar'+String(b+1).padStart(2,'0')).padEnd(6)+cells.map(c=>c.length?c.join(''):'·').join(' '));
}
console.log(rows.join('\n'));
const perBar = {};
for (const d of s.drums){ const b=Math.floor(d[0]/bar); perBar[b]=(perBar[b]||0)+1; }
const vals = Object.values(perBar);
console.log('每小节鼓击数 中位='+vals.sort((a,b)=>a-b)[Math.floor(vals.length/2)]+' 总数='+s.drums.length);