/** Edge QA: real-keydown keybind check, settings-freezes-clock check, last-life death during boss defeat window. Port 9459. */
import { sleep } from './_pt_core.mjs';
import { bootGame, info, warp, mk, heap } from './_x_qa_lib.mjs';
import fs from 'node:fs';

const PORT = 9459;
const OUT = 'tools/shots/_qa_player/';
const R = 'tools/reports/_runner/qa_edge.log';
const { add, save } = mk([]);
const log = [];
const L = (s) => { log.push(s); console.log('[edge]', s); };
const { T, bootDone } = await bootGame(PORT);
add('boot', bootDone);
const shot = async (n) => { try { await T.shot(OUT + n + '.png'); } catch (e) {} };
const wait = (expr, ms) => T.waitFor(expr, ms);
const ev = (expr) => T.eval(expr);
const pumpUntil = async (expr, maxMs = 40000) => {
  const t0 = Date.now();
  let taps = 0;
  while (Date.now() - t0 < maxMs) {
    if (await ev('!!(' + expr + ')')) return { ok: true, taps };
    const dlg = await ev('!!(window.__game.dialogue && window.__game.dialogue.active)');
    if (dlg) { await T.key('Enter'); taps++; }
    else await sleep(taps ? 60 : 150);
  }
  return { ok: false, taps, st: await ev('window.__game.state'), lvl: await ev('window.__game.levelIndex') };
};
const startRun = async () => {
  await T.key('Enter'); await sleep(250);
  await T.key('KeyN'); await sleep(250);
  await T.key('Digit1'); await sleep(250);
  const pr = await pumpUntil('window.__game.state === "play" && !!window.__game.stage', 30000);
  return pr;
};
const stage = (expr) => ev('(() => { const s = window.__game.stage; if (!s) return null; return (' + expr + '); })()');

