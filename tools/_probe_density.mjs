// 量「第二关第 2 张 / 第三面第 3 张」这两张被点名的符卡，改前 vs 改后：
//   - 每秒发射弹数（perSec，含计划外变招）
//   - 同屏峰值弹数 / 难度预算
//   - 玩家视野横向最大空档（minLane，人能不能站）
// 改前数据写死在 LEGACY 里（就是本次改动前的参数 + 分面密度 = 1）。
// 用法: node tools/_probe_density.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1280, H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9342;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-density-'));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
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
  await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?seed=20261018&density=${Date.now()}` });
  for (let i = 0; i < 100; i++) {
    ready = await evaluate('!!window.__game');
    if (ready) break;
    await sleep(150);
  }
}
if (!ready) throw new Error('game did not boot');

// 改前的两张符卡（仅测试数据，不进游戏代码）
const LEGACY = {
  wriggle: {
    stage: 1, card: 1, name: '蠢符「小虫风暴」', patterns: [
      { typeName: 'fan', n: 7, spread: 1.2, speed: 100, color: '#a8ff8f', rate: 1.25, r: 5, wobble: 45 },
      { typeName: 'spiral', arms: 3, speed: 92, color: '#d6ff7a', rate: 0.18, spin: 1.8, r: 4 },
      { typeName: 'aimed', n: 3, spread: 0.7, speed: 150, color: '#ffffff', rate: 1.4, r: 5, weight: 0.75 },
    ],
  },
  cirno: {
    stage: 2, card: 2, name: '冻符「完美冻结」', patterns: [
      { typeName: 'ring', n: 26, speed: 62, color: '#a8e8ff', rate: 1.4, r: 9, type: 2, spinAngle: 0.2, rings: 2 },
      { typeName: 'ring', n: 14, speed: 150, color: '#d6f6ff', rate: 0.9, r: 5, spinAngle: 0.8 },
      { typeName: 'aimed', n: 3, spread: 0.3, speed: 285, color: '#ffffff', rate: 1.0, r: 5 },
    ],
  },
};

/** 在页面里跑一段纯 Boss 战，量密度 */
async function measure({ bossKey, stageIdx, cardIdx, diff, seed, legacy = false, seconds = 30 }) {
  const legacyData = legacy ? LEGACY[bossKey] : null;
  return evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.difficulty = ${JSON.stringify(diff)};
    g.startStage(${stageIdx});
    g.dialogue.stop();
    const s = g.stage;
    if (!s) throw new Error('stage not created');
    s.state = 'play';
    s.beginBoss();
    const b = s.boss;
    const pool = s.bullets;
    pool.clear();

    // 改前模式：换成旧符卡数据，并把分面密度还原成 1
    const legacyData = ${legacyData ? JSON.stringify(legacyData.patterns) : 'null'};
    b._seed = ${seed} >>> 0;
    if (legacyData) {
      b.stageDensity = 1;
      b.phases[${cardIdx}].patterns = legacyData;
    }
    b.state = 'battle';
    b.alpha = 1;
    b.spellLock = 0;
    b.spellBroken = false;
    b.spellIdx = ${cardIdx};
    b.phase = ${cardIdx};
    const ph = b.phases[${cardIdx}];
    b.spellName = ph.name;
    b.spellMaxHp = ph.hp;
    b.spellHp = ph.hp;
    b._startPattern(0);

    let fired = 0;
    let speedSum = 0;
    const origSpawn = pool.spawn.bind(pool);
    pool.spawn = (o) => {
      fired++;
      speedSum += Math.hypot(o.vx || 0, o.vy || 0);
      return origSpawn(o);
    };

    const dt = 1 / 60;
    const player = s.player;
    player.x = Math.max(40, b.x - 200);
    player.y = b.y + 300;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const bounds = { x: 0, y: 0, w: s.level.w, h: s.level.h };
    const left = px - 620, right = px + 620;
    let maxActive = 0, minLane = Infinity, frames = 0;

    for (let i = 0; i < ${Math.round(seconds * 60)}; i++) {
      b.update(dt, player, pool, s.fx, {});
      pool.update(dt, { x: px, y: py }, bounds);
      if (pool.activeCount > maxActive) maxActive = pool.activeCount;
      if (i % 3 === 0) {
        const xs = [];
        for (const bl of pool.pool) {
          if (!bl.active) continue;
          if (bl.y < py - 160 || bl.y > py + 40) continue;
          if (bl.x < left || bl.x > right) continue;
          xs.push(bl.x);
        }
        xs.sort((a, b2) => a - b2);
        let best = xs.length ? Math.max(xs[0] - left, right - xs[xs.length - 1]) : (right - left);
        for (let k = 1; k < xs.length; k++) best = Math.max(best, xs[k] - xs[k - 1]);
        if (best < minLane) minLane = best;
        frames++;
      }
    }
    pool.spawn = origSpawn;
    return {
      diff: b.diff.key,
      stage: ${stageIdx + 1},
      card: ${cardIdx + 1},
      spell: b.spellName,
      seed: ${seed},
      legacy: ${legacy},
      perSec: +(fired / ${seconds}).toFixed(1),
      avgSpeed: +(speedSum / Math.max(1, fired)).toFixed(1),
      maxActive,
      budget: b.bulletBudget,
      minLane: frames ? +minLane.toFixed(1) : null,
      stageDensity: b.stageDensity,
      volleys: b.volleys,
    };
  })()`);
}

const SEEDS = [20261018, 424242];
const ORDER = ['E', 'N', 'H', 'L'];
const rows = [];
for (const diff of ORDER) {
  for (const bossKey of ['wriggle', 'cirno']) {
    const stageIdx = LEGACY[bossKey].stage;
    const cardIdx = LEGACY[bossKey].card;
    for (const seed of SEEDS) {
      for (const legacy of [true, false]) {
        rows.push(await measure({ bossKey, stageIdx, cardIdx, diff, seed, legacy }));
      }
    }
  }
}

console.log(JSON.stringify({ rows }, null, 2));
ws.close();
proc.kill();
