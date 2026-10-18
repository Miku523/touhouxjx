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

import { drawBoss, BOSS_INFO } from '../art/bosses.js';
import { drawGenBoss } from '../art/genboss.js';
import { getDifficulty, bossPhasesFor, scaleBossHp } from './difficulty.js';
import { scalePlayerDamage, scaleEnemyHp } from './balance.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

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
   ============================================================ */

function firePattern(p, boss, api, fireT) {
  const b = api.bullets;
  // 同屏弹数预算：满了就整招停火，等旧弹飞走（最硬的「有缝」护栏）
  if (!b || b.activeCount >= boss.bulletBudget) return;

  const px = api.px;
  const py = api.py;
  const pat = boss._pat;
  const wild = boss.wild;
  const color = p.color || boss.accent;
  const r = p.r || 6;
  const life = p.life || 7;
  const type = p.type !== undefined ? p.type : 0;

  // 速度：招式变体倍率 + 每发小抖动，再夹到难度给出的单发速度上限
  const varySpeed = (base, k = 1) =>
    Math.min(boss.speedCap, Math.max(20, (base || 120) * pat.speedScale * k * boss.rnd(0.9, 1.08)));
  // 瞄准抖动：wild 越高越飘，但上限 0.2 rad（约 11°），不会变成无解散射
  const aimJitter = clamp(0.04 + wild * 0.09, 0.04, 0.2);
  const aim = () => Math.atan2(py - boss.y, px - boss.x) + boss.rnd(-aimJitter, aimJitter);
  // 弹数：招式变体 + 每发抖动 + 屏幕密度自适应（越满越薄）
  const count = (base, lo = 1, hi = 64) =>
    clamp(Math.round((base || 1) * pat.nScale * boss.pressure * boss.rnd(0.94, 1.06)), lo, hi);
  // 环状弹幕的缝隙保障：同样半径下相邻两发的弧长不小于 ringGapPx，
  // 否则一圈会缩成没有缝的墙（人形判定半径 7，两发半径 6 需要约 26px 间距）
  const ringN = (base, lo = 1, hi = 64) => {
    const n = count(base, lo, hi);
    return clamp(n, lo, Math.min(hi, boss.ringLimit));
  };

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

  if (p.typeName === 'cross') {
    const dirs = clamp(Math.round(p.dirs || 4), 2, 10);
    const n = count(p.n || 3, 1, 12);
    const spread = (p.spread || 0.5) * pat.spreadScale * boss.rnd(0.85, 1.2);
    const base = pat.angle + (p.aimed ? Math.atan2(py - boss.y, px - boss.x) : 0);
    for (let d = 0; d < dirs; d++) {
      const a = base + (d / dirs) * TAU + boss.rnd(-0.28, 0.28);
      b.fan(boss.x, boss.y, n, spread, a, varySpeed(p.speed, boss.rnd(0.94, 1.08)), {
        color, r, type, life,
      });
    }
  }
}

/* ============================================================
   七位 Boss 的弹幕数据
   weight 越大越容易被随机抽到（默认 1）
   ============================================================ */

