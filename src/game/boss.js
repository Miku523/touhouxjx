/**
 * Boss：七位东方角色，参数化的弹幕模式 + 阶段系统。
 *
 * 设计上把「弹幕模式」抽象成一组带参数的类型
 * （ring / fan / aimed / spiral / rain / homing / laser / scatter / spray / cross），
 * Boss 定义里只写参数表，执行器统一处理计时与发射。这样七个 Boss 的差异全靠数据表达。
 *
 * 随机性（v2）：
 *   - 每场战斗一个种子（`?seed=123` 可复现），随机只在「开火 / 换招 / 选点」三个瞬间发生，
 *     帧循环里不新增随机开销，性能与原来一致；
 *   - 每招在开局时抽出一次「招式变体」（弹数倍率 / 速度倍率 / 扇形倍率 / 转速与方向 / 环数），
 *     每次开火再叠一层小抖动：弹数、初速、发射角、瞄准偏移都不完全一样；
 *   - 招式不再按数组顺序轮播，而是按 weight 随机抽取，且不会连续抽到同一招；
 *     每招持续 4.2–8.6 秒随机，阶段越靠后、血量越低，随机幅度越大（wild 系数）；
 *   - Boss 不再做固定正弦漂浮，而是在出生点附近的安全框里随机选点移动，偶尔短冲刺；
 *   - 每 8–15 秒随机触发一次「变招」：2–3 波计划外的环 / 扇 / 散射叠在主弹幕上。
 *     所有随机量都有上下限（瞄准抖动 ≤ 0.2 rad、弹数倍率 ≤ 1.3、有总弹数保护），
 *     保证不会出现「必死墙」，只是没法再靠背板过关。
 */

import { BOSS_INFO } from '../art/roster.js';
import { drawGenBoss, ensureBossArt, bossArtHeight, bossArtReady } from '../art/genboss.js';
import { getDifficulty, bossPhasesFor, scaleBossHp, stageDensityOf } from './difficulty.js';
import { scalePlayerDamage } from './balance.js';
// 逐卡限时 / 生存模式 / 卡面数据（43 张符卡的目标时长与创作数据）
import { cardTuningFor, tierMultipliers, CARD_HP_ANCHOR, finalHpMulFor, cardAvgRuntimeHp, MINIBOSS_CARD_SHARE } from './bossTuning.js';
// 创造模式弹幕设计（每卡专属 pattern 表 + 自定义弹型注册表）
import { patternsFor } from './bossPatternDesigns.js';
import { CUSTOM_PATTERNS } from './bossBullets.js';
import { skinMapper, cardSkin } from './bulletArt/cardSkins.js';
// 咲夜专有弹型：七色飞刀（设计稿 _sakuya_design/DESIGN.md §2）
import { B_KNIFE } from './bulletArt/types.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ============================================================
   EXTRA 关逐卡色相偏移（雷米莉亚 / 芙兰朵露）
   —— 内置弹幕的颜色写在 BOSS_DEFS 的 phases 里，这里只在取色时转一次 HSL：
      弹道、弹数、速度一律不动，12 张卡在「血族猩红」母题下各有基调。
      [色相偏移(度), 亮度偏移(HSL 百分数), 饱和度偏移]
   ============================================================ */
const EX_TINT = {
  remilia: [
    [0, 0, 0],        // 咒诅「弗拉德·特佩斯」：纯猩红
    [8, 5, 0],        // 天罚「大卫之星」：略偏洋红、更亮
  ],
  flandre: [
    [0, 0, 0],        // 蔓越莓陷阱
    [12, -2, 0.06],   // 雷瓦汀：偏向火焰橙
    [-16, 2, 0.04],   // 四重存在：偏紫
    [6, -9, 0.02],    // 然后就一个人都不剩了：暗血
    [20, 3, 0],       // 星弧破碎：珊瑚
    [-28, 6, 0.02],   // 折反射：洋红
    [2, 8, 0.04],     // 495 年的波纹：浅玫瑰
    [-6, -10, 0.05],  // 吸血鬼之宴：深血
    [30, -2, 0.06],   // 破坏之瞳：偏金橙
    [-34, 8, 0.02],   // 明けない夜の約束：血红偏紫的夜
  ],
};

/* ============================================================
   咲夜的七色飞刀色板（_sakuya_design/DESIGN.md §二「七色飞刀」）
   —— 七色同时是「时间刻度」和弹幕分组：同一拍的七把刀互不重色，
      玩家可以拿颜色读节奏。只给 sakuya 的 pattern 用，其它 Boss 不引用。
   ============================================================ */
const SAKUYA_KNIFE_COLORS = [
  '#ff3b4e', // I   绯红：直冲扇形快刃
  '#ff8a3d', // II  琥珀：延迟弹
  '#ffd24a', // III 鎏金：追踪刃
  '#35e08c', // IV  翡翠：减速带
  '#3fd8ff', // V   青：环形散射
  '#4c7bff', // VI  湛蓝：激光式直刃
  '#a86bff', // VII 紫罗兰：时停静止弹
];

