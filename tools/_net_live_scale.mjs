import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9586, width: 1280, height: 720, headless: false });
const LIVE = 'https://mikuascendlog.com/touhouxjx/?t=' + Date.now();
const KBS = [ {name:'3g-50KB', lat:300, dl:50*1024}, {name:'4g-150KB', lat:150, dl:150*1024}, {name:'slow-17KB', lat:400, dl:17*1024} ];
for (const net of KBS){
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.send('Network.emulateNetworkConditions', { offline:false, latency: net.lat, downloadThroughput: net.dl, uploadThroughput: 32*1024 });
  const t0 = Date.now();
  await T.nav(LIVE + net.name);
  let revealAt=0, kitAt=0, lite=null;
  for (let i=0;i<900;i++){
    let s; try { s = JSON.parse(await T.eval("JSON.stringify({b:!!(window.__game&&__game._bootDone), g:window.__hksBootGate?{k:window.__hksBootGate.kit,d:window.__hksBootGate.done,m:window.__hksBootGate.music,a:window.__hksBootGate.art}:null, l:window.__game?!!__game._bootGateLite:null})")); } catch(e){ await sleep(150); continue; }
    lite = s.l;
    if (s.g && s.g.k && !kitAt) kitAt = Date.now()-t0;
    if (s.b) { revealAt = Date.now()-t0; break; }
    await sleep(150);
  }
  const res = JSON.parse(await T.eval("JSON.stringify({b: performance.getEntriesByType('resource').reduce((s,e)=>s+(e.encodedBodySize||0),0), n: performance.getEntriesByType('resource').length, maxend: Math.round(Math.max(...performance.getEntriesByType('resource').map(e=>e.responseEnd)))})"));
  console.log(net.name, 'reveal='+revealAt, 'kit='+kitAt, 'lite='+lite, 'bytes='+res.b, 'n='+res.n, 'maxend='+res.maxend);
}
await T.close(); process.exit(0);
