// 验证「在 Boss 场地残机用尽 → 重挑战直接回 Boss」的续关行为。
//   node tools/_probe_retryboss.mjs [--port 9402] [--diff N]
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
const PORT = Number(argv.port || 9402);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const DIFF = argv.diff || 'N';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-retryboss-'));
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
await send('Page.navigate', { url: `${URL_BASE}?rb=${Date.now()}` });
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) break;
  await sleep(200);
}

const out = await evaluate(`(async () => {
  const g = window.__game;
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message)));
  const bot = (await import('/tools/sim_bot.js?t=' + Date.now())).install({ god: true, maxRetries: 0 });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { bot.decide(); g.update(1/60); bot.after(); } };
  const until = (fn, max = 3000) => { for (let i = 0; i < max; i++) { if (fn()) return true; step(1); } return false; };

  try { localStorage.removeItem('hks.progress.v1'); } catch {}
  g.difficulty = ${JSON.stringify(DIFF)}; g.char = 'reimu'; g.musicOn = false;
  g.showTitle();
  g.startGame();
  until(() => g.state === 'play', 600);

  // 拉到 Boss 触发线，让正式流程建立 Boss 与检查点
  const s0 = g.stage;
  const triggerX = Math.max(200, Math.min(s0.goalX - 120, s0.level.w - 520 - 420));
  s0.player.reset(triggerX - 30, s0._safeSpot.y);
  until(() => s0.bossStarted, 1200);
  // 战前对白自动推进
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) { g.input.justPressed.add('confirm'); step(1); g.input.justPressed.delete('confirm'); }
  until(() => g.state === 'play' && s0.boss, 600);

  const before = {
    stageState: s0.state, bossStarted: s0.bossStarted,
    boss: s0.boss && s0.boss.def.name, bossHp: s0.boss && Math.round(s0.boss.hp),
    px: Math.round(s0.player.x), py: Math.round(s0.player.y),
    cp: s0.player.checkpoint && { x: Math.round(s0.player.checkpoint.x), y: Math.round(s0.player.checkpoint.y) },
    lives: s0.player.lives,
  };

  // 残机打到 1，然后在 Boss 场地阵亡
  s0.player.lives = 1;
  s0.player.invuln = 0;
  s0.player.die();
  step(80);   // 逻辑帧推完 0.9s 死亡动画 → 复活失败 → gameover
  const gameover = { state: g.state, stageState: s0.state, playerLives: s0.player.lives };

  // 重挑战
  g._retryStage();
  until(() => g.state === 'play', 600);
  step(30);
  const s1 = g.stage;
  const after = {
    state: g.state, stageState: s1.state, bossStarted: s1.bossStarted,
    boss: s1.boss && s1.boss.def.name, bossHp: s1.boss && Math.round(s1.boss.hp),
    px: Math.round(s1.player.x), py: Math.round(s1.player.y),
    cp: s1.player.checkpoint && { x: Math.round(s1.player.checkpoint.x), y: Math.round(s1.player.checkpoint.y) },
    lives: s1.player.lives, invuln: +s1.player.invuln.toFixed(2),
    hp: s1.player.hp, bullets: s1.bullets.activeCount,
    sameLevel: s1.level.name === s0.level.name,
    playerAlive: s1.player.alive,
  };
  return { before, gameover, after, errors: errs };
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
