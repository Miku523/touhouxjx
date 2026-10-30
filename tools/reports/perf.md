# 性能 / 流畅度审计 — 东方新纪行 v1.6.41（git 60908f8）

> 审计对象：C:\Users\GuSheng\Downloads\HKS（零构建静态页，Canvas2D 1280×720 逻辑分辨率 + 后期）
> 审计范围：只读 src/、index.html、sw.js；脚本与数据都在 tools/_x_*.mjs、tools/_pt/
> 结论时间：2026-10-30；Node v26.12.1；headless Edge；BASE=http://127.0.0.1:8138

## TL;DR（给忙人）

1. **GPU 路线没有性能问题**：RTX 5090 笔电 + D3D11，1280×720 / 1920×1080 全部场景 118–239fps，p95 ≤ 12.6ms，`>33ms` 长帧 0–1 个（那 1 个是 EXTRA 进场的一次性 hitch）。JS 每帧 2–2.5ms，预算余量巨大。
2. **软件光栅（WARP / 无独显老机 / 远程桌面）修补前不可玩**：1280×720 菜单 44fps、道中 24fps、Boss 16.7fps、EXTRA 弹幕 16fps；p95 帧 66–100ms，**33ms 以上长帧占 59%–100%**。每帧真实开销 50–66ms，其中 JS 只占 1.1–1.7ms → **95%+ 是 Canvas2D 光栅/合成**，不是脚本。
3. 三个最值钱的改动（同页 A/B 实测，非估算）：
   - `imageSmoothingQuality: 'high' → 'low'`：软件光栅 Boss 帧 68ms→32ms（2.1×，15→31fps）
   - 低配 backing 1.0→0.75：Boss 68ms→16.7ms（**60fps 撞顶**），EXTRA 77ms→25.5ms
   - 平台关三层全屏混合层 + 标题立绘每帧 shadowBlur：约 -9ms/帧 + 去掉菜单 150ms 级 hitch
4. **10 秒定长复测（标题 / 第一关道中 / 第一关 BOSS，各 10s，1280×720）**：软光栅 49.1 / 22.1 / 18–21.5fps，p95 33.4 / 66.7 / 66.8–83.4ms，**>50ms 长帧 2 / 63 / 58–81 个**；GPU 239.8 / 173.3 / 150.4fps，>50ms 长帧 **0 / 0 / 0**。GC 后 JS 堆：软 4.72/7.38/8.49MB、GPU 4.78/7.56/8.75MB（均为菜单→进关的正常热身增长，见 §4）。明细表见 §1.0。
5. **以上补丁已在 v1.6.42 工作树落地并复测（§1.5）**：软光栅标题 **60fps**、道中 **59.5fps**、BOSS **43.9fps**（修补前 49.1 / 23.8 / 21.5），>50ms 长帧 2 / 63 / 58 → **0 / 0 / 1**；GPU 无变化（BOSS 147.9fps，噪声内）。剩余唯一明显缺口是 BOSS 密集弹幕的 22.8ms/帧（p95 33.4、over33 44/439），下一步建议低配动态 backing 0.75→0.67→0.60（光栅成本随像素数线性下降，实测 0.75→0.60 = -32%），变档时用 skipPostFrames(2) 掩盖 resize hitch。

---

## 0. 方法与局限

- harness：`tools/_pt_core.mjs`（CDP，headless Edge），端口 9461–9470，各脚本独占端口。
- 帧时间探针：页内 rAF 时间戳（`installFrameProbe` / `readFrameProbe`），记录相邻 rAF 间隔；**fps = 1000/平均间隔**；`>33ms` 计为掉帧。
- 渲染耗时：包裹 `game.render`，测从进入 render 到返回的 JS 时间（软件光栅下这是"提交"，真正光栅化发生在浏览器合成阶段，不计入）。
- 场景：title（标题菜单）、stg_fight（STAGE4 道中）、boss（STAGE1 露米娅战，165–247 弹幕）、extra_dense（EXTRA 芙兰 10 卡，224–327 弹幕）、extra_cap60 / extra_low / extra_high（画质对照）。
- 每场景 6–8s 采样（title 5s），每项 ≥300 帧（软件光栅 Boss 只有 133 帧，已注明）。Lead 要求的 10 秒定长复测（标题/第一关道中/第一关 BOSS）结果见 **§1.0**（另跑 `_x_three10.mjs` + `_x_three10_fire.mjs`）。
- 局限：
  - headless Edge 的显示刷新是 **240Hz**（rAF 4.17ms），所以 GPU 列出现 238fps 这类"高于 60"的数字；真实 60Hz 屏上会 vsync 到 16.7ms，GPU 余量仍然极大。
  - 只有两种硬件：RTX 5090 笔电（GPU）与 Microsoft Basic Render Driver = WARP（软件），**没有真实弱核显（Intel UHD 等）样本**；真实弱 GPU 的表现只能从「软件光栅 + 强制后期」这一极端下界外推（见 §3）。
  - 输入延迟测的是「keydown handler 执行 → 下一次 render 入口里玩家 px 变化」，不是屏幕像素变化；见 §5 的说明。
  - HiDPI（deviceScaleFactor=2）两组配置启动失败（`launchCfg` 加 `--force-device-scale-factor=2` 后 boot 等待 30s 超时，`game 未启动`），**dpr/backing 的 HiDPI 成本未实测**，只有代码推算（§3.5）。

复现（新开 shell，每次一个端口）：

```
node tools/_x_perf_matrix.mjs            # 6 配置主矩阵（端口 9461-9466）
KEY=soft PORT=9463 node tools/_x_ablate.mjs   # 同页 A/B 消融
KEY=soft PORT=9463 node tools/_x_phases.mjs    # 阶段耗时
node tools/_x_mem.mjs                    # 90s 内存/GC（端口 9464/9465）
```

---

## 1. 基线帧时间

### 1.0 Lead 口径：10 秒三场景定长实测（1280×720 窗口；2026-10-30 复测）

脚本：`node tools/_x_three10.mjs`（软光栅→GPU 顺序跑，端口 9467/9468），原始数据 `tools/_pt/perf_three10.json`；"道中"另用 `node tools/_x_three10_fire.mjs`（端口 9469）补测了**按住射击键**的版本（平台关的玩家子弹在 `s.shots`，不在 `s.bullets`，故弹数快照为 0 属正常）。

