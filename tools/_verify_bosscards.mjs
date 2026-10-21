#!/usr/bin/env node
/**
 * verifier 独立复核 · Boss 逐符卡限时 / 生存 / 奖励 / HUD 验收（自包含 CDP，不改 src）
 *
 * 规格：docs/BOSS_TIMING_SPEC.md §1 目标时长表、§2 规则、§3.6 验证要求。
 *
 * 做什么：
 *  - 对每个 (阶段, 难度) 起一个 headless Edge，仅测终盘 Boss（传送到关底 + beginBoss，
 *    道中不计入），注入 tools/sim_bot.js 自动玩家（god 模式，满火力）。
 *  - 页面内探针每个逻辑帧采样 boss.card* / hudState / DOM HUD，并挂 stage._onBossCardResult
 *    与 boss.update(opts.onCardResult) 双重钩子（任一未落地都能报出来）。
 *  - 采集每张卡：{stage,boss,index,name,mode,limit,startT,endT,elapsed,ok,reward,hpAtEnd,
 *    bossState,immune,autoAdvance,hudText,hudFill,banner,before/after power/lives/extend}
 *  - 逐卡对比 §1 目标时长（Normal ±15%；E/H 同时给「按 hpScale 归一化」口径，
 *    因为规则 9 说血量按 hpScale 缩放 → 时长本来就该随之缩放）。
 *  - 截图：darkSpot 黑暗聚光卡（莉格露第 3 卡 mid-card）、damage HUD 计时、
 *    survival HUD 计时（SURVIVE 标记）、超时 HUD（T 测试跑）。
 *  - 输出 _pt/bosscards_s<N>_<diff>.json（每跑一份）+ _pt/bosscards_summary.json（汇总）
 *    + _pt/bosscards_table.md（原始表，写 docs/BOSS_TIMING_VERIFY.md 用）。
 *
 * 用法（本地静态服务器已在 http://127.0.0.1:8141/）：
 *   node tools/_verify_bosscards.mjs                        # 默认计划 N:1-6;E:1,4;H:2,3;T:1;D:1
 *   node tools/_verify_bosscards.mjs --plan "N:1"           # 冒烟：只跑 1 面 Normal
 *   node tools/_verify_bosscards.mjs --plan "N:1-6" --noShots
 *   node tools/_verify_bosscards.mjs --url http://127.0.0.1:8141/index.html --port 9150
 *
 * 计划语法：`N:1-6` / `E:1,4` / `H:2,3` / `T:1`（T = Normal 的奖励/计时/死亡不重置 测试跑），
 * 分隔符 `;` 或 `,` 分组之间用 `;`。--diffPlan 兼容旧名。
 *
 * 口径备注：
 *  - 卡时长以 boss.cardElapsed 为准（规格 §3.2 暴露字段），并要求与 HUD 文本一致；
 *  - E/H 的 damage 卡血量 = limit×dps×hpScale，所以时长天然 ≈ limit×hpScale；
 *    归一化判定 = elapsed / hpScale 与 limit 比 ±15%，原始偏差单独列出（不算 FAIL）。
 *  - god 模式 bot 不落命；死亡不重置计时由 T 跑显式触发 stage death 验证。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

/* ------------------------------------------------------------------ CLI */
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
const W = 1280, H = 720;
const URL_BASE = argv.url || 'http://127.0.0.1:8141/index.html';
const PORT_BASE = Number(argv.port || 9150);
const CHAR = String(argv.char || 'reimu');
const GOD = argv.god !== '0';
const PAUSE_LOOP = argv.pauseLoop !== '0';
const SEED = argv.seed === '0' ? 0 : Number(argv.seed || 12345);
const CHUNK = Math.max(60, Number(argv.chunk || 600));
const MAX_STEPS = Number(argv.maxSteps || 0);          // 0 = 自动按计划时长推算
const WALL_MS = Number(argv.wallMs || 600000);         // 单跑墙钟上限
const OUT_DIR = resolve(argv.outDir || '_pt');
const SHOT_DIR = resolve(argv.shotDir || join('_pt', 'shots'));
const DO_SHOTS = argv.noShots !== '1';
const OVERRUN_ABORT = argv.overrunAbort === undefined ? 2.2 : Number(argv.overrunAbort);
const CDP_TIMEOUT = Number(argv.timeout || 120000);
const RESUME = argv.resume === '1';
const PLAN = String(argv.plan || argv.diffPlan || 'N:1-6;E:1,4;H:2,3;T:1;D:1');
// 整关跑：这些面不传送/不强开 Boss，让 bot 正常打道中到 Boss（stg 关 force-boss 站位失真时用）
const FULL_RUN = parseStageList(argv.fullRun || '');
const PLAYER_POWER = Number(argv.power || 128);          // 开局火力（模拟正常玩家：死一次后 respawnKeep=0.5 → 32=Lv3）
const DPS_ORACLE = Number(argv.dpsOracle || 200);        // 血量公式的基准 DPS（calibration 前后不同）
// 2026-10-21 口径变更：血量按「满火力实测 ×0.76」重算后，满火力 bot 应在 0.80×limit 击破，
// 而不是贴到 1.00×limit。判定口径（ratio = elapsed / limit）：
//   ratio > 0.95（TARGET+0.15）→ FAIL：余量不足 5%，正常玩家一旦失手就超时；
//   ratio < 0.65（TARGET-0.15）→ WARN：打得太快（bot 噪声 / 血量被过度下调），不算失败。
const TARGET_RATIO = Number(argv.targetRatio || 0.8);
const TIMING_HI = TARGET_RATIO + 0.15;
const TIMING_LO = TARGET_RATIO - 0.15;
const nearTarget = (r) => r != null && r >= TIMING_LO && r <= TIMING_HI;
const HPSCALE_MODE = String(argv.hpScaleMode || 'auto'); // auto|applied|none：血量是否按难度 hpScale 缩放

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const pad = (n) => String(n).padStart(2, '0');

/* --------------------------------------------------- 规格 §1 目标时长（独立 oracle，不从 src 抄） */
const HP_SCALE = { E: 0.85, N: 1, H: 1.15, L: 1.3 };
const STAGE_BOSS = { 1: 'rumia', 2: 'wriggle', 3: 'cirno', 4: 'aya', 5: 'yuyuko', 6: 'kaguya' };
const SPEC_CARDS = {
  1: [
    { name: '宵暗「月之暗面」', mode: 'damage', limit: 50, fx: '深色氛围', note: '黑暗氛围' },
    { name: '暗符「黑暗吞噬」', mode: 'damage', limit: 60, fx: 'night', note: '黑暗吞噬氛围' },
  ],
  2: [
    { name: '灯符「萤火虫现象」', mode: 'damage', limit: 60 },
    { name: '蠢符「小虫风暴」', mode: 'damage', limit: 105 },
    { name: '隐虫「萤火虫之夜」', mode: 'damage', limit: 90, fx: 'darkSpot', darkSpot: true },
  ],
  3: [
    { name: '冰符「冰柱落下」', mode: 'damage', limit: 30 },
    { name: '雹符「冰雹风暴」', mode: 'damage', limit: 120 },
    { name: '冻符「完美冻结」', mode: 'damage', limit: 90 },
    { name: '雪符「钻石风暴」', mode: 'damage', limit: 99 },
  ],
  4: [
    { name: '风符「风神一扇」', mode: 'damage', limit: 66 },
    { name: '疾风「风神少女」', mode: 'survival', limit: 30 },
    { name: '岐符「天之八衢」', mode: 'damage', limit: 90 },
    { name: '风神「天狗颪」', mode: 'damage', limit: 90 },
    { name: '「幻想风靡」', mode: 'survival', limit: 180 },
  ],
  5: [
    { name: '幽雅「死出诱蛾灯」', mode: 'damage', limit: 50 },
    { name: '蝶符「花之舞」', mode: 'damage', limit: 60 },
    { name: '蝶符「死蝶之华尔兹」', mode: 'damage', limit: 150 },
    { name: '亡乡「亡我乡 -宿罪-」', mode: 'survival', limit: 44 },
    { name: '冥符「常夜樱」', mode: 'damage', limit: 120 },
    { name: '反魂蝶「八分咲」', mode: 'damage', limit: 180 },
  ],
  6: [
    { name: '难题「龙颈之玉 -五色的弹丸-」', mode: 'survival', limit: 60 },
    { name: '神宝「耀眼的龙玉」', mode: 'damage', limit: 99 },
    { name: '难题「佛御石之钵 -不碎的意志-」', mode: 'damage', limit: 120 },
    { name: '神宝「佛体的金刚石」', mode: 'damage', limit: 180 },
    { name: '难题「火鼠的皮衣 -不焦躁的内心-」', mode: 'damage', limit: 360 },
    { name: '神宝「火蜥蜴之盾」', mode: 'damage', limit: 240 },
    { name: '难题「燕的子安贝 -永命线-」', mode: 'damage', limit: 300 },
    { name: '神宝「蓬莱的玉枝 -梦色之乡-」', mode: 'survival', limit: 66 },
  ],
};
const normName = (s) => String(s || '').replace(/[\s\u3000「」『』·・\-—－]/g, '');

