import { HONOU_PRE1 } from '../../src/engine/songs/honou_pre1.js';
import { YOUMA_STAGE1 } from '../../src/engine/songs/youma_stage1.js';
import fs from 'fs';
function prof(name, s){
  const onsets = [];
  s.tracks.forEach((tr,ti)=>{ for(const n of tr.notes) onsets.push(n[0]); });
  for(const d of s.drums) onsets.push(d[0]);
  onsets.sort((a,b)=>a-b);
  const n = onsets.length;
  const dur = s.duration;
  const ioi = [];
  for(let i=1;i<n;i++) ioi.push(Math.round((onsets[i]-onsets[i-1])*1000));
  const buckets = {};
  for(const x of ioi){ const b = x<20? '<20': x<60?'20-60': x<120?'60-120': x<250?'120-250':'>=250'; buckets[b]=(buckets[b]||0)+1; }
  const notes = s.tracks.reduce((a,t)=>a+t.notes.length,0);
  console.log('== '+name+' dur='+dur.toFixed(1)+'s 音符'+notes+' 鼓'+s.drums.length+' 总起音'+n+' 密度'+(n/dur).toFixed(2)+'/s');
  console.log('   IOI分布: '+JSON.stringify(buckets));
  const tr = s.tracks.map((t,i)=>i+':'+t.notes.length).join(' ');
  console.log('   每轨音数: '+tr);
  return {name, dens:n/dur, n, drums:s.drums.length};
}
const a = prof('honou_pre1 v3', HONOU_PRE1.pre1);
const b = prof('youma_stage1 v2', YOUMA_STAGE1.stage1);
for (const f of ['boss5_murasaki.js','ateam_stage3.js','voyage_pre6.js','tillwhen_pre5.js']) {
  try {
    const src = fs.readFileSync(new URL('../../src/engine/songs/'+f, import.meta.url), 'utf8');
    const m = src.match(/\"duration\":\s*([0-9.]+)/) || src.match(/duration:\s*([0-9.]+)/);
    console.log(f+' duration~'+(m?m[1]:'?'));
  } catch(e){ console.log(f+' read fail'); }
}