// 冒烟：E 通关面板 / Extra 进入后的 Stage 难度 / 主线 Stage 难度绑定
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9337, W = 1280, H = 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-smoke-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 60; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find(t => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  } throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || '')); return r.result?.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?smoke=${Date.now()}` });
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(400);
await ev('localStorage.removeItem("hks.progress.v1"); window.__game.unlockedExtra=false; window.__game.showTitle()');

// 1) E 全 5 面通关：EASY CLEAR 面板，Extra 保持锁定
await ev('window.__game.difficulty="E"; window.__game.char="reimu"; window.__game.inExtra=false; window.__game._onAllCleared()');
await sleep(200);
const easy = JSON.parse(await ev(`JSON.stringify({
  title: (document.getElementById('title')||{}).textContent,
  hint: (document.querySelector('.overlay:not(.hidden) .hint')||{}).textContent,
  state: window.__game.state,
  unlocked: window.__game.unlockedExtra,
  saved: localStorage.getItem('hks.progress.v1'),
})`));
writeFileSync('_easy_clear.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

// 2) 已解锁后进入 Extra：Stage 必须固定 H
await ev('window.__game.showTitle(); window.__game.unlockedExtra=true; window.__game.lives=2; window.__game.char="reimu"; window.__game.inExtra=true; window.__game._startExtraStage()');
await sleep(600);
const extra = JSON.parse(await ev(`JSON.stringify({
  hasStage: !!window.__game.stage,
  diff: window.__game.stage?.difficulty,
  stageDiffField: window.__game.stage?.diff?.key,
  levelName: window.__game.stage?.level?.name || window.__game.stage?.level?.title,
  state: window.__game.state,
})`));

// 3) 主线 N：Stage 绑定 N
await ev('window.__game.showTitle(); window.__game.difficulty="N"; window.__game.inExtra=false; window.__game._createStage(window.__game._mainStages()[0], 0, false)');
await sleep(600);
const main = JSON.parse(await ev(`JSON.stringify({
  hasStage: !!window.__game.stage,
  diff: window.__game.stage?.difficulty,
  stageDiffField: window.__game.stage?.diff?.key,
  levelIndex: window.__game.levelIndex,
  state: window.__game.state,
})`));
await ev('localStorage.removeItem("hks.progress.v1")');
console.log('RESULT', JSON.stringify({ easy, extra, main, errors }, null, 2));
ws.close(); proc.kill(); await sleep(300); process.exit(0);
