// 体验/流畅度体检：连续游玩 5 分钟，采样堆内存、对象池长度、逻辑耗时
// 目的：回答「玩久了会不会变卡」（内存泄漏 / 对象池无限增长 / 耗时劣化）
// 用法: node tools/_feel.mjs [port] [stage] [总帧数]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9500);
const STAGE = process.argv[3] ?? '0';
const TOTAL = Number(process.argv[4] ?? 18000);   // 18000 帧 = 5 分钟
const BATCH = 900;

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8141/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-feel-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--enable-precise-memory-info', '--js-flags=--expose-gc',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

let errors = [];
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
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) errors.push('EVAL: ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0]);
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL0 });
await sleep(3200);

const ready = await ev('(() => !!window.__game)()');
if (!ready) { console.log('FATAL: __game 未挂载'); proc.kill(); process.exit(1); }

// 装 AI 输入
await ev(`(() => {
  const g = window.__game;
  const inp = g.input;
  const S = { want: {}, edge: {}, ax: 0 };
  window.__S = S;
  inp.down = (a) => !!S.want[a];
  inp.pressed = (a) => { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = () => false;
  try { Object.defineProperty(inp, 'axisX', { get: () => S.ax, configurable: true }); } catch (e) { return 'AXIS_FAIL'; }
  return 'OK';
})()`);

// 起关
await ev(`(() => {
  const g = window.__game;
  g.lives = 50; g.char = 'reimu';
  ${STAGE === 'extra' ? "g.unlockedExtra = true; g._startExtraStage({ skipIntro: true });" : `g.startStage(${STAGE});`}
  window.__st = { i: 0, msSum: 0, msMax: 0, slow: 0, done: false, why: '', states: {} };
  return g.state;
})()`);

const SAMPLE = `(() => {
  const g = window.__game, s = g.stage;
  if (!s) return JSON.stringify({ none: true });
  const m = performance.memory;
  const out = {
    heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : -1,
    bullets: s.bullets ? (s.bullets.activeCount ?? -1) : -1,
    enemies: s.enemies && s.enemies.list ? s.enemies.list.length : -1,
    pickups: Array.isArray(s.pickups) ? s.pickups.length : -1,
    col: s.player ? Math.round(s.player.x / 32) : -1,
    state: g.state, boss: s.boss ? Math.round(s.boss.hp) : null, _arr: {}
  };
  // 通用扫描：把 stage 上所有数组 / 池的活跃数都抓出来，避免字段名猜错
  for (const k of Object.keys(s)) {
    const v = s[k];
    if (Array.isArray(v)) { if (v.length) out._arr[k] = v.length; continue; }
    if (v && typeof v === 'object') {
      if (typeof v.activeCount === 'number' && v.activeCount) out._arr[k + '.active'] = v.activeCount;
      for (const k2 of Object.keys(v)) {
        if (Array.isArray(v[k2]) && v[k2].length > 0 && v[k2].length < 5000) out._arr[k + '.' + k2] = v[k2].length;
      }
    }
  }
  return JSON.stringify(out);
})()`;

const RUN = `(async () => {
  const g = window.__game, S = window.__S, T = window.__st;
  const dt = 1 / 60;
  const N = ${BATCH};
  let batchMax = 0, batchSum = 0, batchSlow = 0;
  const yieldReal = () => new Promise((r) => setTimeout(r, 5));
  for (let k = 0; k < N; k++) {
    const i = T.i;
    if (g.state === 'dialogue' && g.dialogue && g.dialogue.active) g.dialogue.advance();
    const s = g.stage; if (!s) { T.done = true; T.why = 'NO_STAGE'; break; }
    const p = s.player, lv = s.level;
    S.want = { shoot: true }; S.ax = 0;
    if (s.boss && !s.boss.dead && s.bossStarted) {
      const t = i / 60;
      S.ax = Math.sin(t * 1.6) > 0 ? 1 : -1;
      if (Math.sin(t * 2.3) > 0.6) S.edge.jump = true;
      if (i % 420 === 0) S.edge.cast = true;
    } else if (s.mode === 'stg') {
      const t = i / 60;
      S.ax = Math.sin(t * 0.8) > 0 ? 1 : -1;
      if (Math.cos(t * 1.1) > 0.2) S.want.up = true;
      if (Math.cos(t * 1.1) < -0.4) S.want.down = true;
      if (i % 480 === 0) S.edge.cast = true;
    } else {
      S.ax = 1; S.want.right = true;
      const TT = 32, footY = p.y + p.h, fx = p.x + p.w + 8;
      let aheadSolid = false;
      for (let ox = 0; ox <= 48 && !aheadSolid; ox += 12)
        for (let oy = 2; oy <= 90; oy += 14) {
          const cx = Math.floor((fx + ox) / TT), cy = Math.floor((footY + oy) / TT);
          if (lv.isSolidTile(cx, cy) || lv.isPlatformTile(cx, cy)) { aheadSolid = true; break; }
        }
      let wall = false;
      for (let oy = 4; oy <= 70; oy += 14) {
        const cx = Math.floor((p.x + p.w + 10) / TT), cy = Math.floor((p.y + oy) / TT);
        if (lv.isSolidTile(cx, cy)) { wall = true; break; }
      }
      let gap = false;
      for (let ox = 12; ox <= 56; ox += 12) {
        const cx = Math.floor((fx + ox) / TT), cy = Math.floor((footY + 8) / TT);
        if (!lv.isSolidTile(cx, cy) && !lv.isPlatformTile(cx, cy)) { gap = true; break; }
      }
      if ((wall || gap || aheadSolid) && p.onGround) S.edge.jump = true;
      if (p.vy > 120 && !p.onGround) S.want.jump = true;
      if (i % 300 === 0) S.edge.dash = true;
    }
    const _t = performance.now();
    try { g.loop.update(dt); } catch (e) { T.done = true; T.why = 'UPDATE_ERR: ' + String(e).slice(0, 120); break; }
    const _ms = performance.now() - _t;
    batchSum += _ms; if (_ms > batchMax) batchMax = _ms; if (_ms > 5) batchSlow++;
    T.states[g.state] = (T.states[g.state] || 0) + 1;
    T.i++;
    if (g.state === 'clear' || g.state === 'gameover' || g.state === 'ending') { T.done = true; T.why = g.state; break; }
    if (k % 150 === 149) await yieldReal();
  }
  T.msSum += batchSum; T.msMax = Math.max(T.msMax, batchMax); T.slow += batchSlow;
  return JSON.stringify({ i: T.i, done: T.done, why: T.why, batchMax: +batchMax.toFixed(2),
    batchAvg: +(batchSum / N).toFixed(3), batchSlow });
})()`;

