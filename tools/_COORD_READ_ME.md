
## 2026-10-31 22:20 追加（清理：_gate 冻结副本已删）
- 按用户指示清理 `_gate/`：删除 `base` / `after` / `qa_base` / `qa_after` 四份各 ~82MB 冻结副本（共 ~327MB），`_gate/` 现只剩 `report/`（141KB，含已随 fd8a4e1 入库的 5 个文件 + 5 份运行日志）。
- 注意：再跑 `tools/_boot_gate_qa.mjs` 需要重新冻结副本（`git archive HEAD | tar -x -C _gate/qa_after` 之类），旧的 `_gate/qa_after` 不再存在；`fd8a4e1` / `8b162cf` 仍在 git 里，回滚与复现不受影响。
- 另外我删掉了自己的调试探针 `_pt/_b_flake.mjs`、`_pt/_b_repro.mjs`、`_pt/_boot_qa_dbg.mjs`。

## 23:02 首屏样式拆分 + 图片再压 + 压缩发布流水线（1.6.51，f7bbbd0）

本会话（加载优化）刚推送的改动，动到 `index.html` / `src/main.js` / 新增 `src/title.css`：

1. **首屏样式拆分**：`index.html` 首屏只引 `src/title.css`（从 `style.css` 按标题页 DOM 提取的
   247 条规则 / 56.9KB），完整 `src/style.css`（142.3KB）改由 `main.js` 的 `loadGameCss()`
   在揭幕后异步插入 `<link id="hks-game-css">`；`ensureGameKit()` 里多等它一步。
   → **改 style.css 的会话注意**：标题页新增的类/选择器不会自动进 `title.css`，需要跑
   `node tools/gen_title_css.mjs --write` 重新生成（该脚本会启动无头 Edge 渲染标题页再按 DOM 提取，
   需要本地服务在 8138）。只改游戏内（HUD / 关卡 / 子弹 / 结局）样式则完全不用管。
2. **三张标题图**再压一档（quality=42，分辨率不变），139908B → 93386B。
3. **发布流水线**：`tools/minify_build.mjs`（esbuild 压 JS/CSS，产物 `dist/`，路径与 `?v=` 全部不变）
   + `.github/workflows/pages.yml`。`dist/` 已加进 .gitignore。**未启用**：需要在仓库
   Settings → Pages 把 Source 改成 "GitHub Actions" 才会部署压缩版；不改则线上维持源码版，
   无副作用。
4. 工作区里 `src/engine/audio.js` 的未提交改动**不是本会话的**（曲目加载自愈重试），别误提交。


## 23:35 曲目加载失败自愈（1.6.52，audio.js 会话）

- 本会话只改 `src/engine/audio.js`（+ 版本 bump 三件套 + `docs/MUSIC_LOAD_SELFHEAL.md` +
  `tools/_music_fault.mjs` / `tools/_music_trace.mjs`）。**没碰** `src/main.js` / 首屏样式 / 标题图。
- 修的是「曲库模块请求失败一次 → 整关 BGM 判死刑」：失败后按 1.5s/3s/6s 退避重试最多 3 次，
  桥接等待期旧曲继续响，重试到货无缝接班；`playMusic` 早退加 `!_songSwap`。
- 故障注入台架用法（**必须**先 `Network.setBypassServiceWorker`，否则 SW 缓存的 import 拦不到）：
  `FAULT_TARGET=youma_stage1 FAULT_MODE=fail FAULT_COUNT=4 CDP_PORT=9552 node tools/_music_fault.mjs`
- 证据：瞬态失败自愈 1.53s；永久失败 7 次请求后停；_music_trace 全流程无静音/停走；
  _lead_smoke 14/14 PASS。
- 版本号已到 **1.6.52**，下一位 bump 请从 1.6.53 起。

## 23:12 版本号撞车事故 + 1.6.53 门禁软上限（ed1dad0）

**撞车**：本会话在 23:0x 把 1.6.51 提交后，另一个会话紧接着提交了 `c1dcebc fix(audio): 1.6.52 …`，
而本会话的下一提交也写了 1.6.52 → 同一个版本串对应两份不同内容。SW 的 `CACHE_VERSION`
是 `hks-v1.6.52`，撞车会让老访客的「换版本清缓存」失效。已用 `--amend` 改成 **1.6.53** 后推送。
**教训：bump 之前先 `git log --oneline -3` + `git fetch`，别假设版本号只有自己在用。**

**1.6.53 内容**：启动幕门禁加 2.5s 软上限（`BOOT_GATE_SOFT_MS`）。线上实测门禁全开时揭幕
43–53s、`?bootgate=off` 时 2.6s —— v2 门禁把 1MB+ 的进关资源塞进了揭幕路径，把「点进去干等」
换成了「所有人都先干等一遍」。现在 `Promise.race([三路, softCap(2500ms), hardCap(90s)])`：
快网 2.5s 内全绿照旧，慢网到点先揭幕、剩余资源后台继续下，进关前 ensureGameKit 兜底。


## 23:20 线上复核结论（1.6.52 曲目自愈，1.6.53 已叠加）

