/** QA: EXTRA deep chain test — 4-boss chain, restart-in-chain, gameover-continue-in-EXTRA, ending. */
import { sleep } from './_pt_core.mjs';
import { bootGame, advanceDialogue } from './_x_qa_lib.mjs';
import fs from 'node:fs';

const PORT = 9460;
const SHOTS = 'tools/shots/_qa_player';
const checks = [];
const add = (name, ok, extra = null) => { checks.push({ name, ok: !!ok, extra }); return !!ok; };
const out = (o) => console.log('[qa-extra] ' + JSON.stringify(o));

const { T } = await bootGame(PORT);

const S = () => T.eval(`(() => { const g = window.__game, s = g.stage;
  const t = (id) => { const e = document.getElementById(id); return e ? e.textContent.trim().replace(/\\s+/g, ' ') : null; };
  const btns = (() => { const b = document.getElementById('buttons'); return b ? [...b.querySelectorAll('.btn')].map((e) => e.textContent.trim().replace(/\\s+/g, ' ')) : []; })();
  return { state: g.state, page: g._page, inExtra: !!g.inExtra, dlgActive: !!(g.dialogue && g.dialogue.active), dlgTyping: !!(g.dialogue && g.dialogue.isTyping),
    continues: g.continues, lives: g.lives, buttons: btns, title: t('title'), sub: t('subtitle'), hint: t('hint'), overlay: document.getElementById('overlay').className,
    hudCls: document.getElementById('hud').className, bossBar: document.getElementById('bossBar').className, bossName: t('bossName'),
    bossCardMode: t('bossCardMode'), timer: t('timer'), stageName: t('stageName'), banner: t('banner'),
    stage: s ? { mode: s.mode, st: s.state, chainIdx: s.chainIdx, chainWaiting: !!s.chainWaiting, chainCleared: s.chainCleared ? [...s.chainCleared] : null,
      bossKey: s.boss ? s.boss.key : null, bossState: s.boss ? s.boss.state : null, bossHp: s.boss ? Math.round(s.boss.hp) : null, bossMaxHp: s.boss && s.boss.maxHp ? Math.round(s.boss.maxHp) : null,
      bossStarted: !!s.bossStarted, lives: s.player ? s.player.lives : null, alive: s.player ? s.player.alive : null, power: s.player ? Math.round(s.player.power) : null } : null,
    extraIdx: g._extraChainIdx ?? null, t: s && s.t != null ? +Number(s.t).toFixed(2) : null }; })()`);
const shot = (name) => T.shot(SHOTS + '/' + name + '.png');

async function pump(cond, ms = 25000) {
  const end = Date.now() + ms; let last = null;
  while (Date.now() < end) {
    last = await S();
    if (await T.eval('(() => { try { return !!(' + cond + '); } catch (e) { return false; } })()')) return { ok: true, info: last };
    if (last.dlgActive || last.state === 'ending') await T.key('Enter');
    else await T.eval('(function () { const s = window.__game.stage; if (s && s.player) s.player.invuln = Math.max(s.player.invuln || 0, 9); })()');
    await sleep(130);
  }
  return { ok: false, info: last };
}
const killBoss = () => T.eval('(() => { const s = window.__game.stage; if (!s || !s.boss) return false; const b = s.boss; b.hp = 0; b.state = "defeat"; b.defeatT = 2.19; if (s.bullets) s.bullets.clear(); return { key: b.key, hp: b.hp }; })()');

/* 1. unlock EXTRA via secret code on title */
for (const ch of '2002081120260909') { await T.key('Digit' + ch); await sleep(30); }
await sleep(300);
let s = await S();
add('unlock.secretCode', (await T.eval('!!window.__game.unlockedExtra')), await T.eval('JSON.stringify({unlockedExtra:window.__game.unlockedExtra, extraChars:window.__game.extraChars})'));
const extraBtn = s.buttons.find((b) => b.includes('EXTRA'));
add('unlock.extraBtnUnlocked', !!extraBtn && !extraBtn.includes('LOCKED'), extraBtn);

/* 2. title -> EXTRA char select -> reimu -> intro dialogue -> play */
await T.key('KeyE'); await sleep(250);
s = await S();
add('extra.pageCharSelect', s.page === 'extrachar', s.page);
add('extra.charCards', s.buttons.length === 2, s.buttons);
await T.key('Digit1');
const intro = await advanceDialogue(T, 140);
add('extra.introDialogueDone', intro.ok, intro.last);
const play = await pump('window.__game.state === "play" && window.__game.stage', 15000);
s = await S();
add('extra.playEntered', play.ok && s.inExtra && s.stage && s.stage.mode === 'stg', s.stage);
await shot('x_extra_1_intro_play');

