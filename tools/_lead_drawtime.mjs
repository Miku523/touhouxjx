import { launch, sleep, saveJson } from './_pt_core.mjs';
const PORT = Number(process.argv[2]) || 9428;
const T = await launch({ port: PORT, headless: true });
const out = {};
try {
  await T.boot({ query: '?v=drawtime', waitTitle: 15000 });
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(140);
  }
  await sleep(1000);
  out.prewarmInfo = await T.eval('window.__prewarmInfo || null');
  out.times = [];
  for (let i = 0; i < 4; i++) {
    out.times.push(await T.eval(`(() => {
      if (!window.__cv) { window.__cv = document.createElement('canvas'); window.__cv.width = 1280; window.__cv.height = 720; window.__cx = window.__cv.getContext('2d'); }
      const t = performance.now();
      window.__game.stage.draw(window.__cx, 1);
      return Math.round(performance.now() - t);
    })()`));
  }
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_drawtime.json', out);
  await T.close().catch(() => {});
}
