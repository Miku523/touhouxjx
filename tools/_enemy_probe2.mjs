import { launch, sleep } from './_pt_core.mjs';
const E = (x) => 'JSON.stringify((()=>{try{return (' + x + ')}catch(e){return {__err:String(e)}}})())';
const T = await launch({ port: 9560, width: 1280, height: 720, realAudio: true, headless: false });
await T.nav('http://127.0.0.1:8138/index.html?v=1.6.89');
await T.waitFor("!!window.__game", 120000);
await sleep(1000);
const st = async () => JSON.parse(await T.eval(E("({s:__game.state,p:__game._page,vis:document.visibilityState,t:+__game.t.toFixed(2)})")));
console.log('boot', await st());
await T.eval("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
await T.key('Enter'); await sleep(600);
console.log('after start', await st());
// difficulty: press Enter to pick first
await T.key('Enter'); await sleep(700);
console.log('after diff', await st());
await T.key('Enter'); await sleep(900);
console.log('after char', await st());
for (let i=0;i<80;i++){
  const s = await st();
  if (s.s === 'play') { console.log('reached play at press', i, s); break; }
  await T.key('Enter'); await sleep(220);
}
const snap = "(()=>{const g=__game,s=g.stage;const p=s&&s.player;const cam=s&&s.camera;const L=(s&&s.enemies&&s.enemies.list)||[];const px=p?p.x+p.w/2:0;let near=0,minD=1e9,idle=0,done=0,act=0;for(const e of L){const d=Math.abs(e.homeX+e.w/2-px);if(d<minD)minD=d;if(d<1400)near++;if(e.entryState==='idle')idle++;else if(e.entryState==='done')done++;else act++;}return {state:g.state,ss:s&&s.state,pstate:g._page,t:+g.t.toFixed(1),px:+px.toFixed(0),camx:cam?+cam.x.toFixed(0):null,vis:document.visibilityState,n:L.length,near,minD:minD===1e9?null:+minD.toFixed(0),idle,act,done}})()";
console.log('play snap', await T.eval(E(snap)));
// hold right
await T.eval("(()=>{const i=__game.stage&&__game.stage.input||null;window.__k={};const dn=(k)=>document.dispatchEvent(new KeyboardEvent('keydown',{code:k,bubbles:true}));const up=(k)=>document.dispatchEvent(new KeyboardEvent('keyup',{code:k,bubbles:true}));dn('ArrowRight');window.__upR=()=>up('ArrowRight');return 1})()");
for (let i=0;i<10;i++){ await sleep(1000); console.log('run', i, await T.eval(E(snap))); }
await T.shot('_perf/enemy_run.png');
await T.eval("window.__upR&&window.__upR()");
await T.close(); process.exit(0);