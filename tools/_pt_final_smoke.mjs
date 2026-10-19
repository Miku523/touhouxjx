import { launch, BASE } from './_pt_core.mjs';
const T = await launch({ port: 9470, width: 1280, height: 720 });
try {
  await T.nav(`${BASE}/index.html?seed=12345`);
  await T.waitFor(`window.__game && !document.getElementById('overlay').classList.contains('hidden')`, 20000);
  const s = await T.eval(`(() => { const g = window.__game; return { state: g.state, canvas: !!document.querySelector('#game canvas') }; })()`);
  const r = T.report();
  console.log(JSON.stringify({ boot: s, errors: r.errors, netFails: r.netFails, httpBad: r.httpBad }));
} finally { await T.close(); }
