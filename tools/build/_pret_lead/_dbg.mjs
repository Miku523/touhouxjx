const run = async () => {
  const mod = await import('../../../src/game/musicTracks.js');
  const t = mod.MUSIC_TRACKS.find(x=>x.key==='pre1');
  const m = await import('../../../src/i18n/packs/en.js');
  const d = m.default || Object.values(m)[0];
  const cand = Object.keys(d).filter(k => k.startsWith('一面道中'));
  console.log('cands', cand.length);
  const k = cand[0];
  console.log('len note', t.note.length, 'len key', k.length);
  for (let i=0;i<Math.max(t.note.length,k.length);i++) { if (t.note[i]!==k[i]) { console.log('diff at', i, JSON.stringify(t.note.slice(i-10,i+10)), JSON.stringify(k.slice(i-10,i+10))); break; } }
};
run();