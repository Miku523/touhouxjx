/**
 * 验证「软光栅自动降档」优化：多分辨率/DPI 截图 + 探针 + __rendererInfo + 404/JS 异常。
 *   node tools/_pt_perf_verify_opt.mjs [--port 9460] [--out _pt/perf/opt-verify.json]
 * 只在 renderer.js 内做降档，不改任何游戏逻辑。
 */
import { launchCfg, bootStage1, installProbe, readProbe, saveJson, sleep, snap } from './_pt_perf_lib.mjs';
import { readFileSync } from 'node:fs';

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
const OUT_FILE = argv.out || `${OUT}/opt-verify.json`;
let port = Number(argv.port || 9460);

const CASES = [
  { id: 'soft-1280x720', gpu: false, width: 1280, height: 720, dsf: 1, resize: true },
  { id: 'soft-960x540', gpu: false, width: 960, height: 540, dsf: 1 },
  { id: 'soft-1920x1080', gpu: false, width: 1920, height: 1080, dsf: 1 },
  { id: 'soft-dsf2', gpu: false, width: 1280, height: 720, dsf: 2 },
  { id: 'gpu-1280x720', gpu: true, width: 1280, height: 720, dsf: 1, resize: true },
];

async function runCase(c) {
  const T = await launchCfg({ ...c, port: port++ });
  const rec = { id: c.id, cfg: { gpu: c.gpu, w: c.width, h: c.height, dsf: c.dsf }, ok: false, shots: [], errors: [] };
  try {
    const booted = await T.boot();   // boot 只等机器可交互前的 index 加载；bootStage1 负责真键盘进关
    if (!booted) throw new Error('boot failed');
    await bootStage1(T);
    await installProbe(T, true);
    await sleep(200);
    rec.info = await T.eval('window.__rendererInfo || null');
    rec.snap1 = await snap(T);
    await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
    await sleep(2500);
    await T.keyUp('KeyZ'); await T.keyUp('ArrowRight');
    rec.probe = await readProbe(T);
    rec.shot = await T.shot(`${OUT}/opt-${c.id}.png`);
    rec.shots.push(rec.shot);
    if (c.resize) {
      for (const [w, h] of [[800, 600], [320, 240], [1280, 720]]) {
        await T.setViewport(w, h, 1);
        await sleep(450);
        rec.shots.push(await T.shot(`${OUT}/opt-${c.id}-resize-${w}x${h}.png`));
      }
      await T.setViewport(c.width, c.height, c.dsf);
      await sleep(300);
      rec.infoAfterResize = await T.eval('window.__rendererInfo || null');
    }
    rec.resourceErrors = await T.eval(`(() => {
      try {
        return performance.getEntriesByType('resource')
          .filter((e) => e.responseStatus >= 400)
          .map((e) => e.name + ':' + e.responseStatus).slice(0, 20);
      } catch (e) { return ['probe-fail:' + e]; }
    })()`);
    rec.pageErrors = (T.errors || []).slice(0, 10);
    rec.ok = !rec.pageErrors.length;
    return rec;
  } catch (e) {
    rec.error = String((e && e.stack) || e).slice(0, 800);
    rec.pageErrors = (T.errors || []).slice(0, 10);
    return rec;
  } finally {
    await T.close().catch(() => {});
  }
}

const results = [];
const only = argv.cases ? argv.cases.split(',').map((s) => s.trim()) : null;
for (const c of CASES.filter((c) => !only || only.includes(c.id))) {
  let r = await runCase(c).catch((e) => ({ id: c.id, ok: false, error: String(e) }));
  if (!r.ok && !r.error) r = await runCase(c).catch((e) => ({ id: c.id, ok: false, error: String(e) })); // 并发负载下偶发启动失败，重试一次
  results.push(r);
  console.log(`[opt] ${r.id} ${r.ok ? `avg=${r.probe?.avg}ms p95=${r.probe?.p95} long=${r.probe?.longtasks} info=${JSON.stringify(r.info)}` : 'FAIL ' + r.error}`);
}
saveJson(OUT_FILE, { generatedAt: new Date().toISOString(), results: mergePrev(results) });
console.log('[opt] wrote', OUT_FILE);

/** 只跑单个 case 时保留之前的结果（--cases=gpu-1280x720） */
function mergePrev(cur) {
  try {
    const prev = JSON.parse(readFileSync(OUT_FILE, 'utf8')).results || [];
    return prev.filter((p) => !cur.some((r) => r.id === p.id)).concat(cur);
  } catch (e) {
    return cur;
  }
}