| 环境（自动判定） | 场景 | fps 均值 | p50 | p95 | p99 | worst | >33ms | **>50ms** | 采样帧数 | GC 后 JS 堆 | canvas (backing) | 后处理 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 软光栅（WARP，auto→low） | 标题菜单 | 49.1 | 16.7 | 33.4 | 33.4 | 150.0 | 14 | **2** | 492 | 4.72MB | 1280×720 (1.0) | 关（postLevel 0） |
| 软光栅 | 第一关道中（53 敌，含射击） | 22.1 | 33.4 | 66.7 | 83.3 | 83.4 | 140 | **63** | 238 | 7.38MB | 1280×720 (1.0) | 关 |
| 软光栅 | 第一关 BOSS（露米娅 18123HP，86–287 弹） | 21.5 / 18.0 | 33.4 | 66.8 / 83.4 | 83.4 | 83.4 | 137 | **58 / 81** | 215 | 8.49MB | 1280×720 (1.0) | 关 |
| GPU（D3D11，auto→high） | 标题菜单 | 239.8 | 4.2 | 4.3 | 4.5 | 5.7 | 0 | **0** | 2403 | 4.78MB | 1600×900 (1.25) | 开（postLevel 2） |
| GPU | 第一关道中（53 敌） | 173.3 | 4.2 | 8.4 | 12.5 | 12.9 | 0 | **0** | 1734 | 7.56MB | 1600×900 (1.25) | 开 |
| GPU | 第一关 BOSS（144 弹） | 150.4 | 8.2 | 12.4 | 12.6 | 16.8 | 0 | **0** | 1505 | 8.75MB | 1600×900 (1.25) | 开 |

- 软光栅标题 49fps 比主矩阵的 43.9 略好（10s 窗口热身后更稳），道中 22.1fps 与主矩阵 23.8fps 一致；Boss 两次 21.5/18.0 的差别来自 BOSS 弹幕随时间累积（结束快照 86 vs 287 弹）。
- GPU 240Hz 读数（>150fps）是 headless 刷新率上限，不是游戏上限；>50ms 长帧为 0 说明**GPU 侧没有任何可感知卡顿**。
- 软光栅道中/BOSS 的 p50 已经 33.4ms（30fps 以下），p95 66.7–83.4ms（12–15fps）；**>50ms 长帧 63–81 个 / 10s** 意味着每 6–7 帧就有一次半秒级的"粘"——这就是"按钮不跟手"的直接来源。

### 1.5 补丁后复测（v1.6.42 工作树，2026-10-30 21:05）

> 说明：工作树里已经落了 P0-1/P0-2/P0-3/P1-2/P2-1 及「软光栅强选高」修复（**改动来自 Lead/其他 teammate，不是本审计脚本改的**；git 未提交）。本节数字是在**打了这些补丁的工作树**上复测的，其余章节的「修补前」数字仍对应 git HEAD 60908f8。复测脚本：node tools/_x_verify_patch.mjs（软端口 9470→GPU 9469），数据 tools/_pt/perf_patch_verify.json；强制高画质验证 tools/_x_verify_more2.mjs（端口 9467），数据 perf_patch_verify_more.json。

软光栅（WARP，1280×720 窗口）现在：backing **0.75（canvas 960×540）**、imageSmoothingQuality **low**、postLevel 0、stage.lowSpec true。

| 场景（10s 定长） | 修补前 fps / p95 / >50ms | **修补后** fps / p95 / >50ms | 变化 |
|---|---|---|---|
| 标题菜单 | 49.1 / 33.4 / 2 | **60.0** / 16.8 / **0** | 撞 60 顶；长帧清零 |
| 第一关道中（53 敌） | 23.8 / 66.7 / 63 | **59.5** / 16.8 / **0** | **2.5×** |
| 第一关 BOSS（露米娅，162 弹） | 21.5 / 66.8 / 58 | **43.9** / 33.4 / **1** | **2.0×**；p50 16.7、p95 33.4 |

- 修补后明细：标题 avg16.68 / p50 16.7 / p99 16.8 / worst 33.4 / over33 1 / 600 帧 / heap 4.73MB；道中 avg16.81 / p50 16.7 / p99 16.8 / worst 33.4 / over33 1 / 595 帧 / heap 7.45MB；BOSS avg22.78 / p50 16.7 / p95 33.4 / p99 33.4 / worst 50.1 / over33 44 / 439 帧 / heap 8.56MB。errors=[]。
- **GPU 路径未受影响**：BOSS 147.9fps（修补前 150.4，差在噪声内）、p95 12.5ms、>50ms 0 个、backing 1.25 / postLevel 2 / canvas 1600×900 / heap 8.37MB。
- **「软件光栅强选高 = 5–6fps」陷阱已修**：g._applyQuality('high') 后 rendererInfo 仍为 lowSpec:true / postLevel:0 / backing:0.75 / canvas 960×540（setQuality 里 const low = mode === 'low' || this.softwareRaster），实测 **50.1fps、p95 33.4、>50ms 0**（171 弹）——修补前同场景是 6.1fps / p50 166.7ms。

**剩余热点（BOSS 43.9fps）与 backing 的定量关系**（tools/_x_raster_bench.mjs，端口 9467，冻结同一弹幕 36 发 + 每帧 getImageData(0,0,1,1) 强制同步光栅，8 次取中位，数据 tools/_pt/perf_raster_bench.json）：

| backing | canvas | 单帧真实光栅 ms（36 弹） | 相对 0.75 |
|---|---|---|---|
| 1.0 | 1280×720 | 21.66 | 1.37× |
| **0.75（当前）** | 960×540 | **15.85**（复测 15.22） | 1.00× |
| 0.67 | 858×482 | 12.63 | 0.80× |
| 0.60 | 768×432 | 10.80 | 0.68× |
| 0.50 | 640×360 | 7.65 | 0.48× |

- 光栅成本**基本正比像素数**（0.75²→0.5² 像素比 0.44，实测时间比 0.48）。据此 BOSS 的 22.8ms/帧在 0.67 约 18ms（≈55fps）、0.60 约 15.5ms（≈60fps 边缘），但更软——建议做成**低配动态 backing**（P1-1 的一部分），而不是直接固定 0.6。
- 附带发现：软件光栅下**改变 canvas.width/height 后的第一帧要 164–244ms**（冻结 bench 里 0.67/0.6/0.75 每次 resize 后的首帧 max 200/164/235ms）。P2-1 的「值不变才赋值」已落地；后续任何**自动 backing 变更**都要配合 skipPostFrames(2)（main.js:1630 已有先例），否则每次变档都会有一次可感知卡顿。

### 主矩阵（每场景 6–8s；fps=1000/平均 rAF 间隔）

