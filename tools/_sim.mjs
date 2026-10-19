// 自动玩家回归：CDP 驱动 headless Edge，手动步进 g.loop.update(dt) 跑逻辑
// 采用「分批续跑」——每次 eval 只跑 BATCH 步，避免长任务断连
// 用法: node tools/_sim.mjs <stageIndex> <totalSteps> [run|boss] [port]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGE = Number(process.argv[2] ?? 0);
const TOTAL = Number(process.argv[3] ?? 12000);
const MODE = process.argv[4] ?? 'run';
const PORT = Number(process.argv[5] ?? 9460);
const BATCH = 2500;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = `http://127.0.0.1:8141/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-sim-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

const errors = [];
async function target() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push('EXC: ' + (x.exception?.description || x.text || '').split('\n').slice(0, 2).join(' | ')); }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR: ' + (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('LOG: ' + (d.params.entry.text || '').slice(0, 160));
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 240));
  return r.result?.result?.value;
};

const SETUP = `(() => {
  const g = window.__game;
  if (!g || !g.input) return 'NO_GAME';
  const inp = g.input;
  const S = { want: {}, edge: {}, ax: 0 };
  window.__S = S;
  inp.down = (a) => !!S.want[a];
  inp.pressed = (a) => { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = () => false;
  try { Object.defineProperty(inp, 'axisX', { get: () => S.ax, configurable: true }); } catch (e) { return 'AXIS_FAIL'; }
  return 'OK';
})()`;

const INIT = `(() => {
  const g = window.__game;
  window.__st = { i: 0, deaths: 0, prevLives: null, respawnCols: [], maxStuck: 0, stuck: 0,
    lastCol: -1, snaps: [], events: [], prevState: g.state, prevSpell: -1,
    maxB: 0, maxMs: 0, slowFrames: 0, msSum: 0, pendRespawn: 0, deathCol: 0, done: false };
  return 'init';
})()`;

const RUN = `(async () => {
  const g = window.__game, S = window.__S, T = window.__st;
  const ST = S;
  const N = ${BATCH};
  const dt = 1 / 60;
  const yieldReal = () => new Promise((r) => setTimeout(r, 6));
  const st = g.stage;
  if (!st) return JSON.stringify({ done: true, why: 'NO_STAGE' });

  for (let k = 0; k < N; k++) {
    const i = T.i;
    if (g.state === 'dialogue' && g.dialogue && g.dialogue.active) g.dialogue.advance();
    const s = g.stage; if (!s) break;
    const p = s.player, lv = s.level;

    ST.want = { shoot: true }; ST.ax = 0;
    if (g.state === 'play' || g.state === 'boss') {
      if (s.boss && !s.boss.dead && s.bossStarted) {
        const t = i / 60;
        ST.ax = Math.sin(t * 1.6) > 0 ? 1 : -1;
        if (Math.sin(t * 2.3) > 0.6) ST.edge.jump = true;
        if (i % 420 === 0) ST.edge.cast = true;
      } else if (s.mode === 'stg') {
        const t = i / 60;
        ST.ax = Math.sin(t * 0.8) > 0 ? 1 : -1;
        ST.want.up = Math.cos(t * 1.1) > 0.2;
        ST.want.down = Math.cos(t * 1.1) < -0.4;
        if (i % 480 === 0) ST.edge.cast = true;
      } else {
        ST.ax = 1; ST.want.right = true;
        const TT = 32, footY = p.y + p.h, fx = p.x + p.w + 8;
        let aheadSolid = false;
        for (let ox = 0; ox <= 48 && !aheadSolid; ox += 12)
          for (let oy = 2; oy <= 90; oy += 14) {
            const cx = Math.floor((fx + ox) / TT), cy = Math.floor((footY + oy) / TT);
            if (lv.isSolidTile(cx, cy) || lv.isPlatformTile(cx, cy)) { aheadSolid = true; break; }
          }
        let wall = false;
        for (let oy = -p.h + 6; oy < -6; oy += 12) {
          const cx = Math.floor((p.x + p.w + 6) / TT), cy = Math.floor((p.y + p.h + oy) / TT);
          if (lv.isSolidTile(cx, cy)) { wall = true; break; }
        }
        if (p.onGround && (!aheadSolid || wall)) ST.edge.jump = true;
        else if (!p.onGround && wall && (p.jumpsLeft || 0) > 0 && p.vy > -60) ST.edge.jump = true;
        else if (!p.onGround && p.vy > 150 && !aheadSolid && (p.jumpsLeft || 0) > 0) ST.edge.jump = true;
        if (Math.abs(p.x - (ST.lastX ?? -1)) < 1.2) ST.stuckN = (ST.stuckN || 0) + 1; else ST.stuckN = 0;
        ST.lastX = p.x;
        if (ST.stuckN > 40) { ST.edge.jump = true; ST.edge.dash = true; }
        if (ST.stuckN > 120) { ST.ax = -1; ST.want.left = true; delete ST.want.right; }
        if (ST.stuckN > 200) { ST.ax = 1; ST.want.right = true; delete ST.want.left; ST.stuckN = 0; }
      }
    }

    const _t = performance.now();
    try { g.loop.update(dt); } catch (e) { T.events.push('UPDATE_ERR@' + i + ': ' + String(e).slice(0, 140)); T.done = true; break; }
    const _ms = performance.now() - _t;
    if (_ms > T.maxMs) T.maxMs = _ms;
    if (_ms > 5) T.slowFrames++;
    T.msSum += _ms;

    const col = lv ? Math.round(p.x / 32) : -1;
    if (p.lives !== undefined && T.prevLives !== null && p.lives < T.prevLives) {
      T.deaths++; T.pendRespawn = 90; T.deathCol = col;
    }
    if (p.lives !== undefined) T.prevLives = p.lives;
    if (T.pendRespawn > 0) { T.pendRespawn--; if (T.pendRespawn === 0) T.respawnCols.push({ die: T.deathCol, at: col, back: T.deathCol - col }); }
    if (g.state !== T.prevState) {
      T.events.push(Math.round(i / 60) + 's ' + T.prevState + '->' + g.state + ' col=' + col);
      T.prevState = g.state;
    }
    if (s.boss && s.boss.spellIdx !== T.prevSpell) { T.events.push(Math.round(i / 60) + 's spell ' + T.prevSpell + '->' + s.boss.spellIdx); T.prevSpell = s.boss.spellIdx; }
    if (Math.abs(col - T.lastCol) < 1 && g.state === 'play') { T.stuck++; if (T.stuck > T.maxStuck) T.maxStuck = T.stuck; } else T.stuck = 0;
    T.lastCol = col;

    if (i % 60 === 0) {
      let nb = -1;
      try { const bp = s.bullets; if (bp && Array.isArray(bp.pool)) { let c = 0; for (const b of bp.pool) if (b.active) c++; nb = c; if (c > T.maxB) T.maxB = c; } } catch (e) {}
      if (i % 600 === 0) T.snaps.push({ s: +(i / 60).toFixed(1), state: g.state, col, lives: p.lives, bul: nb,
        boss: s.boss ? Math.round(s.boss.hp) + '/' + Math.round(s.boss.maxHp) + ' sp' + s.boss.spellIdx : null });
    }
    T.i++;
    if (g.state === 'clear' || g.state === 'gameover' || g.state === 'ending') { T.events.push('END@' + Math.round(i / 60) + 's ' + g.state); T.done = true; break; }
    if (k % 25 === 24) await yieldReal();
  }
  const s2 = g.stage, p2 = s2 && s2.player;
  return JSON.stringify({ i: T.i, done: T.done, state: g.state,
    col: p2 ? Math.round(p2.x / 32) : -1, lvCols: s2 ? s2.level.cols : -1,
    lives: p2 ? p2.lives : -1, deaths: T.deaths,
    boss: s2 && s2.boss ? { hp: Math.round(s2.boss.hp), max: Math.round(s2.boss.maxHp), spell: s2.boss.spellIdx, total: s2.boss.spellCount } : null });
})()`;

const REPORT = `JSON.stringify(window.__st)`;

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(900);
  console.log('setup:', await ev(SETUP));

  await ev(`(() => { const g = window.__game; g.lives = 50; g.char = 'reimu'; g.startStage(${STAGE}); return g.state; })()`);
  await sleep(500);
  await ev(`(() => { const g = window.__game; let n = 0; while (g.state === 'dialogue' && n++ < 100) g.dialogue.advance(); return n; })()`);
  await sleep(250);

  if (MODE === 'boss') {
    console.log('teleport:', await ev(`(() => {
      const g = window.__game, st = g.stage, p = st.player, lv = st.level;
      if (st.mode === 'stg') return 'SKIP(STG)';
      const tx = Math.max(200, Math.min((st.goalX || lv.w) - 120, (lv.w - 520) - 420));
      const col = Math.floor((tx - 200) / 32);
      let cy = 0;
      for (; cy < lv.rows; cy++) if (lv.isSolidTile(col, cy) || lv.isPlatformTile(col, cy)) break;
      p.x = col * 32; p.y = Math.max(0, (cy - 2) * 32); p.vx = 0; p.vy = 0; p.onGround = true;
      if (st.camera) st.camera.snapTo(p.x);
      return 'col=' + col + ' groundRow=' + cy;
    })()`));
    await sleep(250);
  }
  await ev(INIT);

  const t0 = Date.now();
  let last = {};
  while (true) {
    const r = JSON.parse(await ev(RUN));
    last = r;
    if (r.done) break;
    if (r.i >= TOTAL) break;
    if (Date.now() - t0 > 240000) { console.log('(超时截断)'); break; }
  }
  const T = JSON.parse(await ev(REPORT));

  console.log('\n===== SIM stage', STAGE, 'mode', MODE, '=====');
  console.log('逻辑时长:', (T.i / 60).toFixed(1) + 's   实际耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('最终状态:', last.state, ' 进度: col', last.col, '/', last.lvCols, `(${((last.col / Math.max(1, last.lvCols)) * 100).toFixed(1)}%)`);
  console.log('死亡:', T.deaths, ' 剩余命:', last.lives, ' 重生落点:', JSON.stringify(T.respawnCols.slice(0, 8)));
  console.log('最长卡住:', T.maxStuck, '帧   峰值弹幕:', T.maxB, '   逻辑耗时 max:', T.maxMs.toFixed(2) + 'ms  >5ms帧:', T.slowFrames, ' 均值:', (T.msSum / Math.max(1, T.i)).toFixed(3) + 'ms');
  console.log('Boss:', JSON.stringify(last.boss));
  console.log('\n--- 事件 ---');
  for (const e of T.events.slice(-30)) console.log('  ', e);
  console.log('\n--- 快照 ---');
  for (const s of T.snaps.filter((_, n) => n % 2 === 0)) console.log(`  ${s.s}s ${s.state} col=${s.col} lives=${s.lives} bul=${s.bul} boss=${s.boss || '-'}`);
  console.log('\n--- 错误 (' + errors.length + ') ---');
  for (const e of [...new Set(errors)].slice(0, 15)) console.log(' !', e);
} catch (e) {
  console.error('FATAL', e.message);
} finally {
  try { ws.close(); } catch {}
  proc.kill();
}
