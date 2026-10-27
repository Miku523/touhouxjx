#!/usr/bin/env node
/**
 * 小头目探针（docs/ENEMY_VARIETY_SPEC.md §6-D4/D5）
 *
 * 自包含 CDP（照抄 tools/_verify_stage.mjs 的 EDGE 启动/清理骨架），不改 src。
 * 做的事：
 *  1. 逐面开一局（1/2/3/5/6），暂停 rAF 逻辑，手动以 1/60 步进 Stage，
 *     读 MinibossManager 的布置快照：数量 / 位置 / 原型 / 进场方案 / 血量。
 *  2. 断言：
 *     - 数量 = §6-D2 预期（S1 1 / S2 2 / S3 2 / S5 1 / S6 3）
 *     - halfCardHp = bossHalfCardHp(该面 Boss)（2026-10-27 第八轮后：1531 / 1659 / 1689 / 1661 / 1460）
 *     - 位置在 [60*32, bossArena.left-12*32] 内，且 S5 不落进妖梦中 Boss 舞台
 *     - 同关重开：位置 / 原型 / 进场方案完全一致（确定性）
 *     - 触发距离：阈值扫描（planX-d 处是否开演）+ 模拟走近（tSpawn 瞬间的像素距离），
 *       证明提前量约 700px；并截一张「进场动画 30%~60% 进度」的图（_pt/mb_entry_sN.png）
 *     - 不锁场：小头目激活时 stage.state 仍是 'play'、boss 仍为 null、bossStarted 仍是 false
 *     - 击破：+1/32P = +4 POWER（核对 _addPower 调用参数正好是 POWER.pickup=4）、
 *       爆裂后 bullets.clear()（击破帧场上敌弹数 = 0）、defeatedCount 增长
 *  3. 击破方式：把自机传送到小头目正下方，用真实 PlayerShots.fire / 真实子弹 / 真实
 *     damageWithShots 结算（自动玩家 sim_bot 只会平射，不会抬头，所以这里由探针给弹道）。
 *  4. 每面截 1 张图到 _pt/（_pt/mb_probe_sN.png）。
 *
 * 用法：
 *   node tools/_probe_miniboss.mjs --stages 1,2,3,5,6 --port 9150 \
 *        --url http://127.0.0.1:8137/index.html --out _pt/mb_probe.json
 *   node tools/_probe_miniboss.mjs --stages 1 --shot _pt/mb_s1.png
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
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
const PORT = Number(argv.port || 9150);
const W = 1280, H = 720;
const DIFF = String(argv.diff || 'N').toUpperCase();
const URL_BASE = argv.url || 'http://127.0.0.1:8137/index.html';
const OUT = argv.out || '_pt/mb_probe.json';
const SHOT_DIR = argv.shotDir || '_pt';
const CDP_TIMEOUT = Number(argv.timeout || 120000);
const MAX_FIGHT_STEPS = Number(argv.maxFightSteps || 2600);
const STAGES = String(argv.stages || '1,2,3,5,6')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

/** §6-D2 预期布置数量。 */
const EXPECT_COUNT = { 1: 1, 2: 2, 3: 2, 5: 1, 6: 3 };
/** D1 预期血量（bossHalfCardHp）。 */
const EXPECT_HP = { 1: 1531, 2: 1659, 3: 1689, 5: 1661, 6: 1460 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const killTree = (pid) => { if (pid) { try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} } };
saveRegistry();

const profile = mkdtempSync(join(tmpdir(), 'edge-mbprobe-'));
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

