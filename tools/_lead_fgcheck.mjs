import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9432, headless: true });
await T.boot({ query: '?v=fgcheck' + Date.now(), waitTitle: 15000 });
await T.tap('Enter'); await sleep(400);
await T.tap('KeyN'); await sleep(300);
await T.tap('Digit1'); await sleep(400);
for (let i = 0; i < 60; i++) {
  const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
  if (s.s === 'play' && !s.d) break;
  await T.tap('Enter'); await sleep(140);
}
await sleep(1500);
console.log(JSON.stringify(await T.eval(`({
  src: String(window.__game.stage._drawForeground).slice(0, 80),
  hasBmp: !!window.__game.stage._fgBitmap,
  pending: window.__game.stage._fgPending,
  prewarm: window.__prewarmInfo || null,
  bmpType: window.__game.stage._fgBitmap ? window.__game.stage._fgBitmap.constructor.name : null
})`), null, 2));
await T.close();
