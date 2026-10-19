/**
 * 环境对照实验：同一 build + 同一段操作（stage1 真实按键 6 秒），比较
 *   A headless --disable-gpu 1280x720（基线）
 *   B headless 默认（不禁 GPU，ANGLE/D3D11）1280x720
 *   C B 的 1920x1080
 *   D A 的 1920x1080
 *   E1 A + --force-device-scale-factor=2
 *   E2 B + --force-device-scale-factor=2
 *   F 有头窗口 + GPU 1280x720（真实玩家合成路径参考）
 * 另跑最小 Canvas2D 基线页（1000 矩形 / blend 全屏混合），证明探针没问题并量化 headless 天花板。
 *
 *   node tools/_pt_perf_env.mjs [--configs A,B] [--reps 2] [--skip-baseline]
 */
import { launchCfg, systemInfo, webglInfo, installProbe, readProbe, saveJson, median, sleep, BASE } from './_pt_perf_lib.mjs';

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

const OUT = '_pt/perf';
const REPS = Number(argv.reps || 2);
const ONLY = argv.configs ? argv.configs.split(',').map((s) => s.trim()) : null;
let portBase = Number(argv.port || 9413);

const CONFIGS = [
  { id: 'A', label: 'headless + --disable-gpu 1280x720（基线）', gpu: false, width: 1280, height: 720, dsf: 1, reps: 3 },
  { id: 'B', label: 'headless 默认（不禁 GPU / ANGLE D3D11）1280x720', gpu: true, width: 1280, height: 720, dsf: 1, reps: 3 },
  { id: 'C', label: 'headless 默认 GPU 1920x1080', gpu: true, width: 1920, height: 1080, dsf: 1, reps: 2 },
  { id: 'D', label: 'headless --disable-gpu 1920x1080', gpu: false, width: 1920, height: 1080, dsf: 1, reps: 2 },
  { id: 'E1', label: 'headless --disable-gpu + force-device-scale-factor=2', gpu: false, width: 1280, height: 720, dsf: 2, reps: 2 },
  { id: 'E2', label: 'headless GPU + force-device-scale-factor=2', gpu: true, width: 1280, height: 720, dsf: 2, reps: 2 },
  { id: 'F', label: '有头窗口 GPU 1280x720（真实玩家路径参考）', gpu: true, headless: false, width: 1280, height: 720, dsf: 1, reps: 2 },
];

const selected = CONFIGS.filter((c) => !ONLY || ONLY.includes(c.id));

