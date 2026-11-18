import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9579, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
for (let i=0;i<400;i++){ const s=JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null})")); if(s.state==='menu')break; await sleep(200); }
for (let i=0;i<40;i++){ const g=JSON.parse(await T.eval("JSON.stringify(__game._bootGate)")); if(g.done)break; await sleep(3000); }
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.replace('http://127.0.0.1:8138/','').replace(/\\?v=[^&]*/,''),s:e.transferSize||0,d:Math.round(e.duration),t:Math.round(e.startTime)})))"));
const by={};let tot=0;
for(const e of res){const k=e.n.replace(/^src\/([^/]+)\//,'src/$1/*').replace(/^src\/[^/]+$/,'src/*');by[k]=(by[k]||0)+e.s;tot+=e.s;}
console.log('TOTAL',tot,'count',res.length);
Object.entries(by).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(String(v).padStart(8),k));
console.log('--- top single');
res.sort((a,b)=>b.s-a.s).slice(0,18).forEach(e=>console.log(String(e.s).padStart(8),'d'+e.d,'t'+e.t,e.n));
await T.close(); process.exit(0);