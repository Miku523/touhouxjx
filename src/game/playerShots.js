/**
 * 玩家的射击弹（御札 / 魔弹）。
 *
 * 数量很少（同屏十几发），但仍然把外观预渲染成离屏精灵：
 *   灵梦 = 白纸御札（朱红符纹 + 纸边毛边 + 拖尾残影）
 *   魔理沙 = 星形魔弹（金白双色 + 金色尾迹）
 * 运行时只做 drawImage + 旋转/翻转，尾迹复用同一张精灵，不新建渐变。
 *
 * 视觉尺寸 ≈ 2r（与 hitRect 的 ±r 判定盒一致），保证「打中了」看起来合理。
 */

const MAX_SHOTS = 160;
const SS = 2; // 超采样倍率

/* ---------------- 精灵缓存 ---------------- */

const sprCache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function cs(r, g, b, a) {
  const R = r | 0, G = g | 0, B = b | 0;
  return a === undefined ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
}

/* ---------------- 灵梦：御札 ---------------- */

/**
 * 御札精灵：竖直符纸。
 * 纸边不是直线，而是带毛边的折线（一次性烘焙，静态确定）。
 */
function buildTalisman(r) {
  const W = r * 1.18;        // 纸宽
  const H = r * 2.85;        // 纸高
  const ext = H * 0.86;      // 外接半径（含光晕与拖尾余量）
  const dim = Math.ceil(ext * 2 * SS);
  const c = makeCanvas(dim, dim);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dim / (2 * SS);

  g.save();
  g.translate(cx, cx);

  // ① 柔光：粉白暖光（加法混合时是尾迹的底光）
  const halo = g.createRadialGradient(0, 0, r * 0.2, 0, 0, ext);
  halo.addColorStop(0, 'rgba(255,232,244,0.5)');
  halo.addColorStop(0.35, 'rgba(255,120,180,0.22)');
  halo.addColorStop(0.72, 'rgba(255,80,150,0.07)');
  halo.addColorStop(1, 'rgba(255,80,150,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, ext, 0, Math.PI * 2);
  g.fill();

  // ② 符纸：白底 + 纸纤维毛边（左右边缘各 7 段小锯齿）
  const hw = W / 2;
  const hh = H / 2;
  g.beginPath();
  g.moveTo(-hw, -hh);
  g.lineTo(hw, -hh);
  // 右边
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    g.lineTo(hw + ((i & 1) ? 0.55 : -0.15), -hh + H * t);
  }
  g.lineTo(hw, hh);
  g.lineTo(-hw, hh);
  // 左边
  for (let i = 6; i >= 0; i--) {
    const t = (i + 0.5) / 7;
    g.lineTo(-hw + ((i & 1) ? -0.55 : 0.15), -hh + H * t);
  }
  g.closePath();

  const paper = g.createLinearGradient(-hw, -hh, hw, hh);
  paper.addColorStop(0, '#fffdfe');
  paper.addColorStop(0.34, '#fff6fa');
  paper.addColorStop(0.72, '#ffe9f2');
  paper.addColorStop(1, '#f7d6e4');
  g.fillStyle = paper;
  g.fill();

  // ③ 深色细描边（朱红，不用纯黑，避免脏）
  g.strokeStyle = 'rgba(168,26,66,0.9)';
  g.lineWidth = 0.75;
  g.stroke();

  // 纸边压暗：下缘与右缘薄薄一层，做出纸的厚度
  const edge = g.createLinearGradient(0, hh - H * 0.22, 0, hh);
  edge.addColorStop(0, 'rgba(190,120,150,0)');
  edge.addColorStop(1, 'rgba(150,60,95,0.28)');
  g.fillStyle = edge;
  g.fillRect(-hw, hh - H * 0.22, W, H * 0.22);

  // ④ 朱红符纹：竖笔 + 两道横笔 + 下方朱印
  g.strokeStyle = '#e8245f';
  g.lineCap = 'round';
  g.lineWidth = Math.max(0.8, W * 0.17);
  g.beginPath();
  g.moveTo(0, -hh * 0.66);
  g.lineTo(0, hh * 0.28);
  g.stroke();
  g.lineWidth = Math.max(0.6, W * 0.13);
  g.beginPath();
  g.moveTo(-W * 0.3, -hh * 0.4);
  g.lineTo(W * 0.3, -hh * 0.4);
  g.moveTo(-W * 0.24, -hh * 0.1);
  g.lineTo(W * 0.24, -hh * 0.1);
  g.stroke();
  // 朱印（小方块 + 内部留白）
  g.fillStyle = '#e8245f';
  g.fillRect(-W * 0.22, hh * 0.38, W * 0.44, W * 0.44);
  g.fillStyle = 'rgba(255,246,250,0.9)';
  g.fillRect(-W * 0.1, hh * 0.47, W * 0.2, W * 0.1);

  // ⑤ 白热核心：中段一小团，标出判定中心
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
  core.addColorStop(0, 'rgba(255,255,255,0.95)');
  core.addColorStop(0.5, 'rgba(255,214,234,0.55)');
  core.addColorStop(1, 'rgba(255,170,210,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  g.fill();

  g.restore();
  return { img: c, w: dim / SS, ext };
}

/* ---------------- 魔理沙：星形魔弹 ---------------- */

function starPath(g, R, r2, n, rot) {
  g.beginPath();
  const step = Math.PI / n;
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * step;
    const rad = (i & 1) ? r2 : R;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function buildStarShot(r) {
  const R = r * 1.5;
  const ext = R * 2.0;
  const dim = Math.ceil(ext * 2 * SS);
  const c = makeCanvas(dim, dim);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dim / (2 * SS);
  g.save();
  g.translate(cx, cx);

  // ① 金色柔光
  const halo = g.createRadialGradient(0, 0, r * 0.2, 0, 0, ext);
  halo.addColorStop(0, 'rgba(255,246,200,0.55)');
  halo.addColorStop(0.3, 'rgba(255,214,80,0.26)');
  halo.addColorStop(0.68, 'rgba(255,180,40,0.08)');
  halo.addColorStop(1, 'rgba(255,180,40,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, ext, 0, Math.PI * 2);
  g.fill();

  // ② 深色细描边
  starPath(g, R * 1.02, R * 0.44, 5, -Math.PI / 2);
  g.strokeStyle = 'rgba(120,52,0,0.85)';
  g.lineWidth = r * 0.22;
  g.lineJoin = 'round';
  g.stroke();

  // ③ 金色中间层
  const sg = g.createRadialGradient(0, 0, r * 0.08, 0, 0, R);
  sg.addColorStop(0, '#fffdf0');
  sg.addColorStop(0.32, '#ffe98a');
  sg.addColorStop(0.72, '#ffc72e');
  sg.addColorStop(1, '#e07f10');
  g.fillStyle = sg;
  starPath(g, R, R * 0.44, 5, -Math.PI / 2);
  g.fill();

  // 内层小星（错开 36°）
  starPath(g, R * 0.58, R * 0.3, 5, -Math.PI / 2 + Math.PI / 5);
  g.fillStyle = 'rgba(255,255,255,0.32)';
  g.fill();

  // ④ 白热核心
  const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.55, 'rgba(255,255,230,0.7)');
  core.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, R * 0.5, 0, Math.PI * 2);
  g.fill();

  g.restore();
  return { img: c, w: dim / SS, ext };
}

/** 金色尾迹：横向拉长的软光条（按速度方向旋转后使用） */
function buildStreak(r) {
  const L = r * 7.5;
  const H = r * 2.6;
  const dimW = Math.ceil(L * 2 * SS);
  const dimH = Math.ceil(H * 2 * SS);
  const c = makeCanvas(dimW, dimH);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const cx = dimW / (2 * SS);
  const cy = dimH / (2 * SS);
  g.save();
  g.translate(cx, cy);

  const grad = g.createLinearGradient(-L * 0.6, 0, L * 0.6, 0);
  grad.addColorStop(0, 'rgba(255,170,40,0)');
  grad.addColorStop(0.45, 'rgba(255,205,80,0.42)');
  grad.addColorStop(0.86, 'rgba(255,246,200,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0.95)');
  g.fillStyle = grad;
  // 纺锤形：两端收窄
  g.beginPath();
  g.moveTo(-L * 0.6, 0);
  g.quadraticCurveTo(0, -H * 0.5, L * 0.6, 0);
  g.quadraticCurveTo(0, H * 0.5, -L * 0.6, 0);
  g.closePath();
  g.fill();

  g.restore();
  return { img: c, w: dimW / SS, h: dimH / SS };
}

const SHOTS = {
  reimu: (r) => buildTalisman(r),
  marisa: (r) => buildStarShot(r),
};

function getShotSprite(char, r) {
  const key = `${char}|${r}`;
  let s = sprCache.get(key);
  if (!s) {
    const base = (SHOTS[char] || SHOTS.reimu)(r);
    s = base;
    if (char === 'marisa') s.streak = buildStreak(r);
    sprCache.set(key, s);
  }
  return s;
}

/* ---------------- 自机弹池 ---------------- */

export class PlayerShots {
  constructor(max = MAX_SHOTS) {
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) {
      this.pool[i] = {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, r: 7, damage: 1, char: 'reimu', rot: 0, t: 0,
      };
    }
    this.cursor = 0;
    this.cooldown = 0;
  }

  _take() {
    for (let n = 0; n < this.pool.length; n++) {
      const i = (this.cursor + n) % this.pool.length;
      if (!this.pool[i].active) {
        this.cursor = (i + 1) % this.pool.length;
        return this.pool[i];
      }
    }
    const b = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    return b;
  }

  /**
   * 开火。火力等级 1-4 决定弹数与伤害，aim 为额外仰角（向上射击用）。
   * @param {number} x 枪口 x
   * @param {number} y 枪口 y
   * @param {number} dir 朝向 1 / -1
   * @param {'reimu'|'marisa'} char
   * @param {number} powerLevel 1-4
   * @param {number} [aim=0] 仰角（弧度，负数向上）
   * @param {number} [spread] 扇形半宽（默认按是否仰射自动取 0.55 / 0.09）
   */
  fire(x, y, dir, char, powerLevel = 1, aim = 0, spread) {
    const lv = Math.min(4, Math.max(1, powerLevel | 0));
    // 弹数成长：1 / 2 / 3 / 5 发，配合 3 点单发伤害，DPS 约 35 → 176
    const shots = [1, 2, 3, 5][lv - 1];
    // 向上射击时用大扇形覆盖不同的高度/距离，平射用很小的散布
    const fan = spread === undefined ? (aim ? 0.55 : 0.09) : spread;
    for (let i = 0; i < shots; i++) {
      const t = shots === 1 ? 0 : (i / (shots - 1)) - 0.5;
      const ang = aim + t * fan;
      const b = this._take();
      b.active = true;
      b.x = x;
      b.y = y + t * 12;
      b.vx = Math.cos(ang) * 980 * dir;
      b.vy = Math.sin(ang) * 980;
      b.life = 0.6;
      b.r = char === 'marisa' ? 8 : 7;
      b.damage = char === 'marisa' ? 4.6 : 4;
      b.char = char;
      b.rot = dir > 0 ? 0 : Math.PI;
      b.t = 0;
    }
  }

  update(dt, bounds) {
    const pad = 120;
    for (let i = 0; i < this.pool.length; i++) {
      const b = this.pool[i];
      if (!b.active) continue;
      b.t += dt;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0) { b.active = false; continue; }
      if (bounds && (b.x < -pad || b.x > bounds.w + pad || b.y < -pad || b.y > bounds.h + pad)) {
        b.active = false;
      }
    }
  }

  /** 与矩形碰撞，返回命中的弹（并消耗它） */
  hitRect(x, y, w, h, damageCb) {
    for (let i = 0; i < this.pool.length; i++) {
      const b = this.pool[i];
      if (!b.active) continue;
      if (b.x + b.r > x && b.x - b.r < x + w && b.y + b.r > y && b.y - b.r < y + h) {
        b.active = false;
        if (damageCb) damageCb(b.damage, b.x, b.y);
        return true;
      }
    }
    return false;
  }

  clear() {
    for (let i = 0; i < this.pool.length; i++) this.pool[i].active = false;
  }

  draw(ctx, cam) {
    const pool = this.pool;
    ctx.save();
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;
      if (cam) {
        const sx = b.x - cam.x;
        const sy = b.y - cam.y;
        if (sx < -60 || sx > 1340 || sy < -60 || sy > 780) continue;
      }
      const alpha = Math.min(1, b.life * 6);
      const S = getShotSprite(b.char, b.r);
      const dir = b.vx >= 0 ? 1 : -1;

      if (b.char === 'marisa') {
        /* ---- 魔理沙：金色尾迹 + 旋转星弹 ---- */
        const ang = Math.atan2(b.vy, b.vx);
        const streak = S.streak;
        if (streak) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.translate(b.x, b.y);
          ctx.rotate(ang);
          // 两段递减的尾迹（同一张精灵，只改 alpha/缩放；亮端贴在弹头）
          const lw = streak.w;
          const lh = streak.h;
          const s1 = lw;
          const s2 = lw * 0.7;
          ctx.globalAlpha = alpha * 0.3;
          ctx.drawImage(streak.img, -lw * 0.30 - s1 * 0.5, -lh * 0.5, s1, lh);
          ctx.globalAlpha = alpha * 0.45;
          ctx.drawImage(streak.img, -lw * 0.18 - s2 * 0.5, -lh * 0.36, s2, lh * 0.72);
          ctx.restore();
        }

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.t * 11); // 缓慢自转，星形更有生命力
        const w = S.w;
        ctx.globalAlpha = alpha;
        ctx.drawImage(S.img, -w * 0.5, -w * 0.5, w, w);
        ctx.restore();
      } else {
        /* ---- 灵梦：御札 —— 两层残影 + 符纸（水平镜像，不旋转，符纹才不倒） ---- */
        const w = S.w;
        const s1 = w * 0.84;
        const s2 = w * 0.94;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * 0.26;
        ctx.drawImage(S.img, b.x - dir * b.r * 2.6 - s1 * 0.5, b.y - s1 * 0.5, s1, s1);
        ctx.globalAlpha = alpha * 0.4;
        ctx.drawImage(S.img, b.x - dir * b.r * 1.3 - s2 * 0.5, b.y - s2 * 0.5, s2, s2);
        ctx.restore();

        ctx.save();
        ctx.translate(b.x, b.y);
        // 飞行中的轻微飘动（纸被风掀起来一点）
        ctx.rotate(Math.sin(b.t * 22) * 0.06 * dir);
        ctx.scale(dir, 1);
        ctx.globalAlpha = alpha;
        ctx.drawImage(S.img, -w * 0.5, -w * 0.5, w, w);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}
