# 国内访问优化记录（1.6.15 → 1.6.26）

线上入口 <https://mikuascendlog.com/touhouxjx/> 的第一次访问，从 13 MB 级别的下载、5 秒级的 load，压到弱网下 1.6 MB / 2.2 秒。这篇记录的是**为什么慢、改了什么、怎么验证、怎么回滚**，数据全部来自本机 CDP 冷缓存实测（headless Edge，可复跑）。

第二轮（1.6.26）不再靠「把每张图变小」，而是去掉两处**结构性浪费**：入口 JS 里 42% 的体积是玩家在标题界面根本用不到的曲库模块；4 份样式表是渲染阻塞资源，弱网下首绘要等它们全部到齐。另外把复访的往返砍到 0，并配了一个可复跑的多线路实测工具。

## 结论：两轮合起来看

| 指标（本地 H2 + 220 ms RTT / 8 Mbps，冷缓存） | 两轮前（1.6.14） | 本轮前（1.6.25 HEAD） | 本轮（1.6.26） |
| --- | --- | --- | --- |
| 首访传输字节 | 约 13.7 MB（149 请求） | 1.60 MB（98 请求） | **1.11 MB（82 请求）** |
| 首绘 FP / FCP | 白屏等样式表（HTTP/1.1 最坏 5724 ms） | 1576 ms | **288 ms** |
| DOMContentLoaded | 2923 ms | 1934 ms | **1420 ms** |
| load | 5685 ms | 2209 ms | **1657 ms** |
| 首访入口 JS（gzip） | 约 1.0 MB | 997 KiB | **589 KiB** |
| 首屏标题图 | 12.4 MB（58 张全下） | 354.6 KiB（3 张 WebP） | **288.7 KiB（3 张 AVIF）** |

首访 JS 的另外两个分量：modulepreload 清单 **85 → 69 条**；曲库模块 **20 个 427.3 KiB → 2 个 15.7 KiB**。素材总体积 62 张图 **6.38 → 4.89 MB（−23.3%）**。

口径：两列 A/B 都是同一台机器、同一套工具（`git archive HEAD` 当基线 + 工作区当前树）、3 次冷缓存取中位数，见 §4；跨周测量会受 Fastly 边缘与家宽质量影响，只比较**同一轮内的相对差**。

## 第一轮（1.6.15）一句话结论

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

结论：**现有线路在国内可用**（2026-10 复测：主域名 TTFB 中位 121 ms、失败率 0%），换免费 CDN 只有负收益；真正的国内再加速只能是 ICP 备案 + 国内 CDN，那是另一件事，不在本次范围。

而首访的 13.1 MB 里，**图片占 12.1 MB**、JS 0.94 MB。所以这一轮只做三件事：把每张图变小、把每首曲子变小、把首屏不用的图别在首访时抢带宽。

### 1.1 多线路复测（2026-10-28，`node tools/_line_bench.mjs --runs=3`）

上一轮的线路结论是基于 curl 单发测的，这一轮写了工具把 17 条候选线路都量了一遍（DNS→TCP→TLS→TTFB、大文件吞吐、6 路并发墙钟、失败率、压缩、边缘 region）：

| 线路 | 可用性 | region | TTFB 中位 | 相对主域名 | 判定 |
| --- | --- | --- | --- | --- | --- |
| `main` 主域名 → Pages/Fastly | 200 / 0% 失败 | japaneast | **121 ms** | ×1.0 | **就用它** |
| `ip109` / `ip110` 直连 A 记录 | 200 | japaneast | 122 / 123 ms | ×1.0 | 与主域名等价 |
| `ip108` 直连 | 200 | japaneast | 473 ms | ×3.9 | 同池，换 IP 不提速 |
| `ip111` 直连 | timeout | — | — | — | 本机不可达（DNS 也未下发） |
| `v6` 强制走 `2606:50c0:8000::153` | 200（h1 首包 67 ms / h2 165 ms） | japaneast | 67–165 ms | 0.55–1.4 | Fastly v6 anycast 确实在服务此域，只是 AAAA 未下发 |
| `pages` miku523.github.io | 301 | japaneast | 86 ms | — | 只 301 → 主域名，多一跳 |
| `jsdelivr`（Cloudflare） | 200 | 境外 CF | 195 ms | ×1.6 | 有 br，但仍慢 |
| `jsdelivr-fastly` | 301 → raw | — | 237 ms | — | 不能当线路 |
| `ghfast` / `gh-proxy` / `gh-proxy.org` | 200（gh-proxy 33% 失败） | westus3 / iad / fra | 438 / 558 / 549 ms | ×3.6–×4.6 | 镜像跳，别用 |
| `raw.githubusercontent.com` 直连 | 200 | japaneast | 128 ms | ×1.1 | 可用，但不是站点入口 |
| `ghproxy.net` / `mirror.ghproxy.com` | timeout | — | — | — | 死 |
| `ghp.ci` / `github.moeyy.xyz` | ENOTFOUND | — | — | — | 死 |

