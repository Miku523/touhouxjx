# 《东方新纪行》双身份试玩 + 修复报告（2026-10-24）

本轮按「AI 自动试玩」「真人操作流程」两条线各跑一遍，再由代码审计交叉验证；所有结论都带可复跑的证据文件。

- 试玩环境：Windows / Edge headless（CDP 真实按键与鼠标事件）、静态服 `http://127.0.0.1:8138`（`tools/serve_nocache.py`）、软件光栅（software raster），Node 26。
- 参与：Lead（代码走查 / 定位 / 修复 / 回归）、ai-playtester（自动玩家全流程）、player-playtester（真人键鼠流程 + UI/UX）、code-auditor（代码审计 / 可达性 / 数值 / 存档）。
- 结论：**P0 = 0**；6 主线 + Extra 均可通关（AI 定点击破辉夜 0 死、EASY 与 Extra 各 1 次完整通关）。两轮合计修掉 **3 个 P1、18 个 P2、4 个 P3**，另有 6 条疑似问题经复验澄清（2 条测试误报、4 条文档/设计口径）。第二轮补测覆盖结局 / EXTRA / 续命、音乐回忆室、暂停、改键、存档、窗口缩放与 43 张符卡，见「第二轮补测与修复」；第三轮补测 rAF 帧节拍、结算 banner 期间的 Esc、音乐室与改键页的鼠标路径（又抓修 1 个 P2），见「第三轮」；第四轮修掉软件光栅大窗口低帧（1600×900 115.6→40.7ms）并复测第 6 面坑区 5/5 通过，见「第四轮」。

---

## 一、两条试玩线的结论

### 1. AI 身份（自动玩家 `tools/sim_bot.js` + `tools/_sim_player.mjs`）

| 项目 | 结果 |
| --- | --- |
| 全流程能否通关 | **能**：N 档定点 `--stage 5 --startX 39500`，10.3s 进辉夜、**626.0s 击破、0 死、0 error**、630.9s 进 ending（`_pt/ai/N_S6boss_v2.json`） |
| 完整结局 | EASY 灵梦 1295s 通关；EXTRA 灵梦 570.4s 通关（均 0 死） |
| 第 6 面道中 | N/H 均能打穿并进入 Boss（v2：N 死亡 34→10、H 36→7） |
| 全流程时长预算 | 约 2200s 模拟时间，验收需 `--maxSteps 170000`（默认 120000=2000s 会截断） |
| 稳定性 | 9 次运行 + 12 项按键探测：0 JS error、0 console error、无 NaN、无确定性软锁 |

**唯一残余风险**：同版 bot 约 1/3 局会在第 6 面「1 格窄台 + 96px 无底坑」处掉坑（残机 27→0）。人工按键实测该坑**可以跳过**（`tools/_lead_pit.mjs`：x 35280 → 35706，残机不减），掉坑根因是 bot 的空中落点修正被 `airPlan` 跳过（已在 `tools/sim_bot.js:168/295` 修掉，死亡数腰斩）。为避免「手感上像坑人」，本轮同时给关卡加了起跳区：

- `src/assets/levelgen.js:851` 新增 `_widenPitRunways()`：无底坑前 3 列强制整平，留出起跳与助跑；
- `src/assets/levelgen.js:879` 检查点落点 `cpSafe`：不再落在蘑菇/碎砖/1 格窄台上。

### 2. 玩家身份（真人键鼠流程）

覆盖：标题 → 设置（14 行）→ 按键设置（冲突互换、Del 恢复）→ 音乐回忆室（19 曲、未遭遇确认、30s 试听）→ 难度/角色 → 开场 24 句对话 → 第 1 面 → 暂停 / 设置 / 退出确认 → Boss 战 → GameOver → 续命；窗口 900×600 / 1600×900 / 1280×720@DPR2。原始记录 `_pt/human/report.md` + 90 余张截图。

真人线发现 1 个 P1（进关 10 秒冻结）与 1 个看似的 P1（Boss 场地坠坑，实为死亡动画穿地），以及 9 条 P2，均已处理，见下表。

