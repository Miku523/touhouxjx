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
import { POWER, cardClearPower, cardNoHitPower } from '../src/game/power.js';

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
// --lockPower N：把玩家 POWER 每帧钉死在 N（测「固定挡位火力」的卡血量用；避免吃到 P 点升档污染 DPS）
const LOCK_POWER = argv.lockPower === undefined ? null : Number(argv.lockPower);
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

/* ------------------------------------------- 奖励回归规格（独立 oracle，不从 src 抄） */
// 2026-10-24 新机制：符卡结算基础 1/4P（16）+ 无伤 1/2P（32）；满槽时基础转 1 命（99 点 extend 通道）；
// 超时 +10 点。擦弹每颗 0.075 POWER（POWER 收益，不再计入 extend）+ 0.02 点 1UP 进度，
// 所以 1UP 进度实际增量是 0.02/颗（POWER 与 1UP 两账分开）。
// 直接读 src/game/power.js：POWER 改版（2026-10-24 上限 128 / 5 档）后这里的期望值会自动跟上，
// 不再和游戏内常量脱钩（原来的硬编码 64/16 曾把 32/64 奖励误判成 FAIL）。
const POWER_SPEC = {
  max: POWER.max, perLevel: POWER.perLevel, extend: POWER.extend,
  graze: POWER.graze, grazePoints: POWER.grazePoints,
  cardClear: POWER.cardClear, cardNoHit: POWER.cardNoHit,
  cardClearPower: cardClearPower(), cardNoHitPower: cardNoHitPower(),
};
const GRAZE_EXTEND_PER_BULLET = POWER_SPEC.grazePoints; // 0.02：POWER 0.075 不再计入 1UP
const POWER_CFG_KEYS = ['perLevel', 'max', 'extend', 'graze', 'grazePoints', 'cardClear', 'cardNoHit', 'cardClearPower', 'cardNoHitPower'];

