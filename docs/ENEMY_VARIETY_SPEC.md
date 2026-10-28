# 小怪翻倍 / 小头目 / 进场与弹幕多样化（2026-10-27 需求）

本文是这一轮施工的**唯一真相来源**。动手前先读完；实现口径有疑问先发消息给 lead，不要自行扩大范围。

## 0. 需求原文与解释

> 小怪在每面（STG面和EX面除外）数量翻倍，且设置小头目（根据道中长度设置个数），血量约等于符卡的一半打掉后可加1/32P，且攻击方式和弹幕发射方式继续多样化，弹幕轻微复杂化，进场方式也丰富化（不要只从一侧出来）（进场方式丰富化应用于所有面）

拆解与定稿解释：

| # | 需求 | 定稿解释 |
| - | --- | --- |
| 1 | 小怪数量翻倍（STG 面、EX 面除外） | 平台面 1/2/3/5/6 的生成小怪数 ×2。实现点：`src/assets/levelgen.js` 的 `MONSTER_SPAWN[*].perScreen` ×2（`groundRatio` 不变）。STG（4 面）与 EX 不增加数量。 |
| 2 | 设置小头目，个数按道中长度 | **仅平台面（1/2/3/5/6）**新增「小头目」：道中沿途数只，按可用道中长度自动定个数（1~3）。不是 STAGE5 妖梦 / EX 蕾米莉亚那种剧情中 Boss；不锁场、不切对话/音乐、不改 stage.state。 |
| 3 | 血量约等于符卡的一半；打掉 +1/32P | HP = 该面最终 Boss 的「逐卡运行期血量」平均值 × 0.25（2026-10-27 第六轮用户要求「小头目血量减少 1/2」，于是把原「半卡」口径再减半；不乘难度血量倍率，和符卡口径一致）。击破后直接 `stage._addPower(POWER.pickup)`，即 +4 POWER = 1/32 槽；并弹出 `+1/32P` 漂浮提示。 |
| 4 | 攻击方式/弹幕发射方式继续多样化，弹幕轻微复杂化 | 平台杂兵与 STG 杂兵：每种敌人都要有 ≥2 种发射方式（瞄准扇 / 环 / 螺旋 / 连发 / 延迟落雨 / 变速混编等），并新增少量「轻微复杂化」手段（`accel` / `turn` / `wobble` / `speedVar` / 二次齐射）。幅度要求：**同屏弹幕峰值增幅 ≤ 35%**，不得越过既有 bulletBudget 护栏。 |
| 5 | 进场方式丰富化，不要只从一侧，应用于所有面 | ① 平台杂兵：一部分改为从屏外飞入/天降/闪现登场，而不是全部站桩；② STG 杂兵：除右侧涌入外，新增上/下/斜角/从背后追上等进场；③ 小头目：至少 4 种进场。**7 个面（含 STG 4 面与 EX）都要能观察到多种进场**。 |

## 1. 全局约定（必须遵守）

- 工作区：`C:\Users\GuSheng\Downloads\HKS`。纯静态 ES Module 项目，无构建。**禁止 `git commit` / `git push`**。
- 工作树里已有上一轮音乐/Boss 调整的未提交改动（`src/assets/levelgen.js`、`src/game/stage.js`、`src/game/boss.js`、`src/game/level.js` 等）。**不要回滚、不要格式化整文件**，只做本任务需要的增量修改，diff 必须能一眼看出本任务的部分。
- 代码风格：ES Module、2 空格缩进、分号、注释用中文（与现有代码一致）。不引入任何依赖/构建步骤。
- 不改（除非本任务明确要求）：`src/game/difficulty.js` 的数值表、`src/game/bossTuning.js` 的数值、`src/game/boss.js` 现有 Boss 行为（只允许新增 `bossHalfCardHp` 导出）、`src/main.js`、`src/i18n/packs/*`、`src/assets/levels.js` 的关卡尺寸/音乐/剧情。
- 新 UI 文案用**英文/符号**（`SNIPER`、`+1/32P`），避免触碰 i18n 门禁（`tools/i18n_gate.mjs` 要求 `tr('…')` 键四语齐全）。
- 性能：不要每帧 new 对象/数组；远距离（>2400px）不更新、不绘制；尊重 `bulletBudget` 与 `BulletPool` 上限。
- 测试一律用本地服务器：`8137`（已在跑）→ `--url http://127.0.0.1:8137/index.html`。headless Edge 路径脚本里已写死。

