/** 冻结渲染纯光栅成本 A/B（0.75/0.67/0.6，同一弹幕状态；端口 9467） */
import { launchCfg, sleep, saveJson } from './_pt_perf_lib.mjs';
const OUT = 'tools/_pt/';
const ENTER_BOSS = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; return { boss: b.key }; })()`;
const FREEZE_BENCH = `((n) => {
  const g = window.__game, r = g.renderer, S = g.stage;
  g.loop.stop();
  const orig = { w: r.canvas.width, h: r.canvas.height, backing: r.backing };
  const run = () => { const ms = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); g.render(1); ms.push(performance.now() - t0); } ms.sort((a, b) => a - b); const avg = ms.reduce((a, b) => a + b, 0) / ms.length; return { avg: +avg.toFixed(2), p50: +ms[(ms.length * 0.5) | 0].toFixed(2), p95: +ms[(ms.length * 0.95) | 0].toFixed(2), min: +ms[0].toFixed(2), max: +ms[ms.length - 1].toFixed(2) }; };
  const bc = () => S.bullets ? (S.bullets.activeCount != null ? S.bullets.activeCount : null) : null;
  const bullets = bc();
  const a075 = run();
  r.backing = 0.67; r.canvas.width = Math.round(1280 * 0.67); r.canvas.height = Math.round(720 * 0.67);
  const a067 = run();
  r.backing = 0.6; r.canvas.width = Math.round(1280 * 0.6); r.canvas.height = Math.round(720 * 0.6);
  const a060 = run();
  r.backing = orig.backing; r.canvas.width = orig.w; r.canvas.height = orig.h; r.fit();
  const a075b = run();
  g.loop.start();
  return { bullets, bulletsEnd: bc(), n, b075: a075, b067: a067, b060: a060, b075b: a075b };
})(30)`;
const out = {};
const T = await launchCfg({ key: 'soft-bench', gpu: false, width: 1280, height: 720, port: 9467, headless: true });
try {
  await T.boot({ waitTitle: true });
  await T.waitFor('window.__game && window.__game._bootDone === true', 15000);
  await sleep(500);
  await T.eval(ENTER_BOSS); await sleep(4000);
  out.bench = await T.eval(FREEZE_BENCH).catch(e => ({ error: String(e).slice(0, 400) }));
  console.log('[BENCH]', JSON.stringify(out.bench));
  out.errors = (T.errors || []).slice(0, 5);
} catch (e) { out.error = String(e); console.log('ERROR', String(e).slice(0, 300)); } finally { try { await T.close(); } catch {} }
saveJson(OUT + 'perf_backing_bench.json', out);
console.log('DONE bench');
