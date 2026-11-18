import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9518, width: 1280, height: 720, realAudio: true });
const EVAL = (e) => 'JSON.stringify((()=>{try{return (' + e + ')}catch(err){return {__err:String(err)}}})())';
await T.nav('https://mikuascendlog.com/touhouxjx/index.html?nocache=1');
await T.waitFor("!!window.__game", 120000);
await sleep(1500);
// 模拟玩家在设置里关过音乐：musicOn:false 会被持久化
await T.eval(EVAL("(()=>{localStorage.setItem('hks.settings.v1',JSON.stringify({musicOn:false}));return 1})()"));
await T.eval("location.reload()");
await T.waitFor("!!window.__game", 120000);
await sleep(2500);
await T.eval("(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return 1})()");
await sleep(2000);
console.log('musicOff', await T.eval(EVAL("(()=>{const g=window.__game,a=g.audio;let rms=null;if(a.ctx){const an=a.ctx.createAnalyser();an.fftSize=1024;a._master.connect(an);const b=new Float32Array(1024);an.getFloatTimeDomainData(b);let s=0;for(const v of b)s+=v*v;rms=+Math.sqrt(s/1024).toFixed(5)}return {musicOn:g.musicOn,aMusicOn:a._musicOn,ctx:a.ctx?a.ctx.state:null,mv:a._musicVoices.size,rms,master:a._master?a._master.gain.value:null}})()")));
await T.shot('_perf/real_edge_musicoff.png');
process.exit(0);