function hexToRgbArr(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbArrToHex(c) {
  const f = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + f(c[0]) + f(c[1]) + f(c[2]);
}

function rgbToHslArr(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgbArr(h, s, l) {
  if (s <= 0.001) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** 内置弹幕取色：EXTRA 关按卡号做 HSL 偏移，其余 Boss 原样返回 */
function tintCardColor(boss, color) {
  const table = EX_TINT[boss && boss.key];
  if (!table || typeof color !== 'string' || color[0] !== '#') return color;
  const t = table[boss.spellIdx] || table[0];
  if (!t || (!t[0] && !t[1] && !t[2])) return color;
  const [h0, s0, l0] = rgbToHslArr(hexToRgbArr(color));
  const h = (h0 + t[0] / 360 + 1) % 1;
  const s = clamp(s0 + t[2], 0.05, 1);
  const l = clamp(l0 + t[1] / 100, 0.06, 0.98);
  return rgbArrToHex(hslToRgbArr(h, s, l));
}

/* ============================================================
   随机数：mulberry32
   —— 每场战斗独立种子，`?seed=` 或 globalThis.__HKS_BOSS_SEED 可复现
   ============================================================ */

let battleSeq = 0;

function fixedSeed() {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const q = new URLSearchParams(location.search).get('seed');
      if (q != null && q !== '') {
        const n = Number(q);
        if (Number.isFinite(n)) return n >>> 0;
      }
    }
    if (typeof globalThis !== 'undefined' && globalThis.__HKS_BOSS_SEED != null) {
      const n = Number(globalThis.__HKS_BOSS_SEED);
      if (Number.isFinite(n)) return n >>> 0;
    }
  } catch {
    /* 某些沙箱没有 location / URLSearchParams */
  }
  return null;
}

function nextBattleSeed() {
  const fixed = fixedSeed();
  if (fixed != null) return fixed;
  battleSeq = (battleSeq + 1) >>> 0;
  return ((Date.now() ^ (Math.random() * 0xffffffff)) + battleSeq * 0x9e3779b9) >>> 0;
}

/* ============================================================
   弹幕模式执行器
   每种模式是「每隔 rate 秒发射一次」的发射器：
     ring    {n, speed, color, rate, r, turn, spinAngle, rings}
     fan     {n, spread, speed, color, rate, angle, aimed, r, wobble}
     aimed   {n, spread, speed, color, rate, r}
     spiral  {arms, speed, color, rate, spin, r}
     rain    {n, speed, color, rate, r, spreadX}
     homing  {n, speed, color, rate, r, homing}
     laser   {n, speed, color, rate, r, angle}
     scatter {n, speed, color, rate, r, aimed, arc}     随机方向/速度
     spray   {n, speed, color, rate, r, aimed, arc, wave} 贴脸随机连撒
     cross   {n, dirs, spread, speed, color, rate, r, aimed} 多向扇
     cage    {n, gaps, radius, gapFrac, speed, spin} 以玩家为圆心的缺口围栏（结界）
     petal   {petals, n, speed, curl, spin}          旋转花瓣弧（瓣心快/瓣尖慢）
     meteor  {n, delay, spread, burstN, burstSpeed}  坠落大玉，到点爆裂成环
     snake   {n, speed, amp, freq}                   正弦摆动的蛇形连续流
     mine    {n, delay, burstN, speed, turn}         漂浮泡弹，到点分裂成小环
     arc     {n, arcs, gap, turn, speed, aimed}      左右反向转弯的交叉弧
     spiralPulse {arms, spin, pulse, curl, speed}    双反向螺旋 + 速度脉冲

     新增语法一律复用既有冰晶弹型，不新画一套美术：
       cage / arc  = 宝石（B_CIRCLE）做的结界与弧线
       petal       = 雪花 / 冰花（B_STAR）做花瓣
       snake       = 冰棱（B_RICE）做蛇鳞
       meteor/mine = 冰花外壳（B_BIG）炸裂成冰棱碎片（B_RICE），对应原作的「大玉→米弹」分裂
   ============================================================ */

function firePattern(p, boss, api, fireT) {
  const b = api.bullets;
  // 同屏弹数预算：满了就整招停火，等旧弹飞走（最硬的「有缝」护栏）
  if (!b || b.activeCount >= boss.bulletBudget) return;

  const px = api.px;
  const py = api.py;
  const pat = boss._pat;
  const wild = boss.wild;
  // 卡面主色（创造模式逐卡配色）：没写逐卡色才回落到角色主色
  const color = tintCardColor(boss, p.color || boss.cardAccent || boss.accent);
  const r = p.r || 6;
  const life = p.life || 7;
  const type = p.type !== undefined ? p.type : 0;

  // 速度：招式变体倍率 + 每发小抖动，再夹到难度给出的单发速度上限。
  // 逐卡弹速倍率（如文「风神少女」的加速卡）允许把上限放宽 15%，保证「明显更快」手感。
  const speedCap = boss.speedCap * ((boss.cardSpeedMul || 1) > 1 ? 1.15 : 1);
  const varySpeed = (base, k = 1) =>
    Math.min(speedCap, Math.max(20, (base || 120) * pat.speedScale * k * (boss.cardSpeedMul || 1) * boss.rnd(0.9, 1.08)));
  // 瞄准抖动：wild 越高越飘，但上限 0.2 rad（约 11°），不会变成无解散射
  const aimJitter = clamp(0.04 + wild * 0.09, 0.04, 0.2);
  const aim = () => Math.atan2(py - boss.y, px - boss.x) + boss.rnd(-aimJitter, aimJitter);
  // 弹数：招式变体 + 每发抖动 + 屏幕密度自适应（越满越薄）
  // 半灵体系（def.system='phantom'）额外乘 phantomShotK：半灵消散时本体发弹减半，
  // 这是「打满断灵槽」对弹幕密度的唯一直接影响，其他卡不受影响（默认 1）。
  const shotK = boss.phantomShotK || 1;
  const count = (base, lo = 1, hi = 64) =>
    clamp(Math.round((base || 1) * pat.nScale * boss.pressure * shotK * boss.rnd(0.94, 1.06)), lo, hi);
  // 环状弹幕的缝隙保障：同样半径下相邻两发的弧长不小于 ringGapPx，
  // 否则一圈会缩成没有缝的墙（人形判定半径 7，两发半径 6 需要约 26px 间距）
  const ringN = (base, lo = 1, hi = 64) => {
    const n = count(base, lo, hi);
    return clamp(n, lo, Math.min(hi, boss.ringLimit));
  };

  // 创造模式自定义弹型：注册在 bossBullets.js 的 CUSTOM_PATTERNS 里，
  // 命中即整招交给自定义实现；统一 helpers 保证弹数预算 / 环缝 / 弹速上限这些护栏仍然生效。
  // 符卡专属弹型：整招（自定义 + 内置 + EXTRA 关底）统一接管 bullets.spawn 的弹型。
  // 只在「这一拍开火」内生效，出作用域就清空：弹池是全场共用的，留着会污染道中妖精弹。
  // meteor / mine 的延迟爆裂在 Boss.update 的 _processLater 里另行套同一张映射（见 update）。
  b.skinMap = skinMapper(boss.key, boss.spellIdx);
  try {
  const customFn = p.typeName ? CUSTOM_PATTERNS[p.typeName] : null;
  if (typeof customFn === 'function') {
    try {
      customFn(p, boss, {
        bullets: b, px, py, color, r, life, type, pat, wild, fireT,
        helpers: { TAU, clamp, rnd: (a, b) => boss.rnd(a, b), rndInt: (a, b) => boss.rndInt(a, b), aim, varySpeed, count, ringN },
      }, fireT);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[boss] custom pattern failed', p.typeName, e);
    }
    return;
  }

  if (p.typeName === 'ring') {
    const n = ringN(p.n || 12, 1, 56);
    const rings = clamp(Math.round((p.rings || 1) * pat.ringScale), 1, 4);
    const spin = (p.spinAngle || 0) * pat.dir;
    for (let k = 0; k < rings; k++) {
      const a0 = pat.angle + fireT * spin
        + (rings > 1 ? k * boss.rnd(0.25, 1.2) : 0)
        + boss.rnd(-0.05, 0.05);
      b.ring(boss.x, boss.y, n, varySpeed(p.speed, 1 + k * boss.rnd(0.02, 0.12)), {
        color, r, type, life, angle: a0,
        turn: (p.turn || 0) * pat.dir,
      });
    }
  }

  if (p.typeName === 'fan') {
    const n = count(p.n || 5, 1, 32);
    const spread = (p.spread || 0.8) * pat.spreadScale * boss.rnd(0.86, 1.15);
    const base = p.aimed
      ? aim()
      : ((p.angle !== undefined ? p.angle : Math.PI / 2) + boss.rnd(-0.45, 0.45) * wild);
    b.fan(boss.x, boss.y, n, spread, base, varySpeed(p.speed), {
      color, r, type, life,
      wobbleAmp: (p.wobble || 0) * pat.wobbleScale,
      wobbleFreq: 4,
    });
  }

  if (p.typeName === 'aimed') {
    const n = count(p.n || 1, 1, 24);
    const spread = (p.spread || 0.32) * pat.spreadScale * boss.rnd(0.85, 1.18);
    const base = aim();
    for (let i = 0; i < n; i++) {
      const tt = n === 1 ? 0 : (i / (n - 1)) - 0.5;
      const a = base + tt * spread + boss.rnd(-0.04, 0.04);
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * varySpeed(p.speed, boss.rnd(0.96, 1.05)),
        vy: Math.sin(a) * varySpeed(p.speed, boss.rnd(0.96, 1.05)),
        color, r, type, life,
      });
    }
  }

  if (p.typeName === 'spiral') {
    const arms = clamp(Math.round((p.arms || 3) * pat.armScale), 1, 12);
    const spin = (p.spin || 2.2) * pat.dir;
    const a0 = pat.angle + fireT * spin;
    for (let i = 0; i < arms; i++) {
      const a = a0 + (i / arms) * TAU + boss.rnd(-0.04, 0.04);
      const sp = varySpeed(p.speed, boss.rnd(0.94, 1.07));
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color, r, type, life,
      });
    }
  }

  if (p.typeName === 'rain') {
    const n = count(p.n || 3, 1, 16);
    const spreadX = (p.spreadX || 900) * pat.spreadScale * boss.rnd(0.78, 1.22);
    for (let i = 0; i < n; i++) {
      const x = boss.x + (boss.rnd(-0.5, 0.5)) * spreadX;
      const sp = varySpeed(p.speed);
      b.spawn({
        x, y: boss.y - 260,
        vx: boss.rnd(-55, 55),
        vy: sp,
        color, r, type, life: p.life || 8,
      });
    }
  }

  if (p.typeName === 'homing') {
    const n = count(p.n || 1, 1, 12);
    for (let i = 0; i < n; i++) {
      const a = aim() + boss.rnd(-0.42, 0.42);
      const sp = varySpeed(p.speed, boss.rnd(0.92, 1.08));
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color, r: r + 2, type, life: 6,
        homing: (p.homing || 1.4) * boss.rnd(0.85, 1.2),
      });
    }
  }

  if (p.typeName === 'laser') {
    const n = count(p.n || 1, 1, 12);
    const base = aim() + (p.angle || 0) + boss.rnd(-0.1, 0.1);
    const gap = boss.rnd(0.16, 0.28);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * gap;
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * varySpeed(p.speed, 1),
        vy: Math.sin(a) * varySpeed(p.speed, 1),
        color, r: 5, type: 1, life: 4,
        rot: a, spin: 0,
      });
    }
  }

  if (p.typeName === 'scatter') {
    // 完全随机方向 + 随机速度：最不可预测的一招，但弹数少、速度上限低
    const n = count(p.n || 10, 1, 28);
    const base = p.aimed ? aim() : 0;
    const arc = p.arc || Math.PI;
    for (let i = 0; i < n; i++) {
      const a = p.aimed
        ? base + boss.rnd(-arc * 0.5, arc * 0.5)
        : boss.rnd(0, TAU);
      const sp = varySpeed(p.speed, boss.rnd(0.55, 1.45));
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color, r, type, life,
      });
    }
  }

  if (p.typeName === 'spray') {
    // 快速随机连撒：每发方向都在弧内重掷，像一蓬乱飞的虫/雪
    const n = clamp(Math.round((p.n || 2) * boss.rnd(0.5, 1.6)), 1, 6);
    const arc = p.arc || 0.9;
    const wave = Math.sin(fireT * (p.wave || 1.6)) * arc * 0.55;
    const base = (p.aimed ? Math.atan2(py - boss.y, px - boss.x) : pat.angle) + wave + boss.rnd(-0.2, 0.2);
    for (let i = 0; i < n; i++) {
      const a = base + boss.rnd(-arc, arc);
      const sp = varySpeed(p.speed, boss.rnd(0.75, 1.2));
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color, r, type, life,
      });
    }
  }

  if (p.typeName === 'cross') {
    // 多向扇：dirs 个方向各自打一束小扇形，是本作招牌「十字/星芒」起手。
    // 数据契约见文件头：cross {n, dirs, spread, speed, color, rate, r, aimed}
    const dirs = clamp(Math.round(p.dirs || 4), 1, 12);
    const n = count(p.n || 1, 1, 8);
    const spread = (p.spread || 0.35) * pat.spreadScale * boss.rnd(0.9, 1.1);
    // aim() 对准玩家时整组扇面跟着玩家转；否则绕 pat.angle 均匀铺开，可缓慢自转
    const base = p.aimed
      ? aim() - Math.PI / 2
      : pat.angle + fireT * (p.spin || 0) * pat.dir + (p.offset || 0);
    for (let d = 0; d < dirs; d++) {
      const center = base + (d / dirs) * TAU;
      for (let i = 0; i < n; i++) {
        const tt = n === 1 ? 0 : (i / (n - 1)) - 0.5;
        const a = center + tt * spread + boss.rnd(-0.03, 0.03);
        const sp = varySpeed(p.speed, boss.rnd(0.95, 1.06));
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          color, r, type, life,
        });
      }
    }
  }

  if (p.typeName === 'bloom') {
    // 冰花绽放：多圈不同弹型错位展开，一圈大一码、一圈小一码
    const rings = clamp(Math.round(p.rings || 3), 1, 4);
    const n = ringN(p.n || 10, 4, 40);
    const spin = (p.spinAngle || 0.12) * pat.dir;
    const t0 = pat.angle + fireT * spin;
    for (let k = 0; k < rings; k++) {
      const a0 = t0 + (k / rings) * TAU * (p.twist || 0.18) + boss.rnd(-0.03, 0.03);
      const sp = varySpeed(p.speed * (1 - k * 0.18));
      const alt = k % 2 === 1;
      const ty = alt && p.typeAlt !== undefined ? p.typeAlt : type;
      const rr = alt ? Math.max(4, r - 2) : r;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU;
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          color, r: rr, type: ty, life,
          rot: a, spin: (alt ? -0.7 : 0.5) * pat.dir,
          scaleIn: 0.22,
        });
      }
    }
  }

  if (p.typeName === 'vortex') {
    // 涡旋：带转向的螺旋臂，飞出去会拐弯
    const arms = clamp(Math.round((p.arms || 3) * pat.armScale), 1, 10);
    const spin = (p.spin || 2.0) * pat.dir;
    const a0 = pat.angle + fireT * spin;
    for (let i = 0; i < arms; i++) {
      const a = a0 + (i / arms) * TAU + boss.rnd(-0.04, 0.04);
      const sp = varySpeed(p.speed, boss.rnd(0.94, 1.06));
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color, r, type, life,
        turn: (p.turn || 1.1) * pat.dir,
      });
    }
  }

  if (p.typeName === 'sweep') {
    // 扫射：一条持续旋转的光束，弹数极少但存在感强
    const n = count(p.n || 1, 1, 4);
    const base = pat.angle + fireT * (p.speedTurn || 1.6) * pat.dir;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.16;
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * varySpeed(p.speed || 520, 1),
        vy: Math.sin(a) * varySpeed(p.speed || 520, 1),
        color, r: p.r || 5, type: 1, life: 4,
        rot: a, spin: 0,
      });
    }
  }

  if (p.typeName === 'cage') {
    // 围栏：以玩家为圆心摆一圈「向内收」的弹墙，留 gaps 个缺口。
    // 缺口随每次开火缓慢转动，玩家必须移动到缺口或主动穿缝。
    const R = clamp(p.radius || 240, 140, 320);
    // 一圈的弹数受圆弧间距约束（ringGapPx），再夹到难度 ringLimit
    const gapPxN = Math.floor((TAU * R) / boss.ringGapPx);
    const n = clamp(Math.round(count(p.n || 18, 6, 48)), 6, Math.min(gapPxN, 48, boss.ringLimit));
    const gaps = clamp(Math.round(p.gaps || 2), 1, 4);
    const gapN = Math.max(2, Math.round(n * clamp(p.gapFrac || 0.14, 0.08, 0.3)));
    const base = boss.rnd(0, TAU) + fireT * (p.spin || 0.35) * pat.dir;
    const sp = varySpeed(p.speed || 92);
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * TAU;
      // 判断这点落在哪个缺口里（圆上角距）
      let blocked = false;
      for (let g = 0; g < gaps; g++) {
        const g0 = base + (g / gaps) * TAU;
        const d = Math.abs(((a - g0 + Math.PI * 3) % TAU) - Math.PI);
        if (d < (gapN / n) * TAU * 0.55) { blocked = true; break; }
      }
      if (blocked) continue;
      const sx = px + Math.cos(a) * R;
      const sy = py + Math.sin(a) * R;
      const inward = Math.atan2(py - sy, px - sx);
      b.spawn({
        x: sx, y: sy,
        vx: Math.cos(inward) * sp,
        vy: Math.sin(inward) * sp,
        color, r, type, life: Math.min(life, Math.max(1.5, R / sp + 0.4)),
        rot: inward,
      });
    }
  }

  if (p.typeName === 'petal') {
    // 花瓣弧：每瓣是一条「中间快、两端慢」的弧形弹带，整朵花缓慢旋转。
    const petals = clamp(Math.round((p.petals || 4) * pat.armScale), 3, 7);
    const per = count(p.n || 3, 2, 8);
    const base = pat.angle + fireT * (p.spin || 0.9) * pat.dir;
    const sp0 = varySpeed(p.speed || 118, 1);
    for (let k = 0; k < petals; k++) {
      const a0 = base + (k / petals) * TAU;
      const turn = (p.curl || 0.55) * (k % 2 === 0 ? 1 : -1) * pat.dir;
      for (let i = 0; i < per; i++) {
        const tt = per === 1 ? 0 : i / (per - 1) - 0.5;
        const a = a0 + tt * (TAU / petals) * 0.62;
        // 瓣心快、瓣尖慢：轮廓看起来像一层薄花瓣而不是均匀扇
        const kk = 0.55 + 0.45 * Math.cos(tt * Math.PI);
        const sp = Math.min(boss.speedCap, Math.max(20, sp0 * kk * boss.rnd(0.96, 1.04)));
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color, r: Math.max(4, r - 1),
          type: p.type !== undefined ? p.type : 3,
          life, turn: turn * (0.5 + Math.abs(tt)), rot: a, scaleIn: 0.25,
        });
      }
    }
  }

  if (p.typeName === 'meteor') {
    // 坠落爆裂：从玩家上方砸下「壳弹」，到点后在壳弹当前位置炸一圈碎片。
    // 壳弹速度按「距离 / 延迟」反算，保证整招时间稳定；爆裂用 _scheduleLater 排队。
    const n = clamp(Math.round((p.n || 2) * boss.pressure * boss.rnd(0.85, 1.2)), 1, 5);
    const delay = clamp(p.delay || 1.3, 0.6, 2.2);
    const spreadPx = clamp(p.spread || 180, 60, 320);
    for (let i = 0; i < n; i++) {
      const tx = px + boss.rnd(-spreadPx, spreadPx);
      const ty = py + boss.rnd(-spreadPx * 0.55, spreadPx * 0.55);
      const sx = tx + boss.rnd(-24, 24);
      const sy = ty - 300;
      const dx = tx - sx;
      const dy = ty - sy;
      const dist = Math.hypot(dx, dy) || 1;
      const sp = Math.min(boss.speedCap, Math.max(45, dist / delay));
      const vx = (dx / dist) * sp;
      const vy = (dy / dist) * sp;
      const shell = b.spawn({
        x: sx, y: sy, vx, vy,
        color, r: Math.max(7, r + 2), type: 2,
        life: delay + 0.6, rot: Math.atan2(dy, dx), scaleIn: 0.18,
      });
      const ex0 = sx, ey0 = sy;
      boss._scheduleLater(delay, (api2) => {
        const bl = api2?.bullets;
        const alive = shell && shell.life > 0;
        const ex = alive ? shell.x : ex0 + vx * delay;
        const ey = alive ? shell.y : ey0 + vy * delay;
        if (alive) shell.life = 0;
        if (!bl) return;
        const room = (bl.activeCount || 0);
        let m = clamp(Math.round((p.burstN || 8) * boss.pressure), 5, 18);
        // 预算护栏：别让一次爆裂把同屏弹数顶穿
        if (room + m > boss.bulletBudget) m = boss.bulletBudget - room;
        if (m < 4) return;
        const bsp = Math.min(boss.speedCap, (p.burstSpeed || 118) * pat.speedScale);
        // 壳（大玉）炸成米弹碎片：原作的「大玉分裂」手感
        bl.ring(ex, ey, m, bsp, {
          color, r: Math.max(4, r - 1),
          type: p.burstType !== undefined ? p.burstType : 1,
          life: 3.4, turn: 0.35 * pat.dir,
        });
      });
    }
  }

  if (p.typeName === 'snake') {
    // 波动蛇形：一串弹沿正弦摆动的基准角连发，每发再带同向曲率，连成蛇身。
    const n = count(p.n || 2, 1, 8);
    const freq = p.freq || 2.2;
    const wave = Math.sin(fireT * freq * Math.PI);
    const amp = clamp((p.amp || 0.7) * pat.spreadScale * (0.85 + 0.35 * Math.sin(fireT * 0.7)), 0.15, 1.1);
    const base = pat.angle + wave * amp * pat.dir;
    const sp = varySpeed(p.speed || 128, 1);
    const curl = Math.cos(fireT * freq * Math.PI) * amp * 1.15 * pat.dir;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.085;
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp * boss.rnd(0.95, 1.05),
        vy: Math.sin(a) * sp * boss.rnd(0.95, 1.05),
        color, r, type, life, turn: curl, rot: a,
      });
    }
  }

  if (p.typeName === 'mine') {
    // 漂浮分裂：慢速大弹飘出去，延迟后原地炸成小环。
    const n = clamp(Math.round((p.n || 3) * boss.pressure * boss.rnd(0.85, 1.2)), 1, 8);
    const delay = clamp(p.delay || 1.5, 0.8, 3);
    for (let i = 0; i < n; i++) {
      const a = pat.angle + (i / n) * TAU + boss.rnd(-0.22, 0.22);
      const sp = Math.min(boss.speedCap, Math.max(24, (p.speed || 46) * pat.speedScale));
      const vx = Math.cos(a) * sp;
      const vy = Math.sin(a) * sp;
      const sx0 = boss.x, sy0 = boss.y;
      const shell = b.spawn({
        x: sx0, y: sy0, vx, vy,
        color, r: Math.max(6, r + 2), type: 2,
        life: delay + 0.5, turn: (p.turn || 0.3) * pat.dir, rot: a, scaleIn: 0.3,
      });
      boss._scheduleLater(delay, (api2) => {
        const bl = api2?.bullets;
        const alive = shell && shell.life > 0;
        const ex = alive ? shell.x : sx0 + vx * delay;
        const ey = alive ? shell.y : sy0 + vy * delay;
        if (alive) shell.life = 0;
        if (!bl) return;
        const room = (bl.activeCount || 0);
        let m = clamp(Math.round((p.burstN || 10) * boss.pressure), 6, 20);
        if (room + m > boss.bulletBudget) m = boss.bulletBudget - room;
        if (m < 5) return;
        const bsp = Math.min(boss.speedCap, (p.burstSpeed || 132) * pat.speedScale);
        // 泡弹炸成米弹小环，与 meteor 同一套分裂语言
        bl.ring(ex, ey, m, bsp, {
          color, r: Math.max(4, r - 1),
          type: p.burstType !== undefined ? p.burstType : 1,
          life: 3.2, turn: 0.45 * pat.dir,
        });
      });
    }
  }

  if (p.typeName === 'arc') {
    // 交叉弧：左右两束扇形弹各自反向转弯，飞出去后在半空交叉成网。
    const arcs = clamp(Math.round((p.arcs || 2) * boss.rnd(0.9, 1.2)), 2, 4);
    const n = count(p.n || 4, 2, 9);
    const base = pat.angle + (p.aimed ? aim() : 0);
    const step = clamp((p.gap || 0.55) * pat.spreadScale, 0.18, 1.1);
    for (let k = 0; k < arcs; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      const a0 = base + side * (0.12 + k * step) + boss.rnd(-0.03, 0.03);
      const sp = varySpeed(p.speed || 148, boss.rnd(0.94, 1.06));
      const turn = (p.turn || 1.0) * side * pat.dir;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.05;
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color, r, type, life, turn, rot: a,
        });
      }
    }
  }

  if (p.typeName === 'spiralPulse') {
    // 双螺旋脉冲：两股反向螺旋对转，速度随脉冲节奏一涨一落。
    const arms = clamp(Math.round((p.arms || 2) * pat.armScale), 1, 8);
    const spin = (p.spin || 2.6) * pat.dir;
    const a0 = pat.angle + fireT * spin;
    const a1 = pat.angle - fireT * spin * 1.15;
    const pulse = 0.62 + 0.38 * Math.abs(Math.sin(fireT * (p.pulse || 2.4)));
    for (let s = 0; s < 2; s++) {
      const base = s === 0 ? a0 : a1;
      const sgn = s === 0 ? 1 : -1;
      for (let i = 0; i < arms; i++) {
        const a = base + (i / arms) * TAU;
        const sp = varySpeed(p.speed || 138, pulse * boss.rnd(0.97, 1.03));
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color, r, type, life,
          turn: (p.curl || 0.22) * sgn * pat.dir, rot: a,
        });
      }
    }
  }

  if (p.typeName === 'sakuyaClock') {
    // 咲夜专有：七色飞刀「钟面刻度」—— 按 12 个钟点（每 30°）成组射出，
    // 颜色按 I–XII 轮转 SAKUYA_KNIFE_COLORS；多环时外环错开半格、略慢，
    // 内环先到、外环后压，读起来像表盘在走。
    // 整环随时间旋转（turn 正 = 顺时针），玩家必须逆时针穿行才找得到缝。
    // 只出现在 sakuya 的卡里；其它 Boss 不会用到这个 typeName。
    const n = ringN(p.n || 12, 4, 24);
    const rings = clamp(Math.round((p.rings || 1) * pat.ringScale), 1, 4);
    const spin = (p.turn != null ? p.turn : 0.22) * pat.dir;
    const a0 = pat.angle + fireT * spin;
    for (let k = 0; k < rings; k++) {
      const base = a0 + (k * TAU) / (n * 2);
      const sp = varySpeed(p.speed || 150, 1 - k * 0.08);
      for (let i = 0; i < n; i++) {
        const a = base + (i / n) * TAU;
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color: SAKUYA_KNIFE_COLORS[(i + k) % SAKUYA_KNIFE_COLORS.length],
          r, type, life, rot: a,
          turn: (p.curve || 0) * pat.dir,
        });
      }
    }
  }
  /* ---------- 咲夜四条卡专属（_sakuya_design/DESIGN.md §2 七色飞刀） ---------- */

  if (p.typeName === 'sakuyaFan') {
    // 银符主招：五连扇形银刃（设计稿 §2-1，±14° 的窄扇）。
    // 刀尖朝速度方向（autoSpin），一排刀推出去像一手牌甩开。
    const n = count(p.n || 5, 3, 9);
    const spread = clamp(p.spread || 0.49, 0.2, 1.2) * pat.spreadScale;
    const base = pat.angle + (p.aimed ? aim() : 0);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (spread / (n - 1));
      const sp = varySpeed(p.speed || 300);
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: p.color || '#eef2ff', r, type, life, rot: a,
      });
    }
  }

  if (p.typeName === 'sakuyaSeven') {
    // 七色环：12 个钟点各射一把刀，颜色按刻度轮转；**每种颜色一种弹道**——
    // 绯红快直 / 琥珀越飞越快 / 鎏金追踪 / 翡翠减速 / 青绕圈 / 湛蓝激光直刃 / 紫罗兰时停。
    // 设计稿的核心玩法就是「拿颜色读弹道」，所以同名不同色绝对不共用参数。
    const n = ringN(p.n || 12, 6, 24);
    const rings = clamp(Math.round((p.rings || 1) * pat.ringScale), 1, 3);
    const spin = (p.turn != null ? p.turn : 0.1) * pat.dir;
    const a0 = pat.angle + fireT * spin;
    const baseSp = p.speed || 150;
    for (let k = 0; k < rings; k++) {
      const off = (k * TAU) / (n * 2);
      for (let i = 0; i < n; i++) {
        const idx = (i + k * 3) % SAKUYA_KNIFE_COLORS.length;
        const col = SAKUYA_KNIFE_COLORS[idx];
        const a = a0 + off + (i / n) * TAU;
        let sp = baseSp * (1 - k * 0.1);
        let lf = life;
        let turn = p.curve || 0;
        let accel = 0;
        let homing = 0;
        let hold = 0;
        switch (idx) {
          case 0: sp *= 1.9; break;                        // I   绯红：直冲快刃
          case 1: sp *= 0.55; accel = 150; break;          // II  琥珀：延迟弹（越飞越快）
          case 2: homing = 1.1; break;                     // III 鎏金：追踪刃
          case 3: sp *= 0.5; lf += 1.6; break;             // IV  翡翠：减速带
          case 4: turn = 1.1 * pat.dir; break;             // V   青：环形散射（原地兜圈）
          case 5: sp *= 2.6; lf = Math.min(lf, 2.4); break; // VI  湛蓝：激光式直刃
          default: hold = clamp(p.stop || 1.2, 0.6, 2.0); break; // VII 紫罗兰：时停静止弹
        }
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color: col, r, type, life: lf, rot: a,
          turn, accel, homing, holdT: hold,
        });
      }
    }
  }

  if (p.typeName === 'sakuyaStop') {
    // 时符「Private Square」：把场上所有弹幕定住 freeze 秒，同时凝出一圈紫罗兰静止刃；
    // 领域一结束，凝滞的刀和补发的刀同一拍一起飞出来（设计稿 §2-2 的「停 → 补」）。
    const freeze = clamp(p.freeze || 1.2, 0.6, 2.0);
    b.freezeAll(freeze);
    const n = ringN(p.n || 14, 8, 26);
    for (let i = 0; i < n; i++) {
      const a = pat.angle + (i / n) * TAU + boss.rnd(-0.01, 0.01);
      const sp = varySpeed(p.speed || 175);
      b.spawn({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: SAKUYA_KNIFE_COLORS[6], r, type, life, rot: a, holdT: freeze,
      });
    }
  }

  if (p.typeName === 'sakuyaParadox') {
    // 奇术「Time Paradox」：四个「残影站位」按十个字排开（上/右/下/左），
    // 每拍换一个位置、换一色出手 —— 引擎没有克隆体，用站位+换色演「四个我同时在打」。
    const slot = boss._paradoxSlot = ((boss._paradoxSlot || 0) + 1) % 4;
    const dist = p.dist || 150;
    const spots = [[0, -dist], [dist, 0], [0, dist], [-dist, 0]];
    const sx = boss.x + spots[slot][0];
    const sy = boss.y + spots[slot][1];
    const col = SAKUYA_KNIFE_COLORS[(slot * 2 + 1) % SAKUYA_KNIFE_COLORS.length];
    const n = count(p.n || 4, 2, 7);
    const base = Math.atan2(py - sy, px - sx) + boss.rnd(-aimJitter, aimJitter);
    const spread = clamp(p.spread || 0.5, 0.2, 1.2) * pat.spreadScale;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (spread / Math.max(1, n - 1));
      const sp = varySpeed(p.speed || 240);
      b.spawn({
        x: sx, y: sy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: col, r, type, life, rot: a,
      });
    }
  }

  if (p.typeName === 'sakuyaChronos') {
    // 终符「Chronos Rule」：12 组钟面刻度、七色同心刀环，整环顺时针走针；
    // 每 3 拍补一圈白刃放射，压住外圈缝隙（设计稿 §2-4）。
    const n = ringN(p.n || 12, 8, 24);
    const rings = clamp(Math.round((p.rings || 3) * pat.ringScale), 1, 4);
    const spin = (p.turn != null ? p.turn : 0.42) * pat.dir;
    const a0 = pat.angle + fireT * spin;
    const baseSp = p.speed || 145;
    for (let k = 0; k < rings; k++) {
      const off = (k * TAU) / (n * 2);
      const sp = baseSp * (1 - k * 0.1);
      for (let i = 0; i < n; i++) {
        const a = a0 + off + (i / n) * TAU;
        const col = SAKUYA_KNIFE_COLORS[(i + k * 2) % SAKUYA_KNIFE_COLORS.length];
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color: col, r, type, life, rot: a,
          turn: (p.curve || 0.16) * pat.dir,
        });
      }
    }
    if (((boss._chronosBeat = (boss._chronosBeat || 0) + 1) % 3) === 0) {
      const m = clamp(Math.round((p.radial || 10) * boss.pressure), 6, 14);
      for (let i = 0; i < m; i++) {
        const a = a0 * 0.5 + (i / m) * TAU + boss.rnd(-0.02, 0.02);
        const sp = Math.min(boss.speedCap, (p.radialSpeed || 220) * pat.speedScale);
        b.spawn({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          color: '#eef2ff', r, type, life: Math.min(2.6, life), rot: a,
        });
      }
    }
  }

  } finally {
    b.skinMap = null;
  }
}

/* ============================================================
   七位 Boss 的弹幕数据
   weight 越大越容易被随机抽到（默认 1）
   ============================================================ */

/**
 * 全体 Boss 血量倍率（1 = 下面表格里的原始数值）。
 * 平台关近战（踩踏 / 冲刺 / 破势）加入后自机多了一条输出线，
 * 所以整体血量上调 10% 抵掉这部分额外伤害，Boss 战时长仍按原来数量级。
 * 只乘 Boss 本体，不动杂兵 / 道中（那套走 balance.js 的 ENEMY_HP_SCALE）。
 *
 * 单个 Boss 想单独拉长 / 缩短，在它的 def 上写 `hpMul`（绝对倍率，不再乘全局）即可。
 * 原标定：按 docs/BALANCE_TARGETS.md 表 1 的 Boss-only 秒数反推（口径 = 自动玩家 / god /
 * Normal / --startX 直达 Boss 场）。试玩反馈「Boss 血量偏高」后六面统一 ×0.8（每面 −20%），
 * 不再锁定 70% 时长占比；EX（芙兰、蕾米莉亚）不参与本次下调。
 */
export const BOSS_HP_MUL = 1.1;