/* ------------------------------------------------------------------ 计划解析 */
function parseStageList(s) {
  const out = [];
  for (const part of String(s).split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) { for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i); }
    else if (/^\d+$/.test(p)) out.push(Number(p));
  }
  return out;
}
function parsePlan(plan) {
  const runs = [];
  for (const grp of String(plan).split(';')) {
    const g = grp.trim();
    if (!g) continue;
    const m = g.match(/^([A-Za-z]+)\s*:\s*(.+)$/);
    if (!m) continue;
    const tag = m[1].toUpperCase();
    const stages = parseStageList(m[2]);
    for (const stage of stages) {
      if (tag === 'T') {
        runs.push({
          tag: 'T', diff: 'N', stage, test: true, full: FULL_RUN.includes(stage),
          startPower: 128,
          deathTest: false,
          mutateCard: Number(argv.mutateCard || 1), mutateMul: Number(argv.mutateMul || 1.6),
          // 结算瞬间人为构造奖励分支条件（+POWER / 跨 99 换命），结算后恢复满火力以免影响后续卡时长
          manip: [
            { index: 0, power: 0, extend: 90, restorePower: null },
            { index: 1, extend: 94 },
          ],
        });
      } else if (tag === 'D') {
        runs.push({
          tag: 'D', diff: 'N', stage, test: true, full: FULL_RUN.includes(stage),
          startPower: 128,
          deathTest: true, deathAt: Number(argv.deathAt || 15),
          restorePowerOnRespawn: true,
          mutateCard: null, mutateMul: 1,
        });
      } else {
        runs.push({ tag, diff: tag, stage, test: false, startPower: PLAYER_POWER, deathTest: false, full: FULL_RUN.includes(stage) });
      }
    }
  }
  return runs;
}
const RUNS = parsePlan(PLAN);
const RUN_FILE = (r) => join(OUT_DIR, `bosscards_s${r.stage}_${r.diff}${r.tag === 'T' ? '_rewardtest' : r.tag === 'D' ? '_deathtest' : ''}.json`);

/* ------------------------------------------------------------------ 进程卫生 */
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

