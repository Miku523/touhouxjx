import { launch, sleep } from './_pt_core.mjs';
import { LOCAL, block, cold, throttle, sample } from './_x_gate.mjs';
const T = await launch({ port: 9472, width: 1280, height: 720 });
await cold(T);
await throttle(T, { latency: 0, down: -1, up: -1, type: 'wifi' });
await block(T, ['*style.css*']);
const navAt = Date.now();
await T.nav(LOCAL + '/index.html?nosw=1');
const rows = await sample(T, [1000, 9000], { dir: 'tools/shots/net_gate', tag: 'dbg2', navAt });
for (const r of rows) {
  const d = r.dom || {};
  console.log('at=' + r.at + ' domT=' + d.t + ' ready=' + d.ready + ' hks=' + d.hksClass + ' boot=' + (d.boot && d.boot.vis) + ' panel=' + (d.panel && d.panel.vis));
}
await T.close();
