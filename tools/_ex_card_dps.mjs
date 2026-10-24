#!/usr/bin/env node
/**
 * EXTRA 12 张符卡「逐卡打空耗时」测量器
 * ---------------------------------------------------------------
 * 口径与主线验收器一致：CDP 无头 Edge + tools/sim_bot.js 自动玩家
 * （god 无敌 / 满火力 Lv4 / reimu），逐帧采样 Boss 自己的
 * `lastCardResult.elapsed`（= cardElapsed，符卡宣言无敌结束后才开始计时）。
 *
 * stage：EXTRA（difficulty='EX'，stageNumber=0）
 *   - remilia（中途 Boss，2 张）：extraT=120 时直开
 *   - flandre（关底，10 张）：remilia 击破、midbossDone 后 extraT=180 直开
 * 每个 seed 跑一遍完整 12 卡；每卡 >=2 样本，结果写 _pt/ex_card_dps.json。
 *
 * 用法：
 *   python -m http.server 8141            # 仓库根
 *   node tools/_ex_card_dps.mjs --seeds 101,202
 *
 * 口径说明：默认「带 tuning」——按当前 bossTuning 的逐卡 hp/limit/tier 测量
 * （tier 4/5 会乘 1.15–1.3 弹幕密度、1.06–1.12 弹速，这就是真实游戏状态）。
 * 传 --naked 才在运行期摘掉 bossTuning 里 remilia/flandre 的条目（只改模块对象，
 * 不改 src 文件），复现 BOSS_DEFS 裸血量、无逐卡限时的诊断口径。
 *
 * 只读 src/，只写 _pt/。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/* ------------------------------------------------------------------ 参数 */
const argv = process.argv.slice(2);
function arg(name, def = '') {
  const i = argv.indexOf('--' + name);
  if (i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith('--' + name + '='));
  if (eq != null) return eq.slice(name.length + 3);
  return def;
}
function argFlag(name, def = false) {
  if (argv.includes('--' + name)) return true;
  if (argv.includes('--no-' + name)) return false;
  return def;
}

const URL_BASE = arg('url', 'http://127.0.0.1:8141/index.html');
const OUT = resolve(arg('out', '_pt/ex_card_dps.json'));
const SEEDS = arg('seeds', '101,202').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
const CHAR = arg('char', 'reimu');
const GOD = argFlag('god', true);
const CHUNK = Math.max(60, Number(arg('chunk', '600')) || 600);
const CARD_TIMEOUT = Number(arg('card-timeout', '180')) || 180;
const WALL_MS = (Number(arg('wall', '900')) || 900) * 1000;
const PORT_BASE = Number(arg('port', '9410')) || 9410;
// 默认「裸血量」口径：运行期摘掉 bossTuning 里 remilia/flandre 的逐卡条目，
// 让 Boss 构造拿到 cardTune=null → 用 BOSS_DEFS 原始 hp、无逐卡限时、不乘 tier 弹幕倍率。
// --naked：运行期摘掉 bossTuning 的 remilia/flandre 条目，复现裸血量口径（诊断用）。
const NAKED = argFlag('naked', false);
const W = 1280, H = 720;

const EDGE = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  join(process.env.LOCALAPPDATA || '', 'Microsoft/Edge/Application/msedge.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge/Chrome 可执行文件，可用 EDGE_PATH 环境变量指定');
  process.exit(2);
}

