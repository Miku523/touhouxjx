# 启动幕门禁性能对比（HKS）

生成：2026-10-31T11:51:02.424Z  
Harness：`tools/_gate_perf.mjs`；原始数据：`_gate/report/raw/*.json`；汇总 JSON：`_gate/report/gate_perf.json`

## 一句话结论

门禁把「进关 kit（1.2–1.28MB）+ 第 1 面曲目（157KB）」从揭幕之后提前到揭幕之前：**fast 本机代价≈0（被 1.4s 启动幕地板吸收），700KB/s 下揭幕 +2.2s（3.44s→5.65s），150KB/s 下 +9.4s（7.85s→17.29s）；揭幕前多传 +1.24~1.34MB（弱网）**；换来的是揭幕瞬间进关资源 100% 就绪、`__hksBootGate.failed` 为空、console error 0。→ **这是设计取舍**：用启动幕上一次可预期的等待，换进关 0 等待。

## 方法

- 被测副本：`_gate/after` = 当前工作树冻结（含门禁）；同一副本 A/B：`/index.html`（门禁开）vs `/index.html?bootgate=off`（门禁关：只等标题三图 + 旧「揭幕后 `_prefetchGameKit()`」行为）。
- `_gate/base` = `git archive HEAD` 快照 → 改前参考行（含另一会话并发改动，见 caveat）。
- 每次运行：全新 headless Edge 临时 profile + `Network.setCacheDisabled(true)`；document_start 注入页内轮询，用 `performance.now()` 记录 `__boot.done`（揭幕）、`__game._bootDone`（标题可交互）、`__game.state==='menu'`；`t_reveal+3000ms` 采样 `performance.getEntriesByType('resource')`。
- 带宽：fast = localhost 无节流；700 = 700KB/s + 220ms RTT；150 = 150KB/s + 220ms RTT（CDP `Network.emulateNetworkConditions`）。
- 字节主口径：揭幕前完成（`responseEnd ≤ t_reveal`）条目的 `transferSize` 合计（任务要求口径）。memory-cache 命中条目 ts=0 而 encodedBodySize>0，故 ts 合计=真正过网字节；dev server 不发 gzip → ≈未压缩线传字节。
- 请求数：揭幕前完成的去重 URL 数（重复/memory-cache 条目不重复计）。
- 每条件 3 次冷启动（700 gate-on 因首跑出现暖缓存伪影追加到 4 次），取中位数并给 min~max。

## 主表（中位数；括号 min~max）

| 条件 | 带宽 | t_reveal (ms) | t_title_interactive (ms) | 门禁 span (ms) | 揭幕前网络字节 (MB) | 其中 kit (MB) | 其中曲目 (MB) | 揭幕前完成请求数 | 曲目就绪 honou_pre1 / stage.js | gate.failed 为空 |
|---|---|---|---|---|---|---|---|---|---|---|
| base(HEAD) | fast | 1698 (1694~1710, n=4) | 1673 (1673~1673, n=1) | - | 1.47 (1.47~1.47) | 0.00 (0.00~0.00) | 0.06 (0.06~0.06) | 92 (91~96) | 0/4 / 4/4 | - |
| base(HEAD) | 700 | 3405 (3387~3471, n=4) | 3445 (3445~3445, n=1) | - | 1.02 (1.02~1.02) | 0.00 (0.00~0.00) | 0.06 (0.06~0.06) | 38 (37~44) | 0/4 / 4/4 | - |
| after gate-on | fast | 1700 (1685~1731, n=3) | 1675 (1659~1705, n=3) | 227 (196~241, n=3) | 2.31 (2.31~2.79) | 1.22 (1.22~1.22) | 0.15 (0.15~0.15) | 125 (125~125) | 3/3 / 3/3 | 3/3 |
| after gate-on | 700 | 5649 (3947~5767, n=4) | 5624 (3923~5740, n=4) | 2974 (1111~3133, n=4) | 2.26 (1.40~2.34) | 1.14 (0.28~1.22) | 0.15 (0.15~0.15) | 77 (77~77) | 4/4 / 4/4 | 4/4 |
| after gate-on | 150 | 17291 (17282~17324, n=3) | 17266 (17258~17302, n=3) | 10295 (10281~10305, n=3) | 2.26 (2.26~2.26) | 1.14 (1.14~1.14) | 0.15 (0.15~0.15) | 77 (77~77) | 3/3 / 3/3 | 3/3 |
| after gate-off | fast | 1702 (1698~1712, n=3) | 1674 (1672~1686, n=3) | 138 (133~152, n=3) | 1.47 (1.47~1.47) | 0.00 (0.00~0.00) | 0.06 (0.06~0.06) | 92 (92~93) | 0/3 / 3/3 | 3/3 |
| after gate-off | 700 | 3444 (3406~3453, n=3) | 3420 (3381~3426, n=3) | 164 (131~167, n=3) | 1.02 (1.02~1.02) | 0.00 (0.00~0.00) | 0.06 (0.06~0.06) | 37 (37~48) | 0/3 / 3/3 | 3/3 |
| after gate-off | 150 | 7845 (7837~7942, n=3) | 7820 (7810~7922, n=3) | 168 (160~278, n=3) | 0.92 (0.92~0.92) | 0.00 (0.00~0.00) | 0.06 (0.06~0.06) | 35 (35~43) | 0/3 / 3/3 | 3/3 |

