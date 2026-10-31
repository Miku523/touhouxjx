
const mod = await import('../../../src/game/musicTracks.js');
const arr = mod.MUSIC_TRACKS ?? mod.default ?? Object.values(mod).find(v => Array.isArray(v));
const s3 = arr.find(x => x.key === 'stage3');
console.log('stage3', s3.no, s3.title, s3.time, 'noteLen', s3.note.length);
console.log('noteHead', s3.note.slice(0, 60));
for (const lang of ['en','ja','zh-hant']) {
  const m = await import('../../../src/i18n/packs/' + lang + '.js');
  const d = m.default ?? Object.values(m).find(v => v && typeof v === 'object');
  const keys = Object.keys(d);
  console.log(lang, 'keys', keys.length, 'hit', keys.filter(k => k === s3.note).length, 'v6left', keys.filter(k => k.includes('第六版）')).length);
}
const fs2 = await import('node:fs');
const html = fs2.readFileSync('index.html','utf8');
console.log('html new', (html.match(/1\.6\.62/g)||[]).length, 'old', (html.match(/1\.6\.61/g)||[]).length);
console.log('sw', fs2.readFileSync('sw.js','utf8').match(/hks-v[\d.]+/)?.[0]);
console.log('cirno url', fs2.readFileSync('src/engine/songs/index.js','utf8').match(/cirno_stage3\.mp3\?v=[\d.]+/)?.[0]);
console.log('others', [...fs2.readFileSync('src/engine/songs/index.js','utf8').matchAll(/bgm\/[\w.]+\.mp3\?v=[\d.]+/g)].map(m=>m[0]).join(' '));
