import { HONOU_PRE1 } from '../../src/engine/songs/honou_pre1.js';
const s = HONOU_PRE1.pre1;
const groups = new Map();
s.tracks.forEach((tr, ti) => { for (const n of tr.notes) { const k = Math.round(n[0]*1000); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(ti); } });
const hist = {};
for (const [k, v] of groups) hist[v.length] = (hist[v.length]||0) + 1;
console.log('同时起音声部数分布:', JSON.stringify(hist));
const over = [...groups.entries()].filter(([k,v]) => v.length > 4).sort((a,b)=>b[1].length-a[1].length).slice(0,8);
console.log('超4声部样例:', JSON.stringify(over.map(([k,v])=>[k,v])));
s.tracks.forEach((tr, ti) => {
  const ns = tr.notes.slice().sort((a,b)=>a[0]-b[0]);
  const ds = ns.map(n=>n[2]).sort((a,b)=>a-b);
  const med = ds[Math.floor(ds.length/2)];
  const mono = new Map();
  for (const n of ns) { const k = Math.round(n[0]*1000); mono.set(k, Math.max(mono.get(k)||0, n[2])); }
  const tt = [...mono.keys()].sort((a,b)=>a-b);
  const gaps = [];
  for (let i=0;i<tt.length-1;i++) gaps.push(Math.max(0,(tt[i+1]-tt[i])/1000 - mono.get(tt[i])));
  gaps.sort((a,b)=>a-b);
  const silent = gaps.reduce((a,b)=>a+b,0);
  const span = (tt[tt.length-1]-tt[0])/1000 || 1;
  console.log('tr'+ti+' '+tr.wave+' g='+tr.gain+' n='+ns.length+' medD='+med.toFixed(3)+' 空隙占比='+(silent/span*100).toFixed(0)+'% 中位空隙='+(gaps.length?gaps[Math.floor(gaps.length/2)].toFixed(3):'-'));
});
console.log('鼓数:', s.drums.length, '时长:', s.duration, 'bpm:', s.bpm);