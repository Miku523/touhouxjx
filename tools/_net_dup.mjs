import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9588, width: 1280, height: 720, headless: false });
const LIVE = 'https://mikuascendlog.com/touhouxjx/?dup=' + Date.now();
await T.send('Network.setCacheDisabled', { cacheDisabled: false });
await T.send('Network.emulateNetworkConditions', { offline:false, latency:150, downloadThroughput:150*1024, uploadThroughput:32*1024 });
await T.nav(LIVE);
for (let i=0;i<300;i++){ const b=await T.eval("!!(window.__game&&__game._bootDone)"); if(b==='true'||b===true) break; await sleep(150); }
await sleep(12000);
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({u:e.name,b:e.encodedBodySize||0,t:e.transferSize||0})))"));
const m = {};
for (const r of res){ (m[r.u]=m[r.u]||[]).push(r); }
const dups = Object.entries(m).filter(([u,v])=>v.length>1).map(([u,v])=>({u:u.split('/').slice(-2).join('/'), n:v.length, b:v.reduce((s,x)=>s+x.t,0)}));
console.log('TOTAL_ENTRIES', res.length, 'UNIQUE', Object.keys(m).length);
console.log('TRANSFERRED_ALL', res.reduce((s,r)=>s+r.t,0));
for (const d of dups.sort((a,b)=>b.b-a.b)) console.log(' DUP', d.n, d.b, d.u);
await T.close(); process.exit(0);
