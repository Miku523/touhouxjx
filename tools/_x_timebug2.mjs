import { launch, sleep } from './_pt_core.mjs';
import { LOCAL, block, cold } from './_x_gate.mjs';
const T = await launch({ port: 9472, width: 1280, height: 720 });
await cold(T);
await block(T, ['*style.css*']);
const t0 = Date.now();
await T.nav(LOCAL + '/index.html?nosw=1');
for (let i = 0; i < 16; i++) {
  await sleep(700);
  const r = await T.eval('JSON.stringify({url:location.href.slice(-40),pt:Math.round(performance.now()),rs:document.readyState,cls:document.documentElement.className,panel:!!document.getElementById("hks-boot-error"),boot:(document.getElementById("boot")||{}).style&&getComputedStyle(document.getElementById("boot")).display,st:(window.__hksBootState?window.__hksBootState():null)})');
  console.log('wall=' + (Date.now() - t0) + 'ms ' + r.slice(0, 420));
}
await T.close();
