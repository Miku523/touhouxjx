#!/usr/bin/env node
/**
 * verifier 独立复核 · 单面流程遥测（自包含 CDP，不依赖 _pt_core / 不改 src）
 *
 * 目的（BALANCE_TARGETS.md §2.1 / §2.4 / #5）：
 *  - 道中时长 = 开局 → stage.state 首次 'boss'（含对话，自动玩家 Normal）
 *  - Boss 时长 = 'boss' → 'clear'
 *  - Boss maxHp / 破势槽初始上限 poiseMax / 破势次数 staggerCount / 破势峰值 maxPoise
 *  - Boss 战同屏弹幕峰值 maxBulletsBoss（只统计 state==='boss' 的帧）
 *  - 互动触发次数：踩踏 stomp、冲刺撞击 dashHit、俯冲落地 diveLand、符卡 phase
 *  - console error / pageerror 收集
 *
 * 用法：
 *   node tools/_verify_stage.mjs --stage 1 --diff N --god 1 --maxSteps 60000 \
 *        --port 9140 --url http://127.0.0.1:8150/index.html --out _pt/vb_s1.json
 *   node tools/_verify_stage.mjs --stage 7 --extra 1 --mode full ...   # EX
 *   node tools/_verify_stage.mjs --stage 7 --extra 1 --mode boss ...   # 只测 Boss（传送+直接 beginBoss）
 *   --forceBoss 1  传送到关底并直接 beginBoss（绕开卡住的自动玩家，仅用于 Boss 指标）
 *   --pauseLoop 0  不冻结 rAF 逻辑（与 tools/_sim_player.mjs 原口径交叉核对时用）
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

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
const PORT = Number(argv.port || 9140);
const W = 1280, H = 720;
const STAGE = Number(argv.stage || 1);           // 1..6，7 = EX
const EXTRA = STAGE === 7 || argv.extra === '1';
const DIFF = String(argv.diff || 'N').toUpperCase();
const CHAR = String(argv.char || 'reimu');
const GOD = argv.god !== '0';
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const MAX_STEPS = Number(argv.maxSteps || 60000);
const CHUNK = Number(argv.chunk || 240);
const RETRIES = Number(argv.retries || 10);
const OUT = argv.out || '';
const PAUSE_LOOP = argv.pauseLoop !== '0';
const FORCE_BOSS = argv.forceBoss === '1';
const START_X = argv.startX === undefined ? null : Number(argv.startX);
const CDP_TIMEOUT = Number(argv.timeout || 90000);
// 测量 harness 自救：自动玩家在个别 pit 点会「复活后卡进几何」（HEAD 基线 S1 x≈48066、S5/S6 x≈314xx）。
// 探针检测 play 状态下 x 停滞 >3s 时，横向前扫 4000px 找可站立点传送（记 probeRescue 事件），
// 否则该面无法测完；基线与改造后必须同一开关。--rescue 0 关闭。
const RESCUE = argv.rescue !== '0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => Math.round(v * 100) / 100;

/* ---------- 进程卫生：退出时杀掉自己拉起的无头 Edge ---------- */
const REGISTRY = join(tmpdir(), 'hks-verify-browsers.json');
let registry = { list: [] };
try {
  if (existsSync(REGISTRY)) {
    const j = JSON.parse(readFileSync(REGISTRY, 'utf8'));
    if (Array.isArray(j.list)) registry.list = j.list.filter((e) => e && e.at > Date.now() - 6 * 3600e3);
  }
} catch { registry = { list: [] }; }
const saveRegistry = () => { try { writeFileSync(REGISTRY, JSON.stringify(registry)); } catch {} };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const killTree = (pid) => { if (pid) { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} } };
saveRegistry();

