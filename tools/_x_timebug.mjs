import { launch, sleep } from './_pt_core.mjs';
import { LOCAL, block, cold } from './_x_gate.mjs';
const T = await launch({ port: 9472, width: 1280, height: 720 });
await cold(T);
await block(T, ['*style.css*']);
await T.nav(LOCAL + '/index.html?nosw=1');
const t0 = Date.now();
for (let i = 0; i < 10; i++) {
  await sleep(700);
  const r = await T.eval('JSON.stringify({url:location.href,pt:Math.round(performance.now()),to:Math.round(performance.timeOrigin-Date.now()+Math.round(performance.now())),rs:document.readyState,nav:(performance.getEntriesByType("navigation")[0]||{}).type,tn:(performance.getEntriesByType("navigation")[0]||{}).startTime,pp:document.querySelectorAll("link[rel=stylesheet]").length,pc:document.documentElement.className})');
  console.log('wall=' + (Date.now() - t0) + 'ms', r);
}
await T.close();
