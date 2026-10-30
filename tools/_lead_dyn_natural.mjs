import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9490, width: 1280, height: 720 });
const out = [];
try {
  const t0 = Date.now();
  await T.boot({ query: '?nosw=1', timeout: 45000 });
  for (const ms of [500, 1500, 3000, 5000, 7000, 10000, 15000, 20000]) {
    await sleep(ms - (Date.now() - t0) > 0 ? ms - (Date.now() - t0) : 20);
    const s = await T.eval('(()=>{const r=window.__game&&window.__game.renderer;const g=window.__game;return r?{state:g&&g.state,init:r.lowSpec,idx:r._lowIdx,lb:r.lowBacking,backing:r.backing,cw:r.canvas.width,ch:r.canvas.height,ema:+r._lowEma.toFixed(1),frames:r._lowFrames}:{state:g&&g.state};})()');
    out.push({ t: Date.now() - t0, ...s });
  }
  const fr = await T.eval('(()=>new Promise(res=>{let n=0;const st=performance.now();function f(){n++;if(performance.now()-st<3000)requestAnimationFrame(f);else res({fps:+(n/((performance.now()-st)/1000)).toFixed(1)})}requestAnimationFrame(f);}))()');
  const rinfo = await T.eval('JSON.stringify(window.__rendererInfo)');
  console.log(JSON.stringify({ samples: out, fps3s: fr, rinfo: JSON.parse(rinfo) }, null, 1));
  const rep = await T.report();
  console.log('errors', JSON.stringify(rep.errors), 'httpBad', JSON.stringify(rep.httpBad));
} catch (e) { console.log('ERR', e && e.stack || e); }
finally { await T.close(); }
