/**
 * 性能矩阵：4+2 配置 × 场景（标题 / STG 道中 / Boss / Extra 密集弹幕）× 画质 A/B × 后期消融 × 输入延迟
 * 只读 src（不改游戏代码），仅注入实例级计时包装。
 */
import { launchCfg, installProbe, readProbe, sleep, saveJson, webglInfo, systemInfo, manualRenderScript } from './_pt_perf_lib.mjs';

const OUT = 'tools/_pt/';
const CONFIGS = [
  { key: 'gpu-1280', gpu: true, width: 1280, height: 720, port: 9461 },
  { key: 'gpu-1920', gpu: true, width: 1920, height: 1080, port: 9462 },
  { key: 'soft-1280', gpu: false, width: 1280, height: 720, port: 9463 },
  { key: 'soft-1920', gpu: false, width: 1920, height: 1080, port: 9464 },
  { key: 'gpu-dsf2', gpu: true, width: 1280, height: 720, dsf: 2, port: 9465 },
  { key: 'soft-dsf2', gpu: false, width: 1280, height: 720, dsf: 2, port: 9466 },
];

const SNAP = `(() => {
  const g = window.__game, s = g && g.stage;
  const stg = s && s.mode === 'stg';
  const p = s && s.player;
  return {
    state: g && g.state, sState: s && s.state, mode: s && s.mode, t: s ? +(s.t || 0).toFixed(1) : null,
    bullets: s && s.bullets ? (s.bullets.activeCount != null ? s.bullets.activeCount : (s.bullets.count ? s.bullets.count() : null)) : null,
    enemies: s ? (stg ? (s.stg && s.stg.enemies ? s.stg.enemies.filter((e) => e.alive).length : null) : (s.enemies && s.enemies.list ? s.enemies.list.filter((e) => e.alive).length : null)) : null,
    px: p ? +(stg ? p.worldX : p.x).toFixed(0) : null, py: p ? +(stg ? p.worldY : p.y).toFixed(0) : null,
    power: p ? p.power : null, hp: p ? p.hearts : null,
    boss: s && s.boss ? { key: s.boss.key, st: s.boss.state, hp: Math.round(s.boss.hp), spell: s.boss.spellIdx, pdur: +(s.boss.patternDur || 0).toFixed(1) } : null,
    fps: g && g.loop ? +(g.loop.fps || 0).toFixed(1) : null, frameCap: g && g.loop ? g.loop.frameCap : null,
    rinfo: window.__rendererInfo || null,
    scroll: stg && s.stg ? +s.stg.scroll.toFixed(0) : null,
  };
})()`;

const INSTR = `(() => {
  const g = window.__game;
  if (!g) return 'no game';
  if (window.__ph) return 'already';
  const P = { frames: [], max: 3000 };
  const upd = [];
  let cur = null;
  const now = () => performance.now();
  function wrapInst(obj, name, key) {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    const f = function () {
      if (!cur) return orig.apply(obj, arguments);
      const t = now();
      const r = orig.apply(obj, arguments);
      cur[key] += now() - t;
      return r;
    };
    f.__phw = true;
    obj[name] = f;
  }
  window.__phHookStage = function () {
    const s = g.stage;
    if (!s || typeof s.draw !== 'function' || s.draw.__phw) return false;
    wrapInst(s, 'draw', 's');
    return true;
  };
  const origRender = g.render.bind(g);
  g.render = function (alpha) {
    if (cur) return origRender(alpha);
    const fr = { t: now(), r: 0, b: 0, p: 0, bl: 0, s: 0 };
    cur = fr;
    const t0 = now();
    origRender(alpha);
    fr.r = now() - t0;
    cur = null;
    if (P.frames.length >= P.max) P.frames.splice(0, 600);
    P.frames.push(fr);
  };
  wrapInst(g.renderer, 'begin', 'b');
  wrapInst(g.renderer, 'present', 'p');
  wrapInst(g.renderer, '_bloomPass', 'bl');
  const origUpdate = g.update.bind(g);
  g.update = function (dt) {
    const t = now();
    origUpdate(dt);
    const d = now() - t;
    if (upd.length < 5000) upd.push(d);
  };
  window.__ph = {
    hookStage: window.__phHookStage,
    reset() { P.frames.length = 0; upd.length = 0; },
    stats() {
      const frames = P.frames;
      const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };
      const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 0);
      const arr = frames.map((f) => f.r);
      const n = frames.length || 1;
      const sum = (k) => frames.reduce((x, f) => x + (f[k] || 0), 0);
      const ts = frames.map((f) => f.t);
      const iv = [];
      for (let i = 1; i < ts.length; i++) iv.push(ts[i] - ts[i - 1]);
      const ivq = (p) => { if (!iv.length) return 0; const s = iv.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };
      const r = g.renderer || {};
      return {
        n: frames.length,
        render: { avg: avg(arr), p50: q(arr, 0.5), p95: q(arr, 0.95), p99: q(arr, 0.99), worst: arr.length ? +Math.max.apply(null, arr).toFixed(2) : 0 },
        beginAvg: +(sum('b') / n).toFixed(2),
        presentAvg: +(sum('p') / n).toFixed(2),
        bloomAvg: +(sum('bl') / n).toFixed(2),
        stageAvg: +(sum('s') / n).toFixed(2),
        otherAvg: +((sum('r') - sum('b') - sum('p') - sum('s')) / n).toFixed(2),
        upd: { n: upd.length, avg: avg(upd), p50: q(upd, 0.5), p95: q(upd, 0.95), worst: upd.length ? +Math.max.apply(null, upd).toFixed(2) : 0 },
        rint: { n: iv.length, p50: ivq(0.5), p95: ivq(0.95), p99: ivq(0.99), worst: iv.length ? +Math.max.apply(null, iv).toFixed(2) : 0, over25: iv.filter((d) => d > 25).length, over33: iv.filter((d) => d > 33.4).length },
        rinfo: { postLevel: r.postLevel, postEnabled: r.postEnabled, bloomInterval: r.bloomInterval, bloomEmaMs: +(r.bloomEmaMs || 0).toFixed(2), backing: r.backing, dpr: r.dpr, cw: r.canvas.width, ch: r.canvas.height, quality: r.quality, lowSpec: r.lowSpec, autoDegrade: r.autoDegrade },
        loop: { frameCap: g.loop.frameCap, fps: +(g.loop.fps || 0).toFixed(1), steps: g.loop.stepCount, renders: g.loop.renderCount },
      };
    },
  };
  return 'ok';
})()`;

