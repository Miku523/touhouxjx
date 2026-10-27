# 国内访问优化记录（1.6.15）

线上入口 <https://mikuascendlog.com/touhouxjx/> 的第一次访问，从 13 MB 级别的下载、5 秒级的 load，压到弱网下 1.6 MB / 2.2 秒。这篇记录的是**为什么慢、改了什么、怎么验证、怎么回滚**，数据全部来自本机 CDP 冷缓存实测（headless Edge，可复跑）。

## 一句话结论

| 指标（北京家宽冷缓存，本地 H2 + 220ms RTT / 8 Mbps 限速） | 优化前 | 优化后 | 变化 |
| --- | --- | --- | --- |
| 请求数 | 149 | 98 | −34% |
| 传输字节 | 约 13.7 MB | **1.60 MB** | **−88%** |
| 图片 | 58 张 / 12.39 MB | 7 张 / 549 KB | 首访只下标题要用的 |
| DOMContentLoaded | 2923 ms | **2000 ms** | −32% |
| load | 5685 ms | **2233 ms** | **−61%** |
| 音乐可播（boot audio） | 2918 ms | 1994 ms | −32% |

线上（北京家宽、未限速、冷缓存）优化前基准：`ttfb 818 ms / DCL 3973 ms / load 5436 ms / 144 请求 / 13.1 MB`。部署 1.6.15 后线上实测（同一台机器、CDN 边缘已暖、3 次）：`DCL 423–613 ms / 首访到菜单 507–697 ms / 85 个模块全部在 130–144 ms 发出 / 1.6–5.8 MB`（快链路上空闲预取会继续补图，所以字节数回升是正常的）。**注意线上单次测量噪声极大**：刚部署后命中冷边缘的那一次可能是 13.3 s，同一个 URL 第二次就降到 2.1 s——不要用单次线上数字做 A/B，见 §2.3 的教训。

快速链路（20 ms / 50 Mbps）对照：DCL 449 ms、load 524 ms，58 张图 4.74 MB 在 1386 ms 内全部预取完成——**闸门没有误杀快网**。

素材本身体积：

| 类别 | 优化前 | 优化后 | 变化 |
| --- | --- | --- | --- |
| AI 素材图片 62 张 | 15.61 MB | **6.38 MB** | −59.1% |
| 预渲染 BGM 3 首 | 20.44 MB | **5.32 MB** | −74.0% |
| 入口 JS（85 模块，gzip wire） | 约 1.0 MB | 约 1.0 MB | 但 RTT 波次 4 → 1 |

## 1. 瓶颈：不是线路，是字节数

先把「线路」这件事排掉，免得在错的方向上加钱加复杂度。

**线上实际链路**：GitHub Pages 自定义域名，解析到 185.199.108.153 / .109.153，Fastly 边缘 `x-github-edge-region: japaneast`（东京）。北京家宽（163data, AS4847）直连，单张 520 KB 的 `bg/moon.jpg` 实测：

| 路径 | 结果 |
| --- | --- |
| `https://mikuascendlog.com/touhouxjx/`（自定义域名 → Fastly 东京） | 200，ttfb 0.21–0.44 s，total 0.43–0.65 s，797–1217 KB/s |
| `https://miku523.github.io/touhouxjx/`（裸 Pages 域名） | 301 后 535–645 KB/s，绕一层更慢 |
| `cdn.jsdelivr.net/gh/…` | 301 → `raw.githubusercontent.com`，随后 20 s 超时 |
| `fastly.jsdelivr.net` / `gcore.jsdelivr.net` / `cdn.statically.io` | 同样 301、或 ttfb 0.77–1.86 s 只有 210–379 KB/s、或连接超时 |
| `raw.githubusercontent.com` | 超时 |

结论：**现有线路在国内可用**（0.2 s 级 TTFB、1 MB/s 级吞吐），换免费 CDN 只有负收益；真正的国内再加速只能是 ICP 备案 + 国内 CDN，那是另一件事，不在本次范围。

而首访的 13.1 MB 里，**图片占 12.1 MB**、JS 0.94 MB。所以这一轮只做三件事：把每张图变小、把每首曲子变小、把首屏不用的图别在首访时抢带宽。

## 2. 改动清单

### 2.1 图片 WebP 化（62 张，−8.80 MB）

