# HKS 启动幕门禁 QA —— v2 验收报告（状态行 + 揭幕后曲库预热）

- 运行时间：2026-10-31 20:34 / 20:36（两次，见证据文件 `runAt`）
- 被测副本：`_gate/qa_after`（重冻自 v2 工作树：`src/main.js` 202,744B、`src/style.css` 146,219B、`src/engine/lazy_preload.js` 6,617B）
- 服务：`python tools/serve_nocache.py 8145`（qa_after）；C/D 的 404 由套件自 spawn `tools/_gate_failserver.py --port 8143`
- 套件：`tools/_boot_gate_qa.mjs`（v2 新增状态行/曲库预热断言）；浏览器 CDP 9424 headless Edge 1280×720

## 结论

**135/135 全绿。** A/B/E/F 四个门禁场景 **86/86 PASS**，C/D 两个失败容忍场景 **49/49 PASS**。
v1 的 119 条断言在新构建上 **119/119 保持通过**；v2 新增的 16 条断言全部 PASS：
- 状态行 4 条 × A/B/E = 12 条：`.boot-status` 存在、文案「准备完成」、纵向位于 `.boot-sub` 下方且不重叠（DOM 上紧随 `.boot-sub`）；
- 曲库预热 3 条（A/B/E 各 1）：揭幕 10s 后 `/engine/songs/*.js` 去重 ResourceTiming 条目数符合链路档位预期（正常链路 ≥10，受限链路按实现跳过 <10）；
- F（`?bootgate=off`）状态行隐藏 1 条：`text=""`、`opacity=0`、`on=false`。

无 console error、无未捕获异常、无失败场景卡死；E 全程未出现 `#kitLoad` 全屏遮罩。

## PASS/FAIL 表

| 场景 | 结果 | 断言 | 关键实测 |
|---|---|---|---|
| A 正常快网 | PASS | 25/25 | 揭幕 1,987ms；`gate={art,kit,music:true, failed:[], done:true}`；gate 结束 516ms → 揭幕 1,760ms；状态行「准备完成」51×15 @top336，`.boot-sub` 311–326（位于下方）；揭幕 10s 后 song 模块去重 **17** 条（档位 unknown → 期望 ≥10） |
| B 节流 700KB/s | PASS | 27/27 | 揭幕 5,946ms（期望 >1,000ms，门禁占满加载）；gate 结束 5,129ms → 揭幕 5,709ms；状态行同上；预热按实现跳过，去重 **4** 条（档位 constrained：138KB/0.69s≈197KB/s <350KB/s） |
| E 进关冒烟 | PASS | 18/18 | 揭幕 1,899ms；状态行同上；舞台 7,613ms 建成（30 次 Enter）、`soundingSong="pre1"`、`#kitLoad` 可见采样 0；预热去重 **17** 条 |
| F `?bootgate=off` | PASS | 16/16 | 揭幕 1,912ms；`gate={art:true,kit:false,music:false,failed:[],done:true}`；`.boot-status` text=""、on=false、opacity=0（不可见）；揭幕后仍请求 `stage.js` |
| C kit 失败（404 stage.js） | PASS | 24/24 | 揭幕 2,192ms（预算 95,000ms）；`failed=["kit"]`、`kit=false`、`music=true`；进关退回难度页、`#kitLoad` 被 `kitLoading(false)` 隐藏 |
| D music 失败（404 youma_stage1.js） | PASS | 25/25 | 揭幕 1,913ms；`failed=["music"]`、`music=false`；舞台仍建（7,866ms）、无卡死 |

## v1 断言回归

- A/B/E/F 中 v1 的 70 条断言全部通过（进度单调 8→100、揭幕 pct=100、gate 探针、五件资源 responseEnd 早于揭幕、标题可交互、节流逐格、进关链路、bootgate=off 预取等）。
- C/D 为 v2 改动未触及的失败路径，本次一并复跑确认仍全绿（重冻的 main.js 中 `_warmRemainingSongs/_refreshBootStatus` 在失败路径也正常工作）。

## 备注（判定口径）

1. **预热档位窗口**：门禁结束后才延迟加载的 `sakuya_title.avif`（`startTime≈1.1s`、`transferSize=0`、`initiator=img`）不应计入 `linkTier()` 的吞吐窗口，否则会把已缓存为 unknown/fast 的档位误判为 constrained。套件按 `gate.finishedAt` 截断窗口复刻页面判定，A/E 为 unknown（预热生效，17 条），B 为 constrained（跳过，4 条，符合实现）。
2. **B 的跳过属预期**：`_warmRemainingSongs()` 在 `linkTier()==='constrained'` 时 return；700KB/s 节流下标题图实测吞吐 <350KB/s，故只加载门禁内的 2 首（+ index.js/title_full.js 共 4 条）。
3. **F 的隐藏方式**：`.boot-status` 元素仍挂在 DOM（`display:block`），但 `textContent=""` 且 `opacity:0` + 无 `on` class，实测不可见；断言按「文本为空/不可见」通过。
4. 状态行位置断言同时校验：元素存在、有尺寸（51×15）、`rect.top > .boot-sub rect.bottom`（336 > 326，不重叠）、`previousElementSibling === 'boot-sub'`。
5. headless rAF flake 沿用既有帧停滞恢复 + click 兜底，本轮未触发；E 的 30 次 Enter 正常推进。
6. 端口已释放：9424 / 8143 / 8145（8144 此前已释放），未触碰 8138/8139 dev server。

## 证据文件（`_gate/report/`）

- `qa_after_v2_summary.json` + `qa_after_v2_{A,B,E,F}.json`（A/B/E/F，20:34:52）
- `qa_after_v2_cd_summary.json` + `qa_after_v2_{C,D}.json`（C/D，20:35:30）
- `qa_after_v2.md`（套件 `--md` 生成）、`after_v2_run.log`、`after_v2_cd_run.log`
- v1 历史证据保留：`qa_report.md`、`qa_after_summary.json`、`qa_after_{A..F}.json`
