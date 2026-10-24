import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9433, headless: true });
const mode = process.argv[2] || 'off';
await T.boot({ query: '?v=fgoff' + Date.now(), waitTitle: 15000 });
await T.eval(`(() => {
  let n = 0;
  const iv = setInterval(() => {
    if (window.__game && window.__game.stage && window.__game.stage._drawForeground) {
      if (${JSON.stringify(mode)} === 'off') window.__game.stage._drawForeground = function () {};
      clearInterval(iv); n++;
    }
    if (n > 400) clearInterval(iv);
  }, 5);
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] });
  return true;
})()`);
await T.tap('Enter'); await sleep(400);
await T.tap('KeyN'); await sleep(300);
await T.tap('Digit1'); await sleep(400);
window_loop: for (let i = 0; i < 60; i++) {
  const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
  if (s.s === 'play' && !s.d) break;
  await T.tap('Enter'); await sleep(140);
}
await sleep(1200);
console.log(JSON.stringify(await T.eval(`({ mode: ${JSON.stringify(mode)}, patched: !window.__game.stage._drawForeground.toString().includes('_fgBake'), prewarm: window.__prewarmInfo || null, lt: window.__lt.slice(0, 6) })`), null, 2));
await T.close();