export const BOSS_DEFS = {
  /* 符卡数量：1面2 / 2面3 / 3面4 / 4面5 / 5面6 / 6面8 / EX10。
     每张符卡独立血条（phases[i].hp），弹幕参数随符卡序号递增，难度有序。 */

  rumia: {
    name: '露米娅', title: '宵暗的妖怪', hp: 1920, accent: '#c9a6ff', hpMul: 12.74, // 目标单场 ≈108s（1面；2张卡各≈53/55s）
    phases: [
      {
        name: '宵暗「月之暗面」', hp: 950, patterns: [
          { typeName: 'ring', n: 14, speed: 100, color: '#b48cff', rate: 1.4, r: 7, spinAngle: 0.55 },
          { typeName: 'homing', n: 2, speed: 110, color: '#ff5ea8', rate: 1.1, r: 8, homing: 1.3 },
          { typeName: 'scatter', n: 6, speed: 120, color: '#b48cff', rate: 1.1, r: 6, aimed: true, arc: 1.2, weight: 0.75 },
        ],
      },
      {
        name: '暗符「黑暗吞噬」', hp: 970, patterns: [
          { typeName: 'ring', n: 22, speed: 126, color: '#8f6bd8', rate: 1.0, r: 7, spinAngle: 0.35 },
          { typeName: 'ring', n: 8, speed: 70, color: '#c9a6ff', rate: 1.6, r: 11, type: 2 },
          { typeName: 'aimed', n: 3, spread: 0.45, speed: 205, color: '#ffffff', rate: 0.9, r: 6 },
          { typeName: 'spray', n: 2, speed: 150, color: '#b48cff', rate: 0.11, r: 5, arc: 0.85, weight: 0.7 },
          { typeName: 'bloom', n: 12, rings: 2, twist: 0.3, speed: 105, color: '#8f6bd8', rate: 1.8, r: 8, type: 0, typeAlt: 2, weight: 0.9 },
        ],
      },
    ],
  },

  wriggle: {
    name: '莉格露', title: '暗中蠢动的光虫', hp: 2880, accent: '#8ef07a', hpMul: 11.02, // 目标单场 ≈138s（2面；3张卡各≈36/43/50s）
    phases: [
      {
        name: '灯符「萤火虫现象」', hp: 800, patterns: [
          { typeName: 'fan', n: 7, spread: 1.4, speed: 95, color: '#a8ff8f', rate: 1.3, r: 5, wobble: 60 },
          { typeName: 'spiral', arms: 2, speed: 90, color: '#d6ff7a', rate: 0.18, spin: 2.2, r: 4 },
          { typeName: 'scatter', n: 5, speed: 105, color: '#a8ff8f', rate: 1.35, r: 4, aimed: true, arc: 1.6, weight: 0.75 },
        ],
      },
      {
        // 二次大削（用户第二次反馈：2 面第 2 张还是糊脸）。
        // 在原「3 臂低速螺旋」的基础上再收：扇 7→5 发、螺旋 3→2 臂且间隔 0.18→0.30、
        // 自机狙 3→2 发并减速到 135。三招叠加峰值约 6.5 发/秒，留大缝。
        name: '蠢符「小虫风暴」', hp: 960, patterns: [
          { typeName: 'fan', n: 5, spread: 1.3, speed: 95, color: '#a8ff8f', rate: 1.55, r: 5, wobble: 40 },
          { typeName: 'spiral', arms: 2, speed: 88, color: '#d6ff7a', rate: 0.3, spin: 1.6, r: 4 },
          { typeName: 'aimed', n: 2, spread: 0.7, speed: 135, color: '#ffffff', rate: 1.8, r: 5, weight: 0.7 },
        ],
      },
      {
        name: '隐虫「萤火虫之夜」', hp: 1120, patterns: [
          { typeName: 'spiral', arms: 3, speed: 105, color: '#a8ff8f', rate: 0.16, spin: 2.8, r: 4, type: 2 },
          { typeName: 'ring', n: 14, speed: 110, color: '#8ef07a', rate: 1.4, r: 5, spinAngle: 0.4 },
          { typeName: 'homing', n: 2, speed: 105, color: '#d6ff7a', rate: 1.5, r: 6, homing: 1.4, weight: 0.7 },
          { typeName: 'fan', n: 6, spread: 1.1, speed: 130, color: '#a8ff8f', rate: 1.0, r: 5, wobble: 40, weight: 0.9 },
          { typeName: 'vortex', arms: 3, speed: 115, color: '#d6ff7a', rate: 0.8, r: 4, type: 3, turn: 1.5, weight: 0.95 },
        ],
      },
    ],
  },

  cirno: {
    name: '琪露诺', title: '冰之妖精', hp: 4120, accent: '#7fd8ff', hpMul: 8.99, // 目标单场 ≈157s（3面；4张卡各≈32/37/42/48s）
    phases: [
      {
        name: '冰符「冰柱落下」', hp: 840, patterns: [
          { typeName: 'rain', n: 5, speed: 210, color: '#bfeaff', rate: 0.6, r: 6, spreadX: 760 },
          { typeName: 'fan', n: 5, spread: 0.7, speed: 175, color: '#7fd8ff', rate: 0.6, r: 6, wobble: 35 },
          { typeName: 'scatter', n: 7, speed: 145, color: '#d6f6ff', rate: 0.95, r: 5, aimed: true, arc: 1.1, weight: 0.7 },
        ],
      },
      {
        name: '雹符「冰雹风暴」', hp: 960, patterns: [
          { typeName: 'rain', n: 8, speed: 230, color: '#bfeaff', rate: 0.5, r: 5, spreadX: 900 },
          { typeName: 'rain', n: 4, speed: 160, color: '#a8e8ff', rate: 0.7, r: 7, spreadX: 600, weight: 0.8 },
          { typeName: 'spiral', arms: 4, speed: 150, color: '#d6f6ff', rate: 0.09, spin: 2.4, r: 4, weight: 0.9 },
        ],
      },
      {
        // 用户点名要削的 3 面第 3 张。原版双环 26×2 发 + 14 发快环 + 3 发 285 速自机狙，
        // 每轮约 66 发。现在 18×2 发慢冰环 + 10 发快环 + 2 发 235 速自机狙（约 46 发/轮），
        // 开火间隔也拉长，慢环仍是「找缝钻」而不是「没缝」。
        name: '冻符「完美冻结」', hp: 1080, patterns: [
          { typeName: 'ring', n: 18, speed: 58, color: '#a8e8ff', rate: 1.6, r: 9, type: 2, spinAngle: 0.2, rings: 2 },
          { typeName: 'ring', n: 10, speed: 145, color: '#d6f6ff', rate: 1.15, r: 5, spinAngle: 0.85 },
          { typeName: 'aimed', n: 2, spread: 0.3, speed: 235, color: '#ffffff', rate: 1.35, r: 5 },
        ],
      },
      {
        name: '雪符「钻石风暴」', hp: 1240, patterns: [
          { typeName: 'spiral', arms: 6, speed: 165, color: '#bfeaff', rate: 0.07, spin: -3.2, r: 5 },
          { typeName: 'ring', n: 24, speed: 125, color: '#d6f6ff', rate: 1.1, r: 6, spinAngle: 0.35, rings: 2, weight: 0.9 },
          { typeName: 'cross', n: 3, dirs: 4, spread: 0.4, speed: 180, color: '#ffffff', rate: 0.8, r: 5, weight: 0.8 },
          { typeName: 'aimed', n: 4, spread: 0.28, speed: 300, color: '#ffffff', rate: 1.0, r: 4, weight: 0.7 },
          { typeName: 'bloom', n: 11, rings: 3, twist: 0.2, speed: 150, color: '#d6f6ff', rate: 1.9, r: 8, type: 3, typeAlt: 2, weight: 0.9 },
        ],
      },
    ],
  },

  aya: {
    name: '射命丸文', title: '最速的记者', hp: 5720, accent: '#ff6b6b', hpMul: 7.12, // 目标单场 ≈177s（4面；N 裁掉一张后3张卡各≈39/45/50s）
    phases: [
      {
        name: '风符「风神一扇」', hp: 880, patterns: [
          { typeName: 'fan', n: 9, spread: 1.2, speed: 200, color: '#ff9a9a', rate: 0.55, r: 5 },
          { typeName: 'laser', n: 4, speed: 460, color: '#ffd0d0', rate: 0.5, angle: 0 },
          { typeName: 'arc', n: 4, arcs: 2, gap: 0.6, speed: 200, color: '#ff6b6b', rate: 0.85, r: 5, turn: 1.1, aimed: true, weight: 0.85 },
        ],
      },
      {
        name: '疾风「风神少女」', hp: 1000, patterns: [
          { typeName: 'laser', n: 5, speed: 520, color: '#ffffff', rate: 0.35, angle: 0 },
          { typeName: 'fan', n: 11, spread: 1.1, speed: 250, color: '#ff6b6b', rate: 0.5, r: 4 },
          { typeName: 'snake', n: 2, speed: 200, color: '#ffd0d0', rate: 0.1, r: 4, amp: 0.75, freq: 2.4 },
        ],
      },
      {
        name: '岐符「天之八衢」', hp: 1120, patterns: [
          { typeName: 'cross', n: 3, dirs: 4, spread: 0.4, speed: 230, color: '#ff9a9a', rate: 0.7, r: 4 },
          { typeName: 'cage', n: 16, gaps: 2, radius: 230, speed: 95, color: '#ffd0d0', rate: 1.5, r: 4, weight: 0.9 },
          { typeName: 'aimed', n: 5, spread: 0.45, speed: 300, color: '#ffffff', rate: 0.75, r: 4, weight: 0.8 },
        ],
      },
      {
        name: '风神「天狗颪」', hp: 1280, patterns: [
          { typeName: 'aimed', n: 6, spread: 0.5, speed: 340, color: '#ff6b6b', rate: 0.6, r: 5 },
          { typeName: 'fan', n: 9, spread: 0.8, speed: 260, color: '#ff9a9a', rate: 0.5, r: 4, aimed: true, weight: 0.85 },
          { typeName: 'spiralPulse', arms: 2, speed: 210, rate: 0.07, spin: 2.8, pulse: 2.6, color: '#ffd0d0', r: 4, type: 1, weight: 0.85 },
          { typeName: 'laser', n: 6, speed: 540, color: '#ffffff', rate: 0.9, angle: 0, weight: 0.7 },
        ],
      },
      {
        name: '「幻想风靡」', hp: 1440, patterns: [
          { typeName: 'laser', n: 4, speed: 560, color: '#ffffff', rate: 0.3, angle: 0 },
          { typeName: 'fan', n: 13, spread: 1.2, speed: 265, color: '#ff6b6b', rate: 0.45, r: 4 },
          { typeName: 'arc', n: 3, arcs: 4, gap: 0.45, speed: 230, rate: 0.6, color: '#ff9a9a', r: 4, turn: 1.3, weight: 0.85 },
          { typeName: 'spiral', arms: 5, speed: 200, color: '#ffd0d0', rate: 0.08, spin: 3.2, r: 4, weight: 0.8 },
          { typeName: 'sweep', n: 2, speed: 560, color: '#ffffff', rate: 0.34, speedTurn: 2.4, weight: 0.9 },
        ],
      },
    ],
  },

  // ── 5 面 · 中途 Boss（白玉楼 · 冥界花海，幽幽子之前）────────────────────
  // 专属体系「半灵二天一流」：def.system='phantom' 打开，全部机制挂在
  // def.phantom（数值）与 Boss 的 _initPhantom/_updatePhantom/_onPhantomHit/
  // _breakPhantom/_drawPhantom 里；通用代码只读 system，不认 key。
  // 下面的 patterns 只是「bossTuning 里没有 youmu 条目时」的兜底表。
  youmu: {
    name: '魂魄妖梦', title: '半人半灵的庭师', hp: 4200, accent: '#9fe8d0',
    system: 'phantom',
    phantom: {
      color: '#9fe8d0',
      radius: 84,        // 绕本体的主环绕半径
      radiusY: 46,       // 上下摆幅
      orbitSpeed: 0.62,  // 主环绕角速度（rad/s）
      lissA: 30, lissB: 22, lissW: 0.9, // 李萨如摆动：半灵不是 1:1 跟着本体
      follow: 4.6,       // 追赶系数（越小越「甩尾」）
      maxDist: 190,      // 半灵离本体的硬上限（Boss 俯冲/冲撞时不许把半灵甩出画面）
      hitR: 26,          // 半灵受击半径
      gaugeMax: 100,     // 断灵槽上限
      gaugePerHit: 4,    // 玩家子弹每次命中半灵涨多少
      gaugePerFrame: 10, // 每帧最多涨多少（防高射速弹一帧打满）
      gaugeDecay: 1.1,   // 每秒自然衰减
      dissipateDur: 5,   // 半灵消散持续秒数
      dissipateShotK: 0.5,   // 消散中发弹倍率（= 发弹减半）
      dissipateSlowK: 0.55,  // 消散中本体移动速度倍率
      dissipateVulnK: 1.35,  // 消散中本体受击伤害倍率
    },
    phases: [
      {
        name: '人符「现世斩」', hp: 1150, patterns: [
          { typeName: 'presentSlash', n: 10, speed: 300, spread: 1.45, color: '#9fe8d0', rate: 0.62, r: 4, type: 1 },
          { typeName: 'presentSlash', n: 14, speed: 272, spread: 1.95, color: '#9fe8d0', rate: 0.84, r: 4, type: 1, weight: 0.85 },
          { typeName: 'spiritTrace', n: 8, speed: 128, color: '#c8ffe8', rate: 0.5, r: 5, type: 3, weight: 0.7 },
        ],
      },
      {
        name: '人鬼「未来永劫斩」', hp: 1250, patterns: [
          { typeName: 'eternalSlash', n: 5, speed: 272, stages: 3, color: '#9fe8d0', rate: 0.95, r: 4, type: 1 },
          { typeName: 'eternalSlash', n: 7, speed: 246, stages: 3, color: '#9fe8d0', rate: 1.18, r: 4, type: 1, weight: 0.85 },
          { typeName: 'spiritTrace', n: 10, speed: 142, color: '#c8ffe8', rate: 0.56, r: 5, type: 3, weight: 0.7 },
        ],
      },
      {
        name: '断灵「剑楼阁」', hp: 1400, patterns: [
          { typeName: 'phantomSwordArray', n: 16, gaps: 3, pillars: 5, speed: 152, color: '#9fe8d0', rate: 0.72, r: 4, type: 3 },
          { typeName: 'phantomSwordArray', n: 22, gaps: 3, pillars: 7, speed: 136, color: '#9fe8d0', rate: 0.96, r: 4, type: 3, weight: 0.85 },
          { typeName: 'spiritTrace', n: 12, speed: 158, color: '#c8ffe8', rate: 0.46, r: 5, type: 3, weight: 0.7 },
        ],
      },
    ],
  },

  yuyuko: {
    name: '西行寺幽幽子', title: '幽冥楼阁的亡灵少女', hp: 9650, accent: '#ffa8d8',
    hpMul: 5.79, // 目标单场 ≈193s（5面；N 裁掉一张后5张卡各≈31/35/39/43/48s）
    phases: [
      {
        name: '幽雅「死出诱蛾灯」', hp: 1200, patterns: [
          { typeName: 'ring', n: 14, speed: 105, color: '#ffa8d8', rate: 1.1, r: 10, type: 3, wobble: 45 },
          { typeName: 'fan', n: 7, spread: 1.2, speed: 150, color: '#e0b0ff', rate: 0.8, r: 7, type: 3, wobble: 55 },
          { typeName: 'mine', n: 2, speed: 55, delay: 1.6, burstN: 9, color: '#e0b0ff', rate: 1.5, r: 6, type: 3, weight: 0.8 },
        ],
      },
      {
        name: '蝶符「花之舞」', hp: 1350, patterns: [
          { typeName: 'petal', petals: 4, n: 3, speed: 150, rate: 0.62, color: '#ffa8d8', r: 6, type: 3, curl: 0.5 },
          { typeName: 'spiral', arms: 4, speed: 135, color: '#d0a0ff', rate: 0.1, spin: 2.6, r: 5, type: 3 },
          { typeName: 'scatter', n: 8, speed: 140, color: '#e0b0ff', rate: 1.0, r: 6, type: 3, aimed: true, arc: 1.4, weight: 0.8 },
        ],
      },
      {
        name: '蝶符「死蝶之华尔兹」', hp: 1500, patterns: [
          { typeName: 'spiral', arms: 6, speed: 150, color: '#ffa8d8', rate: 0.08, spin: -3.0, r: 5, type: 3 },
          { typeName: 'petal', petals: 5, n: 3, speed: 165, rate: 0.7, color: '#e0b0ff', r: 6, type: 3, curl: -0.55, spin: 1.2 },
          { typeName: 'homing', n: 3, speed: 110, color: '#ff8fd0', rate: 1.2, r: 7, type: 3, homing: 1.6, weight: 0.8 },
        ],
      },
      {
        name: '亡乡「亡我乡 -宿罪-」', hp: 1650, patterns: [
          { typeName: 'ring', n: 24, speed: 120, color: '#ffa8d8', rate: 1.0, r: 8, type: 3, spinAngle: 0.35 },
          { typeName: 'ring', n: 10, speed: 70, color: '#d0a0ff', rate: 1.5, r: 12, type: 2, rings: 2, weight: 0.85 },
          { typeName: 'arc', n: 3, arcs: 2, gap: 0.5, speed: 160, rate: 0.85, color: '#e0b0ff', r: 6, type: 3, turn: 0.9, weight: 0.85 },
        ],
      },
      {
        name: '冥符「常夜樱」', hp: 1850, patterns: [
          { typeName: 'homing', n: 4, speed: 95, color: '#ff8fd0', rate: 0.95, r: 9, type: 2, homing: 1.8 },
          { typeName: 'spiral', arms: 5, speed: 140, color: '#d0a0ff', rate: 0.09, spin: -2.4, r: 6, type: 3 },
          { typeName: 'fan', n: 11, spread: 1.3, speed: 160, color: '#ffa8d8', rate: 0.7, r: 6, type: 3, wobble: 60, weight: 0.85 },
          { typeName: 'petal', petals: 4, n: 3, speed: 150, rate: 0.85, color: '#e0b0ff', r: 5, type: 3, curl: 0.6, spin: -1.0, weight: 0.8 },
        ],
      },
      {
        name: '反魂蝶「八分咲」', hp: 2100, patterns: [
          { typeName: 'ring', n: 30, speed: 130, color: '#ffa8d8', rate: 1.1, r: 8, type: 3, spinAngle: 0.5 },
          { typeName: 'homing', n: 5, speed: 110, color: '#ff8fd0', rate: 1.2, r: 8, type: 3, homing: 2.0, weight: 0.9 },
          { typeName: 'petal', petals: 5, n: 4, speed: 170, rate: 0.55, color: '#e0b0ff', r: 5, type: 3, curl: 0.7, weight: 0.9 },
          { typeName: 'laser', n: 5, speed: 480, color: '#ffe0f0', rate: 0.9, angle: 0, weight: 0.9 },
          { typeName: 'bloom', n: 10, rings: 3, twist: 0.22, speed: 150, color: '#ffa8d8', rate: 1.9, r: 7, type: 3, typeAlt: 2, weight: 0.92 },
        ],
      },
    ],
  },

  kaguya: {
    name: '蓬莱山辉夜', title: '永远与须臾的罪人', hp: 16520, accent: '#ffe9b0', hpMul: 3.62, // 目标单场 ≈223s（6面；N 裁掉「蓬莱的玉枝」后7张卡各≈32s）
    phases: [
      {
        name: '难题「龙颈之玉 -五色的弹丸-」', hp: 1900, patterns: [
          { typeName: 'ring', n: 20, speed: 120, color: '#ffe9b0', rate: 1.0, r: 8, type: 3 },
          { typeName: 'fan', n: 9, spread: 1.0, speed: 170, color: '#fff8d0', rate: 0.7, r: 6, aimed: true },
          { typeName: 'arc', n: 4, arcs: 2, gap: 0.55, speed: 175, rate: 0.85, color: '#fff8d0', r: 5, turn: 1.0, aimed: true, weight: 0.85 },
        ],
      },
      {
        name: '神宝「耀眼的龙玉」', hp: 1930, patterns: [
          { typeName: 'laser', n: 5, speed: 500, color: '#fff8d0', rate: 0.8, angle: 0 },
          { typeName: 'ring', n: 26, speed: 125, color: '#ffe9b0', rate: 1.1, r: 6, type: 2, rings: 2, weight: 0.9 },
          { typeName: 'spiralPulse', arms: 3, speed: 190, rate: 0.075, spin: 3.0, color: '#ffffff', r: 5, type: 1, weight: 0.85 },
        ],
      },
      {
        name: '难题「佛御石之钵 -不碎的意志-」', hp: 1960, patterns: [
          { typeName: 'ring', n: 18, speed: 90, color: '#fff8d0', rate: 1.3, r: 12, type: 2 },
          { typeName: 'ring', n: 30, speed: 130, color: '#ffe9b0', rate: 1.15, r: 7, type: 3, spinAngle: 0.4, weight: 0.9 },
          { typeName: 'cage', n: 18, gaps: 3, radius: 250, speed: 100, rate: 1.6, color: '#ffffff', r: 4, weight: 0.85 },
        ],
      },
      {
        name: '神宝「佛体的金刚石」', hp: 1960, patterns: [
          { typeName: 'cross', n: 3, dirs: 8, spread: 0.3, speed: 230, color: '#fff8d0', rate: 0.7, r: 5 },
          { typeName: 'laser', n: 8, speed: 520, color: '#ffffff', rate: 0.7, angle: 0, weight: 0.9 },
          { typeName: 'arc', n: 4, arcs: 4, gap: 0.4, speed: 220, rate: 0.7, color: '#ffe9b0', r: 4, turn: 1.25, weight: 0.9 },
        ],
      },
      {
        name: '难题「火鼠的皮衣 -不焦躁的内心-」', hp: 1960, patterns: [
          { typeName: 'spiral', arms: 5, speed: 150, color: '#ffe9b0', rate: 0.08, spin: 3.0, r: 6 },
          { typeName: 'rain', n: 5, speed: 260, color: '#ffd890', rate: 0.5, r: 6, spreadX: 800, weight: 0.9 },
          { typeName: 'meteor', n: 2, delay: 1.25, spread: 170, burstN: 7, burstSpeed: 130, speed: 200, rate: 1.15, color: '#ffd890', r: 5, weight: 0.9 },
        ],
      },
      {
        name: '神宝「火蜥蜴之盾」', hp: 1990, patterns: [
          { typeName: 'ring', n: 24, speed: 130, color: '#ffe9b0', rate: 1.05, r: 8, rings: 2, spinAngle: 0.3 },
          { typeName: 'cage', n: 20, gaps: 2, radius: 260, speed: 105, rate: 1.7, color: '#ffd890', r: 4, weight: 0.9 },
          { typeName: 'homing', n: 4, speed: 140, color: '#fff8d0', rate: 1.0, r: 7, homing: 1.6, weight: 0.8 },
        ],
      },
      {
        name: '难题「燕的子安贝 -永命线-」', hp: 2020, patterns: [
          { typeName: 'laser', n: 6, speed: 560, color: '#ffffff', rate: 0.6, angle: 0 },
          { typeName: 'spiral', arms: 6, speed: 180, color: '#ffe9b0', rate: 0.07, spin: -3.4, r: 5, type: 3, weight: 0.9 },
          { typeName: 'snake', n: 2, speed: 220, rate: 0.09, color: '#fff8d0', r: 4, amp: 0.85, freq: 2.0, weight: 0.9 },
        ],
      },
      {
        name: '神宝「蓬莱的玉枝 -梦色之乡-」', hp: 2800, patterns: [
          { typeName: 'ring', n: 32, speed: 135, color: '#ffe9b0', rate: 1.05, r: 7, rings: 2, spinAngle: 0.45 },
          { typeName: 'spiral', arms: 7, speed: 190, color: '#fff8d0', rate: 0.06, spin: 3.6, r: 5, type: 3, weight: 0.9 },
          { typeName: 'laser', n: 10, speed: 580, color: '#ffffff', rate: 0.8, angle: 0, weight: 0.85 },
          { typeName: 'homing', n: 5, speed: 150, color: '#ffd890', rate: 1.0, r: 8, type: 3, homing: 1.8, weight: 0.8 },
          { typeName: 'petal', petals: 6, n: 3, speed: 185, rate: 0.6, color: '#ffe9b0', r: 5, type: 3, curl: 0.65, weight: 0.8 },
          { typeName: 'sweep', n: 1, speed: 500, color: '#fff8d0', rate: 0.5, speedTurn: 1.7, weight: 0.88 },
        ],
      },
    ],
  },

  /**
   * EXTRA 的中途 Boss：雷米莉亚。
   * 只打两张符卡（第一张高难、第二张中偏高），打完让路，关底仍是芙兰。
   * 血量按「EX 档 × 2 分钟」估：单张有效约 5000，两张合计约 2 分钟。
   */
  remilia: {
    name: '雷米莉亚·斯卡雷特', title: '永远鲜红的幼月', hp: 4500, accent: '#ff4d6a',
    phases: [
      {
        // 第一张：弹幕密度最高 —— 血枪雨 + 多层螺旋 + 追踪蝙蝠，缝合式压场
        name: '咒诅「弗拉德·特佩斯」', hp: 2400, patterns: [
          { typeName: 'laser', n: 9, speed: 610, color: '#ffd0e0', rate: 0.5, angle: 0 },
          { typeName: 'spiral', arms: 6, speed: 180, color: '#ff4d6a', rate: 0.055, spin: 3.8, r: 5, type: 3, weight: 0.95 },
          { typeName: 'aimed', n: 7, spread: 0.34, speed: 360, color: '#ff8fa8', rate: 0.52, r: 4, weight: 0.9 },
          { typeName: 'homing', n: 5, speed: 150, color: '#ffd0e0', rate: 0.95, r: 7, homing: 1.9, weight: 0.85 },
          { typeName: 'cage', n: 20, gaps: 2, radius: 240, speed: 100, rate: 1.45, color: '#ff4d6a', r: 4, weight: 0.9 },
        ],
      },
      {
        // 第二张：中偏高 —— 六芒星骨架 + 环弹 + 反向螺旋，读谱为主
        name: '天罚「大卫之星」', hp: 2100, patterns: [
          { typeName: 'cross', n: 4, dirs: 6, spread: 0.4, speed: 210, color: '#ff8fa8', rate: 0.68, r: 5 },
          { typeName: 'ring', n: 26, speed: 145, color: '#ffd0e0', rate: 0.95, r: 6, rings: 2, spinAngle: 0.35, weight: 0.9 },
          { typeName: 'spiral', arms: 4, speed: 165, color: '#ff4d6a', rate: 0.1, spin: -3.2, r: 5, type: 3, weight: 0.85 },
          { typeName: 'arc', n: 4, arcs: 4, gap: 0.45, speed: 205, rate: 0.62, color: '#ff8fa8', r: 5, turn: 1.2, weight: 0.9 },
        ],
      },
    ],
  },

  flandre: {
    name: '芙兰朵露', title: '恶魔之妹', hp: 27080, accent: '#ff4d6a',
    phases: [
      {
        name: '禁忌「蔓越莓陷阱」', hp: 1790, patterns: [
          { typeName: 'ring', n: 20, speed: 130, color: '#ff8fa8', rate: 1.0, r: 7, spinAngle: 0.4 },
          { typeName: 'mine', n: 3, speed: 50, delay: 1.5, burstN: 9, rate: 1.5, color: '#ff4d6a', r: 6, type: 2, weight: 0.85 },
        ],
      },
      {
        name: '禁忌「雷瓦汀」', hp: 1980, patterns: [
          { typeName: 'laser', n: 3, speed: 520, color: '#ffd0d8', rate: 0.9, angle: 0 },
          { typeName: 'laser', n: 3, speed: 520, color: '#ff4d6a', rate: 0.9, angle: Math.PI / 2 },
          { typeName: 'meteor', n: 2, delay: 1.4, spread: 190, burstN: 8, rate: 1.1, color: '#ff8fa8', r: 5, weight: 0.9 },
          { typeName: 'fan', n: 11, spread: 1.1, speed: 200, color: '#ff8fa8', rate: 0.6, r: 5, weight: 0.8 },
        ],
      },
      {
        name: '禁忌「四重存在」', hp: 2180, patterns: [
          { typeName: 'cross', n: 3, dirs: 4, spread: 0.35, speed: 200, color: '#ff4d6a', rate: 0.7, r: 5 },
          { typeName: 'petal', petals: 6, n: 3, speed: 165, rate: 0.75, color: '#ff8fa8', r: 6, type: 3, curl: 0.6, weight: 0.9 },
          { typeName: 'aimed', n: 6, spread: 0.5, speed: 330, color: '#ffffff', rate: 0.75, r: 4, weight: 0.8 },
        ],
      },
      {
        name: '秘弹「然后就一个人都不剩了？」', hp: 2370, patterns: [
          { typeName: 'spiral', arms: 4, speed: 170, color: '#ff4d6a', rate: 0.08, spin: 3.4, r: 6, type: 3 },
          { typeName: 'ring', n: 24, speed: 150, color: '#ff8fa8', rate: 0.95, r: 6, rings: 2, weight: 0.85 },
          { typeName: 'mine', n: 3, speed: 55, delay: 1.35, burstN: 10, rate: 1.4, color: '#ff4d6a', r: 6, type: 2, weight: 0.85 },
        ],
      },
      {
        name: '禁弹「星弧破碎」', hp: 2560, patterns: [
          { typeName: 'spiral', arms: 8, speed: 185, color: '#ff4d6a', rate: 0.055, spin: 3.6, r: 6, type: 3 },
          { typeName: 'homing', n: 4, speed: 140, color: '#ff8fa8', rate: 1.0, r: 7, homing: 1.8, weight: 0.85 },
          { typeName: 'arc', n: 3, arcs: 4, gap: 0.5, speed: 185, rate: 0.7, color: '#ffd0d8', r: 5, type: 3, turn: 1.15, weight: 0.9 },
        ],
      },
      {
        name: '禁弹「折反射」', hp: 2750, patterns: [
          { typeName: 'cross', n: 4, dirs: 8, spread: 0.3, speed: 210, color: '#ff8fa8', rate: 0.6, r: 5 },
          { typeName: 'laser', n: 6, speed: 560, color: '#ffffff', rate: 0.7, angle: 0, weight: 0.85 },
          { typeName: 'arc', n: 4, arcs: 2, gap: 0.6, speed: 215, rate: 0.65, color: '#ff4d6a', r: 4, turn: 1.0, weight: 0.85 },
        ],
      },
      {
        // 2026-10-26 用户反馈「这张根本过不去」：只减密度（弹数 / 环数 / 脉冲频率），
        // 弹速与颜色不动。满火力口径下同时出现的环弹从 126 发降到 80 发（−37%），
        // 整体每秒弹数约 −30%（bossTuning.js 里这张卡的档位同时由 5 降到 4，再 −11.5%）。
        name: 'QED「495年的波纹」', hp: 2940, patterns: [
          { typeName: 'ring', n: 26, speed: 140, color: '#ff4d6a', rate: 1.0, r: 7, rings: 2, spinAngle: -0.4 },
          { typeName: 'ring', n: 14, speed: 80, color: '#ff8fa8', rate: 1.2, r: 11, type: 2, rings: 2, weight: 0.9 },
          { typeName: 'spiralPulse', arms: 3, speed: 200, rate: 0.085, spin: 3.4, pulse: 2.2, color: '#ffd0d8', r: 5, type: 1, weight: 0.9 },
        ],
      },
      {
        name: '禁忌「吸血鬼之宴」', hp: 3200, patterns: [
          { typeName: 'spiral', arms: 6, speed: 200, color: '#ff4d6a', rate: 0.06, spin: 3.2, r: 5, type: 3 },
          { typeName: 'meteor', n: 2, delay: 1.2, spread: 220, burstN: 8, burstSpeed: 140, rate: 1.0, color: '#ff8fa8', r: 6, weight: 0.9 },
          { typeName: 'homing', n: 5, speed: 160, color: '#ffd0d8', rate: 0.95, r: 7, weight: 0.85 },
          { typeName: 'fan', n: 15, spread: 1.5, speed: 220, color: '#ff4d6a', rate: 0.45, r: 4, weight: 0.8 },
        ],
      },
      {
        name: '禁忌「破坏之瞳」', hp: 3460, patterns: [
          { typeName: 'laser', n: 12, speed: 600, color: '#ffffff', rate: 0.7, angle: 0 },
          { typeName: 'ring', n: 30, speed: 150, color: '#ff4d6a', rate: 0.9, r: 6, rings: 2, spinAngle: 0.5, weight: 0.9 },
          { typeName: 'aimed', n: 8, spread: 0.35, speed: 360, color: '#ff8fa8', rate: 0.6, r: 4, weight: 0.85 },
          { typeName: 'cage', n: 18, gaps: 2, radius: 230, speed: 105, rate: 1.5, color: '#ffd0d8', r: 4, weight: 0.85 },
        ],
      },
      {
        name: '未明「长夜不醒之约」', hp: 3850, patterns: [
          { typeName: 'ring', n: 40, speed: 150, color: '#ff4d6a', rate: 0.95, r: 7, rings: 2, spinAngle: 0.6 },
          { typeName: 'spiral', arms: 8, speed: 210, color: '#ff8fa8', rate: 0.05, spin: 4.0, r: 5, type: 3, weight: 0.95 },
          { typeName: 'laser', n: 10, speed: 620, color: '#ffffff', rate: 0.6, angle: 0, weight: 0.9 },
          { typeName: 'homing', n: 6, speed: 170, color: '#ffd0d8', rate: 0.9, r: 8, weight: 0.85 },
          { typeName: 'petal', petals: 7, n: 4, speed: 195, rate: 0.55, color: '#ff8fa8', r: 5, type: 3, curl: 0.75, weight: 0.85 },
          { typeName: 'vortex', arms: 6, speed: 190, color: '#ff6b8a', rate: 0.42, r: 5, type: 3, turn: 1.0, weight: 0.92 },
        ],
      },
    ],
  },

  /**
   * EXTRA 连环 Boss Rush 的另一位主角：十六夜咲夜。
   * 四张卡只建一次（key = sakuya），由 Boss 构造器的 opts.cardFrom / opts.cardCount 切片成两场：
   *   cardFrom 0 / 2 张 → 银符「Perfect Maid」+ 时符「Private Square」（开场，打完让路给雷米）
   *   cardFrom 2 / 2 张 → 奇术「Time Paradox」+ 终符「Chronos Rule」（关底芙兰前的压轴）
   * 弹幕母题照抄设计稿 _sakuya_design/DESIGN.md 的「七色飞刀」：
   *   绯红 #ff3b4e 直冲快刃 / 琥珀 #ff8a3d 延迟弹 / 鎏金 #ffd24a 追踪 /
   *   翡翠 #35e08c 减速 / 青 #3fd8ff 环形散射 / 湛蓝 #4c7bff 直刃 / 紫罗兰 #a86bff 时停弹；
   *   刀型是专属弹型 B_KNIFE（bulletArt/knife.js：钢刀身 + 同色发光刃口），
   *   朝向 = 速度方向（autoSpin），拖尾走 bullets 的加法层、天然同色。
   *   四张卡的血量在 bossTuning.js 里显式给定
   *   （0.77 × 45s × dps），这里的 hp 只是「调参表没登记时」的兜底值。
   */
  sakuya: {
    name: '十六夜咲夜', title: '完美而潇洒的从者', hp: 39670, accent: '#c9d8ff',
    phases: [
      {
        // 第一张：银符「Perfect Maid」
        //   主招 sakuyaFan = 五连扇形银刃（±14° 窄扇，刀尖朝速度方向）；
        //   每 30° 一圈的 sakuyaSeven 七色环负责把「颜色 = 弹道」的规矩立起来。
        name: '银符「Perfect Maid」', hp: 2300, patterns: [
          { typeName: 'sakuyaFan', n: 5, spread: 0.49, speed: 300, color: '#eef2ff', rate: 0.85, r: 7, type: B_KNIFE, aimed: true },
          { typeName: 'sakuyaSeven', n: 12, speed: 150, rate: 1.5, r: 7, type: B_KNIFE, turn: 0.24, rings: 1, weight: 1.0 },
          { typeName: 'sakuyaFan', n: 5, spread: 0.9, speed: 215, color: '#ffd24a', rate: 1.5, r: 7, type: B_KNIFE, weight: 0.85 },
          { typeName: 'ring', n: 16, speed: 120, color: '#4c7bff', rate: 1.4, r: 7, type: B_KNIFE, rings: 1, spinAngle: 0.35, weight: 0.72 },
        ],
      },
      {
        // 第二张：时符「Private Square」
        //   sakuyaStop 把场上所有弹幕真的定住 1.2s（bullets.freezeAll / b.holdT），
        //   同时凝出一圈紫罗兰静止刃，领域结束一起飞出来；
        //   灰色球形领域用 cage 围出球面，慢速七色环是「停住的那一层」。
        name: '时符「Private Square」', hp: 2350, patterns: [
          { typeName: 'sakuyaStop', n: 14, speed: 175, freeze: 1.2, rate: 2.0, r: 7, type: B_KNIFE },
          { typeName: 'sakuyaSeven', n: 12, speed: 118, rate: 1.6, r: 7, type: B_KNIFE, turn: 0.14, rings: 1, stop: 1.2, weight: 0.95 },
          { typeName: 'cage', n: 22, gaps: 2, radius: 250, speed: 92, rate: 1.9, color: '#4c7bff', r: 4, type: B_KNIFE, weight: 0.85 },
          { typeName: 'ring', n: 18, speed: 96, color: '#a86bff', rate: 1.5, r: 7, type: B_KNIFE, rings: 2, spinAngle: 0.4, weight: 0.8 },
        ],
      },
      {
        // 第三张：奇术「Time Paradox」
        //   四个残影站位（上/右/下/左）轮流换色齐射 = 四个咲夜；
        //   反向七色环（turn 为负）负责让方向感失效。
        name: '奇术「Time Paradox」', hp: 2400, patterns: [
          { typeName: 'sakuyaParadox', n: 4, speed: 240, spread: 0.5, rate: 0.8, r: 7, type: B_KNIFE },
          { typeName: 'sakuyaSeven', n: 12, speed: 165, rate: 1.7, r: 7, type: B_KNIFE, turn: -0.3, rings: 1, weight: 0.9 },
          { typeName: 'sakuyaParadox', n: 3, speed: 300, spread: 0.62, rate: 1.3, r: 4, type: B_KNIFE, weight: 0.8 },
          { typeName: 'arc', arcs: 2, n: 4, gap: 0.5, speed: 160, color: '#35e08c', rate: 1.3, r: 7, type: B_KNIFE, weight: 0.7 },
        ],
      },
      {
        // 第四张：终符「Chronos Rule」
        //   12 组钟面刻度（每 30°）七色同心环 + 每 3 拍白刃放射，整环顺时针走针，
        //   玩家只能逆时针穿行才找得到缝；外圈慢环是「被走到的那一格」。
        name: '终符「Chronos Rule」', hp: 2450, patterns: [
          { typeName: 'sakuyaChronos', n: 12, rings: 3, speed: 145, rate: 1.1, r: 7, type: B_KNIFE, turn: 0.42, radial: 10 },
          { typeName: 'ring', n: 24, speed: 62, color: '#4c7bff', rate: 1.0, r: 7, type: B_KNIFE, rings: 2, spinAngle: 0.6, weight: 0.9 },
          { typeName: 'sakuyaSeven', n: 12, speed: 175, rate: 1.6, r: 7, type: B_KNIFE, turn: 0.3, rings: 1, weight: 0.95 },
          { typeName: 'spiralPulse', arms: 3, speed: 195, rate: 0.06, spin: 2.8, pulse: 2.0, color: '#ffd24a', r: 4, type: B_KNIFE, weight: 0.9 },
          { typeName: 'ring', n: 30, speed: 105, color: '#ff8a3d', rate: 1.6, r: 7, type: B_KNIFE, rings: 2, spinAngle: -0.5, weight: 0.85 },
        ],
      },
    ],
  },
};