| 配置 | 场景 | fps | p50 | p95 | p99 | worst | >33ms 帧 | render avg | rint p50 | backing/post |
|---|---|---|---|---|---|---|---|---|---|---|
| gpu-1280 | title | 238.7 | 4.2 | 4.3 | 4.3 | 24.9 | 0 | 0.5 | 4.2 | 1.25/2 |
| gpu-1280 | stg_fight | 202.8 | 4.2 | 8.4 | 12.4 | 16.6 | 0 | 2.0 | 4.4 | 1.25/2 |
| gpu-1280 | boss | 118.2 | 8.3 | 12.6 | 16.6 | 16.8 | 0 | 2.3 | 8.5 | 1.25/2 |
| gpu-1280 | extra_dense | 166.4 | 4.2 | 8.5 | 12.5 | 91.7 | 1 | 2.4 | 5.8 | 1.25/2 |
| gpu-1280 | extra_cap60 | 234.2 | 4.2 | 4.3 | 8.3 | 12.4 | 0 | 2.5 | 16.7 | 1.25/2 |
| gpu-1280 | extra_low | 174.8 | 4.2 | 8.4 | 12.5 | 50.0 | 1 | 1.5 | 5.2 | 1/0 |
| gpu-1280 | extra_high | 169.2 | 4.2 | 8.5 | 12.5 | 16.6 | 0 | 2.1 | 5.8 | 1.25/2 |
| gpu-1920 | title | 238.1 | 4.2 | 4.3 | 4.3 | 20.8 | 0 | 0.5 | 4.2 | 1.5/2 |
| gpu-1920 | stg_fight | 222.2 | 4.2 | 8.3 | 8.4 | 12.5 | 0 | 1.9 | 4.2 | 1.5/2 |
| gpu-1920 | boss | 169.8 | 4.2 | 8.5 | 12.5 | 16.6 | 0 | 2.4 | 5.8 | 1.5/2 |
| gpu-1920 | extra_dense | 199.2 | 4.2 | 8.4 | 8.6 | 104.3 | 1 | 2.2 | 4.5 | 1.5/2 |
| gpu-1920 | extra_cap60 | 237.5 | 4.2 | 4.3 | 4.8 | 12.5 | 0 | 2.6 | 16.7 | 1.5/2 |
| gpu-1920 | extra_low | 182.8 | 4.2 | 8.4 | 12.5 | 79.2 | 1 | 1.3 | 4.7 | 1/0 |
| gpu-1920 | extra_high | 191.6 | 4.2 | 8.4 | 12.4 | 12.6 | 0 | 2.1 | 4.5 | 1.5/2 |
| soft-1280 | title | 43.9 | 16.7 | 33.4 | 50.0 | 150.0 | 11 | 0.2 | 22.1 | 1/0 |
| soft-1280 | stg_fight | 23.8 | 49.9 | 66.7 | 66.8 | 66.8 | 113 | 1.3 | 40.9 | 1/0 |
| soft-1280 | boss | 16.7 | 50.0 | 83.4 | 133.4 | 149.9 | 117 | 1.7 | 55.5 | 1/0 |
| soft-1280 | extra_dense | 15.9 | 66.6 | 99.9 | 100.0 | 100.1 | 120 | 1.5 | 61.0 | 1/0 |
| soft-1280 | extra_cap60 | 15.7 | 66.6 | 100.0 | 100.1 | 100.1 | 89 | 1.7 | 57.0 | 1/0 |
| soft-1280 | extra_low | 15.5 | 66.6 | 100.1 | 166.7 | 166.7 | 84 | 1.5 | 59.8 | 1/0 |
| soft-1280 | extra_high | 6.1 | 166.7 | 200.0 | 200.0 | 200.0 | 36 | 35.7 | 165.1 | 1.25/2 |
| soft-1920 | title | 29.9 | 33.3 | 70.6 | 133.3 | 133.4 | 36 | 0.3 | 27.9 | 1/0 |
| soft-1920 | stg_fight | 24.4 | 33.4 | 66.6 | 66.7 | 66.7 | 108 | 1.3 | 38.4 | 1/0 |
| soft-1920 | boss | 17.2 | 50.1 | 83.4 | 83.4 | 100.0 | 124 | 1.5 | 55.0 | 1/0 |
| soft-1920 | extra_dense | 15.0 | 66.7 | 100.0 | 100.0 | 100.0 | 114 | 1.8 | 65.4 | 1/0 |
| soft-1920 | extra_cap60 | 15.7 | 66.6 | 100.0 | 100.1 | 100.1 | 92 | 1.6 | 59.2 | 1/0 |
| soft-1920 | extra_low | 16.8 | 50.0 | 83.4 | 83.4 | 100.0 | 90 | 1.4 | 51.9 | 1/0 |
| soft-1920 | extra_high | 5.2 | 200.0 | 233.3 | 233.3 | 233.3 | 31 | 43.8 | 199.7 | 1.5/2 |

（时间单位 ms；rint = render 调用间隔；render avg = 包裹 `game.render` 的 JS 耗时，不含浏览器光栅化）

### 1.1 GPU：没有问题，余量很大

- 1280×720：Boss 战（165 弹幕）rAF p50 8.3ms（≈120fps，因为 240Hz 面板上每帧 JS+提交 2.3ms 仍跨不过 4.17ms vsync，掉到隔帧）；其余场景 p50 4.2ms。
- 1920×1080（backing 1.5，canvas 实际 1920×1080）：全部 p50 4.2ms，Boss p95 8.5ms，仍无长帧。
- `frameCap 60` 下 rint p50 正好 16.7ms（60Hz 锁帧生效，无漂移）；`>33ms` 长帧 0。
- 唯一黑点：**EXTRA 进场 / 切画质的一次性 hitch** —— gpu-1280 extra_dense worst **91.7ms**、gpu-1920 **104.3ms**；另有 `extra_low` 切档瞬间 50–79ms。玩家会看到一次约 0.1s 的冻结（发生在 EXTRA 开场，很可能被对白/淡入掩盖，但仍是真实长帧，见 §2.4 与 P2-1）。

### 1.2 软件光栅：目前是"不可玩"级别

以 soft-1280（HTML 页面 1280×720、backing 1.0、postLevel 0、quality auto→low，即自适应**已经**把后期全关、backing 压到 1.0 之后）：

- 道中 p50 **49.9ms**、Boss p50 **50.0ms**、EXTRA p50 **66.6ms** → 15–20fps。
- `>33ms` 长帧：道中 113/190（59%）、Boss 117/133（**88%**）、EXTRA 120/127（**94%**）。
- p99 / worst：Boss 133.4/149.9ms，EXTRA 100ms，标题画面 worst 150ms。
- soft-1920（窗口 1920×1080，backing 被 cap 到 1.0）与 soft-1280 基本同帧率（15–17fps），说明**只要 backing 锁 1.0，窗口大小几乎不影响**——因为像素数由 backing 决定；也说明 backing 是唯一有效的旋钮（§2.2）。

### 1.3 长任务（longtask）证据

软件光栅下主线程被光栅化阻塞：soft-1280 道中 57 个 longtask（单个 50–60ms）、Boss 81 个（最长 143ms）、EXTRA 87 个（最长 97ms）。**这说明帧时间不在 JS 里，而在浏览器的 Canvas2D 光栅/合成，且这段是主线程同步阻塞**——这既解释了掉帧，也解释了低帧时手感"粘"（输入事件要排队穿过这些长任务，见 §5）。

### 1.4 关于 240Hz 读数的说明

headless Edge 的 BeginFrame 是 240Hz，所以"fps 238"不是游戏上限而是屏幕刷新上限；对玩家的意义是：**GPU 上单帧成本 2–2.5ms（含后期 0.7ms），在 60Hz 的 16.7ms 预算里有 6 倍余量**。软件光栅上单帧 50–66ms，60Hz 预算的 3–4 倍，无法靠"少画几根线"救回来——必须减像素（§2.2）。

---

## 2. 每帧时间都去哪了

