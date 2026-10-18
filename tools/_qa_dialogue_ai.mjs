// 修复验证 4：开局对话（灵梦/魔理沙）在 AI 立绘就绪后才出现
// 人为把 art/gen/* 延迟 1.2s，模拟用户点进游戏时立绘还没下完的场景
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9374);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-dlgai-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools target');
}

let ws, id = 0;
const pending = new Map();
const errors = [];
let paused = 0;
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || ''));
  return r.result?.value;
};
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
};

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    }
    if (m.method === 'Fetch.requestPaused') {
      paused++;
      const rid = m.params.requestId;
      setTimeout(() => { send('Fetch.continueRequest', { requestId: rid }).catch(() => {}); }, 1200);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*art/gen/*', requestStage: 'Request' }] });

  const t0 = Date.now();
  await send('Page.navigate', { url: `${URL0}?dlgai=${t0}` });

  let gameReady = false;
  for (let i = 0; i < 400; i++) {
    await sleep(150);
    if (await ev('!!window.__game')) { gameReady = true; break; }
    if (i % 20 === 0) {
      console.log('WAIT', i, await ev('JSON.stringify({ rs: document.readyState, href: location.href, title: document.title, boot: !!document.getElementById("boot") })'));
    }
  }
  console.log('GAME_READY', gameReady);
  if (!gameReady) {
    console.log('PAGE_ERRORS', JSON.stringify(errors));
    throw new Error('game not ready');
  }
  // 等启动幕揭完，模拟玩家在标题界面出现后才点开始
  for (let i = 0; i < 120; i++) {
    if (await ev("document.getElementById('boot')?.classList.contains('done')")) break;
    await sleep(100);
  }
  await sleep(700);
  console.log('BOOT_DONE', await ev("document.getElementById('boot')?.classList.contains('done')"));

  const res = await ev(`(async () => {
    const g = window.__game;
    const t = performance.now();
    window.__playAt = null;
    const orig = g.dialogue.play.bind(g.dialogue);
    g.dialogue.play = (script, opts) => { window.__playAt = performance.now(); window.__lineCount = script.length; return orig(script, opts); };
    g.char = 'reimu';
    g.startGame();
    for (let i = 0; i < 80; i++) {
      if (window.__playAt != null) break;
      await new Promise(r => setTimeout(r, 50));
    }
    // 跳到第 3 句（player 台词，左侧立绘）
    for (let i = 0; i < 8; i++) {
      if (g.dialogue.index >= 2) break;
      g.dialogue.advance();                     // 先补完打字
      await new Promise(r => setTimeout(r, 30));
      g.dialogue.advance();                     // 再进下一句
      await new Promise(r => setTimeout(r, 60));
    }
    await new Promise(r => setTimeout(r, 500));
    const entries = performance.getEntriesByType('resource').filter(e => /gen\\/(reimu|marisa)\\.png/.test(e.name));
    return JSON.stringify({
      waitFromStartMs: window.__playAt != null ? Math.round(window.__playAt - t) : null,
      playAt: window.__playAt,
      active: g.dialogue.active,
      index: g.dialogue.index,
      speaker: g.dialogue.speaker,
      left: g.dialogue.leftChar,
      right: g.dialogue.rightChar,
      lineCount: window.__lineCount,
      portraits: entries.map(e => ({ n: e.name.split('/').slice(-1)[0], start: Math.round(e.startTime), end: Math.round(e.responseEnd), size: e.transferSize })),
      reimuLoadedBeforePlay: (() => { const r = entries.find(e => /reimu\\.png/.test(e.name)); const m = entries.find(e => /marisa\\.png/.test(e.name)); return !!(r && m && window.__playAt && r.responseEnd <= window.__playAt && m.responseEnd <= window.__playAt); })(),
    });
  })()`);
  await shot('_fix_opening_ai.png');
  console.log('PAUSED', paused);
  console.log('OPENING', res);
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
}
