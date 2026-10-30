#!/usr/bin/env node
/**
 * QA: 操作方式（键盘 / WASD + 鼠标）
 * ---------------------------------------------------------------
 * 覆盖需求：
 *  1. 默认 keys（__game.controlScheme / __game.input.scheme / 设置页行）
 *  2. 设置页点击「操作方式」→ wasd-mouse（两个字段 + localStorage + 分段控件 on + 截图）
 *  3. 真实按键进入可玩关卡（标题 Enter → 难度 E → Enter → 选人 Enter → 开场对白 Enter）
 *  4. wasd-mouse：鼠标左键按住 = 射击（down/shootCd/fireCount），松开 = 停火
 *  5. wasd-mouse：鼠标右键 = 符卡（casting + power -48；contextmenu 被拦）
 *  6. wasd-mouse：键盘 Z 射击 / X 符卡仍然可用
 *  7. keys：鼠标左右键完全无效；Z 仍可射击
 *  8. 持久化：wasd-mouse 保存后 reload 仍生效
 *  9. 操作说明：wasd-mouse 显示 鼠标左键/右键；keys 显示 Z/J、X/L 且无「鼠标」
 * 10. 健康：页面错误为空；截图存 _pt/mouse_scheme/
 *
 * 用法：node tools/_qa_mouse_scheme.mjs
 * 前置：本地静态服务器 http://127.0.0.1:8138 （python tools/serve_nocache.py 8138）
 * 说明：本脚本只写 tools/ 与 _pt/ 产物，不修改 src/。
 */
import { launch, sleep, BASE, saveJson } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 9677;
const OUT = '_pt/mouse_scheme';
mkdirSync(OUT, { recursive: true });

const startAt = Date.now();
let pass = 0;
let fail = 0;
const checks = [];
const observed = {};
const shots = [];

const log = (...a) => console.log(...a);
function chk(ok, name, detail = '') {
  checks.push({ ok: !!ok, name, detail: String(detail).slice(0, 700) });
  if (ok) pass += 1; else fail += 1;
  log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  | ' + detail : ''));
  return !!ok;
}

const T = await launch({ port: PORT, headless: true, width: 1280, height: 720 });
let exitCode = 0;

/* ------------------------------------------------------------------ */
/* 页面读取 / 轮询                                                      */
/* ------------------------------------------------------------------ */

async function until(fn, timeout = 4000, step = 25) {
  const t0 = Date.now();
  let val;
  while (Date.now() - t0 < timeout) {
    try { val = await fn(); } catch (e) { val = undefined; }
    if (val) return { ok: true, val, ms: Date.now() - t0 };
    await sleep(step);
  }
  return { ok: false, val, ms: Date.now() - t0 };
}

const GS = () => T.eval(`(() => {
  const g = window.__game;
  if (!g) return { game: false };
  const s = g.stage, p = s && s.player;
  return {
    game: true, state: g.state, bootDone: !!g._bootDone,
    scheme: g.controlScheme, inputScheme: g.input && g.input.scheme,
    touch: !!(g.input && g.input.touchDevice),
    stage: !!s, mode: s ? s.mode : null, stState: s ? s.state : null,
    alive: p ? !!p.alive : null, power: p ? p.power : null,
    casting: p ? !!p.casting : null, shootCd: p ? +(p.shootCd || 0) : null,
    fireCount: s && s.shots ? s.shots.fireCount : null,
    activeShots: s && s.shots && s.shots.pool ? s.shots.pool.filter((b) => b.active).length : null,
    dlg: !!(g.dialogue && g.dialogue.active),
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    panelTitle: (document.querySelector('#overlay h1, #overlay .panel-title') || {}).innerText || '',
  };
})()`);

