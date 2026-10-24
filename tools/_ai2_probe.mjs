// AI 第二轮补测探针：结局 / EXTRA / 续命链，真实按键 + 截图。
// 基于 tools/_sim_player.mjs，追加：
//   - --tag          输出与截图命名前缀
//   - --shotDir      截图目录（默认 _pt/ai2/shots）
//   - --menuExtra 1  用真实按键从标题菜单进 EXTRA（KeyE → Digit1）
//   - --seedProgress 1  先写 hks.progress.v1 再 reload，验证进度加载/标题解锁
//   - --clearProgress 0  不清空进度
//   - 结局/回标题/再开一局 的状态采样与按键链路
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
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
const PORT = Number(argv.port || 9520);
const W = 1280, H = 720;
const DIFF = String(argv.diff || 'N').toUpperCase();
const CHAR = String(argv.char || 'reimu');
const GOD = argv.god !== '0';
const EXTRA = argv.extra === '1';
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const MAX_STEPS = Number(argv.maxSteps || 120000);
const CHUNK = Number(argv.chunk || 120);
const OUT = argv.out || '';
const KEEP = argv.keep === '1';
const CDP_TIMEOUT = Number(argv.timeout || 60000);
const TAG = String(argv.tag || `${EXTRA ? 'EX' : DIFF}_${CHAR}_${GOD ? 'god' : 'fair'}_${Date.now() % 100000}`);
const SHOTDIR = argv.shotDir || '_pt/ai2/shots';
const START_STAGE = argv.stage === undefined ? null : Number(argv.stage);
const START_X = argv.startX === undefined ? null : Number(argv.startX);
const MENU_EXTRA = argv.menuExtra === '1';
const SEED_PROGRESS = argv.seedProgress === '1';
const CLEAR_PROGRESS = argv.clearProgress !== '0';
const DO_KEYS = argv.keys !== '0';
const MAX_RETRIES = Number(argv.maxRetries || 3);
mkdirSync(SHOTDIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REGISTRY = join(tmpdir(), 'hks-sim-browsers.json');

/* ---------------- 进程卫生（与 _sim_player.mjs 一致） ---------------- */
const registry = { list: [] };
function loadRegistry() {
  try {
    if (existsSync(REGISTRY)) {
      const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
      if (Array.isArray(j.list)) registry.list = j.list.filter((e) => e && e.at > Date.now() - 6 * 3600e3);
    }
  } catch { registry.list = []; }
}
function saveRegistry() { try { writeFileSync(REGISTRY, JSON.stringify(registry)); } catch {} }
function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-pid, 'SIGKILL'); } catch { process.kill(pid, 'SIGKILL'); } }
  } catch {}
}
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
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
      process.stderr.write(`[ai2] 收掉残留无头实例 pid=${e.pid} port=${e.port}\n`);
    } else if (alive) keep.push(e);
  }
  registry.list = keep;
  saveRegistry();
}

loadRegistry();
await reapStale();