DNS 侧：主域名只有两条 A（`185.199.108.153` / `185.199.109.153`，TTL 实测 137–300 s，Cloudflare NS），**没有 AAAA**；Pages 官方共 4 条 A（`.108–.111`），`.110` 实测可用、`.111` 本轮 6 次探测全超时（上一轮曾返回 200，说明单条 A 本身有可用性波动）。Pages 线（主域名 / A 记录直连 / IPv6 / raw）都是 `ALPN h2` + `TLSv1.3` + **只有 gzip**（不发 br，所以预压缩 `.br` 没有意义）；CF 系镜像（jsdelivr、gh-proxy*）才回 br，但它们本来就慢，省下的一两 KB 不值多出来的一跳。大文件（667 KB 的 `bg/shrine.jpg`）：主域名 12.7 s / 0.05 MB/s，10 条可用线路里没有一个更快——瓶颈是这段跨境链路本身，不是某个域名。

**可选的运维动作（都在 DNS 后台，代码不涉及）**：

| 动作 | 收益 | 代价 / 风险 |
| --- | --- | --- |
| 补上 `185.199.110.153` / `185.199.111.153` 两条 A | 某条 IP 被丢包/黑洞时浏览器能换一条重试，属**故障冗余** | 零成本（Cloudflare DNS，TTL 300 s）；**不会加速**，`.111` 本机实测不可达 |
| 灰度加一条 AAAA `2606:50c0:8000::153` | 移动/教育网 IPv6 优先接入，不挤 IPv4 国际出口 | Pages 文档只承诺 4 条 A，AAAA 属未文档化用法；Fastly v6 前缀变更要跟；出问题删记录即回滚 |
| 上 Cloudflare 代理（橙云） | 只在 Pages IP 被墙时救急 | 免费 CF 国内无节点，实测 ×1.6–×4.6 更慢，多一跳 TLS，还要处理缓存 purge |
| 免费 CDN / ghproxy 类镜像 | 无 | 实测全部更慢或不可用，见上表 |
| ICP 备案 + 国内 CDN | 唯一能把 TTFB 再降一个数量级的方案（国内边缘 RTT 10–30 ms） | 数周备案 + 每次发布 purge + 内容合规风险；不建议把主域搬进去，真要加速可只把大素材放境内对象存储 |

结论不变：**线路不是瓶颈**。本轮把首访从 1.60 MB 压到 1.11 MB、首绘从 1576 ms 压到 288 ms，靠的是字节数与关键路径，不是换线路。

## 2. 第二轮改动清单（1.6.26）

### 2.1 曲库懒加载：入口 JS −41%

- 病灶：`src/engine/songs/index.js` 静态 `import` 了 19 个曲目数据模块（20 个文件 / 423.3 KiB gzip，占首访 JS 的 42%），而标题界面只放 `title_full` 一首；玩家点到哪首才需要哪首。
- 改法：`SONGS` 变成「已加载键的容器」，新增 `getSong(name)` / `hasSong` / `isSongLoaded` / `loadedSongKeys` / `ensureSong(name)` / `preloadSongs(names)`；内部 `DEFS` 17 项全部用 `import('./xxx.js')` 动态加载。消费点只有两处，都做了异步化：
  - `src/engine/audio.js` 的 `_startMusic()`：拿不到数据就 `await ensureSong(name)` 后重入；用 `_songLoadToken` 作废竞态（连点两首时慢的那首回来了也不抢当前曲）。没有 `fetch`（Node / 老环境）或 `decodeAudioData` 缺失时同步回退合成曲——原有的「解码失败回退」语义保留。
  - `src/game/musicRoom.js`：未加载曲目显示「—」，点了才加载（`_playToken` 同样防竞态）。
