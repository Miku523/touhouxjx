// 录制标题开屏动画为 GIF 的原始帧（headless Edge + Page.startScreencast）
// 用法：node tools/_title_intro_gif.mjs   （需先起 8137 静态服务器）
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = '_pt/intro/gif';
mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9336;
const profile = mkdtempSync(join(tmpdir(), 'edge-gif-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let devtools;
for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    devtools = list.find((t) => t.type === 'page');
    if (devtools) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(devtools.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const frames = [];
const t0 = { v: 0 };
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    return;
  }
  if (m.method === 'Page.screencastFrame') {
    const ts = m.params.metadata?.timestamp ? m.params.metadata.timestamp * 1000 : Date.now();
    frames.push({ ts, data: m.params.data });
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?gif=${Date.now()}` });
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game._bootDone)')) break;
  await sleep(150);
}
await sleep(4200); // 等首屏开屏动画完全走完

await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
await sleep(120);
t0.v = Date.now();
await evaluate('window.__game._playTitleIntro()');
await sleep(3500);
await send('Page.stopScreencast');
ws.close();
proc.kill();
await sleep(300);

// 统一重采样到 54ms 一帧（18.5fps），丢弃重复帧
const START = 0, END = 3400, STEP = 54;
const base = frames[0]?.ts || 0;
let last = -1, n = 0;
for (let t = START; t <= END; t += STEP) {
  const abs = base + t;
  let best = frames[0], bd = Infinity;
  for (const f of frames) {
    const d = Math.abs(f.ts - abs);
    if (d < bd) { bd = d; best = f; }
  }
  if (!best || bd > 60) continue;
  const idx = Math.round(t / STEP);
  if (idx === last) continue;
  last = idx;
  writeFileSync(join(OUT, `f${String(n).padStart(3, '0')}.jpg`), Buffer.from(best.data, 'base64'));
  n++;
}
console.log(`FRAMES ${n}  raw ${frames.length}  span ${Math.round((frames.at(-1).ts - base))}ms`);
