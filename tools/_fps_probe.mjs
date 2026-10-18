// 真实 rAF 帧率对比：默认自适应 vs 强制每帧 bloom（旧行为）vs 关后期。
//   node tools/_fps_probe.mjs [--port 9408] [--secs 3] [--stage 0] [--boss 1]
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
const PORT = Number(argv.port || 9408);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const SECS = Number(argv.secs || 3);
const STAGE = Number(argv.stage ?? 0);
const BOSS = argv.boss !== '0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-fps-'));
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
await send('Page.navigate', { url: `${URL_BASE}?fps=${Date.now()}` });
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) break;
  await sleep(200);
}

const out = await evaluate(`(async () => {
  const g = window.__game;
  const bot = (await import('/tools/sim_bot.js?t=' + Date.now())).install({ god: true, maxRetries: 0 });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { bot.decide(); g.update(1/60); bot.after(); } };
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  g.startStage(${STAGE});
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  if (${BOSS ? 'true' : 'false'} && !g.stage.bossStarted) g.stage.beginBoss();
  step(240);

  // 让真实 rAF 循环跑起来：每帧记一次时间戳
  const measure = (secs) => new Promise((resolve) => {
    const times = [];
    const t0 = performance.now();
    const tick = (ts) => {
      times.push(performance.now());
      if (performance.now() - t0 < secs * 1000) requestAnimationFrame(tick);
      else {
        const spans = [];
        for (let i = 1; i < times.length; i++) spans.push(times[i] - times[i-1]);
        spans.sort((a, b) => a - b);
        const avg = spans.reduce((a, b) => a + b, 0) / Math.max(1, spans.length);
        resolve({
          frames: times.length,
          fps: +(1000 / Math.max(0.001, avg)).toFixed(1),
          avgMs: +avg.toFixed(2),
          p50: +(spans[Math.floor(spans.length*0.5)] || 0).toFixed(2),
          p95: +(spans[Math.floor(spans.length*0.95)] || 0).toFixed(2),
        });
      }
    };
    requestAnimationFrame(tick);
  });

  const r = g.renderer;
  const warm = await measure(1);   // 让自适应调参收敛
  const auto = await measure(${SECS});
  const autoState = { level: r.postLevel, interval: r.bloomInterval, ema: +r.bloomEmaMs.toFixed(2) };

  // 旧行为：每帧 bloom
  r.postLevel = 2; r.bloomInterval = 1; r._bloomWarm = 99; r._tuneBloom = () => {};
  const forced = await measure(${SECS});

  // 全关后期
  r.postEnabled = false;
  const none = await measure(${SECS});
  r.postEnabled = true;

  return { warm, auto, autoState, forced, none };
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
