/**
 * 敌人：东方风格的小妖怪（视觉层重做）。
 *
 * 行为与判定跟上一版完全一致（update / 碰撞 / 数值 / 公开 API 一行没动）：
 *  - 'fairy'  地面巡逻，遇边缘或墙转身，用身体撞人   → 视觉升级为「怨灵 / 小亡灵」
 *  - 'flyer'  空中悬停，周期性朝玩家射单发弹         → 视觉升级为「妖精」
 *
 * 造型：两型妖精共用 AI 生成的妖精立绘（src/art/gen/fairy/<color>.png），
 *   五色靠彩色光环区分；御币 / 蛛网 / 蝶群 / 提灯 / 魔法阵等兵种装饰仍由
 *   _drawKindDecor 程序化绘制（只画道具，不画人物）。素材未就绪时只铺一团
 *   该色柔光占位，绝不回退到矢量小人。
 *
 * 性能：
 *   AI 图在 genfairy.js 里按颜色缓存成 Image，运行时只做 drawImage 与少量
 *   translate/rotate；装饰层每帧只有几条描边和径向光，不再预渲染人物精灵。
 *
 * 坐标：draw(ctx, cam) 里 ctx 已应用相机平移，敌人坐标即世界坐标；
 *   _drawFairy 内部把原点挪到包围盒中心，再按 facing 水平镜像。
 */
import { T } from './level.js';
import { drawGenFairy } from '../art/genfairy.js';
import { scaleEnemyHp } from './balance.js';

/**
 * 五色宝石色系。
 * 键名与 body/wing/glow 三个字段被外部逻辑（弹幕颜色、粒子颜色）依赖，不能改名；
 * 新增 hot/rim/deep 供绘制层使用：
 *   hot  = 白热核心 / 高光     rim = 轮廓光     deep = 暗部环境色
 * blue 青金 / red 绯红 / green 翠绿 / yellow 琥珀 / purple 紫晶
 */
export const FAIRY_COLORS = {
  blue: {
    body: '#2d63c8', wing: '#a9d4ff', glow: '#59b8ff',
    hot: '#eaf7ff', rim: '#9fe4ff', deep: '#0d1c38',
  },
  red: {
    body: '#c62a48', wing: '#ffc0cd', glow: '#ff5c7a',
    hot: '#fff2f4', rim: '#ffb0c0', deep: '#3a0a14',
  },
  green: {
    body: '#1c9a62', wing: '#b6f2d2', glow: '#3fe098',
    hot: '#eafff4', rim: '#8ff0c2', deep: '#062a1e',
  },
  yellow: {
    body: '#cf8b1c', wing: '#ffe6ae', glow: '#ffc247',
    hot: '#fff8e6', rim: '#ffdb8a', deep: '#33200a',
  },
  purple: {
    body: '#7448cf', wing: '#d8c6ff', glow: '#a97cff',
    hot: '#f4edff', rim: '#c8a8ff', deep: '#211136',
  },
};

const COLOR_ORDER = ['blue', 'red', 'green', 'yellow', 'purple'];

/**
 * 按关卡主色挑妖精配色：约六成主色，其余从点缀色里轮换。
 * 主色保证整关一眼能认出主题，点缀色让队伍不至于单调。
 */
function pickFairyColor(tint, idx) {
  const t = tint || {};
  const main = t.main && FAIRY_COLORS[t.main] ? t.main : COLOR_ORDER[0];
  const mix = (t.mix || []).filter((k) => FAIRY_COLORS[k]);
  if (!mix.length) return main;
  // 每 5 只一批：3 只主色（60%）+ 2 只点缀，点缀色按批轮换 → 小样本也不会失衡
  const slot = idx % 5;
  if (slot < 3) return main;
  const group = Math.floor(idx / 5);
  return mix[(group * 2 + (slot - 3)) % mix.length];
}

/**
 * 杂兵种类扩展（平台关）。
 * 全部按幻想乡的「妖精 / 妖怪」来设计，没有机械兵装：
 *  - fairy    原地面巡逻妖精，不开火（红白裙，最常见的杂鱼）
 *  - lancer   御币妖精：手持神主的御币，蓄力后突进（撞人），并打出 1–3 发瞄准米弹
 *  - weaver   蛛网妖精：定期闪到前方地面，向四方打「交叉」星弹，丝线是土蜘蛛的网
 *  - flyer    原空中狙击妖精
 *  - spreader 蝶妖精：三只小蝶绕身飞舞，环射时蝶群同时振翅
 *  - bomber   提灯妖精：身下悬一盏纸提灯，从上方抛落延迟的鬼火雨
 *  - spinner  魔法妖精：魔法森林出身的施法妖精，脚下是旋转的星之魔法阵
 * 装饰只画「御币 / 蛛网 / 蝶 / 提灯 / 魔法阵」，与冰晶弹幕同一套冷暖光，
 * 不引入枪炮、引信、浮游炮这类不属幻想乡的机械部件。
 * 种子固定（level.def.gen.seed + level.def.id），同一关每次进入种类分布一致。
 */