/* ============================================================
   Boss 实体
   ============================================================ */

export class Boss {
  /**
   * @param {string} key BOSS_DEFS 的键
   * @param {number} x 世界坐标（脚底中心）
   * @param {number} y
   * @param {{seed?:number, difficulty?:string, stageNumber?:number, cardFrom?:number, cardCount?:number}} [opts]
   *   可选：固定随机种子（测试 / 复现用）；难度与 1 起关卡号（用于裁剪难符卡 / 倍率）；
   *   cardFrom / cardCount：只打这个 Boss 卡表里的一段（EX 连环 Boss Rush 用同一份
   *   咲夜四卡数据切两场），不传就是全部卡，行为与旧版一致。
   */
  constructor(key, x, y, opts = {}) {
    const def = BOSS_DEFS[key] || BOSS_DEFS.rumia;
    this.key = key;
    // Boss 战立绘走高优先级预加载：避免开场先看到占位剪影再被顶替
    ensureBossArt(key);
    this.def = def;
    this.info = BOSS_INFO[key] || { name: def.name, title: def.title, accent: def.accent };

    // 难度：E/N/H/L 决定符卡裁剪、血量和弹幕倍率
    this.difficulty = getDifficulty(opts.difficulty).key;
    this.diff = getDifficulty(this.difficulty);
    this.stageNumber = Number(opts.stageNumber) || 0;
    // 分面密度：2–6 面统一收薄（Extra 的 stageNumber = 0 → 1.00）
    this.stageDensity = stageDensityOf(this.stageNumber);
    // 本文件内的弹数密度系数（需求 #7）：非 EX 统一 +18% 弹数，EX 保持 1。
    // 只乘弹数（nScale / armScale / 计划外变招 cnt），不动弹速，也不改 difficulty.js。
    // 验收用：window.__BOSS_DENSITY 可临时覆盖（A/B 对照实验），默认 1.18
    const densOverride = typeof window !== 'undefined' ? Number(window.__BOSS_DENSITY) : 0;
    this.density = this.difficulty === 'EX' ? 1 : (densOverride > 0 ? densOverride : 1.18);
    // 血量倍率：默认用全局 BOSS_HP_MUL；def.hpMul 写了就按它（绝对倍率，不再乘全局），
    // 用来把单个 Boss 的单场时长对齐到目标值。
    const hpMul = def.hpMul != null ? Number(def.hpMul) : BOSS_HP_MUL;
    const trimmed = bossPhasesFor(def.phases, this.difficulty, this.stageNumber)
      // 每张符卡独立乘，比例不变
      .map((p) => ({ ...p, hp: Math.max(1, Math.round((Number(p.hp) || def.hp) * hpMul)) }));
    this.phases = scaleBossHp(trimmed, this.difficulty, def.hp * hpMul);

    /* ---------- 逐卡数据：限时 / 生存模式 / 卡面特效 / 密度与弹速倍率 ----------
     * 数据来自 bossTuning.js（43 张符卡的目标时长，含 EXTRA）与 bossPatternDesigns.js（创造模式弹幕表，仅 28+3 张）。
     * 有逐卡 dps 设定了目标时长，就反推出该卡血量：
     *   目标有效血量 = limit × dps（不乘难度血量倍率，保证限时奖励跨难度公平）；
     * 生存卡不吃 dps（Boss 不可击破，只按时间切卡），保留原有血量做血条底。
     */
    const tune = cardTuningFor(this.key);
    this.cardTune = tune;
    const tuneCards = tune && Array.isArray(tune.cards) ? tune.cards : null;
    if (tuneCards) {
      for (let i = 0; i < this.phases.length && i < tuneCards.length; i++) {
        const ph = this.phases[i];
        const t = tuneCards[i];
        if (!ph || !t) continue;
        const limit = Number(t.limit);
        const dps = Number(t.dps);
        // 'both' = 双条件卡：撑满限时算过关，打空血条也算过关（谁先满足都行）
        const mode = t.mode === 'survival' ? 'survival' : (t.mode === 'both' ? 'both' : 'damage');
        const hpOverride = Number(t.hp);
        if (Number.isFinite(hpOverride) && hpOverride > 0) {
          // 显式血量优先（双条件卡 / 单独加厚的卡用）
          ph.hp = Math.max(1, Math.round(hpOverride));
        } else if (mode !== 'survival' && Number.isFinite(dps) && dps > 0 && Number.isFinite(limit) && limit > 0) {
          // 逐卡限时卡的时长必须跨难度一致：若再乘 hpScale，Easy 会提前 ~15%、Hard 必然
          // 超时 ~15%，限时奖励在 Hard 上系统性拿不到。难度差异交给弹幕预算/弹速承担。
          // CARD_HP_ANCHOR：保底火力从「满火力 Lv4」下调到「Lv2 / Lv3」（见 bossTuning.js）。
          ph.hp = Math.max(1, Math.round(limit * dps * CARD_HP_ANCHOR));
        }
        ph.mode = mode;
        ph.limit = Number.isFinite(limit) && limit > 0 ? limit : null;
        ph.fx = t.fx || null;
        ph.accent = t.accent || null;
        ph.effect = t.effect || null;
        // 单卡难度档：在自身 densityMul / speedMul 之上再乘一次等级倍率
        const tm = tierMultipliers(t.tier);
        ph.densityMul = (Number(t.densityMul) > 0 ? Number(t.densityMul) : 1) * tm.density;
        ph.speedMul = (Number(t.speedMul) > 0 ? Number(t.speedMul) : 1) * tm.speed;
        ph.tier = Number(t.tier) || 3;
        // 弹幕：优先用创造模式的逐卡设计，否则保留 BOSS_DEFS 原表
        if (Array.isArray(t.patterns) && t.patterns.length) {
          ph.patterns = t.patterns;
        } else {
          const pats = patternsFor(this.key, i);
          if (Array.isArray(pats) && pats.length) ph.patterns = pats;
        }
      }
    }

    // 终局血量倍率（2026-10-26 第一轮：全局 +5%、蕾米莉亚 +8%、芙兰朵露 +10%；
    // 后续第五轮 2026-10-27：十六夜 +3.8%、蕾米 +4%、芙兰 +5%；第七轮同日「EX 面各个再加 4%」
    // 三个 EX Boss 再 ×1.04，值全部落在 bossTuning.js 的覆盖表里）：
    // 放在逐卡数据之后、总血量之前，逐卡四舍五入，保证每张卡按同一比例变厚、卡间比例不变，
    // 0.655 / 0.77 的目标占比（限时奖励的手感）不被重新标定。
    this.finalHpMul = finalHpMulFor(this.key);
    if (this.finalHpMul !== 1) {
      this.phases = this.phases.map((p) => ({ ...p, hp: Math.max(1, Math.round(p.hp * this.finalHpMul)) }));
    }

    /* ---------- 卡片切片：一个 key 建 N 张，由关卡按「场次」切一段来打 ----------
     * EX 的连环 Boss Rush 用同一份 sakuya 四卡数据切两场：
     *   new Boss('sakuya', x, y, { cardFrom: 0, cardCount: 2 }) → 银符 + 时符
     *   new Boss('sakuya', x, y, { cardFrom: 2, cardCount: 2 }) → 奇术 + 终符
     * 切片放在逐卡调参 + 终局倍率之后、总血量汇总之前：调参始终按「完整卡表」的下标
     * 对齐（bossTuning.js 的四张卡不用拆），而 maxHp / spellCount / phaseCount /
     * _advanceSpell 的「最后一张」判断全部基于切完的 this.phases，天然自洽。
     * 不传 cardFrom 时 from = 0、cnt = 原张数且跳过切片，血量 / 张数与旧版完全一致。
     */
    const cardLen = this.phases.length;
    const from = Math.min(Math.max(0, opts.cardFrom | 0), Math.max(0, cardLen - 1));
    const want = opts.cardCount == null ? cardLen - from : Math.max(1, opts.cardCount | 0);
    const cnt = Math.min(want, cardLen - from);
    if (from !== 0 || cnt !== cardLen) this.phases = this.phases.slice(from, from + cnt);
    /** 本场第一张卡在完整卡表里的下标（_cardResultSnapshot 的 globalIndex 用它还原全场序号） */
    this.cardGlobalFrom = from;

    // 总血量 = 实际（可能被难度裁掉难符卡后的）各符卡血量之和，避免与独立的
    // def.hp 倍率算出 ±1 的误差，也让 E/N 裁卡后 maxHp 与实际要打的血量一致。
    this.maxHp = Math.max(1, this.phases.reduce((a, p) => a + p.hp, 0));
    this.hp = this.maxHp;

    this.x = x;
    this.baseY = y;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.w = 96;
    this.h = 132;

    // 随机种子：显式 opts.seed > ?seed= / __HKS_BOSS_SEED > 时间随机
    this.seed = opts.seed != null ? (Number(opts.seed) >>> 0) : nextBattleSeed();
    this._seed = this.seed || 1;
    this.wild = 0.6;

    /* ---------- 难度护栏（E/N/H/L 各一档，见 difficulty.js） ---------- */
    // 同屏弹数预算：超过就停火让路
    this.bulletBudget = Number(this.diff.bulletBudget) || 1180;
    // 单发弹速硬上限：再快也不会到躲不开的程度
    this.speedCap = Number(this.diff.bulletSpeedCap) || 520;
    // 环状弹幕最小间距折算出的单圈上限（按 240px 半径算弧长，保证留有判定缝）
    this.ringGapPx = Math.max(18, Number(this.diff.ringGapPx) || 30);
    // 单圈上限：默认 56；EXTRA 档放宽到 72，让 22px 环缝真的能排下更多弹
    this.ringLimit = clamp(Math.floor((TAU * 240) / this.ringGapPx), 6, Number(this.diff.bossRingCap) || 56);
    // 屏幕密度自适应：1 = 全量开火，越低新招弹数越薄
    this.pressure = 1;
    // 自适应阈值 / 下限 / 变招放弃阈值：EXTRA 档整体放宽，避免新弹量被旧护栏夹回去
    this.pressureStart = Number(this.diff.pressureStart) || 0.6;
    this.pressureFloor = Number(this.diff.pressureFloor) || 0.45;
    this.wildAbort = Number(this.diff.wildAbort) || 0.8;

    this.t = 0;
    this.state = 'intro'; // intro | battle | defeat | dead
    this.introT = 0;
    this.artWaitT = 0;    // 出场前等立绘就绪的累计时间
    this.defeatT = 0;
    this.alpha = 0;

    // 每张符卡一条独立血条：打空一张切下一张，最后一张打空才被击败
    this.phase = 0;                  // 兼容旧字段：等价于 spellIdx
    this.spellIdx = 0;
    this.spellCount = this.phases.length;
    this.phaseName = this.phases[0].name;
    this.spellName = this.phases[0].name;
    this.spellMaxHp = this.phases[0].hp || def.hp;
    this.spellHp = this.spellMaxHp;
    this.spellLock = 0;              // 符卡宣言 / 切入的无敌时间（秒）
    this.spellBroken = false;
    this.patternIdx = 0;
    this.patternT = 0;
    this.patternDur = 6;
    this.fireT = 0;
    this._nextRate = 1;
    this._pat = null;
    // 逐卡计时 / 生存模式 / 卡面（constructor 末尾由 _applyCard(0) 套用第一张卡）
    this._baseDensity = this.density;
    this.mode = 'damage';        // damage | survival
    this.cardDual = false;       // true = 双条件卡（撑满限时或打空血条都算过关）
    this.cardLimit = null;       // 限时（秒）；null = 不限时（EXTRA 等）
    this.cardElapsed = 0;        // 本卡已用时间（符卡宣言无敌结束后开始累计）
    this.cardRemain = null;      // 剩余秒数
    this.cardRatio = 1;          // 本卡进度：damage = 血条剩余；survival = 坚持进度
    this.cardFx = null;          // 卡面特效 key（cardfx.js）
    this.cardEffect = null;      // 玩家效果 key（cardEffects.js）
    this.cardAccent = def.accent;
    this.cardSpeedMul = 1;
    this.lastCardResult = null;  // 最近一张卡的结算快照（验收 / 调试可读）
    this._cardResultCb = null;
    // 延迟弹幕队列：meteor / mine 这类「先飞、再爆/分裂」的招用它排队。
    // 只存纯数据 + 闭包，全部由本 Boss 的确定性 firePattern 产生，无随机源外泄。
    this._laterQ = [];

    // 随机移动：在出生点附近选点，平滑过去，偶尔短冲刺
    this._move = { sx: x, sy: y, tx: x, ty: y, t: 0, dur: 0, dashing: false };
    this._moveWait = this.rnd(0.5, 1.4);

    // 计划外「变招」
    this._wildLeft = 0;
    this._wildT = 0;
    this._wildCd = this.rnd(2.5, 5.5);

    this.hitFlash = 0;
    this.hurtCd = 0;
    this.dead = false;
    this.drift = 0;
    this.volleys = 0;

    /* ---------- 平台关近战系统（STG 关不启用） ----------
     * 非 STG 的 Boss 战原本只有「站桩开枪 + 冲刺撞一下」，平台操作在 Boss 战里
     * 没有战术意义。这里补三条主动手段：
     *   踩踏：从上方落到 Boss 头顶，高伤 + 大量破势；
     *   冲刺撞击：贴身冲过去，中等伤害 + 破势；
     *   破势槽满 → Boss 坠地硬直，窗口内全伤害 x1.7；
     *   俯冲：Boss 周期性蓄力砸向地面，落地冲击波要求玩家起跳，
     *        落地后的硬直期又正好是踩踏 / 冲撞的窗口，形成攻防循环。
     */
    this.platformMelee = !!opts.platformMelee;
    // 地面高度：俯冲落点用；stage 传关卡地表 y
    this.groundY = Number(opts.groundY) || (y + 240);
    this.poise = 0;
    // 破势槽上限：100 → 140（需求 #5）。每破一次 +25，封顶 240。
    this.poiseMax = 140;
    this.staggerT = 0;
    this.staggerMax = 2.2;
    this.staggerCount = 0;
    this.poiseFlash = 0;
    this.stompCd = 0;
    // 破势自然衰减（点/秒）：磨破势不是一劳永逸，得在衰减前接上后续手段。
    // 血条被标定到 2–4 分钟后，若沿用旧的 7/s，自动玩家整场只能破势 1 次，故降到 1/s。
    this.poiseDecay = 1;
    // 射击攒破势系数：整条血打空 ≈ 5.5 条槽（再扣衰减 → 自动玩家每场 2–3 次破势）。
    // 按 maxHp 归一化，各面血量差异 / 难度血量倍率都不会破坏破势节奏。
    this._shotPoiseK = (5.5 * this.poiseMax) / Math.max(1, this.maxHp);
    this._dive = { state: 'idle', t: 0, fromX: x, fromY: y, tx: x, ty: y };
    this._diveCd = this.rnd(4.5, 7.5);
    this._diveCount = 0;

    /* ---------- 需求 #4：玩家可主动参与的 Boss 互动 ----------
     * ① 落地破势球：Boss 定期甩出会落到地面上的能量球，从上方踩爆 = 一大截破势；
     * ② 俯冲落地：冲击波可跳 / 可闪，落地 1 秒硬直里踩头、冲刺都能反打（射击破势 ×1.8）；
     * ③ 横向冲撞：白闪蓄力预警 → 贴地冲撞 → 后摇白闪 COUNTER，冲刺反击伤害 ×1.5 / 破势翻倍；
     * ④ 硬直放大器：破势硬直期踩踏伤害 ×1.35、每 8 次命中追加一跳，硬直越打越赚。
     */
    this._orbs = [];                  // 落地破势球
    this._orbCd = this.rnd(3.2, 5.2); // 首个球来得早一点，让玩家早点发现这套互动
    this._ram = { state: 'idle', t: 0, dir: 1, hit: false, fromX: x, fromY: y, tx: x, ty: y };
    this._ramCd = this.rnd(9, 14);
    this._staggerHits = 0;
    // 互动遥测（只增不减，验收 / 平衡报告用；页面内可读 stage.boss._ix）
    this._ix = {
      orbSpawn: 0, orbStomp: 0,
      diveLand: 0, diveStamp: 0,
      ramCharge: 0, ramWhiff: 0, ramPunish: 0,
      staggerStomp: 0, staggerCombo: 0, counterShot: 0,
      stgPressure: 0, coreHit: 0, coreBreak: 0,
      phantomHits: 0, phantomBreak: 0,
    };

    // STG 关（4 面 aya 等，非 EX）互动：近身压制增伤 + 可击破符卡核心
    this._stgPressT = 0;
    this._stgPressOn = false;
    this._core = null;
    this._coreCd = this.rnd(8, 12);
    this._coreFlash = 0;

    /* ---------------- 专属体系：半灵二天一流（def.system === 'phantom'）----------------
     * 妖梦的「半灵」是一个独立实体，不是装饰：
     *   1) 独立坐标：绕本体做李萨如摆动（follow 越小越「甩尾」，不 1:1 跟随）；
     *   2) 独立发弹源：bossBullets.js 的 phantomSrc() 直接读 boss.phantom 的坐标；
     *   3) 可被玩家子弹命中：damageWithShots 里第二个 hitRect（独立 targetRef），
     *      命中不伤本体，只攒「断灵槽」；
     *   4) 满槽 → 半灵消散：淡出、独立发弹停止、本体发弹减半 / 移速减半 / 易伤 ×1.35，
     *      持续 dissipateDur 秒后复原。这是「打半灵」唯一的战术回报。
     * 通用代码只认 system，不认 key（其他 Boss 的 phantom 为 null，全链路零开销）。
     */
    this.system = def.system || null;
    this.phantomDef = def.phantom || null;
    this.phantom = null;
    this.phantomShotK = 1;  // 发弹倍率：消散中 0.5（firePattern 的 count / _wildVolley 都吃它）
    this.phantomSlowK = 1;  // 本体移动速度倍率：消散中 0.55
    this.phantomVulnK = 1;  // 本体受击伤害倍率：消散中 1.35
    if (this.system === 'phantom') this._initPhantom();

    /* ---------------- 四重存在（芙兰「禁忌『四重存在』」专属） ----------------
     * 不是弹幕特效，是「人物四重存在」：本体之外再画三个分身，四个芙兰一起在场、
     * 一起开火。分身是纯幻影：不吃伤害、不碰撞、不进入 HP 结算，卡结束自动消失。
     * 偏移相对本体实时计算，本体随机漂移时分身整组跟着走，不会掉队。
     */
    this._clones = null;
    this._cloneDispatching = false;
    this._cloneTurn = 0;

    // 开场也是随机一招，背板第一招不再固定
    this._applyCard(0);
    this._startPattern(this.rndInt(0, this.phases[0].patterns.length - 1));
  }

