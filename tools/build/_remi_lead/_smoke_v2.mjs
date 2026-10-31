import { launch, sleep } from '../../../tools/_pt_core.mjs';
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8199';
const T = await launch({ port: 9585, url: BASE + '/index.html' });
const out = (k, v) => console.log('  ' + k.padEnd(22) + v);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.waitFor('!!window.__game', 40000);
  await T.key('Enter');
  await sleep(1200);
  await T.eval("window.__game.showMusicRoom && window.__game.showMusicRoom()");
  await sleep(600);
  await T.eval("(async () => { const mr = window.__game.musicRoom || (window.__game.showMusicRoom && window.__game.showMusicRoom()); return 'ok'; })()");
  out('repo', await T.eval("(window.__game.musicRoom && window.__game.musicRoom.constructor.name) || 'n/a'"));
  const play = await T.eval("(async () => { const mr = window.__game.musicRoom; if (!mr) return 'no musicRoom'; const tr = mr.tracks.find(t => t.key === 'ex_mid'); if (!tr) return 'no track'; mr._play(tr); return 'played ' + tr.key; })()", { awaitPromise: true });
  out('play', play);
  await sleep(1500);
  const s1 = await T.eval("(() => { const a = window.__game.audio; return JSON.stringify({state: a.ctx && a.ctx.state, song: a.currentSong, mode: a._audioMode, streaming: a._audioStreaming, stream: !!(a._audioStream), bufSrc: !!a._audioSrc, bufDur: a._audioSrc && a._audioSrc.buffer && a._audioSrc.buffer.duration, cache: a._audioCache && [...a._audioCache.keys()].map(u => u.slice(-28))}); })()");
  out('state@1.5s', s1);
  await sleep(2000);
  const s2 = await T.eval("(() => { const a = window.__game.audio; return JSON.stringify({mode: a._audioMode, stream_t: a._audioStream && a._audioStream.currentTime, el: a._audioEl && a._audioEl.src.slice(-40), bufDur: a._audioSrc && a._audioSrc.buffer && a._audioSrc.buffer.duration}); })()");
  out('state@3.5s', s2);
  const bytes = await T.eval("(async () => { const r = await fetch('src/assets/bgm/remilia_septette.mp3?v=1.6.56'); const b = await r.arrayBuffer(); return r.status + ' ' + b.byteLength; })()", { awaitPromise: true });
  out('mp3 fetch', bytes);
  out('ver', await T.eval("(document.querySelector('.title-ver')||{}).textContent"));
} finally { await T.close(); }