/* ---------------- 启动 ---------------- */
const profile = mkdtempSync(join(tmpdir(), 'edge-ai2-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
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
  process.stderr.write(`[ai2] FAILED: ${msg}\n`);
  const r = { ok: false, failed: msg, tag: TAG };
  if (OUT) writeFileSync(OUT, JSON.stringify(r, null, 2));
  cleanup();
  process.exit(1);
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { cleanup(); process.exit(130); });
process.on('unhandledRejection', (e) => fail(`unhandled: ${(e && e.message) || e}`));

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
  throw new Error(`no target on port ${PORT}`);
}
let page;
try { page = await getTarget(); } catch (e) {
  await closeViaCdp(PORT, 2000);
  await sleep(600);
  if (!pidAlive(proc.pid)) fail(`${e.message}；本次拉起的浏览器已退出`);
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
  const timer = setTimeout(() => { pending.delete(mid); rej(new Error(`CDP timeout ${method} (${CDP_TIMEOUT}ms)`)); }, CDP_TIMEOUT);
  pending.set(mid, {
    res: (v) => { clearTimeout(timer); res(v); },
    rej: (e) => { clearTimeout(timer); rej(e); },
  });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ---------------- 截图 / 按键 ---------------- */
const shots = [];
async function shot(name) {
  try {
    const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const p = join(SHOTDIR, `${TAG}_${name}.png`);
    writeFileSync(p, Buffer.from(r.data, 'base64'));
    shots.push({ name, path: p });
    return p;
  } catch (e) { process.stderr.write(`[ai2] screenshot ${name} failed: ${e.message}\n`); return null; }
}
const VK = { Enter: 13, Escape: 27, KeyE: 69, KeyN: 78, KeyH: 72, KeyL: 76, Digit1: 49, Digit2: 50 };
async function press(desc) {
  const m = /^(Enter|Escape|Key[A-Z]|Digit\d)$/.exec(desc);
  if (!m) throw new Error('bad key ' + desc);
  const code = desc;
  const name = desc.startsWith('Key') ? desc.slice(3).toLowerCase() : desc.startsWith('Digit') ? desc.slice(5) : desc;
  const base = { code, key: name, windowsVirtualKeyCode: VK[desc], nativeVirtualKeyCode: VK[desc] };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(120);
}

/* ---------------- 导航与启动 ---------------- */
const t0 = Date.now();
await send('Page.navigate', { url: `${URL_BASE}?ai2=${Date.now()}` });
async function waitBoot(tag = 'boot') {
  for (let i = 0; i < 400; i++) {
    try {
      const ok = await evaluate('!!(window.__game && window.__game.input && window.__game.showTitle)');
      if (ok) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}
if (!(await waitBoot())) fail('game boot timeout');

const progressKey = 'hks.progress.v1';
if (SEED_PROGRESS) {
  await evaluate(`localStorage.setItem(${JSON.stringify(progressKey)}, ${JSON.stringify(JSON.stringify({
    extraUnlocked: true, extraChar: 'reimu', extraChars: ['reimu'],
  }))})`);
  await send('Page.reload');
  if (!(await waitBoot('reload'))) fail('game boot timeout after reload');
} else if (CLEAR_PROGRESS) {
  await evaluate(`localStorage.removeItem(${JSON.stringify(progressKey)})`);
}

const seeded = await evaluate('({unlockedExtra: !!window.__game.unlockedExtra, extraChars: window.__game.extraChars, extraChar: window.__game.extraChar, progress: JSON.parse(localStorage.getItem("hks.progress.v1")||"null")})');

await evaluate(`window.__game.difficulty='${DIFF}'; window.__game.char='${CHAR}'; window.__game.musicOn=false;`);
const installed = await evaluate(`import('/tools/sim_bot.js?t=${Date.now()}').then(m => !!m.install({ god: ${GOD}, maxRetries: ${MAX_RETRIES} }))`);
if (!installed) fail('bot install failed');

/* ---------------- 开局 ---------------- */
const G = 'window.__game';
const menuExtraTrace = [];
if (MENU_EXTRA) {
  await evaluate(`${G}.showTitle()`);
  await sleep(350);
  menuExtraTrace.push({ step: 'title', ...(await evaluate(`({state:${G}.state, page:${G}._page||null, unlocked:!!${G}.unlockedExtra})`)) });
  await shot('menu_before_extra');
  await press('KeyE');
  await sleep(500);
  menuExtraTrace.push({ step: 'after_E', ...(await evaluate(`({state:${G}.state, page:${G}._page||null, extraChars:${G}.extraChars, buttons:[...document.querySelectorAll("button")].filter(b=>b.offsetParent).map(b=>b.innerText.trim().replace(/\\s+/g," ")).slice(0,8)})`)) });
  await shot('extra_select');
  await press('Digit1');
  await sleep(900);
  menuExtraTrace.push({ step: 'after_1', ...(await evaluate(`({state:${G}.state, inExtra:!!${G}.inExtra, levelIndex:${G}.levelIndex, stage:!!${G}.stage, lives:${G}.lives})`)) });
} else if (EXTRA) {
  await evaluate(`${G}.startExtra()`);
} else if (START_STAGE !== null) {
  await evaluate(`${G}.carryPower=${Number(argv.power || 128)}; ${G}.levelIndex=${START_STAGE}; ${G}.startStage(${START_STAGE})`);
} else {
  await evaluate(`${G}.startGame()`);
}
if (START_X !== null && Number.isFinite(START_X)) {
  await evaluate(`(() => { const p = window.__game.stage && window.__game.stage.player; if (p) { p.x = ${START_X}; p.y = 0; p.vy = 0; } })()`);
}

/* ---------------- 推进循环 ---------------- */
let snap = null;
let prevState = '';
let endingSeen = false;
let endingMode = null;
let endingStart = 0;
let endingShot2 = false;
let menuShot = false;
let menuAt = 0;
let stopReason = 'maxSteps';
const timeline = [];
const gameoverLog = [];
const stateNow = () => evaluate(`(() => { const g=${G}; return {state:g.state, page:g._page||null, inExtra:!!g.inExtra, levelIndex:g.levelIndex, char:g.char, difficulty:g.difficulty, lives:g.lives, continues:g.continues, retries:g.input.__simBot && g.input.__simBot.retries, unlockedExtra:!!g.unlockedExtra, extraChars:g.extraChars, extraChar:g.extraChar, stage:!!g.stage, hudHidden: !!(g.hudEl && g.hudEl.classList.contains('hidden')), buttons:[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.innerText.trim().replace(/\\s+/g,' ')).slice(0,10)}; })()`);

for (let step = 0; step < MAX_STEPS; step += CHUNK) {
  try { snap = await evaluate(`${G}.input.__simBot.run(${CHUNK})`); }
  catch (e) { stopReason = `eval-error:${e.message}`; break; }
  if (!snap) { stopReason = 'no-snapshot'; break; }
  const st = snap.stage || {};
  const t = Number(snap.simSec) || 0;
  if (snap.state !== prevState) {
    const ev = { t: +t.toFixed(2), steps: snap.steps, from: prevState || null, to: snap.state, name: st.name || null, x: st.px, y: st.py, lives: st.lives, continues: snap.continues, retries: snap.retries, boss: st.boss ? { hp: st.boss.hp, maxHp: st.boss.maxHp, phase: st.boss.phase, spell: st.boss.spell } : null };
    timeline.push(ev);
    if (snap.state === 'gameover') {
      gameoverLog.push({ phase: 'gameover', t: ev.t, bossHp: st.boss?.hp ?? null, bossPhase: st.boss?.phase ?? null, lives: st.lives, continues: snap.continues, retries: snap.retries });
      if (!globalThis.__gameoverShot) { globalThis.__gameoverShot = true; await shot('gameover_panel'); }
    }
    if (prevState === 'gameover' && snap.state === 'play') gameoverLog.push({ phase: 'resume', t: ev.t, bossHp: st.boss?.hp ?? null, bossPhase: st.boss?.phase ?? null, st: st.state, lives: st.lives, continues: snap.continues, retries: snap.retries });
    if (snap.state === 'ending' && !endingSeen) {
      endingSeen = true; endingStart = t;
      endingMode = await evaluate(`${G}.ending ? (${G}.ending.mode || ${G}.ending.kind || null) : null`);
      await shot('ending_01');
    }
    if (snap.state === 'menu' && endingSeen && !menuShot) {
      menuShot = true; menuAt = t;
      await shot('menu_after_ending');
    }
    prevState = snap.state;
  }
  if (snap.state === 'ending' && endingSeen && !endingShot2 && t > endingStart + 1.2) {
    endingShot2 = true; await shot('ending_02');
  }
  if (snap.stage && snap.stage.state === 'dead') await sleep(950);
  if (snap.errors?.length) { stopReason = 'errors'; break; }
  if (snap.state === 'menu' && (endingSeen || snap.steps > 300)) { stopReason = 'menu'; break; }
  if (snap.stop && snap.stop !== '') { stopReason = 'bot-stop'; break; }
  if (argv.verbose && snap.state !== 'gameover') {
    process.stderr.write(`${snap.steps}\t${t.toFixed(1)}s\t${snap.state}\tstage=${st.name || '-'}\tst=${st.state || '-'}\tx=${st.px ?? '-'}\tlives=${st.lives ?? '-'}\tboss=${st.boss?.hp ?? '-'}\tcont=${snap.continues ?? '-'}\n`);
  }
}

const finalSnap = snap || await evaluate(`${G}.input.__simBot.snapshot()`);
const post = await stateNow();
if (post.state === 'menu') await shot('menu_current');

/* ---------------- 结局后：进度 / HUD / 真实按键再开一局 ---------------- */
const postEnding = { reachedMenu: post.state === 'menu', endingSeen, endingMode, progress: null, afterMenuEnter: null, afterDifficulty: null, afterCharPick: null, newRun: null };
if (post.state === 'menu') {
  postEnding.progress = await evaluate(`JSON.parse(localStorage.getItem("hks.progress.v1")||"null")`);
  if (DO_KEYS && (endingSeen || MENU_EXTRA)) {
    await press('Enter');
    await sleep(500);
    postEnding.afterMenuEnter = await stateNow();
    await press(`Key${['E', 'N', 'H', 'L'].includes(DIFF) ? DIFF : 'N'}`);
    await sleep(450);
    postEnding.afterDifficulty = await stateNow();
    await press('Digit1');
    await sleep(1400);
    postEnding.afterCharPick = await stateNow();
    try {
      postEnding.newRun = await evaluate(`${G}.input.__simBot.snapshot()`);
      postEnding.newRun = { state: postEnding.newRun.state, stage: postEnding.newRun.stage ? { name: postEnding.newRun.stage.name, state: postEnding.newRun.stage.state, lives: postEnding.newRun.stage.lives, x: postEnding.newRun.stage.px } : null, steps: postEnding.newRun.steps };
      await shot('new_run_after_menu');
    } catch (e) { postEnding.newRun = { error: e.message }; }
  }
}

/* ---------------- 真实 Enter 续命（GameOver 面板） ---------------- */
let realRetry = null;
if (argv.realRetry === '1' && post.state === 'gameover') {
  const before = await evaluate(`(() => { const g=${G}; const s=g.stage||{}; return {level:g.levelIndex, continues:g.continues, lives:s.lives, st:s.state, boss: s.boss ? {hp:s.boss.hp,maxHp:s.boss.maxHp,phase:s.boss.phase,spell:s.boss.spell} : null, checkpoint:s.checkpoint, checkpointX:s.checkpointX }; })()`);
  realRetry = { before };
  await shot('gameover_before_enter');
  await press('Enter');
  await sleep(1800);
  const after = await evaluate(`(() => { const g=${G}; const s=g.stage||{}; return {state:g.state, level:g.levelIndex, continues:g.continues, lives:s.lives, st:s.state, boss: s.boss ? {hp:s.boss.hp,maxHp:s.boss.maxHp,phase:s.boss.phase,spell:s.boss.spell} : null, checkpoint:s.checkpoint, checkpointX:s.checkpointX, hudHidden: !!(g.hudEl&&g.hudEl.classList.contains('hidden')) }; })()`);
  realRetry.after = after;
  realRetry.bossHpPreserved = !!(before.boss && after.boss && before.boss.hp === after.boss.hp);
  realRetry.spellPreserved = !!(before.boss && after.boss && before.boss.spell === after.boss.spell && before.boss.phase === after.boss.phase);
  await shot('after_real_retry');
}

const wallMs = Date.now() - t0;
const result = {
  ok: !(finalSnap.errors?.length) && stopReason !== 'eval-error:no-snapshot',
  tag: TAG,
  mode: MENU_EXTRA ? 'menu-extra' : EXTRA ? 'extra' : START_STAGE !== null ? `stage${START_STAGE}` : 'main',
  entered: finalSnap.state,
  stopReason,
  simulatedSeconds: finalSnap.simSec,
  steps: finalSnap.steps,
  wallMs,
  god: GOD,
  diff: DIFF,
  char: CHAR,
  extra: EXTRA,
  deaths: finalSnap.deaths,
  gameovers: finalSnap.gameovers,
  retries: finalSnap.retries,
  continues: post.continues,
  maxBullets: finalSnap.maxBullets,
  stages: finalSnap.stages,
  events: finalSnap.events,
  errors: finalSnap.errors,
  consoleErrors: consoleErrors.slice(0, 10),
  endingSeen,
  endingMode,
  seeded,
  menuExtraTrace,
  post,
  postEnding,
  gameoverLog,
  realRetry,
  timeline: timeline.slice(-120),
  shots,
  lastStage: finalSnap.stage,
  snapshot: finalSnap,
};
const json = JSON.stringify(result, null, 2);
if (OUT) writeFileSync(OUT, json);
console.log(JSON.stringify({ tag: TAG, ok: result.ok, entered: result.entered, stopReason, sim: result.simulatedSeconds, deaths: result.deaths, gameovers: result.gameovers, retries: result.retries, endingSeen, endingMode, continues: result.continues, progress: postEnding.progress, newRun: !!postEnding.newRun, shots: shots.map((s) => s.path), errors: result.errors?.length, consoleErrors: consoleErrors.slice(0, 3) }, null, 2));

cleanup();
process.exit(0);