/* --------------------------------------------------- 页面探针（在浏览器里跑，字符串化注入） */
function probeClient(cfg) {
  const g = window.__game;
  const vc = window.__vc = {
    cfg,
    t: 0, frames: 0, bossKey: null,
    cards: [], results: [], fallbacks: [], events: [], banners: [],
    captures: [], captured: [], cfgMissing: [],
    progress: { card: null, elapsed: 0, mode: null, lock: 0, bossState: null, stageState: null },
    deathTest: null, mutation: null, overrun: null,
    stageClearT: null, bossDefeatT: null,
    errors: [], warnings: [], catches: [],
    playerEnd: null, stageEnd: null, hudLive: null,
  };
  let stageObj = null;
  let bossObj = null;
  let lastResObj = null;
  let cur = null;
  let attached = false;
  const wrapped = new WeakSet();

  const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null); // 页面内自给（函数被字符串化注入）
  const dbg = (e) => { try { vc.errors.push(String((e && e.stack) || e).slice(0, 400)); } catch (_) {} };
  const clone = (v) => { try { return v == null ? v : JSON.parse(JSON.stringify(v)); } catch (_) { return null; } };
  const el = (id) => { try { return document.getElementById(id); } catch (_) { return null; } };
  const domText = (id) => { const e = el(id); return e ? (e.textContent || '') : null; };
  const hudCardText = () => domText('bossCardText');
  const hudCardMode = () => { const e = el('bossCardMode'); return e && !e.classList.contains('hidden') ? (e.textContent || '') : null; };
  const hudTimerClass = () => { const e = el('bossCardTimer'); return e ? e.className : null; };
  const hudFillPct = () => {
    const e = el('bossFill');
    if (!e) return null;
    const w = e.style && e.style.width;
    if (w && w.endsWith('%')) return parseFloat(w);
    const bar = el('bossBar');
    try {
      if (bar) {
        const br = bar.getBoundingClientRect();
        const r = e.getBoundingClientRect();
        if (br.width > 0) return Math.round((r.width / br.width) * 1000) / 10;
      }
    } catch (_) {}
    return null;
  };
  const bannerText = () => domText('banner');

  function attachStage(s) {
    // Boss 战 RNG 与道中随机数消耗解耦：Boss 构造前重播固定 LCG，
    // 否则道中 POWER/掉落等改动会改变 Math.random 序列位置，
    // 进而换掉 boss.battleSeq，使同一张卡实测 DPS 漂移数个百分点。
    if (typeof s.beginBoss === 'function' && !s.__vcBeginBossWrapped) {
      s.__vcBeginBossWrapped = true;
      const origBeginBoss = s.beginBoss.bind(s);
      s.beginBoss = function () {
        try {
          let st = (Number(cfg.seed) >>> 0) || 1;
          Math.random = function () { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
        } catch (e) { dbg(e); }
        return origBeginBoss.apply(this, arguments);
      };
    }
    if (!s || stageObj === s) return;
    stageObj = s;
    if (attached) return;
    attached = true;
    const origEv = s.onEvent;
    s.onEvent = function (type, data) {
      let out;
      try {
        out = origEv ? origEv.call(this, type, data) : undefined;
      } catch (e) { dbg(e); }
      try {
        if (type === 'cardResult') {
          const d = clone(data);
          vc.events.push({ t: +vc.t.toFixed(2), type, d, banner: bannerText() });
          vc.banners.push({ t: +vc.t.toFixed(2), kind: 'cardResult', banner: bannerText(), reward: d && d.reward });
        } else if (/^(extend|clear|death|respawn|gameover|bossStart|bossPhase)$/.test(type)) {
          vc.events.push({ t: +vc.t.toFixed(2), type, d: clone(data) });
          if (type === 'extend' || type === 'death' || type === 'respawn') {
            vc.banners.push({ t: +vc.t.toFixed(2), kind: type, banner: bannerText() });
          }
          if (type === 'respawn' && vc.deathTest && !vc.deathTest.respawned) {
            vc.deathTest.respawned = true;
            vc.deathTest.respawnT = +vc.t.toFixed(2);
            const b = stageObj && stageObj.boss;
            const p = stageObj && stageObj.player;
            if (b) {
              vc.deathTest.cardAfter = b.spellIdx + 1;
              vc.deathTest.elapsedAfterRespawn = Number(b.cardElapsed.toFixed(2));
            }
            if (p) { vc.deathTest.powerAfterDeath = p.power; vc.deathTest.livesAfterDeath = p.lives; }
            // 复位到 Boss 身边继续测（harness 便利，不影响计时口径）
            try {
              if (b && p) {
                p.x = Math.max(0, b.x - 150); p.y = 0; p.vy = 0; p.vx = 0;
                if (stageObj.camera && stageObj.camera.snapTo) stageObj.camera.snapTo(p.x + p.w / 2);
                vc.deathTest.rescuedToBoss = true;
                if (cfg.restorePowerOnRespawn) {
                  p.power = p.maxPower;
                  vc.deathTest.restoredPower = p.power;
                }
              }
            } catch (e) { dbg(e); }
          }
        }
      } catch (e) { dbg(e); }
      return out;
    };
    if (typeof s._onBossCardResult === 'function') {
      const orig = s._onBossCardResult.bind(s);
      s._onBossCardResult = function (res) {
        const p = this.player;
        // T 跑：结算瞬间人为构造奖励分支条件（仅测试跑）
        let manip = null;
        if (cfg.test && Array.isArray(cfg.manip) && res) {
          manip = cfg.manip.filter(function (m) { return m && m.index === res.index; })[0] || null;
          if (manip && p) {
            try {
              if (Number.isFinite(manip.power)) p.power = manip.power;
              if (Number.isFinite(manip.extend)) this.extendPts = manip.extend;
            } catch (e) { dbg(e); }
          }
        }
        const before = p ? { power: p.power, maxPower: p.maxPower, lives: p.lives, extendPts: this.extendPts || 0 } : null;
        let ret = null, err = null;
        try { ret = orig(res); } catch (e) { err = String(e); dbg(e); }
        const after = p ? { power: p.power, lives: p.lives, extendPts: this.extendPts || 0 } : null;
        if (manip && 'restorePower' in manip && p) {
          try { p.power = manip.restorePower == null ? p.maxPower : Math.min(p.maxPower, manip.restorePower); } catch (e) { dbg(e); }
        }
        vc.results.push({
          t: +vc.t.toFixed(2), src: 'stage', res: clone(res), before, after, err, banner: bannerText(),
          manip: manip ? { power: manip.power, extend: manip.extend, restorePower: manip.restorePower } : null,
        });
        return ret;
      };
    } else {
      vc.cfgMissing.push('stage._onBossCardResult');
    }
  }

  function wrapBoss(b) {
    if (!b || wrapped.has(b)) return;
    wrapped.add(b);
    const orig = b.update.bind(b);
    b.update = function (dt, p, bullets, fx, opts) {
      const o = opts || {};
      const prev = o.onCardResult;
      o.onCardResult = function (res) {
        vc.fallbacks.push({ t: +vc.t.toFixed(2), src: 'bossOpts', res: clone(res) });
        return prev ? prev(res) : undefined;
      };
      return orig(dt, p, bullets, fx, o);
    };
  }

  function closeCard() {
    const c = cur;
    if (!c || c.ended) return;
    c.ended = true;
    c.endedT = +vc.t.toFixed(2);
    const matched = vc.results.find((r) => r.res && r.res.index === c.idx && !r.__used);
    if (matched) {
      matched.__used = true;
      c.result = matched.res;
      c.rewardMeta = { before: matched.before, after: matched.after, banner: matched.banner, err: matched.err, t: matched.t, src: matched.src };
    }
    if (!c.result) {
      const fb = vc.fallbacks.find((r) => r.res && r.res.index === c.idx && !r.__used);
      if (fb) { fb.__used = true; c.result = fb.res; c.rewardMeta = { src: fb.src }; }
    }
    c.elapsed = c.result && Number.isFinite(Number(c.result.elapsed)) ? Number(c.result.elapsed) : Math.max(c.lastElapsed, c.elapsedMax);
    c.dmg = Math.max(0, Math.round(c.bossHpStart - c.bossHpMin));
    c.immune = c.mode === 'survival' ? c.dmg === 0 : null;
    c.wallSpan = r2(c.endedT - (c.startedT == null ? c.endedT : c.startedT));
    c.bossStateAtEnd = bossObj ? bossObj.state : null;
    c.resultCount = vc.results.filter((r) => r.res && r.res.index === c.idx).length;
    c.fallbackCount = vc.fallbacks.filter((r) => r.res && r.res.index === c.idx).length;
    vc.cards.push(c);
    cur = null;
  }

  function newCard(b, idx) {
    const c = {
      bossRef: b,
      idx,
      index1: idx + 1,
      name: b.spellName,
      mode: b.mode,
      limit: b.cardLimit,
      fx: b.cardFx,
      effect: b.cardEffect,
      accent: b.cardAccent,
      spellMaxHp: b.spellMaxHp,
      bossHpStart: b.hp,
      bossHpMin: b.hp,
      lockFrames: 0,
      lockViolation: false,
      startedT: null,
      elapsedMax: 0,
      lastElapsed: 0,
      ratioMin: 1,
      ratioMax: 0,
      hud1: null, hud1At: null, hud1Mode: null,
      hudMid: null, hudMidAt: null, hudFill: null,
      hudLast: null, hudFillLast: null,
      overtimeText: null, overtimeAt: null,
      hudTimerClass: null,
      startedElapsed: null,
      endT: null, endedT: null,
      ended: false, result: null, rewardMeta: null, dmg: 0,
      mutation: null,
    };
    cur = c;
    // 强制超时测试：把目标卡血条放大 → 必须打空后才切卡，用于验证「超时失败奖励 +10 点」
    if (cfg.test && cfg.mutateCard != null && idx === cfg.mutateCard && !vc.mutation) {
      const oldMax = b.spellMaxHp;
      b.spellMaxHp = Math.max(1, Math.round(oldMax * cfg.mutateMul));
      b.spellHp = b.spellMaxHp;
      b.hp += b.spellMaxHp - oldMax;
      c.spellMaxHp = b.spellMaxHp;
      c.mutation = { card: idx + 1, mul: cfg.mutateMul, oldMax, newMax: b.spellMaxHp };
      vc.mutation = c.mutation;
    }
    return c;
  }

  function capPos(s) {
    try {
      const p2 = s.player;
      const cam = s.camera && s.camera.viewAt ? s.camera.viewAt(1) : (s.camera && s.camera.view);
      if (!p2 || !cam) return {};
      return { px: r2(p2.x - cam.x), py: r2(p2.y - cam.y) };
    } catch (e) { return {}; }
  }

  function sample(s) {
    if (s.state === 'clear' && vc.stageClearT == null) vc.stageClearT = +vc.t.toFixed(2);
    const b = s.boss;
    if (!b) { vc.progress.stageState = s.state; return; }
    if (b !== bossObj) {
      bossObj = b; vc.bossKey = b.key || null; wrapBoss(b);
      try {
        vc.bossInfo = {
          key: b.key || null, maxHp: b.maxHp, mode: s.mode, t: +vc.t.toFixed(2),
          phases: (b.phases || []).map(function (x) {
            return { name: x.name, hp: x.hp, mode: x.mode || 'damage', limit: x.limit != null ? x.limit : null,
              fx: x.fx != null ? x.fx : null, effect: x.effect != null ? x.effect : null };
          }),
          difficulty: (g && g.difficulty) || null, stageMode: s.mode,
        };
      } catch (e) { dbg(e); }
    }
    const idx = (b.spellIdx | 0);
    if (cur && cur.idx !== idx) closeCard();
    // Boss 已进入 defeat/dead：只收尾，绝不再造新卡（否则每帧都会新建一张假卡）
    if (b.state === 'defeat' || b.state === 'dead') {
      if (cur) closeCard();
      if (b.state === 'defeat' && vc.bossDefeatT == null) vc.bossDefeatT = +vc.t.toFixed(2);
      vc.progress = { card: null, elapsed: r2(b.cardElapsed), mode: b.mode, lock: 0, bossState: b.state, stageState: s.state, bossKey: vc.bossKey };
      if (s.player) vc.playerEnd = { power: s.player.power, maxPower: s.player.maxPower, lives: s.player.lives, extendPts: s.extendPts || 0 };
      vc.stageEnd = { state: s.state, name: (s.level && s.level.name) || null, mode: s.mode, boss: vc.bossKey };
      return;
    }
    if (b.state !== 'battle') {
      vc.progress = { card: cur ? cur.index1 : null, elapsed: r2(b.cardElapsed), mode: b.mode, lock: r2(b.spellLock), bossState: b.state, stageState: s.state, bossKey: vc.bossKey };
      return;
    }
    if (!cur) {
      if (vc.cards.length > 64) return; // 防呆：异常情况下也不无限造卡
      newCard(b, idx);
    }
    const c = cur;

    // lastCardResult 兜底（stage 没接回调时也能抓到结算）
    if (b.lastCardResult && b.lastCardResult !== lastResObj) {
      lastResObj = b.lastCardResult;
      vc.fallbacks.push({ t: +vc.t.toFixed(2), src: 'lastCardResult', res: clone(b.lastCardResult) });
    }

    vc.progress = {
      card: c.index1, elapsed: r2(b.cardElapsed), mode: b.mode, lock: r2(b.spellLock),
      bossState: b.state, stageState: s.state, bossKey: vc.bossKey,
    };

    if (b.state === 'battle') {
      if (b.spellLock > 0) {
        if (c.startedElapsed == null) c.lockFrames++;
        if (c.lockElapsedRef == null) c.lockElapsedRef = b.cardElapsed;
        else if (Math.abs(b.cardElapsed - c.lockElapsedRef) > 1e-6) c.lockViolation = true;
      } else {
        if (c.startedT == null) { c.startedT = +vc.t.toFixed(2); c.startedElapsed = +b.cardElapsed.toFixed(3); }
        if (c.lockElapsedRef != null) { c.lockEndElapsed = +b.cardElapsed.toFixed(3); c.lockElapsedRef = null; }
      }
      c.lastElapsed = b.cardElapsed;
      c.elapsedMax = Math.max(c.elapsedMax, b.cardElapsed);
      c.ratioMin = Math.min(c.ratioMin, b.cardRatio);
      c.ratioMax = Math.max(c.ratioMax, b.cardRatio);
      c.bossHpMin = Math.min(c.bossHpMin, b.hp);

      if (!c.hud1 && b.cardElapsed >= 1.0) {
        c.hud1 = hudCardText(); c.hud1At = r2(b.cardElapsed); c.hud1Mode = hudCardMode();
      }
      if (!c.hudMid && c.limit && b.cardElapsed >= c.limit * 0.5) {
        c.hudMid = hudCardText(); c.hudMidAt = r2(b.cardElapsed); c.hudFill = hudFillPct();
        c.hudTimerClass = hudTimerClass();
      }
      if (vc.frames % 10 === 0) { c.hudLast = hudCardText(); c.hudFillLast = hudFillPct(); c.hudTimerClass = hudTimerClass(); }
      if (!c.overtimeText && c.mode === 'damage' && c.limit && b.cardElapsed > c.limit + 0.01) {
        c.overtimeText = hudCardText(); c.overtimeAt = r2(b.cardElapsed);
      }

      // ---- 截图申请（Main loop 负责真正抓图）----
      const want = (id) => !vc.captured.includes(id) && !vc.captures.some((x) => x.id === id);
      if (c.fx === 'darkSpot' && want('dark') && b.cardElapsed >= Math.min(20, Math.max(4, c.limit * 0.35))) {
        vc.captures.push({ id: 'dark', label: 'dark_s' + cfg.stage + '_' + cfg.diff, card: c.index1, elapsed: r2(b.cardElapsed), fx: c.fx, ...capPos(s) });
      }
      if (wouldCaptureDamage(c, b) && want('hud_damage')) {
        vc.captures.push({ id: 'hud_damage', label: 'hud_damage_s' + cfg.stage + '_' + cfg.diff, card: c.index1, elapsed: r2(b.cardElapsed) });
      }
      if (c.mode === 'survival' && want('hud_survival') && b.cardElapsed >= Math.min(12, Math.max(4, c.limit * 0.45))) {
        vc.captures.push({ id: 'hud_survival', label: 'hud_survival_s' + cfg.stage + '_' + cfg.diff, card: c.index1, elapsed: r2(b.cardElapsed) });
      }
      if (c.mode === 'damage' && c.limit && b.cardElapsed > c.limit + 1 && want('hud_overtime')) {
        vc.captures.push({ id: 'hud_overtime', label: 'hud_overtime_s' + cfg.stage + '_' + cfg.diff, card: c.index1, elapsed: r2(b.cardElapsed) });
      }

      // ---- 超时保护：明显超出目标时长（且非刻意放大）时提前收工，避免白等 ----
      if (!c.mutation && cfg.overrunAbort > 0 && c.mode === 'damage' && c.limit &&
        b.cardElapsed > c.limit * cfg.overrunAbort && !vc.overrun) {
        vc.overrun = { card: c.index1, elapsed: r2(b.cardElapsed), limit: c.limit, ratio: r2(b.cardElapsed / c.limit) };
      }

      // ---- 死亡不重置计时测试（T 跑）----
      if (cfg.deathTest && !vc.deathTest && c.mode === 'damage' && b.cardElapsed >= cfg.deathAt && b.cardElapsed < cfg.deathAt + 3) {
        const p = s.player;
        vc.deathTest = {
          card: c.index1, t: +vc.t.toFixed(2), at: r2(b.cardElapsed),
          elapsedBeforeDeath: Number(b.cardElapsed.toFixed(2)),
          power0: p ? p.power : null, lives0: p ? p.lives : null,
          respawned: false, error: null,
        };
        try {
          if (p && p.setCheckpoint) p.setCheckpoint(p.x, p.y);
        } catch (e) { dbg(e); }
        try {
          s._onPlayerEvent({ type: 'die', x: p ? p.x : 0, y: p ? p.y : 0 });
        } catch (e) { vc.deathTest.error = String(e); dbg(e); }
      }
    }

    // 最后一张卡结算后应进 defeat（记录，不干预）
    if (b.state === 'defeat') {
      if (vc.bossDefeatT == null) vc.bossDefeatT = +vc.t.toFixed(2);
      if (cur) closeCard();
    } else if (b.state === 'dead' && cur) {
      closeCard();
    }

    if (s.player) {
      vc.playerEnd = {
        power: s.player.power, maxPower: s.player.maxPower, lives: s.player.lives,
        extendPts: s.extendPts || 0,
      };
    }
    vc.stageEnd = { state: s.state, name: (s.level && s.level.name) || null, mode: s.mode, boss: vc.bossKey };
  }

  function wouldCaptureDamage(c, b) {
    if (c.mode !== 'damage' || !c.limit || c.limit < 20) return false;
    const lo = Math.min(30, c.limit * 0.4);
    return b.cardElapsed >= Math.max(4, lo) && b.cardElapsed <= c.limit * 0.92;
  }

  const origUpdate = g.update.bind(g);
  g.update = function (dt) {
    vc.t += dt;
    vc.frames++;
    const s = this.stage;
    if (s) attachStage(s);
    try { origUpdate(dt); } catch (e) { dbg(e); }
    const s2 = this.stage;
    if (!s2) return;
    try { sample(s2); } catch (e) { dbg(e); }
  };

  // 每帧读 HUD（hud.update 在 stage.update 之后、同一 g.update 内，本钩子在其后 → 读到本帧值）
  vc.finalize = function () { try { if (cur) closeCard(); } catch (e) { dbg(e); } };
  vc.readHud = function () {
    vc.hudLive = {
      cardText: hudCardText(), cardMode: hudCardMode(), timerClass: hudTimerClass(), fill: hudFillPct(),
      bossName: domText('bossName'), bossPhase: domText('bossPhase'), timer: domText('timer'),
      power: domText('powerNum'), lives: domText('lives'), extend: domText('extendNum'), banner: bannerText(),
    };
    return vc.hudLive;
  };
  vc.exportState = function () {
    return {
      t: r2(vc.t), frames: vc.frames, bossKey: vc.bossKey, bossInfo: vc.bossInfo,
      cards: vc.cards, results: vc.results, fallbacks: vc.fallbacks,
      events: vc.events, banners: vc.banners,
      captured: vc.captured, cfgMissing: vc.cfgMissing,
      deathTest: vc.deathTest, mutation: vc.mutation, overrun: vc.overrun,
      stageClearT: vc.stageClearT, bossDefeatT: vc.bossDefeatT,
      errors: vc.errors, warnings: vc.warnings, catches: vc.catches,
      playerEnd: vc.playerEnd, stageEnd: vc.stageEnd, hudLive: vc.hudLive,
      progress: vc.progress, captures: vc.captures,
      powerCfg: vc.powerCfg || (typeof window !== 'undefined' ? window.__vcPowerCfg : null) || null,
    };
  };
  return true;
}