### 2.1 JS 绘制阶段：只占 2%–5%

（`tools/_x_phases.mjs`，包裹 `stage.draw` 的每个子步骤与 `renderer.present/bloom`；数字为"每帧"平均 ms）

| 机器 | 场景 | 弹幕 | JS draw 合计/帧 | 其中 shots | bullets | present | 实测帧长 |
|---|---|---|---|---|---|---|---|
| soft | boss | 57 | **1.37ms** | 0.55 | 0.41 | 0.001 | 60.0ms |
| soft | extra | 253 | **2.32ms** | 0.75 | 1.02 | 0 | 62.9ms |
| soft | stg | 17 | **1.13ms** | 0.79 | 0.05 | 0.001 | 42.0ms |
| gpu | boss | 25 | 2.50ms | 0.45 | 0.18 | 0.71 (bloom 0.69) | 8.5ms |
| gpu | extra | 128 | 3.43ms | 0.76 | 0.72 | 0.70 (bloom 0.68) | 6.0ms |
| gpu | stg | 12 | 2.81ms | 1.08 | 0.06 | 0.65 (bloom 0.63) | 4.9ms |

读法：软件光栅上 JS 绘制只占 1.4/60 = **2.3%**，GPU 上占 2.5/8.5 = 29%（GPU 的 render 是提交，帧时间由 vsync 决定）。**所以"优化 JS 循环"在弱机上几乎没用**；要动的是光栅化成本。

### 2.2 同页 A/B 消融：像素数 >> 一切

（`tools/_x_ablate.mjs`，同一页面、同一场景、逐变体切换，每变体 2.5s；avg = 平均 rAF 间隔）

| 变体 | Boss avg ms (fps) | Δ | EXTRA avg ms (fps) | Δ |
|---|---|---|---|---|
| base（现状 soft: backing1.0, post0, smoothing high） | 67.98 (14.7) | — | 77.27 (12.9) | — |
| 关弹幕（noBullets） | 64.96 (15.4) | -4%（噪声：弹幕数 84→219 漂移，不可用） | 79.29 (12.6) | 噪声 |
| 关特效（noFx） | 68.46 (14.6) | -0.7% | 70.83 (14.1) | -8% |
| 关敌机（noEnemies） | 68.47 (14.6) | -0.7% | 83.89 (11.9) | 噪声 |
| 关 Boss 本体（noBoss） | 67.54 (14.8) | -0.6% | — | — |
| 关背景（noBg） | 66.67 (15.0) | -1.9% | — | — |
| **关全屏覆盖层**（noOverlay，跳过 w≥1000&&h≥100 的 fillRect） | **58.91** (17.0) | **-13.3%** | **71.29** (14.0) | **-7.7%** |
| 关玩家+自机弹（noPlayer） | 57.95 (17.3) | -14.8% | — | — |
| **imageSmoothingQuality='low'** | **32.07 (31.2)** | **-52.8%** | — | — |
| **backing 0.75（canvas 960×540）** | **16.67 (60.0)** | **-75.5%（撞 vsync 上限）** | **25.51 (39.2)** | **-67%** |
| backing 0.67（858×482） | 16.67 (60.0) | 同上 | **18.78 (53.2)** | -75.7% |
| backing 0.50（640×360） | 16.67 (60.0) | 同上 | — | — |

结论（按贡献排序）：

1. **画布像素数（backing）是支配项**。0.75 让 Boss 从 15fps 直接顶到 60fps；0.67 让 EXTRA 到 53fps。像素降到 56% 得到 4× 提升，超线性——因为软件光栅里还有大量全屏填充/混合层，它们都随像素数线性（甚至更多）增长。
2. **`imageSmoothingQuality='high'` 在软件光栅上极贵**（每个 drawImage 缩放都要高质量重采样）→ 单这一项 2.1×。游戏里真正的"缩放贴图"很多：厚涂背景 2048×1160 cover 缩到画布、爆发/弹幕 sprite、标题立绘。
3. **全屏混合层**：平台关每帧 3 层贴屏幕下沿的全宽渐变填充，其中 `globalCompositeOperation='overlay'`（0.26α）和 `'saturation'`（1.0α，去饱和+统一色相）在软件光栅里是逐像素颜色矩阵。关掉后 **-9ms/帧**。注意标题画面还有一层 `shadowBlur=36` 的立绘阴影（每帧重算高斯模糊，main.js:3904-3907），这解释了 soft-1280 标题 22.8ms/帧（44fps）而不是 16.7。
4. 弹幕/敌机/Boss 本体在软件光栅上**单独特化"关掉"几乎不减帧**（-0.6~-0.7%），因为它们的绘制成本已经淹没在全屏填充与像素填充率里——这与"弹幕多所以卡"的直觉相反。GPU 上则相反：弹幕越多 JS 越忙（bullets 0.18→0.72ms），但 GPU 余量足够。
5. 后期 bloom 在软件光栅上是灾难：`extra_high`（强制高画质 = postLevel 2 + backing 1.25）时 `presentAvg=33.9ms/帧`（p95 146ms），其中 bloom 刷新平均 33.88ms——**主要是 `bctx.filter = 'brightness() contrast() saturate() blur()'` 整帧重采样 + 1/4 缓冲回读**（renderer.js:397-399），而 `auto` 模式在检测到软件光栅时已把 postLevel 设 0，所以正常玩不会踩到；但**手动选"高"会踩到，且没有自动逃生**（§3.2）。

### 2.3 每帧分配 / DOM / 重排

- **没有发现每帧 DOM 写入或 class 切换**。HUD 是 canvas 内绘制（`hudState` dirty-check，hud.js:402-406 只在 banner 时 reflow）；resize 走 `_onResize` 只在窗口变化时。
- **画布重分配**：`fit()` 里 `canvas.width/height` 是**无条件赋值**（renderer.js:141-142）。即使 backing 没变，赋值也会清空画布 + 触发 canvas 后端存储重建；`setQuality`/窗口 resize 时叠加 bloom 重建。这是切画质 50–80ms hitch 的一部分（§7 P2-1）。
- 每帧小分配（GC 噪音，非主因）：`camera.viewAt()` 每帧返回新对象（camera.js:59）、`stage.draw` 里 `_bgFor(theme).filter(...)` 每帧新数组、`_drawPaintedBg` 每帧重建 `layers` 数组、`get hudState()` 每步新对象、bullets 每颗 `save/rotate/restore`。改它们收益小（每帧几百字节级），但 GC 停顿可能是 EXTRA 进场 90–104ms hitch 的一部分（未证实）。
- 池/缓存：子弹池上限 1250（bulletCap），辉光分支 GLOW_MAX 560，背景变体层缓存 `_bgLayers`，渐变缓存 `_gradCache/_ensureGradWash`，监听器全部有成对 remove（renderer.destroy / input.destroy / loop.destroy），**src/ 里没有 setInterval**。静态看没有无界增长。

---

## 3. 自适应画质评估

### 3.1 现状：对"已识别的软件光栅"是对的

