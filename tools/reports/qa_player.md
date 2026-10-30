# 东方新纪行 v1.6.41 玩家模式 QA 报告

- 角色：teammate `qa-player`；工作区 `C:\Users\GuSheng\Downloads\HKS`；HEAD 60908f8（工作区含 Lead 未提交修改，行号以当前工作区为准）。
- 环境：Node v26.12.1；headless Edge（CDP，9451-9460）；无缓存静态服务器 http://127.0.0.1:8138；1280x720，另测 800x600/960x600/1024x640；真实键盘事件（CDP Input.dispatchKeyEvent，游戏只读 e.code）。
- 方法：先跑仓库既有回归脚本，再用自建剧本以「玩家」身份从标题菜单一路玩到通关/EXTRA/结局；所有结论均有 JSON 断言 + 截图 + 控制台采集支撑，测试脚本在 `tools/_x_qa_*.mjs`。

## 结论摘要（给 Lead）

**没有发现 blocker / major 级玩家可见 bug。** 主流程（标题→菜单→1-6 面→Boss→通关→结局→EXTRA 四连战）全部可完成，控制台无 JS 异常，HUD/计时/入力/暂停/续关/重开/改键/设置/分辨率/后台恢复均正常。

确认的 2 个轻微问题都是「内部状态标记」类，玩家不可见（见下）；另有 1 个曾怀疑的 Boss 击破瞬间死亡软锁，实测**不成立**（Boss 击破演出在死亡倒计时期间冻结，先复活或先 gameover，状态一致）。5 项 robust FAIL 全部判定为测试假设错，正确口径见第 5 节。

## 1. 覆盖与结果矩阵

| 流程 | 脚本（端口） | 断言 | 结果 | 关键证据 |
|---|---|---|---|---|
| 标题/帮助/音乐室/设置/改键/难度/选人/密码/暂停/退出 | `_x_qa_menu.mjs`(9456) | 74 | 2 FAIL = 均为脚本假设（难度页无 page 标记、`g.loop.frame` 不存在） | 标题 6 按钮；帮助 14 行；音乐室 19 曲、未知曲目确认、Enter 播放（currentSong pre1）；设置 15 行、M/B/N/L/G/H/F/U 热键与音量/画质/帧率/语言循环均生效；难度 E5/N6/H6/L6；密码 `2002081120260909` 解锁 EXTRA；暂停 4 项；退出确认→标题；20s 标题空闲 heap 7MB 稳定 |
| 正常开局 + 真实操作 + 关卡切换/重开/续关/结局 | `_x_qa_play.mjs`(9457) | 20+ | 除 2 个已知脚本口径外全 PASS | Enter→难度 N→灵梦→开场对话 47 tap→STAGE1（残机 3、POWER 24）；→ 移动 px 64→234、Z 10 发弹、Space 跳跃 vy −493；暂停→R→R 重开；Shift+1..6 关卡全部命中（levelIndex/STAGE n/mode，仅 4 面为 stg）；6 面辉夜 HP 68214→击破→STAGE CLEAR→125 tap→标题，unlockedExtra=true；残机 1→die→游戏结束「重新挑战本关/返回标题、续命 0 次」→Enter 续关 continues=1；800x600 letterbox 正确；Q→Q 回标题 |
| EXTRA 四连战 | `_x_qa_extra.mjs`(9460) | 50 | 49 PASS（1 FAIL 为 extrachar 页多一个「返回」按钮的断言口径） | 密码解锁双角色；咲夜(19442)→蕾米莉亚(21843)→咲夜(20228)→芙兰(117889) 顺序/chainCleared/chainIdx 全对；暂停重开在蕾米处→chainIdx 1、POWER 72、残机 3、continues 0；EXTRA 内 gameover 显示「从第 3 战继续」且 continues 不增加，Enter 从第 3 战续；击破芙兰→clear→EXTRA ENDING W1→标题 |
| STAGE5 双 Boss / 呼吸区 / 中途死亡 | `_x_qa_stage5.mjs`(9456) | 19 | 17 PASS（1 FAIL=脚本用错字段 g.stageName，实际已进 STAGE6；1 FAIL=服务器 504） | 4 面 stg 通关→5 面 platform；走到 px1252 自然触发妖梦（PENDING→对话→HP16938，bossMid=true）；Boss 战死亡期间击破妖梦→挂起→复活补算 PASS（掉 1 命、1UP 掉 2 个）；呼吸区不放幽幽子；呼吸区 gameover「从中途继续」→保留 midbossDone 且 continues=1；走到触发线→幽幽子 HP60234；击破→STAGE6 |
| 稳健性（resize/暂停/设置中途/改键/重开/续关/退出） | `_x_qa_robust.mjs`(9458) | 32 | 27 PASS / 5 见第 5 节 | 游戏中打开设置改语言×4/帧率/画质/震动→回暂停→继续，计时恢复；Boss 战暂停重开→Boss 重战、continues 不变；Boss 战 gameover「再战 Boss」→续关 continues=1；退出重开 marisa 局状态重置；1024x640 运行；改键 UI 流程可回退 |
| 边界与死亡时钟 | `_x_qa_edge.mjs`(9459)+`_x_qa_keyprobe.mjs`(9458) | 23+7 | 除脚本口径问题外全 PASS | 设置页打开时模拟时钟冻结（t 1.500s 前后不变），返回 play 后继续；最后一命在 Boss 击破窗口内死亡→仍正确进入 gameover（未跳过）；两命则掉 1 命并进下一面；改键后真实按键：V 绑定射击→按 V 出 15 发、按 Z 出 0 发，label "V / J" |
| 长会话 | `_x_qa_endure.mjs`(9455) | — | 未完成（环境） | 两次 headless 会话在 boot 后首键即报 `CDP 超时(20000ms): Input.dispatchKeyEvent —— 渲染进程可能卡死`，非游戏 JS 异常；其他脚本单次会话 1-3 分钟内 console errors 均为 []，GC 后 heap 9MB/18MB（total 20/29MB），无增长趋势 |