/* ---------------------------------------------------------------- 单跑 */
async function runOne(run, runIndex) {
  const port = PORT_BASE + runIndex;
  const profile = mkdtempSync(join(tmpdir(), 'edge-bc-'));
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
    `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  proc.on('error', () => {});
  const entry = { pid: proc.pid, owner: process.pid, port, profile, at: Date.now() };
  registry.list.push(entry);
  saveRegistry();

  const consoleErrors = [];
  const consoleWarnings = [];
  let ws = null;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { ws && ws.close(); } catch {}
    killTree(proc.pid);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 2 }); } catch {}
    registry.list = registry.list.filter((e) => e !== entry);
    saveRegistry();
  };

  const t0 = Date.now();
  const shots = [];
  const shotInfo = [];
  try {
    // --- CDP 连接 ---
    let page = null;
    for (let i = 0; i < 120; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json();
        page = list.find((t) => t.type === 'page');
        if (page) break;
      } catch {}
      await sleep(250);
    }
    if (!page) throw new Error(`no target on port ${port}`);
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        consoleErrors.push(((d.text || '') + ' ' + ((d.exception && d.exception.description) || '')).slice(0, 600));
      }
      if (m.method === 'Runtime.consoleAPICalled') {
        const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600);
        if (m.params.type === 'error') consoleErrors.push(txt);
        else if (m.params.type === 'warning') consoleWarnings.push(txt);
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
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(((d.text || '') + ' ' + ((d.exception && d.exception.description) || '')).slice(0, 800));
      }
      return r.result ? r.result.value : undefined;
    };
    const shoot = async (label, meta) => {
      await evaluate('window.__game.render(1)');
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const p = join(SHOT_DIR, label + '.png');
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, Buffer.from(r.data, 'base64'));
      shots.push(p);
      shotInfo.push(Object.assign({ label: label, path: p }, meta || {}));
      return p;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${URL_BASE}?verify=${Date.now()}` });
    const waitBoot = async (attempts) => {
      for (let i = 0; i < attempts; i++) {
        try {
          const st = await evaluate('({ game: !!(window.__game && window.__game.input), ready: document.readyState, title: document.title })');
          if (st && st.game) return true;
        } catch {}
        await sleep(200);
      }
      return false;
    };
    let booted = await waitBoot(250);
    if (!booted) {
      // 一次重试：部分机器上首个 target 是 about:blank，重新导航可恢复
      try { await send('Page.navigate', { url: `${URL_BASE}?verify=${Date.now()}&retry=1` }); } catch {}
      booted = await waitBoot(250);
    }
    if (!booted) throw new Error('boot timeout');

    // --- 设定与注入 ---
    await evaluate('localStorage.removeItem("hks.progress.v1")');
    await evaluate(`window.__game.unlockedExtra = true; window.__game.showTitle(); window.__game.difficulty='${run.diff}'; window.__game.char='${CHAR}'; window.__game.musicOn=false;`);
    const botOk = await evaluate(`import('/tools/sim_bot.js?t=${Date.now()}').then(function(m){ return !!m.install({ god: ${GOD}, maxRetries: 10 }); })`);
    if (!botOk) throw new Error('bot install failed');
    // 读取页面真实 POWER 配置（perLevel/extend 可能被 POWER 任务调整）
    const powerCfg = await evaluate(`import('/src/game/power.js').then(function(m){ return { perLevel: m.POWER.perLevel, max: m.POWER.max, extend: m.POWER.extend }; })`);
    await evaluate(`window.__vcPowerCfg = ${JSON.stringify(powerCfg)}`);

    // 探针（开始 stage 之前装）
    const cfg = {
      stage: run.stage, diff: run.diff, test: !!run.test, tag: run.tag, seed: SEED,
      deathTest: !!run.deathTest, deathAt: run.deathAt || 15,
      mutateCard: run.test ? run.mutateCard : null, mutateMul: run.mutateMul || 1.6,
      killEdgeOnExit: true,
      manip: run.manip || null,
      restorePowerOnRespawn: !!run.restorePowerOnRespawn,
      overrunAbort: OVERRUN_ABORT,
    };
    const probeSrc = '(' + probeClient.toString() + ')(' + JSON.stringify(cfg) + ')';
    const probeOk = await evaluate(probeSrc);
    if (!probeOk) throw new Error('probe install failed');
    // 完全停掉 rAF 循环：paused 只挡逻辑，渲染仍会消耗 Math.random（粒子），
    // 会造成「同 seed 两次跑结果不同」；stop() 后由截图前手动 render(1) 补画。
    if (PAUSE_LOOP) await evaluate('(() => { const g = window.__game; if (g.loop) { try { g.loop.stop && g.loop.stop(); } catch (e) {} g.loop.paused = true; } })()');
    if (SEED) {
      await evaluate(`(() => { let s = ${SEED} >>> 0; Math.random = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; })()`);
    }
    // boss.js 的战斗 RNG 用 Date.now()^Math.random() 播种（逐次遭遇不同）→ 冻结时钟才能复跑。
    // 所有跑共用同一 T，让 E/H 与 N 的弹幕随机流一致，差异只剩难度本身。
    if (argv.freezeClock !== '0') {
      const clock = Number(argv.clockBase || 1700000000000);
      await evaluate(`(() => { const T = ${clock}; Date.now = function () { return T; }; })()`);
    }

    // --- 开局：force-boss 模式传送到关底直接开终盘 Boss；--fullRun 面则正常打整关 ---
    await evaluate(`window.__game.carryPower = ${run.startPower}; window.__game.levelIndex = ${run.stage - 1}; window.__game.startStage(${run.stage - 1})`);
    let bossInfo = null;
    if (!run.full) {
      bossInfo = await evaluate(`(() => {
        const g = window.__game, s = g.stage;
        if (!s) return { err: 'no stage' };
        const p = s.player;
        p.x = Math.max(0, s.level.w - 1400); p.y = 0; p.vy = 0; p.vx = 0;
        if (p.setCheckpoint) p.setCheckpoint(p.x, p.y);
        s.beginBoss();
        return {
          state: s.state, boss: !!s.boss, mode: s.mode, levelW: s.level.w,
          key: s.boss && s.boss.key,
          phases: s.boss ? s.boss.phases.map((x) => ({ name: x.name, hp: x.hp, mode: x.mode || 'damage', limit: x.limit != null ? x.limit : null })) : null,
          bossMaxHp: s.boss && s.boss.maxHp,
          difficulty: g.difficulty,
        };
      })()`);
      if (!bossInfo || !bossInfo.boss) throw new Error('beginBoss failed ' + JSON.stringify(bossInfo));
    } else {
      const probeStart = await evaluate(`(() => { const s = window.__game.stage; return { ok: !!s, mode: s && s.mode, state: s && s.state, levelW: s && s.level.w }; })()`);
      if (!probeStart || !probeStart.ok) throw new Error('fullRun startStage failed ' + JSON.stringify(probeStart));
    }

    // --- 预计步数上限 ---
    const cards = SPEC_CARDS[run.stage] || [];
    const sumLimit = cards.reduce((a, c) => a + (c.mode === 'survival' ? c.limit : c.limit * (run.test ? 1.6 : 1)), 0);
    // 整关跑要多给道中时间（平台/弹幕关 traversal）；仍受 wallMs 限制
    const autoSteps = Math.ceil((sumLimit * 3.2 + 240 + (run.full ? 1200 : 0)) * 60);
    const maxSteps = MAX_STEPS > 0 ? MAX_STEPS : autoSteps;

    // --- 推进 ---
    let bail = null;
    let steps = 0;
    let stallChunks = 0;
    let snap = null;
    let sawBoss = false;
    let lastPx = null, lastMoveSim = 0, lastMoveSteps = 0;
    const wall = Date.now();
    let chunkNo = 0;
    while (steps < maxSteps) {
      if (Date.now() - wall > WALL_MS) { bail = 'wall timeout'; break; }
      const n = Math.min(CHUNK, maxSteps - steps);
      const res = await evaluate(`(() => {
        const snap = window.__game.input.__simBot.run(${n});
        const v = window.__vc;
        return {
          steps: snap.steps, simSec: snap.simSec, state: snap.state,
          deaths: snap.deaths, gameovers: snap.gameovers, retries: snap.retries,
          errors: (snap.errors || []).slice(0, 5),
          stage: snap.stage ? { state: snap.stage.state, name: snap.stage.name, px: snap.stage.px, sx: snap.stage.sx, t: snap.stage.t } : null,
          prog: v.progress, caps: v.captures, clearT: v.stageClearT, overrun: v.overrun,
          vcErrors: v.errors.length,
          death: v.deathTest ? { respawned: !!v.deathTest.respawned, err: v.deathTest.error || null } : null,
        };
      })()`);
      chunkNo++;
      snap = res;
      if (res.steps === steps) stallChunks++; else stallChunks = 0;
      steps = res.steps;
      if (res.prog && res.prog.bossKey) sawBoss = true;
      // 整关跑：道中长时间不前进 → 判定 bot 卡住，提前收工（避免白等 10 分钟）
      if (run.full && !sawBoss) {
        const px = res.stage && Number.isFinite(res.stage.px) ? res.stage.px : (res.stage && res.stage.sx);
        if (Number.isFinite(px)) {
          if (lastPx == null || Math.abs(px - lastPx) > 2) { lastPx = px; lastMoveSim = res.simSec; lastMoveSteps = res.steps; }
          else if (res.simSec - lastMoveSim > 240) { bail = 'fullRun: 道中 ' + Math.round(res.simSec) + 's 模拟时间内玩家未前进（疑似 bot 卡住），Boss 未出现'; break; }
        }
      }
      // 截图
      if (DO_SHOTS && res.caps && res.caps.length) {
        for (const cap of res.caps) {
          try { await shoot(cap.label, cap); } catch (e) { consoleWarnings.push('shot failed ' + cap.label + ': ' + e.message); }
          await evaluate(`(() => { const v = window.__vc; if (!v.captured.includes(${JSON.stringify(cap.id)})) v.captured.push(${JSON.stringify(cap.id)}); v.captures = v.captures.filter(function(x){ return x.id !== ${JSON.stringify(cap.id)}; }); return true; })()`);
        }
      }
      if (res.clearT != null) break;
      if (res.overrun) { bail = 'overrun abort: card ' + res.overrun.card + ' elapsed ' + res.overrun.elapsed + 's / limit ' + res.overrun.limit + 's'; break; }
      if (res.errors && res.errors.length) { bail = 'bot errors: ' + res.errors.join(' | '); break; }
      if (stallChunks > 6) { bail = 'bot steps stalled'; break; }
      if (res.stage && (res.stage.state === 'gameover')) { bail = 'gameover'; break; }
      if (res.prog && res.prog.stageState === 'clear') break;
      if (res.state === 'menu' && steps > 300) { bail = 'back to menu'; break; }
      if (res.death && res.death.err) { /* 继续，错误已记录 */ }
    }

    // --- 收尾 ---
    await evaluate('window.__vc.finalize()');
    let hudLive = null;
    try { hudLive = await evaluate('window.__vc.readHud()'); } catch {}
    const state = await evaluate('window.__vc.exportState()');
    const finalSnap = await evaluate('window.__game.input.__simBot.snapshot()');

    const out = {
      run: { tag: run.tag, stage: run.stage, diff: run.diff, test: !!run.test, full: !!run.full, char: CHAR, god: GOD, seed: SEED },
      wallMs: Date.now() - t0,
      steps, simSec: finalSnap.simSec, chunks: chunkNo,
      bail,
      boss: bossInfo || state.bossInfo || null,
      expected: cards,
      hpScale: HP_SCALE[run.diff] || 1,
      stageClearT: state.stageClearT,
      bossDefeatT: state.bossDefeatT,
      captures: state.captures || [],
      cards: state.cards,
      results: state.results,
      fallbacks: state.fallbacks,
      events: state.events,
      banners: state.banners,
      deathTest: state.deathTest,
      mutation: state.mutation,
      overrun: state.overrun,
      missingHooks: state.cfgMissing,
      probeErrors: state.errors,
      probeWarnings: state.warnings,
      consoleErrors,
      consoleWarnings,
      powerCfg: state.powerCfg || null,
      playerEnd: state.playerEnd,
      stageEnd: state.stageEnd,
      hudLive,
      bot: {
        steps: finalSnap.steps, deaths: finalSnap.deaths, gameovers: finalSnap.gameovers,
        retries: finalSnap.retries, errors: finalSnap.errors || [],
      },
      shots,
      shotInfo,
    };
    out.analysis = analyzeRun(out);
    const json = JSON.stringify(out, null, 2);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(RUN_FILE(run), json);
    console.log(`[${run.tag} s${run.stage}] ${out.analysis.verdict} cards=${out.cards.length} simSec=${r2(out.simSec)} wall=${out.wallMs}ms bail=${bail || '-'}`);
    return out;
  } finally {
    cleanup();
  }
}

