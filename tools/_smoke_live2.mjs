import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9573 });
const out = (k, v) => console.log('  ' + k.padEnd(20) + ' ' + v);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.nav('https://mikuascendlog.com/touhouxjx/index.html');
  await T.waitFor('!!window.__game', 40000);
  await T.key('Enter');
  await sleep(1000);
  const r = await T.eval("(async () => { const M = await import('./src/engine/songs/index.js'); const s = M.getSong('ex_mid'); const d = await M.ensureSong('ex_mid'); return JSON.stringify({ songKeys: Object.keys(s||{}), audio: s && s.audio, title: s && s.title, hasData: !!d, tracks: d ? d.tracks.length : 0, warm: d && d.warm, duration: d && d.duration }); })()");
  out('ex_mid 对象', r);
  const r2 = await T.eval("(async () => { const M = await import('./src/engine/songs/index.js'); const s = M.getSong('ex_pre'); return JSON.stringify({ audio: s && s.audio, title: s && s.title }); })()");
  out('ex_pre 对照', r2);
} finally { await T.close(); }
