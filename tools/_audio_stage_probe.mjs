import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9514, width: 1280, height: 720 });
const EVAL = (e) => 'JSON.stringify((()=>{try{return (' + e + ')}catch(err){return {__err:String(err)}}})())';
const S = EVAL("(()=>{const a=window.__game.audio,g=window.__game;let rms=null;if(window.__an){const b=new Float32Array(window.__an.fftSize);window.__an.getFloatTimeDomainData(b);let s=0;for(const v of b)s+=v*v;rms=+Math.sqrt(s/b.length).toFixed(5)}return {state:g.state,song:a._songName,voices:a._musicVoices.size,stream:!!a._audioStream,cache:a._audioCache.size,pending:a._songLoadPending,warned:[...a._warnedSongs],muted:a.muted,master:a._master.gain.value,rms}})()");
try {
  await T.nav('https://mikuascendlog.com/touhouxjx/index.html?nocache=1');
  await T.waitFor("!!window.__game", 120000);
  await sleep(2000);
  await T.key('Enter'); await sleep(2500);
  await T.eval(EVAL("(()=>{const a=window.__game.audio;const an=a.ctx.createAnalyser();an.fftSize=1024;a._master.connect(an);window.__an=an;return 1})()"));
  console.log('title', await T.eval(S));
  console.log('start', await T.eval(EVAL("(()=>{try{window.__game.startStage(0);return 'ok'}catch(e){return String(e)}})()")));
  for (let i=0;i<20;i++){ await sleep(1500); const s = JSON.parse(await T.eval(S)); console.log('t'+i, JSON.stringify(s)); if (s.state==='play' && s.song && s.song!=='title' && (s.stream||s.cache>0)) break; }
  await T.shot('_perf/live_1685_stage.png');
} catch(e) { console.log('ERR', String(e).slice(0,300)); }
console.log('DONE');