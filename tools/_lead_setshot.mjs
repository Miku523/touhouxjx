// 设置页画质检查：等待稳定后再截图，确认无重影/溢出
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9458, headless: true });
try {
  await T.boot({ query: '?v=setshot' + Date.now(), waitTitle: 15000 });
  await T.tap('KeyS'); await sleep(1200);
  const info = await T.eval(`(() => ({
    state: window.__game.state, page: window.__game._page,
    groups: [...document.querySelectorAll('#overlay .set-group')].map(g => ({
      h: Math.round(g.getBoundingClientRect().height),
      rows: g.querySelectorAll('.btn').length,
      overflow: getComputedStyle(g).overflow,
      scrollH: g.scrollHeight,
    })),
    buttonsBox: (() => { const b = document.querySelector('#overlay .buttons'); const r = b.getBoundingClientRect(); return { h: Math.round(r.height), top: Math.round(r.top), scrollH: b.scrollHeight, overflow: getComputedStyle(b).overflow }; })(),
  }))()`);
  console.log(JSON.stringify(info, null, 1));
  await T.shot('_pt/lead_fix/settings_stable.png');
} finally { await T.close().catch(() => {}); }
