// 定位进关首帧卡顿：统计「首帧」与「稳态帧」在资源构建上的差异
// 思路：不测绝对耗时（headless 软渲染失真），而是数一次性资源（canvas / gradient / pattern）
// 用法: node tools/_profile_firstframe.mjs [port]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9540);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8142/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-prof-'));

const proc = spawn(EDGE, ['--headless=new', '--no-first-run', '--mute-audio',
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
  return r.result?.result?.value ?? JSON.stringify(r.result?.result);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL0 });
await sleep(3200);
console.log('页面:', await ev('(() => { const g = window.__game; return g ? "ok state=" + g.state : "NO_GAME"; })()'));

const out = await ev(`(async () => {
  const C = {};
  const bump = (k) => { C[k] = (C[k] || 0) + 1; };
  let on = false;

  // 1) canvas 创建
  const origCreate = document.createElement.bind(document);
  document.createElement = function (tag, ...a) {
    if (on && String(tag).toLowerCase() === 'canvas') bump('canvas');
    return origCreate(tag, ...a);
  };

  // 2) 只 patch 原型上真正的函数属性（filter 是 accessor，跳过）
  const P = CanvasRenderingContext2D.prototype;
  const names = ['createLinearGradient','createRadialGradient','createPattern','drawImage','fillText','measureText','getImageData','putImageData','createImageData'];
  const origs = {};
  for (const n of names) {
    const desc = Object.getOwnPropertyDescriptor(P, n);
    if (!desc || typeof desc.value !== 'function') continue;
    origs[n] = desc.value;
    const fn = desc.value;
    P[n] = function (...a) { if (on) bump(n); return fn.apply(this, a); };
  }

  const stageMod = await import('/src/game/stage.js');
  const g = window.__game;
  g.lives = 99; g.char = 'reimu';

  const snap = () => ({ ...C });
  const origDraw = stageMod.Stage.prototype.draw;
  let n = 0;
  const first = {}, third = {};
  stageMod.Stage.prototype.draw = function (...a) {
    if (n === 0) { for (const k in C) delete C[k]; on = true; }
    const r = origDraw.apply(this, a);
    if (n === 0) { on = false; Object.assign(first, snap()); }
    if (n === 3) { for (const k in C) delete C[k]; on = true; }
    if (n === 4) { on = false; Object.assign(third, snap()); }
    n++;
    return r;
  };

  g.startStage(0);
  await new Promise(r => setTimeout(r, 2500));
  stageMod.Stage.prototype.draw = origDraw;
  document.createElement = origCreate;
  for (const n2 of Object.keys(origs)) P[n2] = origs[n2];

  return JSON.stringify({ 首帧: first, 第5帧: third, 已统计的API: Object.keys(origs) });
})()`);

console.log('\n=== 一次性资源构建：首帧 vs 稳态帧 ===');
const j = JSON.parse(out);
console.log('首帧  :', JSON.stringify(j.首帧));
console.log('第5帧 :', JSON.stringify(j.第5帧));

proc.kill();
process.exit(0);
