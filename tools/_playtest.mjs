// 自动玩家：真实驱动游戏主循环跑一遍，收集 JS 错误 / 卡死 / 逻辑耗时 / 状态流转
// 用法: node tools/_playtest.mjs [stageIndex] [seconds] [port]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGE = Number(process.argv[2] ?? 0);
const SECONDS = Number(process.argv[3] ?? 60);
const PORT = Number(process.argv[4] ?? 9455);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = `http://127.0.0.1:8141/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-play-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

const errors = [];
const warns = [];

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p(d); return; }
  if (d.method === 'Runtime.exceptionThrown') {
    const x = d.params.exceptionDetails;
    errors.push('EXCEPTION: ' + (x.exception?.description || x.text || '').split('\n')[0]);
  }
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) {
    const txt = (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    (d.params.type === 'error' ? errors : warns).push(d.params.type.toUpperCase() + ': ' + txt.slice(0, 200));
  }
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
    errors.push('LOG: ' + (d.params.entry.text || '').slice(0, 200));
  }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const rr = r.result;
  if (rr?.exceptionDetails) throw new Error('eval: ' + (rr.exceptionDetails.exception?.description || rr.exceptionDetails.text || ''));
  return rr?.result?.value;
};

// 注入自动驾驶：覆盖 input 的方法与 axisX getter
const AUTOPILOT = `
(() => {
  const g = window.__game;
  if (!g || !g.input) return 'NO_INPUT';
  const inp = g.input;
  const S = { want: {}, edge: {} };
  window.__ap = S;

  inp.down = function (a) { return !!S.want[a]; };
  inp.pressed = function (a) { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = function () { return false; };
  try {
    Object.defineProperty(inp, 'axisX', { get() { return S.ax || 0; }, configurable: true });
  } catch (e) { return 'AXIS_FAIL ' + e.message; }
  const oldEnd = inp.endFrame.bind(inp);
  inp.endFrame = function () { try { oldEnd(); } catch (e) {} };

  // ---- 自动驾驶决策：每逻辑帧调用一次 ----
  window.__aiTick = function () {
    const st = g.stage;
    S.want = {}; S.ax = 0;
    if (!st || g.state !== 'play') return;
    const p = st.player;
    if (!p) return;
    S.want.shoot = true;

    if (st.boss && !st.boss.dead) {
      // Boss 战：左右游走 + 射击 + 有能量就放符卡
      const t = performance.now() / 1000;
      S.ax = Math.sin(t * 1.7) > 0 ? 1 : -1;
      S.want.up = Math.cos(t * 1.3) > 0.3;
      S.want.down = Math.cos(t * 1.3) < -0.3;
      if (t - (S.lastCast || 0) > 6) { S.edge.cast = true; S.lastCast = t; }
      if (Math.sin(t * 0.7) > 0.95) S.edge.dash = true;
      return;
    }

    if (st.mode === 'stg') {
      // 飞行关：绕圈躲 + 射击
      const t = performance.now() / 1000;
      S.ax = Math.sin(t * 0.9);
      S.want.up = Math.cos(t * 1.1) > 0;
      S.want.down = Math.cos(t * 1.1) < -0.5;
      if (t - (S.lastCast || 0) > 8) { S.edge.cast = true; S.lastCast = t; }
      return;
    }

    // 平台关：向右跑，遇坑/墙跳，卡住就跳+冲刺
    const lv = st.level, T = 32;
    S.ax = 1; S.want.right = true;
    const footY = p.y + p.h;
    const fx = p.x + p.w + 8;
    let aheadSolid = false;
    for (let ox = 0; ox <= 48 && !aheadSolid; ox += 12) {
      for (let oy = 2; oy <= 80; oy += 14) {
        const cx = Math.floor((fx + ox) / T), cy = Math.floor((footY + oy) / T);
        if (lv.isSolidTile(cx, cy) || lv.isPlatformTile(cx, cy)) { aheadSolid = true; break; }
      }
    }
    let wall = false;
    for (let oy = -p.h + 6; oy < -6; oy += 12) {
      const cx = Math.floor((p.x + p.w + 6) / T), cy = Math.floor((p.y + p.h + oy) / T);
      if (lv.isSolidTile(cx, cy)) { wall = true; break; }
    }
    const now = performance.now();
    if (p.onGround && (!aheadSolid || wall)) { S.edge.jump = true; S.lastJump = now; }
    else if (!p.onGround && wall && (p.jumpsLeft || 0) > 0 && p.vy > -60) { S.edge.jump = true; }
    else if (!p.onGround && p.vy > 140 && !aheadSolid && (p.jumpsLeft || 0) > 0) { S.edge.jump = true; }
    // 卡住检测：200ms 内 x 没变化就跳 + 冲刺
    if (Math.abs(p.x - (S.lastX ?? -1)) < 1.5) {
      if (!S.stuckAt) S.stuckAt = now;
      if (now - S.stuckAt > 250) { S.edge.jump = true; S.edge.dash = true; }
      if (now - S.stuckAt > 1500) { S.want.left = true; S.ax = -1; }
      if (now - S.stuckAt > 2500) { S.ax = 1; S.want.right = true; S.stuckAt = now; }
    } else { S.stuckAt = 0; }
    S.lastX = p.x;
  };

  // hook 主循环的 update，每次逻辑步前跑 AI
  const loop = g.loop || (g._loop) || null;
  if (loop && loop.update) {
    const orig = loop.update;
    loop.update = function (dt) { try { window.__aiTick(); } catch (e) { (window.__aiErr = window.__aiErr || []).push(String(e).slice(0,120)); } return orig(dt); };
    return 'HOOK_LOOP';
  }
  // 兜底：没找到 loop 就用 rAF 轮询
  (function tick() { try { window.__aiTick(); } catch (e) {} requestAnimationFrame(tick); })();
  return 'HOOK_RAF';
})()`;

const SAMPLE = `
(() => {
  const g = window.__game;
  const st = g.stage;
  const p = st && st.player;
  const lv = st && st.level;
  return {
    t: Math.round(performance.now()),
    state: g.state,
    page: g._page || '',
    idx: st ? st.index : -1,
    mode: st ? st.mode : '',
    col: p && lv ? Math.round(p.x / 32) : -1,
    lvCols: lv ? lv.cols : -1,
    alive: p ? !!p.alive : null,
    lives: p ? p.lives : -1,
    hp: p ? p.hp : -1,
    power: p ? (p.power ?? -1) : -1,
    boss: st && st.boss ? { name: st.boss.def && st.boss.def.name, hp: Math.round(st.boss.hp), max: Math.round(st.boss.maxHp), spell: st.boss.spellIdx, total: st.boss.spellCount, dead: !!st.boss.dead } : null,
    bullets: (() => { try { const b = st && st.bullets; if (!b) return -1; if (Array.isArray(b)) return b.length; if (Array.isArray(b.list)) return b.list.length; if (Array.isArray(b.items)) return b.items.length; if (typeof b.count === 'number') return b.count; return -2; } catch (e) { return -3; } })(),
    fps: g.loop ? Math.round(g.loop.fps) : -1,
    steps: g.loop ? Math.round(g.loop.stepsPerSec) : -1,
    stepMs: g.loop ? +(g.loop.lastStepMs || 0).toFixed(2) : -1,
    aiErr: (window.__aiErr || []).slice(0, 3),
  };
})()`;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(1200);

  console.log('=== autopilot install ===', await ev(AUTOPILOT));

  await ev(`(() => { const g = window.__game; g.lives = 99; g.char = 'reimu'; g.startStage(${STAGE}); return g.state; })()`);
  await sleep(800);
  if (process.argv[5] === 'boss') {
    // 传送到 Boss 触发点
    console.log('teleport:', await ev(`(() => {
      const g = window.__game, st = g.stage, p = st.player, lv = st.level;
      const bossX = lv.w - 520;
      const tx = Math.max(200, Math.min((st.goalX || lv.w) - 120, bossX - 420));
      p.x = tx + 40; p.y = Math.min(p.y, 12 * 32); p.vx = 0; p.vy = 0;
      if (st.camera) st.camera.snapTo(p.x);
      return 'col=' + Math.round(p.x/32) + '/' + lv.cols;
    })()`));
    await sleep(600);
  }
  // 跳过开场对话
  for (let i = 0; i < 120; i++) {
    const active = await ev('!!(window.__game.dialogue && window.__game.dialogue.active)');
    if (!active) break;
    await ev('window.__game.dialogue.advance()');
    await sleep(80);
  }

  const samples = [];
  const t0 = Date.now();
  let lastCol = -1, stuckFrames = 0, maxStepMs = 0, stepMsOver8 = 0, totalSamples = 0;
  let deaths = 0, prevLives = 99;
  const stateChanges = [];
  let prevState = '';

  while (Date.now() - t0 < SECONDS * 1000) {
    const s = await ev(SAMPLE).catch((e) => ({ err: e.message }));
    if (s.err) { errors.push('SAMPLE: ' + s.err); break; }
    samples.push(s);
    totalSamples++;
    if (s.state !== prevState) { stateChanges.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${prevState || '-'} -> ${s.state}`); prevState = s.state; }
    if (s.stepMs > maxStepMs) maxStepMs = s.stepMs;
    if (s.stepMs > 8) stepMsOver8++;
    if (s.lives >= 0 && s.lives < prevLives) { deaths++; }
    prevLives = s.lives;
    if (s.col === lastCol && s.state === 'play') stuckFrames++; else stuckFrames = 0;
    lastCol = s.col;
    if (s.state === 'clear' || s.state === 'gameover' || s.state === 'ending') break;
    await sleep(400);
  }

  const last = samples[samples.length - 1] || {};
  console.log('\\n===== PLAYTEST stage', STAGE, '=====');
  console.log('samples:', totalSamples, ' duration:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('final state:', last.state, ' page:', last.page);
  console.log('progress: col', last.col, '/', last.lvCols, ` (${((last.col / Math.max(1, last.lvCols)) * 100).toFixed(1)}%)`);
  console.log('lives:', last.lives, ' deaths:', deaths, ' power:', last.power);
  console.log('boss:', JSON.stringify(last.boss));
  console.log('bullets:', last.bullets);
  console.log('fps:', last.fps, ' steps/s:', last.steps, ' stepMs last:', last.stepMs, ' max:', maxStepMs.toFixed(2), ' >8ms:', stepMsOver8 + '/' + totalSamples);
  console.log('stateChanges:', stateChanges.join(' | '));
  console.log('stuck(sample-level):', stuckFrames);
  if (last.aiErr && last.aiErr.length) console.log('AI ERR:', last.aiErr);
  console.log('\\n--- errors (' + errors.length + ') ---');
  for (const e of [...new Set(errors)].slice(0, 20)) console.log(' !', e);
  if (warns.length) { console.log('--- warnings (' + warns.length + ') ---'); for (const w of [...new Set(warns)].slice(0, 8)) console.log(' ~', w); }
  console.log('\\n--- timeline (每 6 个采样一行) ---');
  for (let i = 0; i < samples.length; i += 6) {
    const s = samples[i];
    console.log(`  t+${((s.t - samples[0].t) / 1000).toFixed(1)}s st=${s.state} col=${s.col}/${s.lvCols} boss=${s.boss ? s.boss.spell + '/' + s.boss.total + ' hp' + s.boss.hp : '-'} bul=${s.bullets} fps=${s.fps} ms=${s.stepMs}`);
  }
} catch (e) {
  console.error('FATAL', e.message);
} finally {
  try { ws.close(); } catch {}
  proc.kill();
}
