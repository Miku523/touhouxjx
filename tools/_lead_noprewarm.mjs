// 关掉预热后看首帧成本：确认 1440x720 前景层 drawImage 是否是每帧都要付的钱。
import { launch, sleep, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9430;
const T = await launch({ port: PORT, headless: true });
const out = {};
try {
  await T.boot({ query: '?v=noprewarm', waitTitle: 15000 });
  // 关掉舞台美术预热，并埋帧计时
  await T.eval(`(() => {
    const g = window.__game;
    g._prewarmStageArt = () => {};
    window.__frames = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      window.__frames.push(Math.round(now - last));
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`);
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  await T.eval('window.__frames.length = 0; 1');
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(140);
  }
  await sleep(5000);
  out.frames = await T.eval('window.__frames.slice(0, 40)');
  out.stats = await T.eval(`(() => {
    const f = window.__frames.slice();
    if (!f.length) return null;
    const s = f.slice().sort((a, b) => a - b);
    return { n: f.length, avg: Math.round(f.reduce((a, b) => a + b, 0) / f.length), p50: s[Math.floor(s.length * 0.5)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] };
  })()`);
  out.prewarm = await T.eval('window.__prewarmInfo || null');
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_noprewarm.json', out);
  await T.close().catch(() => {});
}
