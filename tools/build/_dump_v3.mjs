import {TILLWHEN_PRE5} from '../../src/engine/songs/tillwhen_pre5.js';
import {YUGA_STAGE5} from '../../src/engine/songs/yuuga_stage5.js';
const dump=(m,key)=>{const s=m[key];return {t:s.title,dur:s.duration,bpm:s.bpm,tr:s.tracks.map(x=>x.name+':'+x.gain+':'+(x.notes?x.notes.length:0)).join(' '),drums:(s.drums||[]).length};};
console.log(JSON.stringify(dump(TILLWHEN_PRE5,'pre5')));
console.log(JSON.stringify(dump(YUGA_STAGE5,'stage5')));
