/**
 * 流畅性场景：frameCap 切换 / resize / 切后台与冻结 / 2 分钟内存斜率。
 * 渲染节奏用「包装 g.render 的时间戳」测（rAF 间隔在限帧时会骗人）。
 *
 *   node tools/_pt_perf_flow.mjs [--gpu 1] [--port 9440] [--out _pt/perf/flow-soft.json] [--memSeconds 120]
 */
import { launchCfg, installProbe, readProbe, saveJson, sleep, systemInfo, webglInfo, bootStage1 } from './_pt_perf_lib.mjs';

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
const gpu = argv.gpu === '1' || argv.gpu === 'true';
const port = Number(argv.port || (gpu ? 9441 : 9440));
const outFile = argv.out || (gpu ? '_pt/perf/flow-gpu.json' : '_pt/perf/flow-soft.json');
const MEM_SECONDS = Number(argv.memSeconds || (gpu ? 120 : 60));
const OUT = '_pt/perf';

const SNAP = `(() => { const g = window.__game, st = g.stage; return {
  state: g.state, cap: g.loop.frameCap, fps: +(g.loop.fps || 0).toFixed(1), stepsPerSec: +(g.loop.stepsPerSec || 0).toFixed(1),
  stepMs: +(g.loop.lastStepMs || 0).toFixed(2), renders: g.loop.renderCount, steps: g.loop.stepCount,
  acc: +g.loop.acc.toFixed(4), last: +g.loop._last.toFixed(1),
  bullets: st && st.bullets ? st.bullets.activeCount : -1, enemies: st && st.enemies && st.enemies.list ? st.enemies.list.length : -1,
  t: +(st && st.t || 0).toFixed(3), px: Math.round(st && st.player ? st.player.x : -1), py: Math.round(st && st.player ? st.player.y : -1),
  renderer: g.renderer ? { postEnabled: g.renderer.postEnabled, postLevel: g.renderer.postLevel, bloomInterval: g.renderer.bloomInterval,
    backing: g.renderer.backing, dpr: g.renderer.dpr, scale: +g.renderer.scale.toFixed(4), canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height } : null,
  doc: { dpr: devicePixelRatio, iw: innerWidth, ih: innerHeight, vis: document.visibilityState,
    canvasCssW: g.renderer ? + (g.renderer.canvas.getBoundingClientRect().width).toFixed(1) : -1,
    canvasCssH: g.renderer ? + (g.renderer.canvas.getBoundingClientRect().height).toFixed(1) : -1 } }; })()`;

