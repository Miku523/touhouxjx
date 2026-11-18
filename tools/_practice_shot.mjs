#!/usr/bin/env node
/**
 * tools/_practice_shot.mjs -- 练习模式 / 图鉴页面的视觉验收截图（CDP 直连 headless Edge）
 *
 * 用法：
 *   node tools/_practice_shot.mjs <outPrefix> [practice|gallery] [width=1280] [height=720]
 *
 * 为什么不走 main.js：这两个页面还没接线（接线由 Lead 做），所以这里在页面里
 * 直接把模块 import 进来、手工 new 一个房间挂到 #ui 上，只为验证「渲染出来长什么样」。
 * 真接线后这个脚本仍然可用（它就是照生产用法构造的）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAME_URL = process.env.GAME_URL || 'http://127.0.0.1:8137/index.html';
const PORT = Number(process.env.SHOT_PORT || 9357);

const argv = process.argv.slice(2);
function die(msg) { console.error('practice_shot: ' + msg); process.exit(1); }
if (argv.length < 1) die('usage: node tools/_practice_shot.mjs <outPrefix> [practice|gallery] [w] [h]');

const outFile = path.resolve(/\.png$/i.test(argv[0]) ? argv[0] : argv[0] + '.png');
const mode = (argv[1] || 'practice').toLowerCase();
if (mode !== 'practice' && mode !== 'gallery') die('mode must be practice|gallery');
const width = argv[2] != null ? Number(argv[2]) : 1280;
const height = argv[3] != null ? Number(argv[3]) : 720;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-prac-'));
let proc = null;
let ws = null;

function cleanup(code) {
  try { if (ws && ws.readyState === 1) ws.close(); } catch (e) { /* ignore */ }
  try { proc.kill(); } catch (e) { /* ignore */ }
  setTimeout(() => {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    process.exit(code || 0);
  }, 250);
}

async function portBusy(port) {
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

if (await portBusy(PORT)) die('CDP port ' + PORT + ' is already in use (set SHOT_PORT to a free port)');

proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profileDir,
  '--window-size=' + width + ',' + height,
  'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 60 && !target; i += 1) {
  await sleep(250);
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list', { signal: AbortSignal.timeout(1500) })).json();
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
  } catch (e) { /* 还没起来，等下一轮 */ }
}
if (!target) die('could not reach headless Edge CDP');

ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = () => resolve();
  ws.onerror = () => reject(new Error('CDP websocket error'));
});

let seq = 0;
const pending = new Map();
const issues = [];
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
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    issues.push({ kind: 'exception', text: (d.exception && (d.exception.description || d.exception.value)) || d.text || '' });
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const type = m.params.type;
    if (type === 'error' || type === 'assert') {
      const text = (m.params.args || []).map((a) => (a.value != null ? String(a.value) : (a.description || a.type || ''))).join(' ');
      issues.push({ kind: type, text });
    }
  }
};

function send(method, params) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r && r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'eval failed');
  }
  return r ? r.result.value : undefined;
}

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: GAME_URL + '?shot=' + Date.now() });

// 等游戏对象挂上 window（main.js 末尾 window.__game = game）
let ready = false;
for (let i = 0; i < 80 && !ready; i += 1) {
  await sleep(250);
  try { ready = await evaluate('!!(window.__game && window.__game.input && window.__game.uiEl)'); } catch (e) { /* 页面还在导航 */ }
}
if (!ready) die('window.__game never became ready');

// headless 下 boot 层的淡出 tween 可能还没跑完（#boot 是 z-index:120 的不透明层，
// 盖住一切 z-index<120 的页面）。真机上这时玩家早就点进菜单了，所以直接摘掉它。
await evaluate(`(() => { const b = document.getElementById('boot'); if (b) { b.style.transition = 'none'; b.style.opacity = '0'; b.style.pointerEvents = 'none'; } return true; })()`);
await sleep(120);

// 页面里直接构造房间：这就是 Lead 接线后 main.js 会做的事，只是省掉菜单点击
const boot = mode === 'practice'
  ? `(async () => {
      const m = await import('/src/game/practice.js');
      const g = window.__game;
      const room = new m.PracticeRoom({
        input: g.input,
        host: g.uiEl,
        isExtraUnlocked: () => true,
        onStart: () => {},
        onExit: () => {},
      });
      room.show();
      window.__shotRoom = room;
      return m.listPracticeTargets({ extraUnlocked: true }).length;
    })()`
  : `(async () => {
      const m = await import('/src/game/gallery.js');
      const g = window.__game;
      const room = new m.GalleryRoom({
        input: g.input,
        host: g.uiEl,
        isExtraUnlocked: () => true,
        onExit: () => {},
      });
      room.show();
      if (${JSON.stringify(String(argv[4] || ''))} === 'enemy') room.handleKey({ code: 'ArrowRight', preventDefault() {}, stopPropagation() {} });
      window.__shotRoom = room;
      return m.listEnemies().length;
    })()`;

let count = null;
try {
  count = await evaluate(boot);
} catch (err) {
  die('room construction failed: ' + (err && err.message));
}
if (!count) die('room reported zero entries');

// 等淡入 transition 跑完（show() 是下一帧才加 is-in，0.2s 过渡）
await sleep(700);

const info = await evaluate(`(() => {
  const el = window.__shotRoom && window.__shotRoom.el;
  if (!el) return { ok: false };
  const rows = el.querySelectorAll('li');
  const sel = el.querySelector('li.is-sel');
  return {
    ok: true,
    visible: !el.classList.contains('hidden') && el.classList.contains('is-in'),
    rows: rows.length,
    hasSel: !!sel,
    selText: sel ? sel.textContent.trim().slice(0, 40) : '',
    opacity: getComputedStyle(el).opacity,
  };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, Buffer.from(shot.data, 'base64'));

const fatal = issues.filter((it) => it.kind === 'exception' || /Uncaught|TypeError|ReferenceError|SyntaxError/.test(it.text || ''));
console.log('PRACTICE_SHOT_RESULT ' + JSON.stringify({ mode, outFile, count, info, fatal: fatal.slice(0, 3) }));
cleanup(fatal.length ? 1 : 0);
