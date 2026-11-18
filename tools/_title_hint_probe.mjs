import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9531, width: 1280, height: 720, realAudio: true });
const EVAL = (e) => 'JSON.stringify((()=>{try{return (' + e + ')}catch(err){return {__err:String(err)}}})())';
await T.nav('https://mikuascendlog.com/touhouxjx/index.html?nocache=1');
await T.waitFor("!!window.__game", 120000);
await sleep(2000);
await T.eval(EVAL("(()=>{localStorage.setItem('hks.settings.v1',JSON.stringify({musicOn:false}));return 1})()"));
await T.eval("location.reload()");
await T.waitFor("!!window.__game", 120000);
await sleep(2000);
await T.eval("(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return 1})()");
await sleep(600);
await T.eval(EVAL("(()=>{const a=window.__game.audio;if(!a.ctx||window.__an)return 0;const an=a.ctx.createAnalyser();an.fftSize=1024;a._master.connect(an);window.__an=an;return 1})()"));
for (let i=0;i<6;i++){ await sleep(600); console.log('+' + (0.6*(i+1)).toFixed(1) + 's', await T.eval(EVAL("(()=>{const a=window.__game.audio;const b=new Float32Array(1024);window.__an.getFloatTimeDomainData(b);let s=0;for(const v of b)s+=v*v;return {voices:a._musicVoices.size,rms:+Math.sqrt(s/1024).toFixed(5),musicOn:window.__game.musicOn}})()"))); }
process.exit(0);