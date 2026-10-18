// Boss 战渲染分项耗时（软件光栅，最坏情况）：
// 包装 stage 内部各绘制子系统，统计每次 render 的 ms 占比。
//   node tools/_prof_render.mjs --stage 0 --boss 1 --steps 900 --frames 60 [--diff L]
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
const PORT = Number(argv.port || 9392);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const BOSS = argv.boss !== '0';
const DIFF = argv.diff || 'N';
const STEPS = Number(argv.steps || 900);
const FRAMES = Number(argv.frames || 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-prof-'));
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
await send('Page.navigate', { url: `${URL_BASE}?prof=${Date.now()}` });
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
  const step = (n = 1) => { for (let i = 0; i < n; i++) { bot.decide(); g.update(1/60); bot.after(); } };

  g.difficulty = ${JSON.stringify(DIFF)}; g.char = 'reimu'; g.musicOn = false; g.showTitle();
  g.startGame();
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  if (${STAGE} > 0) g.startStage(${STAGE});
  for (let i = 0; i < 400 && g.state === 'dialogue'; i++) step(1);
  const s = g.stage;
  if (${BOSS ? 'true' : 'false'} && !s.bossStarted) s.beginBoss();
  if (${argv.nopost ? 'true' : 'false'}) g.renderer.postEnabled = false;
  step(${STEPS});
  // 压力测试：铺满屏幕的静止弹幕，量化弹幕层开销
  const STRESS = ${Number(argv.stress || 0)};
  if (STRESS > 0) {
    const cols = Math.ceil(Math.sqrt(STRESS * 1.6));
    const rows = Math.ceil(STRESS / cols);
    const types = [0, 1, 2, 3, 4];
    const colors = ['#ff5ea8', '#7fd4ff', '#ffd76a', '#c884ff', '#8cf7a0'];
    for (let i = 0; i < STRESS; i++) {
      const cx = i % cols, cy = Math.floor(i / cols);
      s.bullets.spawn({
        x: -100 + (1260 / cols) * (cx + 0.5), y: -80 + (760 / rows) * (cy + 0.5),
        vx: 0, vy: 0, r: 6 + (i % 3), type: types[i % 5], color: colors[i % 5], life: 999,
      });
    }
    step(6);
  }

  // 2 帧预热（贴图/粒子缓存）
  g.render(0.5); g.render(0.5);

  const T = {};
  const add = (k, ms) => { T[k] = (T[k] || 0) + ms; };
  const wrap = (obj, name, key) => {
    if (!obj || typeof obj[name] !== 'function') return;
    const o = obj[name].bind(obj);
    obj[name] = (...a) => { const t0 = performance.now(); const r = o(...a); add(key, performance.now() - t0); return r; };
  };
  wrap(s.bullets, 'draw', 'bullets');
  wrap(s.shots, 'draw', 'shots');
  wrap(s.fx, 'draw', 'fx');
  wrap(s.boss, 'draw', 'boss');
  wrap(s.enemies, 'draw', 'enemies');
  wrap(s.player, 'draw', 'player');
  wrap(s, '_drawPickups', 'pickups');
  wrap(s, '_drawCheckpoints', 'checkpoints');
  wrap(s, '_drawGoal', 'goal');
  wrap(s, '_drawWeather', 'weather');
  wrap(s, '_drawPaintedBg', 'bg');
  wrap(s, '_overlayGrads', 'grads');
  wrap(s, 'draw', 'stageTotal');

  const t0 = performance.now();
  let tUpd = 0, tRen = 0;
  let tBegin = 0, tStage = 0, tPresent = 0;
  for (let i = 0; i < ${FRAMES}; i++) {
    const a = performance.now();
    step(1);
    const b = performance.now();
    // 手动拆开 Game.render 的三段，定位耗时
    const p0 = performance.now();
    const ctx = g.renderer.begin('#05030a');
    const p1 = performance.now();
    g.stage.draw(ctx, 0.5);
    const p2 = performance.now();
    g.renderer.present(g.t);
    const p3 = performance.now();
    tBegin += p1 - p0; tStage += p2 - p1; tPresent += p3 - p2;
    g.render(0.5);
    const c = performance.now();
    tUpd += b - a; tRen += c - b;
  }
  const totalMs = (performance.now() - t0) / ${FRAMES};
  const drawMs = tRen / ${FRAMES};
  const per = {};
  for (const k of Object.keys(T)) per[k] = +(T[k] / ${FRAMES}).toFixed(2);
  const sum = Object.entries(per).filter(([k]) => k !== 'stageTotal' && k !== 'bg' && k !== 'grads')
    .reduce((a, [, v]) => a + v, 0);
  const bullets = s.bullets.pool.filter((b) => b.active).length;
  const fxCount = s.fx ? Object.values(s.fx).filter((v) => Array.isArray(v)).reduce((a, v) => a + v.filter((p) => p && p.life > 0).length, 0) : null;
  return {
    diff: s.difficulty, stage: s.level.name, boss: s.boss && { name: s.boss.def.name, phase: s.boss.phaseIndex, hp: Math.round(s.boss.hp) },
    bullets, fx: fxCount,
    frameMs: +totalMs.toFixed(2), drawMs: +drawMs.toFixed(2),
    updateMs: +(tUpd / ${FRAMES}).toFixed(2),
    beginMs: +(tBegin / ${FRAMES}).toFixed(2),
    stageMs: +(tStage / ${FRAMES}).toFixed(2),
    presentMs: +(tPresent / ${FRAMES}).toFixed(2),
    post: { level: g.renderer.postLevel, interval: g.renderer.bloomInterval, ema: +g.renderer.bloomEmaMs.toFixed(2) },
    perDrawMs: per, unaccountedMs: +(drawMs - sum).toFixed(2),
  };
})()`);
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
