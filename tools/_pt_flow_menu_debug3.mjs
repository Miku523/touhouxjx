import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9433, width: 1280, height: 720 });
try {
  await T.nav('http://127.0.0.1:8138/index.html?seed=12345');
  await sleep(6000);
  const info = await T.eval(`({
    href: location.href, ready: document.readyState, title: document.title,
    bodyText: (document.body.innerText || '').slice(0, 300),
    game: typeof window.__game,
    scripts: [...document.scripts].map(s => s.src || s.type),
    boot: document.getElementById('boot')?.className || null,
    bootText: document.getElementById('boot')?.textContent?.slice(0,200) || null,
    resources: performance.getEntriesByType('resource').map(e => e.name + ':' + (e.responseStatus||'?')).slice(0, 30),
  })`);
  console.log('INFO', JSON.stringify(info, null, 2));
  const rep = await T.report();
  console.log('REPORT', JSON.stringify({ errors: rep.errors, warns: rep.warns, httpBad: rep.httpBad, netFails: rep.netFails }, null, 2));
} finally {
  await T.close();
}
