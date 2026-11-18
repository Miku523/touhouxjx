import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9574, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
const t0 = Date.now();
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
for (let i=0;i<200;i++){ const s = JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null})")); if (s.state==='menu') break; await sleep(250); }
console.log('MENU', Date.now()-t0);
await T.eval("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
const Q="JSON.stringify({state:__game.state,page:__game._page,hint:document.getElementById('hint')?document.getElementById('hint').textContent:null,gate:__game._bootGate||__hksBootGate})";
for (let i=0;i<10;i++){ await T.key('Enter'); await sleep(1500); console.log(i, await T.eval(Q)); }
await T.shot('_perf/slow_menu.png');
await T.close(); process.exit(0);