const profile = mkdtempSync(join(tmpdir(), 'edge-verify-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
proc.on('error', () => {});
const entry = { pid: proc.pid, owner: process.pid, port: PORT, profile, at: Date.now() };
registry.list.push(entry);
saveRegistry();

let cleaned = false;
let ws = null;
const consoleErrors = [];
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws && ws.close(); } catch {}
  killTree(proc.pid);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 2 }); } catch {}
  registry.list = registry.list.filter((e) => e !== entry);
  saveRegistry();
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { cleanup(); process.exit(130); });

async function getTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error(`no target on port ${PORT}（端口被占用或浏览器未起）`);
}

let bail = null;
try {
  const page = await getTarget();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      consoleErrors.push((d.text + ' ' + (d.exception?.description || '')).slice(0, 500));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 500));
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    const timer = setTimeout(() => { pending.delete(mid); rej(new Error(`CDP timeout ${method}`)); }, CDP_TIMEOUT);
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

  const t0 = Date.now();
  await send('Page.navigate', { url: `${URL_BASE}?verify=${Date.now()}` });
  let booted = false;
  for (let i = 0; i < 150; i++) {
    try { if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; } } catch {}
    await sleep(200);
  }
  if (!booted) throw new Error('boot timeout');

  // 清进度 → 设定难度/角色 → 注入 bot → 装探针（在 startStage 前）
  await evaluate('localStorage.removeItem("hks.progress.v1")');
  await evaluate(`window.__game.unlockedExtra = true; window.__game.showTitle(); window.__game.difficulty='${DIFF}'; window.__game.char='${CHAR}'; window.__game.musicOn=false;`);
  const installed = await evaluate(`import('/tools/sim_bot.js?t=${Date.now()}').then(m => !!m.install({ god: ${GOD}, maxRetries: ${RETRIES} }))`);
  if (!installed) throw new Error('bot install failed');

  const probeOk = await evaluate(`(() => {
    const g = window.__game;
    const vp = window.__vp = {
      t: 0, frames: 0, events: [], bossT: null, clearT: null, bossInfo: null,
      maxBulletsBoss: 0, maxBulletsAll: 0, maxPoise: 0, staggers: 0, stomps: 0,
      dashHits: 0, diveLands: 0, phases: [], phaseLog: [], bossDamage: 0,
      lastHp: null, clear: false, stageStartT: null, stageStarts: [], stall: null,
      levelW: null, mode: null, poiseMaxFirst: null, hp: null, bossCount: 0,
      bossSegs: [], _lastBossObj: null, _lastBossKey: null, _stageRef: null,
      rescues: [], _rx: null, _rt: 0, _lastRescue: -1e9,
    };
    const recEvent = (type, data) => {
      if (!/^(bossTrigger|bossStart|bossPhase|bossStagger|bossStomp|bossDiveLand|clear|midbossClear|death|gameover|respawn|checkpoint|bossEnd|extraTimeline)$/.test(type)) return;
      vp.events.push({ t: +vp.t.toFixed(2), type, d: data ? JSON.parse(JSON.stringify(data)) : null });
    };
    const attach = (s) => {
      if (!s) return;
      if (vp._stageRef !== s) { vp._stageRef = s; vp.levelW = s.level && s.level.w; vp.mode = s.mode; }
      if (s.__vpAttached) return;
      s.__vpAttached = true;
      const orig = s.onEvent;
      s.onEvent = (type, data) => { recEvent(type, data); return orig ? orig(type, data) : undefined; };
    };
    const wrapBoss = (b) => {
      if (!b || b.__vpWrapped) return;
      b.__vpWrapped = true;
      vp.bossCount++;
      if (vp.poiseMaxFirst == null) vp.poiseMaxFirst = b.poiseMax;
      if (typeof b.hitByDash === 'function') {
        const f = b.hitByDash.bind(b);
        b.hitByDash = (...a) => { const r = f(...a); if (r) { vp.dashHits++; vp.events.push({ t: +vp.t.toFixed(2), type: 'dashHit' }); } return r; };
      }
      if (typeof b.stompBy === 'function') {
        const f = b.stompBy.bind(b);
        b.stompBy = (...a) => { const r = f(...a); if (r) { vp.stomps++; vp.events.push({ t: +vp.t.toFixed(2), type: 'stomp' }); } return r; };
      }
    };
    const origUpdate = g.update.bind(g);
    g.update = function (dt) {
      vp.t += dt; vp.frames++;
      const s = this.stage;
      if (s) attach(s);
      origUpdate(dt);
      const s2 = this.stage;
      if (!s2) return;
      // 对白/非 play 状态时 stage.update 不跑，玩家 x 冻结属正常 → 卡死判定与自救都要排除
      const busy = this.state !== 'play' || !!(this.dialogue && this.dialogue.active);
      // —— 测量 harness 自救：x 停滞 >3s 时向前找落脚点传送（仅 play 状态；基线与改造后同开关）——
      if (${RESCUE} && !busy && s2.state === 'play' && s2.player) {
        const p = s2.player;
        if (vp._rx == null || Math.abs(p.x - vp._rx) > 2) { vp._rx = p.x; vp._rt = vp.t; }
        else if (vp.t - vp._rt > 3 && vp.t - vp._lastRescue > 4) {
          vp._lastRescue = vp.t;
          const bot = this.input && this.input.__simBot;
          const L = s2.level;
          const from = vp._rx;
          let rx = null, ry = null, mode = 'scan';
          // 优先传送到前方最近的检查点（半真实复活逻辑，绕过卡死坑点）；限 6000px 内
          if (L && Array.isArray(s2.checkpoints)) {
            let best = null;
            for (const c of s2.checkpoints) {
              if (!c || !Number.isFinite(c.x)) continue;
              if (c.x > from + 240 && c.x <= from + 6000 && (!best || c.x < best.x)) best = c;
            }
            if (best) {
              const cx = best.x - p.w / 2;
              const cy = best.y - p.h - 2;
              if (cy > 0 && !L.rectHitsSolid(cx + 2, cy, p.w - 4, p.h - 2)) { rx = cx; ry = cy; mode = 'cp'; }
            }
          }
          if (rx == null && bot && typeof bot.landable === 'function' && L) {
            for (let dx = 32; dx <= 4000 && rx == null; dx += 16) {
              const x = from + dx;
              if (x > (L.w || 1e9) - 160) break;
              for (let dy = -160; dy <= 160; dy += 16) {
                const y = p.y + dy;
                if (y < 0 || y > (L.h || 720) - 96) continue;
                if (L.rectHitsSolid(x + 2, y, p.w - 4, p.h - 2)) continue;
                if (!bot.landable(L, x + 4, y + p.h, p.w - 8, 16)) continue;
                rx = x; ry = y; break;
              }
            }
          }
          if (rx != null) {
            p.x = rx; p.y = ry; p.vx = 0; p.vy = 0;
            if (typeof p.dashT === 'number') p.dashT = 0;
            p.invuln = Math.max(p.invuln || 0, 2);
            if (typeof p.setCheckpoint === 'function') p.setCheckpoint(rx, ry);
            vp.rescues.push({ t: +vp.t.toFixed(2), from: Math.round(from), x: Math.round(rx), y: Math.round(ry), mode });
            vp.events.push({ t: +vp.t.toFixed(2), type: 'probeRescue', d: { from: Math.round(from), x: Math.round(rx), mode } });
            vp._rx = rx; vp._rt = vp.t;
          }
        }
      }
      const b = s2.boss;
      if (b) {
        wrapBoss(b);
        const key = (b.key || b.def?.id || b.def?.key || '?');
        if (vp._lastBossObj !== b) {
          vp._lastBossObj = b;
          if (vp.bossSegs.length && !vp.bossSegs[vp.bossSegs.length - 1].closed) {
            const prev = vp.bossSegs[vp.bossSegs.length - 1];
            prev.endT = +vp.t.toFixed(2); prev.closed = true;
          }
          vp._lastBossKey = key;
          vp.bossSegs.push({ key, t0: +vp.t.toFixed(2), maxHp: b.maxHp, phases: (b.phases || []).map((p) => ({ name: p.name || p.id, hp: p.hp })), closed: false });
        }
        if (vp.bossInfo == null || vp.bossInfo.key !== key || vp.bossInfo.maxHp !== b.maxHp) {
          vp.bossInfo = { key, maxHp: b.maxHp, phases: (b.phases || []).map((p) => ({ name: p.name || p.id, hp: p.hp })), poiseMax: b.poiseMax, t: +vp.t.toFixed(2) };
        }
        if (s2.state === 'boss') {
          if (vp.bossT == null) vp.bossT = +vp.t.toFixed(2);
          if (b.state !== 'dead') {
            let n = 0;
            const pool = s2.bullets && s2.bullets.pool;
            if (pool) for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
            if (n > vp.maxBulletsBoss) vp.maxBulletsBoss = n;
            if (b.poise > vp.maxPoise) vp.maxPoise = b.poise;
            if ((b.staggerCount || 0) > vp.staggers) vp.staggers = b.staggerCount || 0;
            try { if (b._ix) vp.bossIx = Object.assign({}, vp.bossIx || {}, b._ix); } catch {}
            if (vp.lastHp != null && b.hp < vp.lastHp) vp.bossDamage += (vp.lastHp - b.hp);
            vp.lastHp = b.hp;
            if (vp._lastPhase !== b.phase) { vp._lastPhase = b.phase; vp.phaseLog.push({ t: +vp.t.toFixed(2), phase: b.phase, hp: b.hp }); }
          }
          if (s2.state === 'clear' || s2.state === 'boss') { /* noop */ }
        }
      }
      let nb = 0;
      const pool2 = s2.bullets && s2.bullets.pool;
      if (pool2) for (let i = 0; i < pool2.length; i++) if (pool2[i].active) nb++;
      if (nb > vp.maxBulletsAll) vp.maxBulletsAll = nb;
      if (s2.state === 'clear' && !vp.clear) {
        vp.clear = true; vp.clearT = +vp.t.toFixed(2);
        if (vp.bossSegs.length && !vp.bossSegs[vp.bossSegs.length - 1].closed) {
          const last = vp.bossSegs[vp.bossSegs.length - 1];
          last.endT = vp.clearT; last.closed = true;
        }
      }
      // 卡死检测：play 状态下 x 连续 12 秒不推进（对白/菜单帧不算）
      if (!busy && s2.state === 'play' && s2.player) {
        const px = s2.player.x;
        if (vp._sx == null || Math.abs(px - vp._sx) > 2) { vp._sx = px; vp._st = vp.t; }
        else if (vp.t - vp._st > 12 && !vp.stall) {
          vp.stall = { t: +vp.t.toFixed(2), x: Math.round(px) };
          try {
            const p = s2.player;
            const scalars = {};
            for (const k of Object.keys(p)) {
              const v = p[k];
              if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') scalars[k] = v;
            }
            const b = window.__game.input.__simBot;
            vp.stallInfo = {
              player: scalars,
              stage: { state: s2.state, t: s2.t, camX: s2.camera && s2.camera.x, goalX: s2.goalX, camX2: s2.camera && s2.camera.tx },
              bot: b ? { stuck: b.stuck, deathSpots: b.deathSpots, airPlan: b.airPlan, dbg: b.dbg.slice(0, 8), trace: b.trace && b.trace.slice(-4) } : null,
            };
          } catch (e) { vp.stallInfo = { err: String(e) }; }
        }
      }
    };
    return true;
  })()`);
  if (!probeOk) throw new Error('probe install failed');

  // 冻结 rAF 逻辑（渲染继续）：保证 sim 时间 == 逻辑步数/60，可复现
  if (PAUSE_LOOP) await evaluate('(() => { const g = window.__game; if (g.loop) g.loop.paused = true; })()');
  // 固定 Math.random（关卡生成/敌人 AI 里有随机），让基线/改造后逐帧可比
  if (argv.seed !== '0') {
    const seed = Number(argv.seed || 12345);
    await evaluate(`(() => { let s = ${seed} >>> 0; Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })()`);
  }
  // 开局
  if (EXTRA) {
    // EXTRA 进场有一段开场对白；对白不推进就永远进不了 Stage。
    // 这里先正常 startExtra()，若对白卡住则直接 skipIntro 建 Stage（等价于玩家按掉对白）。
    await evaluate(`(() => { const g = window.__game; g.unlockedExtra = true; g.extraChar = '${CHAR}'; g.startExtra('${CHAR}'); if (!g.stage) { try { g.dialogue?.stop?.(); } catch {} g._startExtraStage({ skipIntro: true }); } return { state: g.state, stage: !!(g.stage) }; })()`);
  } else {
    await evaluate(`window.__game.carryPower = ${argv.power || 128}; window.__game.levelIndex = ${STAGE - 1}; window.__game.startStage(${STAGE - 1})`);
  }
  // 传送 / 直接开 Boss
  const teleport = FORCE_BOSS ? (START_X != null ? START_X : 'AUTO') : START_X;
  if (teleport != null) {
    await evaluate(`(() => { const g = window.__game, s = g.stage; if (!s) return null; const p = s.player; const tx = ${teleport === 'AUTO' ? 'Math.max(0, s.level.w - 1400)' : Number(teleport)}; p.x = tx; p.y = 0; p.vy = 0; if (window.__vp) { window.__vp._sx = p.x; window.__vp._st = window.__vp.t; } return { tx, levelW: s.level.w, mode: s.mode }; })()`);
  }
  if (FORCE_BOSS) {
    const bossStart = await evaluate(`(() => { const g = window.__game, s = g.stage; s.beginBoss(); return { state: s.state, boss: !!(s.boss), camX: s.camera && s.camera.x }; })()`);
    if (!bossStart || !bossStart.boss) throw new Error('beginBoss failed ' + JSON.stringify(bossStart));
  }

  // 逐块推进
  let snap = null;
  let steps = 0;
  let stallChunks = 0;
  let wall = Date.now();
  while (steps < MAX_STEPS) {
    const n = Math.min(CHUNK, MAX_STEPS - steps);
    try {
      snap = await evaluate(`window.__game.input.__simBot.run(${n})`);
    } catch (e) {
      bail = 'advance failed: ' + e.message;
      break;
    }
    if (!snap) { bail = 'no snapshot'; break; }
    if (snap.steps === steps) stallChunks++; else stallChunks = 0;
    steps = snap.steps;
    if (stallChunks > 5) { bail = 'bot steps stalled'; break; }
    if (snap.errors?.length) break;
    if (snap.stage && snap.stage.state === 'dead') await sleep(950);
    const done = await evaluate('window.__vp.clear');
    if (done) { await evaluate('window.__game.input.__simBot.run(60)'); break; }
    if (snap.state === 'menu' && steps > 300) break;
    if (snap.stage && snap.stage.state === 'gameover') break;
    if (Date.now() - wall > 240000) { bail = 'wall timeout'; break; }
  }

  const final = await evaluate('window.__game.input.__simBot.snapshot()');
  const vp = await evaluate('window.__vp');
  const fsInfo = await evaluate(`(() => { const s = window.__game.stage; return s && s.level ? { levelW: s.level.w, mode: s.mode, name: s.level.name } : null; })()`).catch(() => null);
  // Boss 分段：EX 先有中 BOSS 再有最终 BOSS，按 Boss 对象身份切段
  const bossSegs = (vp.bossSegs || []).map((x) => ({ ...x }));
  if (bossSegs.length && !bossSegs[bossSegs.length - 1].closed) {
    bossSegs[bossSegs.length - 1].endT = vp.clearT != null ? vp.clearT : r2(final.simSec);
    bossSegs[bossSegs.length - 1].closed = true;
  }
  const finalSeg = bossSegs.length ? bossSegs[bossSegs.length - 1] : null;
  const lastStage = snap && snap.stage ? snap.stage : (final.stage || null);
  // 口径：平台关 = 首次进入 state 'boss' → clear；EX = 最终 BOSS 登场 → clear（#5 只要求 EX 总时长）
  const midSec = EXTRA && finalSeg ? finalSeg.t0 : vp.bossT;
  const bossSec = midSec != null && vp.clearT != null ? r2(vp.clearT - midSec) : null;
  const totalSec = vp.clearT != null ? vp.clearT : (vp.bossT != null ? r2(final.simSec) : final.simSec);
  const perScreenCount = null; // 由静态脚本负责

  const result = {
    ok: !bail && !final.errors?.length,
    bail,
    stage: STAGE,
    extra: EXTRA,
    diff: DIFF,
    char: CHAR,
    god: GOD,
    pauseLoop: PAUSE_LOOP,
    forceBoss: FORCE_BOSS,
    harnessRescue: RESCUE,
    steps: final.steps,
    simSec: final.simSec,
    levelW: (fsInfo && fsInfo.levelW) || vp.levelW,
    mode: (fsInfo && fsInfo.mode) || vp.mode,
    stageName: (fsInfo && fsInfo.name) || null,
    midSec: midSec != null ? r2(midSec) : null,
    bossSec,
    totalSec: totalSec != null ? r2(totalSec) : null,
    firstBossT: vp.bossT,
    bossSegs,
    ratios: midSec != null && bossSec != null ? { mid: r2(midSec / (midSec + bossSec)), boss: r2(bossSec / (midSec + bossSec)) } : null,
    boss: vp.bossInfo,
    poiseMaxFirst: vp.poiseMaxFirst,
    maxPoise: vp.maxPoise,
    staggers: vp.staggers,
    interactions: { stomp: vp.stomps, dashHit: vp.dashHits, diveLand: vp.diveLands, phases: Math.max(0, vp.phaseLog.length - 1), bossCount: vp.bossCount },
    bossIx: vp.bossIx || null,
    phaseLog: vp.phaseLog,
    maxBulletsBoss: vp.maxBulletsBoss,
    maxBulletsAll: vp.maxBulletsAll,
    bossDamage: Math.round(vp.bossDamage),
    events: vp.events,
    rescues: vp.rescues || [],
    stall: vp.stall,
    stallInfo: vp.stallInfo || null,
    deaths: final.deaths,
    gameovers: final.gameovers,
    retries: final.retries,
    errors: final.errors,
    consoleErrors: consoleErrors.slice(0, 12),
    wallMs: Date.now() - t0,
    lastStage: lastStage ? { state: lastStage.state, name: lastStage.name, x: lastStage.px, lives: lastStage.lives, levelW: lastStage.levelW } : null,
  };
  const json = JSON.stringify(result, null, 2);
  if (OUT) {
    const p = resolve(OUT);
    if (!existsSync(dirname(p))) spawnSync('mkdir', ['-p', dirname(p)]);
    writeFileSync(p, json);
  }
  console.log(json);
} catch (e) {
  bail = e.message;
  console.error('[verify] FAILED:', e.message);
  const result = { ok: false, bail, stage: STAGE, extra: EXTRA, diff: DIFF, consoleErrors };
  const json = JSON.stringify(result, null, 2);
  if (OUT) { try { writeFileSync(resolve(OUT), json); } catch {} }
  console.log(json);
  cleanup();
  process.exit(1);
}
cleanup();
process.exit(0);
