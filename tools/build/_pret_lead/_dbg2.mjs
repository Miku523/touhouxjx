const run = async () => {
  const mod = await import('../../../src/game/musicTracks.js');
  const t = mod.MUSIC_TRACKS.find(x=>x.key==='pre1');
  const m = await import('../../../src/i18n/packs/en.js');
  const d = m.default || Object.values(m)[0];
  console.log('direct', typeof d[t.note], JSON.stringify(String(d[t.note]).slice(0,40)));
  console.log('keys sample', Object.keys(d).slice(0,3));
  const cand = Object.keys(d).find(k=>k.startsWith('一面道中'));
  console.log('cand equal?', cand === t.note);
};
run();