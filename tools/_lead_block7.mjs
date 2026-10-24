// 单跑「标题设置」块，排查连续 launch 的 boot 超时
import { launch, sleep } from './_pt_core.mjs';
const port = Number(process.argv[2]) || 9482;
const T = await launch({ port, headless: true });
try {
  await T.boot({ query: '?v=iso' + Date.now(), waitTitle: 25000, timeout: 30000 });
  await T.tap('KeyS'); await sleep(400);
  const a = await T.eval('({ state: window.__game.state, page: window.__game._page, idx: window.__game.menuIndex })');
  await T.tap('ArrowDown'); await sleep(120); await T.tap('ArrowDown'); await sleep(120);
  const mid = await T.eval('({ idx: window.__game.menuIndex, saved: window.__game._settingsIndex })');
  await T.tap('Escape'); await sleep(350);
  const b = await T.eval('({ state: window.__game.state, page: window.__game._page })');
  await T.tap('KeyS'); await sleep(350);
  const c = await T.eval('({ state: window.__game.state, idx: window.__game.menuIndex })');
  console.log(JSON.stringify({ port, a, mid, b, c }, null, 1));
} finally { await T.close().catch(() => {}); }
