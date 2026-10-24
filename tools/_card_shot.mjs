#!/usr/bin/env node
/**
 * tools/_card_shot.mjs -- 逐卡符卡弹型验收截图（CDP 直连 headless Edge）
 *
 * 用法：
 *   node tools/_card_shot.mjs <outPrefix> <stage> <cardIndex> [frames=300] [width=1280] [height=720] [bossKey] [patternIdx=0]
 *   stage: 1..6 = 主线第 1..6 面；"5m" = 5 面中途 Boss 妖梦；7/extra = EXTRA 关底芙兰朵露；
 *          "extra-mid" = EXTRA 中途雷米莉亚
 *   SHOT_PORT=9355 可改 CDP 端口（默认 9355，避开其他人的 9334/9351）。
 *
 * 产物：
 *   <outPrefix>.png                  截图
 *   末行 CARD_SHOT_RESULT {...}      JSON（供批量脚本收集）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:8137/index.html';
const PORT = Number(process.env.SHOT_PORT || 9355);

const STAGES = {
  1: { index: 0 },
  2: { index: 1 },
  3: { index: 2 },
  4: { index: 3 },
  5: { index: 4 },
  6: { index: 5 },
  '5m': { index: 4, bossKey: 'youmu', midboss: true },
  7: { index: 6, extra: true },
  'extra': { index: 6, extra: true },
  'extra-mid': { index: 6, extra: true, bossKey: 'remilia', midboss: true },
};

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length < 3) {
  die('usage: node tools/_card_shot.mjs <outPrefix> <stage> <cardIndex> [frames=300] [width=1280] [height=720] [bossKey] [patternIdx=0]');
}
const outPrefix = argv[0];
const outFile = path.resolve(/\.png$/i.test(outPrefix) ? outPrefix : outPrefix + '.png');
const stageArg = String(argv[1]).toLowerCase();
const cardIndex = Number(argv[2]);
const frames = argv[3] != null ? Number(argv[3]) : 300;
const width = argv[4] != null ? Number(argv[4]) : 1280;
const height = argv[5] != null ? Number(argv[5]) : 720;
const bossKeyOverride = argv[6] != null && argv[6] !== '' ? argv[6] : null;
const patternIndex = argv[7] != null && argv[7] !== '' ? Number(argv[7]) : 0;
const stageCfg = STAGES[stageArg];
if (!stageCfg) die('unknown stage: ' + stageArg + ' (expected 1..6 or 5m)');
if (!Number.isFinite(cardIndex) || cardIndex < 0) die('bad cardIndex: ' + argv[2]);
if (!Number.isFinite(frames) || frames <= 0) die('bad frames: ' + argv[3]);
if (!Number.isFinite(width) || !Number.isFinite(height)) die('bad width/height');
if (!Number.isFinite(patternIndex) || patternIndex < 0 || patternIndex % 1 !== 0) die('bad patternIdx: ' + argv[7]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-card-'));
const state = { ws: null, issues: [] };

function cleanup(code) {
  try { if (state.ws && state.ws.readyState === 1) state.ws.close(); } catch (e) { /* ignore */ }
  try { proc.kill(); } catch (e) { /* ignore */ }
  setTimeout(() => {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    process.exit(code || 0);
  }, 250);
}

// 端口预检：避免误连到别人已经开着的调试端口
async function portBusy(port) {
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch (e) {
    return false;
  }
}
if (await portBusy(PORT)) die('CDP port ' + PORT + ' is already in use (set SHOT_PORT to a free port)');

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--mute-audio',
  '--user-data-dir=' + profileDir,
  '--window-size=' + width + ',' + height,
  '--remote-debugging-port=' + PORT,
  'about:blank',
], { stdio: 'ignore' });

const watchdog = setTimeout(() => {
  console.error('[_card_shot] timeout');
  try { proc.kill(); } catch (e) { /* ignore */ }
  process.exit(2);
}, 240000);
if (watchdog.unref) watchdog.unref();

