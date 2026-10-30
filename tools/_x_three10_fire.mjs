/** 10s 第一关道中/BOSS（按住 KeyZ 射击）——补测玩家子弹场景，仅软光栅 */
import { launchCfg, installProbe, readProbe, sleep, saveJson } from './_pt_perf_lib.mjs';
const OUT = 'tools/_pt/';
const SNAP = `(() => { const g = window.__game, s = g && g.stage; return { bullets: s && s.bullets ? (s.bullets.activeCount != null ? s.bullets.activeCount : (s.bullets.count ? s.bullets.count() : null)) : null, enemies: s && s.enemies && s.enemies.list ? s.enemies.list.filter((e) => e.alive).length : null, boss: s && s.boss ? s.boss.key : null, fps: g && g.loop ? +(g.loop.fps || 0).toFixed(1) : null, rinfo: window.__rendererInfo || null }; })()`;
const HEAP = `(() => { const m = performance.memory; return m ? { used: m.usedJSHeapSize } : null; })()`;
async function measure(T) {
  await installProbe(T, true);
  await sleep(10000);
  const probe = await readProbe(T);
  const snap = await T.eval(SNAP).catch(() => null);
  try { await T.send('HeapProfiler.enable', {}, 5000); await T.send('HeapProfiler.collectGarbage', {}, 8000); } catch (e) {}
  const m = await T.eval(HEAP).catch(() => null);
  return { frames: probe.frames, fpsMean: +(1000 / (probe.avg || 1)).toFixed(1), avgMs: probe.avg, p50: probe.p50, p95: probe.p95, p99: probe.p99, worst: probe.worst, over33: probe.over33, over50: probe.over50, longtasks: probe.longtasks, longMax: probe.longMax, heapMB: m ? +(m.used / 1048576).toFixed(2) : null, bullets: snap && snap.bullets, enemies: snap && snap.enemies, boss: snap && snap.boss, canvas: snap && snap.rinfo ? { w: snap.rinfo.canvasW, h: snap.rinfo.canvasH, backing: snap.rinfo.backing, soft: snap.rinfo.softwareRaster, post: snap.rinfo.postLevel } : null };
}
const ENTER_FIGHT = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; return { mode: s.mode }; })()`;
const ENTER_BOSS = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; return { mode: s.mode, boss: b.key }; })()`;
const out = { key: 'soft-1280-fire', scenes: {} };
const T = await launchCfg({ key: 'soft-fire', gpu: false, width: 1280, height: 720, port: 9469, headless: true });
try {
  await T.boot({ waitTitle: true });
  await T.waitFor('window.__game && window.__game._bootDone === true', 15000);
  await sleep(500);
  await T.eval(ENTER_FIGHT);
  await sleep(2500);
  await T.keyDown('KeyZ');
  await sleep(200);
  out.scenes.stage1 = await measure(T);
  console.log('[soft-fire stage1]', JSON.stringify({ fps: out.scenes.stage1.fpsMean, p95: out.scenes.stage1.p95, over50: out.scenes.stage1.over50, bullets: out.scenes.stage1.bullets, enemies: out.scenes.stage1.enemies }));
  await T.keyUp('KeyZ');
  await T.eval(ENTER_BOSS);
  await sleep(2500);
  await T.keyDown('KeyZ');
  await sleep(200);
  out.scenes.boss = await measure(T);
  console.log('[soft-fire boss]', JSON.stringify({ fps: out.scenes.boss.fpsMean, p95: out.scenes.boss.p95, over50: out.scenes.boss.over50, bullets: out.scenes.boss.bullets, boss: out.scenes.boss.boss }));
  await T.keyUp('KeyZ');
  out.errors = (T.errors || []).slice(0, 5);
} catch (e) { out.error = String(e); console.log('ERROR', String(e).slice(0, 300)); } finally { try { await T.close(); } catch {} }
saveJson(OUT + 'perf_three10_fire.json', out);
console.log('DONE fire');