export const BOSS_DEFS = {
  /* 符卡数量：1面2 / 2面3 / 3面4 / 4面5 / 5面6 / 6面8 / EX10。
     每张符卡独立血条（phases[i].hp），弹幕参数随符卡序号递增，难度有序。 */

  rumia: {
    name: '露米娅', title: '宵暗的妖怪', hp: 1920, accent: '#c9a6ff',
    phases: [
      {
        name: '宵暗「月之暗面」', hp: 880, patterns: [
          { typeName: 'ring', n: 14, speed: 100, color: '#b48cff', rate: 1.4, r: 7, spinAngle: 0.55 },
          { typeName: 'homing', n: 2, speed: 110, color: '#ff5ea8', rate: 1.1, r: 8, homing: 1.3 },
          { typeName: 'scatter', n: 6, speed: 120, color: '#b48cff', rate: 1.1, r: 6, aimed: true, arc: 1.2, weight: 0.75 },
        ],
      },
      {
        name: '暗符「黑暗吞噬」', hp: 1040, patterns: [
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
    name: '莉格露', title: '暗中蠢动的光虫', hp: 2880, accent: '#8ef07a',
    phases: [
      {
        name: '灯符「萤火虫现象」', hp: 800, patterns: [
          { typeName: 'fan', n: 7, spread: 1.4, speed: 95, color: '#a8ff8f', rate: 1.3, r: 5, wobble: 60 },
          { typeName: 'spiral', arms: 2, speed: 90, color: '#d6ff7a', rate: 0.18, spin: 2.2, r: 4 },
          { typeName: 'scatter', n: 5, speed: 105, color: '#a8ff8f', rate: 1.35, r: 4, aimed: true, arc: 1.6, weight: 0.75 },
        ],
      },
      {
        // 全难度大削（用户反馈：E/N/H/L 都上来就撞墙）。
        // 旧版主招是 6 臂螺旋 rate 0.07：单这一招峰值就有 69(E)/84(N)/92(H)/107(L) 发/秒，
        // 还叠 215 速的 5 连自机狙。现改为 3 臂低速螺旋 rate 0.18（峰值约 13/16/18/21 发/秒），
        // 全卡弹速压到 ≤150，另外两招各约 5.6 / 2.1 发/秒。
        name: '蠢符「小虫风暴」', hp: 960, patterns: [
          { typeName: 'fan', n: 7, spread: 1.2, speed: 100, color: '#a8ff8f', rate: 1.25, r: 5, wobble: 45 },
          { typeName: 'spiral', arms: 3, speed: 92, color: '#d6ff7a', rate: 0.18, spin: 1.8, r: 4 },
          { typeName: 'aimed', n: 3, spread: 0.7, speed: 150, color: '#ffffff', rate: 1.4, r: 5, weight: 0.75 },
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
    name: '琪露诺', title: '冰之妖精', hp: 4120, accent: '#7fd8ff',
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
        name: '冻符「完美冻结」', hp: 1080, patterns: [
          { typeName: 'ring', n: 26, speed: 62, color: '#a8e8ff', rate: 1.4, r: 9, type: 2, spinAngle: 0.2, rings: 2 },
          { typeName: 'ring', n: 14, speed: 150, color: '#d6f6ff', rate: 0.9, r: 5, spinAngle: 0.8 },
          { typeName: 'aimed', n: 3, spread: 0.3, speed: 285, color: '#ffffff', rate: 1.0, r: 5 },
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
    name: '射命丸文', title: '最速的记者', hp: 5720, accent: '#ff6b6b',
    phases: [
      {
        name: '风符「风神一扇」', hp: 880, patterns: [
          { typeName: 'fan', n: 9, spread: 1.2, speed: 200, color: '#ff9a9a', rate: 0.55, r: 5 },
          { typeName: 'laser', n: 4, speed: 460, color: '#ffd0d0', rate: 0.5, angle: 0 },
          { typeName: 'scatter', n: 8, speed: 190, color: '#ff6b6b', rate: 0.9, r: 5, aimed: true, arc: 1.0, weight: 0.8 },
        ],
      },
      {
        name: '疾风「风神少女」', hp: 1000, patterns: [
          { typeName: 'laser', n: 5, speed: 520, color: '#ffffff', rate: 0.35, angle: 0 },
          { typeName: 'fan', n: 11, spread: 1.1, speed: 250, color: '#ff6b6b', rate: 0.5, r: 4 },
          { typeName: 'aimed', n: 4, spread: 0.35, speed: 330, color: '#ffd0d0', rate: 0.7, r: 5, weight: 0.8 },
        ],
      },
      {
        name: '岐符「天之八衢」', hp: 1120, patterns: [
          { typeName: 'cross', n: 3, dirs: 4, spread: 0.4, speed: 230, color: '#ff9a9a', rate: 0.7, r: 4 },
          { typeName: 'cross', n: 2, dirs: 8, spread: 0.3, speed: 210, color: '#ffd0d0', rate: 0.8, r: 4, weight: 0.85 },
          { typeName: 'aimed', n: 5, spread: 0.45, speed: 300, color: '#ffffff', rate: 0.75, r: 4, weight: 0.8 },
        ],
      },
      {
        name: '风神「天狗颪」', hp: 1280, patterns: [
          { typeName: 'aimed', n: 6, spread: 0.5, speed: 340, color: '#ff6b6b', rate: 0.6, r: 5 },
          { typeName: 'fan', n: 9, spread: 0.8, speed: 260, color: '#ff9a9a', rate: 0.5, r: 4, aimed: true, weight: 0.85 },
          { typeName: 'rain', n: 4, speed: 280, color: '#ffd0d0', rate: 0.55, r: 5, spreadX: 500, weight: 0.8 },
          { typeName: 'laser', n: 6, speed: 540, color: '#ffffff', rate: 0.9, angle: 0, weight: 0.7 },
        ],
      },
      {
        name: '「幻想风靡」', hp: 1440, patterns: [
          { typeName: 'laser', n: 4, speed: 560, color: '#ffffff', rate: 0.3, angle: 0 },
          { typeName: 'fan', n: 13, spread: 1.2, speed: 265, color: '#ff6b6b', rate: 0.45, r: 4 },
          { typeName: 'cross', n: 3, dirs: 6, spread: 0.35, speed: 250, color: '#ff9a9a', rate: 0.6, r: 4, weight: 0.85 },
          { typeName: 'spiral', arms: 5, speed: 200, color: '#ffd0d0', rate: 0.08, spin: 3.2, r: 4, weight: 0.8 },
          { typeName: 'sweep', n: 2, speed: 560, color: '#ffffff', rate: 0.34, speedTurn: 2.4, weight: 0.9 },
        ],
      },
    ],
  },

  yuyuko: {
    name: '西行寺幽幽子', title: '幽冥楼阁的亡灵少女', hp: 9650, accent: '#ffa8d8',
    phases: [
      {
        name: '幽雅「死出诱蛾灯」', hp: 1200, patterns: [
          { typeName: 'ring', n: 14, speed: 105, color: '#ffa8d8', rate: 1.1, r: 10, type: 3, wobble: 45 },
          { typeName: 'fan', n: 7, spread: 1.2, speed: 150, color: '#e0b0ff', rate: 0.8, r: 7, type: 3, wobble: 55 },
          { typeName: 'spray', n: 2, speed: 120, color: '#ffa8d8', rate: 0.12, r: 6, type: 3, arc: 1.3, weight: 0.7 },
        ],
      },
      {
        name: '蝶符「花之舞」', hp: 1350, patterns: [
          { typeName: 'fan', n: 9, spread: 1.4, speed: 155, color: '#ffa8d8', rate: 0.7, r: 6, type: 3, wobble: 70 },
          { typeName: 'spiral', arms: 4, speed: 135, color: '#d0a0ff', rate: 0.1, spin: 2.6, r: 5, type: 3 },
          { typeName: 'scatter', n: 8, speed: 140, color: '#e0b0ff', rate: 1.0, r: 6, type: 3, aimed: true, arc: 1.4, weight: 0.8 },
        ],
      },
      {
        name: '蝶符「死蝶之华尔兹」', hp: 1500, patterns: [
          { typeName: 'spiral', arms: 6, speed: 150, color: '#ffa8d8', rate: 0.08, spin: -3.0, r: 5, type: 3 },
          { typeName: 'ring', n: 22, speed: 130, color: '#e0b0ff', rate: 1.0, r: 7, type: 3, spinAngle: 0.4 },
          { typeName: 'homing', n: 3, speed: 110, color: '#ff8fd0', rate: 1.2, r: 7, type: 3, homing: 1.6, weight: 0.8 },
        ],
      },
      {
        name: '亡乡「亡我乡 -宿罪-」', hp: 1650, patterns: [
          { typeName: 'ring', n: 24, speed: 120, color: '#ffa8d8', rate: 1.0, r: 8, type: 3, spinAngle: 0.35 },
          { typeName: 'ring', n: 10, speed: 70, color: '#d0a0ff', rate: 1.5, r: 12, type: 2, rings: 2, weight: 0.85 },
          { typeName: 'scatter', n: 10, speed: 150, color: '#e0b0ff', rate: 1.05, r: 7, type: 3, aimed: true, arc: 1.5, weight: 0.8 },
        ],
      },
      {
        name: '冥符「常夜樱」', hp: 1850, patterns: [
          { typeName: 'homing', n: 4, speed: 95, color: '#ff8fd0', rate: 0.95, r: 9, type: 2, homing: 1.8 },
          { typeName: 'spiral', arms: 5, speed: 140, color: '#d0a0ff', rate: 0.09, spin: -2.4, r: 6, type: 3 },
          { typeName: 'fan', n: 11, spread: 1.3, speed: 160, color: '#ffa8d8', rate: 0.7, r: 6, type: 3, wobble: 60, weight: 0.85 },
          { typeName: 'cross', n: 3, dirs: 5, spread: 0.4, speed: 150, color: '#e0b0ff', rate: 0.85, r: 6, type: 3, weight: 0.8 },
        ],
      },
      {
        name: '反魂蝶「八分咲」', hp: 2100, patterns: [
          { typeName: 'ring', n: 30, speed: 130, color: '#ffa8d8', rate: 1.1, r: 8, type: 3, spinAngle: 0.5 },
          { typeName: 'homing', n: 5, speed: 110, color: '#ff8fd0', rate: 1.2, r: 8, type: 3, homing: 2.0, weight: 0.9 },
          { typeName: 'spray', n: 3, speed: 160, color: '#e0b0ff', rate: 0.1, r: 6, type: 3, arc: 1.2, aimed: true, weight: 0.85 },
          { typeName: 'laser', n: 5, speed: 480, color: '#ffe0f0', rate: 0.9, angle: 0, weight: 0.9 },
          { typeName: 'bloom', n: 10, rings: 3, twist: 0.22, speed: 150, color: '#ffa8d8', rate: 1.9, r: 7, type: 3, typeAlt: 2, weight: 0.92 },
        ],
      },
    ],
  },

  kaguya: {
    name: '蓬莱山辉夜', title: '永远与须臾的罪人', hp: 16520, accent: '#ffe9b0',
    phases: [
      {
        name: '难题「龙颈之玉 -五色的弹丸-」', hp: 1460, patterns: [
          { typeName: 'ring', n: 20, speed: 120, color: '#ffe9b0', rate: 1.0, r: 8, type: 3 },
          { typeName: 'fan', n: 9, spread: 1.0, speed: 170, color: '#fff8d0', rate: 0.7, r: 6, aimed: true },
          { typeName: 'scatter', n: 9, speed: 165, color: '#fff8d0', rate: 1.0, r: 6, aimed: true, arc: 1.0, weight: 0.8 },
        ],
      },
      {
        name: '神宝「耀眼的龙玉」', hp: 1620, patterns: [
          { typeName: 'laser', n: 5, speed: 500, color: '#fff8d0', rate: 0.8, angle: 0 },
          { typeName: 'ring', n: 26, speed: 125, color: '#ffe9b0', rate: 1.1, r: 6, type: 2, rings: 2, weight: 0.9 },
          { typeName: 'aimed', n: 5, spread: 0.4, speed: 300, color: '#ffffff', rate: 0.8, r: 5, weight: 0.8 },
        ],
      },
      {
        name: '难题「佛御石之钵 -不碎的意志-」', hp: 1790, patterns: [
          { typeName: 'ring', n: 18, speed: 90, color: '#fff8d0', rate: 1.3, r: 12, type: 2 },
          { typeName: 'ring', n: 30, speed: 130, color: '#ffe9b0', rate: 1.15, r: 7, type: 3, spinAngle: 0.4, weight: 0.9 },
          { typeName: 'cross', n: 3, dirs: 6, spread: 0.35, speed: 200, color: '#ffffff', rate: 0.8, r: 5, weight: 0.8 },
        ],
      },
      {
        name: '神宝「佛体的金刚石」', hp: 1960, patterns: [
          { typeName: 'cross', n: 3, dirs: 8, spread: 0.3, speed: 230, color: '#fff8d0', rate: 0.7, r: 5 },
          { typeName: 'laser', n: 8, speed: 520, color: '#ffffff', rate: 0.7, angle: 0, weight: 0.9 },
          { typeName: 'aimed', n: 6, spread: 0.42, speed: 320, color: '#ffe9b0', rate: 0.7, r: 4, weight: 0.85 },
        ],
      },
      {
        name: '难题「火鼠的皮衣 -不焦躁的内心-」', hp: 2130, patterns: [
          { typeName: 'spiral', arms: 5, speed: 150, color: '#ffe9b0', rate: 0.08, spin: 3.0, r: 6 },
          { typeName: 'rain', n: 5, speed: 260, color: '#ffd890', rate: 0.5, r: 6, spreadX: 800, weight: 0.9 },
          { typeName: 'scatter', n: 10, speed: 180, color: '#fff8d0', rate: 0.95, r: 6, type: 2, aimed: true, arc: 1.2, weight: 0.8 },
        ],
      },
      {
        name: '神宝「火蜥蜴之盾」', hp: 2300, patterns: [
          { typeName: 'ring', n: 24, speed: 130, color: '#ffe9b0', rate: 1.05, r: 8, rings: 2, spinAngle: 0.3 },
          { typeName: 'fan', n: 13, spread: 1.3, speed: 190, color: '#ffd890', rate: 0.6, r: 5, weight: 0.9 },
          { typeName: 'homing', n: 4, speed: 140, color: '#fff8d0', rate: 1.0, r: 7, homing: 1.6, weight: 0.8 },
        ],
      },
      {
        name: '难题「燕的子安贝 -永命线-」', hp: 2460, patterns: [
          { typeName: 'laser', n: 6, speed: 560, color: '#ffffff', rate: 0.6, angle: 0 },
          { typeName: 'spiral', arms: 6, speed: 180, color: '#ffe9b0', rate: 0.07, spin: -3.4, r: 5, type: 3, weight: 0.9 },
          { typeName: 'aimed', n: 6, spread: 0.3, speed: 340, color: '#fff8d0', rate: 0.65, r: 4, weight: 0.85 },
        ],
      },
      {
        name: '神宝「蓬莱的玉枝 -梦色之乡-」', hp: 2800, patterns: [
          { typeName: 'ring', n: 32, speed: 135, color: '#ffe9b0', rate: 1.05, r: 7, rings: 2, spinAngle: 0.45 },
          { typeName: 'spiral', arms: 7, speed: 190, color: '#fff8d0', rate: 0.06, spin: 3.6, r: 5, type: 3, weight: 0.9 },
          { typeName: 'laser', n: 10, speed: 580, color: '#ffffff', rate: 0.8, angle: 0, weight: 0.85 },
          { typeName: 'homing', n: 5, speed: 150, color: '#ffd890', rate: 1.0, r: 8, type: 3, homing: 1.8, weight: 0.8 },
          { typeName: 'cross', n: 4, dirs: 6, spread: 0.4, speed: 210, color: '#ffe9b0', rate: 0.7, r: 5, weight: 0.75 },
          { typeName: 'sweep', n: 1, speed: 500, color: '#fff8d0', rate: 0.5, speedTurn: 1.7, weight: 0.88 },
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
          { typeName: 'scatter', n: 10, speed: 170, color: '#ff4d6a', rate: 0.95, r: 6, aimed: true, arc: 1.2, weight: 0.8 },
        ],
      },
      {
        name: '禁忌「雷瓦汀」', hp: 1980, patterns: [
          { typeName: 'laser', n: 3, speed: 520, color: '#ffd0d8', rate: 0.9, angle: 0 },
          { typeName: 'laser', n: 3, speed: 520, color: '#ff4d6a', rate: 0.9, angle: Math.PI / 2 },
          { typeName: 'ring', n: 18, speed: 140, color: '#ff8fa8', rate: 1.0, r: 7, spinAngle: 0.45, weight: 0.85 },
          { typeName: 'fan', n: 11, spread: 1.1, speed: 200, color: '#ff8fa8', rate: 0.6, r: 5, weight: 0.8 },
        ],
      },
      {
        name: '禁忌「四重存在」', hp: 2180, patterns: [
          { typeName: 'cross', n: 3, dirs: 4, spread: 0.35, speed: 200, color: '#ff4d6a', rate: 0.7, r: 5 },
          { typeName: 'ring', n: 16, speed: 150, color: '#ff8fa8', rate: 1.0, r: 6, rings: 4, spinAngle: 0.5, weight: 0.85 },
          { typeName: 'aimed', n: 6, spread: 0.5, speed: 330, color: '#ffffff', rate: 0.75, r: 4, weight: 0.8 },
        ],
      },
      {
        name: '秘弹「然后就一个人都不剩了？」', hp: 2370, patterns: [
          { typeName: 'spiral', arms: 4, speed: 170, color: '#ff4d6a', rate: 0.08, spin: 3.4, r: 6, type: 3 },
          { typeName: 'ring', n: 24, speed: 150, color: '#ff8fa8', rate: 0.95, r: 6, rings: 2, weight: 0.85 },
          { typeName: 'scatter', n: 12, speed: 190, color: '#ff4d6a', rate: 0.9, r: 6, type: 2, aimed: true, arc: 1.4, weight: 0.8 },
        ],
      },
      {
        name: '禁弹「星弧破碎」', hp: 2560, patterns: [
          { typeName: 'spiral', arms: 8, speed: 185, color: '#ff4d6a', rate: 0.055, spin: 3.6, r: 6, type: 3 },
          { typeName: 'homing', n: 4, speed: 140, color: '#ff8fa8', rate: 1.0, r: 7, homing: 1.8, weight: 0.85 },
          { typeName: 'ring', n: 20, speed: 160, color: '#ffd0d8', rate: 0.9, r: 6, rings: 2, spinAngle: -0.3, weight: 0.85 },
        ],
      },
      {
        name: '禁弹「折反射」', hp: 2750, patterns: [
          { typeName: 'cross', n: 4, dirs: 8, spread: 0.3, speed: 210, color: '#ff8fa8', rate: 0.6, r: 5 },
          { typeName: 'laser', n: 6, speed: 560, color: '#ffffff', rate: 0.7, angle: 0, weight: 0.85 },
          { typeName: 'fan', n: 13, spread: 1.4, speed: 210, color: '#ff4d6a', rate: 0.5, r: 4, weight: 0.8 },
        ],
      },
      {
        name: 'QED「495年的波纹」', hp: 2940, patterns: [
          { typeName: 'ring', n: 36, speed: 140, color: '#ff4d6a', rate: 1.0, r: 7, rings: 2, spinAngle: -0.4 },
          { typeName: 'ring', n: 18, speed: 80, color: '#ff8fa8', rate: 1.2, r: 11, type: 2, rings: 3, weight: 0.9 },
          { typeName: 'cross', n: 4, dirs: 6, spread: 0.4, speed: 200, color: '#ffd0d8', rate: 0.75, r: 5, weight: 0.85 },
        ],
      },
      {
        name: '禁忌「吸血鬼之宴」', hp: 3200, patterns: [
          { typeName: 'spiral', arms: 6, speed: 200, color: '#ff4d6a', rate: 0.06, spin: 3.2, r: 5, type: 3 },
          { typeName: 'rain', n: 6, speed: 300, color: '#ff8fa8', rate: 0.45, r: 6, spreadX: 900, weight: 0.85 },
          { typeName: 'homing', n: 5, speed: 160, color: '#ffd0d8', rate: 0.95, r: 7, weight: 0.85 },
          { typeName: 'fan', n: 15, spread: 1.5, speed: 220, color: '#ff4d6a', rate: 0.45, r: 4, weight: 0.8 },
        ],
      },
      {
        name: '禁忌「破坏之瞳」', hp: 3460, patterns: [
          { typeName: 'laser', n: 12, speed: 600, color: '#ffffff', rate: 0.7, angle: 0 },
          { typeName: 'ring', n: 30, speed: 150, color: '#ff4d6a', rate: 0.9, r: 6, rings: 2, spinAngle: 0.5, weight: 0.9 },
          { typeName: 'aimed', n: 8, spread: 0.35, speed: 360, color: '#ff8fa8', rate: 0.6, r: 4, weight: 0.85 },
          { typeName: 'scatter', n: 14, speed: 200, color: '#ffd0d8', rate: 0.85, r: 6, type: 2, aimed: true, arc: 1.6, weight: 0.8 },
        ],
      },
      {
        name: '最终「永不结束的祭典」', hp: 3850, patterns: [
          { typeName: 'ring', n: 40, speed: 150, color: '#ff4d6a', rate: 0.95, r: 7, rings: 2, spinAngle: 0.6 },
          { typeName: 'spiral', arms: 8, speed: 210, color: '#ff8fa8', rate: 0.05, spin: 4.0, r: 5, type: 3, weight: 0.95 },
          { typeName: 'laser', n: 10, speed: 620, color: '#ffffff', rate: 0.6, angle: 0, weight: 0.9 },
          { typeName: 'homing', n: 6, speed: 170, color: '#ffd0d8', rate: 0.9, r: 8, weight: 0.85 },
          { typeName: 'cross', n: 4, dirs: 8, spread: 0.4, speed: 230, color: '#ff8fa8', rate: 0.6, r: 5, weight: 0.8 },
          { typeName: 'vortex', arms: 6, speed: 190, color: '#ff6b8a', rate: 0.42, r: 5, type: 3, turn: 1.0, weight: 0.92 },
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
   * @param {{seed?:number, difficulty?:string, stageNumber?:number}} [opts]
   *   可选：固定随机种子（测试 / 复现用）；难度与 1 起关卡号（用于裁剪难符卡 / 倍率）
   */
  constructor(key, x, y, opts = {}) {
    const def = BOSS_DEFS[key] || BOSS_DEFS.rumia;
    this.key = key;
    this.def = def;
    this.info = BOSS_INFO[key] || { name: def.name, title: def.title, accent: def.accent };

    // 难度：E/N/H/L 决定符卡裁剪、血量和弹幕倍率
    this.difficulty = getDifficulty(opts.difficulty).key;
    this.diff = getDifficulty(this.difficulty);
    this.stageNumber = Number(opts.stageNumber) || 0;
    const trimmed = bossPhasesFor(def.phases, this.difficulty, this.stageNumber);
    this.phases = scaleBossHp(trimmed, this.difficulty, def.hp);

    this.maxHp = Math.max(1, Math.round(scaleEnemyHp(def.hp * this.diff.hpScale)));
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
    this.ringGapPx = Math.max(26, Number(this.diff.ringGapPx) || 30);
    this.ringLimit = clamp(Math.floor((TAU * 240) / this.ringGapPx), 6, 56);
    // 屏幕密度自适应：1 = 全量开火，越低新招弹数越薄
    this.pressure = 1;

    this.t = 0;
    this.state = 'intro'; // intro | battle | defeat | dead
    this.introT = 0;
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

    // 开场也是随机一招，背板第一招不再固定
    this._startPattern(this.rndInt(0, this.phases[0].patterns.length - 1));
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

  get phaseCount() {
    return this.phases.length;
  }

  /** 当前这张符卡的剩余比例（HUD 血条读它） */
  get hpRatio() {
    if (this.spellMaxHp <= 0) return 0;
    return Math.max(0, this.spellHp / this.spellMaxHp);
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
      nScale: this.rnd(0.78, 1.26) * (1 + (this.wild - 0.6) * 0.15) * this.diff.bulletCountScale,
      speedScale: this.rnd(0.86, 1.14) * this.diff.bulletSpeedScale,
      spreadScale: this.rnd(0.78, 1.26),
      rateScale: this.rnd(0.85, 1.18) * this.diff.fireIntervalScale,
      wobbleScale: this.rnd(0.7, 1.35),
      armScale: this.rnd(0.8, 1.25),
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
      mv.t += dt;
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
    if (!bullets || bullets.activeCount >= this.bulletBudget * 0.8) return;
    const pc = this._playerCenter(player);
    const px = pc.x;
    const py = pc.y;
    const aim = Math.atan2(py - this.y, px - this.x);
    const color = this.chance(0.5) ? this.def.accent : '#ffffff';
    const kind = this.rndInt(0, 2);
    // 弹数与弹速：难度倍率 × 密度自适应，速度同样夹到上限
    const cnt = this.diff.bulletCountScale * this.pressure;
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
    this.spellBroken = false;
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
    this.spellName = next.name;
    this.phaseName = next.name;
    this.spellMaxHp = next.hp || 100;
    this.spellHp = this.spellMaxHp;
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

    // 符卡宣言的无敌时间：清屏后的短暂停顿
    if (this.spellLock > 0) {
      this.spellLock = Math.max(0, this.spellLock - dt);
      return;
    }

    // 随机幅度：符卡越靠后、本张血越少，弹幕越乱
    this.wild = clamp(0.55 + this.spellIdx * 0.12 + (1 - this.hpRatio) * 0.3, 0.55, 1.4);

    // 密度自适应：屏幕占用超过预算 60% 之后，新开的一招按比例收窄弹数（最低 0.45×）。
    // 这一层让「大量增加弹幕」的 L 也不会摊成没缝的墙——越满弹幕越薄，缝隙自动回流。
    const loadRatio = (bullets?.activeCount || 0) / this.bulletBudget;
    this.pressure = loadRatio <= 0.6 ? 1 : clamp(1 - (loadRatio - 0.6) * 1.4, 0.45, 1);

    // 随机移动（替代原来的正弦漂浮）
    this._updateMovement(dt, fx);

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
      this._nextRate = this._rollRate(pat);
    }

    // 计划外变招（叠在主弹幕上）
    this._updateWild(dt, player, bullets, fx);

    // 每招持续随机时长后换招
    if (this.patternT > this.patternDur) {
      this._chooseNextPattern();
    }

    // 接触伤害
    if (this.hurtCd <= 0 && this._overlapPlayer(player)) {
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
    const hw = this.w * 0.46;
    const hh = this.h * 0.78;
    shots.hitRect(this.x - hw, this.y - hh, hw * 2, hh, (dmg, hx, hy) => {
      this.damage(dmg);
      fx?.sparkle(hx, hy, this.inmDefColor());
      onHit?.(dmg);
    });
  }

  inmDefColor() {
    return this.def.accent || '#ffffff';
  }

  /** 冲刺撞击 */
  hitByDash(player, fx) {
    if (this.state !== 'battle' || this.hurtCd > 0) return false;
    const hw = this.w * 0.42;
    const hh = this.h * 0.72;
    const p = player;
    if (this.x - hw < p.x + p.w && this.x + hw > p.x && this.y - hh < p.y + p.h && this.y > p.y) {
      this.damage(scalePlayerDamage(28));
      this.hurtCd = 0.35;
      fx?.shockwave(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 14, 480, 0.3);
      return true;
    }
    return false;
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
    if (!drawGenBoss(ctx, bossArtOpts)) drawBoss(ctx, bossArtOpts);

    ctx.restore();
  }
}
