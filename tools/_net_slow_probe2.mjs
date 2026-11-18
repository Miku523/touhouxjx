import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9572, width: 1280, height: 720, headless: false });
await T.send('Network.setCacheDisabled', { cacheDisabled: true });
await T.send('Network.emulateNetworkConditions', { offline:false, latency: 400, downloadThroughput: 17*1024, uploadThroughput: 8*1024 });
const t0 = Date.now();
await T.nav('http://127.0.0.1:8138/index.html?slow=1');
const Q = "JSON.stringify((()=>{try{const g=window.__hksBootGate||null;const r=document.documentElement;return {gate:g?JSON.parse(JSON.stringify(g)):null,t:Math.round(performance.now()),state:window.__game&&window.__game.state,cls:r?r.className:'(none)',hasGame:!!window.__game}}catch(e){return {__err:String(e)}}})())";
for (let i=0;i<50;i++){
  const s = await T.eval(Q);
  console.log(Date.now()-t0, s);
  let p={}; try{p=JSON.parse(s)}catch(e){}
  if (p && p.state) break;
  await sleep(4000);
}
await T.close(); process.exit(0);