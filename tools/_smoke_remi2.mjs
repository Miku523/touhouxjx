import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9564 });
const out = (k, v) => console.log('  ' + k.padEnd(26) + v);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.boot();
  await T.eval('window.__game.showMusicRoom()');
  await sleep(2000);
  await T.eval("(() => { const mr = window.__game.musicRoom; const tr = mr.tracks.find(t => t.key === 'ex_mid'); mr._play(tr); return 1; })()");
  for (const ms of [3000, 3000, 3000]) {
    await sleep(ms);
    const s = await T.eval("(() => { const a = window.__game.musicRoom.audio; const el = a._audioEl; return JSON.stringify({ song: a.currentSong, on: a.musicOn, src: el ? (el.src || '').split('/').pop() : null, t: el ? Math.round(el.currentTime * 100) / 100 : null, dur: el ? Math.round(el.duration * 100) / 100 : null, paused: el ? el.paused : null, ready: el ? el.readyState : null, err: el && el.error ? el.error.code : null }); })()");
    out('播放状态', s);
  }
  const rep = await T.report();
  out('console errors', rep.errors.length + (rep.errors[0] ? ' :: ' + String(rep.errors[0]).slice(0,200) : ''));
} finally { await T.close(); }
