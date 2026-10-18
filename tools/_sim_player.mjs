// 模拟玩家：用真实输入路径自动通关，输出流程/异常遥测。
//
//   node tools/_sim_player.mjs --diff N --char reimu --god 1 --maxSteps 80000
//   node tools/_sim_player.mjs --extra 1 --god 1
//   node tools/_sim_player.mjs --diff H --god 0            # 公平模式：测死亡/复活/GameOver
//
// 退出码 0，最后一行是 JSON 汇总，便于上游脚本解析。
//
// 进程卫生（v2）：
//   - 任何退出路径（成功/异常/超时/Ctrl-C）都会 taskkill /T 掉自己拉起的无头 Edge，
//     并删除临时 profile；--keep 1 可跳过清理便于调试。
//   - 启动前会读取上一次留下的实例登记表，把「父进程已死」的残留无头实例收掉，
//     避免端口被占导致后续跑挂死。
//   - 所有 CDP 调用带超时（--timeout，默认 60s），页面假死时不会无限等待。
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
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
const KEEP = argv.keep === '1';
const CDP_TIMEOUT = Number(argv.timeout || 60000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REGISTRY = join(tmpdir(), 'hks-sim-browsers.json');

/* ---------------- 进程卫生 ---------------- */

const registry = { list: [] };
function loadRegistry() {
  try {
    if (existsSync(REGISTRY)) {
      const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
      if (Array.isArray(j.list)) registry.list = j.list.filter((e) => e && e.at > Date.now() - 6 * 3600e3);
    }
  } catch { registry.list = []; }
}
function saveRegistry() {
  try { writeFileSync(REGISTRY, JSON.stringify(registry)); } catch {}
}
function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-pid, 'SIGKILL'); } catch { process.kill(pid, 'SIGKILL'); } }
  } catch {}
}
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
// 只对本脚本自己的调试端口发 Browser.close —— 不碰用户的正常浏览器
async function closeViaCdp(port, timeoutMs = 3000) {
  try {
    const ver = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    const j = await ver.json();
    if (!j.webSocketDebuggerUrl) return false;
    const ws = new WebSocket(j.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(rej, timeoutMs); });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(200);
    try { ws.close(); } catch {}
    return true;
  } catch { return false; }
}
async function reapStale() {
  if (!registry.list.length) return;
  const keep = [];
  for (const e of registry.list) {
    const ownerDead = !pidAlive(e.owner);
    const alive = pidAlive(e.pid);
    if (ownerDead && alive) {
      await closeViaCdp(e.port, 2000);
      killTree(e.pid);
      try { rmSync(e.profile, { recursive: true, force: true, maxRetries: 1 }); } catch {}
      process.stderr.write(`[sim] 收掉残留无头实例 pid=${e.pid} port=${e.port}\n`);
    } else if (alive) {
      keep.push(e);
    }
  }
  registry.list = keep;
  saveRegistry();
}

loadRegistry();
await reapStale();

/* ---------------- 启动 ---------------- */

const profile = mkdtempSync(join(tmpdir(), 'edge-sim-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
proc.on('error', () => {});

const entry = { pid: proc.pid, owner: process.pid, port: PORT, profile, at: Date.now() };
registry.list.push(entry);
saveRegistry();

let ws = null;
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws && ws.close(); } catch {}
  if (KEEP) return;
  killTree(proc.pid);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 2 }); } catch {}
  registry.list = registry.list.filter((e) => e !== entry);
  saveRegistry();
}
function fail(msg) {
  process.stderr.write(`[sim] FAILED: ${msg}
`);
  cleanup();
  process.exit(1);
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => { cleanup(); process.exit(130); });
}
process.on('unhandledRejection', (e) => {
  process.stderr.write(`[sim] FAILED: ${(e && e.message) || e}\n`);
  cleanup();
  process.exit(1);
});

/* ---------------- CDP ---------------- */

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error(`no target on port ${PORT}（端口被占用或浏览器未起）`);
}

let page;
try {
  page = await getTarget();
} catch (e) {
  // 端口可能被上次残留实例占着：收掉后重试一次
  await closeViaCdp(PORT, 2000);
  await sleep(600);
  if (!pidAlive(proc.pid)) {
    fail(`${e.message}；本次拉起的浏览器已退出（端口 ${PORT} 被残留实例占用？）`);
  }
  page = await getTarget();
}

