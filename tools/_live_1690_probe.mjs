import { launch, sleep } from './_pt_core.mjs';
const PORT = Number(process.argv[2]||9602);
const T = await launch({ port: PORT, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency:300, downloadThroughput:50*1024, uploadThroughput:32*1024 });
const t0=Date.now(); const el=()=>((Date.now()-t0)/1000).toFixed(1);
await T.nav('https://mikuascendlog.com/touhouxjx/?fresh=' + PORT);
async function until(expr, max=180000){ for(let i=0;i<max/150;i++){let v=false;try{v=await T.eval('!!('+expr+')');}catch(e){} if(v)return true; await sleep(150);} return false; }
await until("__game && __game._bootDone");
const sum = async () => Number(await T.eval("performance.getEntriesByType('resource').reduce((s,e)=>s+(e.transferSize||0),0)"));
console.log(el()+'s TITLE bytes='+await sum()+' n='+await T.eval("performance.getEntriesByType('resource').length"));
await sleep(20000);
console.log(el()+'s AFTER20 bytes='+await sum()+' n='+await T.eval("performance.getEntriesByType('resource').length"));
const late = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.split('/').pop(),s:Math.round(e.startTime),b:e.transferSize||0})).filter(r=>r.s>11000&&r.b>5000).sort((a,b)=>b.b-a.b).slice(0,10))"));
for (const r of late) console.log('  ', r.s, r.b, r.n);
await T.close(); process.exit(0);
