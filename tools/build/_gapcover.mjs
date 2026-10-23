import { HONOU_PRE1 } from '../../src/engine/songs/honou_pre1.js';
const s = HONOU_PRE1.pre1;
const wins = [[5.18,5.28],[4.32,4.46],[72.22,72.32],[25.2,25.3],[30.2,30.3]];
for (const [a,b] of wins){
  console.log('--- 窗口 '+a+'~'+b);
  s.tracks.forEach((tr,ti)=>{
    const ov = tr.notes.filter(n=> n[0] < b && n[0]+n[2] > a);
    const before = tr.notes.filter(n=> n[0] <= a).slice(-1)[0];
    const after = tr.notes.filter(n=> n[0] >= a)[0];
    console.log(' tr'+ti+' '+tr.wave+' g='+tr.gain+' 覆盖='+ov.length+' 前音='+(before?before[0].toFixed(3)+'(d'+before[2].toFixed(3)+')':'-')+' 后音='+(after?after[0].toFixed(3):'-'));
  });
  const dd = s.drums.filter(d=> d[0]>a-0.35 && d[0]<b+0.35).map(d=>d[0].toFixed(3)+':'+d[1]);
  console.log('   附近鼓: '+dd.join(' '));
}