import { YOUMA_STAGE1 } from '../../src/engine/songs/youma_stage1.js';
const s = YOUMA_STAGE1.stage1;
s.tracks.forEach((tr,ti)=>{
  const ns = tr.notes; if(!ns.length) return;
  const span = ns[ns.length-1][0]-ns[0][0];
  const ratio = 100*ns.reduce((a,n)=>a+n[2],0)/(span||1);
  const ds = ns.map(n=>n[2]).sort((a,b)=>a-b);
  console.log('tr'+ti+' '+tr.wave+' n='+ns.length+' medD='+ds[ds.length>>1].toFixed(3)+' 发声占比='+ratio.toFixed(0)+'%');
});