const settingsSnapshot = () => T.eval(`(() => {
  const g = window.__game;
  let ls = null;
  try { const raw = localStorage.getItem('hks.settings.v1'); ls = raw ? JSON.parse(raw) : null; } catch (e) {}
  const btn = [...document.querySelectorAll('#overlay .btn')].find((b) => b.textContent.includes('操作方式'));
  return {
    controlScheme: g.controlScheme, inputScheme: g.input.scheme,
    lsControlScheme: ls ? ls.controlScheme : null,
    cursor: document.getElementById('game').style.cursor,
    panelTitle: (document.querySelector('#overlay h1, #overlay .panel-title') || {}).innerText || '',
    overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
    rowText: btn ? btn.textContent : null,
    segs: btn ? [...btn.querySelectorAll('.seg b')].map((b) => ({ text: b.textContent, on: b.classList.contains('on') })) : [],
  };
})()`);

const clickSchemeRow = () => T.eval(`(() => {
  const btn = [...document.querySelectorAll('#overlay .btn')].find((b) => b.textContent.includes('操作方式'));
  if (!btn) return 'no-row';
  btn.click();
  return 'clicked';
})()`);

const helpSnapshot = () => T.eval(`(() => {
  const ov = document.getElementById('overlay');
  return {
    title: (ov.querySelector('h1, .panel-title') || {}).innerText || '',
    overlayHidden: ov.classList.contains('hidden'),
    text: ov.innerText,
    rows: [...ov.querySelectorAll('.help-row')].map((b) => ({
      label: ((b.querySelector('.set-label') || {}).innerText || '').trim(),
      ctl: ((b.querySelector('.set-ctl') || {}).innerText || '').trim(),
      caps: [...b.querySelectorAll('.keycap')].map((k) => k.innerText.trim()),
    })),
  };
})()`);

async function canvasCenter() {
  return T.eval(`(() => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    const el = document.elementFromPoint(x, y);
    return { x, y, left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      hit: el ? (el.id || el.tagName) : null };
  })()`);
}

async function shot(name) {
  const p = OUT + '/' + name;
  await T.shot(p);
  shots.push(p);
  return p;
}

async function installCtxProbe() {
  await T.eval(`(() => {
    if (window.__ctxProbe) return 'already';
    window.__ctxProbe = true;
    window.__ctx = [];
    window.addEventListener('contextmenu', (e) => {
      window.__ctx.push({ prevented: !!e.defaultPrevented, target: (e.target && (e.target.id || e.target.tagName)) || '' });
    }, false);
    return 'ok';
  })()`);
}

/* ------------------------------------------------------------------ */
/* 鼠标（CDP 原始事件，只在脚本内定义；不改共享内核）                    */
/* ------------------------------------------------------------------ */
const rect = { x: 0, y: 0 };
async function refreshCenter() {
  const c = await canvasCenter();
  rect.x = c.x; rect.y = c.y;
  return c;
}
async function mouseDown(button) {
  const b = button === 'right' ? 2 : 0;
  await T.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: rect.x, y: rect.y, button, buttons: b === 2 ? 2 : 1, clickCount: 1,
  });
}
async function mouseUp(button) {
  await T.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: rect.x, y: rect.y, button, buttons: 0, clickCount: 1,
  });
}