  /* ---------------- 四重存在：三个分身 ---------------- */

  /** 只在芙兰「禁忌『四重存在』」这一张卡上维持三个分身，换卡/败退后立即清空。 */
  _syncClones() {
    const want = this.key === 'flandre' && this.spellIdx === 2 && this.state === 'battle';
    if (!want) { this._clones = null; return; }
    if (this._clones) return;
    // 阵型刻意错开高度/远近：四个立绘都很大，纯一字排开会糊成一团
    this._clones = [
      { dx: -300, dy: 58, phase: 0.0, facing: -1, alpha: 0.80, scale: 0.94 },
      { dx: -150, dy: -46, phase: 2.2, facing: -1, alpha: 0.72, scale: 0.92 },
      { dx: 158, dy: 42, phase: 4.4, facing: -1, alpha: 0.64, scale: 0.90 },
    ];
  }

  /**
   * 分身同步开火：临时把本体坐标挪到分身位置，直接复用本卡正在跑的招式派发，
   * 弹道/配色/专属弹型全部与本体同源；弹数乘 0.45、弹速乘 0.85，保证本体仍是主体。
   * 同一拍内逐个分身调用，_cloneDispatching 防止重复进入。
   */
  _fireClonePatterns(pat, bullets, pc) {
    if (!bullets || !this._clones || this._cloneDispatching) return;
    if (bullets.activeCount >= this.bulletBudget) return;
    this._cloneDispatching = true;
    const ox = this.x, oy = this.y;
    const op = this.pressure, ocap = this.speedCap;
    // 三个分身轮转接拍：每次落到不同的一人，四个人从头到尾都在输出，
    // 但同一拍只多出一份弹，不至于叠成弹墙。
    const c = this._clones[this._cloneTurn % this._clones.length];
    this._cloneTurn++;
    try {
      this.x = ox + c.dx;
      this.y = oy + c.dy;
      this.pressure = op * 0.45;
      this.speedCap = ocap * 0.85;
      firePattern(pat, this, { bullets, px: pc.x, py: pc.y, t: this.t }, this.patternT);
    } finally {
      this.x = ox; this.y = oy;
      this.pressure = op; this.speedCap = ocap;
      this._cloneDispatching = false;
    }
  }

