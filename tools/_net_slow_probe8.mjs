import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9578, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
for (let i=0;i<300;i++){ const s=JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null})")); if(s.state==='menu')break; await sleep(200); }
const Q="JSON.stringify(__game._bootGate)";
for (let i=0;i<30;i++){ await sleep(5000); console.log(i*5+'s', await T.eval(Q)); const g=JSON.parse(await T.eval(Q)); if(g.done)break; }
const late = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.replace('http://127.0.0.1:8138/',''),t:Math.round(e.startTime),d:Math.round(e.duration),s:e.transferSize})).filter(e=>e.t>30000).sort((a,b)=>a.t-b.t))"));
console.log('late', late.length);
late.slice(0,40).forEach(e=>console.log('  t'+e.t,'d'+e.d,e.s,e.n));
await T.close(); process.exit(0);