- 脚本：`python tools/optimize_art_webp.py`（RGB `quality=82`、带 alpha 的 RGBA `quality=90`、`method=6`、`alpha_quality=100`、`exact=True`）。分辨率全部不变，原始 PNG/JPG 保留。
- 结果：62 张 `15,609,942 B → 6,377,460 B`，省 9,232,482 B（59.1%）。4 个图标（`favicon.png` / `apple-touch-icon.png` / `pwa-192.png` / `pwa-512.png`）保持 PNG 不动。
- 质量：alpha 全通道无损（maxerr = 0，无透明边发黑）；最低 PSNR 是妖精 `fairy/blue` 28.7 dB、背景最低 `nether` 36.8 dB——AI 厚涂素材本身带颗粒，40 dB 闸门不可达，按「体积优先」裁决放行，实际游戏画面（标题 / 对话 / 一面 / Boss）逐张截图确认无色带、无块效应。
- 引用改造：`src/art/genboss.js`、`src/art/genchars.js`、`src/art/genfairy.js`、`src/game/dialogue.js`（`AI_PORTRAITS`）、`src/game/ending.js`、`src/game/spellCutin.js`、`src/game/stage.js`、`src/main.js`；`index.html` 三条首屏 preload 加 `type="image/webp"` 并指向 `.webp`。
- 逐张体积 / PSNR 表：`tools/_opt/webp_table.md`，机器可读：`tools/_opt/webp_report.json`；运行时验收：`node tools/_opt_art_check.mjs`（62 张 decode 与尺寸一致、全部 `200 + image/webp`、0 4xx）。

### 2.2 预渲染 BGM 转 MP3（3 首，−14.8 MB）

| 曲目 | 用途 | WAV | MP3 |
| --- | --- | --- | --- |
| `sakuya_ex` | EXTRA 道中 | 5,292,044 B | **1,369,893 B** |
| `festival_box` | EXTRA 结局（八音盒） | 9,664,118 B | **2,545,365 B** |
| `extra_mad` | U.N. 终盘 | 5,483,526 B | **1,401,593 B** |
| 合计 | | 20,439,688 B | **5,316,851 B（−74.0%）** |

- 脚本：`python tools/optimize_audio_mp3.py`（MPEG-2 Layer III / 22050 Hz / 单声道 / VBR ≈ 91.5 kbps）。源是 22.05 kHz 单声道母版，所以用 MPEG-2 L3，不用 44.1k 的 MPEG-1。
- 关键在于**别让循环接缝变形**：lame 默认不写 Xing/Info 头，播放器只能猜时长；这里自己构造 Xing/Info + LAME tag，按 `n = 576 × 帧数 − delay − padding` 反解精确 padding、TOC 用真实帧偏移。验收（`node tools/verify_audio_mp3.mjs`，49 pass / 0 fail）：
  - Edge `decodeAudioData` 时长差 **0.000000 s**、采样数差 **0**（22050 native 与 48000 两种 context 都比过）；
  - 与 WAV 互相关 lag = 0、corr 0.9994–0.99998；
  - `AudioBufferSourceNode.loop = true` 真实循环渲染，跨边界 SNR 25.0–26.2 dB，跳变与 WAV 同量级（且低于该曲平均相邻样本跳变，没有咔哒声）。
- 运行时只改 `src/engine/songs/index.js` 的三行 `audio` 路径；`audio.js` 一行没动（解码失败自动回退合成曲的 `catch` 本来就覆盖了）。三首 WAV 母版仍在仓库里。

### 2.3 入口 modulepreload（85 个模块，4 波瀑布 → 1 波）

ES Module 是天然瀑布：浏览器必须先下载 `main.js`、解析、才知道它 import 什么。原来的入口 import 图有 85 个模块，在 220 ms RTT 下被拆成 4 波，每波白等一个 RTT。

- 生成器：`python tools/gen_modulepreload.py --write`（`--check` 只校验）。它静态解析 `index.html` 里 module script 的 import 图（只收相对路径 `.js`、跳过动态 `import()`），BFS 出 85 个模块，在 `</head>` 前插入带标记的 `<link rel="modulepreload">` 块；入口那条带 `?v=1.6.15`，其余裸 URL（靠 Service Worker 的 cache-first 复用）。**改完 import 图要重跑一次**，否则清单会过期。
- 效果（固定 RTT 的受控 A/B，`tools/_serve_h2.mjs --latency=400`，HTTP/2 + gzip，冷 profile，各 3 次）：

| 指标 | 无 modulepreload | 有 modulepreload |
| --- | --- | --- |
| 首访到菜单 | 2545–2605 ms | **1163–1280 ms** |
| DOMContentLoaded | 2420–2518 ms | **1083–1156 ms** |
| 85 个模块的请求起点 | 428–1798 ms（竖排成波） | **423–439 ms（一次全发）** |
| 最后一个模块到齐 | 2256–2275 ms | **946–981 ms** |

早前用「本地 H2 + 220 ms RTT / 8 Mbps」限速测的旧数字是 DCL 2923 → 2078 ms，方向一致但被带宽限制稀释；固定 400 ms RTT、不卡带宽的这组才是模块瀑布的真实代价。

