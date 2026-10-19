import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9433, width: 1280, height: 720 });
const dump = async (tag) => {
  const x = await T.eval(`(() => ({
    href: location.href, ready: document.readyState,
    game: typeof window.__game, state: window.__game?.state,
    overlay: document.getElementById('overlay')?.className,
    boot: document.getElementById('boot')?.className,
    body: (document.body?.innerText || '').slice(0, 120),
  }))()`).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
  const rep = await T.report();
  console.log(tag, JSON.stringify(x), 'errors=', JSON.stringify(rep.errors.slice(0, 4)), 'httpBad=', JSON.stringify(rep.httpBad.slice(0, 4)));
};
try {
  await T.boot({ query: '?seed=12345' });
  await dump('boot1');
  for (let i = 0; i < 3; i++) {
    await T.eval('localStorage.clear()');
    const t0 = Date.now();
    await T.reload();
    const ok = await T.waitFor('window.__game && window.__game.state === "menu" && !document.getElementById("overlay").classList.contains("hidden")', 15000, 100);
    console.log('cycle', i, 'ok=', ok, 'ms=', Date.now() - t0);
    await dump('cycle' + i);
    await sleep(400);
  }
} finally {
  await T.close();
}
