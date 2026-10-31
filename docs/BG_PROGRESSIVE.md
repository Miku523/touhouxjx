# 关卡背景「画面不对」的真因与修法（低清档渐进加载）

## 症状

玩家进关（第 1–6 面、EXTRA 都一样）看到的不是厚涂背景图（博丽神社樱花黄昏、红魔馆血月…），
而是程序化天空：深紫星空 + 深红横带 + 黑色剪影树 + 荧光草皮。HUD、自机、弹幕全部正常，
只有世界层不对。

## 真因

1. **高清背景太大，玩家进关时它还在路上。** 厚涂图是 2048 宽 WebP/AVIF，单张 135–460KB
   （shrine 461KB / 340KB，nether 370KB…）。线上实测本机到 GitHub Pages 单流约 50KB/s，
   十几张并发时单张要 10–40s 才落地。
2. **原来没有任何「进关前等背景」的门禁。** `Stage.draw()` 只做 `usable = bgs.filter(e => e.ok)`，
   图没到就直接画 `_drawFallbackBg()`——玩家一进关看到的就是程序化天空，等到图到了才淡入，
   中途还会突然变脸。启动幕门禁（v2）只保标题图 / game kit / 第 1 面曲目，**不含关卡背景**。
3. **偶发「请求发出去了，body 不下完」。** CDP Network 事件里能看到 REQ→RES(200) 之后 body 永不 FIN，
   只有重新赋值 `img.src` 才会取消，靠原来的 `onerror` 重试兜不住。

## 修法

### 1. 新增低清档（`tools/gen_bg_lq.py`）

同构图缩到 1280 宽、WebP q44，14 张由 **3787.2KB → 698.7KB**（小 81.5%）：

| key | 高清 | 低清 | 缩小 |
| --- | --- | --- | --- |
| shrine | 450.5KB | 78.1KB | 83% |
| shrine_2 | 320.8KB | 66.7KB | 79% |
| forest | 279.1KB | 41.4KB | 85% |
| forest_2 | 213.2KB | 37.4KB | 82% |
| lake | 290.3KB | 58.6KB | 80% |
| lake_2 | 224.1KB | 42.2KB | 81% |
| mountain | 278.7KB | 53.8KB | 81% |
| mountain_2 | 205.5KB | 46.9KB | 77% |
| nether | 369.6KB | 54.5KB | 85% |
| nether_2 | 224.1KB | 40.8KB | 82% |
| moon | 310.8KB | 58.9KB | 81% |
| moon_2 | 262.7KB | 50.9KB | 81% |
| mansion | 187.3KB | 34.2KB | 82% |
| mansion_2 | 170.4KB | 34.4KB | 80% |

重跑：`python tools/gen_bg_lq.py`（`--force` 覆盖、`--dry-run` 只看体积）。
低清档刻意用 WebP：`artUrl()` 的 AVIF 逻辑只认 `src/art/gen/**` 的 `.webp` stem，
新增低清档不碰 `artUrl` / `avif_manifest.js`，避免和 `tools/optimize_art_avif.py` 打架。

### 2. `src/game/stage.js`：先低清、后高清、能升档

- `_bgEntry()` 每张背景有两个 `Image`：`e.lq`（`<key>_lq.webp`）与 `e.img`（AVIF/WebP 高清）。
  先请求低清；低清**到货后**才请求高清（顺序化，别让高清把弱网连接占满）。
- `_bgSource()` 决定这一帧画哪一档：有高清用高清（tier 1），只有低清用低清（tier 0）。
- `composeBgLayer()` 按 `_bgSource()` 取图，并把档位记在合成层 `cv.__tier` 上；
  按**实际原图尺寸**做 cover（低清是 1280 宽，原来写死 2048 会把它缩得比视口还小）。
- `_bgScheduleUpgrade()`：高清到货后在 `requestIdleCallback` 里重合成缓存层（`__tier=1`），
  绝不塞进弹幕帧；期间占 `_bgWarmBusy` 防并发重合成。
- `_bgStallGuard()`：请求发出去 `BG_LQ_STALL_MS = 9000` / `BG_HD_STALL_MS = 25000` 还没落地，
  就换一个查询串重发（最多 3 次）——处理上面第 3 条那种「RES 到了但 body 不 FIN」。
- 新增导出 `stageBgReady(theme)` / `waitStageBg(theme, timeoutMs = 9000)`，
  供 `main.js` 在进关前等低清档。

### 3. `src/main.js`：进关前等低清档

新增 `_ensureStageBg(def)`：未就绪就盖「正在准备关卡画面…」并 `await waitStageBg(theme, 9000)`；
就绪时零等待、不盖遮罩；超时也照常进关（后台继续加载）。挂到三个进关入口：
`startStage()`、`_startExtraStage()`、重开/跳关路径（`_createStage(..., { skipIntro: true })` 之前）。

### 4. 一个必须记住的坑：decode 没完成时合层会得到「全透明层」

修改过程中踩到并修掉：图片 `onload` 之后像素还没解出来，这时 `drawImage` 是**空操作**，
合成出的是全透明 canvas；它一旦被 `_bgLayerPut()` 缓存（还带着 `__tier=1`）就是**永久黑屏**——
比原来的程序化天空更糟。现在：

- `_bgSource()` 只认「load + decode 完成」的图（`ok/lqOk` + `hdDecoded/lqDecoded`）；
- `Stage.draw()` 的可用列表用 `bgs.filter(e => !!_bgSource(e))`，这张图不可画就继续画程序化天空，下一帧再切；
- `composeBgLayer()` 末尾采样中心像素，`alpha === 0` 直接返回 `null`（不缓存），兜底防黑屏。

## 实测（本地，只对 `/art/gen/bg/` 限速 50KB/s，模拟线上弱网）

工具：`python tools/_bg_throttle_serve.py 8300 50`（只压背景图，其它资源全速）
+ `node tools/_bg_lq_ab.mjs http://127.0.0.1:8300/index.html <tag> 50 0 off`。

| | 进关到出画面 | 进关后画程序化天空的帧 | 低清到货 | 高清到货 |
| --- | --- | --- | --- | --- |
| 修复前（HEAD ed1dad0，A/B 冻结副本） | **5614ms** | 18 帧（≈5.3s 画面不对） | — | 6683ms |
| 修复后 | **1729ms**（其中遮罩 1051ms） | 0 帧 | 1541ms | 6682ms |

- 修复后第 1 面首帧就是厚涂背景（低清档），高清档 6.7s 到货后空闲帧静默升档，画面不闪。
- 6 个主面 + EXTRA 全部过一遍（`node tools/_bg_lq_sweep.mjs <url> <tag> 50`）：
  shrine / forest / lake / mountain / nether / moon / mansion 每面 `_bgFade` 都到 1，
  截图见 `.tmp_shots/sweep_*.png`（不入库），控制台 0 错误。
- 线上原症状（deployed 1.6.50 + ego 真浏览器）：进关后 90s 内 `_bgFade` 一直是 0，
  即本文件开头那张「深紫星空 + 黑剪影」截图。

## 相关文件

- `tools/gen_bg_lq.py`：低清档生成
- `tools/_bg_throttle_serve.py`：只对背景图限速的探针服务器
- `tools/_bg_lq_ab.mjs`：A/B 量「进关到出画面」耗时 + 截图
- `tools/_bg_lq_sweep.mjs`：7 个主题全扫一遍
- `src/art/gen/bg/*_lq.webp`：低清档（14 张）
