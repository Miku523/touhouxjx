import { launch, sleep, BASE } from './_pt_core.mjs';
const T = await launch({ port: 9625, headless: true });
await T.nav(BASE + '/index.html');
await sleep(4000);
const s = await T.eval(`({ ready: document.readyState, title: document.title, game: !!window.__game, scripts: [...document.scripts].map(s=>s.src), errs: (window.__bootErrs||null) })`);
console.log(JSON.stringify(s, null, 1));
const rep = await T.report();
console.log(JSON.stringify({ errors: rep.errors.slice(0, 8), netFails: rep.netFails.slice(0, 8), httpBad: rep.httpBad.slice(0, 8) }, null, 1));
await T.close();
