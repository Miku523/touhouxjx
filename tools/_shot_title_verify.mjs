// 标题界面截图（headless Edge + CDP），用于验证 UI 改动
// 用法：node tools/_shot_title_verify.mjs <out.png> [waitMs] [w] [h]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '_title_verify.png';
const waitMs = Number(process.argv[3] ?? 3500);
const W = Number(process.argv[4] ?? 1280);
const H = Number(process.argv[5] ?? 720);

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const profile = mkdtempSync(join(tmpdir(), 'edge-title-'));

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

let ready = false;
for (let i = 0; i < 80; i++) {
  ready = await evaluate('!!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) {
  const info = await evaluate('JSON.stringify({u:location.href,r:document.readyState,e:(window.__loadErr||"")})');
  console.log('BOOT_FAIL', info);
  throw new Error('game did not boot');
}

await sleep(waitMs);
const dbg = await evaluate(`JSON.stringify({
  seal: document.querySelectorAll('.seal').length,
  title: (document.getElementById('title')||{}).textContent,
  titleMode: !!document.querySelector('.overlay.title-mode'),
  titleRect: (()=>{const e=document.getElementById('title'); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})()
})`);
console.log('DBG', dbg);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
ws.close();
proc.kill();
await sleep(400);
process.exit(0);
