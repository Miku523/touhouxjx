import { launch, sleep } from './_pt_core.mjs';
import { LOCAL, block, cold, sample } from './_x_gate.mjs';
const T = await launch({ port: 9472, width: 1280, height: 720 });
await cold(T);
await block(T, ['*style.css*']);
const navAt = Date.now();
await T.nav(LOCAL + '/index.html?nosw=1');
const rows = await sample(T, [1000, 3000, 9000], { dir: 'tools/shots/net_gate', tag: 'dbg', navAt });
for (const r of rows) {
  const d = r.dom || {};
  console.log('at=' + r.at + ' wall=' + (Date.now() - navAt) + ' domT=' + d.t + ' ready=' + d.ready + ' hks=' + d.hksClass + ' panel=' + (d.panel && d.panel.vis) + ' boot=' + (d.boot && d.boot.vis) + ' uiKids=' + JSON.stringify((d.ui || []).map(k => k.id + ':' + k.disp + ':' + k.vis)));
}
await T.close();