> **教训（真实发生过）**：1.6.15 上线后曾按一次线上测量（12–17 s 波动）误判「85 条并发流把 JS 拖慢」，把这块 preload 回退了（提交 a1771e8）。随后在本地固定 RTT 下做 A/B，才看清首屏时间其实减半——于是 e8e881c 恢复。线上单次测量会被 CDN 冷边缘、路由抖动、后台标签页（rAF 被节流）污染，验证加载性能只用本地受控 A/B + 多次取中位数。

### 2.4 自适应预取闸门（`src/engine/lazy_preload.js`）

原行为：`load` 之后 `requestIdleCallback` 把**所有**非必需图片（9 张 Boss 战立绘、16 张自机帧、12 张对话立绘、场景底图 …）一趟拉完，约 12 MB，从 3.9 s 一直拉到 17 s，和玩家点「开始」后的关卡素材抢同一条带宽，`moon.jpg` 到 16.7 s 才下完。

现在：

- `linkTier()` → `'fast' | 'constrained' | 'unknown'`。`saveData`、`effectiveType ∈ slow-2g/2g/3g` 直接判 constrained；否则用 `PerformanceResourceTiming` 里标题素材的实际吞吐（`encodedBodySize / 时长`）判断，低于 350 KB/s（≈2.8 Mbps）算 constrained；取不到数据（缓存命中/异常）算 unknown，保持旧行为。
- constrained 时 `runAll()` 把整条空闲预取队列清空返回；**按需加载不受影响**（`ensureBossArt` / `prefetchStageBg` / 结局预载照常）。
- 结果：受限链路首访图片请求从 58 张 12.39 MB 降到 7 张 549 KB。

### 2.5 非关键图从「模块求值期」挪到「空闲期」

闸门上线后仍能看到 15 张非关键图在首访被拉，用 `node tools/_net_whoimg.mjs`（注入 `HTMLImageElement.prototype.src` setter，打印赋值栈）定位到它们根本不经预取队列，而是模块求值 / 构造函数里的急切预载：

- `src/art/genfairy.js:28,38` 模块求值 IIFE 直接建 6 张妖精图（109.7 KB）；
- `src/game/spellCutin.js:55` 构造函数预热 `sakuya_title.webp`（约 45 KB）；
- `src/game/ending.js:74` `_preload()` 在 `new Game` 时就拉结局 3 张背景 + 4 张立绘（约 964 KB）——玩家可能一局都打不到结局。

改成：三处都包进 `preloadWhenIdle(...)`（弱网跳过、快网照旧空闲拉），`ending.js` 增加 `preloadAssets()`，由 `src/main.js` 的 `_createStage` 在第 5、6 面开场时预热（`if (!isExtra && index >= 4) this.ending?.preloadAssets?.();`），`play()` 里再兜一次。所有绘制点本来就是 null 安全（缺图只铺柔光），所以「图还没到」不会报错。
另外补了一条**反向**的提前量：`src/main.js` 的 `_createStage` 里加 `if (def?.boss) ensureBossArt(def.boss);`。闸门挡住的是「跨关卡的全量预取」，不是「本关马上要用的图」——Boss 战立绘（约 90 KB）如果等 Boss 登场才请求，`boss.js` 里「立绘未就绪先淡出等待」的逻辑会让 Boss 最多晚 3 秒现身（弱网下真会等满）。改成开场就拉，用 `node tools/_net_whoimg.mjs --enter` 复核：受限链路进第一面时，请求栈是 `ensureBossArt ← Game._createStage (src/main.js:1440)`，`rumia.webp` 47 KB 随开场一起下。

进关后的增量（受限链路实测）：当前面背景 `shrine` + `shrine_2`（772 KB）、下一面背景 `forest` + `forest_2`（492 KB，进关就 warm，免得下一面开场先闪程序化天空）、Boss 立绘 47 KB、自机 6 帧约 100 KB、对白立绘约 80 KB —— 合计约 1.45 MB。加上首屏的 1.60 MB，**完整打到第一面 Boss 的下载量约 3 MB**（优化前是 13.7 MB）。

### 2.6 版本串 1.6.15

`index.html` 的 7 个 `?v=`（含 modulepreload 首条）、`src/ui/platform.js` 的 `PLATFORM_VERSION` 与 PWA 安装提示、`sw.js` 的 `CACHE_VERSION` 与 `PRECACHE` 的 `platform.css?v=`、`src/engine/songs/index.js` 的 `sakuya_ex.mp3?v=`，全部升到 `1.6.15`。目的是让旧访客立刻拿到新代码 + 让旧 Service Worker 缓存（`hks-*`）被 `activate` 清掉，避免「新 HTML + 旧 JS」错配。

## 3. 复测方法

三套测量要分开说清楚，否则数字对不上：

