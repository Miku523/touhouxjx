import { launch, sleep } from './_pt_core.mjs';
const PORT = Number(process.argv[2]||9595);
const T = await launch({ port: PORT, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.nav('http://127.0.0.1:8138/?v=' + Date.now());
async function until(expr, max=120000){
  for (let i=0;i<max/120;i++){ let v=false; try { v = await T.eval('!!('+expr+')'); } catch(e){}
    if (v) return true; await sleep(120); }
  return false;
}
console.log('title', await until("window.__game && __game._bootDone"));
const g = await T.eval("JSON.stringify(window.__hksBootGate||{})");
console.log('gate', g);
// 背景请求统计
const bg = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/\\/bg\\//.test(n)).map(n=>n.split('/').pop()))"));
console.log('bgRequests@title', bg.length, JSON.stringify(bg));
await T.eval("__game.startGame()");
await until("window.__game.dialogue && __game.dialogue.active", 60000);
for (let i=0;i<60;i++){
  const act = await T.eval("!!(__game.dialogue && __game.dialogue.active)");
  if (!act) break;
  await T.eval("(()=>{try{__game.dialogue.advance();}catch(e){}})()");
  await sleep(250);
}
console.log('play', await until("window.__game.state==='play'", 90000));
await sleep(4000);
const bg2 = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/\\/bg\\//.test(n)).map(n=>n.split('/').pop()))"));
console.log('bgRequests@play', bg2.length, JSON.stringify(bg2));
await T.shot('_perf/fix_'+PORT+'.png');
await T.close(); process.exit(0);