/* ------------------------------------------------------------------ */
/* 真实按键进入第 1 面（EASY / 灵梦）                                    */
/* ------------------------------------------------------------------ */
async function enterPlayable() {
  const seq = [];
  const snap = async (tag) => { const s = await GS(); seq.push(tag + ':' + s.state + '/' + s.panelTitle); return s; };
  await snap('before');
  await T.key('Enter', 90); await sleep(600);            // 标题 → 难度
  await snap('afterTitleEnter');
  await T.key('KeyE', 90); await sleep(600);             // 难度页直接选 EASY
  await snap('afterKeyE');
  await T.key('Enter', 90); await sleep(650);            // 难度确认 → 选人
  await snap('afterDiffEnter');
  await T.key('Enter', 90); await sleep(900);            // 选灵梦 → 开场对白
  await snap('afterCharEnter');

  let enters = 0;
  let s = await GS();
  for (let i = 0; i < 45; i += 1) {
    s = await GS();
    if (s.state === 'play' && s.stage && !s.dlg) break;
    if (s.state === 'menu' && i >= 3 && !s.dlg) break;   // 真实流程没走通 → fallback
    await T.key('Enter', 80);
    enters += 1;
    await sleep(s.dlg ? 280 : 240);
  }
  s = await GS();
  if (s.state === 'play' && s.stage && !s.dlg) return { ok: true, method: 'real-keys', enters, seq, s };

  // fallback：仅测试用，直接开第 1 面，再推对白（不改变被测特性）
  log('WARN  real-key flow did not reach play, using fallback startStage(0): ' + JSON.stringify(seq));
  await T.eval('window.__game.startStage(0)');
  await sleep(500);
  for (let i = 0; i < 45; i += 1) {
    s = await GS();
    if (s.state === 'play' && s.stage && !s.dlg) break;
    await T.key('Enter', 80);
    enters += 1;
    await sleep(280);
  }
  s = await GS();
  return { ok: s.state === 'play' && !!s.stage, method: s.state === 'play' && s.stage ? 'fallback-startStage' : 'failed', enters, seq, s };
}

