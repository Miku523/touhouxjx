// 飞行关（STG）Boss 的弹幕梯度 + 自机狙是否真的瞄准 STG 玩家
// 用法: node tools/_danmaku_stg.mjs [stageIndex]
//
// 背景：STG 玩家是 StgPlayer，只有 worldX / worldY，没有 x / y。
// 曾经 firePattern 直接读 player.x 得到 NaN，导致「自机狙」类符卡整招失效。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stage = Number(process.argv[2] ?? 4);
const W = 1280;
const H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9345;
const profile = mkdtempSync(join(tmpdir(), 'edge-stg-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

let ready = false;
for (let attempt = 0; attempt < 3 && !ready; attempt++) {
  await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?seed=20261018&stg=${Date.now()}` });
  for (let i = 0; i < 100; i++) {
    ready = await evaluate('!!window.__game');
    if (ready) break;
    await sleep(150);
  }
}
if (!ready) throw new Error('game did not boot');

async function measure(diffKey, seconds) {
  return evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.difficulty = ${JSON.stringify(diffKey)};
    g.startStage(${stage});
    try { g.dialogue.stop(); } catch (e) {}
    g.state = 'play';
    const s = g.stage;
    if (!s) throw new Error('stage not created');
    s.state = 'play';
    s.beginBoss();
    const b = s.boss;
    const pool = s.bullets;
    pool.clear();
    b.state = 'battle';
    b.alpha = 1;
    b.spellLock = 0;
    // 钉死第一张符卡的第一招：四档打同一招，密度差只来自难度倍率
    b.patternDur = 1e9;
    const pinned = { spell: b.spellIdx, pattern: b.patternIdx };

    const dt = 1 / 60;
    const p = s.player;
    p.alive = true;
    p.hearts = 999;
    p.invuln = 999999;
    // STG 玩家：worldX / worldY
    const px = p.worldX !== undefined ? p.worldX : p.x;
    const py = p.worldY !== undefined ? p.worldY : p.y;

    let nan = 0;
    let fired = 0;
    let speedSum = 0;
    let aimedOk = 0;
    let aimedTotal = 0;
    const origSpawn = pool.spawn.bind(pool);
    pool.spawn = (o) => {
      fired++;
      if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.vx) || !Number.isFinite(o.vy)) nan++;
      speedSum += Math.hypot(o.vx || 0, o.vy || 0);
      // 「自机狙」判定：从 Boss 出发、初速方向与「Boss → 玩家」夹角 < 25°
      const dx = px - b.x;
      const dy = py - b.y;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        const dot = (o.vx * dx + o.vy * dy) / (Math.hypot(o.vx, o.vy) * len || 1);
        aimedTotal++;
        if (dot > Math.cos(25 * Math.PI / 180)) aimedOk++;
      }
      return origSpawn(o);
    };

    let maxActive = 0;
    let minLane = Infinity;
    for (let i = 0; i < ${Math.round(seconds * 60)}; i++) {
      b.update(dt, p, pool, s.fx, {});
      pool.update(dt, { x: px, y: py }, { x: 0, y: 0, w: s.level.w, h: s.level.h });
      if (pool.activeCount > maxActive) maxActive = pool.activeCount;
      if (i % 3 === 0) {
        const xs = [];
        for (const bl of pool.pool) {
          if (!bl.active) continue;
          if (bl.y < py - 160 || bl.y > py + 40) continue;
          if (bl.x < px - 620 || bl.x > px + 620) continue;
          xs.push(bl.x);
        }
        xs.sort((a, z) => a - z);
        let best = xs.length ? Math.max(xs[0] - (px - 620), (px + 620) - xs[xs.length - 1]) : 1240;
        for (let k = 1; k < xs.length; k++) best = Math.max(best, xs[k] - xs[k - 1]);
        if (best < minLane) minLane = best;
      }
    }
    pool.spawn = origSpawn;
    return {
      diff: b.diff.key,
      mode: s.mode,
      fired,
      perSec: +(fired / ${seconds}).toFixed(1),
      avgSpeed: +(speedSum / Math.max(1, fired)).toFixed(1),
      maxActive, budget: b.bulletBudget, speedCap: b.speedCap,
      nan,
      aimedRatio: aimedTotal ? +(aimedOk / aimedTotal).toFixed(2) : null,
      minLane: +minLane.toFixed(1),
      volleys: b.volleys,
      pinned,
      playerAt: [Math.round(px), Math.round(py)],
    };
  })()`);
}

const out = {};
for (const key of ['E', 'N', 'H', 'L']) out[key] = await measure(key, 24);
console.log(JSON.stringify(out, null, 2));

const last = out.L;
const checks = [
  ['模式是飞行关', last.mode === 'stg'],
  ['没有 NaN 弹（STG 自机狙修复）', last.nan === 0],
  ['自机狙真的朝向玩家', last.aimedRatio === null || last.aimedRatio > 0.15],
  ['同屏弹数不超预算', ['E', 'N', 'H', 'L'].every((k) => out[k].maxActive <= out[k].budget)],
  ['密度递增 E<N<H<L', ['E', 'N', 'H', 'L'].every((k, i, a) => i === 0 || out[a[i - 1]].perSec < out[k].perSec)],
  ['弹速递增 E<N<H<L', ['E', 'N', 'H', 'L'].every((k, i, a) => i === 0 || out[a[i - 1]].avgSpeed < out[k].avgSpeed)],
  ['玩家带仍有余隙（≥40px）', ['E', 'N', 'H', 'L'].every((k) => out[k].minLane >= 40)],
];
let bad = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) bad++;
}
ws.close();
proc.kill();
if (bad) process.exit(1);
console.log('STG CHECKS PASSED');