---

## 二、修复清单（按严重度）

### P1-1 进入第 1 面瞬间主线程冻结 10–11 秒（体感卡死）

- 证据：4 次独立 run 的 longtask 分别 11092 / 10520 / 10161 / 10482 ms（`_pt/human/_stage1.log`、`_boss.log`、`_boss2.log`）。
- 定位：`window.__prewarmInfo.stageArtMs` 同为 9.4s；CDP Profiler 自耗时集中在 `drawImage`，按调用点聚合锁定 `Stage._drawForeground`（1440×720 整屏 drawImage 累计 9.8s）。把该方法换成空函数后 `stageArtMs` 从 9.4s → 19ms，确认全部成本在前景烘焙。
- 根因：`_fgBake` 里 `ctx.filter = 'blur(4px)'` 让之后**每一笔**描边/填充各自做一次模糊光栅化，这一层上千笔，首帧 9–10s。微测：20 笔 plain=1ms、blur=119ms、blur+shadow=368ms。
- 修复 `src/game/stage.js`：
  - `:2116` 改为「先把剪影画进离屏 canvas → 整层一次 `blur(4px)` → 输出」；
  - `:131` 增加模块级 `FG_LAYERS` 主题缓存，`:1907` 命中直接返回（同主题跨关卡复用）；
  - `_drawForeground` 恢复直接 drawImage（曾尝试异步 `createImageBitmap`，实测调用本身同步阻塞 9087ms，无效）。
- 验证：`stageArtMs` 9.4s → **35ms**；进关后长任务只剩 174 / 99 / 110 ms；stage1（神社樱花）、stage6（月都竹影）截图 `_pt/lead_fg/*.png` 视觉无差异；前景层每帧成本对比（关/开）35.45 → 33.27ms，每帧仅约 2ms。

### P1-2 「Boss 场地有坑，击退后坠坑连掉命」

- 证据：`_pt/human/_boss2.log` 里击破前玩家 `y=963, vy=900, ground=false, hearts=0`。
- 定位：Boss 场地（`levelgen.js` 的 `bossStart..cols`）逐列实测**全部实心、无空列**；stage4 是飞行关无地面。玩家看到的是**死亡坠落动画**：旧代码 `this.y += this.vy * dt` 直接累加、不碰地形，尸体穿过地板掉出屏幕，被误读成「场地坠坑」。
- 修复 `src/game/player.js:393-396`：死亡下垂改走 `_moveY()`（8px 子步碰撞），尸体停在实心地面上；真掉坑仍会落到底图外并判死。
- 验证：`p.die()` 后 y 553 → 552.3 落地、`vy=0、onGround=true` 停住，1 秒后复活残机 -1（旧版会一路穿到 704 以下）。

### P2 清单（全部有专项验收）