- 空闲预取：曲子第一次真正播放后、或进第 1 面时 `ensureSong('pre1')`，**只有 `linkTier() === 'fast'`** 才顺手把下一首 `stage1` 拉好；弱网 / `saveData` 不预取。逻辑自包含在 `songs/index.js`，不依赖 `main.js`。
- 结果：**首访 JS gzip 997.1 → 589.3 KiB（−41%）**；songs 从 20 个模块 427.3 KiB 降到 2 个模块 15.7 KiB；modulepreload 清单随 import 图从 85 条降到 69 条。

### 2.2 美术 AVIF 化（60 张，WebP 保留做回退）

- 脚本：`python tools/optimize_art_avif.py`（Pillow 12.3 的 AVIF 编码器；逐张与 WebP 母版做 PSNR/尺寸闸门），逐张表在 `tools/_opt/avif_table.md`，机器可读在 `tools/_opt/avif_report.json`。
- 运行时：新增 `src/art/img.js`（`artUrl(webpUrl)` 同步换成 `.avif`、`onArtError(img, webpUrl)` 一次性回退、`isAvifEnabled()`；`?noavif=1` 全局退回 WebP）+ `src/art/avif_manifest.js`（**只登记确有 avif 且体积有收益的图**，避免首次 404）。
- 为什么不用 `<picture>` / 能力探测：这些素材几乎都是 `new Image()` 画进 canvas（标题背景、立绘、Boss、动作帧、背景层），`<picture>` 用不上；能力探测要等异步结果，而首屏 3 张图不能等。所以走「AVIF 优先 + `onerror` 回退一次」：老浏览器或解码失败只损失一次 404；`index.html` 的 3 条 `<link rel="preload" as="image" type="image/avif">` 在不支持 AVIF 的浏览器里会被直接忽略。
- 结果：62 张 WebP **6,377,460 → 4,890,481 B（−23.3%）**；首屏 3 张 **363,088 → 295,604 B（−18.6%）**。`fairy/blue`、`fairy/purple` 两张 AVIF 没有收益，保留 WebP 不转。

### 2.3 样式表不再阻塞首绘（+ 启动幕内联兜底）

- 病灶：4 份样式表（`src/style.css` 145.7 KB、`src/ui/mobile.css` 23.6 KB、`src/ui/platform.css` 9.7 KB、`src/title-intro.css` 4.7 KB；gzip 合计 42.3 KiB）是渲染阻塞资源，弱网下要 1–3 个 RTT，期间整页白屏；而且 `type="module"` 的 `main.js` 还要等样式表才能执行，标题 3 张图（`fetchpriority=high`）跟着一起被推迟。
- 改法：4 条 `<link rel="stylesheet">` 改成 `media="print" onload="__hksCss(this)" onerror="__hksCss(this)"`；`__hksCss` 只做 `link.media = 'all'` 与计数，4 条全部就绪（或 8 s 硬兜底）后给 `<html>` 加 `.css-ready`。同时在这 4 条 `<link>` **之前**插入内联 `<style id="boot-fallback">`，**所有规则前缀 `html:not(.css-ready)`**（0 特异性泄漏），只画「深色夜空 + 启动幕居中排版 + 进度条」，尺寸用 `vw/clamp` 而不是 `--s`（主样式表没到，`--s` 还不存在）。`<noscript>` 里保留 4 条普通 `<link>`。
- 结果：本地 HTTP/1.1 无压缩服务器 + 220 ms RTT / 150 KB/s 的最坏口径下，首绘 **5724 → 368 ms**；本地 H2 限速 A/B 下 FP/FCP **1576 → 288 ms**。兜底目视验收：把 4 条 CSS 剥掉（`tools/_ab_fallback_harness.mjs` 从真实 HTML 派生）时，桌面 1280×720 与手机 390×844（DPR2）都是完整启动幕，不白屏也不裸文字；CSS 到齐后 `html:not(.css-ready)` 让兜底全部失效（实测 `.boot` 定位、logo 字号、meter 宽度、`#overlay` display 都回到主样式表的值，零残留）。