ws = new WebSocket(page.webSocketDebuggerUrl);
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
  const timer = setTimeout(() => {
    pending.delete(mid);
    rej(new Error(`CDP timeout ${method} (${CDP_TIMEOUT}ms)`));
  }, CDP_TIMEOUT);
  pending.set(mid, {
    res: (v) => { clearTimeout(timer); res(v); },
    rej: (e) => { clearTimeout(timer); rej(e); },
  });
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
if (!booted) fail('game boot timeout');

// 清进度并设定开局
await evaluate('localStorage.removeItem("hks.progress.v1")');
await evaluate(`window.__game.unlockedExtra = true; window.__game.showTitle(); window.__game.difficulty='${DIFF}'; window.__game.char='${CHAR}'; window.__game.musicOn=false;`);

// 注入 bot
const installed = await evaluate(`import('/tools/sim_bot.js?t=${Date.now()}').then(m => !!m.install({ god: ${GOD}, maxRetries: 3 }))`);
if (!installed) fail('bot install failed');

// 开局：Extra 走 startExtra，主线走 startGame；--stage N 可直接从第 N 面（0-based）开始
const START_STAGE = argv.stage === undefined ? null : Number(argv.stage);
if (EXTRA) {
  await evaluate('window.__game.startExtra()');
} else if (START_STAGE !== null) {
  await evaluate(`window.__game.carryPower = ${argv.power || 128}; window.__game.levelIndex = ${START_STAGE}; window.__game.startStage(${START_STAGE})`);
} else {
  await evaluate('window.__game.startGame()');
}
// 可选：把玩家传送到指定 x（诊断用，skip 掉前面的跑图）
if (argv.startX) {
  await evaluate(`(() => { const p = window.__game.stage && window.__game.stage.player; if (p) { p.x = ${Number(argv.startX)}; p.y = 0; p.vy = 0; } })()`);
}

// 逐块推进
let snap = null;
let lastPrint = 0;
for (let step = 0; step < MAX_STEPS; step += CHUNK) {
  try {
    snap = await evaluate(`window.__game.input.__simBot.run(${CHUNK})`);
  } catch (e) {
    fail(`推进失败 ${e.message}`);
  }
  const wall = Date.now();
  if (!snap) fail('no snapshot');
  // 死亡复活用的是真实 setTimeout(900)：让出页面时间，等它真的触发
  if (snap.stage && snap.stage.state === 'dead') await sleep(950);
  if (snap.errors?.length) break;
  if (snap.state === 'menu' && snap.steps > 300) break;
  if (argv.verbose) {
    const s = snap.stage || {};
    process.stderr.write(`${snap.steps}\t${(+snap.simSec).toFixed(1)}s\t${snap.state}\tstage=${s.name || '-'}\tst=${s.state || '-'}\tx=${s.px ?? '-'}\ty=${s.py ?? '-'}\tlives=${s.lives ?? '-'}\tinv=${snap.invuln ?? '-'}\tbul=${s.bullets ?? '-'}\n`);
  } else if (wall - lastPrint > 5000) {
    lastPrint = wall;
    try {
      process.stderr.write(`  ... ${snap.steps} 步 / ${snap.simSec}s  state=${snap.state} stage=${snap.stage?.name || '-'} x=${snap.stage?.px ?? '-'} bossHp=${snap.stage?.boss?.hp ?? '-'}\n`);
    } catch {}
  }
}

const final = snap || await evaluate('window.__game.input.__simBot.snapshot()');
const wallMs = Date.now() - t0;
const result = {
  ok: !(final.errors?.length) && final.state !== 'menu',
  entered: final.state,
  reachedMenu: final.state === 'menu',
  simulatedSeconds: final.simSec,
  steps: final.steps,
  wallMs,
  god: GOD,
  diff: DIFF,
  char: CHAR,
  extra: EXTRA,
  deaths: final.deaths,
  gameovers: final.gameovers,
  retries: final.retries,
  casts: final.casts,
  maxBullets: final.maxBullets,
  stages: final.stages,
  events: final.events,
  errors: final.errors,
  consoleErrors: consoleErrors.slice(0, 10),
  lastStage: final.stage,
  snapshot: final,
};
const json = JSON.stringify(result, null, 2);
if (OUT) writeFileSync(OUT, json);
console.log(json);

cleanup();
process.exit(0);
