// 验证 E / N / H / L 的弹幕梯度与「有缝可解」护栏（独立 headless Edge + CDP）
// 用法: node tools/_danmaku_gradient.mjs
//
// 做的事：对四档难度各跑同一场 Boss 战（同一随机种子），统计
//   - 每秒发射弹数（弹幕密度）
//   - 平均弹速（px/s）
//   - 同屏弹数峰值（是否守住预算）
//   - 环状弹幕最小弧间距
//   - 玩家上下 200px、左右视野内的横向最大空档（能不能站人）
// 断言：密度 / 速度 E < N < H < L，同屏弹数不超预算，缝隙始终可站人。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1280;
const H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const profile = mkdtempSync(join(tmpdir(), 'edge-danmaku-'));
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
  await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?seed=20261018&danmaku=${Date.now()}` });
  for (let i = 0; i < 100; i++) {
    ready = await evaluate('!!window.__game');
    if (ready) break;
    await sleep(150);
  }
}
if (!ready) throw new Error('game did not boot');

/* ---------------------------------------------------------------
   在页面里同步跑完一整段模拟（rAF 插不进来），返回统计
   override：临时覆盖难度倍率（用于量「基准」），跑完立刻还原
   --------------------------------------------------------------- */
async function measure(diffKey, stageIdx, seconds, seed, override = null) {
  return evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.difficulty = ${JSON.stringify(diffKey)};
    g.startStage(${stageIdx});
    g.dialogue.stop();
    const s = g.stage;
    if (!s) throw new Error('stage not created');
    s.state = 'play';
    s.beginBoss();
    const b = s.boss;
    const pool = s.bullets;
    pool.clear();

    // 临时覆盖难度倍率（量基准用），结束时还原
    const keep = {};
    const ov = ${override ? JSON.stringify(override) : 'null'};
    if (ov) {
      for (const k of Object.keys(ov)) { keep[k] = b.diff[k]; b.diff[k] = ov[k]; }
      b.bulletBudget = Number(b.diff.bulletBudget) || b.bulletBudget;
      b.speedCap = Number(b.diff.bulletSpeedCap) || b.speedCap;
    }

    b._seed = ${seed} || 1;

    // 统计用的计数器（包一层 spawn / ring）
    let fired = 0;
    let speedSum = 0;
    let ringMinGap = Infinity;
    let ringCalls = 0;
    const origSpawn = pool.spawn.bind(pool);
    pool.spawn = (o) => {
      fired++;
      speedSum += Math.hypot(o.vx || 0, o.vy || 0);
      return origSpawn(o);
    };
    const origRing = pool.ring.bind(pool);
    pool.ring = (x, y, n, speed, o) => {
      ringCalls++;
      ringMinGap = Math.min(ringMinGap, (Math.PI * 2 * 240) / Math.max(1, n));
      return origRing(x, y, n, speed, o);
    };

    b.state = 'battle';
    b.alpha = 1;
    b.spellLock = 0;
    // 钉死第一张符卡的第一招：四档打同一招，密度差只来自难度倍率
    b.patternDur = 1e9;

    const dt = 1 / 60;
    const player = s.player;
    // 把玩家摆到 Boss 场地正下方，模拟真实交战位置（平台关玩家在左端出生）
    player.x = Math.max(40, b.x - 200);
    player.y = b.y + 300;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const bounds = { x: 0, y: 0, w: s.level.w, h: s.level.h };
    const left = px - 620;
    const right = px + 620;
    let maxActive = 0;
    let minLane = Infinity;                  // 玩家视野横向带里每帧最大的空隙
    let frames = 0;

    for (let i = 0; i < ${Math.round(seconds * 60)}; i++) {
      b.update(dt, player, pool, s.fx, {});
      pool.update(dt, { x: px, y: py }, bounds);
      if (pool.activeCount > maxActive) maxActive = pool.activeCount;

      // 每 3 帧量一次「可站立缝隙」：玩家上下 200px 内、左右视野内的横向空档
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
    pool.ring = origRing;
    if (ov) for (const k of Object.keys(keep)) b.diff[k] = keep[k];

    const dif = b.diff;
    return {
      difficulty: dif.key,
      label: ${JSON.stringify(override ? 'baseline' : diffKey)},
      seed: ${seed},
      volleys: b.volleys,
      fired,
      perSec: +(fired / ${seconds}).toFixed(1),
      avgSpeed: +(speedSum / Math.max(1, fired)).toFixed(1),
      maxActive,
      budget: b.bulletBudget,
      speedCap: b.speedCap,
      ringLimit: b.ringLimit,
      ringGapPx: b.ringGapPx,
      ringMinGap: ringCalls ? +ringMinGap.toFixed(1) : null,
      ringCalls,
      minLane: +minLane.toFixed(1),
      laneFrames: frames,
      pressureTail: +b.pressure.toFixed(2),
      phaseCount: b.phases.length,
    };
  })()`);
}

