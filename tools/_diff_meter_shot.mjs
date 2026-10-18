// 难度详情条的视觉核对：四档各截一条，验证四格条真的递进
// 用法: node tools/_diff_meter_shot.mjs [outDir]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = process.argv[2] ?? '.';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9343;
const profile = mkdtempSync(join(tmpdir(), 'edge-meter-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
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
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?meter=${Date.now()}` });

let ready = false;
for (let i = 0; i < 100; i++) {
  ready = await evaluate('!!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) throw new Error('game did not boot');

await evaluate(`(() => { const g = window.__game; g.showTitle(); g.showDifficultySelect(); return true; })()`);
await sleep(500);

const rows = [];
for (const key of ['L', 'H', 'N', 'E']) {
  await sleep(350);
  const box = await evaluate(`(() => {
    const g = window.__game;
    g._updateDiffDetail(${JSON.stringify(key)});
    const el = g.buttonsEl.querySelector('.diff-detail');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, lines: el.getClientRects().length, text: el.innerText.replace(/\\s+/g, ' ').trim() };
  })()`);
  if (!box) throw new Error('detail bar not found');
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 2 },
  });
  const path = join(outDir, `meter_${key.toLowerCase()}.png`);
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
  rows.push({ key, text: box.text, path });
  console.log(key, box.text);
}

writeFileSync(join(outDir, 'meters.json'), JSON.stringify(rows, null, 2));
ws.close();
proc.kill();
console.log('DONE');