  /**
   * 画分身：先画（在本体之下），带一点猩红幻影光晕与相位差浮动。
   * 调用点固定是 Boss.draw 里 ctx 已经 translate(this.x, this.y) 之后，
   * 所以这里只叠分身自己的相对偏移，绝对坐标留给外部。
   */
  _drawClones(ctx, t) {
    if (!this._clones || this.alpha <= 0.01) return;
    const accent = this.def.accent;
    for (const c of this._clones) {
      const bx = c.dx + Math.sin(t * 0.9 + c.phase) * 3;
      const by = c.dy + Math.sin(t * 1.35 + c.phase) * 5;
      ctx.save();
      ctx.translate(bx, by);
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(0, -this.h * 0.55, 8, 0, -this.h * 0.55, 118);
      gr.addColorStop(0, accent + '30');
      gr.addColorStop(1, accent + '00');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(0, -this.h * 0.55, 118, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const opts = {
        boss: this.key,
        state: this.state === 'defeat' ? 'defeat' : 'idle',
        t: t + c.phase,
        facing: c.facing,
        flash: 0,
        alpha: this.alpha * c.alpha,
        scale: c.scale,
        cast: 0,
      };
      if (!drawGenBoss(ctx, opts)) drawBossPlaceholder(ctx, opts, accent);
      ctx.restore();
    }
  }

  /* ---------------- 半灵二天一流（def.system === 'phantom'） ---------------- */

  /** 建立半灵实体：数值全部来自 def.phantom，这里只补运行期字段 */
  _initPhantom() {
    const d = this.phantomDef || {};
    const ph = {
      x: this.x + this.rnd(-40, 40),
      y: this.y - 96,
      t: this.rnd(0, 10),
      phase: this.rnd(0, TAU),
      lissPhase: this.rnd(0, TAU),
      orbitSpeed: d.orbitSpeed || 0.62,
      radius: d.radius || 84,
      radiusY: d.radiusY || 46,
      lissA: d.lissA || 30,
      lissB: d.lissB || 22,
      lissW: d.lissW || 0.9,
      follow: d.follow || 4.6,
      maxDist: d.maxDist || 190,
      hitR: d.hitR || 26,
      gauge: 0,
      gaugeMax: d.gaugeMax || 100,
      gaugePerHit: d.gaugePerHit || 4,
      gaugePerFrame: d.gaugePerFrame || 10,
      decay: d.gaugeDecay || 1.1,
      dissipateT: 0,
      dissipateDur: d.dissipateDur || 5,
      fade: 1,
      reformT: 0,
      gap: 0,      // 上一帧「半灵↔本体」距离（已夹到 maxDist；自测/调参可读）
      hits: 0,
      breaks: 0,
      _frameGain: 0,
    };
    this.phantom = ph;
    // 独立 targetRef：playerShots.hitRect 靠它给穿透弹做去重，绝不能复用 this
    this._phantomRef = { phantom: this.key };
  }

  /**
   * 半灵每帧：轨迹 + 断灵槽衰减 + 消散状态机。
   * 即使 spellLock / 破势硬直也会被调用（半灵是独立的，不该跟着本体冻结）。
   * @param {number} dt
   * @param {object} fx
   */
  _updatePhantom(dt, fx) {
    const ph = this.phantom;
    if (!ph) return;
    const d = this.phantomDef || {};
    ph.t += dt;
    ph._frameGain = 0;

    if (ph.dissipateT > 0) {
      // 消散：淡出 + 发弹减半 + 减速 + 易伤
      ph.dissipateT = Math.max(0, ph.dissipateT - dt);
      ph.fade += (0.14 - ph.fade) * Math.min(1, dt * 5);
      this.phantomShotK = d.dissipateShotK || 0.5;
      this.phantomSlowK = d.dissipateSlowK || 0.55;
      this.phantomVulnK = d.dissipateVulnK || 1.35;
      if (ph.dissipateT <= 0) {
        // 复原：槽清空、半灵重新聚形，给玩家一个明确的「回来了」反馈
        ph.gauge = 0;
        ph.reformT = 1.4;
        this.phantomShotK = 1;
        this.phantomSlowK = 1;
        this.phantomVulnK = 1;
        fx?.shockwave?.(ph.x, ph.y, d.color || this.def.accent, 16, 420, 0.45);
        fx?.flash?.(ph.x, ph.y, '#c8ffe8', 14);
      }
    } else {
      ph.fade += (1 - ph.fade) * Math.min(1, dt * (ph.reformT > 0 ? 1.6 : 3.2));
      ph.reformT = Math.max(0, ph.reformT - dt);
      this.phantomShotK = 1;
      this.phantomSlowK = 1;
      this.phantomVulnK = 1;
      ph.gauge = Math.max(0, ph.gauge - ph.decay * dt);
    }

    // 轨迹：主环绕 + 李萨如的二阶摆动 → 半灵始终在动，但不会飘出画面
    const a = ph.t * ph.orbitSpeed + ph.phase;
    const tx = this.x + Math.cos(a) * ph.radius + Math.sin(ph.t * ph.lissW + ph.lissPhase) * ph.lissA;
    let ty = this.y - 96 + Math.sin(a * 1.3) * ph.radiusY + Math.cos(ph.t * ph.lissW * 1.7 + ph.lissPhase) * ph.lissB;
    // 消散中：半灵往上飘散、脱离牵引（视觉上「正在消失」）
    if (ph.dissipateT > 0) ty -= (ph.dissipateDur - ph.dissipateT) * 16;
    const k = 1 - Math.exp(-ph.follow * dt);
    ph.x += (tx - ph.x) * k;
    ph.y += (ty - ph.y) * k;
    this._clampPhantom();
  }

  /**
   * 只夹位置、不推进时间：给「本帧后半段本体高速位移」的分支（俯冲 / 冲撞 / 移步）收尾用。
   * 硬上限保证 Boss 突进时半灵不会被拉成一根横跨屏幕的牵引线。
   */
  _clampPhantom() {
    const ph = this.phantom;
    if (!ph) return;
    const ddx = ph.x - this.x;
    const ddy = ph.y - this.y;
    const dd = Math.hypot(ddx, ddy);
    if (dd > ph.maxDist) {
      const k = ph.maxDist / dd;
      ph.x = this.x + ddx * k;
      ph.y = this.y + ddy * k;
      ph.gap = ph.maxDist;
    } else {
      ph.gap = dd;
    }
  }

  /**
   * 半灵被玩家子弹命中：只涨断灵槽，不伤本体。满槽立即触发消散。
   * @returns {number} 本次涨了多少（0 = 无用命中 / 已消散）
   */
  _onPhantomHit(dmg, hx, hy, fx) {
    const ph = this.phantom;
    if (!ph) return 0;
    ph.hits++;
    this._ix.phantomHits++;
    fx?.sparkle?.(hx, hy, (this.phantomDef && this.phantomDef.color) || '#9fe8d0');
    if (ph.dissipateT > 0) return 0;
    // 每帧增幅上限：高射速弹幕一帧糊满会让「攒槽」失去节奏
    if (ph._frameGain >= ph.gaugePerFrame) return 0;
    const gain = Math.min(ph.gaugePerHit, ph.gaugePerFrame - ph._frameGain);
    ph._frameGain += gain;
    ph.gauge = Math.min(ph.gaugeMax, ph.gauge + gain);
    if (ph.gauge >= ph.gaugeMax) this._breakPhantom(fx);
    return gain;
  }

  /** 断灵槽满：半灵消散（视觉 + 全系统 debuff 开关） */
  _breakPhantom(fx) {
    const ph = this.phantom;
    if (!ph || ph.dissipateT > 0) return;
    const d = this.phantomDef || {};
    ph.breaks++;
    ph.dissipateT = ph.dissipateDur;
    ph.gauge = ph.gaugeMax;
    this._ix.phantomBreak++;
    // 立即生效（不等下一帧）：破的当下就减半 / 减速 / 易伤，玩家马上能感到「打对了」
    this.phantomShotK = d.dissipateShotK || 0.5;
    this.phantomSlowK = d.dissipateSlowK || 0.55;
    this.phantomVulnK = d.dissipateVulnK || 1.35;
    fx?.burst?.(ph.x, ph.y, '#c8ffe8', 22, 380);
    fx?.shockwave?.(ph.x, ph.y, d.color || this.def.accent, 22, 620, 0.6);
    fx?.flash?.(ph.x, ph.y, '#ffffff', 18);
  }

  /* ---------------- 随机数 ---------------- */

  _rnd() {
    this._seed = (this._seed + 0x6d2b79f5) >>> 0;
    let t = this._seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [a, b) 均匀分布 */
  rnd(a = 0, b = 1) { return a + (b - a) * this._rnd(); }

  /** [a, b] 整数 */
  rndInt(a, b) { return a + Math.floor(this._rnd() * (b - a + 1)); }

  chance(p) { return this._rnd() < p; }

  /**
   * 排队一个延迟弹幕动作（秒）。用于 meteor / mine：先发射「壳弹」，
   * 到点再在壳弹当前位置爆开。队列长度有硬上限，避免慢速弹堆积时无限膨胀。
   * @param {number} delay 延迟秒数
   * @param {Function} fn 到点执行，签名 (api) => void
   */
  _scheduleLater(delay, fn) {
    if (this._laterQ.length >= 64) this._laterQ.shift();
    this._laterQ.push({ at: Math.max(0, delay), fn });
  }

  /** 推进延迟队列；调用方保证每帧只调一次（切卡 / 清屏时 queue 会被清空） */
  _processLater(dt, api) {
    if (!this._laterQ.length) return;
    const due = [];
    for (let i = this._laterQ.length - 1; i >= 0; i--) {
      const it = this._laterQ[i];
      it.at -= dt;
      if (it.at <= 0) {
        due.push(it);
        this._laterQ.splice(i, 1);
      }
    }
    // 倒序取出，按入队顺序执行，保证确定性
    due.reverse();
    for (const it of due) {
      try {
        it.fn(api);
      } catch (e) {
        // 单个回调出错不应打断整场战斗
        if (typeof console !== 'undefined' && console.warn) console.warn('[boss] later callback failed', e);
      }
    }
  }

  /** 清空延迟队列（切符卡 / 击败 / 重开时清屏同步） */
  _flushLater() {
    this._laterQ.length = 0;
  }

  get phaseCount() {
    return this.phases.length;
  }

  /** 当前这张符卡的剩余比例（HUD 血条读它） */
  get hpRatio() {
    if (this.spellMaxHp <= 0) return 0;
    return Math.max(0, this.spellHp / this.spellMaxHp);
  }

  /* ---------------- 逐卡限时 / 生存模式 ---------------- */

  /**
   * 进入第 i 张符卡：套用该卡的限时 / 生存 / 卡面 / 密度与弹速倍率。
   * constructor 与 _advanceSpell 共用，保证首卡与后续卡行为完全一致。
   */
  _applyCard(i) {
    const ph = this.phases[i] || {};
    this.mode = ph.mode === 'survival' ? 'survival' : 'damage';
    this.cardDual = ph.mode === 'both';
    const lim = Number(ph.limit);
    this.cardLimit = Number.isFinite(lim) && lim > 0 ? lim : null;
    this.cardElapsed = 0;
    this.cardRemain = this.cardLimit;
    this.cardFx = ph.fx || null;
    this.cardEffect = ph.effect || null;
    this.cardAccent = ph.accent || this.def.accent;
    this.cardSpeedMul = Number(ph.speedMul) > 0 ? Number(ph.speedMul) : 1;
    // 逐卡弹量倍率：只乘弹数（nScale / armScale），不碰弹速
    this.density = this._baseDensity * (Number(ph.densityMul) > 0 ? Number(ph.densityMul) : 1);
    if (ph.name) {
      this.spellName = ph.name;
      this.phaseName = ph.name;
    }
    this.spellMaxHp = Math.max(1, Number(ph.hp) || this.spellMaxHp || 100);
    this.spellHp = this.spellMaxHp;
    this.cardRatio = 1;
  }

  /** 每帧推进卡计时；生存卡到点即置 spellBroken，走统一切卡流程（= 玩家坚持成功） */
  _tickCardTimer(dt, opts) {
    if (opts && typeof opts.onCardResult === 'function') this._cardResultCb = opts.onCardResult;
    this.cardElapsed += dt;
    if (this.mode === 'survival') {
      if (this.cardLimit) {
        this.cardRemain = Math.max(0, this.cardLimit - this.cardElapsed);
        this.cardRatio = clamp(1 - this.cardElapsed / this.cardLimit, 0, 1);
        // 兼容旧的 hpRatio 血条读数：生存卡把血条画成「坚持进度」
        this.spellHp = Math.max(0, this.spellMaxHp * this.cardRatio);
        if (this.cardElapsed >= this.cardLimit) this.spellBroken = true;
      } else {
        this.cardRemain = null;
        this.cardRatio = 1;
      }
      return;
    }
    this.cardRemain = this.cardLimit != null ? Math.max(0, this.cardLimit - this.cardElapsed) : null;
    this.cardRatio = this.spellMaxHp > 0 ? clamp(this.spellHp / this.spellMaxHp, 0, 1) : 0;
    // 双条件卡：撑到限时也算过关（走统一切卡流程，血条没打空也不判失败）
    if (this.cardDual && this.cardLimit && this.cardElapsed >= this.cardLimit) this.spellBroken = true;
  }

  /** 本卡结算快照：damage 卡在限时内打空才算成功；生存卡坚持到点即成功 */
  _cardResultSnapshot() {
    const limit = this.cardLimit;
    let ok = true;
    // 双条件卡两种过关方式都算成功；普通 damage 卡必须限时内打空
    if (this.mode !== 'survival' && !this.cardDual && limit != null) ok = this.cardElapsed <= limit + 1e-6;
    return {
      index: this.spellIdx,
      // 切片后的本场序号 + 本场起点 = 完整卡表里的序号（EX 咲夜两场共用一份四卡数据）
      globalIndex: this.spellIdx + (this.cardGlobalFrom || 0),
      name: this.spellName,
      mode: this.mode,
      ok,
      elapsed: Number(this.cardElapsed.toFixed(3)),
      limit,
      last: this.spellIdx >= this.phases.length - 1,
    };
  }

  /* ---------------- 招式随机化 ---------------- */

  /** 开一招：抽招式变体 + 随机持续时间 + 下一发的间隔 */
  _startPattern(idx) {
    const patterns = this.phases[this.spellIdx].patterns;
    this.patternIdx = ((idx % patterns.length) + patterns.length) % patterns.length;
    const p = patterns[this.patternIdx];
    this.patternT = 0;
    this.fireT = 0;
    this._pat = {
      angle: this.rnd(0, TAU),                 // 整招的基准角
      dir: this.chance(0.5) ? 1 : -1,          // 旋转 / 转向方向
      nScale: this.rnd(0.78, 1.26) * (1 + (this.wild - 0.6) * 0.15) * this.diff.bulletCountScale * this.stageDensity * this.density,
      speedScale: this.rnd(0.86, 1.14) * this.diff.bulletSpeedScale,
      spreadScale: this.rnd(0.78, 1.26),
      rateScale: this.rnd(0.85, 1.18) * this.diff.fireIntervalScale,
      wobbleScale: this.rnd(0.7, 1.35),
      armScale: this.rnd(0.8, 1.25) * this.density,
      ringScale: this.rnd(0.8, 1.2),
    };
    this._nextRate = this._rollRate(p);
    // 4.2–8.6 秒，阶段越后 / wild 越高，单招越短（换招更频繁）
    this.patternDur = this.rnd(4.2, 8.6) / clamp(0.8 + this.wild * 0.28, 0.8, 1.2);
  }

  _rollRate(p) {
    const base = p.rate || 1;
    return clamp(base * this._pat.rateScale * this.rnd(0.9, 1.1), 0.045, 12);
  }

  /** 随机换下一招：按 weight 抽，且不会连续抽到同一招 */
  _chooseNextPattern() {
    const patterns = this.phases[this.spellIdx].patterns;
    const n = patterns.length;
    let idx = this.patternIdx;
    if (n > 1) {
      let total = 0;
      for (let i = 0; i < n; i++) if (i !== this.patternIdx) total += (patterns[i].weight || 1);
      let r = this.rnd(0, total);
      for (let i = 0; i < n; i++) {
        if (i === this.patternIdx) continue;
        r -= (patterns[i].weight || 1);
        if (r <= 0) { idx = i; break; }
      }
      if (idx === this.patternIdx) idx = (this.patternIdx + 1) % n;
    }
    this._startPattern(idx);
  }

  /* ---------------- 随机移动 ---------------- */

  _pickMoveTarget(fx) {
    const mv = this._move;
    const curX = this.x;
    const curY = this.y;
    const rx = 130 + this.spellIdx * 26;
    const ry = 46 + this.spellIdx * 9;
    const roll = this.rnd();

    mv.sx = curX;
    mv.sy = curY;
    mv.t = 0;

    if (roll < 0.16) {
      // 短暂悬停：让弹幕有一瞬间从固定点散开
      mv.tx = curX;
      mv.ty = curY;
      mv.dur = this.rnd(0.35, 0.85);
      mv.dashing = false;
      return;
    }

    if (roll < 0.3) {
      // 短冲刺：快速换位，配合爆发粒子
      mv.tx = clamp(this.homeX + this.rnd(-rx, rx), this.homeX - rx - 20, this.homeX + rx + 20);
      mv.ty = clamp(this.homeY + this.rnd(-ry, ry), this.homeY - ry - 10, this.homeY + ry + 10);
      mv.dur = this.rnd(0.16, 0.3);
      mv.dashing = true;
      fx?.burst(curX, curY - 60, this.def.accent, 6, 240);
      return;
    }

    mv.tx = clamp(this.homeX + this.rnd(-rx, rx), this.homeX - rx - 20, this.homeX + rx + 20);
    mv.ty = clamp(this.homeY + this.rnd(-ry, ry), this.homeY - ry - 10, this.homeY + ry + 10);
    mv.dur = this.rnd(0.7, 1.6);
    mv.dashing = false;
  }

  _updateMovement(dt, fx) {
    const mv = this._move;
    if (mv.dur > 0) {
      // 半灵消散期间本体减速（phantomSlowK；普通 Boss 恒为 1）
      mv.t += dt * (this.phantomSlowK || 1);
      const k = Math.min(1, mv.t / mv.dur);
      // easeInOutQuad，起停都软
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.x = mv.sx + (mv.tx - mv.sx) * e;
      this.y = mv.sy + (mv.ty - mv.sy) * e;
      if (k >= 1) {
        mv.dur = 0;
        if (mv.dashing) fx?.burst(this.x, this.y - 60, this.def.accent, 5, 180);
        this._moveWait = this.rnd(0.3, 1.3);
      }
    } else {
      this._moveWait -= dt;
      if (this._moveWait <= 0) this._pickMoveTarget(fx);
    }
    this._clampPhantom();
  }

  /* ---------------- 计划外变招 ---------------- */

  _updateWild(dt, player, bullets, fx) {
    if (this._wildLeft > 0) {
      this._wildT -= dt;
      if (this._wildT <= 0) {
        this._wildVolley(player, bullets);
        this._wildLeft--;
        this._wildT = this.rnd(0.1, 0.3);
      }
      return;
    }

    this._wildCd -= dt;
    if (this._wildCd > 0) return;

    this._wildLeft = this.rndInt(2, 3);
    this._wildT = 0;
    // 变招频率也跟难度走：E 更久才来一次，L 来得更勤
    this._wildCd = this.rnd(8, 15) * clamp(this.diff.fireIntervalScale, 0.7, 1.6);
    fx?.flash(this.x, this.y - 80, this.def.accent, 24);
    fx?.shockwave(this.x, this.y - 70, this.def.accent, 16, 700, 0.4);
  }

  /** 一波计划外弹幕：环 / 扇 / 散射三选一，参数当场随机（跟着难度与密度自适应缩放） */
  _wildVolley(player, bullets) {
    // 变招是「额外」弹幕：屏幕比较满时直接放弃，优先保证已有弹幕的缝隙
    if (!bullets || bullets.activeCount >= this.bulletBudget * this.wildAbort) return;
    const pc = this._playerCenter(player);
    const px = pc.x;
    const py = pc.y;
    const aim = Math.atan2(py - this.y, px - this.x);
    const color = this.chance(0.5) ? this.def.accent : '#ffffff';
    const kind = this.rndInt(0, 2);
    // 弹数与弹速：难度倍率 × 分面密度 × 密度自适应 × 本文件密度系数（需求 #7），速度同样夹到上限
    // 半灵消散时整波变招也跟着减半（phantomShotK，普通 Boss 恒为 1）
    const cnt = this.diff.bulletCountScale * this.pressure * this.stageDensity * this.density * (this.phantomShotK || 1);
    const sp = (v) => Math.min(this.speedCap, Math.max(20, v * this.diff.bulletSpeedScale));

    if (kind === 0) {
      const n = clamp(Math.round(this.rndInt(8, 16) * cnt), 4, this.ringLimit);
      bullets.ring(this.x, this.y, n, sp(this.rnd(85, 175)), {
        color,
        r: this.rndInt(4, 8),
        type: 0,
        life: 6,
        angle: this.rnd(0, TAU),
        turn: this.chance(0.45) ? this.rnd(-0.7, 0.7) : 0,
      });
      return;
    }

    if (kind === 1) {
      const n = clamp(Math.round(this.rndInt(3, 7) * cnt), 2, 14);
      bullets.fan(this.x, this.y, n, this.rnd(0.45, 1.15), aim + this.rnd(-0.14, 0.14), sp(this.rnd(150, 275)), {
        color,
        r: this.rndInt(4, 7),
        type: this.chance(0.35) ? 3 : 0,
        life: 6,
      });
      return;
    }

    const n = clamp(Math.round(this.rndInt(6, 12) * cnt), 3, 16);
    for (let i = 0; i < n; i++) {
      const a = this.rnd(0, TAU);
      const speed = sp(this.rnd(70, 200));
      bullets.spawn({
        x: this.x, y: this.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        color,
        r: this.rndInt(4, 7),
        type: 0,
        life: 6,
      });
    }
  }

  /* ---------------- 战斗 ---------------- */

  /**
   * 一张符卡被打空：切到下一张；已经是最后一张则进入击败。
   * 切入时清屏 + 0.6 秒符卡宣言无敌，并重抽招式。
   */
  _advanceSpell(bullets, fx, opts) {
    // 结算当前卡：必须在切卡前快照（限时内打空 = 成功；生存卡坚持到点 = 成功）
    const result = this._cardResultSnapshot();
    this.lastCardResult = result;
    // 只有带逐卡调参数据（cardTune）的 Boss 才上报结算。当前 stage1–6 与 EXTRA 的 remilia /
    // flandre 都已登记逐卡数据，因此 EXTRA 同样参与限时显示与结算；没有 cardTune 的旧 Boss 保持旧行为。
    if (this.cardTune && typeof this._cardResultCb === 'function') {
      try {
        this._cardResultCb(result);
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('[boss] onCardResult failed', e);
      }
    }
    this.spellBroken = false;
    // 切卡 / 击败会清屏，延迟弹幕队列也一并作废（否则旧壳弹会在新卡里炸开）
    this._flushLater();
    // 换卡时清掉上一张卡残留的互动对象/状态，避免冲撞状态机、破势球跨卡泄漏
    this._orbs.length = 0;
    this._orbCd = Math.max(this._orbCd, this.rnd(3.5, 5.5));
    this._ram.state = 'idle';
    this._ram.t = 0;
    this._ramCd = Math.max(this._ramCd, this.rnd(8, 12));
    // 冲撞途中被打断时 Boss 可能停在半空/偏移位置，回位后再进新卡
    this.x = this.homeX;
    this.y = this.baseY;
    // 半灵：换卡即「重新聚形」——槽清空、消散状态解除（旧卡的硬直不跨卡）
    if (this.phantom) {
      this.phantom.gauge = 0;
      this.phantom.dissipateT = 0;
      this.phantom.fade = 1;
      this.phantom.reformT = 0;
      this.phantom._frameGain = 0;
      this.phantom.x = this.homeX + this.rnd(-40, 40);
      this.phantom.y = this.baseY - 96;
      this.phantomShotK = 1;
      this.phantomSlowK = 1;
      this.phantomVulnK = 1;
    }
    const phases = this.phases;

    if (this.spellIdx >= phases.length - 1) {
      this.state = 'defeat';
      this.defeatT = 0;
      bullets?.clear();
      fx?.shockwave(this.x, this.y - 80, this.def.accent, 34, 1200, 0.8);
      fx?.burst(this.x, this.y - 70, this.def.accent, 30, 460);
      return;
    }

    this.spellIdx++;
    this.phase = this.spellIdx;
    const next = phases[this.spellIdx];
    // 套用新卡数据（限时 / 生存 / 卡面 / 密度·弹速倍率），并重置血条与计时
    this._applyCard(this.spellIdx);
    this.spellLock = 0.6;

    // 新符卡重新随机抽招 + 立刻换位
    this._startPattern(this.rndInt(0, next.patterns.length - 1));
    this._moveWait = 0;
    this._pickMoveTarget(fx);

    // 符卡宣言：清掉旧弹幕，给一瞬间的余裕
    this._wildLeft = 0;
    this._wildCd = Math.min(this._wildCd, 1.2);
    bullets?.clear();
    fx?.flash(this.x, this.y - 80, this.def.accent, 26);
    fx?.shockwave(this.x, this.y - 60, this.def.accent, 26, 900, 0.5);
    fx?.burst(this.x, this.y - 60, this.def.accent, 14, 360);
    opts?.onPhase?.(this.spellIdx, this.spellName);
  }

  /** 受到伤害：扣当前符卡血条，打空只置标记（切卡在 update 里统一处理） */
  damage(d) {
    if (this.state !== 'battle' || this.spellLock > 0) return false;
    // 生存卡：Boss 不可击破，玩家只能坚持到计时结束（射击 / 踩踏 / 冲撞全部无效）
    if (this.mode === 'survival') return false;
    // 破势硬直是全伤害加成窗口：把「攒破势」变成正反馈
    if (this.staggerT > 0) d *= 1.7;
    // 半灵消散 = 本体露破绽：易伤窗口（phantomVulnK，普通 Boss 恒为 1）
    d *= this.phantomVulnK || 1;
    this.spellHp -= d;
    this.hp = Math.max(0, this.hp - d);
    this.hitFlash = Math.min(0.16, this.hitFlash + d * 0.01);
    if (this.spellHp <= 0) {
      this.spellHp = 0;
      this.spellBroken = true;
    }
    return false;
  }

  update(dt, player, bullets, fx, opts = {}) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);

    if (this.state === 'intro') {
      // 立绘未就绪时暂缓出场：宁可晚半秒现身，也不要让玩家先看到占位图形再被立绘顶替。
      // 3 秒兜底，防止素材缺失导致 Boss 永远不出现（届时只画一团柔光，见 drawBossPlaceholder）。
      if (!bossArtReady(this.key)) {
        this.artWaitT += dt;
        if (this.artWaitT < 3.0) { this.alpha = 0; return; }
      }
      this.introT += dt;
      this.alpha = Math.min(1, this.introT / 0.8);
      this.y = this.baseY + (1 - this.alpha) * 40;
      if (this.introT > 1.4) {
        this.state = 'battle';
        this.alpha = 1;
        this.y = this.baseY;
        this._move.sy = this.baseY;
        this._move.ty = this.baseY;
      }
      return;
    }

    if (this.state === 'defeat') {
      this.defeatT += dt;
      this.alpha = Math.max(0, 1 - this.defeatT / 1.6);
      this.y = this.baseY + this.defeatT * 26;
      if (this.defeatT > 2.2) this.state = 'dead';
      return;
    }

    if (this.state === 'dead') {
      this.dead = true;
      return;
    }

    // ---------- battle ----------
    this.alpha = 1;

    // 符卡被打空：切下一张 / 全部打完则被击败
    if (this.spellBroken) {
      this._advanceSpell(bullets, fx, opts);
      if (this.state !== 'battle') return;
    }

    // 四重存在：本卡期间维持三个分身（换卡 / 结束时自动清空）
    this._syncClones();

    // 破势球独立推进：符卡宣言无敌 / 硬直 / 俯冲期间球也照常下落，玩家随时可踩
    this._updateOrbs(dt, player, fx);

    // 半灵独立推进：自己的轨迹 / 断灵槽衰减 / 消散状态机。
    // 故意放在 spellLock 与破势硬直 return 之前——半灵是独立实体，不该跟着本体冻结。
    if (this.phantom) this._updatePhantom(dt, fx);

    // 符卡宣言的无敌时间：清屏后的短暂停顿
    if (this.spellLock > 0) {
      this.spellLock = Math.max(0, this.spellLock - dt);
      return;
    }

    // 卡计时（符卡宣言结束后才开始）：damage 卡只记超时评级，生存卡到点自动切卡
    this._tickCardTimer(dt, opts);

    // 破势硬直：前 0.35 秒坠地，之后停在原地不动、不开火、不结算接触伤害
    if (this.staggerT > 0) {
      this.staggerT = Math.max(0, this.staggerT - dt);
      this.poise = 0;
      this.poiseFlash = 0;
      this._staggerHits = 0;
      const fallK = clamp((this.staggerMax - this.staggerT) / 0.35, 0, 1);
      this.y = this.baseY + (this.groundY - this.baseY) * fallK;
      if (this.staggerT <= 0) this._endStagger(fx);
      return;
    }

    this.stompCd = Math.max(0, this.stompCd - dt);
    this.poiseFlash = Math.max(0, this.poiseFlash - dt);
    // 破势自然衰减：磨破势不是一劳永逸，得在衰减前接上后续手段
    this.poise = Math.max(0, this.poise - (this.platformMelee ? this.poiseDecay : 0) * dt);

    // 平台关俯冲：占用移动/开火，形成「Boss 主动进攻 → 落地硬直 → 玩家反打」的循环
    if (this._updateDive(dt, player, bullets, fx)) { this._clampPhantom(); return; }

    // 平台关横向冲撞：蓄力预警 → 冲撞 → 后摇 COUNTER 窗口（可冲刺反击）
    if (this._updateRam(dt, player, fx)) { this._clampPhantom(); return; }

    // STG 关互动：近身压制 / 击破符卡核心（平台关走上面的近战互动，不吃这套）
    if (!this.platformMelee && this.difficulty !== 'EX') this._updateStgKit(dt, player, fx);

    // 随机幅度：符卡越靠后、本张血越少，弹幕越乱
    this.wild = clamp(0.55 + this.spellIdx * 0.12 + (1 - this.hpRatio) * 0.3, 0.55, 1.4);

    // 密度自适应：屏幕占用超过预算阈值（默认 60%，EXTRA 72%）之后，新开的一招按比例收窄弹数。
    // 这一层让「大量增加弹幕」的 L 也不会摊成没缝的墙——越满弹幕越薄，缝隙自动回流。
    const loadRatio = (bullets?.activeCount || 0) / this.bulletBudget;
    this.pressure = loadRatio <= this.pressureStart
      ? 1
      : clamp(1 - (loadRatio - this.pressureStart) * 1.4, this.pressureFloor, 1);

    // 随机移动（替代原来的正弦漂浮）
    this._updateMovement(dt, fx);

    // 延迟弹幕（meteor / mine 的壳弹到点爆裂）：每帧推进一次，和主开火共用同一帧时钟
    if (this._laterQ.length) {
      const pcq = this._playerCenter(player);
      // 延迟爆裂的二次 spawn 也要套本卡的专属弹型（壳弹炸开的碎片），
      // 作用域只包这一帧的推进，避免污染弹池里其他来源的弹。
      if (bullets) bullets.skinMap = skinMapper(this.key, this.spellIdx);
      try {
        this._processLater(dt, { bullets, px: pcq.x, py: pcq.y });
      } finally {
        if (bullets) bullets.skinMap = null;
      }
    }

    // 模式计时 / 开火（节奏也在抖动）
    const patterns = this.phases[this.spellIdx].patterns;
    const pat = patterns[this.patternIdx % patterns.length];
    this.patternT += dt;
    this.fireT += dt;

    if (this.fireT >= this._nextRate) {
      this.fireT = Math.max(0, this.fireT - this._nextRate);
      const pc = this._playerCenter(player);
      firePattern(pat, this, {
        bullets,
        px: pc.x,
        py: pc.y,
        t: this.t,
      }, this.patternT);
      this.volleys++;
      // 四重存在：三个分身按 1→2→3 轮转接拍开火，每三拍才轮到一次（本体每一拍都开火）。
      // 卡面主打仍是本体弹幕，分身只是「另外三个人也在打」的持续输出，不能把屏铺满。
      if (this._clones && this.volleys % 3 === 0) this._fireClonePatterns(pat, bullets, pc);
      this._nextRate = this._rollRate(pat);
    }

    // 计划外变招（叠在主弹幕上）
    this._updateWild(dt, player, bullets, fx);

    // 每招持续随机时长后换招
    if (this.patternT > this.patternDur) {
      this._chooseNextPattern();
    }

    // 接触伤害
    // 落地硬直期不打身体伤害：这一段就是让玩家跳上头顶的奖励窗口，
    // 否则玩家还没踩到就被撞飞（Boss 立绘比碰撞盒高得多，观感上本来就在「身上」）。
    if (this.hurtCd <= 0 && this._dive.state !== 'land' && this._ram.state === 'idle' && this._overlapPlayer(player)) {
      player.hurt(1, this.x);
      this.hurtCd = 0.6;
    }
  }

