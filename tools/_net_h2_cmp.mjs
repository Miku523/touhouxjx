import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9585, width: 1280, height: 720, headless: false });
const LIVE = 'https://mikuascendlog.com/touhouxjx/';
async function run(label, url, net){
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.send('Network.emulateNetworkConditions', { offline:false, latency: net.lat, downloadThroughput: net.dl, uploadThroughput: 32*1024 });
  const t0 = Date.now();
  await T.nav(url);
  let gateAt=0, revealAt=0, tier='?', lite='?';
  for (let i=0;i<700;i++){
    let s; try { s = JSON.parse(await T.eval("JSON.stringify({b:!!(window.__game&&__game._bootDone), d:window.__hksBootGate?window.__hksBootGate.done:false, l:window.__game?!!__game._bootGateLite:null})")); } catch(e){ await sleep(150); continue; }
    if (s.d && !gateAt) gateAt = Date.now()-t0;
    if (s.b && !revealAt) { revealAt = Date.now()-t0; break; }
    await sleep(150);
  }
  const res = JSON.parse(await T.eval("JSON.stringify({proto: performance.getEntriesByType('resource').length, h: (performance.getEntriesByType('resource')[0]||{}).nextHopProtocol, n: performance.getEntriesByType('resource').length, b: performance.getEntriesByType('resource').reduce((s,e)=>s+(e.encodedBodySize||0),0), maxend: Math.round(Math.max(...performance.getEntriesByType('resource').map(e=>e.responseEnd))), slow: performance.getEntriesByType('resource').filter(e=>e.responseEnd>15000).length})"));
  console.log(label, JSON.stringify(net), 'gate='+gateAt, 'reveal='+revealAt, JSON.stringify(res));
  return res;
}
await run('LIVE-h2', LIVE, {lat:150, dl:100*1024});
await sleep(1000);
await run('LOCAL-h1', 'http://127.0.0.1:8138/index.html?cmp=1', {lat:150, dl:100*1024});
await T.close(); process.exit(0);
