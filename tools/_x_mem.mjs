/** 90s 内存/GC/分配采样 + 场景切换泄漏检查（gpu + soft） */
import { launchCfg, sleep, saveJson, installProbe, readProbe } from './_pt_perf_lib.mjs';

const OUT = 'tools/_pt/';

function topAlloc(profile, limit = 18) {
  const agg = new Map();
  const walk = (node) => {
    const cf = node.callFrame || {};
    const size = node.selfSize || 0;
    if (size > 0) {
      const key = (cf.functionName || '(anon)') + ' @ ' + (cf.url || '').split('/').slice(-2).join('/') + ':' + (cf.lineNumber + 1);
      agg.set(key, (agg.get(key) || 0) + size);
    }
    for (const c of node.children || []) walk(c);
  };
  if (profile && profile.head) walk(profile.head);
  return [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k, v]) => ({ site: k, kb: Math.round(v / 1024) }));
}

async function run(key, gpu, port) {
  const T = await launchCfg({ port, gpu, width: 1280, height: 720, headless: true, extraArgs: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const out = { key, samples: [], windows: [], transitions: [], errors: [] };
  try {
    await T.boot();
    await T.waitFor('window.__game._bootDone === true', 20000);
    await sleep(500);
    await T.send('HeapProfiler.enable');
    await T.send('HeapProfiler.collectGarbage');
    out.heap0 = await T.eval('performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null');
    out.metrics0 = await T.metrics();
    // 标题空闲 10s 基线抖动
    await installProbe(T);
    await sleep(10000);
    out.idle = await readProbe(T);
    // 进入 Extra 密集战
    await T.eval(`(() => { const g = window.__game; g.showTitle(); g._startExtraStage({ chainFrom: 3 }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; return { mode: s.mode }; })()`);
    await T.keyDown('KeyZ');
    await sleep(4000);
    await T.send('HeapProfiler.collectGarbage');
    out.heapA = await T.eval('performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null');
    await T.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: false, includeObjectsCollectedByMinorGC: false });
    const t0 = Date.now();
    let winStart = Date.now();
    await installProbe(T);
    while (Date.now() - t0 < 90000) {
      await sleep(1000);
      const smp = await T.eval(`(() => { const g = window.__game, s = g.stage; const m = performance.memory; return {
        t: Math.round(performance.now()), used: m ? m.usedJSHeapSize : null, total: m ? m.totalJSHeapSize : null,
        fps: +(g.loop.fps || 0).toFixed(1), bullets: s && s.bullets ? s.bullets.count() : null,
        enemies: s && s.enemies && s.enemies.list ? s.enemies.list.length : null,
        fx: (() => { try { return s && s.fx && s.fx.parts ? s.fx.parts.length : null; } catch (e) { return null; } })(),
        stepMs: +(g.loop.lastStepMs || 0).toFixed(2),
      }; })()`);
      out.samples.push(smp);
      if (Date.now() - winStart >= 10000) {
        const pr = await readProbe(T);
        out.windows.push({ t: Math.round(smp.t), avg: pr.avg, p50: pr.p50, p95: pr.p95, worst: pr.worst, over33: pr.over33, longMax: pr.longMax, longtasks: pr.longtasks, used: smp.used });
        await installProbe(T);
        winStart = Date.now();
      }
    }
    await T.keyUp('KeyZ');
    const prof = await T.send('HeapProfiler.stopSampling');
    out.topAlloc = topAlloc(prof && prof.profile);
    await T.send('HeapProfiler.collectGarbage');
    out.heapB = await T.eval('performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null');
    out.metrics1 = await T.metrics();
    // 场景切换 12 次：看 DOM 节点 / 监听器 / 堆保留增长
    const before = await T.metrics();
    for (let i = 0; i < 12; i++) {
      await T.eval(`(() => { const g = window.__game; g.showTitle(); g.startStage(0 + 0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; return 1; })()`);
      await sleep(250);
    }
    await T.eval('(() => { window.__game.showTitle(); return 1; })()');
    await sleep(500);
    await T.send('HeapProfiler.collectGarbage');
    const after = await T.metrics();
    out.transitions = { nodesDelta: Math.round((after.Nodes || 0) - (before.Nodes || 0)), listenersDelta: Math.round((after.JSEventListeners || 0) - (before.JSEventListeners || 0)), docsDelta: Math.round((after.Documents || 0) - (before.Documents || 0)), heapDeltaKB: out.heapA && out.heapB ? Math.round((out.heapB.used - out.heapA.used) / 1024) : null };
    out.errors.push(...T.errors.slice(0, 3));
  } catch (e) {
    out.errors.push(String(e).slice(0, 600));
    console.log('!! ' + key, String(e).slice(0, 400));
  } finally {
    saveJson(OUT + 'perf_mem_' + key + '.json', out);
    try { await T.close(); } catch {}
  }
  return out;
}

const res = {};
res.gpu = await run('gpu', true, 9464);
res.soft = await run('soft', false, 9465);
saveJson(OUT + 'perf_mem_summary.json', res);
console.log('DONE mem');
