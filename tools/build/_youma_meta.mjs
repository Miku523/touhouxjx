import { YOUMA_STAGE1 } from '../../src/engine/songs/youma_stage1.js';
const s = YOUMA_STAGE1.stage1;
console.log('duration', s.duration, 'bpm', s.bpm);
s.tracks.forEach((tr,i)=>{ const n=tr.notes; console.log('tr'+i+' '+tr.wave+' g='+tr.gain+' n='+n.length+' first='+(n.length?n[0][0].toFixed(2):'-')); });
const lead = s.tracks[0].notes;
console.log('lead 前 3 音', JSON.stringify(lead.slice(0,3)), '末音', JSON.stringify(lead.slice(-1)));