/* ---------- 页内驱动：手动步进 Stage + 真实射击/结算 ---------- */
const DRIVER = `window.__mbp = (function () {
  const G = () => window.__game;
  const fake = { down: () => false, pressed: () => false, released: () => false, moveX: 0, moveY: 0, endFrame() {} };
  const state = { powerLog: [] };
  const S = () => { const g = G(); return g && g.stage; };
  const mgr = () => { const s = S(); return s && s.minibosses; };
  function wrapAdd(s) {
    if (!s || s._mbWrapped) return;
    s._mbWrapped = true;
    const orig = s._addPower.bind(s);
    s._addPower = (n, ce) => {
      const before = s.player ? s.player.power : 0;
      const r = orig(n, ce);
      state.powerLog.push({
        n: n,
        before: before,
        after: s.player ? s.player.power : 0,
        // 记下「调用瞬间已经击破了几只小头目」：用来把 +1/32P 和道中吃 P 点区分开
        defeated: s.minibosses ? s.minibosses.list.filter((x) => x.defeated).length : 0,
      });
      return r;
    };
  }
  function place(s, m) {
    const p = s.player;
    if (!p) return;
    p.x = m.x - p.w / 2;
    p.y = m.baseY + 150 - p.h - 1;   // 站在小头目正下方的地面上
    p.vx = 0; p.vy = 0;
    p.invuln = Math.max(p.invuln || 0, 8); // 探针只测击破/奖励，不让玩家被弹幕打断
    p.facing = m.x >= p.x + p.w / 2 ? 1 : -1;
  }
  function shoot(s, m) {
    const p = s.player;
    const gx = p.x + p.w / 2;
    const gy = p.y + p.h * 0.34;
    const ty = m.y - m.h * 0.39;
    const aim = Math.atan2(ty - gy, Math.abs(m.x - gx) + 0.001);
    s.shots.fire(gx + 6 * p.facing, gy, p.facing, s.char, 5, aim, 0.05, false);
    p.shootCd = 0.085;
  }
  return {
    version: 1,
    reset() { state.powerLog.length = 0; },
    layout() {
      const s = S();
      if (!s) return null;
      const lv = s.level || {};
      return {
        stage: s.index + 1,
        mode: s.mode,
        halfCardHp: s.minibosses ? s.minibosses.halfCardHp : null,
        count: s.minibosses ? s.minibosses.list.length : 0,
        activeCount: s.minibosses ? s.minibosses.activeCount : 0,
        defeatedCount: s.minibosses ? s.minibosses.defeatedCount : 0,
        levelW: lv.w,
        cols: lv.cols,
        rows: lv.rows,
        bossArena: lv.bossArena || null,
        midbossArena: lv.midbossArena || null,
        boss: lv.boss || null,
        list: s.minibosses ? s.minibosses.snapshot() : [],
      };
    },
    fight(i, maxSteps) {
      const s = S();
      if (!s || !s.minibosses) return { error: 'no minibosses' };
      const m = s.minibosses.list[i];
      if (!m) return { error: 'no mini ' + i };
      wrapAdd(s);
      state.powerLog.length = 0;
      const before = {
        stageState: s.state,
        boss: !!s.boss,
        bossStarted: !!s.bossStarted,
        bullets: s.bullets.count(),
      };
      let steps = 0;
      // 先站到它脚下等进场结束（进场期间无敌+不发射）
      for (; steps < 400 && m.state !== 'fight'; steps++) {
        place(s, m);
        s.update(1 / 60, fake);
      }
      const entered = m.state === 'fight';
      const powerBefore = s.player.power;
      const tSpawn = m.tSpawn;
      let bulletsAfterKill = null;
      let powerJump = 0;
      for (; steps < (maxSteps || 2600) && !m.defeated; steps++) {
        place(s, m);
        if (s.player.shootCd <= 0) shoot(s, m);
        const powerBeforeFrame = s.player.power;
        s.update(1 / 60, fake);
        if (m.defeated) {
          powerJump = s.player.power - powerBeforeFrame;
          bulletsAfterKill = s.bullets.count();
        }
      }
      return {
        index: i,
        planX: Math.round(m.planX),
        x: Math.round(m.x),
        y: Math.round(m.y),
        baseY: Math.round(m.baseY),
        halfCardHp: s.minibosses.halfCardHp,
        hp: m.hp,
        maxHp: m.maxHp,
        entry: m.entry,
        archetype: m.archetype,
        state: m.state,
        entered: entered,
        defeated: m.defeated,
        tSpawn: tSpawn,
        tDeath: m.tDeath,
        powerBefore: powerBefore,
        powerAfter: s.player.power,
        powerJump: powerJump,
        powerLog: state.powerLog.slice(),
        bulletsAfterKill: bulletsAfterKill,
        steps: steps,
        afterState: s.state,
        afterBoss: !!s.boss,
        afterBossStarted: !!s.bossStarted,
        defeatedCount: s.minibosses.defeatedCount,
        before: before,
      };
    },
    /** 触发阈值扫描：玩家静止在 planX-d 处步进 1 帧，看 tSpawn 是否被记录 */
    triggerScan(i, ds) {
      const s = S();
      const list = s && s.minibosses && s.minibosses.list;
      const m = list && list[i];
      if (!m) return null;
      const p = s.player;
      const out = [];
      for (const d of (ds || [760, 740, 720, 710, 705, 700, 695, 690, 680, 600])) {
        m.state = 'idle'; m.stateT = 0; m.tSpawn = null; m.defeated = false; m.retired = false;
        m.hp = m.maxHp; m.alpha = 1; m.farT = 0; m.x = m.planX; m.y = m.baseY; m.invuln = 0;
        p.x = m.planX - d - p.w / 2;
        p.y = m.baseY - 60;          // 悬空放置：一帧内不会被平台横向挤出，x 保持精确
        p.vx = 0; p.vy = 0; p.invuln = 99;
        s.update(1 / 60, fake);
        out.push({
          dist: d,
          state: m.state,
          triggered: m.tSpawn !== null,
          tSpawn: m.tSpawn,
        });
      }
      return out;
    },
    /** 模拟玩家从 planX-startDist 处向右走：记录 tSpawn 被记录瞬间距 planX 的像素 */
    walkTrigger(i, startDist, stepPx) {
      const s = S();
      const list = s && s.minibosses && s.minibosses.list;
      const m = list && list[i];
      if (!m) return null;
      const p = s.player;
      m.state = 'idle'; m.stateT = 0; m.tSpawn = null; m.defeated = false; m.retired = false;
      m.hp = m.maxHp; m.alpha = 1; m.farT = 0; m.x = m.planX; m.y = m.baseY; m.invuln = 0;
      let cx = m.planX - (startDist || 900);
      let steps = 0;
      for (; steps < 600; steps++) {
        cx += (stepPx || 4);
        p.x = cx - p.w / 2;
        p.y = m.baseY + 150 - p.h - 1;
        p.vx = 0; p.vy = 0; p.invuln = 99;
        s.update(1 / 60, fake);
        if (m.tSpawn !== null) {
          return {
            triggered: true,
            distAtTrigger: Math.round(m.planX - (p.x + p.w / 2)),
            tSpawn: m.tSpawn,
            steps: steps,
            state: m.state,
            entry: m.entry,
          };
        }
      }
      return { triggered: false, distAtTrigger: Math.round(m.planX - (p.x + p.w / 2)), steps: steps };
    },
    /** 摆一个「进场动画进行中」的镜头：玩家站在 planX-approach 处，步进到进场进度 >= progress */
    poseEntry(i, approach, progress) {
      const s = S();
      const list = s && s.minibosses && s.minibosses.list;
      const m = list && list[i];
      if (!m) return null;
      const p = s.player;
      m.state = 'idle'; m.stateT = 0; m.tSpawn = null; m.defeated = false; m.retired = false;
      m.hp = m.maxHp; m.alpha = 1; m.farT = 0; m.x = m.planX; m.y = m.baseY; m.invuln = 0;
      s.shots && s.shots.clear && s.shots.clear();
      s.bullets && s.bullets.clear();
      const ax = m.planX - (approach || 500);
      let steps = 0;
      for (; steps < 240; steps++) {
        p.x = ax - p.w / 2;
        p.y = m.baseY + 150 - p.h - 1;
        p.vx = 0; p.vy = 0; p.invuln = 99;
        s.update(1 / 60, fake);
        if (m.state === 'enter' && m.entryDur > 0 && m.stateT / m.entryDur >= (progress || 0.45)) break;
      }
      // 构图：相机放在玩家与小头目中间，两者都在屏内（进场中本体偏离 hover 点，方向可见）
      const cam = s.camera;
      const mid = ((p.x + p.w / 2) + m.x) / 2;
      const nx = cam._clampX(mid - 1280 * 0.5);
      cam.x = nx; cam.tx = nx; cam.prevX = nx;
      const k = Math.min(1, m.stateT / m.entryDur);
      return {
        state: m.state,
        progress: Math.round(k * 100) / 100,
        entry: m.entry,
        planX: Math.round(m.planX),
        x: Math.round(m.x),
        y: Math.round(m.y),
        baseY: Math.round(m.baseY),
        fromX: Math.round(m.fromX),
        fromY: Math.round(m.fromY),
        dirX: m.fromX > m.planX ? 'from-right' : (m.fromX < m.planX ? 'from-left' : 'vertical'),
        dirY: m.fromY < m.baseY ? 'from-above' : 'level',
        offsetX: Math.round(m.x - m.planX),
        offsetY: Math.round(m.y - m.baseY),
        alpha: Math.round(m.alpha * 100) / 100,
        dur: Math.round(m.entryDur * 100) / 100,
        dist: Math.round(m.planX - (p.x + p.w / 2)),
        steps: steps,
        camX: nx,
      };
    },
    /** 摆一个「已进场 + 正在开火」的镜头，供截图 */
    pose(i, frames) {
      const s = S();
      if (!s || !s.minibosses) return null;
      const m = s.minibosses.list[i];
      if (!m) return null;
      for (let k = 0; k < 400 && m.state !== 'fight'; k++) { place(s, m); s.update(1 / 60, fake); }
      for (let k = 0; k < (frames || 40); k++) {
        place(s, m);
        if (s.player.shootCd <= 0) shoot(s, m);
        s.update(1 / 60, fake);
      }
      return { x: m.x, y: m.y, state: m.state, hp: m.hp, archetype: m.archetype };
    },
    /** 小头目所在 y 附近的相机世界坐标，供截图后核对 */
    cam() {
      const s = S();
      if (!s) return null;
      return { x: s.camera.x, y: s.camera.y };
    },
  };
})();
true`;