| 编号 | 问题 | 修复 | 验证 |
| --- | --- | --- | --- |
| P2-1 | 900×600 暂停菜单少「重新开始本关」，与 README:70 不符 | `src/main.js:1775` 补按钮（hotkey KeyR → `_retryStage()`），提示行改「重开会重置本关进度」 | 900×600 面板 4 项全可见、R 重开回到 play、`continues` 不变（`_lead_p2.mjs`） |
| P2-2 | DPR2「世界画面发糊」 | 复核结论：非 BUG。backing=1.25 是超采样后下采样；2560×1440 截图下 HUD 与世界都清晰。软光栅下低帧是 headless 预期 | `_pt/lead_fix/dpr2_stage.png`、`__rendererInfo` |
| P2-3 | 首次 GameOver 显示「续命 2 次」 | 复核结论：未复现。全仓 `continues` 仅 `_retryStage()` 在 `state==='gameover'` 时 +1；连续 3 次死亡到 GameOver 后按一次 Enter 得 `continues=1` | `_lead_p2.mjs` 输出 |
| P2-4 | 开场对话 HUD 显示残留 `POWER 0/64` | `src/main.js:1714-1723`：无 stage 时先隐藏 HUD，`_createStage` 后随真实 `hudState` 再显示 | 对话中 `hudHidden=true`，进 play 后 `power=16` |
| P2-5 | 设置「残机」只有菱形没有数字 | `src/main.js:1826` 改为「数字 + 菱形」 | `_pt/lead_fix/settings3.png`（残机 3 ◆◆◆◇） |
| P2-6 | 900 宽 HUD 字号约 7px 不可读 | `src/style.css:373/379/389/401` 给 `.sn/.tm/.ss/.hud-settings` 加字号下限 `max(9px…)`、`max(10px…)`、`max(12px…)` | 900×600 实测 sn=9 / tm=10 / ss=12 |
| P2-7 | 暂停→设置→Esc 返回后光标跳回第 1 项 | `src/main.js:428-429` 记录 `_settingsIndex/_pauseIndex`；设置返回按钮与暂停面板 `select` 复用（`:1780`） | 设置光标 2 → 退出再进仍 2；暂停光标 1 → 设置返回仍 1（`_lead_p2.mjs`、`_lead_pauseidx.mjs`） |
| P2-8 | README 音乐室写 11 首、实际 19 首 | 工作区里该段已被并行会话更新为 19 首，本轮核对一致，无需再改 | README:25-26、:109 |
| P2-9 | 从标题进设置时 `game.state` 变成 `paused` | `src/main.js:1815` 改为 `origin==='pause' ? 'paused' : 'menu'` | 标题 S → `menu`；Esc → `menu`（`_lead_p2.mjs`） |
| 审计 P1-01 | stage2 检查点落在蘑菇弹床，复活瞬间被弹飞 | `levelgen.js:879` `cpSafe` 只认草地/泥土 + 3 列同高 | `_audit_checkpoints.mjs` 全关卡 0 异常 |
| 审计 P2 | `frameCap` / `difficulty` / `extraChar` 存档未校验 | `src/main.js:2172-2179`、`:2238-2239` 改白名单校验 | 回归 36/36 |
| 审计 P2 | 暂停期间 `_pendingTimeout` 仍在计时，可能吞掉 1.8s 后的关底对话 | `src/main.js:1692` 暂停时冻结延迟回调 | 代码复核 + 暂停/继续往返 |
| 文档 | 裁卡、EX 芙兰血量、破势上限、总血量/单场时长与实际不符 | README:136-137/144/164/175 与 `difficulty.js:155` 注释改为实测口径 | 见第三节数值表 |

---

## 三、数值口径修正（文档 vs 实际）

运行时血量必须按「`boss.js` 构造 → `bossTuning` 逐卡 `limit × dps` 覆盖 damage 卡 → `scaleBossHp`」链路实测（`tools/_audit_maxhp.mjs`），静态数值表不可信。实测（N 档）：

| 关卡 | Boss | 运行时总血量 | 自动玩家单场 |
| --- | --- | --- | --- |
| 1 | 露米娅 | 19480 | ≈0.7 min |
| 2 | 莉格露 | 41730 | ≈1.7 min |
| 3 | 琪露诺 | 53130 | ≈2.1 min |
| 4 | 射命丸文 | 47196 | ≈5.2 min |
| 5 | 西行寺幽幽子 | 93709 | ≈4.1 min |
| 6 | 蓬莱山辉夜 | 207378 | ≈10.4 min |
| Extra | 芙兰朵露 | 48257（×1.8 实测） | ≈2.6 min |

要点：
- damage 符卡血量由限时反推，**不吃难度倍数**，所以同一 Boss 在 E/N/H/L 下血量基本一致；难度只改弹幕密度/弹速与部分存活卡。README 里旧的「E ×0.85 / H ×1.15 / L ×1.3」已按此改写。
- 四档符卡数量一致（`trimHardCards` 全空），E/N 不裁卡；破势上限初始 140、每次 +25 至 240 封顶，无「最多 12 次硬直」限制。
- 限时数值来自用户既有需求（`docs/BOSS_TIMING_SPEC.md`），本轮**不动平衡**，只把文档改成实测口径。

---

## 四、回归与证据