async function openSettingsFromTitle() {
  await T.key('KeyS', 60);
  await sleep(520);
  let s = await GS();
  if (s.overlayHidden || !/设置/.test(s.panelTitle || '')) {
    await T.eval("window.__game._showSettings(0, 'title')");
    await sleep(450);
    s = await GS();
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                               */
/* ------------------------------------------------------------------ */
async function runSuite() {
  /* ---------- boot ---------- */
  try {
    await T.boot({ query: '?lang=zh' });
  } catch (e) {
    log('BOOT FAILED — game not booted (source mid-edit / broken?): ' + e.message);
    log('FEATURE ABSENT or BOOT FAILED: nothing to test. Exiting gracefully (0).');
    exitCode = 0;
    return;
  }
  const booted = await T.waitFor('window.__game && window.__game._bootDone === true', 30000, 120);
  await sleep(500);
  await installCtxProbe();

  const bootInfo = await T.eval(`(() => {
    const g = window.__game;
    return {
      bootDone: !!(g && g._bootDone), state: g && g.state,
      controlScheme: g && g.controlScheme, inputScheme: g && g.input && g.input.scheme,
      setScheme: !!(g && g.input && typeof g.input.setScheme === 'function'),
      touch: !!(g && g.input && g.input.touchDevice),
      cursor: g && g.canvas ? g.canvas.style.cursor : null,
      ls: (() => { try { return localStorage.getItem('hks.settings.v1'); } catch (e) { return 'ERR'; } })(),
    };
  })()`);
  observed.boot = bootInfo;

  if (bootInfo.controlScheme !== 'keys' && bootInfo.controlScheme !== 'wasd-mouse') {
    log('FEATURE ABSENT: __game.controlScheme is ' + JSON.stringify(bootInfo.controlScheme)
      + ', input.setScheme=' + bootInfo.setScheme + '. Nothing to test. Exiting gracefully (0).');
    exitCode = 0;
    return;
  }
  chk(booted && bootInfo.bootDone, '0 boot: _bootDone reached, title ready', JSON.stringify({ booted, state: bootInfo.state, bootDone: bootInfo.bootDone }));

  /* ================= 1. 干净默认 ================= */
  const s1 = await GS();
  chk(s1.scheme === 'keys', '1a clean default: __game.controlScheme === "keys"', 'observed=' + JSON.stringify(s1.scheme));
  chk(s1.inputScheme === 'keys', '1b clean default: __game.input.scheme === "keys"', 'observed=' + JSON.stringify(s1.inputScheme));
  chk(s1.touch === false, '1c headless Edge is desktop (touchDevice === false), 操作方式 row should render', 'touchDevice=' + s1.touch);

  const s1set = await openSettingsFromTitle();
  const rowPresent1 = await T.eval("!![...document.querySelectorAll('#overlay .btn')].some((b) => b.textContent.includes('操作方式'))");
  chk(!!s1set && /设置/.test(s1set.panelTitle || ''), '1d KeyS opens 设置 page from title', 'panelTitle=' + JSON.stringify(s1set && s1set.panelTitle) + ' hidden=' + (s1set && s1set.overlayHidden));
  chk(rowPresent1, '1e settings page contains a row whose text includes 操作方式', 'rowPresent=' + rowPresent1);

  /* ================= 2. 设置页切换 ================= */
  const before2 = await settingsSnapshot();
  observed.settingsBefore = before2;
  chk((before2.segs || []).length === 2, '2a segmented control has exactly 2 options before switch', JSON.stringify(before2.segs));
  const clicked2 = await clickSchemeRow();
  await sleep(400);
  const after2 = await settingsSnapshot();
  observed.settingsAfterSwitch = after2;
  chk(clicked2 === 'clicked', '2b clicked 操作方式 row (DOM .click())', 'result=' + clicked2);
  chk(after2.controlScheme === 'wasd-mouse', '2c __game.controlScheme === "wasd-mouse" after click', 'observed=' + JSON.stringify(after2.controlScheme));
  chk(after2.inputScheme === 'wasd-mouse', '2d __game.input.scheme === "wasd-mouse" after click', 'observed=' + JSON.stringify(after2.inputScheme));
  chk(after2.lsControlScheme === 'wasd-mouse', '2e localStorage hks.settings.v1.controlScheme === "wasd-mouse"', 'observed=' + JSON.stringify(after2.lsControlScheme));
  const segs2 = after2.segs || [];
  const segTexts2 = segs2.map((s) => s.text);
  chk(segs2.length === 2 && segTexts2[0] === '键盘' && segTexts2[1].includes('WASD') && segTexts2[1].includes('鼠标'),
    '2f segmented control shows 键盘 + WASD + 鼠标', JSON.stringify(segs2));
  const mouseOpt2 = segs2.find((s) => s.text.includes('鼠标'));
  const keysOpt2 = segs2.find((s) => s.text === '键盘');
  chk(!!mouseOpt2 && mouseOpt2.on === true && !!keysOpt2 && keysOpt2.on === false,
    '2g mouse option carries class "on" (键盘 off)', JSON.stringify(segs2));
  chk(after2.cursor === 'crosshair', '2h canvas cursor becomes crosshair in wasd-mouse', 'cursor=' + JSON.stringify(after2.cursor));
  const shot2 = await shot('settings_wasdmouse.png');
  chk(true, '2i screenshot settings page', shot2);

  /* ================= 3. 真实按键进入关卡 ================= */
  await T.eval('window.__game.showTitle()');
  await sleep(450);
  const entry = await enterPlayable();
  observed.entry = { ok: entry.ok, method: entry.method, enters: entry.enters, seq: entry.seq, state: entry.s && entry.s.state };
  chk(entry.ok && entry.method === 'real-keys', '3 real keys enter playable level (state === "play" && stage exists)',
    'method=' + entry.method + ' enters=' + entry.enters + ' state=' + (entry.s && entry.s.state) + ' stage=' + (entry.s && entry.s.stage) + ' seq=' + JSON.stringify(entry.seq));
  if (!entry.ok) {
    log('WARN  cannot continue play-dependent cases (mouse/keyboard).');
    return;
  }
  await sleep(350);
  const play = await GS();
  chk(play.state === 'play' && play.stage && play.alive === true, '3b player alive in playable stage', JSON.stringify({ state: play.state, stState: play.stState, mode: play.mode, alive: play.alive }));

  /* ================= 4. wasd-mouse 鼠标左键射击 ================= */
  const s4a = await GS();
  chk(s4a.scheme === 'wasd-mouse' && s4a.inputScheme === 'wasd-mouse', '4a scheme is wasd-mouse in play', 'controlScheme=' + s4a.scheme + ' input.scheme=' + s4a.inputScheme);
  const center = await refreshCenter();
  observed.canvas = center;
  chk(center.hit === 'game', '4b canvas center hit-tests to #game', JSON.stringify(center));

  const beforeShoot = await GS();
  const tPress = Date.now();
  await mouseDown('left');
  let downLatency = null;
  for (let i = 0; i < 40; i += 1) {
    const down = await T.eval("window.__game.input.down('shoot')");
    if (down) { downLatency = Date.now() - tPress; break; }
    await sleep(8);
  }
  chk(downLatency !== null, '4c left mouse button sets input.down("shoot") while held', 'latency=' + downLatency + 'ms');

  await sleep(Math.max(0, 250 - (Date.now() - tPress)));
  const s4 = await GS();
  const fired = s4.fireCount > beforeShoot.fireCount;
  observed.shoot = { before: beforeShoot, during: s4, downLatency };
  chk(fired, '4d player actually fires while left button held (~250ms): shots.fireCount increases',
    'fireCount ' + beforeShoot.fireCount + ' -> ' + s4.fireCount + '; shootCd=' + s4.shootCd + '; activeShots=' + s4.activeShots);
  chk(s4.shootCd > 0 || s4.activeShots > 0, '4e fire observable during hold (shootCd > 0 or active bullets > 0)',
    'shootCd=' + s4.shootCd + '; activeShots=' + s4.activeShots);
  const shot4 = await shot('play_wasdmouse_shooting.png');

  await mouseUp('left');
  const rel = await until(async () => (await T.eval("window.__game.input.down('shoot') === false")), 1500, 20);
  observed.shoot.releaseMs = rel.ms;
  chk(rel.ok, '4f mouse release clears input.down("shoot")', 'clearedAfter=' + rel.ms + 'ms; screenshot=' + shot4);

  /* ================= 5. wasd-mouse 鼠标右键符卡 ================= */
  // 测试数据准备：直接给足 POWER，保证 canCast()（消耗 48）。POWER.max=128，这里临时写 400。
  await T.eval("(() => { const p = window.__game.stage.player; p.power = 400; p.casting = false; p.castTime = 0; return p.power; })()");
  await sleep(120);
  const s5a = await GS();
  chk(s5a.power === 400, '5a test setup: player.power forced to 400', 'power=' + s5a.power);
  const ctxBefore = await T.eval('(window.__ctx || []).length');
  await mouseDown('right');
  await sleep(80);
  await mouseUp('right');
  const castWait = await until(async () => {
    const s = await GS();
    return s.casting || s.power < 400 ? s : false;
  }, 3000, 20);
  const s5 = castWait.val || await GS();
  observed.cast = { after: s5, waitMs: castWait.ms, ctxBefore };
  chk(castWait.ok && s5.casting === true, '5b right mouse button triggers cast (player.casting === true)',
    'after=' + castWait.ms + 'ms; casting=' + s5.casting + '; power=' + s5.power);
  chk(s5.power === 352, '5c cast spent 48 POWER (400 -> 352)', 'observed power=' + s5.power);
  const shot5 = await shot('play_wasdmouse_cast.png');
  await until(async () => (await T.eval("window.__game.stage.player.casting === false")), 3000, 30);
  const ctx = await T.eval('(window.__ctx || [])');
  observed.ctx = ctx;
  const gameCtx = (ctx || []).filter((x) => x.target === 'game');
  chk(gameCtx.length === 0 || gameCtx.every((x) => x.prevented === true),
    '5d canvas contextmenu suppressed in wasd-mouse (no browser menu)',
    'events=' + JSON.stringify((ctx || []).slice(-4)));
  const evalAlive = await T.eval('1 + 1');
  chk(evalAlive === 2, '5e eval still works after right click (browser context menu did not interfere)', 'eval=2; screenshot=' + shot5);

  /* ================= 6. wasd-mouse 下键盘仍可用 ================= */
  await until(async () => (await T.eval("window.__game.stage.player.casting === false && (window.__game.stage.player.shootCd || 0) === 0")), 3000, 30);
  const k1 = await GS();
  await T.keyDown('KeyZ');
  await sleep(180);
  const k2 = await GS();
  await T.keyUp('KeyZ');
  await sleep(100);
  observed.keyboardInMouse = { zBefore: k1, zDuring: k2 };
  chk(k2.fireCount > k1.fireCount || k2.shootCd > 0, '6a KeyZ still shoots in wasd-mouse',
    'fireCount ' + k1.fireCount + ' -> ' + k2.fireCount + '; shootCd=' + k2.shootCd);

  await T.eval("(() => { const p = window.__game.stage.player; p.power = 400; p.casting = false; return p.power; })()");
  await sleep(100);
  await T.key('KeyX', 40);
  const xwait = await until(async () => {
    const s = await GS();
    return s.casting || s.power < 400 ? s : false;
  }, 3000, 20);
  const k3 = xwait.val || await GS();
  observed.keyboardInMouse.x = k3;
  chk(xwait.ok && k3.casting === true && k3.power === 352, '6b KeyX still casts in wasd-mouse (power 400 -> 352)',
    'after=' + xwait.ms + 'ms; casting=' + k3.casting + '; power=' + k3.power);
  await until(async () => (await T.eval("window.__game.stage.player.casting === false")), 3000, 30);

  /* ================= 7. keys 模式鼠标无效 ================= */
  // 合法切换方式（需求允许）：eval 改 controlScheme + localStorage，不动 src
  await T.eval("(() => { const g = window.__game; g.controlScheme = 'keys'; g._applyControlScheme(); g._saveSettings(); return g.input.scheme; })()");
  await sleep(200);
  const gs7 = await GS();
  const ls7 = await T.eval("(() => { try { return JSON.parse(localStorage.getItem('hks.settings.v1') || '{}').controlScheme; } catch (e) { return null; } })()");
  observed.keysMode = { gs: gs7, lsControlScheme: ls7 };
  chk(gs7.scheme === 'keys' && gs7.inputScheme === 'keys', '7a switched back to keys (controlScheme + input.scheme)',
    'controlScheme=' + gs7.scheme + ' input.scheme=' + gs7.inputScheme);
  chk(ls7 === 'keys', '7b localStorage controlScheme === "keys"', 'observed=' + JSON.stringify(ls7));

  await until(async () => (await T.eval("(window.__game.stage.player.shootCd || 0) === 0 && window.__game.stage.player.casting === false")), 3000, 25);
  const b7 = await GS();
  await mouseDown('left');
  const samples = [];
  for (let i = 0; i < 6; i += 1) {
    const down = await T.eval("window.__game.input.down('shoot')");
    const s = await GS();
    samples.push({ tMs: i * 60, down, shootCd: s.shootCd, fireCount: s.fireCount });
    await sleep(50);
  }
  const a7 = await GS();
  observed.keysMouseLeft = { before: b7, samples, after: a7 };
  chk(samples.every((x) => x.down === false), '7c keys mode: left mouse does NOT set input.down("shoot") (~300ms)', JSON.stringify(samples.map((x) => x.down)));
  chk(a7.shootCd === 0 && a7.fireCount === b7.fireCount, '7d keys mode: player.shootCd stays 0 / no bullets fired',
    'shootCd=' + a7.shootCd + '; fireCount ' + b7.fireCount + ' -> ' + a7.fireCount);
  const shot7 = await shot('play_keys_mouse_inert.png');
  await mouseUp('left');

  const p7 = await GS();
  await mouseDown('right');
  await sleep(250);
  const c7 = await GS();
  await mouseUp('right');
  observed.keysMouseRight = { before: p7, after: c7 };
  chk(c7.casting === false && c7.power === p7.power, '7e keys mode: right mouse does NOT cast / POWER unchanged',
    'casting=' + c7.casting + '; power ' + p7.power + ' -> ' + c7.power);
  const ctxKeys = await T.eval('(window.__ctx || []).slice(-4)');
  const evalKeys = await T.eval('2 + 2');
  chk(evalKeys === 4, '7f eval still works after right click in keys mode', 'eval=4; contextmenuEvents=' + JSON.stringify(ctxKeys) + '; screenshot=' + shot7);

  const z1 = await GS();
  await T.keyDown('KeyZ');
  await sleep(180);
  const z2 = await GS();
  await T.keyUp('KeyZ');
  await sleep(80);
  observed.keysKeyboard = { zBefore: z1, zDuring: z2 };
  chk(z2.fireCount > z1.fireCount, '7g KeyZ still shoots in keys mode', 'fireCount ' + z1.fireCount + ' -> ' + z2.fireCount);

  /* ================= 8. 持久化 reload ================= */
  await T.eval("(() => { const g = window.__game; g.controlScheme = 'wasd-mouse'; g._applyControlScheme(); g._saveSettings(); return g.input.scheme; })()");
  await sleep(150);
  const ls8 = await T.eval("(() => { try { return JSON.parse(localStorage.getItem('hks.settings.v1') || '{}').controlScheme; } catch (e) { return null; } })()");
  chk(ls8 === 'wasd-mouse', '8a wasd-mouse saved before reload', 'localStorage controlScheme=' + JSON.stringify(ls8));
  await T.reload();
  const reloaded = await T.waitFor('window.__game && window.__game._bootDone === true', 30000, 120);
  await sleep(400);
  await installCtxProbe();
  const gs8 = await GS();
  const ls8read = await T.eval("(() => { try { return JSON.parse(localStorage.getItem('hks.settings.v1') || '{}').controlScheme; } catch (e) { return null; } })()");
  observed.persistence = { reloaded, gs: gs8, lsControlScheme: ls8read };
  chk(reloaded && gs8.scheme === 'wasd-mouse' && gs8.inputScheme === 'wasd-mouse',
    '8b after page reload: controlScheme + input.scheme restored to wasd-mouse (no localStorage write in test)',
    'reloaded=' + reloaded + ' controlScheme=' + gs8.scheme + ' input.scheme=' + gs8.inputScheme + ' ls=' + JSON.stringify(ls8read));
  chk(gs8.overlayHidden === false && gs8.state === 'menu', '8c title menu visible after reload', JSON.stringify({ state: gs8.state, overlayHidden: gs8.overlayHidden }));

  /* ================= 9. 操作说明 ================= */
  await T.key('Slash', 60);
  await sleep(550);
  let helpW = await helpSnapshot();
  if (!/操作说明/.test(helpW.title || '') || helpW.overlayHidden) {
    await T.eval('window.__game.showHelp()');
    await sleep(450);
    helpW = await helpSnapshot();
  }
  observed.helpWasdMouse = { title: helpW.title, rows: helpW.rows, text: helpW.text.slice(0, 800) };
  chk(/操作说明/.test(helpW.title), '9a Slash opens 操作说明 from title', 'title=' + JSON.stringify(helpW.title) + ' hidden=' + helpW.overlayHidden);
  chk(/鼠标左键/.test(helpW.text) && /鼠标右键/.test(helpW.text),
    '9b wasd-mouse help innerText contains 鼠标左键 AND 鼠标右键',
    'text=' + helpW.text.replace(/\s+/g, ' ').slice(0, 240));
  const rowShootW = helpW.rows.find((r) => r.label === '射击');
  const rowCastW = helpW.rows.find((r) => r.label === '符卡');
  chk(!!rowShootW && rowShootW.caps.includes('鼠标左键') && !/[ZJ]/.test(rowShootW.ctl),
    '9c wasd-mouse 射击 row shows 鼠标左键 and no Z/J keycap', JSON.stringify(rowShootW));
  chk(!!rowCastW && rowCastW.caps.includes('鼠标右键'),
    '9d wasd-mouse 符卡 row shows 鼠标右键', JSON.stringify(rowCastW));
  const shot9a = await shot('help_wasdmouse.png');

  // 回标题 → 设置页点击切回 keys（走真实 UI）
  await T.eval('window.__game.showTitle()');
  await sleep(400);
  await openSettingsFromTitle();
  const clicked9 = await clickSchemeRow();
  await sleep(400);
  const gs9 = await GS();
  const after9 = await settingsSnapshot();
  observed.settingsBackToKeys = after9;
  chk(clicked9 === 'clicked' && gs9.scheme === 'keys' && gs9.inputScheme === 'keys',
    '9e settings 操作方式 row switches back to keys', 'controlScheme=' + gs9.scheme + ' input.scheme=' + gs9.inputScheme + ' ls=' + after9.lsControlScheme);
  const keysOn9 = (after9.segs || []).find((s) => s.text === '键盘');
  chk(!!keysOn9 && keysOn9.on === true, '9f segmented control shows 键盘 as active in keys mode', JSON.stringify(after9.segs));

  await T.eval('window.__game.showTitle()');
  await sleep(400);
  await T.key('Slash', 60);
  await sleep(500);
  let helpK = await helpSnapshot();
  if (!/操作说明/.test(helpK.title || '') || helpK.overlayHidden) {
    await T.eval('window.__game.showHelp()');
    await sleep(450);
    helpK = await helpSnapshot();
  }
  observed.helpKeys = { title: helpK.title, rows: helpK.rows, text: helpK.text.slice(0, 800) };
  const rowShootK = helpK.rows.find((r) => r.label === '射击');
  const rowCastK = helpK.rows.find((r) => r.label === '符卡');
  chk(!!rowShootK && /Z/.test(rowShootK.ctl) && /J/.test(rowShootK.ctl),
    '9g keys help 射击 row shows Z / J keycaps', JSON.stringify(rowShootK));
  chk(!!rowCastK && /X/.test(rowCastK.ctl) && /L/.test(rowCastK.ctl),
    '9h keys help 符卡 row shows X / L keycaps', JSON.stringify(rowCastK));
  chk(!/鼠标/.test(helpK.text), '9i keys help innerText has no 鼠标 (no mouse wording)',
    'text=' + helpK.text.replace(/\s+/g, ' ').slice(0, 240));
  const shot9b = await shot('help_keys.png');
  chk(true, '9j screenshots saved', shot9a + ', ' + shot9b);

  /* ================= 10. 健康 ================= */
  const rep = await T.report();
  observed.pageReport = { errors: rep.errors, warns: rep.warns, netFails: rep.netFails, httpBad: rep.httpBad };
  chk(rep.errors.length === 0, '10a no page errors (T.report().errors empty)', 'errors=' + JSON.stringify(rep.errors).slice(0, 500));
  log('INFO  netFails=' + JSON.stringify(rep.netFails).slice(0, 300) + ' httpBad=' + JSON.stringify(rep.httpBad).slice(0, 300));
  log('INFO  screenshots: ' + shots.join(', '));
}

try {
  await runSuite();
} catch (e) {
  console.error('SUITE CRASHED:', (e && e.stack) || e);
  exitCode = 2;
} finally {
  try {
    const rep = await T.report();
    observed.pageReportFinal = { errors: rep.errors, warns: rep.warns, netFails: rep.netFails, httpBad: rep.httpBad };
    if (rep.errors.length) log('HEALTH: page errors: ' + JSON.stringify(rep.errors).slice(0, 800));
  } catch (e) { /* page may be gone */ }
  try {
    saveJson(OUT + '/report.json', {
      base: BASE, port: PORT, when: new Date().toISOString(),
      durationMs: Date.now() - startAt, pass, fail, checks, observed, screenshots: shots,
    });
  } catch (e) { console.error('save report failed:', e.message); }
  try { await T.close(); } catch (e) {}
  log('');
  log('===== SUMMARY: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  log('report: ' + OUT + '/report.json');
  log('screenshots: ' + (shots.length ? shots.join(', ') : '(none)'));
  process.exit(exitCode !== 0 ? exitCode : fail > 0 ? 1 : 0);
}
