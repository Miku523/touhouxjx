// 探测：把 Boss 单独画到离屏 canvas 上，量出立绘相对 (x,y) 原点的真实包围盒。
// 用途：确定破势条 / 眩晕星该画在什么高度，避免压在脸上。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9336;
const profile = mkdtempSync(join(tmpdir(), 'edge-probe-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await r.json();
    page = list.find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?probe=${Date.now()}` });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(800);

const out = await ev(`(async () => {
  const g = window.__game;
  g.startStage(1);
  await new Promise((r) => setTimeout(r, 300));
  const s = g.stage;
  try { g.dialogue?.close(); } catch (e) {}
  g.state = 'play'; s.state = 'play';
  s.beginBoss();
  await new Promise((r) => setTimeout(r, 1200));
  const b = s.boss;
  b.alpha = 1;
  b.platformMelee = false;          // 只量立绘，不量破势条
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 720;
  const c = cv.getContext('2d');
  b.x = 640; b.y = 600;   // draw() 用世界坐标，拉到画布中心再量
  b.draw(c, 0);
  const d = c.getImageData(0, 0, 1280, 720).data;
  let x0 = 9999, y0 = 9999, x1 = -1, y1 = -1;
  for (let y = 0; y < 720; y++) {
    for (let x = 0; x < 1280; x++) {
      const i = (y * 1280 + x) * 4;
      if (d[i + 3] > 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return JSON.stringify({
    key: b.key, h: b.h, y: b.y,
    artTop: y0 - 600, artBottom: y1 - 600, artH: y1 - y0,
    artW: x1 - x0, cxOff: (x0 + x1) / 2 - 640,
  });
})()`);
console.log('ART', out);
try { ws.close(); } catch {}
try { proc.kill(); } catch {}
process.exit(0);