## 2. 写作用域（互斥，别越界）

| 角色 | 写作用域 | 任务 |
| - | --- | --- |
| lead | `docs/`、`tools/_enemy_count.mjs`、验证基建、最终集成 | 验收、汇总、必要的小补丁（会先通知） |
| teammate `platform-enemies` | `src/assets/levelgen.js`、`src/game/enemies.js` | 任务 A + B |
| teammate `stg-enemies` | `src/game/stg.js` | 任务 C |
| teammate `miniboss` | `src/game/miniboss.js`（新建）、`src/game/stage.js`、`src/game/boss.js` | 任务 D |

跨域需求 → 发消息给 lead，不要直接改别人的文件。

## 3. 任务 A：平台面小怪数量 ×2

- 文件：`src/assets/levelgen.js`。
- `MONSTER_SPAWN`（约 line 105）`perScreen` ×2，5 行都要改；`groundRatio` 不变。
- 不要改 `placeEntities` 的取样逻辑、`inMidWindow` 抑制逻辑、检查点/金币逻辑。若发现 ×2 后某面取样数受 `groundSlots` 数量限制达不到 2×，属正常（记录实测值即可），不要为凑数改地形。
- 验收：`node tools/_enemy_count.mjs --json _pt/enemy_count_after.json`，期望各面总数（±10%）：

| 面 | 基线 | 目标 |
| - | - | - |
| 1 | 31 | 62 |
| 2 | 32 | 64 |
| 3 | 41 | 82 |
| 5 | 4 | 8~10 |
| 6 | 72 | 144 |
| 4/EX | — | 不变（0 生成小怪） |

## 4. 任务 B：平台杂兵进场 + 攻击/弹幕多样化（`src/game/enemies.js`）

### B1 进场方式（platform 面所有小怪）

现在 EnemyManager 直接按关卡实体坐标生成，站桩出现。要求：

- 每只在 **build 时**用确定性 RNG（复用现有 `levelRng`/哈希）分配一种进场方案，默认比例建议：
  - `stand` 站桩（现行为）≈ 45%
  - `glideR` 从右侧飞入 ≈ 12%
  - `glideL` 从左侧飞入 ≈ 12%
  - `drop` 从上方天降 ≈ 12%
  - `blink` 原地闪现（先小光点预警 0.35s）≈ 8%
  - `swoop` 从上方斜向俯冲入场 ≈ 11%
- 触发条件：玩家进入该敌 ±1100px 时才开始进场；未触发前**不参与碰撞、不受伤、不发射、可半透明/不可见**。
- 进场动画 0.7~1.4s，带 `fx` 拖尾/落地扬尘；进场期间无碰撞判定、不发射。
- 进场结束后落到该敌原本站位（`baseY` / 地面）并进入原状态机，行为/血量/掉落完全不变。
- 空中敌人只用 glide/drop/swoop；bomber 的抬高逻辑保持不变。
- 注意：`update()` 的 2400px 跳过逻辑、`prev` 同步、stomp/dash 判定要与新状态兼容（未激活不得被踩）。

### B2 攻击/弹幕多样化（轻微复杂化）

现有 kind：fairy(不射)/lancer(冲锋+瞄准扇)/weaver(闪现+十字/环)/flyer(瞄准)/spreader(环)/bomber(扇形下压/延迟雨)/spinner(螺旋+追踪对)。要求：

1. 每种会开火的 kind 至少 **2 种发射方式**，由 `shotAlt` 或计时器轮换（确定性），例如：
   - lancer：冲锋瞄准扇 ↔ 冲锋后原地三连点射；
   - weaver：十字环 ↔ 左右交替的慢速扩散环；
   - spreader：整圈 ↔ 双向扇形 `speedVar` 快慢混编；
   - bomber：延迟落雨 ↔ 抛物线簇（下压 + `accel`）；
   - spinner：连续螺旋 ↔ 周期「停顿-爆发」的双臂螺旋；
   - flyer：单发瞄准 ↔ 3 连发短扇（`flyerShots` 已按难度缩放，保持）。
2. 允许的「轻微复杂化」手段（每只敌人最多叠加 1 种）：`bullets.spawn` 的 `accel` / `turn` / `wobbleAmp` / `speedVar` / 二次延迟齐射（0.25~0.45s 后补一轮）。**不要**上分裂弹、追踪海、全屏环。
3. 子弹速度仍走 `bulletSpeed = min(cap, 150*enemyBulletScale)` 体系，发射节奏仍乘 `fireScale`；新增齐射的弹数要计入现有 `bulletShots`/`bulletCap` 护栏。
4. 可选加分：低血量（<40%）时切到第二发射方式（不强制）。

