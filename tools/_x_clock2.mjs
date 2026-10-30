import { launch, sleep } from './_pt_core.mjs';
import { LOCAL, cold } from './_x_gate.mjs';
const T = await launch({ port: 9471, width: 1280, height: 720 });
await cold(T);
const navAt = Date.now();
await T.nav(LOCAL + '/index.html?nosw=1');
for (let i = 0; i < 12; i++) {
  const e = await T.eval('JSON.stringify({pt:Math.round(performance.now()),to:Math.round(performance.timeOrigin),href:location.href.slice(-22),rs:document.readyState})').catch((x) => 'ERR ' + String(x).slice(0, 60));
  console.log('wall=' + (Date.now() - navAt) + ' ' + e);
  await sleep(200);
}
await T.close();