async function runGameOnce(cfg, rep) {
  const port = portBase++;
  const T = await launchCfg({ ...cfg, port });
  const rec = { config: cfg.id, label: cfg.label, rep, port, ok: false, cfgParams: { gpu: cfg.gpu, headless: cfg.headless !== false, width: cfg.width, height: cfg.height, dsf: cfg.dsf } };
  try {
    const [gpuInfo, wgl] = await Promise.all([systemInfo(port), (async () => null)()]);
    rec.systemInfo = gpuInfo;
    rec.webgl = await webglInfo(T);
    const tBoot = Date.now();
    let booted = false;
    try { booted = await T.boot(); } catch (e) { rec.bootError = String(e); }
    rec.bootMs = Date.now() - tBoot;
    if (!booted) { rec.error = 'boot failed'; return rec; }
    // 真实键盘：标题 -> 难度 E -> 灵梦 -> 跳过开场对话
    await T.key('Enter');
    await T.waitFor('document.getElementById("title")?.textContent === "选择难度"', 5000);
    await T.key('KeyE');
    await T.waitFor('document.getElementById("title")?.textContent === "选择主角"', 5000);
    await T.key('Digit1');
    await T.waitFor('!!window.__game.stage || window.__game.dialogue.active', 8000);
    for (let i = 0; i < 40; i++) {
      if (!(await T.eval('!!window.__game.dialogue.active'))) break;
      await T.key('Enter', 20);
      await sleep(100);
    }
    await T.waitFor('window.__game.state === "play" && !!window.__game.stage', 8000);
    await sleep(500);
    rec.snapBefore = await T.eval(`(() => { const g=window.__game; return { state:g.state, mode:g.stage?.mode, level:g.stage?.level?.name, px:Math.round(g.stage?.player?.x||0), appState:g.state }; })()`);
    if (cfg.postOff) await T.eval('window.__game.renderer.postEnabled = false');
    const m0 = await T.metrics();
    await installProbe(T, true);
    await sleep(250);          // 让探针先跑几帧
    const x0 = await T.eval('Math.round(window.__game.stage.player.x)');
    // ---- 同一段操作：按住 → + Z 射击 6 秒 ----
    await T.keyDown('ArrowRight');
    await T.keyDown('KeyZ');
    await sleep(6000);
    await T.keyUp('KeyZ');
    await T.keyUp('ArrowRight');
    await sleep(120);
    const probe = await readProbe(T);
    const m1 = await T.metrics();
    rec.probe = probe;
    rec.snapAfter = await T.eval(`(() => { try {
      const g = window.__game, st = g && g.stage, r = g && g.renderer;
      const bullets = st && st.bullets ? (st.bullets.activeCount ?? (st.bullets.pool ? st.bullets.pool.filter(b=>b.active).length : -1)) : -1;
      const enemies = st && st.enemies ? (st.enemies.list ? st.enemies.list.length : -2) : -1;
      return { state:g.state, stage:!!st, px:Math.round(st && st.player ? st.player.x : -1), py:Math.round(st && st.player ? st.player.y : -1), bullets, enemies,
        fps:+(g.loop.fps||0).toFixed(1), stepMs:+(g.loop.lastStepMs||0).toFixed(2),
        renderer: r ? { postEnabled:r.postEnabled, postLevel:r.postLevel, bloomInterval:r.bloomInterval, bloomEmaMs:+(r.bloomEmaMs||0).toFixed(2), backing:r.backing, dpr:r.dpr, lowSpec:!!r.lowSpec, softwareRaster:!!r.softwareRaster, canvasW:r.canvas.width, canvasH:r.canvas.height } : null,
        doc:{ dpr:devicePixelRatio, iw:innerWidth, ih:innerHeight, vis:document.visibilityState } };
    } catch (e) { return { error: String((e && e.stack) || e).slice(0, 500) }; } })()`);
    if (m0 && m1) {
      const d = {}; for (const k of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'V8CompileDuration']) if (k in m1) d[k] = +((m1[k] - (m0[k] || 0)) * 1000 / 6.15).toFixed(1);
      rec.cdpMetricsPerSec = d;
    }
    rec.moved = ((rec.snapAfter?.px ?? -1) - x0) > 20;
    rec.shot = await T.shot(`${OUT}/env-${cfg.id}-r${rep}.png`);
    rec.ok = true;
    return rec;
  } catch (e) {
    rec.error = String((e && e.stack) || e).slice(0, 800);
    rec.errors = T.errors.slice(0, 5);
    return rec;
  } finally {
    await T.close().catch(() => {});
  }
}

async function runBaselinePage(env, mode, w, h, dpr) {
  const port = portBase++;
  const T = await launchCfg({ port, ...env });
  const rec = { page: 'baseline', mode, env: env.id, w, h, dpr, ok: false };
  try {
    const url = `${BASE}/_pt/perf/baseline.html?mode=${mode}&w=${w}&h=${h}&dpr=${dpr}&t=${Date.now()}`;
    await T.nav(url);
    const ok = await T.waitFor('!!window.__fp && !!window.__game === false', 10000);
    await sleep(1200); // 预热
    await installProbe(T, true);
    const bench = await T.eval('window.__bench()');
    await sleep(3000);
    rec.probe = await readProbe(T);
    rec.bench = bench;
    rec.ok = ok;
    rec.doc = await T.eval('({ dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight, webgl: !!document.createElement("canvas").getContext("webgl2") })');
    rec.webgl = await webglInfo(T);
    return rec;
  } catch (e) {
    rec.error = String((e && e.stack) || e).slice(0, 500);
    return rec;
  } finally {
    await T.close().catch(() => {});
  }
}

const all = { startedAt: new Date().toISOString(), game: [], baselinePage: [] };
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timeout ' + ms + 'ms')), ms))]);
console.log('[env] configs:', selected.map((c) => c.id).join(','));
for (const cfg of selected) {
  const reps = Number(argv.reps || cfg.reps || REPS);
  for (let r = 1; r <= reps; r++) {
    let rec = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { rec = await withTimeout(runGameOnce(cfg, r), 150000, 'run ' + cfg.id); } catch (e) { rec = { config: cfg.id, label: cfg.label, rep: r, ok: false, error: String(e).slice(0, 400) }; }
      if (rec.ok) break;
      console.log(`[env] ${cfg.id} r${r} attempt${attempt} failed: ${String(rec.error).slice(0, 200)}`);
      await sleep(1200);
    }
    all.game.push(rec);
    console.log(`[env] ${cfg.id} r${r}: ${rec && rec.ok ? `avg=${rec.probe.avg}ms p95=${rec.probe.p95} long=${rec.probe.longtasks} postLevel=${rec.snapAfter?.renderer?.postLevel} renderer=${rec.webgl?.renderer?.slice(0, 40)}` : 'FAIL ' + (rec && rec.error)}`);
  }
}

