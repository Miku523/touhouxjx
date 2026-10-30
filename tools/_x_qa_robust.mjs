/** QA: platform mid-run settings, boss restart, gameover-continue, quit-to-title, resize, keybind rebind. */
import { sleep } from './_pt_core.mjs';
import { bootGame, info, advanceDialogue } from './_x_qa_lib.mjs';
import fs from 'node:fs';

const PORT = 9458;
const SHOTS = 'tools/shots/_qa_player';
const checks = [];
const add = (name, ok, extra = null) => { checks.push({ name, ok: !!ok, extra }); return !!ok; };
const out = (o) => console.log('[qa-robust] ' + JSON.stringify(o));
const { T } = await bootGame(PORT);
const shot = (n) => T.shot(SHOTS + '/' + n + '.png');

async function wait(cond, ms = 8000) { return await T.waitFor('(() => { try { return !!(' + cond + '); } catch (e) { return false; } })()', ms); }

/* ---------- A. natural start ---------- */
await T.key('Enter'); await sleep(250);
let s = await info(T);
add('A.difficultyPage', s.state === 'menu' && /EASY/.test(JSON.stringify(s.buttons)), s.buttons.map((b) => b.t));
await T.key('KeyN'); await sleep(250);
s = await info(T);
add('A.charSelect', s.state === 'menu' && s.buttons.length >= 2, s.buttons.map((b) => b.t));
await T.key('Digit1');
const intro = await advanceDialogue(T, 120);
const playOk = await wait('window.__game.state === "play" && window.__game.stage', 12000);
s = await info(T);
add('A.play', intro.ok && playOk && s.state === 'play' && s.stage && s.stage.mode === 'platform' && s.levelIndex === 0, s.stage);

/* realistic input 6s: walk right + shoot + jump */
await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
await sleep(1200); await T.key('Space'); await sleep(600); await T.key('Space');
await sleep(1600); await T.keyDown('ShiftLeft'); await sleep(700); await T.keyUp('ShiftLeft');
await T.keyUp('KeyZ'); await T.keyUp('ArrowRight'); await sleep(300);
const sMove = await info(T);
add('A.inputWorks', sMove.stage && sMove.stage.px > 80, sMove.stage && { px: sMove.stage.px, t: sMove.stage.t, bullets: sMove.stage.bullets });

/* ---------- B. settings mid-run (from pause) ---------- */
const lang0 = await T.eval('window.__game.lang || window.__game.i18n?.lang || null');
await T.key('Escape');
let ok = await wait('window.__game.state === "paused"', 5000);
add('B.pauseOpened', ok, s.state);
await T.key('KeyS'); await sleep(350);
let page = await T.eval('window.__game._page');
add('B.settingsPage', page === 'settings', page);
await shot('r1_pause_settings');
/* language cycle L x4 */
const langs = [];
for (let i = 0; i < 4; i++) { await T.key('KeyL'); await sleep(300); langs.push(await T.eval('window.__game.lang || window.__game.i18n?.lang || null')); }
add('B.languageCycles', langs[3] === lang0 || (langs[0] !== lang0 && langs[3] === lang0), { lang0, langs });
/* frame cap F, quality G, screen shake H */
await T.key('KeyF'); await sleep(250);
const cap = await T.eval('window.__game.frameCap');
await T.key('KeyG'); await sleep(250);
const q = await T.eval('JSON.stringify(window.__game.renderer?.qualityInfo?.() || null)');
await T.key('KeyH'); await sleep(250);
const shake = await T.eval('window.__game.screenShake');
add('B.settingsToggles', cap === 60 && shake === false, { frameCap: cap, quality: q, screenShake: shake });
await shot('r2_settings_changed');
/* ESC -> pause -> ESC -> play */
await T.key('Escape'); await sleep(300);
page = await T.eval('window.__game._page');
add('B.backToPause', page === 'paused', page);
await T.key('Escape'); await sleep(300);
const s2 = await info(T);
add('B.resumePlay', s2.state === 'play', s2.state);
const t1 = s2.stage && s2.stage.t;
await sleep(1200);
const s3 = await info(T);
add('B.clockRunsAfterSettings', s3.stage && s3.stage.t > t1 + 0.5, { before: t1, after: s3.stage && s3.stage.t });
add('B.frameCapApplied', (await T.eval('window.__game.loop.frameCap')) === 60, await T.eval('window.__game.loop.frameCap'));

