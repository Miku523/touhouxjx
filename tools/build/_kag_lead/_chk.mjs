import { MUSIC_TRACKS } from '../../../src/game/musicTracks.js';
const t = MUSIC_TRACKS.find(x => x.key === 'stage6');
console.log(JSON.stringify({ no: t.no, title: t.title, time: t.time, noteLen: t.note.length, lines: t.note.split(String.fromCharCode(10)).length }));