if (!argv['skip-baseline'] && (!ONLY || ONLY.includes('BASE'))) {
  for (const b of [
    { id: 'base-soft-1280', env: { gpu: false, width: 1280, height: 720, dsf: 1 }, mode: 'rects', w: 1280, h: 720, dpr: 1 },
    { id: 'base-soft-blend', env: { gpu: false, width: 1280, height: 720, dsf: 1 }, mode: 'blend', w: 1280, h: 720, dpr: 1 },
    { id: 'base-gpu-1280', env: { gpu: true, width: 1280, height: 720, dsf: 1 }, mode: 'rects', w: 1280, h: 720, dpr: 1 },
    { id: 'base-gpu-blend', env: { gpu: true, width: 1280, height: 720, dsf: 1 }, mode: 'blend', w: 1280, h: 720, dpr: 1 },
    { id: 'base-gpu-grads', env: { gpu: true, width: 1280, height: 720, dsf: 1 }, mode: 'grads', w: 1280, h: 720, dpr: 1 },
    { id: 'base-soft-grads', env: { gpu: false, width: 1280, height: 720, dsf: 1 }, mode: 'grads', w: 1280, h: 720, dpr: 1 },
    { id: 'base-headful-blend', env: { gpu: true, headless: false, width: 1280, height: 720, dsf: 1 }, mode: 'blend', w: 1280, h: 720, dpr: 1 },
  ]) {
    let rec = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try { rec = await withTimeout(runBaselinePage(b.env, b.mode, b.w, b.h, b.dpr), 90000, 'baseline ' + b.id); } catch (e) { rec = { page: 'baseline', mode: b.mode, ok: false, error: String(e).slice(0, 300) }; }
      if (rec.ok) break;
      await sleep(1000);
    }
    rec.id = b.id;
    all.baselinePage.push(rec);
    console.log(`[baseline] ${b.id} ${b.mode}: ${rec.ok ? `avg=${rec.probe.avg}ms p95=${rec.probe.p95} long=${rec.probe.longtasks}` : 'FAIL ' + rec.error}`);
  }
}

/* 汇总：每配置按 rep 取中位数 */
const summary = selected.map((cfg) => {
  const rows = all.game.filter((r) => r.config === cfg.id && r.ok);
  const pick = (f) => median(rows.map(f));
  return {
    config: cfg.id, label: cfg.label, gpu: cfg.gpu, headless: cfg.headless !== false, w: cfg.width, h: cfg.height, dsf: cfg.dsf,
    reps: rows.length,
    avg: pick((r) => r.probe.avg), p50: pick((r) => r.probe.p50), p95: pick((r) => r.probe.p95),
    p99: pick((r) => r.probe.p99), worst: pick((r) => r.probe.worst), longtasks: pick((r) => r.probe.longtasks),
    frames: pick((r) => r.probe.frames), longMax: pick((r) => r.probe.longMax),
    postLevel: pick((r) => r.snapAfter?.renderer?.postLevel), backing: pick((r) => r.snapAfter?.renderer?.backing),
    canvas: rows[0]?.snapAfter?.renderer ? `${rows[0].snapAfter.renderer.canvasW}x${rows[0].snapAfter.renderer.canvasH}` : null,
    rendererStr: rows[0]?.webgl?.renderer || null,
    moved: rows.every((r) => r.moved),
    cdpTaskMsPerSec: pick((r) => r.cdpMetricsPerSec?.TaskDuration),
    cdpScriptMsPerSec: pick((r) => r.cdpMetricsPerSec?.ScriptDuration),
    allReps: rows.map((r) => ({ rep: r.rep, avg: r.probe.avg, p95: r.probe.p95, worst: r.probe.worst, longtasks: r.probe.longtasks, frames: r.probe.frames })),
  };
});
const baseSummary = all.baselinePage.map((r) => ({
  id: r.id, mode: r.mode, ok: r.ok, avg: r.probe?.avg, p50: r.probe?.p50, p95: r.probe?.p95, p99: r.probe?.p99,
  worst: r.probe?.worst, longtasks: r.probe?.longtasks, frames: r.probe?.frames,
  bench: r.bench ? Object.fromEntries(r.bench.ops.map((o) => [o.name, o.bestMs])) : null,
  error: r.error,
}));

const envOut = argv.out || `${OUT}/env.json`;
const envSumOut = argv.out ? envOut.replace(/\.json$/, '') + '-summary.json' : `${OUT}/env-summary.json`;
saveJson(envOut, { ...all, summary, baseSummary });
saveJson(envSumOut, summary);
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary.map(({ allReps, ...s }) => s), null, 1));
console.log('\n=== BASELINE PAGE ===');
console.log(JSON.stringify(baseSummary, null, 1));