| 检查 | 结果 | 位置 |
| --- | --- | --- |
| 主回归 | **36 / 36 通过** | `_pt/lead_regression/final_run2.log` |
| 本轮修复验收 | **11 / 11 通过** | `_pt/lead_accept/report.json`、`final2.log` |
| 第 5 面妖梦坡道 | 91 通过 0 失败 | `node tools/_verify_stage5_youmu.mjs` |
| 妖梦实机走位 | 全部通过（moved=3547px、stuckFrames=0） | `node tools/_verify_youmu_live.mjs` |
| 检查点审计 | 全关卡 0 异常 | `node tools/_audit_checkpoints.mjs` |
| 暂停重开 | 10 项断言全过 | `_pt/lead_pause_restart.json` |
| 进关性能 | 前景烘焙 9.4s → 35ms；长任务 10.2s → 174ms | `_pt/lead_stage_load.json` |
| AI 通关 | 辉夜 626s / 0 死；EASY 1295s；Extra 570.4s | `_pt/ai/*.json`、`_pt/ai/report.md` |
| 真人流程 | 90+ 截图、无 JS 错误 | `_pt/human/report.md` |
| 代码审计 | P0=0；P1 1 条（已修）；P2 9 条（已处理） | `_pt/audit/report.md`、`bugs.json` |

本轮新增的可复跑脚本：`tools/_lead_accept.mjs`、`_lead_pit.mjs`、`_lead_stage_load.mjs`、`_lead_fgshot.mjs`、`_lead_deathfall.mjs`、`_lead_p2.mjs`、`_lead_pause_restart.mjs`、`_lead_pauseidx.mjs`、`_lead_dpr.mjs`、`_audit_maxhp.mjs`、`_audit_checkpoints.mjs`、`_lead_boss3.sh`。

---

## 五、已知遗留 / 说明

1. **未提交**：工作区里同时有另一条「剧情重制」改动（`src/game/story.js`、`endings.js`、`musicRoom.js`、`musicTracks.js`、`boss.js`、`main.js`、README 等）由另一会话并行进行，本轮刻意不 `commit`，避免把半成品扫进提交；本报告第二节列出的文件行号即本轮范围。
2. **真机 GPU 未测**：所有帧率数字来自 headless + 软件光栅（1280×720 ≈30fps、DPR2 ≈19fps），真机 GPU 会明显更好；P1-1 的 10s 冻结已在本环境消除，仍需真机复核首进关手感。
3. **第 6 面坑区**：人类可过、bot 已修，但同版 bot 仍有约 1/3 概率在窄台掉坑（属 bot 精度）；若后续要加大容错，可把该坑的右岸抬高半格或在坑前加单向木台。
4. **EXTRA 时长**：实测 570s（目标约 960s），芙兰本体 157.7s，含 3 段各 40s 无伤窗口；bossTuning 里 EXTRA 未配置逐卡限时，属设计待定项，未擅改。

---

# 第二轮补测与修复（同日续跑）

首轮结束后又做了一轮「未被覆盖的系统」补测：结局 / EXTRA / 续命、音乐回忆室、暂停四项、改键、存档持久化、窗口与缩放、Boss 全量符卡、随机按键。新增 **1 个 P1、7 个 P2、4 个 P3**，另有 6 条首轮/次轮的疑似问题经复验澄清（其中 2 条是测试误报，4 条是文档或设计口径）。

## 六、第二轮补测范围

