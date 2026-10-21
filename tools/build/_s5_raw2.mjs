import { BOSS_SONGS } from '../../src/engine/songs/touhou.js';
const s = BOSS_SONGS.stage5;
s.tracks.forEach((tr,i)=>console.log('track'+i, tr.wave, tr.gain, 'n=', tr.notes.length, JSON.stringify(tr.notes.slice(0,4))));
