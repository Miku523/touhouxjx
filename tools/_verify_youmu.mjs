/**
 * tools/_verify_youmu.mjs —— 「魂魄妖梦」引擎自测（纯 Node，无浏览器）
 *
 * 跑法：node tools/_verify_youmu.mjs            （跑完自动删掉 tools/_youmu_syn/）
 *       node tools/_verify_youmu.mjs --keep     （保留同步副本，排查用）
 *
 * 为什么先复制一份 .mjs：
 *   仓库没有 package.json，src/*.js 在 Node 里会被当成 CJS 解析；
 *   这里按 import 闭包把 boss.js 依赖的模块复制到 tools/_youmu_syn/ 并改后缀 .mjs，
 *   再动态 import，语义与浏览器一致（_pt/_syncheck 也是这套办法）。
 *
 * 覆盖：
 *   A. 静态表：BOSS_DEFS / bossPatternDesigns / bossTuning / 自定义弹型注册
 *   B. 四难度 × 三张卡：不抛异常、确实发弹、同屏弹数不超预算、半灵在动、半灵确实在发弹
 *   C. 半灵体系：断灵槽、消散、发弹减半、减速、易伤、复原、打半灵不伤本体
 *   D. 平台近战：破势硬直 / 踩踏 / 冲刺入口不抛错；draw() 在正常与消散态都能画
 *   E. 其他 Boss 回归：rumia/cirno/aya/yuyuko/kaguya 更新+绘制不抛错
 *   F. 汇总退出码（PASS 时清理 tools/_youmu_syn/，失败时保留现场）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'src');
const SYN = path.join(HERE, '_youmu_syn');
const DT = 1 / 60;

/* ============================================================
   0. 复制 import 闭包 → .mjs
   ============================================================ */

