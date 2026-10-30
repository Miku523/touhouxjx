import { launch, sleep } from './_pt_core.mjs';
import { LOCAL, cold, throttle, snap } from './_x_gate.mjs';
const T = await launch({ port: 9471, width: 1280, height: 720 });
await cold(T);
await throttle(T, { latency: 0, down: -1, up: -1, type: 'wifi' });
const navAt = Date.now();
await T.nav(LOCAL + '/index.html?nosw=1');
for (let i = 0; i < 8; i++) {
  const wall = Date.now() - navAt;
  const s = await T.eval('JSON.stringify({pt:Math.round(performance.now()),to:Math.round(performance.timeOrigin),now:Math.round(Date.now()),vis:document.visibilityState,rs:document.readyState,url:location.search})');
  const o = JSON.parse(s);
  console.log('wall=' + wall + ' pt=' + o.pt + ' timeOrigin=' + o.to + ' dateNow=' + o.now + ' deltaTO=' + (o.now - o.to) + ' vis=' + o.vis);
  await sleep(600);
}
await T.close();
