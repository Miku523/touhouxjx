import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9584, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 60, downloadThroughput: 400*1024, uploadThroughput: 64*1024 });
await T.nav('http://127.0.0.1:8138/index.html?z=1');
for (let i=0;i<400;i++){ const b=JSON.parse(await T.eval("JSON.stringify(!!(window.__game&&__game._bootDone))")); if(b) break; await sleep(150); }
await sleep(3000);
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.replace(/^.*8138\\//,'').split('?')[0],t:e.initiatorType,b:e.encodedBodySize||0})))"));
const groups={};
for (const r of res){ let k=r.n; const m=k.match(/^(src\/[^/]+\/[^/]+)/); k = m?m[1]:k; groups[k]=(groups[k]||0)+r.b; }
Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([k,v])=>console.log(String(v).padStart(7),k));
console.log('TOTAL', res.reduce((s,r)=>s+r.b,0), 'N', res.length);
console.log('I18N', JSON.stringify(res.filter(r=>/i18n/.test(r.n))));
await T.close(); process.exit(0);
