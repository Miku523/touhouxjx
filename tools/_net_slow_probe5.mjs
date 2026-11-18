import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9575, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
for (let i=0;i<200;i++){ const s = JSON.parse(await T.eval("JSON.stringify({state:window.__game?window.__game.state:null})")); if (s.state==='menu') break; await sleep(250); }
await T.eval("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
const Q="JSON.stringify((()=>{const g=window.__game,o=g.overlay;return {cls:o?o.className:'nob',btns:g.menuButtons?g.menuButtons.length:-1,idx:g.menuIndex,page:g._page,gateDone:g._bootGate&&g._bootGate.done,ret:g._menuAction('confirm'),page2:g._page}})())";
for (let i=0;i<8;i++){ await sleep(2000); console.log(i*2+'s', await T.eval(Q)); }
await T.shot('_perf/slow_menu2.png');
await T.close(); process.exit(0);