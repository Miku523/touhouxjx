import { launch, sleep } from './_pt_core.mjs';
const PORT = Number(process.argv[2]||9590), DL = Number(process.argv[3]||50), LAT = Number(process.argv[4]||300);
const T = await launch({ port: PORT, width: 1280, height: 720, headless: false });
const LIVE = 'https://mikuascendlog.com/touhouxjx/?fresh=' + PORT;
await T.send('Network.emulateNetworkConditions', { offline:false, latency: LAT, downloadThroughput: DL*1024, uploadThroughput: 32*1024 });
const t0 = Date.now();
await T.nav(LIVE);
const el = () => ((Date.now()-t0)/1000).toFixed(1)+'s';
async function until(expr, label, max=240000){
  for (let i=0;i<max/120;i++){
    let v=false; try { v = await T.eval('!!('+expr+')'); } catch(e){}
    if (v) { console.log(el(), 'OK', label); return true; }
    await sleep(120);
  }
  console.log(el(), 'TIMEOUT', label); return false;
}
await until("window.__game && __game._bootDone", 'TITLE');
const b1 = await T.eval("performance.getEntriesByType('resource').reduce((s,e)=>s+(e.transferSize||0),0)");
console.log(el(), 'bytes@title', b1);
// 直接进关，不走菜单
await T.eval("__game.startGame()");
await until("window.__game.dialogue && __game.dialogue.active", 'DIALOGUE');
// 连点推进对白
for (let i=0;i<40;i++){
  const d = await T.eval("!!(__game.dialogue && __game.dialogue.active)");
  if (d!==true) break;
  await T.eval("__game.dialogue.advance ? __game.dialogue.advance() : (__game.dialogue.next&&__game.dialogue.next())");
  await sleep(300);
}
await until("window.__game.state==='play'", 'PLAY');
const b2 = await T.eval("performance.getEntriesByType('resource').reduce((s,e)=>s+(e.transferSize||0),0)");
console.log(el(), 'bytes@play', b2);
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.split('/').pop().split('?')[0],s:Math.round(e.startTime),e:Math.round(e.responseEnd),b:e.transferSize||0})).filter(r=>r.e>3000).sort((a,b)=>b.e-a.e).slice(0,15))"));
for (const r of res) console.log('  ', r.s,'->',r.e, r.b, r.n);
await T.shot('_perf/fresh_'+PORT+'.png');
await T.close(); process.exit(0);
