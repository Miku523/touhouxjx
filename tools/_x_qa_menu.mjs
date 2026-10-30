import fs from 'node:fs';
import { sleep } from './_pt_core.mjs';
import { bootGame, info, advanceDialogue, heap, mk } from './_x_qa_lib.mjs';

const PORT = 9456;
const SHOT = 'tools/shots/_qa_player';
const OUT = 'tools/reports/_runner/qa_menu.json';
fs.mkdirSync(SHOT, { recursive: true });
fs.mkdirSync('tools/reports/_runner', { recursive: true });

const qa = mk({ shots: [], notes: [], seq: [] });
const shot = async (T, name) => { const p = SHOT + '/' + name; await T.shot(p); qa.records.shots.push(p); return p; };
const btnTexts = (s) => (s.buttons || []).map((b) => b.t);
const has = (s, re) => (s.buttons || []).some((b) => re.test(b.t));

const { T, bootDone } = await bootGame(PORT, { width: 1280, height: 720 });
let crash = null; let report = null; let s = null;
const ui = () => T.eval('(() => { const a = window.__game.audio || {}; return { muted: !!a.muted, musicOn: a.musicOn !== false, scheme: window.__game.input ? window.__game.input.scheme : null, lang: document.documentElement.lang, frameCap: window.__game.frameCap, quality: window.__game.quality, musicSong: a.currentSong || null, musicPlaying: !!a.musicPlaying }; })()');

