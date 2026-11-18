import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9576, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
for (let i=0;i<200;i++){ const s = JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null})")); if (s.state==='menu') break; await sleep(250); }
await T.eval("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
// keyboard path test
const Q="JSON.stringify({state:__game.state,page:__game._page,ovCls:__game.overlay.className,gate:__game._bootGate.done,hidden:document.hidden})";
console.log('before key', await T.eval(Q));
await T.key('Enter'); await sleep(800);
console.log('after key1', await T.eval(Q));
await T.key('Enter'); await sleep(800);
console.log('after key2', await T.eval(Q));
// now confirm through and watch start
await T.eval("__game._menuAction('confirm')"); await sleep(800);
console.log('after pick', await T.eval(Q));
const t0=Date.now();
for (let i=0;i<30;i++){ await sleep(2000); const s=JSON.parse(await T.eval(Q)); console.log(Math.round((Date.now()-t0)/1000)+'s', JSON.stringify(s)); if(s.state==='play')break; }
await T.shot('_perf/slow_play_wait.png');
await T.close(); process.exit(0);