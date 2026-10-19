/**
 * 第 4 项「首帧 / 切场景尖峰」审计：真键盘走一遍 标题→难度→主角→关卡→Boss，
 * 记录 longtask、>8ms 的渲染帧、以及 _createStage / 场景构建等阶段性耗时。
 * 纯测量，不改游戏代码（只在 window 上包一层计时）。
 *
 *   node tools/_pt_fix34_spikes.mjs [--gpu 1] [--port 9484] [--out _pt/fix34/spikes.json]
 */
import { launchCfg, saveJson, sleep, readProbe, installProbe } from './_pt_perf_lib.mjs';

const argv = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
  const key = a.slice(2);
  if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) argv[key] = process.argv[++i];
  else argv[key] = '1';
}
const gpu = argv.gpu !== '0' && argv.gpu !== 'false';
const port = Number(argv.port || (gpu ? 9485 : 9484));
const outFile = argv.out || `_pt/fix34/spikes-${gpu ? 'gpu' : 'soft'}.json`;

const INSTRUMENT = `(() => {
  const g = window.__game;
  const S = { long: [], frames: [], phases: {}, marks: [] };
  window.__spike = S;
  try {
    S.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) S.long.push(Math.round(e.duration)); });
    S.obs.observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  const wrap = (name, fnName) => {
    const orig = g[fnName];
    if (typeof orig !== 'function') return;
    g[fnName] = function (...a) {
      const t0 = performance.now();
      try { return orig.apply(this, a); }
      finally { const d = performance.now() - t0; S.phases[name] = (S.phases[name] || 0) + d; if (d > 6) S.marks.push(name + '=' + d.toFixed(1)); }
    };
  };
  wrap('createStage', '_createStage');
  wrap('showTitle', 'showTitle');
  const R = g.render.bind(g);
  g.render = (alpha) => {
    const t0 = performance.now();
    R(alpha);
    const d = performance.now() - t0;
    if (d > 8) S.frames.push(+(d.toFixed(1)));
    return d;
  };
  return 'ok';
})()`;

const T = await launchCfg({ port, gpu, width: 1280, height: 720, dsf: 1 });
const rec = { generatedAt: new Date().toISOString(), gpu, steps: [] };
const step = async (label, ms = 0) => {
  if (ms) await sleep(ms);
  const st = await T.eval(`(() => { const s = window.__spike; return { long: s.long.slice(), frames: s.frames.slice(), phases: s.phases, marks: s.marks.slice() }; })()`).catch(() => null);
  const snap = await T.eval(`(() => { const g = window.__game; return { state: g.state, title: document.getElementById('title')?.textContent, stage: !!g.stage, boss: g.stage?.boss ? { k: g.stage.boss.key || g.stage.boss.name, state: g.stage.boss.state } : null, fps: +(g.loop?.fps || 0).toFixed(1) }; })()`).catch(() => null);
  rec.steps.push({ label, snap, probe: st });
  console.log(`[spikes] ${label}: state=${snap?.state} title=${snap?.title} long=${JSON.stringify(st?.long)} frames>8ms=${JSON.stringify(st?.frames)} marks=${JSON.stringify(st?.marks)} phases=${JSON.stringify(st?.phases)}`);
  // 清空累积，便于归因到这一段
  await T.eval(`(() => { const s = window.__spike; s.long.length = 0; s.frames.length = 0; s.marks.length = 0; for (const k of Object.keys(s.phases)) delete s.phases[k]; return 1; })()`);
};

try {
  await T.boot();
  await T.eval(INSTRUMENT);
  await installProbe(T, true);

  await step('title-idle', 500);
  await T.key('Enter');
  await step('difficulty-open', 700);
  await T.key('KeyE');
  await step('charselect-open', 700);
  await T.key('Digit1');
  await step('stage-created', 900);

  // 跳过前面所有对话，尽量快地进 play
  for (let i = 0; i < 40; i++) {
    const active = await T.eval('!!window.__game.dialogue.active');
    if (!active) break;
    await T.key('Enter', 20);
    await sleep(90);
  }
  await step('play-first-frames', 1200);
  rec.rafPlay = await readProbe(T);
  await installProbe(T, true);

  // 等 Boss 出场（道中清掉敌人：直接跳到 Boss 段前即可用真实时间）
  const t0 = Date.now();
  let boss = false;
  while (Date.now() - t0 < 150000) {
    const st = await T.eval('(() => { const g = window.__game; const b = g.stage?.boss; return { state: g.state, boss: b ? { alive: b.alive, hp: Math.round(b.hp), state: b.state, name: b.name } : null, t: g.stage?.t }; })()');
    if (st.boss && st.boss.alive) { boss = true; break; }
    await sleep(700);
  }
  await step('boss-fight', 2500);
  rec.bossSeen = boss;
  rec.rafBoss = await readProbe(T);

  // 直接量一次 Boss 立绘预处理（getImageData + 三张派生画布）
  rec.bossArt = await T.eval(`(async () => {
    const m = await import('/src/art/genboss.js');
    const out = {};
    for (const k of ['rumia', 'kaguya', 'flandre']) {
      const t0 = performance.now();
      await m.ensureBossArt(k);
      out[k] = +(performance.now() - t0).toFixed(1);
    }
    return out;
  })()`).catch((e) => String(e));
  console.log('[spikes] bossArt load+prep ms:', JSON.stringify(rec.bossArt));

  // 回到标题：切场景一次性成本
  await T.eval('window.__game.showTitle()');
  await step('back-to-title', 900);
  await T.shot('_pt/fix34/spikes-title.png').catch(() => {});
  rec.errors = T.errors.slice(0, 8);
} catch (e) {
  rec.error = String((e && e.stack) || e).slice(0, 1500);
  console.log('[spikes] ERROR', rec.error);
} finally {
  saveJson(outFile, rec);
  console.log('[spikes] wrote', outFile);
  await T.close().catch(() => {});
}