/* ---------------------------------------------------------------- 判定 */
function analyzeRun(out) {
  const issues = [];
  const warns = [];
  const stage = out.run.stage;
  const diff = out.run.diff;
  const hpScale = out.hpScale || 1;
  const expected = out.expected || [];
  const observed = out.cards || [];
  // 血量公式口径自动识别：旧实现 hp = limit×dps×hpScale（E/H 时长随之缩放）；
  // Lead 校准后改为 hp = round(limit×dps)，时长不再随难度漂移（此时 E/H 用原始口径判）。
  let hpScaleApplied = false;
  if (HPSCALE_MODE === 'applied') hpScaleApplied = true;
  else if (HPSCALE_MODE === 'none') hpScaleApplied = false;
  else {
    const expDmg = expected.find((e) => e.mode !== 'survival');
    const cDmg = observed.find((c) => c && c.mode !== 'survival' && !c.mutation && Number.isFinite(c.spellMaxHp) && Number.isFinite(Number(c.limit)));
    if (expDmg && cDmg && Number(cDmg.limit) > 0) {
      const implied = cDmg.spellMaxHp / (Number(cDmg.limit) * DPS_ORACLE);
      hpScaleApplied = Math.abs(implied - hpScale) <= 0.03;
    }
  }
  const useNorm = hpScaleApplied && Math.abs(hpScale - 1) > 0.01;
  // 同 idx 可能因异常采到多张：优先取已结算的、其次取最早开始的
  const byIdx = new Map();
  for (const c of observed) {
    const prev = byIdx.get(c.idx);
    if (!prev) { byIdx.set(c.idx, c); continue; }
    const prevDone = !!(prev.result || prev.ended);
    const curDone = !!(c.result || c.ended);
    if (!prevDone && curDone) { byIdx.set(c.idx, c); continue; }
    if (prevDone === curDone) {
      const a = Number.isFinite(prev.startedT) ? prev.startedT : Infinity;
      const b2 = Number.isFinite(c.startedT) ? c.startedT : Infinity;
      if (b2 < a) byIdx.set(c.idx, c);
    }
  }
  const events = out.events || [];
  const cardEvents = new Map();
  for (const e of events) if (e.type === 'cardResult' && e.d) cardEvents.set(e.d.index, e);
  const addIssue = (sev, msg) => { if (sev === 'FAIL') issues.push(msg); else warns.push(msg); };

  if (out.missingHooks && out.missingHooks.length) addIssue('FAIL', `缺少接口钩子：${out.missingHooks.join(', ')}`);
  if (out.stageClearT == null && !out.run.test) addIssue('FAIL', `Boss 未在本次跑中打完（bail=${out.bail || 'none'}，cards=${observed.length}/${expected.length}）`);
  if (out.bail && !out.run.test) warns.push(`运行提前结束：${out.bail}`);

  // 面 = Boss key
  const wantBoss = STAGE_BOSS[stage];
  if (wantBoss && out.boss && out.boss.key !== wantBoss) addIssue('FAIL', `关卡 Boss key=${out.boss.key}，规格应为 ${wantBoss}`);
  if (out.boss && out.boss.phases && out.boss.phases.length !== expected.length) {
    addIssue('FAIL', `Runtime 卡数 ${out.boss.phases.length} ≠ 规格 ${expected.length}（裁卡未取消？trimHardCards）`);
  }

  const cardChecks = [];
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const c = byIdx.get(i);
    const fail = (m) => { issues.push(`s${stage}-${diff} 卡${i + 1}（${exp.name}）：${m}`); };
    const warn = (m) => { warns.push(`s${stage}-${diff} 卡${i + 1}（${exp.name}）：${m}`); };
    if (!c) { fail('本次跑未到达该卡'); continue; }
    const ev = cardEvents.get(i);
    const limit = Number.isFinite(Number(c.limit)) ? Number(c.limit) : null;
    const elapsed = Number.isFinite(Number(c.elapsed)) ? Number(c.elapsed) : null;
    const mode = c.mode;
    const res = c.result || (ev && ev.d) || null;
    const resOk = res && typeof res.ok === 'boolean' ? res.ok : null;
    const reward = (ev && ev.d && ev.d.reward) || null;
    const ratio = elapsed != null && exp.limit ? elapsed / exp.limit : null;
    const normRatio = ratio != null && hpScale ? ratio / hpScale : null;
    const modeWait = exp.mode === 'survival' ? 'survival' : 'damage';

    if (mode !== modeWait) fail(`mode=${mode}，规格 ${modeWait}`);
    if (limit !== exp.limit) fail(`limit=${limit}，规格 ${exp.limit}`);
    if (normName(c.name) !== normName(exp.name)) warn(`卡名 "${c.name}" 与规格 "${exp.name}" 不完全一致`);
    if (c.lockViolation) fail('spellLock 期间 cardElapsed 仍在累计（规格 §2.1）');
    if (resOk == null) fail('没有结算回调 / lastCardResult（规格 §3.2 onCardResult）');
    const uniqCount = (c.resultCount || 0) + ((c.fallbackCount || 0) && !c.resultCount ? 0 : 0);
    if (resOk == null && uniqCount === 0) { /* 已在上面报 */ }
    if (c.resultCount > 1) warn(`结算回调被调用 ${c.resultCount} 次`);
    const incomplete = !c.ended;
    const mut = c.mutation || null;
    const mutated = !!mut;
    const timingWarnOnly = mutated || !!out.deathTest;
    if (incomplete) fail('该卡未打完（提前收工 / overrun 保护触发）');
    if (mutated) warns.push(`s${stage}-${diff} 卡${i + 1}：T 跑人为放大血条 ×${mut.mul}，跳过时长判定`);
    if (modeWait === 'damage') {
      if (elapsed == null) fail('缺少 cardElapsed');
      else if (mutated) { /* 时长判定跳过 */ }
      else if (diff === 'N' || !useNorm) {
        if (ratio > TIMING_HI) {
          const msg = `时长 ${elapsed.toFixed(1)}s / limit ${exp.limit}s = ${(ratio * 100).toFixed(1)}%（上限 ${(TIMING_HI * 100).toFixed(0)}%：正常玩家余量不足）`;
          if (timingWarnOnly) warns.push(msg + '（落命测试跑，参照用）'); else fail(msg);
        } else if (ratio < TIMING_LO) {
          warns.push(`s${stage}-${diff} 卡${i + 1}：时长 ${elapsed.toFixed(1)}s / limit ${exp.limit}s = ${(ratio * 100).toFixed(1)}%（低于下限 ${(TIMING_LO * 100).toFixed(0)}%，打得偏快，非失败）`);
        }
      } else {
        if (normRatio > TIMING_HI) {
          const msg = `hpScale 归一后 ${elapsed.toFixed(1)}s/(${hpScale}×${exp.limit}s) = ${(normRatio * 100).toFixed(1)}%（上限 ${(TIMING_HI * 100).toFixed(0)}%）`;
          if (timingWarnOnly) warns.push(msg + '（落命测试跑，参照用）'); else fail(msg);
        } else if (normRatio < TIMING_LO) {
          warns.push(`s${stage}-${diff} 卡${i + 1}：hpScale 归一后 ${(normRatio * 100).toFixed(1)}%（低于下限 ${(TIMING_LO * 100).toFixed(0)}%，非失败）`);
        }
        if (!nearTarget(ratio)) warns.push(`s${stage}-${diff} 卡${i + 1}：原始偏差 ${((ratio / TARGET_RATIO) * 100 - 100).toFixed(1)}%（血量按 hpScale ${hpScale} 缩放，属预期）`);
      }
      if (exp.limit && resOk != null && !mutated && resOk !== (elapsed <= exp.limit + 1e-6)) fail(`ok=${resOk}，但 elapsed=${elapsed}s vs limit=${exp.limit}s 不匹配`);
      if (c.ended && !mutated && c.ratioMin > 0.02) fail(`damage 卡结束时血条未打空：cardRatio min=${c.ratioMin}（血条被打空才应切卡）`);
    } else {
      // survival：Boss 免疫伤害 + 到点自动切卡 + 成功奖励
      if (elapsed == null || elapsed < exp.limit - 0.1) fail(`survival 在 ${elapsed}s 结束，早于 limit ${exp.limit}s`);
      if (elapsed != null && elapsed > exp.limit + 1.5) fail(`survival 在 ${elapsed}s 才结束，明显晚于 limit ${exp.limit}s`);
      if (resOk !== true) fail(`survival 视为成功，但 ok=${resOk}`);
      if (c.immune === false) fail(`survival 卡 Boss 掉了 ${c.dmg} 血（应免疫伤害）`);
      // 自动切卡：要么有下一张，要么（最后一张）进入 defeat
      const hasNext = byIdx.has(i + 1) || out.bossDefeatT != null;
      if (!hasNext) fail('survival 到点后未自动切卡/进入 defeat');
      if (c.hud1 && !/坚持/.test(c.hud1)) fail(`HUD 生存文本异常："${c.hud1}"`);
      if (c.hud1Mode && !/SURVIVE/i.test(c.hud1Mode)) fail(`HUD 生存标记异常："${c.hud1Mode}"`);
      if (c.hudMid && !/坚持/.test(c.hudMid)) fail(`HUD 生存中点文本异常："${c.hudMid}"`);
      if (c.hudFill != null && c.hudMidAt != null && exp.limit) {
        const wantFill = (1 - c.hudMidAt / exp.limit) * 100;
        if (Math.abs(c.hudFill - wantFill) > 8) warns.push(`s${stage}-${diff} 卡${i + 1}：survival 血条填充 ${c.hudFill}% 与 cardRatio≈${wantFill.toFixed(0)}% 偏差较大`);
      }
    }
    if (modeWait === 'damage') {
      if (c.hud1 && !/限时\s*剩余/.test(c.hud1)) fail(`HUD damage 文本异常："${c.hud1}"`);
      if (c.hudMid && !/限时\s*剩余/.test(c.hudMid)) fail(`HUD damage 中点文本异常："${c.hudMid}"`);
      if (elapsed != null && exp.limit && elapsed > exp.limit && !c.overtimeText) fail('超时后 HUD 未显示「超时 · 击破 +10 点」');
      if (c.overtimeText && !/超时/.test(c.overtimeText)) fail(`超时 HUD 文本异常："${c.overtimeText}"`);
    }

    // 奖励
    const before = c.rewardMeta && c.rewardMeta.before;
    const after = c.rewardMeta && c.rewardMeta.after;
    const pcfg = out.powerCfg || {};
    const perLevel = Number.isFinite(pcfg.perLevel) ? pcfg.perLevel : 4;
    const extendEvery = Number.isFinite(pcfg.extend) ? pcfg.extend : 99;
    if (before && after) {
      const maxPower = Number.isFinite(before.maxPower) ? before.maxPower : (Number.isFinite(pcfg.max) ? pcfg.max : 16);
      const dPower = after.power - before.power;
      const dLives = after.lives - before.lives;
      const dExt = after.extendPts - before.extendPts;
      const crossed = (before.extendPts + (resOk && before.power >= maxPower ? extendEvery : resOk ? perLevel : 10)) >= extendEvery;
      if (resOk === true && before.power < maxPower) {
        if (reward !== 'power') fail(`成功且未满槽，reward=${reward}（应为 power）`);
        if (dPower !== Math.min(maxPower - before.power, perLevel)) fail(`POWER 增量 ${dPower}（应为 ${Math.min(maxPower - before.power, perLevel)}，perLevel=${perLevel}）`);
        const wantExt = (before.extendPts + perLevel) % extendEvery;
        if (!crossed && after.extendPts !== wantExt) fail(`extendPts ${before.extendPts}→${after.extendPts}，不应偏离 +${perLevel}`);
      } else if (resOk === true && before.power >= maxPower) {
        if (reward !== 'life') fail(`成功且满槽，reward=${reward}（应为 life）`);
        if (dLives !== 1) fail(`满槽成功应残机 +1，实际 ${dLives}`);
      }
      if (resOk === false) {
        if (reward !== 'points') fail(`超时失败，reward=${reward}（应为 points）`);
        if (!crossed && dExt !== 10) fail(`失败 extendPts 增量 ${dExt}（应为 10）`);
        if (crossed && dLives !== 1) fail(`失败 +10 点应恰好换 1 命（跨 99），实际 lives ${dLives}`);
      }
    } else if (c.rewardMeta && c.rewardMeta.err) {
      fail('stage._onBossCardResult 抛异常：' + c.rewardMeta.err);
    } else if (resOk != null) {
      warns.push(`s${stage}-${diff} 卡${i + 1}：无 before/after 奖励快照（无法核对 POWER/残机）`);
    }
    // 横幅
    const banner = (ev && ev.banner) || (c.rewardMeta && c.rewardMeta.banner) || null;
    if (banner) {
      const want = resOk === false ? /超时/ : reward === 'life' ? /1UP|残机/ : /POWER|火力/;
      if (!want.test(banner)) warns.push(`s${stage}-${diff} 卡${i + 1}：横幅 "${String(banner).trim()}" 与 reward=${reward} 不符`);
    }
    if (c.startT == null) { /* noop */ }

    cardChecks.push({
      stage, diff, index: i + 1, idx: i, boss: (out.boss && out.boss.key) || null, name: c.name || exp.name, mode, limit, expectedLimit: exp.limit,
      startT: c.startedT != null ? c.startedT : null, endT: c.endedT != null ? c.endedT : null,
      elapsed: r2(elapsed), ratio: r2(ratio), normRatio: r2(normRatio),
      ok: resOk, reward: reward || null,
      hpAtEnd: Number.isFinite(c.bossHpMin) ? r2(c.bossHpMin) : null,
      bossState: c.bossStateAtEnd || null,
      immune: c.immune != null ? c.immune : null,
      autoAdvance: modeWait === 'survival' ? (byIdx.has(i + 1) || out.bossDefeatT != null) : null,
      spellMaxHp: c.spellMaxHp, dmg: c.dmg,
      measuredDps: modeWait === 'damage' && elapsed ? Math.round((c.spellMaxHp / elapsed) * 10) / 10 : null,
      hudStart: c.hud1, hudMid: c.hudMid, hudOvertime: c.overtimeText || null,
      hudFill: c.hudFill != null ? c.hudFill : null,
      banner: banner ? String(banner).trim() : null,
      beforePower: before ? before.power : null, afterPower: after ? after.power : null,
      beforeLives: before ? before.lives : null, afterLives: after ? after.lives : null,
      beforeExtend: before ? before.extendPts : null, afterExtend: after ? after.extendPts : null,
      lockViolation: !!c.lockViolation,
      mutation: c.mutation || null,
      test: !!out.run.test,
      fx: c.fx,
      wallSpan: c.wallSpan,
    });
  }

  // 死亡不重置计时（T 跑）
  let deathCheck = null;
  if (out.deathTest) {
    const d = out.deathTest;
    deathCheck = {
      card: d.card, at: d.at, elapsedBeforeDeath: d.elapsedBeforeDeath,
      respawned: !!d.respawned, elapsedAfterRespawn: d.elapsedAfterRespawn,
      sameCard: d.cardAfter === d.card,
      monotonic: Number.isFinite(d.elapsedAfterRespawn) ? d.elapsedAfterRespawn >= d.elapsedBeforeDeath : null,
      error: d.error || null,
      powerAfterDeath: d.powerAfterDeath, livesAfterDeath: d.livesAfterDeath,
    };
    if (d.error) issues.push(`T 跑：强制落命异常 ${d.error}`);
    if (!d.respawned) issues.push('T 跑：落命后未复活（计时不重置无法验证）');
    if (d.respawned && deathCheck.sameCard === false) issues.push(`T 跑：落命后卡号变了（${d.card}→${d.cardAfter}），计时被重置`);
    if (d.respawned && deathCheck.monotonic === false) issues.push(`T 跑：落命后 cardElapsed 回落（${d.elapsedBeforeDeath}s→${d.elapsedAfterRespawn}s），计时被重置`);
    const tCard = (out.cards || []).find((c) => c.index1 === d.card);
    if (tCard && tCard.elapsed != null && Number.isFinite(d.elapsedBeforeDeath) && tCard.elapsed <= d.elapsedBeforeDeath) {
      issues.push('T 跑：落命所在的卡结算时长未超过落命时刻（计时疑似重置）');
    }
    if (tCard && !tCard.ended && d.respawned) issues.push('T 跑：落命后该卡没有正常打完');
  }
  // 强制超时测试
  let overtimeCheck = null;
  if (out.mutation) {
    const m = out.mutation;
    const c = (out.cards || []).find((x) => x.index1 === m.card);
    const ev = c && cardEvents.get(c.idx);
    overtimeCheck = {
      card: m.card, mul: m.mul, oldMax: m.oldMax, newMax: m.newMax,
      elapsed: c ? r2(c.elapsed) : null, limit: c ? c.limit : null,
      ok: c && c.result ? c.result.ok : null, reward: ev && ev.d ? ev.d.reward : null,
      hudOvertime: c ? c.overtimeText : null, banner: ev ? ev.banner : null,
      movedOn: !!(c && (c.ended || c.bossStateAtEnd === 'defeat')),
    };
    if (!c) issues.push('T 跑：强制放大的卡未到达');
    else {
      if (!(c.elapsed > c.limit)) issues.push(`T 跑：放大血条后仍在限时内（${c.elapsed}s ≤ ${c.limit}s），超时路径未触发`);
      if (c.result && c.result.ok !== false) issues.push('T 跑：超时卡 ok 应为 false');
      if (ev && ev.d && ev.d.reward !== 'points') issues.push(`T 跑：超时 reward=${ev.d && ev.d.reward}（应为 points）`);
      if (c.overtimeText && !/超时/.test(c.overtimeText)) issues.push(`T 跑：超时 HUD 文本 "${c.overtimeText}" 不含「超时」`);
      if (!c.ended) issues.push('T 跑：超时卡未切到下一张（血条不应被超时跳过）');
    }
  }

  // 控制台 / 探针错误
  if (out.consoleErrors && out.consoleErrors.length) issues.push(`控制台 error ${out.consoleErrors.length} 条：${out.consoleErrors.slice(0, 2).join(' || ')}`);
  if (out.probeErrors && out.probeErrors.length) issues.push(`页面探针捕获异常 ${out.probeErrors.length} 条：${out.probeErrors.slice(0, 2).join(' || ')}`);
  if (out.consoleWarnings && out.consoleWarnings.length) warns.push(`console.warn ${out.consoleWarnings.length} 条：${out.consoleWarnings.slice(0, 2).join(' || ')}`);

  const verdict = issues.length ? 'FAIL' : 'PASS';
  return { verdict, issues, warns, cards: cardChecks, deathCheck, overtimeCheck };
}

