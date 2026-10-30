# 现网「紫屏裸 HUD」故障 —— 复现、修复验证与残留风险

- 站点：<https://mikuascendlog.com/touhouxjx/>（GitHub Pages / Fastly，185.199.108.153，HTTP/1.1，cache-control max-age=600）
- 版本：1.6.41（现网故障）→ 1.6.42（本地工作树修复，未提交）
- 验证环境：本机 Edge headless + CDP（端口 9471-9479）；本地 no-cache 服务 <http://127.0.0.1:8138>；慢网用 CDP Network.emulateNetworkConditions 或屏蔽请求模拟
- 结论一句话：**用户的紫屏是 1.6.41 的「8s 超时撤遮盖」造成的确定性 bug，1.6.42 的「事件驱动首绘门控」在本机 A/B 与全部弱网/失败场景下都不再暴露裸 DOM；判定修复有效。**
- 全量回归（含 R2 修复后的 index.html）：`node tools/_net_blankfix_verify.mjs` → **ALL PASS (57 checks, 6 info), exit 0**，9 个场景全绿；日志 `tools/reports/net_verify_full.log`，结果 `tools/reports/net_verify.json`。

## 1. 旧 bug 复现（1.6.41 / 旧 index.html）

旧逻辑（存档 `_hks_old_index.html`，与现网 1.6.41 除版本号外逐字节相同）：4 个样式表用 `media="print" onload="__hksCss"` 异步加载，同时 `setTimeout(ready, 8000)` —— **不管样式表到没到，8s 后都挂 html.css-ready**，而 css-ready 会把内联兜底遮罩 `#boot-fallback`（深紫 + 标题 + 进度条）撤掉，于是未样式化的真实 DOM 直接露出来。

确定性复现（CDP，冷缓存，屏蔽 `*style.css*`，1280×720）：

| 时间 | html.class | #boot 可见 | 裸 DOM 泄漏 | 画面 |
|---|---|---|---|---|
| 9s | `css-ready`（8s 定时器命中） | 否 | **是** `leak=["#hud"]` | 标题画（main.js 跑起来了） |
| 13s | `css-ready` | 否 | 是 | 同上 |
| 15s | `css-ready` | 否 | 是 | 同上 |

泄漏的 HTML 文本（body 全文）：`POWER Lv.1 0 / 128 1UP 0/99 STAGE 1 0:00 博丽神社 · 黄昏樱花 设置 SURVIVE SPELL CARD ▼ 空格 / 点击继续`。

**与用户截图逐字一致**的证据在现网 1920×1080 冷缓存实测：`cssReadyAt=9792ms`（> style.css 真实到达时间），12/20/40s 三次采样全部 `EXPOSED / hudVis=true / chip 可见 / 顶色 #111111 / light 0.15-0.17% / game=null`，即纯深色底 + 左下角裸 HUD + 青色 SURVIVE 条。截图：`tools/shots/net_deployed_user/deployed_12s.png`。

慢网矩阵（旧代码，已归档 `tools/reports/net_repro.json`，供对照）：

| 场景 | cssReadyAt | 裸窗口 | 真实样式到达 | 最终 |
|---|---|---|---|---|
| 600ms/40KBps 3G | 8775ms | 9→20s | style.css 20901ms | 30s 恢复 |
| 900ms/12.5KBps 极慢 | 9510ms | 10→45s | 更晚 | 45s 仍裸 |
| css 挂起（不返回） | 8045ms | 8→30s | 无 | sheets=0 |
| css 延迟 12s | 8054ms | 5→12s | 12171ms | 13s 恢复 |
| 快网基线 | 463ms | 无 | 126-128ms | 正常 |

**为什么「别人的电脑」必坏而本机正常**：现网实测 index.html TTFB 6.09s、总 7.22s；style.css 145726B 总 13.73s（一次更慢的整页实测 87s）。8s 定时器在样式到达前必然触发 → 每次冷缓存首访都有一段裸 DOM 窗口；本机有缓存/快网，样式 126ms 就到了，定时器永远追不上。

## 2. 1.6.42 的修法（已落地，static 核对 `index.html`）

