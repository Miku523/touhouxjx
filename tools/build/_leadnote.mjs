import { HONOU_PRE1 } from '../../src/engine/songs/honou_pre1.js';
const s = HONOU_PRE1.pre1;
const tr = s.tracks[0];
const ns = tr.notes;
const ds = ns.map(n=>n[2]).sort((a,b)=>a-b);
const q = p => ds[Math.floor(ds.length*p)].toFixed(3);
console.log('lead 音数 '+ns.length+' d 分位 p10='+q(0.1)+' p25='+q(0.25)+' med='+q(0.5)+' p75='+q(0.75)+' p90='+q(0.9));
console.log('前 40 音 [t,m,d]:');
console.log(ns.slice(0,40).map(n=>'['+n[0].toFixed(2)+','+n[1]+','+n[2].toFixed(2)+']').join(' '));
const ints = []; for(let i=1;i<ns.length;i++) ints.push(+(ns[i][0]-ns[i-1][0]).toFixed(3));
const ih={}; for(const x of ints){ const k=x<0.12?'<0.12':x<0.26?'0.12-0.26':x<0.5?'0.26-0.5':x<1?'0.5-1':'>=1'; ih[k]=(ih[k]||0)+1; }
console.log('lead 音间距分布: '+JSON.stringify(ih));
const dsum = ns.reduce((a,n)=>a+Math.min(n[2], ns[ns.length-1][0]-n[0]+n[2]),0);
console.log('lead 发声总时长占区间比例: '+(100*ns.reduce((a,n)=>a+n[2],0)/(ns[ns.length-1][0]-ns[0][0])).toFixed(0)+'%');