const T = await launchCfg({ port, gpu, width: 1280, height: 720, dsf: 1 });
const out = { env: gpu ? 'gpu-headless-new' : 'soft-disable-gpu', startedAt: new Date().toISOString(), suites: {}, errors: [] };
const save = () => saveJson(outFile, out);
try {
  await T.boot();
  out.webgl = await webglInfo(T);
  try { out.systemInfo = await systemInfo(port); } catch (e) { out.systemInfo = String(e); }

  // 真键盘开局（与基线 env 矩阵同路径）；音乐先关，避免 WebAudio 合成干扰帧率采样
  await T.eval('window.__game.musicOn = false');
  const boot = await bootStage1(T);
  out.boot = { skipped: boot.skipped, snap: boot.snap };
  await sleep(400);

  // 渲染节奏探针：包装 g.render 记时间戳 + 耗时
  await T.eval(`(() => {
    const g = window.__game;
    if (window.__rpInstalled) { window.__rpReset(); return 'ok'; }
    window.__rp = { ts: [], durs: [] };
    window.__rpReset = () => { window.__rp = { ts: [], durs: [] }; };
    const orig = g.render.bind(g);
    g.render = function (a) {
      const t0 = performance.now();
      const r = orig(a);
      const t1 = performance.now();
      const P = window.__rp;
      P.ts.push(t0); P.durs.push(t1 - t0);
      if (P.ts.length > 6000) { P.ts.splice(0, 3000); P.durs.splice(0, 1500); }
      return r;
    };
    window.__rpInstalled = true;
    window.__rpStats = (winMs) => {
      const P = window.__rp, ts = P.ts, ds = P.durs, now = performance.now();
      let i = ts.length - 1;
      while (i > 0 && ts[i - 1] >= now - winMs) i--;
      const seg = ts.slice(i), segD = ds.slice(i);
      if (seg.length < 3) return { frames: seg.length };
      const gaps = [];
      for (let k = 1; k < seg.length; k++) gaps.push(seg[k] - seg[k - 1]);
      const sorted = gaps.slice().sort((a, b) => a - b);
      const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))].toFixed(2);
      const ds2 = segD.slice().sort((a, b) => a - b);
      return { frames: seg.length, elapsedMs: Math.round(seg[seg.length - 1] - seg[0]),
        avg: +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2),
        p50: q(.5), p95: q(.95), p99: q(.99), worst: +Math.max(...gaps).toFixed(2),
        renderDurAvg: +(segD.reduce((a, b) => a + b, 0) / segD.length).toFixed(2),
        renderDurP95: +ds2[Math.min(ds2.length - 1, Math.floor(ds2.length * .95))].toFixed(2),
        renderDurWorst: +Math.max(...segD).toFixed(2) };
    };
    window.__rpFirstAfter = (mark) => {
      const ts = window.__rp.ts.filter((t) => t >= mark);
      if (ts.length < 2) return { frames: ts.length, gaps: [] };
      const gaps = []; for (let k = 1; k < ts.length; k++) gaps.push(+(ts[k] - ts[k - 1]).toFixed(2));
      return { frames: ts.length, firstGap: gaps[0], gaps: gaps.slice(0, 10) };
    };
    return 'installed';
  })()`);

  const snap = () => T.eval(SNAP);
  const metricsDelta = async (m0, m1, secs) => {
    if (!m0 || !m1) return null;
    const d = {};
    for (const k of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']) if (k in m1) d[k] = +((m1[k] - (m0[k] || 0)) * 1000 / secs).toFixed(1);
    return d;
  };
  const measure = async (label, ms = 2500) => {
    await T.eval('window.__rpReset()');
    await installProbe(T, true);
    const m0 = await T.metrics();
    const s0 = await snap();
    await sleep(ms);
    const render = await T.eval(`window.__rpStats(${ms + 250})`);
    const raf = await readProbe(T);
    const m1 = await T.metrics();
    const s1 = await snap();
    const rec = { label, render, raf, cdpPerSec: await metricsDelta(m0, m1, ms / 1000), state: s1,
      renderFps: s1 && s0 ? +(((s1.renders - s0.renders) / ((ms + 50) / 1000))).toFixed(1) : null };
    return rec;
  };

  /* ---------- 1) frameCap：g.loop.setFrameCap 直接改 ---------- */
  out.suites.frameCap = [];
  for (const cap of [0, 60, 120, 30]) {
    await T.eval(`window.__game.loop.setFrameCap(${cap})`);
    await sleep(350);
    const rec = await measure('cap-' + cap, 2600);
    out.suites.frameCap.push(rec);
    console.log(`[flow ${out.env}] cap=${cap} render fps=${rec.renderFps} renderAvg=${rec.render?.avg}ms rafAvg=${rec.raf.avg} long=${rec.raf.longtasks} postLevel=${rec.state.renderer?.postLevel}`);
    save();
  }
  // 音乐开/关对照（WebAudio 合成曲是否会拖帧）
  await T.eval('window.__game.loop.setFrameCap(0); window.__game.musicOn = true; window.__game.audio && window.__game.audio.setMusic?.(true)');
  await sleep(400);
  out.suites.musicOn = await measure('music-on', 2600);
  console.log(`[flow ${out.env}] musicOn render fps=${out.suites.musicOn.renderFps} avg=${out.suites.musicOn.render?.avg}`);
  await T.eval('window.__game.musicOn = false; window.__game.audio && window.__game.audio.setMusic?.(false)');

  /* ---------- 2) frameCap：走设置页 UI（Esc→S→F 循环） ---------- */
  out.suites.frameCapUI = [];
  {
    await T.key('Escape');
    await T.waitFor('window.__game.state === "paused"', 4000);
    await T.key('KeyS');
    await sleep(300);
    const uiState = await T.eval('({state: window.__game.state, title: document.getElementById("title")?.textContent, cap: window.__game.frameCap})');
    out.suites.frameCapUI.push({ uiState });
    for (let step = 0; step < 8; step++) {
      const caps = await T.eval('({app: window.__game.frameCap, loop: window.__game.loop.frameCap})');
      const rec = await measure('ui-cap-' + caps.app, 2400);
      rec.capBefore = caps;
      out.suites.frameCapUI.push(rec);
      console.log(`[flow ${out.env}] UI cap=${caps.app} render fps=${rec.renderFps} avg=${rec.render?.avg}ms long=${rec.raf.longtasks}`);
      await T.key('KeyF');
      await sleep(350);
      const next = await T.eval('window.__game.frameCap');
      if (out.suites.frameCapUI.filter((r) => r.capBefore).length >= 4) break;
    }
    await T.key('Escape'); await sleep(250);
    if ((await T.eval('window.__game.state')) === 'paused') { await T.key('Escape'); await sleep(250); }
    await T.eval('window.__game.loop.setFrameCap(0)');
    out.suites.frameCapUI.push({ afterExit: await T.eval('({state: window.__game.state, cap: window.__game.frameCap, loopCap: window.__game.loop.frameCap})') });
  }
  save();

  /* ---------- 3) resize ---------- */
  out.suites.resize = [];
  await T.eval('window.__game.loop.setFrameCap(0)');
  await sleep(300);
  for (const [w, h] of [[1280, 720], [800, 600], [1920, 1080], [320, 240], [1280, 720]]) {
    await T.setViewport(w, h, 1);
    await sleep(400);
    await T.eval('window.__rpReset()');
    await installProbe(T, true);
    const st0 = await snap();
    await sleep(1600);
    const render = await T.eval('window.__rpStats(1800)');
    const raf = await readProbe(T);
    const st1 = await snap();
    const shot = await T.shot(`${OUT}/resize-${gpu ? 'gpu' : 'soft'}-${w}x${h}.png`);
    const rec = { viewport: [w, h], shot, render, raf, state: st1, stateBefore: st0,
      canvasPx: st1.renderer ? [st1.renderer.canvasW, st1.renderer.canvasH] : null,
      cssPx: [st1.doc.canvasCssW, st1.doc.canvasCssH],
      backingRatio: st1.renderer && st1.doc.canvasCssW > 0 ? +(st1.renderer.canvasW / (st1.doc.canvasCssW * st1.doc.dpr)).toFixed(3) : null,
      blur: st1.renderer && st1.doc.canvasCssW > 0 ? (st1.renderer.canvasW < st1.doc.canvasCssW * st1.doc.dpr * 0.95 ? 'upscaled(可能糊)' : 'ok') : 'unknown' };
    out.suites.resize.push(rec);
    console.log(`[flow ${out.env}] resize ${w}x${h} renderAvg=${render.avg} worst=${render.worst} canvas=${rec.canvasPx} css=${rec.cssPx} ratio=${rec.backingRatio} ${rec.blur}`);
    save();
  }

  /* ---------- 3b) 同屏弹幕峰值（脚本注入 520 / 950，走游戏 spawn） ---------- */
  out.suites.bullets = [];
  {
    const grid = (target) => `(() => { const s = window.__game.stage;
      const have = s.bullets.activeCount; const need = Math.max(0, ${target} - have);
      const cols = Math.ceil(Math.sqrt(need * 1.6)) || 1; const rows = Math.ceil(need / cols) || 1;
      const types = [0,1,2,3,4]; const colors = ['#ff5ea8','#7fd4ff','#ffd76a','#c884ff','#8cf7a0'];
      for (let i = 0; i < need; i++) { const cx = i % cols, cy = Math.floor(i / cols);
        s.bullets.spawn({ x: -100 + (1260 / cols) * (cx + 0.5), y: -80 + (760 / rows) * (cy + 0.5),
          vx: 0, vy: 0, r: 6 + (i % 3), type: types[i % 5], color: colors[i % 5], life: 999 }); }
      return s.bullets.activeCount; })()`;
    for (const target of [520, 950]) {
      const active = await T.eval(grid(target));
      const rec = await measure('bullets-' + target, 2600);
      rec.injected = active;
      rec.bulletCount = await T.eval('window.__game.stage.bullets.activeCount');
      out.suites.bullets.push(rec);
      console.log(`[flow ${out.env}] bullets=${target} active=${rec.bulletCount} render fps=${rec.renderFps} renderAvg=${rec.render?.avg}ms rafAvg=${rec.raf.avg} p95=${rec.raf.p95} worst=${rec.raf.worst} long=${rec.raf.longtasks}`);
      save();
    }
    await T.eval('window.__game.stage.bullets.clear()');
  }

  /* ---------- 4) 切后台 / 冻结 ---------- */
  out.suites.visibility = {};
  {
    // 4a) 合成 visibilitychange（事件路径：Loop._onVisibility 会清 acc/_last）
    const rpReset = 'window.__rpReset()';
    await T.eval(rpReset);
    await installProbe(T, true);
    const before = await snap();
    await T.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); return document.visibilityState; })()`);
    await sleep(2000);
    const mid = await T.eval('({ vis: document.visibilityState, renders: window.__game.loop.renderCount, steps: window.__game.loop.stepCount, t: window.__game.stage.t, px: Math.round(window.__game.stage.player.x) })');
    await T.eval(`(() => { window.__resumeMark = performance.now(); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); return document.visibilityState; })()`);
    await sleep(1200);
    const after = await snap();
    const first = await T.eval('window.__rpFirstAfter(window.__resumeMark)');
    const rafH = await readProbe(T);
    out.suites.visibility.synthetic = {
      before, mid, after, firstAfterResume: first, raf: rafH,
      renderDelta: after.renders - before.renders, stepDelta: after.steps - before.steps,
      tDelta: +(after.t - before.t).toFixed(3),
      playerDelta: { dx: after.px - before.px, dy: after.py - before.py },
    };
    console.log(`[flow ${out.env}] vis-synthetic: firstGap=${first.firstGap} tDelta=${out.suites.visibility.synthetic.tDelta} stepDelta=${out.suites.visibility.synthetic.stepDelta}`);
    save();

    // 4b) 真冻结：Page.setWebLifecycleState frozen 2s → active
    let freezeErr = null;
    try {
      await T.eval('window.__rpReset(); window.__freezeMark = performance.now()');
      await T.send('Page.enable');
      await T.send('Page.setWebLifecycleState', { state: 'frozen' });
      await sleep(2000);
      await T.send('Page.setWebLifecycleState', { state: 'active' });
      await sleep(50);
      await T.eval('window.__resumeMark = performance.now()');
      const first = await T.eval('window.__rpFirstAfter(window.__freezeMark)');
      await sleep(1000);
      const post = await T.eval(`(() => { const g = window.__game, st = g.stage; return { renders: g.loop.renderCount, steps: g.loop.stepCount, acc: +g.loop.acc.toFixed(3), t: +st.t.toFixed(3), px: Math.round(st.player.x), vis: document.visibilityState }; })()`);
      const render = await T.eval('window.__rpStats(1600)');
      out.suites.visibility.frozen = {
        firstAfterFreeze: first, post, render, freezeErr,
        stepsInResumeWindow: post.steps - first.steps,
        note: 'Page.setWebLifecycleState(frozen) 期间页面主线程停摆；回 active 后是否一次补多步/跳帧看 steps 与 t',
      };
      console.log(`[flow ${out.env}] vis-frozen: gaps=${JSON.stringify(first.gaps)} steps=${post.steps} renderAvg=${render.avg}`);
    } catch (e) {
      freezeErr = String(e).slice(0, 300);
      out.suites.visibility.frozen = { freezeErr };
      console.log('[flow] freeze failed:', freezeErr);
    }
    // 4c) 失焦：Emulation.setFocusEmulationEnabled(false)（模拟窗口失焦，页面仍可见）
    try {
      await T.send('Emulation.setFocusEmulationEnabled', { enabled: false });
      await sleep(1200);
      await T.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      out.suites.visibility.focus = await measure('after-focus-toggle', 1800);
      console.log(`[flow ${out.env}] focus-toggle render fps=${out.suites.visibility.focus.renderFps}`);
    } catch (e) { out.suites.visibility.focus = { error: String(e).slice(0, 200) }; }
    save();
  }

  /* ---------- 5) 2 分钟内存斜率 ---------- */
  out.suites.memory = { seconds: MEM_SECONDS, samples: [] };
  {
    try { await T.send('HeapProfiler.enable'); await T.send('HeapProfiler.collectGarbage'); } catch (e) {}
    const sBegin = await snap();
    // 持续按住 → + Z，让关卡真正在跑（滚动、敌人、弹幕、粒子）
    await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
    for (let i = 0; i * 10 <= MEM_SECONDS; i++) {
      const s = await T.eval(`(() => { const g = window.__game, st = g.stage, m = performance.memory || {};
        return { now: performance.now(), used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit,
          bullets: st && st.bullets ? st.bullets.activeCount : -1,
          enemies: st && st.enemies && st.enemies.list ? st.enemies.list.length : -1,
          shots: st && st.shots && st.shots.pool ? st.shots.pool.filter((b) => b.active).length : -1,
          renders: g.loop.renderCount, steps: g.loop.stepCount, t: +(st && st.t || 0).toFixed(2),
          px: Math.round(st && st.player ? st.player.x : -1),
          postLevel: g.renderer ? g.renderer.postLevel : -1 }; })()`);
      out.suites.memory.samples.push(s);
      console.log(`[flow ${out.env}] mem t=${(s.now / 1000).toFixed(0)}s used=${Math.round(s.used / 1024)}KB bullets=${s.bullets} enemies=${s.enemies} px=${s.px}`);
      if (i * 10 < MEM_SECONDS) { await sleep(10000); }
    }
    await T.keyUp('KeyZ'); await T.keyUp('ArrowRight');
    try { await T.send('HeapProfiler.collectGarbage'); } catch (e) {}
    const sEndGc = await T.eval('(() => { const m = performance.memory || {}; return { used: m.usedJSHeapSize, total: m.totalJSHeapSize }; })()');
    out.suites.memory.begin = sBegin;
    out.suites.memory.afterGc = sEndGc;
    // 线性回归斜率（KB/s），用页面 performance.now 的毫秒做自变量
    const samples = out.suites.memory.samples.filter((s) => s.used > 0);
    if (samples.length >= 3) {
      const t0 = samples[0].now;
      const xs = samples.map((s) => (s.now - t0) / 1000);
      const ys = samples.map((s) => s.used / 1024);
      const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
      out.suites.memory.slopeKBps = den ? +(num / den).toFixed(2) : null;
      out.suites.memory.peakKB = Math.max(...ys) | 0;
      out.suites.memory.firstKB = Math.round(ys[0]);
      out.suites.memory.lastKB = Math.round(ys[n - 1]);
      out.suites.memory.afterGcKB = Math.round(out.suites.memory.afterGc.used / 1024);
    }
    console.log(`[flow ${out.env}] memory slope=${out.suites.memory.slopeKBps}KB/s first=${out.suites.memory.firstKB}KB last=${out.suites.memory.lastKB}KB afterGC=${out.suites.memory.afterGcKB}KB`);
    save();
  }
  out.errors = T.errors.slice(0, 10);
  out.ok = true;
} catch (e) {
  out.fatal = String((e && e.stack) || e).slice(0, 900);
  out.errors = T.errors.slice(0, 10);
  console.log('[flow] fatal:', out.fatal);
} finally {
  save();
  await T.close().catch(() => {});
  console.log('[flow] saved', outFile);
}