async function connect() {
  let target = null;
  for (let i = 0; i < 140 && !target; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      target = list.find((it) => it.type === 'page' && it.webSocketDebuggerUrl) || null;
    } catch (e) { /* not up yet */ }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error('no CDP page target on port ' + PORT);
  const targetUrl = String(target.url || '');
  if (targetUrl && targetUrl !== 'about:blank') {
    throw new Error('CDP port ' + PORT + ' belongs to another browser (target=' + targetUrl + '); set SHOT_PORT to a free port');
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  state.ws = ws;
  await new Promise((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('CDP websocket error'));
  });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    let m = null;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message || JSON.stringify(m.error)));
      else p.resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      const type = m.params.type;
      if (type === 'warning' || type === 'error' || type === 'assert') {
        const text = (m.params.args || []).map((a) => (a.value != null ? String(a.value) : (a.description || a.type || ''))).join(' ');
        state.issues.push({ kind: 'console.' + type, text: text });
      }
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      const ex = d.exception || {};
      state.issues.push({ kind: 'exception', text: String(ex.description || ex.value || d.text || 'unknown exception') });
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry || {};
      if (e.level === 'error' || e.level === 'warning') state.issues.push({ kind: 'log.' + e.level, text: String(e.text || '') + (e.url ? ' @ ' + e.url : ''), url: e.url || null });
    }
  };

  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve, reject: reject });
    ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
  });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true });
    if (r && r.exceptionDetails) {
      const d = r.exceptionDetails;
      const ex = d.exception || {};
      throw new Error('page exception: ' + String(ex.description || ex.value || d.text || 'unknown'));
    }
    return r && r.result ? r.result.value : undefined;
  };

  return { ws: ws, send: send, evaluate: evaluate };
}

function normalizeIssues(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const t = String(it.text || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (/AudioContext was not allowed/i.test(t)) continue;
    const key = it.kind + '|' + t;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: it.kind, text: t.slice(0, 500) });
  }
  return out;
}