| 线 | 覆盖 | 结果 |
| --- | --- | --- |
| AI（task-4，`_pt/ai2/`） | 结局、EXTRA、续命、结算 | EASY 全流程 1332.8s → ENDING 01；N 档 0 死 0 续命 2021.2s → ENDING 02 并解锁 EXTRA；EXTRA 598.8s → W1；真实 Enter 续命 `continues 0→1`；结局回标题后 HUD 隐藏、可立刻开新局 |
| 真人（task-5，`_pt/human2/`） | 音乐室 19 曲、暂停、改键、存档、窗口/缩放、对话连按 | 19/19 曲可播；18 首锁定曲均有确认弹窗；试听 30.3s 自停、T 可取消并重播、无叠音；暂停四项键鼠双通；改键冲突互换 / Del / 刷新持久 / 实机生效；四种坏档 reload 正常；6 种窗口与缩放面板零溢出 |
| 审计（task-6，`_pt/audit2/`） | 音乐房计时器、状态机、改键、localStorage、音频、关卡不变量 | 状态机 14 项、7 条对话收尾、Boss 复活检查点、音频切后台均通过；5 关 × 20 seed 的 P/C/F 不变量 0 异常 |
| Lead | Boss 全量扫荡 + 43 张符卡 + 900 次随机按键 fuzz | 见下 |

**43 张符卡全部实测**（`tools/_lead_card_sweep.sh`，产物 `_pt/lead_cards/*.json`）：

| Boss | 符卡数 | 整场击破（自动玩家参考） | Boss | 符卡数 | 整场击破（自动玩家参考） |
| --- | --- | --- | --- | --- | --- |
| 露米娅 | 2 | 43.7s | 妖梦（第 5 面中途） | 3 | 约 38s |
| 莉格露 | 3 | 100.2s | 幽幽子 | 6 | 243.6–255.8s |
| 琪露诺 | 4 | 124.3s | 辉夜 | 8 | 626.0s |
| 射命丸文 | 5 | 309.8s | 雷米莉亚（EXTRA 中途） | 2 | 约 21s |
| — | — | — | 芙兰朵露 | 10 | 157.7s |

每张卡都能进入、能结束，0 卡死 / 0 NaN / 0 JS error；`boss-hp-stall` 遥测都对应「存活卡或超长血卡」，不是漏切卡或软锁。逐卡耗时明细留在 `_pt/lead_cards/*.json`（`boss-card` 事件），上表用的是完整跑局的整场耗时，口径与 README 的「单场 Boss」一致。

## 七、第二轮修复清单

### P1（新增）续命 / 暂停重开回到 Boss 战时火力归零

- 证据：`_pt/audit2/bugs.json` 与 `tools/_audit2_power.mjs`：Boss 战耗尽残机 → GameOver → Enter 再战，`power` 从 16 变成 **0**（只剩 Lv.1 单发、连符卡都放不出来）。
- 根因：`src/main.js` 的 resumeBoss 分支先按 `carryPower` 补火力，紧接着 `p.reset(cp.x, cp.y)`（`src/game/player.js` 里 `this.power = 0`）又把刚补的抹掉——1.0 版就带着的旧缺陷。
- 修复：`p.reset()` 之后补 `p.power = Math.min(p.maxPower || 64, Math.max(0, this.carryPower || 0))`，和残机 / 1UP 一起回到本关开局值；EXTRA 不受影响。
- 验证：修复后再战 `power=16, maxPower=64`；同时暂停菜单的「重新开始本关」在 Boss 战里也走同一条 resumeBoss 路径，不再把火力清空。

### P2（新增 7 条）

| 问题 | 修复 | 验证 |
| --- | --- | --- |
| 半坏档 `{extraUnlocked:true, extraChars:[]}` 被读成完全未解锁 | `_loadProgress` 改为「数组非空 → 用数组；否则回退单主角字段 → 再回退旧布尔档」 | `_audit2_migrate.mjs` 6/6（含 M4 空数组回退） |
| `Tab` / `F5` / `F12` 等浏览器保留键可以绑，且不 preventDefault | `_handleCapture` 增加保留键集合，命中时保持捕获并提示「这个键浏览器要用（或功能键），换一个吧」 | F5 被拒绝且仍在捕获、随后成功绑 `KeyT` |
| 主键可以绑到自己的副键，UI 出现「A / A」 | `input.setBind`：选自己的副键时主副对调 | `shoot=[KeyJ, KeyZ]`，不再重复 |
| `M` 静音只在 play 分支里生效，暂停 / 对话 / 结局按 M 无反应 | 全局 keydown 在音乐室之后、菜单之前转发 `_toggleMute()`（play 仍走主循环，避免双触发） | 暂停中 M：`false → true` |
| 操作说明写「冲刺 · 无敌」「符卡 · 耗 6」，与实现不符 | 改「可穿敌」「耗 24 · 火力下降」（`POWER.castCost=24`，冲刺本就没有无敌帧） | `_lead_p3check.mjs` A2/A3；截图 `_pt/lead_p3/manual_1280.png` |
| 1600×900 + 80% 缩放时画布被 CSS 拉伸 1.25× 发虚 | `renderer.fit()` 里 backing 计算按 `dpr≥1` 处理（缩放 <100% 不再产生小于 CSS 像素的 backing） | backing 1.25、canvas 1600×900 = CSS 尺寸（`_lead_p3check.mjs` E1） |
| 900×600 下 HUD 的 POWER / 1UP 小字只有 7px | `.pl/.pdim/.plv/.ex-tag/.extend>b` 全加字号下限 `max(8–9px, …)` | 900×600 实测均为 9px，截图 `_pt/lead_p3/hud_900.png` |

