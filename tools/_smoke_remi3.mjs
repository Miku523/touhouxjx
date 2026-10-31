import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9566 });
const out = (k, v) => console.log('  ' + k.padEnd(20) + v);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.boot();
  await T.key('Enter');            // 用户手势：解锁音频上下文
  await sleep(1200);
  await T.eval('window.__game.showMusicRoom()');
  await sleep(2500);
  await T.eval("(() => { const mr = window.__game.musicRoom; const tr = mr.tracks.find(t => t.key === 'ex_mid'); mr._play(tr); return 1; })()");
  for (const ms of [3000, 3000, 3000]) {
    await sleep(ms);
    const s = await T.eval("(() => { const a = window.__game.musicRoom.audio; const el = a._audioEl; return JSON.stringify({ ctx: a.ctx ? a.ctx.state : 'none', song: a.currentSong, on: a.musicOn, src: el ? (el.src || '').split('/').pop().slice(0,44) : null, t: el ? Math.round(el.currentTime * 100) / 100 : null, dur: el ? Math.round(el.duration * 100) / 100 : null, paused: el ? el.paused : null, ready: el ? el.readyState : null, err: el && el.error ? el.error.code : null }); })()");
    out('播放状态', s);
  }
  const rep = await T.report();
  out('console errors', rep.errors.length + (rep.errors[0] ? ' :: ' + String(rep.errors[0]).slice(0,200) : ''));
} finally { await T.close(); }