`detectSoftwareRaster()`（renderer.js:23-34）用 WebGL `UNMASKED_RENDERER_WEBGL` 匹配 `/swiftshader|basic render driver|microsoft basic|software|llvmpipe|warp/i`，实测在 `--disable-gpu` 下命中 `Microsoft Basic Render Driver` → `lowSpec=true` → `postLevel=0`、backing 锁 1.0、grain 跳过、bloom 全关。**这条路径确实生效了**（rinfo: `mode:'soft', postLevel:0, backing:1, qualityPicked:'low'`）。

### 3.2 问题 A（v1.6.42 工作树已修）：软件光栅下强选"高" = 5–6fps，且永不降级

`setQuality('high')` 把 `lowSpec=false`、`postLevel=2`、`autoDegrade=false`（设计意图："玩家手选高时不让自适应收走辉光"，renderer.js:206-211）。

实测（soft-1280 窗口，点高画质）：

| 指标 | extra_high |
|---|---|
| fps | **6.1**（soft-1920 只有 **5.2**） |
| p50 / p95 | 166.7 / 200ms（soft-1920 200/233ms） |
| render avg | 35.7ms（其中 present 33.9ms，p95 146ms） |
| >33ms 长帧 | 36/36（100%） |

玩家如果误选"高"（或从别的高配机器同步了设置/存档），会得到一个 5fps 的游戏，且**没有任何自动恢复**（`_tuneBloom` 的 `autoDegrade` 被禁用）。**【状态：v1.6.42 工作树已修，见 §1.5】** `setQuality` 现在为 `const low = mode === 'low' || this.softwareRaster;`（renderer.js:212-217），软光栅下强选「高」仍走 backing 0.75 / postLevel 0，实测 50.1fps、p95 33.4、>50ms 0（171 弹；修补前 6.1fps）。上表与以下文字均为**修补前**数据。这是产品/正确性问题，不只是性能问题：建议在 `setQuality` 检测到 `softwareRaster && mode==='high'` 时，至少弹一次"本机为软件渲染，已临时关闭辉光"并强制 `postLevel=1`，或把设置页的"高"在该硬件上禁用。

### 3.3 问题 B：自适应只覆盖"被识别的软件光栅"，真实弱 GPU 没有兜底

- `detectSoftwareRaster` 只匹配软渲染器字符串；**Intel UHD / Vega 8 / 老 MX 系列等真实弱 GPU 不会被识别**，会走 `floor=1.25`、`cap=2.5`、`postLevel=2` 的"高"路径。
- `auto` 模式在 GPU 上**唯一的自适应是 `_tuneBloom`**（调 bloom 刷新间隔 1→4，renderer.js:417-436），**不会降 backing、不会降低 smoothing、不会关 vignette/grain**。也就是说：如果一台弱 GPU 跑 1080p 只有 30fps，auto 只会把辉光刷新从每帧降到每 4 帧，其它照旧。
- `_trackBloomRecovery`（renderer.js:327-348）用于"辉光关掉后稳定了再有限次重试"：只在 `postLevel===1 && autoDegrade && !lowSpec` 时工作，最多 3 次、间隔 `12s×retry`，失败后永久关闭。**这不会产生无限振荡**（有界 3 次 + 退避），但代价是：在"刚好卡在临界"的机器上，辉光会在 2 秒内被关、然后 12s 后重试、再关……最多 3 次；体感上是"菜单看得到辉光，进关一会儿辉光没了"。这属于可接受的折中，但如果要更稳，恢复判定应该看 **backing/画质综合帧时间**，而不是只重试 bloom。

### 3.4 `setQuality('low')` 实测收益

| 配置 | 场景 | default(auto) render | low render | 帧时间变化 |
|---|---|---|---|---|
| gpu-1280 | extra_dense | 2.39ms（backing1.25/post2） | 1.52ms（backing1.0/post0） | rAF 都是 vsync 驱动，帧率不变（240→240 附近），省 CPU/发热 |
| gpu-1920 | extra_dense | 2.23 | 1.26 | 同上 |
| soft-1280 | extra_dense | 1.49（已是最低档） | 1.54 | 无变化（auto 已`low`） |

结论：**低档在强机上只省 JS/填充率不改变帧率**（因为 GPU 早已满帧），在弱机上则"已经是最低"——所以对软件光栅，低档不是药，**低档里的 backing/smoothing 参数才是药**（P0-1/P0-2）。

### 3.5 dpr / HiDPI（未实测，代码推算）

`dpr = min(devicePixelRatio, 2)`（构造），`backing = clamp(scale*dpr, floor, cap)`：在 1920×1080 窗口 + Windows 150% 缩放（dpr=1.5）时，`scale=1.5` → `backing=min(1.5*1.5=2.25, 2.5)=2.25` → canvas **2880×1620 = 4.7MP**，是 1280×720（0.92MP）的 **5.1 倍像素**。弱 GPU 上这一项足以单独打穿 60fps。建议：`auto` 档给 backing 加"帧时间预算"上限（P1-1），或至少在 `hardware` 非软件时把 cap 从 2.5 降到 2.0。**这条需要 dsf=2/1.5 的真机复核**（本次 dsf2 配置启动失败）。

---

## 4. 内存 / GC

90s 长采样（`node tools/_x_mem.mjs`，端口 9464/9465；HeapProfiler 分配采样 + 12 次场景切换计数 + 每秒 performance.memory；原始数据 `tools/_pt/perf_mem_{gpu,soft}.json`、`perf_mem_summary.json`；errors=[]）：

| 指标 | gpu-1280 | soft-1280 |
|---|---|---|
| 启动后堆（heap0） | 4.89MB | 4.83MB |
| 进游戏后（heapA） | 7.81MB | 7.72MB |
| 90s 结束（heapB） | 9.54MB | 8.51MB |
| 89/84 次采样 used 范围 | 8.06–12.53MB（振荡，GC 正常） | 7.78–9.58MB（平稳） |
| 12 次场景切换 ΔNodes / Δlisteners / ΔDocuments / ΔHeap | +29 / +15 / 0 / +1.69MB | +33 / +11 / 0 / +0.78MB |
| AudioHandlers 起→终 | 30→17（**释放**） | 32→27（**释放**） |
| Nodes / JSEventListeners 起→终 | 1258→1339 / 165→162 | 1200→1324 / 137→166 |
| 空闲 10s 窗口 | 2395 帧 avg 4.18ms p95 4.3，over33=0 | 466 帧 avg 21.46ms p95 33.4，over33=22 |

