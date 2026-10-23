import { HONOU_PRE1 } from '../../src/engine/songs/honou_pre1.js';
const s = HONOU_PRE1.pre1;
const lead = s.tracks[0].notes, horn = s.tracks[2].notes, piano = s.tracks[3].notes;
const A0=17.38, A1=45.5, B0=45.5, B1=58.8, C0=58.8, C1=72.0;
function cover(ns,a,b){ let sum=0; for(const n of ns){ const s0=Math.max(n[0],a), s1=Math.min(n[0]+n[2],b); if(s1>s0) sum+=s1-s0; } return 100*sum/(b-a); }
console.log('A 段 小号 发声覆盖 '+cover(lead,A0,A1).toFixed(0)+'%  (音数 '+lead.filter(n=>n[0]>=A0&&n[0]<A1).length+')');
console.log('B 段 圆号 发声覆盖 '+cover(horn,B0,B1).toFixed(0)+'%  (音数 '+horn.filter(n=>n[0]>=B0&&n[0]<B1).length+')');
console.log('C 段 钢琴右手 发声覆盖 '+cover(piano,C0,C1).toFixed(0)+'%  (音数 '+piano.filter(n=>n[0]>=C0&&n[0]<C1).length+')');
console.log('前奏 0-17s: 电钢/吉他/贝斯 覆盖', cover(s.tracks[5].notes,0,17).toFixed(0)+'%', cover(s.tracks[6].notes,0,17).toFixed(0)+'%', cover(s.tracks[8].notes,0,17).toFixed(0)+'%');