async function main() {
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

  // 截图前的 DOM 清理：
  //  - 暂停时 HUD.update / 启动幕揭幕都不跑，开局 banner、#boot 启动幕会一直挂在画面上
  //  - #overlay（标题菜单）同理，直接隐藏
  const hideBanner = () => evaluate(`(() => {
    const h = window.__game.hud;
    if (h) { h._bannerT = 0; h.elBanner?.classList.add('hidden'); h.elBanner?.classList.remove('show'); }
    const boot = document.getElementById('boot');
    if (boot) { boot.classList.add('done'); boot.style.display = 'none'; }
    const ov = document.getElementById('overlay');
    if (ov) ov.classList.add('hidden');
    return true;
  })()`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL_BASE}?mbprobe=${Date.now()}` });
  let booted = false;
  for (let i = 0; i < 150; i++) {
    if (await evaluate('!!(window.__game && window.__game.input)').catch(() => false)) { booted = true; break; }
    await sleep(200);
  }
  if (!booted) throw new Error('page boot timeout');
  await evaluate(`localStorage.removeItem('hks.progress.v1')`);
  await evaluate(`(() => { const g = window.__game; g.musicOn = false; g.difficulty = '${DIFF}'; g.unlockedExtra = true; return true; })()`);

  const stages = [];
  for (const N of STAGES) {
    const rec = { stage: N, assertions: [], ok: true };
    const assert = (name, pass, detail) => {
      rec.assertions.push({ name, pass: !!pass, detail });
      if (!pass) rec.ok = false;
    };
    try {
      // 开一局（低 POWER：奖励差异不会被 128 上限吃掉）
      await evaluate(`(() => { const g = window.__game; g.carryPower = 4; g.levelIndex = ${N - 1}; g.startStage(${N - 1}, { skipIntro: true }); return true; })()`);
      await sleep(120);
      const st0 = await evaluate(`(() => { const s = window.__game.stage; return s ? { state: s.state, mode: s.mode } : null; })()`);
      if (!st0) throw new Error('stage not created');
      // 冻结 rAF 逻辑：由探针手动 1/60 步进（渲染继续）
      await evaluate(`(() => { window.__game.loop.paused = true; return true; })()`);
      await sleep(120);
      await evaluate(DRIVER);
      const layout = await evaluate(`window.__mbp.layout()`);
      rec.layout = layout;

      const count = layout.list.length;
      assert('count', count === EXPECT_COUNT[N], `got ${count}, expect ${EXPECT_COUNT[N]}`);
      assert('halfCardHp', layout.halfCardHp === EXPECT_HP[N], `got ${layout.halfCardHp}, expect ${EXPECT_HP[N]}`);
      if (layout.mode !== 'platform') assert('mode', false, `mode=${layout.mode}`);
      const minX = 60 * 32;
      const maxX = (layout.bossArena ? layout.bossArena.left : layout.levelW - 50 * 32) - 12 * 32;
      for (const m of layout.list) {
        assert(`bounds#${m.index}`, m.planX >= minX && m.planX <= maxX, `planX=${m.planX} in [${minX},${maxX}]`);
        assert(`archetype#${m.index}`, ['sniper', 'dancer', 'bomber'].includes(m.archetype), `archetype=${m.archetype}`);
        assert(`entry#${m.index}`, ['slideR', 'slideL', 'drop', 'blink', 'diagonal'].includes(m.entry), `entry=${m.entry}`);
        if (N === 5 && layout.midbossArena) {
          const wa = layout.midbossArena.left - 6 * 32;
          const wb = layout.midbossArena.right + 16 * 32;
          assert(`s5-youmu#${m.index}`, m.planX < wa || m.planX > wb, `planX=${m.planX} window=[${wa},${wb}]`);
        }
      }

      // 逐只击破：验证 +1/32P（POWER.pickup=4）与击破清弹
      rec.kills = [];
      for (let i = 0; i < count; i++) {
        await evaluate('window.__mbp.reset()');
        const k = await evaluate(`window.__mbp.fight(${i}, ${MAX_FIGHT_STEPS})`);
        rec.kills.push(k);
        assert(`kill#${i}`, k.defeated, `state=${k.state} hp=${k.hp}/${k.maxHp} steps=${k.steps}`);
        const reward = k.powerLog.filter((p) => p.n === 4 && p.defeated === i + 1);
        const tagged = k.powerLog.filter((p) => p.defeated === i + 1);
        assert(`reward#${i}`, reward.length >= 1 && k.powerJump >= 4,
          `kill帧powerJump=${k.powerJump}, 击破瞬间 n===POWER.pickup 调用=${reward.length}, 该帧记录=${JSON.stringify(tagged)}`);
        assert(`clearBullets#${i}`, k.bulletsAfterKill === 0, `bulletsAfterKill=${k.bulletsAfterKill}`);
        assert(`noLock#${i}`, k.afterState === 'play' && !k.afterBoss && !k.afterBossStarted,
          `state=${k.afterState} boss=${k.afterBoss} bossStarted=${k.afterBossStarted}`);
        assert(`noLockPre#${i}`, k.before.stageState === 'play' && !k.before.boss,
          `pre state=${k.before.stageState} boss=${k.before.boss}`);
      }
      const dc = await evaluate(`(() => { const s = window.__game.stage; return s.minibosses ? s.minibosses.defeatedCount : -1; })()`);
      assert('defeatedCount', dc === count, `got ${dc}, expect ${count}`);

      // 同关重开：位置/原型/进场方案必须一致（确定性）
      await evaluate(`(() => { const g = window.__game; g.carryPower = 4; g.levelIndex = ${N - 1}; g.startStage(${N - 1}, { skipIntro: true }); return true; })()`);
      await sleep(120);
      await evaluate(`(() => { window.__game.loop.paused = true; return true; })()`);
      await sleep(80);
      const layout2 = await evaluate(`window.__mbp.layout()`);
      const sig1 = JSON.stringify(layout.list.map((m) => [m.index, m.planX, m.baseY, m.archetype, m.entry, m.halfCardHp]));
      const sig2 = JSON.stringify(layout2.list.map((m) => [m.index, m.planX, m.baseY, m.archetype, m.entry, m.halfCardHp]));
      assert('restartStable', sig1 === sig2, sig1 === sig2 ? 'identical' : `${sig1} != ${sig2}`);

      // 触发距离：阈值扫描 + 模拟走近，证明「玩家距 planX 约 700px 时开演」
      const scan = await evaluate(`window.__mbp.triggerScan(0, [760, 740, 720, 710, 705, 700, 695, 690, 680, 600])`);
      const walk = await evaluate(`window.__mbp.walkTrigger(0, 900, 4)`);
      rec.trigger = { scan: scan, walk: walk };
      const trigDists = (scan || []).filter((t) => t.triggered).map((t) => t.dist);
      const notTrigDists = (scan || []).filter((t) => !t.triggered).map((t) => t.dist);
      const boundary = trigDists.length ? Math.max(...trigDists) : null;
      const firstNo = notTrigDists.length ? Math.min(...notTrigDists) : null;
      assert('triggerThreshold',
        boundary !== null && firstNo !== null && boundary >= 690 && boundary <= 700 && firstNo >= 700 && firstNo <= 714,
        `triggered at ${JSON.stringify(trigDists)} (max ${boundary}), no-trigger at ${JSON.stringify(notTrigDists)} (min ${firstNo})`);
      assert('walkTriggerDist', !!walk && walk.triggered && walk.distAtTrigger >= 688 && walk.distAtTrigger <= 704,
        walk ? `distAtTrigger=${walk.distAtTrigger} tSpawn=${walk.tSpawn} entry=${walk.entry}` : 'walk trigger timeout');

      // 进场动画进行中截图：玩家站在 planX-500，步进到进场进度 ~45%
      if (layout2.list.length) {
        const entryPose = await evaluate(`window.__mbp.poseEntry(0, 500, 0.45)`);
        rec.entryPose = entryPose;
        await hideBanner();
        await sleep(300);
        const eShot = await send('Page.captureScreenshot', { format: 'png' });
        mkdirSync(resolve(SHOT_DIR), { recursive: true });
        const ePath = resolve(SHOT_DIR, `mb_entry_s${N}.png`);
        writeFileSync(ePath, Buffer.from(eShot.data, 'base64'));
        rec.entryScreenshot = ePath;
        assert('entryShot',
          !!entryPose && entryPose.state === 'enter' && entryPose.progress >= 0.3 && entryPose.progress <= 0.6,
          entryPose ? `state=${entryPose.state} progress=${entryPose.progress} entry=${entryPose.entry} offset=(${entryPose.offsetX},${entryPose.offsetY}) dir=(${entryPose.dirX},${entryPose.dirY})` : 'no pose');
      }

      // 截图：重开后摆一个「小头目已进场 + 弹幕在飞」的镜头
      if (layout2.list.length) {
        await evaluate(`window.__mbp.pose(0, 220)`);
        await sleep(160);
        await hideBanner();
        await sleep(320);
        const cam = await evaluate(`window.__mbp.cam()`);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        mkdirSync(resolve(SHOT_DIR), { recursive: true });
        const shotPath = resolve(SHOT_DIR, `mb_probe_s${N}.png`);
        writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
        rec.screenshot = shotPath;
        rec.screenshotCam = cam;
      }

      // beginBoss 必须把小头目全部撤回（Boss 战期间不能有残留小头目被画出/打出奖励）
      const bb = await evaluate(`(() => {
        const s = window.__game.stage;
        const was = s.minibosses ? s.minibosses.activeCount : 0;
        const defeated = s.minibosses ? s.minibosses.defeatedCount : 0;
        s.beginBoss();
        return {
          was: was,
          after: s.minibosses ? s.minibosses.activeCount : -1,
          defeatedBefore: defeated,
          defeatedAfter: s.minibosses ? s.minibosses.defeatedCount : -1,
          boss: !!s.boss,
          state: s.state,
        };
      })()`);
      rec.beginBossClear = bb;
      assert('beginBossClear', bb.was >= 1 && bb.after === 0 && bb.boss && bb.defeatedAfter === bb.defeatedBefore,
        `was=${bb.was} after=${bb.after} boss=${bb.boss} state=${bb.state}`);
    } catch (e) {
      rec.ok = false;
      rec.error = e.message;
    }
    stages.push(rec);
    console.log(`[mbprobe] S${N} ok=${rec.ok} count=${rec.layout ? rec.layout.list.length : '?'} ` +
      (rec.kills ? `kills=${rec.kills.filter((k) => k.defeated).length}` : '') +
      (rec.trigger && rec.trigger.walk ? ` trigWalk=${rec.trigger.walk.distAtTrigger}px` : '') +
      (rec.entryPose ? ` entry=${rec.entryPose.entry}@${rec.entryPose.progress}` : '') +
      (rec.error ? ` err=${rec.error}` : ''));
    for (const a of rec.assertions) if (!a.pass) console.log(`  [FAIL] ${a.name}: ${a.detail}`);
  }

  const ok = stages.every((r) => r.ok) && consoleErrors.length === 0;
  const result = {
    ok,
    diff: DIFF,
    stages: stages.map((r) => ({
      stage: r.stage,
      ok: r.ok,
      error: r.error || null,
      layout: r.layout,
      kills: r.kills || [],
      screenshot: r.screenshot || null,
      screenshotCam: r.screenshotCam || null,
      entryScreenshot: r.entryScreenshot || null,
      entryPose: r.entryPose || null,
      trigger: r.trigger || null,
      beginBossClear: r.beginBossClear || null,
      assertions: r.assertions,
    })),
    consoleErrors: consoleErrors.slice(0, 12),
  };
  const json = JSON.stringify(result, null, 2);
  if (OUT) {
    const p = resolve(OUT);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, json);
  }
  console.log(json);
  cleanup();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('[mbprobe] FATAL:', e.message);
  const p = resolve(OUT);
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ ok: false, error: e.message, consoleErrors }, null, 2));
  } catch {}
  cleanup();
  process.exit(1);
});