  _overlapPlayer(p) {
    // 用玩家中心 + 半尺寸判定，平台 / STG 两种玩家对象都能正确计算
    const c = this._playerCenter(p);
    const hw = this.w * 0.42;
    const hh = this.h * 0.72;
    const pw = (p.w || 20) / 2;
    const ph = (p.h || 20) / 2;
    return (
      this.x - hw < c.x + pw &&
      this.x + hw > c.x - pw &&
      this.y - hh < c.y + ph &&
      this.y > c.y - ph
    );
  }

  /**
   * 玩家中心点。
   * 平台关的 Player 有 x/y 包围盒；STG 关的 StgPlayer 只有 worldX / worldY（判定圆心），
   * 早先直接读 player.x 会得到 undefined → 瞄准弹算出 NaN 方向，整招凭空消失。
   */
  _playerCenter(player) {
    if (!player) return { x: this.x, y: this.baseY + 300 };
    const hasBox = typeof player.x === 'number';
    return {
      x: hasBox ? player.x + (player.w || 0) / 2 : (player.worldX ?? this.x),
      y: hasBox ? player.y + (player.h || 0) / 2 : (player.worldY ?? this.baseY + 300),
    };
  }

  /** 玩家子弹命中检测 */
  damageWithShots(shots, fx, onHit) {
    if (this.state !== 'battle' || !shots) return;
    // 生存卡里射击不结算伤害/破势/核心，避免玩家误以为「在削血」
    if (this.mode === 'survival') return;
    const hw = this.w * 0.46;
    const hh = this.h * 0.78;
    // 传 this 作为 targetRef：穿透弹对 Boss 也只结算一次（同一条弹不会连续帧反复削血）
    shots.hitRect(this.x - hw, this.y - hh, hw * 2, hh, (dmg, hx, hy) => {
      // STG 关：贴身压制期间射击增伤
      const stgMul = (!this.platformMelee && this.difficulty !== 'EX' && this._stgPressOn) ? 1.10 : 1;
      const dealt = dmg * stgMul;
      this.damage(dealt);
      // 符卡核心：Boss 身上的可击破装置，持续射击可以打爆（打断当前符卡节奏 + 额外伤害）
      this._damageCore(dealt, hx, hy, fx);
      // 射击也攒破势，但效率远低于踩踏 / 冲刺：持续输出能磨出硬直，主动近战才是捷径。
      // 破势量按 maxHp 归一化；反打窗口（俯冲落地 / 冲撞后摇）里由 _addPoise 再翻倍。
      if (this._counterWindow()) this._ix.counterShot++;
      this._addPoise(Math.min(6, dmg * this._shotPoiseK), fx);
      // 硬直放大器：硬直期每 8 次命中追加一跳伤害，鼓励在硬直窗口内持续贴脸
      if (this.staggerT > 0) {
        this._staggerHits++;
        if (this._staggerHits % 8 === 0) {
          this.damage(scalePlayerDamage(14));
          this._ix.staggerCombo++;
          fx?.sparkle(hx, hy, '#ffe66d');
        }
      }
      fx?.sparkle(hx, hy, this.inmDefColor());
      onHit?.(dmg);
    }, this);

    // 半灵受击：本体优先吃弹（上面的 hitRect 先跑，绝不抢本体 DPS），
    // 漏过本体的子弹打中半灵 → 只攒断灵槽，不伤本体、也不算 bossHit。
    // targetRef 用 this._phantomRef：穿透弹对半灵同样只结算一次。
    const ph = this.phantom;
    if (ph) {
      const pr = ph.hitR;
      shots.hitRect(ph.x - pr, ph.y - pr, pr * 2, pr * 2, (dmg, hx, hy) => {
        this._onPhantomHit(dmg, hx, hy, fx);
      }, this._phantomRef);
    }
  }

  inmDefColor() {
    return this.def.accent || '#ffffff';
  }

  /** 冲刺撞击：平台关里伤害更高，并且额外削一截破势 */
  hitByDash(player, fx) {
    if (!player) return false;
    if (this.state !== 'battle' || this.hurtCd > 0) return false;
    if (this.spellLock > 0) return false;
    const hw = this.w * 0.42;
    const hh = this.h * 0.72;
    const p = player;
    if (this.x - hw < p.x + p.w && this.x + hw > p.x && this.y - hh < p.y + p.h && this.y > p.y) {
      // 冲撞后摇里冲进来 = COUNTER：伤害 ×1.5，破势翻倍（窗口加成后再 ×1.6 ≈ 旧值的 2 倍）
      const counter = this._ram.state === 'recover';
      this.damage(scalePlayerDamage((this.platformMelee ? 64 : 28) * (counter ? 1.5 : 1)));
      this.hurtCd = 0.35;
      if (this.platformMelee) this._addPoise(counter ? 26 : 20, fx);
      if (counter) {
        this._ix.ramPunish++;
        fx?.flash(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 18);
      }
      fx?.shockwave(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 14, 480, 0.3);
      return true;
    }
    return false;
  }

  /* ============================================================
     平台关近战：破势 / 踩踏 / 硬直 / 俯冲
     ============================================================ */

  /** 累积破势；满槽进入坠地硬直 */
  _addPoise(n, fx) {
    if (!this.platformMelee || this.state !== 'battle') return;
    if (this.spellLock > 0 || this.staggerT > 0) return;
    // 反打窗口加成：Boss 刚落地 / 冲撞刚结束的硬直里，破势来得更快
    const win = this._counterWindow();
    if (win === 'dive') n *= 1.8;
    else if (win === 'ram') n *= 1.6;
    this.poise = Math.min(this.poiseMax, this.poise + n);
    this.poiseFlash = 0.12;
    if (this.poise >= this.poiseMax) this._startStagger(fx);
  }

  /** 破势打满：坠地硬直，破势槽上限随之提高（每场最多涨到 240） */
  _startStagger(fx) {
    this.staggerT = this.staggerMax;
    this.poise = 0;
    this.poiseMax = Math.min(240, this.poiseMax + 25);
    this.staggerCount++;
    // 俯冲/蓄力被打断，从当前高度坠向地面
    this._dive.state = 'idle';
    this._dive.t = 0;
    // 冲撞也打断，回到巡游位（否则状态机会卡在 rush/recover 里）
    this._ram.state = 'idle';
    this._ram.t = 0;
    this._ramCd = Math.max(this._ramCd, this.rnd(7, 11));
    this._staggerHits = 0;
    this.hurtCd = Math.max(this.hurtCd, 0.15);
    this._wildLeft = 0;
    fx?.flash(this.x, this.y - this.h * 0.6, '#ffe66d', 26);
    fx?.shockwave(this.x, this.y - this.h * 0.5, '#ffe66d', 24, 760, 0.5);
    fx?.burst(this.x, this.y - this.h * 0.6, '#ffe66d', 18, 320);
  }

  /** 硬直结束：升空，重新开始巡游 */
  _endStagger(fx) {
    const d = this._dive;
    d.state = 'rise';
    d.t = 0;
    d.tx = this.x;
    d.ty = this.y;
    d.fromX = this.x;
    d.fromY = this.y;
    this._move.dur = 0;
    fx?.burst(this.x, this.y - 20, this.def.accent, 8, 200);
  }

  /**
   * 平台关：玩家从上方落到 Boss 头顶。
   * 返回 true 表示结算了踩踏（stage 用来播放音效 / 震屏）。
   */
  stompBy(player, fx) {
    if (!this.platformMelee || this.state !== 'battle') return false;
    if (this.spellLock > 0) return false;
    if (this.stompCd > 0 || !player || player.alive === false) return false;
    const pc = this._playerCenter(player);
    if (Math.abs(pc.x - this.x) > this.w * 0.52) return false;
    const headTop = this.y - this.h * 0.88;
    const feet = player.y + (player.h || 0);
    // 只在头顶上方一条薄带里结算：太高算没碰到，太低算身体撞击
    if (feet > headTop + 30 || feet < headTop - 52) return false;
    if ((player.vy || 0) < 40) return false; // 必须是下落中
    this.stompCd = 0.9;
    // 俯冲落地窗口内踩头：记为「反打窗口踩踏」遥测
    if (this._dive.state === 'land') this._ix.diveStamp++;
    // 硬直放大器：破势硬直期踩头伤害 ×1.35（再叠 damage() 的 1.7 倍窗口加成）
    let dmg = scalePlayerDamage(96 + this.spellIdx * 18);
    if (this.staggerT > 0) {
      dmg *= 1.35;
      this._ix.staggerStomp++;
    }
    this.damage(dmg);
    this._addPoise(34, fx);
    this.hitFlash = Math.min(0.2, this.hitFlash + 0.14);
    player.vy = -620;
    player.jumpsLeft = 1;
    // 踩完给半秒护身，避免落进刚生成的弹幕里挨打
    player.invuln = Math.max(player.invuln || 0, 0.5);
    fx?.burst(pc.x, headTop, '#ffe66d', 18, 400);
    fx?.shockwave(pc.x, headTop, '#ffffff', 16, 560, 0.35);
    return true;
  }

  /**
   * 俯冲状态机：idle → charge（蓄力预警）→ dive（砸向地面）→ land（落地硬直）→ rise（升空）。
   * 返回 true 表示正在俯冲中，本帧跳过常规移动与开火。
   */
  _updateDive(dt, player, bullets, fx) {
    if (!this.platformMelee) return false;
    const d = this._dive;

    if (d.state === 'idle') {
      this._diveCd -= dt;
      if (this._diveCd > 0) return false;
      const pc = this._playerCenter(player);
      d.state = 'charge';
      d.t = 0;
      d.fromX = this.x;
      d.fromY = this.y;
      d.tx = clamp(pc.x, this.homeX - 300, this.homeX + 300);
      d.ty = this.groundY;
      fx?.flash(this.x, this.y - this.h * 0.6, this.def.accent, 16);
      return true;
    }

    d.t += dt;

    if (d.state === 'charge') {
      // 0.8 秒蓄力：先上浮再压下来，视觉上「要砸了」，给玩家起跳时机
      const k = Math.min(1, d.t / 0.8);
      this.y = d.fromY - Math.sin(k * Math.PI) * 26;
      if (k >= 1) { d.state = 'dive'; d.t = 0; d.fromX = this.x; d.fromY = this.y; }
      return true;
    }

    if (d.state === 'dive') {
      // 0.26 秒加速砸向落点
      const k = Math.min(1, d.t / 0.26);
      const e = k * k;
      this.x = d.fromX + (d.tx - d.fromX) * e;
      this.y = d.fromY + (d.ty - d.fromY) * e;
      if (k >= 1) {
        d.state = 'land';
        d.t = 0;
        this._onDiveLand(bullets, fx);
      }
      return true;
    }

    if (d.state === 'land') {
      // 落地反打窗口：头顶可踩、贴身可冲、射击破势 ×1.8，1.0 秒后升空
      if (d.t >= 1.0) { d.state = 'rise'; d.t = 0; d.tx = this.x; d.ty = this.y; }
      return true;
    }

    // rise：升回悬停位
    const k = Math.min(1, d.t / 0.65);
    const e = 1 - Math.pow(1 - k, 2);
    this.x = d.tx + (this.homeX - d.tx) * e;
    this.y = d.ty + (this.baseY - d.ty) * e - Math.sin(k * Math.PI) * 18;
    if (k >= 1) {
      d.state = 'idle';
      this.x = this.homeX;
      this.y = this.baseY;
      this._move.sx = this.x;
      this._move.sy = this.y;
      this._move.t = 0;
      this._move.dur = 0;
      this._moveWait = this.rnd(0.5, 1.1);
      this._diveCd = this.rnd(5.5, 9);
      this._diveCount++;
    }
    return true;
  }

  /** 俯冲落地：扬尘 + 贴地横向冲击波，要求玩家起跳躲 */
  _onDiveLand(bullets, fx) {
    const gy = this.y;
    this.hurtCd = 0.25;
    this._ix.diveLand++;
    // 落地顺手甩一颗破势球：把「躲冲击波」接成「踩球 → 反打」的连续动作
    this._spawnOrbs(fx, 1);
    fx?.shockwave(this.x, gy - 4, '#ffffff', 30, 960, 0.5);
    fx?.burst(this.x, gy - 6, this.def.accent, 26, 440);
    if (!bullets) return;
    for (let i = 1; i <= 3; i++) {
      const speed = 170 + i * 46;
      for (const dir of [-1, 1]) {
        bullets.spawn({
          x: this.x + dir * 40,
          y: gy - 18,
          vx: dir * speed,
          vy: 0,
          color: this.def.accent || '#ffffff',
          r: 9,
          type: 0,
          life: 2.2,
        });
      }
    }
  }

  /* ============================================================
     需求 #4：可主动参与的互动（破势球 / 冲撞 COUNTER / 反打窗口 / 硬直放大器）
     全部只在平台关生效（和 platformMelee 一致），STG 关保持原样。
     ============================================================ */

  /** 当前是否处于「反打窗口」：'dive'（俯冲落地）| 'ram'（冲撞后摇）| null */
  _counterWindow() {
    if (this._dive && this._dive.state === 'land') return 'dive';
    if (this._ram && this._ram.state === 'recover') return 'ram';
    return null;
  }

  /** 甩出可踩的破势球：抛物线落到地面静置，从上方踩爆 = 一大截破势 */
  _spawnOrbs(fx, n = 2) {
    if (!this.platformMelee || this.state !== 'battle') return;
    for (let i = 0; i < n; i++) {
      const dir = n === 1 ? (this.chance(0.5) ? 1 : -1) : (i % 2 === 0 ? -1 : 1);
      this._orbs.push({
        x: this.x + dir * this.rnd(30, 80),
        y: this.y - this.h * 0.35,
        vx: dir * this.rnd(30, 90),
        vy: this.rnd(-160, -40),
        r: 13,
        t: 0,
        life: 11,
        rest: false,
        spin: this.rnd(0, TAU),
      });
      if (this._orbs.length > 6) this._orbs.shift();
    }
    this._ix.orbSpawn += n;
    fx?.flash(this.x, this.y - this.h * 0.35, '#7fd6ff', 10);
  }

