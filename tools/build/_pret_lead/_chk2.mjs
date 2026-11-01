const run = async () => {
  const T = (await import('../../../src/game/musicTracks.js')).MUSIC_TRACKS;
  const keys = ['pre1','pre2','pre3','pre4','pre6'];
  for (const p of ['en','ja','zh-hant']) {
    const m = await import('../../../src/i18n/packs/' + p + '.js');
    const d = m.default || Object.values(m)[0];
    let miss = [];
    for (const k of keys) {
      const t = T.find(x => x.key === k);
      if (!d[t.title]) miss.push(k + ':title');
      if (!d[t.note]) miss.push(k + ':note');
      if (!d[t.orig]) miss.push(k + ':orig');
    }
    console.log(p, 'keys', Object.keys(d).length, 'miss', miss.join(',') || 'none');
  }
};
run();