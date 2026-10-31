
import fs from 'node:fs';
const root = process.cwd();
const packs = {};
for (const n of ['en', 'ja', 'zh-hant']) {
  packs[n] = (await import('file://' + root + '/src/i18n/packs/' + n + '.js')).default;
}
const { MUSIC_TRACKS } = await import('file://' + root + '/src/game/musicTracks.js');
const t3 = MUSIC_TRACKS.find(x => x.key === 'stage3');
const out = { title: t3.title, time: t3.time, noteLen: t3.note.length, total: MUSIC_TRACKS.length };
out.keys = Object.fromEntries(['en','ja','zh-hant'].map(n => [n, {
  title: !!packs[n][t3.title], orig: !!packs[n][t3.orig], note: !!packs[n][t3.note], count: Object.keys(packs[n]).length,
}]));
const song = (await import('file://' + root + '/src/engine/songs/cirno_stage3.js')).CIRNO_STAGE3.stage3;
out.song = { title: song.title, dur: song.duration, bpm: song.bpm, tracks: song.tracks.length, notes: song.tracks.reduce((a,b)=>a+b.notes.length,0), drums: song.drums.length };
console.log(JSON.stringify(out, null, 1));