**Δ（after gate-on − after gate-off）**：fast `t_reveal -2ms`、`字节 0.84MB`；700 `t_reveal +2204.5ms`、`字节 +1.24MB`；150 `t_reveal +9446ms`、`字节 +1.34MB`。

## 逐资源就绪（responseEnd 相对 navigationStart，ms；ready = 完成于 t_reveal 之前的运行数）

| 组 | honou_pre1 | youma_stage1 | stage.js | bullets.js | story.js |
|---|---|---|---|---|---|
| base_head/fast | - 0/4 | - 0/4 | 1675 (1672~1688, n=4) 4/4 | 1675 (1672~1688, n=4) 4/4 | 1676 (1673~1688, n=4) 4/4 |
| base_head/700 | - 0/4 | - 0/4 | 3386 (3368~3451, n=4) 4/4 | 3385 (3367~3451, n=4) 4/4 | 3386 (3368~3451, n=4) 4/4 |
| after_gate_on/fast | 96 (90~105, n=3) 3/3 | 98 (92~105, n=3) 3/3 | 97 (91~105, n=3) 3/3 | 97 (90~104, n=3) 3/3 | 96 (91~104, n=3) 3/3 |
| after_gate_on/700 | 2816 (2775~2858, n=4) 4/4 | 2953 (2908~3048, n=4) 4/4 | 2981 (2969~3014, n=4) 4/4 | 2658 (2586~2687, n=4) 4/4 | 3042 (3032~3064, n=4) 4/4 |
| after_gate_on/150 | 8854 (8842~8863, n=3) 3/3 | 9721 (9720~9732, n=3) 3/3 | 11046 (11037~11051, n=3) 3/3 | 8272 (8264~8291, n=3) 3/3 | 11030 (11021~11051, n=3) 3/3 |
| after_gate_off/fast | - 0/3 | - 0/3 | 1679 (1676~1691, n=3) 3/3 | 1678 (1677~1691, n=3) 3/3 | 1679 (1677~1691, n=3) 3/3 |
| after_gate_off/700 | - 0/3 | - 0/3 | 3428 (3386~3432, n=3) 3/3 | 3428 (3386~3432, n=3) 3/3 | 3428 (3387~3432, n=3) 3/3 |
| after_gate_off/150 | - 0/3 | - 0/3 | 7827 (7815~7930, n=3) 3/3 | 7826 (7814~7931, n=3) 3/3 | 7827 (7815~7932, n=3) 3/3 |

## 解释

- **t_menu 不能当门禁指标**：`main.js` constructor 里就 `this.state='menu'`（main.js:247），它只反映 DOM/CSS/图片就绪（fast ~220ms、700 ~2.2s、150 ~6.6s）。真正的输入门禁在 `main.js:369` `if (!this._bootDone) return;`，所以另测 `t_title_interactive`（`__game._bootDone===true` 首次观测）；它比 t_reveal 早 ~25ms（_bootDone 在揭幕动画前先置位）。
- **门禁 span** 在 gate-on 下 = 三路全绿耗时（fast 227ms / 700 中位 ~3.0s / 150 10.3s）；gate-off 下只跑标题图任务（130~280ms），两者不可直接比。
- **fast 地板**：`MIN_PAGE_MS=1400` 让揭幕最早 ~1.7s，而 kit 在 localhost 只需 ~200ms，于是在本机看不到代价；这不代表弱网无代价。
- **base(HEAD) 参考**：HEAD 在揭幕后 1.8s 才发起 `_prefetchGameKit()`（ResourceTiming 里 stage.js start≈1668ms），且从不预载 honou_pre1/youma_stage1（0/4 就绪），所以玩家点进第 1 面时才开始付这笔下载账——门禁正是把这段前移。
- **设计取舍（+9.4s / +1.34MB 换进关 0 等待）**：gate-off 在 150KB/s 下揭幕 7.85s 后还要再下 1.2MB kit（≈8.5s）才能进关，若玩家揭幕即点进第 1 面会撞上 `ensureGameKit`/`_ensureStageMusic` 等待；gate-on 把这段下载前移到启动幕，代价是揭幕晚 9.4s（150KB/s）或 2.2s（700KB/s）、揭幕前多传 1.24~1.34MB。fast/本机因 1.4s 地板代价≈0。即：**用一次可预期、有进度条的等待，替换进关时的硬卡顿**；弱网用户感知差异明显，但玩法入口不再卡资源。
- **gzip 真实部署估算**（dev server 不发 gzip）：kit 1.20MB(ts) → gzip 约 **0.31–0.45MB**（此前 49 模块 gzip 约 404KB），首面曲目 157KB → 约 50KB；揭幕前 Δ 字节从 +1.24~1.34MB 降到 ~0.33~0.43MB，于是 **700KB/s ≈ +0.5~0.6s、150KB/s ≈ +2.9~3.0s**（比实测小 3–4 倍）。结论：真实 CDN 下门禁代价是亚秒~秒级，仍值得换进关即开。