### 2.4 Service Worker 发布版本令牌：复访 0 往返

- 病灶：旧 `networkFirst` 对每个代码资源都用 `cache: 'no-cache'` 发一次条件请求（69 个入口模块 = 69 轮 304），等于主动绕开浏览器 HTTP 缓存（Pages 的 `max-age=600` 白给）；国内弱网下复访启动白多 2–3 个 RTT。
- 改法：导航成功时从 HTML 解析 `?v=` 发布令牌（`parseVersionToken`），写进一条 `Cache-Control: no-store` 的虚拟响应（`./__hks_version__`）。新增 `codeHandler(request)`：**令牌存在且命中缓存 → 直接返回**（0 网络）；否则退回 `networkFirst`。导航成功且令牌变了（`prev !== token`）时先 `purgeCodeCache()` 只删 `.js/.css`（图片/音频/离线壳不动）再写新令牌——**保住「一次刷新就生效」**，不会把玩家钉在旧代码上。
- 离线安全性：离线时导航失败 → 令牌不变 → 仍走缓存优先，离线壳不会被破坏。
- 结果：同版本内复访，69 个入口模块不再各发一轮 304；升级版本时行为与旧版一致。

### 2.5 可复跑的测量工具

- `node tools/_firstvisit_bytes.mjs`：静态解析 `index.html` 的 modulepreload / stylesheet / preload image / icon，文本取 gzip -9、图片取原始字节，给出**首访字节预算**（`--json` 可接 CI）。这轮靠它确认净减 **468 KiB（−31.8%）**。
- `node tools/_line_bench.mjs`：17 条候选线路（主域名 / 4 条 Pages A 记录 / IPv6 / 裸 Pages 域 / jsDelivr / 5 类 ghproxy）测 DNS–TCP–TLS–TTFB、大文件吞吐、6 路并发墙钟、失败率、压缩与边缘 region，输出 Markdown + JSON（`tools/_opt/line_bench_*.md`）。见 §1.1。
- H2 首访 A/B：`tools/_serve_h2.mjs` 起两棵树（`git archive HEAD` 基线 + 工作区），`tools/_net_probe.mjs` 的页面表达式新增 paint 采集（FP/FCP），方法见 §4。

## 3. 第一轮改动清单（1.6.15）

### 3.1 图片 WebP 化（62 张，−8.80 MB）

- 脚本：`python tools/optimize_art_webp.py`（RGB `quality=82`、带 alpha 的 RGBA `quality=90`、`method=6`、`alpha_quality=100`、`exact=True`）。分辨率全部不变，原始 PNG/JPG 保留。
- 结果：62 张 `15,609,942 B → 6,377,460 B`，省 9,232,482 B（59.1%）。4 个图标（`favicon.png` / `apple-touch-icon.png` / `pwa-192.png` / `pwa-512.png`）保持 PNG 不动。
- 质量：alpha 全通道无损（maxerr = 0，无透明边发黑）；最低 PSNR 是妖精 `fairy/blue` 28.7 dB、背景最低 `nether` 36.8 dB——AI 厚涂素材本身带颗粒，40 dB 闸门不可达，按「体积优先」裁决放行，实际游戏画面（标题 / 对话 / 一面 / Boss）逐张截图确认无色带、无块效应。
- 引用改造：`src/art/genboss.js`、`src/art/genchars.js`、`src/art/genfairy.js`、`src/game/dialogue.js`（`AI_PORTRAITS`）、`src/game/ending.js`、`src/game/spellCutin.js`、`src/game/stage.js`、`src/main.js`；`index.html` 三条首屏 preload 加 `type="image/webp"` 并指向 `.webp`。
- 逐张体积 / PSNR 表：`tools/_opt/webp_table.md`，机器可读：`tools/_opt/webp_report.json`；运行时验收：`node tools/_opt_art_check.mjs`（62 张 decode 与尺寸一致、全部 `200 + image/webp`、0 4xx）。

