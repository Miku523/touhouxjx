import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9601, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.nav('http://127.0.0.1:8138/?v=' + Date.now());
async function until(expr, max=120000){ for (let i=0;i<max/120;i++){ let v=false; try{v=await T.eval('!!('+expr+')');}catch(e){} if(v) return true; await sleep(120);} return false; }
await until("__game && __game._bootDone", 90000);
console.log('GATE', await T.eval("JSON.stringify(window.__hksBootGate)"));
console.log('VER', await T.eval("(document.querySelector('.ver')||{}).textContent || ''"));
await T.eval("__game.startGame()");
await until("__game.dialogue && __game.dialogue.active", 60000);
for (let i=0;i<80;i++){ const a=await T.eval("!!(__game.dialogue&&__game.dialogue.active)"); if(!a)break; await T.eval("(()=>{try{__game.dialogue.advance();}catch(e){}})()"); await sleep(180); }
await until("__game.state==='play'", 90000);
await sleep(3000);
console.log('STATE', await T.eval("__game.state+'/'+(__game.stage?__game.stage.theme:'')"));
console.log('ENEMIES', await T.eval("(()=>{const s=__game.stage; if(!s||!s.enemies) return 'none'; const l=s.enemies.list||[]; return l.length;})()"));
await T.shot('_perf/v1690_play.png');
await T.close(); process.exit(0);