const rows = [];
let last = null;
const t0 = Date.now();
while (true) {
  const r = JSON.parse(await ev(RUN));
  const smp = JSON.parse(await ev(SAMPLE));
  rows.push({ ...r, ...smp });
  last = r;
  if (r.done || r.i >= TOTAL) break;
}

console.log('\n=== 连续游玩流畅度 / 劣化体检 ===');
console.log(`关卡: ${STAGE}   总帧: ${rows[rows.length - 1].i} (${(rows[rows.length - 1].i / 60).toFixed(0)}s)   结束原因: ${last.why || '到达上限'}\n`);
console.log('  时间   堆MB   弹幕  敌人  道具   列   BossHP  批次耗时avg/max  >5ms帧');
for (const r of rows) {
  console.log(`  ${String(Math.round(r.i / 60)).padStart(4)}s  ${String(r.heapMB).padStart(6)}  ${String(r.bullets).padStart(5)}  ${String(r.enemies).padStart(4)}  ${String(r.pickups).padStart(4)}  ${String(r.col).padStart(5)}  ${String(r.boss ?? '-').padStart(6)}   ${String(r.batchAvg).padStart(6)}/${String(r.batchMax).padStart(6)}  ${r.batchSlow}`);
}
const peakB = Math.max(...rows.map((r) => r.bullets || 0));
console.log(`\n峰值弹幕: ${peakB} / 1400 上限`);
console.log('活跃对象池采样（首批 → 末批）:');
const keys = new Set([...Object.keys(rows[0]._arr || {}), ...Object.keys(rows[rows.length - 1]._arr || {})]);
for (const k of keys) console.log(`  ${k.padEnd(22)} ${String(rows[0]._arr?.[k] ?? '-').padStart(5)} → ${String(rows[rows.length - 1]._arr?.[k] ?? '-').padStart(5)}`);

const heaps = rows.map((r) => r.heapMB).filter((h) => h > 0);
if (heaps.length >= 4) {
  const first = heaps.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
  const lastH = heaps.slice(-2).reduce((a, b) => a + b, 0) / 2;
  console.log(`\n堆内存: 起始 ${first.toFixed(1)}MB → 结束 ${lastH.toFixed(1)}MB  (增长 ${(lastH - first).toFixed(1)}MB, ${first > 0 ? ((lastH / first - 1) * 100).toFixed(0) : '?'}%)`);
  const peak = Math.max(...heaps);
  console.log(`峰值堆: ${peak.toFixed(1)}MB   结论: ${lastH - first > 40 ? '⚠ 增长明显，疑似泄漏' : '✅ 无明显泄漏'}`);
}
const avgs = rows.map((r) => r.batchAvg);
if (avgs.length >= 4) {
  const a1 = avgs.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const a2 = avgs.slice(-3).reduce((a, b) => a + b, 0) / 3;
  console.log(`逻辑耗时: 前段 ${a1.toFixed(3)}ms → 后段 ${a2.toFixed(3)}ms  ${a2 > a1 * 2 ? '⚠ 明显劣化' : '✅ 稳定'}`);
}
console.log(`\n全程最大单帧耗时: ${rows.reduce((a, r) => Math.max(a, r.batchMax), 0).toFixed(2)}ms  (>5ms 帧数: ${rows.reduce((a, r) => a + r.batchSlow, 0)})`);
console.log(`JS 错误: ${errors.length ? errors.slice(0, 5).join(' | ') : '无'}`);
console.log(`实际用时: ${((Date.now() - t0) / 1000).toFixed(0)}s`);

proc.kill();
process.exit(0);
