import { YUKARI_PH } from '../../../src/engine/songs/yukari_ph.js';
const S = YUKARI_PH.ph_boss; const bar = 4*60/S.bpm;
const t0=(7-1)*bar, t1=22*bar;
const tr={}; for (const t of S.tracks) { tr[t.name]=(tr[t.name]||[]).concat(t.notes); }
const lead = tr.lead.filter(x=>x[0]>=t0&&x[0]<t1).sort((a,b)=>a[0]-b[0]);
// group by onset within 20ms
const groups=[]; let cur=[];
for (const n of lead){ if(!cur.length || n[0]-cur[cur.length-1][0] < 0.02) cur.push(n); else { groups.push(cur); cur=[n]; } }
if(cur.length) groups.push(cur);
const clash=[]; const sizes={};
for (const g of groups){ sizes[g.length]=(sizes[g.length]||0)+1;
  for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++){
    const iv=Math.abs(g[i][1]-g[j][1]);
    if(iv===1||iv===2||iv===10||iv===11) clash.push({t:+g[i][0].toFixed(2), a:g[i][1], b:g[j][1], iv});
  }
}
console.log(JSON.stringify({groupsAtOnce:sizes, clashCount:clash.length, sample:clash.slice(0,20)}, null, 1));