/* ---------- C. pause -> restart during platform boss ---------- */
await T.eval('window.__game.stage.beginBoss()');
ok = await wait('window.__game.stage.boss && window.__game.stage.bossStarted', 8000);
let sb = await info(T);
add('C.bossSpawned', ok && sb.stage && sb.stage.bossKey === 'rumia', sb.stage && { key: sb.stage.bossKey, hp: sb.stage.bossHp, bossStarted: sb.stage.bossStarted });
await shot('r3_boss_before_restart');
const contBefore = (await info(T)).continues;
await T.key('Escape'); await sleep(350);
await T.key('KeyR'); await sleep(450);
add('C.restartConfirm', await wait('window.__game.state === "paused"', 3000));
await T.key('KeyR');
ok = await wait('window.__game.state === "play" && window.__game.stage && window.__game.stage.bossStarted && window.__game.stage.boss', 12000);
const sc = await info(T);
add('C.restartResumesBoss', ok && sc.stage.bossKey === 'rumia' && sc.levelIndex === 0, sc.stage && { key: sc.stage.bossKey, lvl: sc.levelIndex, t: sc.stage.t, px: sc.stage.px });
add('C.restartNoContinue', sc.continues === contBefore, { before: contBefore, after: sc.continues });
await shot('r4_boss_after_restart');

/* ---------- D. gameover at boss -> continue (再战 Boss) ---------- */
await T.eval('(() => { const p = window.__game.stage.player; p.lives = 1; p.die(); return true; })()');
ok = await wait('window.__game.state === "gameover"', 12000);
s = await info(T);
add('D.gameoverShown', ok, s.state);
const btns = s.buttons.map((b) => b.t);
add('D.retryLabel', btns.join('|').includes('再战 Boss'), btns);
await shot('r5_gameover_boss');
await T.key('Enter');
ok = await wait('window.__game.state === "play" && window.__game.stage && window.__game.stage.bossStarted', 12000);
const sd = await info(T);
add('D.continueResumesBoss', ok && sd.continues === 1 && sd.levelIndex === 0, sd.stage && { key: sd.stage.bossKey, continues: sd.continues, power: sd.stage.power, bossStarted: sd.stage.bossStarted });
await shot('r6_continue_boss');

/* ---------- E. quit to title + fresh game ---------- */
await T.key('Escape'); await sleep(350);
await T.key('KeyQ'); await sleep(350);
const quitPage = await T.eval('window.__game._page');
await T.key('KeyQ'); await sleep(500);
ok = await wait('window.__game.state === "menu" && window.__game._page === "title"', 6000);
s = await info(T);
add('E.quitToTitle', ok && s.state === 'menu', { state: s.state, page: s.page, hud: s.hudCls });
add('E.quitConfirmPage', quitPage === 'title', quitPage);
/* fresh run resets run state */
await T.key('Enter'); await sleep(250); await T.key('KeyN'); await sleep(250); await T.key('Digit2');
const intro2 = await advanceDialogue(T, 120);
ok = await wait('window.__game.state === "play" && window.__game.stage', 12000);
s = await info(T);
add('E.freshRun', ok && s.char === 'marisa' && s.levelIndex === 0 && s.continues === 0 && s.stage && s.stage.lives >= 1, { char: s.char, lvl: s.levelIndex, cont: s.continues, stage: s.stage && { lives: s.stage.lives, power: s.stage.power } });

/* ---------- F. resize during play ---------- */
const rect0 = await T.eval('JSON.stringify(document.getElementById("game").getBoundingClientRect())');
await T.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false });
await sleep(1200);
const rect1 = await T.eval('JSON.stringify(document.getElementById("game").getBoundingClientRect())');
await T.send('Emulation.clearDeviceMetricsOverride');
await sleep(1200);
const r0 = JSON.parse(rect0), r1 = JSON.parse(rect1);
add('F.resizeApplied', Math.abs(r1.width - 1024) < 2, { before: r0.width, after: r1.width });
const sr = await info(T);
add('F.aliveAfterResize', sr.state === 'play' && sr.stage && sr.stage.lives > 0, sr.stage && { lives: sr.stage.lives, t: sr.stage.t });
await shot('r7_after_resize');