try {
  T.clearCollection();
  s = await info(T);
  qa.add('title.bootdone', bootDone && s.bootDone, { bootDone, s: s.bootDone });
  qa.add('title.state.menu', s.state === 'menu', s.state);
  qa.add('title.overlay.visible', s.overlayCls != null && !/hidden/.test(s.overlayCls), s.overlayCls);
  qa.add('title.buttons>=6', s.buttons.length >= 6, btnTexts(s));
  qa.add('title.extra.locked', /locked/.test((s.buttons.find((b) => /EXTRA/.test(b.t)) || {}).cls || ''), (s.buttons.find((b) => /EXTRA/.test(b.t)) || {}));
  await shot(T, 'm01_title.png');

  /* ---- 1. 操作说明 ---- */
  await T.key('Slash');
  qa.add('help.open', await T.waitFor('window.__game._page === "help"', 3000), await T.eval('window.__game._page'));
  s = await info(T);
  qa.add('help.rows', s.buttons.length >= 10, s.buttons.length);
  qa.add('help.title', /操作说明|HOW TO PLAY|遊び方|操作说明/.test(s.titleText || ''), s.titleText);
  await shot(T, 'm02_help.png');
  await T.key('Escape'); await sleep(400);
  s = await info(T);
  qa.add('help.esc->title', s.state === 'menu' && s.page === 'title', { state: s.state, page: s.page });

  /* ---- 2. 音乐回忆室 ---- */
  await T.key('KeyM');
  qa.add('music.open', await T.waitFor('window.__game.musicRoom && window.__game.musicRoom.visible', 3000));
  s = await info(T);
  qa.add('music.state.menu', s.state === 'menu', s.state);
  const mr = await T.eval('(() => { const r = window.__game.musicRoom; const el = document.getElementById("musicRoom"); return { visible: r.visible, idx: r.index, tracks: r.tracks.length, unknown: !!(r._warn), elCls: el ? el.className : null, rows: r.rows ? r.rows.length : null }; })()');
  qa.add('music.rows>0', (mr.rows || 0) > 0, mr);
  await shot(T, 'm03_music.png');
  await T.key('ArrowDown'); await sleep(150);
  await T.key('Enter'); await sleep(300);
  let mr2 = await T.eval('(() => { const r = window.__game.musicRoom; return { warn: !!r._warn, warnSel: r._warn ? r._warn.sel : null, idx: r.index }; })()');
  qa.add('music.enter.responds', mr2.warn || mr2.idx > 0, mr2);
  if (mr2.warn) { await T.key('Enter'); await sleep(700); }
  const au = await ui();
  qa.add('music.play.started', !!au.musicSong, au);
  await shot(T, 'm04_music_play.png');
  await T.key('Escape'); await sleep(500);
  s = await info(T);
  qa.add('music.esc->title', s.state === 'menu' && !s.musicVisible && s.page === 'title', { state: s.state, musicVisible: s.musicVisible, page: s.page });

  /* ---- 3. 设置页 ---- */
  const before = await ui();
  await T.key('KeyS');
  qa.add('settings.open', await T.waitFor('window.__game._page === "settings"', 3000), await T.eval('window.__game._page'));
  s = await info(T);
  qa.add('settings.rows>=14', s.buttons.length >= 14, s.buttons.length);
  qa.add('settings.hasLang', has(s, /语言|LANG/), btnTexts(s));
  await shot(T, 'm05_settings.png');
  await T.key('KeyF'); await sleep(250);
  let u2 = await ui();
  qa.add('settings.F.frameCap', u2.frameCap !== before.frameCap, { before: before.frameCap, after: u2.frameCap });
  await T.key('KeyF'); await sleep(150); await T.key('KeyF'); await sleep(150); await T.key('KeyF'); await sleep(250);
  u2 = await ui();
  qa.add('settings.F.restored', u2.frameCap === before.frameCap, { want: before.frameCap, got: u2.frameCap });
  await T.key('KeyG'); await sleep(250);
  u2 = await ui();
  qa.add('settings.G.quality', u2.quality !== before.quality, { before: before.quality, after: u2.quality });
  await T.key('KeyG'); await sleep(150); await T.key('KeyG'); await sleep(250);
  u2 = await ui();
  qa.add('settings.G.restored', u2.quality === before.quality, { want: before.quality, got: u2.quality });
  await T.key('KeyM'); await sleep(250);
  u2 = await ui();
  qa.add('settings.M.mute', u2.muted !== before.muted, { before: before.muted, after: u2.muted });
  await T.key('KeyM'); await sleep(250);
  await T.key('KeyB'); await sleep(250);
  u2 = await ui();
  qa.add('settings.B.musicToggle', u2.musicOn !== before.musicOn, { before: before.musicOn, after: u2.musicOn });
  await T.key('KeyB'); await sleep(250);
  await T.key('KeyU'); await sleep(300);
  u2 = await ui();
  qa.add('settings.U.scheme', u2.scheme === 'wasd-mouse', { before: before.scheme, after: u2.scheme });
  await T.key('KeyU'); await sleep(300);
  // 语言连切 4 次回环
  const lang0 = before.lang;
  const langSeen = [];
  for (let i = 0; i < 4; i++) { await T.key('KeyL'); await sleep(700); langSeen.push(await T.eval('document.documentElement.lang')); }
  qa.add('settings.L.cycles4', new Set(langSeen).size >= 3, langSeen);
  qa.add('settings.L.restored', langSeen[3] === lang0, { want: lang0, seen: langSeen });
  s = await info(T);
  qa.add('settings.afterLang.stillSettings', s.page === 'settings' && s.buttons.length >= 14, { page: s.page, n: s.buttons.length });
  // 音量行 ← → 调整
  const volBefore = await T.eval('window.__game.audio.musicVolume');
  await T.eval('window.__game._selectMenu(2)'); await sleep(150);
  await T.key('ArrowLeft'); await sleep(250);
  const volAfter = await T.eval('window.__game.audio.musicVolume');
  qa.add('settings.vol.leftAdjusts', volAfter !== volBefore, { volBefore, volAfter });
  await T.key('ArrowRight'); await sleep(200);
  // 按键设置
  await T.key('KeyK');
  qa.add('keybinds.open', await T.waitFor('window.__game._page === "keybinds"', 3000), await T.eval('window.__game._page'));
  s = await info(T);
  qa.add('keybinds.rows>=8', s.buttons.length >= 8, s.buttons.length);
  await shot(T, 'm06_keybinds.png');
  await T.key('Escape'); await sleep(400);
  qa.add('keybinds.esc->settings', await T.waitFor('window.__game._page === "settings"', 2500), await T.eval('window.__game._page'));
  await T.key('Escape'); await sleep(400);
  s = await info(T);
  qa.add('settings.esc->title', s.state === 'menu' && s.page === 'title', { state: s.state, page: s.page });

  /* ---- 4. 难度 / 选人页 ---- */
  await T.key('Enter');
  qa.add('difficulty.open', await T.waitFor('window.__game._page === "difficulty"', 3000));
  s = await info(T);
  qa.add('difficulty.cards', s.buttons.filter((b) => /diff-card/.test(b.cls)).length === 4, s.buttons.map((b) => b.t));
  await shot(T, 'm07_difficulty.png');
  const counts = {};
  for (const [k, d] of [['KeyE', 'Easy'], ['KeyN', 'Normal'], ['KeyH', 'Hard'], ['KeyL', 'Lunatic']]) {
    await T.key(k); await sleep(350);
    const sub = await T.eval('document.getElementById("subtitle").textContent.trim()');
    counts[d] = sub;
    qa.add('difficulty.' + d + '.charselect', await T.waitFor('window.__game._page === "charselect"', 2500), await T.eval('window.__game._page'));
    await T.key('Escape'); await sleep(350);
    await T.waitFor('window.__game._page === "difficulty"', 2000);
  }
  qa.add('difficulty.stageCounts', /5/.test(counts.Easy || '') && /6/.test(counts.Normal || '') && /6/.test(counts.Hard || '') && /6/.test(counts.Lunatic || ''), counts);
  await T.key('Escape'); await sleep(350);
  s = await info(T);
  qa.add('difficulty.esc->title', s.state === 'menu' && s.page === 'title', { state: s.state, page: s.page });

  /* ---- 5. 秘籍解锁 EXTRA ---- */
  for (const ch of '2002081120260909') { await T.key('Digit' + ch); await sleep(55); }
  const unlocked = await T.waitFor('window.__game.unlockedExtra === true', 3000);
  await sleep(300);
  s = await info(T);
  qa.add('secret.unlockExtra', unlocked, await T.eval('window.__game.unlockedExtra'));
  const extraBtn = s.buttons.find((b) => /EXTRA/.test(b.t)) || {};
  qa.add('secret.extraBtnUnlocked', !/locked/.test(extraBtn.cls || 'locked'), extraBtn);
  await shot(T, 'm08_title_unlocked.png');

  /* ---- 6. EXTRA 入口 -> 选人 -> 开打 ---- */
  await T.key('KeyE');
  qa.add('extrachar.open', await T.waitFor('window.__game._page === "extrachar"', 3000), await T.eval('window.__game._page'));
  s = await info(T);
  qa.add('extrachar.cards', s.buttons.filter((b) => /cc-card/.test(b.cls)).length === 2, s.buttons.length);
  await shot(T, 'm09_extrachar.png');
  await T.key('Digit1');
  await sleep(600);
  s = await info(T);
  qa.add('extra.started.dialogue', s.state === 'dialogue' || s.state === 'play', { state: s.state, inExtra: s.inExtra });
  const adv = await advanceDialogue(T, 160);
  qa.add('extra.dialogue.done', adv.ok, adv);
  const inPlay = await T.waitFor('window.__game.state === "play" && !!window.__game.stage && window.__game.inExtra', 10000);
  s = await info(T);
  qa.add('extra.play', inPlay, { state: s.state, inExtra: s.inExtra, page: s.page });
  qa.add('extra.hud.visible', s.hudCls != null && !/hidden/.test(s.hudCls), s.hudCls);
  qa.add('extra.stage.stg', !!s.stage && s.stage.mode === 'stg', s.stage && s.stage.mode);
  await shot(T, 'm10_extra_play.png');
  const bossSeen = await T.waitFor('!!(window.__game.stage && window.__game.stage.boss && window.__game.stage.boss.state !== "dead")', 15000);
  s = await info(T);
  qa.add('extra.boss.appears', bossSeen, s.stage && { key: s.stage.bossKey, st: s.stage.bossState, hp: s.stage.bossHp });
  if (bossSeen) { await shot(T, 'm11_extra_boss.png'); }

  /* ---- 7. 暂停 / 设置(暂停来源) / 恢复 ---- */
  await T.key('Escape'); await sleep(500);
  s = await info(T);
  qa.add('pause.open', s.state === 'paused' && s.page === 'paused', { state: s.state, page: s.page });
  qa.add('pause.items', has(s, /继续/) && has(s, /设置/) && has(s, /重新开始/) && has(s, /退出到标题/), btnTexts(s));
  await shot(T, 'm12_pause.png');
  await T.key('KeyS');
  qa.add('pause.settings.open', await T.waitFor('window.__game._page === "settings" && window.__game.state === "paused"', 3000), await T.eval('window.__game._page'));
  s = await info(T);
  qa.add('pause.settings.hasRestartRow', has(s, /重新开始本关/), btnTexts(s));
  await T.key('Escape'); await sleep(400);
  s = await info(T);
  qa.add('pause.settings.esc->pause', s.state === 'paused' && s.page === 'paused', { state: s.state, page: s.page });
  await T.key('Escape'); await sleep(600);
  s = await info(T);
  qa.add('pause.resume', s.state === 'play' && !!s.stage, { state: s.state, hasStage: !!s.stage });
  // 暂停中画面不再推进
  await T.key('Escape'); await sleep(350);
  const tx1 = await T.eval('window.__game.stage ? window.__game.stage.t : -1');
  await sleep(600);
  const tx2 = await T.eval('window.__game.stage ? window.__game.stage.t : -1');
  qa.add('pause.freezesStage', tx1 === tx2, { tx1, tx2 });
  await T.key('Escape'); await sleep(500);

  /* ---- 8. 暂停 -> 退出到标题 ---- */
  await T.key('Escape'); await sleep(400);
  await T.key('KeyQ'); await sleep(500);
  s = await info(T);
  qa.add('quit.confirmOpen', /hidden/.test(s.overlayCls) === false && (s.page === 'quit' || /退出/.test(s.titleText || '')), { state: s.state, page: s.page, title: s.titleText });
  await shot(T, 'm13_quit_confirm.png');
  await T.key('KeyQ'); await sleep(700);
  s = await info(T);
  qa.add('quit->title', s.state === 'menu' && s.page === 'title' && !s.stage, { state: s.state, page: s.page, stage: !!s.stage });
  qa.add('quit.inExtraCleared', s.inExtra === false, s.inExtra);
  qa.add('quit.hud.hidden', s.hudCls != null && /hidden/.test(s.hudCls), s.hudCls);

  /* ---- 9. 标题长挂机 20s + 内存 ---- */
  const h0 = await heap(T);
  const steps0 = await T.eval('window.__game.loop ? (window.__game.loop.frame || 0) : 0');
  await sleep(20000);
  const h1 = await heap(T);
  const steps1 = await T.eval('window.__game.loop ? (window.__game.loop.frame || 0) : 0');
  s = await info(T);
  qa.add('idle.stateStable', s.state === 'menu' && s.page === 'title', { state: s.state, page: s.page });
  qa.add('idle.loopAlive', steps1 > steps0, { steps0, steps1 });
  qa.add('idle.heapBounded', !h0 || !h1 || h1.used - h0.used < 30, { h0, h1 });
  const mi0 = await T.eval('window.__game.menuIndex');
  await T.key('ArrowDown'); await sleep(250);
  const mi1 = await T.eval('window.__game.menuIndex');
  qa.add('idle.titleResponsive', mi0 !== mi1, { mi0, mi1 });
  await T.key('ArrowUp'); await sleep(200);
  await shot(T, 'm14_title_idle.png');

  report = await T.report();
  const errs = (report.errors || []).filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(typeof e === 'string' ? e : JSON.stringify(e)));
  qa.add('console.noErrors', errs.length === 0, errs.slice(0, 10));
  qa.add('net.noBad', (report.httpBad || []).length === 0, report.httpBad);
} catch (e) {
  crash = String((e && e.stack) || e);
} finally {
  try { const r = qa.save(OUT, { crash, report, info: s }); fs.writeFileSync(OUT, r.json); console.log(JSON.stringify({ pass: r.out.pass, failed: r.out.failed, crash, shots: qa.records.shots }, null, 2)); } catch (e) { console.log('SAVE FAIL ' + e); }
  try { await T.close(); } catch (e) {}
}
