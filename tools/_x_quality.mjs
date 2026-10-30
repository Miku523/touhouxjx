/** 自适应画质行为：模拟「能跑 WebGL 的弱 GPU」逼出 bloom 降级/恢复，看是否振荡。 */
import { launchCfg, sleep, saveJson, installProbe, readProbe } from './_pt_perf_lib.mjs';

const OUT = 'tools/_pt/';
const SAMPLE = `(() => {
  const g = window.__game, r = g.renderer;
  const s = g.stage;
  return {
    t: Math.round(performance.now()), postLevel: r.postLevel, lowSpec: r.lowSpec, autoDegrade: r.autoDegrade,
    interval: r.bloomInterval, ema: +(r.bloomEmaMs || 0).toFixed(2), warm: r._bloomWarm, idle: r._bloomIdle,
    retry: r._bloomRetry, retryAt: Math.round(r._bloomRetryAt), stable: Math.round(r._bloomStable || 0),
    skipPost: r.skipPost, backing: r.backing, cw: r.canvas.width, ch: r.canvas.height,
    quality: r.quality, fps: +(g.loop.fps || 0).toFixed(1),
    bullets: s && s.bullets ? s.bullets.count() : null,
  };
})()`;

async function run(key, gpu, port, weakSim) {
  const T = await launchCfg({ port, gpu, width: 1280, height: 720, headless: true });
  const out = { key, weakSim, samples: [], transitions: [], windows: [], errors: [] };
  try {
    await T.boot();
    await T.waitFor('window.__game._bootDone === true', 20000);
    await sleep(400);
    if (weakSim) {
      out.patch = await T.eval(`(() => { const g = window.__game, r = g.renderer;
        r.softwareRaster = false; r.lowSpec = false; r.autoDegrade = true; r.quality = 'auto';
        r.postLevel = 2; r._bloomWarm = 0; r._bloomTick = 0; r._bloomDirty = true;
        r.bloomEmaMs = 0; r.bloomInterval = 1; r._bloomIdle = 0; r._bloomRetry = 0;
        r._bloomRetryAt = 0; r._bloomStable = 0; r._lastPresent = 0; r._grainPattern = null;
        r.fit(); return window.__rendererInfo; })()`);
      await sleep(300);
    }
    out.rinfo0 = await T.eval('window.__rendererInfo');
    // 进 Extra 密集战（有 Z 键射击），持续观察 40s
    await T.eval(`(() => { const g = window.__game; g.showTitle(); g._startExtraStage({ chainFrom: 3 }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; return { mode: s.mode, boss: s.boss && s.boss.key }; })()`);
    await T.keyDown('KeyZ');
    let prev = null;
    const t0 = Date.now();
    let winStart = Date.now();
    await installProbe(T);
    while (Date.now() - t0 < 40000) {
      await sleep(250);
      const smp = await T.eval(SAMPLE);
      out.samples.push(smp);
      if (prev && (prev.postLevel !== smp.postLevel || prev.interval !== smp.interval || prev.retry !== smp.retry)) {
        out.transitions.push({ at: Date.now() - t0, from: { postLevel: prev.postLevel, interval: prev.interval, retry: prev.retry, ema: prev.ema }, to: { postLevel: smp.postLevel, interval: smp.interval, retry: smp.retry, ema: smp.ema } });
        console.log('  ' + key + ' transition @' + (Date.now() - t0) + 'ms', JSON.stringify(out.transitions[out.transitions.length - 1]));
      }
      prev = smp;
      if (Date.now() - winStart >= 5000) {
        const pr = await readProbe(T);
        out.windows.push({ t: Date.now() - t0, avg: pr.avg, p50: pr.p50, p95: pr.p95, worst: pr.worst, over33: pr.over33, over50: pr.over50, longMax: pr.longMax, postLevel: smp.postLevel });
        await installProbe(T);
        winStart = Date.now();
      }
    }
    await T.keyUp('KeyZ');
    out.rinfoEnd = await T.eval('window.__rendererInfo');
    out.sampleCount = out.samples.length;
  } catch (e) {
    out.errors.push(String(e).slice(0, 500));
    console.log('!! ' + key, String(e).slice(0, 400));
  } finally {
    saveJson(OUT + 'perf_quality_' + key + '.json', out);
    try { await T.close(); } catch {}
  }
  return out;
}

const res = {};
res.weakSim = await run('soft-weakSim', false, 9469, true);
res.gpuControl = await run('gpu-control', true, 9470, false);
saveJson(OUT + 'perf_quality_summary.json', res);
console.log('DONE quality', JSON.stringify({ weakTransitions: res.weakSim.transitions.length, gpuTransitions: res.gpuControl.transitions.length }));
