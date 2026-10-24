// 细拆进关预热里的 drawImage 成本：按调用点聚合耗时。
import { launch, sleep, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9429;
const T = await launch({ port: PORT, headless: true });
const out = {};
try {
  await T.boot({ query: '?v=di1', waitTitle: 15000 });
  await T.eval(`(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    window.__di = new Map();
    window.__diOn = true;
    proto.drawImage = function (img, ...rest) {
      if (!window.__diOn) return orig.call(this, img, ...rest);
      const t0 = performance.now();
      const r = orig.call(this, img, ...rest);
      const ms = performance.now() - t0;
      const st = (new Error().stack || '').split('\\n')[2] || '?';
      const key = st.replace(/^\\s*at\\s*/, '').replace(/\\(.*\\//, '(').trim();
      let e = window.__di.get(key);
      if (!e) { e = { n: 0, ms: 0, iw: 0, ih: 0, dw: 0, dh: 0 }; window.__di.set(key, e); }
      e.n++; e.ms += ms;
      e.iw = (img && img.width) || 0; e.ih = (img && img.height) || 0;
      if (rest.length >= 8) { e.dw = rest[6]; e.dh = rest[7]; } else if (rest.length >= 4) { e.dw = rest[2]; e.dh = rest[3]; }
      return r;
    };
    return true;
  })()`);
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(140);
  }
  out.enterWallMs = Date.now() - t0;
  await T.eval('window.__diOn = false; 1');
  out.prewarm = await T.eval('window.__prewarmInfo || null');
  out.top = await T.eval(`[...window.__di.entries()].map(([k, v]) => ({ k, n: v.n, ms: Math.round(v.ms), img: v.iw + 'x' + v.ih, dst: Math.round(v.dw) + 'x' + Math.round(v.dh) })).sort((a, b) => b.ms - a.ms).slice(0, 25)`);
  out.total = await T.eval(`(() => { let ms = 0, n = 0; for (const v of window.__di.values()) { ms += v.ms; n += v.n; } return { ms: Math.round(ms), n }; })()`);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_drawimage.json', out);
  await T.close().catch(() => {});
}