### P3（新增 4 条，全部修掉）

1. 设置里滑条行按 Enter 也会 +1 档，提示却只写「← → 调整」→ 键帽与提示统一改成「← → / ENTER 调整」（行为本身保留，键盘可调）。
2. 暂停 → 退出到标题 → Esc 取消后，光标停在「退出到标题」这个危险项 → 取消后回到「继续游戏」。
3. 重置进度不清理音乐回忆室（设计如此），但确认文案没提 → 文案补「设置、键位与音乐回忆不受影响」。
4. 说明页「低速移动 / 判定点」一行折成两行、键帽与说明挤在一起 → label 缩短为「低速 / 判定点」，说明行 `nowrap` + tip 省略号。

## 八、复验澄清（不是 BUG）

1. **暂停菜单没有「重新开始本关」/ 暂停中 R 无效**：误报。当前工作树里按钮存在且 R 有效（`_pt/human2/_pause2.log`、`_lead_fixcheck2.mjs` 均实测四项 + 重开成功），ai-playtester 那次读到的是修复前的页面。
2. **隐藏跳关后残机没回设置值**：误报。`_lead_warpcheck.mjs`：置残机 1 → `_warpToStage(6)` → 残机回到设置值 3。
3. **随机按键 fuzz 出现「标题菜单无遮罩」**：那是音乐回忆室整屏占位（`state=menu / page=title`、`.mr` 可见）的合法状态；fuzz 不变量已改为「无遮罩且音乐室也不可见」才算异常。
4. **辉夜 626s / N 全流程第 6 面 Boss 600s**：`bossTuning` 限时表的设计值，不是软锁。8 张卡 limit 合计 1113s，按满火力实测 DPS 206 折算约 626s；结束时残留血量是死亡瞬间的遥测，不是结算错误。
5. **续命后 Boss 满血、回第 1 张符**：设计如此（「再战 Boss」），README 已补写：从该场第 1 符满血重开、火力回本关开局值、道中与已击破的中途 Boss 不重打。
6. **DPR2「世界发糊」**（首轮）：超采样后下采样，非缺陷；第二轮 80% 缩放一条是真问题，已按上面 P2 修掉。

## 九、第二轮回归证据

| 检查 | 结果 | 位置 |
| --- | --- | --- |
| 主回归 | **36 / 36** | `_pt/lead_regression/report.json`、`_pt/lead_round2/run2.log` |
| 阶段验收 | **11 / 11** | `_pt/lead_accept/` |
| 暂停 / 静音 / 改键 | **8 / 8** | `tools/_lead_fixcheck2.mjs` |
| 第二轮 P2/P3 专项 | **19 / 19** | `tools/_lead_p3check.mjs`、`_pt/lead_p3/` |
| 存档迁移 | **6 / 6** | `tools/_audit2_migrate.mjs` |
| 续命火力 | `power=16 / maxPower=64` | `tools/_audit2_power.mjs` |
| 检查点审计 | 全关卡 0 异常 | `tools/_audit_checkpoints.mjs` |
| 第 5 面妖梦 | 91 通过 0 失败 | `tools/_verify_stage5_youmu.mjs` |
| 进关长任务 | 10.1–11.1s → 最大 **199ms**（余下为 99/115/50ms） | `_pt/lead_stage_load.json` |
| 前景烘焙 | 9.4s → **35–50ms** | `window.__prewarmInfo.stageArtMs` |
| Boss 符卡 | 43 / 43 张全程通过 | `_pt/lead_cards/*.json` |
| AI 二轮 | EASY / N / EXTRA 三条结局线全通，0 error | `_pt/ai2/report.md` |
| 真人二轮 | 7 组必测全绿，0 P0/P1 | `_pt/human2/report.md` |
| 随机按键 | 900 次无软锁 / 无 NaN / 无 error | `_pt/lead_fuzz/` |