/* ---------------------------------------------------------------- 汇总 */
function buildSummary(results) {
  const allCards = [];
  const summary = {
    generatedAt: new Date().toISOString(),
    plan: PLAN,
    config: { char: CHAR, god: GOD, seed: SEED, chunk: CHUNK, oracle: 'docs/BOSS_TIMING_SPEC.md §1' },
    runs: [],
    cards: allCards,
    issues: [],
    warns: [],
  };
  for (const r of results) {
    const a = r.analysis || { verdict: 'FAIL', issues: ['no analysis'], warns: [], cards: [] };
    summary.runs.push({
      tag: r.run.tag, stage: r.run.stage, diff: r.run.diff, test: !!r.run.test,
      verdict: a.verdict, bail: r.bail, steps: r.steps, simSec: r2(r.simSec), wallMs: r.wallMs,
      bossKey: r.boss && r.boss.key, diffInGame: r.boss && r.boss.difficulty,
      cards: (r.cards || []).length, expectedCards: (r.expected || []).length,
      phaseCount: r.boss && r.boss.phases ? r.boss.phases.length : null,
      targetLen: (r.expected || []).reduce((s, c) => s + c.limit, 0),
      stageClearT: r.stageClearT, bossDefeatT: r.bossDefeatT,
      consoleErrors: (r.consoleErrors || []).length,
      missingHooks: r.missingHooks || [],
      shots: r.shots || [],
    });
    for (const c of a.cards || []) allCards.push(c);
    for (const m of a.issues || []) summary.issues.push(`[${r.run.tag} s${r.run.stage}] ${m}`);
    for (const m of a.warns || []) summary.warns.push(`[${r.run.tag} s${r.run.stage}] ${m}`);
  }
  // 汇总统计（只算 Normal 正式跑）
  const nCards = allCards.filter((c) => c.diff === 'N' && !c.mutation && !c.test);
  const timed = nCards.filter((c) => c.ratio != null);
  summary.stats = {
    cardsTotal: allCards.length,
    normalCards: nCards.length,
    normalTimedOk: timed.filter((c) => nearTarget(c.ratio)).length,
    normalTimed: timed.length,
    survivalCards: allCards.filter((c) => c.mode === 'survival').length,
    survivalOk: allCards.filter((c) => c.mode === 'survival' && c.ok === true && (c.elapsed || 0) >= (c.expectedLimit - 0.1)).length,
    passCards: allCards.filter((c) => c.ratio == null || c.ratio <= TIMING_HI).length,
    failCards: allCards.filter((c) => c.ratio != null && c.ratio > TIMING_HI).length,
    measuredDps: (() => {
      const arr = nCards.filter((c) => c.mode === 'damage' && c.measuredDps).map((c) => c.measuredDps);
      if (!arr.length) return null;
      arr.sort((a, b) => a - b);
      const med = arr[Math.floor(arr.length / 2)];
      return { n: arr.length, median: med, min: arr[0], max: arr[arr.length - 1], mean: Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 };
    })(),
    verdict: summary.issues.length ? 'FAIL' : 'PASS',
  };
  return summary;
}

