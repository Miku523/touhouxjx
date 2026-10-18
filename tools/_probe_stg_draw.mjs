// 诊断 STG 关 Boss 位置/可见性：node tools/_probe_stg_draw.mjs [--stage 3] [--port 9393]
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
const PORT = Number(argv.port || 9393);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-stg-'));
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
const shot = async (file) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(s.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL_BASE}?stg=${Date.now()}` });
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) break;
  await sleep(200);
}

await evaluate(`(async () => {
  const g = window.__game;
  const m = await import('/tools/sim_bot.js?t=' + Date.now());
  window.__bot = m.install({ god: true, maxRetries: 0 });
  window.__step = (n = 1) => { for (let i = 0; i < n; i++) { window.__bot.decide(); g.update(1/60); window.__bot.after(); } };
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) window.__step(1);
  g.startStage(${STAGE});
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) window.__step(1);
  window.__step(120);
  const s = g.stage;
  return { reached: s.stg.reachedBoss, scroll: s.stg.scroll, trigger: s.stg.bossTriggerScroll };
})()`).then((v) => console.log('pre-boss', JSON.stringify(v)));

const read = () => evaluate(`(() => {
  const g = window.__game, s = g.stage, b = s.boss, p = s.player, st = s.stg;
  return {
    state: g.state, stageState: s.state, scroll: +st.scroll.toFixed(1), cam: +s.camera.x.toFixed(1),
    boss: b ? { x: +b.x.toFixed(1), y: +b.y.toFixed(1), screenX: +(b.x - s.camera.x).toFixed(1), state: b.state, hp: b.hp } : null,
    player: { worldX: +p.worldX.toFixed(1), worldY: +p.worldY.toFixed(1), sx: p.sx, sy: p.sy, visible: p.visible },
    bullets: s.bullets.active ?? null,
  };
})()`);

// 一路飞到 Boss 触发点（scroll 2440 ≈ 需要约 1600 帧），再过完战前对白
await evaluate(`(() => { for (let i = 0; i < 1900 && !window.__game.stage.bossStarted; i++) window.__step(1); })()`);
console.log('at-trigger', JSON.stringify(await read()));

await evaluate(`window.__step(60)`);
console.log('boss+1s', JSON.stringify(await read()));
await shot('_stg_boss_1s.png');

await evaluate(`window.__step(660)`);
console.log('boss+12s', JSON.stringify(await read()));
await shot('_stg_boss_12s.png');

ws.close();
proc.kill();
