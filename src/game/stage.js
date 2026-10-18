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
import { Level } from './level.js';
import { Player, TUNE } from './player.js';
import { Camera } from './camera.js';
import { Fx } from './fx.js';
import { BulletPool } from './bullets.js';
import { PlayerShots } from './playerShots.js';
import { EnemyManager } from './enemies.js';
import { Boss } from './boss.js';
import { getDifficulty } from './difficulty.js';
import { StgPlayer, StgStage } from './stg.js';
import { POWER, powerLevel } from './power.js';
import { drawSky, drawParallax, drawTiles, drawAmbient } from '../art/scenes.js';

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
  e = { img: typeof Image !== 'undefined' ? new Image() : null, ok: false, failed: false };
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
    // Extra 固定按 H 的强度；主线按玩家选择的难度
    this.difficulty = this.extra ? 'H' : getDifficulty(opts.difficulty).key;
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

    this.pickups = [];
    this.checkpoints = [];
    this.goalX = 0;
    // STG 关没有地形，不生成平台用的金币/符札道具
    if (this.mode !== 'stg') this._buildPickups();

    // 玩家
    if (this.mode === 'stg') {
      this.player = new StgPlayer({ char: this.char, lives: opts.lives || 3, power: opts.power || 0 });
      this.stg = new StgStage(this.level, this.diff);
      this.camera.x = 0;
      this.camera.y = 0;
      this.camera.follow = false;
    } else {
      this.player = new Player(this.level, { char: this.char, lives: opts.lives || 3, power: opts.power || 0 });
      this._safeSpot = { x: this.player.x, y: this.player.y };
      this.enemies = new EnemyManager(this.level, { difficulty: this.diff.enemyDifficulty, diff: this.diff });
      this.camera.snapTo(this.player.x + this.player.w / 2);
    }

    this.castFx = 0;
    this.deathT = 0; // 死亡→复活倒计时（用逻辑帧计时，暂停/切后台时冻结）
  }

  _buildPickups() {
    for (const e of this.level.entities) {
      if (e.type === 'coin') {
        this.pickups.push({ kind: 'coin', x: e.x + 16, y: e.y + 16, taken: false, t: Math.random() * 6 });
      } else if (e.type === 'power') {
        this.pickups.push({ kind: 'power', x: e.x + 16, y: e.y + 16, taken: false, t: Math.random() * 6 });
      } else if (e.type === 'checkpoint') {
        this.checkpoints.push({ x: e.x + 16, y: e.y + 32, active: false });
      } else if (e.type === 'goal') {
        this.goalX = e.x + 16;
      }
    }
    if (!this.goalX) this.goalX = this.level.w - 300;
  }

  get playerHitPoint() {
    if (this.mode === 'stg') return this.player.hitPoint;
    const p = this.player;
    return { x: p.x + p.w / 2, y: p.y + p.h * 0.55, r: 10 };
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
    this.camera.beginStep();

    const p = this.player;
    p.shootCd = Math.max(0, (p.shootCd || 0) - dt);

    // 符卡：输入与 POWER 扣除由玩家类处理（Player / StgPlayer 都会 emit 'cast'），
    // 这里只负责在收到事件后清弹幕、结算伤害，避免同一次按键被扣两次 POWER。

    if (this.mode === 'stg') {
      this._updateStg(dt, input);
    } else {
      this._updatePlatform(dt, input);
    }

    // 玩家事件
    for (const ev of p.drainEvents()) this._onPlayerEvent(ev);

    // 弹幕
    const hp = this.playerHitPoint;
    this.bullets.update(dt, { x: hp.x, y: hp.y }, { x: 0, y: 0, w: this.level.w, h: this.level.h });

    // 玩家被弹命中
    if (p.alive && p.invuln <= 0) {
      const hit = this.bullets.hitTest(hp.x, hp.y, hp.r * 0.6);
      if (hit) {
        this.fx.burst(hit.x, hit.y, hit.color, 10, 260);
        hit.active = false;
        p.hurt(hit.x < hp.x ? -1 : 1);
      }
      if (this.mode === 'stg') {
        // 擦弹加分
        const g = this.bullets.grazeTest(hp.x, hp.y, hp.r * 0.6, 26);
        if (g > 0) p.power = Math.min(p.maxPower, p.power + g * POWER.graze);
      }
    }

    // 玩家子弹
    this.shots.update(dt, { w: this.level.w, h: this.level.h });
    if (this.mode === 'platform' && this.enemies) {
      this.enemies.damageWithShots(this.shots, this.fx, {
        onKill: () => this._addPower(POWER.kill),
      });
    }
    if (this.boss) {
      this.boss.damageWithShots(this.shots, this.fx);
    }

    // Boss
    if (this.boss) {
      const before = this.boss.state;
      this.boss.update(dt, p, this.bullets, this.fx, {
        onPhase: (i, name) => {
          this.camera.shake(14, 0.4);
          this.onEvent('bossPhase', { phase: i, name });
        },
      });
      if (before !== 'dead' && this.boss.state === 'dead') {
        this._onBossDefeated();
      }
      // 冲刺撞 Boss
      if (this.mode === 'platform' && p.dashing) {
        if (this.boss.hitByDash(p, this.fx)) this.camera.shake(8, 0.2);
      }
    }

    this.fx.update(dt);
    this._updateCamera(dt);

    // 环境粒子
    this._ambientTick(dt);

    if (input.down('shoot')) this._tryShoot(input);
  }

  _updatePlatform(dt, input) {
    const p = this.player;
    p.update(dt, input);

    // 手感：Boss 战里原地站定 0.3 秒后自动把朝向转向 Boss。
    // 平台关子弹沿 facing 射出，玩家站定不动时 facing 会停在最后一次走位的方向，
    // 一旦 Boss 挪到另一侧，就会出现「对着空气一直开枪」的挫败感（自动化测试里曾出现 340 秒 0 命中）。
    const faceBoss = this.boss;
    if (faceBoss && faceBoss.state !== 'dead' && p.alive) {
      const moving = input.down('left') || input.down('right');
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
        onKill: () => this._addPower(POWER.kill),
      });
    }
    this._updatePickups(dt, p);
    this._updateCheckpoints(p);

    // 记录最后一次站稳的位置：Boss 战触发时作为兜底检查点，避免死后回到起点
    if (p.alive && p.onGround) this._safeSpot = { x: p.x, y: p.y };

    // 触发 Boss（先由 Game 播完战前对话，再调 beginBoss）
    if (!this.bossStarted && !this.bossPending && this.state === 'play') {
      // 触发线贴着 Boss 场地，保证 Boss 出现时就在视野里
      const bossX = this.level.w - 520;
      const triggerX = Math.max(200, Math.min(this.goalX - 120, bossX - 420));
      if (p.x + p.w / 2 > triggerX) {
        this.bossPending = true;
        if (this._safeSpot) {
          p.setCheckpoint(this._safeSpot.x, this._safeSpot.y);
          this.onEvent('checkpoint', { x: this._safeSpot.x, y: this._safeSpot.y });
        }
        this.onEvent('bossTrigger');
      }
    }
  }

  _updateStg(dt, input) {
    const p = this.player;
    if (this.extra && this.stg) {
      // Extra 关：纯 Boss 战 —— 不生成杂兵，只保留缓慢背景滚动
      this.stg.speed = 40;
      if (this.stg.waves.length) this.stg.waves.length = 0;
      if (this.t > 1.4 && !this.bossPending && !this.bossStarted) {
        this.bossPending = true;
        this.onEvent('bossTrigger');
      }
    }
    if (input.pressed('shoot') || input.down('shoot')) this._tryShoot(input);
    this.stg.update(dt, p, this.bullets, this.shots, this.fx, {
      onReachBoss: () => {
        if (!this.bossPending && !this.bossStarted) {
          this.bossPending = true;
          this.onEvent('bossTrigger');
        }
      },
      onKill: () => this._addPower(POWER.killStg),
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

  _tryShoot(input) {
    const p = this.player;
    if (!p.alive) return;
    if (p.shootCd > 0) return;
    // 火力等级由 POWER 决定：Lv.1–4 → 弹数 1 / 2 / 3 / 5
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
      this.shots.fire(p.worldX + 14 * p.facing, gunY, p.facing, this.char, level, aim, 0.1);
    } else {
      // 按住 ↑ 时朝上方的目标射击（有 Boss 时自动瞄准 Boss 的高度，避免贴脸也打不中）；
      // 按住 ↓ 时朝下方射击：Boss 在下层平台/地面时也能反打，
      // 否则站上高台就完全打不到脚下的 Boss（单向平台只挡人不挡子弹，可以安全俯射）
      let aim = 0;
      const b = this.boss;
      const bossLive = b && b.state !== 'dead';
      const gunY = p.y + p.h * 0.34;
      if (input && input.down('up')) {
        if (bossLive && b.y - 50 < gunY) {
          const dx = Math.max(60, Math.abs(b.x - (p.x + p.w / 2)));
          const dy = (b.y - 50) - gunY;
          aim = Math.max(-1.35, Math.min(-0.2, Math.atan2(dy, dx)));
        } else {
          aim = -0.9;
        }
      } else if (input && input.down('down')) {
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
      this.shots.fire(sx, sy, p.facing, this.char, level, aim);
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

    // 全屏清弹（原作 Bomb 的核心）
    this.bullets.clear();
    this.fx.shockwave(hp.x, hp.y, accent, 40, 2200, 0.7);
    this.fx.flash(hp.x, hp.y, '#ffffff', 30);
    this.camera.shake(20, 0.5);

    // 对 Boss / 敌人造成伤害
    if (this.boss) this.boss.damage(90 + 80 * lv);
    if (this.mode === 'platform' && this.enemies) {
      this.enemies.damageArea(hp.x, hp.y, 900, 99, this.fx, { onKill: () => this._addPower(POWER.kill) });
    }
    p.invuln = Math.max(p.invuln || 0, 2.0);
    this.castFx = 0.9;

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
      if (Math.abs(it.x - px) < 42 && Math.abs(it.y - py) < 42) {
        it.taken = true;
        if (it.kind === 'coin') {
          this.fx.sparkle(it.x, it.y, '#ffd23f');
          this.onEvent('coin', { value: 1 });
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

  _addPower(n) {
    const p = this.player;
    p.power = Math.min(p.maxPower, (p.power || 0) + n);
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
        this.camera.shake(16, 0.35);
        this.fx.burst(ev.x, ev.y, '#ff5ea8', 12, 300);
        document.getElementById('ui')?.classList.add('hurt');
        setTimeout(() => document.getElementById('ui')?.classList.remove('hurt'), 220);
        this.onEvent('hurt', ev);
        break;
      case 'die':
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

  beginBoss() {
    if (this.bossStarted) return;
    this.bossStarted = true;
    this.bossPending = false;
    this.state = 'boss';

    const key = this.level.boss;
    const bx = this.mode === 'stg'
      ? this.stg.scroll + 900
      : this.level.w - 520;
    const by = this.mode === 'stg' ? 380 : this.level.h - 240;

    this.boss = new Boss(key, bx, by, {
      difficulty: this.difficulty,
      // Extra 不参与 4/5/6 面的难符卡裁剪
      stageNumber: this.extra ? 0 : this.index + 1,
    });
    this.boss.x = Math.max(300, Math.min(this.boss.x, this.level.w - 200));
    this.camera.shake(18, 0.6);
    this.fx.flash(bx, by - 80, this.boss.def.accent, 40);
    this.onEvent('bossStart', {
      key,
      name: this.boss.def.name,
      title: this.boss.def.title,
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

    return cv;
  }

  /* 厚涂背景：cover 裁切 + 随关卡进度横移 + 变体交叉淡入 + 底部压暗 */
  _drawPaintedBg(ctx, list, cam, theme) {
    const W = VIEW_W, H = VIEW_H;

    // 预合成每一张可用背景（换段时交叉淡入），每帧只贴图
    if (!this._bgLayers) this._bgLayers = {};
    let layers = this._bgLayers[theme];
    if (!layers) layers = this._bgLayers[theme] = [];
    for (let i = layers.length; i < list.length; i++) {
      const l = this._composeBgLayer([list[i]], theme, i);
      if (!l) break;
      layers.push(l);
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
        const maxShift = Math.max(0, layer.width - W);
        const sx = Math.round(prog * maxShift);
        ctx.globalAlpha = alpha;
        ctx.drawImage(layer, sx, 0, W, H, 0, 0, W, H);
      };
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      paint(layers[ai], 1);
      if (k > 0.001 && layers[ai + 1]) {
        paint(layers[ai + 1], k);
        // 过场遮罩：两张图构图不完全一致时，用一层薄暮色盖住重影
        const veil = Math.sin(Math.PI * k) * 0.34;
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
    if (this.mode === 'platform') {
      const H = VIEW_H;
      const gr = this._overlayGrads(ctx, theme);
      ctx.fillStyle = gr.gnd;
      ctx.fillRect(cam.x, H - 190, VIEW_W, 190);

      // 环境光染色：让程序化地形接到厚涂背景的光色里
      if (gr.amb) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.26;
        ctx.fillStyle = gr.amb;
        ctx.fillRect(cam.x, H - 210, VIEW_W, 210);
        ctx.restore();
      }
      // 去饱和 + 统一色相：程序化草地的荧光绿和厚涂背景不是一个世界
      if (gr.sat) {
        ctx.save();
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 1;
        ctx.fillStyle = gr.sat;
        ctx.fillRect(cam.x, H - 150, VIEW_W, 150);
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
  }

  /* 前景剪影：贴边的东西（枝、苇、竹、花）作为「最近一层」。
     为了像镜头近景，整层一次性烘焙并加轻微模糊，运行时只做横向视差位移。 */
  _fgBake(theme) {
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
    ctx.filter = 'blur(4px)';
    ctx.globalAlpha = 0.96;
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
    return cv;
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
      maxLives: p.maxLives,
      power: p.power || 0,
      maxPower: p.maxPower || POWER.max,
      fireLevel: p.fireLevel || powerLevel(p.power || 0),
      castCost: POWER.castCost,
      perLevel: POWER.perLevel,
      char: this.char,
      time: this.time,
      boss: this.boss && this.boss.state !== 'dead'
        ? {
          name: this.boss.def.name,
          title: this.boss.def.title,
          phase: this.boss.phaseName,
          spell: this.boss.spellIdx + 1,
          spellCount: this.boss.spellCount,
          ratio: this.boss.hpRatio,
          phases: this.boss.phaseCount,
        }
        : null,
    };
  }
}
