import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9489, width: 1280, height: 720 });
try {
  await T.boot({ query: '?nosw=1', timeout: 40000 });
  await sleep(1500);
  const r = await T.eval('(()=>{const r=window.__game.renderer;const a={idx:r._lowIdx,backing:r.backing,cw:r.canvas.width,ch:r.canvas.height,lowBacking:r.lowBacking};r._lowEma=25;r._lowFrames=60;r._lowCooldown=0;r._lowLast=performance.now()-30;r._tuneLowBacking();const b={idx:r._lowIdx,backing:r.backing,cw:r.canvas.width,ch:r.canvas.height,lowBacking:r.lowBacking};r._lowEma=25;r._lowFrames=60;r._lowCooldown=0;r._lowLast=performance.now()-30;r._tuneLowBacking();const c={idx:r._lowIdx,backing:r.backing,cw:r.canvas.width,ch:r.canvas.height};return {before:a,afterOne:b,afterTwo:c};})()');
  console.log(JSON.stringify(r, null, 1));
  const rep = await T.report();
  console.log('errors', JSON.stringify(rep.errors), 'httpBad', JSON.stringify(rep.httpBad).slice(0,200));
} catch (e) { console.log('ERR', e && e.stack || e); }
finally { await T.close(); }
