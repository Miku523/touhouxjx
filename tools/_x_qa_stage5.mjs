/** Stage5 midboss/breath-zone/deferred-clear QA v4 (player mode). Port 9456. */
import { sleep } from './_pt_core.mjs';
import { bootGame, info, warp, mk, heap } from './_x_qa_lib.mjs';
import fs from 'node:fs';

const PORT = 9456;
const OUT = 'tools/shots/_qa_player/';
const R = 'tools/reports/_runner/qa_stage5.log';
const { add, save } = mk([]);
const log = [];
const L = (s) => { log.push(s); console.log('[s5]', s); };
const { T, bootDone } = await bootGame(PORT);
add('boot', bootDone);
const shot = async (n) => { try { await T.shot(OUT + n + '.png'); } catch (e) {} };
const wait = (expr, ms) => T.waitFor(expr, ms);
const ev = (expr) => T.eval(expr);
const killBoss = () => ev('(() => { const s = window.__game.stage; if (!s || !s.boss) return false; s.boss.hp = 0; s.boss.state = "defeat"; s.boss.defeatT = 2.19; return true; })()');
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
const settle = async (ms = 2600) => { await sleep(ms); return pumpUntil('window.__game.state === "play" && !(window.__game.dialogue && window.__game.dialogue.active)', 20000); };

