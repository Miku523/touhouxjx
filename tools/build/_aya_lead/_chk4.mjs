
const m = await import('file:///C:/Users/GuSheng/Downloads/HKS/src/game/musicTracks.js');
const t = m.MUSIC_TRACKS.find(x => x.key === 'stage4');
console.log('stage4', t.time, t.note.length, t.title);
for (const pk of ['en','ja','zh-hant']) {
  const mod = await import('file:///C:/Users/GuSheng/Downloads/HKS/src/i18n/packs/' + pk + '.js');
  const d = Object.values(mod)[0];
  const k = Object.keys(d).filter(x => x.includes('四面 Boss 曲') && x.includes('第三版'));
  console.log(pk, Object.keys(d).length, 'v3keys', k.length, k.length ? d[k[0]].slice(0, 40) : '');
}
const idx = await import('file:///C:/Users/GuSheng/Downloads/HKS/src/engine/songs/index.js');
console.log('aria ok');
