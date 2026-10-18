// 每帧 Canvas2D 绘制调用统计（真实渲染路径，不依赖 GPU 性能）：
// 统计 drawImage / fill / stroke / createGradient / save 的次数与「近似填充面积」。
//
//   node tools/_draw_ops.mjs --stage 0 --boss 1 --frames 240 --port 9380
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
    if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) { argv[key] = raw[++i]; }
    else argv[key] = '1';
  }
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(argv.port || 9380);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const BOSS = argv.boss === '1';
const FRAMES = Number(argv.frames || 240);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-draw-'));
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
await send('Page.navigate', { url: `${URL_BASE}?draw=${Date.now()}` });
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) throw new Error('boot timeout');

const out = await evaluate(`(async () => {
  const g = window.__game;
  const P = CanvasRenderingContext2D.prototype;
  const C = window.__count = { cur: null, frames: [], on: false, area: 0 };
  const reset = () => { C.cur = { img: 0, fill: 0, stroke: 0, grad: 0, save: 0, area: 0 }; };
  reset();
  for (const k of ['drawImage', 'fill', 'stroke', 'createLinearGradient', 'createRadialGradient', 'save']) {
    const o = P[k];
    P[k] = function (...a) {
      if (C.on && C.cur) {
        if (k === 'drawImage') C.cur.img++;
        else if (k === 'fill') C.cur.fill++;
        else if (k === 'stroke') C.cur.stroke++;
        else if (k === 'save') C.cur.save++;
        else C.cur.grad++;
      }
      return o.apply(this, a);
    };
  }
  const of = P.fillRect;
  P.fillRect = function (x, y, w, h) { if (C.on && C.cur) C.cur.area += Math.abs(w * h); return of.call(this, x, y, w, h); };
  const ofp = P.fill;
  P.fill = function (...a) { if (C.on && C.cur) C.cur.fill++; return ofp.apply(this, a); };

  const _r = g.render.bind(g);
  g.render = (a) => {
    C.on = true;
    _r(a);
    C.frames.push(C.cur);
    reset();
  };

  const m = await import('/tools/sim_bot.js?t=' + Date.now());
  const bot = m.install({ god: true, maxRetries: 0 });
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true; g.showTitle();
  g.startGame();
  // 跳过开场对话
  for (let i = 0; i < 360 && g.state === 'dialogue'; i++) { bot.decide(); g.update(1/60); bot.after(); }
  if (${STAGE} > 0) g.startStage(${STAGE});
  for (let i = 0; i < 240 && g.state === 'dialogue'; i++) { bot.decide(); g.update(1/60); bot.after(); }
  ${BOSS ? `if (g.stage && !g.stage.bossStarted) { g.stage.beginBoss(); }` : ''}
  // 跑帧
  for (let i = 0; i < ${FRAMES}; i++) { bot.decide(); g.update(1/60); bot.after(); bot.steps++; g.render(0.5); }
  const s = g.stage;
  let bullets = 0;
  if (s && s.bullets) for (const b of s.bullets.pool) if (b.active) bullets++;
  const F = C.frames.slice(-${Math.min(FRAMES, 120)});
  const avg = (key) => +(F.reduce((a, f) => a + f[key], 0) / F.length).toFixed(1);
  const max = (key) => Math.max(...F.map((f) => f[key]));
  return {
    sample: F.length, stage: s ? s.level.name : null, stageState: s ? s.state : null,
    boss: s && s.boss ? { name: s.boss.def.name, state: s.boss.state, hp: Math.round(s.boss.hp) } : null,
    bullets,
    img: avg('img'), imgMax: max('img'),
    fill: avg('fill'), fillMax: max('fill'),
    stroke: avg('stroke'), strokeMax: max('stroke'),
    grad: avg('grad'), gradMax: max('grad'),
    save: avg('save'), saveMax: max('save'),
    fillAreaPx: Math.round(avg('area')),
  };
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
