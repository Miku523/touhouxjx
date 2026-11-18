import { launch, sleep } from './_pt_core.mjs';
const EVAL = (e) => 'JSON.stringify((()=>{try{return (' + e + ')}catch(err){return {__err:String(err)}}})())';
const T = await launch({ port: 9551, width: 1280, height: 720 });
await T.nav('http://127.0.0.1:8138/index.html?v=1.6.89');
await T.waitFor("!!window.__game", 120000);
await sleep(1200);
const cdp = (m,p) => T.cdp ? T.cdp(m,p) : null;
try { await T.send ? null : null; } catch(e){}
await T.eval("(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return 1})()");
await sleep(800);
for (let k=0;k<4;k++){ await T.key('Enter'); await sleep(900); }
const snap = "(()=>{const g=window.__game,s=g.stage;let cam=null,px=null,en=null,near=0;try{cam=s&&s.cam!=null?(typeof s.cam==='number'?+s.cam.toFixed(1):+(s.cam.x||0).toFixed(1)):null}catch(e){cam='err'};try{px=s&&s.player?+(s.player.x||0).toFixed(1):null}catch(e){px='err'};try{en=s&&s.enemies&&s.enemies.list?s.enemies.list.length:null;const L=s&&s.enemies?s.enemies.list:[];for(const e of (L||[])){if(Math.abs(e.x-(px||0))<1400)near++}}catch(e){en='err'};return {state:g.state,t:+(g.t||0).toFixed(2),vis:document.visibilityState,cam,px,en,near,rc:g.loop.renderCount}})()";
for (let i=0;i<12;i++){ console.log(i, await T.eval(EVAL(snap))); await sleep(1000); }
await T.shot('_perf/play_state.png');
await T.close(); process.exit(0);