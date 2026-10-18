// 实时性能探针：真实 rAF + 真实按键（bot），统计 update / render 耗时分布。
//
//   node tools/_perf_live.mjs --diff N --stage 1 --sec 25 --port 9370
//
// 输出每帧耗时 p50/p95/max，以及 update/render 各自占比；最后截一张图。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
const PORT = Number(argv.port || 9370);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const SEC = Number(argv.sec || 20);
const DIFF = String(argv.diff || 'N').toUpperCase();
const STAGE = Number(argv.stage ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-perf-'));
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL_BASE}?perf=${Date.now()}` });
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) throw new Error('boot timeout');

await evaluate(`localStorage.removeItem('hks.progress.v1');`);
await evaluate(`
  window.__probe = { up: [], rd: [], frames: 0, maxBullets: 0, ops: { fill: 0, stroke: 0, img: 0 } };
  (() => {
    const g = window.__game;
    g.difficulty = '${DIFF}'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true;
    g.showTitle();
    const bot = null;
  })();
`);
// 注入 bot 并接管 update
const ok = await evaluate(`(async () => {
  const m = await import('/tools/sim_bot.js?t=${Date.now()}');
  const bot = m.install({ god: true, maxRetries: 1 });
  const g = window.__game;
  const _u = g.update.bind(g), _r = g.render.bind(g);
  const P = window.__probe;
  g.update = (dt) => { const t0 = performance.now(); bot.decide(); _u(dt); bot.after(); bot.steps++; P.up.push(performance.now() - t0); };
  g.render = (a) => { const t0 = performance.now(); _r(a); P.rd.push(performance.now() - t0); P.frames++; };
  if (${STAGE} > 0) {
    g.startGame();
    // 等到进入 play 再跳关（跳过开场对话）
    const t0 = performance.now();
    while (g.state === 'dialogue' && performance.now() - t0 < 6000) { bot.decide(); _u(1/60); bot.after(); }
    g.startStage(${STAGE});
  } else {
    g.startGame();
  }
  return true;
})()`);
if (!ok) throw new Error('hook failed');

await sleep(SEC * 1000);
const out = await evaluate(`(() => {
  const P = window.__probe;
  const pct = (arr, p) => { if (!arr.length) return 0; const A = [...arr].sort((a, b) => a - b); return +A[Math.min(A.length - 1, Math.floor(A.length * p))].toFixed(2); };
  const avg = (arr) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : 0;
  const s = window.__game.stage;
  let bullets = 0;
  if (s && s.bullets) for (const b of s.bullets.pool) if (b.active) bullets++;
  return {
    sec: ${SEC},
    frames: P.frames,
    fps: window.__game.loop.fps.toFixed(1),
    upAvg: avg(P.up), upP50: pct(P.up, 0.5), upP95: pct(P.up, 0.95), upMax: pct(P.up, 0.999),
    rdAvg: avg(P.rd), rdP50: pct(P.rd, 0.5), rdP95: pct(P.rd, 0.95), rdMax: pct(P.rd, 0.999),
    stage: s ? { name: s.level.name, state: s.state, bullets } : null,
    state: window.__game.state,
    errors: window.__probe.errors || [],
  };
})()`);
console.log(JSON.stringify(out, null, 1));
if (argv.shot) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(argv.shot, Buffer.from(shot.data, 'base64'));
  console.log('shot', argv.shot);
}
ws.close();
proc.kill();
