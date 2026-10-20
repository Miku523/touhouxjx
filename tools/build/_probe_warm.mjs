
import { TITLE_WARM as W } from '../../src/engine/songs/title_warm.js';
import { TITLE_CHRONICLE as B } from '../../src/engine/songs/title_chronicle.js';
console.log('base drums', B.drums.length, 'warm drums', W.drums.length);
W.tracks.forEach((tr,i)=>console.log(i, tr.wave, tr.gain, tr.notes.length));
const dk={}; W.drums.forEach(d=>dk[d[1]]=(dk[d[1]]||0)+1); console.log(JSON.stringify(dk));