try {
  await warp(T, 4);
  let s = await info(T);
  add('S4.warp', s.state === 'play' && s.levelIndex === 3 && s.stage && s.stage.mode === 'stg', { lvl: s.levelIndex, mode: s.stage && s.stage.mode });
  await ev('window.__game.stage.beginBoss()');
  await wait('window.__game.stage.boss && window.__game.stage.bossStarted', 8000);
  await killBoss();
  await wait('window.__game.state === "clear"', 10000);
  let pr = await pumpUntil('window.__game.levelIndex === 4 && window.__game.state === "play" && window.__game.stage && window.__game.stage.mode === "platform"', 45000);
  pr = await settle(2600);
  s = await info(T);
  add('S5.enter', pr.ok && s.levelIndex === 4 && s.stage.mode === 'platform', { pr, lvl: s.levelIndex, mode: s.stage && s.stage.mode, name: s.stageName, power: s.stage && s.stage.power, lives: s.stage && s.stage.lives });
  await shot('s5_2_stage5_enter');

  /* natural midboss trigger */
  await ev('(() => { const p = window.__game.stage.player; p.x = 1225; p.vy = 0; return true; })()');
  await T.keyDown('ArrowRight');
  let trig = await wait('window.__game.stage.bossPending || window.__game.state === "dialogue" || (window.__game.stage.boss && window.__game.stage.bossStarted)', 8000);
  await T.keyUp('ArrowRight');
  const trigInfo = await ev('(() => { const g = window.__game, s = g.stage; return { state: g.state, px: Math.round(s.player.x), bossPending: !!s.bossPending, boss: s.boss ? s.boss.key : null }; })()');
  L('trigger ' + JSON.stringify({ trig, trigInfo }));
  pr = await pumpUntil('window.__game.stage.boss && window.__game.stage.bossStarted', 25000);
  const midNow = await ev('!!window.__game.stage.bossMid');
  s = await info(T);
  add('S5.midbossNaturalTrigger', trig, { trigInfo, bossTaps: pr.taps });
  add('S5.midbossSpawn', pr.ok && s.stage && s.stage.bossKey === 'youmu' && midNow === true, { key: s.stage && s.stage.bossKey, hp: s.stage && s.stage.bossHp, state: s.state, mid: midNow, taps: pr.taps });
  await shot('s5_3_midboss');

  /* A. die during midboss battle, kill midboss while death countdown runs */
  const deathSet = await ev('(() => { const s = window.__game.stage, p = s.player; p.lives = 2; p.die(); return { st: s.state, lives: p.lives, alive: p.alive }; })()');
  let ok = await wait('window.__game.stage.state === "dead"', 4000);
  add('S5.A.deathState', ok, { set: deathSet, st: await ev('window.__game.stage.state') });
  const killed = await ev('(() => { const s = window.__game.stage; const b = s.boss; if (!b) return false; b.hp = 0; b.state = "defeat"; b.defeatT = 0.05; return true; })()');
  ok = await wait('window.__game.stage.state === "play" && !!window.__game.stage.player.alive && !window.__game.stage.boss && !!window.__game.stage.midbossDone', 9000);
  s = await info(T);
  add('S5.A.deferredClear', ok, { killed, state: s.state, stageSt: s.stage && s.stage.st, lives: s.stage && s.stage.lives, power: s.stage && s.stage.power });
  const drops = await ev('window.__game.stage.pickups.filter((p) => p.kind === "oneup").length');
  add('S5.A.oneupDrop', drops >= 1, drops);
  pr = await settle(2600);
  add('S5.A.backToPlay', pr.ok, pr);
  await shot('s5_4_after_deferred');

  /* breath zone: standing near midboss arena, no yuyuko yet */
  await sleep(1200);
  s = await info(T);
  const earlyBoss = await ev('!!(window.__game.stage.boss && window.__game.stage.boss.key === "yuyuko")');
  add('S5.breathGate', s.state === 'play' && !earlyBoss, { state: s.state, boss: s.stage && s.stage.bossKey, midClearT: await ev('window.__game.stage._midClearT'), px: s.stage && s.stage.px });

  /* B. gameover in breath zone -> 从中途继续 keeps midboss done */
  await ev('(() => { const p = window.__game.stage.player; p.lives = 1; p.die(); return true; })()');
  ok = await wait('window.__game.state === "gameover"', 10000);
  s = await info(T);
  const labels = s.buttons.map((b) => b.t);
  add('S5.B.gameover', ok, { state: s.state, stageSt: s.stage && s.stage.st, lives: s.stage && s.stage.lives });
  add('S5.B.midLabel', labels.join('|').includes('从中途继续'), labels);
  await shot('s5_5_gameover_mid');
  await T.key('Enter');
  pr = await pumpUntil('window.__game.state === "play" && window.__game.levelIndex === 4 && !!window.__game.stage && !window.__game.stage.boss', 15000);
  s = await info(T);
  const md2 = await ev('!!window.__game.stage.midbossDone');
  add('S5.B.resumeMid', pr.ok && md2 === true, { pr, lvl: s.levelIndex, boss: s.stage && s.stage.bossKey, st: s.stage && s.stage.st, lives: s.stage && s.stage.lives, cont: s.continues });
  add('S5.B.continues', s.continues === 1, s.continues);
  await shot('s5_6_after_midgameover');

  /* breath-zone resume -> walk to boss trigger line; yuyuko must spawn */
  const gate = await ev('(() => { const s = window.__game.stage; const p = s.player; const bossX = s.level.w - 520; const triggerX = Math.max(200, Math.min(s.goalX - 120, bossX - 420)); return { midClearX: s._midClearX, midClearT: s._midClearT, px: p.x, goalX: s.goalX, bossX, triggerX, w: s.level.w }; })()');
  L('gate ' + JSON.stringify(gate));
  await ev('(() => { const s = window.__game.stage; const p = s.player; p.x = s.goalX - 460; p.vy = 0; return p.x; })()');
  trig = await wait('window.__game.stage.bossPending || window.__game.state === "dialogue" || (window.__game.stage.boss && window.__game.stage.boss.key === "yuyuko")', 8000);
  pr = await pumpUntil('window.__game.stage.boss && window.__game.stage.bossStarted && window.__game.stage.boss.key === "yuyuko"', 25000);
  s = await info(T);
  add('S5.breathResumeBoss', trig && pr.ok, { trig, pr, boss: s.stage && s.stage.bossKey, hp: s.stage && s.stage.bossHp, state: s.state, px: s.stage && s.stage.px });
  await shot('s5_7_yuyuko');
  await killBoss();
  await wait('window.__game.state === "clear"', 10000);
  pr = await pumpUntil('window.__game.levelIndex === 5 && window.__game.state === "play" && window.__game.stage && window.__game.stageName === "STAGE 6"', 45000);
  s = await info(T);
  add('S6.enter', pr.ok, { pr, lvl: s.levelIndex, st: s.state, name: s.stageName, power: s.stage && s.stage.power, lives: s.stage && s.stage.lives });
  await shot('s5_8_stage6');
  const t1 = (await info(T)).stage && (await info(T)).stage.t;
  await sleep(1500);
  const t2 = (await info(T)).stage && (await info(T)).stage.t;
  add('S6.clock', t2 > t1, { before: t1, after: t2 });
} catch (e) {
  add('SCRIPT_EXCEPTION', false, String(e && e.stack || e));
  L('EXC ' + String(e && e.stack || e));
}

const rep = await T.report();
const errs = (rep.errors || []).filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(String(e)));
add('noJsErrors', errs.length === 0, errs.slice(0, 6));
add('httpOk', (rep.httpBad || []).length === 0, (rep.httpBad || []).slice(0, 6));
const { out, json } = save(R, { log, heap: await heap(T) });
fs.writeFileSync('tools/reports/_runner/qa_stage5.json', json);
console.log('[qa-stage5] ' + JSON.stringify({ checks: out.checks.length, failed: out.failed.map((f) => f.name + ':' + JSON.stringify(f.extra)) }));
try { await T.close(); } catch (e) {}
process.exit(out.pass ? 0 : 1);