### B3 验收

- `node tools/_verify_stage.mjs --stage 1 --diff N --god 1` 能跑通，`consoleErrors` 为空。
- 同一面 `maxBulletsAll` 相对基线增幅 ≤ 35%（基线见 `_pt/base_s*.json`，完成后由 lead 提供/对比）。
- `node tools/_shot_stage.mjs`（或自写探针）截 3 张道中图：能看到至少 2 种不同进场方式（天降/侧飞/闪现）。
- 不允许出现：敌人刷在玩家身体里造成无预警碰撞、敌人卡在半屏不进场、进场中被打不结算也不消失。

## 5. 任务 C：STG 进场 + 弹幕多样化（`src/game/stg.js`）

### C1 进场方式（4 面 + EX 都生效）

现在 `_spawnWave` 一律在 `x = scroll + 1400` 从右侧进入。要求：

- 在 **`_spawnWave`** 里统一分配进场方式（不要只写在 `_buildWaves`，否则 EX 的 `_buildExtraWaves` 走不到）。建议比例：`edgeR` 40%、`top` 20%、`bottom` 15%、`chase` 15%、`corner` 10%。
- 实现：给 `StgEnemy` 增加进场字段（如 `entry`/`entryT`/`entryFrom`），生成时放在屏外对应边，用 0.7~1.6s 的 easing 曲线汇入该波次的目标位置（`waveOffsets` 计算出的 y/targetX），随后转回 `vx=-speed` 常规逻辑。
  - `edgeR`：现行为（右侧）。
  - `top`：屏上方入，斜向下压入编队。
  - `bottom`：屏下方入，斜向上爬升入编队。
  - `chase`：从左侧（玩家背后）以 `vx>0` 追上，越过玩家后恢复正常左移；追击时不得立刻贴脸开火（进入后 0.6s 才允许开火）。
  - `corner`：左上/右上下斜角入场。
- 进场期间：不发射、不参与碰撞（`shots.hitRect` 跳过）、绘制正常；入场结束再按原速率开火。
- 边界：`y` 必须 clamp 在 `90 .. level.h-90` 附近再进入常规浮动，避免贴边抖动。

### C2 波次阵型 + 弹幕多样化（轻微复杂化）

1. 新增 3~4 种阵型并接入 `_buildWaves` 的 roll 表（保持确定性、保持 at 间距节奏）：建议 `diamond`（菱形）、`trail`（蛇形延迟串）、`arc`（弧线扫过）、`wallGap`（带缺口横墙，缺口位置随玩家移动）。
2. 每种 kind 至少 2 种发射方式（现有已有多种，补足缺的）：允许「3 连点射」「变速扇（speedVar）」「正弦摆动弹（wobble）」「延迟第二波」。弹数增幅受现有 `mods`（`cap`/`budget`/`fireMul`）约束。
3. `_enrichExtraWaves` 保留；EX 只加进场/弹幕多样性，不加数量。

### C3 验收

- STG 4 面与 EX 的 `_verify_stage` 跑通、`consoleErrors` 为空、`maxBulletsAll` 增幅 ≤ 35%。
- 截图（自写探针或 `_shot_stage.mjs`）至少证明 3 种进场方向（上/下/背后/斜角）。
- 不允许：敌人停在屏外不进场、`chase` 敌人永久滞留在左侧、进场导致波次卡住或数量不符。

## 6. 任务 D：小头目系统

### D1 HP 公式（`src/game/boss.js` 新增导出）

新增 `export function bossHalfCardHp(key)`：

