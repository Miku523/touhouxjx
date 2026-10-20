// 渲染开销基准：逐帧背景绘制 vs 一次性预合成曝光，改造前后 A/B。
// 用法：node tools/_pt_bench.mjs [--url ...] [--port 9392] [--stage 0|--extra]
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
const PORT = Number(argv.port || 9392);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-bench-'));
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
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { res, rej });
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
await send('Page.navigate', { url: `${URL_BASE}?shot=${Date.now()}` });
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) throw new Error('boot timeout');
const info = await evaluate(`(async () => {
  const g = window.__game;
  g.update = () => {};
  g._playDialogue = () => {};
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true; g.showTitle();
  g.lives = 3; g.carryPower = 4; g.continues = 0; g.levelIndex = 0;
  ${argv.extra ? `g.inExtra = true; g.carryPower = 0; g._startExtraStage();` : `g.inExtra = false; g.startStage(${STAGE});`}
  g.state = 'play';
  for (const hid of ['hud', 'banner']) { const el = document.getElementById(hid); if (el) el.style.display = 'none'; }
  const s = g.stage; const theme = s.level.theme;
  for (let i = 0; i < 240; i++) {
    g.render(0.5);
    const lays = s._bgLayers && s._bgLayers[theme];
    const cnt = lays ? lays.filter((x) => !!x).length : 0;
    if (cnt >= 2) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  try { g.dialogue?.stop?.(); } catch {}
  g.state = 'play';
  const W = 1280;
  s.camera.x = Math.max(0, (s.level.w || W) - W); s.camera.prevX = s.camera.x; s.camera.tx = s.camera.x;
  if (s.mode === 'stg' && s.stg) s.stg.scroll = s.camera.x;
  const out = { theme, mode: s.mode, frames: [], compose: [] };
  const ctx = g.renderer && g.renderer.ctx;
  // 抓一次 _drawPaintedBg 的 list（模块内 _bgFor 不可直接访问）
  let cap = null;
  const origPaint = s._drawPaintedBg.bind(s);
  s._drawPaintedBg = (c, l, cam, th) => { cap = l; return origPaint(c, l, cam, th); };
  g.render(0.5);
  s._drawPaintedBg = origPaint;
  const list = cap || [];
  out.layers = list.length;
  // 1) 热路径背景绘制：直接调 _drawPaintedBg（2 次贴图 + 3 个渐变）
  for (let i = 0; i < 6; i++) origPaint(ctx, list, s.camera, theme);
  for (let round = 0; round < 3; round++) {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) origPaint(ctx, list, s.camera, theme);
    out.frames.push((performance.now() - t0) / 10);
  }
  // 2) 一次性预合成（每变体一次；含曝光 pass）
  for (let round = 0; round < 3; round++) {
    const t0 = performance.now();
    for (let i = 0; i < 4; i++) {
      s._composeBgLayer([list[i % Math.max(1, list.length)]], theme, (list[i % Math.max(1, list.length)].idx | 0));
    }
    out.compose.push((performance.now() - t0) / 4);
  }
  return out;
})()`);
// avg
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const mn = (a) => Math.min(...a);
console.log(JSON.stringify({
  theme: info.theme, mode: info.mode,
  bgDrawMsMin: +mn(info.frames).toFixed(2),
  bgDrawMsAvg: +avg(info.frames).toFixed(2),
  composeMsMin: +mn(info.compose).toFixed(2),
  composeMsAvg: +avg(info.compose).toFixed(2),
  layers: info.layers,
}));
ws.close(); proc.kill();