- **线上 JS 是压缩产物**：`index.html` 与 HEAD 逐字节一致，但 `sw.js` / `src/**/*.js` 的 sha256
  永远不等于 git blob（线上 minify：sw.js 21811B→7389B，audio.js 70917B→24966B）。
  **复核 JS 要查标记而不是比 sha**：`grep -o '_scheduleSongRetry\|_retrySongLoad\|_songRetryCounts'`、
  `1500*Math.pow(2,i)`。1.6.53 线上三者分别为 3/2/4 次命中，`sw.js` = `hks-v1.6.53`。
- 线上冒烟（`PT_BASE=https://mikuascendlog.com/touhouxjx node tools/_lead_smoke.mjs`）：
  3 次里 2 次 14/14 PASS（含"进关 BGM=pre1"）；1 次因真实网络慢触发门禁 soft-timeout +
  进关时序抖动而红 —— 属台架时序敏感，非 1.6.52 回归（另一会话 ed1dad0=1.6.53 已把门禁改成 2.5s 软上限）。
- 教训：headless 反复整站冷载会把本机带宽打满（同一台架三次揭幕 6.1s / 6.1s / 33.9s），
  线上冒烟前先确认没有别的 headless Edge 在跑。


## 23:50 首屏 audio 延后实验（本会话，worktree ../hks-audio @ ed1dad0）

**动因**：浏览器策略本来就要等第一次用户手势才允许出声 → `audio.js`(66KB) + `songs/index.js`(14KB)
不必进首屏，等首次 pointerdown/keydown 再 import。这是路线 B 里风险最低、收益最大的一刀。

**改动（只在 src/main.js + index.html）**
- 静态 import 改模块级可变绑定 `AudioEngine/warmSongs/preloadSongs/isSongLoaded` + `loadAudioModule()`。
- 新增 `createAudioStub()`：Proxy 空壳，方法空操作、`muted/sfxEnabled/musicEnabled/sfxVolume/musicVolume/
  currentSong/soundingSong/ctx/musicProgress` 给默认值、set 一律 true。构造函数 `this.audio = createAudioStub()`。
- `_unlockAudio()` 改 async：`_audioLoading/_audioReady` 守卫 → `await loadAudioModule()` → new AudioEngine() →
  `_applyAudio()` + `_prewarmAudio()` → `unlock()`。失败静音运行。已就绪时只补 unlock。
- 门禁第 1 面曲目、`_warmRemainingSongs`、`_warmStageMusic`、`_ensureStageMusic` 全部加引擎未就绪守卫。
- `python tools/gen_modulepreload.py --write` 重生成：**22 项 518.6KB → 19 项 401.4KB**。

**同口径弱网实测（15KB/s+RTT400ms，两个干净 worktree 各跑 2 次）**
| | 到菜单 | 揭幕 | 字节 | 请求 |
|---|---|---|---|---|
| 基线 ed1dad0(1.6.53) @8141 | 53.79s | 56.95s | 1665KB | 62 |
| + audio 延后 @8140 | **44.49s** | 47.78s | 1399KB | 56 |
→ **-9.3s / -17.3%**，字节 -266KB，请求 -6。单流吞吐两边都是 31KB/s，口径一致。

**冒烟**：_perf_smoke_kit / _perf_smoke_ending / _perf_smoke_ui 在 8140 上全 PASS（0 错误 0 网络失败 0 4xx）；
专项 `_perf_check_lazy_audio.mjs` 验证首屏 audio 请求数=0、首次手势后 ctor 变 AudioEngine + ctx 建立、
进关 currentSong=soundingSong=pre1、二次手势不重建。

**⚠ 需要协调**：主工作区 `src/main.js` 现在是「LQ 背景改动 + 我的 audio 改动」叠在一起的两套半成品，
而 LQ 的 `src/game/stage.js`（+238 行，新增 waitStageBg/stageBgReady 导出）也在工作区未提交。
**建议 LQ 会话先提交 stage.js + main.js 的 LQ 部分**，我再在主工作区 re-apply audio 改动（patch 脚本
`tools/_patch_lazy_audio.py` 可重放，8 处锚点与 LQ 区域不重叠）。谁先合并请在本文件留一行。

## 00:00 1.6.54 已合并提交（audio 延后）

LQ 会话已自行提交 8223273（stage.js LQ 背景），我的 audio 改动随后在主工作区 re-apply 并提交
**a3a082f perf(load): 1.6.54 音频引擎延后到首次手势**，push 完成，Actions 约 40s 部署。

线上复核：index.html 14 处 1.6.54、modulepreload **19 项**、main.js 压缩后 87837B、
`_audioLoading`/`_audioReady` 各有命中、modulepreload 里已无 engine/audio.js、sw.js = hks-v1.6.54。

线上实测（runs=3）：到菜单 **1606 / 1657 / 1806ms**（中位 1.66s），bytes 402–547KB，reqs 45–72，
TTFB 601–659ms，errors 0。对比 1.6.51 的 3.0–21.7s、1.6.53 的 3.5–8.8s。

两个 worktree（../hks-audio、../hks-base）已删，8139/8140/8141 服务已停，只剩主树 8138。
