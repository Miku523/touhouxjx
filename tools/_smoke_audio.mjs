import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9571 });
const out = (k, v) => console.log('  ' + k.padEnd(24) + v);
try {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.nav('https://mikuascendlog.com/touhouxjx/index.html');
  await T.waitFor('!!window.__game', 40000);
  await T.key('Enter');
  await sleep(1500);
  const r = await T.eval("(async () => { const ac = new (window.AudioContext||window.webkitAudioContext)(); const res = {}; for (const u of ['src/assets/bgm/remilia_septette.mp3?v=1.6.55','src/assets/bgm/sakuya_ex.mp3?v=1.6.44']) { const resp = await fetch(u); const b = await resp.arrayBuffer(); const buf = await ac.decodeAudioData(b.slice(0)); const ch = buf.getChannelData(0); let peak = 0, sum = 0; const step = Math.max(1, Math.floor(ch.length/200000)); let n = 0; for (let i=0;i<ch.length;i+=step){ const v = ch[i]; if (Math.abs(v)>peak) peak = Math.abs(v); sum += v*v; n++; } res[u.split('/').pop()] = { bytes: b.byteLength, dur: Math.round(buf.duration*1000)/1000, peak: Math.round(peak*10000)/10000, rms: Math.round(Math.sqrt(sum/n)*10000)/10000 }; } return JSON.stringify(res); })()");
  out('在线音频内容', r);
} finally { await T.close(); }
