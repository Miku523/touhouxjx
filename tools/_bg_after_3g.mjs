import { launch, sleep } from './_pt_core.mjs';
const PORT = Number(process.argv[2]||9597);
const T = await launch({ port: PORT, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency:300, downloadThroughput:50*1024, uploadThroughput:32*1024 });
const t0 = Date.now(); const el=()=>((Date.now()-t0)/1000).toFixed(1);
await T.nav('http://127.0.0.1:8138/?fresh=' + PORT);
async function until(expr, max=240000){ for (let i=0;i<max/120;i++){ let v=false; try{v=await T.eval('!!('+expr+')');}catch(e){} if(v) return true; await sleep(120);} return false; }
await until("__game && __game._bootDone");
const sum = async () => Number(await T.eval("performance.getEntriesByType('resource').reduce((s,e)=>s+(e.transferSize||0),0)"));
const cnt = async () => Number(await T.eval("performance.getEntriesByType('resource').length"));
console.log(el()+'s TITLE bytes='+await sum()+' n='+await cnt());
await sleep(20000);
console.log(el()+'s AFTER20 bytes='+await sum()+' n='+await cnt());
const top = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.split('/').pop(),s:Math.round(e.startTime),e:Math.round(e.responseEnd),b:e.transferSize||0})).filter(r=>r.s>12000).sort((a,b)=>b.e-a.e).slice(0,12))"));
for (const r of top) console.log('  ', r.s,'->',r.e, r.b, r.n);
await T.close(); process.exit(0);
