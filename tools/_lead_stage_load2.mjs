// 定位进关 9s 长任务归属：给 _createStage 及其子步骤包计时。
import { launch, sleep, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9426;
const T = await launch({ port: PORT, headless: true });
const out = {};
try {
  await T.boot({ query: '?v=loadprobe2', waitTitle: 15000 });
  await T.eval(`(() => {
    const G = window.__game;
    const P = G.constructor.prototype;
    window.__t = {};
    const wrap = (name, label) => {
      const fn = P[name];
      if (typeof fn !== 'function') { window.__t[label] = 'missing'; return; }
      P[name] = function (...a) {
        const t0 = performance.now();
        try { return fn.apply(this, a); }
        finally { window.__t[label] = Math.round(performance.now() - t0); }
      };
    };
    wrap('_prewarmBulletSprites', 'prewarmBullets');
    wrap('_prewarmStageArt', 'prewarmArt');
    wrap('_advanceLevel', 'advanceLevel');
    const orig = P._createStage;
    P._createStage = function (...a) {
      const t0 = performance.now();
      try { return orig.apply(this, a); }
      finally { window.__t.createStage = Math.round(performance.now() - t0); }
    };
    window.__t.ready = true;
    return true;
  })()`);
  await T.tap('Enter'); await sleep(400);
  await T.tap('KeyN'); await sleep(300);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter');
    await sleep(140);
  }
  await sleep(1500);
  out.t = await T.eval('window.__t');
  out.audio = await T.eval(`(() => {
    const a = window.__game && window.__game.audio;
    if (!a) return null;
    const t0 = performance.now();
    // 只读状态，不触发新合成
    return { hasAudio: true, ctxState: a.ctx && a.ctx.state, sampleRate: a.ctx && a.ctx.sampleRate, now: a.ctx && a.ctx.currentTime };
  })()`);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.stack) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_stage_load2.json', out);
  await T.close().catch(() => {});
}
