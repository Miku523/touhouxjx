// 找出「每帧 30 个 CanvasGradient」的创建点：对一帧渲染采样调用栈。
//   node tools/_probe_grad.mjs [--stage 0] [--port 9386]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = {};
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) argv[key] = raw[++i];
    else argv[key] = '1';
  }
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(argv.port || 9386);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-grad-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL_BASE}?grad=${Date.now()}` });
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) throw new Error('boot timeout');

const out = await evaluate(`(async () => {
  const g = window.__game;
  const m = await import('/tools/sim_bot.js?t=' + Date.now());
  const bot = m.install({ god: true, maxRetries: 0 });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { bot.decide(); g.update(1/60); bot.after(); } };
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  if (${STAGE} > 0) g.startStage(${STAGE});
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  step(120); // 让粒子/粒子池进入稳态
  for (let i = 0; i < 120; i++) { step(1); g.render(0.5); } // 让贴图缓存先填满（区分首帧烘焙 vs 稳态抖动）

  const P = CanvasRenderingContext2D.prototype;
  const sites = new Map();
  let on = false;
  for (const k of ['createLinearGradient', 'createRadialGradient', 'fill', 'stroke']) {
    const o = P[k];
    P[k] = function (...a) {
      if (on) {
        const st = new Error().stack.split('\\n').slice(2, 5).map((s) => s.trim().replace(/^at /, '')).join(' <- ');
        sites.set(k + ' :: ' + st, (sites.get(k + ' :: ' + st) || 0) + 1);
      }
      return o.apply(this, a);
    };
  }
  on = true;
  g.render(0.5);
  on = false;
  return [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
