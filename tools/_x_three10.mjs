/**
 * 10 秒三场景（标题 / 第一关道中 / 第一关 BOSS）——Lead 指定口径
 * 只读 src；软光栅 + GPU 两档，顺序执行。
 */
import { launchCfg, installProbe, readProbe, sleep, saveJson } from './_pt_perf_lib.mjs';

const OUT = 'tools/_pt/';
const SCENE_MS = 10000;
const SETTLE_MS = 2500;
const CFGS = [
  { key: 'soft-1280', gpu: false, port: 9467 },
  { key: 'gpu-1280', gpu: true, port: 9468 },
];

const SNAP = `(() => {
  const g = window.__game, s = g && g.stage;
  const stg = s && s.mode === 'stg';
  const p = s && s.player;
  return {
    state: g && g.state, sState: s && s.state, mode: s && s.mode, t: s ? +(s.t || 0).toFixed(1) : null,
    bullets: s && s.bullets ? (s.bullets.activeCount != null ? s.bullets.activeCount : (s.bullets.count ? s.bullets.count() : null)) : null,
    enemies: s ? (stg ? (s.stg && s.stg.enemies ? s.stg.enemies.filter((e) => e.alive).length : null) : (s.enemies && s.enemies.list ? s.enemies.list.filter((e) => e.alive).length : null)) : null,
    px: p ? +(stg ? p.worldX : p.x).toFixed(0) : null, py: p ? +(stg ? p.worldY : p.y).toFixed(0) : null,
    boss: s && s.boss ? { key: s.boss.key, st: s.boss.state, hp: Math.round(s.boss.hp) } : null,
    fps: g && g.loop ? +(g.loop.fps || 0).toFixed(1) : null,
    rinfo: window.__rendererInfo || null,
  };
})()`;

const HEAP = `(() => { const m = performance.memory; return m ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit } : null; })()`;

async function heapOf(T) {
  try {
    await T.send('HeapProfiler.enable', {}, 5000);
    await T.send('HeapProfiler.collectGarbage', {}, 8000);
  } catch (e) {}
  const m = await T.eval(HEAP).catch(() => null);
  return m ? { usedMB: +(m.used / 1048576).toFixed(2), totalMB: +(m.total / 1048576).toFixed(2) } : null;
}

async function measure(T) {
  await installProbe(T, true);
  await sleep(SCENE_MS);
  const probe = await readProbe(T);
  const snap = await T.eval(SNAP).catch(() => null);
  const heap = await heapOf(T);
  return {
    frames: probe.frames,
    fpsMean: +(1000 / (probe.avg || 1)).toFixed(1),
    avgMs: probe.avg, p50: probe.p50, p95: probe.p95, p99: probe.p99, worst: probe.worst,
    over33: probe.over33, over50: probe.over50, longtasks: probe.longtasks, longMax: probe.longMax,
    heapMB: heap ? heap.usedMB : null,
    canvas: snap && snap.rinfo ? { w: snap.rinfo.canvasW, h: snap.rinfo.canvasH, backing: snap.rinfo.backing } : null,
    softwareRaster: snap && snap.rinfo ? snap.rinfo.softwareRaster : null,
    postLevel: snap && snap.rinfo ? snap.rinfo.postLevel : null,
    quality: snap && snap.rinfo ? snap.rinfo.quality : null,
    bullets: snap && snap.bullets, enemies: snap && snap.enemies, boss: snap && snap.boss,
    snap,
  };
}

const ENTER_FIGHT = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; return { mode: s.mode, px: +(p.x || 0).toFixed(0) }; })()`;

const ENTER_BOSS = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; return { mode: s.mode, boss: b.key, hp: Math.round(b.hp) }; })()`;

const out = { scenes: {}, cfgs: {} };
for (const cfg of CFGS) {
  const T = await launchCfg({ key: cfg.key, gpu: cfg.gpu, width: 1280, height: 720, port: cfg.port, headless: true });
  try {
    await T.boot({ waitTitle: true });
    await T.waitFor('window.__game && window.__game._bootDone === true', 15000);
    await sleep(500);
    const rinfo0 = await T.eval('window.__rendererInfo || null');
    const cfgRec = { rinfo0, webgl: null, scenes: {} };

    // 1) 标题菜单
    await T.eval('window.__game.showTitle()');
    await sleep(1200);
    cfgRec.scenes.title = await measure(T);

    // 2) 第一关道中
    const f = await T.eval(ENTER_FIGHT);
    await sleep(SETTLE_MS);
    cfgRec.scenes.stage1 = await measure(T);
    cfgRec.scenes.stage1.entry = f;

    // 3) 第一关 BOSS
    const b = await T.eval(ENTER_BOSS);
    await sleep(SETTLE_MS);
    cfgRec.scenes.boss = await measure(T);
    cfgRec.scenes.boss.entry = b;

    const errs = (T.errors || []).slice(0, 5);
    cfgRec.errors = errs;
    out.cfgs[cfg.key] = cfgRec;
    out.scenes[cfg.key] = {
      title: cfgRec.scenes.title,
      stage1: cfgRec.scenes.stage1,
      boss: cfgRec.scenes.boss,
    };
    console.log('[' + cfg.key + ']', JSON.stringify({
      title: { fps: cfgRec.scenes.title.fpsMean, p95: cfgRec.scenes.title.p95, over50: cfgRec.scenes.title.over50 },
      stage1: { fps: cfgRec.scenes.stage1.fpsMean, p95: cfgRec.scenes.stage1.p95, over50: cfgRec.scenes.stage1.over50, bullets: cfgRec.scenes.stage1.bullets, enemies: cfgRec.scenes.stage1.enemies },
      boss: { fps: cfgRec.scenes.boss.fpsMean, p95: cfgRec.scenes.boss.p95, over50: cfgRec.scenes.boss.over50, bullets: cfgRec.scenes.boss.bullets, boss: cfgRec.scenes.boss.boss },
      errors: errs,
    }));
  } catch (e) {
    out.cfgs[cfg.key] = { error: String(e) };
    console.log('[' + cfg.key + '] ERROR', String(e).slice(0, 300));
  } finally {
    try { await T.close(); } catch {}
    await sleep(600);
  }
}
saveJson(OUT + 'perf_three10.json', out);
console.log('DONE three10');