- 基准值 `avg`：该 Boss 所有承伤符卡（跳过 `mode==='survival'`）运行期血量的平均值，逐卡口径同 Boss 构造器（`t.hp > 0` 用它，否则 `limit * dps * CARD_HP_ANCHOR`，再 × `finalHpMulFor(key)` 四舍五入）。该口径已抽到 `src/game/bossTuning.js` 的 `cardAvgRuntimeHp(key)`，小头目与道中杂兵共用。
- 返回 `Math.max(1, Math.round(avg × MINIBOSS_CARD_SHARE))`，`MINIBOSS_CARD_SHARE = 1 / 10`（2026-10-28 第十三轮：用户要求「小头目血量再下降 1/4」，在第九轮 2/15 的基础上再 ×3/4）。不乘难度血量倍率。
- 当前值（2026-10-28 第十三轮后）：S1 rumia **906**、S2 wriggle **996**、S3 cirno **1013**、S5 yuyuko **997**、S6 kaguya **876**；第九轮（2/15）依次是 1225 / 1327 / 1351 / 1329 / 1168，第八轮（×1/6）1531 / 1659 / 1689 / 1661 / 1460，第六轮（×0.25）2296 / 2489 / 2533 / 2492 / 2189，半卡口径 4593 / 4978 / 5066 / 4983 / 4379。
- 参考：S1 Boss 两卡运行期 8185 / 9938（第一卡带 `hpAdjust 0.992`、第二卡 0.982）→ 平均约 9062 → 小头目 906。

### D1b 道中杂兵血量（2026-10-27 第六轮新增，第八～十三轮各再收一刀，第十一轮起分层）

第六轮用户口述「各个小怪血量增到现在小头目的 1/3」——「现在的小头目」= 本轮改动前的半卡口径；
第八轮用户口述「小怪血量削去 1/2，小头目削去 1/3」；
第九轮用户口述「小怪再砍 1/2，小头目砍 1/5」；
第十轮用户口述「小怪再削 1/2」；
第十一轮用户口述「这是最高血量的小怪，但是现在我不想小怪都是这个血量，这样太难打了」——改成分层：
第十三轮用户口述「全部小怪小头目血量再下降 1/4 且小怪血量随机性延续」——分层与抽取不变，整体再 ×3/4：
第十四轮用户口述「第四面第四个符卡增血量3%，小怪整体略减少数量和减小弹幕密度」——单只血量不再动，改为**数量**与**弹幕密度**各 ×0.9（见文末「数量与密度」）：

- 基准 = `avg × MOB_CARD_SHARE`，`MOB_CARD_SHARE = 1/64`（第六轮 1/6 → 第八轮 1/12 → 第九轮 1/24 → 第十轮 1/48 → 第十三轮再 ×3/4），基准兵种 `fairy`。小头目 `avg × 1/10`。
- 2026-10-28 第十一轮起，基准之上再分两档：普通兵 ×`MOB_TRASH_SCALE`（1/2，很脆，占绝大多数）、精英兵 ×`MOB_ELITE_SCALE`（2，少数硬骨头），每只按 `MOB_ELITE_CHANCE`（0.15）抽取。精英标记挂在 `unit.elite`；精英的外观比同兵种普通兵大 `MOB_ELITE_SIZE_SCALE`（1.2×，只放大 `drawGenFairy` 的绘制尺寸，碰撞框 `w/h` 与击破判定不变）。
- 抽取走 `enemies.js` 的独立随机流 `hpRng`（种子 = `关卡 gen.seed ^ hashStr(id) ^ 0x2545f491`），不改动种类 / 护航 / 进场序列，所以分层前后敌人配比与站位逐只一致；同一关每次进入的精英分布也完全确定。
- 兵种之间保留原 6:9:12:15 梯度，按 `PLATFORM_KINDS[kind].hp / PLATFORM_KINDS.fairy.hp` 等比放大：fairy / flyer ×1、weaver ×1.5、lancer / spreader / spinner ×2、bomber ×2.5。
- 实现：`enemies.js` 的 `EnemyManager` 构造时算出 `mobHpOf(kind, scale)`，传给 `makeFairy`（含 tier≥3 的空中护航）。平台面小怪从此**不再吃 `ENEMY_HP_SCALE`**；STG 杂兵（`src/game/stg.js`）不变。
- 当前单只血量（普通 / 精英）：fairy·flyer S1 71 / 283、S2 78 / 311、S3 79 / 317、S5 78 / 311、S6 68 / 274；weaver 106 / 425、117 / 467、119 / 475、117 / 467、103 / 411；lancer·spreader·spinner 142 / 566、156 / 622、158 / 633、156 / 623、137 / 547；bomber 177 / 708、194 / 778、198 / 792、195 / 779、171 / 684。
- 实测（`node _pt/mobhp_check.mjs`）：第十四轮起平台面 mob 数量 S1 53、S2 60、S3 80、S5 8、S6 142（较第十三轮约 −10%，跳过逻辑见下）；精英占比 S1 5/53、S2 5/60、S3 14/80、S5 2/8、S6 27/142；各面道中血量合计见 `docs/BALANCE_TARGETS.md` §2.2。
- **数量与密度（第十四轮）**：`balance.js` 新增 `MOB_COUNT_SCALE = 0.9` / `MOB_FIRE_SCALE = 0.9`。平台面 `EnemyManager` 用 `countRng`（种子 = `gen.seed ^ hashStr(id) ^ 0x6a09e667`）逐只掷骰、按 ≥10% 概率跳过「本体」，随本体生成的空中护航一并不生成；STG 关（4 面）每波人数 `Math.max(1, round(count × 0.9))`、`enemyFireScale` 再 ÷0.9。两者都不动兵种配比权重、站位表与 Boss。

