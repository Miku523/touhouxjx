import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9582, width: 1280, height: 720, headless: false });
const Q = "JSON.stringify({b:__game.___x, g:__hksBootGate})";
async function run(label, net, cacheDisabled){
  await T.send('Network.setCacheDisabled', { cacheDisabled });
  await T.send('Network.emulateNetworkConditions', { offline:false, latency: net.lat, downloadThroughput: net.dl, uploadThroughput: 64*1024 });
  const t0 = Date.now();
  await T.nav('http://127.0.0.1:8138/index.html?x='+label);
  let gateAt=0, revealAt=0;
  for (let i=0;i<600;i++){
    const s = JSON.parse(await T.eval("JSON.stringify({b:!!(window.__game&&__game._bootDone), d:window.__hksBootGate?__hksBootGate.done:false})"));
    if (s.d && !gateAt) gateAt = Date.now()-t0;
    if (s.b && revealAt===0) revealAt = Date.now()-t0;
    if (s.b && s.d) break;
    await sleep(150);
  }
  const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.split('/').pop(),b:e.encodedBodySize||0,d:Math.round(e.duration)})))"));
  const bytes = res.reduce((s,r)=>s+r.b,0);
  const nav = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('navigation').map(e=>({d:Math.round(e.duration),ttfb:Math.round(e.responseStart)})))"));
  console.log(label, JSON.stringify(net), 'gate='+gateAt, 'reveal='+revealAt, 'req='+res.length, 'bytes='+bytes, 'nav='+JSON.stringify(nav));
  return {res, bytes};
}
await run('cold', {lat:60, dl:400*1024}, true);
await sleep(1500);
await run('warm', {lat:60, dl:400*1024}, false);
await T.shot('_perf/warm_title.png');
await T.close(); process.exit(0);
