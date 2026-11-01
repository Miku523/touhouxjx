const chk = async () => {
  const mod = await import('../../../src/game/musicTracks.js');
  const T = mod.MUSIC_TRACKS;
  for (const k of ['pre1','pre2','pre3','pre4','pre6']) {
    const t = T.find(x => x.key === k);
    console.log(k, '|', t.title, '|', t.time, '| note', t.note.length, '|', t.note.slice(0,20));
  }
  for (const p of ['en','ja','zh-hant']) {
    const m = await import('../../../src/i18n/packs/' + p + '.js');
    const d = m.default || m.PACK || Object.values(m)[0];
    for (const k of ['pre1','pre2','pre3','pre4','pre6']) {
      const mod2 = await import('../../../src/game/musicTracks.js');
      console.log(p, k, d[mod2.MUSIC_TRACKS.find(x=>x.key===k).title] ? 'T' : 'T-MISS', d[mod2.MUSIC_TRACKS.find(x=>x.key===k).note] ? 'N' : 'N-MISS');
    }
  }
};
chk();