截图目录：`tools/shots/_qa_player/`（m01-m14 菜单、p02-p15 流程、s5_* 五面、e1-e5 边界、x_extra_* EXTRA）。已人工核对：标题、设置 15 行、EXTRA 咲夜立绘卡、暂停面板、STAGE1 HUD、辉夜符卡卡、STAGE CLEAR、游戏结束、800x600 letterbox、EXTRA ENDING W1，排版/数值均正确。

## 2. 确认的问题（玩家可见性：无）

### QA-01（minor/latent）退出确认页与难度页缺少 `_page` 标记
- 位置：`src/main.js:2453`（`_showQuitRun` 的 `_setPanel` 选项 `{ select: 0 }`，缺 page）；对照 `src/main.js:2475`（`_showRestartRun` 为 `{ select: 0, page: 'paused' }`）；`src/main.js:1241-1247`（`showDifficultySelect` 选项只有 select，无 page）。
- 现象：打开「退出到标题」二次确认或难度页时 `window.__game._page === ''`，而重开确认/暂停页为 `'paused'`、设置页为 `'settings'`、选人页为 `'charselect'`。
- 玩家影响：实测流程正确（Q→标题、ESC→暂停、难度→选人），**当前无可见 bug**；风险是后续任何依赖 `_page` 判上下文的代码在这两页会读错状态（同一套代码在本仓库已因 `_page` 残留修过一次，见 `_createStage` 注释 `src/main.js:1591-1593`）。
- 建议补丁（两行）：
  - `src/main.js:2453`：`{ select: 0 }` → `{ select: 0, page: 'paused' }`
  - `src/main.js:1246` 附近：`select: Math.max(...)` 后加 `page: 'difficulty'`

