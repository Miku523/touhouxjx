// 用独立 headless Edge 截「符卡专属弹型预览表」全页图
// 用法：node tools/shot_skins.mjs <out.png> [query] [waitMs] [w]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'skin_preview.png';
const query = process.argv[3] ?? '';
const waitMs = Number(process.argv[4] ?? 900);
const VIEW_W = Number(process.argv[5] ?? 1300);
const PORT = Number(process.env.SHOT_PORT ?? 9333);

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = mkdtempSync(join(tmpdir(), 'edge-skin-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${VIEW_W},1600`, `--remote-debugging-port=${PORT}`, 'about:blank',
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
await send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: 1600, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/tools/bulletSkinPreview.html${query ? '?' + query : ''}` });

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};

let ready = false;
for (let i = 0; i < 80; i++) {
  ready = await evaluate('!!window.__previewReady');
  if (ready) break;
  await sleep(200);
}
if (!ready) {
  console.log('PREVIEW_FAIL', await evaluate('JSON.stringify({u:location.href,r:document.readyState,e:(window.__loadErr||"")})'));
  throw new Error('preview not ready');
}
await sleep(waitMs);
const h = await evaluate('document.getElementById("sheet").height');
await send('Emulation.setDeviceMetricsOverride', { width: VIEW_W, height: h, deviceScaleFactor: 1, mobile: false });
await sleep(200);
const r = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: VIEW_W, height: h, scale: 1 },
});
writeFileSync(out, Buffer.from(r.data, 'base64'));
console.log('SAVED', out, VIEW_W + 'x' + h);
ws.close();
proc.kill();
process.exit(0);
