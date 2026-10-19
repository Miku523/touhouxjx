/**
 * 第 4 项（首帧/切场景尖峰）测量：注入大量弹幕，分离「首帧烘焙」与「稳态帧」。
 * 只读游戏状态 + 手动调用 g.render()，不改任何游戏代码。
 *
 *   node tools/_pt_fix34_perf.mjs [--gpu 1] [--port 9480] [--out _pt/fix34/perf-gpu.json]
 */
import { launchCfg, bootStage1, installProbe, readProbe, saveJson, sleep } from './_pt_perf_lib.mjs';

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
const port = Number(argv.port || (gpu ? 9481 : 9480));
const outFile = argv.out || `_pt/fix34/perf-${gpu ? 'gpu' : 'soft'}.json`;
const OUT = '_pt/fix34';

/* 真实对局里出现过的弹幕配色（从 src/game 统计出来的高频色），按 perf flow 的注入法铺满全场 */
const COLORS = ['#ff5ea8', '#7fd4ff', '#ffd76a', '#c884ff', '#8cf7a0', '#ffffff', '#ff4d6a', '#ffe9b0'];

const inject = (target, cols) => `(() => {
  const g = window.__game, s = g.stage;
  s.bullets.clear?.();
  const need = ${target};
  const cx = ${cols};
  const types = [0,1,2,3,4];
  const colors = ${JSON.stringify(COLORS)};
  for (let i = 0; i < need; i++) {
    const col = i % cx, row = Math.floor(i / cx);
    s.bullets.spawn({
      x: -100 + (1260 / cx) * (col + 0.5), y: -80 + (760 / Math.ceil(need / cx)) * (row + 0.5),
      vx: 0, vy: 0, r: 5 + (i % 4), type: types[i % 5], color: colors[i % colors.length], life: 999,
    });
  }
  return s.bullets.activeCount;
})()`;

/** 逐帧计时（手动 g.render），返回第 1/2/3 帧和稳态 */
const renderTiming = (frames = 6) => `(() => {
  const g = window.__game;
  const out = [];
  for (let i = 0; i < ${frames}; i++) {
    const t0 = performance.now();
    g.render(0.5);
    out.push(+(performance.now() - t0).toFixed(2));
  }
  const r = g.renderer;
  return { frames: out, renderer: { postLevel: r.postLevel, quality: r.quality, backing: +r.backing.toFixed(3) },
    bullets: g.stage.bullets.activeCount };
})()`;

const T = await launchCfg({ port, gpu, width: 1280, height: 720, dsf: 1 });
const rec = { generatedAt: new Date().toISOString(), gpu, port, cases: [], errors: [] };
try {
  await T.boot();
  await bootStage1(T);
  const info = await T.eval('window.__rendererInfo || null');
  rec.rendererInfo = info;
  console.log('[fix34] renderer:', JSON.stringify(info));

  for (const target of [520, 950]) {
    // 1) 清场后先渲染 3 帧，保证相机/场景缓存稳定
    await T.eval(`(() => { window.__game.stage.bullets.clear?.(); window.__game.render(0.5); return 1; })()`);
    await sleep(120);
    const active = await T.eval(inject(target, Math.ceil(Math.sqrt(target * 1.6))));
    const warmBefore = await T.eval(`(() => { const a = performance.now(); window.__game.render(0.5); return +(performance.now() - a).toFixed(2); })()`);
    const timings = await T.eval(renderTiming(6));
    const rec2 = { target, active, preFrameMs: warmBefore, ...timings };
    rec.cases.push(rec2);
    console.log(`[fix34] inject ${target} active=${active} first=${timings.frames[0]}ms then=[${timings.frames.slice(1).join(',')}] bullets=${timings.bullets}`);
  }

  // 2) 真实 rAF 下的首帧尖峰（注入后不手动 render，让循环自己跑）
  await T.eval(`(() => { window.__game.stage.bullets.clear?.(); return 1; })()`);
  await installProbe(T, true);
  await T.eval(inject(520, 29));
  await sleep(2600);
  rec.rafAfterInject = await readProbe(T);
  console.log('[fix34] rAF after inject520:', JSON.stringify(rec.rafAfterInject));
  await T.eval('window.__game.stage.bullets.clear()');
  await T.shot(`${OUT}/fix34-${gpu ? 'gpu' : 'soft'}-520.png`).catch(() => {});
  rec.errors = T.errors.slice(0, 8);
} catch (e) {
  rec.error = String((e && e.stack) || e).slice(0, 1200);
  console.log('[fix34] ERROR', rec.error);
} finally {
  saveJson(outFile, rec);
  console.log('[fix34] wrote', outFile);
  await T.close().catch(() => {});
}
