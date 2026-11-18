import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9577, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
const t0=Date.now();
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
for (let i=0;i<300;i++){ const s=JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null})")); if(s.state==='menu')break; await sleep(200); }
console.log('MENU', Date.now()-t0);
console.log('hidden', await T.eval("JSON.stringify({hidden:document.hidden,vis:document.visibilityState,focus:document.hasFocus()})"));
await T.eval("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
// navigate: title->difficulty (confirm), difficulty->charselect (confirm), charselect pick (click first char button)
await sleep(300); await T.eval("__game._menuAction('confirm')"); await sleep(400);
await T.eval("__game._menuAction('confirm')"); await sleep(400);
console.log('page', await T.eval("__game._page"), 'btns', await T.eval("JSON.stringify(__game.menuButtons.map(b=>b.textContent.trim().slice(0,14)))"));
await T.eval("__game.menuButtons[0].click()");
const tp=Date.now();
for (let i=0;i<150;i++){ const s=JSON.parse(await T.eval("JSON.stringify({state:__game.state,gate:__game._bootGate.done})")); if(s.state==='play'){console.log('PLAY', Date.now()-tp,'ms after pick, gate',s.gate);break;} if(i%10===0) console.log('  t+'+(Math.round((Date.now()-tp)/100)/10)+'s',JSON.stringify(s)); await sleep(200); }
console.log('final', await T.eval("JSON.stringify({state:__game.state,enemies:__game.stage?__game.stage.enemies.list.length:-1,camX:__game.stage?Math.round(__game.stage.cam.x):null})"));
await T.shot('_perf/slow_play.png');
await T.close(); process.exit(0);