### QA-02（minor/internal）按键设置页方向导航不写回 `_keybindIndex`
- 位置：`showKeybinds` `src/main.js:2821-2889`；`_keybindIndex` 仅在行 `onPick` 里更新（`src/main.js:2851`），方向键导航只改面板内部选中行。
- 证据（probe 输出）：打开页 `_keybindIndex=0`、高亮「左移」；按一次 ↓ 高亮变「右移」但 `_keybindIndex` 仍 0；再按一次高亮「上移」仍 0。
- 玩家影响：无可见影响——Enter 作用于可见行（按行 onPick 后再以 ACTION_DEFS 索引重算 select），改键实测正确；仅内部状态不卫生，且重进页面总是从第 0 行开始（若产品希望记住上次行，这里是根因）。
- 建议：面板导航时把当前行索引写回 `this._keybindIndex`（或在 `_setPanel` 增加 onSelect 回调），非必须。

## 3. 曾怀疑但排除的（不是 bug）

| 候选 | 结论 | 证据 |
|---|---|---|
| Boss 击破瞬间/击破演出中死亡 → 软锁或跳过 gameover | **不成立** | `_onBossDefeated`(`src/game/stage.js:1736-1746`) 确实没有 `_deferClearIfDead`（中 Boss 在 1684 行有），但玩家死亡进入 `state='dead'` 后 Boss 演出冻结，先走 0.9s 复活/游戏结束：两命测试→STAGE CLEAR 进下一面残机 1；最后一命测试→正常「游戏结束·再战 Boss」面板。无软锁、无白嫖残机。可选的防御性对齐：给 `_onBossDefeated` 也加 defer，但不影响玩家。 |
| 开场对话按 Enter 不推进 | **未复现** | 首次探针（9459，boot 时恰有 22 个 modulepreload ECONNREFUSED）10 连 Enter 未推进；之后 7 个脚本 47-125 次 Enter/Space 全部正常推进开场/道中/Boss 前后/通关/结局/EXTRA 对话，不再出现。判为环境抖动。 |
| HUD 残机文字为空 | 不是 bug | `#lives` 内是 3 个 `.life` 图标，textContent 本就为空；截图 hearts 正确。 |
| 后台/冻结后 Esc 无响应、计时不走 | 不是 bug | `Page.setWebLifecycleState` 解冻后 rAF 被浏览器限流（headless 环境），游戏是 rAF 驱动；正常前台暂停/继续/计时实测正确（设置页确实冻结模拟时钟）。 |
| 改键后新键是否生效/旧键是否还生效 | 产品正确 | 真实 keydown：改射击为 V 后按 V +15 弹、按 Z +0 弹；`actionOf('KeyV')='shoot'`、`actionOf('KeyZ')=null`。 |
| 改键显示 "V / J" 是否应为 "V" | 设计如此 | 每个动作有 primary+alt，只改主键、副键保留（`src/engine/input.js:18-23,280-303`）；`labelFor` 显示「主键 / 副键」（`src/engine/input.js:271-273`）。 |

## 4. 既有回归脚本状态（stale/broken 标注，非产品 bug）

| 脚本 | 状态 | 说明 |
|---|---|---|
| `_audit_smoke.mjs` | PASS | 27600 次关卡模拟 0 异常 |
| `_smoke_story.mjs` / `_smoke_ending.mjs` | PASS | 模块可导入、菜单状态、good ending 流程 |
| `_smoke_input.mjs` | PASS（需改端口副本） | 原脚本硬编码 8137，副本 `_x_smoke_input.mjs` 换 8138/9451 后 PASS |
| `_verify_flow.mjs` | PASS（改端口副本） | 菜单/难度/选人/EXTRA 锁/关卡数；硬编码 8137 需副本 |
| `_verify_settings.mjs` | PASS（改端口副本） | 设置 15 行逐项断言 |
| `_verify_endings.mjs` | FAIL=脚本假设过期 | 期望「EASY 通关解锁/EXTRA 死亡语义」，实测 EXTRA 死亡正确回 gameover「从第 1 战继续」；keyAdvance/keyFinish 断言本身 PASS；不作产品 bug |
| `_verify_power_live.mjs` | FAIL=脚本无法触发隐藏关卡 | 用 `Shift+N` 但 CDP 未带 `modifiers:8`，游戏读 `e.shiftKey` 所以永远停在对话；我们带 modifiers 的 warp 全部成功，产品正常 |
| `_verify_extra_clear.mjs` / `_verify_nofreeze.mjs` | PASS（改端口副本） | |
| `_verify_stage.mjs` | PASS（改端口副本） | |

