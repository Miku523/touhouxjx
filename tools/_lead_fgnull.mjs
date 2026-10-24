import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9434, headless: true });
await T.boot({ query: '?v=fgnull' + Date.now(), waitTitle: 15000 });
await T.eval(`(async () => {
  const { Stage } = await import('/src/game/stage.js');
  window.__fgPatched = true;
  Stage.prototype._drawForeground = function () {};
  return true;
})()`);
await T.tap('Enter'); await sleep(400);
await T.tap('KeyN'); await sleep(300);
await T.tap('Digit1'); await sleep(400);
for (let i = 0; i < 60; i++) {
  const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
  if (s.s === 'play' && !s.d) break;
  await T.tap('Enter'); await sleep(140);
}
await sleep(1200);
console.log(JSON.stringify(await T.eval(`({ prewarm: window.__prewarmInfo || null, patched: window.__fgPatched, stageSrc: String(window.__game.stage._drawForeground).slice(0, 40) })`), null, 2));
await T.close();