- 取消 8s 超时撤遮盖：`html.css-ready` **只在 style.css 真正 load 成功时**才挂（`index.html:212-222 markCssReady / styleOk`，`__hksCss` 只在 `name === "style"` 时调用 `styleOk`，`index.html:409-413`）。
- 双门控：`html.css-ready`（样式到）+ `html.hks-ready`（main.js 调 `window.__hksUiReady()`，`index.html:181-211`）都开才放行 `#ui`；兜底规则只在 `html:not(.hks-ready)` 时生效，`#ui > *:not(#boot)` 全部 `display:none !important`（`index.html:44-49`）。
- 失败重试：style.css onerror → 带 cache-bust 的 `hks_retry=` 重新建 link 重试 1 次（`index.html:389-408`），仍失败弹 css 面板（`index.html:421-422`）。
- 看门狗（ES5，1s tick）：5/12/20s 底部慢网提示（`T_HINT=[5000,12000,20000]`，`index.html:168,465-473`）；25s 未 css → css-slow 面板，30s css 已到但无 main.js → js-slow 面板（`T_PANEL=25000`，`index.html:474-480`）；资源后到自动收面板（`closePanelIfRecovered`，`index.html:248-259`）。
- 面板完全内联样式（深紫遮罩 + 卡片 + 诊断 pre + 重新加载/清除缓存并重试/继续等待），不依赖任何外部 CSS（`index.html:309-388`）。
- 首屏兜底 `#boot-fallback` 是内联样式，自带标题/进度条，深紫底 `#05030a` —— 用户永远看到「有样式的启动画面」，不会看到裸 DOM（`index.html:32-143`）。
- 关键样式表加 `<link rel="preload" as="style" fetchpriority="high">` 抢优先级（`index.html:490`）。

## 3. 新行为矩阵（本机验证，1280×720，冷缓存 `?nosw=1`；全量 9 场景 = 57 PASS / 6 INFO / 0 FAIL）

| 场景 | 注入方式 | 关键采样 | 结果 |
|---|---|---|---|
| A 快路径不回归 | 本地 8138 无节流 | 1s 兜底已样式化(light 0.77)；2s hks-ready、标题画开始(light 15.3)；3s #boot 隐藏(light 20.34)；5s game=menu(light 20.29) | **PASS** |
| B 旧页对照 | `/_hks_old_index.html?nosw=1` + 屏蔽 `*style.css*` | 9/13/15s：css-ready 已挂、#boot 隐藏、>`body` 含裸 HUD、`leak=["#hud"]` | **BUG 复现** |
| C 新页同条件 | 新 index + 屏蔽 `*style.css*` | 1s/9s：css 0/4、重试失败、`panel="css"`、hks-ready=false、裸文字=false、#ui 隐藏 | **PASS**（面板兜住） |
| D 慢网 45KB/s | CDP latency 500ms / down 45KBps | 3/8/16/25/40/60s：3s 深色启动画面(light 0.69)；8/16s 底部提示 5s/12s；25s style.css 到→css-ready，遮罩仍盖着；40s js-slow 面板；60s hks-ready(light 20.26) 面板自动收 | **PASS**（全程无裸 DOM） |
| E 慢网 15KB/s | CDP latency 500ms / down 15KBps | 3s 深色空屏(light 0，HTML 本身还在下载)；5s 起启动画面；8/16/25s 提示 5/12/20s；40s css-slow 面板；60s style.css 才到、css-ready、js-slow 面板继续等主脚本 | **PASS**（全程无裸 DOM） |
| F 主脚本失败 | 屏蔽 `*src/main.js*` | 2s css-ready；6s 起 js 面板（"游戏脚本没有启动"，诊断含 main.js URL、`已等待 3s`、样式表 4/4、主脚本 未启动）；31s 同一面板；全程无裸文字（断言口径：6s 时面板已出，允许 panel OR hint；3s 前 HTML 未下完只记 INFO） | **PASS** |
| G 面板恢复 | 屏蔽 style.css → `__hksRetry()`（等价用户点重试） | 恢复耗时 **315ms**：hks-ready=true、panel=null、light 19.5、无裸文字 | **PASS** |
| H noscript | `Emulation.setScriptExecutionDisabled` | 内联 `<noscript>` 横幅"本作需要启用 JavaScript…"；兜底样式化 light 0.79；无裸文字 | **PASS** |

截图（tools/shots/net_gate/）：`fast_001s.png``fast_003s.png`、`ab_old_009s.png/013s/015s`、`ab_new_001s/009s`、`ss_*.png`、`s15_*.png`、`jsfail_006s/031s.png`、`recover_after_*.png`、`noscript_003s.png`、`offline_*.png`。