function writeMarkdown(summary) {
  const lines = [];
  lines.push('# Boss 符卡验收原始表（自动生成 · tools/_verify_bosscards.mjs）');
  lines.push('');
  lines.push(`生成时间：${summary.generatedAt}　计划：\`${summary.plan}\`　oracle：docs/BOSS_TIMING_SPEC.md §1`);
  lines.push('');
  lines.push('## 跑次总览');
  lines.push('');
  lines.push('| 面 | 难度 | 判定 | 卡数 | 目标总时长 | 实际 sim | 墙钟 | 通关 T | Boss 进入 defeat | 控制台 error |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of summary.runs) {
    lines.push(`| ${r.stage} | ${r.diff}${r.test ? '（T）' : ''} | ${r.verdict} | ${r.cards}/${r.expectedCards} | ${r.targetLen}s | ${r.simSec}s | ${(r.wallMs / 1000).toFixed(1)}s | ${r.stageClearT != null ? r.stageClearT + 's' : '—'} | ${r.bossDefeatT != null ? r.bossDefeatT + 's' : '—'} | ${r.consoleErrors} |`);
  }
  lines.push('');
  lines.push('## 逐卡');
  lines.push('');
  lines.push('| 面 | 难度 | # | 符卡 | 模式 | limit | elapsed | 偏差 | ok | reward | 判定 | HUD | 截图 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of summary.cards) {
    const dev = c.ratio != null ? `${(c.ratio * 100).toFixed(1)}% / 目标差 ${((c.ratio / TARGET_RATIO) * 100 - 100).toFixed(1)}%` : '—';
    const pass = c.ratio == null ? '—' : c.ratio > TIMING_HI ? 'FAIL' : c.ratio < TIMING_LO ? 'WARN' : 'PASS';
    const hud = c.mode === 'survival' ? (c.hudMid || c.hudStart || '') : (c.hudMid || c.hudStart || '');
    lines.push(`| ${c.stage} | ${c.diff} | ${c.index} | ${c.name} | ${c.mode} | ${c.limit ?? '—'} | ${c.elapsed ?? '—'} | ${dev} | ${c.ok} | ${c.reward || '—'} | ${pass} | ${String(hud).replace(/\|/g, '\\|')} | |`);
  }
  lines.push('');
  lines.push('## 需修清单（自动判定）');
  lines.push('');
  if (summary.issues.length) for (const m of summary.issues) lines.push(`- ${m}`);
  else lines.push('- （无）');
  lines.push('');
  lines.push('## 提示 / 观察');
  lines.push('');
  if (summary.warns.length) for (const m of summary.warns) lines.push(`- ${m}`);
  else lines.push('- （无）');
  lines.push('');
  return lines.join('\n');
}

