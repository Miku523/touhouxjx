
import * as A from '../src/engine/songs/aya_stage4.js';
const s=A.AYA_STAGE4.stage4;
console.log('top keys',Object.keys(s));
console.log('title',s.title,'dur',s.duration,'bpm',s.bpm,'tail',JSON.stringify(s.tail||null));
console.log('tracks',s.tracks.length,'drums',(s.drums||[]).length);
s.tracks.forEach((t,i)=>console.log(' T'+i,t.name,t.wave,t.gain,t.notes.length,JSON.stringify(t.notes[0])));
if(s.drums) console.log('drum0',JSON.stringify(s.drums.slice(0,8)));
