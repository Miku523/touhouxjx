import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9573, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
const t0 = Date.now();
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
const mark = async (label) => { console.log(label, Date.now()-t0, 'ms', await T.eval("JSON.stringify({t:Math.round(performance.now()),state:window.__game&&window.__game.state})")); };
// wait menu
for (let i=0;i<200;i++){ const s = JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null,page:window.__game?window.__game._page:null})")); if (s.state==='menu') break; await sleep(250); }
await mark('MENU');
// start game -> time to play
await T.eval("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
await T.key('Enter'); await sleep(500); await T.key('Enter'); await sleep(600); await T.key('Enter'); await sleep(700);
for (let i=0;i<200;i++){ const s = JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null})")); if (s.state==='play') break; await T.key('Enter'); await sleep(200); }
await mark('PLAY');
const res = JSON.parse(await T.eval("JSON.stringify(performance.getEntriesByType('resource').map(e=>({n:e.name.replace('http://127.0.0.1:8138/',''),t:Math.round(e.startTime),d:Math.round(e.duration),s:e.transferSize})))"));
console.log('requests', res.length, 'bytes', res.reduce((a,b)=>a+(b.s||0),0));
// what started after 20s
const late = res.filter(e=>e.t>20000).sort((a,b)=>a.t-b.t);
console.log('LATE (start>20s) count', late.length);
late.slice(0,25).forEach(e=>console.log('  t'+e.t, 'd'+e.d, e.s, e.n));
await T.close(); process.exit(0);