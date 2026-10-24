import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9446, headless: true });
try {
  await T.boot({ query: '?v=now' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(500);
  const trace = [];
  for (let i = 0; i < 40; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active, t: (window.__game.dialogue.lines||[]).length, idx: window.__game.dialogue.index, lv: window.__game.levelIndex })');
    trace.push(s);
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(200);
  }
  const errs = T.errors.slice(0, 5);
  console.log(JSON.stringify({ trace: trace.slice(-6), errors: errs, state: await T.eval('window.__game.state') }));
} finally { await T.close().catch(()=>{}); }
