import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9596, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.nav('http://127.0.0.1:8138/?v=' + Date.now());
async function until(expr, max=120000){ for (let i=0;i<max/120;i++){ let v=false; try{v=await T.eval('!!('+expr+')');}catch(e){} if(v) return true; await sleep(120);} return false; }
await until("__game && __game._bootDone");
await T.eval("__game.startGame()");
await until("__game.dialogue && __game.dialogue.active", 60000);
for (let i=0;i<60;i++){ const a=await T.eval("!!(__game.dialogue&&__game.dialogue.active)"); if(!a)break; await T.eval("(()=>{try{__game.dialogue.advance();}catch(e){}})()"); await sleep(200); }
await until("__game.state==='play'", 90000);
await sleep(5000);
const rows = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.split('/').pop(),init:e.initiatorType,s:Math.round(e.startTime),e:Math.round(e.responseEnd)})).filter(r=>/\\.(avif|webp)$/.test(r.n)))"));
for (const r of rows) console.log(String(r.s).padStart(6), String(r.e).padStart(6), r.init.padEnd(6), r.n);
await T.close(); process.exit(0);