## caveat

- dev server tools/serve_nocache.py 不发 gzip/br → transferSize 为未压缩口径；线上启用压缩后 kit 1.20MB(ts) 可压到 0.31–0.45MB（49 模块 gzip ≈404KB 量级）、首面曲目 157KB → ~50KB，弱网门禁代价随之缩小。
- gzip 估算：按「kit + 曲目压缩、其余资源同比例压缩」折算，揭幕前 Δ 字节从 +1.24~1.34MB 降到 ~0.33~0.43MB → 700KB/s 的 +2.2s 约缩到 +0.5~0.6s、150KB/s 的 +9.4s 约缩到 +2.9~3.0s（Lead 口径 ~+0.6s / ~+3s，一致）。
- memory-cache 命中条目 transferSize=0（d≈5–18ms）但 encodedBodySize 完整，故 ts 合计 < 实际解码载荷；报告主表用 ts（网络口径），eb_payload 仅参考。
- fast 条件存在 MIN_PAGE_MS=1400ms 地板效应，门禁在 <1.4s 完成时完全隐形，不能用 fast 判断弱网代价。
- 每个条件 3-4 次冷启动（700 gate-on 4 次，其余 3 次；base 每组 3+1 次），弱网只有 min/max，非置信区间。
- localhost python 单线程 static server + headless Edge，不代表 CDN/HTTP2/多并发下的绝对值。
- base(HEAD) 快照与 after 的代码差异 = 门禁实现 + 另一会话改动：git diff --stat 显示 src/main.js +233 行、src/engine/lazy_preload.js 29 行、docs/BOOT_SPLASH_DESIGN.md 94 行、tools/_pt_core.mjs 3 行；期间另一会话还提交了音频/曲库相关改动（HEAD 里没有），因此 base 行只作量级参考，不作为精确 A/B 基线。
- git archive HEAD 输出 LF、工作树为 CRLF，diff -r 会把大量 docs/*.md 报 differ，改动清单以 git diff --stat 为准。

## 附录：逐次运行

| 组 | 文件 | t_reveal | t_title_interactive | 门禁 span | 揭幕前字节(MB) | kit(MB) | 曲目(MB) | 揭幕前请求 | 曲目就绪 | err | wall(ms) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| base_head/fast | base_head_fast.json | 1694 | - | - | 1.47 | 0.00 | 0.06 | 96 | stage_js | 0 | 4730 |
| base_head/fast | base_head_fast.json | 1695 | - | - | 1.47 | 0.00 | 0.06 | 92 | stage_js | 0 | 4715 |
| base_head/fast | base_head_fast.json | 1710 | - | - | 1.47 | 0.00 | 0.06 | 92 | stage_js | 0 | 4734 |
| base_head/fast | base_head_fast2.json | 1701 | 1673 | - | 1.47 | 0.00 | 0.06 | 91 | stage_js | 0 | 4730 |
| base_head/700 | base_head_700.json | 3387 | - | - | 1.02 | 0.00 | 0.06 | 44 | stage_js | 0 | 6419 |
| base_head/700 | base_head_700.json | 3412 | - | - | 1.02 | 0.00 | 0.06 | 38 | stage_js | 0 | 6443 |
| base_head/700 | base_head_700.json | 3397 | - | - | 1.02 | 0.00 | 0.06 | 37 | stage_js | 0 | 6427 |
| base_head/700 | base_head_700_2.json | 3471 | 3445 | - | 1.02 | 0.00 | 0.06 | 38 | stage_js | 0 | 6514 |
| after_gate_on/fast | after_gate_on_fast.json | 1685 | 1659 | 227 | 2.79 | 1.22 | 0.15 | 125 | honou_pre1+youma_stage1+stage_js | 0 | 4718 |
| after_gate_on/fast | after_gate_on_fast.json | 1731 | 1705 | 241 | 2.31 | 1.22 | 0.15 | 125 | honou_pre1+youma_stage1+stage_js | 0 | 4753 |
| after_gate_on/fast | after_gate_on_fast.json | 1700 | 1675 | 196 | 2.31 | 1.22 | 0.15 | 125 | honou_pre1+youma_stage1+stage_js | 0 | 4736 |
| after_gate_on/700 | after_gate_on_700.json | 5674 | 5647 | 2995 | 2.26 | 1.14 | 0.15 | 77 | honou_pre1+youma_stage1+stage_js | 0 | 8693 |
| after_gate_on/700 | after_gate_on_700.json | 3947 | 3923 | 1111 | 1.40 | 0.28 | 0.15 | 77 | honou_pre1+youma_stage1+stage_js | 0 | 6969 |
| after_gate_on/700 | after_gate_on_700.json | 5767 | 5740 | 3133 | 2.34 | 1.22 | 0.15 | 77 | honou_pre1+youma_stage1+stage_js | 0 | 8798 |
| after_gate_on/700 | after_gate_on_700_extra.json | 5623 | 5601 | 2953 | 2.26 | 1.14 | 0.15 | 77 | honou_pre1+youma_stage1+stage_js | 0 | 8642 |
| after_gate_on/150 | after_gate_on_150.json | 17282 | 17258 | 10281 | 2.26 | 1.14 | 0.15 | 77 | honou_pre1+youma_stage1+stage_js | 0 | 20304 |
| after_gate_on/150 | after_gate_on_150.json | 17291 | 17266 | 10295 | 2.26 | 1.14 | 0.15 | 77 | honou_pre1+youma_stage1+stage_js | 0 | 20320 |
| after_gate_on/150 | after_gate_on_150.json | 17324 | 17302 | 10305 | 2.26 | 1.14 | 0.15 | 77 | honou_pre1+youma_stage1+stage_js | 0 | 20356 |
| after_gate_off/fast | after_gate_off_fast.json | 1712 | 1686 | 152 | 1.47 | 0.00 | 0.06 | 93 | stage_js | 0 | 4754 |
| after_gate_off/fast | after_gate_off_fast.json | 1698 | 1672 | 133 | 1.47 | 0.00 | 0.06 | 92 | stage_js | 0 | 4713 |
| after_gate_off/fast | after_gate_off_fast.json | 1702 | 1674 | 138 | 1.47 | 0.00 | 0.06 | 92 | stage_js | 0 | 4737 |
| after_gate_off/700 | after_gate_off_700.json | 3406 | 3381 | 131 | 1.02 | 0.00 | 0.06 | 37 | stage_js | 0 | 6441 |
| after_gate_off/700 | after_gate_off_700.json | 3453 | 3426 | 167 | 1.02 | 0.00 | 0.06 | 48 | stage_js | 0 | 6495 |
| after_gate_off/700 | after_gate_off_700.json | 3444 | 3420 | 164 | 1.02 | 0.00 | 0.06 | 37 | stage_js | 0 | 6485 |
| after_gate_off/150 | after_gate_off_150.json | 7845 | 7820 | 160 | 0.92 | 0.00 | 0.06 | 35 | stage_js | 0 | 10871 |
| after_gate_off/150 | after_gate_off_150.json | 7837 | 7810 | 168 | 0.92 | 0.00 | 0.06 | 43 | stage_js | 0 | 10873 |
| after_gate_off/150 | after_gate_off_150.json | 7942 | 7922 | 278 | 0.92 | 0.00 | 0.06 | 35 | stage_js | 0 | 10996 |

## 复现

```bash
# 静态服务（各副本根目录）
python tools/serve_nocache.py 8140   # _gate/base  (HEAD)
python tools/serve_nocache.py 8141   # _gate/after (工作树)

# 门禁开 / 关 × 三种带宽（示例：fast）
node tools/_gate_perf.mjs --base http://127.0.0.1:8141 --runs 3 --throttle fast --out _gate/report/raw/after_gate_on_fast.json
node tools/_gate_perf.mjs --base http://127.0.0.1:8141 --runs 3 --throttle fast --query "?bootgate=off" --out _gate/report/raw/after_gate_off_fast.json
node tools/_gate_perf.mjs --base http://127.0.0.1:8140 --runs 3 --throttle fast --out _gate/report/raw/base_head_fast.json

# 汇总
node _gate/report/gen_report.mjs
```