- 主矩阵内嵌 1s 采样（`memq`，soft-1280 EXTRA 段）：usedJSHeap **12.39 → 12.06 → 11.74 → 11.71 → 12.09 → 11.66MB**（中间触发过 GC），总堆 13.9–14.7MB，**无趋势性增长**；场景结束 `heapAfterGC = 11.36MB`。
- 10s 三场景 GC 后堆：软 4.72/7.38/8.49MB、GPU 4.78/7.56/8.75MB（§1.0）——菜单→进关的阶梯式增长是精灵/关卡资源的正常热身，进关后 10s 内不再阶梯上涨。
- HeapProfiler 采样热点（全程累计，不是泄漏，只是分配量）：`tick @ :6` 925KB、`_tick @ engine/loop.js:84` 79KB、`node.onended @ engine/audio.js:660` 38KB、`_getSpr @ game/bullets.js:1149` 34KB、`draw @ game/fx.js:387` 27KB、`spawn @ game/bullets.js:799` 24KB、`draw @ game/bullets.js:1038` 20KB；软光栅 `node.onended` 55KB、`spawn` 24KB。
- 结论：**没有发现无界泄漏**——12 次切换只增加 11–33 个节点/11–15 个监听器（有界，属懒加载资源），音频节点反而减少；堆在热身期翻倍后进入平台期。GC 只是 EXTRA 进场 90–104ms hitch 的嫌疑之一（未证实，P2-1 会顺带覆盖）。唯一需长期观察的是 GPU 堆 heapB(9.54) > heapA(7.81)，建议后续跑 10 分钟以上复核是否收敛。

---

## 5. 输入延迟

测法：在页面里注入 keydown 监听（捕获阶段）记录 `performance.now()`，然后逐帧检查玩家 px 是否变化，取"第一次 render 入口时 px 已变"的时间差。**这不是屏幕像素延迟**，但能判断"输入是否被 rAF 采样额外拖了一帧"。

| 配置 | native(cap0) median | cap60 median | cap30 median | native max |
|---|---|---|---|---|
| gpu-1280 | 4.7ms | 14.4ms | 20.1ms | 12.4ms |
| gpu-1920 | 8.2ms | 10.4ms | 17.7ms | 13.5ms |
| soft-1280 | 0.6ms | 0.4ms | 0.5ms | 1.1ms |
| soft-1920 | 0.8ms | 0.7ms | 0.8ms | 1.3ms |

- 输入不是"只在 rAF 采样"：`input.js:226` 的 keydown 直接在事件里写 held 集合，`endFrame` 清边沿；不存在"必须等下个 rAF 才登记"的一帧滞后。
- GPU 上 cap60 时 median 14.4ms ≈ 半个 vsync + 下一个 render，符合预期；cap30 20.1ms。
- 软件光栅上 median 只有 0.4–0.8ms，**看起来极好，但这是错觉**：帧间隔 50–66ms 才是玩家感到的延迟；更糟的是主线程被 50–143ms 的光栅长任务占满，keydown 事件本身要排队，**真实端到端延迟可达 1–2 帧 + 长任务 ≈ 100–200ms**。这也解释了为什么软件光栅下"按了没反应"的手感比 15fps 更差。
- 结论：不需要改输入路径；降低单帧光栅时间（P0）就是降低输入延迟。

---

## 6. 启动成本

| 配置 | DCL | load | 音频预热 | fill | full | hide |
|---|---|---|---|---|---|---|
| gpu-1280 | 693 | 784 | **690** | 1413 | 2439 | 2448 |
| gpu-1920 | 683 | 765 | **676** | 1412 | 2611 | 2624 |
| soft-1280 | 434 | 555 | **428** | 1404 | 1767 | 1803 |
| soft-1920 | 490 | 640 | **482** | 1420 | 1900 | 1994 |

- `window.__boot` 时间线：t18（首帧）226ms → t40/t62/t84/t94 555ms → `fill`（资源填充完）1404–1420ms → `full`（全部就绪）1767–2611ms → `hide` +0.03~0.4s。`__prewarmInfo.spritesDone=true`。
- **主导项是 `BootScreen.MIN_PAGE_MS=1400`**（bootScreen.js:26）：快速机上 `fill` 在 1404ms 就完了，但开屏仍要凑满 1400ms——这是**故意的品牌展示**，不是卡顿。可以不动。
- 真正的同步尖峰是 **AudioContext/音频预热 428–690ms**（GPU 上 0.69s）。它在开屏动画覆盖下发生，玩家无感；但如果在启动期间播放了动画/声音，需注意它是同步的。若要再压启动时间，应从这里下手（异步化/延迟到首次交互），但收益有限且风险高于收益。
- 没有发现图片解码/精灵烘焙的其他同步尖峰：`_prewarmStageArt`、`_prewarmBulletSprites` 在进关时执行（不是启动），且 `skipPostFrames(2)` 已把首帧后期成本挪走。

---

## 7. 热点排序（按玩家影响）

| # | 热点 | 影响面 | 证据 | 修复 |
|---|---|---|---|---|
| 1 | 软件光栅 backing 锁 1.0 仍太大（+高质量插值） | 所有无独显/远程/老机，**15fps→60fps** | 消融：backing0.75 68→16.7ms；smoothing low 68→32ms | P0-1 / P0-2 |
| 2 | 平台关每帧三层全屏混合（overlay/saturation）+ 标题立绘每帧 shadowBlur | 所有机器（弱机放大），-9ms/帧 + 菜单 150ms hitch | noOverlay -13.3%；soft title 22.8ms/帧 | P0-3 / P1-2 |
| 3 | `auto` 对真实弱 GPU 无帧时间兜底；`high` 档在软件光栅 = 5–6fps 无逃生 | 真实弱核显用户（未采样的一群） | §3.2/3.3；extra_high 6.1fps | P1-1 / P1-3 |
| 4 | 切关/切画质一次性 hitch 50–104ms | 每次进关/切档，一次 | 主矩阵 worst 91.7/104.3ms | P2-1 |
| 5 | 每帧小分配 / GC 噪音 | 长会话，低 | §2.3 | P3-1（可选） |

---

## 8. 建议补丁（均为最小改动；行号对应当前 HEAD）

> **状态（v1.6.42 工作树）：P0-1、P0-2、P0-3、P1-2、P2-1 与「软光栅强选高」修复已落地（git 未提交），复测见 §1.5（软 60 / 59.5 / 43.9fps；GPU 不变）。尚未落地：P1-1（真实弱 GPU 的帧时间兜底 / 动态 backing）。**

### P0-1 低配 backing 1.0 → 0.75（软光栅）

文件：`src/engine/renderer.js:132`（`fit()`）

```diff
-    const floor = this.lowSpec ? 1.0 : 1.25;
+    // 软件光栅：1.0 在 1280x720 下实测 50-66ms/帧（15-20fps）；
+    // 0.75（960x540）实测 16.7ms（60fps 撞顶），0.67 对密集弹幕更稳。
+    // 合成器放大带来的柔化在 2D 手绘风里可接受，远好过 15fps。
+    const floor = this.lowSpec ? 0.75 : 1.25;
```

实测（soft-1280 同页 A/B）：Boss 67.98→**16.67ms（60fps）**；EXTRA 77.27→**25.51ms**（0.67 时 18.78ms）。
风险：低（仅作用于软件光栅；WARP 上画面略软，但比 15fps 强太多）。若想更保守，可先 0.85。

### P0-2 低配 imageSmoothingQuality 降为 low（并修掉 stage 每帧改回 high）

文件 1：`src/engine/renderer.js:172`

