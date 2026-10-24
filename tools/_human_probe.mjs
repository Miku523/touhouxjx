import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9610, headless: true, width: 1280, height: 720 });
await T.boot();
await sleep(700);
await T.shot('_pt/human/00_title.png');
const dom = await T.eval(`(() => {
  const ov = document.getElementById('overlay');
  return { state: window.__game.state, overlayHidden: ov.classList.contains('hidden'),
    overlayText: ov.innerText.slice(0, 1200),
    btns: Array.from(document.querySelectorAll('.btn')).map(b => ({ t: b.innerText.replace(/\\s+/g,' ').slice(0,60), cls: b.className, key: b._spec?.key, spec: b._spec ? Object.keys(b._spec) : null })),
    ls: Object.keys(localStorage) };
})()`);
console.log(JSON.stringify(dom, null, 1));
const r = await T.report();
console.log('ERR', JSON.stringify(r.errors.slice(0, 10)), 'WARN', JSON.stringify(r.warns.slice(0, 10)), 'NETFAIL', r.netFails.length, '4xx', r.httpBad.length);
await T.close();
