import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9581, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
const t0 = Date.now();
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
const Q = "JSON.stringify({b:__game._bootDone, g:__hksBootGate})";
let last = null;
for (let i=0;i<400;i++){
  let s; try { s = JSON.parse(await T.eval(Q)); } catch(e){ await sleep(200); continue; }
  const g = s.g || {};
  const key = [s.b,g.art,g.css,g.kit,g.audio,g.music,g.stageArt,g.done].join(',');
  if (key !== last){ last = key; console.log((Date.now()-t0)+'ms', key, 'failed='+JSON.stringify(g.failed||[])); }
  if (g.done) { console.log('GATE_DONE_AT', Date.now()-t0, 'finishedAt', g.finishedAt); break; }
  await sleep(200);
}
for (let i=0;i<200;i++){ const b=JSON.parse(await T.eval(Q)).b; if(b) { console.log('TITLE_REVEAL', Date.now()-t0); break; } await sleep(200); }
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.split('/').pop(),s:Math.round(e.startTime),e:Math.round(e.responseEnd),b:e.encodedBodySize})))"));
const slow = res.filter(r=>r.e>20000).sort((a,b)=>b.e-a.e).slice(0,25);
console.log('COUNT', res.length, 'BYTES', res.reduce((s,r)=>s+(r.b||0),0));
for (const r of slow) console.log(' ', r.n, 'start', r.s, 'end', r.e, 'B', r.b);
await T.shot('_perf/slow_gate.png');
await T.close(); process.exit(0);
