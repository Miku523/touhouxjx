/**
 * bossBullets.js —— 自定义弹幕机制注册表（创造模式）。
 *
 * 结构：CUSTOM_PATTERNS[typeName] = (p, boss, ctx, fireT) => void
 *   - 由 boss.js 的 firePattern() 顶部挂注册表（Lead 已接线）；
 *   - ctx = { bullets, b, px, py, color, r, life, type, pat, wild, fireT, helpers }；
 *     helpers = { TAU, clamp, rnd(a,b), rndInt(a,b), aim(), varySpeed(base,k), count(base,lo,hi), ringN(base,lo,hi) }
 *   - p 是该卡的 pattern 参数表（含本文件约定的小写扩展字段，如 arms / cycle / rays）；
 *   - 未注册的 typeName 由 boss.js 回退到内置 switch（本文件为纯增量）。
 *
 * 设计原则（自查用）：
 *   1. 每个 typeName 只服务一张符卡，服从卡名与卡面叙事，不做「换色复用」；
 *   2. 全部走 926/1180 的弹数预算护栏：入场先检查 activeCount，满则整拍跳过；
 *   3. 环形 / 围栏类只用 helpers.ringN 或按 30px 弧长手算，绝不做无解弹墙；
 *   4. 不持有跨帧状态（除 boss 已有字段），只靠 fireT / boss.volleys 做节奏；
 *   5. 颜色一律硬编码卡面主色（逐卡配色），不读玩家状态。
 *
 * 弹型编号：0 六棱宝石 / 1 细长冰棱 / 2 六瓣冰花 / 3 六角雪花 / 4 冰晶光束
 */

const TAU = Math.PI * 2;
const B_CIRCLE = 0;
const B_RICE = 1;
const B_BIG = 2;
const B_STAR = 3;

/** 统一取环境：把 Lead 给的 ctx 归一化，缺字段也能安全跑 */
function env(ctx, boss) {
  const b = ctx.bullets || ctx.bulletsPool || ctx.b;
  if (!b || typeof b.spawn !== 'function') return null;
  const H = ctx.helpers || {};
  const clamp = H.clamp || ((v, a, c) => (v < a ? a : v > c ? c : v));
  return {
    b,
    boss,
    TAU: H.TAU || TAU,
    clamp,
    rnd: H.rnd || ((a = 0, c = 1) => boss.rnd(a, c)),
    rndInt: H.rndInt || ((a, c) => boss.rndInt(a, c)),
    ringN: H.ringN || ((base, lo = 1, hi = 64) => clamp(Math.round(base || 1), lo, hi)),
    count: H.count || ((base, lo = 1, hi = 64) => clamp(Math.round(base || 1), lo, hi)),
    varySpeed: H.varySpeed || ((base, k = 1) => (base || 100) * k),
    aim: H.aim || (() => Math.atan2((ctx.py || 0) - boss.y, (ctx.px || 0) - boss.x)),
    pat: ctx.pat || {},
    color: ctx.color || '#ffffff',
    r: ctx.r || 6,
    life: ctx.life || 7,
    type: ctx.type !== undefined ? ctx.type : B_CIRCLE,
    px: ctx.px || boss.x,
    py: ctx.py || boss.y + 300,
    wild: ctx.wild || 1,
  };
}

/** 同屏预算：占用超过 93% 就跳过这一拍（最硬的「有缝」护栏） */
function room(e, frac = 0.93) {
  const cap = e.boss.bulletBudget || 1180;
  return e.b.activeCount < cap * frac;
}

/** 单发：把常用字段一次给全，避免每个 pattern 重复写样版代码 */
function shot(e, x, y, a, sp, o = {}) {
  return e.b.spawn({
    x,
    y,
    vx: Math.cos(a) * sp,
    vy: Math.sin(a) * sp,
    color: o.color || e.color,
    r: o.r !== undefined ? o.r : e.r,
    type: o.type !== undefined ? o.type : e.type,
    life: o.life !== undefined ? o.life : e.life,
    rot: o.rot !== undefined ? o.rot : 0,
    spin: o.spin || 0,
    turn: o.turn || 0,
    accel: o.accel || 0,
    homing: o.homing || 0,
    wobbleAmp: o.wobbleAmp || 0,
    wobbleFreq: o.wobbleFreq || 3,
    scaleIn: o.scaleIn !== undefined ? o.scaleIn : 0.12,
  });
}