## 4. 慢网 45/15 KB/s 详细数字

同一套断言下，两档慢网都没有出现任何裸文字（no-raw=0），且提示/面板按 5/12/20/25/30s 的阈值逐级接管：

| 采样 | 45KB/s（500ms RTT） | 15KB/s（500ms RTT） |
|---|---|---|
| 3s | 启动画面已样式化，light 0.69 | 深色空屏（HTML 23KB 尚未下完），light 0，无裸文字 |
| 8s | 底部提示"网络较慢，正在加载必要资源… 已等待 5 秒" | 同左（启动画面已出） |
| 16s | 提示"已等待 12 秒" | 提示"已等待 12 秒" |
| 25s | **style.css 到达 → html.css-ready**，但 #boot 仍遮盖，提示"主脚本加载中… 已等待 20 秒" | 提示"已等待 20 秒"（样式仍未到） |
| 40s | style.css 已到、main.js 未到 → **js-slow 面板**（"还在加载，请稍候"，三键 + 诊断） | **css-slow 面板**（"样式表还在加载"，25s 阈值） |
| 60s | 全部到齐 → **hks-ready，标题画 light 20.26，面板/提示自动收** | style.css 刚到（landed 2/4）css-ready=true；主脚本仍未到 → js-slow 面板继续保留 |
| 裸 DOM | 0 次 | 0 次 |

补充：ss 场景 60s 的 `leak=["#overlay"]` 是标题菜单的**已样式化**文字，`exposed=false`（门控判定正常）；部署环境实测 87s 才整页可用，与本机 45KB/s 下 ~60s 量级一致，说明修复后只是"慢"，不再"坏"。

## 5. 主脚本被屏蔽 / 主脚本很慢

- 屏蔽 main.js（场景 F）：样式全部到位（css 4/4、css-ready），但 `#ui` 被 `html:not(.hks-ready)` 遮住，页面停在**有样式的启动画面**；6s 后（script error 监听 + 2.6s 延迟）弹出 js 面板，标题"游戏脚本没有启动"，正文提示脚本加载失败/版本过旧，诊断列出 main.js 完整 URL、已等待秒数、样式表 4/4、主脚本 未启动、网络 在线 / 版本 1.6.42；`重新加载 / 清除缓存并重试 / 继续等待` 三键。31s 仍是同一面板，全程无裸 DOM。
- 若 main.js 只是慢（silently 下载中，E 场景）：25s 前的慢网提示按 5/12/20s 出现"主脚本加载中… 已等待 N 秒"；30s 仍无 → js-slow 面板；资源最终到了自动收面板 → 进入游戏。

## 6. 面板与恢复

- 面板是纯内联样式（不依赖 style.css），所以在"样式表全挂"场景下依然是一块深紫半透明卡片，视觉上仍是完成度高的错误页而非裸 DOM。
- "重新加载"=location.reload；"清除缓存并重试"=注销 SW + 清 caches + `?hks_reset=<ts>` 强制换 URL；"继续等待"=关面板 + 底部提示；`waitMore` 现在 30s 后自动复位（`index.html:354-356`），资源仍不来会再次弹面板（R2 已修）。
- **恢复验证**：屏蔽 style.css 导致 css 面板后，解除屏蔽并调用 `window.__hksRetry()`，**315ms** 后 html 挂上 hks-ready、面板自动移除、标题画可见（light 19.5），与"资源后到自动收面板"的 `closePanelIfRecovered` 逻辑一致；R2 修复后复跑该场景无回归。

## 7. Service Worker 的「后台补拉」（静态核对 `sw.js`，1.6.42）

- `CACHE_VERSION='hks-v1.6.42'`（`sw.js:25`），activate 时删除所有 `hks-` 旧缓存并 `clients.claim()`。
- 导航 network-first，`NETWORK_TIMEOUT=4000`（`sw.js:28,318-349`）：4s 内拿到网络版就用网络版（顺手 `cache.put(OFFLINE_URL,...)` + 记版本令牌）；超时/失败才回退缓存的 index.html 或离线页，同时 `event.waitUntil(refreshShellInBackground(request))`（`sw.js:303-315`）在后台再拉一次网络版 index.html（先等 2000ms 让出首屏带宽，20s 超时，成功则更新离线壳 + 版本令牌），保证"这次能玩、下次刷新就是新版"。
- 带 `?v=` 的静态资源 cache-first；代码资源（js/css）同一发布版本内 cache-first，版本令牌变了整包重抓；其它 stale-while-revalidate（`sw.js:376-389`）。
- 含义：**没装过 SW 的首次访问**（用户场景）完全靠 HTML 自身兜底 —— 这正是 1.6.42 内联门控要覆盖的场景；装过 SW 的复访在弱网下最多看到「缓存里的旧壳」，旧壳若仍是 1.6.41 则仍可能裸一次（残留风险 R4）。

