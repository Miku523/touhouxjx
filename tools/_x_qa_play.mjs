import fs from 'node:fs';
import { sleep } from './_pt_core.mjs';
import { bootGame, info, advanceDialogue, warp, mk } from './_x_qa_lib.mjs';

const PORT = 9457;
const SHOT = 'tools/shots/_qa_player';
const OUT = 'tools/reports/_runner/qa_play.json';
fs.mkdirSync(SHOT, { recursive: true }); fs.mkdirSync('tools/reports/_runner', { recursive: true });
const qa = mk({ shots: [], notes: [], stages: [] });
const shot = async (T, name) => { const p = SHOT + '/' + name; await T.shot(p); qa.records.shots.push(p); return p; };
const btnTexts = (s) => (s.buttons || []).map((b) => b.t);
const has = (s, re) => (s.buttons || []).some((b) => re.test(b.t));
const exprStage = 'JSON.stringify((() => { const g = window.__game; const s = g.stage; if (!s) return null; const p = s.player; const shots = s.shots && s.shots.pool ? s.shots.pool.filter((b) => b.active).length : null; return { t: +Number(s.t).toFixed(3), px: p ? Math.round(p.x) : null, py: p ? Math.round(p.y) : null, vy: p ? Math.round(p.vy) : null, onGround: p ? !!p.onGround : null, power: p ? Math.round(p.power) : null, lives: p ? p.lives : null, hearts: p ? p.hearts : null, shots, bullets: s.bullets && s.bullets.active ? s.bullets.active.length : null, boss: s.boss ? { key: s.boss.key, state: s.boss.state, hp: Math.round(s.boss.hp), maxHp: s.boss.maxHp ? Math.round(s.boss.maxHp) : null } : null, finished: !!s.finished, mode: s.mode }; })())';
const st = async (T) => JSON.parse(await T.eval(exprStage));
const state = async (T) => T.eval('window.__game.state');

/* 等待并推进：clear 横幅 / 过场对话 / ending 全部按键推进，直到回到标题或超时 */
async function playThrough(T, maxMs) {
  const t0 = Date.now();
  let taps = 0;
  while (Date.now() - t0 < maxMs) {
    const x = await T.eval('(() => { const g = window.__game; return { st: g.state, dlg: !!(g.dialogue && g.dialogue.active), end: !!(g.ending && g.ending.active) }; })()');
    if (x.st === 'menu') return { ok: true, ms: Date.now() - t0, taps, last: x };
    if (x.st === 'dialogue' || x.st === 'ending' || x.dlg || x.end) { await T.key(taps % 2 ? 'Space' : 'Enter'); taps++; await sleep(65); }
    else await sleep(150);
  }
  return { ok: false, ms: Date.now() - t0, taps };
}