const BOOTINFO = `(() => {
  const nt = performance.getEntriesByType('navigation')[0] || {};
  const paints = {};
  for (const p of performance.getEntriesByType('paint')) paints[p.name] = Math.round(p.startTime);
  return {
    nowMs: Math.round(performance.now()),
    timeline: (window.__boot && window.__boot.timeline || []).map((e) => ({ n: e.n, t: Math.round(e.t) })),
    prewarm: window.__prewarmInfo || null,
    domContentLoaded: Math.round(nt.domContentLoadedEventEnd || 0),
    loadEvent: Math.round(nt.loadEventEnd || 0),
    dcl: Math.round(nt.domContentLoadedEventEnd || 0),
    paints,
    resources: performance.getEntriesByType('resource').length,
  };
})()`;

const LAT_INSTR = `(() => {
  const g = window.__game;
  if (window.__lat) return 'already';
  const L = { arm: null, base: null, pending: null, trials: [], uptrials: [] };
  window.__lat = L;
  const px = () => { const s = g.stage; if (!s || !s.player) return null; const p = s.player; return s.mode === 'stg' ? p.worldX : p.x; };
  L.px = px;
  window.addEventListener('keydown', (e) => {
    if (L.arm && e.code === L.arm) { L.arm = null; L.pending = performance.now(); }
  }, true);
  const origRender = g.render;
  g.render = function (alpha) {
    if (L.pending != null) {
      const x = px();
      if (x != null && L.base != null && Math.abs(x - L.base) > 0.5) {
        L.trials.push(+(performance.now() - L.pending).toFixed(2));
        L.pending = null;
      }
    }
    return origRender.apply(g, arguments);
  };
  return 'ok';
})()`;

const METRIC_KEYS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes'];
function metricsDelta(a, b) {
  const o = {};
  if (!a || !b) return o;
  for (const k of METRIC_KEYS) if (a[k] != null && b[k] != null) o[k] = Math.round((b[k] - a[k]) * 1000) / 1000;
  return o;
}

async function measure(T, label, ms, opts = {}) {
  try { await T.eval('window.__ph && window.__ph.reset()'); } catch {}
  await installProbe(T);
  const m0 = await T.metrics();
  await sleep(ms);
  const probe = await readProbe(T);
  const m1 = await T.metrics();
  let ph = null, snap = null;
  try { ph = await T.eval('window.__ph ? window.__ph.stats() : null'); } catch (e) { ph = { error: String(e).slice(0, 200) }; }
  try { snap = await T.eval(SNAP); } catch (e) { snap = { error: String(e).slice(0, 200) }; }
  const out = { label, ms, probe, ph, snap, metrics: metricsDelta(m0, m1) };
  console.log('  [' + label + ']', JSON.stringify({ probe: { frames: probe.frames, avg: probe.avg, p50: probe.p50, p95: probe.p95, p99: probe.p99, worst: probe.worst, over33: probe.over33, longMax: probe.longMax }, render: ph && ph.render, rint: ph && ph.rint, upd: ph && ph.upd, bullets: snap && snap.bullets, rinfo: ph && ph.rinfo }));
  return out;
}