### 3.2 预渲染 BGM 转 MP3（3 首，−14.8 MB）

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

### 3.3 入口 modulepreload（85 个模块，4 波瀑布 → 1 波）

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

### 3.4 自适应预取闸门（`src/engine/lazy_preload.js`）

原行为：`load` 之后 `requestIdleCallback` 把**所有**非必需图片（9 张 Boss 战立绘、16 张自机帧、12 张对话立绘、场景底图 …）一趟拉完，约 12 MB，从 3.9 s 一直拉到 17 s，和玩家点「开始」后的关卡素材抢同一条带宽，`moon.jpg` 到 16.7 s 才下完。

现在：

- `linkTier()` → `'fast' | 'constrained' | 'unknown'`。`saveData`、`effectiveType ∈ slow-2g/2g/3g` 直接判 constrained；否则用 `PerformanceResourceTiming` 里标题素材的实际吞吐（`encodedBodySize / 时长`）判断，低于 350 KB/s（≈2.8 Mbps）算 constrained；取不到数据（缓存命中/异常）算 unknown，保持旧行为。
- constrained 时 `runAll()` 把整条空闲预取队列清空返回；**按需加载不受影响**（`ensureBossArt` / `prefetchStageBg` / 结局预载照常）。
- 结果：受限链路首访图片请求从 58 张 12.39 MB 降到 7 张 549 KB。

### 3.5 非关键图从「模块求值期」挪到「空闲期」

闸门上线后仍能看到 15 张非关键图在首访被拉，用 `node tools/_net_whoimg.mjs`（注入 `HTMLImageElement.prototype.src` setter，打印赋值栈）定位到它们根本不经预取队列，而是模块求值 / 构造函数里的急切预载：

- `src/art/genfairy.js:28,38` 模块求值 IIFE 直接建 6 张妖精图（109.7 KB）；
- `src/game/spellCutin.js:55` 构造函数预热 `sakuya_title.webp`（约 45 KB）；
- `src/game/ending.js:74` `_preload()` 在 `new Game` 时就拉结局 3 张背景 + 4 张立绘（约 964 KB）——玩家可能一局都打不到结局。

改成：三处都包进 `preloadWhenIdle(...)`（弱网跳过、快网照旧空闲拉），`ending.js` 增加 `preloadAssets()`，由 `src/main.js` 的 `_createStage` 在第 5、6 面开场时预热（`if (!isExtra && index >= 4) this.ending?.preloadAssets?.();`），`play()` 里再兜一次。所有绘制点本来就是 null 安全（缺图只铺柔光），所以「图还没到」不会报错。
另外补了一条**反向**的提前量：`src/main.js` 的 `_createStage` 里加 `if (def?.boss) ensureBossArt(def.boss);`。闸门挡住的是「跨关卡的全量预取」，不是「本关马上要用的图」——Boss 战立绘（约 90 KB）如果等 Boss 登场才请求，`boss.js` 里「立绘未就绪先淡出等待」的逻辑会让 Boss 最多晚 3 秒现身（弱网下真会等满）。改成开场就拉，用 `node tools/_net_whoimg.mjs --enter` 复核：受限链路进第一面时，请求栈是 `ensureBossArt ← Game._createStage (src/main.js:1440)`，`rumia.webp` 47 KB 随开场一起下。

进关后的增量（受限链路实测）：当前面背景 `shrine` + `shrine_2`（772 KB）、下一面背景 `forest` + `forest_2`（492 KB，进关就 warm，免得下一面开场先闪程序化天空）、Boss 立绘 47 KB、自机 6 帧约 100 KB、对白立绘约 80 KB —— 合计约 1.45 MB。加上首屏的 1.60 MB，**完整打到第一面 Boss 的下载量约 3 MB**（优化前是 13.7 MB）。

### 3.6 版本串 1.6.15