/* ---------------------------------------------------------------- main */
(async () => {
  mkdirSync(OUT_DIR, { recursive: true });
  if (DO_SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  console.log(`[verify] plan=${PLAN} runs=${RUNS.length} url=${URL_BASE}`);
  const results = [];
  for (let i = 0; i < RUNS.length; i++) {
    const run = RUNS[i];
    const f = RUN_FILE(run);
    if (RESUME && existsSync(f)) {
      try {
        const prev = JSON.parse(readFileSync(f, 'utf8'));
        results.push(prev);
        console.log(`[${run.tag} s${run.stage}] resume skip（已有 ${f}）`);
        continue;
      } catch {}
    }
    try {
      const r = await runOne(run, i);
      results.push(r);
    } catch (e) {
      console.error(`[${run.tag} s${run.stage}] CRASH: ${e.message}`);
      const fail = {
        run: { tag: run.tag, stage: run.stage, diff: run.diff, test: !!run.test },
        bail: 'crash: ' + e.message,
        cards: [], results: [], events: [], consoleErrors: [e.message],
        analysis: { verdict: 'FAIL', issues: ['运行崩溃：' + e.message], warns: [], cards: [] },
        wallMs: 0, steps: 0, simSec: 0,
      };
      results.push(fail);
      try { writeFileSync(f, JSON.stringify(fail, null, 2)); } catch {}
    }
  }
  const summary = buildSummary(results);
  writeFileSync(join(OUT_DIR, 'bosscards_summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(OUT_DIR, 'bosscards_table.md'), writeMarkdown(summary));
  console.log('');
  console.log(`[verify] summary: ${summary.stats.verdict}  cards=${summary.stats.cardsTotal}  timed=${summary.stats.normalTimedOk}/${summary.stats.normalTimed}  issues=${summary.issues.length}`);
  if (summary.stats.measuredDps) console.log(`[verify] measuredDps(N): ${JSON.stringify(summary.stats.measuredDps)}`);
  for (const m of summary.issues.slice(0, 20)) console.log('  FAIL ' + m);
  for (const m of summary.warns.slice(0, 12)) console.log('  WARN ' + m);
  console.log(`[verify] wrote ${join(OUT_DIR, 'bosscards_summary.json')} + bosscards_table.md`);
})();
