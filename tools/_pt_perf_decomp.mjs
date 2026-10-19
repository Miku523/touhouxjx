/**
 * 渲染耗时拆分：手动串行 g.render(0.5) 计时 + ctx 原型 op 计数/计时 + 分层 hook。
 * 场景：标题 / 道中空场 / 道中实战 / Boss 战 / 同屏 520、950 弹幕 / 强制 bloom。
 *
 *   node tools/_pt_perf_decomp.mjs [--gpu 1] [--port 9430] [--out _pt/perf/decomp-soft.json]
 */
import { launchCfg, systemInfo, saveJson, sleep } from './_pt_perf_lib.mjs';

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
const port = Number(argv.port || (gpu ? 9431 : 9430));
const outFile = argv.out || (gpu ? '_pt/perf/decomp-gpu.json' : '_pt/perf/decomp-soft.json');

const T = await launchCfg({ port, gpu, width: 1280, height: 720, dsf: 1 });
try {
  const t0 = Date.now();
  await T.boot();
  const bootMs = Date.now() - t0;
  console.log(`[decomp] gpu=${gpu} boot ${bootMs}ms port ${port}`);
  const raw = await T.eval(
    `(async () => { const m = await import('/_pt/perf/decomp-page.js?t=' + Date.now()); const r = await m.run(); return JSON.stringify(r); })()`,
    { timeout: 420000 },
  );
  const result = JSON.parse(raw);
  result.bootMs = bootMs;
  result.cfg = { gpu, width: 1280, height: 720, dsf: 1, headless: true };
  try { result.systemInfo = await systemInfo(port); } catch (e) { result.systemInfo = String(e); }
  result.errors = [...(result.errors || []), ...T.errors.slice(0, 8)];
  saveJson(outFile, result);
  console.log('[decomp] scenes:', result.scenes.map((s) => `${s.name}: clean=${s.clean?.avg}ms p95=${s.clean?.p95} err=${s.error ? 'YES' : ''}`).join(' | '));
  if (result.errors.length) console.log('[decomp] errors:', result.errors.slice(0, 3));
  for (const s of result.scenes) if (s.error) console.log('[decomp] scene error', s.name, ':', String(s.error).slice(0, 240));
  if (result.hooks && result.hooks[0]) console.log('[decomp] hooks miss:', JSON.stringify(result.hooks[0].miss));
  for (const s of result.scenes) {
    if (s.layers && s.layers.length) console.log('[decomp]', s.name, 'layers:', s.layers.slice(0, 5).map((l) => `${l.name}=${l.msPerFrame}ms/${l.callsPerFrame}c`).join(' '), '| ops:', (s.opsTop || []).slice(0, 4).map((o) => `${o.op}=${o.msPerFrame}ms`).join(' '));
  }
  console.log('[decomp] saved', outFile);
} finally {
  await T.close().catch(() => {});
}
