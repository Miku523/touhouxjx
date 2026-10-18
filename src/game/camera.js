/**
 * 相机：平滑跟随玩家 + 关卡边界钳制 + 震屏。
 *
 * 关卡高 22 行 = 704px，略小于 720 的视口，
 * 所以 y 方向基本是固定的（把关卡垂直居中，上下留一点天空）。
 */
export const VIEW_W = 1280;
export const VIEW_H = 720;

export class Camera {
  /**
   * @param {import('./level.js').Level} level
   */
  constructor(level) {
    this.level = level;
    this.x = 0;
    this.y = Math.min(0, Math.floor((VIEW_H - level.h) / 2));
    this.tx = this.x;
    this.ty = this.y;

    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeAmp = 0;
    this.ox = 0;
    this.oy = 0;
    this.shakeEnabled = true;

    this.lookAhead = 0;
    this.deadzone = 90;

    this.follow = true;
  }

  snapTo(target) {
    const p = target;
    this.x = this._clampX(p - VIEW_W * 0.42);
    this.tx = this.x;
  }

  /** 震屏 */
  shake(amp = 10, dur = 0.28) {
    if (!this.shakeEnabled) return;
    if (amp > this.shakeAmp || this.shakeT <= 0) {
      this.shakeAmp = amp;
      this.shakeDur = dur;
      this.shakeT = dur;
    }
  }

  _clampX(x) {
    const maxX = Math.max(0, this.level.w - VIEW_W);
    return Math.max(0, Math.min(x, maxX));
  }

  _clampY(y) {
    const maxY = Math.max(0, this.level.h - VIEW_H);
    const minY = Math.min(0, maxY);
    return Math.max(minY, Math.min(y, maxY));
  }

  /**
   * @param {number} dt
   * @param {number} targetX 玩家中心 x（世界坐标）
   * @param {number} targetY 玩家中心 y
   * @param {number} [alpha]
   */
  update(dt, targetX, targetY, alpha = 1) {
    if (this.follow) {
      // 水平前瞻：朝移动方向多看一点
      const desired = this._clampX(targetX - VIEW_W * 0.5);
      const k = 1 - Math.pow(0.0015, dt); // 与帧率无关的指数平滑
      this.x += (desired - this.x) * k;
      this.x = this._clampX(this.x);

      // 垂直：关卡比视口矮时直接钳住
      const desiredY = this._clampY(targetY - VIEW_H * 0.55);
      this.y += (desiredY - this.y) * (k * 0.6);
      this.y = this._clampY(this.y);
    }

    // 震屏衰减
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const p = Math.max(0, this.shakeT / this.shakeDur);
      const amp = this.shakeAmp * p * p;
      const tt = performance.now() * 0.001;
      this.ox = Math.sin(tt * 97.0) * amp + (Math.random() - 0.5) * amp * 0.6;
      this.oy = Math.cos(tt * 83.0) * amp + (Math.random() - 0.5) * amp * 0.6;
      if (this.shakeT <= 0) {
        this.shakeAmp = 0;
        this.ox = 0;
        this.oy = 0;
      }
    } else {
      this.ox = 0;
      this.oy = 0;
    }
  }

  /** 供场景绘制用的相机（带震屏偏移） */
  get view() {
    return { x: this.x + this.ox, y: this.y + this.oy };
  }

  /** 把 ctx 平移到相机坐标系 */
  apply(ctx) {
    ctx.translate(-Math.round(this.x + this.ox), -Math.round(this.y + this.oy));
  }

  /** 世界坐标矩形是否在视野内（带 margin） */
  visible(x, y, w, h, margin = 64) {
    const vx = this.x + this.ox;
    const vy = this.y + this.oy;
    return x + w > vx - margin && x < vx + VIEW_W + margin &&
           y + h > vy - margin && y < vy + VIEW_H + margin;
  }
}
