import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9561 });
const out = (k, v) => console.log('  ' + k.padEnd(34) + v);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.boot();
  out('__game 就绪', await T.eval('!!window.__game'));

  const info = await T.eval("(async () => { const M = await import('./src/engine/songs/index.js'); const d = await M.ensureSong('ex_mid'); const s = M.getSong('ex_mid'); return JSON.stringify({ loaded: M.isSongLoaded('ex_mid'), title: s && s.title, dur: d && d.duration, bpm: d && d.bpm, tracks: ((d && d.tracks) || []).length, notes: ((d && d.tracks) || []).reduce((a,b)=>a+b.notes.length,0), drums: (d && d.drums) ? d.drums.length : 0, audio: s && s.audio }); })()");
  out('ex_mid 数据', info);

  const net = await T.eval("(async () => { const M = await import('./src/engine/songs/index.js'); const s = M.getSong('ex_mid'); const r = await fetch(s.audio); const b = await r.arrayBuffer(); const ac = new (window.AudioContext || window.webkitAudioContext)(); let ad = null; try { ad = (await ac.decodeAudioData(b.slice(0))).duration; } catch (e) { ad = 'decode-fail:' + e.message; } return JSON.stringify({ status: r.status, type: r.headers.get('content-type'), bytes: b.byteLength, decoded: ad }); })()");
  out('mp3 fetch/decode', net);

  const mr = await T.eval("(() => { const g = window.__game; return JSON.stringify({ state: g.state, keys: Object.keys(g).filter(k=>/music/i.test(k)).slice(0,10) }); })()");
  out('game 音乐相关', mr);

  await sleep(2500);
  const rep = await T.report();
  out('console errors', rep.errors.length + (rep.errors[0] ? ' :: ' + String(rep.errors[0]).slice(0,160) : ''));
  out('http 4xx', rep.http4xx.length);
  out('net fails', rep.netFails.length);
} finally { await T.close(); }
