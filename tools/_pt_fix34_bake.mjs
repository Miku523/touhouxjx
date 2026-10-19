/**
 * 弹幕精灵烘焙微基准：在标题页（弹幕缓存必然为空）直接构造 BulletPool 并 draw，
 * 分离「首帧烘焙成本」与「缓存后的稳态成本」。只读游戏代码，不改任何东西。
 *
 *   node tools/_pt_fix34_bake.mjs [--gpu 1] [--port 9490] [--out _pt/fix34/bake-gpu.json]
 */
import { launchCfg, saveJson, sleep } from './_pt_perf_lib.mjs';

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
const port = Number(argv.port || (gpu ? 9491 : 9490));
const outFile = argv.out || `_pt/fix34/bake-${gpu ? 'gpu' : 'soft'}.json`;

/* 与 perf flow 注入完全相同的一组 (type,color,size) 组合：5 色 × 3 半径 × 5 型 = 75 个变体 */
const BENCH = (n, colors, sizes) => `(async () => {
  const m = await import('/src/game/bullets.js?bench=' + Date.now());
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const ctx = c.getContext('2d');
  const pool = new m.BulletPool(1400);
  const colors = ${JSON.stringify(colors)};
  const sizes = ${JSON.stringify(sizes)};
  const types = [0, 1, 2, 3, 4];
  for (let i = 0; i < ${n}; i++) {
    pool.spawn({
      x: 40 + (i % 26) * 46, y: 40 + Math.floor(i / 26) * 34,
      vx: 0, vy: 0, r: sizes[i % sizes.length], type: types[i % 5], color: colors[i % colors.length], life: 999,
    });
  }
  const runs = [];
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    pool.draw(ctx, { x: 0, y: 0 });
    runs.push(+(performance.now() - t0).toFixed(2));
  }
  const timings = [];
  for (const r of runs) timings.push(r);
  return { count: pool.activeCount, runs: timings, warm: [runs[0]] };
})()`;

const T = await launchCfg({ port, gpu, width: 1280, height: 720, dsf: 1 });
const rec = { generatedAt: new Date().toISOString(), gpu, cases: [] };
try {
  await T.boot();
  await sleep(400);
  // 标题页：缓存必空。重复两次导入（第二次靠 ES module cache，变体已在缓存里）
  const first = await T.eval(BENCH(520, ['#ff5ea8', '#7fd4ff', '#ffd76a', '#c884ff', '#8cf7a0'], [6, 7, 8]));
  rec.cases.push({ label: 'cold-520-75variants', ...first });
  console.log('[bake] cold 520:', JSON.stringify(first));

  const second = await T.eval(BENCH(520, ['#ff5ea8', '#7fd4ff', '#ffd76a', '#c884ff', '#8cf7a0'], [6, 7, 8]));
  rec.cases.push({ label: 'warm-520-75variants', ...second });
  console.log('[bake] warm 520:', JSON.stringify(second));

  const wide = await T.eval(BENCH(520, ['#ff5ea8', '#7fd4ff', '#ffd76a', '#c884ff', '#8cf7a0', '#ffffff', '#ff4d6a', '#ffe9b0'], [4, 5, 6, 7, 8, 9, 10, 12]));
  rec.cases.push({ label: 'cold-520-wide-variants', ...wide });
  console.log('[bake] wide 520:', JSON.stringify(wide));

  rec.errors = T.errors.slice(0, 8);
} catch (e) {
  rec.error = String((e && e.stack) || e).slice(0, 1500);
  console.log('[bake] ERROR', rec.error);
} finally {
  saveJson(outFile, rec);
  console.log('[bake] wrote', outFile);
  await T.close().catch(() => {});
}