## 8. 失败模式对照

| 故障 | 旧 1.6.41 | 新 1.6.42 |
|---|---|---|
| 冷缓存 + 慢网（style.css 13.7s） | **裸 HUD 约 12s+** | 启动画面 + 5/12/20s 提示，样式到即放行 |
| style.css 404/被墙（永久失败） | 8s 后裸 HUD 永久 | 重试 1 次 → css 面板（可重试/清缓存），无裸 DOM |
| main.js 404 | css-ready 后裸页面 + 无面板 | 启动画面 + js 面板（含 URL 诊断） |
| main.js 慢 | 裸页面（若 CSS 也慢） | 启动画面 + js-slow 面板 + 自动恢复 |
| 无 JS（noscript/禁用） | 裸 DOM | 内联 noscript 横幅 + 样式化兜底 |
| 装过 SW 后离线刷新 | SW 缓存的旧壳 | 同左（缓存壳 + 后台补拉），验证 `hks=true` 可用、无裸 DOM |

## 9. 结论与残留风险

**结论：判定 1.6.42 修复有效。** 8s 超时撤遮盖是原则性错误（用超时猜测资源失败），已由「事件驱动双门控 + 重试 + 看门狗」取代；本机 A/B 与 8 类故障注入下，裸 DOM 暴露均为 0。原 8s 方案不可救，只能替换 —— 修复后不再存在任何"时间到了就假设成功"的路径。

残留风险（按优先级）：

- **R1 首次 JS 加载即失败但 style.css 正常**：面板 6s 才出（script error 后 2.6s）；此前 ~6s 用户看到样式化启动画面，不会裸，可接受。
- **R2（已修，Lead 已落地）「继续等待」后面板不再自动重开**：原 `waitMore` 会永久阻止后续 `showPanel`。修复：`index.html:354-356` 在 btnWait 里加 `setTimeout(function(){ waitMore = false; }, 30000)`，点「继续等待」30s 后允许再次弹面板；复测 recover/panel 场景无回归（全量 PASS）。
- **R3 preload 失败未计入**：`<link rel=preload as=style>`（`index.html:490`）的 error 没有任何处理；极端情况下 preload 失败但 stylesheet link 成功不影响，反之则靠 link onerror 兜。建议 preload 也挂 `onerror="__hksCssFail(this,'style')"`（注意会与 link 的 onerror 重复计数，需幂等）。
- **R4 老访客 SW 缓存旧壳**：1.6.41 装过 SW 的用户，若部署后第一次导航 4s 超时走缓存壳，仍可能看到一次旧版裸屏；下一次刷新（后台补拉已换新壳）即修复。发布时 `CACHE_VERSION` 已 bump，影响窗口≈一次刷新。
- **R5 CDN 缓存**：GitHub Pages max-age=600，部署后最多 10 分钟内仍可能拿到旧 HTML；SW 版本令牌会最终纠正。
- **R6 视觉验收主观性**：本报告的"无裸 DOM"以 DOM 断言 + 截图双证；1280×720 下旧页裸 HUD 在 canvas 下方视口外，视觉对照需用 1920×1080 现网截图（已附）。

## 10. 验证命令（Lead 修复落地后运行）

```bash
cd C:/Users/GuSheng/Downloads/HKS
# 全场景（约 4-5 分钟，退出码 0 = 全 PASS）：
node tools/_net_blankfix_verify.mjs
# 只跑快路径回归（~30s）：
node tools/_net_blankfix_verify.mjs fast
# 只跑慢网 45/15KBps（~2.5 分钟）：
node tools/_net_blankfix_verify.mjs ss s15
```

成功判据：末行 `ALL PASS (57 checks, 6 info)`、进程退出码 0（任一断言失败会出现 `FAILED n / total` 并非零退出）。

报告 JSON：`tools/reports/net_verify.json`（全量覆盖；子集运行会保留其它场景结果）。最近一次全量日志：`tools/reports/net_verify_full.log`。
