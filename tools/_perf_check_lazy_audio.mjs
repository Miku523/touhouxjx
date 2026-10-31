/**
 * audio 延后加载验证：首屏不建引擎，首次手势后建真身并出声。
 * 用法：node tools/_perf_check_lazy_audio.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const PORT = Number(process.env.PORT || 9580);
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8138';

const T = await launch({ port: PORT, width: 1280, height: 720, headless: true });
const out = { steps: [] };
try {
  await T.boot(BASE + '/index.html');

  // 1) 等到标题页
  for (let i = 0; i < 100; i++) {
    const st = await T.eval('(window.__game && window.__game._bootDone) ? "ok" : "wait"');
    if (st === 'ok') break;
    await sleep(200);
  }
  out.steps.push({
    step: '首屏（未交互）',
    audioCtor: await T.eval('window.__game.audio && window.__game.audio.constructor && window.__game.audio.constructor.name'),
    audioReady: await T.eval('!!window.__game._audioReady'),
    audioLoading: await T.eval('!!window.__game._audioLoading'),
    ctx: await T.eval('!(window.__game.audio && window.__game.audio.ctx === null ? false : true)'),
    hasUnlockFn: await T.eval('typeof (window.__game.audio && window.__game.audio.unlock)'),
    muted: await T.eval('window.__game.audio && window.__game.audio.muted'),
    // 静默调用不该炸
    stubSafe: await T.eval('(() => { try { const a = window.__game.audio; a.setMuted?.(false); a.play?.("x"); a.stop?.(); return "ok"; } catch (e) { return String(e); } })()'),
    // 首屏不该请求 audio.js
    audioReqs: await T.eval('performance.getEntriesByType("resource").filter(e => /\\/engine\\/audio\\.js|\\/engine\\/songs\\/index\\.js/.test(e.name)).length'),
  });

  // 2) 首次手势（键盘）→ 应触发真实加载
  await T.key('ShiftLeft');
  await sleep(1500);
  out.steps.push({
    step: '首次手势后',
    audioCtor: await T.eval('window.__game.audio && window.__game.audio.constructor && window.__game.audio.constructor.name'),
    audioReady: await T.eval('!!window.__game._audioReady'),
    audioLoading: await T.eval('!!window.__game._audioLoading'),
    hasCtx: await T.eval('!!(window.__game.audio && window.__game.audio.ctx)'),
    audioReqs: await T.eval('performance.getEntriesByType("resource").filter(e => /\\/engine\\/audio\\.js|\\/engine\\/songs\\/index\\.js/.test(e.name)).length'),
  });

  // 3) 二次手势不该重复建引擎
  const before = await T.eval('window.__game.audio');
  await T.key('ShiftLeft');
  await sleep(400);
  out.steps.push({
    step: '二次手势',
    sameInstance: await T.eval('(() => window.__game._audioInstance === undefined ? "n/a" : "x")()'),
    audioReady: await T.eval('!!window.__game._audioReady'),
  });

  // 4) 进关：曲目应该还能播（_ensureStageMusic 走 preloadSongs）
  await T.eval('window.__game.startStage(0, {})').catch(() => {});
  await sleep(2500);
  out.steps.push({
    step: '进关后',
    state: await T.eval('window.__game.state'),
    stage: await T.eval('!!window.__game.stage'),
    currentSong: await T.eval('window.__game.audio && window.__game.audio.currentSong'),
    soundingSong: await T.eval('window.__game.audio && window.__game.audio.soundingSong'),
    hasCtx: await T.eval('!!(window.__game.audio && window.__game.audio.ctx)'),
  });

  const rpt = T.report();
  out.errors = rpt.errors;
  out.netFails = rpt.netFails;
  out.httpBad = rpt.httpBad;
} catch (e) {
  out.fatal = String(e && e.message || e);
} finally {
  await T.close();
}
console.log(JSON.stringify(out, null, 2));