async function main() {
  const cdp = await connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  try { await cdp.send('Log.enable'); } catch (e) { /* optional */ }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: width, height: height, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.send('Page.navigate', { url: GAME_URL + '?boss=' + Date.now() });

  let ready = false;
  for (let i = 0; i < 160 && !ready; i++) {
    await sleep(150);
    try {
      ready = !!(await cdp.evaluate('!!window.__game && (!window.__boot || window.__boot.done === true)'));
    } catch (e) { ready = false; }
  }
  if (!ready) throw new Error('game boot not finished after ~24s');

  const setupLines = [
    '(async () => {',
    '  const g = window.__game;',
    '  const STAGE_INDEX = ' + stageCfg.index + ';',
    '  const CARD = ' + cardIndex + ';',
    '  const FRAMES = ' + frames + ';',
    '  const BOSS_KEY = ' + JSON.stringify(bossKeyOverride || stageCfg.bossKey || null) + ';',
    '  const MIDBOSS = ' + (stageCfg.midboss ? 'true' : 'false') + ';',
    '  const EXTRA = ' + (stageCfg.extra ? 'true' : 'false') + ';',
    '  const PATTERN_IDX = ' + patternIndex + ';',
    '  const W = ' + width + ';',
    '  const H = ' + height + ';',
    '',
    '  function hideUi() {',
    '    try {',
    '      if (g.dialogue) {',
    '        if (typeof g.dialogue.stop === "function") g.dialogue.stop();',
    '        g.dialogue.active = false;',
    '        if (g.dialogue.el) g.dialogue.el.classList.add("hidden");',
    '      }',
    '      const boot = document.getElementById("boot");',
    '      if (boot) { boot.classList.add("done"); boot.style.display = "none"; }',
    '      const ov = document.getElementById("overlay");',
    '      if (ov) { ov.classList.add("hidden"); ov.style.display = "none"; }',
    '      const dlg = document.getElementById("dialogue");',
    '      if (dlg) dlg.classList.add("hidden");',
    '    } catch (e) { /* ignore */ }',
    '  }',
    '',
    '  hideUi();',
    '  g._pendingTimeout = 0;',
    '  g._flowGen = (g._flowGen || 0) + 1;',
    '  if (EXTRA) g._startExtraStage({ skipIntro: true }); else g.startStage(STAGE_INDEX, { skipIntro: true });',
    '  for (let i = 0; i < 240 && !(g.stage && g.stage.player); i++) {',
    '    await new Promise((r) => setTimeout(r, 25));',
    '  }',
    '  const s = g.stage;',
    '  if (!s) throw new Error("stage missing");',
    '  if (g.loop && typeof g.loop.stop === "function") g.loop.stop();',
    '  hideUi();',
    '  g.state = "play";',
    '',
    '  if (!s.boss) s.beginBoss(BOSS_KEY, { midboss: MIDBOSS });',
    '  const b = s.boss;',
    '  if (!b) throw new Error("boss missing after beginBoss");',
    '  s.state = "boss";',
    '  if (s.mode === "stg" && s.stg) {',
    '    s.stg.spawnPaused = true;',
    '    if (Array.isArray(s.stg.enemies)) s.stg.enemies.length = 0;',
    '  }',
    '  if (!b.phases || !b.phases[CARD]) {',
    '    throw new Error("card " + CARD + " missing (phases=" + (b.phases ? b.phases.length : 0) + ", boss=" + b.key + ")");',
    '  }',
    '',
    '  const p = s.player;',
    '  p.alive = true;',
    '  p.dead = false;',
    '  p.hearts = 9999;',
    '  p.lives = 9999;',
    '  p.invuln = 9999;',
    '  if (p.deathT != null) p.deathT = 0;',
    '',
    '  if (s.mode === "platform") {',
    '    p.x = Math.max(120, b.x - 430);',
    '    p.y = s.level.h - 220;',
    '    p.vx = 0; p.vy = 0;',
    '    s.camera.snapTo(b.x - 420);',
    '  } else {',
    '    p.x = 420; p.y = 620;',
    '    const sx = Math.max(0, b.x - 900);',
    '    if (s.stg) s.stg.scroll = sx;',
    '    s.camera.x = sx; s.camera.y = 0; s.camera.follow = false;',
    '  }',
    '',
    '  for (let i = 0; i < 90; i++) {',
    '    p.invuln = 9999;',
    '    g.update(1 / 60);',
    '  }',
    '',
    '  s.bullets.clear();',
    '  if (typeof b._flushLater === "function") b._flushLater();',
    '  b.spellIdx = CARD;',
    '  b.phase = CARD;',
    '  b._applyCard(CARD);',
    '  b.hp = b.maxHp;',
    '  b.spellHp = b.spellMaxHp;',
    '  b.spellBroken = false;',
    '  b.state = "battle";',
    '  b.alpha = 1;',
    '  b.introT = 2;',
    '  b.spellLock = 0;',
    '  b.cardElapsed = 0;',
    '  b.cardRemain = b.cardLimit;',
    '  b.volleys = 0;',
    '  b.x = b.homeX;',
    '  b.y = b.baseY;',
    '  if (b._move) {',
    '    b._move.sx = b.x; b._move.sy = b.baseY;',
    '    b._move.tx = b.x; b._move.ty = b.baseY;',
    '    b._move.t = 0; b._move.dur = 0;',
    '  }',
    '  // 隔离 QA：禁用计划外变招（type 0/3，不套皮肤）与平台近战俯冲/冲撞（会额外喷 type 0）',
    '  b.wildAbort = 0;',
    '  b._wildLeft = 0;',
    '  b._wildCd = 9999;',
    '  if (b._dive) { b._dive.state = "idle"; }',
    '  if (b._ram) { b._ram.state = "idle"; }',
    '  b._diveCd = 9999;',
    '  b._ramCd = 9999;',
    '  if (b.phantom) {',
    '    b.phantom.x = b.homeX;',
    '    b.phantom.y = b.baseY - 96;',
    '    if (b.phantom.dissipateT != null) b.phantom.dissipateT = 0;',
    '    if (b.phantom.fade != null) b.phantom.fade = 1;',
    '  }',
    '  b._startPattern(PATTERN_IDX);',
    '  b.patternDur = 9999;',
    '  b.t = 0;',
    '',
    '  for (let i = 0; i < FRAMES; i++) {',
    '    p.invuln = 9999;',
    '    p.hearts = 9999;',
    '    if (i % 30 === 0) {',
    '      b.state = "battle";',
    '      b.spellLock = 0;',
    '      b.hp = b.maxHp;',
    '      b.spellHp = b.spellMaxHp;',
    '      b._diveCd = 9999;',
    '      b._ramCd = 9999;',
    '      if (b._dive) b._dive.state = "idle";',
    '      if (b._ram) b._ram.state = "idle";',
    '    }',
    '    g.update(1 / 60);',
    '  }',
    '',
    '  let rule = null;',
    '  let skinNames = null;',
    '  try {',
    '    const cs = await import("/src/game/bulletArt/cardSkins.js");',
    '    rule = cs.cardSkin(b.key, CARD);',
    '  } catch (e) { rule = null; }',
    '  try {',
    '    const tm = await import("/src/game/bulletArt/types.js");',
    '    skinNames = tm.SKIN_NAMES || null;',
    '  } catch (e) { skinNames = null; }',
    '',
    '  const patterns = (b.phases[CARD] && b.phases[CARD].patterns) || [];',
    '  const typeNames = patterns.map((pp) => pp.typeName || null);',
    '  const activePattern = patterns.length ? patterns[b.patternIdx % patterns.length] : null;',
    '',
    '  const hist = {};',
    '  let big = 0;',
    '  let small = 0;',
    '  let maxR = 0;',
    '  for (let i = 0; i < s.bullets.pool.length; i++) {',
    '    const bu = s.bullets.pool[i];',
    '    if (!bu || !bu.active) continue;',
    '    const ty = bu.type | 0;',
    '    hist[ty] = (hist[ty] || 0) + 1;',
    '    if (bu.r >= 8) big++; else small++;',
    '    if (bu.r > maxR) maxR = bu.r;',
    '  }',
    '',
    '  const expected = [];',
    '  if (rule) {',
    '    if (rule.skin != null && expected.indexOf(rule.skin) < 0) expected.push(rule.skin);',
    '    if (rule.map) {',
    '      for (const k of Object.keys(rule.map)) {',
    '        const v = rule.map[k];',
    '        if (v != null && expected.indexOf(v) < 0) expected.push(v);',
    '      }',
    '    }',
    '  }',
    '  const observed = Object.keys(hist).map(Number).sort((a, b2) => a - b2);',
    '',
    '  if (s.mode === "platform") {',
    '    const camX = Math.max(0, Math.min(b.x - W * 0.69, s.level.w - W));',
    '    s.camera.x = camX;',
    '    s.camera.prevX = camX;',
    '    const minY = Math.min(0, s.level.h - H);',
    '    const maxY = Math.max(0, s.level.h - H);',
    '    const camY = Math.max(minY, Math.min(b.y - H * 0.55, maxY));',
    '    s.camera.y = camY;',
    '    s.camera.prevY = camY;',
    '  } else {',
    '    const sx = Math.max(0, b.x - 900);',
    '    if (s.stg) s.stg.scroll = sx;',
    '    s.camera.x = sx;',
    '    s.camera.prevX = sx;',
    '    s.camera.y = 0;',
    '    s.camera.prevY = 0;',
    '  }',
    '  s.camera.shakeT = 0;',
    '  s.camera.shakeAmp = 0;',
    '  s.camera.ox = 0;',
    '  s.camera.oy = 0;',
    '',
    '  g.render(1);',
    '',
    '  const phase = b.phases[CARD] || {};',
    '  const info = {',
    '    boss: b.key,',
    '    bossName: (b.def && b.def.name) || null,',
    '    stageIndex: STAGE_INDEX,',
    '    card: CARD,',
    '    spellIdx: b.spellIdx,',
    '    phaseName: b.spellName,',
    '    cardName: phase.name || null,',
    '    phaseCount: b.phases.length,',
    '    patterns: typeNames,',
    '    patternIndex: PATTERN_IDX,',
    '    activePattern: activePattern ? (activePattern.typeName || null) : null,',
    '    variantCount: patterns.length,',
    '    rule: rule,',
    '    expected: expected,',
    '    observed: observed,',
    '    hist: hist,',
    '    activeCount: s.bullets.activeCount,',
    '    big: big,',
    '    small: small,',
    '    maxR: maxR,',
    '    stageMode: s.mode,',
    '    bossWorld: { x: Math.round(b.x), y: Math.round(b.y) },',
    '    bossScreen: { x: Math.round(b.x - s.camera.x), y: Math.round(b.y - s.camera.y) },',
    '    camera: { x: Math.round(s.camera.x), y: Math.round(s.camera.y) },',
    '    player: { x: Math.round(p.x), y: Math.round(p.y) },',
    '    skinNames: skinNames,',
    '    wildAbort: b.wildAbort,',
    '  };',
    '  return info;',
    '})()',
  ];
  const setupExpr = setupLines.join('\n');
  const info = await cdp.evaluate(setupExpr);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));

  const issues = normalizeIssues(state.issues);
  const fatal = issues.filter((it) => {
    const t = it.text || '';
    return it.kind === 'exception' || /custom pattern failed|Uncaught|TypeError|ReferenceError|SyntaxError/.test(t);
  });
  const observed = info.observed || [];
  const expected = info.expected || [];
  const seenExpected = observed.filter((t) => expected.indexOf(t) >= 0);
  const outside = observed.filter((t) => expected.indexOf(t) < 0 && t !== 4);
  const legacy = outside.filter((t) => t < 5);
  const wrongSkin = outside.filter((t) => t >= 5);
  const pass = !!(info.boss) && seenExpected.length > 0 && wrongSkin.length === 0 && fatal.length === 0;

  const result = {
    out: outFile,
    pass: pass,
    boss: info.boss,
    bossName: info.bossName,
    card: info.card,
    cardName: info.cardName,
    phaseName: info.phaseName,
    spellIdx: info.spellIdx,
    patterns: info.patterns,
    activePattern: info.activePattern,
    variantCount: info.variantCount,
    patternIndex: info.patternIndex,
    rule: info.rule,
    expected: expected,
    observed: observed,
    seenExpected: seenExpected,
    outside: outside,
    legacyBaseTypes: legacy,
    wrongSkinTypes: wrongSkin,
    hist: info.hist,
    activeCount: info.activeCount,
    big: info.big,
    small: info.small,
    maxR: info.maxR,
    bossScreen: info.bossScreen,
    camera: info.camera,
    stageMode: info.stageMode,
    consoleIssues: issues,
    fatalIssues: fatal,
    frames: frames,
    size: [width, height],
  };
  console.log('CARD_SHOT_RESULT ' + JSON.stringify(result));
  cleanup(pass ? 0 : 0);
}

main().catch((err) => {
  const result = {
    out: outFile,
    pass: false,
    error: String((err && err.stack) || err),
    consoleIssues: state.issues,
  };
  console.log('CARD_SHOT_RESULT ' + JSON.stringify(result));
  cleanup(1);
});
