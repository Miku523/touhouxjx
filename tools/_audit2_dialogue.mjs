import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9728 });
const out = [];
try {
  await T.boot({ waitTitle: true });
  for (let i = 0; i < 4; i++) { await T.key('Enter'); await sleep(300); }
  const meta0 = await T.eval(`(() => { const d = window.__game.dialogue; return { state: window.__game.state, active: d.active, lines: d.script.length, idx: d.index }; })()`);
  let presses = 0;
  while (presses < 160) {
    const st = await T.eval('window.__game.state');
    if (st === 'play') break;
    await T.key('Enter');
    presses++;
    await sleep(45);
    if (presses % 20 === 0) {
      const d = await T.eval(`(() => { const g = window.__game, d = g.dialogue; return { s: g.state, a: d.active, i: d.index, n: d.script.length, typing: d.isTyping, shown: d.shown, full: d.fullText.length }; })()`);
      out.push({ presses, ...d });
    }
  }
  const fin = await T.eval(`(() => ({ state: window.__game.state, active: window.__game.dialogue.active }))()`);
  console.log(JSON.stringify({ meta0, out, fin }, null, 1));
  const rep = await T.report();
  console.log('errors', JSON.stringify(rep.errors.slice(0, 4)));
} finally { await T.close(); }
