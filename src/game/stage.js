/**
 * 单关运行器：把引擎、关卡数据、玩家、敌人、Boss、弹幕串起来。
 *
 * 两种模式：
 *  - platform：横版跳跃，走到关卡末尾触发 Boss
 *  - stg：横向卷轴弹幕，滚动到末尾触发 Boss
 *
 * 事件通过 onEvent(type, data) 回报给上层 Game：
 *  'death' | 'gameover' | 'checkpoint' | 'bossStart' | 'bossPhase' | 'clear' | 'coin' | 'power'
 */
import { Level, BRICK, EMPTY } from './level.js';
import { Player, TUNE } from './player.js';
import { Camera } from './camera.js';
import { Fx } from './fx.js';
import { BulletPool } from './bullets.js';
import { PlayerShots } from './playerShots.js';
import { EnemyManager } from './enemies.js';
import { Boss } from './boss.js';
import { getDifficulty, enemyStageDensityOf } from './difficulty.js';
import { scalePlayerDamage } from './balance.js';
import { StgPlayer, StgStage } from './stg.js';
import { POWER, powerLevel, cardClearPower, cardNoHitPower } from './power.js';
import { drawSky, drawParallax, drawTiles, drawAmbient } from '../art/scenes.js';
// 符卡表现层：卡面叠加（屏幕空间）与逐卡玩家效果，只有纯函数、不反向 import stage，
// 所以这里静态引入不会形成循环依赖（docs/BOSS_TIMING_SPEC.md §3.4）。
import { drawCardFx } from './cardfx.js';
import { updateCardEffect } from './cardEffects.js';

/**
 * EXTRA 关的时间轴（秒）。
 *
 * EXTRA 不再是「一进关就开打」的快速 Boss 战，而是一条完整的道中：
 *   0:00 ─ 2:00   零火力起手的长道中 A（敌机波次一路铺到 2 分钟）
 *   2:00          雷米莉亚当中途 Boss 拦路（两张符卡，不打通进不去）
 *   2:00 ─ 3:00   击破后道中 B 继续推进（1 分钟收束段）
 *   3:00          芙兰朵露登场收尾
 * 道中合计 3:00，叠上中途 Boss 约 2 分钟的实际战斗，
 * 手感到芙兰登场大约是 5 分钟，随后是约 10 分钟的芙兰战。
 * 计时只在「可以操作道中」时推进：Boss 战、对话、死亡都暂停，
 * 所以中途 Boss 打多久都不会把后面的节奏挤掉。
 */
export const EXTRA_TIMELINE = Object.freeze({
  midbossKey: 'remilia', // 中途 Boss 的键：时间轴与「再战」共用，别两处写死
  midbossAt: 120,   // 2:00 雷米莉亚
  finalAt: 180,     // 3:00 芙兰登场（中途 Boss 击破后还有 1 分钟道中）
  retryPower: 48,   // 中途 / 终盘再战时的起手火力（Lv.4 起手，别让复习从零开始）
});

/* ------------------------------------------------------------------
 * 每关的厚涂背景图（src/art/gen/bg/<theme>.jpg）
 * 程序化场景作为 fallback，图片加载完成后优先使用。
 * 图片 2048x1152 (16:9)，按屏幕 cover 裁切 + 随关卡进度横移，形成纵深。
 * ------------------------------------------------------------------ */
/**
 * 每套背景实际有几张：<theme>.jpg、<theme>_2.jpg ……目前全套都是 2 张。
 * 以前是「一直探到第 3 张、靠 404 判断缺图」，静态托管下每次进关都会在控制台
 * 留一条 404。这里显式写死张数：加新变体时把对应数字 +1 即可。
 */
const BG_VARIANTS = {
  shrine: 2,
  forest: 2,
  lake: 2,
  mountain: 2,
  nether: 2,
  moon: 2,
  mansion: 2,
};
const BG_VARIANTS_DEFAULT = 2;
const _bgCache = new Map();

function _bgEntry(theme, idx) {
  const key = idx > 0 ? theme + '_' + (idx + 1) : theme;
  let e = _bgCache.get(key);
  if (e) return e;
  e = { img: typeof Image !== 'undefined' ? new Image() : null, ok: false, failed: false, idx };
  if (e.img) {
    e.img.onload = () => { e.ok = true; };
    e.img.onerror = () => { e.failed = true; };
    e.img.src = new URL('../art/gen/bg/' + key + '.jpg', import.meta.url).href;
  } else {
    e.failed = true;
  }
  _bgCache.set(key, e);
  return e;
}

function _bgFor(theme) {
  // 只请求确实存在的变体；加载中的变体由调用方按 e.ok 过滤
  const n = BG_VARIANTS[theme] || BG_VARIANTS_DEFAULT;
  const list = [];
  for (let i = 0; i < n; i++) list.push(_bgEntry(theme, i));
  return list;
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* 厚涂背景曝光标定：[变体0, 变体1] 的整层亮度乘数。
 * 七面背景原图本身明暗差异巨大（整图均值 34.9 ~ 179.9），靠固定
 * saturate/contrast/brightness(0.94) 压不平；这里按面 + 变体做一次预合成后
 * 的整体曝光乘数，使各面中心区平均亮度统一到 76±5（0–255，L=0.299R+0.587G+0.114B）。
 * 变体 0 对应关卡前段（约 10%），变体 1 对应后段（约 85%），交叉淡入在 40%–55%。
 * 数值由 tools/_pt_bgshot.mjs + tools/_pt_luma.py 实测标定（见 _pt/bg/）。 */
const BG_EXPOSURE = {
  shrine:   [0.691, 1.352],
  forest:   [1.877, 2.559],
  lake:     [0.381, 0.707],
  mountain: [0.529, 0.772],
  nether:   [0.717, 1.026],
  moon:     [0.416, 0.426],
  mansion:  [1.860, 1.996],
};

/** 每关随进度漂移的目标色调：[r,g,b 色串, 末段强度] */
const TIME_SHIFT = {
  shrine:   ['#1a1240', 0.30],
  forest:   ['#04161c', 0.22],
  lake:     ['#ffd2a8', 0.16],
  mountain: ['#ff8a4c', 0.17],
  nether:   ['#2a0838', 0.24],
  moon:     ['#141a46', 0.14],
  mansion:  ['#3c0418', 0.22],
};

export const VIEW_W = 1280;
export const VIEW_H = 720;

// 前景剪影层按主题全局缓存（烘焙一次、整局复用）：见 _fgBake
const FG_LAYERS = new Map();

// 符卡卡面暗幕的「玩家亮区半径」（px）：spec §3.4 要求 darkSpot 在玩家周围留 150–180px 亮区。
// 注意 cardfx.js 里 playerR 是亮区半径（r1 ≈ 2.5×，做柔边），不是判定半径，
// 所以这里不能用 playerHitPoint.r（只有几像素，会把整屏糊黑）。
const CARD_FX_LIGHT_R = 168;

// 「萤火虫之夜」黑暗处是否连 Boss/敌弹/自机弹一起藏掉（用户 2026-10-21 要求：黑暗处不可见）。
// 改成 false 就退回旧行为：暗幕只压世界层，Boss 与弹幕始终可见（可读性优先）。
const DARKSPOT_HIDE_ENTITIES = true;

/* ---------- 离屏精灵：拾取物 / 检查点（零图片，运行时只 drawImage） ---------- */
const _spriteCache = new Map();
function bakeSprite(key, w, h, paint) {
  let c = _spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'));
    _spriteCache.set(key, c);
  }
  return c;
}

/** 灵玉外晕：粉白柔光 */
function orbGlow() {
  return bakeSprite('orbGlowGold', 64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    r.addColorStop(0, 'rgba(255, 240, 190, 0.62)');
    r.addColorStop(0.38, 'rgba(255, 196, 92, 0.26)');
    r.addColorStop(1, 'rgba(255, 160, 40, 0)');
    g.fillStyle = r;
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
  });
}

/** 灵玉本体：白热核心 + 樱花内芯 + 细环 */
function orbBody() {
  return bakeSprite('orbBodyStar', 44, 44, (g) => {
    const cx = 22;
    const cy = 22;

    // 四角星形（灵力的结晶）：外尖角 + 内凹
    const star = (outer, inner) => {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    };

    // 深色描边打底，保证在任何背景上都有轮廓
    star(14.5, 4.6);
    g.fillStyle = '#5a3008';
    g.fill();

    // 金色渐变主体（左上受光）
    const bg = g.createLinearGradient(cx - 11, cy - 12, cx + 10, cy + 12);
    bg.addColorStop(0, '#fffdf0');
    bg.addColorStop(0.34, '#ffe9a8');
    bg.addColorStop(0.68, '#ffc446');
    bg.addColorStop(1, '#e08a1c');
    star(12.6, 3.9);
    g.fillStyle = bg;
    g.fill();

    // 中心白热核
    const core = g.createRadialGradient(cx - 1, cy - 2, 0.5, cx, cy, 5.2);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.55, 'rgba(255, 250, 220, 0.92)');
    core.addColorStop(1, 'rgba(255, 226, 150, 0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(cx, cy, 5.2, 0, Math.PI * 2);
    g.fill();

    // 左上高光弧
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(cx - 1, cy - 1.5, 7.6, Math.PI * 0.95, Math.PI * 1.45);
    g.stroke();
  });
}

/** 符札冷光 */
function ofudaGlow() {
  return bakeSprite('ofudaGlow', 64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 3, 32, 32, 31);
    r.addColorStop(0, 'rgba(150, 236, 255, 0.52)');
    r.addColorStop(0.45, 'rgba(90, 200, 255, 0.18)');
    r.addColorStop(1, 'rgba(70, 180, 255, 0)');
    g.fillStyle = r;
    g.beginPath();
    g.arc(32, 32, 31, 0, Math.PI * 2);
    g.fill();
  });
}

/** P 点符札：白纸 + 朱印 + 蓝 P */
function ofudaPaper() {
  return bakeSprite('ofudaPaper', 36, 50, (g) => {
    const x = 6;
    const y = 3;
    const w = 24;
    const h = 44;
    const pg = g.createLinearGradient(x, 0, x + w, 0);
    pg.addColorStop(0, '#fffdf2');
    pg.addColorStop(0.5, '#f4ecd6');
    pg.addColorStop(1, '#ded2b8');
    g.fillStyle = pg;
    g.beginPath();
    g.roundRect(x, y, w, h, 1.5);
    g.fill();
    g.strokeStyle = 'rgba(150, 60, 70, 0.55)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = 'rgba(196, 52, 62, 0.85)';
    g.fillRect(x, y, w, 3);
    g.fillRect(x, y + h - 3, w, 3);
    g.fillStyle = '#2f8fd0';
    g.font = 'bold 17px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('P', x + w / 2, y + h / 2);
    g.fillStyle = 'rgba(255, 255, 255, 0.55)';
    g.fillRect(x + 2, y + 6, 2.5, h - 14);
  });
}

/** 1UP 光环：粉色柔光（和金币金晕、P 点蓝晕一眼分得开） */
function oneupGlow() {
  return bakeSprite('oneupGlow', 72, 72, (g) => {
    const r = g.createRadialGradient(36, 36, 3, 36, 36, 35);
    r.addColorStop(0, 'rgba(255, 214, 240, 0.62)');
    r.addColorStop(0.42, 'rgba(255, 120, 200, 0.24)');
    r.addColorStop(1, 'rgba(230, 60, 160, 0)');
    g.fillStyle = r;
    g.beginPath();
    g.arc(36, 36, 35, 0, Math.PI * 2);
    g.fill();
  });
}

/**
 * 1UP 掉落图：粉红「残机之证」徽章（1UP 字样 + 白环 + 心跳光晕）。
 *
 * 掉落图和 P 点符札完全分开：P 点是蓝白纸符札（竖条），1UP 是圆徽章、粉红光、
 * 带心跳式脉冲——玩家在弹幕里扫一眼就知道这是「命」而不是火力。
 * 徽章内部只放「1UP」三个字母：之前在里面塞小白心，撑到 30px 显示时心会压住字，
 * 远看只剩一团粉色，所以改成「字最大、装饰最小」。
 */
