/**
 * 菜单切场景尖峰归因：量场景底图 decode、DOM 构建、音频首启，看 114ms 长任务落在哪。
 *   node tools/_pt_fix34_menu.mjs [--gpu 1] [--port 9486]
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
const port = Number(argv.port || 9486);
const outFile = argv.out || `_pt/fix34/menu-${gpu ? 'gpu' : 'soft'}.json`;

const T = await launchCfg({ port, gpu, width: 1280, height: 720, dsf: 1 });
const rec = { generatedAt: new Date().toISOString(), gpu, out: {} };
try {
  await T.boot();
  await sleep(300);
  if (argv['no-bf'] === '1') {
    await T.eval(`(() => { const s = document.createElement('style'); s.textContent = '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'; document.head.appendChild(s); return 1; })()`);
    console.log('[menu] injected backdrop-filter:none');
  }

  // 1) 场景底图 decode 成本（逐个场景、冷/热）
  rec.out.decode = await T.eval(`(async () => {
    const base = new URL('/src/art/gen/bg/', location.href);
    const names = ['shrine', 'mountain', 'forest', 'mansion', 'moon'];
    const out = {};
    for (const n of names) {
      const img = new Image();
      img.src = new URL(n + '.jpg', base).href;
      const t0 = performance.now();
      try { await img.decode(); } catch (e) {}
      out[n] = { ms: +(performance.now() - t0).toFixed(1), w: img.naturalWidth, h: img.naturalHeight };
    }
    return out;
  })()`);
  console.log('[menu] decode:', JSON.stringify(rec.out.decode));

  // 2) 模拟「标题 → 选择难度」这一段，分项计时
  rec.out.instrumented = await T.eval(`(() => {
    const g = window.__game;
    const S = { long: [], phases: [] };
    window.__m = S;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) S.long.push(Math.round(e.duration)); })
        .observe({ entryTypes: ['longtask'] });
    } catch (e) {}
    const wrap = (name, fn) => {
      const orig = g[fn];
      if (typeof orig !== 'function') return;
      g[fn] = function (...a) {
        const t0 = performance.now();
        try { return orig.apply(this, a); } finally {
          const d = +(performance.now() - t0).toFixed(2);
          if (d > 2) S.phases.push(name + '=' + d);
        }
      };
    };
    wrap('setPanel', '_setPanel');
    wrap('applyScene', '_applyScene');
    wrap('showDifficulty', 'showDifficultySelect');
    wrap('showTitle', 'showTitle');
    wrap('audioPlay', 'audio');
    return 'ok';
  })()`);

  await T.key('Enter');
  await sleep(900);
  rec.out.firstOpen = await T.eval(`(() => { const s = window.__m; return { long: s.long.slice(), phases: s.phases.slice() }; })()`);
  console.log('[menu] first open difficulty:', JSON.stringify(rec.out.firstOpen));

  await T.key('Escape');
  await sleep(700);
  await T.eval('(() => { const s = window.__m; s.long.length = 0; s.phases.length = 0; return 1; })()');
  await T.key('Enter');
  await sleep(900);
  rec.out.secondOpen = await T.eval(`(() => { const s = window.__m; return { long: s.long.slice(), phases: s.phases.slice() }; })()`);
  console.log('[menu] second open difficulty:', JSON.stringify(rec.out.secondOpen));

  // 3) 音频首启成本（AudioContext 创建 + 首曲解码）
  rec.out.audio = await T.eval(`(async () => {
    const a = window.__game.audio;
    const t0 = performance.now();
    try { a.play?.('menu'); } catch (e) {}
    const t1 = performance.now();
    await new Promise((r) => setTimeout(r, 600));
    return { playMs: +(t1 - t0).toFixed(2), ctx: !!a.ctx, musicOn: a.musicOn !== false };
  })()`);
  console.log('[menu] audio:', JSON.stringify(rec.out.audio));

  rec.errors = T.errors.slice(0, 8);
} catch (e) {
  rec.error = String((e && e.stack) || e).slice(0, 1200);
  console.log('[menu] ERROR', rec.error);
} finally {
  saveJson(outFile, rec);
  console.log('[menu] wrote', outFile);
  await T.close().catch(() => {});
}
