// 死亡→复活计时回归测试：
// 旧实现用 setTimeout(900) 在逻辑帧之外复活，同步推进逻辑帧时永远等不到；
// 现在改为逻辑时钟，同步步进 ~54 帧必须复活，且暂停时不倒数。
//   node tools/_probe_respawn.mjs [--port 9384]
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
const PORT = Number(argv.port || 9384);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-respawn-'));
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
await send('Page.navigate', { url: `${URL_BASE}?respawn=${Date.now()}` });
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
  const step = (n = 1, fakeStep = false) => { for (let i = 0; i < n; i++) { bot.decide(); g.update(1/60); bot.after(); if (fakeStep) bot.steps++; } };

  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  step(10);
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  // 关掉 bot 的输入接管，避免它自己乱动影响判定
  bot.setEnabled && bot.setEnabled(false);

  const s = g.stage;
  const before = { lives: s.player.lives, hearts: s.player.hearts, power: Math.round(s.player.power) };
  // 人为掉出关卡底部：Player.update 里 y > level.h + 80 会触发 die
  s.player.y = s.level.h + 200;
  step(3);
  const afterFall = { state: s.state, deathT: +s.deathT.toFixed(3), lives: s.player.lives };

  // 暂停时不应倒数：直接把主状态设为 paused 再步进（update 里 paused 会提前 return）
  const prevState = g.state;
  g.state = 'paused';
  step(20);
  const duringPause = { state: s.state, deathT: +s.deathT.toFixed(3) };
  g.state = prevState === 'play' ? 'play' : prevState;

  // 剩余时间继续走完（约 0.9s = 54 帧）
  let respawnFrame = -1;
  for (let i = 0; i < 120; i++) {
    step(1, true);
    if (s.state !== 'dead') { respawnFrame = i + 1; break; }
  }
  const after = { state: s.state, lives: s.player.lives, hearts: s.player.hearts,
    invuln: +s.player.invuln.toFixed(2), bullets: s.bullets.pool.filter((b) => b.active).length, deathT: s.deathT };

  // 重挑战本关：应跳过已看过的开场对白，直接回到可操作状态
  g._retryStage();
  const retry = { state: g.state, hasStage: !!(g.stage && g.stage.player), stageIndex: g.levelIndex };

  return {
    before, afterFall, duringPause, respawnFrame, after, retry,
    ok: afterFall.state === 'dead' && duringPause.state === 'dead' && duringPause.deathT === afterFall.deathT
        && respawnFrame > 0 && respawnFrame < 90 && after.state === 'play' && after.lives === before.lives - 1,
  };
})()`);
console.log(JSON.stringify(out, null, 1));
if (!out.ok) process.exitCode = 1;
ws.close();
proc.kill();
