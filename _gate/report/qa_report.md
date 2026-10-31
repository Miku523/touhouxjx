# HKS 启动幕门禁 QA 报告（after 定稿 vs base 旧版）

- 时间：2026-10-31 20:08–20:10（Asia/Shanghai），本地 headless Edge（CDP 9424）
- 被测 after：`_gate/qa_after`（工作树定稿快照，`src/main.js` 199622B、`src/engine/lazy_preload.js` 6617B），服务 `http://127.0.0.1:8145`
- 对照 base：`_gate/qa_base`（`git archive HEAD`，`src/main.js` 189789B，无 `__hksBootGate`），服务 `http://127.0.0.1:8144`
- 失败注入：`tools/_gate_failserver.py`（no-store、线程化、按路径子串 404）+ `_gate/qa_*` 副本，端口 8143 由套件按场景 spawn/kill
- 套件：`tools/_boot_gate_qa.mjs`（`--base/--scenario/--label/--fail-root --md`；冷启动 = about:blank → `Storage.clearDataForOrigin` → cache 禁用 → 网络条件 → 导航；揭幕时刻用 `__boot.done` setter 精确捕获，同时记录该时刻的 `__hksBootGate` 与 ResourceTiming 快照）

## 结论（先行）

| 版本 | 结果 | 说明 |
|---|---|---|
| **after（门禁定稿）** | **119/119 PASS，A–F 全绿** | 新契约全部满足 |
| base（旧版，门禁前） | 69/86 PASS | 门禁专属断言全灭（探针缺失、揭幕时曲目模块未就绪、失败路径无 warn），证明本套件有区分度；其余回归断言通过 |

复现命令：

```bash
# after（正常副本 8145 + 失败注入 8143）
node tools/_boot_gate_qa.mjs --base http://127.0.0.1:8145 \
  --fail-base http://127.0.0.1:8143 --fail-root _gate/qa_after \
  --label after --scenario all --md
# base（旧版）
node tools/_boot_gate_qa.mjs --base http://127.0.0.1:8144 \
  --fail-base http://127.0.0.1:8143 --fail-root _gate/qa_base \
  --label base --scenario all --md
```

## 逐场景结果（after，全部 PASS）

| 场景 | 断言数 | 关键实测 |
|---|---|---|
| A 正常快网 | 20/20 | 揭幕 1922ms；揭幕时 `__hksBootGate={art:true,kit:true,music:true,failed:[],done:true}`；五件资源在揭幕前全部完成：stage.js end=128.9ms、bullets.js 128.3ms、story.js 128.5ms、honou_pre1.js 130.6ms、youma_stage1.js 130.8ms（revealT=1749.5ms）；pct 8→100 单调；揭幕后 Enter 182ms 进难度页 |
| B 节流 700KB/s | 22/22 | 揭幕被拉长到 5833ms（门禁确实占满加载窗口）；pct 出现 36 个不同值、timeline 记录 18 档目标（t10/t21/t31/t42/…/t86/t92/t94），逐格推进；最终 pct=100 |
| E 进关冒烟 | 13/13 | 揭幕 1970ms；3 次确认进关服，开场对白 18 行自动推进，舞台 8024ms 建成；全程 `#kitLoad` 可见采样 0 次（门禁已预载，没有全屏遮罩）；`audio.soundingSong="pre1"` |
| F `?bootgate=off` 回归 | 15/15 | 只跑标题图：`{art:true,kit:false,music:false,failed:[],done:true}`；揭幕后仍发起 stage.js 预取（ResourceTiming 有 `src/game/stage.js`）；无 console.error |
| C kit 失败（404 `src/game/stage.js`） | 24/24 | 揭幕 1910ms（远小于 95s 上限）；`{art:true,kit:false,music:true,failed:["kit"],done:true}`；warn：`[boot] 进关模块预载失败，先揭幕；进关时会再等一次 TypeError: Failed to fetch dynamically imported module…`；进关时 `ensureGameKit()` 再试失败后回到难度页（page=difficulty），不崩；`#kitLoad` 被 `kitLoading(false)` 隐藏（computed display=none），文案保留但不可见 |
| D 曲目失败（404 `youma_stage1.js`） | 25/25 | 揭幕 1883ms，不被音乐缺失阻断；`{art:true,kit:true,music:false,failed:["music"],done:true}`；warn：`[boot] 第 1 面曲目模块未就绪…`；进关时 `_ensureStageMusic` 兜底（≤4s 等待）后舞台仍建（7532ms，含 18 行开场对白），无卡死 |