```diff
-    this.ctx.imageSmoothingQuality = 'high';
+    // 软件光栅下 'high' 的每个 drawImage 缩放都是高质量重采样：
+    // 实测 Boss 战 67.98ms→32.07ms（2.1x）。'low' 只是缩放锐度略降。
+    this.ctx.imageSmoothingQuality = this.lowSpec ? 'low' : 'high';
```

文件 2：`src/game/stage.js:1989` 与 `:2035`（每帧把 quality 改回 high，必须一起改）

```diff
       ctx.imageSmoothingEnabled = true;
-      ctx.imageSmoothingQuality = 'high';
+      ctx.imageSmoothingQuality = this.lowSpec ? 'low' : 'high';
```

Stage 需要知道 lowSpec：

- `src/game/stage.js:479` 构造函数加 `this.lowSpec = !!opts.lowSpec;`
- `src/main.js:1616` `new Stage({...})` 选项里加 `lowSpec: this.renderer.lowSpec,`
- `src/main.js:1361` `_applyQuality()` 里 `this.renderer.setQuality?.(this.quality);` 之后加 `if (this.stage) this.stage.lowSpec = this.renderer.lowSpec;`（切档立即生效）

实测：Boss 67.98→**32.07ms**。风险：很低（只影响 drawImage 缩放的采样质量，矢量路径不受影响）。

### P0-3 平台关：低配上跳过两层全屏混合（overlay/saturation）

文件：`src/game/stage.js:2257-2274`

```diff
       // 环境光染色：让程序化地形接到厚涂背景的光色里
-      if (gr.amb) {
+      // overlay/saturation 是逐像素混合：软件光栅实测 -9ms/帧。
+      // 低配只保留地面雾（source-over），颜色差异用一次性缓存近似。
+      if (gr.amb && !this.lowSpec) {
@@
-      if (gr.sat) {
+      if (gr.sat && !this.lowSpec) {
```

实测：Boss 67.98→**58.91ms（-13.3%）**，EXTRA 77.27→71.29ms（-7.7%）。
风险：中低——画面会发生可感知的"草地色偏/去饱和减弱"。若要视觉更接近，可在 `_overlayGrads` 里给低配缓存一张 `source-over` 的近似色带（一次性建，不改变每帧成本）。**建议先做 P0-1/P0-2，若弱机已达标可不动这条。**

### P1-1 `auto` 加"帧时间预算"自适应（真实弱 GPU 兜底）

文件：`src/engine/renderer.js`，在 `present()` 顶部（`:274-282` 已有 dtMs 计算）加：

```diff
   present(t = 0) {
     const now = performance.now();
     const dtMs = this._lastPresent ? now - this._lastPresent : 0;
     this._lastPresent = now;
+    this._adaptFrameTime(dtMs);
```

新增方法（放在 `_trackBloomRecovery` 附近）：

```js
/** auto 档的帧时间兜底：持续超预算就分步降 backing，稳定后再抬回。
 *  只动 backing，不动后期/画质选择，避免和 setQuality 的状态打架。 */
_adaptFrameTime(dtMs) {
  if (this.quality !== 'auto' || this.postLevel === 0) return; // 低配/手选不参与
  if (!(dtMs > 0) || dtMs > 200) return;                       // 忽略切后台
  if (this._adaptAt && performance.now() < this._adaptAt) return;
  this._frameEma = this._frameEma ? this._frameEma * 0.85 + dtMs * 0.15 : dtMs;
  const budget = 1000 / (this.frameTarget || 60);
  if (this._frameEma > budget * 1.5) {          // 明显不足以 60fps
    const next = Math.max(0.75, Math.round(this.backing * 100 - 15) / 100);
    if (next < this.backing) {
      this.backing = next; this._realloc(); this._syncInfo();
      this._adaptAt = performance.now() + 1500;
      this._frameEma = 0;
    }
  } else if (this._frameEma < budget * 1.05 && this.backing < this._backingMax()) {
    const next = Math.min(this._backingMax(), Math.round(this.backing * 100 + 10) / 100);
    if (next > this.backing) {
      this.backing = next; this._realloc(); this._syncInfo();
      this._adaptAt = performance.now() + 4000;
      this._frameEma = 0;
    }
  }
}
```

其中 `_realloc()` = 把 `fit()` 里 `canvas.width/height`、bloom 尺寸、`setTransform` 那段抽出来复用（见 P2-1），`_backingMax()` = `fit()` 里的 `min(max(scale*dpr, floor), cap)`。**注意**：此补丁会改变 `auto` 行为，需要 Lead 决定是否接受"分辨率随负载浮动"（1.5s 节流 + 4s 回抬，无振荡）。风险：中。

### P1-2 标题立绘 shadowBlur 预烘焙

文件：`src/main.js:3904-3907`

```diff
-    ctx.shadowColor = 'rgba(4, 2, 10, 0.75)';
-    ctx.shadowBlur = 36;
-    ctx.shadowOffsetY = 8;
-    ctx.drawImage(img, -w / 2, -h, w, h);
+    // 立绘阴影是静态的：烘焙一次，避免每帧 36px 高斯模糊（软件光栅下 >5ms/帧）
+    ctx.drawImage(this._titleShadow(img, w, h), -w / 2, -h + 8, w, h);
```

`_titleShadow` 用离屏 canvas：画一张 w×h 的 img，设置 shadowBlur=36/offsetY=8 后画到 (0,0)，缓存 `(char, w, h)`。注意阴影要画在立绘下层——原代码是先设 shadow 再画图，阴影与图同层叠在图上；预烘焙时把「阴影层」单独画一遍即可。风险：低（视觉等价，只在软件光栅上收益明显；GPU 上本来也贵，同样受益）。

### P2-1 `fit()` 避免无意义的 canvas 重分配 + 抽 `_realloc()`

文件：`src/engine/renderer.js:141-142`

```diff
-    this.canvas.width = Math.round(VIEW_W * backing);
-    this.canvas.height = Math.round(VIEW_H * backing);
+    const cw2 = Math.round(VIEW_W * backing), ch2 = Math.round(VIEW_H * backing);
+    if (this.canvas.width !== cw2 || this.canvas.height !== ch2) {
+      this.canvas.width = cw2;
+      this.canvas.height = ch2;
+    }
```

收益：切画质/窗口 resize 时若 backing 数字没变，不再清空画布+重建后端（实测切档 hitch 50–79ms 中的一部分）。风险：极低。
（若采纳 P1-1，把上面 + bloom 尺寸 + `_gradeKey=''` + `setTransform` 一起抽成 `_realloc(backing)`，供两处复用。）

### P3-1（可选，极小收益）每帧分配复用

- `src/game/stage.js:2217`：`const cam = this.camera.viewAt(alpha)` → 复用 `this._camView` 对象（camera.viewAt 写入复用对象）。
- `src/game/stage.js:2219`：`const usable = bgs.filter(e => e.ok)` → 缓存到 `this._usableBg`（按 `bgs` 长度/完成状态失效）。
- `src/game/stage.js:2858`：`get hudState()` 返回新对象 → 复用字段写回。
- `src/engine/camera.js:59`：`viewAt` 返回字面量 → 写入 `this._view`（注意调用方只读）。