function oneupBadge() {
  return bakeSprite('oneupBadge', 48, 48, (g) => {
    const cx = 24;
    const cy = 24;
    // 深洋红描边打底，任何背景上都有轮廓
    g.beginPath();
    g.arc(cx, cy, 17.4, 0, Math.PI * 2);
    g.fillStyle = '#4a0f2c';
    g.fill();
    // 徽章主体：上亮下深的粉红渐变
    const bg = g.createLinearGradient(cx, cy - 15, cx, cy + 15);
    bg.addColorStop(0, '#fff0f8');
    bg.addColorStop(0.32, '#ff9dd4');
    bg.addColorStop(0.72, '#f24aa4');
    bg.addColorStop(1, '#b81f74');
    g.beginPath();
    g.arc(cx, cy, 15.2, 0, Math.PI * 2);
    g.fillStyle = bg;
    g.fill();
    // 内圈白环
    g.beginPath();
    g.arc(cx, cy, 12.6, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    g.lineWidth = 1.3;
    g.stroke();
    // 1UP 字样（粗描边 + 实心：缩到 34px 也读得出来）
    g.font = 'bold 12px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 2.8;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(74, 15, 44, 0.95)';
    g.strokeText('1UP', cx, cy + 1.2);
    g.fillStyle = '#fffdf7';
    g.fillText('1UP', cx, cy + 1.2);
    // 左上高光弧
    g.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(cx - 0.8, cy - 0.8, 10.2, Math.PI * 0.9, Math.PI * 1.36);
    g.stroke();
  });
}

/** 检查点：石灯籠（未点亮 / 已点亮） */
function lanternSprite(on) {
  return bakeSprite(on ? 'lanternOn' : 'lanternOff', 48, 96, (g) => {
    const cx = 24;
    const stone = on ? '#3b3550' : '#272232';
    const stoneLight = on ? '#585074' : '#3a3448';
    // 底座
    g.fillStyle = stone;
    g.fillRect(cx - 13, 84, 26, 8);
    g.fillStyle = stoneLight;
    g.fillRect(cx - 10, 80, 20, 6);
    // 柱
    g.fillStyle = stone;
    g.fillRect(cx - 5, 46, 10, 36);
    g.fillStyle = stoneLight;
    g.fillRect(cx - 5, 46, 3, 36);
    // 中台
    g.fillStyle = stone;
    g.beginPath();
    g.moveTo(cx - 14, 46);
    g.lineTo(cx + 14, 46);
    g.lineTo(cx + 10, 40);
    g.lineTo(cx - 10, 40);
    g.closePath();
    g.fill();
    // 火袋
    g.fillStyle = on ? '#2c2438' : '#1c1826';
    g.beginPath();
    g.moveTo(cx - 11, 40);
    g.lineTo(cx - 7, 20);
    g.lineTo(cx + 7, 20);
    g.lineTo(cx + 11, 40);
    g.closePath();
    g.fill();
    // 火口
    if (on) {
      g.fillStyle = '#ffcf8a';
      g.fillRect(cx - 5, 26, 10, 10);
      g.fillStyle = 'rgba(255, 255, 235, 0.9)';
      g.fillRect(cx - 2.5, 28, 5, 6);
    } else {
      g.fillStyle = '#100d18';
      g.fillRect(cx - 5, 26, 10, 11);
    }
    // 笠
    g.fillStyle = stone;
    g.beginPath();
    g.moveTo(cx - 18, 20);
    g.quadraticCurveTo(cx, 8, cx + 18, 20);
    g.closePath();
    g.fill();
    g.fillStyle = stoneLight;
    g.beginPath();
    g.moveTo(cx - 18, 20);
    g.quadraticCurveTo(cx, 8, cx + 18, 20);
    g.lineTo(cx + 14, 17);
    g.quadraticCurveTo(cx, 7, cx - 14, 17);
    g.closePath();
    g.fill();
    // 宝珠
    g.fillStyle = stoneLight;
    g.beginPath();
    g.arc(cx, 6, 4, 0, Math.PI * 2);
    g.fill();
    // 月光轮廓
    g.strokeStyle = 'rgba(210, 208, 255, 0.22)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx + 18, 20);
    g.quadraticCurveTo(cx, 8, cx - 18, 20);
    g.stroke();
    // 苔痕
    g.fillStyle = 'rgba(60, 92, 66, 0.55)';
    g.fillRect(cx - 13, 84, 8, 3);
    g.fillRect(cx - 10, 80, 5, 2);
  });
}
function lanternOn() {
  return lanternSprite(true);
}
function lanternOff() {
  return lanternSprite(false);
}

export class Stage {
  /**
   * @param {object} opts
   * @param {object} opts.def 关卡定义（LEVELS 里的一项）
   * @param {number} opts.index
   * @param {'reimu'|'marisa'} opts.char
   * @param {number} opts.lives
   * @param {(type:string,data?:any)=>void} opts.onEvent
   */
  constructor(opts) {
    this.def = opts.def;
    this.index = opts.index;
    this.char = opts.char || 'reimu';
    this.onEvent = opts.onEvent || (() => {});

    this.level = new Level(this.def, opts.index);
    this.mode = this.level.mode === 'stg' ? 'stg' : 'platform';
    this.extra = !!this.level.extra;
    // Extra 固定按 EX 隐藏档的强度；主线按玩家选择的难度
    this.difficulty = this.extra ? 'EX' : getDifficulty(opts.difficulty).key;
    this.diff = getDifficulty(this.difficulty);

    this.fx = new Fx();
    this.bullets = new BulletPool();
    this.shots = new PlayerShots();
    this.camera = new Camera(this.level);

    this.t = 0;
    this.time = 0;
    this.state = 'play'; // play | boss | clear | dead
    this.finished = false;

    this.boss = null;
    this.bossStarted = false;
    this.bossPending = false;
    // EXTRA 专用：中途 Boss（雷米莉亚）的排队 / 打完标记 / 时间轴
    this.bossMid = false;
    this.pendingBossKey = null;
    this.pendingBossMid = false;
    this.midbossDone = false;
    // 当前符卡是否被弹 / 落命过（无伤奖励判定）：切卡、开战、intro→battle 时清零
    this._cardDamaged = false;
    // 平台关的中途 Boss（目前只有 STAGE5 的妖梦）：
    // 触发线 / 舞台 / 呼吸区全部来自关卡配置 def.midboss（与 levelgen 共用同一份对象），
    // 引擎里不写死任何 Boss key —— EXTRA 的雷米莉亚走的是下面另一套时间轴。
    this.midbossCfg = this.mode === 'platform' ? (this.def.midboss || null) : null;
    this.pendingBossFromEnd = null; // 下一个 Boss 的登场站位（距关卡右端像素）
    this._midClearX = 0;            // 击破中途 Boss 时的玩家 x：呼吸区的距离基准
    this._midClearT = 0;            // 击破中途 Boss 后的道中计时：呼吸区的时间保险
    this.extraT = 0;
    // 中途 / 终盘再战：跳过已经看过的 Boss 战前对白
    this.skipBossDialogue = false;

    this.pickups = [];
    this.checkpoints = [];
    this.goalX = 0;
    // STG 关没有地形，不生成平台用的金币/符札道具
    if (this.mode !== 'stg') this._buildPickups();

    // 玩家
    if (this.mode === 'stg') {
      this.player = new StgPlayer({ char: this.char, lives: opts.lives || 3, power: opts.power || 0 });
      // 分面密度：2–6 面道中敌机齐射更稀（Extra 传 0 → 1.00）
      this.stg = new StgStage(this.level, this.diff, enemyStageDensityOf(this.extra ? 0 : this.index + 1));
      // EXTRA 的道中要撑满 3 分钟：换成更密、更有节奏起伏的波次表
      if (this.extra) this._buildExtraWaves();
      this.camera.x = 0;
      this.camera.y = 0;
      this.camera.follow = false;
    } else {
      this.player = new Player(this.level, { char: this.char, lives: opts.lives || 3, power: opts.power || 0 });
      this._safeSpot = { x: this.player.x, y: this.player.y };
      this.enemies = new EnemyManager(this.level, {
        difficulty: this.diff.enemyDifficulty,
        diff: this.diff,
        stageDensity: enemyStageDensityOf(this.extra ? 0 : this.index + 1),
      });
      this.camera.snapTo(this.player.x + this.player.w / 2);
    }

    this.castFx = 0;
    // 1UP 累计：拾取的 POWER 每满 99 点 → 恢复 1 条残机，清零后继续循环。
    // 进出关卡时由 main.js 带着走，跨关不清零（否则 99 点永远攒不满）。
    // 擦弹会以 0.02 的粒度推进这个计数，所以上限只保证「小于 99」而不是截到整数 98
    this.extendPts = Math.max(0, Math.min(POWER.extend - 1e-6, Number(opts.extendPts) || 0));
    this.extendCount = 0;
    // 上一帧施加过的符卡玩家效果键：Boss 退场/切出时用它补一次 'none' 复位，
    // 避免移速类修饰残留到下一张卡或结算之后（见 update() 里的调用）。
    this._cardEffectKey = null;
    this.deathT = 0; // 死亡→复活倒计时（用逻辑帧计时，暂停/切后台时冻结）

    // 崩落砖：0 待机 / 1 抖动（踩上 0.5s 后塌）/ 2 消失（3s 后复原）
    this.crumbleTiles = this.mode === 'platform'
      ? (this.level.crumble || []).map((c) => ({ ...c, state: 0, t: 0 }))
      : [];
  }

  /** 崩落砖：踩上去抖一下，随后塌掉，过几秒复原；复活时全部复原 */
  _updateCrumble(dt) {
    const p = this.player;
    const feet = p.y + p.h;
    for (const c of this.crumbleTiles) {
      if (c.state === 2) {
        c.t -= dt;
        if (c.t <= 0) {
          // 玩家还压在砖的位置上就晚点复原，避免把人顶进地形
          const overlap = p.x + p.w > c.x + 2 && p.x < c.x + 30 && p.y < c.y + 32 && feet > c.y;
          if (overlap) c.t = 0.4;
          else {
            this.level.setTile(c.cx, c.cy, BRICK);
            c.state = 0;
          }
        }
        continue;
      }
      const onIt = Math.abs(feet - c.y) < 6 && p.vy >= -1
        && p.x + p.w > c.x + 2 && p.x < c.x + 30;
      if (c.state === 0) {
        if (onIt) { c.state = 1; c.t = 0.5; }
      } else {
        if (!onIt) { c.state = 0; c.t = 0; continue; }
        c.t -= dt;
        if (c.t <= 0) {
          this.level.setTile(c.cx, c.cy, EMPTY);
          c.state = 2;
          c.t = 3.2;
          this.fx.landDust(c.x + 16, c.y + 6, '#c9a06a');
          this.fx.shockwave(c.x + 16, c.y + 16, '#c9a06a', 6, 180, 0.25);
        }
      }
    }
  }

  _resetCrumble() {
    for (const c of this.crumbleTiles) {
      this.level.setTile(c.cx, c.cy, BRICK);
      c.state = 0;
      c.t = 0;
    }
  }

  _buildPickups() {
    for (const e of this.level.entities) {
      if (e.type === 'coin') {
        this.pickups.push({ kind: 'coin', x: e.x + 16, y: e.y + 16, taken: false, t: Math.random() * 6 });
      } else if (e.type === 'power') {
        this.pickups.push({ kind: 'power', x: e.x + 16, y: e.y + 16, taken: false, t: Math.random() * 6 });
      } else if (e.type === 'life') {
        // 1UP：有自己的掉落图（见 _drawPickups 的 oneup 分支），和蓝色 P 符札区分开
        this.pickups.push({ kind: 'oneup', x: e.x + 16, y: e.y + 16, taken: false, t: Math.random() * 6 });
      } else if (e.type === 'checkpoint') {
        this.checkpoints.push({ x: e.x + 16, y: e.y + 32, active: false });
      } else if (e.type === 'goal') {
        this.goalX = e.x + 16;
      }
    }
    if (!this.goalX) this.goalX = this.level.w - 300;
  }

  get playerHitPoint() {
    // 平台关与飞行关各自在自己的 player 上算，绘制与碰撞共用同一份位置
    return this.player.hitPoint;
  }

  /**
   * 灵梦追踪弹的候选目标：Boss 与杂兵一视同仁，全部塞进同一个数组，
   * 由 PlayerShots 自己挑最近的。ref 是目标本体（命中判定 / 去重都靠它）。
   * 每帧重建，元素是临时对象，不会留下引用。
   */
  _shotTargets() {
    const out = [];
    if (this.mode === 'stg') {
      const list = this.stg?.enemies;
      if (list) {
        for (const e of list) {
          if (!e.alive) continue;
          out.push({ ref: e, x: e.x, y: e.y });
        }
      }
    } else if (this.enemies) {
      for (const e of this.enemies.list) {
        if (!e.alive) continue;
        out.push({ ref: e, x: e.x + e.w / 2, y: e.y + e.h / 2 });
      }
    }
    const b = this.boss;
    if (b && b.state === 'battle') {
      // 命中体集中在 y-hh..y（hh = h*0.78），取它的几何中心当追踪点
      out.push({ ref: b, x: b.x, y: b.y - b.h * 0.39 });
    }
    return out;
  }

  /* ============================================================
     更新
     ============================================================ */

  update(dt, input) {
    if (this.state === 'clear') return;
    // 死亡→复活改用逻辑时钟：旧的 setTimeout 会把「复活」插在两次逻辑帧之间，
    // 暂停或切后台时还会与真实时间脱节，导致复活瞬间相机/弹幕清空不同步。
    if (this.state === 'dead' && this.deathT > 0) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        this._respawn();
        return;
      }
    }
    this.t += dt;
    if (this.state === 'play') this.time += dt;
    // 符卡屏幕染色的余韵，和 DOM cut-in 一起淡出
    if (this.castFx > 0) this.castFx = Math.max(0, this.castFx - dt * 1.05);
    this.camera.beginStep();

    const p = this.player;
    p.shootCd = Math.max(0, (p.shootCd || 0) - dt);

    // 逐卡玩家效果（docs/BOSS_TIMING_SPEC.md §3.3）：必须在本帧玩家移动之前施加，
    // 否则移速/判定半径这类修饰会晚一帧生效。effect 只在当前符卡内有效：
    // battle 期间每帧推进（空键传 'none'，让实现有机会把上一张卡的修饰复位），
    // Boss 不在 battle 时若之前施加过效果，补一帧 'none' 收尾。
    const cardEff = this.boss
      ? (this.boss.state === 'battle' ? (this.boss.cardEffect || 'none') : null)
      : null;
    if (cardEff) {
      updateCardEffect(p, cardEff, dt);
      this._cardEffectKey = cardEff;
    } else if (this._cardEffectKey) {
      updateCardEffect(p, 'none', dt);
      this._cardEffectKey = null;
    }

    // 符卡：输入与 POWER 扣除由玩家类处理（Player / StgPlayer 都会 emit 'cast'），
    // 这里只负责在收到事件后清弹幕、结算伤害，避免同一次按键被扣两次 POWER。

    if (this.mode === 'stg') {
      this._updateStg(dt, input);
    } else {
      this._updatePlatform(dt, input);
      this._updateCrumble(dt);
    }

    // 玩家事件
    for (const ev of p.drainEvents()) this._onPlayerEvent(ev);

    // 弹幕
    const hp = this.playerHitPoint;
    this.bullets.update(dt, { x: hp.x, y: hp.y }, { x: 0, y: 0, w: this.level.w, h: this.level.h });

    // 玩家被弹命中
    if (p.alive && p.invuln <= 0) {
      const hit = this.bullets.hitTest(hp.x, hp.y, hp.r);
      if (hit) {
        this.fx.burst(hit.x, hit.y, hit.color, 10, 260);
        hit.active = false;
        p.hurt(hit.x < hp.x ? -1 : 1);
      }
      if (this.mode === 'stg') {
        // 擦弹：POWER 收益照旧，但 1UP 进度只加 0.02 点 / 颗（99 点 = 1 命）。
        // 注意 _addPower 默认会把入账量也计入 1UP，这里传 false 避免 0.075 POWER 再叠一次。
        const g = this.bullets.grazeTest(hp.x, hp.y, hp.r, 26);
        if (g > 0) {
          this._addPower(g * POWER.graze, false);
          this._addExtend(g * POWER.grazePoints);
        }
      }
    }

    // 玩家子弹（第三参是追踪目标表，灵梦的御札会就近拐弯）
    this.shots.update(dt, { w: this.level.w, h: this.level.h }, this._shotTargets());
    if (this.mode === 'platform' && this.enemies) {
      this.enemies.damageWithShots(this.shots, this.fx, {
        onHit: () => this.onEvent('shotHit'),
        onKill: () => {
          this._addPower(POWER.kill);
          this.onEvent('enemyKill');
        },
      });
    }
    if (this.boss) {
      // 第三参是命中回调：Boss 中弹的专属音效
      this.boss.damageWithShots(this.shots, this.fx, () => this.onEvent('bossHit'));
    }

    // Boss
    if (this.boss) {
      const before = this.boss.state;
      this.boss.update(dt, p, this.bullets, this.fx, {
        onPhase: (i, name) => {
          // 切到下一张符卡：上一张的无伤判定到此为止（首卡由下面的 intro→battle 负责）
          this._cardDamaged = false;
          this.camera.shake(14, 0.4);
          this.onEvent('bossPhase', { phase: i, name });
        },
        // 限时符卡结算（spec §3.2）：Boss 在「血条打空 / 生存到点」时回调一次，
        // 只报结果不碰奖励；POWER/残机/1UP 记账统一在 stage 侧完成。
        onCardResult: (res) => this._onBossCardResult(res),
      });
      // 首张符卡开始：intro 演出期间的受击不算进无伤；之后每张卡由 onPhase 清零。
      if (before !== 'battle' && this.boss.state === 'battle') this._cardDamaged = false;
      if (this.bossMid) {
        // 中途 Boss 被击破：不算过关，清场后继续推道中
        if (this.boss.state === 'dead') this._onMidbossDefeated();
      } else if (before !== 'dead' && this.boss.state === 'dead') {
        this._onBossDefeated();
      }
      // 中途 Boss 被击破后 this.boss 已经置空（平台关此前没有这个时序，EXTRA 是 STG 不走到这些分支），
      // 所以下面所有「撞 Boss / 踩头 / 破势」的互动都必须再加一次 this.boss 判定。
      // 冲刺撞 Boss
      if (this.mode === 'platform' && this.boss && p.dashing) {
        if (this.boss.hitByDash(p, this.fx)) {
          this.camera.shake(8, 0.2);
          this.onEvent('bossHit');
        }
      }
      // 平台关：从上方踩 Boss 头顶（STG 关没有平台跳跃，不启用）
      if (this.mode === 'platform' && this.boss && p.alive && this.boss.stompBy(p, this.fx)) {
        this.camera.shake(10, 0.25);
        this.onEvent('bossStomp');
      }
      // 平台关：破势打满 / 俯冲落地的演出反馈（音效 + 震屏）
      if (this.mode === 'platform' && this.boss) {
        if (this._seenStagger !== this.boss.staggerCount) {
          this._seenStagger = this.boss.staggerCount;
          this.camera.shake(12, 0.35);
          this.onEvent('bossStagger');
        }
        const ds = this.boss._dive ? this.boss._dive.state : 'idle';
        if (ds !== this._seenDive) {
          if (ds === 'land') {
            this.camera.shake(14, 0.3);
            this.onEvent('bossDiveLand');
          }
          this._seenDive = ds;
        }
      }
    }

    this.fx.update(dt);
    this._updateCamera(dt);

    // 环境粒子
    this._ambientTick(dt);

    if (input.down('shoot')) this._tryShoot(input);
  }

  /**
   * 平台关的 Boss 触发判定（一关两场：道中 midboss → 呼吸区 → 关底）。
   *
   * ① 中途 Boss：关卡 def.midboss 存在且尚未击破，越过 `w - triggerFromEnd` 就排队；
   * ② 呼吸区：中途 Boss 击破后，玩家必须先离开击破点 `breathDist` 像素、
   *    且道中时间过 `breathSec` 秒（距离 + 时间双保险，避免击破瞬间就被下一场对话接走）；
   * ③ 关底 Boss：沿用原来的手感 —— 触发线 = min(终点旗前 120px, Boss 前 420px)。
   *
   * 全部位置从关卡配置推导，引擎不认 Boss key（EXTRA 的雷米莉亚走另一套时间轴）。
   *
   * @param {number} px 玩家中心 x
   * @returns {{key:string|null, mid:boolean}|null} 本帧被排队的 Boss，null = 不触发
   */
  _checkPlatformBossTrigger(px) {
    if (this.bossStarted || this.bossPending || this.state !== 'play') return null;
    const cfg = this.midbossCfg;

    // ① 道中 → 中途 Boss
    if (cfg && !this.midbossDone) {
      if (px > this.level.w - (cfg.triggerFromEnd || 5400)) {
        return this._queueBoss(cfg.key || null, true, cfg.arenaFromEnd || 520);
      }
      return null; // 中途 Boss 没打掉之前，关底不参与判定
    }

    // ② 击破中途 Boss 后的呼吸区
    if (cfg) {
      const walked = px - this._midClearX;
      if (walked < (cfg.breathDist || 0) || this._midClearT < (cfg.breathSec || 0)) return null;
    }

    // ③ 关底 Boss：触发线贴着 Boss 场地，保证 Boss 出现时就在视野里
    const bossX = this.level.w - 520;
    const triggerX = Math.max(200, Math.min(this.goalX - 120, bossX - 420));
    if (px > triggerX) return this._queueBoss(this.level.boss || null, false, 520);
    return null;
  }

  /**
   * 排队一场 Boss 战并落地检查点。
   * bossPending 期间会挡住重复触发；真正的登场在 Game 播完战前对话后调 beginBoss()。
   *
   * @param {string|null} key     Boss key（null = 用关卡默认关底）
   * @param {boolean} mid         是否中途 Boss
   * @param {number} fromEnd      登场位置距关卡右端的像素
   * @returns {{key:string|null, mid:boolean}}
   */
  _queueBoss(key, mid, fromEnd) {
    this.bossPending = true;
    this.pendingBossKey = key;
    this.pendingBossMid = !!mid;
    this.pendingBossFromEnd = Number.isFinite(fromEnd) && fromEnd > 0 ? fromEnd : null;
    if (this._safeSpot) {
      this.player.setCheckpoint(this._safeSpot.x, this._safeSpot.y);
      this.onEvent('checkpoint', { x: this._safeSpot.x, y: this._safeSpot.y });
    }
    return { key: key || null, mid: !!mid };
  }

  _updatePlatform(dt, input) {
    const p = this.player;
    p.update(dt, input);

    // 手感：Boss 战里原地站定 0.3 秒后自动把朝向转向 Boss。
    // 平台关子弹沿 facing 射出，玩家站定不动时 facing 会停在最后一次走位的方向，
    // 一旦 Boss 挪到另一侧，就会出现「对着空气一直开枪」的挫败感（自动化测试里曾出现 340 秒 0 命中）。
    const faceBoss = this.boss;
    if (faceBoss && faceBoss.state !== 'dead' && p.alive) {
      // 摇杆玩家只推模拟量、不产生 left/right 数字动作，这里也要算「在动」
      const moving = input.down('left') || input.down('right') || Math.abs(input.moveX || 0) > 0.15;
      this._faceIdleT = moving ? 0 : (this._faceIdleT || 0) + dt;
      if (!moving && this._faceIdleT > 0.3) {
        const dxToBoss = faceBoss.x - (p.x + p.w / 2);
        if (Math.abs(dxToBoss) > 24) p.facing = dxToBoss > 0 ? 1 : -1;
      }
    } else {
      this._faceIdleT = 0;
    }

    if (this.state === 'play') {
      this.enemies?.update(dt, p, this.bullets, this.fx, {
        // 踩怪 / 冲刺撞怪：触发踩踏音效；怪被打死则再报击杀事件
        onStomp: () => this.onEvent('stomp'),
        onKill: () => {
          this._addPower(POWER.kill);
          this.onEvent('enemyKill');
        },
      });
    }
    this._updatePickups(dt, p);
    this._updateCheckpoints(p);

    // 记录最后一次站稳的位置：Boss 战触发时作为兜底检查点，避免死后回到起点
    if (p.alive && p.onGround) this._safeSpot = { x: p.x, y: p.y };

    // 触发 Boss（先由 Game 播完战前对话，再调 beginBoss）。
    // 中途 Boss 的呼吸区计时只在「能自由跑图」时推进：Boss 战 / 对话 / 复活倒计时都暂停。
    if (this.midbossDone && this.state === 'play' && !this.bossPending && !this.bossStarted) {
      this._midClearT += dt;
    }
    const fired = this._checkPlatformBossTrigger(p.x + p.w / 2);
    if (fired) {
      this.onEvent('bossTrigger', fired.mid ? { midboss: true, key: fired.key } : { key: fired.key });
    }
  }

  _updateStg(dt, input) {
    const p = this.player;
    if (this.extra && this.stg) this._updateExtraTimeline(dt);
    if (input.pressed('shoot') || input.down('shoot')) this._tryShoot(input);
    this.stg.update(dt, p, this.bullets, this.shots, this.fx, {
      onReachBoss: () => {
        // EXTRA 的 Boss 由时间轴调度（2:00 中途 / 3:00 终盘），不看滚动条
        if (this.extra) return;
        if (!this.bossPending && !this.bossStarted) {
          this.bossPending = true;
          this.onEvent('bossTrigger');
        }
      },
      // 子弹命中 STG 妖精 / 击杀上报
      onHit: () => this.onEvent('shotHit'),
      onKill: () => {
        this._addPower(POWER.killStg);
        this.onEvent('enemyKill');
      },
    });
    p.update(dt, input, this.stg.scroll);

    // Extra：Boss 出现后把镜头锁在 Boss 附近，避免它随背景滚出画面
    if (this.extra && this.bossStarted && this.boss) {
      this.stg.scroll = Math.max(0, this.boss.x - 700);
    }

    // STG 里玩家子弹打 Boss 走通用路径
    this.camera.x = this.stg.scroll;
    this.camera.y = 0;
  }

  /**
   * EXTRA 的关内时间轴：
   *   道中计时 → 2:00 雷米莉亚（中途 Boss）→ 击破后继续道中 → 3:00 终盘芙兰。
   * 计时只在「能操作道中」时推进（Boss 战 / 对话 / 复活倒计时都暂停），
   * 这样中途 Boss 打得久也不会把终盘节奏往后推。
   */
  _updateExtraTimeline(dt) {
    const stg = this.stg;
    const running = this.state === 'play' && !this.bossPending && !this.bossStarted;
    if (running) this.extraT += dt;
    // Boss 战期间不再刷道中敌机：打完回来不会满屏妖精糊脸
    stg.spawnPaused = !!(this.bossPending || this.bossStarted);
    if (this.bossPending || this.bossStarted) return;

    if (!this.midbossDone && this.extraT >= EXTRA_TIMELINE.midbossAt) {
      this.bossPending = true;
      this.pendingBossKey = EXTRA_TIMELINE.midbossKey;
      this.pendingBossMid = true;
      this.onEvent('bossTrigger', { midboss: true });
    } else if (this.midbossDone && this.extraT >= EXTRA_TIMELINE.finalAt) {
      this.bossPending = true;
      this.pendingBossKey = null;
      this.pendingBossMid = false;
      this.onEvent('bossTrigger');
    }
  }

  /**
   * EXTRA 的敌方波次表：柱状推进整条 3:00 道中（2:00 中途 Boss 前 + 1:00 收束段），
   * 每 14 波（约 38 秒）为一个节奏段，段落收尾叠一波密集齐射，
   * 避免长时间道中变成一条匀速的直线。波次间隔 450px（约 2.7 秒一拍）。
   */
  _buildExtraWaves() {
    const stg = this.stg;
    if (!stg) return;
    const usable = this.level.w - 1280 - 200;
    const step = 450;
    const waves = [];
    let n = 0;
    for (let s = 420; s < usable; s += step, n++) {
      const zone = Math.floor(n / 14);
      const heavy = zone % 3 === 2;      // 每三段来一段「密集段」
      const roll = n % 7;
      if (roll === 0) waves.push({ at: s, kind: 'scout', count: heavy ? 5 : 4, gapY: 0 });
      else if (roll === 1) waves.push({ at: s, kind: 'gunner', count: heavy ? 3 : 2, gapY: 130 });
      else if (roll === 2) waves.push({ at: s, kind: 'diver', count: 5, gapY: 0 });
      else if (roll === 3) {
        waves.push({ at: s, kind: 'scout', count: 3, gapY: 180 });
        waves.push({ at: s + 150, kind: 'diver', count: 3, gapY: -160 });
      } else if (roll === 4) waves.push({ at: s, kind: 'gunner', count: 3, gapY: 0 });
      else if (roll === 5) {
        waves.push({ at: s, kind: 'scout', count: 2, gapY: -120 });
        waves.push({ at: s + 120, kind: 'gunner', count: 2, gapY: 150 });
      } else {
        waves.push({ at: s, kind: 'diver', count: 4, gapY: 90 });
        // 段落收尾：补一波横向齐射，做「潮水」的段落感
        waves.push({ at: s + 240, kind: 'scout', count: 5, gapY: 40 });
      }
    }
    stg.waves = waves;
    stg.waveIdx = 0;
  }

  /** 把波次指针推到当前滚动位置之前，避免再战时一进场就刷出一大坨敌机 */
  _skipPastWaves() {
    const stg = this.stg;
    if (!stg) return;
    while (stg.waveIdx < stg.waves.length && stg.waves[stg.waveIdx].at < stg.scroll - 600) stg.waveIdx++;
  }

  /**
   * EXTRA 的中途 / 终盘再战：把时间轴与滚动位置拨到指定检查点。
   * @param {'midboss'|'final'|null} from
   */
  resumeExtra(from) {
    if (!this.extra || !this.stg) return;
    if (from !== 'midboss' && from !== 'final') return;
    const at = from === 'midboss' ? EXTRA_TIMELINE.midbossAt : EXTRA_TIMELINE.finalAt;
    this.midbossDone = from === 'final';
    this.extraT = at;
    this.stg.t = 0;
    this.stg.scroll = Math.max(0, Math.min(this.stg.bossTriggerScroll, at * this.stg.speed));
    this._skipPastWaves();
    // 不白白回到 Lv.1：给到 Lv.4 差一颗的火力
    // 火力等级由 POWER 派生（StgPlayer.fireLevel 是 getter），这里只补 POWER
    this.player.power = Math.max(this.player.power || 0, EXTRA_TIMELINE.retryPower);
    this.skipBossDialogue = true;
    this.onEvent('respawn');
  }

  _tryShoot(input) {
    const p = this.player;
    if (!p.alive) return;
    if (p.shootCd > 0) return;
    // Shift 低速（显示判定点）时收束扇形：优先读本帧输入，玩家身上的 focus 在 STG 里晚一帧
    const focus = !!(input && input.down && input.down('slow')) || !!p.focus;
    // 火力等级由 POWER 决定：Lv.1–4 → 弹数 1 / 2 / 3 / 4
    const level = p.fireLevel || powerLevel(p.power);
    if (this.mode === 'stg') {
      p.shootCd = 0.075;
      // STG 关的 Boss 悬在画面中上部，玩家通常贴下边躲弹：纯平射会从 Boss 脚下掠过，
      // 手感上等于「打不到」。这里给一个朝 Boss 躯干的轻微自动俯仰（限幅 ±0.42rad），
      // 站位高低都能命中，同时保留走位与躲弹的操作量。
      const gunY = p.worldY - 4;
      let aim = 0;
      const b = this.boss;
      if (b && b.state !== 'dead') {
        const dx = b.x - p.worldX;
        if (dx * p.facing > 0) {
          const dy = (b.y - b.h * 0.55) - gunY;
          const dist = Math.max(160, Math.abs(dx));
          aim = Math.max(-0.42, Math.min(0.42, Math.atan2(dy, dist)));
        }
      }
      // 平射散布：两人都比上一版更散（灵梦仍明显更窄）；Shift 低速时由 fire() 统一收束
      const fan = this.char === 'marisa' ? 0.32 : 0.15;
      this.shots.fire(p.worldX + 14 * p.facing, gunY, p.facing, this.char, level, aim, fan, focus);
    } else {
      // 按住 ↑ 时朝上方的目标射击（有 Boss 时自动瞄准 Boss 的高度，避免贴脸也打不中）；
      // 按住 ↓ 时朝下方射击：Boss 在下层平台/地面时也能反打，
      // 否则站上高台就完全打不到脚下的 Boss（单向平台只挡人不挡子弹，可以安全俯射）
      let aim = 0;
      const b = this.boss;
      const bossLive = b && b.state !== 'dead';
      const gunY = p.y + p.h * 0.34;
      // 平台关竖轴不参与走位，正好留给摇杆做「上下瞄准」：
      // 键盘/数字方向照旧，摇杆推过上/下 45% 即视为抬枪/压低。
      const stickY = (input && input.moveY) || 0;
      if (input && (input.down('up') || stickY < -0.45)) {
        if (bossLive && b.y - 50 < gunY) {
          const dx = Math.max(60, Math.abs(b.x - (p.x + p.w / 2)));
          const dy = (b.y - 50) - gunY;
          aim = Math.max(-1.35, Math.min(-0.2, Math.atan2(dy, dx)));
        } else {
          aim = -0.9;
        }
      } else if (input && (input.down('down') || stickY > 0.45)) {
        if (bossLive && b.y - 50 > gunY + 30) {
          const dx = Math.max(60, Math.abs(b.x - (p.x + p.w / 2)));
          const dy = (b.y - 50) - gunY;
          aim = Math.max(0.25, Math.min(1.35, Math.atan2(dy, dx)));
        } else {
          aim = 0.9;
        }
      }
      p.shootCd = 0.085;
      const sx = p.x + p.w / 2 + 16 * p.facing;
      const sy = p.y + p.h * 0.34;
      // spread 传 undefined：平台关按仰角自动取 SHOT_PROFILE 的 fanAim / fanFlat
      this.shots.fire(sx, sy, p.facing, this.char, level, aim, undefined, focus);
    }
  }

  /**
   * 符卡（Bomb）：清空全屏弹幕 + 大伤害 + 短暂无敌。
   * 输入与 POWER 扣除在玩家类完成，这里只结算效果；
   * 伤害按「施放前」的火力等级计算，避免刚扣完费就变成挠痒。
   */
  _castSpell(ev = {}) {
    const p = this.player;
    const hp = this.playerHitPoint;
    const lv = Math.max(1, ev.levelBefore || p.fireLevel || powerLevel(p.power));
    const accent = this.char === 'marisa' ? '#ffd23f' : '#ff5ea8';

    // 全屏清弹（原作 Bomb 的核心）+ 场上演出层：
    // 白闪 → 三重冲击环（白芯 / 角色色 / 大范围）→ 花瓣与金屑爆散
    this.bullets.clear();
    this.fx.flash(hp.x, hp.y, '#ffffff', 34);
    // 快环窜出、角色色环铺场、慢环留到最后，三层叠出「炸开→扩散→余波」
    this.fx.shockwave(hp.x, hp.y, '#ffffff', 14, 3800, 0.42);
    this.fx.shockwave(hp.x, hp.y, accent, 20, 2200, 0.75);
    this.fx.shockwave(hp.x, hp.y, accent, 6, 900, 1.35);
    this.fx.burst(hp.x, hp.y, accent, 34, 780);
    this.fx.burst(hp.x, hp.y, '#ffd23f', 18, 460);
    this.fx.sparkle(hp.x, hp.y, '#ffffff');
    this.camera.shake(26, 0.6);

    // 对 Boss / 敌人造成伤害
    if (this.boss) this.boss.damage(scalePlayerDamage(90 + 80 * lv));
    if (this.mode === 'platform' && this.enemies) {
      this.enemies.damageArea(hp.x, hp.y, 900, 99, this.fx, {
        onKill: () => {
          this._addPower(POWER.kill);
          // 符卡清屏也会报击杀，但 onHit 不接（99 伤害会瞬间刷屏）
          this.onEvent('enemyKill');
        },
      });
    }
    p.invuln = Math.max(p.invuln || 0, 2.0);
    this.castFx = 1.2;

    this.onEvent('cast', {
      char: this.char,
      cost: ev.cost || POWER.castCost,
      before: ev.before,
      after: ev.after,
      levelBefore: lv,
      levelAfter: ev.levelAfter || p.fireLevel,
    });
  }

  _updatePickups(dt, p) {
    const px = this.mode === 'stg' ? p.worldX : p.x + p.w / 2;
    const py = this.mode === 'stg' ? p.worldY : p.y + p.h / 2;
    for (const it of this.pickups) {
      if (it.taken) continue;
      it.t += dt;
      // 击破中途 Boss 掉落的补给：先从空中落到舞台地面，落地后才开始浮沉/吸取
      if (it.drop) {
        it.vy = (it.vy || 0) + 1500 * dt;
        const floorY = it.floorY ?? it.y;
        it.y += it.vy * dt;
        if (it.y >= floorY) {
          it.y = floorY;
          it.drop = false;
          it.vy = 0;
          this.fx.sparkle(it.x, it.y, it.kind === 'oneup' ? '#ffb3e0' : '#6ee7ff');
        }
        continue;
      }
      if (Math.abs(it.x - px) < 42 && Math.abs(it.y - py) < 42) {
        it.taken = true;
        if (it.kind === 'coin') {
          this.fx.sparkle(it.x, it.y, '#ffd23f');
          this.onEvent('coin', { value: 1 });
        } else if (it.kind === 'oneup') {
          // 1UP 道具：回一条残机（走和满槽奖励同一条 _addExtend 通道，横幅/音效统一）
          this.fx.sparkle(it.x, it.y, '#ff9ad5');
          this.fx.shockwave(it.x, it.y, '#ffd6ef', 12, 320, 0.45);
          this._addExtend(POWER.extend);
          this.onEvent('oneup', { lives: p.lives });
        } else {
          // 吃 P 点：涨 POWER，火力等级可能随之提升
          this.fx.sparkle(it.x, it.y, '#6ee7ff');
          this._addPower(POWER.pickup);
          this.onEvent('power', { value: POWER.pickup, level: p.fireLevel });
        }
      }
    }
  }

  _updateCheckpoints(p) {
    for (const c of this.checkpoints) {
      if (c.active) continue;
      // 过线即存：不再要求「正踩在地上」，跑跳经过也算数
      if (Math.abs(p.x + p.w / 2 - c.x) < 90) {
        c.active = true;
        p.setCheckpoint(c.x - p.w / 2, c.y - p.h);
        this.fx.shockwave(c.x, c.y, '#6ee7ff', 12, 300, 0.4);
        this.onEvent('checkpoint', { x: c.x, y: c.y });
      }
    }
  }

  /**
   * 涨 POWER：只结算「真正加上去的部分」。
   * 默认把入账量计入 1UP 累计；擦弹传 countExtend=false，因为它的 1UP 奖励由
   * grazePoints 单独结算（否则 0.075 POWER 会把 0.02 点/颗抬成 0.095）。
   * 条满时多出来的量不浪费——仍然计入 extend 计数（原作里满火力后吃 P 也是分数）。
   */
  _addPower(n, countExtend = true) {
    const p = this.player;
    if (!p || !(n > 0)) return;
    p.power = Math.min(p.maxPower, (p.power || 0) + n);
    // 按「拾取量」而不是「槽内增量」计数：满槽时吃 P 也不浪费 extend 进度
    if (countExtend) this._addExtend(n);
  }

  /**
   * 1UP 累计：每 99 点 → +1 残机（循环）。
   * 来源：拾取 POWER、擦弹 0.02 点/颗、符卡结算奖励；计数只增不减，不会因为放符卡掉火力抹掉。
   * 擦弹是 0.02 的粒度，累加时保留 4 位小数，避免浮点漂移让 99 点差一点点。
   */
  _addExtend(amount) {
    const p = this.player;
    if (!p || !(amount > 0)) return;
    this.extendPts = Math.round(((this.extendPts || 0) + amount) * 1e4) / 1e4;
    const need = POWER.extend;
    while (this.extendPts >= need) {
      this.extendPts -= need;
      p.lives += 1;
      p.maxLives = Math.max(p.maxLives || 0, p.lives);
      this.extendCount = (this.extendCount || 0) + 1;
      const hp = this.playerHitPoint;
      this.fx.shockwave(hp.x, hp.y, '#ffd23f', 20, 620, 0.7);
      this.fx.shockwave(hp.x, hp.y, '#fff6cf', 10, 380, 0.5);
      this.fx.burst(hp.x, hp.y, '#ffd23f', 18, 420);
      this.onEvent('extend', { lives: p.lives, count: this.extendCount });
    }
  }

  /**
   * 限时符卡结算（docs/BOSS_TIMING_SPEC.md §2 规则 4/5、§3.3）。
   * boss.js 只报「这张卡结束 + 是否按时」，奖励与 1UP 记账全部在 stage 侧完成：
   *  - ok（按时打完 / 存活到点）：基础 1/4P（POWER.cardClear × 满槽）。
   *      火力未满 → 走 _addPower；火力已满 → 基础奖励转残机（_addExtend(POWER.extend)）。
   *  - 本卡无伤（没被弹、没落命）：额外 1/2P（POWER.cardNoHit × 满槽），与基础一起结算。
   *  - !ok（超时没打完）：+10 点 extend 进度，即既有「99 点 → 1 命」的奖励系统；不给 1/4P。
   * 最后一张卡也会正常结算，之后 boss 自己进入 defeat（stage 不改它的状态机）。
   */
  _onBossCardResult(res) {
    if (!res) return;
    const p = this.player;
    if (!p) return;
    const noHit = !!res.ok && !this._cardDamaged;
    const base = res.ok ? cardClearPower() : 0;
    const bonus = noHit ? cardNoHitPower() : 0;
    let reward;
    if (res.ok) {
      if ((p.power || 0) >= (p.maxPower || POWER.max)) {
        // 满槽：基础奖励沿用「转 1 残机」通道；无伤 1/2P 仍按 1UP 点数追加，一起走同一个循环。
        // 这样冲击波/音效/extend 事件（main.js 的 1UP 横幅）与拾取满 99 点走同一条路径。
        this._addExtend(POWER.extend + bonus);
        reward = 'life';
      } else {
        // 基础 1/4P + 无伤 1/2P 一次入账；超出槽的部分由 _addPower 自动转进 1UP 进度。
        this._addPower(base + bonus);
        reward = 'power';
      }
    } else {
      this._addExtend(10);
      reward = 'points';
    }
    // reward 交给 main.js 决定横幅：'power'（+火力）/ 'life'（1UP）/ 'points'（+10 点）
    // noHit/base/bonus 供横幅与验证脚本区分「普通击破」「无伤」「满槽」三种情况。
    this.onEvent('cardResult', { ...res, reward, noHit, base, bonus });
  }

  _onPlayerEvent(ev) {
    switch (ev.type) {
      case 'jump':
        this.fx.jumpRing(ev.x, ev.y, this.char === 'marisa' ? '#ffe9a0' : '#ffc2d8');
        break;
      case 'doubleJump':
        this.fx.jumpRing(ev.x, ev.y, '#bfe6ff');
        this.fx.shockwave(ev.x, ev.y, '#bfe6ff', 6, 240, 0.3);
        break;
      case 'land':
        this.fx.landDust(ev.x, ev.y, ev.ice ? '#bfeaff' : '#d8c8b0');
        break;
      case 'dash':
        this.fx.shockwave(ev.x, ev.y, this.char === 'marisa' ? '#ffd23f' : '#ff8fb0', 10, 460, 0.25);
        this.camera.shake(4, 0.12);
        break;
      case 'bounce':
        this.fx.shockwave(ev.cx, ev.cy, '#8ef07a', 8, 420, 0.3);
        this.fx.burst(ev.cx, ev.cy, '#8ef07a', 8, 220);
        break;
      case 'hurt':
        // 本卡无伤判定：Boss 战期间被弹即作废（只标记当前卡，切卡时清零）
        if (this.boss && this.boss.state === 'battle') this._cardDamaged = true;
        this.camera.shake(16, 0.35);
        this.fx.burst(ev.x, ev.y, '#ff5ea8', 12, 300);
        document.getElementById('ui')?.classList.add('hurt');
        setTimeout(() => document.getElementById('ui')?.classList.remove('hurt'), 220);
        this.onEvent('hurt', ev);
        break;
      case 'die':
        // 落命同样作废无伤（平台关掉坑不经过 hurt，所以 die 也要标记）
        if (this.boss && this.boss.state === 'battle') this._cardDamaged = true;
        this.camera.shake(20, 0.5);
        this.state = 'dead';
        this.deathT = 0.9;
        this.onEvent('death', ev);
        break;
      case 'cast':
        this._castSpell(ev);
        break;
      default:
        break;
    }
  }

  _respawn() {
    if (this.state !== 'dead') return;
    this.deathT = 0;
    const p = this.player;
    const ok = p.respawn();
    if (!ok) {
      this.onEvent('gameover');
      return;
    }
    this._resetCrumble();
    this.state = this.bossStarted ? 'boss' : 'play';
    this.bullets.clear();
    this.shots.clear();
    this.fx.clear();
    // 复活无敌：给玩家反应时间，别一睁眼就被满屏弹幕打死
    p.invuln = Math.max(p.invuln, 1.8);
    if (this.mode === 'platform') {
      this.camera.snapTo(p.x + p.w / 2);
    }
    this.onEvent('respawn');
  }

  /**
   * 让 Boss 登场。
   * @param {string|null} keyOverride 指定 Boss（EXTRA 的中途 Boss 不走关底配置）
   * @param {{midboss?:boolean}} [opts]
   */
  beginBoss(keyOverride = null, opts = {}) {
    if (this.bossStarted) return;
    this.bossStarted = true;
    this.bossPending = false;
    this.state = 'boss';

    const key = keyOverride || this.pendingBossKey || this.level.boss;
    const isMid = opts.midboss != null ? !!opts.midboss : this.pendingBossMid;
    this.bossMid = isMid;
    this.pendingBossKey = null;
    this.pendingBossMid = false;
    this._cardDamaged = false;
    // 平台关登场站位：中途 Boss 站关卡配置里的舞台中心（复活重试直接 beginBoss 也走这里），
    // 关底维持 w-520 的老手感；STG（含 EXTRA）不看这个值。
    const fromEnd = opts.fromEnd
      || this.pendingBossFromEnd
      || (isMid && this.midbossCfg ? (this.midbossCfg.arenaFromEnd || 520) : 520);
    this.pendingBossFromEnd = null;

    const bx = this.mode === 'stg'
      ? this.stg.scroll + 900
      : this.level.w - fromEnd;
    const by = this.mode === 'stg' ? 380 : this.level.h - 240;

    this.boss = new Boss(key, bx, by, {
      difficulty: this.difficulty,
      // Extra 不参与 4/5/6 面的难符卡裁剪
      stageNumber: this.extra ? 0 : this.index + 1,
      // 平台关启用近战系统：踩踏 / 冲刺破势 / 破势硬直 / 俯冲砸地
      platformMelee: this.mode === 'platform',
      groundY: this.mode === 'platform'
        ? (this.level.gen ? this.level.gen.ground * 32 : this.level.h - 96)
        : by + 240,
    });
    this.boss.x = Math.max(300, Math.min(this.boss.x, this.level.w - 200));
    // 平台关近战的演出计数（首次触发不重复播）
    this._seenStagger = 0;
    this._seenDive = 'idle';
    this.camera.shake(18, 0.6);
    this.fx.flash(bx, by - 80, this.boss.def.accent, 40);
    // 中途战开战不再直接补火力：舞台段取消的小怪火力，改由关卡配置里的
    // midboss.opening 在舞台左侧铺成 P 点，玩家自己捡（见 levels.js / levelgen._prepareOpening）。
    this.onEvent('bossStart', {
      key,
      name: this.boss.def.name,
      title: this.boss.def.title,
      midboss: isMid,
    });
  }

  _onMidbossDefeated() {
    const b = this.boss;
    this.boss = null;
    this.bossStarted = false;
    this.bossPending = false;
    this.bossMid = false;
    this.midbossDone = true;
    this.state = 'play';
    this.bullets.clear();
    this.camera.shake(20, 0.7);
    if (b) {
      this.fx.burst(b.x, b.y - 80, b.def.accent, 34, 460);
      this.fx.shockwave(b.x, b.y - 80, '#ffffff', 26, 1200, 0.7);
    }
    // 残机不补，但给一点点喘息的护身时间，别一睁眼就撞进新刷的妖精堆里
    const p = this.player;
    if (p) p.invuln = Math.max(p.invuln || 0, 1.2);
    // 击破掉落：舞台上空落下一枚 1UP（数量见 levels.js 的 midboss.dropLife）。
    // 玩家得自己走过去捡——不是击破即到账。
    const dropLife = Math.max(0, Math.min(2, Math.round(this.midbossCfg?.dropLife || 0)));
    if (b && dropLife > 0) {
      for (let i = 0; i < dropLife; i++) this._dropPickup('oneup', b.x + (i - (dropLife - 1) / 2) * 46, b.y - 70);
    }
    // 呼吸区基准：以击破瞬间的玩家位置为原点，再往前走 breathDist 像素才放关底；
    // 计时器归零后由 _updatePlatform 在「能自由跑图」时累加。
    this._midClearT = 0;
    this._midClearX = p ? p.x + p.w / 2 : 0;
    this.onEvent('midbossClear', { key: b ? b.key : 'remilia' });
  }

  /**
   * 击破中途 Boss 掉落补给：生成一枚「会落地」的拾取物。
   *
   * 掉落物先从空中往舞台地面掉（见 _updatePickups 的 drop 分支），落地后才开始浮沉
   * 和吸取判定，免得一生成就被头顶的玩家直接吃掉、看不出「打出来一样东西」这件事。
   */
  _dropPickup(kind, x, y) {
    const groundY = this.level.gen ? this.level.gen.ground * 32 : this.level.h - 96;
    this.pickups.push({
      kind,
      x,
      y,
      floorY: groundY - 20, // 贴地浮一点，和地图上「地面上一格」的道具齐平
      vy: 0,
      drop: true,
      taken: false,
      t: 0,
    });
  }

  _onBossDefeated() {
    this.state = 'clear';
    this.finished = true;
    this.bullets.clear();
    this.camera.shake(24, 0.8);
    const b = this.boss;
    this.fx.burst(b.x, b.y - 80, b.def.accent, 40, 500);
    this.fx.shockwave(b.x, b.y - 80, '#ffffff', 30, 1400, 0.8);
    this.onEvent('clear', { boss: b.key });
  }

  _updateCamera(dt) {
    if (this.mode === 'stg') {
      this.camera.x = this.stg.scroll;
      this.camera.y = 0;
      return;
    }
    const p = this.player;
    const tx = p.x + p.w / 2;
    let target = tx;
    // Boss 战时相机偏向 Boss，但必须保证玩家留在画面里（死后重生到远处也不会双双出画）
    // 上限给到 Boss 一侧：Boss 会左右巡游，镜头要跟到能让整个立绘入画的位置，
    // 否则宽幅动作立绘会被右边缘切掉半个身子。
    if (this.boss && this.boss.state !== 'dead') {
      const mid = (tx + this.boss.x) / 2;
      // 上限 260：镜头最多把玩家放到屏幕左侧 260px，剩下的空间留给 Boss。
      // 距离 420px 时镜头正好取中点 → 玩家在 430px、Boss 在 850px，双方完整入画。
      target = Math.max(tx - 1080, Math.min(tx + 380, mid));
    }
    this.camera.update(dt, target, p.y + p.h / 2);
  }

  _ambientTick(dt) {
    // 少量环境粒子漂浮（樱花 / 萤火 / 雪）
    this._ambT = (this._ambT || 0) + dt;
    if (this._ambT < 0.08) return;
    this._ambT = 0;
    const theme = this.level.theme;
    const cam = this.camera.view;
    const x = cam.x + Math.random() * VIEW_W;
    const y = cam.y + Math.random() * 200;
    if (theme === 'shrine') {
      this.fx.ambient(x, y, '#ff9ecb', { vx: -30 - Math.random() * 40, vy: 18 + Math.random() * 20, spin: 1.2, size: 3 });
    } else if (theme === 'forest') {
      this.fx.ambient(x, y, '#c8ff8a', { vx: -14, vy: 8 + Math.random() * 14, star: true, size: 2 });
    } else if (theme === 'lake') {
      this.fx.ambient(x, y, '#bfeaff', { vx: -10, vy: 30 + Math.random() * 30, size: 2 });
    } else if (theme === 'mountain') {
      this.fx.ambient(x, y, '#ffd0a0', { vx: -50 - Math.random() * 40, vy: 10, size: 2 });
    } else if (theme === 'nether') {
      this.fx.ambient(x, y, '#ffa8d8', { vx: -20, vy: -14, spin: 2, size: 3 });
    } else if (theme === 'moon') {
      this.fx.ambient(x, y, '#ffe9b0', { vx: -8, vy: 12, star: true, size: 2 });
    } else {
      this.fx.ambient(x, y, '#ff4d6a', { vx: -18, vy: -20, spin: 2.4, size: 3 });
    }
  }

  /* ============================================================
     绘制
     ============================================================ */

  /* 把整个背景层（图 + 压暗 + 色调）预合成到一张离屏 canvas。
   * 每帧只做一次 1:1 贴图，避免大图缩放 + 多个全屏渐变填充导致的掉帧。 */
  _composeBgLayer(list, theme, variant) {
    const W = VIEW_W, H = VIEW_H;
    const OVER = 420;                 // 右侧多留出横移余量
    const cv = document.createElement('canvas');
    cv.width = W + OVER;
    cv.height = H;
    const c = cv.getContext('2d');
    if (!c) return null;

    const a = list[0];
    if (!a || !a.img || !a.img.naturalWidth) return null;

    // cover 到 (W+OVER) x H
    const s = Math.max(cv.width / a.img.naturalWidth, cv.height / a.img.naturalHeight);
    const iw = a.img.naturalWidth * s;
    const ih = a.img.naturalHeight * s;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    // 统一调色：提高对比与饱和、压低整体亮度，让 AI 图不再「灰白平」
    c.filter = 'saturate(1.14) contrast(1.10) brightness(0.94)';
    c.drawImage(a.img, (cv.width - iw) / 2, (cv.height - ih) / 2, iw, ih);
    c.filter = 'none';

    // 雾之湖那张图里有一颗「白描边太阳」，用带体积的月盘盖住
    if (theme === 'lake' && !variant) {
      const gx = cv.width * 0.297, gy = H * 0.435, gr = 148;
      const glow = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
      // 用一个有实心核心 + 柔边的月盘，盖住 AI 图里那圈「白描边太阳」
      glow.addColorStop(0, 'rgba(255, 250, 238, 0.98)');
      glow.addColorStop(0.52, 'rgba(250, 246, 232, 0.97)');
      glow.addColorStop(0.62, 'rgba(238, 240, 236, 0.85)');
      glow.addColorStop(0.78, 'rgba(215, 228, 245, 0.24)');
      glow.addColorStop(1, 'rgba(180, 205, 240, 0)');
      c.fillStyle = glow;
      c.beginPath();
      c.arc(gx, gy, gr, 0, Math.PI * 2);
      c.fill();
      // 冷灰环形山，避免月盘变成一张白纸
      c.save();
      c.beginPath();
      c.arc(gx, gy, gr * 0.56, 0, Math.PI * 2);
      c.clip();
      const craters = [
        [-0.18, -0.12, 0.16], [0.14, 0.06, 0.11], [0.02, 0.24, 0.09],
        [-0.06, 0.02, 0.07], [0.22, -0.18, 0.06],
      ];
      for (let i = 0; i < craters.length; i++) {
        const k = craters[i];
        c.fillStyle = 'rgba(150, 160, 178, ' + (0.2 + i * 0.018) + ')';
        c.beginPath();
        c.ellipse(gx + k[0] * gr, gy + k[1] * gr, k[2] * gr, k[2] * gr * 0.78, 0.4, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    // 冷色光柱：多层同心梯形叠加 + 垂直衰减，做出带柔边的空气光
    if (theme === 'lake' || theme === 'moon' || theme === 'mountain') {
      const col = theme === 'mountain' ? [255, 214, 168]
        : theme === 'moon' ? [196, 210, 255] : [206, 233, 255];
      const beams = [
        [0.15, 0.30, 150, 0.185],
        [0.40, 0.22, 210, 0.130],
        [0.64, 0.33, 135, 0.155],
        [0.84, 0.19, 190, 0.090],
      ];
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < beams.length; i++) {
        const bx = cv.width * beams[i][0];
        const ang = beams[i][1];
        const halfW = beams[i][2];
        const a0 = beams[i][3];
        const len = H * 1.18;
        c.save();
        c.translate(bx, -70);
        c.rotate(ang);
        const grd = c.createLinearGradient(0, 0, 0, len);
        grd.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + a0 + ')');
        grd.addColorStop(0.55, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (a0 * 0.42) + ')');
        grd.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
        c.fillStyle = grd;
        for (let k = 0; k < 6; k++) {
          const spread = 1 + k * 0.45;
          const w0 = 26 * spread, w1 = halfW * spread;
          c.globalAlpha = 0.32 * Math.pow(0.72, k);
          c.beginPath();
          c.moveTo(-w0, 0); c.lineTo(w0, 0);
          c.lineTo(w1, len); c.lineTo(-w1, len);
          c.closePath(); c.fill();
        }
        c.restore();
      }
      c.restore();
    }

    // 顶部压暗
    const top = c.createLinearGradient(0, 0, 0, H * 0.22);
    top.addColorStop(0, 'rgba(4, 3, 10, 0.48)');
    top.addColorStop(1, 'rgba(4, 3, 10, 0)');
    c.fillStyle = top;
    c.fillRect(0, 0, cv.width, H * 0.22);

    // 底部压暗
    const bot = c.createLinearGradient(0, H * 0.58, 0, H);
    bot.addColorStop(0, 'rgba(6, 4, 12, 0)');
    bot.addColorStop(0.62, 'rgba(6, 4, 12, 0.22)');
    bot.addColorStop(1, 'rgba(6, 4, 12, 0.78)');
    c.fillStyle = bot;
    c.fillRect(0, H * 0.58, cv.width, H * 0.42);

    // 色调和
    const tint = c.createLinearGradient(0, 0, 0, H);
    tint.addColorStop(0, 'rgba(40, 60, 120, 0.06)');
    tint.addColorStop(1, 'rgba(20, 10, 24, 0.10)');
    c.fillStyle = tint;
    c.fillRect(0, 0, cv.width, H);

    // 整体曝光标定：整层乘到统一亮度（压暗用黑幕，提亮用滤镜重绘一次）
    const ex = (BG_EXPOSURE[theme] || [1, 1])[variant] ?? 1;
    if (ex < 0.99) {
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(0,0,0,' + (1 - ex).toFixed(4) + ')';
      c.fillRect(0, 0, cv.width, cv.height);
    } else if (ex > 1.01) {
      const exp = document.createElement('canvas');
      exp.width = cv.width; exp.height = cv.height;
      const ec = exp.getContext('2d');
      if (ec) {
        ec.filter = 'brightness(' + ex.toFixed(4) + ')';
        ec.drawImage(cv, 0, 0);
        return exp;
      }
    }

    return cv;
  }

  /* 厚涂背景：cover 裁切 + 随关卡进度横移 + 变体交叉淡入 + 底部压暗 */
  _drawPaintedBg(ctx, list, cam, theme) {
    const W = VIEW_W, H = VIEW_H;

    // 预合成每一张可用背景（换段时交叉淡入），每帧只贴图。
    // 注意：图片是异步加载的，list 可能一开始只含后加载完成的那张，
    // 所以合成缓存必须按条目的原始变体序号 idx 存，不能按 list 顺序存，
    // 否则曝光标定会串到另一张画上（EX 面出现过红月/蓝月互换）。
    if (!this._bgLayers) this._bgLayers = {};
    let cache = this._bgLayers[theme];
    if (!cache) cache = this._bgLayers[theme] = [];
    const layers = [];
    for (const e of list) {
      const idx = e.idx | 0;
      if (cache[idx] === undefined) cache[idx] = this._composeBgLayer([e], theme, idx) || null;
      if (cache[idx]) layers.push(cache[idx]);
    }
    if (layers.length) {
      const lvlW = Math.max(1, (this.level.w || W) - W);
      const prog = Math.max(0, Math.min(1, (cam.x || 0) / lvlW));
      const n = layers.length;
      let ai = 0, k = 0;
      if (n > 1) {
        ai = Math.min(n - 2, Math.floor(prog * (n - 1)));
        const local = prog * (n - 1) - ai;
        k = smoothstep(0.40, 0.55, local);
      }
      const paint = (layer, alpha) => {
        // 取合成层（比视口宽 OVER）的正中窗口，再叠 ±12px 的慢速横移。
        // 原来横移走满 420px，会把画里的月亮/云海在不同进度移进画面中心，
        // 实测 stage6 中段中心亮度比前后高 13+、stage7 后段低 20+，是面内亮度断层的根源。
        // 居中固定后各进度看的是同一块构图，配合 per-variant 曝光标定即可整段持平。
        const base = Math.max(0, (layer.width - W) / 2) - 12;
        const sx = Math.round(base + prog * 24);
        ctx.globalAlpha = alpha;
        ctx.drawImage(layer, sx, 0, W, H, 0, 0, W, H);
      };
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      paint(layers[ai], 1);
      if (k > 0.001 && layers[ai + 1]) {
        paint(layers[ai + 1], k);
        // 过场遮罩：两张图构图不完全一致时，用一层薄暮色盖住重影。
        // 两变体已按同一曝光标定，重影主要是构图差异，遮罩只需要很薄，
        // 原来的 0.34 会让 40%–55% 进度段的画面亮度掉 20+，造成面内亮度断层。
        const veil = Math.sin(Math.PI * k) * 0.03;
        if (veil > 0.004) {
          ctx.save();
          ctx.globalAlpha = veil;
          ctx.fillStyle = '#160b20';
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    const lvlW = Math.max(1, (this.level.w || W) - W);
    const prog = Math.max(0, Math.min(1, (cam.x || 0) / lvlW));

    // 变体：关卡进度分区间，交界处 12% 交叉淡入
    const n = list.length;
    let a = list[0], b = list[0], mixK = 0;
    if (n > 1) {
      const seg = 1 / n;
      const i = Math.min(n - 1, Math.floor(prog / seg));
      a = list[i];
      b = list[Math.min(n - 1, i + 1)];
      const local = (prog - i * seg) / seg;
      mixK = smoothstep(0.82, 1, local);
    }

    // cover：图片比例 16:9，略放大留出横移余量；
    // 随关卡进度缓慢推近（1.10 → 1.20），让静态背景也有镜头运动
    const s = Math.max(W / 2048, H / 1160) * (1.10 + prog * 0.10);
    const iw = 2048 * s, ih = 1160 * s;
    const drift = 34 + prog * 90;              // 随进度缓慢横移
    const x = (W - iw) * 0.5 - drift + (cam.x || 0) * 0.02;
    const y = (H - ih) * 0.5 - 12;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 1;
    ctx.drawImage(a.img, x, y, iw, ih);
    if (mixK > 0.001 && b !== a && b.ok) {
      ctx.globalAlpha = mixK;
      ctx.drawImage(b.img, x, y, iw, ih);
      ctx.globalAlpha = 1;
    }

    // 顶部压暗：让 HUD 文字可读
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.22);
    top.addColorStop(0, 'rgba(4, 3, 10, 0.48)');
    top.addColorStop(1, 'rgba(4, 3, 10, 0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.22);

    // 底部压暗：遮住图片水印/边角，同时把地形接进来
    const bot = ctx.createLinearGradient(0, H * 0.58, 0, H);
    bot.addColorStop(0, 'rgba(6, 4, 12, 0)');
    bot.addColorStop(0.62, 'rgba(6, 4, 12, 0.22)');
    bot.addColorStop(1, 'rgba(6, 4, 12, 0.78)');
    ctx.fillStyle = bot;
    ctx.fillRect(0, H * 0.58, W, H * 0.42);

    // 主题色调和：把图片和程序化地形拉到同一色温
    const tint = ctx.createLinearGradient(0, 0, 0, H);
    tint.addColorStop(0, 'rgba(40, 60, 120, 0.06)');
    tint.addColorStop(1, 'rgba(20, 10, 24, 0.10)');
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);

    // 随时间推进的色调变化：一关从「黄昏」走到「入夜」，避免整关一张死图
    const shift = TIME_SHIFT[theme];
    if (shift) {
      const k = prog * shift[1];
      if (k > 0.005) {
        ctx.globalAlpha = k;
        ctx.fillStyle = shift[0];
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }

    // 飘移的云影：给静态背景加一点呼吸感
    const T2 = this.t || 0;
    for (let i = 0; i < 3; i++) {
      const cw = 420 + i * 160;
      const cx = ((T2 * (8 + i * 5) + i * 520) % (W + cw * 2)) - cw;
      const cy = H * (0.12 + i * 0.16) + Math.sin(T2 * 0.13 + i) * 18;
      const rad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.5);
      rad.addColorStop(0, 'rgba(8, 8, 20, 0.055)');
      rad.addColorStop(0.55, 'rgba(8, 8, 20, 0.028)');
      rad.addColorStop(1, 'rgba(8, 8, 20, 0)');
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw * 0.5, cw * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }


  /** 冰晶前景剪影：只在湖/月都出现，作为「立体布景」的近景，画在背景之后、地形之前 */
  _drawIceCrystals(ctx, theme) {
    if (theme !== 'lake' && theme !== 'moon') return;
    const W = VIEW_W, H = VIEW_H;
    ctx.save();
    const cluster = (bx, dir, alpha) => {
      ctx.save();
      ctx.translate(bx, H + 8);
      ctx.scale(dir, 1);
      const shards = [
        [0, 0, 54, 150], [40, 0, 30, 96], [70, 0, 38, 124], [-36, 0, 24, 78], [100, 0, 20, 56],
      ];
      for (let i = 0; i < shards.length; i++) {
        const x = shards[i][0], y = shards[i][1], w = shards[i][2], h = shards[i][3];
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, y);
        ctx.lineTo(x - w * 0.26, y - h * 0.7);
        ctx.lineTo(x, y - h);
        ctx.lineTo(x + w * 0.32, y - h * 0.64);
        ctx.lineTo(x + w * 0.5, y);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, y, 0, y - h);
        g.addColorStop(0, 'rgba(8, 16, 32, ' + (0.9 * alpha) + ')');
        g.addColorStop(0.62, 'rgba(16, 40, 68, ' + (0.82 * alpha) + ')');
        g.addColorStop(1, 'rgba(132, 206, 246, ' + (0.24 * alpha) + ')');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(168, 228, 255, ' + (0.2 * alpha) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    };
    cluster(34, 1, 0.92);
    cluster(W - 34, -1, 0.92);
    cluster(150, 1, 0.5);
    cluster(W - 150, -1, 0.5);
    ctx.restore();
  }

  /** 雪/冰尘：冷色主题的环境天气，屏幕坐标，画在最上层但不挡判定 */
  _drawWeather(ctx, theme) {
    const cold = theme === 'lake' || theme === 'mountain' || theme === 'moon';
    if (!cold) return;
    const t = this.t;
    const W = VIEW_W, H = VIEW_H;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 64; i++) {
      const d = 0.35 + ((i * 53) % 97) / 97 * 0.75;
      const spd = 10 + d * 26;
      const x0 = (i * 181 + 37) % W;
      const y = ((i * 127) % (H + 40) + t * spd) % (H + 40) - 20;
      const x = (x0 + Math.sin(t * (0.3 + d * 0.5) + i * 1.7) * 18 * d + t * 5 * d) % W;
      const r = 0.7 + d * 2.1;
      ctx.globalAlpha = 0.16 + d * 0.32;
      ctx.fillStyle = '#e6f6ff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      const ph = (t * 0.5 + i * 0.77) % 1;
      const x = ((i * 233 + 91) % W) + Math.sin(t * 0.6 + i) * 10;
      const y = ((i * 157 + 43) % H) + Math.sin(t * 0.9 + i * 2) * 8;
      const s = 2.2 + (i % 3) * 1.2;
      ctx.globalAlpha = (0.1 + 0.22 * Math.sin(ph * Math.PI)) * 0.9;
      ctx.strokeStyle = '#dff4ff';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 地面雾/环境光/去饱和这三层渐变的坐标固定在画布空间（与相机无关），
   * 旧实现每帧新建 3 个 CanvasGradient。按 主题+ctx 缓存一次即可。
   */
  _overlayGrads(ctx, theme) {
    const c = this._gradCache;
    if (c && c.ctx === ctx && c.theme === theme) return c;
    const H = VIEW_H;
    const gnd = ctx.createLinearGradient(0, H - 190, 0, H);
    gnd.addColorStop(0, 'rgba(6, 6, 14, 0)');
    gnd.addColorStop(0.55, 'rgba(6, 6, 14, 0.16)');
    gnd.addColorStop(1, 'rgba(6, 6, 14, 0.46)');

    const GLOW = {
      shrine: '#ff7a3c', forest: '#3ce0b0', lake: '#9fd8ff', mountain: '#ffb066',
      nether: '#ff5ea8', moon: '#8fb4ff', mansion: '#ff3050',
    };
    const DG = {
      shrine: '#7a4a38', forest: '#2c4c3c', lake: '#5c7f9c', mountain: '#6b5a52',
      nether: '#5a2038', moon: '#4a5c86', mansion: '#5a2430',
    };
    const glow = GLOW[theme];
    let amb = null, sat = null;
    if (glow) {
      amb = ctx.createLinearGradient(0, H - 210, 0, H);
      amb.addColorStop(0, 'rgba(0,0,0,0)');
      amb.addColorStop(1, glow);
      if (DG[theme]) {
        sat = ctx.createLinearGradient(0, H - 150, 0, H);
        sat.addColorStop(0, 'rgba(138,138,138,0)');
        sat.addColorStop(0.42, 'rgba(138,138,138,0.30)');
        sat.addColorStop(1, 'rgba(138,138,138,0.76)');
      }
    }
    this._gradCache = { ctx, theme, gnd, amb, sat };
    return this._gradCache;
  }

  draw(ctx, alpha) {
    const theme = this.level.theme;
    const cam = this.camera.viewAt(alpha);

    // 背景（屏幕坐标系）：优先使用厚涂背景图，程序化天空作为 fallback
    const bgs = _bgFor(theme);
    const usable = bgs.filter((e) => e.ok);
    if (usable.length) {
      this._drawPaintedBg(ctx, usable, cam, theme);
    } else {
      ctx.save();
      drawSky(ctx, theme, { x: 0, y: 0 }, this.t);
      ctx.restore();

      ctx.save();
      drawParallax(ctx, theme, cam, this.t);
      ctx.restore();
    }

    // 世界坐标系
    ctx.save();
    this.camera.apply(ctx, alpha);

    // 地形（STG 关不绘制地形，只有背景 + 敌机）
    if (this.mode !== 'stg') drawTiles(ctx, this.level, cam, this.t);

    // 地面雾：把厚涂背景和程序化地形接在一起，避免出现一条硬边
    // 这三层是贴着「画面下沿」的屏幕空间覆盖层（渐变坐标见 _overlayGrads），
    // 但这里已经处在 camera.apply 之后的相机坐标系里，所以 y 要补 cam.y。
    // 漏掉 cam.y 时，34 行的 5/6 面（cam.y 最大 368）会把它们顶到画面中部，
    // 在渐变末端留下一道横贯全屏的明暗硬边。
    if (this.mode === 'platform') {
      const H = VIEW_H;
      const dy = cam.y | 0;
      const gr = this._overlayGrads(ctx, theme);
      ctx.fillStyle = gr.gnd;
      ctx.fillRect(cam.x, dy + H - 190, VIEW_W, 190);

      // 环境光染色：让程序化地形接到厚涂背景的光色里
      if (gr.amb) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = gr.amb;
        ctx.fillRect(cam.x, dy + H - 210, VIEW_W, 210);
        ctx.restore();
      }
      // 去饱和 + 统一色相：程序化草地的荧光绿和厚涂背景不是一个世界
      if (gr.sat) {
        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 1;
        ctx.fillStyle = gr.sat;
        ctx.fillRect(cam.x, dy + H - 150, VIEW_W, 150);
        ctx.restore();
      }
    }

    // 道具
    this._drawPickups(ctx, cam);

    // 检查点
    this._drawCheckpoints(ctx, cam);

    // 终点鸟居
    this._drawGoal(ctx, cam);

    // 敌人
    if (this.mode === 'platform' && this.enemies) this.enemies.draw(ctx, cam);

    // STG 敌机
    if (this.mode === 'stg') this.stg.draw(ctx);

    // 符卡卡面叠加（cardfx.js，spec §3.3/§3.4）。
    // 位置在 Boss / 玩家 / 自机弹 / 敌弹之前：世界层（地形、道具、敌人）泡在卡面气氛里，
    // 但 Boss、玩家和弹幕永远画在暗幕之上——否则「萤火虫之夜」的全屏暗幕会把敌弹盖住，
    // 玩家在亮区外完全看不见判定，卡就变成不可读而非难。窗口/天气类 fx 在弹幕下层也更自然。
    if (this.boss && this.boss.state === 'battle') {
      const cardFxKey = this.boss.cardFx;
      if (cardFxKey && cardFxKey !== 'none') {
        const hp = this.playerHitPoint;
        // camera.apply 只做 translate(-round(cam.x), -round(cam.y))，而 cam.viewAt() 已含震屏 ox/oy：
        // 在 world 变换里再 translate 回来，就能用屏幕坐标绘制卡面层，同时保留外层 DPR 缩放。
        const sx = Math.round(cam.x);
        const sy = Math.round(cam.y);
        const px = hp.x - sx;
        const py = hp.y - sy;
        ctx.save();
        if (Number.isFinite(px) && Number.isFinite(py)) {
          ctx.translate(sx, sy);
          drawCardFx(ctx, cardFxKey, {
            w: VIEW_W,
            h: VIEW_H,
            px,
            py,
            playerR: CARD_FX_LIGHT_R,
            time: this.t,
            accent: this.boss.cardAccent,
          });
        }
        ctx.restore();
      }
    }

    // Boss
    if (this.boss) this.boss.draw(ctx, this.t);

    // 玩家
    if (this.mode === 'platform') {
      this.player.draw(ctx, alpha);
    }

    // 玩家子弹
    this.shots.draw(ctx, cam);

    // 敌弹
    this.bullets.draw(ctx, cam);

    // 粒子
    this.fx.draw(ctx);

    ctx.restore();

    // 「萤火虫之夜」二次压暗：亮区之外的 Boss / 敌弹 / 自机弹一律不可见（用户要求「黑暗处不可见」）。
    // 第一次绘制在 Boss/弹幕之前，只让世界层泡在暗里；这一层盖在它们之上，亮区中心是透明的，
    // 所以玩家周围仍全亮，亮区外连血条敌弹都藏进黑里——只留环境萤火（drawAmbient 在这之后画）。
    if (DARKSPOT_HIDE_ENTITIES
      && this.mode === 'platform'
      && this.boss && this.boss.state === 'battle' && this.boss.cardFx === 'darkSpot') {
      const hp2 = this.playerHitPoint;
      const px2 = hp2.x - cam.x;
      const py2 = hp2.y - cam.y;
      if (Number.isFinite(px2) && Number.isFinite(py2)) {
        ctx.save();
        drawCardFx(ctx, 'darkSpot', {
          w: VIEW_W,
          h: VIEW_H,
          px: px2,
          py: py2,
          playerR: CARD_FX_LIGHT_R,
          time: this.t,
          accent: this.boss.cardAccent,
        });
        ctx.restore();
      }
    }

    // STG 玩家在屏幕坐标绘制
    if (this.mode === 'stg') {
      ctx.save();
      this.player.draw(ctx);
      ctx.restore();
    }

    // 环境层（屏幕坐标系）
    ctx.save();
    drawAmbient(ctx, theme, cam, this.t);
    ctx.restore();

    // 冷色主题的雪与冰尘
    this._drawWeather(ctx, theme);

    // 近景剪影（最近的一层，建立景深）
    this._drawForeground(ctx, theme, cam);

    // 符卡释放瞬间的屏幕染色：铺在最后面，才盖得住所有世界层
    if (this.castFx > 0) {
      const accent = this.char === 'marisa' ? '255, 210, 120' : '255, 120, 185';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.5, this.castFx * 0.55);
      const g = ctx.createRadialGradient(
        VIEW_W * 0.5, VIEW_H * 0.56, 0,
        VIEW_W * 0.5, VIEW_H * 0.56, VIEW_W * 0.72
      );
      g.addColorStop(0, `rgba(${accent}, 0.6)`);
      g.addColorStop(0.55, `rgba(${accent}, 0.22)`);
      g.addColorStop(1, `rgba(${accent}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
  }

  /* 前景剪影：贴边的东西（枝、苇、竹、花）作为「最近一层」。
     为了像镜头近景，整层一次性烘焙并加轻微模糊，运行时只做横向视差位移。 */
  _fgBake(theme) {
    // 同一主题的前景层在所有关卡里都一样：全局缓存，重开/换关不再重烤
    if (FG_LAYERS.has(theme)) return FG_LAYERS.get(theme);
    const W = VIEW_W, H = VIEW_H;
    const cw = W + 160, ch = H;
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    if (!ctx) return cv;

    const cfg = {
      shrine:   { ink: '#160510', rim: 'rgba(255,150,110,0.20)' },
      forest:   { ink: '#02100a', rim: 'rgba(120,240,200,0.16)' },
      lake:     { ink: '#040c14', rim: 'rgba(170,220,255,0.20)' },
      mountain: { ink: '#0e0710', rim: 'rgba(255,190,140,0.16)' },
      nether:   { ink: '#12030e', rim: 'rgba(255,120,170,0.18)' },
      moon:     { ink: '#03060f', rim: 'rgba(160,190,255,0.18)' },
      mansion:  { ink: '#100106', rim: 'rgba(255,90,110,0.18)' },
    }[theme] || { ink: '#080610', rim: 'rgba(200,200,255,0.14)' };

    const hash = (n) => {
      let x = (n | 0) + 0x9e3779b9;
      x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
      x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
      return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
    };

    const reed = (bx, by, n, hMax, dir) => {
      for (let i = 0; i < n; i++) {
        const r1 = hash(i * 31 + bx);
        const r2 = hash(i * 57 + by);
        const h = hMax * (0.5 + r1 * 0.6);
        const x = bx + dir * (i * 11 + r2 * 9);
        const bend = dir * (14 + r2 * 30);
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.quadraticCurveTo(x + bend * 0.3, by - h * 0.6, x + bend, by - h);
        ctx.strokeStyle = cfg.ink;
        ctx.lineWidth = 4.2 - i * 0.28;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + bend, by - h - 8, 3 + r1 * 1.6, 9 + r1 * 7, dir * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = cfg.ink;
        ctx.fill();
      }
    };

    const bamboo = (bx, by, h, dir) => {
      const lean = dir * (8 + hash(bx) * 14);
      ctx.beginPath();
      ctx.moveTo(bx - 7, by);
      ctx.quadraticCurveTo(bx + lean * 0.4, by - h * 0.55, bx + lean, by - h);
      ctx.lineTo(bx + lean + 10, by - h);
      ctx.quadraticCurveTo(bx + lean * 0.4 + 10, by - h * 0.55, bx + 5, by);
      ctx.closePath();
      ctx.fillStyle = cfg.ink;
      ctx.fill();
      ctx.strokeStyle = cfg.rim;
      ctx.lineWidth = 1;
      for (let k = 1; k < 7; k++) {
        const yy = by - (h * k) / 7;
        ctx.beginPath();
        ctx.moveTo(bx - 6 + lean * (k / 7) * 0.4, yy);
        ctx.lineTo(bx + 9 + lean * (k / 7) * 0.4, yy);
        ctx.stroke();
      }
      for (let k = 0; k < 3; k++) {
        const yy = by - h * (0.52 + k * 0.15);
        const xx = bx + lean * (0.52 + k * 0.15);
        const d = (k % 2 ? 1 : -1) * dir;
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.quadraticCurveTo(xx + d * 40, yy - 20, xx + d * 78, yy - 34);
        ctx.strokeStyle = cfg.ink;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        for (let m = 0; m < 5; m++) {
          const ex = xx + d * (34 + m * 11), ey = yy - 16 - m * 5;
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(d * (0.46 + m * 0.2));
          ctx.beginPath();
          ctx.ellipse(0, 0, 20, 3.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = cfg.ink;
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const branch = (x0, y0, len, ang, depth) => {
      if (depth <= 0 || len < 14) return;
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + Math.cos(ang + 0.5) * 8, (y0 + y1) / 2, x1, y1);
      ctx.strokeStyle = cfg.ink;
      ctx.lineWidth = Math.max(1.6, depth * 3.4);
      ctx.lineCap = 'round';
      ctx.stroke();
      if (depth <= 2) {
        for (let k = 0; k < 4; k++) {
          const a = ang + (k - 1.5) * 0.6 + 0.3;
          const r = 14 + hash(k + depth) * 10;
          const cx = x1 + Math.cos(a) * r, cy = y1 + Math.sin(a) * r;
          const pr = 3.2 + hash(k * 7) * 2.2;
          for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(pa) * pr * 0.8, cy + Math.sin(pa) * pr * 0.8, pr * 0.9, pr * 0.55, pa, 0, Math.PI * 2);
            ctx.fillStyle = cfg.ink;
            ctx.fill();
          }
        }
      }
      branch(x1, y1, len * 0.64, ang + 0.56 + hash(depth * 13) * 0.26, depth - 1);
      branch(x1, y1, len * 0.56, ang - 0.5 - hash(depth * 29) * 0.3, depth - 1);
      branch(x1, y1, len * 0.42, ang + 0.06, depth - 1);
    };

    const trunk = (bx, by, h, w, dir) => {
      ctx.beginPath();
      ctx.moveTo(bx - w * 0.5, by);
      ctx.bezierCurveTo(bx - w * 0.34, by - h * 0.5, bx - w * 0.28 + dir * 12, by - h * 0.8, bx - w * 0.14 + dir * 20, by - h);
      ctx.lineTo(bx + w * 0.22 + dir * 20, by - h);
      ctx.bezierCurveTo(bx + w * 0.36 + dir * 10, by - h * 0.7, bx + w * 0.46, by - h * 0.4, bx + w * 0.5, by);
      ctx.closePath();
      ctx.fillStyle = cfg.ink;
      ctx.fill();
      ctx.strokeStyle = cfg.rim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.5 - 2, by);
      ctx.bezierCurveTo(bx + w * 0.4, by - h * 0.45, bx + w * 0.26 + dir * 10, by - h * 0.8, bx + w * 0.22 + dir * 20, by - h);
      ctx.stroke();
    };

    const lily = (bx, by, h, dir) => {
      ctx.strokeStyle = cfg.ink;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + dir * 18, by - h * 0.55, bx + dir * 5, by - h);
      ctx.stroke();
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.46;
        const rr = 16 + (k % 2) * 9;
        ctx.save();
        ctx.translate(bx + dir * 5, by - h);
        ctx.rotate(a + dir * 0.12);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(rr * 0.5, -rr * 0.45, rr, -rr * 0.12);
        ctx.quadraticCurveTo(rr * 0.5, rr * 0.18, 0, 0);
        ctx.fillStyle = cfg.ink;
        ctx.fill();
        ctx.restore();
      }
    };

    ctx.save();
    const X = (x) => x + 80; // 左右各留 80 出血

    if (theme === 'shrine') {
      branch(X(-40), -50, 150, 0.58, 4);
      branch(X(W + 20), -60, 128, Math.PI - 0.52, 4);
      reed(X(36), H + 30, 10, 210, 1);
      reed(X(W - 30), H + 30, 9, 190, -1);
    } else if (theme === 'forest') {
      trunk(X(-30), H + 40, 700, 120, 1);
      trunk(X(W + 30), H + 40, 660, 108, -1);
      branch(X(70), -30, 120, 0.8, 3);
      branch(X(W - 70), -20, 104, Math.PI - 0.85, 3);
    } else if (theme === 'lake') {
      reed(X(24), H + 30, 13, 240, 1);
      reed(X(W - 20), H + 30, 12, 226, -1);
      branch(X(W - 40), -50, 120, Math.PI - 0.58, 3);
      branch(X(20), -40, 96, 0.62, 3);
    } else if (theme === 'mountain') {
      branch(X(-40), -30, 150, 0.5, 4);
      reed(X(34), H + 30, 8, 150, 1);
      reed(X(W - 34), H + 30, 8, 160, -1);
    } else if (theme === 'nether') {
      lily(X(48), H + 30, 220, 1);
      lily(X(112), H + 30, 168, 1);
      lily(X(W - 54), H + 30, 228, -1);
      lily(X(W - 120), H + 30, 160, -1);
      branch(X(W + 20), -40, 110, Math.PI - 0.7, 3);
    } else if (theme === 'moon') {
      bamboo(X(20), H + 40, 560, 1);
      bamboo(X(86), H + 40, 470, 1);
      bamboo(X(W - 24), H + 40, 580, -1);
      bamboo(X(W - 92), H + 40, 500, -1);
    } else if (theme === 'mansion') {
      branch(X(-30), -30, 140, 0.62, 4);
      branch(X(W + 20), -24, 124, Math.PI - 0.56, 4);
      trunk(X(-20), H + 30, 380, 84, 1);
      trunk(X(W + 20), H + 30, 380, 84, -1);
    }
    ctx.restore();
    // 模糊必须整层做一次，不能挂在 ctx.filter 上逐笔做：
    // filter 生效时每一笔描边/填充都会被单独光栅化一次模糊，这层有上千笔，
    // 软件光栅下首次绘制要 9–10 秒（进关整屏卡死）。整层一次 blur 后
    // 光栅成本从「上千次小模糊」变成「一次全屏模糊」，视觉几乎一致。
    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    if (!octx) return cv;
    octx.save();
    octx.filter = 'blur(4px)';
    octx.globalAlpha = 0.96;
    octx.drawImage(cv, 0, 0);
    octx.restore();
    FG_LAYERS.set(theme, out);
    return out;
  }

  _drawForeground(ctx, theme, cam) {
    if (this.mode === 'stg') return;
    const W = VIEW_W;
    if (!this._fgLayer || this._fgTheme !== theme) {
      this._fgLayer = this._fgBake(theme);
      this._fgTheme = theme;
    }
    const l = this._fgLayer;
    if (!l) return;
    const sway = Math.sin(cam.x * 0.0022 + 0.6) * 16;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.drawImage(l, -80 + sway - 8, 0, l.width, l.height);
    ctx.restore();
  }

  _drawPickups(ctx, cam) {
    for (const it of this.pickups) {
      if (it.taken) continue;
      if (cam && (it.x < cam.x - 60 || it.x > cam.x + VIEW_W + 60)) continue;
      const bob = Math.sin(it.t * 3) * 3;
      ctx.save();
      ctx.translate(it.x, it.y + bob);
      if (it.kind === 'coin') {
        const pulse = 0.96 + Math.sin(it.t * 2.4) * 0.05;
        // 外晕
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.60 + Math.sin(it.t * 2.4) * 0.14;
        ctx.drawImage(orbGlow(), -31, -31, 62, 62);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        // 金色结晶：缓慢自转 + 呼吸缩放，星尖扫过时会有闪光感
        ctx.rotate(it.t * 0.85);
        ctx.scale(pulse, pulse);
        ctx.drawImage(orbBody(), -17, -17, 34, 34);
      } else if (it.kind === 'oneup') {
        // 1UP：粉红徽章（专属掉落图）+ 心跳式脉冲，不旋转（保证 1UP 字样可读）。
        // 抬 9px 悬空：贴地摆会被前景草叶切掉下半边，「1UP」少一截就认不出来了。
        const beat = 1 + Math.sin(it.t * 5.2) * 0.07;
        ctx.translate(0, -9);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.66 + Math.sin(it.t * 3.1) * 0.16;
        ctx.drawImage(oneupGlow(), -37, -37, 74, 74);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.scale(beat, beat);
        ctx.drawImage(oneupBadge(), -17, -17, 34, 34);
      } else {
        // P 点：蓝白符札
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + Math.sin(it.t * 2.0) * 0.10;
        ctx.drawImage(ofudaGlow(), -27, -27, 54, 54);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.rotate(Math.sin(it.t * 1.6) * 0.10);
        ctx.drawImage(ofudaPaper(), -13, -18.5, 26, 37);
      }
      ctx.restore();
    }
  }

  _drawCheckpoints(ctx, cam) {
    for (const c of this.checkpoints) {
      if (cam && (c.x < cam.x - 80 || c.x > cam.x + VIEW_W + 80)) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.active) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, -52, 4, 0, -52, 52);
        g.addColorStop(0, 'rgba(255, 208, 138, 0.40)');
        g.addColorStop(0.45, 'rgba(255, 168, 96, 0.14)');
        g.addColorStop(1, 'rgba(255, 140, 70, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, -52, 52, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(c.active ? lanternOn() : lanternOff(), -22, -88, 44, 88);
      ctx.restore();
    }
  }

  _drawGoal(ctx, cam) {
    const gx = this.goalX;
    if (!gx) return;
    if (cam && (gx < cam.x - 200 || gx > cam.x + VIEW_W + 200)) return;
    const gy = (this.level.rows - 4) * 32;
    ctx.save();
    ctx.translate(gx, gy);

    // 地面投影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 96, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // 鸟居：木纹 + 受光面 + 暗部
    const wood = (x, y, w, h, light) => {
      const gr = ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, light ? '#8c2a22' : '#5e1a18');
      gr.addColorStop(0.36, light ? '#d8563c' : '#a03628');
      gr.addColorStop(0.7, light ? '#b8402e' : '#7c241d');
      gr.addColorStop(1, '#4a1414');
      ctx.fillStyle = gr;
      ctx.fillRect(x, y, w, h);
    };
    wood(-58, -118, 13, 118, true);
    wood(45, -118, 13, 118, false);
    // 笠木：两端上翘
    ctx.beginPath();
    ctx.moveTo(-84, -126);
    ctx.quadraticCurveTo(0, -146, 84, -126);
    ctx.lineTo(84, -110);
    ctx.quadraticCurveTo(0, -128, -84, -110);
    ctx.closePath();
    const capG = ctx.createLinearGradient(0, -146, 0, -108);
    capG.addColorStop(0, '#e06a4a');
    capG.addColorStop(0.5, '#a83427');
    capG.addColorStop(1, '#5a1716');
    ctx.fillStyle = capG;
    ctx.fill();
    // 贯
    wood(-68, -98, 136, 11, true);
    // 额束
    ctx.fillStyle = '#2a1216';
    ctx.fillRect(-8, -122, 16, 24);

    // 注连绳与纸垂
    ctx.strokeStyle = 'rgba(232, 214, 176, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-44, -92);
    ctx.quadraticCurveTo(0, -80, 44, -92);
    ctx.stroke();
    ctx.fillStyle = 'rgba(248, 244, 232, 0.92)';
    for (let i = 0; i < 4; i++) {
      const x = -30 + i * 20;
      const sway = Math.sin(this.t * 1.8 + i) * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, -87);
      ctx.lineTo(x + 5 + sway, -87);
      ctx.lineTo(x + 5 + sway, -70);
      ctx.lineTo(x + 2.5 + sway * 0.5, -74);
      ctx.lineTo(x + sway, -70);
      ctx.closePath();
      ctx.fill();
    }

    // 暖光：门内是目的地
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -64, 6, 0, -64, 130);
    g.addColorStop(0, 'rgba(255, 176, 120, 0.30)');
    g.addColorStop(0.45, 'rgba(255, 140, 90, 0.10)');
    g.addColorStop(1, 'rgba(255, 120, 70, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -64, 130, 0, Math.PI * 2);
    ctx.fill();

    // 地面光斑
    const pool = ctx.createRadialGradient(0, 0, 2, 0, 0, 70);
    pool.addColorStop(0, 'rgba(255, 170, 110, 0.18)');
    pool.addColorStop(1, 'rgba(255, 140, 90, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(0, 2, 76, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 供 HUD 读取 */
  get hudState() {
    const p = this.player;
    return {
      lives: p.lives,
      maxLives: Math.max(p.maxLives || 0, p.lives),
      extendPts: this.extendPts || 0,
      extendNeed: POWER.extend,
      grazePoints: POWER.grazePoints,
      cardClear: POWER.cardClear,
      cardNoHit: POWER.cardNoHit,
      power: p.power || 0,
      maxPower: p.maxPower || POWER.max,
      fireLevel: p.fireLevel || powerLevel(p.power || 0),
      castCost: POWER.castCost,
      perLevel: POWER.perLevel,
      char: this.char,
      // EXTRA 显示「道中累计时间」：中途 Boss 战期间冻结，3:00 就是雷米莉亚的位置
      time: this.extra ? this.extraT : this.time,
      boss: this.boss && this.boss.state !== 'dead'
        ? {
          name: this.boss.def.name,
          title: this.boss.def.title,
          phase: this.boss.phaseName,
          spell: this.boss.spellIdx + 1,
          spellCount: this.boss.spellCount,
          ratio: this.boss.hpRatio,
          phases: this.boss.phaseCount,
          // ---- 限时符卡（docs/BOSS_TIMING_SPEC.md §3.3）----
          // 字段来自 boss.js；Lead 的 boss.js 改动未合入时全部走兜底，
          // HUD 靠 cardLimit == null 判断「本卡没有限时」，不显示计时条。
          // 注意 cardIndex 按 spec 用 0-based spellIdx；1-based 的显示序号仍看上面的 spell。
          // 只有 battle 中才显示计时行：intro 演出 / defeat 收尾时计时不推进，别显示冻住的倒计时。
          mode: this.boss.mode || 'damage',
          cardLimit: this.boss.state === 'battle' ? (this.boss.cardLimit ?? null) : null,
          cardElapsed: this.boss.cardElapsed || 0,
          cardRemain: this.boss.cardRemain ?? null,
          cardRatio: this.boss.cardRatio ?? this.boss.hpRatio,
          cardFx: this.boss.cardFx || 'none',
          cardEffect: this.boss.cardEffect || 'none',
          cardAccent: this.boss.cardAccent || this.boss.def.accent || '#b48cff',
          cardIndex: this.boss.spellIdx || 0,
          cardTotal: this.boss.spellCount || 0,
          lastResult: this.boss.lastCardResult || null,
        }
        : null,
    };
  }
}