## 基线对照（base，旧版）

base 允许跳过门禁专属断言（旧版没有 `__hksBootGate`），作为「改造前行为」参考：

| 场景 | base 通过 | 失败项（预期中的旧版差异） |
|---|---|---|
| A | 11/14 | `__hksBootGate` 缺失；揭幕时 honou_pre1/youma_stage1 尚未请求（门禁前不预载第 1 面音乐） |
| B | 13/16 | 同上两项；其余（节流拉长、最终揭幕、pct=100）通过 |
| E | 11/13 | 探针缺失；`audio.soundingSong=null`（旧版揭幕不预载曲目，进关后才补） |
| F | 8/10 | 探针缺失；`kit-off` 断言无对象可判 |
| C | 12/16 | 探针缺失；honou/youma 缺失；**warn 为空**（旧版失败路径没有门禁 warn） |
| D | 14/17 | 探针缺失；honou 缺失；warn 为空 |

base 的 C/D/E 在旧行为下也能揭幕/进关，说明「失败容忍」不是靠放弃，而是 after 补齐了探针/告警/预载。

## 备注与已知问题（非门禁缺陷）

1. **`__boot.target` 是构造时快照，恒为 8**：`bootScreen.js` 只把 `pct` 同步回 `window.__boot`，`setTarget` 只改实例内部 `this.target`。所以 B 的「逐格推进」改用 `pct` 不同值数（36）+ `timeline` 里的目标档位（18 档：t10…t94）判定，未据此判门禁失败。若希望该探针更直观，可在 `_paint` 里补一行 `this._qa.target = this.target`（纯探针同步，不影响行为）。
2. **headless 偶发文档被判 hidden，rAF 降频/停走**：E 场景在「先跑 A/B 再跑 E」的连续会话里偶发 `document.visibilityState="hidden"`，主循环帧数停滞，对白推进变慢（曾出现 20s 只推进 12 行）。这是 headless 环境/harness 时序问题，不是门禁逻辑问题；套件已加容错（帧停滞检测 → `Page.bringToFront` + `Page.setWebLifecycleState("active")` 恢复 + 点击兜底，click 走 `dialogue._onClick` 不依赖 rAF），复测 E 稳定通过（本轮 8024ms 建成舞台）。证据：`qa_after_E.json` 里的 `frames/vis/loopRunning`，以及调试记录（`[entry] rAF 停滞…`）。
3. `?bootgate=off` 时 `kit/music` 保持 false 属预期（只跑标题图），门禁 `failed` 为空、不告警。

## 证据文件

- `_gate/report/qa_after_summary.json` + `qa_after_{A,B,E,F,C,D}.json`（每场景完整断言、`gate/gateHistory/resourcesAtReveal/consoleEntry/entry` 现场）
- `_gate/report/qa_base_summary.json` + `qa_base_{A,B,E,F,C,D}.json`（旧版对照）
- `_gate/report/after_run_final.log`、`base_run_final.log`（控制台全量）
- `_gate/report/qa_after.md`、`qa_base.md`（由同一次运行的 summary JSON 生成的简版 markdown）
- 套件与失败注入器：`tools/_boot_gate_qa.mjs`、`tools/_gate_failserver.py`

## 端口/进程

测试结束后已释放：8143（fail-server，按场景临时 spawn）、8144（qa_base）、8145（qa_after）、9424（headless Edge）。8138 的 dev server 未触碰。