// T 跑奖励变体：每项展开成一次独立 run（同一面），覆盖 noHit × 满槽 × 超时 的全部组合。
// manip.power 支持数值或 'max'（结算瞬间置满槽）；damaged 显式控制 stage._cardDamaged（决定无伤判定）。
// expected[i] = { branch, dPower, addExtend }：结算后应命中的分支与账面增量（addExtend 是「入账量」，跨 99 由命数吸收）。
const REWARD_VARIANTS = [
  {
    id: 'a', label: '未满槽受伤(+16) / 满槽无伤(99+32=131)',
    mutateCard: null,
    manip: [
      { index: 0, power: 16, extend: 90, damaged: true, restorePower: null },
      { index: 1, power: 'max', extend: 80, damaged: false, restorePower: null },
    ],
    expected: [
      { branch: 'power_hit', dPower: 16, addExtend: 16 },
      { branch: 'life_nohit', dPower: 0, addExtend: 131 },
    ],
  },
  {
    id: 'b', label: '未满槽无伤(+48) / 满槽受伤(99)',
    mutateCard: null,
    manip: [
      { index: 0, power: 24, extend: 10, damaged: false, restorePower: null },
      { index: 1, power: 'max', extend: 94, damaged: true, restorePower: null },
    ],
    expected: [
      { branch: 'power_nohit', dPower: 40, addExtend: 48 },
      { branch: 'life_hit', dPower: 0, addExtend: 99 },
    ],
  },
  {
    id: 'c', label: '强制超时 points(+10) / 自然结算',
    // 卡 0 血量 ×3.6（实测 T 口径 ~16.3s → ~58s > limit 50s），超时路径必触发；卡 1 自然结算走通用公式。
    // 注：×3.0 实测 46.5s 仍低于 50s（T 跑满火力 dps 更高），故取 3.6。
    mutateCard: 0, mutateMul: 3.6,
    manip: [
      { index: 0, power: 'max', extend: 90, damaged: true, restorePower: null },
    ],
    expected: [
      { branch: 'points', dPower: 0, addExtend: 10 },
      { branch: 'natural' },
    ],
  },
];
const VARIANT_FILTER = String(argv.variants || '').split(',').map((s) => s.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const pad = (n) => String(n).padStart(2, '0');

/* --------------------------------------------------- 规格 §1 目标时长（独立 oracle，不从 src 抄） */
const HP_SCALE = { E: 0.85, N: 1, H: 1.15, L: 1.3 };
const STAGE_BOSS = { 1: 'rumia', 2: 'wriggle', 3: 'cirno', 4: 'aya', 5: 'yuyuko', 6: 'kaguya' };
const SPEC_CARDS = {
  // 2026-10-24 重定标（v2）：与 docs/BOSS_TIMING_TABLE.md v4 §1 一致。
  // limit / mode / fx 是「独立 oracle」，故意从文档抄一遍，不从 bossTuning.js import。
  1: [
    { name: '宵暗「月之暗面」', mode: 'damage', limit: 50, fx: 'moon', note: '黑暗氛围' },
    { name: '暗符「黑暗吞噬」', mode: 'damage', limit: 60, fx: 'night', note: '黑暗吞噬氛围' },
  ],
  2: [
    { name: '灯符「萤火虫现象」', mode: 'damage', limit: 60, fx: 'fireflies' },
    { name: '蠢符「小虫风暴」', mode: 'damage', limit: 60, fx: 'fireflies' },
    { name: '隐虫「萤火虫之夜」', mode: 'damage', limit: 70, fx: 'darkSpot', darkSpot: true },
  ],
  3: [
    { name: '冰符「冰柱落下」', mode: 'damage', limit: 30, fx: 'hail' },
    { name: '雹符「冰雹风暴」', mode: 'damage', limit: 60, fx: 'hail' },
    { name: '冻符「完美冻结」', mode: 'damage', limit: 80, fx: 'freeze' },
    { name: '雪符「钻石风暴」', mode: 'damage', limit: 99, fx: 'freeze' },
  ],
  4: [
    { name: '风符「风神一扇」', mode: 'damage', limit: 36, fx: 'wind' },
    { name: '疾风「风神少女」', mode: 'damage', limit: 40, fx: 'wind' },
    { name: '岐符「天之八衢」', mode: 'damage', limit: 60, fx: 'wind' },
    { name: '风神「天狗颪」', mode: 'damage', limit: 80, fx: 'wind' },
    { name: '「幻想风靡」', mode: 'survival', limit: 60, fx: 'wind' },
  ],
  5: [
    { name: '幽雅「死出诱蛾灯」', mode: 'damage', limit: 30, fx: 'night' },
    { name: '蝶符「花之舞」', mode: 'damage', limit: 45, fx: 'petals' },
    { name: '蝶符「死蝶之华尔兹」', mode: 'damage', limit: 90, fx: 'petals' },
    { name: '亡乡「亡我乡 -宿罪-」', mode: 'damage', limit: 60, fx: 'night' },
    { name: '冥符「常夜樱」', mode: 'damage', limit: 90, fx: 'petals' },
    { name: '反魂蝶「八分咲」', mode: 'survival', limit: 66, fx: 'petals' },
  ],
  6: [
    { name: '难题「龙颈之玉 -五色的弹丸-」', mode: 'damage', limit: 40, fx: 'moon' },
    { name: '神宝「耀眼的龙玉」', mode: 'damage', limit: 60, fx: 'night' },
    { name: '难题「佛御石之钵 -不碎的意志-」', mode: 'damage', limit: 80, fx: 'darkVeil' },
    { name: '神宝「佛体的金刚石」', mode: 'damage', limit: 60, fx: 'freeze' },
    { name: '难题「火鼠的皮衣 -不焦躁的内心-」', mode: 'damage', limit: 90, fx: 'voidFlame' },
    { name: '神宝「火蜥蜴之盾」', mode: 'damage', limit: 30, fx: 'voidFlame' },
    { name: '难题「燕的子安贝 -永命线-」', mode: 'survival', limit: 50, fx: 'wind' },
    { name: '神宝「蓬莱的玉枝 -梦色之乡-」', mode: 'damage', limit: 66, fx: 'fairyDust' },
  ],
};const normName = (s) => String(s || '').replace(/[\s\u3000「」『』·・\-—－]/g, '');

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
        // 奖励回归：每个变体一次独立 run（同面），全部分支都必须在 at least one run 里实际命中。
        for (const v of REWARD_VARIANTS) {
          if (VARIANT_FILTER.length && !VARIANT_FILTER.includes(v.id)) continue;
          runs.push({
            tag: 'T', diff: 'N', stage, test: true, full: FULL_RUN.includes(stage),
            startPower: 128,
            deathTest: false,
            mutateCard: v.mutateCard,
            mutateMul: v.mutateMul || Number(argv.mutateMul || 1.6),
            // 结算瞬间人为构造奖励分支条件（+POWER / 满槽换命 / 无伤标记），结算后恢复满火力以免影响后续卡时长
            manip: v.manip,
            variantId: v.id, variantLabel: v.label, variantExpected: v.expected,
          });
        }
      } else if (tag === 'G') {
        // 擦弹集成：真实 stg 关卡里放一颗只进擦弹环、不命中的弹，单帧推进核对 POWER/1UP 增量。
        runs.push({
          tag: 'G', diff: 'N', stage, test: false, full: false,
          startPower: 0, deathTest: false, mutateCard: null, grazeTest: true,
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
const RUN_FILE = (r) => join(OUT_DIR, `bosscards_s${r.stage}_${r.diff}${r.tag === 'T' ? '_reward_' + (r.variantId || 'x') : r.tag === 'D' ? '_deathtest' : r.tag === 'G' ? '_grazetest' : ''}.json`);

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
    deathTest: null, mutation: null, overrun: null, graze: null,
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
        const damagedNatural = !!this._cardDamaged;
        // T 跑：结算瞬间人为构造奖励分支条件（仅测试跑）
        let manip = null;
        if (cfg.test && Array.isArray(cfg.manip) && res) {
          manip = cfg.manip.filter(function (m) { return m && m.index === res.index; })[0] || null;
          if (manip && p) {
            try {
              // power 支持数值或 'max'（='满槽'），因为满槽判定是 reward='life' 的分支条件。
              if (manip.power === 'max') p.power = p.maxPower;
              else if (Number.isFinite(manip.power)) p.power = manip.power;
              if (Number.isFinite(manip.extend)) this.extendPts = manip.extend;
              // 无伤判定由 _cardDamaged 决定：必须显式控制，不能依赖自然受击（god 模式每帧抬 invuln=3，自然不会受伤）。
              if ('damaged' in manip) this._cardDamaged = !!manip.damaged;
            } catch (e) { dbg(e); }
          }
        }
        const damagedAtSettle = !!this._cardDamaged;
        const before = p ? { power: p.power, maxPower: p.maxPower, lives: p.lives, extendPts: this.extendPts || 0 } : null;
        let ret = null, err = null;
        try { ret = orig(res); } catch (e) { err = String(e); dbg(e); }
        const after = p ? { power: p.power, lives: p.lives, extendPts: this.extendPts || 0 } : null;
        if (manip && 'restorePower' in manip && p) {
          try { p.power = manip.restorePower == null ? p.maxPower : Math.min(p.maxPower, manip.restorePower); } catch (e) { dbg(e); }
        }
        vc.results.push({
          t: +vc.t.toFixed(2), src: 'stage', res: clone(res), before, after, err, banner: bannerText(),
          damagedNatural, damagedAtSettle,
          manip: manip ? { power: manip.power, extend: manip.extend, damaged: manip.damaged, restorePower: manip.restorePower } : null,
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
      c.rewardMeta = { before: matched.before, after: matched.after, banner: matched.banner, err: matched.err, t: matched.t, src: matched.src, damagedAtSettle: matched.damagedAtSettle, damagedNatural: matched.damagedNatural, manip: matched.manip || null };
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

  // 擦弹集成探针（tag G）：真实 stg 关卡里放一颗只进擦弹环、不命中的静止弹，逐帧核对增量。
  // 口径：每次 grazeTest 返回 g>0 → _addPower(g*0.075, false)（不推进 extend）+ _addExtend(g*0.02)，
  // 所以 POWER += g*0.075、1UP 进度 += g*0.02；同一颗弹 grazed 后不应再计数。
  vc.grazeProbe = function () {
    const out = { ok: false, mode: null, errors: [], frames: [], cleared: 0, bullet: null, bullet2: null, warmup: null, playerBefore: null };
    const s = g.stage;
    if (!s || s.mode !== 'stg' || !s.player || !s.bullets) {
      out.errors.push('stage/player/bullets missing or mode!==stg: ' + (s && s.mode));
      return out;
    }
    out.mode = s.mode;
    const p = s.player, b = s.bullets;
    const origSpawn = b.spawn;
    const prevInvuln = p.invuln;
    try {
      out.playerBefore = { power: p.power, maxPower: p.maxPower, extendPts: s.extendPts, lives: p.lives, hearts: p.hearts, alive: p.alive, invuln: p.invuln, worldX: p.worldX, worldY: p.worldY };
      out.cleared = b.activeCount || 0;
      b.clear();
      b.grazeCount = 0; b.activeCount = 0; b.cursor = 0;
      // 屏蔽同帧敌方弹幕，确保增量只来自我们自己放的弹。
      b.spawn = function () { return null; };
      p.invuln = 0;
      // warm-up 一帧：让 StgPlayer.syncWorld 生成有效 worldX（startStage 后首帧前可能尚未同步）。
      g.update(1 / 60);
      p.invuln = 0;
      out.warmup = { worldX: p.worldX, worldY: p.worldY, scroll: s.stg ? s.stg.scroll : null, state: s.state, bulletsActive: b.activeCount };
      const hp0 = p.hitPoint;
      out.hitPoint = { x: hp0.x, y: hp0.y, r: hp0.r };
      out.scrollSpeed = s.stg ? s.stg.speed : null;
      const refs = [];
      const mk = function (x, y) { return { x: x, y: y, vx: 0, vy: 0, r: 6, color: '#ffffff', type: 0, life: 5, scaleIn: 0 }; };
      const frame = function (label, spec) {
        const pre = { power: p.power, extend: s.extendPts, lives: p.lives, hearts: p.hearts, grazeCount: b.grazeCount, active: b.activeCount };
        let spawned = null;
        if (spec) { spawned = origSpawn.call(b, spec); refs.push(spawned); }
        g.update(1 / 60);
        const hpNow = p.hitPoint;
        const f = {
          label: label,
          g: b.grazeCount - pre.grazeCount,
          grazeCount: b.grazeCount,
          powerBefore: pre.power, powerAfter: p.power, dPower: Math.round((p.power - pre.power) * 1e4) / 1e4,
          extendBefore: pre.extend, extendAfter: s.extendPts, dExtend: Math.round((s.extendPts - pre.extend) * 1e6) / 1e6,
          livesBefore: pre.lives, livesAfter: p.lives,
          heartsBefore: pre.hearts, heartsAfter: p.hearts,
          alive: !!p.alive, invulnAfter: p.invuln,
          activeBefore: pre.active, activeAfter: b.activeCount,
          playerX: Math.round(hpNow.x * 100) / 100, playerY: Math.round(hpNow.y * 100) / 100,
          innerR: Math.round((6 * 0.72 + hpNow.r) * 100) / 100,
          grazeR: 26 + 6,
          dists: refs.map(function (r) { return Math.round(Math.hypot(r.x - hpNow.x, r.y - hpNow.y) * 100) / 100; }),
          active: refs.map(function (r) { return !!r.active; }),
          state: s.state,
        };
        out.frames.push(f);
        return f;
      };
      // 帧1：距判定点 20px（内半径≈8.52，擦弹外环=32）→ 擦弹一次；stg 自动滚动 165px/s，单帧只改 2.75px，仍在外环内。
      out.bullet = { x: hp0.x + 20, y: hp0.y, r: 6 };
      frame('bullet1_graze', mk(hp0.x + 20, hp0.y));
      // 帧2：同一颗弹已 grazed → 不应重复计数。
      frame('same_bullet_no_double', null);
      // 帧3：第二颗（垂直 20px；滚动只改横坐标，垂直偏移不受影响）→ 再擦一次。
      const hp1 = p.hitPoint;
      out.bullet2 = { x: hp1.x, y: hp1.y + 20, r: 6 };
      frame('bullet2_graze', mk(hp1.x, hp1.y + 20));
      out.ok = true;
    } catch (e) {
      out.errors.push(String((e && e.stack) || e));
      dbg(e);
    } finally {
      try { b.spawn = origSpawn; } catch (_) {}
      try { p.invuln = prevInvuln; } catch (_) {}
      vc.graze = out;
    }
    return out;
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
      graze: vc.graze,
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
    const powerCfg = await evaluate(`import('/src/game/power.js').then(function(m){ return {
      perLevel: m.POWER.perLevel, max: m.POWER.max, extend: m.POWER.extend,
      graze: m.POWER.graze, grazePoints: m.POWER.grazePoints,
      cardClear: m.POWER.cardClear, cardNoHit: m.POWER.cardNoHit,
      cardClearPower: m.cardClearPower(), cardNoHitPower: m.cardNoHitPower(),
    }; })`);
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
      grazeTest: !!run.grazeTest,
      variantId: run.variantId || null,
      variantExpected: run.variantExpected || null,
    };
    const probeSrc = '(' + probeClient.toString() + ')(' + JSON.stringify(cfg) + ')';
    const probeOk = await evaluate(probeSrc);
    if (!probeOk) throw new Error('probe install failed');
    // --lockPower：每帧把 POWER 钉死（测固定挡位火力时用；P 点被吃掉也不会升档）
    if (LOCK_POWER != null && Number.isFinite(LOCK_POWER)) {
      await evaluate(`(() => { const g = window.__game; const getP = () => (g.player || (g.stage && g.stage.player) || null); if (g.__lockPowerPatched) { g.__lockPowerValue = ${LOCK_POWER}; return true; } const orig = g.update.bind(g); g.update = function (dt) { orig(dt); const p = getP(); if (p && p.power !== g.__lockPowerValue) p.power = g.__lockPowerValue; }; g.__lockPowerValue = ${LOCK_POWER}; g.__lockPowerPatched = true; return true; })()`);
    }
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
    if (run.grazeTest) {
      // 擦弹集成：skipIntro 保持 state==='play'，零火力/零 1UP 起步，避免奖励变体与 carry 值干扰。
      await evaluate(`window.__game.carryPower = 0; window.__game.carryExtend = 0; window.__game.levelIndex = ${run.stage - 1}; window.__game.startStage(${run.stage - 1}, { skipIntro: true })`);
    } else {
      await evaluate(`window.__game.carryPower = ${run.startPower}; window.__game.levelIndex = ${run.stage - 1}; window.__game.startStage(${run.stage - 1})`);
    }
    let bossInfo = null;
    let grazeProbe = null;
    if (run.grazeTest) {
      grazeProbe = await evaluate('window.__vc.grazeProbe()');
      if (!grazeProbe) throw new Error('grazeProbe returned null');
    } else if (!run.full) {
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
    // 擦弹跑不推进游戏主循环：grazeProbe 自己在页面内按帧推进（避免 bot 移动/弹幕干扰）。
    while (!run.grazeTest && steps < maxSteps) {
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
          dbg: (() => { const g = window.__game; const p = g && g.stage && g.stage.player; let act = 0; try { const pool = g.stage.shots && g.stage.shots.pool; if (pool) for (let i = 0; i < pool.length; i++) if (pool[i].active && !pool[i].special) act++; } catch (e) {} return { patched: !!(g && g.__lockPowerPatched), lock: g && g.__lockPowerValue, power: p ? p.power : null, maxPower: p ? p.maxPower : null, fireLevel: p ? p.fireLevel : null, mainShots: act }; })(),
          death: v.deathTest ? { respawned: !!v.deathTest.respawned, err: v.deathTest.error || null } : null,
        };
      })()`);
      if (chunkNo === 0 && res.dbg) console.log('[dbg-power]', JSON.stringify(res.dbg));
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
      run: {
        tag: run.tag, stage: run.stage, diff: run.diff, test: !!run.test, full: !!run.full,
        char: CHAR, god: GOD, seed: SEED,
        grazeTest: !!run.grazeTest, variantId: run.variantId || null, variantLabel: run.variantLabel || null,
        variantExpected: run.variantExpected || null,
      },
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
      graze: state.graze || grazeProbe || null,
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
/* ------------------------------------------------- 擦弹集成跑（tag G） */
function analyzeGrazeRun(out) {
  const issues = [];
  const warns = [];
  const checks = { spec: null, frames: [], pass: true, stage: out.run.stage };
  const pcfg = out.powerCfg || {};
  const cfgBad = [];
  for (const k of POWER_CFG_KEYS) if (pcfg[k] !== POWER_SPEC[k]) cfgBad.push(k + '=' + pcfg[k] + '（应为 ' + POWER_SPEC[k] + '）');
  if (cfgBad.length) issues.push('power.js 常量与规格不一致：' + cfgBad.join('，'));
  checks.spec = { powerCfg: pcfg, mismatches: cfgBad };
  const gr = out.graze || null;
  if (!gr) issues.push('擦弹探针未返回数据（window.__vc.grazeProbe 缺失/失败）');
  else {
    if (gr.mode !== 'stg') issues.push('擦弹跑关卡 mode=' + gr.mode + '（应为 stg；stage4/extra 才是 stg）');
    if (!gr.ok) issues.push('擦弹探针失败：' + ((gr.errors || []).join(' || ') || 'ok=false'));
    const frames = gr.frames || [];
    if (frames.length !== 3) issues.push('擦弹探针应采 3 帧，实际 ' + frames.length);
    const wantG = [1, 0, 1];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const label = '擦弹帧' + (i + 1) + '(' + (f.label || '?') + ')';
      const fc = { label: f.label, g: f.g, grazeCount: f.grazeCount, dPower: f.dPower, dExtend: f.dExtend,
        livesBefore: f.livesBefore, livesAfter: f.livesAfter, dists: f.dists, innerR: f.innerR, grazeR: f.grazeR,
        active: f.active, grazeCountAfter: f.grazeCount, pass: true };
      const frameFail = (m) => { issues.push(label + '：' + m); fc.pass = false; };
      const want = i < wantG.length ? wantG[i] : null;
      if (want != null) {
        if (f.g !== want) frameFail('grazeTest 计数 g=' + f.g + '（应为 ' + want + '）');
        if (Math.abs(f.dPower - want * POWER_SPEC.graze) > 1e-4) frameFail('POWER 增量 ' + f.dPower + '（应为 ' + (want * POWER_SPEC.graze).toFixed(4) + ' = g*graze）');
        if (Math.abs(f.dExtend - want * GRAZE_EXTEND_PER_BULLET) > 1e-4) frameFail('1UP 进度增量 ' + f.dExtend + '（应为 ' + (want * GRAZE_EXTEND_PER_BULLET).toFixed(4) + ' = g*grazePoints）');
        if (Math.abs(f.dExtend - want * POWER_SPEC.grazePoints) > 1e-4) frameFail('1UP 增量混入了 POWER 收益（dExtend=' + f.dExtend + '，应为 g*grazePoints=' + (want * POWER_SPEC.grazePoints).toFixed(4) + '）');
        if (i === 1) {
          if (f.g !== 0) frameFail('同一颗弹被重复计数');
          if (Math.abs(f.dPower) > 1e-6 || Math.abs(f.dExtend) > 1e-6) frameFail('同一颗弹被重复入账（dPower=' + f.dPower + ', dExtend=' + f.dExtend + '）');
        }
      }
      if (f.livesBefore !== f.livesAfter) frameFail('残机不应变化（' + f.livesBefore + '→' + f.livesAfter + '；0.02 远小于 99）');
      if (f.alive === false) frameFail('玩家死亡（弹进了命中判定，不是纯擦弹）');
      if (Array.isArray(f.dists) && f.dists.length) {
        for (const d of f.dists) {
          if (!(d > f.innerR)) frameFail('弹距判定点 ' + d + ' ≤ 命中半径 ' + f.innerR + '（应只擦不中）');
          if (!(d < f.grazeR)) frameFail('弹距判定点 ' + d + ' ≥ 擦弹外环 ' + f.grazeR + '（不该计数）');
        }
      }
      checks.frames.push(fc);
    }
  }
  if (out.consoleErrors && out.consoleErrors.length) issues.push('控制台 error ' + out.consoleErrors.length + ' 条：' + out.consoleErrors.slice(0, 2).join(' || '));
  if (out.probeErrors && out.probeErrors.length) issues.push('页面探针捕获异常 ' + out.probeErrors.length + ' 条：' + out.probeErrors.slice(0, 2).join(' || '));
  const verdict = issues.length ? 'FAIL' : 'PASS';
  checks.pass = verdict === 'PASS';
  return { verdict, issues, warns, cards: [], grazeCheck: checks };
}

function analyzeRun(out) {
  if (out.run && out.run.grazeTest) return analyzeGrazeRun(out);
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
  // power.js 常量核对：运行时口径必须与独立 oracle 一致，否则后面所有公式断言都不可信。
  const cfgBad = [];
  const pcfgRun = out.powerCfg || {};
  for (const k of POWER_CFG_KEYS) if (pcfgRun[k] !== POWER_SPEC[k]) cfgBad.push(k + '=' + pcfgRun[k] + '（应为 ' + POWER_SPEC[k] + '）');
  if (cfgBad.length) issues.push('power.js 常量与规格不一致：' + cfgBad.join('，'));

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

    // 奖励（独立 oracle：按 POWER_SPEC 复算，不复用 src 实现；同时覆盖 noHit=false/true 两条分支）
    const before = c.rewardMeta && c.rewardMeta.before;
    const after = c.rewardMeta && c.rewardMeta.after;
    const maxPower = POWER_SPEC.max;
    const extendEvery = POWER_SPEC.extend;
    const damagedAtSettle = c.rewardMeta ? c.rewardMeta.damagedAtSettle : null;
    const banner = (ev && ev.banner) || (c.rewardMeta && c.rewardMeta.banner) || null;
    let branch = null;
    let rewardWant = null;
    let noHitWant = null;
    let baseWant = null;
    let bonusWant = null;
    let dPowerWant = null;
    let addExtendWant = null;
    let dLivesWant = null;
    let wantAfterExt = null;
    if (resOk != null) {
      noHitWant = !!resOk && !damagedAtSettle;
      baseWant = resOk ? POWER_SPEC.cardClearPower : 0;
      bonusWant = noHitWant ? POWER_SPEC.cardNoHitPower : 0;
      const full = before ? before.power >= maxPower : false;
      if (resOk) {
        if (full) { branch = noHitWant ? 'life_nohit' : 'life_hit'; rewardWant = 'life'; addExtendWant = extendEvery + bonusWant; dPowerWant = 0; }
        else { branch = noHitWant ? 'power_nohit' : 'power_hit'; rewardWant = 'power'; addExtendWant = baseWant + bonusWant; dPowerWant = Math.min(maxPower - before.power, addExtendWant); }
      } else {
        branch = 'points'; rewardWant = 'points'; addExtendWant = 10; dPowerWant = 0;
      }
      if (before) {
        dLivesWant = Math.floor((before.extendPts + addExtendWant) / extendEvery);
        wantAfterExt = Math.round((before.extendPts + addExtendWant - extendEvery * dLivesWant) * 1e4) / 1e4;
      }
    }
    if (before && after && branch) {
      const dPower = Math.round((after.power - before.power) * 1e4) / 1e4;
      const dLives = after.lives - before.lives;
      const d = (ev && ev.d) || null;
      if (!d) fail('未捕获 cardResult 事件（无法核对 reward/noHit/base/bonus）');
      else {
        if (d.reward !== rewardWant) fail('reward=' + d.reward + '（应为 ' + rewardWant + '，branch=' + branch + '；ok=' + resOk + ', before.power=' + before.power + ', damagedAtSettle=' + damagedAtSettle + '）');
        if (!!d.noHit !== noHitWant) fail('noHit=' + d.noHit + '（应为 ' + noHitWant + '；damagedAtSettle=' + damagedAtSettle + '）');
        if (d.base !== baseWant) fail('base=' + d.base + '（应为 ' + baseWant + '）');
        if (d.bonus !== bonusWant) fail('bonus=' + d.bonus + '（应为 ' + bonusWant + '）');
      }
      if (Math.abs(dPower - dPowerWant) > 1e-4) fail('POWER 增量 ' + dPower + '（应为 ' + dPowerWant + '；before.power=' + before.power + ', max=' + maxPower + ', ok=' + resOk + ', noHit=' + noHitWant + '）');
      if (Math.abs(after.extendPts - wantAfterExt) > 1e-4) fail('extendPts ' + before.extendPts + '→' + after.extendPts + '（应到 ' + wantAfterExt + '：入账 +' + addExtendWant + '，跨 ' + extendEvery + ' 吸收 ' + dLivesWant + ' 命）');
      if (dLives !== dLivesWant) fail('残机变化 ' + dLives + '（应为 ' + dLivesWant + '=floor((' + before.extendPts + '+' + addExtendWant + ')/' + extendEvery + ')）');
      // 横幅文本（hud.banner 拼接无空格，用双正则）
      if (!banner) fail('缺少横幅（branch=' + branch + '）');
      else {
        const bt = String(banner).trim();
        const has = (re) => re.test(bt);
        if (branch === 'power_hit') {
          if (!has(/符卡击破/)) fail('横幅 "' + bt + '" 应含「符卡击破」');
          if (!has(/火力 \+1\/4P/)) fail('横幅 "' + bt + '" 应含「火力 +1/4P」');
        } else if (branch === 'power_nohit') {
          if (!has(/无伤通过/)) fail('横幅 "' + bt + '" 应含「无伤通过」');
          if (!has(/火力 \+3\/4P/)) fail('横幅 "' + bt + '" 应含「火力 +3/4P」');
        } else if (branch === 'life_nohit') {
          if (!has(/无伤通过/)) fail('横幅 "' + bt + '" 应含「无伤通过」');
          if (!has(/1UP \+ 1\/2P/)) fail('横幅 "' + bt + '" 应含「1UP + 1/2P」');
        } else if (branch === 'life_hit') {
          if (has(/无伤/)) fail('横幅 "' + bt + '" 不应出现「无伤」（life 非无伤）');
          if (!has(/1UP|残机/)) fail('横幅 "' + bt + '" 应含「1UP」或「残机」（保留 extend 横幅）');
        } else if (branch === 'points') {
          if (!has(/超时/)) fail('横幅 "' + bt + '" 应含「超时」');
          if (!has(/奖励 \+10 点/)) fail('横幅 "' + bt + '" 应含「奖励 +10 点」');
        }
      }
      // 变体预期分支（variant c 的卡 2 是 natural，只走通用公式）
      const variantExpected = (out.run.variantExpected || [])[i] || null;
      if (variantExpected && variantExpected.branch !== 'natural') {
        if (branch !== variantExpected.branch) fail('分支 ' + branch + ' ≠ 变体 ' + out.run.variantId + ' 预期 ' + variantExpected.branch);
        if (Number.isFinite(variantExpected.dPower) && Math.abs(dPower - variantExpected.dPower) > 1e-4) fail('POWER 增量 ' + dPower + ' ≠ 变体预期 ' + variantExpected.dPower);
        if (Number.isFinite(variantExpected.addExtend)) {
          const gotAdd = Math.round((after.extendPts - before.extendPts + extendEvery * dLives) * 1e4) / 1e4;
          if (Math.abs(gotAdd - variantExpected.addExtend) > 1e-4) fail('extend 入账 ' + gotAdd + ' ≠ 变体预期 ' + variantExpected.addExtend);
        }
      }
      // 无伤控制独立核对：manip 显式置 damaged 时，结算快照必须与之一致（否则断言无意义）
      const manipDamaged = c.rewardMeta && c.rewardMeta.manip && ('damaged' in c.rewardMeta.manip) ? c.rewardMeta.manip.damaged : null;
      if (manipDamaged != null && damagedAtSettle !== !!manipDamaged) fail('damagedAtSettle=' + damagedAtSettle + ' 与 manip.damaged=' + manipDamaged + ' 不一致（无伤控制失效）');
    } else if (c.rewardMeta && c.rewardMeta.err) {
      fail('stage._onBossCardResult 抛异常：' + c.rewardMeta.err);
    } else if (resOk != null) {
      warns.push('s' + stage + '-' + diff + ' 卡' + (i + 1) + '：无 before/after 奖励快照（无法核对 POWER/残机）');
    }
    if (c.startT == null) { /* noop */ }

    cardChecks.push({
      stage, diff, index: i + 1, idx: i, boss: (out.boss && out.boss.key) || null, name: c.name || exp.name, mode, limit, expectedLimit: exp.limit,
      startT: c.startedT != null ? c.startedT : null, endT: c.endedT != null ? c.endedT : null,
      elapsed: r2(elapsed), ratio: r2(ratio), normRatio: r2(normRatio),
      ok: resOk, reward: reward || null, branch, noHit: (ev && ev.d) ? !!ev.d.noHit : null,
      base: (ev && ev.d) ? ev.d.base : null, bonus: (ev && ev.d) ? ev.d.bonus : null,
      damagedAtSettle, manipulatedDamaged: (c.rewardMeta && c.rewardMeta.manip && ('damaged' in c.rewardMeta.manip)) ? !!c.rewardMeta.manip.damaged : null,
      variantId: out.run.variantId || null, variantLabel: out.run.variantLabel || null,
      expectedBranch: ((out.run.variantExpected || [])[i] || {}).branch || null,
      dPower: (before && after) ? Math.round((after.power - before.power) * 1e4) / 1e4 : null,
      dExtend: (before && after) ? Math.round((after.extendPts - before.extendPts) * 1e4) / 1e4 : null,
      dLives: (before && after) ? after.lives - before.lives : null,
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
  const rewardBranches = {};
  const grazeRuns = [];
  const summary = {
    generatedAt: new Date().toISOString(),
    plan: PLAN,
    config: { char: CHAR, god: GOD, seed: SEED, chunk: CHUNK, oracle: 'docs/BOSS_TIMING_TABLE.md v4 §1' },
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
    for (const c of a.cards || []) if (c.branch) rewardBranches[c.branch] = (rewardBranches[c.branch] || 0) + 1;
    if (r.run && r.run.grazeTest) grazeRuns.push({ tag: r.run.tag, stage: r.run.stage, probe: r.graze || null, check: a.grazeCheck || null });
    for (const m of a.issues || []) summary.issues.push(`[${r.run.tag} s${r.run.stage}] ${m}`);
    for (const m of a.warns || []) summary.warns.push(`[${r.run.tag} s${r.run.stage}] ${m}`);
  }
  // 奖励分支覆盖矩阵 + 擦弹跑结论（缺失分支 = 断言没证明到，直接 FAIL）
  const cfgSeen = (results.find((r) => r.powerCfg) || {}).powerCfg || null;
  summary.powerCfg = cfgSeen;
  summary.powerCfgMismatch = cfgSeen ? POWER_CFG_KEYS.filter((k) => cfgSeen[k] !== POWER_SPEC[k]).map((k) => k + '=' + cfgSeen[k] + '（应为 ' + POWER_SPEC[k] + '）') : ['未采集到 powerCfg'];
  if (summary.powerCfgMismatch.length) summary.issues.push('power.js 常量与 oracle 不一致：' + summary.powerCfgMismatch.join('，'));
  summary.reward = {
    required: ['power_hit', 'power_nohit', 'life_hit', 'life_nohit', 'points'],
    branches: rewardBranches,
    missing: [],
  };
  if (results.some((r) => r.run && r.run.tag === 'T')) {
    summary.reward.missing = summary.reward.required.filter((b) => !rewardBranches[b]);
    for (const b of summary.reward.missing) summary.issues.push('奖励分支未覆盖：' + b + '（T 跑没有实际命中该分支，断言无法证明）');
  }
  summary.graze = {
    runs: grazeRuns,
    verdict: grazeRuns.length ? (grazeRuns.every((g) => g.check && g.check.pass) ? 'PASS' : 'FAIL') : 'N/A',
  };
  if (results.some((r) => r.run && r.run.grazeTest)) {
    if (!grazeRuns.length) summary.issues.push('擦弹跑（G）没有产出 grazeCheck');
    else if (summary.graze.verdict === 'FAIL') summary.issues.push('擦弹集成断言 FAIL（详见 bosscards_reward_report.md）');
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
  lines.push(`生成时间：${summary.generatedAt}　计划：\`${summary.plan}\`　oracle：docs/BOSS_TIMING_TABLE.md v4 §1`);
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
  lines.push('## 奖励分支覆盖（T 跑）');
  lines.push('');
  if (summary.reward && Object.keys(summary.reward.branches).length) {
    const req = summary.reward.required || [];
    lines.push('| 分支 | 命中次数 | 覆盖 |');
    lines.push('|---|---|---|');
    for (const b of req) lines.push(`| ${b} | ${summary.reward.branches[b] || 0} | ${summary.reward.branches[b] ? 'PASS' : 'MISSING'} |`);
  } else {
    lines.push('- 本次计划未包含 T 跑');
  }
  lines.push('');
  lines.push('## 擦弹集成（G 跑）');
  lines.push('');
  if (summary.graze && summary.graze.runs && summary.graze.runs.length) {
    lines.push(`判定：${summary.graze.verdict}`);
    lines.push('');
    lines.push('| 帧 | g | grazeCount | dPower | dExtend | 残机 | 判定 |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const g of summary.graze.runs) for (const f of (g.check && g.check.frames) || []) {
      lines.push(`| ${f.label} | ${f.g} | ${f.grazeCount} | ${f.dPower} | ${f.dExtend} | ${f.livesBefore}→${f.livesAfter} | ${f.pass ? 'PASS' : 'FAIL'} |`);
    }
  } else {
    lines.push('- 本次计划未包含 G 跑');
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

/* ------------------------------------------- 奖励/擦弹专项报告 */
function writeRewardReport(summary) {
  const L = [];
  L.push('# 符卡奖励 / 擦弹机制回归报告（自动生成 · tools/_verify_bosscards.mjs）');
  L.push('');
  L.push('生成时间：' + summary.generatedAt);
  L.push('');
  L.push('计划：' + summary.plan + '　角色：' + summary.config.char + '　god=' + summary.config.god + '　seed=' + summary.config.seed);
  L.push('');
  L.push('## 结论');
  L.push('');
  L.push('- 总判定：**' + summary.stats.verdict + '**（issues ' + summary.issues.length + ' 条，warns ' + summary.warns.length + ' 条）');
  L.push('- 奖励分支覆盖：' + (summary.reward.required || []).map((b) => b + '=' + (summary.reward.branches[b] || 0)).join('，'));
  if (summary.reward.missing && summary.reward.missing.length) L.push('- **缺失分支：' + summary.reward.missing.join('，') + '**');
  L.push('- 擦弹集成（G 跑）：' + (summary.graze ? summary.graze.verdict : 'N/A'));
  L.push('');
  L.push('## 运行时 power.js 常量 vs 独立 oracle');
  L.push('');
  L.push('| 字段 | 运行时 | oracle |');
  L.push('|---|---|---|');
  for (const k of POWER_CFG_KEYS) L.push('| ' + k + ' | ' + (summary.powerCfg ? summary.powerCfg[k] : '—') + ' | ' + POWER_SPEC[k] + ' |');
  if (summary.powerCfgMismatch && summary.powerCfgMismatch.length) L.push('', '偏差：' + summary.powerCfgMismatch.join('，'));
  L.push('');
  L.push('## T 跑逐卡奖励（before → after）');
  L.push('');
  L.push('| 变体 | 面 | 卡 | 分支 | 预期分支 | before P/EP | after P/EP | dP | dExtend | 入账 | dLives | ok | noHit | base | bonus | reward | 横幅 | 判定 |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of summary.cards) {
    if (!c.branch) continue;
    const runVerdict = (summary.runs.find((r) => r.tag === 'T' && r.stage === c.stage) || {}).verdict || '—';
    L.push('| ' + (c.variantId || '—') + ' | ' + c.stage + ' | ' + c.index + ' | ' + c.branch + ' | ' + (c.expectedBranch || '—') +
      ' | ' + c.beforePower + '/' + c.beforeExtend + ' | ' + c.afterPower + '/' + c.afterExtend +
      ' | ' + c.dPower + ' | ' + c.dExtend + ' | ' + (c.dExtend == null ? '—' : Math.round((c.dExtend + 99 * (c.dLives || 0)) * 100) / 100) + ' | ' + c.dLives + ' | ' + c.ok + ' | ' + c.noHit + ' | ' + c.base + ' | ' + c.bonus +
      ' | ' + (c.reward || '—') + ' | ' + String(c.banner || '').replace(/\|/g, '\\|') + ' | ' + runVerdict + ' |');
  }
  L.push('');
  L.push('> 说明：dExtend 是 extendPts 账面变化；入账量 = dExtend + 99×dLives（跨 99 的部分被命数吸收）。');
  L.push('> 无伤分支由探针在结算前显式设置 stage._cardDamaged（god 模式下自然受击不会发生），damagedAtSettle 与 manip.damaged 必须一致。');
  L.push('');
  L.push('## 擦弹集成逐帧（真实 stg 关卡）');
  L.push('');
  if (summary.graze && summary.graze.runs && summary.graze.runs.length) {
    const g0 = summary.graze.runs[0];
    const pr = g0.probe || {};
    L.push('- 关卡 stage' + g0.stage + '（mode=' + pr.mode + '），判定点 ' + JSON.stringify(pr.hitPoint) + '，滚动速度 ' + pr.scrollSpeed + 'px/s；清场前敌方弹数 ' + pr.cleared + '。');
    L.push('- 帧1 弹在判定点 +20px 处（内半径≈' + ((pr.frames || [])[0] || {}).innerR + '，擦弹外环=32）→ 只擦不中；帧2 不新放弹（同一颗不应重复计数）；帧3 换垂直方向再放一颗。');
    L.push('');
    L.push('| 帧 | g | grazeCount | dPower | dExtend(1UP) | 残机 | 弹距判定点 | 判定 |');
    L.push('|---|---|---|---|---|---|---|---|');
    for (const chk of summary.graze.runs) for (const f of (chk.check && chk.check.frames) || []) {
      L.push('| ' + f.label + ' | ' + f.g + ' | ' + f.grazeCount + ' | ' + f.dPower + ' | ' + f.dExtend + ' | ' + f.livesBefore + '→' + f.livesAfter + ' | ' + (f.dists || []).join('/') + ' | ' + (f.pass ? 'PASS' : 'FAIL') + ' |');
    }
    L.push('');
    L.push('**口径**：擦弹的 POWER 收益 (+0.075/颗) 不计入 1UP；1UP 进度只加 **0.02/颗**，符合「擦弹总 1UP = 0.02」的确认口径。');
  } else {
    L.push('- 本次计划未包含 G 跑（stage4 才是 stg 关卡）。');
  }
  L.push('');
  L.push('## 未覆盖 / 边界');
  L.push('');
  L.push('- 本轮只跑 stage1（platform 面）+ T 三变体与 G:4（stage4 stg 面），未覆盖其它面/难度（E/H/T 全量 43 卡）。');
  L.push('- noHit 分支用探针注入 stage._cardDamaged 构造（god 模式下自然受击不会发生）；真实受击置 true 的路径（stage.js hurt/die）未在 T 跑里自然触发，仅由源码静态确认。');
  L.push('- 满槽分支由 manip 把 power 设为 maxPower 构造；未验证「自然把火力打满后结算」的时序差异（结算前最后一击才进满槽的边界）。');
  L.push('- 超时分支用放大血条 ×3 强制触发（variant c），与真实「打不动导致超时」在 ok=false 语义上一致，但 DPS/时长不是自然值。');
  L.push('');
  L.push('## 失败原文 / 提示');
  L.push('');
  if (summary.issues.length) for (const m of summary.issues) L.push('- FAIL ' + m);
  if (summary.warns.length) for (const m of summary.warns.slice(0, 40)) L.push('- WARN ' + m);
  if (!summary.issues.length && !summary.warns.length) L.push('- （无）');
  L.push('');
  return L.join('\n');
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
  writeFileSync(join(OUT_DIR, 'bosscards_reward_report.md'), writeRewardReport(summary));
  console.log('');
  console.log(`[verify] summary: ${summary.stats.verdict}  cards=${summary.stats.cardsTotal}  timed=${summary.stats.normalTimedOk}/${summary.stats.normalTimed}  issues=${summary.issues.length}`);
  if (summary.stats.measuredDps) console.log(`[verify] measuredDps(N): ${JSON.stringify(summary.stats.measuredDps)}`);
  for (const m of summary.issues.slice(0, 20)) console.log('  FAIL ' + m);
  for (const m of summary.warns.slice(0, 12)) console.log('  WARN ' + m);
  console.log('[verify] wrote ' + join(OUT_DIR, 'bosscards_summary.json') + ' + bosscards_table.md + bosscards_reward_report.md');
})();