### D2 数量与位置（`src/game/miniboss.js` 内实现，stage 只负责创建/驱动）

- 仅 `mode==='platform'` 且关卡有 `def.boss` 的 5 个平台面生成；STG 4 面 / EX 不生成。
- 排除区（列坐标 `col`，1 列=32px）：
  - 出生区：`col < 30`；
  - Boss 场：`col >= (level.cols - 50) - 8`（`level.bossArena.left - 8*T` 之后不算道中）；
  - 妖梦舞台（仅 S5，`level.midbossArena` 存在时）：`[mid.left - 6*T, mid.right + 16*T]`（给出口坡道留位置）。
- 在剩余空闲区间里统计总长度 `L`（px）：`count = clamp(Math.round(L / (420*32)), 1, 3)`。
  - 预期：S1 1 只、S2 2 只、S3 2 只、S5 1 只（落在妖梦后的第二道中）、S6 3 只。
- 分配：按各空闲区间长度比例分配 count（最大余数法，至少给最长区间 1 只）；同一区间内按等分，每段取 62% 位置作为 `x`。
- 位置再兜底：`x` 夹到 `[60*32, level.bossArena.left - 12*32]`；S5 必须避开妖梦舞台窗口。
- 每只的 `archetype` 与 `entry` 用确定性 RNG（`level.gen.seed` + `level.index`）轮换，保证同一关每次重开一致、且一个完整流程能看到多种进场。

### D3 数据与行为

- HP：`bossHalfCardHp(stage.def.boss)`（stage 侧算好传入 manager）。所有难度同一 HP。
- 小头目本体：绘制用 `drawGenFairy`（`src/art/genfairy.js`）放大版（`size≈92~104`）+ 该原型色；本体下方一圈旋转菱形光环作视觉标识，不要复用 Boss 立绘。头顶原型徽记（尖冠 / 舞环 / 引信火花）2026-10-28 第十一轮按用户要求移除（「小BOSS上面不要出现图标」），原型只由 HP 条右侧英文标签体现。
- 三种原型（确定性分配），各自 2~3 套弹幕循环，循环内按 `difficulty` 的 `enemyBulletScale` / `enemyFireScale` / `bulletSpeedCap` / `bulletBudget` 缩放：
  1. `sniper`（蓝）：瞄准 5 连扇（带轻微提前量）↔ 3 连快速点射；HP<50% 后追加一次带缺口环。
  2. `dancer`（紫）：2/3 臂旋转螺旋 ↔ 交替双向扇；伴随横向漂移。
  3. `bomber`（红）：抛射簇（`accel` 向下 + `wobble`）↔ 慢速延迟落雨；周期 8 向爆发。
