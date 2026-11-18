
import fs from 'node:fs';
const src=fs.readFileSync('src/engine/songs/aya_stage4.js','utf8');
const m=await import('./src/engine/songs/aya_stage4.js');
const s=m.AYA_STAGE4.stage4;
console.log('title',s.title,'dur',s.duration,'bpm',s.bpm,'tail',JSON.stringify(s.tail||null));
console.log('drums',(s.drums||[]).length);
s.tracks.forEach((t,i)=>console.log(i,t.name,t.wave,t.gain,t.notes.length));
