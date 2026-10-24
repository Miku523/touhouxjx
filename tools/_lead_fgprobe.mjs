// 精确统计：一次进关里 Stage.draw / _drawForeground / _fgBake 各调用几次、各花多久。
import { launch, sleep, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9431;
const T = await launch({ port: PORT, headless: true });
const out = {};
try {
  await T.boot({ query: '?v=fgprobe', waitTitle: 15000 });
  await T.eval(`(async () => {
    window.__log = [];
    const { Stage } = await import('/src/game/stage.js');
    const patch = (obj, name) => {
      const orig = obj[name];
      if (typeof orig !== 'function') { window.__log.push(['missing', name]); return; }
      obj[name] = function (...a) {
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally { window.__log.push([name, Math.round(performance.now() - t0)]); }
      };
    };
    patch(Stage.prototype, 'draw');
    patch(Stage.prototype, '_drawForeground');
    patch(Stage.prototype, '_fgBake');
    return true;
  })()`);
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active, has: !!window.__game.stage })');
    if (s.s === 'play' && !s.d && s.has) break;
    await T.tap('Enter'); await sleep(140);
  }
  await sleep(2000);
  out.log = await T.eval('window.__log.slice(0, 60)');
  out.summary = await T.eval(`(() => {
    const m = {};
    for (const [k, v] of window.__log) { if (typeof v !== 'number') continue; m[k] = m[k] || { n: 0, ms: 0, max: 0 }; m[k].n++; m[k].ms += v; m[k].max = Math.max(m[k].max, v); }
    return m;
  })()`);
  out.prewarm = await T.eval('window.__prewarmInfo || null');
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_fgprobe.json', out);
  await T.close().catch(() => {});
}
