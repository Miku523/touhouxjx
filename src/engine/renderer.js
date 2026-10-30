/**
 * 渲染器：1280x720 逻辑坐标系 + 高 DPI 自适应 + letterbox 等比适配
 *
 * 和像素风时代不同，这里是矢量绘制，不需要整数倍缩放来保持锐利；
 * 反而要求 backing store 尽可能接近物理像素，这样曲线和描边才不糊。
 *
 * 坐标链路：逻辑坐标(1280x720) --scale*backing--> 设备像素
 * 所有游戏代码只管逻辑坐标，由 begin() 把变换装好。
 */

import { tr } from '../i18n/index.js';

export const VIEW_W = 1280;
export const VIEW_H = 720;

/**
 * 探测 WebGL 后端是否为软件光栅（WARP / SwiftShader / llvmpipe / 纯软件）。
 * 软件光栅下：1920x1080 画布每帧上屏/读回成本高一个数量级（实测 144ms/帧），
 * 此时把 backing 降到 clamp(scale*dpr, 1.0, 1.25) 并关闭全部后期（bloom/分级/暗角/颗粒），
 * 正常 GPU 路径完全不受影响。
 */
export function detectSoftwareRaster() {
  try {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;   // 连 WebGL 都拿不到，按弱机降档
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '' : '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|basic render driver|microsoft basic|software|llvmpipe|warp/i.test(s);
  } catch (e) {
    return false;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('无法创建 Canvas 2D 上下文');

    this.w = VIEW_W;
    this.h = VIEW_H;

    // 浏览器缩放 <100% 时 devicePixelRatio < 1：若照实乘进去，backing 会小于 CSS 像素，
    // 画布被拉伸放大导致发虚（试玩反馈 P2-2，1600×900 + 80% 缩放）。backing 计算里按 ≥1 处理。
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scale = 1;    // 逻辑像素 -> CSS 像素
    this.backing = 1;  // 逻辑像素 -> 设备像素
    this.wrap = canvas.parentElement;
    this.letterbox = { x: 0, y: 0 };

    // ---- 低配自动降档：软件光栅（WARP/SwiftShader）下放弃全部后期、backing 降到 1.0 ----
    this.softwareRaster = detectSoftwareRaster();
    this.lowSpec = this.softwareRaster;
    // 低配动态 backing：软件光栅下按帧时间在 0.75 -> 0.67 -> 0.60 -> 0.55 之间降档。
    // 像素数是软件光栅唯一有效的旋钮（perf.md §1.5：1.0=21.7ms、0.75=15.9、0.67=12.6、0.60=10.8、0.55 约 9ms）。
    this._lowSteps = [0.75, 0.67, 0.60, 0.55];
    this._lowIdx = 0;
    this.lowBacking = this._lowSteps[0];
    this._lowEma = 0;
    this._lowFrames = 0;
    this._lowCooldown = 0;
    this._lowLast = 0;
    this._lowStart = 0;      // 首次开始计时的时刻（前 5s 是启动/开屏，不参与降档）

    // ---- auto 档帧时间兜底（真实弱 GPU：detectSoftwareRaster 认不出的 Intel UHD / Vega 8 / 老 MX） ----
    // 和上面的低配动态 backing 互斥：lowSpec 走 _tuneLowBacking（只降不升），
    // auto 的 GPU 路径走 _adaptFrameTime（按帧时间预算升降 _adaptScale），两者不会同时改 backing。
    // 计时全部用「有效帧时间累加」当单调时钟（_adaptClock）：切后台/暂停/长卡顿不进账，
    // 也不依赖真实时间，方便在页面里喂伪造 dt 序列做状态机单测。
    this._adaptScale = 1;        // backing 相对自然分辨率的倍率（1=不降，最低到 0.75 逻辑像素）
    this._adaptNatural = 1;      // fit() 算出的自然 backing（未降档时）
    this._adaptClock = 0;        // 有效帧时间累加（ms）
    this._adaptEma = 0;          // 帧间隔 EMA（ms）
    this._adaptOver = 0;         // 超预算累计（ms）
    this._adaptStable = 0;       // 稳定累计（ms）
    this._adaptCoolUntil = 0;    // 变档冷却（_adaptClock 时间戳）
    this._adaptUpGap = 4000;     // 回抬所需稳定时长（ms），回抬失败后翻倍
    this._adaptUpAt = -1e9;      // 上次回抬时的 _adaptClock
    this._adaptUpFail = 0;       // 回抬后很快又超预算的次数
    this._adaptBanUntil = 0;     // 回抬连续失败的禁用截止时刻（_adaptClock）
    this._adaptTarget = 60;      // 当前预算对应的目标帧率（跟随玩家帧率上限）
    this._adaptReason = '';      // 最近一次变档原因，写进 __rendererInfo 供测试断言

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

    // ---- 自适应后期预算 ----
    // bloom 需要把主画布整帧读回低分辨率缓冲再放大叠加，是后期里唯一的重活。
    // 与其固定降质，不如量一下这次刷新到底花多久：贵就隔帧刷新（辉光本身是软的，
    // 30Hz/15Hz 的刷新肉眼看不出），便宜就每帧刷新，弱机与强机各自跑在自己的预算里。
    this.postLevel = this.lowSpec ? 0 : 2;   // 2=全开 1=关 bloom 0=关全部（软件光栅直接关全部后期）
    // 画质档位：'auto' 跟随硬件检测，'high' / 'low' 由玩家强制覆盖（设置页可改）
    this.quality = 'auto';
    this.autoDegrade = true;     // 'high' 档时禁止自适应降档悄悄把辉光拿走
    this.skipPost = 0;           // 首帧 / 切场景后跳过的后期帧数（跳帧不参与自适应判定）
    this.bloomEmaMs = 0;         // bloom 刷新耗时 EMA
    this._bloomTick = 0;
    this.bloomInterval = 1;      // 每 N 帧刷新一次
    this._bloomDirty = true;     // 首帧 / 尺寸变化后必须刷新
    this._bloomIdle = 0;         // 连续超预算次数，用于降级判定
    this._bloomWarm = 0;         // 前几次刷新含着色器/布局预热，不计入预算
    this._grade = null;          // 色彩分级渐变缓存（尺寸相关）
    this._gradeKey = '';
    this._vig = null;            // 暗角渐变缓存
    this._vigKey = '';
    // bloom 恢复：降级后如果帧时间长期稳定，有限次重试，避免「玩着玩着辉光永久消失」
    this._bloomRetry = 0;        // 已重试次数（上限 3）
    this._bloomRetryAt = 0;      // 下次允许重试的时间戳
    this._bloomStable = 0;       // 降级后连续稳定时长（ms）
    this._lastPresent = 0;       // 上一帧 present 时间戳（算帧间隔）

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

    // backing store：至少 1.25x 超采样，保证矢量描边和细字在 1x 屏上也不糊。
    // 1.5 倍在 1280×720 窗口下会渲染 1920×1080（2.25 倍像素）；1.25 倍省约 30% 填充率，
    // 而画布仍由浏览器降采样，边缘抗锯齿观感几乎不变。软件光栅再降到 1.0。
    // 软件光栅：像素数（backing）是唯一起作用的旋钮。1280×720 下 backing 1.0 实测每帧
    // 50–68ms（15fps），0.75（960×540）实测 16.7ms（60fps 撞顶），且窗口大小几乎无影响
    // （像素数由 backing 决定，见 tools/reports/perf.md §2.2）。合成器放大带来的柔化在
    // 2D 手绘风里可接受，远好过 15fps。GPU 路径完全不变。
    const floor = this.lowSpec ? this.lowBacking : 1.25;
    const cap = this.lowSpec ? this.lowBacking : 2.5;
    const dprForBacking = Math.max(1, this.dpr);
    // 自然 backing：窗口/DPR 决定的分辨率。auto 档的帧时间兜底只缩放它（_adaptScale），
    // 不改 floor/cap 语义，所以 lowSpec 路径与原来完全一致（倍率恒为 1，backing = lowBacking）。
    const natural = Math.min(Math.max(scale * dprForBacking, floor), cap);
    this._adaptNatural = natural;
    const backing = this.lowSpec ? natural : Math.max(natural * this._adaptScale, Math.min(0.75, natural));
    this.backing = backing;

    // backing 没变就不要重设 canvas.width/height：赋值会清空画布并触发后端存储重建，
    // 是切画质 / 窗口 resize 时 50–80ms hitch 的一部分（perf.md §2.3）。
    const cwPx = Math.round(VIEW_W * backing);
    const chPx = Math.round(VIEW_H * backing);
    if (this.canvas.width !== cwPx || this.canvas.height !== chPx) {
      this.canvas.width = cwPx;
      this.canvas.height = chPx;
    }
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    // bloom 缓冲跟随画布，1/4 分辨率足够柔光
    const bw = Math.max(1, Math.round(this.canvas.width / 4));
    const bh = Math.max(1, Math.round(this.canvas.height / 4));
    if (this.bloom.width !== bw || this.bloom.height !== bh) {
      this.bloom.width = bw;
      this.bloom.height = bh;
      this._bloomDirty = true;
    }
    this._gradeKey = '';   // 尺寸变了，渐变换新缓存

    if (this.wrap) {
      this.wrap.style.width = cssW + 'px';
      this.wrap.style.height = cssH + 'px';
    }

    // DOM 叠加层用 --s 跟随画面等比缩放
    document.documentElement.style.setProperty('--s', String(scale));
    document.documentElement.style.setProperty('--px', (scale / 100) + 'px');

    this.letterbox = { x: (vw - cssW) / 2, y: (vh - cssH) / 2 };

    // 给测试/诊断用的只读信息，不污染现有 API
    this._syncInfo();

    // 矢量绘制需要平滑，跟像素风相反
    this.ctx.imageSmoothingEnabled = true;
    // 软件光栅下 'high' 的每个 drawImage 缩放都要高质量重采样：实测 Boss 战 68ms→32ms
    // （2.1×，perf.md §2.2）。'low' 只是缩放锐度略降，GPU 路径保持 high。
    this.ctx.imageSmoothingQuality = this.lowSpec ? 'low' : 'high';

    this.ctx.setTransform(backing, 0, 0, backing, 0, 0);
  }

  /**
   * 低配动态 backing：按帧间隔 EMA 决定是否再降一档（只降不升）。
   * 预算 19ms（约 52fps）触发降档；刚变档的 30 帧不计入，避开改 canvas 尺寸后的首帧长帧。
   */
  _tuneLowBacking() {
    if (!this.lowSpec) return;
    const n = this._lowSteps.length;
    const now = performance.now();
    if (!this._lowStart) this._lowStart = now;
    if (now - this._lowStart < 5000) { this._lowLast = now; return; }   // 启动/开屏阶段的一次性长帧不算
    if (!this._lowLast) { this._lowLast = now; return; }
    const dt = now - this._lowLast;
    this._lowLast = now;
    if (dt <= 0 || dt > 400) return;   // 切后台 / 一次性长卡顿不计入
    if (this._lowCooldown > 0) { this._lowCooldown--; return; }
    this._lowEma = this._lowEma ? this._lowEma * 0.9 + dt * 0.1 : dt;
    this._lowFrames++;
    if (this._lowEma > 19 && this._lowFrames > 120 && this._lowIdx < n - 1) {
      this._lowIdx++;
      this._applyLowBacking();
    }
  }

  _applyLowBacking() {
    this.lowBacking = this._lowSteps[this._lowIdx];
    this._lowEma = 0;
    this._lowFrames = 0;
    this._lowCooldown = 30;
    this._lowStart = performance.now();   // 每次变档后重新给 5s 观察期
    this.fit();
    this._syncInfo();
    this.skipPostFrames(2);
  }

  /** 当前预算的目标帧率：玩家把帧率上限设到 60 以下（30）时按 30 算，60/120/不限都按 60。
   *  这样 30 档限帧的 33ms 帧间隔不会被误判成卡顿，也不会把 120Hz 屏的 8ms 当成「超额」。 */
  _adaptBudgetMs() {
    let capHz = 0;
    try { capHz = window.__game?.loop?.frameCap || 0; } catch (e) { capHz = 0; }
    this._adaptTarget = capHz > 0 && capHz < 60 ? capHz : 60;
    return 1000 / this._adaptTarget;
  }

  /** 暂停/结算/GameOver/对话这些「渲染被主循环主动限到约 30fps」的状态不参与判定 */
  _adaptFrozen() {
    try {
      const g = window.__game;
      if (!g) return false;
      const s = g.state;
      if (s === 'paused' || s === 'clear' || s === 'gameover') return true;
      if (s === 'dialogue' && g.dialogue && g.dialogue.active) return true;
    } catch (e) { /* 诊断读失败就当没冻结 */ }
    return false;
  }

  /**
   * auto 档的帧时间兜底（perf.md P1-1 的剩余部分）。
   * detectSoftwareRaster 只认 SwiftShader/WARP/llvmpipe，真实弱核显（Intel UHD / Vega 8 / 老 MX）
   * 会被当成「强机」走 backing 1.25~2.5 的高路径，auto 档此前没有任何帧时间兜底。
   * 这里按帧时间 EMA 监控：持续超预算就把 backing 乘 0.85 降一档（最低 0.75 逻辑像素），
   * 稳定 4s 再回抬一档；升降都有冷却 + 1.05~1.5 倍预算的迟滞带，回抬失败会翻倍间隔并短暂禁用，
   * 避免临界机上「降-抬-降」来回跳。只动 backing，不碰后期/画质选择，和 _tuneLowBacking 互斥。
   *
   * 所有计时用有效帧时间累加（_adaptClock）而不是 performance.now()：
   *  - 切后台恢复、首帧、一次性长卡顿（dt>200）直接丢弃，不推进时钟；
   *  - 启动后前 5s（开屏/资源热身）不判定；
   *  - 单测可以直接喂伪造 dt 序列，不必真的等 10 秒。
   */
  _adaptFrameTime(dtMs) {
    if (this.quality !== 'auto' || this.lowSpec || this.softwareRaster) return;
    if (!(dtMs > 0) || dtMs > 200) return;                    // 无效/切后台/一次性大卡顿
    if (this.postLevel === 0) return;
    if (this._adaptFrozen()) { this._adaptEma = 0; return; }  // 暂停/结算/对话被限帧，不算卡顿
    const budget = this._adaptBudgetMs();
    this._adaptClock += dtMs;
    this._adaptEma = this._adaptEma > 0 ? this._adaptEma * 0.9 + dtMs * 0.1 : dtMs;
    if (this._adaptClock < 5000) return;                       // 启动/开屏阶段
    if (this._adaptClock < this._adaptCoolUntil) { this._adaptOver = 0; this._adaptStable = 0; return; }
    const ema = this._adaptEma;
    if (ema > budget * 1.5) {
      // 明显低于目标帧率：连续累计 1.2s 才降一档（单帧 100ms 的长卡顿最多贡献 100ms，不会误降）
      this._adaptStable = 0;
      this._adaptOver += dtMs;
      if (this._adaptOver >= 1200) this._adaptStep(-1);
    } else if (ema < budget * 1.05) {
      // 稳定：累计够 _adaptUpGap 才回抬一档
      this._adaptOver = 0;
      this._adaptStable += dtMs;
      if (this._adaptStable >= this._adaptUpGap) this._adaptStep(1);
    } else {
      // 1.05~1.5 倍预算：迟滞带，不升不降
      this._adaptOver = 0;
      this._adaptStable = 0;
    }
  }

  /** 执行一档升降（dir=-1 降 / +1 抬）；值没变就不重设 canvas（fit 内部已做 P2-1 判断） */
  _adaptStep(dir) {
    const natural = this._adaptNatural || 1;
    if (dir < 0) {
      // 降到 0.75 逻辑像素为止：再低在 720p 窗口上会明显糊，而且弱机的瓶颈往往已经不是填充率
      const minScale = Math.min(1, 0.75 / natural);
      const next = Math.max(minScale, this._adaptScale * 0.85);
      if (next >= this._adaptScale - 1e-6) return;
      this._adaptScale = next;
      this._adaptReason = 'overbudget';
      this._adaptCoolUntil = this._adaptClock + 1500;
      // 回抬后 8s 内又撑不住 = 这一档回抬失败：翻倍回抬间隔，连续失败就两分钟内不再尝试
      if (this._adaptClock - this._adaptUpAt < 8000) {
        this._adaptUpFail++;
        this._adaptUpGap = Math.min(16000, this._adaptUpGap * 2);
        if (this._adaptUpFail >= 3) { this._adaptBanUntil = this._adaptClock + 120000; this._adaptUpFail = 0; }
      }
    } else {
      if (this._adaptClock < this._adaptBanUntil) return;
      const next = Math.min(1, this._adaptScale * 1.12);
      if (next <= this._adaptScale + 1e-6) return;             // 已回到自然分辨率
      // 上一档撑过 15s 才算真正稳定：重置失败计数与回抬间隔
      if (this._adaptClock - this._adaptUpAt > 15000) { this._adaptUpFail = 0; this._adaptUpGap = 4000; }
      this._adaptScale = next;
      this._adaptUpAt = this._adaptClock;
      this._adaptReason = 'recovered';
      this._adaptCoolUntil = this._adaptClock + 4000;
    }
    // 变档后的 1.5s/4s（含改 canvas 尺寸的长帧）不参与判定，避免自己触发自己
    this._adaptEma = 0;
    this._adaptOver = 0;
    this._adaptStable = 0;
    const before = this.backing;
    this.fit();
    // fit() 重设 canvas 会清屏：跳两帧后期，别让玩家看到闪黑（值没变时 fit 不会重设，也不用跳）
    if (this.backing !== before) this.skipPostFrames(2);
  }

  /** 诊断信息快照（供测试断言，不影响渲染逻辑） */
  _syncInfo() {
    const info = this.qualityInfo();
    window.__rendererInfo = {
      mode: this.lowSpec ? 'soft' : 'gpu',
      backing: this.backing,
      lowBacking: this.lowBacking,
      postLevel: this.postLevel,
      canvasW: this.canvas.width,
      canvasH: this.canvas.height,
      // 画质档位的来源与结果：设置页 / 测试脚本都用这几个字段判断「降质是否可见」
      quality: info.quality,
      qualityPicked: info.picked,
      qualityLabel: info.label,
      hardware: info.hardware,
      softwareRaster: !!this.softwareRaster,
      bloom: this.postLevel >= 2,
      // auto 档帧时间兜底（测试/诊断）：当前倍率、是否降档、最近一次变档原因
      adaptive: {
        enabled: this.quality === 'auto' && !this.lowSpec,
        scale: +this._adaptScale.toFixed(3),
        degraded: this._adaptScale < 0.999,
        natural: +this._adaptNatural.toFixed(3),
        reason: this._adaptReason || 'idle',
        targetFps: this._adaptTarget || 60,
        emaMs: +this._adaptEma.toFixed(2),
      },
    };
  }

  /**
   * 画质档位：'auto'（跟随硬件检测）/ 'high'（强制全后期 + 高倍超采样）/
   * 'low'（强制低画质：关后期、backing 降到 1.0~1.25）。
   * 设置页改档后立即生效：重建 backing store、重置 bloom 预热计数。
   * @returns {{quality:string,picked:string,label:string,detail:string,hardware:string,backing:number,postLevel:number}}
   */
  setQuality(q) {
    const mode = (q === 'high' || q === 'low') ? q : 'auto';
    this.quality = mode;
    // 注意：软件光栅下即使玩家手选「高」也强制走低配（backing 0.75 + 关后期）。
    // 否则 1280×720 只有 5–6fps 且没有自动逃生（perf.md §3.2）。
    const low = mode === 'low' || this.softwareRaster;
    this.lowSpec = low;
    // 玩家手选「高」时不再让自适应把辉光收走，否则「高」看起来跟「自动」一样
    this.autoDegrade = mode !== 'high';
    this.postLevel = low ? 0 : 2;
    this._bloomWarm = 0;
    this._bloomIdle = 0;
    this._bloomDirty = true;
    this.bloomEmaMs = 0;
    this.bloomInterval = 1;
    this._bloomRetry = 0;
    this._bloomRetryAt = 0;
    this._bloomStable = 0;
    this._lastPresent = 0;
    this._grainPattern = null;
    // 切档后 auto 兜底从自然分辨率重新开始（别把上一档的降档倍率带过来；也重新给 5s 预热）
    this._adaptScale = 1;
    this._adaptClock = 0;
    this._adaptEma = 0;
    this._adaptOver = 0;
    this._adaptStable = 0;
    this._adaptCoolUntil = 0;
    this._adaptUpGap = 4000;
    this._adaptUpAt = -1e9;
    this._adaptUpFail = 0;
    this._adaptBanUntil = 0;
    this._adaptReason = '';
    this.fit();
    this._syncInfo();
    return this.qualityInfo();
  }

  /** 当前画质档位的人话描述：设置页只读行 + 诊断共用（文案走 i18n，键=中文原文） */
  qualityInfo() {
    const auto = this.quality !== 'high' && this.quality !== 'low';
    const hw = this.softwareRaster ? tr('软件光栅') : tr('GPU 加速');
    const post = this.postLevel >= 2 ? tr('辉光开') : (this.postLevel === 1 ? tr('辉光关') : tr('后期关'));
    const picked = auto ? (this.softwareRaster ? 'low' : 'high') : this.quality;
    return {
      quality: auto ? 'auto' : this.quality,
      picked,
      label: auto
        ? (this.softwareRaster ? tr('自动 → 低') : tr('自动 → 高'))
        : (this.quality === 'high' ? tr('高（强制）') : tr('低（强制）')),
      detail: `${hw} · ${this.backing.toFixed(2)}× · ${post}`,
      hardware: this.softwareRaster ? 'software' : 'gpu',
      backing: this.backing,
      postLevel: this.postLevel,
    };
  }

  /** 切场景 / 首帧：跳过 n 帧后期，把一次性的着色器与首帧成本挪出可见卡顿 */
  skipPostFrames(n = 2) {
    this.skipPost = Math.max(this.skipPost, Math.max(0, n | 0));
  }


  /** 每帧绘制前重置状态，返回以逻辑坐标工作的 ctx */
  begin(bgColor) {
    this._tuneLowBacking();
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
    const now = performance.now();
    const dtMs = this._lastPresent ? now - this._lastPresent : 0;
    this._lastPresent = now;
    this._adaptFrameTime(dtMs);   // auto 档帧时间兜底：只动 backing，不碰后期/画质档
    if (!this.postEnabled || this.postLevel === 0) return;
    // 首帧 / 切场景后的几帧先不做后期：bloom 的读回与着色器冷启动最容易在这里顶出长帧
    if (this.skipPost > 0) { this.skipPost--; return; }
    // 因 bloom 太贵而关过辉光的机器：帧时间稳定后有限次重试，不让辉光永久消失
    this._trackBloomRecovery(dtMs);
    const ctx = this.ctx;
    const cw = this.canvas.width, ch = this.canvas.height;

    /* 1) Bloom：降采样 + 模糊，再以加法混合叠回，亮部自然溢出。
       刷新频率按实测耗时自适应（见 _tuneBloom），合成本身很便宜。 */
    if (this.postLevel >= 2) this._bloomPass(cw, ch);

    /* 2) 色彩分级：上部冷、下部暖，统一画面情绪（渐变按尺寸缓存） */
    this._ensureGradWash(ctx, cw, ch);
    ctx.save();
    ctx.setTransform(this.backing, 0, 0, this.backing, 0, 0);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = this._grade;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    /* 3) 暗角：四角压暗，把视线收回画面中心 */
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this._vig;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    /* 4) 胶片颗粒：低透明度 overlay，缓慢漂移避免静态感（软件光栅下省掉这一层） */
    if (!this.lowSpec) {
      if (!this._grainPattern) this._grainPattern = ctx.createPattern(this.grainTile, 'repeat');
      if (this._grainPattern) {
        const ox = Math.floor((t * 13) % 160);
        const oy = Math.floor((t * 7) % 160);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.055;
        ctx.translate(-ox, -oy);
        ctx.fillStyle = this._grainPattern;
        ctx.fillRect(0, 0, VIEW_W + 160, VIEW_H + 160);
      }
    }
    ctx.restore();
  }

  /**
   * bloom 降级后的恢复判定。
   * 关掉 bloom 通常能让帧时间立刻回到 60fps；如果随后连续约 1.2s（按时间累计，
   * 与刷新率无关）都稳定在 40fps 以上，就值得用更保守的刷新间隔（每 4 帧）再试一次。
   * 最多重试 3 次，失败则永久保持关闭；玩家手选「高」或软件光栅不参与。
   */
  _trackBloomRecovery(dtMs) {
    if (this.postLevel !== 1 || !this.autoDegrade || this.lowSpec) return;
    if (this._bloomRetry >= 3) return;
    if (performance.now() < this._bloomRetryAt) return;
    // 用时间而不是帧数：240Hz 下 150 帧只要 0.6s，60Hz 要 2.5s，恢复手感会不一致
    if (dtMs > 0 && dtMs < 25) this._bloomStable = Math.min(this._bloomStable + dtMs, 4000);
    else if (dtMs >= 100) this._bloomStable = 0;          // 切后台/大卡顿后重新计
    else this._bloomStable = Math.max(0, this._bloomStable - dtMs * 2);
    if (this._bloomStable < 1200) return;

    this._bloomRetry++;
    this.postLevel = 2;
    this.bloomInterval = 4;      // 先用最省的刷新频率试水
    this._bloomWarm = 0;
    this._bloomIdle = 0;
    this.bloomEmaMs = 0;
    this._bloomDirty = true;
    this._bloomStable = 0;
    this._bloomRetryAt = performance.now() + 12000 * this._bloomRetry;
    this._syncInfo();
  }

  /** bloom 再次超预算：关掉并安排带退避的重试 */
  _fallbackPost() {
    this.postLevel = 1;
    this._bloomStable = 0;
    this._bloomRetryAt = performance.now() + 12000 * Math.max(1, this._bloomRetry);
    this._syncInfo();
  }

  /** 惰性构建/复用两枚全屏渐变（尺寸变化时才重建） */
  _ensureGradWash(ctx, cw, ch) {
    const key = cw + 'x' + ch + ':' + this.backing;
    if (this._gradeKey === key && this._grade && this._vig) return;
    this._gradeKey = key;

    const grade = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grade.addColorStop(0, 'rgba(72, 104, 220, 0.34)');
    grade.addColorStop(0.52, 'rgba(20, 16, 40, 0.06)');
    grade.addColorStop(1, 'rgba(255, 146, 72, 0.24)');
    this._grade = grade;

    const vg = ctx.createRadialGradient(
      VIEW_W * 0.5, VIEW_H * 0.48, VIEW_H * 0.24,
      VIEW_W * 0.5, VIEW_H * 0.5, VIEW_H * 0.94,
    );
    vg.addColorStop(0, 'rgba(2, 1, 6, 0)');
    vg.addColorStop(0.58, 'rgba(2, 1, 6, 0.10)');
    vg.addColorStop(1, 'rgba(2, 1, 6, 0.58)');
    this._vig = vg;
  }

  /**
   * bloom：整帧读回 1/4 缓冲 → 亮度/对比/饱和/轻微模糊 → 加法叠回。
   *
   * 整帧读回是后期里唯一的重活（软件光栅下实测 ~150ms/次，GPU 下也是每帧
   * 一次 readback）。辉光本身是柔和的低频信号，隔帧刷新肉眼看不出差别，
   * 所以按实测耗时自动决定刷新间隔：强机每帧刷新（和原来一致），
   * 弱机退到 1/2、1/3、1/4 频率，单帧成本摊平到预算以内。
   */
  _bloomPass(cw, ch) {
    const bctx = this._bloomCtx;
    const bw = this.bloom.width, bh = this.bloom.height;
    const tick = this._bloomTick++;

    if (this._bloomDirty || tick % this.bloomInterval === 0) {
      const t0 = performance.now();
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = 'source-over';
      bctx.clearRect(0, 0, bw, bh);
      bctx.filter = `brightness(0.86) contrast(2.35) saturate(1.34) blur(${Math.max(0.8, bw / 360)}px)`;
      bctx.drawImage(this.canvas, 0, 0, bw, bh);
      bctx.filter = 'none';
      this._tuneBloom(performance.now() - t0);
      this._bloomDirty = false;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.40;
    // 低分辨率辉光放大：'low' 足够（内容本身就是模糊的），高档插值纯烧带宽
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(this.bloom, 0, 0, cw, ch);
    ctx.restore();
  }

  /** 用实测耗时决定 bloom 刷新间隔；贵到离谱就直接关掉 bloom 层（玩家手选「高」时不降档） */
  _tuneBloom(ms) {
    if (!(ms >= 0)) ms = 0;
    // 前两次刷新含着色器编译/布局预热，只用来估初值，不做降级判断
    if (this._bloomWarm < 2) {
      this._bloomWarm++;
      this.bloomEmaMs = ms;
      // 冷启动时单次 >30ms 就放弃 bloom；重试阶段交给下面的 EMA 判定（需要连续 3 次），
      // 避免偶尔一帧抖动又把刚恢复的辉光拍死。
      if (this.autoDegrade && this._bloomRetry === 0 && this._bloomWarm === 2 && ms > 30) this._fallbackPost();
      return;
    }
    this.bloomEmaMs = this.bloomEmaMs > 0 ? this.bloomEmaMs * 0.7 + ms * 0.3 : ms;
    const e = this.bloomEmaMs;
    if (e < 0.9) this.bloomInterval = 1;
    else if (e < 2.2) this.bloomInterval = 2;
    else if (e < 5) this.bloomInterval = 3;
    else this.bloomInterval = 4;

    if (this.autoDegrade && e > 10 && ++this._bloomIdle >= 3) this._fallbackPost();
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
