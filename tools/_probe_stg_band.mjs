// 测 STG 关 Boss 的「可命中高度带」：把玩家钉在不同 sy，按住射击 5 秒，量 Boss 掉血。
//   node tools/_probe_stg_band.mjs [--stage 3] [--port 9396]
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
const PORT = Number(argv.port || 9396);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-band-'));
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
await send('Page.navigate', { url: `${URL_BASE}?band=${Date.now()}` });
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) break;
  await sleep(200);
}

await evaluate(`(async () => {
  const g = window.__game;
  const m = await import('/tools/sim_bot.js?t=' + Date.now());
  const bot = m.install({ god: true, maxRetries: 0 });
  window.__bot = bot;
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) { bot.decide(); g.update(1/60); bot.after(); }
  g.startStage(${STAGE});
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) { bot.decide(); g.update(1/60); bot.after(); }
  // 推到 Boss 触发点并开战
  for (let i = 0; i < 4000 && !g.stage.bossStarted; i++) { bot.decide(); g.update(1/60); bot.after(); }
  for (let i = 0; i < 120; i++) { bot.decide(); g.update(1/60); bot.after(); }  // 入场动画
  return { boss: g.stage.boss && g.stage.boss.name, y: g.stage.boss && g.stage.boss.y, state: g.stage.boss && g.stage.boss.state };
})()`).then((v) => console.log('ready', JSON.stringify(v)));

const result = await evaluate(`(() => {
  const g = window.__game, s = g.stage, b = s.boss, p = s.player;
  const bot = window.__bot;
  let fired = 0, hits = 0;
  const realFire = s.shots.fire.bind(s.shots);
  s.shots.fire = (...a) => { fired++; return realFire(...a); };
  const realDamage = b.damage.bind(b);
  b.damage = (d) => { hits++; };              // 只计数，不让 Boss 掉血/换符卡
  const rows = [];
  for (const sy of [260, 290, 320, 350, 380, 410, 440, 470, 500, 530, 560, 590, 620]) {
    const bx = b.x, by = b.y;
    fired = 0; hits = 0;
    for (let i = 0; i < 300; i++) {           // 5 秒 60fps
      b.x = bx; b.y = by; b.state = 'battle';
      s.bullets.clear();
      s.state = 'boss';
      p.alive = true; p.invuln = 99; p.hearts = 99;
      p.sx = 640; p.sy = sy; p.facing = 1;
      p.worldX = s.stg.scroll + p.sx; p.worldY = p.sy;
      p.shootCd = 0;
      bot.held.add('shoot');
      g.update(1/60);
    }
    bot.held.delete('shoot');
    rows.push({ sy, hits, fired, gState: g.state, bossY: +by.toFixed(0), bandTop: +(by - b.h * 0.78).toFixed(0), bandBottom: +by.toFixed(0) });
  }
  s.shots.fire = realFire;
  b.damage = realDamage;
  return rows;
})()`);

console.log(JSON.stringify(result, null, 1));
ws.close();
proc.kill();