- 进场（≥4 种，轮换）：`slideR` 从右侧滑入、`slideL` 从左侧滑入（越过玩家）、`drop` 从屏顶落下、`blink` 闪现（0.4s 预警光环）、`diagonal` 斜角俯冲。进场 0.8~1.5s，期间无敌、不发射。
- 战斗：悬停在 `x=计划位置`，`y = 本地地面高度 - 150`（用 `level.tileAt`/`isSolidTile` 向下探测，clamp 在屏内），上下浮动 ±10px、左右漂移 ±120px；玩家跑到 1600px 外持续 2s → 淡出退场（未击破无奖励），再靠近可重新触发？**否**：退场后本局不再触发（避免反复刷）。
- 触发：`player.x + 400 > x - 1100` 时开始进场（提前一屏入场）。
- 受击：`shots.hitRect` 结算（同 `Boss.damageWithShots` 的矩形近似），命中闪白 + 火花；接触玩家 `player.hurt`（用现有敌人同款调用方式，带 invuln 保护）。
- 击破：爆裂 + 冲击波 + 镜头震动；`stage._addPower(POWER.pickup)`（+4 = 1/32P），弹出 `+1/32P` 漂浮字；`stage.onEvent('minibossClear', {key, index})`（main.js 有 default 分支，安全）；清空自己所在半径的敌弹（`bullets.clear()` 会给玩家喘息，允许）。
- 头顶 UI（世界坐标绘制，`ctx.translate(-cam.x, -cam.y)`，不污染 HUD DOM）：2026-10-28 第十一轮按用户要求收敛为**只有一行居中的原型英文标签**（`SNIPER`/`DANCER`/`BOMBER`，10px 粗体 + 深色描影）——原来的 `MINI BOSS` 小字、120px 细血条与右侧右对齐标签一律去掉；血量反馈靠命中闪白。
- 边界必须处理：玩家死亡/复活（`_respawn`）→ 未击破的激活中小头目重置为未触发+满血，击破的保持击破；Boss 战开始（`beginBoss`）→ 清掉激活中的小头目与弹幕（避免 Boss 开场混弹）；关卡重开/重试 → 新建 manager 自然重置；暂停/对话（`state!=='play'`）→ 不更新。

### D4 API 契约（stage.js 集成点）

`src/game/miniboss.js` 导出：

```js
export class MinibossManager {
  constructor({ level, difficulty, stageNumber, halfCardHp, rngSeed })
  update(dt, stage)                 // stage 提供 player/bullets/fx/_addPower/onEvent
  damageWithShots(shots, fx, onHit) // 玩家子弹结算
  draw(ctx, cam)                    // 本体 + HP 条
  clearActive()                     // Boss 开场/关卡结束
  onPlayerRespawn()                 // 复活后重置未击破者
  get activeCount()
  get defeatedCount()
}
```

`stage.js` 只在平台模式：
- 构造器创建 `this.minibosses = new MinibossManager({...})`；
- `_updatePlatform` 里 `state==='play'` 时 `this.minibosses.update(dt, this)`；
- 玩家子弹结算处紧接着 `enemies.damageWithShots(...)` 之后调用 `minibosses.damageWithShots(...)`；
- `enemies.draw(...)` 之后调用 `minibosses.draw(ctx, cam)`；
- `beginBoss` 开头 `this.minibosses?.clearActive()`；
- `_respawn` 成功后 `this.minibosses?.onPlayerRespawn()`。
- 不改 boss 触发/检查点/存档字段。

### D5 验收

- S1/S2/S3/S5/S6 的 `_verify_stage` 全跑通、`consoleErrors` 为空；道中时间增幅合理（+小头目战斗时间，但自动玩家 god 下应能过）。
- 自写探针 `tools/_probe_miniboss.mjs`（miniboss 负责）：强制传送到每只小头目位置，输出 `{stage, index, x, halfCardHp, entry, archetype, tSpawn, tDeath, defeated, powerBefore, powerAfter}`，并截图 1 张（HP 条 + 本体）。
- 断言：击破后 `power` 增加 4（=1/32P 槽）；同关重开位置/原型一致；S5 不落在妖梦舞台内。
- 断言：小头目存在时不会出现「玩家被锁住不能前进」的情况（不锁场）。

## 7. 验收协议（lead 统一跑）

1. `node tools/_enemy_count.mjs --json _pt/enemy_count_after.json` → 对照 §3 表。
2. 基线（已完成，`_pt/base_s1..s6.json`）与改后对比：`midSec`、`bossSec`、`maxBulletsAll`、`consoleErrors`。
3. 逐面：`node tools/_verify_stage.mjs --stage N --diff N --god 1 --maxSteps 60000 --port 914x --url http://127.0.0.1:8137/index.html --out _pt/after_sN.json`（N=1,2,3,4,5,6；EX：`--stage 7 --extra 1`）。
4. 截图：`_shot_stage.mjs` 或各 teammate 探针，覆盖 进场多样性 + 小头目 + 弹幕。
5. `node tools/i18n_gate.mjs`（应不受影响）。
6. 控制台错误必须为空；FPS 不低于基线（用 `_perf_*.mjs` 可选）。

## 8. 报告模板（完成后发给 lead）

```
负责域：<A+B / C / D>
改动文件：
- path:line —— 改了什么，为什么
实测数据：<数字，含前后对比>
自测命令与结果：<命令 + 关键输出>
已知风险/未覆盖：<...>
```