// 道中敌机（飞行关）的难度倍率是否真的接上了
async function enemyMods(diffKey, stageIdx) {
  return evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.difficulty = ${JSON.stringify(diffKey)};
    g.startStage(${stageIdx});
    g.dialogue.stop();
    const s = g.stage;
    return {
      difficulty: g.difficulty,
      stageDifficulty: s.difficulty,
      mode: s.mode,
      mods: s.stg ? { ...s.stg.enemyMods } : null,
    };
  })()`);
}

const out = { boss: {}, enemy: {}, baseline: null, checks: [] };
const SEED = 20261018;
const ORDER = ['E', 'N', 'H', 'L'];

// 第 3 面（index 2）Boss：平台关，四档都不裁符卡，四档打的是同一套符卡
for (const key of ORDER) {
  out.boss[key] = await measure(key, 2, 30, SEED);
}
// 基准：N 但把弹数 / 弹速 / 开火间隔倍率都改回 1（只改运行时对象，不动源码）
out.baseline = await measure('N', 2, 30, SEED, {
  bulletCountScale: 1, bulletSpeedScale: 1, fireIntervalScale: 1,
});
// 道中倍率（index 3 = 第 4 面，飞行关）
for (const key of ORDER) {
  out.enemy[key] = await enemyMods(key, 3);
}

const b = out.boss;
const base = out.baseline;
const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail });
const rel = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`;
const pct = (v) => rel((v / base.perSec - 1) * 100);

check('密度递增 E<N<H<L', ORDER.every((k, i) => i === 0 || b[ORDER[i - 1]].perSec < b[k].perSec),
  ORDER.map((k) => `${k}:${b[k].perSec}/s`).join(' '));
check('弹速递增 E<N<H<L', ORDER.every((k, i) => i === 0 || b[ORDER[i - 1]].avgSpeed < b[k].avgSpeed),
  ORDER.map((k) => `${k}:${b[k].avgSpeed}`).join(' '));
check('同屏弹数不超过预算', ORDER.every((k) => b[k].maxActive <= b[k].budget),
  ORDER.map((k) => `${k}:${b[k].maxActive}/${b[k].budget}`).join(' '));
check('同屏峰值递增 E<N<H<L', ORDER.every((k, i) => i === 0 || b[ORDER[i - 1]].maxActive < b[k].maxActive),
  ORDER.map((k) => `${k}:${b[k].maxActive}`).join(' '));
check('环状弹幕留缝（弧长 ≥ 26px 判定需求）', ORDER.every((k) => b[k].ringMinGap === null || b[k].ringMinGap >= 26),
  ORDER.map((k) => `${k}:${b[k].ringMinGap}`).join(' '));
check('玩家带始终有空档可站（≥40px）', ORDER.every((k) => b[k].minLane >= 40),
  ORDER.map((k) => `${k}:${b[k].minLane}px`).join(' '));
check('弹速上限生效', ORDER.every((k) => b[k].speedCap <= 470),
  ORDER.map((k) => `${k}:cap${b[k].speedCap}`).join(' '));
check('道中倍率按难度递增', ORDER.every((k, i) => i === 0
  || out.enemy[ORDER[i - 1]].mods.speed < out.enemy[k].mods.speed),
  ORDER.map((k) => `${k}:spd${out.enemy[k].mods.speed}/fire${out.enemy[k].mods.fire}`).join(' '));
check('E 明显比基准稀', b.E.perSec < base.perSec * 0.7, `E ${pct(b.E.perSec)} vs 基准`);
check('N 只比基准少一点点', Math.abs(b.N.perSec / base.perSec - 1) <= 0.15, `N ${pct(b.N.perSec)} vs 基准`);
check('H 比基准适度密', b.H.perSec > base.perSec * 1.15 && b.H.perSec < base.perSec * 1.7, `H ${pct(b.H.perSec)} vs 基准`);
check('L 比基准大量加密', b.L.perSec > base.perSec * 1.6, `L ${pct(b.L.perSec)} vs 基准`);

console.log(JSON.stringify(out, null, 2));
const failed = out.checks.filter((c) => !c.ok);
ws.close();
proc.kill();
if (failed.length) {
  console.error('\nFAILED:\n  ' + failed.map((f) => `${f.name} (${f.detail})`).join('\n  '));
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