async function manualVariants(T, label) {
  const variants = {};
  const run = async (name, setup, restore) => {
    try {
      await T.eval(setup);
      await T.eval(manualRenderScript(10));
      const r = await T.eval(manualRenderScript(40));
      variants[name] = { avg: r.avg, p50: r.p50, p95: r.p95, worst: r.worst, renderer: r.renderer };
      await T.eval(restore);
    } catch (e) { variants[name] = { error: String(e).slice(0, 300) }; }
  };
  await run('baseline', '0', '0');
  await run('postLevel1', '(window.__game.renderer.postLevel=1)', '(window.__game.renderer.postLevel=2)');
  await run('postOff', '(()=>{const r=window.__game.renderer;r.postEnabled=false;return 1})()', '(()=>{const r=window.__game.renderer;r.postEnabled=true;return 1})()');
  await run('bloomNoRefresh', '(()=>{const r=window.__game.renderer;r.bloomInterval=999;r._bloomDirty=false;return 1})()', '(()=>{const r=window.__game.renderer;r.bloomInterval=1;r._bloomDirty=true;return 1})()');
  await run('grainOff', '(()=>{const r=window.__game.renderer;r.lowSpec=true;return 1})()', '(()=>{const r=window.__game.renderer;r.lowSpec=false;return 1})()');
  console.log('  [manual ' + label + ']', JSON.stringify(variants));
  return variants;
}

async function runLatency(T, label) {
  const px = await T.eval('window.__lat.px()');
  if (px == null) return { error: 'no player' };
  const trials = [];
  for (let i = 0; i < 12; i++) {
    await T.eval('(() => { const g = window.__game; const s = g.stage; const p = s.player; const v = ' + (720 + i * 28) + '; if (s.mode === "stg") { p.worldX = v; p.worldY = 400; } else { p.x = v; } const L = window.__lat; L.base = L.px(); L.pending = null; L.arm = "ArrowRight"; return L.base; })()');
    await T.keyDown('ArrowRight');
    await sleep(220);
    await T.keyUp('ArrowRight');
    await sleep(180);
    const got = await T.eval('window.__lat.trials.pop() || null');
    if (typeof got === 'number') trials.push(got);
  }
  const cap = await T.eval('window.__game.loop.frameCap');
  const sorted = trials.slice().sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  return { label, frameCap: cap, n: trials.length, trials, median: med, min: sorted[0] ?? null, max: sorted[sorted.length - 1] ?? null };
}

async function postAblationRaw(T) {
  const res = {};
  try { res.full = await T.eval(manualRenderScript(20)); } catch (e) { res.full = { error: String(e) }; }
  return res;
}