**（1）本地 H2 + 限速 A/B（主口径）**——必须是 HTTP/2 + gzip，`python -m http.server` 不压缩，会把 modulepreload 的收益淹没在 3.7 MB 未压缩 JS 里：

```bash
# 自签证书（没有就生成一次；Git bash 下要关掉路径转换）
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout _pt/certs/key.pem -out _pt/certs/cert.pem -subj "/CN=127.0.0.1" \
  -addext "subjectAltName=IP:127.0.0.1"

# H2 + gzip 服务（root 指向仓库根）
node tools/_serve_h2.mjs --port=8445 --root=. --cert=_pt/certs/cert.pem --key=_pt/certs/key.pem

# 受限链路（220ms RTT / 8Mbps 下行 / 2Mbps 上行），冷缓存，26 秒采样
node tools/_net_probe.mjs --url="https://127.0.0.1:8445/?nosw=1" --insecure \
  --port=9486 --rtt=220 --down=8 --up=2 --wait=26000 --out=_pt/constrained.json

# 快速链路对照（闸门应放行，预取行为不变）
node tools/_net_probe.mjs --url="https://127.0.0.1:8445/?nosw=1" --insecure \
  --port=9487 --rtt=20 --down=50 --up=10 --wait=26000 --out=_pt/fast.json
```

> **务必带 `?nosw=1`**：Service Worker 接管后，页面级 CDP 里这些请求是 `fromServiceWorker: true` 且 `encoded: 0`（SW 自己发的请求不记在页面 target 上），字节数会严重低报。`?nosw=1` 是 `src/ui/platform.js` 里的逃生口，只跳过注册 SW，不影响游戏。

**（2）功能冒烟 + 截图**（`no-store` 的 HTTP 服务，随便什么端口）：

```bash
python tools/serve_nocache.py 8138 &
mkdir -p _pt/after2
CDP_PORT=9397 node tools/_deploy_check.mjs http://127.0.0.1:8138/ _pt/after2/deploy
```

输出 `ok:true`、`errors/consoleErrors/httpErrors` 全空，并落 `_pt/after2/deploy_title.png`（标题）与 `_pt/after2/deploy_stage.png`（第一面）。注意输出目录要存在，否则脚本会静默退出。

**（3）定位某张图是谁在请求**：`node tools/_net_whoimg.mjs --url=… --rtt=220 --down=8`，它劫持 `src` setter 打印赋值栈。

## 4. 取舍与未做的事

- **不给背景降分辨率**：`src/engine/renderer.js` 里 `dpr = min(devicePixelRatio, 2)`、backing 至少 1.25× 超采样，画布设备像素可以到 2560 宽，2048 宽的背景源图是真有用的；降到 1600 还能再省约 1.4 MB，但大屏会发糊，不采纳（实验脚本 `tools/_opt_bg_downscale.py`，数据在 `tools/_opt/downscale/`）。
- **不引入免费 CDN**：实测全部更慢或不可用（见 §1）。
- **国内再加速需要 ICP 备案 + 国内 CDN**：那是运营层面的事，不在本次代码改动范围。
- **母版 / 原图仍留在仓库**：三首 WAV（20.4 MB）与 47 张原始 PNG/JPG 还在，只是不再被请求，不影响加载；是否移出版本库（改用 Release / 图床）待定。
- **首访仍会按需补图**：受限链路上没有完全预取的 Boss 立绘（约 883 KB）、自机帧等，会在玩家真正进入对应场景时按需加载——这是设计意图，不是遗漏。
- **已知素材特性（未改）**：`extra_mad` 源 WAV 开头有 0.717 s 数字静音；`sakuya_ex` 的循环点本身有素材级跳变（WAV 一致，MP3 未放大）。

## 5. 回滚

每一项都是独立的，可单独回退：

| 改动 | 回滚方式 |
| --- | --- |
| 图片 WebP | 把 `src/` 与 `index.html` 里的 `.webp` 引用改回 `.png/.jpg`（原图都在磁盘上），并升版本串 |
| BGM MP3 | `src/engine/songs/index.js` 三行 `audio` 路径改回 `.wav` |
| modulepreload | 删掉 `index.html` 里 `<!-- modulepreload:start … -->` 到 `<!-- modulepreload:end -->` 之间那块（或 `git checkout` 该段） |
| 预取闸门 | `src/engine/lazy_preload.js` 里把 `linkTier()` 恒返回 `'fast'`，或还原该文件 |
| 延迟非关键图 | 四处 `preloadWhenIdle(...)` 拆掉包一层，恢复构造期直接加载；`main.js` 的 `preloadAssets` 那行删掉 |

版本串 `1.6.15` 每次回滚都要再升一次，否则老访客会吃缓存。