`index.html` 的 7 个 `?v=`（含 modulepreload 首条）、`src/ui/platform.js` 的 `PLATFORM_VERSION` 与 PWA 安装提示、`sw.js` 的 `CACHE_VERSION` 与 `PRECACHE` 的 `platform.css?v=`、`src/engine/songs/index.js` 的 `sakuya_ex.mp3?v=`，全部升到 `1.6.15`。目的是让旧访客立刻拿到新代码 + 让旧 Service Worker 缓存（`hks-*`）被 `activate` 清掉，避免「新 HTML + 旧 JS」错配。

## 4. 复测方法

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

**（1b）首访 A/B：同一套限速下比两棵树**

```bash
# 基线树：把 HEAD 导出到临时目录（不污染工作区）
mkdir -p /tmp/hks_head2 && git archive HEAD | tar -x -C /tmp/hks_head2

node tools/_serve_h2.mjs --port=8445 --root=/tmp/hks_head2 --cert=_pt/certs/cert.pem --key=_pt/certs/key.pem &
node tools/_serve_h2.mjs --port=8446 --root=. --cert=_pt/certs/cert.pem --key=_pt/certs/key.pem &

# 交错跑 3 轮（避免时段漂移），取中位数
for i in 1 2 3; do
  node tools/_net_probe.mjs --url="https://127.0.0.1:8445/?nosw=1" --insecure --port=$((9470+i*2)) \
    --rtt=220 --down=8 --up=2 --wait=26000 --out=_pt/h2_old_$i.json
  node tools/_net_probe.mjs --url="https://127.0.0.1:8446/?nosw=1" --insecure --port=$((9471+i*2)) \
    --rtt=220 --down=8 --up=2 --wait=26000 --out=_pt/h2_new_$i.json
done
```

`tools/_net_probe_expr.js` 从 `performance.getEntriesByType('paint')` 取 FP/FCP、从 navigation timing 取 TTFB/DCL/load，配合 CDP 的 `Network.loadingFinished` 汇总 wire 字节。本轮（3 次中位数）：FP/FCP **1576 → 288 ms**、DCL **1934 → 1420 ms**、load **2209 → 1657 ms**、请求 **98 → 82**、传输 **1607 → 1113 KiB**。

**（1c）首访字节预算（静态，秒级）**

```bash
node tools/_firstvisit_bytes.mjs          # 打屏合计
node tools/_firstvisit_bytes.mjs --json   # 机器可读，可接 CI
```

**（2）功能冒烟 + 截图**（`no-store` 的 HTTP 服务，随便什么端口）：

```bash
python tools/serve_nocache.py 8138 &
mkdir -p _pt/after2
CDP_PORT=9397 node tools/_deploy_check.mjs http://127.0.0.1:8138/ _pt/after2/deploy
```

输出 `ok:true`、`errors/consoleErrors/httpErrors` 全空，并落 `_pt/after2/deploy_title.png`（标题）与 `_pt/after2/deploy_stage.png`（第一面）。注意输出目录要存在，否则脚本会静默退出。

**（2b）线上冒烟（跨境，必须放宽等待）**：

```bash
DEPLOY_WAIT_STEPS=900 CDP_PORT=9377 node tools/_deploy_check.mjs 'https://mikuascendlog.com/touhouxjx/index.html?nosw=1' _pt/live
```

脚本默认只等 20 s（100 × 200 ms）的 `window.__game`；本机到 japaneast 的 69 个模块约 600 KiB 经常要 30–60 s 才 boot 完，等太短会得到 `ok:false / booted:false / resources≈31` 的**假失败**（1.6.26 上线首测就踩过这个坑，改等待后同一 URL 立刻通过）。`DEPLOY_WAIT_STEPS` 单位是 200 ms。1.6.26 线上终测：`booted:true`、第一面 `state:dialogue / level:STAGE 1`、三组错误全空、`resources:73`，标题与第一面截图正常。

**（3）定位某张图是谁在请求**：`node tools/_net_whoimg.mjs --url=… --rtt=220 --down=8`，它劫持 `src` setter 打印赋值栈。

## 5. 取舍与未做的事

