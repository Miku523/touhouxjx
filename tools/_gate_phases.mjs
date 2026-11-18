// 慢网门禁分段耗时：每个门禁任务 settle 时刻 + 该时刻传输字节
import { launch, sleep, BASE } from './_pt_core.mjs';
const TH = { offline: false, latency: 220, downloadThroughput: 150 * 1024, uploadThroughput: 60 * 1024 };
const T = await launch({ port: 9496, width: 1280, height: 720 });
await T.send('Network.enable', {});
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
try { await T.send('Storage.clearDataForOrigin', { origin: BASE.replace(/\/$/, ''), storageTypes: 'all' }); } catch {}
await T.send('Network.emulateNetworkConditions', TH);
const t0 = Date.now();
await T.send('Page.navigate', { url: BASE + '/index.html' });
const seen = new Set();
for (let i = 0; i < 400; i++) {
  let r = null;
  try { r = await T.eval("(window.__game && window.__game._bootGate) ? JSON.stringify({done:!!window.__game._bootGate.done,art:!!window.__game._bootGate.art,css:!!window.__game._bootGate.css,kit:!!window.__game._bootGate.kit,audio:!!window.__game._bootGate.audio,music:!!window.__game._bootGate.music,stageArt:!!window.__game._bootGate.stageArt}) : null", { awaitPromise: false }); } catch {}
  if (r) {
    const g = JSON.parse(r);
    for (const k of ['art','css','kit','audio','music','stageArt']) if (g[k] && !seen.has(k)) { seen.add(k); console.log(k, Date.now() - t0, 'ms'); }
    if (g.done) { console.log('done', Date.now() - t0, 'ms'); break; }
  }
  await sleep(60);
}
const rs = await T.eval("JSON.stringify(performance.getEntriesByType('resource').filter(e=>e.name.includes('/src/')).map(e=>[e.name.split('/src/')[1], e.encodedBodySize||0, Math.round(e.responseEnd)]).sort((a,b)=>b[1]-a[1]).slice(0,20))", { awaitPromise: false });
console.log('TOP', rs);
await T.close();