async function runConfig(cfg) {
  const t0 = Date.now();
  const T = await launchCfg({ port: cfg.port, gpu: cfg.gpu, width: cfg.width, height: cfg.height, dsf: cfg.dsf || 1, headless: true, extraArgs: ['--enable-precise-memory-info'] });
  const out = { config: cfg, webgl: null, system: null, boot: null, scenes: {}, manual: {}, latency: {}, errors: [] };
  try {
    await T.boot();
    await T.waitFor('window.__game._bootDone === true', 20000);
    await sleep(500);
    out.boot = await T.eval(BOOTINFO);
    out.webgl = await webglInfo(T);
    out.system = { modelName: null };
    try { out.system = await systemInfo(cfg.port); } catch (e) { out.system = { error: String(e).slice(0, 200) }; }
    try { out.err0 = await T.eval(INSTR); } catch (e) { out.errors.push('instr: ' + String(e).slice(0, 300)); }
    try { out.lat0 = await T.eval(LAT_INSTR); } catch (e) { out.errors.push('latinstr: ' + String(e).slice(0, 300)); }
    out.rinfo = await T.eval('window.__rendererInfo || null');
    console.log('== ' + cfg.key + ' ==', JSON.stringify({ webgl: out.webgl.renderer, dpr: out.webgl.dpr, inner: [out.webgl.innerW, out.webgl.innerH], boot: out.boot.prewarm, timelineEnd: out.boot.timeline.slice(-3), rinfo: out.rinfo }));

    // ---- 1) 标题 ----
    out.scenes.title = await measure(T, 'title', 5000);

    // ---- 2) STG 道中（stage4，跑到 14s 处有密度） ----
    const enterSTG = `(() => { const g = window.__game; g.showTitle(); g.startStage(3, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; if (window.__ph) window.__ph.hookStage(); return { mode: s.mode, px: p.worldX }; })()`;
    await T.eval(enterSTG);
    await T.keyDown('KeyZ');
    await sleep(14000);
    out.scenes.stg_fight = await measure(T, 'stg_fight', 8000);
    await T.keyUp('KeyZ');

    // ---- 3) stage1 Boss（rumia，平台面） ----
    const enterBoss = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; if (window.__ph) window.__ph.hookStage(); return { mode: s.mode, boss: b.key, hp: Math.round(b.hp) }; })()`;
    out.bossEnter = await T.eval(enterBoss);
    await T.keyDown('KeyZ');
    await sleep(4000);
    out.scenes.boss = await measure(T, 'boss', 8000);
    await T.keyUp('KeyZ');

    // ---- 4) Extra 密集弹幕（Flandre，chainFrom 3） ----
    const enterExtra = `(() => { const g = window.__game; g.showTitle(); g._startExtraStage({ chainFrom: 3 }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; if (window.__ph) window.__ph.hookStage(); return { mode: s.mode, boss: s.boss && s.boss.key }; })()`;
    out.extraEnter = await T.eval(enterExtra);
    await T.keyDown('KeyZ');
    await sleep(8000);
    out.scenes.extra_dense = await measure(T, 'extra_dense', 8000);

    // ---- 5) 60fps 封顶（真实 60Hz 体验） ----
    await T.eval('window.__game.loop.setFrameCap(60)');
    out.scenes.extra_cap60 = await measure(T, 'extra_cap60', 6000);

    // ---- 6) 画质 A/B（60 封顶下） ----
    await T.eval('window.__game.loop.setFrameCap(0)');
    await T.eval(`(() => { const g = window.__game; g.setQuality ? g.setQuality('low') : g.renderer.setQuality('low'); return window.__rendererInfo; })()`);
    await sleep(400);
    out.scenes.extra_low = await measure(T, 'extra_low', 6000);
    await T.eval(`(() => { const g = window.__game; g.setQuality ? g.setQuality('high') : g.renderer.setQuality('high'); return window.__rendererInfo; })()`);
    await sleep(400);
    out.scenes.extra_high = await measure(T, 'extra_high', 6000);

    // ---- 7) 后期消融（手动 40 帧 render 计时）----
    out.manual = await manualVariants(T, 'auto(on ' + cfg.key + ')');
    await T.eval(`(() => { const g = window.__game; g.setQuality ? g.setQuality('auto') : g.renderer.setQuality('auto'); return 1; })()`);
    await sleep(300);

    // ---- 8) 输入延迟 ----
    out.latency.native = await runLatency(T, 'native');
    await T.eval('window.__game.loop.setFrameCap(60)');
    await sleep(200);
    out.latency.cap60 = await runLatency(T, 'cap60');
    await T.eval('window.__game.loop.setFrameCap(30)');
    await sleep(200);
    out.latency.cap30 = await runLatency(T, 'cap30');
    await T.eval('window.__game.loop.setFrameCap(0)');
    console.log('  [latency]', JSON.stringify(out.latency));

    // ---- 9) 15s 内存/GC 粗采样（密集场景） ----
    await T.eval(`(() => { const S = { t0: performance.now(), samples: [] }; window.__memq = S;
      S.iv = setInterval(() => { const m = performance.memory; S.samples.push({ t: Math.round(performance.now()), used: m ? m.usedJSHeapSize : null, total: m ? m.totalJSHeapSize : null, fps: +(window.__game.loop.fps || 0).toFixed(1), bullets: (() => { try { const s = window.__game.stage; return s && s.bullets ? (s.bullets.activeCount != null ? s.bullets.activeCount : s.bullets.count()) : null; } catch (e) { return null; } })() }); }, 1000); return 1; })()`);
    await sleep(15000);
    out.memq = await T.eval('(() => { const S = window.__memq; clearInterval(S.iv); return S.samples; })()');
    // 强制 GC 看保留量
    try {
      await T.send('HeapProfiler.enable');
      await T.send('HeapProfiler.collectGarbage');
      out.heapAfterGC = await T.eval('performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null');
    } catch (e) { out.errors.push('gc: ' + String(e).slice(0, 200)); }

    out.errCount = { errors: T.errors.length, warns: T.warns.length, sample: T.errors.slice(0, 5) };
  } catch (e) {
    out.errors.push('RUN: ' + String(e).slice(0, 600));
    console.log('!! ' + cfg.key + ' failed:', String(e).slice(0, 400));
  } finally {
    out.elapsedMs = Date.now() - t0;
    saveJson(OUT + 'perf_matrix_' + cfg.key + '.json', out);
    try { await T.close(); } catch {}
  }
  return out;
}

const only = process.argv[2] ? process.argv[2].split(',') : null;
const summary = {};
for (const cfg of CONFIGS) {
  if (only && !only.includes(cfg.key)) continue;
  summary[cfg.key] = await runConfig(cfg);
}
saveJson(OUT + 'perf_matrix_summary.json', summary);
console.log('DONE', JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { elapsedMs: v.elapsedMs, errors: v.errors }]))));