/* ---------- G. keybind rebind (title settings -> K) ---------- */
await T.key('Escape'); await sleep(350); await T.key('KeyQ'); await sleep(300); await T.key('KeyQ'); await sleep(600);
await wait('window.__game.state === "menu" && window.__game._page === "title"', 6000);
await T.key('KeyS'); await sleep(350);
await T.key('KeyK'); await sleep(400);
let kbPage = await T.eval('window.__game._page');
add('G.keybindPage', kbPage === 'keybinds', kbPage);
/* capture: click shoot row via its onPick using panel API: find index of shoot in ACTION_DEFS then select & ENTER */
const infoKb = await T.eval('(() => { const g = window.__game; return { idx: g._keybindIndex, labels: g.input.labelFor ? ["shoot","jump","cast"].map((a) => g.input.labelFor(a)) : null }; })()');
const shootIdx = await T.eval('(() => { const m = window.__game; const defs = m.constructor ? null : null; return null; })()');
/* move selection to shoot row by evaluating panel rows: use ACTION_DEFS order via internal */
const order = await T.eval('(() => { const g = window.__game; const rows = [...document.querySelectorAll(".kb-row .set-label")].map((e) => e.textContent.trim()); return rows; })()');
add('G.rowsPresent', order.length >= 14, order);
const shootRow = order.findIndex((t) => t.includes('射击'));
if (shootRow >= 0) {
  /* set selection exactly by calling showKeybinds(index) */
  await T.eval('(function(){ const g = window.__game; const idx = g.constructor; })()');
  await T.eval('(function(){ return window.__game.showKeybinds(5); })()');
  await sleep(300);
  await T.key('Enter'); await sleep(300);
  const cap = await T.eval('window.__game._captureAction');
  add('G.captureStarted', !!cap, cap);
  await T.key('KeyV'); await sleep(400);
  const label = await T.eval('window.__game.input.labelFor("shoot")');
  add('G.rebound', label === 'V', label);
  await shot('r8_keybind_v');
  await T.key('Escape'); await sleep(350);
  await T.key('Escape'); await sleep(350);
  s = await info(T);
  add('G.backTitle', s.state === 'menu' && s.page === 'title', { state: s.state, page: s.page });
  /* start game, press V should shoot */
  await T.key('Enter'); await sleep(250); await T.key('KeyN'); await sleep(250); await T.key('Digit1');
  await advanceDialogue(T, 120);
  await wait('window.__game.state === "play"', 12000);
  const n0 = await T.eval('window.__game.stage ? window.__game.stage.shots.length : -1');
  await T.keyDown('KeyV'); await sleep(500); await T.keyUp('KeyV');
  await sleep(200);
  const n1 = await T.eval('window.__game.stage ? window.__game.stage.shots.length : -1');
  add('G.reboundShoots', n1 > 0, { shots: n1, n0 });
  const z0 = await T.eval('window.__game.stage ? window.__game.stage.shots.length : -1');
  await T.keyDown('KeyZ'); await sleep(400); await T.keyUp('KeyZ'); await sleep(200);
  const z1 = await T.eval('window.__game.stage ? window.__game.stage.shots.length : -1');
  add('G.oldKeyInactive', z1 <= z0, { before: z0, after: z1 });
}

const rep = await T.report();
const errs = rep.errors || [];
const benign = errs.filter((e) => /ERR_CONNECTION_REFUSED|Failed to load resource/.test(String(e)));
const real = errs.filter((e) => !benign.includes(e));
add('H.noJsErrors', real.length === 0, { real, benign: benign.length });
out({ checks: checks.length, failed: checks.filter((c) => !c.ok).length });
const failed = checks.filter((c) => !c.ok);
fs.writeFileSync('tools/reports/_runner/qa_robust.json', JSON.stringify({ pass: failed.length === 0, checks, failed, report: { errors: errs, netFails: rep.netFails, httpBad: rep.httpBad } }, null, 2));
await T.close();
console.log('DONE ' + (failed.length === 0 ? 'PASS' : 'FAIL ' + JSON.stringify(failed.map((f) => f.name + ':' + JSON.stringify(f.extra)).slice(0, 10))));