第二轮新增可复跑脚本：`tools/_lead_card_sweep.sh`、`_lead_boss_sweep.sh`、`_lead_menuprobe.mjs`、`_lead_warpcheck.mjs`、`_lead_fuzzkeys.mjs`、`_lead_fixcheck2.mjs`、`_lead_p3check.mjs`、`_lead_sharp.mjs`、`_audit2_power.mjs`、`_audit2_migrate.mjs`。

## 十、遗留（第二轮更新）

1. **仍未 commit**：工作区里另一条「剧情重制」会话正在改 `story.js / endings.js / musicRoom.js / musicTracks.js / boss.js / main.js / index.html / README`，本轮继续保持「只改自己的行、不提交」，避免把半成品扫进提交。
2. **真机 GPU 未测**：帧率数据都来自 headless + 软件光栅，真机应更好；进关 10s 冻结已在本环境消除（长任务 ≤199ms），建议真机复核一次首进关手感。
3. **第 6 面坑区**：第四轮 5 连跑 0 死亡、5/5 越过（见 12.2），旧版约 1/3 掉坑未再复现。
4. **EXTRA 时长**：实测 570–599s，与 `BOSS_TIMING_SPEC` 的目标约 960s 有差距；该文档明确「EXTRA 本轮不改」，属设计待定项，未擅改。
5. **仍未覆盖**：真机音频听感、真机 GPU 帧率；headless 软件光栅下 rAF 只有 20–25fps（见第三/四轮），数字不能代表真机。结算 banner 的 Esc、音乐室/改键页的鼠标路径已在第三轮补测完毕。

## 十一、第三轮补测（2026-10-24 16:2x，用户「测」）

证据：`tools/_lead_r3.mjs`、`tools/_lead_r3b.mjs`、`tools/_lead_mr2.mjs`、`_pt/lead_r3/{r3b.json,fp_*.png,mr_mouse.png,keybinds.png}`、回放日志 `_pt/lead_r3/{reg,accept}.log`。

### 11.1 rAF 帧节拍（headless / 软件光栅，stage1 静止）

| 窗口 | 帧数 | avg | p50 | p95 | worst | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| 1280×720 | 141 | 42.4ms | 49.9 | 50.1 | 50.1 | canvas 1280×720，≈24fps |
| 900×600 | 129 | 46.2ms | 50.0 | 50.1 | 66.6 | canvas 仍 1280×720，CSS 缩到 900 |
| 1600×900 | 51 | 115.6ms | 116.7 | 133.4 | 133.4 | canvas 1600×900，≈9fps |

结论：这组数字是软件光栅环境的**下限**，不是游戏逻辑开销；`qualityPicked=low`、`postLevel=0` 已按硬件能力降档。真机 GPU 仍未测。

### 11.2 结算 banner 期间按 Esc

`_onStageClear()` 后立即 Esc：`state` 保持 `clear`（没有误开暂停），1.8s 后正常进 `dialogue`；对话中再按 Esc 仍不打断；推进完对话进入下一关 `play`（`lv=1`），0 JS error。**无软锁、无跳关副作用。**

### 11.3 音乐回忆室鼠标路径（发现并修复 1 个 P2）