  /** 破势球更新：飞 → 落地静置；玩家从上方落下踩到即爆（球不挡弹幕、不挡路） */
  _updateOrbs(dt, player, fx) {
    if (!this.platformMelee) return;
    const gy = this.groundY;
    for (let i = this._orbs.length - 1; i >= 0; i--) {
      const o = this._orbs[i];
      o.t += dt;
      o.life -= dt;
      if (!o.rest) {
        o.vy += 1500 * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.spin += dt * 4;
        if (o.y >= gy - o.r) {
          o.y = gy - o.r;
          o.vx = 0;
          o.vy = 0;
          o.rest = true;
        }
      }
      // 踩踏判定：玩家下落中，脚底落在球体上半区（冲刺穿过不算）
      if (o.life > 0 && player && player.alive !== false && !player.dashing) {
        const pc = this._playerCenter(player);
        const feet = player.y + (player.h || 0);
        if ((player.vy || 0) > 40 &&
            Math.abs(pc.x - o.x) < o.r + 20 &&
            feet > o.y - o.r - 30 && feet < o.y + o.r + 4) {
          this._popOrb(o, player, fx);
          this._orbs.splice(i, 1);
          continue;
        }
      }
      if (o.life <= 0) this._orbs.splice(i, 1);
    }

    // 生成节奏：常驻互动（与俯冲 / 冲撞独立），7.5–11.5 秒一波、每波 2 颗
    if (this.state === 'battle') {
      this._orbCd -= dt;
      if (this._orbCd <= 0 && this._orbs.length < 6) {
        this._orbCd = this.rnd(7.5, 11.5);
        this._spawnOrbs(fx, 2);
      }
    }
  }

  /** 踩破破势球：小伤害 + 一大截破势 + 把玩家弹起；硬直中踩则伤害加成 */
  _popOrb(o, player, fx) {
    this._ix.orbStomp++;
    let dmg = scalePlayerDamage(22);
    if (this.staggerT > 0) {
      dmg *= 1.5;
      this._staggerHits += 3;
    }
    this.damage(dmg);
    this._addPoise(18, fx);
    player.vy = -640;
    player.jumpsLeft = 1;
    player.invuln = Math.max(player.invuln || 0, 0.35);
    this.poiseFlash = 0.15;
    fx?.burst(o.x, o.y, '#7fd6ff', 16, 380);
    fx?.shockwave(o.x, o.y, '#7fd6ff', 14, 420, 0.3);
  }

  /**
   * 横向冲撞状态机：idle → windup（0.55s 白闪蓄力预警，可跳 / 可闪）→ rush（0.32s 贴地冲撞）
   * → recover（0.75s 后摇，白闪 COUNTER 窗口）→ rise（0.55s 回巡游位）。
   * 返回 true 表示正在冲撞中，本帧跳过常规移动与开火（后摇 / 回升期不结算接触伤害）。
   */
  _updateRam(dt, player, fx) {
    if (!this.platformMelee) return false;
    const r = this._ram;

    if (r.state === 'idle') {
      // 俯冲优先级更高；俯冲期间不给冲撞计时，免得两招撞车
      if (this._dive.state !== 'idle') return false;
      this._ramCd -= dt;
      if (this._ramCd > 0) return false;
      const pc = this._playerCenter(player);
      r.state = 'windup';
      r.t = 0;
      r.hit = false;
      r.fromX = this.x;
      r.fromY = this.y;
      r.dir = pc.x >= this.x ? 1 : -1;
      r.ty = clamp(pc.y - 20, this.baseY - 40, this.groundY - 70);
      r.tx = clamp(this.x + r.dir * 560, this.homeX - 640, this.homeX + 640);
      this._ix.ramCharge++;
      fx?.flash(this.x, this.y - this.h * 0.5, '#ffffff', 16);
      return true;
    }

    r.t += dt;

    if (r.state === 'windup') {
      // 后仰蓄力：白闪 + 位移都在提示「要冲了」，给玩家起跳 / 冲刺离开的时间
      const k = Math.min(1, r.t / 0.55);
      this.x = r.fromX - r.dir * 34 * k;
      this.y = r.fromY + (r.ty - r.fromY) * k * 0.45;
      if (k >= 1) { r.state = 'rush'; r.t = 0; }
      return true;
    }

    if (r.state === 'rush') {
      const k = Math.min(1, r.t / 0.32);
      const e = k * k;
      this.x = r.fromX + (r.tx - r.fromX) * e;
      this.y = r.fromY + (r.ty - r.fromY) * (0.45 + 0.55 * e);
      if (this.hurtCd <= 0 && player && player.alive !== false && this._overlapPlayer(player)) {
        player.hurt(1, this.x);
        this.hurtCd = 0.6;
        r.hit = true;
      }
      if (k >= 1) {
        r.state = 'recover';
        r.t = 0;
        if (!r.hit) this._ix.ramWhiff++;
        fx?.flash(this.x, this.y - this.h * 0.5, '#ffffff', 22);
        fx?.shockwave(this.x, this.y - 16, '#ffffff', 24, 720, 0.45);
      }
      return true;
    }

    if (r.state === 'recover') {
      // 后摇 0.75s：白闪 + COUNTER，冲刺撞进来伤害 ×1.5 / 破势翻倍
      if (r.t >= 0.75) { r.state = 'rise'; r.t = 0; r.fromX = this.x; r.fromY = this.y; }
      return true;
    }

    // rise：0.55s 回到巡游位
    const k = Math.min(1, r.t / 0.55);
    const e = 1 - Math.pow(1 - k, 2);
    this.x = r.fromX + (this.homeX - r.fromX) * e;
    this.y = r.fromY + (this.baseY - r.fromY) * e - Math.sin(k * Math.PI) * 12;
    if (k >= 1) {
      r.state = 'idle';
      this.x = this.homeX;
      this.y = this.baseY;
      this._move.sx = this.x;
      this._move.sy = this.y;
      this._move.t = 0;
      this._move.dur = 0;
      this._moveWait = this.rnd(0.5, 1.0);
      this._ramCd = this.rnd(9, 15);
    }
    return true;
  }

  /** 破势球绘制（世界坐标 → 以 Boss 为原点的局部坐标） */
  _drawOrbs(ctx) {
    if (!this._orbs.length) return;
    for (const o of this._orbs) {
      const x = o.x - this.x;
      const y = o.y - this.y;
      const pulse = 0.85 + 0.15 * Math.sin((o.t + o.spin) * 5);
      ctx.save();
      ctx.translate(x, y);
      if (o.rest) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(0, o.r * 0.9, o.r * 0.95, o.r * 0.32, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, o.r * 2.1);
      g.addColorStop(0, 'rgba(190,245,255,0.95)');
      g.addColorStop(0.45, 'rgba(127,214,255,0.55)');
      g.addColorStop(1, 'rgba(127,214,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 2.1, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#d8f6ff';
      ctx.beginPath();
      ctx.arc(0, 0, o.r * pulse, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 落地后闪一个向下的小箭头：提示「可以踩」
      if (o.rest) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.t * 8);
        ctx.fillStyle = '#7fd6ff';
        ctx.beginPath();
        ctx.moveTo(-6, -o.r - 16);
        ctx.lineTo(6, -o.r - 16);
        ctx.lineTo(0, -o.r - 6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // 快消失时红圈闪烁
      if (o.life < 2.2) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 22);
        ctx.strokeStyle = '#ff6b8a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, o.r + 4, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Boss 头顶的破势槽 / 眩晕星（仅平台关） */
  /** STG 关互动（非 EX）：① 贴身压制 ② 可击破符卡核心 */
  _updateStgKit(dt, player, fx) {
    if (this.state !== 'battle' || this.spellLock > 0) return;
    const pc = this._playerCenter(player);
    const d = Math.hypot(pc.x - this.x, pc.y - this.y);
    // ① 贴身压制：在 Boss 近距 300px 内持续 1.2s → 获得短暂射击增伤（每次激活计一次数）
    if (d < 300) this._stgPressT = Math.min(2.2, this._stgPressT + dt);
    else this._stgPressT = Math.max(0, this._stgPressT - dt * 2);
    if (this._stgPressT >= 1.2 && !this._stgPressOn) {
      this._stgPressOn = true;
      this._stgPressT = 1.8;
      this._ix.stgPressure++;
      fx?.flash(this.x, this.y - 70, '#7fd6ff', 18);
      fx?.shockwave(this.x, this.y - 70, '#7fd6ff', 14, 420, 0.35);
    }
    if (this._stgPressOn) {
      this._stgPressT -= dt;
      if (this._stgPressT <= 0) { this._stgPressOn = false; this._stgPressT = 0; }
    }
    // ② 符卡核心：每 15–21s 在 Boss 头顶附近显形，存活 9s；打爆后 Boss 停火 1.1s + 掉一截血
    this._coreFlash = Math.max(0, this._coreFlash - dt);
    if (this._core) {
      this._core.t += dt;
      if (this._core.t > 7) { this._core = null; this._coreCd = this.rnd(18, 24); }
    } else {
      this._coreCd -= dt;
      if (this._coreCd <= 0) {
        this._core = { t: 0, hp: 360, maxHp: 360, ox: this.rnd(-64, 64), oy: this.rnd(-92, -54) };
        this._coreCd = this.rnd(28, 36);
        fx?.flash(this.x, this.y - 70, '#ffe66d', 20);
      }
    }
  }

  _corePos() { return this._core ? { x: this.x + this._core.ox, y: this.y + this._core.oy } : null; }

  _damageCore(dmg, hx, hy, fx) {
    const c = this._core;
    if (!c || this.state !== 'battle') return;
    c.hp -= dmg;
    this._ix.coreHit++;
    this._coreFlash = 0.12;
    if (c.hp > 0) return;
    const cp = this._corePos();
    this._core = null;
    this._coreCd = this.rnd(20, 26);
    this._coreFlash = 0.5;
    this._ix.coreBreak++;
    this.damage(scalePlayerDamage(50));
    this.spellLock = Math.max(this.spellLock, 1.1);
    if (cp) {
      fx?.flash(cp.x, cp.y, '#ffe66d', 26);
      fx?.shockwave(cp.x, cp.y, '#ffe66d', 20, 760, 0.45);
    }
  }

  _drawStgKit(ctx) {
    if (this.platformMelee || this.difficulty === 'EX') return;
    if (this._core) {
      const k = clamp(this._core.hp / this._core.maxHp, 0, 1);
      const pulse = 0.9 + Math.sin(this.t * 8) * 0.1;
      ctx.save();
      ctx.translate(this._core.ox, this._core.oy);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this._coreFlash > 0 ? 'rgba(255,230,109,0.92)' : 'rgba(127,214,255,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 15 * pulse, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffe66d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = this.t * 1.5 + (i * TAU) / 6;
        const rr = 20;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(8,10,24,0.65)';
      ctx.fillRect(-22, 26, 44, 4);
      ctx.fillStyle = k > 0.4 ? '#ffe66d' : '#ff6b8a';
      ctx.fillRect(-21, 27, 42 * k, 2);
      ctx.restore();
    }
    if (this._stgPressOn) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7fd6ff';
      ctx.font = 'bold 13px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('贴身压制 ×1.10', 0, -this.h * 0.95);
      ctx.restore();
    }
  }

  _drawMeleeUI(ctx) {
    if (!this.platformMelee || this.state !== 'battle' || this.alpha < 0.5) return;
    // 立绘高度（脚底原点向上）：碰撞盒 h 只有 132，立绘却有 236~256
    const artH = bossArtHeight(this.key);
    const y = -artH - 18;
    const stompTop = -this.h * 0.88;

    // 可踩窗口：在头顶高度闪一个向下的箭头，告诉玩家「现在能踩」
    const canStomp = this._dive.state === 'land' || this.staggerT > 0;
    if (canStomp) {
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 9);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      ctx.moveTo(-11, stompTop - 40);
      ctx.lineTo(11, stompTop - 40);
      ctx.lineTo(0, stompTop - 24);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 冲撞预警 / 反打窗口提示：白闪时告诉玩家「现在可以贴脸输出」
    const win = this._counterWindow();
    if (win) {
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 14);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('COUNTER!', 0, y - 26);
      ctx.restore();
    } else if (this._ram.state === 'windup') {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 20);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff6b8a';
      ctx.font = 'bold 15px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('DASH!', 0, y - 26);
      ctx.restore();
    }

    if (this.staggerT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe66d';
      ctx.font = 'bold 15px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('STAGGER!', 0, y - 8);
      // 硬直放大器：显示硬直期连击数（每 8 跳追加一次伤害）
      if (this._staggerHits > 0) {
        ctx.font = 'bold 12px "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.fillStyle = '#ffe66d';
        ctx.fillText(`连击 ${this._staggerHits}`, 0, y + 10);
      }
      for (let i = 0; i < 3; i++) {
        const a = this.t * 6 + (i * TAU) / 3;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 36, -artH + 58 + Math.sin(a) * 10, 4.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    const w = 96;
    const h = 7;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,24,0.62)';
    ctx.fillRect(-w / 2, y, w, h);
    const r = clamp(this.poise / this.poiseMax, 0, 1);
    ctx.fillStyle = r > 0.72 ? '#ff6b8a' : r > 0.4 ? '#ffd166' : '#7fd6ff';
    ctx.fillRect(-w / 2 + 1, y + 1, (w - 2) * r, h - 2);
    ctx.strokeStyle = this.poiseFlash > 0 ? 'rgba(255,230,109,0.95)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2 + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /**
   * 半灵绘制（def.system === 'phantom'）：柔光 + 半透明幽灵半身 + 本体牵引线 + 断灵槽。
   * 全部画在 Boss 立绘之前：半灵被本体遮住的地方就是遮住，不做穿插。
   * 消散中：整体压到 45% 透明度、牵引线变断点、槽环闪烁；复原时自然淡回。
   */
  _drawPhantom(ctx, t) {
    const ph = this.phantom;
    if (!ph) return;
    const d = this.phantomDef || {};
    const accent = d.color || this.def.accent || '#9fe8d0';
    const dx = ph.x - this.x;
    const dy = ph.y - this.y;
    const diss = ph.dissipateT > 0;
    const a = clamp(ph.fade * this.alpha, 0, 1);
    if (a <= 0.02) return;
    const breathe = 0.94 + Math.sin(t * 2.4 + ph.lissPhase) * 0.06;

    // 牵引线：本体胸口 → 半灵，二次曲线 + 流动虚线；消散时断成散点
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `${accent}${diss ? '2e' : '5c'}`;
    ctx.lineWidth = diss ? 1 : 1.6;
    ctx.setLineDash(diss ? [2, 10] : [6, 8]);
    ctx.lineDashOffset = -t * 26;
    ctx.beginPath();
    ctx.moveTo(0, -this.h * 0.62);
    ctx.quadraticCurveTo(dx * 0.4, dy * 0.5 - 40, dx, dy);
    ctx.stroke();
    ctx.setLineDash([]);
    // 柔光（呼吸）
    const gg = ctx.createRadialGradient(dx, dy, 4, dx, dy, 62 * breathe);
    gg.addColorStop(0, `${accent}55`);
    gg.addColorStop(0.55, `${accent}20`);
    gg.addColorStop(1, `${accent}00`);
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(dx, dy, 62 * breathe, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 幽灵半身：不画实心人形，只画一层半透明剪影，避免和 AI 立绘画风打架
    ctx.save();
    ctx.globalAlpha = a * (diss ? 0.45 : 0.72);
    ctx.translate(dx + Math.sin(t * 1.7) * 3, dy);
    ctx.fillStyle = 'rgba(215, 255, 242, 0.42)';
    ctx.beginPath();
    ctx.moveTo(-7, -6);
    ctx.quadraticCurveTo(-22, 16, -16, 34 + Math.sin(t * 3.1) * 3);
    ctx.quadraticCurveTo(-6, 28, 0, 36 + Math.sin(t * 3.1 + 1.7) * 3);
    ctx.quadraticCurveTo(6, 28, 16, 34 + Math.sin(t * 3.1 + 3.4) * 3);
    ctx.quadraticCurveTo(22, 16, 7, -6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(230, 255, 248, 0.5)';
    ctx.beginPath();
    ctx.arc(0, -20, 14, 0, TAU);
    ctx.fill();
    // 眼睛：两个小暗点，让半灵有「脸」而不是一团雾
    ctx.fillStyle = 'rgba(40, 70, 70, 0.55)';
    ctx.beginPath(); ctx.arc(-5, -21, 1.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -21, 1.9, 0, TAU); ctx.fill();
    // 幽灵太刀
    ctx.strokeStyle = `rgba(200, 255, 238, ${diss ? 0.2 : 0.6})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(30, -26); ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(11, 8); ctx.lineTo(31, -28); ctx.stroke();
    ctx.restore();

    // 断灵槽：绕半灵一圈的弧；满了 → 消散中闪烁（玩家一眼看出「打对了」）
    const g = clamp(ph.gauge / ph.gaugeMax, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, a);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8, 24, 22, 0.5)';
    ctx.beginPath();
    ctx.arc(dx, dy, 34, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    if (diss || g > 0.001) {
      const fill = diss ? 1 : g;
      ctx.strokeStyle = diss
        ? `rgba(200, 255, 238, ${0.35 + Math.sin(t * 22) * 0.25})`
        : (g >= 0.999 ? '#ffffff' : accent);
      ctx.beginPath();
      ctx.arc(dx, dy, 34, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(fill, 0, 1));
      ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx, t) {
    if (this.alpha <= 0.01) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    // 背后光晕
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -this.h * 0.55, 10, 0, -this.h * 0.55, 150);
    g.addColorStop(0, `${this.def.accent}44`);
    g.addColorStop(1, `${this.def.accent}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -this.h * 0.55, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 四重存在：三个分身画在本体之下（本体压前面，主次分明）
    this._drawClones(ctx, t);

    // 落地破势球画在立绘之前（它们在脚下，Boss 身体应该压在上面）
    this._drawOrbs(ctx);
    // STG 关的符卡核心 / 压制提示
    this._drawStgKit(ctx);
    // 半灵（妖梦专属体系）：画在立绘之前，被本体压住的地方就压住
    this._drawPhantom(ctx, t);

    const bossArtOpts = {
      boss: this.key,
      state: this.state === 'defeat' ? 'defeat' : this.state === 'intro' ? 'intro' : 'idle',
      t,
      facing: -1,
      flash: this.hitFlash > 0 ? Math.min(1, this.hitFlash * 6) : 0,
      alpha: this.alpha,
      scale: 1,
      // 开火瞬间向前顶一下：让「发弹」这个动作在立绘上看得见，而不是站桩放弹幕
      cast: this.fireT < 0.22 ? 1 - this.fireT / 0.22 : 0,
    };
    if (!drawGenBoss(ctx, bossArtOpts)) drawBossPlaceholder(ctx, bossArtOpts, this.def.accent);

    // 破势槽 / 眩晕星画在立绘之后，保证永远可见
    this._drawMeleeUI(ctx);

    ctx.restore();
  }
}

/**
 * 小头目血量（docs/ENEMY_VARIETY_SPEC.md §6-D1）：现在取「平均承伤符卡血量」的 2/15。
 *
 * 2026-10-27 第六轮用户口述「小头目血量减少 1/2」→ 半卡再减半（×0.25）；
 * 第八轮「小头目削去 1/3」→ 再乘 2/3；第九轮「小头目砍 1/5」→ 再乘 4/5，即：
 *   血量 = 所有承伤符卡运行期血量的平均值 × MINIBOSS_CARD_SHARE（2/15）
 *
 * 逐卡口径（显式 t.hp > 0 优先 / 否则 limit × dps × CARD_HP_ANCHOR / 跳过 survival /
 * × finalHpMulFor(key) 四舍五入）由 bossTuning.js 的 cardAvgRuntimeHp 统一提供，
 * 道中杂兵（enemies.js）也吃同一个平均值，因此小头目与杂兵永远跟着 Boss 一起缩放。
 *
 * @param {string} key BOSS_DEFS 的键（'rumia' | 'wriggle' | 'cirno' | 'yuyuko' | 'kaguya' …）
 * @returns {number} 血量（整数，至少 1）
 */
export function bossHalfCardHp(key) {
  const avg = cardAvgRuntimeHp(key);
  if (!(avg > 0)) return 1;
  return Math.max(1, Math.round(avg * MINIBOSS_CARD_SHARE));
}

/**
 * AI 立绘未就绪时的占位：只画一团缓慢脉动的柔光。
 * 刻意不画人物轮廓——任何剪影都会被看成「色块小人」，与 AI 立绘的画风断层更刺眼。
 * 正常流程下根本看不到这里（Boss 出场前会等立绘就绪，见 update 的 intro 分支）。
 */
function drawBossPlaceholder(ctx, o, accent = '#ffffff') {
  const t = o.t || 0;
  const alpha = (o.alpha == null ? 1 : o.alpha) * 0.92;
  const pulse = 0.9 + Math.sin(t * 2.2) * 0.1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';

  const cy = -130;
  const glow = ctx.createRadialGradient(0, cy, 6, 0, cy, 160);
  glow.addColorStop(0, `${accent}4d`);
  glow.addColorStop(0.5, `${accent}1f`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(0, cy, 86 * pulse, 148 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
