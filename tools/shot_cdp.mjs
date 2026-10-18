// 用独立 headless Edge 截图：不依赖共享的 ego 浏览器
// 用法：node tools/shot_cdp.mjs <stage> <out.png> [waitMs] [w] [h]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stage = process.argv[2] ?? '0';
const out = process.argv[3] ?? 'shot.png';
const waitMs = Number(process.argv[4] ?? 3200);
const W = Number(process.argv[5] ?? 1280);
const H = Number(process.argv[6] ?? 720);
const startX = process.argv[7] ? Number(process.argv[7]) : null;

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-'));

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await getTarget();
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
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?shot=${Date.now()}` });

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};

// 等 __game 就绪
let ready = false;
for (let i = 0; i < 80; i++) {
  ready = await evaluate('!!window.__game && !!window.__game.stage || !!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) {
  const info = await evaluate('JSON.stringify({u:location.href,r:document.readyState,n:(document.body&&document.body.innerHTML.length)||0,e:(window.__loadErr||"")})');
  console.log('BOOT_FAIL', info);
  throw new Error('game did not boot');
}

await evaluate(`(() => {
  const g = window.__game;
  g.startStage(${stage});
  return 'started';
})()`);
await sleep(900);
await evaluate(`(() => {
  const g = window.__game;
  try { if (g.dialogue) g.dialogue.close(); } catch (e) {}
  g.state = 'play';
  if (g.dialogue) g.dialogue.active = false;
  const d = document.getElementById('dialogue'); if (d) d.classList.add('hidden');
  const ov = document.getElementById('overlay'); if (ov) ov.classList.add('hidden');
  return 'play';
})()`);
if (process.env.SHOT_EVAL) {
  const r = await evaluate(process.env.SHOT_EVAL);
  console.log('EVAL', r);
}
await evaluate("window.__errs=window.__errs||[];addEventListener('error',e=>window.__errs.push(String(e.message)))");
if (process.env.SHOT_EVAL2) {
  const r2 = await evaluate(process.env.SHOT_EVAL2);
  console.log('EVAL2', r2);
}
if (startX != null) {
  await evaluate(`(() => {
    const s = window.__game.stage;
    s.player.x = ${startX};
    s.player.y = s.player.y - 40;
    if (s.camera && s.camera.snapTo) s.camera.snapTo(${startX});
    if (s.camera && s.camera.view) { s.camera.view.x = ${startX}; s.camera.view.y = 0; }
    return 'moved';
  })()`);
}
await sleep(waitMs);
const dbg = await evaluate(`(() => {
  const s = window.__game.stage;
  const t = s.level.theme;
  const L = (s._bgLayers && s._bgLayers[t]) || [];
  return JSON.stringify({ theme: t, layers: L.length, prog: +((s.camera.view.x) / Math.max(1, (s.level.w - 1280))).toFixed(2), w: s.level.w, camx: Math.round(s.camera.view.x) });
})()`);
console.log('DBG', dbg);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
ws.close();
proc.kill();
await sleep(400);
process.exit(0);