export const CUSTOM_PATTERNS = {
  /* ============================================================
     1 面 · 露米娅
     ============================================================ */

  /**
   * 宵暗「月之暗面」：正反两层月牙交替旋出，像月亮被慢慢转过去；
   * 每两拍补一颗缓缓下坠的大月亮（B_BIG），路径不封口。
   */
  moonHalo(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { b, rnd, ringN, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const a0 = (e.pat.angle || 0) + fireT * (p.spin || 0.55) * dir;
    const n = ringN(p.n || 9, 6, 24);
    // 亮面月牙
    b.ring(boss.x, boss.y, n, varySpeed(p.speed || 92), {
      angle: a0,
      color: p.color || '#c9a6ff',
      r: p.r || 5,
      type: B_STAR,
      life: 9,
      spin: 1.2,
      wobbleAmp: 10,
      wobbleFreq: 1.4,
    });
    // 暗面月牙：更慢、反向、略小
    b.ring(boss.x, boss.y, Math.max(3, Math.floor(n * 0.5)), varySpeed(p.speed || 92, 0.72), {
      angle: -a0 * 0.8,
      color: '#6b4bb0',
      r: Math.max(3, (p.r || 5) - 1),
      type: B_CIRCLE,
      life: 10,
      turn: -0.2 * dir,
    });
    // 大月亮：每两拍一颗
    if ((boss.volleys || 0) % 2 === 0) {
      shot(e, boss.x, boss.y, e.aim(), varySpeed(48), {
        color: '#fff4d6', r: 9, type: B_BIG, life: 12, spin: 0.6,
      });
    }
    void rnd;
  },

  /**
   * 暗符「黑暗吞噬」：一圈从外围「被吸进去」的弹幕（反向螺旋），
   * 外加从天顶压下来的吞噬碎片。越靠近 Boss 越密，但中心留空。
   */
  devour(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e, 0.9)) return;
    const { rnd, ringN, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const rad = p.radius || 300;
    const n = ringN(p.n || 13, 8, 26);
    const a0 = fireT * 0.9 * dir;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      const x = boss.x + Math.cos(a) * rad * rnd(0.92, 1.08);
      const y = boss.y + Math.sin(a) * rad * 0.72;
      // 切向 + 向内：视觉上「被漩涡卷进去」，但不是追踪弹
      shot(e, x, y, a + Math.PI + 0.55 * dir, varySpeed(p.speed || 102), {
        color: '#2a1a52', r: 5, type: B_CIRCLE, life: 11, turn: 0.3 * dir, scaleIn: 0.2,
      });
    }
    // 顶部的吞噬碎屑（每两拍）
    if ((boss.volleys || 0) % 2 === 0) {
      const m = e.count(p.rain || 4, 2, 8);
      for (let i = 0; i < m; i++) {
        const x = boss.x + rnd(-620, 620);
        shot(e, x, boss.y - rnd(80, 200), Math.PI / 2 + rnd(-0.16, 0.16), varySpeed(150, rnd(0.8, 1.25)), {
          color: '#d9c2ff', r: 4, type: B_STAR, life: 6, spin: 2.2,
        });
      }
    }
  },

  /* ============================================================
     2 面 · 莉格露
     ============================================================ */

  /**
   * 灯符「萤火虫现象」：一小群萤火从 Boss 身边散开，各自带摆动；
   * 每拍还会有一颗突然加速的「惊飞的萤」扑向玩家。
   */
  fireflySwarm(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, count, varySpeed } = e;
    const n = count(p.n || 6, 3, 14);
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU);
      const rad = rnd(24, 150);
      const x = boss.x + Math.cos(a) * rad;
      const y = boss.y + Math.sin(a) * rad * 0.8;
      shot(e, x, y, a + Math.PI / 2 + rnd(-0.9, 0.9), varySpeed(p.speed || 72, rnd(0.5, 1.6)), {
        color: rnd(0, 1) > 0.45 ? '#d8ff9a' : '#7ef07a',
        r: rnd(3, 5),
        type: B_STAR,
        life: 8,
        spin: rnd(-1.6, 1.6),
        wobbleAmp: 26,
        wobbleFreq: rnd(1.5, 4),
        turn: rnd(-0.3, 0.3),
      });
    }
    // 突然亮起的一只：直的、快的、不讲道理的
    if ((boss.volleys || 0) % 3 === 0) {
      shot(e, boss.x, boss.y, e.aim() + rnd(-0.16, 0.16), varySpeed(220), {
        color: '#fff2a8', r: 5, type: B_STAR, life: 6, spin: 3,
      });
    }
    void fireT;
  },

  /**
   * 蠢符「小虫风暴」：两股反向的扇形虫群互相穿插，
   * 每拍整体风向偏移，外加第四拍一次贴脸爆发。
   */
  bugStorm(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { b, rnd, count, varySpeed } = e;
    const n = count(p.n || 7, 4, 18);
    const base = (e.pat.angle || 0) + Math.sin(fireT * 1.7) * 0.7;
    b.fan(boss.x, boss.y, n, 1.9, base, varySpeed(p.speed || 132), {
      color: '#b6ff7a',
      r: 3,
      type: B_CIRCLE,
      life: 8,
      wobbleAmp: 22,
      wobbleFreq: rnd(3, 6),
    });
    b.fan(boss.x, boss.y, Math.max(2, Math.floor(n * 0.6)), 2.4, base + Math.PI, varySpeed(p.speed || 132, 0.8), {
      color: '#6fd85a',
      r: 3,
      type: B_CIRCLE,
      life: 9,
      wobbleAmp: 18,
      wobbleFreq: rnd(2, 4),
    });
    if ((boss.volleys || 0) % 4 === 0) {
      const m = count(p.burst || 5, 3, 9);
      const a = e.aim();
      for (let i = 0; i < m; i++) {
        const t = m === 1 ? 0 : (i / (m - 1)) - 0.5;
        shot(e, boss.x, boss.y, a + t * 0.34 + rnd(-0.03, 0.03), varySpeed(250), {
          color: '#e8ff9a', r: 4, type: B_STAR, life: 6, spin: 2.4,
        });
      }
    }
  },

  /**
   * 隐虫「萤火虫之夜」：整个屏幕几乎全黑（fx=darkSpot），
   * 大量「暗弹」只在玩家周围的光圈里才看得见；
   * 同时每隔几拍放出一只真正发光的萤火，慢慢追向玩家 —— 光既是提示也是威胁。
   */
  nightFireflies(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e, 0.9)) return;
    const { rnd, count, varySpeed } = e;
    // 暗弹：看不见，撞上才知道。密度靠 pressure 自适应收窄。
    const dim = count(p.n || 11, 6, 22);
    for (let i = 0; i < dim; i++) {
      const a = rnd(0, TAU);
      const sp = varySpeed(p.speed || 62, rnd(0.6, 1.35));
      shot(e, boss.x + rnd(-30, 30), boss.y + rnd(-20, 20), a, sp, {
        color: '#2c3a24', r: 3.5, type: B_CIRCLE, life: 12,
        wobbleAmp: rnd(0, 14), wobbleFreq: rnd(1, 2.5),
      });
    }
    // 亮萤：慢速追踪的「引导光」，只放少量
    const lit = count(p.lit || 3, 1, 6);
    for (let i = 0; i < lit; i++) {
      const a = e.aim() + rnd(-0.9, 0.9);
      shot(e, boss.x, boss.y, a, varySpeed(p.litSpeed || 88, rnd(0.85, 1.15)), {
        color: rnd(0, 1) > 0.5 ? '#e8ffb0' : '#c8ff8a',
        r: 5,
        type: B_STAR,
        life: 11,
        spin: 1.8,
        homing: 1.6,
        wobbleAmp: 14,
        wobbleFreq: 1.2,
      });
    }
  },

  /* ============================================================
     3 面 · 琪露诺
     ============================================================ */

  /**
   * 冰符「冰柱落下」：竖直冰棱从顶上砸下并加速，
   * 每三拍从版面底部升起一排碎冰，逼玩家在「上砸」和「上浮」之间选边。
   */
  icicleFall(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, count, varySpeed } = e;
    const n = count(p.n || 5, 3, 12);
    for (let i = 0; i < n; i++) {
      const x = boss.x + rnd(-1, 1) * 540;
      shot(e, x, boss.y - rnd(60, 190), Math.PI / 2 + rnd(-0.05, 0.05), varySpeed(p.speed || 175, rnd(0.85, 1.25)), {
        color: rnd(0, 1) > 0.4 ? '#d8f4ff' : '#ffffff',
        r: 3,
        type: B_RICE,
        rot: Math.PI / 2,
        life: 6,
        accel: 230,
      });
    }
    // 碎冰上浮：给「下压」一个反向出路，不是纯墙
    if ((boss.volleys || 0) % 3 === 0) {
      const m = count(p.shards || 4, 2, 8);
      for (let i = 0; i < m; i++) {
        const x = boss.x + rnd(-560, 560);
        shot(e, x, boss.y + 460, -Math.PI / 2 + rnd(-0.22, 0.22), varySpeed(120), {
          color: '#bfeaff', r: 3, type: B_RICE, rot: -Math.PI / 2, life: 5,
        });
      }
    }
  },

  /**
   * 雹符「冰雹风暴」：斜向冰雹一阵紧一阵松（gust 波），
   * 左右两个方向交替，密度跟着波峰走。
   */
  hailSurge(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, count, varySpeed, clamp } = e;
    const gust = clamp(0.7 + 0.6 * Math.abs(Math.sin(fireT * 0.9)), 0.7, 1.3);
    const n = count(p.n || 8, 5, 18);
    const side = (e.pat.dir || 1) > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const x = boss.x + rnd(-660, 660);
      shot(e, x, boss.y - rnd(40, 200), Math.PI / 2 + side * 0.42, varySpeed(p.speed || 210) * gust, {
        color: rnd(0, 1) > 0.5 ? '#cfefff' : '#ffffff',
        r: rnd(3, 4.5),
        type: B_CIRCLE,
        life: 6,
        accel: 60,
        wobbleAmp: 6,
        wobbleFreq: 2,
      });
    }
  },

  /**
   * 冻符「完美冻结」：先在空中钉一圈静止结晶，半秒后同时向外炸开 ——
   * 「冻结 → 挣碎」两段式，静止段是给玩家的读招时间。
   */
  perfectFreeze(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { b, rnd, ringN, varySpeed } = e;
    if ((boss.volleys || 0) % 3 !== 0) {
      // 冻结的针：几乎静止，只轻轻飘
      const n = ringN(p.n || 14, 8, 26);
      b.ring(boss.x, boss.y, n, 10, {
        angle: rnd(0, TAU),
        color: '#bfefff',
        r: 5,
        type: B_STAR,
        life: 2.2,
        spin: 0.8,
      });
      return;
    }
    const n = ringN(p.n || 14, 8, 26);
    const snapAt = { x: boss.x, y: boss.y };
    b.ring(snapAt.x, snapAt.y, n, 12, {
      angle: rnd(0, TAU), color: '#8fd8f8', r: 5, type: B_STAR, life: 1.6, spin: 1.4,
    });
    // 半秒后碎开：延迟队列自动在切卡时清空，不会漏到下一张卡
    try {
      boss._scheduleLater?.(0.6, (api2) => {
        const b2 = api2 && (api2.bullets || api2.b);
        if (!b2) return;
        if (b2.activeCount > (boss.bulletBudget || 1180) * 0.94) return;
        b2.ring(snapAt.x, snapAt.y, n, varySpeed(p.speed || 190), {
          angle: 0, color: '#ffffff', r: 4, type: B_RICE, life: 6, rot: Math.PI / 2, spin: 0,
        });
      });
    } catch (err) {
      /* 没有延迟队列时退化为直接炸开 */
      b.ring(boss.x, boss.y, n, varySpeed(p.speed || 190), {
        angle: 0, color: '#ffffff', r: 4, type: B_RICE, life: 6,
      });
    }
  },

  /**
   * 雪符「钻石风暴」：几组菱形方阵一边自转一边向外推，
   * 方阵之间角度错开，形成会转的「钻石壳」。
   */
  diamondMatrix(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, clamp, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const arms = clamp(Math.round(p.arms || 4), 3, 8);
    const a0 = (e.pat.angle || 0) + fireT * 0.85 * dir;
    const rows = clamp(Math.round(p.rows || 2), 1, 3);
    for (let k = 0; k < arms; k++) {
      const a = a0 + (k / arms) * TAU;
      for (let j = 0; j < rows; j++) {
        const rad = 40 + j * 62;
        shot(e, boss.x + Math.cos(a) * rad, boss.y + Math.sin(a) * rad * 0.9, a, varySpeed(p.speed || 135, 1 + j * 0.14), {
          color: j === 0 ? '#e8fbff' : '#bfeaff',
          r: 4.5,
          type: B_STAR,
          life: 9,
          spin: 1.6,
        });
      }
    }
    // 稀薄的碎钻雨，压一点「风暴」的存在感
    if ((boss.volleys || 0) % 2 === 0) {
      const m = e.count(p.spark || 4, 2, 8);
      for (let i = 0; i < m; i++) {
        const x = boss.x + rnd(-640, 640);
        shot(e, x, boss.y - rnd(30, 140), Math.PI / 2 + rnd(-0.3, 0.3), varySpeed(90), {
          color: '#ffffff', r: 2.5, type: B_STAR, life: 7, spin: 3, wobbleAmp: 12, wobbleFreq: 2,
        });
      }
    }
  },

  /* ============================================================
     4 面 · 射命丸文
     ============================================================ */

  /**
   * 风符「风神一扇」：一把巨大的单侧风刃横扫过去，
   * 扇骨（冰棱）朝同一个方向排开，玩家只能朝扇子的「开合方向」躲。
   */
  kamaitachi(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, count, varySpeed } = e;
    const n = count(p.n || 11, 6, 20);
    const base = (e.pat.angle || Math.PI / 2) + Math.sin(fireT * 0.8) * 0.55;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
      const a = base + t * 1.25 + rnd(-0.02, 0.02);
      const sp = varySpeed(p.speed || 330, 1 - Math.abs(t) * 0.25);
      shot(e, boss.x, boss.y, a, sp, {
        color: '#ffe6c8', r: 4, type: B_RICE, rot: a - Math.PI / 2, life: 7, spin: 0,
      });
    }
    // 扇轴：一颗慢速的「风眼」，提示扇面的转轴
    if ((boss.volleys || 0) % 2 === 0) {
      shot(e, boss.x, boss.y, base, varySpeed(60), {
        color: '#ff9a9a', r: 8, type: B_BIG, life: 9, spin: 0.5,
      });
    }
  },

  /**
   * 疾风「风神少女」（生存 30s）：风压全开 —— 高速螺旋风墙 + 反向补环，
   * 密度与弹速都靠本卡 densityMul / speedMul 再放大一档。
   */
  windRush(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e, 0.92)) return;
    const { b, rnd, clamp, ringN, count, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const arms = clamp(Math.round(p.arms || 5), 3, 9);
    const a0 = fireT * (p.spin || 2.2) * dir;
    for (let k = 0; k < arms; k++) {
      const a = a0 + (k / arms) * TAU + rnd(-0.03, 0.03);
      shot(e, boss.x, boss.y, a, varySpeed(p.speed || 165, rnd(0.94, 1.08)), {
        color: '#ff8f8f', r: 4, type: B_RICE, rot: a - Math.PI / 2, life: 7,
      });
    }
    if ((boss.volleys || 0) % 2 === 0) {
      const n = ringN(p.ring || 13, 8, 22);
      b.ring(boss.x, boss.y, n, varySpeed(p.ringSpeed || 118), {
        angle: -a0 * 0.7, color: '#ffd0c0', r: 3, type: B_CIRCLE, life: 9,
      });
    }
    if ((boss.volleys || 0) % 3 === 0) {
      const m = count(p.aimed || 3, 2, 5);
      const a = e.aim();
      for (let i = 0; i < m; i++) {
        shot(e, boss.x, boss.y, a + rnd(-0.1, 0.1), varySpeed(300), {
          color: '#ffffff', r: 3, type: B_RICE, rot: a - Math.PI / 2, life: 6,
        });
      }
    }
  },

  /**
   * 岐符「天之八衢」：八条放射「衢」依次点亮，每条三道风矢；
   * 同时有一圈极慢的八边形骨架缓缓旋转，作为路线提示。
   */
  crossroad(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { b, rnd, ringN, varySpeed } = e;
    const dirs = 8;
    const k = (boss.volleys || 0) % dirs;
    const a = (e.pat.angle || 0) + (k / dirs) * TAU + rnd(-0.02, 0.02);
    for (let j = 0; j < 3; j++) {
      const sp = varySpeed(p.speed || 195, 1 + j * 0.16);
      shot(e, boss.x, boss.y, a + (j - 1) * 0.035, sp, {
        color: j === 1 ? '#ffffff' : '#ffd8b0',
        r: j === 1 ? 4 : 3,
        type: B_RICE,
        rot: a - Math.PI / 2,
        life: 8,
      });
    }
    if ((boss.volleys || 0) % 2 === 0) {
      b.ring(boss.x, boss.y, ringN(8, 8, 8), varySpeed(58), {
        angle: a, color: '#ff9a9a', r: 3.5, type: B_CIRCLE, life: 10, turn: 0.12 * (e.pat.dir || 1),
      });
    }
  },

  /**
   * 风神「天狗颪」：一大片从高处压下来的下坡风，带加速度；
   * 两侧再补「回旋风」，把玩家往中间挤但两翼始终留缝。
   */
  downburst(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, count, varySpeed } = e;
    const n = count(p.n || 8, 5, 16);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      const x = boss.x + t * 900 * rnd(0.75, 1.15);
      shot(e, x, boss.y - 240, Math.PI / 2 + t * 0.18, varySpeed(p.speed || 150, rnd(0.9, 1.2)), {
        color: '#ffb0a0', r: 4, type: B_RICE, rot: Math.PI / 2, life: 6, accel: 260,
      });
    }
    if ((boss.volleys || 0) % 2 === 0) {
      const m = count(p.wing || 2, 1, 3);
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < m; i++) {
          const y = boss.y + rnd(60, 420);
          shot(e, boss.x + s * 620, y, s > 0 ? Math.PI : 0, varySpeed(120, rnd(0.8, 1.3)), {
            color: '#d94a4a', r: 4, type: B_CIRCLE, life: 7, wobbleAmp: 12, wobbleFreq: 2,
          });
        }
      }
    }
  },

  /**
   * 「幻想风靡」（生存 180s）：三拍一循环的风暴 ——
   * 0 风墙（有缝环）→ 1 龙卷（双臂螺旋）→ 2 全屏斜雨，
   * 每段都留一条能跟着转的安全带。
   */
  fantasyStorm(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e, 0.9)) return;
    const { b, rnd, clamp, ringN, count, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const cycle = p.cycle || 5.5;
    const phase = Math.floor(fireT / cycle) % 3;
    if (phase === 0) {
      // 风墙：两层反向的稀疏环，缝隙在动
      const n = ringN(p.ring || 16, 10, 26);
      b.ring(boss.x, boss.y, n, varySpeed(120), {
        angle: fireT * 0.5 * dir, color: '#ff4d6a', r: 4, type: B_CIRCLE, life: 9,
      });
      b.ring(boss.x, boss.y, Math.max(8, n - 4), varySpeed(160, 0.9), {
        angle: -fireT * 0.35 * dir, color: '#ffd8a8', r: 3.5, type: B_CIRCLE, life: 8,
      });
    } else if (phase === 1) {
      // 龙卷：双臂 + 螺旋
      const arms = clamp(p.arms || 2, 2, 5);
      const a0 = fireT * 3.1 * dir;
      for (let k = 0; k < arms; k++) {
        const a = a0 + (k / arms) * TAU;
        shot(e, boss.x, boss.y, a, varySpeed(210, rnd(0.92, 1.1)), {
          color: '#ff9a9a', r: 4, type: B_RICE, rot: a - Math.PI / 2, life: 7, turn: 0.45 * dir,
        });
      }
    } else {
      // 斜雨：大面积但每颗都小
      const n = count(p.rain || 9, 5, 18);
      for (let i = 0; i < n; i++) {
        const x = boss.x + rnd(-660, 660);
        shot(e, x, boss.y - rnd(40, 180), Math.PI / 2 + (dir > 0 ? 0.55 : -0.55), varySpeed(200, rnd(0.85, 1.2)), {
          color: '#ffffff', r: 3, type: B_CIRCLE, life: 6,
        });
      }
    }
  },

  /* ============================================================
     5 面 · 西行寺幽幽子
     ============================================================ */

  /**
   * 幽雅「死出诱蛾灯」：一盏大灯（B_BIG）缓缓坠向玩家，
   * 周围的小弹全部沿同一个方向绕灯旋转 —— 飞蛾扑火的诱导感。
   */
  mothLure(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { b, rnd, ringN, varySpeed } = e;
    // 灯：慢速大光球，朝玩家方向轻推
    shot(e, boss.x, boss.y, e.aim(), varySpeed(p.lampSpeed || 52), {
      color: '#fff2c0', r: 9, type: B_BIG, life: 13, spin: 0.5,
    });
    // 蛾群：同一旋向的环，像绕着灯转
    const dir = e.pat.dir || 1;
    const n = ringN(p.m || 13, 8, 24);
    b.ring(boss.x, boss.y, n, varySpeed(p.speed || 82), {
      angle: rnd(0, TAU), color: '#ffc2e8', r: 4, type: B_STAR, life: 10, turn: 0.34 * dir, spin: 1.2,
    });
    // 灯焰的爆点：每隔几拍
    if ((boss.volleys || 0) % 4 === 0) {
      const m = e.count(p.flare || 6, 3, 10);
      for (let i = 0; i < m; i++) {
        shot(e, boss.x, boss.y, rnd(0, TAU), varySpeed(130), {
          color: '#b48cff', r: 3, type: B_CIRCLE, life: 7,
        });
      }
    }
  },

  /**
   * 蝶符「花之舞」：成对的花瓣从两点反向旋出，每对都是镜像轨迹，
   * 像两支舞伴交错 —— 单边永远有路。
   */
  flowerDance(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, clamp, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const petals = clamp(p.petals || 5, 2, 9);
    const a0 = (e.pat.angle || 0) + fireT * 0.5 * dir;
    for (let k = 0; k < petals; k++) {
      const a = a0 + (k / petals) * TAU;
      for (const s of [-1, 1]) {
        shot(e, boss.x, boss.y, a, varySpeed(p.speed || 118, rnd(0.9, 1.12)), {
          color: s > 0 ? '#ffc2e0' : '#fff0f6',
          r: rnd(3.5, 5),
          type: B_STAR,
          life: 9,
          turn: 0.6 * s * dir,
          spin: 2.4 * s,
          wobbleAmp: 16,
          wobbleFreq: 1.6,
        });
      }
    }
  },

  /**
   * 蝶符「死蝶之华尔兹」：三拍节奏 —— 每拍一组镜像蝶翼，
   * 拍与拍之间旋转 120°，三拍合起来是一支完整的圆舞曲。
   */
  butterflyWaltz(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, count, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const beat = Math.floor(fireT / (p.beat || 0.42)) % 3;
    const n = count(p.n || 3, 2, 6);
    const a0 = (e.pat.angle || 0) + (beat * TAU) / 3 + fireT * 0.3 * dir;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * (TAU / 3);
      for (const s of [-1, 1]) {
        shot(e, boss.x, boss.y, a, varySpeed(p.speed || 128, rnd(0.92, 1.1)), {
          color: s > 0 ? '#d9a0ff' : '#9fb0ff',
          r: 5,
          type: B_STAR,
          life: 10,
          turn: 0.42 * s * dir,
          spin: 1.8 * s,
        });
      }
    }
    // 第三拍：整圈提示音
    if (beat === 2) {
      const m = e.ringN(p.ring || 10, 8, 18);
      e.b.ring(boss.x, boss.y, m, varySpeed(70), {
        angle: a0, color: '#ffd8f0', r: 3, type: B_CIRCLE, life: 10,
      });
    }
  },

  /**
   * 亡乡「亡我乡 -宿罪-」（生存 44s）：一张缓慢收拢的「罪网」，
   * 纵列下落 + 横向锁链，空隙始终在移动，站桩必死、乱跑也会撞。
   */
  sinfulRealm(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e, 0.88)) return;
    const { b, rnd, clamp, count, varySpeed } = e;
    // 纵列：每列间隔约 120px，列数越少缝越宽
    const cols = clamp(Math.round(p.cols || 7), 5, 10);
    const span = 1080;
    const drift = Math.sin(fireT * 0.5) * 40;
    for (let i = 0; i < cols; i++) {
      const x = boss.x - span / 2 + (i / (cols - 1)) * span + drift;
      shot(e, x, boss.y - rnd(0, 160), Math.PI / 2 + rnd(-0.06, 0.06), varySpeed(p.speed || 96, rnd(0.9, 1.15)), {
        color: i % 2 === 0 ? '#8f5bb0' : '#b98fd9',
        r: 5,
        type: B_CIRCLE,
        life: 11,
        wobbleAmp: 8,
        wobbleFreq: 0.8,
      });
    }
    // 横向锁链：每三拍一排
    if ((boss.volleys || 0) % 3 === 0) {
      const m = count(p.chain || 6, 4, 10);
      const y = boss.y + rnd(80, 300);
      for (let i = 0; i < m; i++) {
        const x = boss.x - 600 + (i / (m - 1)) * 1200;
        shot(e, x, y, 0, varySpeed(p.chainSpeed || 74), {
          color: '#d9b0ff', r: 4, type: B_RICE, rot: 0, life: 9,
        });
      }
    }
  },

  /**
   * 冥符「常夜樱」：夜樱暴雪 —— 大量带自转的花瓣缓缓压下来，
   * 每两拍补一圈稀疏花环，给「雪」加节拍。
   */
  nightSakura(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { b, rnd, ringN, count, varySpeed } = e;
    const n = count(p.n || 9, 5, 16);
    for (let i = 0; i < n; i++) {
      const x = boss.x + rnd(-640, 640);
      const y = boss.y - rnd(0, 140);
      shot(e, x, y, Math.PI / 2 + rnd(-0.2, 0.2), varySpeed(p.speed || 118, rnd(0.85, 1.2)), {
        color: rnd(0, 1) > 0.5 ? '#ffd0e8' : '#ff8fd0',
        r: rnd(3.5, 5),
        type: B_STAR,
        life: 10,
        spin: rnd(-2.4, 2.4),
        wobbleAmp: 30,
        wobbleFreq: rnd(1.4, 3.2),
      });
    }
    if ((boss.volleys || 0) % 2 === 0) {
      b.ring(boss.x, boss.y, ringN(p.ring || 10, 8, 18), varySpeed(64), {
        angle: rnd(0, TAU), color: '#ffe6f4', r: 3, type: B_STAR, life: 11, spin: 1.2,
      });
    }
  },

  /**
   * 反魂蝶「八分咲」：八拍开一分 —— 每拍同心的花瓣臂数 +1，
   * 第八拍满开时补一整圈，然后重新收拢。卡名就是时间轴。
   */
  resurrectionBloom(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { b, rnd, ringN, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const step = (boss.volleys || 0) % 8;
    const arms = step + 1;
    const a0 = (e.pat.angle || 0) + fireT * 0.22 * dir;
    for (let i = 0; i < arms; i++) {
      const a = a0 + (i / arms) * TAU;
      shot(e, boss.x, boss.y, a, varySpeed(p.speed || 96, 1 + step * 0.05), {
        color: i % 2 === 0 ? '#ffc8ea' : '#e0a0ff',
        r: 4.5,
        type: B_STAR,
        life: 10,
        spin: 1.5,
      });
    }
    if (step === 7) {
      b.ring(boss.x, boss.y, ringN(p.ring || 16, 10, 24), varySpeed(120), {
        angle: rnd(0, TAU), color: '#ffe6f4', r: 3.5, type: B_CIRCLE, life: 9,
      });
    }
  },

  /* ============================================================
     6 面 · 蓬莱山辉夜
     ============================================================ */

  /**
   * 难题「龙颈之玉 -五色的弹丸-」（生存 60s）：五色弹丸轮流领唱，
   * 每拍换一种颜色、换一个螺旋相位；五色叠起来才看得出「龙颈」的转动。
   */
  dragonJewel(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, clamp, varySpeed } = e;
    const colors = p.colors || ['#ff8a8a', '#ffd36b', '#8affb0', '#7fd8ff', '#c9a6ff'];
    const ci = (boss.volleys || 0) % colors.length;
    const arms = clamp(Math.round(p.arms || 5), 3, 8);
    const dir = e.pat.dir || 1;
    const a0 = (e.pat.angle || 0) + fireT * 1.1 * dir;
    for (let k = 0; k < arms; k++) {
      const a = a0 + (k / arms) * TAU;
      shot(e, boss.x, boss.y, a, varySpeed(p.speed || 125, rnd(0.95, 1.06)), {
        color: colors[(ci + k) % colors.length],
        r: 5,
        type: B_CIRCLE,
        life: 9,
        spin: 1.2,
      });
    }
    // 每五拍：五色同心小环
    if (ci === 0) {
      for (let j = 0; j < colors.length; j++) {
        shot(e, boss.x, boss.y, rnd(0, TAU), varySpeed(58 + j * 12), {
          color: colors[j], r: 7, type: B_BIG, life: 12, spin: 0.8,
        });
      }
    }
  },

  /**
   * 神宝「耀眼的龙玉」：中心一颗大玉（慢慢飘），
   * 六向细长光矢从玉体射出，强但不密，靠「看得见的射线」给压迫感。
   */
  shiningJewel(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, clamp, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const rays = clamp(Math.round(p.rays || 6), 4, 10);
    const a0 = (e.pat.angle || 0) + fireT * 0.35 * dir;
    for (let k = 0; k < rays; k++) {
      const a = a0 + (k / rays) * TAU;
      shot(e, boss.x, boss.y, a, varySpeed(p.speed || 300), {
        color: '#fff0a0', r: 4, type: B_RICE, rot: a - Math.PI / 2, life: 6,
      });
    }
    if ((boss.volleys || 0) % 2 === 0) {
      shot(e, boss.x, boss.y, e.aim() + rnd(-0.2, 0.2), varySpeed(p.orbSpeed || 62), {
        color: '#ffe080', r: 11, type: B_BIG, life: 14, spin: 0.5,
      });
    }
  },

  /**
   * 难题「佛御石之钵 -不碎的意志-」：以玩家为圆心生成带缺口的石钵围栏，
   * 收缩得很慢（意志），缺口每次换位置 —— 不许站定，但不封死。
   */
  stoneBowl(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e, 0.88)) return;
    const { rnd, clamp, ringN, varySpeed } = e;
    const R = clamp(p.radius || 250, 190, 320);
    const n = ringN(p.n || 18, 10, 30);
    const gaps = clamp(Math.round(p.gaps || 2), 1, 3);
    const gapSpan = p.gapFrac || 0.55; // 每个豁口的角宽倍率（相对单格）
    const a0 = rnd(0, TAU);
    const gapAt = [];
    for (let g = 0; g < gaps; g++) gapAt.push(a0 + (g / gaps) * TAU + rnd(-0.2, 0.2));
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      let inGap = false;
      for (const ga of gapAt) {
        let d = Math.atan2(Math.sin(a - ga), Math.cos(a - ga));
        if (Math.abs(d) < (TAU / n) * gapSpan) { inGap = true; break; }
      }
      if (inGap) continue;
      const x = e.px + Math.cos(a) * R;
      const y = e.py + Math.sin(a) * R;
      // 向心：慢速，给反应时间
      shot(e, x, y, a + Math.PI, varySpeed(p.speed || 74), {
        color: '#d8d0b0', r: 4.5, type: B_CIRCLE, life: 7, spin: 0.6,
      });
    }
    // 落石：从上方砸向玩家当前位置
    if ((boss.volleys || 0) % 2 === 0) {
      const m = e.count(p.stones || 2, 1, 4);
      for (let i = 0; i < m; i++) {
        shot(e, e.px + rnd(-120, 120), boss.y - rnd(40, 180), Math.PI / 2, varySpeed(p.stoneSpeed || 165, rnd(0.9, 1.2)), {
          color: '#b0a890', r: 7, type: B_BIG, life: 6, spin: 0.4,
        });
      }
    }
  },

  /**
   * 神宝「佛体的金刚石」：旋转的菱形晶阵 + 定时四向激光，
   * 「硬」的观感来自直线与直角，而不是弹数。
   */
  adamant(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, clamp, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const arms = clamp(Math.round(p.arms || 4), 3, 8);
    const a0 = (e.pat.angle || 0) + fireT * 0.9 * dir;
    for (let k = 0; k < arms; k++) {
      const a = a0 + (k / arms) * TAU;
      for (let j = 0; j < 2; j++) {
        const rad = 90 + j * 80;
        shot(e, boss.x + Math.cos(a) * rad, boss.y + Math.sin(a) * rad, a, varySpeed(p.speed || 130, 1 + j * 0.12), {
          color: j === 0 ? '#e8fbff' : '#ffffff',
          r: 4.5,
          type: B_STAR,
          life: 9,
          spin: 1.6,
        });
      }
    }
    // 四向（或六向）激光：硬直、不追踪
    if ((boss.volleys || 0) % 3 === 0) {
      const rays = clamp(Math.round(p.rays || 4), 2, 8);
      const base = (e.pat.angle || 0) + Math.PI / 4;
      for (let k = 0; k < rays; k++) {
        const a = base + (k / rays) * TAU;
        shot(e, boss.x, boss.y, a, varySpeed(p.laserSpeed || 330), {
          color: '#bfeaff', r: 3, type: B_RICE, rot: a - Math.PI / 2, life: 5,
        });
      }
    }
    void rnd;
  },

  /**
   * 难题「火鼠的皮衣 -不焦躁的内心-」（360s）：极慢的不灭火焰涡轮，
   * 火舌每拍只转一点点；上方不断有火星上窜 —— 时间很长，节奏必须稳。
   */
  fireRat(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, clamp, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const arms = clamp(Math.round(p.arms || 3), 2, 6);
    const a0 = (e.pat.angle || 0) + fireT * 1.35 * dir;
    for (let k = 0; k < arms; k++) {
      const a = a0 + (k / arms) * TAU;
      shot(e, boss.x, boss.y, a, varySpeed(p.speed || 78), {
        color: k % 2 === 0 ? '#ff9a4d' : '#ffd36b',
        r: 5,
        type: B_CIRCLE,
        life: 12,
        turn: 0.35 * dir,
        spin: 1.2,
      });
    }
    // 火星上窜：从下半屏往上升
    const m = e.count(p.embers || 2, 1, 5);
    for (let i = 0; i < m; i++) {
      const x = boss.x + rnd(-520, 520);
      shot(e, x, boss.y + rnd(90, 340), -Math.PI / 2 + rnd(-0.35, 0.35), varySpeed(p.emberSpeed || 118), {
        color: '#ffd36b', r: 3, type: B_STAR, life: 7, spin: 2.6,
      });
    }
  },

  /**
   * 神宝「火蜥蜴之盾」：六面盾弧交替向前推进（一进一退），
   * 永远只开一半方向，玩家可以绕着未开的那半边转。
   */
  lizardShield(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, clamp, varySpeed } = e;
    const dirs = clamp(Math.round(p.dirs || 6), 4, 8);
    const k0 = (boss.volleys || 0) % dirs;
    const base = (e.pat.angle || 0) + (e.pat.dir || 1) * 0.2;
    for (let d = 0; d < dirs; d++) {
      if ((d + k0) % 2 !== 0) continue; // 只开一半，交替
      const a0 = base + (d / dirs) * TAU;
      for (let j = 0; j < 3; j++) {
        const a = a0 + (j - 1) * 0.13;
        const rad = 110 + j * 26;
        shot(e, boss.x + Math.cos(a) * rad, boss.y + Math.sin(a) * rad, a, varySpeed(p.speed || 145, rnd(0.92, 1.12)), {
          color: j === 1 ? '#ff7a3d' : '#ffb06b',
          r: 4,
          type: B_CIRCLE,
          life: 8,
          spin: 0.8,
        });
      }
    }
  },

  /**
   * 难题「燕之子安贝 -不死之药-」：极快的燕尾双叉，
   * 每一「燕」都是两条分开的细线 + 一道慢速残影；速度是这张卡的全部语言。
   */
  swallowTrail(p, boss, ctx) {
    const e = env(ctx, boss);
    if (!e || !room(e)) return;
    const { rnd, count, varySpeed } = e;
    const n = count(p.n || 2, 1, 4);
    for (let i = 0; i < n; i++) {
      const a = e.aim() + rnd(-0.14, 0.14);
      const sp = varySpeed(p.speed || 380);
      // 燕尾：两叉
      for (const s of [-1, 1]) {
        shot(e, boss.x, boss.y, a + s * 0.055, sp, {
          color: '#ffd8a0', r: 3.5, type: B_RICE, rot: a - Math.PI / 2, life: 6,
        });
      }
      // 残影：慢速沿同向，作为「燕迹」
      shot(e, boss.x, boss.y, a, sp * 0.42, {
        color: '#fff2d0', r: 2.5, type: B_STAR, life: 7, spin: 2.2,
      });
    }
  },

  /**
   * 神宝「蓬莱的玉枝 -梦色之乡-」（生存 66s）：金枝分叉 ——
   * 每拍从主枝分出三根小枝，小枝再各带两枚花苞，慢速铺开像一棵发光的树。
   */
  dreamBranch(p, boss, ctx, fireT) {
    const e = env(ctx, boss);
    if (!e || !room(e, 0.9)) return;
    const { rnd, clamp, varySpeed } = e;
    const dir = e.pat.dir || 1;
    const stems = clamp(Math.round(p.stems || 3), 2, 5);
    const base = (e.pat.angle || 0) + fireT * 0.4 * dir;
    const sp0 = varySpeed(p.speed || 92);
    const colors = p.colors || ['#ffe9b0', '#ffc2e0', '#b0ffd8'];
    for (let s = 0; s < stems; s++) {
      const aMain = base + (s / stems) * TAU;
      for (let b = -1; b <= 1; b++) {
        const a = aMain + b * 0.34 + rnd(-0.03, 0.03);
        shot(e, boss.x, boss.y, a, sp0 * rnd(0.9, 1.12), {
          color: colors[(s + b + 3) % colors.length],
          r: b === 0 ? 5 : 4,
          type: b === 0 ? B_BIG : B_STAR,
          life: 12,
          spin: 1.2,
          wobbleAmp: 12,
          wobbleFreq: 1.1,
        });
      }
    }
    // 第二阶分叉：半秒后从 Boss 处以更宽角度再分一次（分形感）
    if ((boss.volleys || 0) % 2 === 0) {
      try {
        boss._scheduleLater?.(0.45, (api2) => {
          const b2 = api2 && (api2.bullets || api2.b);
          if (!b2) return;
          if (b2.activeCount > (boss.bulletBudget || 1180) * 0.94) return;
          const m = 3;
          for (let i = 0; i < m; i++) {
            const a = base + (i / m) * TAU + 0.5;
            b2.spawn({
              x: boss.x, y: boss.y,
              vx: Math.cos(a) * sp0 * 0.8,
              vy: Math.sin(a) * sp0 * 0.8,
              color: '#fff2c0', r: 3, type: B_STAR, life: 10, spin: 1.6,
            });
          }
        });
      } catch (err) {
        /* 忽略：没有延迟队列就不做二阶分叉 */
      }
    }
  },
};

/**
 * 取自定义 pattern 函数。
 * @param {string} name typeName（如 'moonHalo'）
 * @returns {Function|null}
 */
export function customPattern(name) {
  return Object.prototype.hasOwnProperty.call(CUSTOM_PATTERNS, name)
    ? CUSTOM_PATTERNS[name]
    : null;
}

export default CUSTOM_PATTERNS;