基础设施噪声（不是游戏 bug）：8138 一度被两个 python 进程同时监听（PID 7784/41276；同命令 `tools/serve_nocache.py 8138`，另一 agent 重启导致），boot 时偶发 22 个 modulepreload `ERR_CONNECTION_REFUSED`（modulepreload 只是提示，游戏照常启动）；服务器高负载时个别大图返回 504（`src/art/gen/run/marisa_run_*.avif`）。

## 5. `qa_robust.json` 5 项 FAIL 逐条判定（Lead 要求）

1. **B.clockRunsAfterSettings** `{before:5.35, after:5.68}` → **测试假设错（环境中慢帧）**。设置页语义：打开设置时 state='paused'，模拟时钟本应冻结；该脚本是「返回游戏后」再测，1.2s 墙钟只推进 0.33s 是 headless 软件渲染下 rAF 帧间隔大 + Loop 固定步长上限所致（`src/engine/loop.js:8-16,34-42`：dt 上限 0.25s、每帧最多 4 步），不是卡死。`_x_qa_edge.mjs` 复测：设置页内 t 1.5s 不变化（冻结正确），返回 play 后继续增长。正确口径：**设置页冻结、回游戏后恢复**。
2. **E.quitConfirmPage = ''** → **测试假设错（缺省 `_page` 标记）**，见 QA-01。正确口径：该确认页现在就是空 `_page`；玩家流程正确。若要断言，应期望 `''` 或先修源码补 `page`。
3. **G.rebound = "V / J"** → **测试假设错**。正确口径为「主键 / 副键」，改射击主键后 "V / J" 是设计值。
4. **G.reboundShoots = {}** → **探针写错**：读取 `stage.shots.length`，但 PlayerShots 用 `pool` 数组存 active 标志，无 length（`src/game/playerShots.js:339-366`）。正确探针：`stage.shots.pool.filter(b=>b.active).length`；真实按键复测通过（+15 发）。
5. **G.oldKeyInactive = {}** → **同上探针错误**；正确探针复测：旧键 Z 不再出弹（+0 发），产品正确。

## 6. 复现脚本与产物

- 公共库：`tools/_x_qa_lib.mjs`（bootGame/info/advanceDialogue/warp/heap/mk）。
- 剧本（均为 scratch，只读游戏源码）：`tools/_x_qa_menu.mjs`(9456)、`_x_qa_play.mjs`(9457)、`_x_qa_extra.mjs`(9460)、`_x_qa_stage5.mjs`(9456)、`_x_qa_robust.mjs`(9458)、`_x_qa_edge.mjs`(9459)、`_x_qa_keyprobe.mjs`(9458)、`_x_qa_endure.mjs`(9455)。
- 结果 JSON/日志：`tools/reports/_runner/qa_{menu,play,extra,stage5,robust,edge,keyprobe,endure}.json|.out`。
- 截图：`tools/shots/_qa_player/`。
- 运行方式：`node tools/_x_qa_menu.mjs`（脚本内自定义端口，避免并行碰撞）。

## 7. 未覆盖/剩余风险

- 6 面全流程未「逐面纯手打」：多数长流程用隐藏跳关 + 真实输入抽测；隐藏跳关本身走玩家可见的 Shift+数字，行为正常。
- 全屏（F11）与真实设备音频输出无法在 headless 下验证；音频状态（musicOn/currentSong）已验证。
- 手柄/触屏未覆盖；桌面键盘 + 鼠标点击已覆盖。
- 3 分钟单会话长跑因 headless 渲染进程 CDP 卡死未完成（环境问题，见上）；建议正式发布前在真实浏览器开 DevTools 跑 10 分钟观察 heap/console，或在无其他 agent 占用的机器上重跑 `QA_SEC=200 node tools/_x_qa_endure.mjs`。
