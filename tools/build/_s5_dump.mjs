import { BOSS_SONGS } from '../../src/engine/songs/touhou.js';
const s = BOSS_SONGS.stage5;
console.log(JSON.stringify({title: s.title, duration: s.duration, bpm: s.bpm, tracks: s.tracks.map(t => ({wave: t.wave, gain: t.gain, n: t.notes.length, lo: Math.min(...t.notes.map(x=>x[1])), hi: Math.max(...t.notes.map(x=>x[1]))})), drums: (s.drums||[]).length}));
console.log(JSON.stringify(s.tracks.map(t => t.notes.slice(0, 20))));