try {
  /* ============ A. keybind rebind with REAL keydown ============ */
  await T.key('KeyS'); await sleep(300);
  let page = await ev('window.__game._page'); add('A.settingsPage', page === 'settings', page);
  await T.key('KeyK'); await sleep(300);
  page = await ev('window.__game._page');
  add('A.keybindPage', page === 'keybinds', page);
  /* rows: 0..13 actions, 6=shoot. 6 ArrowDowns from index 0 */
  for (let i = 0; i < 6; i++) { await T.key('ArrowDown'); await sleep(60); }
  const labelNow = await ev('(() => { const rows = [...document.querySelectorAll("#overlay .set-row")]; return rows.map(r => r.textContent.replace(/\\s+/g, " ").trim()); })()');
  L('kb rows ' + JSON.stringify(labelNow));
  const shootIdx = (labelNow || []).findIndex((t) => /射击|Shoot/i.test(t));
  add('A.shootRow', shootIdx >= 0, { shootIdx, rows: labelNow });
  if (shootIdx >= 0) {
    /* navigate: current select index vs shootIdx */
    const cur = await ev('window.__game._keybindIndex');
    const delta = shootIdx - cur;
    for (let i = 0; i < Math.abs(delta); i++) { await T.key(delta > 0 ? 'ArrowDown' : 'ArrowUp'); await sleep(60); }
    await sleep(200);
    await T.key('Enter'); await sleep(250); /* enter capture */
    await T.key('KeyV'); await sleep(300);
    const lbl = await ev('window.__game.input.labelFor("shoot")');
    add('A.rebindLabel', lbl === 'V / J', lbl);
    const actions = await ev('(() => { const i = window.__game.input; return { v: i.actionOf("KeyV"), z: i.actionOf("KeyZ"), j: i.actionOf("KeyJ") }; })()');
    add('A.actionMap', actions.v === 'shoot' && actions.z !== 'shoot' && actions.j === 'shoot', actions);
    /* back to settings -> title */
    await T.key('Escape'); await sleep(250);
    const backTo = await ev('window.__game._page');
    add('A.backToSettings', backTo === 'settings', backTo);
    await T.key('Escape'); await sleep(300);
    page = await ev('window.__game.state');
    add('A.backToTitle', page === 'menu', page);
    await shot('e1_rebound');
  }

  /* start game and validate V shoots, Z does not */
  let pr = await startRun();
  add('A.started', pr.ok, pr);
  await ev('(() => { const p = window.__game.stage.player; p.invuln = 999; return true; })()');
  const count = () => ev('(() => { const s = window.__game.stage; return s && s.shots && s.shots.pool ? s.shots.pool.filter((b) => b.active).length : -1; })()');
  const base = await count();
  await T.keyDown('KeyV'); await sleep(420); const nV = await count(); await T.keyUp('KeyV'); await sleep(350);
  const mid = await count();
  await T.keyDown('KeyZ'); await sleep(420); const nZ = await count(); await T.keyUp('KeyZ'); await sleep(200);
  L('shots base=' + base + ' V=' + nV + ' mid=' + mid + ' Z=' + nZ);
  add('A.newKeyShoots', nV > base, { base, nV });
  add('A.oldKeyInactive', nZ <= mid, { mid, nZ });
  add('A.shotsProbeReadable', base >= 0, base);
  await shot('e2_v_shoots');

  /* ============ B. settings panel freezes sim clock ============ */
  const tA = await stage('s.t');
  await T.key('Escape'); await sleep(250);   /* pause */
  const pausedState = await ev('window.__game.state');
  await T.key('KeyS'); await sleep(350);     /* settings from pause */
  page = await ev('window.__game._page');
  const t1 = await stage('s.t'); await sleep(1500); const t2 = await stage('s.t');
  add('B.settingsPagePaused', pausedState === 'paused' && page === 'settings', { pausedState, page });
  add('B.clockFrozenInSettings', Math.abs((t2 || 0) - (t1 || 0)) < 0.05, { t1, t2, beforeOpen: tA });
  /* close settings -> pause -> play, clock continues */
  await T.key('Escape'); await sleep(250);
  await T.key('Escape'); await sleep(400);
  const t3 = await stage('s.t'); await sleep(900); const t4 = await stage('s.t');
  add('B.clockRunsAfterResume', t4 > t3, { t3, t4 });
  await ev('(() => { const p = window.__game.stage.player; p.invuln = 999; return true; })()');

  /* ============ C. death during final-boss defeat window ============ */
  const runEdge = async (level, lives, tag) => {
    await warp(T, level);
    await sleep(400);
    let s = await info(T);
    if (!(s.state === 'play' && s.levelIndex === level - 1)) { await pumpUntil('window.__game.state === "play"', 10000); }
    await ev('window.__game.stage.beginBoss()');
    const okBoss = await wait('window.__game.stage.boss && window.__game.stage.bossStarted', 8000);
    const set = await ev('(() => { const s = window.__game.stage, b = s.boss, p = s.player; p.invuln = 0; p.lives = ' + lives + '; b.hp = 0; b.state = "defeat"; b.defeatT = 0.7; p.die(); return { boss: b.key, bossState: b.state, defeatT: b.defeatT, lives: p.lives, alive: p.alive, stageState: s.state, deathT: s.deathT }; })()');
    L(tag + ' set ' + JSON.stringify(set));
    const dead = await wait('window.__game.stage.boss && window.__game.stage.boss.state === "dead"', 8000);
    const afterDead = await ev('(() => { const g = window.__game, s = g.stage; return { state: g.state, stageState: s.state, lvl: g.levelIndex, alive: s.player ? s.player.alive : null, lives: s.player ? s.player.lives : null, boss: s.boss ? s.boss.key : null, gameover: g.state === "gameover" }; })()');
    L(tag + ' afterDead ' + JSON.stringify({ dead, afterDead }));
    await shot('e3_' + tag + '_bossdead');
    if (afterDead.state === 'gameover') {
      const labels = (await info(T)).buttons.map((b) => b.t);
      add(tag + '.gameover', true, { labels, ...afterDead });
      return { gameover: true, labels, afterDead };
    }
    /* advance clear -> next stage, pumping dialogues */
    await pumpUntil('window.__game.levelIndex === ' + level + ' && window.__game.state === "play"', 45000);
    const nt = await ev('(() => { const g = window.__game, s = g.stage; return { state: g.state, lvl: g.levelIndex, stageState: s ? s.state : null, pLives: s && s.player ? s.player.lives : null, runLives: g.runLives, continues: g.continues, name: g._stageName }; })()');
    const hearts = await ev('document.querySelectorAll("#lives .life").length');
    add(tag + '.advanced', nt.lvl === level && nt.state === 'play', nt);
    add(tag + '.noGameover', nt.state !== 'gameover', nt.state);
    add(tag + '.livesAfter', nt.pLives, { pLives: nt.pLives, runLives: nt.runLives, hearts });
    await shot('e4_' + tag + '_nextstage');
    return { gameover: false, afterDead, next: nt, hearts };
  };

  /* C1 control: 2 lives, die in the defeat window -> should lose one life, next stage 1 */
  const c1 = await runEdge(1, 2, 'c1_two_lives');
  /* C2 bug probe: last life, die in the defeat window */
  const c2 = await runEdge(2, 1, 'c2_last_life');
  L('C1 ' + JSON.stringify(c1).slice(0, 400));
  L('C2 ' + JSON.stringify(c2).slice(0, 400));

  const expectC1 = c1.gameover ? true : (c1.next && c1.next.pLives === 1 && c1.next.continues === 0);
  add('C1.expectLoseOneLife', expectC1 === true, { next: c1.next, gameover: c1.gameover });
  /* Expected correct behavior for last-life: gameover panel (or at least not full 3 lives) */
  const c2bug = !c2.gameover && c2.next && c2.next.pLives >= 3 && c2.next.continues === 0;
  add('C2.lastLifeLeak', c2bug === true, { gameover: c2.gameover, next: c2.next, hearts: c2.hearts, verdict: c2.gameover ? 'gameover-correct' : c2bug ? 'BUG: skipped gameover and refilled lives' : 'other' });
  await shot('e5_c2_final');
} catch (e) {
  add('SCRIPT_EXCEPTION', false, String(e && e.stack || e));
  L('EXC ' + String(e && e.stack || e));
}

const rep = await T.report();
const errs = (rep.errors || []).filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource|net::ERR_/.test(String(e)));
add('noJsErrors', errs.length === 0, errs.slice(0, 6));
add('httpOk', (rep.httpBad || []).length === 0, (rep.httpBad || []).slice(0, 8));
const { out, json } = save(R, { log, heap: await heap(T) });
fs.writeFileSync('tools/reports/_runner/qa_edge.json', json);
console.log('[qa-edge] ' + JSON.stringify({ checks: out.checks.length, failed: out.failed.map((f) => f.name + ':' + JSON.stringify(f.extra).slice(0, 260)) }));
try { await T.close(); } catch (e) {}
process.exit(0);
