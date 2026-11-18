import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9587, width: 1280, height: 720, headless: false });
const LIVE = 'https://mikuascendlog.com/touhouxjx/?f=' + Date.now();
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency:300, downloadThroughput:50*1024, uploadThroughput:32*1024 });
const t0 = Date.now();
await T.nav(LIVE);
const T0 = Date.now();
async function waitFor(expr, label, max=180000){
  const s = Date.now();
  for (let i=0;i<max/150;i++){
    let v=false; try { v = await T.eval('!!('+expr+')'); } catch(e){}
    if (v) { console.log(label, (Date.now()/1000).toFixed(1), 'after', (Date.now()-s)+'ms'); return true; }
    await sleep(150);
  }
  console.log(label, 'TIMEOUT'); return false;
}
await waitFor("window.__game && __game._bootDone", 'TITLE');
await T.eval("(window.__game._menuAction||function(){}).call(__game,'confirm')");
await T.eval("window.__game.startGame?window.__game.startGame():0");
await waitFor("window.__game.state==='play'", 'PLAY', 180000);
const st = JSON.parse(await T.eval("JSON.stringify({state:__game.state, kit:!!__game._bootGate.kit, lite:!!__game._bootGateLite})"));
console.log('STATE', JSON.stringify(st), 'elapsed', Date.now()-T0);
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.split('/').pop().split('?')[0],s:Math.round(e.startTime),e:Math.round(e.responseEnd),b:e.encodedBodySize||0})).filter(r=>r.s>9000).sort((a,b)=>a.s-b.s))"));
for (const r of res) console.log(' ', r.s, '->', r.e, r.b, r.n);
await T.shot('_perf/flow_3g.png');
await T.close(); process.exit(0);