- **不给背景降分辨率**：`src/engine/renderer.js` 里 `dpr = min(devicePixelRatio, 2)`、backing 至少 1.25× 超采样，画布设备像素可以到 2560 宽，2048 宽的背景源图是真有用的；降到 1600 还能再省约 1.4 MB，但大屏会发糊，不采纳（实验脚本 `tools/_opt_bg_downscale.py`，数据在 `tools/_opt/downscale/`）。
- **不引入免费 CDN**：实测全部更慢或不可用（见 §1）。
- **国内再加速需要 ICP 备案 + 国内 CDN**：那是运营层面的事，不在本次代码改动范围。
- **母版 / 原图仍留在仓库**：三首 WAV（20.4 MB）与 47 张原始 PNG/JPG 还在，只是不再被请求，不影响加载；是否移出版本库（改用 Release / 图床）待定。
- **首访仍会按需补图**：受限链路上没有完全预取的 Boss 立绘（约 883 KB）、自机帧等，会在玩家真正进入对应场景时按需加载——这是设计意图，不是遗漏。
- **已知素材特性（未改）**：`extra_mad` 源 WAV 开头有 0.717 s 数字静音；`sakuya_ex` 的循环点本身有素材级跳变（WAV 一致，MP3 未放大）。

- **本轮没做「进关模块动态化」**：`src/game/stage.js` 39 K、`src/game/boss.js` 47 K、`src/art/scenes.js` 51 K、`src/game/story.js` 28 K、`src/game/ending.js`、`src/assets/levelgen.js` 50 K 仍然静态进首访（合计约 180 KiB gzip）。它们和曲库不同——进第一面就要用，动态化只是把成本从首访挪到进关，弱网下会变成「点开始后多等一个 RTT」。留作后续可选项。
- **不做 AVIF 能力探测**：见 §2.2，回退靠 `onerror`；代价是极老浏览器可能在首屏 3 图各浪费一次 404（`type="image/avif"` 的 preload 会被忽略，只发生在 `artUrl()` 的 `<img>` 路径上）。
- **Subresource Integrity / 完整性校验没加**：站点是自托管纯静态，加了反而每次发版都要改哈希，收益低。
## 6. 回滚

每一项都是独立的，可单独回退：

| 改动 | 回滚方式 |
| --- | --- |
| 图片 WebP | 把 `src/` 与 `index.html` 里的 `.webp` 引用改回 `.png/.jpg`（原图都在磁盘上），并升版本串 |
| BGM MP3 | `src/engine/songs/index.js` 三行 `audio` 路径改回 `.wav` |
| modulepreload | 删掉 `index.html` 里 `<!-- modulepreload:start … -->` 到 `<!-- modulepreload:end -->` 之间那块（或 `git checkout` 该段） |
| 预取闸门 | `src/engine/lazy_preload.js` 里把 `linkTier()` 恒返回 `'fast'`，或还原该文件 |
| 延迟非关键图 | 四处 `preloadWhenIdle(...)` 拆掉包一层，恢复构造期直接加载；`main.js` 的 `preloadAssets` 那行删掉 |
| 曲库懒加载 | `git checkout -- src/engine/songs/ src/engine/audio.js src/game/musicRoom.js`，并重跑 `python tools/gen_modulepreload.py --write`（否则 modulepreload 少 19 条） |
| AVIF | 线上带 `?noavif=1` 可先验证 WebP 通路；代码级回退让 `src/art/img.js` 的 `isAvifEnabled()` 恒返回 false；彻底回退则还原 8 个引用文件 + `index.html` 3 条 preload，删 60 个 `.avif` 与 `avif_manifest.js` |
| 非阻塞 CSS | 4 条 `<link>` 去掉 `media="print" onload/onerror`，删 `#boot-fallback` 内联 `<style>` 与那段内联 `<script>`（`<noscript>` 里 4 条普通 link 可一并删） |
| SW 版本令牌 | 路由里 `codeHandler` 改回 `networkFirst`（其余 helper 留着无害），或整文件 `git checkout -- sw.js` |
| 首访字节门禁 | `tools/_firstvisit_bytes.mjs` 是只读工具，删掉不影响线上 |

版本串 `1.6.26` 每次回滚/发布都要再升一次（三处：`index.html` 的 `?v=`、`src/ui/platform.js` 的 `PLATFORM_VERSION`、`sw.js` 的 `CACHE_VERSION`），否则老访客会吃缓存。
