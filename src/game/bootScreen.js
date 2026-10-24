/**
 * 启动幕（开屏 loading）控制器
 *
 * 只做三件事：把「真实加载里程碑」换算成一条单调递增的进度条、在最短停留时间
 * 到点后收尾、以及给 QA 脚本留一个探针（window.__boot）。视觉全在 style.css 的
 * #boot 段里，这里不碰 canvas，也不依赖任何引擎模块。
 *
 * 进度模型（与 main.js 的加载顺序一一对应，每一步都是真事，不是装饰动画）：
 *   0.08  本模块构造完成（HTML/CSS 已出首帧，模块图加载完）
 *   0.18  标题三张图开始下载
 *   0.18 → 0.84  背景 + 两张立绘各占 1/3，按 load / decode 事件推进
 *   0.94  三张图全部就绪，等首帧
 *   1.00  最短停留时间到点后追满
 * 等待期间进度条以 1.2%/s 微速爬行（最多越过目标 5%），读数不会「粘」死不动；
 * 任何一步失败或 8s 超时都由 main.js 直接走 finish()，不会把人锁在开屏里。
 */

/** 从页面导航开始算的最短总时长：素材全在缓存里时也留住这一小段品牌过场 */
const MIN_PAGE_MS = 1400;
/** 等图期间的基础爬行速度（每秒推进的比例） */
const CREEP_PER_SEC = 0.012;

export class BootScreen {
  /**
   * @param {HTMLElement|null} el index.html 里的 #boot；元素缺失时所有方法安全空转
   */
  constructor(el) {
    this.el = el || null;
    this.pctEl = el ? el.querySelector('.bm-pct b') : null;
    this.meterEl = el ? el.querySelector('.boot-meter') : null;
    /** 屏幕上显示的进度（0~1），永远单调递增 */
    this.vis = 0.08;
    /** 加载实况对应的目标进度，只能被 setTarget 抬高 */
    this.target = 0.08;
    /** 揭幕完成后置 true，主循环与 rAF 都停掉 */
    this.done = false;
    /** QA 用时间线：[{ n: 阶段名, t: performance.now() }] */
    this.timeline = [];
    this._raf = 0;
    this._last = 0;
    this._lastPct = -1;
    this._rushing = false;
    this._finished = null;
    this._qa = null;
    if (!this.el) return;

    // .js 是「已接管」标记：纯 CSS 阶段的条子靠扫描光带示活，接管后走 --boot-p
    this.el.classList.add('js');
    this._paint();
    this._raf = requestAnimationFrame((t) => this._tick(t));
    this.phase('boot');
    // QA 探针：沿用 window.__prewarmInfo 的路子，给 tools/ 下的脚本读
    if (typeof window !== 'undefined') {
      this._qa = window.__boot = { pct: 8, target: 8, done: false, timeline: this.timeline };
    }
  }

  /**
   * 抬高目标进度。传进来的值比当前目标小（重复调用 / 乱序回调）时直接忽略，
   * 条子只进不退——倒着走的进度条比停在原地更让人怀疑卡死。
   * @param {number} frac 0~1 的绝对进度
   */
  setTarget(frac) {
    if (!this.el || this.done) return;
    const next = Math.max(0, Math.min(1, Number(frac) || 0));
    if (next <= this.target + 1e-4) return;
    this.target = next;
    this.phase('t' + Math.round(next * 100));
    this._last = 0; // 丢掉上一段的帧间隔，免得条子在恢复那一帧跳一下
    if (!this._raf) this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  /**
   * 收尾：等最短停留时间到点，再把条子追满并 resolve。
   * 淡出（hide）不在这里做——由 main.js 等两帧后调用，保证标题首帧已经画出来。
   * @returns {Promise<void>} 进度条到达 100% 时兑现
   */
  finish() {
    if (this._finished) return this._finished;
    this._finished = new Promise((resolve) => {
      if (!this.el) { resolve(); return; }
      const wait = Math.max(0, MIN_PAGE_MS - performance.now());
      const go = () => {
        this._rushing = true;
        this.target = 1;
        this.phase('fill');
        this._last = 0;
        if (!this._raf) this._raf = requestAnimationFrame((t) => this._tick(t));
        const check = () => {
          if (this.done || this.vis >= 0.9995) {
            this.vis = 1;
            this._paint();
            this.meterEl?.classList.add('full');
            this.phase('full');
            resolve();
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      };
      if (wait > 0) setTimeout(go, Math.round(wait));
      else go();
    });
    return this._finished;
  }

  /** 揭幕：加 .done 淡出，淡完彻底 display:none（停掉里面的 CSS 动画） */
  hide() {
    if (!this.el || this.done) return;
    this.done = true;
    this.vis = 1;
    this._paint();
    this.meterEl?.classList.add('full');
    this.el.classList.add('done');
    this.el.setAttribute('aria-hidden', 'true');
    this.phase('hide');
    if (this._qa) { this._qa.done = true; this._qa.pct = 100; }
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    setTimeout(() => { this.el.style.display = 'none'; }, 900);
  }

  /** 记一笔时间线（QA 断言用：最短停留、追满、揭幕的先后顺序） */
  phase(name) {
    if (!this.el) return;
    this.timeline.push({ n: name, t: Math.round(performance.now()) });
    if (this.timeline.length > 40) this.timeline.shift();
  }

  _tick(now) {
    this._raf = 0;
    if (this.done) return;
    const dt = this._last ? Math.min(0.1, Math.max(0, (now - this._last) / 1000)) : 0.016;
    this._last = now;

    const gap = this.target - this.vis;
    if (this.target >= 1 && gap < 0.015) {
      // 收尾最后 1.5% 直接贴满：指数追赶的尾巴会拖出半秒，肉眼又看不出差别
      this.vis = 1;
    } else if (gap > 0.0005) {
      // 追赶：走剩余距离的 6 倍/秒，最快 95%/s，最慢 5%/s——
      // 里程碑可以瞬间连跳（缓存命中时三张图同一帧就绪），条子要在 ~1s 内追平，
      // 但又不至于一帧跳到 100% 显得假。
      const rate = Math.min(0.95, Math.max(0.05, gap * 6));
      this.vis = Math.min(this.target, this.vis + rate * dt);
    } else {
      // 等图空档：微速爬行示活，但最多越过目标 5%（不冒充下一段真实进度）
      this.vis = Math.min(this.target + 0.05, this.vis + CREEP_PER_SEC * dt);
    }
    this._paint();
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  _paint() {
    if (!this.el) return;
    const pct = Math.max(0, Math.min(100, Math.round(this.vis * 100)));
    this.el.style.setProperty('--boot-p', Math.min(100, this.vis * 100).toFixed(2) + '%');
    if (pct === this._lastPct) return;
    this._lastPct = pct;
    if (this.pctEl) this.pctEl.textContent = String(pct);
    if (pct >= 100) this.meterEl?.classList.add('full');
    if (this._qa) this._qa.pct = pct;
  }
}
