/** 汇总 env / decomp / flow / memory 数据 → _pt/perf/perf.json 与 findings.json。
 * 纯读取已有 JSON，不重跑实验。  node tools/_pt_perf_report.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const R = (p) => JSON.parse(readFileSync(p, 'utf8'));
const W = (p, o) => writeFileSync(p, JSON.stringify(o, null, 1), 'utf8');

const envSummary = R('_pt/perf/env-summary.json');
const envBefore = R('_pt/perf/env-before.json');
const envAfter = R('_pt/perf/env-after.json');
const optVerify = R('_pt/perf/opt-verify.json');
const dGpu = R('_pt/perf/decomp-gpu.json');
const dSoft = R('_pt/perf/decomp-soft.json');
const flow = R('_pt/perf/flow-gpu.json');
const flowOpt = R('_pt/perf/flow-gpu-opt.json');
const memDom = R('_pt/perf/mem-dom-20s.json');

const sceneRow = (s) => ({
  name: s.name,
  cleanMs: s.clean?.avg, p50: s.clean?.p50, p95: s.clean?.p95, p99: s.clean?.p99, worst: s.clean?.worst,
  instrMs: s.instrTotal?.avg,
  layers: (s.layers || []).slice(0, 6).map((l) => ({ name: l.name, msPerFrame: l.msPerFrame, callsPerFrame: l.callsPerFrame, share: l.share })),
  opsTop: (s.opsTop || []).slice(0, 6),
  bullets: s.counts?.bullets, enemies: s.counts?.enemies,
  post: s.post ? { postLevel: s.post.postLevel, bloomEmaMs: s.post.bloomEmaMs, bloomInterval: s.post.bloomInterval } : null,
  countsPerFrameLighter: (s.layers || []).reduce((a, l) => a + (l.gco?.lighter || 0), 0),
});

const perf = {
  generatedAt: new Date().toISOString(),
  author: 'perf（帧率与流畅性分区）',
  machine: 'Windows 24 核 / 68GB；GPU: NVIDIA RTX 5090 Laptop + Intel Graphics + GameViewer Virtual Display Adapter；Edge 155.0.4283.62；node v26.12.0',
  build: '静态服务器 http://127.0.0.1:8138；渲染降档优化已落地在 src/engine/renderer.js（PF-11），其余源码未动',
  optimizationApplied: 'PF-11：软光栅自动降档（detectSoftwareRaster → backing clamp(scale*dpr,1.0,1.25) + postLevel=0 全关后期 + window.__rendererInfo）；GPU 路径保持原样。',
  methodology: {
    note: '游戏实测采用真键盘操作（Enter→KeyE→Digit1→跳开场对话→按住 ArrowRight+Z 6 秒），每个配置 2-3 次取中位数；测量期间其他队友并发跑测试，CPU 总占用采样 38.8%。优化后复测同样 2 次取中位数。',
    probe: '页面内 requestAnimationFrame 间隔 + PerformanceObserver(longtask) + CDP Performance.getMetrics 差分',
    caveat: '手动串行 g.render(0) 测量只覆盖 JS 侧 canvas 命令提交与同步读回，不包含 rAF 合成/上屏光栅；因此软光栅（WARP）下它与实时 rAF 帧间隔差异巨大（decomp p50 1.5ms vs 实测 144ms），这部分差额即合成/光栅成本。',
  },
  envMatrix: {
    note: 'A/B/C/D/E1/E2/F 为优化前（env-before），A/B/E1 为优化后重测（env-after，各 2 次中位数）；avg/p50/p95/p99/worst 单位 ms；longtasks 为 longtask 数量；postLevel/backing/canvas 为实测渲染器状态。',
    game6sBefore: envBefore.summary,
    game6sAfter: envAfter.summary,
    simplestCanvasPage: envBefore.baseSummary,
    simplestCanvasPageNote: 'baseline.html：rects=1000 个移动 fillRect；blend=rects+全屏 soft-light 渐变+lighter；grads=100 个每帧新建 radialGradient。平均帧间隔 ms；bench 为页面内单次操作微基准（ms/次）。',
    rendererStrings: envBefore.rendererStrings,
  },
  optimization: {
    finding: 'PF-11',
    code: 'src/engine/renderer.js:20-40 detectSoftwareRaster()（WEBGL_debug_renderer_info.UNMASKED_RENDERER 匹配 /swiftshader|basic render driver|microsoft basic|software|llvmpipe|warp/i，创建时检测一次）；:70 postLevel = lowSpec ? 0 : 2；:114-122 backing = clamp(scale*dpr, lowSpec?1.0:1.5, lowSpec?1.25:2.5)；:160-168 window.__rendererInfo 诊断快照；:194-231 present 在 postLevel===0 时提前返回、lowSpec 跳过胶片颗粒。GPU 路径数值与行为不变。',
    beforeAfter: [
      {
        config: 'A soft 1280x720', before: { avg: 144.19, p50: 141.65, p95: 166.7, p99: 208.3, worst: 208.3, longtasks: 48, backing: 1.5, canvas: '1920x1080', postLevel: 1, fps: 6.9 },
        after: { avg: 30.83, p50: 33.3, p95: 41.75, p99: 41.75, worst: 58.3, longtasks: 2, backing: 1, canvas: '1280x720', postLevel: 0, fps: 32.4, reps: [25.16, 36.5] },
        delta: 'avg 144.19→30.83ms（4.7×），longtask 48→2，像素量 1920x1080→1280x720',
      },
      {
        config: 'E1 soft + dsf2', before: { avg: 342.04, p50: 341.6, p95: 375.05, p99: 383.35, worst: 383.35, longtasks: 24, backing: 2, canvas: '2560x1440', postLevel: 1 },
        after: { avg: 79.49, p50: 75, p95: 116.7, p99: 133.3, worst: 133.3, longtasks: 81, backing: 1.25, canvas: '1600x900', postLevel: 0, reps: [74.81, 84.17] },
        delta: 'avg 342.04→79.49ms（4.3×），像素量 2560x1440→1600x900',
      },
      {
        config: 'B GPU 1280x720', before: { avg: 4.23, p50: 4.2, p95: 4.3, p99: 4.5, worst: 20.8, longtasks: 0, backing: 1.5, canvas: '1920x1080', postLevel: 2 },
        after: { avg: 4.19, p50: 4.2, p95: 4.3, p99: 4.5, worst: 12.45, longtasks: 0, backing: 1.5, canvas: '1920x1080', postLevel: 2, reps: [4.18, 4.19] },
        delta: '无变化（预期）：backing/postLevel/canvas 全同，0 longtask',
      },
    ],
    verify: optVerify.results.map((r) => ({
      id: r.id, ok: r.ok, info: r.info, avgMs: r.probe?.avg, p95: r.probe?.p95, longtasks: r.probe?.longtasks,
      shots: r.shots, resourceErrors: r.resourceErrors, pageErrors: r.pageErrors, infoAfterResize: r.infoAfterResize, error: r.error,
    })),
    regression: {
      note: 'GPU 路径回归（flow-gpu-opt.json）：frameCap/resize/visibility/frozen/60s 内存与优化前一致，无新 longtask。',
      frameCap: flowOpt.suites.frameCap.map((c) => ({ cap: c.state?.cap, renderFps: c.renderFps, renderAvgMs: c.render?.avg, stepsPerSec: c.state?.stepsPerSec, longtasks: c.raf?.longtasks })),
      resize: flowOpt.suites.resize.map((r) => ({ viewport: Array.isArray(r.viewport) ? r.viewport.join('x') : r.viewport, canvasPx: Array.isArray(r.canvasPx) ? r.canvasPx.join('x') : r.canvasPx, renderAvgMs: r.render?.avg, worst: r.raf?.worst, blur: r.blur })),
      visibility: { syntheticFirstGap: flowOpt.suites.visibility.synthetic?.firstAfterResume?.firstGap, syntheticLongtasks: flowOpt.suites.visibility.synthetic?.raf?.longtasks, frozen: flowOpt.suites.visibility.frozen },
      memory: flowOpt.suites.memory ? { seconds: flowOpt.suites.memory.seconds, slopeKBps: flowOpt.suites.memory.slopeKBps, firstKB: flowOpt.suites.memory.firstKB, lastKB: flowOpt.suites.memory.lastKB, afterGcKB: flowOpt.suites.memory.afterGcKB } : null,
      bullets: flowOpt.suites.bullets.map((b) => ({ injected: b.injected, renderAvgMs: b.render?.avg, p95: b.raf?.p95, worst: b.raf?.worst, longtasks: b.raf?.longtasks })),
    },
    visual: '软光栅截图 opt-soft-1280x720.png / opt-soft-960x540.png / opt-soft-1920x1080.png：HUD 小字与弹幕可读、无错位；1920x1080 窗口下 canvas 1600x900 放大会略软但文字可读。GPU 截图 opt-gpu-1280x720.png 与优化前 env-B-r1.png 视觉一致（bloom/分级/颗粒保留）。',
    note: '软光栅下后期有意全关（bloom/分级/暗角/颗粒）换帧率；正常 GPU 完全走原路径，画质与行为零变化。',
  },

  decomp: {
    note: '手动串行 g.render(0.5) 计时；clean=插桩旁路；每场景 3 帧预热。数据在优化前采集：GPU postLevel=2（bloom 每帧开），软光栅当时自动降到 postLevel=1（bloom 关闭），优化后软光栅为 postLevel=0。软配置 clean 的 avg 被偶发 GC/并发负载异常帧拉高，p50/p95 更代表命令段成本。',
    gpu: { webgl: dGpu.webgl, scenes: dGpu.scenes.map(sceneRow) },
    soft: { webgl: dSoft.webgl, scenes: dSoft.scenes.map(sceneRow) },
    gpuSummary: {
      title: '0.20ms',
      stageIdle: '2.07ms（shell 1.82 + bloom 0.34）',
      stageFight: '2.06ms（shell 2.12 含子层；bloom 0.62）',
      bossFight: 'p50 2.4ms / p95 3.9ms（avg 18.3 被 377ms 异常帧拉高）',
      stress520: 'p50 1.6 / p95 1.9 / worst 54.9ms（520 发弹幕）',
      stress950: 'p50 1.6 / p95 5.9 / worst 53.9ms（949 发弹幕，GLOW 层自动关闭）',
      bloomForced: '5.26ms',
    },
    softSummary: {
      title: '0.13ms',
      stageIdle: 'p50 1.5 / p95 2.7ms（clean avg 108ms 被 2561ms 异常帧拉高）',
      stageFight: 'p50 1.8 / p95 4.2ms',
      bossFight: 'p50 1.7 / p95 3.6ms',
      stress950: 'p50 1.4 / p95 1716ms（含 1.7s 级异常帧，压缩后不可作为稳定均值）',
      interpretation: '软光栅下 JS 命令段 p50 仍在 1.5-2.3ms，实时 rAF 却 144ms/帧 → 差额 ~140ms 在合成/上屏光栅（WARP 对 1920x1080 画布），不是 canvas2D 命令本身；postLevel 自适应从 2 降到 1（关 bloom）已生效。',
    },
  },
  flow: {
    note: 'GPU headless（rAF 无 vsync，空闲 tick 4.16ms≈240Hz）；render fps 由 g.render 包装时间戳统计。',
    frameCapDirect: flow.suites.frameCap.map((c) => ({
      cap: c.state?.cap, targetFps: c.state?.cap === 0 ? '不限' : c.state?.cap,
      measuredRenderFps: c.renderFps, renderAvgMs: c.render?.avg, renderP95: c.render?.p95,
      rafAvg: c.raf?.avg, rafWorst: c.raf?.worst, longtasks: c.raf?.longtasks,
      stepsPerSec: c.state?.stepsPerSec,
    })),
    frameCapSettingsUI: flow.suites.frameCapUI.filter((c) => c.label).map((c) => ({
      label: c.label, cap: c.state?.cap, renderFps: c.renderFps, renderAvgMs: c.render?.avg, stepsPerSec: c.state?.stepsPerSec,
    })),
    uiPathNote: '经 设置页 KeyF 循环切换（Escape→KeyS→KeyF×N），与直接改 g.loop.frameCap 结果一致；设置页打开期间 state=paused 但渲染继续。',
    musicOnOff: { on: flow.suites.musicOn?.renderFps, note: 'WebAudio 合成开/关均 ~236fps（renderAvg 4.17ms），未观察到音乐导致的掉帧' },
    bulletStress: flow.suites.bullets.map((b) => ({
      injected: b.injected, active: b.bulletCount, renderFps: b.renderFps, renderAvgMs: b.render?.avg,
      rafAvg: b.raf?.avg, p95: b.raf?.p95, p99: b.raf?.p99, worst: b.raf?.worst, longtasks: b.raf?.longtasks, stepsPerSec: b.state?.stepsPerSec,
    })),
    resize: flow.suites.resize.map((r) => ({
      viewport: Array.isArray(r.viewport) ? r.viewport.join('x') : r.viewport,
      canvasPx: Array.isArray(r.canvasPx) ? r.canvasPx.join('x') : r.canvasPx,
      cssPx: Array.isArray(r.cssPx) ? r.cssPx.join('x') : r.cssPx,
      backingRatio: r.backingRatio, renderAvgMs: r.render?.avg, rafWorst: r.raf?.worst, longtasks: r.raf?.longtasks,
      blur: r.blur, shot: r.shot,
    })),
    resizeNote: 'canvas 后备像素恒为 1920x1080（renderer.js:92 backing=min(max(scale*dpr,1.5),2.5) 下限 1.5），窗口只改 CSS 尺寸；320x240 时上下黑边 letterbox，画面锐利无错位。',
    visibility: {
      synthetic: flow.suites.visibility.synthetic && {
        duringHidden: { frames: flow.suites.visibility.synthetic.mid?.renders, steps: flow.suites.visibility.synthetic.mid?.steps, t: flow.suites.visibility.synthetic.mid?.t },
        hiddenFramesInProbe: flow.suites.visibility.synthetic.raf?.hiddenFrames,
        firstAfterResumeGapMs: flow.suites.visibility.synthetic.firstAfterResume?.firstGap,
        firstGaps: flow.suites.visibility.synthetic.firstAfterResume?.gaps,
        afterRafWorst: flow.suites.visibility.synthetic.raf?.worst,
        afterLongtasks: flow.suites.visibility.synthetic.raf?.longtasks,
        renderDelta: flow.suites.visibility.synthetic.renderDelta, stepDelta: flow.suites.visibility.synthetic.stepDelta, tDelta: flow.suites.visibility.synthetic.tDelta,
      },
      frozen: flow.suites.visibility.frozen,
      note: 'headless 下覆盖 document.visibilityState 不会真的停 rAF（2 秒内仍跑 483 帧），loop.js:50-61 的 _onVisibility 只清 acc/_lastRenderAt 防积压；CDP Page.setWebLifecycleState(frozen) 才能真正停主线程，回 active 无补步/无跳变。',
    },
    memory60s: {
      seconds: flow.suites.memory.seconds, slopeKBps: flow.suites.memory.slopeKBps,
      firstKB: flow.suites.memory.firstKB, lastKB: flow.suites.memory.lastKB, afterGcKB: flow.suites.memory.afterGcKB,
      samples: flow.suites.memory.samples,
      note: '期间 t≈20s 暂停 2s、t≈30s 切标题 3s 再回关卡；heap 呈 GC 锯齿而非单调增长。',
    },
    memoryDom15s: memDom,
  },
  hotspotLines: [
    'src/engine/renderer.js:114-122  backing = clamp(scale*dpr, lowSpec?1.0:1.5, lowSpec?1.25:2.5)；GPU 下 1280x720@dpr1 仍渲染 1920x1080，软件光栅降为 1280x720',
    'src/engine/renderer.js:194-231  present：postLevel===0 直接返回（软光栅），否则 bloom→分级→暗角→颗粒四层全屏合成',
    'src/engine/renderer.js:264-291  bloom：整帧读回 1/4 + filter blur + lighter 放大叠回（GPU 0.62ms/帧，WARP 下 >30ms 触发自动降级）',
    'src/engine/renderer.js:20-40,70  detectSoftwareRaster()（UNMASKED_RENDERER 正则）；软件光栅 postLevel=0、跳过颗粒',
    'src/game/stage.js:1564-1582  地面雾/环境/饱和三张全屏渐变（fillRect）',
    'src/game/stage.js:1641-1645  castFx 全屏 lighter radial 特效',
    'src/game/stage.js:1284  _drawPaintedBg（预烘焙背景 drawImage）；:1461-1467 天气层 lighter',
    'src/game/bullets.js:45,917-923  GLOW_MAX=560：≤560 发时额外叠加 lighter 辉光层，峰值 949 发时自动关闭',
    'src/game/playerShots.js:566/587/613/630/640  玩家射击/消弹 5 处 lighter 合成',
    'src/engine/loop.js:50-61  visibilitychange 时清 acc/_lastRenderAt（丢积压不补帧）；:88-106 delta>0.25 截断、每帧最多 4 步',
  ],
  conclusions: {
    headlessArtifact: '是。--disable-gpu 下 WebGL 后端为 Microsoft Basic Render Driver（WARP 软件光栅），优化前同 build 同操作 144.19ms/帧（6.9fps）、48 个 longtask；优化后（PF-11）30.83ms/帧、2 个 longtask。不禁 GPU 的 headless 4.19ms/帧（239fps）、有头窗口 4.86ms/帧、longtask 0。最简 canvas 页在 WARP 下也能 60fps（17.09ms），证明测量方法与 headless rAF 本身没坏——慢的是游戏每帧 2.07MP 绘制量在软件光栅下被放大。',
    realPlayer: '正常 GPU 浏览器（独显/集显现代驱动）60fps 稳：道中 g.render≈2.0-2.1ms/帧，占 16.7ms 预算 12%；同屏 949 弹幕 p95 4.3ms、worst 8.5ms；frameCap 60 实测 58.9-59.2fps、逻辑 stepsPerSec 59.5-61.5。真正会掉帧的场景：① 浏览器被禁用 GPU / 远程桌面 / 虚拟机 / 显卡驱动黑名单（WARP 软光栅：优化前 6-7fps，已由 PF-11 降到 ~32fps、longtask 48→2）；② 高 DPR + force-device-scale-factor=2（软光栅优化前 342ms/帧，优化后 79.5ms；真实 GPU 仍 4.3ms）；③ 首帧/切场景一次性尖峰（有头窗口 worst 最多 223ms、注入 520 弹首帧 87-100ms，随后恢复）。',
    needCodeChange: '已实施（PF-11，仅改 src/engine/renderer.js）：软件光栅时 backing=clamp(scale*dpr,1.0,1.25)、postLevel=0（关全部后期）、跳过颗粒、暴露 window.__rendererInfo；实测软光栅 144.19→30.83ms（4.7×，longtask 48→2）、dsf2 342.04→79.49ms（4.3×）；GPU 路径 4.19ms/backing 1.5/canvas 1920x1080/postLevel 2 与画质不变。',
  },
  evidence: {
    envBefore: '_pt/perf/env-before.json', envAfter: '_pt/perf/env-after.json', envSummaryAfter: '_pt/perf/env-summary-after.json',
    decompGpu: '_pt/perf/decomp-gpu.json', decompSoft: '_pt/perf/decomp-soft.json',
    flowGpu: '_pt/perf/flow-gpu.json', flowGpuAfter: '_pt/perf/flow-gpu-opt.json', memDom: '_pt/perf/mem-dom-20s.json',
    optVerify: '_pt/perf/opt-verify.json',
    screenshots: ['_pt/perf/env-A-r1.png', '_pt/perf/env-B-r1.png', '_pt/perf/env-F-r1.png', '_pt/perf/resize-gpu-320x240.png', '_pt/perf/resize-gpu-1920x1080.png', '_pt/perf/opt-soft-1280x720.png', '_pt/perf/opt-soft-960x540.png', '_pt/perf/opt-soft-1920x1080.png', '_pt/perf/opt-soft-dsf2.png', '_pt/perf/opt-gpu-1280x720.png'],
    scripts: ['tools/_pt_perf_env.mjs', 'tools/_pt_perf_decomp.mjs', 'tools/_pt_perf_flow.mjs', 'tools/_pt_perf_mem.mjs', 'tools/_pt_perf_verify_opt.mjs', 'tools/_pt_perf_split_before.mjs', 'tools/_pt_perf_lib.mjs', '_pt/perf/instr.js', '_pt/perf/decomp-page.js', '_pt/perf/baseline.html'],
  },
};

const findings = [
  {
    id: 'PF-1',
    title: '基线 6fps 是 headless --disable-gpu 的 WARP 软件光栅伪影，不是真实玩家帧率',
    severity: 'info',
    where: '环境配置：headless=new + --disable-gpu（WARP）；源码 src/engine/renderer.js:92',
    measure: {
      config: 'A: headless --disable-gpu 1280x720 vs B: headless 默认 GPU 1280x720 vs F: 有头 GPU 1280x720；同 build 真键盘进 stage1 操作 6 秒',
      avg: { A: 144.19, B: 4.23, F: 4.86 }, p50: { A: 141.65, B: 4.2, F: 4.2 },
      p95: { A: 166.7, B: 4.3, F: 8.35 }, p99: { A: 208.3, B: 4.5, F: 10.55 },
      worst: { A: 208.3, B: 20.8, F: 223 }, longtasks: { A: 48, B: 0, F: 0 },
    },
    expect: '若测量方法/headless 本身有 6fps 天花板，则最简 canvas 页也应只有 6fps。',
    actual: '最简 canvas 页（1000 矩形/100 渐变圆/全屏 blend）在 WARP 下 17.09ms/帧（≈60fps，183 帧/3s，longtask 0）；游戏换 GPU 后 4.23ms/帧。A 的 renderer 字符串=ANGLE (Microsoft, Microsoft Basic Render Driver…)，B/F=ANGLE (NVIDIA RTX 5090)。',
    evidence: ['_pt/perf/env-summary.json', '_pt/perf/env.json', '_pt/perf/decomp-soft.json'],
  },
  {
    id: 'PF-2',
    title: '真实 GPU 路径 60fps 稳：g.render 2.0-2.1ms/帧，同屏 949 弹幕 p95 4.3ms',
    severity: 'info',
    where: 'src/main.js:1833 render(alpha)；src/engine/renderer.js:152-185 present；src/game/stage.js:1536 draw',
    measure: {
      config: 'GPU headless（ANGLE D3D11/RTX 5090）1280x720；道中实战/标题/Boss/注入 520、950 弹幕；decomp 为手动 g.render，flow 为实时 rAF',
      avg: { title: 0.2, stageIdle: 2.07, stageFight: 2.06, bossFight_p50: 2.4, bullets950: 5.76, liveFrame: 4.23 },
      p95: { stageFight: 3.1, bossFight: 3.9, bullets950: 5.9, liveFrame: 4.3 },
      worst: { stageFight: 3.9, bossFight: 377, bullets950: 53.9, liveFrame: 20.8 },
      longtasks: 0,
    },
    expect: '60fps 需每帧 <16.7ms；正常 GPU 应留出明显余量。',
    actual: '实时 rAF 4.16-4.23ms/帧（236fps，headless 无 vsync），渲染 JS 2.0-2.1ms 占 16.7ms 预算约 12%，余量约 8×；949 发弹幕下实时 p95 4.3ms、worst 8.5ms、longtask 0。',
    evidence: ['_pt/perf/decomp-gpu.json', '_pt/perf/flow-gpu.json', '_pt/perf/env-summary.json'],
  },
  {
    id: 'PF-3',
    title: '软件光栅下 144ms/帧中约 140ms 是 WARP 合成/上屏光栅，canvas2D 命令段仅 1.5-2.3ms（p50）',
    severity: 'minor',
    where: 'src/engine/renderer.js:159,165,181（post 三层）；src/game/stage.js:1564-1582、1641-1645（全屏渐变/特效）；renderer.js:220-240 bloom 读回',
    measure: {
      config: '软光栅（WARP）vs GPU，手动 g.render 与实时 rAF 对照',
      avg: { softLiveRaf: 144.19, softManualRenderP50: 1.5, softManualRenderStageFightP50: 1.8, gpuManualRender: 2.06, gpuLiveRaf: 4.23 },
      p95: { softManualRender: 2.7, softStageFight: 4.2, gpu: 3.1 },
      p99: 208.3, worst: 2561,
      longtasks: 48,
    },
    expect: '若 JS/canvas 命令是瓶颈，手动 g.render 时间应接近实时帧间隔。',
    actual: '手动 g.render p50 1.5-2.3ms，但实时 rAF 144ms → 差额在 rAF 的合成/光栅阶段（CDP ScriptDuration 仅 13ms/s，TaskDuration 1144ms/s）。软光栅下 postLevel 自适应从 2 降到 1（关 bloom），说明降级机制生效；剩余成本来自 1920x1080 画布每帧上屏。已由 PF-11 处理：软光栅下 backing 降 1.0-1.25、postLevel=0，实时帧间隔降到 30.83ms（rAF 合成仍是主要成本）。',
    evidence: ['_pt/perf/decomp-soft.json', '_pt/perf/env-summary.json', '_pt/perf/decomp-gpu.json'],
  },
  {
    id: 'PF-4',
    title: 'backing 下限 1.5×：1280x720 窗口也渲染 1920x1080（2.07MP），软光栅/低端路径成本被放大',
    severity: 'minor',
    where: 'src/engine/renderer.js:92 `backing = Math.min(Math.max(scale*dpr,1.5),2.5)`',
    measure: {
      config: '1280x720 vs 1920x1080 vs force-device-scale-factor=2，soft 与 GPU',
      avg: { soft1280: 144.19, soft1920: 172.7, softDsf2: 342.04, gpu1280: 4.23, gpuDsf2: 4.3 },
      p95: { soft1280: 166.7, softDsf2: 375.05, gpuDsf2: 4.3 },
      p99: { softDsf2: 383.35, gpuDsf2: 8.35 },
      worst: { softDsf2: 383.35, gpuDsf2: 25.05 },
      longtasks: { soft1280: 48, softDsf2: 24, gpuDsf2: 0 },
    },
    expect: '窗口缩小应等比降低渲染像素与耗时；canvas 后备像素应与 CSS 尺寸匹配。',
    actual: '窗口 1280x720/1920x1080 时 backing 均 1.5，canvas 恒 1920x1080；dsf2 时 backing 2、canvas 2560x1440，软光栅 avg 从 144→342ms。真实 GPU 下 dsf2 仍 4.3ms/帧，无影响。已由 PF-11 修复：软光栅下 backing=clamp(scale*dpr,1.0,1.25)、canvas 1280x720/1600x900，avg 144→30.83ms、342→79.49ms；GPU 仍 1920x1080/4.19ms。',
    evidence: ['_pt/perf/env-summary.json', '_pt/perf/flow-gpu.json'],
  },
  {
    id: 'PF-5',
    title: 'frameCap 0/60/120/30 实测精准，逻辑 stepsPerSec 稳定 59.5-61.5，UI 设置路径一致',
    severity: 'info',
    where: 'src/engine/loop.js:63-110（minInterval/due）；src/main.js:739 FRAME_CAPS、_adjustFrameCap',
    measure: {
      config: 'GPU headless 1280x720；直接 g.loop.setFrameCap 与 设置页 KeyF 两条路径各 4 档',
      avg: { cap0: 4.17, cap60: 16.66, cap120: 8.33, cap30: 33.34 },
      p50: { cap0: 4.2, cap60: 16.7, cap120: 8.3, cap30: 33.3 },
      p95: { cap0: 4.4, cap60: 16.8, cap120: 8.5, cap30: 33.5 },
      p99: { cap0: 4.7, cap60: 17.0, cap120: 8.7, cap30: 33.6 },
      worst: { cap0: 9.3, cap60: 17.2, cap120: 9.5, cap30: 33.6 },
      longtasks: 0,
    },
    expect: '实测渲染间隔应等于 1000/cap；逻辑固定 1/60，stepsPerSec 应≈60。',
    actual: 'render fps 240 / 59.2 / 118.1 / 29.4（0 档受 headless 无 vsync 影响，实机 60Hz 屏会锁 60）；stepsPerSec 60 / 59.5 / 59.5 / 61.5；UI 路径 235.1 / 58.8 / 118.4 / 29.8，一致。',
    evidence: ['_pt/perf/flow-gpu.json'],
  },
  {
    id: 'PF-6',
    title: '同屏弹幕峰值压测：949 发 p95 4.3ms/worst 8.5ms/0 longtask；520 发首帧尖峰 87ms',
    severity: 'info',
    where: 'src/game/bullets.js:45 GLOW_MAX=560、:917-923 辉光层开关、:914 draw',
    measure: {
      config: 'GPU headless；脚本用 stage.bullets.spawn 注入 520/950 发静止弹幕（不改上限），实时 rAF 2.6 秒',
      avg: { bullets520: 4.47, bullets950: 4.21 },
      p95: { bullets520: 4.3, bullets950: 4.3 },
      p99: { bullets520: 8.4, bullets950: 8.2 },
      worst: { bullets520: 87.4, bullets950: 8.5 },
      longtasks: 0,
    },
    expect: '峰值弹幕不应造成 >50ms 卡顿或掉出 60fps。',
    actual: '两者 render fps 221/234，worst 仅 520 注入当帧 87ms（一次性，随后恢复），无 longtask；950 发时因 >GLOW_MAX=560 自动关闭加法辉光层，反而比 520 发更便宜（4.22 vs 4.46ms）。',
    evidence: ['_pt/perf/flow-gpu.json', '_pt/perf/decomp-gpu.json'],
  },
  {
    id: 'PF-7',
    title: 'resize 后 canvas 后备尺寸不变（恒 1920x1080），首秒 worst 4.3-4.5ms，320x240 无模糊/错位',
    severity: 'info',
    where: 'src/engine/renderer.js:80-126 fit()；截图 _pt/perf/resize-gpu-*.png',
    measure: {
      config: 'GPU headless；1280x720→800x600→1920x1080→320x240→回 1280x720，每次 resize 后测 1 秒',
      avg: 4.17, p95: 4.3, p99: 4.4, worst: 4.5, longtasks: 0,
    },
    expect: 'resize 应触发 fit() 重排，不应出现长时间卡顿或画面错位/模糊。',
    actual: '五次 resize 渲染均 4.17ms/帧，worst 4.3-4.5ms；canvas 恒 1920x1080、CSS 从 1280x720 缩到 320x180（letterbox 黑边），截图锐利无错位。',
    evidence: ['_pt/perf/flow-gpu.json', '_pt/perf/resize-gpu-320x240.png', '_pt/perf/resize-gpu-1920x1080.png'],
  },
  {
    id: 'PF-8',
    title: '切后台 2 秒：回前台首帧 4.2ms、无 longtask、无跳帧/卡死；frozen 期间主线程真停且回来自动恢复',
    severity: 'info',
    where: 'src/engine/loop.js:50-61 _onVisibility、:88-106 maxDelta=0.25/maxSteps=4',
    measure: {
      config: 'GPU headless；覆盖 visibilityState 模拟 hidden 2s + CDP Page.setWebLifecycleState(frozen) 2s→active',
      avg: 4.2, p95: 4.3, p99: 7.3, worst: 7.3, longtasks: 0,
    },
    expect: '回前台不应有几百 ms 卡顿；逻辑不应一次性补太多步导致跳帧/瞬移。',
    actual: '合成 hidden 2s 内 headless 仍跑 483 帧（rAF 未真停），回前台首帧间隔 4.2ms、lastGaps 全 4.0-4.2ms、worst 7.3ms；_onVisibility 清 acc 防止积压补步。真实 frozen 期间 rAF=0、t/步数不变，回 active 一帧内恢复，无跳变。',
    evidence: ['_pt/perf/flow-gpu.json'],
  },
  {
    id: 'PF-9',
    title: '60 秒长跑无泄露证据：heap 10.8→14.1MB 呈 GC 锯齿（毛斜率 59KB/s），DOM/ canvas 数恒定',
    severity: 'info',
    where: '页面运行时（渲染器/关卡对象池）；无源码行',
    measure: {
      config: 'GPU headless 60s（含 t≈20s 暂停 2s、t≈30s 切标题 3s 再回关卡）；另 15s 独立站桩采样 DOM',
      avg: 59.07, p95: null, p99: null, worst: null, longtasks: 0,
      heapUsedKB: { start: 10595, end: 13816, afterGc: 8883 },
      domElements: { start: 187, end: 187, delta: 0 },
      canvases: { start: 5, end: 5, delta: 0 },
    },
    expect: '若泄露：heap 应单调上升且 GC 后不回落，DOM/canvas 节点数持续增长。',
    actual: '60s 内 7 次采样 10.8/11.9/12.9/16.3/13.9/14.9/14.1MB（切场景后回落，非单调）；独立 15s 采样 GC 后 8.9MB、DOM 恒 187、canvas 恒 5、子弹/敌人/射击池稳定。判定：无泄露证据，毛增长率是堆扩容锯齿。',
    evidence: ['_pt/perf/flow-gpu.json', '_pt/perf/mem-dom-20s.json'],
  },
  {
    id: 'PF-10',
    title: 'GPU 每帧 4.2ms 构成：渲染 JS 2.0-2.1ms（stage.draw ~1.8 + bloom 0.62 + 其余），其余为合成/驱动；60fps 余量 ~8×',
    severity: 'info',
    where: 'src/engine/renderer.js:152-185 present、:220-240 bloom；src/game/stage.js:1536-1650 draw',
    measure: {
      config: 'GPU headless 1280x720；decomp 场景 + live rAF + CDP metrics',
      avg: { liveFrame: 4.23, renderJs: 2.06, stageShell: 2.12, bloom: 0.62, liveTaskMsPerSec: 409.8, liveScriptMsPerSec: 305.7 },
      p95: { renderJs: 3.1, liveFrame: 4.3 }, p99: { renderJs: 3.2, liveFrame: 4.5 }, worst: { renderJs: 3.9, liveFrame: 20.8 },
      longtasks: 0,
    },
    expect: '拆分出每帧最贵的前几类：后期 bloom 读回、stage 绘制（含约 900 次 lighter 合成/帧）。',
    actual: 'stage.shell 1.82ms（含子层）、renderer.bloom 0.62ms、其余 present 层 <0.3ms；每帧 lighter 合成约 747-907 次（弹幕辉光/射击/特效），GPU 上总成本仍仅 2.06ms。软光栅时同一帧 ~144ms（优化前），且 bloom 被自动关掉。',
    evidence: ['_pt/perf/decomp-gpu.json', '_pt/perf/decomp-soft.json'],
  },
  {
    id: 'PF-11',
    title: '已实施：软光栅自动降档（backing 1.0-1.25 + 关全部后期），软光栅 144.19→30.83ms（4.7×）、dsf2 342.04→79.49ms；GPU 路径零变化',
    severity: 'info',
    where: 'src/engine/renderer.js:20-40 detectSoftwareRaster() / :70 postLevel / :114-122 backing / :160-168 window.__rendererInfo / :194-231 present',
    measure: {
      config: '优化前后同一 build、同一段真键盘 stage1 操作 6 秒 + 多分辨率截图；A soft 1280x720 / E1 soft dsf2 / B GPU 1280x720',
      before: {
        A: { avg: 144.19, p50: 141.65, p95: 166.7, p99: 208.3, worst: 208.3, longtasks: 48, backing: 1.5, canvas: '1920x1080' },
        E1: { avg: 342.04, p50: 341.6, p95: 375.05, p99: 383.35, worst: 383.35, longtasks: 24, backing: 2, canvas: '2560x1440' },
        B: { avg: 4.23, p95: 4.3, worst: 20.8, longtasks: 0, backing: 1.5, canvas: '1920x1080', postLevel: 2 },
      },
      after: {
        A: { avg: 30.83, p50: 33.3, p95: 41.75, p99: 41.75, worst: 58.3, longtasks: 2, backing: 1, canvas: '1280x720', postLevel: 0 },
        E1: { avg: 79.49, p50: 75, p95: 116.7, p99: 133.3, worst: 133.3, longtasks: 81, backing: 1.25, canvas: '1600x900', postLevel: 0 },
        B: { avg: 4.19, p95: 4.3, worst: 12.45, longtasks: 0, backing: 1.5, canvas: '1920x1080', postLevel: 2 },
      },
      verify: optVerify.results.map((r) => ({ id: r.id, info: r.info, avgMs: r.probe?.avg, p95: r.probe?.p95, longtasks: r.probe?.longtasks })),
    },
    expect: '软光栅 avg 从 ~144ms 降到 <70ms（目标 ~60ms 内），longtask 明显减少；GPU avg ~4.2ms、canvas 1920x1080、postLevel=2、视觉与优化前一致；无 JS 异常/404；resize/切后台/60s 长跑不回归。',
    actual: 'A soft 30.83ms（r1 25.16 / r2 36.5，longtask 48→2，canvas 1280x720，postLevel 0）✓ 达标；E1 dsf2 79.49ms（原 342.04ms，4.3×，canvas 1600x900）；B GPU 4.19ms/backing 1.5/canvas 1920x1080/postLevel 2、0 longtask，backing/postLevel/canvas 与视觉均不变（截图对比）；960x540/1920x1080 截图文字与弹幕可读；resourceErrors=[]、pageErrors=[]；GPU 回归 flow：frameCap 237/58.9/115.8/29.8、resize canvas 恒 1920x1080、frozen/visibility 正常、60s heap 斜率 53KB/s 无泄露。软光栅后期全关是预期降质换帧率。',
    evidence: ['_pt/perf/env-before.json', '_pt/perf/env-after.json', '_pt/perf/opt-verify.json', '_pt/perf/flow-gpu-opt.json', '_pt/perf/opt-soft-1280x720.png', '_pt/perf/opt-soft-960x540.png', '_pt/perf/opt-soft-1920x1080.png', '_pt/perf/opt-gpu-1280x720.png'],
  },
];

W('_pt/perf/perf.json', perf);
W('_pt/perf/findings.json', { generatedAt: new Date().toISOString(), author: 'perf', findings });
console.log('[report] wrote _pt/perf/perf.json and findings.json');
console.log('[report] env rows:', envSummary.length, 'decomp gpu scenes:', dGpu.scenes.length, 'soft scenes:', dSoft.scenes.length);
