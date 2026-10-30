/** 补丁后剩余热点：boss 密度下 backing 0.67 A/B + 软光栅强选「高」验证（端口 9467） */
import { launchCfg, installProbe, readProbe, sleep, saveJson } from './_pt_perf_lib.mjs';
const OUT = 'tools/_pt/';
const SNAP = `(() => { const g = window.__game, s = g && g.stage; return { fps: g && g.loop ? +(g.loop.fps || 0).toFixed(1) : null, bullets: s && s.bullets ? (s.bullets.activeCount != null ? s.bullets.activeCount : (s.bullets.count ? s.bullets.count() : null)) : null, rinfo: window.__rendererInfo || null, canvas: { w: g.renderer.canvas.width, h: g.renderer.canvas.height, backing: g.renderer.backing, smooth: g.renderer.ctx.imageSmoothingQuality } }; })()`;
async function measure(T) { await installProbe(T, true); await sleep(10000); const probe = await readProbe(T); const snap = await T.eval(SNAP).catch(() => null); return { fps: +(1000/(probe.avg||1)).toFixed(1), avg: probe.avg, p50: probe.p50, p95: probe.p95, p99: probe.p99, worst: probe.worst, over33: probe.over33, over50: probe.over50, frames: probe.frames, bullets: snap && snap.bullets, snap }; }
const ENTER_BOSS = `(() => { const g = window.__game; g.showTitle(); g.startStage(0, { skipIntro: true }); g.state = 'play'; const s = g.stage; s.state = 'play'; const p = s.player; p.invuln = 999999; p.hearts = 999; p.alive = true; p.power = 128; s.beginBoss(); const b = s.boss; b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.patternDur = 1e9; return { boss: b.key }; })()`;
const out = { scenes: {} };
const T = await launchCfg({ key: 'soft-more', gpu: false, width: 1280, height: 720, port: 9467, headless: true });
try {
  await T.boot({ waitTitle: true });
  await T.waitFor('window.__game && window.__game._bootDone === true', 15000);
  await sleep(500);
  await T.eval(ENTER_BOSS); await sleep(2500);
  out.scenes.bossBase075 = await measure(T);
  console.log('[075]', JSON.stringify({ fps: out.scenes.bossBase075.fps, p95: out.scenes.bossBase075.p95, over33: out.scenes.bossBase075.over33, over50: out.scenes.bossBase075.over50, bullets: out.scenes.bossBase075.bullets, canvas: out.scenes.bossBase075.snap && out.scenes.bossBase075.snap.canvas }));
  // 手动切 0.67（858x482）
  await T.eval('(() => { const r = window.__game.renderer; r.backing = 0.67; r.canvas.width = Math.round(1280*0.67); r.canvas.height = Math.round(720*0.67); return { w: r.canvas.width, h: r.canvas.height, backing: r.backing }; })()');
  await sleep(800);
  out.scenes.bossB067 = await measure(T);
  console.log('[067]', JSON.stringify({ fps: out.scenes.bossB067.fps, p95: out.scenes.bossB067.p95, over33: out.scenes.bossB067.over33, over50: out.scenes.bossB067.over50, bullets: out.scenes.bossB067.bullets, canvas: out.scenes.bossB067.snap && out.scenes.bossB067.snap.canvas }));
  // 恢复 fit
  await T.eval('(() => { window.__game.renderer.fit(); return window.__rendererInfo; })()');
  await sleep(800);
  // 软光栅强选「高」：应仍走 lowSpec
  const hi = await T.eval('(() => { const g = window.__game; g.setQuality("high"); return { rinfo: window.__rendererInfo, lowSpec: g.renderer.lowSpec, postLevel: g.renderer.postLevel, backing: g.renderer.backing }; })()');
  await sleep(500);
  out.scenes.qualityHigh = await measure(T);
  out.scenes.qualityHigh.info = hi;
  console.log('[high]', JSON.stringify({ info: hi, fps: out.scenes.qualityHigh.fps, p95: out.scenes.qualityHigh.p95, over50: out.scenes.qualityHigh.over50 }));
  out.errors = (T.errors || []).slice(0, 5);
} catch (e) { out.error = String(e); console.log('ERROR', String(e).slice(0, 300)); } finally { try { await T.close(); } catch {} }
saveJson(OUT + 'perf_patch_verify_more.json', out);
console.log('DONE more');
