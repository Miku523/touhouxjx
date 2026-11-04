// 一次性探针：区分「预热 draw」与「可见首帧 draw」的耗时与 API 画像
// 用法: node tools/_probe_firstframe.mjs [port]   （需要 8141 静态服务）
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9511);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8141/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-pf-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 300));
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: URL0 });
for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
await sleep(1200);

const out = await ev(`(async () => {
  const g = window.__game;
  const stageMod = await import('/src/game/stage.js');
  // API 计数
  const C = {}; let on = false;
  const P = CanvasRenderingContext2D.prototype;
  const origs = {};
  for (const n of ['drawImage','createLinearGradient','createRadialGradient','createPattern','getImageData','fillRect','fill','stroke']) {
    origs[n] = P[n];
    P[n] = function (...a) { if (on) C[n] = (C[n] || 0) + 1; return origs[n].apply(this, a); };
  }
  const origCreate = document.createElement.bind(document);
  document.createElement = function (t, ...a) { const el = origCreate(t, ...a); if (on && String(t).toLowerCase() === 'canvas') C.canvas = (C.canvas || 0) + 1; return el; };

  const calls = [];
  let cur = null;
  const origDraw = stageMod.Stage.prototype.draw;
  stageMod.Stage.prototype.draw = function (...a) {
    const t0 = performance.now();
    cur = { ms: 0, label: (g._prewarmedStage === this && calls.length === 0) ? 'prewarm' : 'visible', api: {} };
    on = true;
    const r = origDraw.apply(this, a);
    on = false;
    cur.ms = +(performance.now() - t0).toFixed(1);
    cur.api = { ...C };
    for (const k in C) delete C[k];
    calls.push(cur);
    return r;
  };

  g.lives = 99; g.char = 'reimu';
  await g.startStage(0);
  await new Promise(r => setTimeout(r, 1500));
  // 播完开场对话进 play，再多跑几帧
  for (let i = 0; i < 40; i++) { if (g.dialogue?.active) g.dialogue.advance(); g.loop.update(1/60); }
  await new Promise(r => setTimeout(r, 800));

  stageMod.Stage.prototype.draw = origDraw;
  document.createElement = origCreate;
  for (const n of Object.keys(origs)) P[n] = origs[n];
  return JSON.stringify({ state: g.state, calls: calls.slice(0, 8), total: calls.length });
})()`);

const j = JSON.parse(out);
console.log('state:', j.state, '| draw 调用总数:', j.total);
for (let i = 0; i < j.calls.length; i++) {
  const c = j.calls[i];
  console.log(String(i).padStart(2), c.label.padEnd(8), String(c.ms).padStart(6) + 'ms',
    'canvas=' + (c.api.canvas || 0), 'linGrad=' + (c.api.createLinearGradient || 0),
    'radGrad=' + (c.api.createRadialGradient || 0), 'drawImage=' + (c.api.drawImage || 0));
}
try { proc.kill(); } catch {}
ws.close();
process.exit(0);
