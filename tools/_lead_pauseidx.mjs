// 验收：暂停菜单光标在「设置 → 返回」后保持
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9484, headless: true });
try {
  await T.boot({ query: '?v=pauseidx' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(300); await T.tap('KeyN'); await sleep(200); await T.tap('Digit1'); await sleep(350);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(100);
  }
  await T.tap('Escape'); await sleep(350);
  await T.tap('ArrowDown'); await sleep(150);
  const a = await T.eval('({ idx: window.__game.menuIndex, saved: window.__game._pauseIndex })');
  await T.tap('Enter'); await sleep(500); // 进设置
  const s1 = await T.eval('({ page: window.__game._page, state: window.__game.state })');
  await T.tap('Escape'); await sleep(500); // 回暂停
  const b = await T.eval('({ page: window.__game._page, idx: window.__game.menuIndex, labels: [...document.querySelectorAll("#overlay .btn")].map(x => (x.innerText||"").replace(/\\s+/g," ").trim()) })');
  console.log(JSON.stringify({ a, s1, b }, null, 1));
} finally { await T.close().catch(() => {}); }
