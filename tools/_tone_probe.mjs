import { launch, sleep } from './_pt_core.mjs';
const EVAL = (e) => 'JSON.stringify((()=>{try{return (' + e + ')}catch(err){return {__err:String(err)}}})())';
const T = await launch({ port: 9544, width: 1280, height: 720, realAudio: true });
await T.nav('http://127.0.0.1:8138/index.html?v=1.6.89');
await T.waitFor("!!window.__game", 120000);
await sleep(1800);
await T.eval("(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return 1})()");
await sleep(1800);
console.log('rows', await T.eval(EVAL("(()=>{window.__game._showSettings(0,'title');const t=document.body.innerText||'';const i=t.indexOf('测试声音');return {has:t.includes('测试声音'),around:i>=0?t.slice(Math.max(0,i-30),i+60).replace(/\\n/g,' | '):null,page:window.__game._page}})()")));
// 直接调 _testTone，监听 console
await T.eval("(()=>{window.__gametones=[];const o=console.info;console.info=(...a)=>{try{window.__gametones.push(JSON.stringify(a))}catch(e){};o(...a)};return 1})()");
await T.eval("(()=>{window.__game._testTone();return 1})()");
await sleep(1800);
console.log('tone', await T.eval(EVAL("(()=>({logs:window.__gametones,state:window.__game.state,page:window.__game._page,hint:((document.getElementById('hint')||{}).textContent||'').trim()}))()")));
await T.shot('_perf/settings_tone.png');
await T.close();
process.exit(0);