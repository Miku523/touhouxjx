/** 补丁验证：当前工作树的低配补丁（backing 0.75 / smoothing low / 跳过混合层 / 标题 shadowBlur 修复）
 * 软光栅 3 场景 10s（对比 tools/_pt/perf_three10.json），GPU boss 抽查。
 */
import { launchCfg, installProbe, readProbe, sleep, saveJson } from './_pt_perf_lib.mjs';
const OUT = 'tools/_pt/';
const SNAP = `(() => { const g = window.__game, s = g && g.stage; const p = s && s.player; return {
  bullets: s && s.bullets ? (s.bullets.activeCount != null ? s.bullets.activeCount : (s.bullets.count ? s.bullets.count() : null)) : null,
  enemies: s && s.enemies && s.enemies.list ? s.enemies.list.filter((e) => e.alive).length : null,
  boss: s && s.boss ? s.boss.key : null, fps: g && g.loop ? +(g.loop.fps || 0).toFixed(1) : null,
  stageLowSpec: s ? s.lowSpec : null, rinfo: window.__rendererInfo || null }; })()`;
const HEAP = `(() => { const m = performance.memory; return m ? { used: m.usedJSHeapSize } : null; })()`;
async function measure(T) {
  await installProbe(T, true);
  await sleep(10000);
  const probe = await readProbe(T);
  const snap = await T.eval(SNAP).catch(() => null);
  try { await T.send('HeapProfiler.enable', {}, 5000); await T.send('HeapProfiler.collectGarbage', {}, 8000); } catch (e) {}
  const m = await T.eval(HEAP).catch(() => null);
  return { frames: probe.frames, fpsMean: +(1000 / (probe.avg || 1)).toFixed(1), avgMs: probe.avg, p50: probe.p50, p95: probe.p95, p99: probe.p99, worst: probe.worst, over33: probe.over33, over50: probe.over50, longtasks: probe.longtasks, longMax: probe.longMax, heapMB: m ? +(m.used / 1048576).toFixed(2) : null, bullets: snap && snap.bullets, enemies: snap && snap.enemies, boss: snap && snap.boss, stageLowSpec: snap && snap.stageLowSpec, rinfo: snap && snap.rinfo };
}
const ENTER_FIGHT = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; return { mode: s.mode, lowSpec: s.lowSpec }; })()`;
const ENTER_BOSS = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; return { mode: s.mode, boss: b.key, lowSpec: s.lowSpec }; })()`;
const out = { cfgs: {} };
// A) 软光栅三场景
{
  const T = await launchCfg({ key: 'soft-verify', gpu: false, width: 1280, height: 720, port: 9470, headless: true });
  const rec = { scenes: {} };
  try {
    await T.boot({ waitTitle: true });
    await T.waitFor('window.__game && window.__game._bootDone === true', 15000);
    await sleep(500);
    rec.rinfo0 = await T.eval('window.__rendererInfo || null');
    rec.canvas0 = await T.eval('({ w: window.__game.renderer.canvas.width, h: window.__game.renderer.canvas.height, backing: window.__game.renderer.backing, smooth: window.__game.renderer.ctx.imageSmoothingQuality })');
    await T.eval('window.__game.showTitle()'); await sleep(1200);
    rec.scenes.title = await measure(T);
    rec.entryF = await T.eval(ENTER_FIGHT); await sleep(2500);
    rec.scenes.stage1 = await measure(T);
    rec.entryB = await T.eval(ENTER_BOSS); await sleep(2500);
    rec.scenes.boss = await measure(T);
    rec.errors = (T.errors || []).slice(0, 5);
    console.log('[soft-verify]', JSON.stringify({ rinfo0: rec.rinfo0, canvas0: rec.canvas0, entryF: rec.entryF, entryB: rec.entryB,
      title: { fps: rec.scenes.title.fpsMean, p95: rec.scenes.title.p95, over50: rec.scenes.title.over50 },
      stage1: { fps: rec.scenes.stage1.fpsMean, p95: rec.scenes.stage1.p95, over50: rec.scenes.stage1.over50, enemies: rec.scenes.stage1.enemies, lowSpec: rec.scenes.stage1.stageLowSpec },
      boss: { fps: rec.scenes.boss.fpsMean, p95: rec.scenes.boss.p95, over50: rec.scenes.boss.over50, bullets: rec.scenes.boss.bullets },
      errors: rec.errors }));
  } catch (e) { rec.error = String(e); console.log('[soft-verify] ERROR', String(e).slice(0, 300)); }
  finally { try { await T.close(); } catch {} }
  out.cfgs['soft-verify'] = rec;
  await sleep(600);
}
// B) GPU boss 抽查（确认低配补丁不影响 GPU 路径）
{
  const T = await launchCfg({ key: 'gpu-verify', gpu: true, width: 1280, height: 720, port: 9469, headless: true });
  const rec = { scenes: {} };
  try {
    await T.boot({ waitTitle: true });
    await T.waitFor('window.__game && window.__game._bootDone === true', 15000);
    await sleep(500);
    rec.rinfo0 = await T.eval('window.__rendererInfo || null');
    rec.entryB = await T.eval(ENTER_BOSS); await sleep(2500);
    rec.scenes.boss = await measure(T);
    rec.errors = (T.errors || []).slice(0, 5);
    console.log('[gpu-verify]', JSON.stringify({ rinfo0: rec.rinfo0, boss: { fps: rec.scenes.boss.fpsMean, p95: rec.scenes.boss.p95, over50: rec.scenes.boss.over50, bullets: rec.scenes.boss.bullets }, errors: rec.errors }));
  } catch (e) { rec.error = String(e); console.log('[gpu-verify] ERROR', String(e).slice(0, 300)); }
  finally { try { await T.close(); } catch {} }
  out.cfgs['gpu-verify'] = rec;
}
saveJson(OUT + 'perf_patch_verify.json', out);
console.log('DONE verify');