/* 12 卡顺序（页面 spellMaxHp 为准，这里只用于对齐输出） */
const EXPECTED = [
  { boss: 'remilia', index: 0, name: '咒诅「弗拉德·特佩斯」', raw: 2400 },
  { boss: 'remilia', index: 1, name: '天罚「大卫之星」', raw: 2100 },
  { boss: 'flandre', index: 0, name: '禁忌「蔓越莓陷阱」', raw: 1790 },
  { boss: 'flandre', index: 1, name: '禁忌「雷瓦汀」', raw: 1980 },
  { boss: 'flandre', index: 2, name: '禁忌「四重存在」', raw: 2180 },
  { boss: 'flandre', index: 3, name: '秘弹「然后就一个人都不剩了？」', raw: 2370 },
  { boss: 'flandre', index: 4, name: '禁弹「星弧破碎」', raw: 2560 },
  { boss: 'flandre', index: 5, name: '禁弹「折反射」', raw: 2750 },
  { boss: 'flandre', index: 6, name: 'QED「495年的波纹」', raw: 2940 },
  { boss: 'flandre', index: 7, name: '禁忌「吸血鬼之宴」', raw: 3200 },
  { boss: 'flandre', index: 8, name: '禁忌「破坏之瞳」', raw: 3460 },
  { boss: 'flandre', index: 9, name: '未明「长夜不醒之约」', raw: 3850 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function killTree(pid) {
  if (!pid) return;
  try {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', detached: true }).unref();
  } catch {
    try { process.kill(pid); } catch {}
  }
}

/* ------------------------------------------------------------------ 页面探针 */
/**
 * 在页面里包装每个 Boss 的 update：逐帧记录 spellIdx / cardElapsed / spellHp，
 * 切卡时用引擎自己的 `lastCardResult.elapsed` 收尾（与主线 HUD 同源）。
 */
function pageProbe(cfg) {
  const g = window.__game;
  const P = {
    seed: cfg.seed, cards: [], runs: [], timeouts: [], notes: [], errors: [],
    cur: null, frames: 0,
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;

  function startCard(b) {
    P.cur = {
      bossKey: b.key, index: b.spellIdx | 0, name: b.spellName,
      spellMaxHp: b.spellMaxHp, frames: 0, maxElapsed: 0,
      lastHp: b.spellHp, noDmgFrames: 0, maxNoDmgFrames: 0,
      forcedTimeout: false,
      endRatio: null,
      playerPowerStart: g.stage && g.stage.player ? g.stage.player.power : null,
    };
  }

  function finishCard(b, reason) {
    const c = P.cur;
    if (!c) return null;
    const lr = b.lastCardResult && b.lastCardResult.index === c.index ? b.lastCardResult : null;
    // 「到点 break」= 限时/生存卡撑到 limit（血量不参与判定）；否则是被打空。
    // lastCardResult 在 _advanceSpell 入口快照，limit 与 elapsed 同源，可据此区分引擎分支。
    const timeEnded = !!(lr && lr.limit != null && lr.elapsed >= lr.limit - 0.05);
    const endRatio = c.endRatio != null ? c.endRatio : null;
    const out = {
      bossKey: c.bossKey,
      index: c.index,
      name: c.name,
      spellMaxHp: c.spellMaxHp,
      seconds: lr ? r3(lr.elapsed) : r3(c.maxElapsed),
      engine: lr ? 'lastCardResult' : 'maxElapsed',
      reason,
      frames: c.frames,
      maxNoDmgSec: r2(c.maxNoDmgFrames / 60),
      playerPowerEnd: g.stage && g.stage.player ? g.stage.player.power : null,
      timeout: !!c.forcedTimeout,
      bossEndState: b.state,
      mode: lr ? lr.mode : null,
      limit: lr ? lr.limit : null,
      ok: lr ? !!lr.ok : null,
      timeEnded,
      // 打空 = 0；到点 break（含 survival / both 撑满）= 1
      hpRemainingRatio: timeEnded ? 1 : (endRatio == null ? null : r3(Math.max(0, endRatio))),
    };
    P.cards.push(out);
    P.cur = null;
    P.endRatio = null;
    return out;
  }

  function hook(b) {
    if (b.__exHooked) return false;    b.__exHooked = true;
    // 在切卡前一刻抓「剩余血量比例」：_advanceSpell 之后 spellHp 已被下一张卡重置。
    const origAdvance = b._advanceSpell;
    if (typeof origAdvance === 'function') {
      b._advanceSpell = function (bullets, fx, opts) {
        P.endRatio = this.spellMaxHp > 0 ? this.spellHp / this.spellMaxHp : 0;
        if (P.cur) P.cur.endRatio = P.endRatio;
        return origAdvance.call(this, bullets, fx, opts);
      };
    }
    const orig = b.update;
    b.update = function (dt, player, bullets, fx, opts) {
      P.frames++;
      // 只在战斗态自动开卡：最后一张符卡打空后 state 会变 defeat/dead，
      // spellIdx 仍停在最后一张，若无条件 startCard 会把同一张卡反复重记。
      if (!P.cur && this.state === 'battle') startCard(this);
      let c = P.cur;
      // 保险：切卡若发生在采样点之外（理论上不会），先把旧卡收掉
      if (c && (c.bossKey !== this.key || c.index !== this.spellIdx)) {
        finishCard(this, 'idx-drift');
        c = null;
        if (this.state === 'battle') startCard(this);
      }
      orig.call(this, dt, player, bullets, fx, opts);
      const cc = P.cur;
      if (!cc) return;
      cc.frames++;
      if (this.cardElapsed > cc.maxElapsed) cc.maxElapsed = this.cardElapsed;
      if (this.spellHp < cc.lastHp - 1e-6) {
        cc.lastHp = this.spellHp;
        cc.noDmgFrames = 0;
      } else {
        cc.noDmgFrames++;
      }
      if (cc.noDmgFrames > cc.maxNoDmgFrames) cc.maxNoDmgFrames = cc.noDmgFrames;

      const lr = this.lastCardResult;
      const ended = lr && lr.index === cc.index &&
        (this.spellIdx !== cc.index || this.state === 'defeat' || this.state === 'dead');
      if (ended) {
        const reason = (this.state === 'defeat' || this.state === 'dead')
          ? 'defeat'
          : (lr.ok ? 'break' : 'limit');
        finishCard(this, reason);
        if (this.state === 'battle') startCard(this);
        return;
      }
      // 单卡超时保护：强制打空当前符卡并标记，继续下一张，避免整轮卡死
      if (!cc.forcedTimeout && this.cardElapsed >= cfg.cardTimeout) {
        cc.forcedTimeout = true;
        P.timeouts.push({
          bossKey: this.key, index: cc.index, name: cc.name,
          elapsed: r2(this.cardElapsed), spellMaxHp: cc.spellMaxHp,
        });
        this.spellLock = 0;
        this.damage(this.spellMaxHp * 2 + 1e4);
      }
    };
    return true;
  }

  P.arm = function (label, seed) {
    const s = g.stage;
    const b = s && s.boss;
    if (!b) return { err: 'no boss in stage' };
    P.seed = seed;
    const run = {
      label,
      seed,
      bossKey: b.key,
      spells: b.phases.length,
      startedAt: +s.extraT.toFixed(2),
      scroll: Math.round(s.stg ? s.stg.scroll : 0),
      bossMaxHp: b.maxHp,
      phaseHp: b.phases.map((p) => p.hp),
      playerPower: s.player ? s.player.power : null,
      playerFireLevel: s.player && s.player.fireLevel != null ? s.player.fireLevel : null,
      hooked: hook(b),
    };
    if (P.cur) finishCard(b, 'arm-reset');
    P.runs.push(run);
    startCard(b);
    return {
      ok: true,
      bossKey: run.bossKey, spells: run.spells, phaseHp: run.phaseHp,
      idx: b.spellIdx, spellMaxHp: b.spellMaxHp,
      playerPower: run.playerPower, playerFireLevel: run.playerFireLevel,
      scroll: run.scroll, extraT: run.startedAt,
    };
  };

  P.export = function () {
    const bot = g.input && g.input.__simBot;
    const sn = bot ? bot.snapshot() : null;
    return {
      seed: P.seed,
      cards: P.cards,
      runs: P.runs,
      timeouts: P.timeouts,
      notes: P.notes,
      errors: P.errors,
      frames: P.frames,
      bot: sn ? {
        steps: sn.steps,
        simSec: sn.simSec,
        power: sn.stage && sn.stage.power,
        hits: sn.hitCount,
        hitDmg: Math.round(sn.hitDmg),
        shots: sn.shotsFired,
        maxBullets: sn.maxBullets,
        deaths: sn.deaths,
        gameovers: sn.gameovers,
        errors: (sn.errors || []).slice(0, 3),
      } : null,
      playerEnd: g.stage && g.stage.player
        ? { power: g.stage.player.power, lives: g.stage.player.lives, fireLevel: g.stage.player.fireLevel }
        : null,
      game: { state: g.state, stageState: g.stage && g.stage.state, stageFinished: !!(g.stage && g.stage.finished) },
    };
  };

  window.__exProbe = P;
  return { ok: true, seed: cfg.seed };
}

/* ------------------------------------------------------------------ CDP 客户端 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.consoleWarnings = [];
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const { res, rej, timer } = this.pending.get(m.id);
        this.pending.delete(m.id);
        clearTimeout(timer);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
        return;
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        this.consoleErrors.push(((d.text || '') + ' ' + ((d.exception && d.exception.description) || '')).slice(0, 600));
      } else if (m.method === 'Runtime.consoleAPICalled') {
        const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400);
        if (m.params.type === 'error') this.consoleErrors.push(txt);
        else if (m.params.type === 'warning') this.consoleWarnings.push(txt);
      }
    };
  }
  send(method, params = {}, timeout = 120000) {
    return new Promise((res, rej) => {
      const mid = ++this.id;
      const timer = setTimeout(() => {
        this.pending.delete(mid);
        rej(new Error(`CDP timeout ${method}`));
      }, timeout);
      this.pending.set(mid, { res, rej, timer });
      this.ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }
  async ev(expr, timeout = 180000) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true,
    }, timeout);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(((d.text || '') + ' ' + ((d.exception && d.exception.description) || '')).slice(0, 1200));
    }
    return r.result ? r.result.value : undefined;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function launch(seed, index) {
  const port = PORT_BASE + index;
  const profile = mkdtempSync(join(tmpdir(), 'edge-exdps-'));
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
    `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' });
  proc.on('error', () => {});

  let page = null;
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
      page = list.find((t) => t.type === 'page');
      if (page) break;
    } catch {}
    await sleep(250);
  }
  if (!page) {
    killTree(proc.pid);
    throw new Error(`Edge 未就绪 (port ${port})`);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new Cdp(ws);
  cdp.proc = proc;
  cdp.profile = profile;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  return cdp;
}

async function closeRun(cdp) {
  try { cdp.close(); } catch {}
  killTree(cdp.proc && cdp.proc.pid);
  for (let i = 0; i < 10; i++) {
    try { rmSync(cdp.profile, { recursive: true, force: true }); break; } catch { await sleep(300); }
  }
}

/* ------------------------------------------------------------------ 单 seed 测量 */
async function runSeed(seed, index) {
  const t0 = Date.now();
  const cdp = await launch(seed, index);
  const log = (...a) => console.log(`[seed ${seed}]`, ...a);
  const phases = {};
  try {
    // 用游戏自带的 ?seed= 复现开关：src/main.js 会把 Math.random 换成 mulberry32，
    // 并在建关 / Boss 登场两处 seedReset()，这是官方口径的确定性来源。
    const nav = await cdp.send('Page.navigate', { url: `${URL_BASE}?seed=${seed}` });
    if (nav && nav.errorText) throw new Error('navigate failed: ' + nav.errorText);
    let booted = false;
    let lastBoot = null;
    for (let i = 0; i < 250; i++) {
      try {
        lastBoot = await cdp.ev(`(() => ({
          game: !!(window.__game && window.__game.input),
          ready: document.readyState,
          href: location.href,
          title: document.title,
          body: (document.body && document.body.innerText || '').slice(0, 160),
        }))()`);
        if (lastBoot && lastBoot.game) { booted = true; break; }
      } catch (e) {
        lastBoot = { err: String(e).slice(0, 300) };
      }
      if (argFlag('debug') && i % 15 === 0) console.log(`[seed ${seed}] boot poll ${i}`, JSON.stringify(lastBoot));
      await sleep(200);
    }
    if (!booted) throw new Error('boot timeout: ' + JSON.stringify(lastBoot) + ' | console=' + JSON.stringify(cdp.consoleErrors.slice(0, 5)));
    await cdp.ev('localStorage.removeItem("hks.progress.v1")');

    /* --- 设定 EXTRA / reimu / 满火力 --- */
    const boot = await cdp.ev(`(() => {
      const g = window.__game;
      g.showTitle();
      g.unlockedExtra = true;
      g.inExtra = true;
      g.char = '${CHAR}';
      g.extraChar = '${CHAR}';
      g.lives = 50;
      g.carryPower = 64;      // POWER.max；Lv4 门槛 48
      g.continues = 0;
      g.musicOn = false;
      return { state: g.state, char: g.char, carryPower: g.carryPower, difficulty: g.difficulty };
    })()`);

    const botOk = await cdp.ev(`import('/tools/sim_bot.js?t=${Date.now()}').then(function(m){ return !!m.install({ god: ${GOD}, maxRetries: 10 }); })`);
    if (!botOk) throw new Error('sim_bot install failed');

    /* --- 裸血量口径：运行期摘掉 EXTRA 的逐卡 tuning（不改 src 文件） --- */
    let tuningBypass = null;
    if (NAKED) {
      tuningBypass = await cdp.ev(`import('/src/game/bossTuning.js').then(function (m) {
        var had = { remilia: !!m.BOSS_CARD_TUNING.remilia, flandre: !!m.BOSS_CARD_TUNING.flandre };
        delete m.BOSS_CARD_TUNING.remilia;
        delete m.BOSS_CARD_TUNING.flandre;
        return {
          had: had,
          off: m.cardTuningFor('remilia') === null && m.cardTuningFor('flandre') === null,
          keysLeft: Object.keys(m.BOSS_CARD_TUNING).length,
        };
      })`);
      if (!tuningBypass || !tuningBypass.off) throw new Error('bossTuning bypass failed: ' + JSON.stringify(tuningBypass));
      log('tuning 绕过（裸血量口径）', JSON.stringify(tuningBypass));
    } else {
      log('保留 bossTuning 逐卡表（最终口径）');
    }

    const start = await cdp.ev(`(() => {
      const g = window.__game;
      // 随机源由页面 URL 的 ?seed= 接管（src/main.js 的 mulberry32 + seedReset），
      // 这里只冻结墙钟，避免任何 Date.now 派生量（音乐/特效计时）影响逻辑帧。
      const T = 1700000000000 + ${seed};
      Date.now = function () { return T; };
      g._startExtraStage({ skipIntro: true });
      const s = g.stage, p = s && s.player;
      if (!s) return { err: 'no stage' };
      // 关掉 Boss 对话：EXTRA 的中途击破对话走 Promise.race(立绘加载, 1400ms 真实计时)，
      // 会把「真实时间」混进逻辑帧，导致同 seed 复跑结果漂移。跳过后道中/战斗逻辑不变。
      s.skipBossDialogue = true;
      // 停 rAF：渲染/粒子会消耗 Math.random，破坏复跑一致性
      try { g.loop.stop && g.loop.stop(); } catch (e) {}
      g.loop.paused = true;
      return {
        state: g.state, stageState: s.state, mode: s.mode, extra: !!s.extra,
        difficulty: s.difficulty, levelW: s.level.w, levelBoss: s.level.boss,
        power: p && p.power, fireLevel: p && p.fireLevel, lives: p && p.lives,
        loopRunning: !!(g.loop && g.loop.running),
      };
    })()`);
    if (!start || start.err) throw new Error('start extra failed: ' + JSON.stringify(start));
    log('起关 OK', JSON.stringify({ diff: start.difficulty, levelW: start.levelW, power: start.power, lv: start.fireLevel, mode: start.mode }));
    if (start.mode !== 'stg' || !start.extra) throw new Error('不是 EXTRA STG 关: ' + JSON.stringify(start));
    if (!(start.power >= 48)) throw new Error(`火力不足 Lv4: power=${start.power}`);

    await cdp.ev('(' + pageProbe.toString() + ')(' + JSON.stringify({ seed, cardTimeout: CARD_TIMEOUT }) + ')');

    /* --- 1) remilia（EXTRA 中途 Boss，2 张） --- */
    const rem = await cdp.ev(`(() => {
      const g = window.__game, s = g.stage;
      if (s.bossStarted) return { err: 'boss already started before remilia' };
      s.midbossDone = false;
      s.extraT = 120;                 // 时间轴 2:00
      s.stg.scroll = 165 * 120;       // 19800，与真实入场一致
      window.__HKS_BOSS_SEED = ${seed};
      s.beginBoss('remilia', { midboss: true });
      return window.__exProbe.arm('remilia', ${seed});
    })()`);
    if (!rem || rem.err) throw new Error('remilia beginBoss failed: ' + JSON.stringify(rem));
    log('remilia 开战', JSON.stringify({ spells: rem.spells, phaseHp: rem.phaseHp, spellMaxHp: rem.spellMaxHp, power: rem.playerPower, lv: rem.playerFireLevel, scroll: rem.scroll }));
    if (NAKED && rem.spellMaxHp !== 4277) {
      log('WARN remilia 首卡 spellMaxHp 与裸血量基线 4277 不符：', rem.spellMaxHp);
    }

    phases.remilia = await drivePhase(cdp, {
      label: 'remilia',
      maxFrames: 60 * 240,
      wallMs: WALL_MS,
      stopExpr: `window.__exProbe.cards.filter(c => c.bossKey === 'remilia').length >= 2 && !window.__game.stage.boss`,
    });
    log('remilia 完成', JSON.stringify({ stop: phases.remilia.bail || 'ok', frames: phases.remilia.frames, simSec: phases.remilia.simSec, cards: phases.remilia.cards }));

    /* --- 2) flandre（EXTRA 关底，10 张） --- */
    // 中途 Boss 击破会走一段对话（_onMidbossDefeated 之后），先让 bot 把对话按完、
    // 等 stage 回到 play，再把时间轴推到 3:00 并 beginBoss。
    const settled = await settleStage(cdp, 60 * 90);
    log('settle', JSON.stringify(settled));
    phases.flandre = await drivePhase(cdp, {
      label: 'flandre',
      maxFrames: 60 * 900,
      wallMs: WALL_MS,
      pre: `(() => {
        const g = window.__game, s = g.stage;
        // 中途 Boss 击破后 stage 回到 play；对话用 bot 自动确认推进
        if (g.dialogue && g.dialogue.active) return { retry: 'dialogue active' };
        if (g.state !== 'play' || s.state !== 'play') return { retry: 'state ' + g.state + '/' + s.state };
        if (s.boss && s.boss.state !== 'dead') return { err: 'remilia boss still alive', state: s.boss.state };
        s.midbossDone = true;
        s.extraT = 180;                             // 时间轴 3:00
        s.stg.scroll = Math.min(s.stg.bossTriggerScroll, 165 * 180); // 29700
        window.__HKS_BOSS_SEED = ${seed};
        s.beginBoss();
        return window.__exProbe.arm('flandre', ${seed});
      })()`,
      begin: 'flandre',
      stopExpr: `window.__exProbe.cards.filter(c => c.bossKey === 'flandre').length >= 10`,
    });
    log('flandre 完成', JSON.stringify({ stop: phases.flandre.bail || 'ok', frames: phases.flandre.frames, simSec: phases.flandre.simSec, cards: phases.flandre.cards }));

    const probe = await cdp.ev('window.__exProbe.export()');
    const flRun = probe.runs && probe.runs.find((r) => r.bossKey === 'flandre');
    if (NAKED && (!flRun || !flRun.phaseHp || flRun.phaseHp[0] !== 3190)) {
      log('WARN flandre 首卡 hp 与裸血量基线 3190 不符：', flRun && flRun.phaseHp && flRun.phaseHp[0]);
    }
    const wallMs = Date.now() - t0;
    return {
      seed, ok: true, wallMs, char: CHAR, god: GOD,
      boot, start,
      probe,
      phases,
      consoleErrors: cdp.consoleErrors.slice(0, 12),
      consoleWarnings: cdp.consoleWarnings.slice(0, 12),
    };
  } catch (e) {
    return {
      seed, ok: false, error: String((e && e.stack) || e), wallMs: Date.now() - t0,
      phases, consoleErrors: cdp.consoleErrors.slice(0, 12),
    };
  } finally {
    await closeRun(cdp);
  }
}

/**
 * 让 bot 继续推进，直到「关卡回到 play、没有 Boss、没有对话」。
 * 用于中途 Boss 击破后清对话，再手动开下一个 Boss。
 */
async function settleStage(cdp, maxFrames) {
  let frames = 0;
  let last = null;
  while (frames < maxFrames) {
    const res = await cdp.ev(`(() => {
      const g = window.__game, s = g.stage;
      const B = g.input && g.input.__simBot;
      const st0 = B ? B.steps : 0;
      if (B) B.run(${CHUNK});
      return {
        stepped: B ? B.steps - st0 : 0,
        gameState: g.state,
        stageState: s ? s.state : null,
        boss: !!(s && s.boss),
        bossState: s && s.boss ? s.boss.state : null,
        dialogue: !!(g.dialogue && g.dialogue.active),
        extraT: s ? Math.round(s.extraT * 10) / 10 : null,
        done: !!(g.state === 'play' && s && s.state === 'play' && !s.boss
          && !(g.dialogue && g.dialogue.active)),
      };
    })()`, 120000);
    last = res;
    frames += res.stepped || 0;
    if (res.done) return { ok: true, frames, ...res };
    if (!res.stepped) return { ok: false, reason: 'stalled', frames, ...res };
    if (res.gameState === 'gameover' || res.gameState === 'menu') {
      return { ok: false, reason: 'game state ' + res.gameState, frames, ...res };
    }
    // 时间轴若在 settle 期间自己推进到 3:00，会提前开 flandre（种子不对），直接判失败
    if (res.extraT > 179) return { ok: false, reason: 'timeline auto-boss', frames, ...res };
  }
  return { ok: false, reason: 'settle timeout', frames, ...last };
}

/**
 * 推进一个 Boss 阶段：bot.run 分块跑帧，页面内已在卡超时 180s 时强制打空。
 */
async function drivePhase(cdp, { label, maxFrames, wallMs, stopExpr, pre, begin }) {
  const t0 = Date.now();
  let frames = 0;
  let bail = null;
  let simSec = 0;
  let lastLog = 0;

  if (pre) {
    let tries = 0;
    let r = null;
    for (;;) {
      r = await cdp.ev(pre);
      if (r && r.retry && tries < 240) {
        if (tries === 0) console.log(`[${label}] pre 等待：${r.retry}`);
        // 对话/状态切换期间继续跑少量帧（bot 会自动按 confirm），再重试 pre
        await cdp.ev(`(() => {
          const g = window.__game;
          const B = g.input && g.input.__simBot;
          if (B) B.run(30);
          return { s: g.state };
        })()`, 60000);
        await sleep(40);
        tries++;
        frames += 30;
        continue;
      }
      break;
    }
    if (!r || r.err || r.retry) return { label, bail: 'pre: ' + JSON.stringify(r), frames, simSec, cards: [] };
    console.log(`[${label}] 开战`, JSON.stringify({ spells: r.spells, phaseHp: r.phaseHp, firstHp: r.spellMaxHp, power: r.playerPower, lv: r.playerFireLevel, scroll: r.scroll, extraT: r.extraT }));
  }

  while (frames < maxFrames) {
    if (Date.now() - t0 > wallMs) { bail = 'wall timeout'; break; }
    const n = Math.min(CHUNK, maxFrames - frames);
    const res = await cdp.ev(`(() => {
      const g = window.__game;
      const B = g.input && g.input.__simBot;
      const st0 = B ? B.steps : 0;
      if (B) B.run(${n});
      const sn = B ? B.snapshot() : null;
      const P = window.__exProbe;
      return {
        stepped: B ? B.steps - st0 : 0,
        stop: !!(B && B.stop),
        simSec: sn ? sn.simSec : 0,
        gameState: sn ? sn.state : g.state,
        stageState: g.stage && g.stage.state,
        boss: !!(g.stage && g.stage.boss),
        bossState: g.stage && g.stage.boss ? g.stage.boss.state : null,
        cards: P.cards.map((c) => ({ b: c.bossKey, i: c.index, s: c.seconds, to: c.timeout })),
        cur: P.cur ? { i: P.cur.index, b: P.cur.bossKey, elapsed: Math.round(P.cur.maxElapsed * 10) / 10 } : null,
        timeouts: P.timeouts.length,
        botErrors: sn ? (sn.errors || []).slice(0, 3) : [],
        deaths: sn ? sn.deaths : 0,
        gameovers: sn ? sn.gameovers : 0,
        maxBullets: sn ? sn.maxBullets : 0,
        done: (${stopExpr}),
      };
    })()`, 600000);

    frames += res.stepped || 0;
    simSec = res.simSec || simSec;
    if (res.botErrors && res.botErrors.length) { bail = 'bot errors: ' + res.botErrors.join(' | '); break; }
    if (res.done) break;
    if (res.stop) { bail = 'bot stopped'; break; }
    if (res.gameState === 'gameover' && res.gameovers > 0) { bail = 'gameover'; break; }
    if (res.gameState === 'menu' && frames > 300) { bail = 'back to menu'; break; }
    if ((res.stepped || 0) === 0) { bail = 'bot steps stalled'; break; }

    if (frames - lastLog >= CHUNK * 10) {
      lastLog = frames;
      console.log(`[${label}] ${Math.round(frames / 60)}s sim | cards=${res.cards.length} | cur=${JSON.stringify(res.cur)} | timeouts=${res.timeouts} | bullets=${res.maxBullets}`);
    }
  }

  const probe = await cdp.ev(`(() => {
    const P = window.__exProbe;
    return {
      cards: P.cards.filter(c => c.bossKey === ${JSON.stringify(begin || label)} || ${JSON.stringify(begin || label)} === null),
      allCards: P.cards.length,
      timeouts: P.timeouts,
      playerPower: window.__game.stage && window.__game.stage.player ? window.__game.stage.player.power : null,
      stageState: window.__game.stage && window.__game.stage.state,
      bossLeft: !!(window.__game.stage && window.__game.stage.boss),
    };
  })()`);
  return {
    label, bail, frames, simSec: +Number(simSec).toFixed(1), wallMs: Date.now() - t0,
    cards: probe.cards, timeouts: probe.timeouts,
    playerPowerEnd: probe.playerPower, stageState: probe.stageState, bossLeft: probe.bossLeft,
  };
}

/* ------------------------------------------------------------------ 汇总 */
function aggregate(runs) {
  const byKey = new Map();
  for (const run of runs) {
    if (!run || !run.ok || !run.probe) continue;
    for (const c of run.probe.cards || []) {
      const key = `${c.bossKey}:${c.index}`;
      if (!byKey.has(key)) byKey.set(key, { boss: c.bossKey, index: c.index, name: c.name, spellMaxHp: c.spellMaxHp, samples: [], details: [], ratios: [], limit: null, mode: null, timeEnded: 0 });
      const e = byKey.get(key);
      e.samples.push(c.seconds);
      if (c.limit != null) e.limit = c.limit;
      if (c.mode) e.mode = c.mode;
      if (c.timeEnded) e.timeEnded++;
      if (c.hpRemainingRatio != null) e.ratios.push(c.hpRemainingRatio);
      e.details.push({
        seed: run.seed, seconds: c.seconds, engine: c.engine, reason: c.reason,
        limit: c.limit, mode: c.mode, timeEnded: !!c.timeEnded, hpRemainingRatio: c.hpRemainingRatio,
        frames: c.frames, maxNoDmgSec: c.maxNoDmgSec,
        timeout: c.timeout, playerPowerEnd: c.playerPowerEnd,
      });
      if (c.spellMaxHp && c.spellMaxHp !== e.spellMaxHp) e.hpMismatch = [e.spellMaxHp, c.spellMaxHp];
    }
  }

  const cards = [];
  for (const exp of EXPECTED) {
    const got = byKey.get(`${exp.boss}:${exp.index}`);
    if (!got) {
      cards.push({
        boss: exp.boss, index: exp.index, name: exp.name, spellMaxHp: null,
        samples: [], meanSeconds: null, dps: null, timeout: true, missing: true,
        limit: null, mode: null, timeEnded: false, hpRemainingRatio: null,
      });
      continue;
    }
    const timeouts = got.details.filter((d) => d.timeout).length;
    const valid = got.details.filter((d) => !d.timeout).map((d) => d.seconds);
    const use = valid.length ? valid : got.samples;
    const mean = use.length ? use.reduce((a, b) => a + b, 0) / use.length : null;
    const sorted = [...got.samples].sort((a, b) => a - b);
    const median = sorted.length
      ? (sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : null;
    cards.push({
      boss: got.boss,
      index: got.index,
      name: got.name,
      spellMaxHp: got.spellMaxHp,
      samples: got.samples.map((s) => r2(s)),
      meanSeconds: mean == null ? null : r2(mean),
      dps: mean ? r1(got.spellMaxHp / r2(mean)) : null,   // 用输出里的 meanSeconds 反算，保证 JSON 自洽
      timeout: timeouts > 0,
      limit: got.limit,
      mode: got.mode,
      timeEnded: got.timeEnded > 0,
      hpRemainingRatio: got.ratios.length
        ? r2(got.ratios.reduce((a, b) => a + b, 0) / got.ratios.length)
        : null,
      hpRemainingRatios: got.ratios.map((v) => r2(v)),
      medianSeconds: median == null ? null : r2(median),
      minSeconds: sorted.length ? r2(sorted[0]) : null,
      maxSeconds: sorted.length ? r2(sorted[sorted.length - 1]) : null,
      nSamples: got.samples.length,
      spread: got.samples.length > 1 ? r2(Math.max(...got.samples) - Math.min(...got.samples)) : null,
      detail: got.details,
      ...(got.hpMismatch ? { hpMismatch: got.hpMismatch } : {}),
    });
  }
  return cards;
}

/* ------------------------------------------------------------------ main */
(async () => {
  console.log(`EXTRA 逐卡 DPS | url=${URL_BASE} | char=${CHAR} | god=${GOD} | seeds=${SEEDS.join(',')}`);
  console.log(`Edge=${EDGE}`);
  const runs = [];
  for (let i = 0; i < SEEDS.length; i++) {
    console.log(`\n===== seed ${SEEDS[i]} (${i + 1}/${SEEDS.length}) =====`);
    const r = await runSeed(SEEDS[i], i);
    runs.push(r);
    if (!r.ok) console.error(`[seed ${SEEDS[i]}] FAILED: ${r.error}`);
    else {
      console.log(`[seed ${SEEDS[i]}] 卡数=${r.probe.cards.length} 超时=${r.probe.timeouts.length} 墙钟=${(r.wallMs / 1000).toFixed(1)}s`);
      for (const c of r.probe.cards) {
        console.log(`  ${c.bossKey}#${c.index} ${c.name} hp=${c.spellMaxHp} limit=${c.limit == null ? '-' : c.limit} ${c.seconds}s ${c.timeout ? 'TIMEOUT' : ''} (${c.reason}, mode=${c.mode}, timeEnded=${c.timeEnded}, ratio=${c.hpRemainingRatio}, noDmgMax=${c.maxNoDmgSec}s)`);
      }
    }
  }

  const cards = aggregate(runs);
  const totalMean = cards.reduce((a, c) => a + (c.meanSeconds || 0), 0);
  const totalWall = runs.reduce((a, r) => a + (r.wallMs || 0), 0);
  const missing = cards.filter((c) => c.missing).map((c) => `${c.boss}:${c.index}`);
  const timeouts = cards.filter((c) => c.timeout).map((c) => `${c.boss}:${c.index}`);
  const out = {
    generatedAt: new Date().toISOString(),
    char: CHAR,
    god: GOD,
    powerLevel: 4,
    difficulty: 'EX',
    stage: 'extra',
    naked: NAKED,   // true = 运行期剥掉 bossTuning 的裸血量口径（诊断）；false = 当前游戏实际状态
    seeds: SEEDS,
    tool: 'tools/_ex_card_dps.mjs',
    url: URL_BASE,
    cardTimeoutSec: CARD_TIMEOUT,
    wallSeconds: +Number(totalWall / 1000).toFixed(1),
    totalMeanSeconds: +Number(totalMean).toFixed(1),
    missingCards: missing,
    timeoutCards: timeouts,
    cards,
    runs: runs.map((r) => ({
      seed: r.seed, ok: r.ok, wallSeconds: +Number((r.wallMs || 0) / 1000).toFixed(1),
      error: r.error || null,
      boot: r.boot || null,
      start: r.start
        ? { difficulty: r.start.difficulty, mode: r.start.mode, levelW: r.start.levelW, power: r.start.power, fireLevel: r.start.fireLevel, extra: r.start.extra }
        : null,
      phases: r.phases
        ? Object.fromEntries(Object.entries(r.phases).map(([k, v]) => [k, {
            bail: v.bail || null, simSec: v.simSec, frames: v.frames,
            playerPowerEnd: v.playerPowerEnd, stageState: v.stageState,
            cardSeconds: (v.cards || []).map((c) => ({ i: c.index, s: c.seconds, timeout: c.timeout, reason: c.reason })),
            timeouts: v.timeouts || [],
          }]))
        : null,
      probe: r.probe
        ? {
            cards: (r.probe.cards || []).map((c) => ({
              bossKey: c.bossKey, index: c.index, name: c.name, spellMaxHp: c.spellMaxHp,
              seconds: c.seconds, engine: c.engine, reason: c.reason, timeout: c.timeout,
              limit: c.limit, mode: c.mode, timeEnded: !!c.timeEnded, hpRemainingRatio: c.hpRemainingRatio,
              maxNoDmgSec: c.maxNoDmgSec, playerPowerEnd: c.playerPowerEnd,
            })),
            runs: r.probe.runs,
            timeouts: r.probe.timeouts,
            bot: r.probe.bot,
            playerEnd: r.probe.playerEnd,
            game: r.probe.game,
          }
        : null,
      consoleErrors: r.consoleErrors || [],
      consoleWarnings: r.consoleWarnings || [],
    })),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log('\n================ 汇总 ================');
  console.log('boss      #  name                          maxHp    samples(s)         mean     dps    timeout');
  for (const c of cards) {
    const name = (c.name || '').padEnd(28, ' ');
    const sm = c.samples.length ? c.samples.join(' / ') : '(missing)';
    console.log(`${c.boss.padEnd(9)} ${String(c.index).padEnd(2)} ${name} ${String(c.spellMaxHp ?? '-').padStart(6)}  ${sm.padEnd(17)} ${String(c.meanSeconds ?? '-').padStart(7)} ${String(c.dps ?? '-').padStart(7)}  ${c.timeout ? 'YES' : ''}`);
  }
  console.log(`总耗时(12 卡均值之和) = ${r2(totalMean)}s | 测量墙钟 = ${(totalWall / 1000).toFixed(1)}s | 缺卡 = ${missing.length ? missing.join(',') : '无'} | 超时 = ${timeouts.length ? timeouts.join(',') : '无'}`);
  console.log(`写出 ${OUT}`);
  if (missing.length) process.exit(3);
})().catch((e) => {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