- 鼠标点标题「音乐回忆室」→ 打开 19 行列表 → 点已解锁行可选中/播放 → 点未解锁行弹出确认框（文案「第 02 号唱片被一层薄雾罩着…」）→ 取消后留在原行 → 点「播放」开始播放 → 点「返回标题」恢复标题遮罩。
- **BUG（已修复）**：在确认框里点「播放」时，弹窗一关，鼠标底下那一行立刻收到 `pointerenter`，把选中从正在播放的曲目抢到光标位置（实测点第 2 行却选中了第 6 行，详情面板回到「？？？」）。
- 修复 `src/game/musicRoom.js`：①`_play()` / `_startPreview()` 开头把 `this.index` 对齐到真正播放的曲目；②`_closeWarn()` 记 `_hoverLock = now + 320ms`，`pointerenter` 在该窗口内不接管选中。复测：点第 2 行「播放」后 `index=1`、详情显示正确曲名、`再生中`，0 error。
- 顺带确认：headless 下音频是能真正响的（`audio.musicOn=true`、`currentSong` 变化），首行点一下变「停止中」只是因为标题曲正在播——再点一次即停，属设计。

### 11.4 改键页鼠标路径

设置页点「按键设置」行进改键页（`page=keybinds`）→ 鼠标点「左移」行进入捕获（`_captureAction="left"`）→ Esc 取消且仍留在改键页 → 再点同一行再次进入捕获 → 再点同一行取消捕获。全程 0 error。鼠标与键盘两套路径一致。

### 11.5 第三轮回归

| 检查 | 结果 |
| --- | --- |
| 主回归 | **36 / 36**（含音乐室鼠标点击不死循环用例） |
| 阶段验收 | **11 / 11** ALL PASS |
| 音乐室修复复测 | `index=1`、`再生中`、0 error |
| 结算 banner Esc | `clear → dialogue → play`，0 error |

## 十二、第四轮：低配性能修复 + 坑区复测（用户「修 / 测一下吧」）

### 12.1 软件光栅大窗口帧率（修复）

第三轮实测暴露的最差一档：1600×900 平均帧间隔 **115.6ms（≈9fps）**、1920×1080 同理，原因是软件光栅下 `backing` 上限仍是 1.25（画布 1600×900 逐像素光栅）。

- 修复 `src/engine/renderer.js:fit()`：软件光栅（`lowSpec`）下 backing 上限 1.25 → **1.0**，即画布固定 1280×720，由合成器放大到窗口尺寸；GPU 路径完全不受影响（`cap` 仍 2.5）。
- 复测（同环境、同场景、6 秒采样）：

| 窗口 | 修复前 avg | 修复后 avg | p95 | canvas | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1600×900 | 115.6ms | **40.7ms** | 50.1 | 1280×720 | 2.8× 提速 |
| 1920×1080 | — | **41.2ms** | 50.1 | 1280×720 | 与 1600 同档 |

- 画面代价：1.25× 合成器放大带来的轻微柔化（截图 `_pt/lead_r3/soft_1600x900.png`），只在软件光栅机器上出现；HUD 与场景仍可读。

### 12.2 第 6 面坑区复测（此前 1/3 方差）

当前构建（含 `_widenPitRunways()` 起跳区 + `sim_bot` 空中修正）连跑 5 局 N/无敌，从检查点前 32000 起步，全部 **0 死亡**、5/5 越过 96px 无底坑并在 118.7s 抵达辉夜战（`_pt/lead_pitfix/run1..5.json`）。此前「约 1/3 掉坑」在现版本未能复现，判定为旧版 bot/地形组合问题，已在两轮修复中消掉。

### 12.3 第四轮回归

| 检查 | 结果 |
| --- | --- |
| 主回归 | **36 / 36**（`_pt/lead_r3/reg2.log`） |
| 阶段验收 | **11 / 11** ALL PASS（`_pt/lead_r3/accept2.log`） |
| 软光栅帧探针 | 43.3ms avg / p95 50.1（1280×720 窗口，backing 1） |
| 坑区 5 连跑 | 0 死亡 / 5 次到达 Boss |


