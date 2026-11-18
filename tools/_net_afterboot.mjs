import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9583, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: false });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 60, downloadThroughput: 400*1024, uploadThroughput: 64*1024 });
await T.nav('http://127.0.0.1:8138/index.html?y=1');
for (let i=0;i<100;i++){ const b=JSON.parse(await T.eval("JSON.stringify(!!(window.__game&&__game._bootDone))")); if(b) break; await sleep(150); }
await sleep(8000);
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.replace(/^.*\\/(src|assets)\\//,''),t:e.initiatorType,b:e.encodedBodySize||0,tr:e.transferSize||0})))"));
const by = {};
for (const r of res){ const k=r.t; by[k]=by[k]||{n:0,b:0,tr:0}; by[k].n++; by[k].b+=r.b; by[k].tr+=r.tr; }
console.log('GROUPS', JSON.stringify(by,null,0));
const big = res.filter(r=>r.b>30000).sort((a,b)=>b.b-a.b).slice(0,25);
for (const r of big) console.log(' ', r.b, r.tr, r.n);
console.log('TOTAL_B', res.reduce((s,r)=>s+r.b,0), 'TRANSFERRED', res.reduce((s,r)=>s+r.tr,0));
await T.close(); process.exit(0);
