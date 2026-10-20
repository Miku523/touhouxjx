# 平衡改造目标（2026-10-20 需求 1–7）

本文件是「玩家反馈 7 条」的施工图：解释、目标数值、测量协议、写作用域、验收标准。
所有 teammate 动手前先读完本文件，并以本文件的验收标准自测。

工作区：`C:\Users\GuSheng\Downloads\HKS`（git 仓库 HEAD `fa6e4d6`，工作树干净起步）
运行方式：纯静态站点，必须起本地服务器（ES Module）：
- `8137`、`8138`、`8141` 已在后台运行（python tools/serve_nocache.py <port>）
- 默认脚本地址：`_sim_player.mjs` / `_sim.mjs` 用 8137/8141，`_shot_stage.mjs` 用 8138；可用 `--url http://127.0.0.1:<port>/index.html` 覆盖
- Node v26、Python 3.13、headless Edge（脚本里写死路径）均可用

**禁止 `git commit` / `git push`**。不要在别人的写作用域里改文件，跨域需求先发消息给 lead。

---

## 0. 七条需求的解释与验收

| # | 玩家原话要点 | 实现解释 | 验收（数字） |
| - | --- | --- | --- |
| 1 | 关卡小怪数量过少且血量过少 → 增强血量/数量、弹幕密度和样式 | `src/game/enemies.js` 的 `PLATFORM_KINDS.hp` 全面上调；`src/assets/levelgen.js` 每屏刷怪点增加；`src/game/stg.js` 的 STG 杂兵同步；弹幕新增 ≥2 种样式并提高齐射数/射速（全局齐射数、密度由 lead 在 difficulty.js 预调） | 每屏小怪数 +40%~60%；有效血量 ≈ 当前 2.5~3.5 倍；同屏弹幕峰值 ≤ 难度预算；无卡死/穿模 |
| 2 | 关卡前置过长，BOSS 战应占总时长 70% | 缩短 `src/assets/levels.js` 各面 `gen.cols`（= 道中长度），使「道中时间 : Boss 时间」≈ 30 : 70 | 表 1 的绝对值 ±10s / ±4 个百分点（自动玩家、Normal） |
| 3 | 后几面画面明暗程度不一 | 统一各面背景平均亮度（stage.js 的背景合成 filter / `TIME_SHIFT` 压暗层 / scenes.js 环境光），保留色相与氛围 | 7 面（1–6 + EX）各 3 个进度点平均亮度落在同一目标带 ±5，面内极差 ≤ 10（0–255） |
| 4 | BOSS 战可战斗参与互动元素太少、战斗单调 | boss.js 增加可参与机制（可踩破势球 / 俯冲冲击波 / 冲刺反击窗口 / 破势硬直放大器 等 ≥3 种），并让破势循环成为主要乐趣 | 每场 Boss 至少 3 种互动可实际触发（截图/遥测证明）；破势硬直每场 2–4 次；无软锁 |
| 5 | 大幅上调 boss 击破条 | ① Boss 总血量（HUD「击破条」）按表 1 上调；② 头顶破势槽（stagger 条）需求上限 100 → 140 左右，并给互动补足破势来源 | 表 1 的 Boss 秒数 ±8%；破势条上限上调且可达；EX 总时长保持现状 ±10% |
| 6 | 降低子机攻击伤害 | 「子机」在本作 = 每 2 轮追加的特殊副弹（灵梦追踪御札 / 魔理沙穿透魔弹）。伤害 −35%：2.4→1.55、3.2→2.05（主弹不动） | `playerShots.js` 数值 + 运行时 `b.damage` 断言 |
| 7 | 适当增加 boss 弹幕密度（EX 关除外） | boss.js 内新增非 EX 的密度系数（≠改难度表），弹数 +15%~20%，不改弹速；EX 密度保持不变 | 非 EX Boss 战同屏弹幕峰值 +12%~22%；EX 峰值不变（±5%） |

> 「击破条」按两层都做：主血条（击破进度）大幅上调，头顶破势槽适度上调；
> 两者都在报告里写清，避免玩家预期落空。

## 1. 目标节奏表（Normal 难度、自动玩家 god、含对话）

| 面 | Boss | 目标道中 | 目标 Boss | 合计 | Boss 占比 |
| - | --- | --- | --- | --- | --- |
| 1 | 露米娅 | 55s | 128s | 183s | 70.0% |
| 2 | 莉格露 | 70s | 163s | 233s | 70.0% |
| 3 | 琪露诺 | 85s | 198s | 283s | 70.0% |
| 4 | 射命丸文 | 90s | 210s | 300s | 70.0% |
| 5 | 幽幽子 | 105s | 245s | 350s | 70.0% |
| 6 | 辉夜 | 120s | 280s | 400s | 70.0% |
| EX | 芙兰 | 保持现状 | 现状 ±10% | — | —（EX 不受 #7 约束） |

- 道中时间 = 出生 → Boss 登场（`stage.state === 'boss'`）；Boss 时间 = 登场 → `clear`。
- Boss 秒数是自动玩家口径；真人会更快，比例以自动玩家为准。
- 其他难度沿用既有 `hpScale` 缩放，不单独验收。

## 2. 测量协议