const { T, bootDone } = await bootGame(PORT, { width: 1280, height: 720 });
let crash = null; let report = null; let s = null; let lastSt = null;
try {
  T.clearCollection();
  qa.add('boot.bootdone', bootDone);
  /* ================= A. 真实开局：标题 -> 难度 N -> 灵梦 -> 开场对话 ================= */
  await T.key('Enter');
  qa.add('menu.enter->difficulty', await T.waitFor('!!document.querySelector(".diff-card")', 4000));
  await T.key('KeyN'); await sleep(400);
  qa.add('difficulty.N->charselect', await T.waitFor('window.__game._page === "charselect"', 3000));
  await T.key('Digit1'); await sleep(500);
  let st0 = await info(T);
  qa.add('start.dialogue', st0.state === 'dialogue' && st0.char === 'reimu', { state: st0.state, char: st0.char });
  await shot(T, 'p01_opening.png');
  const adv0 = await advanceDialogue(T, 160);
  qa.add('start.dialogueDone', adv0.ok, adv0);
  const started = await T.waitFor('window.__game.state === "play" && !!window.__game.stage', 10000);
  s = await info(T);
  qa.add('start.stage1.play', started && s.levelIndex === 0, { levelIndex: s.levelIndex, state: s.state });
  qa.add('start.hud.visible', /(^| )hud( |$)/.test((s.hudCls || '').replace('hidden', 'HIDDEN')) || (s.hudCls || '').indexOf('hidden') < 0, s.hudCls);
  lastSt = await st(T);
  qa.add('start.stage1.timer', /^\d/.test(s.timer || ''), { timer: s.timer, stageName: s.stageName, lives: s.livesText, power: s.powerText });
  qa.add('start.stage1.player', lastSt && lastSt.hearts === 3, lastSt);
  await shot(T, 'p02_stage1.png');
  /* 移动 / 射击 / 跳跃 输入响应 */
  const px0 = lastSt.px;
  await T.keyDown('ArrowRight'); await sleep(420); await T.keyUp('ArrowRight'); await sleep(120);
  const stMove = await st(T);
  qa.add('input.moveRight', stMove.px > px0 + 3, { px0, px1: stMove.px });
  await T.keyDown('KeyZ'); await sleep(300);
  const stShoot = await st(T);
  await T.keyUp('KeyZ'); await sleep(100);
  qa.add('input.shoot', (stShoot.shots || 0) > 0, { shots: stShoot.shots });
  await T.keyDown('Space'); await sleep(120);
  const stJump = await st(T);
  await T.keyUp('Space'); await sleep(150);
  qa.add('input.jump', stJump.vy !== 0 || stJump.onGround === false || (stJump.py || 0) < (lastSt.py || 0), { vy: stJump.vy, onGround: stJump.onGround, py0: lastSt.py, py1: stJump.py });
  /* 暂停 / 重开本关 */
  await T.key('Escape'); await sleep(450);
  s = await info(T);
  qa.add('play.pause', s.state === 'paused' && s.page === 'paused', { state: s.state, page: s.page });
  await T.key('KeyR'); await sleep(450);
  s = await info(T);
  qa.add('play.restartConfirm', /重新开始本关/.test(s.titleText || '') || has(s, /继续游戏/), { page: s.page, title: s.titleText, buttons: btnTexts(s) });
  await T.key('KeyR'); await sleep(800);
  let stR = await st(T);
  s = await info(T);
  qa.add('play.restart', s.state === 'play' && !!stR && stR.t < 3 && s.levelIndex === 0, { state: s.state, t: stR && stR.t, levelIndex: s.levelIndex });
  await sleep(400);
  /* ================= B. 快捷键切关 1..6 + HUD/计时/清关链 ================= */
  const stageInfo = [];
  for (let n = 1; n <= 6; n++) {
    const okWarp = await warp(T, n);
    await sleep(500);
    s = await info(T);
    let sg = await st(T);
    const t1 = sg ? sg.t : null;
    await sleep(700);
    sg = await st(T);
    const t2 = sg ? sg.t : null;
    const entry = { n, okWarp, levelIndex: s.levelIndex, state: s.state, stageName: s.stageName, timer: s.timer, lives: s.livesText, mode: sg && sg.mode, t1, t2, boss: sg && sg.boss };
    qa.records.stages.push(entry);
    qa.add('warp' + n + '.play', okWarp && s.state === 'play' && s.levelIndex === n - 1, entry);
    qa.add('warp' + n + '.timerRuns', t1 != null && t2 != null && t2 > t1, { t1, t2 });
    qa.add('warp' + n + '.hudLives', (s.livesText || '').trim().length > 0, { livesText: s.livesText, powerText: s.powerText, powerLv: s.powerLv });
    qa.add('warp' + n + '.stageName', (s.stageName || '').trim().length > 0, s.stageName);
    await shot(T, 'p0' + (n + 2) + '_stage' + n + '.png');
    if (n === 6) {
      // 关底击破 -> STAGE CLEAR -> 通关结局
      await T.eval('(() => { const g = window.__game; g.stage.beginBoss(); })()');
      await T.waitFor('!!(window.__game.stage && window.__game.stage.boss)', 4000);
      await sleep(400);
      const bossS = await T.eval('(() => { const b = window.__game.stage.boss; return b ? { key: b.key, state: b.state, hp: Math.round(b.hp) } : null; })()');
      qa.add('stage6.boss.spawned', !!bossS, bossS);
      await shot(T, 'p09_stage6_boss.png');
      await T.eval('(() => { const b = window.__game.stage.boss; if (!b) return; b.state = "defeat"; b.defeatT = 2.19; b.hp = 0; })()');
      const clearOk = await T.waitFor('window.__game.state === "clear" || window.__game.state === "ending"', 6000);
      s = await info(T);
      qa.add('stage6.clear', clearOk, { state: s.state });
      await shot(T, 'p10_clear.png');
      const fin = await playThrough(T, 90000);
      s = await info(T);
      qa.add('ending.playThrough', fin.ok && s.state === 'menu', { fin, state: s.state, page: s.page });
      qa.add('ending.goodUnlockedExtra', await T.eval('window.__game.unlockedExtra === true'), await T.eval('window.__game.unlockedExtra'));
      await shot(T, 'p11_backTitle.png');
      break;
    }
  }
  /* 清关链：1 面击破 -> 自动进 2 面 */
  await warp(T, 1); await sleep(500);
  await T.eval('(() => { const g = window.__game; g.stage.beginBoss(); })()');
  await T.waitFor('!!(window.__game.stage && window.__game.stage.boss)', 4000);
  await sleep(300);
  await T.eval('(() => { const b = window.__game.stage.boss; if (!b) return; b.state = "defeat"; b.defeatT = 2.19; b.hp = 0; })()');
  const nextOk = await T.waitFor('window.__game.state === "play" && window.__game.levelIndex === 1', 25000);
  s = await info(T);
  qa.add('clear.advanceToStage2', nextOk, { state: s.state, levelIndex: s.levelIndex });
  await shot(T, 'p12_stage2_afterClear.png');
  /* ================= C. 游戏结束 -> 续命 -> 继续 ================= */
  await warp(T, 1); await sleep(400);
  await T.eval('(() => { const p = window.__game.stage.player; p.lives = 1; p.hearts = 0; p.die(); })()');
  const goOk = await T.waitFor('window.__game.state === "gameover"', 8000);
  s = await info(T);
  qa.add('gameover.panel', goOk, { state: s.state, title: s.titleText, buttons: btnTexts(s) });
  await shot(T, 'p13_gameover.png');
  await T.key('Enter'); await sleep(700);
  s = await info(T);
  qa.add('gameover.continue', s.state !== 'gameover', { state: s.state, continues: s.continues });
  const goPlay = await T.waitFor('window.__game.state === "play" && window.__game.continues >= 1', 8000);
  s = await info(T);
  qa.add('gameover.continuesCounted', goPlay && s.continues === 1, { state: s.state, continues: s.continues, levelIndex: s.levelIndex });
  await shot(T, 'p14_continued.png');
  /* ================= D. 窗口缩放 ================= */
  const dim0 = await T.eval('(() => { const c = document.getElementById("game"); const r = c.getBoundingClientRect(); return { cw: c.width, rectW: Math.round(r.width), rectH: Math.round(r.height), iw: innerWidth, ih: innerHeight }; })()');
  await T.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const dim1 = await T.eval('(() => { const c = document.getElementById("game"); const r = c.getBoundingClientRect(); return { cw: c.width, rectW: Math.round(r.width), rectH: Math.round(r.height), iw: innerWidth, ih: innerHeight }; })()');
  const sResize = await st(T);
  qa.add('resize.smaller', dim1.iw === 800 && (dim1.rectW !== dim0.rectW || dim1.cw !== dim0.cw), { dim0, dim1 });
  qa.add('resize.noFreeze', !!sResize, sResize);
  await shot(T, 'p15_resize800.png');
  await T.send('Emulation.clearDeviceMetricsOverride');
  await sleep(900);
  const dim2 = await T.eval('(() => { const c = document.getElementById("game"); const r = c.getBoundingClientRect(); return { cw: c.width, rectW: Math.round(r.width), iw: innerWidth }; })()');
  qa.add('resize.restored', dim2.iw === 1280 && Math.abs(dim2.rectW - dim0.rectW) <= 2, { dim0, dim2 });
  await shot(T, 'p16_resize_back.png');
  /* ================= E. 标签页冻结 / 恢复 ================= */
  const tFrozen0 = (await st(T)).t;
  await T.send('Page.setWebLifecycleState', { state: 'frozen' });
  await sleep(1800);
  await T.send('Page.setWebLifecycleState', { state: 'active' });
  await sleep(1200);
  const stAfterHidden = await st(T);
  s = await info(T);
  qa.add('hidden.resume', s.state === 'play' && !!stAfterHidden, { state: s.state, t0: tFrozen0, t1: stAfterHidden && stAfterHidden.t });
  qa.add('hidden.clockRuns', stAfterHidden && stAfterHidden.t > tFrozen0, { t0: tFrozen0, t1: stAfterHidden && stAfterHidden.t });
  await shot(T, 'p17_afterHidden.png');
  /* 冻结后输入仍然响应 */
  await T.keyDown('ArrowLeft'); await sleep(350); await T.keyUp('ArrowLeft'); await sleep(150);
  const stAfterInput = await st(T);
  qa.add('hidden.inputAfterResume', !!stAfterInput && stAfterInput.px !== stAfterHidden.px, { px0: stAfterHidden.px, px1: stAfterInput && stAfterInput.px });
  /* ================= F. 回标题 ================= */
  await T.key('Escape'); await sleep(400); await T.key('KeyQ'); await sleep(400);
  await T.key('KeyQ'); await sleep(800);
  s = await info(T);
  qa.add('quit.toTitle', s.state === 'menu' && s.page === 'title' && !s.stage, { state: s.state, page: s.page, stage: !!s.stage });
  report = await T.report();
  const errs = (report.errors || []).filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(typeof e === 'string' ? e : JSON.stringify(e)));
  qa.add('console.noErrors', errs.length === 0, errs.slice(0, 10));
  qa.add('net.noBad', (report.httpBad || []).length === 0, report.httpBad);
} catch (e) {
  crash = String((e && e.stack) || e);
} finally {
  try { const r = qa.save(OUT, { crash, report, info: s, stages: qa.records.stages }); fs.writeFileSync(OUT, r.json); console.log(JSON.stringify({ pass: r.out.pass, failed: r.out.failed, crash, stages: qa.records.stages, shots: qa.records.shots }, null, 2)); } catch (e) { console.log('SAVE FAIL ' + e); }
  try { await T.close(); } catch (e) {}
}