每项 1–3 行，收益约 0.1–0.3ms/帧与更少 GC，**优先级最低**。

---

## 9. 正确性 / 内存 / 音频问题（单独列出，按严重度）

本次审计全程 4 配置 `errors=0 / httpBad=0 / netFails=0`，10 秒复测 `errors=[]`。**没有发现逻辑、判定、存档、网络层面的正确性 bug**。以下 4 项属于"不崩溃但影响玩家/产品语义"的问题（**第 1/3/4 项已在 v1.6.42 工作树修复并复测，见 §1.5；第 2 项仍未落地**）：

| 严重度 | 问题 | 证据 / 位置 | 建议 |
|---|---|---|---|
| **中**（产品陷阱，触达真实玩家） | 软件光栅下玩家强选「高」画质 = 5–6fps，且**永不自动降级**（`autoDegrade=false`） | §3.2；soft `extra_high` 6.1fps / 5.2fps、render 35.7/43.8ms、p50 166.7/200ms；renderer.js:202-224 | 设置页在 `softwareRaster` 时禁用/灰掉「高」，或 2s 后自动回落并提示；v1.6.42 建议只做"禁用 + 说明" |
| **中低**（自适应覆盖面不足） | `detectSoftwareRaster` 只认 SwiftShader/WARP/llvmpipe；真实弱核显（Intel UHD / Vega 8）被当成强机，`auto` 从不按帧时间降档 | §3.3；renderer.js:23-34 | P1-1 的帧时间 EMA 兜底；v1.6.42 可先只加低风险日志/开关，不改默认行为 |
| **低**（资源浪费/闪烁源） | `fit()` 无条件重设 `canvas.width/height`：backing 未变也触发后端重建/清空 | renderer.js:141-142 | P2-1：值不等才赋值（附带修） |
| **低**（低配视觉） | 标题立绘每帧 `shadowBlur=36`，无低配开关 | main.js:3904-3907；soft 标题 20–23ms/帧 | P1-2 预烘焙一次 |

**掉帧会不会破坏游戏逻辑？** 不会。主循环是固定步长累加器（engine/loop.js:84-131）：delta 有上限、积压步数被丢弃（`maxSteps`），低帧时表现为慢动作/掉帧，不会跳步穿透；子弹/敌人用 dt 积分且 dt 被 clamp，Boss 与弹幕计时不会因掉帧错乱，只是整体变慢。

**内存 / 音频泄漏？** 90s 实测未发现（§4）：堆热身翻倍后进入平台期；12 次场景切换只 +11~33 节点 / +11~15 监听器（有界）；AudioHandlers 30→17 / 32→27 即释放；src 无 `setInterval`；所有 `addEventListener` 都有对应 `destroy()` 移除（§2.3）。唯一待观察项：GPU `heapB`(9.54MB) > `heapA`(7.81MB)，可能是资源/缓存懒加载，建议 10 分钟以上长跑复核，**当前不构成 bug**。

---

## 10. 未测 / 后续

1. **HiDPI（dsf=2 / dpr=1.5）**：launchCfg + `--force-device-scale-factor=2` 两次启动失败（boot 30s 超时）；建议用非 headless 或 `Emulation.setDeviceMetricsOverride` 重测 backing 2.25× 的真实成本（§3.5 的推算需要验证）。
2. **真实弱 GPU（Intel UHD / Vega 8）**：本机只有 RTX 5090 与 WARP 两个极端；弱核显的"中间态"（30–45fps）没法在本机复现，P1-1 的收益是推断。
3. **90s 内存/GC 长采样**：已完成，结果并入 §4（`tools/_pt/perf_mem_{gpu,soft}.json` / `perf_mem_summary.json`）；如需更长期复核（10 分钟+）可复用 `tools/_x_mem.mjs`，只改 `DURATION_MS` 常量。
4. **道中"含射击"口径**：平台关玩家子弹在 `s.shots`（stage.js:497/2342），不在 `s.bullets`，所以 `_x_three10` 的弹数快照为 0 属正常；`_x_three10_fire.mjs` 按住 KeyZ 复测后软光栅道中 22.1fps（与不按 23.8fps 差约 7%，射击不是瓶颈）。
5. **GPU 上的 bloom 回读成本**：`_bloomPass` 注释称"GPU 下也是每帧一次 readback"，但 JS 计时只有 0.63–0.69ms；真实 GPU 同步成本需 GPU timer query（headless 下不稳定），本次未测。
6. **EXTRA 进场 90–104ms hitch 的根因**：未定为资源烘焙、GC 还是着色器冷启动；若要修，建议在 EXTRA 进场前 `_prewarmStageArt()` + 提前一帧 `skipPostFrames(3)`，并用 PerformanceObserver 抓长帧归因。已定量的一项：软件光栅下**改变 canvas 尺寸后的首帧 164–244ms**（§1.5 raster bench），所以任何自动变档/窗口 resize 都要防抖动。
7. **低配动态 backing（0.67/0.60）**：§1.5 只测了"冻结弹幕的纯光栅成本"随 backing 线性下降；真实 BOSS 弹幕下 0.67/0.60 的对局 A/B 未跑（弹数漂移难以对齐），建议落地时在同一 BOSS 状态交替采样验证，并结合 `skipPostFrames(2)`。

---

## 11. 复现与产物

- 主矩阵：`tools/_x_perf_matrix.mjs` → `tools/_pt/perf_matrix_{gpu-1280,gpu-1920,soft-1280,soft-1920}.json`、`perf_matrix_summary.json`、`tools/_pt/matrix_run.log`
- 消融：`tools/_x_ablate.mjs` → `tools/_pt/perf_ablate_soft.json`、`run_ablate2.log`
- 阶段：`tools/_x_phases.mjs` → `tools/_pt/perf_phases_{soft,gpu}.json`
- 内存：`tools/_x_mem.mjs` → `tools/_pt/perf_mem_{gpu,soft}.json`、`perf_mem_summary.json`
- **10 秒三场景（Lead 口径）**：`tools/_x_three10.mjs`（端口 9467/9468）→ `tools/_pt/perf_three10.json`；按住射击版 `tools/_x_three10_fire.mjs`（端口 9469）→ `tools/_pt/perf_three10_fire.json`
- 报告数据表生成：`tools/_x_report_data.mjs` → `tools/_pt/_report_data.md`
- **补丁后复测**：`tools/_x_verify_patch.mjs`（端口 9470/9469）→ `tools/_pt/perf_patch_verify.json`、`verify_patch.log`
- **强选高验证**：`tools/_x_verify_more2.mjs`（端口 9467）→ `tools/_pt/perf_patch_verify_more.json`
- **backing–光栅成本曲线（getImageData 强制同步）**：`tools/_x_raster_bench.mjs`（端口 9467）→ `tools/_pt/perf_raster_bench.json`、`raster_bench.log`
