import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9605, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency:300, downloadThroughput:50*1024, uploadThroughput:32*1024 });
await T.nav('https://mikuascendlog.com/touhouxjx/?fresh=9605');
async function until(expr, max=180000){ for(let i=0;i<max/150;i++){let v=false;try{v=await T.eval('!!('+expr+')');}catch(e){} if(v)return true; await sleep(150);} return false; }
await until("__game && __game._bootDone", 170000);
console.log('GATE_TIMING', await T.eval("JSON.stringify({startedAt:window.__hksBootGate&&Math.round(window.__hksBootGate.startedAt),finishedAt:window.__hksBootGate&&Math.round(window.__hksBootGate.finishedAt),done:window.__hksBootGate&&window.__hksBootGate.done})"));
console.log('BYTES', await T.eval("performance.getEntriesByType('resource').reduce((s,e)=>s+(e.transferSize||0),0)"));
await T.close(); process.exit(0);