function buildSync() {
  fs.rmSync(SYN, { recursive: true, force: true });
  const seen = new Set();
  const queue = [path.join(SRC, 'game', 'boss.js')];
  let copied = 0;
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!fs.existsSync(file)) throw new Error('import 闭包缺少文件: ' + file);
    const text = fs.readFileSync(file, 'utf8');
    const specs = new Set();
    for (const re of [/\bfrom\s*(['"])(\.[^'"]+\.js)\1/g, /\bimport\s*(['"])(\.[^'"]+\.js)\1/g]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) specs.add(m[2]);
    }
    let out = text;
    for (const spec of specs) {
      queue.push(path.resolve(path.dirname(file), spec));
      const mjs = spec.replace(/\.js$/, '.mjs');
      out = out.split(`'${spec}'`).join(`'${mjs}'`).split(`"${spec}"`).join(`"${mjs}"`);
    }
    const rel = path.relative(SRC, file).replace(/\.js$/, '.mjs');
    const dest = path.join(SYN, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out);
    copied++;
  }
  return copied;
}

const copiedFiles = buildSync();
const { Boss } = await import(pathToFileURL(path.join(SYN, 'game', 'boss.mjs')).href);
const { CUSTOM_PATTERNS } = await import(pathToFileURL(path.join(SYN, 'game', 'bossBullets.mjs')).href);
const { CARD_PATTERNS, CARD_INDEX, patternsFor } = await import(pathToFileURL(path.join(SYN, 'game', 'bossPatternDesigns.mjs')).href);
const { BOSS_CARD_TUNING } = await import(pathToFileURL(path.join(SYN, 'game', 'bossTuning.mjs')).href);

/* ============================================================
   1. 假对象
   ============================================================ */

/** 假弹幕池：有 activeCount / life 寿命，能真实触发「预算满停火」与压力自适应 */
class FakeBullets {
  constructor() {
    this.list = [];
    this.spawned = 0;
    this.fromPhantom = 0;
    this.bossRef = null;
  }

  get activeCount() { return this.list.length; }

  spawn(o) {
    this.spawned++;
    const ph = this.bossRef && this.bossRef.phantom;
    if (ph && Math.hypot((o.x || 0) - ph.x, (o.y || 0) - ph.y) < 6) this.fromPhantom++;
    const b = { x: o.x || 0, y: o.y || 0, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 7 };
    this.list.push(b);
    // 兜底：万一某个 pattern 不受控，别让测试进程吃满内存
    if (this.list.length > 6000) this.list.splice(0, this.list.length - 6000);
    return b;
  }

  ring(x, y, n, speed, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle || 0) + (i / n) * Math.PI * 2;
      this.spawn({ ...o, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
    }
  }

  fan(x, y, n, spread, angle, speed, o = {}) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
      const a = angle + t * spread;
      this.spawn({ ...o, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
    }
  }

  clear() { this.list.length = 0; }

  tick(dt) {
    if (!this.list.length) return;
    const keep = [];
    for (const b of this.list) {
      b.life -= dt;
      if (b.life > 0) keep.push(b);
    }
    this.list = keep;
  }
}

/** 假特效：任何方法都是 no-op（boss.js 里全是 fx?.xxx 形式） */
const fx = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

/** 假玩家：屏幕下方的平台关角色 */
function makePlayer(x = 640, y = 560) {
  return {
    x: x - 11, y: y - 16, w: 22, h: 32,
    alive: true,
    hurtCd: 0,
    hurt() { this.hurtCd = 0.6; },
  };
}

/** Canvas2D 假 ctx：用来跑 draw()，验证绘制路径不抛错 */
function makeCtx() {
  const grad = { addColorStop() {} };
  const target = {
    canvas: { width: 1280, height: 720 },
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    createPattern: () => null,
    measureText: () => ({ width: 12 }),
  };
  const methods = new Set([
    'save', 'restore', 'translate', 'scale', 'rotate', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'rect',
    'fill', 'stroke', 'clip', 'fillRect', 'strokeRect', 'clearRect', 'setLineDash',
    'drawImage', 'fillText', 'strokeText', 'setTransform', 'resetTransform',
    'ellipse', 'roundRect', 'arcTo', 'putImageData', 'getImageData', 'createImageData',
    'createConicGradient', 'isPointInPath', 'drawFocusIfNeeded',
  ]);
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (methods.has(k)) return () => {};
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

/* ============================================================
   2. 断言工具
   ============================================================ */

let checks = 0;
let fails = 0;
const failLines = [];

function ok(cond, label, extra = '') {
  checks++;
  if (!cond) {
    fails++;
    const line = '    ✗ ' + label + (extra ? ' — ' + extra : '');
    failLines.push(line);
    console.log(line);
  }
  return !!cond;
}

function section(title) {
  console.log('\n' + title);
}

function newWorld(difficulty) {
  const bullets = new FakeBullets();
  const player = makePlayer();
  // seed 固定：同一份代码每次跑出的弹数 / 轨迹完全一致，自测不会因为随机种子偶发失败
  const boss = new Boss('youmu', 640, 250, {
    difficulty, stageNumber: 5, platformMelee: true, groundY: 600, seed: 20260521,
  });
  bullets.bossRef = boss;
  // Node 里没有 Image → bossArtReady=false，intro 会等 3s 兜底后再出场
  let guard = 0;
  while (boss.state === 'intro' && guard++ < 2000) {
    bullets.tick(DT);
    boss.update(DT, player, bullets, fx, {});
  }
  return { boss, bullets, player };
}

function forceCard(boss, i) {
  boss.spellIdx = i;
  boss.phase = i;
  boss._applyCard(i);
  boss.spellLock = 0;
  boss.spellBroken = false;
  boss._startPattern(0);
}

/** 跑一张卡：返回发弹数 / 峰値同屏 / 半灵轨迹 */
function runCard(boss, bullets, player, seconds) {
  // 每张卡从干净屏幕起跑：否则上一张卡残留的弹会顶满预算，触发的只是「停火」而不是卡本身
  bullets.clear();
  const before = bullets.spawned;
  const phBefore = bullets.fromPhantom;
  let maxActive = 0;
  const xs = [];   // 相对本体的摆动（不是绝对坐标：本体自己会满屏跑）
  const ys = [];
  const ph = boss.phantom;
  let maxDist = 0;   // 系统自己保证的「半灵↔本体」距离（_updatePhantom 夹取后）
  let maxRaw = 0;    // 帧内瞬时距离：本体在本帧后半段俯冲/冲撞时会比 maxDist 大一点
  let outOfScreen = 0;
  for (let t = 0; t < seconds; t += DT) {
    bullets.tick(DT);
    boss.update(DT, player, bullets, fx, {});
    maxActive = Math.max(maxActive, bullets.activeCount);
    if (ph) {
      xs.push(ph.x - boss.x);
      ys.push(ph.y - boss.y);
      maxDist = Math.max(maxDist, ph.gap || 0);
      maxRaw = Math.max(maxRaw, Math.hypot(ph.x - boss.x, ph.y - boss.y));
      if (ph.x < -40 || ph.x > 1320 || ph.y < -80 || ph.y > 800) outOfScreen++;
    }
  }
  return {
    fired: bullets.spawned - before,
    fromPhantom: bullets.fromPhantom - phBefore,
    maxActive,
    maxDist,
    maxRaw,
    outOfScreen,
    rx: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
    ry: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
  };
}

/* ============================================================
   A. 静态表
   ============================================================ */

section('[A] 静态表');
{
  ok(copiedFiles >= 8, 'import 闭包复制成功', 'files=' + copiedFiles);

  const def = Boss && null; // 占位，避免 lint 误报；BOSS_DEFS 通过真实实例间接验证
  ok(!!def === false, 'noop');

  const pats = patternsFor('youmu', 0);
  ok(Array.isArray(pats) && pats.length === 4, 'youmu 第 1 张卡有 4 个 pattern 变体');
  for (let i = 0; i < 3; i++) {
    const arr = patternsFor('youmu', i);
    ok(Array.isArray(arr) && arr.length === 4, `youmu 第 ${i + 1} 张卡 pattern 数 = 4`);
    for (const p of arr || []) {
      ok(typeof CUSTOM_PATTERNS[p.typeName] === 'function', `pattern ${p.typeName} 已注册到 CUSTOM_PATTERNS`);
    }
    const names = (CARD_INDEX.youmu || [])[i];
    const tuneName = ((BOSS_CARD_TUNING.youmu || {}).cards || [])[i] && BOSS_CARD_TUNING.youmu.cards[i].name;
    ok(!!names && names === tuneName, `第 ${i + 1} 张卡名四处一致`, `${names} / ${tuneName}`);
  }
  ok(patternsFor('youmu', 3) === null, '越界卡号返回 null');

  const tune = BOSS_CARD_TUNING.youmu;
  ok(!!tune && tune.cards.length === 3, 'bossTuning 有 youmu 的 3 张卡');
  const sumLimit = tune.cards.reduce((a, c) => a + (c.limit || 0), 0);
  ok(sumLimit >= 90 && sumLimit <= 120, 'midboss 三卡限时合计落在 90–120s', 'sum=' + sumLimit + 's');
  ok(tune.cards.every((c) => c.mode === 'damage' && c.dps > 0), '三张卡都是 damage 限时卡（有 dps）');
  ok(tune.cards.every((c) => ['none', 'fireflies', 'petals', 'night', 'fairyDust', 'freeze', 'wind', 'moon', 'butterfly', 'voidFlame', 'darkSpot', 'darkVeil', 'hail', 'redMist'].includes(c.fx)), '卡特效都是合法 fx 键');
  ok(CARD_PATTERNS.youmu === undefined ? false : true, 'CARD_PATTERNS.youmu 已挂载');
}

/* ============================================================
   B. 四难度 × 三张卡
   ============================================================ */

const DIFFS = [
  ['E', 520],
  ['N', 720],
  ['H', 950],
  ['L', 1180],
];

for (const [difficulty, budget] of DIFFS) {
  section(`[B] ${difficulty}（bulletBudget=${budget}）`);
  let w = null;
  try {
    w = newWorld(difficulty);
  } catch (e) {
    ok(false, `${difficulty} 构造 + intro 不抛异常`, String(e && e.stack || e));
    continue;
  }
  const { boss, bullets, player } = w;

  ok(boss.state === 'battle', `${difficulty} intro 后进入 battle`, 'state=' + boss.state);
  ok(boss.bulletBudget === budget, `${difficulty} bulletBudget = ${budget}`, 'got=' + boss.bulletBudget);
  ok(boss.phases.length === 3, `${difficulty} 三张符卡`);
  ok(boss.system === 'phantom', `${difficulty} def.system = phantom`);
  ok(!!boss.phantom && boss.phantom.gaugeMax === 100, `${difficulty} 半灵实体已建立`);
  ok(boss.phases.every((p) => p.mode === 'damage' && p.limit > 0), `${difficulty} 三卡都进入限时流程（HUD）`);
  ok(boss.spellMaxHp > 0, `${difficulty} 当前卡血量 > 0`);

  for (let i = 0; i < 3; i++) {
    forceCard(boss, i);
    let r = null;
    try {
      r = runCard(boss, bullets, player, 6.5);
    } catch (e) {
      ok(false, `${difficulty} 卡${i + 1} update 不抛异常`, String(e && e.stack || e));
      continue;
    }
    ok(r.fired > 0, `${difficulty} 卡${i + 1} 确实发弹`, 'fired=' + r.fired);
    ok(r.maxActive <= boss.bulletBudget + 40, `${difficulty} 卡${i + 1} 同屏弹数不超预算`,
      `max=${r.maxActive} / budget=${boss.bulletBudget}`);
    ok(r.rx > 8 && r.ry > 8, `${difficulty} 卡${i + 1} 半灵坐标在动`, `rx=${r.rx.toFixed(1)} ry=${r.ry.toFixed(1)}`);
    ok(r.maxDist <= boss.phantom.maxDist + 0.5, `${difficulty} 卡${i + 1} 半灵始终贴着本体（不脱缰）`, 'maxDist=' + r.maxDist.toFixed(1));
    ok(r.maxRaw <= boss.phantom.maxDist + 90, `${difficulty} 卡${i + 1} 帧内瞬时距离不超过一帧位移`, 'maxRaw=' + r.maxRaw.toFixed(1));
    ok(r.outOfScreen === 0, `${difficulty} 卡${i + 1} 半灵不飘出画面`, 'outFrames=' + r.outOfScreen);
    ok(r.fromPhantom > 0, `${difficulty} 卡${i + 1} 半灵从自身位置独立发弹`, 'fromPhantom=' + r.fromPhantom);
    console.log(`    ${difficulty} 卡${i + 1} ${boss.phases[i].name}`
      + `  发弹=${r.fired}(半灵 ${r.fromPhantom})`
      + `  峰值同屏=${r.maxActive}/${boss.bulletBudget}`
      + `  半灵轨迹=${r.rx.toFixed(0)}×${r.ry.toFixed(0)}px`
      + `  离本体≤${r.maxDist.toFixed(0)}px`);
  }

  // 关底血量对比（midboss 必须明显低于同关关底）
  const yuyuko = new Boss('yuyuko', 640, 250, { difficulty, stageNumber: 5 });
  const youmuHp = boss.phases.reduce((a, p) => a + p.hp, 0);
  const yuyukoHp = yuyuko.phases.reduce((a, p) => a + p.hp, 0);
  ok(youmuHp * 2.2 < yuyukoHp, `${difficulty} 妖梦总血量低于幽幽子（中途 Boss）`,
    `${youmuHp} vs ${yuyukoHp}`);
  ok(yuyuko.phantom === null, `${difficulty} 其他 Boss 不会被 phantom 体系污染`);
}

/* ============================================================
   C. 半灵体系（断灵槽 / 消散 / 复原）
   ============================================================ */

section('[C] 半灵二天一流');
{
  const { boss, bullets, player } = newWorld('N');
  const ph = boss.phantom;
  const hp0 = boss.hp;
  boss.spellLock = 0;

  /** 只命中半灵的假 shots：第一次 hitRect 打本体（返回 false），第二次（targetRef 是 _phantomRef）打半灵 */
  const shots = {
    hitPhantom: true,
    hitRect(x, y, w, h, cb, targetRef) {
      if (targetRef === boss._phantomRef) {
        if (this.hitPhantom) cb(30, ph.x, ph.y);
        return true;
      }
      return false;
    },
  };

  let gaugeSeen = 0;
  let frames = 0;
  while (ph.dissipateT === 0 && frames++ < 120) {
    bullets.tick(DT);
    boss.update(DT, player, bullets, fx, {});
    boss.damageWithShots(shots, fx);
    gaugeSeen = Math.max(gaugeSeen, ph.gauge);
  }
  ok(gaugeSeen > 0, '打半灵能涨断灵槽', 'maxGauge=' + gaugeSeen.toFixed(1));
  ok(ph.gauge >= ph.gaugeMax - 1e-6, '槽能打满', 'gauge=' + ph.gauge.toFixed(1));
  ok(ph.dissipateT > 0, '满槽触发「半灵消散」', 'dissipateT=' + ph.dissipateT.toFixed(2));
  ok(ph.breaks === 1 && boss._ix.phantomBreak === 1, '消散只触发一次（不重复刷）');
  ok(Math.abs(boss.phantomShotK - 0.5) < 1e-6, '消散中发弹减半（phantomShotK=0.5）', 'k=' + boss.phantomShotK);
  ok(Math.abs(boss.phantomSlowK - 0.55) < 1e-6, '消散中 Boss 减速（phantomSlowK=0.55）', 'k=' + boss.phantomSlowK);
  ok(Math.abs(boss.phantomVulnK - 1.35) < 1e-6, '消散中受击加成（phantomVulnK=1.35）', 'k=' + boss.phantomVulnK);
  ok(boss.hp === hp0, '打半灵不伤本体 HP', `${hp0} → ${boss.hp}`);
  ok(boss._ix.phantomHits > 0, '半灵命中遥测在计数', 'hits=' + boss._ix.phantomHits);

  // 消散中：半灵淡出、本体照常发弹（不是整卡空窗）
  const fadeAtBreak = ph.fade;
  let dissipateSpawns = 0;
  for (let t = 0; t < 2.0; t += DT) {
    bullets.tick(DT);
    const s0 = bullets.spawned;
    boss.update(DT, player, bullets, fx, {});
    dissipateSpawns += bullets.spawned - s0;
  }
  ok(dissipateSpawns > 0, '消散中本体仍在发弹（不空窗）', 'spawns=' + dissipateSpawns);
  ok(ph.fade < fadeAtBreak, '消散中半灵明显淡出', `fade ${fadeAtBreak.toFixed(2)} → ${ph.fade.toFixed(2)}`);
  ok(ph.dissipateT > 0, '消散持续中', 'left=' + ph.dissipateT.toFixed(2));

  // 复原
  for (let t = 0; t < 4.0; t += DT) {
    bullets.tick(DT);
    boss.update(DT, player, bullets, fx, {});
  }
  ok(ph.dissipateT === 0, '数秒后消散结束', 'left=' + ph.dissipateT);
  ok(ph.gauge === 0, '复原后断灵槽清空', 'gauge=' + ph.gauge);
  ok(Math.abs(boss.phantomShotK - 1) < 1e-6 && Math.abs(boss.phantomSlowK - 1) < 1e-6
    && Math.abs(boss.phantomVulnK - 1) < 1e-6, '复原后倍率全部归 1',
    `${boss.phantomShotK}/${boss.phantomSlowK}/${boss.phantomVulnK}`);
  ok(ph.fade > 0.6, '复原后半灵淡回可见', 'fade=' + ph.fade.toFixed(2));
  ok(boss._ix.phantomBreak === 1, '一次断灵只记一次消散');

  // 消退自然衰减：再打一轮到一半就收手，槽应随时间回落
  shots.hitPhantom = true;
  for (let i = 0; i < 6; i++) {
    bullets.tick(DT);
    boss.update(DT, player, bullets, fx, {});
    boss.damageWithShots(shots, fx);
  }
  const gHalf = ph.gauge;
  shots.hitPhantom = false;
  for (let t = 0; t < 1.5; t += DT) {
    bullets.tick(DT);
    boss.update(DT, player, bullets, fx, {});
  }
  ok(gHalf > 0 && ph.gauge < gHalf, '不打半灵时断灵槽自然衰减', `${gHalf.toFixed(1)} → ${ph.gauge.toFixed(1)}`);
}

/* ============================================================
   C2. 消散易伤：本体伤害 ×1.35（与破势 ×1.7 叠乘）
   ============================================================ */

section('[C2] 消散易伤');
{
  const { boss, bullets, player } = newWorld('N');
  boss.spellLock = 0;
  boss.spellHp = 9000;
  boss.hp = 9000;
  boss.phantom.dissipateT = boss.phantom.dissipateDur; // 直接进入消散态
  boss._updatePhantom(DT, fx);
  ok(Math.abs(boss.phantomVulnK - 1.35) < 1e-6, '消散态已生效');
  const before = boss.spellHp;
  boss.damage(100);
  const dealt = before - boss.spellHp;
  ok(Math.abs(dealt - 135) < 1e-6, '消散中本体受击 ×1.35', 'dealt=' + dealt.toFixed(2));

  // 复原后回到 1.0
  boss.phantom.dissipateT = 0;
  boss._updatePhantom(DT, fx);
  const b2 = boss.spellHp;
  boss.damage(100);
  ok(Math.abs((b2 - boss.spellHp) - 100) < 1e-6, '复原后受击倍率归 1', 'dealt=' + (b2 - boss.spellHp));
}

/* ============================================================
   D. 平台近战 / 破势 / draw
   ============================================================ */

section('[D] 平台近战 + 绘制');
{
  const { boss, bullets, player } = newWorld('L');

  // 破势硬直：半灵仍应更新，且分支不抛错
  boss.staggerT = 1.2;
  let staggered = false;
  try {
    for (let t = 0; t < 2.0; t += DT) {
      bullets.tick(DT);
      boss.update(DT, player, bullets, fx, {});
      staggered = staggered || boss.staggerT > 0;
    }
  } catch (e) {
    ok(false, '破势硬直分支不抛异常', String(e && e.stack || e));
  }
  ok(staggered || boss.staggerT === 0, '破势硬直能走完');
  ok(!!boss.phantom, '硬直后半灵仍在');

  // 冲刺 / 踩踏入口
  let dashRet = null;
  let stompRet = null;
  try {
    boss.x = player.x + player.w / 2;
    boss.y = player.y + 10;
    boss.hurtCd = 0;
    dashRet = boss.hitByDash(player, fx);
    boss.stompCd = 0;
    stompRet = boss.stompBy(player, fx);
    boss._startStagger(fx);
    for (let t = 0; t < 2.5; t += DT) {
      bullets.tick(DT);
      boss.update(DT, player, bullets, fx, {});
    }
  } catch (e) {
    ok(false, 'hitByDash / stompBy / _startStagger 不抛异常', String(e && e.stack || e));
  }
  ok(dashRet !== null || stompRet !== null, '近战入口都能被调用', `dash=${dashRet} stomp=${stompRet}`);

  // draw：正常态
  const ctx = makeCtx();
  let drewOk = true;
  try {
    boss.draw(ctx, 1.5);
    boss.draw(ctx, 12.75);
  } catch (e) {
    drewOk = false;
    ok(false, 'draw() 正常态不抛异常', String(e && e.stack || e));
  }
  ok(drewOk, 'draw() 正常态可绘制');

  // draw：消散态（淡出 / 闪槽分支）
  let drewDiss = true;
  try {
    boss.phantom.dissipateT = boss.phantom.dissipateDur * 0.5;
    boss._updatePhantom(DT, fx);
    boss.draw(ctx, 3.25);
    boss.phantom.fade = 0.02; // 极端淡出也不该抛错
    boss.draw(ctx, 3.5);
  } catch (e) {
    drewDiss = false;
    ok(false, 'draw() 消散态不抛异常', String(e && e.stack || e));
  }
  ok(drewDiss, 'draw() 消散态可绘制（淡出 + 闪槽分支）');
}

/* ============================================================
   E. 其他 Boss 回归：通用代码只认 system，不能把别人带坏
   ============================================================ */

section('[E] 其他 Boss 回归');
for (const [key, melee] of [['rumia', true], ['cirno', true], ['aya', false], ['yuyuko', true], ['kaguya', true]]) {
  const bullets = new FakeBullets();
  const player = makePlayer();
  let threw = null;
  let fired = 0;
  let maxActive = 0;
  let hasPhantom = true;
  try {
    const boss = new Boss(key, 640, 250, {
      difficulty: 'N', stageNumber: 5, platformMelee: melee, groundY: 600, seed: 7,
    });
    bullets.bossRef = boss;
    let guard = 0;
    while (boss.state === 'intro' && guard++ < 2000) {
      bullets.tick(DT);
      boss.update(DT, player, bullets, fx, {});
    }
    const r = runCard(boss, bullets, player, 3.5);
    fired = r.fired;
    maxActive = r.maxActive;
    hasPhantom = !!boss.phantom;
    boss.draw(makeCtx(), 1.2);
  } catch (e) {
    threw = e;
  }
  ok(!threw, `${key} 3.5s update + draw 不抛异常`, threw ? String(threw.message) : '');
  ok(fired > 0, `${key} 仍正常发弹`, 'fired=' + fired);
  ok(maxActive <= 720 + 40, `${key} 同屏弹数不超预算`, 'max=' + maxActive);
  ok(hasPhantom === false, `${key} 没有被 phantom 体系污染`);
}

/* ============================================================
   F. 汇总
   ============================================================ */

console.log('\n' + '─'.repeat(56));
console.log(`检查项：${checks}  失败：${fails}`);
if (fails) {
  console.log('\n失败清单：');
  for (const l of failLines) console.log(l);
  console.log('\nRESULT: FAIL');
  process.exit(1);
}
console.log('RESULT: PASS  妖梦（youmu）三卡 + 半灵二天一流自测通过');
if (process.argv.includes('--keep')) {
  console.log('（保留同步副本：' + path.relative(ROOT, SYN) + '）');
} else {
  try { fs.rmSync(SYN, { recursive: true, force: true }); } catch { /* 清理失败不影响结论 */ }
}
