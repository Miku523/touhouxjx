// 模拟玩家：用真实输入路径自动通关，输出流程/异常遥测。
//
//   node tools/_sim_player.mjs --diff N --char reimu --god 1 --maxSteps 80000
//   node tools/_sim_player.mjs --extra 1 --god 1
//   node tools/_sim_player.mjs --diff H --god 0            # 公平模式：测死亡/复活/GameOver
//
// 退出码 0，最后一行是 JSON 汇总，便于上游脚本解析。
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
const PORT = Number(argv.port || 9350);
const W = 1280, H = 720;
const DIFF = String(argv.diff || 'N').toUpperCase();
const CHAR = String(argv.char || 'reimu');
const GOD = argv.god !== '0';
const EXTRA = argv.extra === '1';
const URL_BASE = argv.url || 'http://127.0.0.1:8137/index.html';
const MAX_STEPS = Number(argv.maxSteps || 120000);
const CHUNK = Number(argv.chunk || 1200);
const OUT = argv.out || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-sim-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
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
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    consoleErrors.push(d.text + ' ' + (d.exception?.description || ''));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  }
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const t0 = Date.now();
await send('Page.navigate', { url: `${URL_BASE}?sim=${Date.now()}` });

// 等游戏启动
let booted = false;
for (let i = 0; i < 120; i++) {
  try {
    const ok = await evaluate('!!(window.__game && window.__game.input && window.__game.showTitle)');
    if (ok) { booted = true; break; }
  } catch {}
  await sleep(200);
}
if (!booted) throw new Error('game boot timeout');

// 清进度并设定开局
await evaluate('localStorage.removeItem("hks.progress.v1")');
await evaluate(`window.__game.unlockedExtra = true; window.__game.showTitle(); window.__game.difficulty='${DIFF}'; window.__game.char='${CHAR}'; window.__game.musicOn=false;`);












const START_STAGE = Number(argv.stage ?? 0);
await evaluate(`window.__game.carryPower = 128; window.__game.levelIndex = ${START_STAGE}; window.__game.startStage(${START_STAGE})`);
const out = await evaluate(`(async () => {
  const g = window.__game, s = g.stage;
  const mod = await import('/tools/_sim_bot_back.js?t=' + Date.now());
  const bot = mod.install({ god: true, maxRetries: 0 });
  let lastHp = -1, same = 0, stallAt = -1;
  for (let i = 0; i < 30000; i++) {
    bot.run(1);
    const b = s.boss;
    if (b && b.state === 'battle') {
      if (b.hp === lastHp) same++; else { same = 0; lastHp = b.hp; }
      if (same > 900) { stallAt = bot.steps; break; }
    }
  }
  if (stallAt < 0) return { phase: 'no-stall', steps: bot.steps };
  const p = s.player, b = s.boss;
  let shootCalls = 0, shotsFired = 0;
  const origTry = s._tryShoot.bind(s);
  s._tryShoot = function (input) { shootCalls++; return origTry(input); };
  const before = { hp: b.hp, phase: b.spellIdx, bullets: s.bullets ? s.bullets.count ?? -1 : -1 };
  const frames = [];
  for (let k = 0; k < 120; k++) {
    bot.run(1);
    if (k % 20 === 0) frames.push({ k, px: Math.round(p.x), py: Math.round(p.y), face: p.facing, hp: Math.round(b.hp),
      bst: b.state, spellLock: +(b.spellLock || 0).toFixed(2), phase: b.spellIdx,
      activeShots: s.shots && s.shots.pool ? s.shots.pool.filter(o => o.active).length : -1,
      bx: Math.round(b.x), by: Math.round(b.y), held: [...bot.held].join('+'), shootCalls });
  }
  s._tryShoot = origTry;
  const drive = (keys, frames) => {
    const hp0 = b.hp;
    g.input.down = (k) => keys.includes(k);
    g.input.pressed = (k) => keys.includes(k);
    g.input.released = () => false;
    for (let i = 0; i < frames; i++) g.update(1/60);
    return { dmg: +(hp0 - b.hp).toFixed(0), b: [Math.round(b.x), Math.round(b.y)], p: [Math.round(p.x), Math.round(p.y)], gst: g.state, sst: s.state };
  };
  const exp = { shoot: drive(['shoot'], 240) };
  exp.down = drive(['shoot','down'], 240);
  exp.up = drive(['shoot','up'], 240);
  exp.right = drive(['shoot','right'], 180);
  exp.left = drive(['shoot','left'], 180);
  const p0 = [p.x, p.y];
  p.x = b.x - 150; p.y = b.y - 30; p.vx = 0; p.vy = 0;
  exp.teleportShoot = drive(['shoot'], 240);
  p.x = p0[0]; p.y = p0[1];
  const tileScan = [];
  for (let dy = -2; dy <= 3; dy++) { let row = '';
    for (let dx = -2; dx <= 2; dx++) { const v = s.level.tileAt(Math.floor(p.x/32)+dx, Math.floor(p.y/32)+dy); row += (v === undefined ? '?' : v); }
    tileScan.push(row);
  }
  return { phase: 'stall', exp, tileScan, shootCalls, stallAt, shootCallsB: shootCalls,  before, after: { hp: b.hp, phase: b.spellIdx },
    player: { x: +p.x.toFixed(1), y: +p.y.toFixed(1), face: p.facing, shootCd: +(p.shootCd||0).toFixed(3), fireLevel: p.fireLevel },
    boss: { x: Math.round(b.x), y: Math.round(b.y), w: b.w, h: b.h, hw: b.hw, hh: b.hh, state: b.state, spellLock: b.spellLock },
    frames,
    flags: { gst: g.state, dialogueActive: !!(g.dialogue && g.dialogue.active), paused: !!g.paused,
      sst: s.state, alive: !!p.alive, hearts: p.hearts, lives: p.lives, bossPending: !!s.bossPending,
      bossStarted: !!s.bossStarted, levelH: s.level.h, vy: +(p.vy||0).toFixed(1) },
    afterUpdate: (() => { const y0 = p.y; for (let i = 0; i < 30; i++) g.update(1/60); return { y0: +y0.toFixed(1), y1: +p.y.toFixed(1), gst: g.state, sst: s.state }; })()
  };
})()`);
console.log(JSON.stringify({ out, consoleErrors }));
ws.close(); proc.kill();
