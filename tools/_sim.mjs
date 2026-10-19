// 快速逻辑模拟：手动步进驱动 Game.update，绕过渲染限速
// 用法: node tools/_sim.mjs <stageIndex> <steps> [mode]  mode: run|boss|stg
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGE = Number(process.argv[2] ?? 0);
const STEPS = Number(process.argv[3] ?? 6000);
const MODE = process.argv[4] ?? 'run';
const PORT = Number(process.argv[5] ?? 9460);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = `http://127.0.0.1:8141/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-sim-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

const errors = [];

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
    errors.push('EXC: ' + (x.exception?.description || x.text || '').split('\n').slice(0, 2).join(' | '));
  }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
    errors.push('ERR: ' + (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  }
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
    errors.push('LOG: ' + (d.params.entry.text || '').slice(0, 160));
  }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const rr = r.result;
  if (rr?.exceptionDetails) throw new Error('eval: ' + (rr.exceptionDetails.exception?.description || rr.exceptionDetails.text || ''));
  return rr?.result?.value;
};

const SETUP = `
(() => {
  const g = window.__game;
  if (!g || !g.input) return 'NO_GAME';
  const inp = g.input;
  const S = { want: {}, edge: {}, ax: 0 };
  window.__S = S;
  inp.down = (a) => !!S.want[a];
  inp.pressed = (a) => { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = () => false;
  try { Object.defineProperty(inp, 'axisX', { get: () => S.ax, configurable: true }); } catch (e) { return 'AXIS_FAIL'; }
  window.__set = (o) => { S.want = Object.assign({}, o.want || {}); S.edge = Object.assign({}, o.edge || {}); S.ax = o.ax || 0; };
  return 'OK';
})()`;

// 主模拟：手动步进
const SIM = `
(async () => {
  const g = window.__game;
  const S = window.__S;
  const MODE = '${MODE}';
  const STEPS = ${STEPS};
  const dt = 1 / 60;
  const yieldReal = () => new Promise((r) => setTimeout(r, 8));
  const snaps = [];
  const events = [];
  let deaths = 0, prevLives = null, respawnCols = [];
  let stuck = 0, lastCol = -1, maxStuck = 0;
  let prevState = g.state, prevSpell = -1;
  const t0 = performance.now();

  const origOnEvent = g.onEvent ? g.onEvent.bind(g) : null;

  for (let i = 0; i < STEPS; i++) {
    // 对话自动推进
    if (g.state === 'dialogue' && g.dialogue && g.dialogue.active) { g.dialogue.advance(); }
    const st = g.stage;
    if (!st) break;
    const p = st.player;
    const lv = st.level;

    // ---- AI 决策 ----
    S.want = { shoot: true }; S.ax = 0;
    if (g.state === 'play' || g.state === 'boss') {
      if (st.boss && !st.boss.dead && st.bossStarted) {
        const t = i / 60;
        S.ax = Math.sin(t * 1.6) > 0 ? 1 : -1;
        if (Math.sin(t * 2.3) > 0.6) S.edge.jump = true;
        if (i % 420 === 0) S.edge.cast = true;
      } else if (st.mode === 'stg') {
        const t = i / 60;
        S.ax = Math.sin(t * 0.8) > 0 ? 1 : -1;
        S.want.up = Math.cos(t * 1.1) > 0.2;
        S.want.down = Math.cos(t * 1.1) < -0.4;
        if (i % 480 === 0) S.edge.cast = true;
      } else {
        // 平台关：向右 + 遇坑墙跳
        S.ax = 1; S.want.right = true;
        const T = 32, footY = p.y + p.h, fx = p.x + p.w + 8;
        let aheadSolid = false;
        for (let ox = 0; ox <= 48 && !aheadSolid; ox += 12)
          for (let oy = 2; oy <= 90; oy += 14) {
            const cx = Math.floor((fx + ox) / T), cy = Math.floor((footY + oy) / T);
            if (lv.isSolidTile(cx, cy) || lv.isPlatformTile(cx, cy)) { aheadSolid = true; break; }
          }
        let wall = false;
        for (let oy = -p.h + 6; oy < -6; oy += 12) {
          const cx = Math.floor((p.x + p.w + 6) / T), cy = Math.floor((p.y + p.h + oy) / T);
          if (lv.isSolidTile(cx, cy)) { wall = true; break; }
        }
        if (p.onGround && (!aheadSolid || wall)) S.edge.jump = true;
        else if (!p.onGround && wall && (p.jumpsLeft || 0) > 0 && p.vy > -60) S.edge.jump = true;
        else if (!p.onGround && p.vy > 150 && !aheadSolid && (p.jumpsLeft || 0) > 0) S.edge.jump = true;
        // 卡住脱困
        if (Math.abs(p.x - (S.lastX ?? -1)) < 1.2) { S.stuckN = (S.stuckN || 0) + 1; } else S.stuckN = 0;
        S.lastX = p.x;
        if (S.stuckN > 40) { S.edge.jump = true; S.edge.dash = true; }
        if (S.stuckN > 120) { S.ax = -1; S.want.left = true; delete S.want.right; }
        if (S.stuckN > 200) { S.ax = 1; S.want.right = true; delete S.want.left; S.stuckN = 0; }
      }
    }

    const _t = performance.now();
    try { g.loop.update(dt); } catch (e) { events.push('UPDATE_ERR@' + i + ': ' + String(e).slice(0, 120)); break; }
    const _ms = performance.now() - _t;
    if (_ms > S.maxMs) S.maxMs = _ms;
    if (_ms > 5) S.slowFrames = (S.slowFrames || 0) + 1;
    S.msSum = (S.msSum || 0) + _ms;

    // ---- 采样 ----
    const col = Math.round(p.x / 32);
    if (p.lives !== undefined && prevLives !== null && p.lives < prevLives) {
      deaths++;
      S.pendRespawn = 90;   // 死亡后 90 帧记录重生落点
      S.deathCol = col;
    }
    if (S.pendRespawn > 0) {
      S.pendRespawn--;
      if (S.pendRespawn === 0) respawnCols.push({ die: S.deathCol, at: col, back: S.deathCol - col });
    }
    if (p.lives !== undefined) prevLives = p.lives;
    if (g.state !== prevState) {
      events.push(Math.round(i / 60) + 's ' + prevState + '->' + g.state + ' col=' + col);
      if (g.state === 'play' && prevState === 'dead') respawnCols.push(col);
      prevState = g.state;
    }
    if (st.boss && st.boss.spellIdx !== prevSpell) {
      events.push(Math.round(i / 60) + 's spell ' + prevSpell + '->' + st.boss.spellIdx);
      prevSpell = st.boss.spellIdx;
    }
    if (Math.abs(col - lastCol) < 1 && g.state === 'play') { stuck++; if (stuck > maxStuck) maxStuck = stuck; } else stuck = 0;
    lastCol = col;

    if (i % 60 === 0) {
      let nb = -1;
      try { const bp = st.bullets; if (bp && Array.isArray(bp.pool)) { let c = 0; for (const b of bp.pool) if (b.active) c++; nb = c; if (c > (S.maxB || 0)) S.maxB = c; } } catch (e) {}
      if (i % 600 === 0) snaps.push({
        s: +(i / 60).toFixed(1), state: g.state, col,
        lives: p.lives, bul: nb,
        boss: st.boss ? Math.round(st.boss.hp) + '/' + Math.round(st.boss.maxHp) + ' sp' + st.boss.spellIdx : null,
        dead: !!st.boss?.dead,
      });
    }
    if (g.state === 'clear' || g.state === 'gameover' || g.state === 'ending') { events.push('END@' + Math.round(i / 60) + 's ' + g.state); break; }
    // 每 30 逻辑步让出线程，让 Promise/setTimeout 宏任务能跑（对话等立绘要靠它）
    if (i % 30 === 29) await yieldReal();
  }

  const st = g.stage;
  const p = st && st.player;
  return JSON.stringify({
    wallMs: Math.round(performance.now() - t0),
    finalState: g.state,
    col: p ? Math.round(p.x / 32) : -1,
    lvCols: st ? st.level.cols : -1,
    lives: p ? p.lives : -1,
    deaths, respawnCols,
    maxStuckFrames: maxStuck,
    boss: st && st.boss ? { hp: Math.round(st.boss.hp), max: Math.round(st.boss.maxHp), spell: st.boss.spellIdx, total: st.boss.spellCount, dead: !!st.boss.dead } : null,
    snaps, events: events.slice(-40),
  });
})()`;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(1000);
  console.log('setup:', await ev(SETUP));

  await ev(`(() => { const g = window.__game; g.lives = 50; g.char = 'reimu'; g.startStage(${STAGE}); return g.state; })()`);
  await sleep(500);
  // 跳过开场对话
  await ev(`(() => { const g = window.__game; let n = 0; while (g.state === 'dialogue' && n++ < 100) g.dialogue.advance(); return n; })()`);
  await sleep(300);

  if (MODE === 'boss') {
    console.log('teleport:', await ev(`(() => {
      const g = window.__game, st = g.stage, p = st.player, lv = st.level;
      const tx = Math.max(200, Math.min((st.goalX || lv.w) - 120, (lv.w - 520) - 420));
      const col = Math.floor((tx - 200) / 32);
      // 从上往下找第一个实心块，站到它上面
      let cy = 0;
      for (; cy < lv.rows; cy++) if (lv.isSolidTile(col, cy) || lv.isPlatformTile(col, cy)) break;
      p.x = col * 32; p.y = Math.max(0, (cy - 2) * 32); p.vx = 0; p.vy = 0; p.onGround = true;
      if (st.camera) st.camera.snapTo(p.x);
      return 'col=' + col + ' groundRow=' + cy;
    })()`));
    await sleep(300);
  }

  const raw = await ev(SIM);
  const d = JSON.parse(raw);
  console.log('\n===== SIM stage', STAGE, 'mode', MODE, '=====');
  console.log('逻辑时长:', (STEPS / 60).toFixed(1) + 's   实际耗时:', d.wallMs + 'ms');
  console.log('最终状态:', d.finalState, ' 进度: col', d.col, '/', d.lvCols, `(${((d.col / Math.max(1, d.lvCols)) * 100).toFixed(1)}%)`);
  console.log('死亡次数:', d.deaths, ' 剩余命:', d.lives, ' 重生列:', JSON.stringify(d.respawnCols));
  console.log('最长卡住帧数:', d.maxStuckFrames);
  console.log('Boss:', JSON.stringify(d.boss));
  console.log('\n--- 事件 ---');
  for (const e of d.events) console.log('  ', e);
  console.log('\n--- 快照 ---');
  for (const s of d.snaps) console.log(`  ${s.s}s ${s.state} col=${s.col} lives=${s.lives} boss=${s.boss || '-'}`);
  console.log('\n--- 错误 (' + errors.length + ') ---');
  for (const e of [...new Set(errors)].slice(0, 15)) console.log(' !', e);
} catch (e) {
  console.error('FATAL', e.message);
} finally {
  try { ws.close(); } catch {}
  proc.kill();
}