### 2.1 道中 / Boss 计时（headless，真实键盘路径）
```bash
# 从第 N 面（0-based）开头跑到 Boss 击破；JSON 里 events 记录 stage-start / stage-state(boss,clear) 的 at 秒
node tools/_sim_player.mjs --stage 0 --diff N --god 1 --maxSteps 60000 --out _pt/m_s1.json --port 9371
```
- 解析 `result.stages[].at`、`result.events[]` 中 `{kind:'stage-state', state:'boss'|'clear', at}`。
- 只想量 Boss 战（跳过道中）：加 `--startX <level.w - 1400>`（Boss 场是末尾 50 列平地）。
- 舞台 6 目前自动玩家可能卡在某处（2026-10-20 观测：x≈31426 处不动）——若卡住，先记录 x/col，
  用 `--maxSteps` 截断 + 手工分析地形；Boss 战用 `--startX` 测。

### 2.2 小怪数量 / 血量
- 数量：`node tools/_mapdump.mjs`（检查点/地形）或写纯 Node 脚本 `buildLevelRows(gen)` 后统计
  `'s'`/`'f'` 字形（`level.js` 的 `ENTITY_CHARS`：`s`=fairy、`f`=flyer）。
- 血量：`enemies.js` 的 `PLATFORM_KINDS[kind].hp × scaleEnemyHp(1)`（`balance.js` 的 `ENEMY_HP_SCALE = 0.9`）。

### 2.3 亮度（#3）
- 用 `tools/_shot_stage.mjs --stage N --url http://127.0.0.1:8138/index.html` 抓多个进度点（可传 `--frames`），
  或新写截图脚本；用 `python` + Pillow 算中心区域平均亮度（0–255）、面内极差。
- 基线：可在 `git worktree` 的 HEAD 副本上跑同一脚本，得到改造前数据。

### 2.4 Boss 血量 / 弹幕峰值 / 破势次数
- `_sim_player` 的 JSON 有 `lastStage.boss.maxHp`、`maxBullets`；boss 的 `staggerCount` 可在页面内读
  `window.__game.stage.boss.staggerCount`（`_sim_player` 加一次 eval 或新脚本）。
- Boss 血量标定：`newHp = dps × 目标秒数`，`dps = 当前 maxHp / 当前实测 Boss 秒数`（自动玩家、同一套机制下）。
  改完后再实测一轮确认，误差 >8% 继续微调。

## 3. 写作用域（文件级，严格遵守）

| 成员 | 写作用域 | 任务 |
| --- | --- | --- |
| lead | `src/game/playerShots.js`、`src/game/difficulty.js`、`docs/BALANCE_TARGETS.md`、`docs/QA_BALANCE_REPORT.md`、`tools/**`（协调用，必要时） | #6、#1 的全局齐射数/密度、集成验收、最终报告 |
| boss-combat | `src/game/boss.js`；如需 `src/game/bullets.js`、`src/game/player.js` 先告知 lead（无其他人写） | #4、#5、#7 |
| minions | `src/game/enemies.js`、`src/assets/levelgen.js`、`src/game/stg.js` | #1 |
| pacing | `src/assets/levels.js`、`src/game/level.js` | #2 |
| visuals | `src/game/stage.js`、`src/art/scenes.js`、`src/engine/renderer.js` | #3 |
| verifier | `tools/_verify_*.mjs`（新建）、`docs/VERIFY_BALANCE_REPORT.md`；**不改 src** | 独立复核全部 7 条 + 回归 |

冲突约定：
- `stage.js` 只归 visuals；若 boss-combat / pacing 必须动它，发消息给 lead，由 lead 协调（visuals 优先）。
- `difficulty.js` 只归 lead；其他人只读。
- `levels.js` 只归 pacing；minions 只改 `levelgen.js` 的刷怪点，不碰 cols。

## 4. 已定的全局改动（lead 执行，先落地）

1. `playerShots.js`：`SHOT_PROFILE.reimu.special.damage 2.4 → 1.55`；`marisa.special.damage 3.2 → 2.05`。
2. `difficulty.js`（小怪齐射密度，EX 不动）：
   - `flyerShots`：E1→2、N1→2、H2→3、L3→4（EX 3）
   - `stgScoutShots`：E1→2、N1→2、H2→3、L3→4（EX 3）
   - `stgGunnerShots`：E2→3、N3→4、H4→5、L5→6（EX 6）
   - `enemyFireScale`：E1.45→1.38、N1.0→0.94、H0.78→0.74、L0.6→0.58（越小开火越密；EX 0.55 不动）
   - `ENEMY_STAGE_DENSITY`：`{1:1, 2:.9, 3:.86, 4:.82, 5:.78, 6:.74}` → `{1:1, 2:.96, 3:.93, 4:.90, 5:.87, 6:.84}`
     （后期面不再被 ROUND 抹平；这是 #1 的「数量/密度」向上修正）
3. `balance.js` 不动（`PLAYER_ATK_SCALE 1.35`、`ENEMY_HP_SCALE 0.9`）；Boss 血量由 boss-combat 在 BOSS_DEFS 内标定。

## 5. 验收流程
1. 各成员自测通过 → `send_message` 给 lead：改了哪些文件、关键数字、测量命令与结果、遗留风险。
2. lead 集成：起服务器 + `_sim_player` 全流程 + 截图，检查无 console error、无卡死。
3. verifier 独立复跑（不改 src）：7 条逐项 PASS/FAIL + 回归（流程、性能、EX）。
4. lead 写 `docs/QA_BALANCE_REPORT.md` 收尾，不提交 git（用户未要求）。
