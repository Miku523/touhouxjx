/**
 * 主循环：固定逻辑步长 + 独立渲染帧率 + 状态插值
 *
 * 设计要点（三档帧率都能稳的原因）：
 *  1. 逻辑（物理/碰撞/AI）永远以固定 1/60 秒推进，与刷新率无关；
 *  2. 渲染由 requestAnimationFrame 驱动，但可以按 frameCap 主动限帧
 *     （0 = 无上限，每帧都画；60 / 120 = 到点才画）；
 *  3. 渲染拿到的 alpha = 累积器剩余比例，用来在「上一逻辑状态」和
 *     「当前逻辑状态」之间插值。没有插值的话，120Hz 屏幕上看到的
 *     仍然是 60Hz 的位置台阶，只是台阶变密了而已。
 */
export class Loop {
  /**
   * @param {(dt:number)=>void} update 逻辑推进，dt 恒等于 step
   * @param {(alpha:number)=>void} render 绘制，alpha ∈ [0,1)
   * @param {object} [opts]
   * @param {number} [opts.step=1/60]      固定逻辑步长（秒）
   * @param {number} [opts.maxDelta=0.25]  单帧最大补偿时间，防止切后台后暴走
   * @param {number} [opts.maxSteps=4]     单帧最多追几个逻辑步
   * @param {number} [opts.frameCap=0]     渲染帧率上限，0 = 不限制
   */
  constructor(update, render, opts = {}) {
    this.update = update;
    this.render = render;

    this.step = opts.step || 1 / 60;
    this.maxDelta = opts.maxDelta || 0.25;
    this.maxSteps = opts.maxSteps || 4;
    this.frameCap = opts.frameCap || 0;

    this.acc = 0;
    this.alpha = 0;
    this.timeScale = 1;
    this.paused = false;
    this.running = false;

    // 统计
    this.fps = 0;            // 实测渲染帧率
    this.stepsPerSec = 60;   // 实测逻辑步频
    this.stepCount = 0;
    this.renderCount = 0;
    this.lastStepMs = 0;     // 最近一次逻辑耗时

    this._rafId = 0;
    this._last = 0;
    this._lastRenderAt = -1e9;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._stepAcc = 0;
    this._stepFrames = 0;

    this._tick = this._tick.bind(this);
    this._onVisibility = () => {
      // 切回前台时把积压时间丢掉，避免一次跑几百步
      this._last = performance.now();
      this.acc = 0;
      this._lastRenderAt = -1e9;
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onVisibility);
    }
  }

  /** 运行时切换帧率上限（0 = 无上限） */
  setFrameCap(hz) {
    this.frameCap = Number(hz) || 0;
    this._lastRenderAt = -1e9; // 立刻允许下一帧渲染
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this.acc = 0;
    this._lastRenderAt = -1e9;
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._rafId);
  }

  _tick(now) {
    if (!this.running) return;
    this._rafId = requestAnimationFrame(this._tick);

    let delta = (now - this._last) / 1000;
    this._last = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    if (delta > this.maxDelta) delta = this.maxDelta;

    // ---- 逻辑：固定步长推进 ----
    let steps = 0;
    if (!this.paused) {
      this.acc += delta * this.timeScale;
      const t0 = performance.now();
      while (this.acc >= this.step && steps < this.maxSteps) {
        this.update(this.step);
        this.acc -= this.step;
        this.stepCount++;
        steps++;
      }
      // 追不上就丢弃积压，宁可慢动作也不要越滚越延迟
      if (steps >= this.maxSteps && this.acc > this.step) this.acc = 0;
      if (steps > 0) this.lastStepMs = performance.now() - t0;
    }

    this.alpha = this.acc / this.step;

    // ---- 渲染：按上限限帧 ----
    const cap = this.frameCap;
    const minInterval = cap > 0 ? 1000 / cap : 0;
    const due = minInterval === 0 || now - this._lastRenderAt >= minInterval - 0.65;
    if (due) {
      this._lastRenderAt = now;
      this.render(this.alpha);
      this.renderCount++;
      this._fpsFrames++;
    }

    // ---- 统计 ----
    this._fpsAcc += delta;
    this._stepAcc += delta;
    this._stepFrames += steps;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this.stepsPerSec = this._stepFrames / this._stepAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
      this._stepAcc = 0;
      this._stepFrames = 0;
    }
  }

  destroy() {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisibility);
    }
  }
}
