import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9572 });
const out = (k, v) => console.log('  ' + k.padEnd(22) + v);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.nav('https://mikuascendlog.com/touhouxjx/index.html');
  await T.waitFor('!!window.__game', 40000);
  await T.key('Enter');
  await sleep(1200);
  const m0 = await T.eval("(() => { const a = window.__game.audio; return JSON.stringify({ ctx: a.ctx ? a.ctx.state : 'none', song: a.currentSong, on: a.musicOn }); })()");
  out('菜单背景乐', m0);
  await T.eval('window.__game.showMusicRoom()');
  await sleep(2500);
  await T.eval("(() => { const mr = window.__game.musicRoom; const tr = mr.tracks.find(t => t.key === 'ex_mid'); mr._play(tr); return 1; })()");
  for (const ms of [2500, 2500, 2500]) {
    await sleep(ms);
    const s = await T.eval("(() => { const a = window.__game.musicRoom.audio; const el = a._audioEl; return JSON.stringify({ ctx: a.ctx ? a.ctx.state : 'none', song: a.currentSong, on: a.musicOn, src: el ? (el.src||'').split('/').pop().slice(0,40) : null, t: el ? Math.round(el.currentTime*100)/100 : null, dur: el ? Math.round(el.duration*100)/100 : null, paused: el ? el.paused : null, muted: el ? el.muted : null, vol: el ? el.volume : null }); })()");
    out('ex_mid 播放', s);
  }
  const rep = await T.report();
  out('console errors', rep.errors.length + (rep.errors[0] ? ' :: ' + String(rep.errors[0]).slice(0,200) : ''));
} finally { await T.close(); }
