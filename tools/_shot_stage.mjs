// 指定关卡/帧数截图（用于视觉回归）：node tools/_shot_stage.mjs --stage 2 --out _s3.png
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
    if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) argv[key] = raw[++i];
    else argv[key] = '1';
  }
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(argv.port || 9390);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const FRAMES = Number(argv.frames || 120);
const OUT = argv.out || `_shot_stage${STAGE}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-shot-'));
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
await send('Page.navigate', { url: `${URL_BASE}?shot=${Date.now()}` });
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) throw new Error('boot timeout');

const info = await evaluate(`(async () => {
  const g = window.__game;
  const m = await import('/tools/sim_bot.js?t=' + Date.now());
  const bot = m.install({ god: true, maxRetries: 0 });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { bot.decide(); g.update(1/60); bot.after(); } };
  g.difficulty = ${JSON.stringify(String(argv.diff || 'N'))}; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  g.startStage(${STAGE});
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  ${argv.boss ? `if (!g.stage.bossStarted) {
    // STG 关：先把滚动推到 Boss 触发点，否则 Boss 会生成在画面左侧之外
    if (g.stage.mode === 'stg' && g.stage.stg) {
      g.stage.stg.scroll = g.stage.stg.bossTriggerScroll;
      g.stage.stg.reachedBoss = true;
      g.stage.camera.x = g.stage.stg.scroll;
    }
    g.stage.beginBoss();
  }
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);` : ''}
  ${argv.extra ? `g.inExtra = true; g.lives = 3; g.carryPower = 128; g._startExtraStage();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);` : ''}
  ${argv.bloomforce ? 'g.renderer.postLevel = 2; g.renderer.bloomInterval = 1; g.renderer._bloomWarm = 99;' : ''}
  ${argv.bloomoff ? 'g.renderer.postLevel = 1;' : ''}
  for (let i = 0; i < ${FRAMES}; i++) { step(1); g.render(0.5); }
  const s = g.stage;
  return { stage: s && s.level.name, theme: s && s.level.theme, state: g.state, cam: s && Math.round(s.camera.x) };
})()`);
await sleep(120);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ ...info, out: OUT }));
ws.close();
proc.kill();
