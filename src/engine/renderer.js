/**
 * 渲染器：1280x720 逻辑坐标系 + 高 DPI 自适应 + letterbox 等比适配
 *
 * 和像素风时代不同，这里是矢量绘制，不需要整数倍缩放来保持锐利；
 * 反而要求 backing store 尽可能接近物理像素，这样曲线和描边才不糊。
 *
 * 坐标链路：逻辑坐标(1280x720) --scale*backing--> 设备像素
 * 所有游戏代码只管逻辑坐标，由 begin() 把变换装好。
 */

export const VIEW_W = 1280;
export const VIEW_H = 720;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('无法创建 Canvas 2D 上下文');

    this.w = VIEW_W;
    this.h = VIEW_H;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = 1;    // 逻辑像素 -> CSS 像素
    this.backing = 1;  // 逻辑像素 -> 设备像素
    this.wrap = canvas.parentElement;
    this.letterbox = { x: 0, y: 0 };

    // ---- 后期处理缓冲（bloom 用低分辨率，省带宽） ----
    this.bloom = document.createElement('canvas');
    this.bloom.width = 320;
    this.bloom.height = 180;
    this._bloomCtx = this.bloom.getContext('2d');
    // 胶片颗粒：一次性生成的噪声贴图，运行时只做 pattern 平铺
    this.grainTile = this._makeGrainTile(160);
    this._grainPattern = null;
    this._grainSize = 0;
    this.postEnabled = true;

    this._onResize = () => this.fit();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    this.fit();
  }

  /** 生成 8bit 噪声瓦片，用于全屏颗粒，避免每帧现算 */
  _makeGrainTile(n) {
    const c = document.createElement('canvas');
    c.width = n; c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    let s = 0x9e3779b9;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (Math.imul(s ^ (s >>> 15), 0x85ebca6b) + 0x165667b1) | 0;
      const v = 128 + ((s >>> 24) % 48) - 24;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  fit() {
    const vw = window.innerWidth || VIEW_W;
    const vh = window.innerHeight || VIEW_H;

    // 等比缩放并居中（letterbox）
    const scale = Math.min(vw / VIEW_W, vh / VIEW_H);
    this.scale = scale;

    const cssW = Math.round(VIEW_W * scale);
    const cssH = Math.round(VIEW_H * scale);

    // backing store：至少 1.5x 超采样，保证矢量描边和细字在 1x 屏上也不糊
    const backing = Math.min(Math.max(scale * this.dpr, 1.5), 2.5);
    this.backing = backing;

    this.canvas.width = Math.round(VIEW_W * backing);
    this.canvas.height = Math.round(VIEW_H * backing);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    // bloom 缓冲跟随画布，1/4 分辨率足够柔光
    const bw = Math.max(1, Math.round(this.canvas.width / 4));
    const bh = Math.max(1, Math.round(this.canvas.height / 4));
    if (this.bloom.width !== bw || this.bloom.height !== bh) {
      this.bloom.width = bw;
      this.bloom.height = bh;
    }

    if (this.wrap) {
      this.wrap.style.width = cssW + 'px';
      this.wrap.style.height = cssH + 'px';
    }

    // DOM 叠加层用 --s 跟随画面等比缩放
    document.documentElement.style.setProperty('--s', String(scale));
    document.documentElement.style.setProperty('--px', (scale / 100) + 'px');

    this.letterbox = { x: (vw - cssW) / 2, y: (vh - cssH) / 2 };

    // 矢量绘制需要平滑，跟像素风相反
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    this.ctx.setTransform(backing, 0, 0, backing, 0, 0);
  }

  /** 每帧绘制前重置状态，返回以逻辑坐标工作的 ctx */
  begin(bgColor) {
    const ctx = this.ctx;
    ctx.setTransform(this.backing, 0, 0, this.backing, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    } else {
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    }
    return ctx;
  }

  /**
   * 全屏后期：bloom → 色彩分级 → 暗角 → 胶片颗粒。
   * 每帧在场景绘制完成后调用一次。所有绘制都在设备像素坐标里做，
   * 这样 bloom 采样不会因为逻辑缩放重复插值。
   */
  present(t = 0) {
    if (!this.postEnabled) return;
    const ctx = this.ctx;
    const W = VIEW_W, H = VIEW_H;
    const cw = this.canvas.width, ch = this.canvas.height;

    /* 1) Bloom：降采样 + 模糊，再以加法混合叠回，亮部自然溢出 */
    const bctx = this._bloomCtx;
    const bw = this.bloom.width, bh = this.bloom.height;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, bw, bh);
    bctx.filter = `brightness(0.86) contrast(2.35) saturate(1.34) blur(${Math.max(0.8, bw / 360)}px)`;
    bctx.drawImage(this.canvas, 0, 0, bw, bh);
    bctx.filter = 'none';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.40;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.bloom, 0, 0, cw, ch);
    ctx.restore();

    /* 2) 色彩分级：上部冷、下部暖，统一画面情绪 */
    ctx.save();
    ctx.setTransform(this.backing, 0, 0, this.backing, 0, 0);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.55;
    const grade = ctx.createLinearGradient(0, 0, 0, H);
    grade.addColorStop(0, 'rgba(72, 104, 220, 0.34)');
    grade.addColorStop(0.52, 'rgba(20, 16, 40, 0.06)');
    grade.addColorStop(1, 'rgba(255, 146, 72, 0.24)');
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, W, H);

    /* 3) 暗角：四角压暗，把视线收回画面中心 */
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.48, H * 0.24, W * 0.5, H * 0.5, H * 0.94);
    vg.addColorStop(0, 'rgba(2, 1, 6, 0)');
    vg.addColorStop(0.58, 'rgba(2, 1, 6, 0.10)');
    vg.addColorStop(1, 'rgba(2, 1, 6, 0.58)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    /* 4) 胶片颗粒：低透明度 overlay，缓慢漂移避免静态感 */
    if (!this._grainPattern) this._grainPattern = ctx.createPattern(this.grainTile, 'repeat');
    if (this._grainPattern) {
      const ox = Math.floor((t * 13) % 160);
      const oy = Math.floor((t * 7) % 160);
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.055;
      ctx.translate(-ox, -oy);
      ctx.fillStyle = this._grainPattern;
      ctx.fillRect(0, 0, W + 160, H + 160);
    }
    ctx.restore();
  }

  /** 屏幕（client）坐标 -> 逻辑坐标，供鼠标/触摸用 */
  toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) / (r.width / VIEW_W),
      y: (clientY - r.top) / (r.height / VIEW_H),
    };
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
  }
}
