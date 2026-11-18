import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss;
const bar = 4*60/S.bpm;
const secs = [['intro',1,6],['A',7,22],['B',23,38],['A2',39,54],['C',55,70],['C2',71,86],['D',87,102],['D2',103,118],['END',119,121],['coda',122,125]];
const tracks = {};
for (const t of S.tracks) tracks[t.name] = t.notes;
const rows = [];
for (const [name,b0,b1] of secs) {
  const t0=(b0-1)*bar, t1=b1*bar, row={sec:name};
  for (const [id,notes] of Object.entries(tracks)) row[id] = notes.filter(x=>x[0]>=t0&&x[0]<t1).length;
  row.drums = (S.drums||[]).filter(d=>d[0]>=t0&&d[0]<t1).length;
  rows.push(row);
}
const lead = tracks.lead.map(n=>n[0]).sort((a,b)=>a-b);
const gaps=[]; for(let i=1;i<lead.length;i++){const g=lead[i]-lead[i-1]; if(g>bar*0.95) gaps.push([+lead[i-1].toFixed(2), +g.toFixed(2)]);}
const grid=new Map();
for (const d of S.drums||[]) { const b=Math.floor(d[0]/bar), ph=(d[0]%bar)/bar; if(!grid.has(b)) grid.set(b,[]); grid.get(b).push((d[1]|0)+'@'+Math.round(ph*8)); }
const pats=new Map();
for (const ev of grid.values()) { const k=ev.sort().join(','); pats.set(k,(pats.get(k)||0)+1); }
const top=[...pats.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>({bars:v,hits:k.split(',').length}));
console.log(JSON.stringify({rows, leadGaps:gaps, uniqueDrumBars:pats.size, barsWithDrums:grid.size, top}, null, 1));