export const PLATFORM_KINDS = {
  fairy: { air: false, w: 28, h: 36, hp: 6, size: 42, amp: 12, hover: 1.6 },
  lancer: { air: false, w: 30, h: 38, hp: 12, size: 46, amp: 12, hover: 1.6 },
  weaver: { air: false, w: 26, h: 32, hp: 9, size: 38, amp: 12, hover: 1.6 },
  flyer: { air: true, w: 30, h: 34, hp: 6, size: 42, amp: 12, hover: 1.6 },
  spreader: { air: true, w: 34, h: 38, hp: 12, size: 47, amp: 14, hover: 1.45 },
  bomber: { air: true, w: 38, h: 34, hp: 15, size: 48, amp: 9, hover: 1.2 },
  spinner: { air: true, w: 30, h: 34, hp: 12, size: 43, amp: 16, hover: 1.8 },
};

/** 关卡序号 → 杂兵池档位（stage1 最保守，stage5/6 最丰富） */
const GROUND_WEIGHTS = {
  1: { fairy: 0.74, lancer: 0.26 },
  2: { fairy: 0.56, lancer: 0.28, weaver: 0.16 },
  3: { fairy: 0.46, lancer: 0.30, weaver: 0.24 },
  4: { fairy: 0.40, lancer: 0.32, weaver: 0.28 },
  5: { fairy: 0.36, lancer: 0.32, weaver: 0.32 },
};
const AIR_WEIGHTS = {
  1: { flyer: 0.78, spreader: 0.22 },
  2: { flyer: 0.58, spreader: 0.24, bomber: 0.18 },
  3: { flyer: 0.47, spreader: 0.21, bomber: 0.18, spinner: 0.14 },
  4: { flyer: 0.40, spreader: 0.20, bomber: 0.20, spinner: 0.20 },
  5: { flyer: 0.34, spreader: 0.20, bomber: 0.22, spinner: 0.24 },
};
/** 单关每种新杂兵的上限，防止长关卡里子弹种类堆爆 */
const KIND_CAPS = { lancer: 16, weaver: 12, spreader: 16, bomber: 12, spinner: 12 };

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function levelRng(level) {
  const def = (level && level.def) || {};
  const gen = def.gen || {};
  const seed = (Number(gen.seed) || 0) ^ hashStr(String(def.id || 'stage'));
  return mulberry32(seed || 0x5bd1e995);
}

function platformTierOf(level) {
  const def = (level && level.def) || {};
  const m = /^stage(\d+)$/.exec(String(def.id || ''));
  return m ? Math.min(5, Math.max(1, Number(m[1]))) : 1;
}

function pickPlatformKind(baseType, tier, rng, used) {
  const table = baseType === 'flyer' ? AIR_WEIGHTS[tier] : GROUND_WEIGHTS[tier];
  const allowed = Object.entries(table).filter(([k]) => (
    k === baseType || !KIND_CAPS[k] || (used[k] || 0) < KIND_CAPS[k]
  ));
  let total = 0;
  for (const [, w] of allowed) total += w;
  let r = rng() * total;
  for (const [k, w] of allowed) {
    r -= w;
    if (r <= 0) return k;
  }
  return baseType;
}

function makeFairy(type, x, y, idx, tint, kind = type, rng = null) {
  const colorKey = pickFairyColor(tint, idx);
  const info = PLATFORM_KINDS[kind] || PLATFORM_KINDS[type] || PLATFORM_KINDS.fairy;
  const rnd = rng || Math.random;
  const vx = info.air ? 0 : (kind === 'lancer' ? 42 : kind === 'weaver' ? 46 : 52);
  return {
    type,
    kind,
    ground: !info.air,
    colorKey,
    colors: FAIRY_COLORS[colorKey],
    x, y,
    prevX: x, prevY: y,
    w: info.w,
    h: info.h,
    vx,
    vy: 0,
    facing: vx >= 0 ? 1 : -1,
    hp: scaleEnemyHp(info.hp),
    maxHp: scaleEnemyHp(info.hp),
    alive: true,
    hitFlash: 0,
    baseY: y,
    phase: rnd() * 6.28,
    shootCd: 1.2 + rnd() * 1.6,
    animTime: rnd() * 6.28,
    deadT: 0,
    stompGrace: 0,
    // 扩展字段：外观尺寸 / 悬停参数 / 各兵种状态机
    size: info.size,
    hoverAmp: info.amp,
    hoverSpeed: info.hover,
    patrol: info.air ? 0 : (kind === 'lancer' ? 42 : kind === 'weaver' ? 46 : 52),
    state: 'patrol',
    stateT: 0,
    chargeCd: 2.0 + rnd() * 2.2,
    blinkCd: 3.2 + rnd() * 2.2,
    ringA: rnd() * 6.28,
    spinA: rnd() * 6.28,
    fireT: 0,
    // 开火变体计数（对地扇形 / 交叉火网 / 追踪延迟弹交替用）
    shotAlt: 0,
    spinBurst: 0,
  };
}

