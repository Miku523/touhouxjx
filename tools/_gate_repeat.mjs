import { launch, sleep, BASE } from './_pt_core.mjs';
const TH = { offline: false, latency: 220, downloadThroughput: 150*1024, uploadThroughput: 60*1024 };
const T = await launch({ port: 9497, width: 1280, height: 720 });
await T.send('Network.enable', {});
for (let run = 1; run <= 3; run++) {
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await T.send('Storage.clearDataForOrigin', { origin: BASE.replace(/\/$/, ''), storageTypes: 'all' }); } catch {}
  await T.send('Network.emulateNetworkConditions', TH);
  const t0 = Date.now();
  await T.send('Page.navigate', { url: BASE + '/index.html' });
  let snap=null;
  for (let i=0;i<1200;i++){
    try { const r = await T.eval("(window.__game&&window.__game._bootGate)?JSON.stringify({done:window.__game._bootGate.done,lite:window.__game._bootGateLite}):null",{awaitPromise:false}); if(r){snap=JSON.parse(r); if(snap.done)break;} } catch {}
    await sleep(100);
  }
  const ms = Date.now()-t0;
  const n = await T.eval("performance.getEntriesByType('resource').length",{awaitPromise:false});
  const bytes = await T.eval("performance.getEntriesByType('resource').reduce((s,e)=>s+(e.transferSize||0),0)",{awaitPromise:false});
  console.log('run'+run, ms+'ms', JSON.stringify(snap), 'res='+n, 'kb='+Math.round(bytes/1024));
}
await T.close();