/* 3. chain 4 encounters */
const EXPECT = ['sakuya', 'remilia', 'sakuya', 'flandre'];
let restartTest = null, gameoverTest = null, clearSeen = false;
for (let i = 0; i < 4; i++) {
  const w = await pump('window.__game.stage && window.__game.stage.chainIdx === ' + i + ' && window.__game.stage.boss', 30000);
  add('enc' + i + '.bossAppeared', w.ok, w.info && w.info.stage);
  if (!w.ok) break;
  s = await S();
  add('enc' + i + '.bossKey', s.stage.bossKey === EXPECT[i], { got: s.stage.bossKey, want: EXPECT[i] });
  add('enc' + i + '.chainIdx', s.stage.chainIdx === i, s.stage.chainIdx);
  add('enc' + i + '.extraIdx', s.extraIdx === i, s.extraIdx);
  add('enc' + i + '.bossBarVisible', !/hidden/.test(s.bossBar), { bossBar: s.bossBar, bossName: s.bossName });
  if (i === 0) await shot('x_extra_2_sakuya1');
  if (i === 1) {
    await shot('x_extra_3_remilia');
    /* 3a. pause -> restart during EXTRA chain: must resume same encounter via chainFrom */
    await T.key('Escape');
    let p = await pump('window.__game.state === "paused"', 5000);
    add('restart.pauseOpened', p.ok, p.info && p.info.overlay);
    await T.key('KeyR'); await sleep(400);
    await T.key('KeyR');
    const r = await pump('window.__game.state === "play" && window.__game.stage && window.__game.stage.boss && window.__game.stage.chainIdx === 1', 15000);
    s = r.ok ? await S() : null;
    restartTest = s && { ok: r.ok, continues: s.continues, power: s.stage.power, lives: s.stage.lives, key: s.stage.bossKey, chainIdx: s.stage.chainIdx, extraIdx: s.extraIdx };
    add('restart.preservesChain', r.ok && s && s.stage.chainIdx === 1 && s.stage.bossKey === 'remilia' && s.continues === 0, restartTest);
    add('restart.powerFloor', s && s.stage.power >= 72, restartTest);
    await shot('x_extra_4_restart_remilia');
  }
  if (i === 2) {
    await shot('x_extra_5_sakuya2');
    /* 3b. gameover during EXTRA -> continue from current chain; continues must NOT increment */
    await T.eval('(() => { const p = window.__game.stage.player; p.lives = 1; p.die(); return true; })()');
    const g = await pump('window.__game.state === "gameover"', 12000);
    s = g.ok ? await S() : null;
    gameoverTest = { ok: g.ok, buttons: s && s.buttons, sub: s && s.sub, continues: s && s.continues, hint: s && s.hint };
    add('gameover.shown', g.ok);
    add('gameover.continueLabel', !!(s && s.buttons.join('|').includes('从第 3 战继续')), s && s.buttons);
    add('gameover.noContinuesInExtra', s && s.continues === 0, s && s.continues);
    if (g.ok) { await shot('x_extra_6_gameover'); await T.key('Enter'); }
    const c = await pump('window.__game.state === "play" && window.__game.stage && window.__game.stage.boss && window.__game.stage.chainIdx === 2', 15000);
    s = c.ok ? await S() : null;
    add('gameover.continueFromChain', c.ok && s && s.stage.chainIdx === 2 && s.stage.bossKey === 'sakuya', s && s.stage);
    add('gameover.continueNoCounter', s && s.continues === 0, s && s.continues);
    await shot('x_extra_7_continue');
  }
  const kb = await killBoss();
  add('enc' + i + '.killed', !!kb, kb);
  if (i < 3) {
    const nc = await pump('window.__game.stage && window.__game.stage.chainIdx === ' + (i + 1), 25000);
    s = nc.ok ? await S() : null;
    add('enc' + i + '.advanced', nc.ok, s && s.stage);
    add('enc' + i + '.clearedListed', !!(s && s.stage.chainCleared && s.stage.chainCleared.includes(i)), s && s.stage.chainCleared);
  } else {
    const fc = await pump('window.__game.state === "clear" || window.__game.state === "ending"', 25000);
    clearSeen = fc.ok;
    add('extra.clearReached', fc.ok, fc.info && fc.info.state);
    await shot('x_extra_8_clear');
  }
}

/* 4. ending -> title */
const ent = await pump('window.__game.state === "ending"', 25000);
s = ent.ok ? await S() : null;
add('extra.endingStarted', ent.ok, s && { state: s.state, title: s.title });
await shot('x_extra_9_ending');
const done = await advanceDialogue(T, 400);
const back = await pump('window.__game.state === "menu"', 25000);
s = await S();
add('extra.endingToTitle', back.ok && s.state === 'menu', { state: s.state, page: s.page, buttons: s.buttons.slice(0, 3) });
add('extra.endingClean', done.ok, done.last);

/* 5. console/network */
const rep = await T.report();
const errs = rep.errors || [];
const benign = errs.filter((e) => /ERR_CONNECTION_REFUSED/.test(String(e)) || /Failed to load resource/.test(String(e)));
const real = errs.filter((e) => !benign.includes(e));
add('js.noErrors', real.length === 0, { real, benign: benign.length });
add('net.noBad', (rep.httpBad || []).length === 0, rep.httpBad);
out({ checks: checks.length, failed: checks.filter((c) => !c.ok).length, restartTest, gameoverTest, clearSeen });
const failed = checks.filter((c) => !c.ok);
fs.mkdirSync('tools/reports/_runner', { recursive: true });
fs.writeFileSync('tools/reports/_runner/qa_extra.json', JSON.stringify({ pass: failed.length === 0, checks, failed, restartTest, gameoverTest, clearSeen, report: { errors: errs, netFails: rep.netFails, httpBad: rep.httpBad } }, null, 2));
await T.close();
console.log('DONE ' + (failed.length === 0 ? 'PASS' : 'FAIL ' + JSON.stringify(failed.map((f) => f.name + ':' + JSON.stringify(f.extra)).slice(0, 8))));