/* =====================================================================
 *  绘制层：颜色工具
 * ===================================================================== */

const TAU = Math.PI * 2;

/** '#rrggbb' | 'rgb(...)' → [r,g,b]，容错到白色 */
function hexRgb(hex) {
  if (typeof hex !== 'string') return [255, 255, 255];
  let h = hex.trim();
  if (h.startsWith('rgb')) {
    const v = h.slice(h.indexOf('(') + 1, h.indexOf(')')).split(',');
    return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0];
  }
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h.slice(0, 6), 16);
  if (isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* =====================================================================
 *  EnemyManager
 * ===================================================================== */

export class EnemyManager {
  /**
   * @param {import('./level.js').Level} level
   * @param {object} [opts]
   * @param {'easy'|'normal'|'hard'} [opts.difficulty='normal']
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.difficulty = opts.difficulty || 'normal';
    this.list = [];
    this.t = 0;

    let i = 0;
    const tint = level.def && level.def.fairyTint;
    // 种类分布由关卡 id + 生成种子决定：同一关每次进入完全一致
    const tier = platformTierOf(level);
    const rng = levelRng(level);
    const used = {};
    const escorts = [];
    for (const e of level.entities) {
      if (e.type !== 'fairy' && e.type !== 'flyer') continue;
      const kind = pickPlatformKind(e.type, tier, rng, used);
      used[kind] = (used[kind] || 0) + 1;
      const info = PLATFORM_KINDS[kind] || PLATFORM_KINDS[e.type];
      // 实体的 (x,y) 是瓦片左上角，敌人居中偏下
      const x = e.x + (T - info.w) / 2;
      let y = e.y + (T - info.h);
      if (info.air) {
        if (kind === 'bomber') y -= 44;
        y = Math.max(T * 1.5, y);
        let guard = 0;
        while (level.rectHitsSolid(x, y, info.w, info.h) && y > T * 1.5 && guard < 30) { y -= 8; guard++; }
      }
      this.list.push(makeFairy(e.type, x, y, i++, tint, kind, rng));

      // 高面数关卡的空中护航：只补空中兵，绝不在地面路线中间加卡位
      if (info.air && tier >= 3 && rng() < 0.2 && escorts.length < 12) {
        const ex = x - 118;
        const ey = Math.max(T * 1.5, y - 38);
        if (ex > T * 2 && !level.rectHitsSolid(ex, ey, 30, 34)) {
          const ek = rng() < 0.5 ? 'spreader' : 'spinner';
          escorts.push(makeFairy('flyer', ex, ey, i++, tint, ek, rng));
        }
      }
    }
    this.list.push(...escorts);
    this.tier = tier;
    this.bulletCooldownMul = this.difficulty === 'easy' ? 1.5 : this.difficulty === 'hard' ? 0.7 : 1;

    // 难度细节：优先用难度表给的精确倍率（能区分 H / L），否则退回三档 enemyDifficulty
    const d = opts.diff || null;
    // 分面密度：2–6 面道中更稀（齐射发数变少、开火间隔变长）；Extra 传 0 → 1.00
    const dens = Math.min(1.5, Math.max(0.4, Number(opts.stageDensity) || 1));
    this.fireScale = (Number(d?.enemyFireScale) || this.bulletCooldownMul) / dens;
    // 分面开火递增：1 面保持基准（别太变态），越往后射速越快（最多快 20%）
    this.tierMul = Math.max(0.8, 1 - 0.05 * (Math.max(1, tier) - 1));
    this.bulletCooldownMul = this.fireScale;
    this.bulletSpeed = Math.min(Number(d?.bulletSpeedCap) || 520, 150 * (Number(d?.enemyBulletScale) || 1));
    this.bulletShots = Math.max(1, Math.round((Number(d?.flyerShots) || 1) * dens));
    // 全局弹幕软上限（难度表的 bulletBudget 打个折）：超过就先不开火，绝不把池子打爆
    const budget = Number(d?.bulletBudget) || 720;
    this.bulletCap = Math.min(1250, Math.max(260, budget * 0.9));
  }

  /** 弹幕池还有余量才开火（池子有 1400 硬上限，这里留出 Boss / 符卡的空间） */
  _mayFire(bullets) {
    return !!bullets && bullets.count() < this.bulletCap;
  }

  update(dt, player, bullets, fx, opts = {}) {
    this.t += dt;
    const level = this.level;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;

    for (const e of this.list) {
      // 长关卡（3000+ 列）里大部分敌人离屏很远：跳过 update，避免每帧白算巡逻/贴地。
      // 2400px ≈ 两屏多一点，弹出视野后不会看到「卡住」的敌人。
      if (Math.abs(e.x - px) > 2400) {
        e.prevX = e.x;
        e.prevY = e.y;
        continue;
      }
      if (!e.alive) {
        e.deadT += dt;
        continue;
      }
      e.prevX = e.x;
      e.prevY = e.y;
      e.animTime += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.stompGrace = Math.max(0, e.stompGrace - dt);
      e.phase += dt;

      if (e.ground) {
        this._updateGround(e, dt, player, px, py, bullets, fx, opts);
      } else {
        this._updateAir(e, dt, player, px, py, bullets, fx, opts);
      }

      // 与玩家碰撞：踩 vs 撞
      if (e.stompGrace <= 0 && this._overlap(e, player)) {
        const playerBottom = player.y + player.h;
        const isStomp = player.vy > 60 && playerBottom < e.y + e.h * 0.62;
        if (isStomp) {
          // 小怪血量整体上调后，踩踏伤害同步提高：普通妖精 1 脚、重装 2 脚仍能踩死
          e.hp -= 8;
          opts.onStomp?.(e);
          player.vy = -560;
          player.jumpsLeft = 1;
          e.stompGrace = 0.2;
          fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.glow, 8, 200);
          if (e.hp <= 0) this._kill(e, fx, opts);
        } else if (player.dashing) {
          // 冲刺是有限资源，给得比踩踏更重：轻装 1 冲、重装 2 冲
          e.hp -= 10;
          opts.onStomp?.(e);
          fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.glow, 10, 240);
          if (e.hp <= 0) this._kill(e, fx, opts);
        } else {
          player.hurt(1, e.x + e.w / 2);
        }
      }
    }

    // 清理很久的尸体
    this.list = this.list.filter((e) => e.alive || e.deadT < 1.2);
  }

  /* ---------------- 地面型：巡逻 / 冲锋 / 闪现 ---------------- */

  _updateGround(e, dt, player, px, py, bullets, fx, opts) {
    const level = this.level;
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;

    // 御币妖精：靠近后 0.45s 蓄力（红光警示），随后 0.4s 高速突进
    if (e.kind === 'lancer') {
      e.chargeCd = Math.max(0, e.chargeCd - dt);
      if (e.state === 'patrol') {
        if (e.chargeCd <= 0 && Math.abs(px - cx) < 430 && Math.abs(py - cy) < 190) {
          e.state = 'wind';
          e.stateT = 0.45;
          e.facing = px > cx ? 1 : -1;
          fx?.flash?.(cx, cy, e.colors.hot, 24);
        }
      } else if (e.state === 'wind') {
        e.stateT -= dt;
        e.vx = 0;
        if (e.stateT <= 0) {
          e.state = 'charge';
          e.stateT = 0.42;
          e.vx = e.facing * 340;
        }
      } else if (e.state === 'charge') {
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 'patrol';
          e.stateT = 0;
          e.vx = (e.facing > 0 ? 1 : -1) * e.patrol;
          e.chargeCd = 3.4;
        }
      }
    }

    // 蛛网妖精：定期闪现到前方一块可站立的地面（不穿墙、不落空）
    if (e.kind === 'weaver') {
      e.blinkCd -= dt;
      if (e.blinkCd <= 0) {
        e.blinkCd = 3.6 + ((e.phase * 0.37) % 1.2);
        const tx = e.x + e.facing * 96;
        let ty = e.y;
        let guard = 0;
        while (guard < 40 && ty > T * 0.5 && level.rectHitsSolid(tx, ty - 2, e.w, e.h)) { ty -= 4; guard++; }
        guard = 0;
        while (guard < 40 && ty < level.h - e.h - 2 && !level.rectHitsSolid(tx, ty + 2, e.w, e.h)) { ty += 4; guard++; }
        const clear = tx > T && tx < level.w - e.w - T && !level.rectHitsSolid(tx, ty, e.w, e.h);
        if (clear) {
          fx?.flash?.(cx, cy, e.colors.wing, 18);
          e.x = tx;
          e.y = ty;
          fx?.burst?.(e.x + e.w / 2, e.y + e.h / 2, e.colors.glow, 6, 160);
        }
      }
    }

    // 巡逻移动（冲锋 / 蓄力期间由状态机接管 vx）
    if (e.state !== 'wind' && e.state !== 'charge') e.x += e.vx * dt;

    // 撞墙 / 悬崖 就转身；冲锋撞墙则提前结束
    if (e.state === 'charge') {
      const probe = e.x + (e.vx > 0 ? 6 : -6);
      if (level.rectHitsSolid(probe, e.y, e.w, e.h) || e.x < T || e.x > level.w - e.w - T) {
        e.state = 'patrol';
        e.vx = (e.facing > 0 ? 1 : -1) * e.patrol;
        e.chargeCd = 3.4;
        fx?.burst(e.x + e.w / 2, e.y + e.h, e.colors.wing, 4, 120);
      }
    } else if (e.state !== 'wind') {
      const aheadX = e.vx > 0 ? e.x + e.w + 4 : e.x - 4;
      const footY = e.y + e.h + 4;
      const tx = Math.floor(aheadX / T);
      const cyFoot = Math.floor(footY / T);
      const wallHit = level.isSolidTile(tx, Math.floor((e.y + e.h / 2) / T));
      const noFloor = !level.isSolidTile(tx, cyFoot) && !level.isPlatformTile(tx, cyFoot);
      if (wallHit || noFloor) {
        e.vx *= -1;
        e.facing = e.vx > 0 ? 1 : -1;
        e.x += e.vx * dt * 2;
      }
    }

    // 重力贴地（简单版）
    let gy = e.y;
    let steps = 0;
    while (level.rectHitsSolid(e.x, gy, e.w, e.h) && steps < 40) { gy -= 2; steps++; }
    steps = 0;
    while (!level.rectHitsSolid(e.x, gy + 2, e.w, e.h) && steps < 60) { gy += 2; steps++; }
    e.y = gy;

    // 地面型开火（fairy 保持原设计：不开火）
    if (opts.freeze || !bullets) return;
    e.shootCd -= dt * (1 / this.bulletCooldownMul);
    if (e.shootCd > 0 || !this._mayFire(bullets)) return;

    const ox = e.x + e.w / 2;
    const oy = e.y + e.h * 0.45;
    const dist = Math.hypot(px - ox, py - oy);
    if (e.kind === 'lancer' && dist < 760 && Math.abs(py - oy) < 280) {
      // 瞄准扇形米弹：发数随 flyerShots（难度 / 分面密度）变宽，射速也吃分面递增
      e.shootCd = (2.0 + Math.random() * 0.7) * this.fireScale * this.tierMul;
      const n = 2 + Math.min(3, this.bulletShots - 1);
      const aimX = px + (player.vx || 0) * 0.14;
      const aimY = py + (player.vy || 0) * 0.14;
      const a = Math.atan2(aimY - oy, aimX - ox);
      bullets.fan(ox, oy, n, 0.15 + 0.02 * n, a, this.bulletSpeed * 0.95, {
        r: 5, color: e.colors.glow, type: 1, life: 5,
      });
    } else if (e.kind === 'weaver' && dist < 720) {
      // 蛛网妖精两种弹幕交替：
      //  奇数发 = 交叉火网（新）：左右两点各一扇瞄准星弹，两股流线在半空交叉
      //  偶数发 = 原环形网：8/4 向自旋星弹
      const crossTurn = (e.shotAlt = (e.shotAlt || 0) + 1) % 2 === 1;
      const nBase = Math.min(4, 2 + Math.max(0, this.bulletShots - 1));
      e.shootCd = (2.8 + Math.random() * 0.7) * this.fireScale * this.tierMul;
      if (crossTurn) {
        const aimX = px + (player.vx || 0) * 0.1;
        const aimY = py + (player.vy || 0) * 0.1;
        const sp = this.bulletSpeed * 0.78;
        for (const side of [-1, 1]) {
          const bx = ox + side * 62;
          const by = oy - 6;
          const a = Math.atan2(aimY - by, aimX - bx);
          bullets.fan(bx, by, nBase, 0.09, a, sp, {
            r: 4.5, color: e.colors.wing, type: 3, life: 5, spin: 2,
          });
        }
      } else {
        const n = this.bulletShots > 1 ? 10 : 6;
        const base = Math.PI / 4 + e.ringA;
        const sp = this.bulletSpeed * 0.72;
        for (let k = 0; k < n; k++) {
          const a = base + (k / n) * TAU;
          bullets.spawn({
            x: ox, y: oy,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            r: 5, color: e.colors.wing, type: 3, life: 5, spin: 3,
          });
        }
        e.ringA += Math.PI / 8;
      }
    } else {
      e.shootCd = 1.2 + Math.random() * 1.2;
    }
  }

  /* ---------------- 空中型：悬停 / 环射 / 延迟雨 / 螺旋 ---------------- */

  _updateAir(e, dt, player, px, py, bullets, fx, opts) {
    const cx = e.x + e.w / 2;
    const dx = px - cx;
    e.facing = dx > 0 ? 1 : -1;
    // 正弦悬停（各兵种幅度 / 频率不同）
    e.y = e.baseY + Math.sin(e.phase * e.hoverSpeed) * e.hoverAmp;

    const hold = e.kind === 'bomber' ? 250 : e.kind === 'spinner' ? 300 : 340;
    const drift = Math.abs(dx) > hold ? 0.9 : 0.15;
    const maxSp = e.kind === 'bomber' ? 18 : e.kind === 'spinner' ? 34 : 30;
    e.x += Math.sign(dx) * Math.min(maxSp, Math.abs(dx) * 0.5) * drift * dt;

    const ox = cx;
    const oy = e.y + e.h * 0.55;

    // 魔法妖精：持续螺旋（不进入冷却池，单独用 fireT 计时）
    if (e.kind === 'spinner') {
      e.spinA += dt * 2.1;
      e.fireT -= dt;
      if (e.fireT > 0 || opts.freeze || !this._mayFire(bullets)) return;
      e.fireT = Math.max(0.11, 0.16 * this.fireScale * this.tierMul);
      const arms = this.bulletShots >= 4 ? 3 : this.bulletShots > 2 ? 2 : 1;
      const sp = Math.min(this.bulletSpeed, 150);
      for (let k = 0; k < arms; k++) {
        bullets.spiral(ox, oy, e.spinA + (k / arms) * Math.PI, sp, {
          r: 4.5, color: e.colors.wing, type: 0, life: 4.5,
        });
      }
      // 追踪延迟弹（新弹幕样式）：每 3 轮螺旋追加一对慢速星弹，
      // 先以 55px/s 爬行、再靠 accel 追玩家，homing 2.4s 后转为直线——逼玩家换位而不是站着输出
      if ((e.spinBurst = (e.spinBurst || 0) + 1) % 3 === 0) {
        for (let k = 0; k < 2; k++) {
          const a = e.spinA + Math.PI * k;
          bullets.spawn({
            x: ox, y: oy,
            vx: Math.cos(a) * 55, vy: Math.sin(a) * 55,
            r: 6.5, color: e.colors.glow, type: 3, life: 6.5,
            homing: 2.4, accel: 92, spin: 4,
          });
        }
        fx?.flash?.(ox, oy, e.colors.hot, 20);
      }
      return;
    }

    e.shootCd -= dt * (1 / this.bulletCooldownMul);
    if (e.shootCd > 0 || opts.freeze || !this._mayFire(bullets)) return;

    if (e.kind === 'spreader') {
      // 环射：每次换一个角度，弹数随难度 / 分面密度增加
      e.shootCd = (2.4 + Math.random() * 0.6) * this.fireScale * this.tierMul;
      const n = Math.min(12, 6 + Math.max(0, this.bulletShots - 1) * 2);
      bullets.ring(ox, oy, n, Math.min(this.bulletSpeed, 140), {
        angle: e.ringA, r: 5, color: e.colors.glow, type: 0, life: 5.5,
      });
      e.ringA += Math.PI / n;
    } else if (e.kind === 'bomber') {
      // 两种弹幕交替：奇数发 = 对地扇形（新），偶数发 = 原延迟雨
      const dist = Math.hypot(px - ox, py - oy);
      if (dist < 900) {
        e.shootCd = (2.5 + Math.random() * 0.7) * this.fireScale * this.tierMul;
        if ((e.shotAlt = (e.shotAlt || 0) + 1) % 2 === 1) {
          // 对地扇形：以正下方为中心铺一排重力米弹，封锁地面走位（避开正上方，给玩家绕后空间）
          const n = 3 + Math.min(4, Math.max(0, this.bulletShots - 1) * 2);
          const sp = this.bulletSpeed * 0.62;
          for (let k = 0; k < n; k++) {
            const a = Math.PI / 2 + (k - (n - 1) / 2) * 0.2;
            bullets.spawn({
              x: ox, y: oy + 4,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              r: 5.5, color: e.colors.glow, type: 1, life: 5, accel: 150,
            });
          }
          fx?.flash?.(ox, oy + 12, e.colors.wing, 20);
        } else {
          // 延迟雨：初速很慢 + 沿速度持续加速，落下时才是「雨」
          const n = 3 + Math.min(2, Math.max(0, this.bulletShots - 1));
          for (let k = 0; k < n; k++) {
            const bx = ox + (k - (n - 1) / 2) * 26;
            bullets.spawn({
              x: bx, y: oy + 6, vx: 0, vy: 30, accel: 260,
              r: 6, color: e.colors.glow, type: 1, life: 7, scaleIn: 0.2,
            });
          }
          fx?.flash?.(ox, oy + 10, e.colors.wing, 18);
        }
      }
    } else {
      // 原 flyer：齐射数随 flyerShots 提高，开火间隔也吃 fireScale（分面递增）
      e.shootCd = (2.1 + Math.random() * 1.3) * this.fireScale * this.tierMul;
      if (this.bulletShots > 1) {
        const a = Math.atan2(py - oy, px - ox);
        const n = Math.min(5, this.bulletShots + 1);
        bullets.fan(ox, oy, n, 0.2, a, this.bulletSpeed, {
          r: 5, color: e.colors.glow, type: 0, life: 5,
        });
      } else {
        bullets.aimed(ox, oy, px, py, this.bulletSpeed, {
          r: 6, color: e.colors.glow, type: 0, life: 5,
        });
      }
    }
  }

  _overlap(e, p) {
    return e.x < p.x + p.w && e.x + e.w > p.x && e.y < p.y + p.h && e.y + e.h > p.y;
  }

  _kill(e, fx, opts) {
    if (!e.alive) return;
    e.alive = false;
    e.deadT = 0;
    fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.glow, 14, 300);
    fx?.shockwave(e.x + e.w / 2, e.y + e.h / 2, e.colors.wing, 8, 320, 0.34);
    opts.onKill?.(e);
  }

  /** 玩家子弹命中检测 */
  damageWithShots(shots, fx, opts = {}) {
    if (!shots) return;
    for (const e of this.list) {
      if (!e.alive) continue;
      // 传 e 作为 targetRef：魔理沙的穿透弹靠它保证对同一个敌人只结算一次伤害
      const hit = shots.hitRect(e.x, e.y, e.w, e.h, (dmg, hx, hy) => {
        e.hp -= dmg;
        e.hitFlash = 0.12;
        fx?.sparkle(hx, hy, e.colors.wing);
        // 只有真正命中才回调（Stage 侧转成 shotHit 音效）
        opts.onHit?.(dmg, hx, hy);
      }, e);
      if (hit) {
        if (e.hp <= 0) this._kill(e, fx, opts);
        else fx?.burst(e.x + e.w / 2, e.y + e.h / 2, e.colors.wing, 4, 140);
      }
    }
  }

  /** 半径内伤害（符卡） */
  damageArea(x, y, r, dmg, fx, opts = {}) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      if (Math.hypot(cx - x, cy - y) <= r && Math.hypot(cx - x, cy - y) <= r) {
        e.hp -= dmg;
        if (e.hp <= 0) this._kill(e, fx, opts);
      }
    }
  }

  aliveCount() {
    return this.list.filter((e) => e.alive).length;
  }

  /** 绘制（世界坐标系，已应用相机） */
  draw(ctx, cam) {
    for (const e of this.list) {
      const alpha = e.alive ? 1 : Math.max(0, 1 - e.deadT / 0.5);
      if (alpha <= 0) continue;
      // 视野剔除
      if (cam) {
        const sx = e.x - cam.x;
        const sy = e.y - cam.y;
        if (sx < -120 || sx > 1400 || sy < -120 || sy > 840) continue;
      }
      this._drawFairy(ctx, e, alpha);
    }
  }

  _drawFairy(ctx, e, alpha) {
    if (typeof document === 'undefined') return;
    const dead0 = e.alive ? 0 : Math.min(1, e.deadT / 0.5);

    // AI 妖精素材（两类共用同一张图，配色靠光环区分）
    const aiOpts = {
      colorKey: e.colorKey,
      t: e.animTime,
      alpha,
      facing: e.facing,
      dead: dead0,
      flash: e.hitFlash > 0 ? Math.min(1, e.hitFlash / 0.12) * 0.62 : 0,
      size: e.size || 42,
    };
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    if (drawGenFairy(ctx, aiOpts)) {
      // 附加装饰：御币 / 蛛网 / 蝶群 / 提灯 / 魔法阵（在妖精本体之后画）
      this._drawKindDecor(ctx, e, alpha);
      ctx.restore();
      return;
    }
    ctx.restore();

    // 素材未就绪：只留一团该色柔光占位，绝不画程序化人物
    const c = e.colors || FAIRY_COLORS[e.colorKey] || FAIRY_COLORS.blue;
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.globalAlpha = alpha * 0.55;
    ctx.globalCompositeOperation = 'lighter';
    const r = (e.size || 42) * 0.5;
    const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
    g.addColorStop(0, rgba(c.glow, 0.5));
    g.addColorStop(1, rgba(c.glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 扩展杂兵的附加装饰（画在 AI 妖精本体之后）。
   * 原点 = 包围盒中心；AI 图未镜像，这里按 facing 补一次。
   */
  _drawKindDecor(ctx, e, alpha) {
    if (e.kind === 'fairy' || e.kind === 'flyer') return;
    const t = e.animTime;
    const c = e.colors;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (e.facing < 0) ctx.scale(-1, 1);

    if (e.kind === 'lancer') {
      // 御币：木柄 + 两串白色纸垂，蓄力时纸垂被风带起（神主做法事的道具）
      const wind = e.state === 'wind' ? 1 : e.state === 'charge' ? 1.35 : 0;
      const bx0 = -e.w * 0.36;
      const by0 = e.h * 0.30;
      const bx1 = e.w * 0.40 + wind * 5;
      const by1 = -e.h * 0.12 - wind * 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(c.deep, 0.92);
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx0, by0);
      ctx.lineTo(bx1, by1);
      ctx.stroke();
      // 纸垂：两条从柄端垂下的折线，末端随动作轻摆
      ctx.strokeStyle = 'rgba(255,250,240,0.92)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        const sway = Math.sin(t * 3 + k * 1.7) * (1.2 + wind * 1.8);
        const sx = bx1 - 3 - k * 4;
        const sy = by1 + 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        for (let s = 0; s < 3; s++) {
          ctx.lineTo(sx + (s % 2 ? 2.4 : -2.4) + sway * (s + 1) * 0.12, sy + 3 + s * 3.4);
        }
        ctx.stroke();
      }
      // 蓄力时纸垂顶端亮起一抹巫女神乐的白光
      if (wind > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(c.hot, 0.25 + wind * 0.28);
        ctx.beginPath();
        ctx.arc(bx1, by1, 3 + wind * 2.5, 0, TAU);
        ctx.fill();
      }
    } else if (e.kind === 'weaver') {
      // 蛛网：两层缓慢反向旋转的椭圆，再补四条土蜘蛛的细腿与露珠
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(c.wing, 0.5);
      ctx.lineWidth = 1.1;
      for (let k = 0; k < 2; k++) {
        ctx.save();
        ctx.rotate(t * 0.9 * (k ? -1 : 1) + k * 0.7);
        ctx.beginPath();
        ctx.ellipse(0, 0, e.w * 0.85, e.h * 0.52, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      // 露珠：网上挂着的四颗小光点
      for (let k = 0; k < 4; k++) {
        const a = t * 0.6 + (k * TAU) / 4;
        ctx.fillStyle = rgba(c.hot, 0.5 + 0.25 * Math.sin(t * 4 + k));
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.w * 0.62, Math.sin(a) * e.h * 0.4, 1.1, 0, TAU);
        ctx.fill();
      }
      // 蛛腿：本体左右的四根折线，不抢妖精剪影
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgba(c.deep, 0.75);
      ctx.lineWidth = 1.1;
      for (let k = 0; k < 4; k++) {
        const side = k < 2 ? -1 : 1;
        const yy = (k % 2 ? 1 : -1) * 3;
        ctx.beginPath();
        ctx.moveTo(side * e.w * 0.18, yy);
        ctx.lineTo(side * e.w * 0.5, yy - 7);
        ctx.lineTo(side * e.w * 0.6, yy - 2);
        ctx.stroke();
      }
    } else if (e.kind === 'spreader') {
      // 蝶妖精：三只小蝶绕身飞舞，四翼开合、鳞粉发亮（描边保证在亮暗背景上都读得出）
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const a = t * 2.0 + (k * TAU) / 3;
        const dx = Math.cos(a) * e.w * 0.86;
        const dy = Math.sin(a) * e.w * 0.58;
        const flap = 0.45 + 0.55 * Math.abs(Math.sin(t * 6.5 + k * 2));
        const s = 4.4;
        const tilt = Math.sin(t * 3.4 + k) * 0.25;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(tilt);
        // 鳞粉光晕
        ctx.fillStyle = rgba(c.glow, 0.16);
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, TAU);
        ctx.fill();
        // 四翼：上大下小，翼根分开，深色描边勾出蝶形剪影
        ctx.fillStyle = rgba(c.wing, 0.8);
        ctx.strokeStyle = rgba(c.deep, 0.85);
        ctx.lineWidth = 0.9;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(sgn * s * 1.02 * flap, -1.2, s * 0.72 * flap, s * 0.98, sgn * (0.5 + tilt), 0, TAU);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(sgn * s * 0.82 * flap, 2.4, s * 0.48 * flap, s * 0.6, sgn * (0.24 + tilt), 0, TAU);
          ctx.fill();
          ctx.stroke();
        }
        // 身体与触角
        ctx.fillStyle = rgba(c.deep, 0.95);
        ctx.beginPath();
        ctx.ellipse(0, 0.6, 0.75, 3.4, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(c.hot, 0.85);
        ctx.beginPath();
        ctx.ellipse(0, -1.6, 0.6, 1.2, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba(c.deep, 0.75);
        ctx.lineWidth = 0.6;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, -2.4);
          ctx.quadraticCurveTo(sgn * 1.4, -3.9, sgn * 2.5, -4.4);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (e.kind === 'bomber') {
      // 提灯妖精：身下悬一盏竹骨纸提灯，落弹前灯里的鬼火会亮起来
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      const bx = Math.sin(t * 2.2) * 2.5;
      const by = e.h * 0.52;
      // 灯绳
      ctx.strokeStyle = rgba(c.deep, 0.85);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.quadraticCurveTo(bx * 0.5, by * 0.5, bx, by - 8.5);
      ctx.stroke();
      // 纸罩（由深到浅三层，不新建渐变）
      ctx.save();
      ctx.translate(bx, by);
      ctx.fillStyle = rgba(c.deep, 0.9);
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 8.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(198,96,74,0.92)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.8, 7.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(255,206,140,${0.55 + pulse * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(0, 0.4, 3.2, 4.6, 0, 0, TAU);
      ctx.fill();
      // 竹骨横箍
      ctx.strokeStyle = rgba(c.deep, 0.5);
      ctx.lineWidth = 0.8;
      for (let s = -1; s <= 1; s++) {
        ctx.beginPath();
        ctx.ellipse(0, s * 2.6, 6.6, 1.2, 0, 0, TAU);
        ctx.stroke();
      }
      // 上下木盖
      ctx.fillStyle = rgba(c.deep, 0.95);
      ctx.fillRect(-3.4, -9.8, 6.8, 1.8);
      ctx.fillRect(-3.4, 8.0, 6.8, 1.8);
      // 鬼火内焰
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,238,178,${0.32 + pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(0, 0.5, 2.6 + pulse * 1.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else if (e.kind === 'spinner') {
      // 魔法妖精：脚下一圈星之魔法阵，四颗星点反向绕行
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(c.wing, 0.42);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, e.w * 0.62, t * 2.4, t * 2.4 + Math.PI * 1.35);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = t * 3.1 + (k * TAU) / 4;
        ctx.fillStyle = rgba(c.hot, 0.7);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * e.w * 0.64, Math.sin(a) * e.w * 0.64 * 0.7, 2.2, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();
  }

}
