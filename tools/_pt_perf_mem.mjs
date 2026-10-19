/** 补充采样：站桩时 heapUsed / total / DOM 元素数 / canvas 数，每 5s 一次，共 20s。
 * 只用于回答「60s 内存长跑里 DOM 是否单调增长」；不改源码。
 *   node tools/_pt_perf_mem.mjs [--port 9450] [--seconds 20]
 */
import { launchCfg, saveJson, sleep, bootStage1 } from './_pt_perf_lib.mjs';

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
const port = Number(argv.port || 9450);
const seconds = Number(argv.seconds || 20);
const T = await launchCfg({ port, gpu: true, width: 1280, height: 720, dsf: 1 });
const out = { startedAt: new Date().toISOString(), seconds, samples: [], errors: [] };
try {
  await T.boot();
  await T.eval('window.__game.musicOn = false');
  await bootStage1(T);
  const sample = async (label) => {
    const raw = await T.eval(`JSON.stringify((() => {
      const g = window.__game, st = g.stage, m = performance.memory || {};
      return {
        label: ${JSON.stringify(label)},
        usedKB: m.usedJSHeapSize ? Math.round(m.usedJSHeapSize / 1024) : null,
        totalKB: m.totalJSHeapSize ? Math.round(m.totalJSHeapSize / 1024) : null,
        elements: document.getElementsByTagName('*').length,
        canvases: document.querySelectorAll('canvas').length,
        children: document.body.children.length,
        bullets: st && st.bullets ? st.bullets.activeCount : -1,
        enemies: st && st.enemies && st.enemies.list ? st.enemies.list.length : -1,
        shots: st && st.shots ? (st.shots.list ? st.shots.list.length : -1) : -1,
        fx: st && st.fx ? (st.fx.list ? st.fx.list.length : -1) : -1,
        fps: +(g.loop.fps || 0).toFixed(1), stepsPerSec: +(g.loop.stepsPerSec || 0).toFixed(1),
        px: st && st.player ? Math.round(st.player.x) : null,
      };
    })())`);
    return JSON.parse(raw);
  };
  out.samples.push(await sample('t0'));
  for (let i = 1; i <= Math.floor(seconds / 5); i++) {
    await sleep(5000);
    out.samples.push(await sample('t' + i * 5 + 's'));
  }
  // 停顿式收尾：强制 GC 后再采一次
  try {
    await T.send('HeapProfiler.enable');
    await T.send('HeapProfiler.collectGarbage');
  } catch (e) { out.errors.push('gc: ' + String(e).slice(0, 120)); }
  await sleep(300);
  out.afterGc = await sample('after-gc');
  out.domDelta = out.afterGc.elements - out.samples[0].elements;
  out.canvasDelta = out.afterGc.canvases - out.samples[0].canvases;
} catch (e) {
  out.errors.push(String((e && e.stack) || e).slice(0, 600));
} finally {
  saveJson('_pt/perf/mem-dom-20s.json', out);
  console.log('[mem] samples:', out.samples.map((s) => `${s.label} used=${s.usedKB}KB total=${s.totalKB}KB dom=${s.elements} canvas=${s.canvases} b=${s.bullets} e=${s.enemies} shots=${s.shots} fps=${s.fps}`).join(' | '));
  console.log('[mem] domDelta=', out.domDelta, 'canvasDelta=', out.canvasDelta, 'afterGc=', JSON.stringify(out.afterGc));
  console.log('[mem] errors:', out.errors);
  await T.close().catch(() => {});
}
