// 卡关定位：跑指定关卡，记录每帧位置，找出「长时间不前进」的位置并 dump 该处瓦片图
// node tools/_probe_stall.mjs --stage 2 --maxSteps 6000 [--startX 2000]
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
const PORT = Number(argv.port || 9393);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const MAXSTEPS = Number(argv.maxSteps || 6000);
const CHUNK = Number(argv.chunk || 500);
const STARTX = argv.startX !== undefined ? Number(argv.startX) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-stall-'));
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
await send('Page.navigate', { url: `${URL_BASE}?stall=${Date.now()}` });
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) throw new Error('boot timeout');

await evaluate(`(async () => {
  const g = window.__game;
  const m = await import('/tools/sim_bot.js?t=' + Date.now());
  window.__bot = m.install({ god: true, maxRetries: 0 });
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true; g.showTitle();
  g.startGame();
  const step = (n = 1) => { for (let i = 0; i < n; i++) { window.__bot.decide(); g.update(1/60); window.__bot.after(); } };
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  g.startStage(${STAGE});
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  ${STARTX !== null ? `g.stage.player.x = ${STARTX}; g.stage.player.y = 0; g.stage.player.vy = 0;` : ''}
  window.__cnt = { fired: 0, hits: 0, dmg: 0, wrappedBoss: false };
  const osf = g.stage.shots.fire.bind(g.stage.shots);
  g.stage.shots.fire = (...a) => { window.__cnt.fired++; return osf(...a); };
  window.__trace = [];
  window.__probeStep = (n) => {
    const s = g.stage, p = s.player;
    if (s.boss && !window.__cnt.wrappedBoss) {
      window.__cnt.wrappedBoss = true;
      const od = s.boss.damage.bind(s.boss);
      s.boss.damage = (d) => { window.__cnt.hits++; window.__cnt.dmg += d; return od(d); };
    }
    for (let i = 0; i < n; i++) {
      step(1);
      window.__trace.push([+p.x.toFixed(1), +p.y.toFixed(1), +(p.vx || 0).toFixed(0), +(p.vy || 0).toFixed(0),
        p.onGround ? 1 : 0, s.state, p.jumpsLeft, p.alive ? 1 : 0]);
      if (window.__trace.length > 900) window.__trace.shift();
    }
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), t: +s.t.toFixed(1), state: s.state, maxX: +window.__bot.stageMaxX.toFixed(1) };
  };
  return { ok: true };
})()`);

let last = null;
for (let done = 0; done < MAXSTEPS; done += CHUNK) {
  last = await evaluate(`window.__probeStep(${Math.min(CHUNK, MAXSTEPS - done)})`);
  if (last.state === 'dead') await sleep(950);
}
const out = await evaluate(`(() => {
  const g = window.__game, s = g.stage, p = s.player;
  const L = s.level;
  const tr = window.__trace;
  // 最近 300 帧内 x 的最大值（"最远到过哪"）
  let maxX = 0;
  for (const t of tr) if (t[0] > maxX) maxX = t[0];
  // 瓦片图：玩家附近 18 列 x 12 行
  const cx = Math.floor(p.x / 32), cy = Math.floor(p.y / 32);
  const rows = [];
  for (let r = Math.max(0, cy - 6); r <= Math.min(L.rows - 1, cy + 5); r++) {
    let line = String(r).padStart(2, '0') + ' ';
    for (let c = Math.max(0, cx - 9); c <= Math.min(L.cols - 1, cx + 8); c++) {
      const grid = L.grid || L.tiles;
      const v = grid ? grid[r * L.cols + c] : 0;
      line += String(v).padStart(2, '0') + ' ';
    }
    rows.push(line);
  }
  return { stage: s.level.name, px: +p.x.toFixed(1), py: +p.y.toFixed(1), t: +s.t.toFixed(1), state: s.state,
    boss: s.boss ? { x: +s.boss.x.toFixed(0), hp: Math.round(s.boss.hp), state: s.boss.state } : null,
    goalX: s.goalX, levelW: L.w, cols: L.cols, rowsN: L.rows, cx, cy, tiles: rows,
    cnt: window.__cnt, lastErr: (g.input.__simBot && g.input.__simBot.lastErr) || null, branch: (g.input.__simBot && g.input.__simBot.branch) || null, alive: p.alive, hearts: p.hearts, dialogueActive: !!(g.dialogue && g.dialogue.active), botStop: !!(g.input.__simBot && g.input.__simBot.stop), botState: g.input.__simBot ? g.input.__simBot.prevState : null, held: window.__game.input.__simBot ? [...window.__game.input.__simBot.held] : null, dropping: !!(window.__game.input.__simBot && window.__game.input.__simBot.dropping), span: window.__game.input.__simBot ? window.__game.input.__simBot.groundSpan : null, player: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), facing: p.facing, power: Math.round(p.power || 0), fireLevel: p.fireLevel },
    bossFull: s.boss ? { x: +s.boss.x.toFixed(1), y: +s.boss.y.toFixed(1), w: s.boss.w, h: s.boss.h, hp: Math.round(s.boss.hp), state: s.boss.state, invuln: s.boss.invuln } : null,
    traceTail: tr.slice(-120), bot: { airSaves: window.__bot.airSaves, jumps: window.__bot.jumps,
      dashes: window.__bot.dashes, stuckLogs: window.__bot.stuckLogs, deaths: window.__bot.deaths } };
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
