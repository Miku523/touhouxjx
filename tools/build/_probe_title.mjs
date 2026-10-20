
import { TITLE_CHRONICLE as T } from '../../src/engine/songs/title_chronicle.js';
console.log('duration', T.duration, 'bpm', T.bpm, 'tracks', T.tracks.length);
T.tracks.forEach((tr,i)=>{
  const notes = tr.notes;
  const midis = notes.map(n=>n[1]);
  console.log(i, tr.wave, 'gain', tr.gain, 'notes', notes.length,
    'midi', Math.min(...midis), '-', Math.max(...midis),
    't0', notes[0][0], 'tEnd', notes[notes.length-1][0]);
});
const dk = {};
T.drums.forEach(d=>dk[d[1]]=(dk[d[1]]||0)+1);
console.log('drums', T.drums.length, JSON.stringify(dk));
