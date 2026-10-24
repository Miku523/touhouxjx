# 《东方新纪行》符卡专属弹型 · QA 验收报告

- 任务：task-6（主线 31 卡）+ task-9（EXTRA 12 卡 + 延迟弹回归）
- 日期：2026-10-24
- 环境：本机 http://127.0.0.1:8137，Windows + Edge headless（CDP 9355~9403，各次跑使用独立端口），1280×720
- 范围：主线 1~6 面 31 张（露米娅 2、莉格露 3、琪露诺 4、射命丸文 5、幽幽子 6、中途妖梦 3、辉夜 8）+ EXTRA 12 张（蕾米莉亚 2、芙兰朵露 10）+ 3 张延迟弹回归
- 结论：**主线 31 / 31、EXTRA 12 / 12，共 43 / 43 通过**。全部符卡都出现了本角色专属弹型；最终复跑无 `[boss] custom pattern failed`、无 JS 异常、无控制台报错。
- 验收期间发现并已修复 3 个问题：延迟弹漏皮（已修，3 卡回归通过）、内置 `cross` 分支缺失（原有 bug，已修，3 卡重测通过）、`lava.js` 热核参数崩溃（已修，4 卡重测通过），详见问题 1 / 5 / 6。

![符卡专属弹型 8 卡总览](../tools/_shots/skin_overview.png)

![EXTRA 8 卡总览](../tools/_shots/extra_overview.png)

## 1. 验收方法

工具：`tools/_card_shot.mjs`（本次新建）。启动 headless Edge，直连页面 `index.html?boss=<timestamp>`，用 CDP `Runtime.evaluate` 注入以下流程，再从真实渲染帧截图：

1. `g.startStage(stage)` → `g.loop.stop()` → `g.state="play"`、`stage.state="boss"`；关 boot / overlay / dialogue。
2. 平台面把玩家放在 Boss 左侧 430px、`invuln=9999`、`hearts=9999`；STG 面（文）清空并暂停道中妖精（`stage.stg.enemies.length=0`、`spawnPaused=true`），避免道中弹混入统计。
3. 强制指定符卡：`spellIdx=card`、`phase=card`、`_applyCard(card)`、`_startPattern(0)`；重置 `state="battle"`、`spellLock=0`、HP、位移/冲撞状态，并压制随机额外弹（`wildAbort=0`、`_wildCd=9999`）。
4. 固定步进 `300 × g.update(1/60)`（≈5 秒），相机锁定 Boss，`g.render(1)` 后 `Page.captureScreenshot`。
5. 统计当前存活子弹的 `type` / `r`，同时收集 `Runtime.consoleAPICalled`、`Runtime.exceptionThrown`、`Log.entryAdded`。
6. 工具第 9 参 `patternIdx`（默认 0）可切 `_startPattern(n)`；对首 pattern 为 `cross` 的 EXTRA 卡曾用 `patternIdx=1` 交叉验证皮肤，`cross` 修复后已用默认 0 重测。
7. EXTRA 流程：`g._startExtraStage({skipIntro:true})`；雷米莉亚（中途 Boss）用 `stage.beginBoss("remilia", { midboss:true })`，其余参数与主线一致。

判定标准：

- 期望弹型 = `cardSkins.js` 该卡的 `skin` + `map` 值；实测至少命中 1 种期望弹型；
- 不得出现期望之外的专属弹型（id ≥ 5）；
- 不得出现 `custom pattern failed`、未捕获异常或 `Uncaught / TypeError / ReferenceError / SyntaxError`；
- 旧基础型 0~4 号弹记录为 `legacy`（不计入失败；4 号激光为合法基础弹型）；延迟弹漏皮已于问题 1 修复并回归。

> 说明：采样窗口为每卡前 5 秒的招牌 pattern（`_startPattern(0)`），发数受该卡节奏影响（例如 3-1 只有 14 发），不是整卡总弹量。主线每卡其余 variant 共用同一张 `CARD_SKINS` 映射，未逐个 variant 截图；EXTRA 的 `cross` 首招另有 `patternIdx=1` 交叉验证记录（见 3.2 / 问题 5）。

## 2. 逐卡结果

| 编号 | 符卡 | 专属弹型（映射声明） | 实测弹型（存活发数） | 大 / 小 | 截图 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| 1-1 | 宵暗「月之暗面」 | 月牙(5) | 月牙(5) ×160 | 4 / 156 | [PNG](../tools/_shots/card_rumia_0.png) | 通过 |
| 1-2 | 暗符「黑暗吞噬」 | 吞噬暗球(6) | 吞噬暗球(6) ×200 | 0 / 200 | [PNG](../tools/_shots/card_rumia_1.png) | 通过 |
| 2-1 | 灯符「萤火虫现象」 | 萤火虫(7) | 萤火虫(7) ×58 | 0 / 58 | [PNG](../tools/_shots/card_wriggle_0.png) | 通过 |
| 2-2 | 蠢符「小虫风暴」 | 小虫(8) | 小虫(8) ×159 | 0 / 159 | [PNG](../tools/_shots/card_wriggle_1.png) | 通过 |
| 2-3 | 隐虫「萤火虫之夜」 | 萤火虫(7)，大弹 小虫(8) | 萤火虫(7) ×154 | 0 / 154 | [PNG](../tools/_shots/card_wriggle_2.png) | 通过 |
| 3-1 | 冰符「冰柱落下」 | 小冰块(9) | 小冰块(9) ×14 | 0 / 14 | [PNG](../tools/_shots/card_cirno_0.png) | 通过 |
| 3-2 | 雹符「冰雹风暴」 | 小冰块(9) | 小冰块(9) ×35 | 0 / 35 | [PNG](../tools/_shots/card_cirno_1.png) | 通过 |
| 3-3 | 冻符「完美冻结」 | 小冰块(9) | 小冰块(9) ×51（回归后） | 0 / 51 | [PNG](../tools/_shots/card_cirno_2.png) | 通过 |
| 3-4 | 雪符「钻石风暴」 | 小冰块(9) | 小冰块(9) ×105 | 0 / 105 | [PNG](../tools/_shots/card_cirno_3.png) | 通过 |
| 4-1 | 风符「风神一扇」 | 枫叶(10) | 枫叶(10) ×36 | 5 / 31 | [PNG](../tools/_shots/card_aya_0.png) | 通过 |
| 4-2 | 疾风「风神少女」 | 枫叶(10) | 枫叶(10) ×186 | 0 / 186 | [PNG](../tools/_shots/card_aya_1.png) | 通过 |
| 4-3 | 岐符「天之八衢」 | 枫叶(10) | 枫叶(10) ×101 | 0 / 101 | [PNG](../tools/_shots/card_aya_2.png) | 通过 |
| 4-4 | 风神「天狗颪」 | 枫叶(10) | 枫叶(10) ×63 | 0 / 63 | [PNG](../tools/_shots/card_aya_3.png) | 通过 |
| 4-5 | 「幻想风靡」 | 枫叶(10) | 枫叶(10) ×389 | 0 / 389 | [PNG](../tools/_shots/card_aya_4.png) | 通过 |
| 5-1 | 幽雅「死出诱蛾灯」 | 樱花(11)→樱瓣(12) | 樱花(11) ×125；樱瓣(12) ×10 | 10 / 125 | [PNG](../tools/_shots/card_yuyuko_0.png) | 通过 |
| 5-2 | 蝶符「花之舞」 | 樱瓣(12) | 樱瓣(12) ×117 | 0 / 117 | [PNG](../tools/_shots/card_yuyuko_1.png) | 通过 |
| 5-3 | 蝶符「死蝶之华尔兹」 | 樱瓣(12)→樱花(11) | 樱瓣(12) ×128 | 0 / 128 | [PNG](../tools/_shots/card_yuyuko_2.png) | 通过 |
| 5-4 | 亡乡「亡我乡 -宿罪-」 | 樱花(11)→樱瓣(12) | 樱花(11) ×53；樱瓣(12) ×13 | 0 / 66 | [PNG](../tools/_shots/card_yuyuko_3.png) | 通过 |
| 5-5 | 冥符「常夜樱」 | 樱花(11) | 樱花(11) ×133 | 0 / 133 | [PNG](../tools/_shots/card_yuyuko_4.png) | 通过 |
| 5-6 | 反魂蝶「八分咲」 | 樱花(11)→樱瓣(12) | 樱花(11) ×75 | 0 / 75 | [PNG](../tools/_shots/card_yuyuko_5.png) | 通过 |
| 5M-1 | 人符「现世斩」 | 刀斩(22)→太刀(21) | 太刀(21) ×59 | 0 / 59 | [PNG](../tools/_shots/card_youmu_0.png) | 通过 |
| 5M-2 | 人鬼「未来永劫斩」 | 太刀(21)→刀斩(22) | 刀斩(22) ×48（回归后） | 0 / 48 | [PNG](../tools/_shots/card_youmu_1.png) | 通过 |
| 5M-3 | 断灵「剑楼阁」 | 太刀(21)→半灵(23) | 太刀(21) ×10；半灵(23) ×55 | 0 / 65 | [PNG](../tools/_shots/card_youmu_2.png) | 通过 |
| 6-1 | 难题「龙颈之玉 -五色的弹丸-」 | 五色玉(13)→龙玉(14) | 五色玉(13) ×47；龙玉(14) ×9 | 0 / 56 | [PNG](../tools/_shots/card_kaguya_0.png) | 通过 |
| 6-2 | 神宝「耀眼的龙玉」 | 龙玉(14) | 龙玉(14) ×47 | 6 / 41 | [PNG](../tools/_shots/card_kaguya_1.png) | 通过 |
| 6-3 | 难题「佛御石之钵 -不碎的意志-」 | 碎石(15) | 碎石(15) ×137 | 0 / 137 | [PNG](../tools/_shots/card_kaguya_2.png) | 通过 |
| 6-4 | 神宝「佛体的金刚石」 | 金刚石(16) | 金刚石(16) ×88 | 0 / 88 | [PNG](../tools/_shots/card_kaguya_3.png) | 通过 |
| 6-5 | 难题「火鼠的皮衣 -不焦躁的内心-」 | 不灭火(17) | 不灭火(17) ×30 | 0 / 30 | [PNG](../tools/_shots/card_kaguya_4.png) | 通过 |
| 6-6 | 神宝「火蜥蜴之盾」 | 火鳞(18) | 火鳞(18) ×73 | 0 / 73 | [PNG](../tools/_shots/card_kaguya_5.png) | 通过 |
| 6-7 | 难题「燕的子安贝 -永命线-」 | 燕尾(19) | 燕尾(19) ×72 | 0 / 72 | [PNG](../tools/_shots/card_kaguya_6.png) | 通过 |
| 6-8 | 神宝「蓬莱的玉枝 -梦色之乡-」 | 玉枝(20) | 玉枝(20) ×83（回归后） | 0 / 83 | [PNG](../tools/_shots/card_kaguya_7.png) | 通过 |

`**` 本卡主弹走 `map1→B_BLADE`，实测为太刀而非声明的刀斩，属映射预期，见问题 4。延迟弹问题已修复，3 张回归见 §3.1。

补充：主线 31 卡共采样 3123 发存活子弹（半径 ≥8 的大弹 25 发）；EXTRA 12 卡采样 4313 发（EXTRA 弹型半径均 ≤7，无大弹层），叠加后共 7436 发。1-1、5-1、6-2、EX-芙5/7 等卡能明显看到大弹/小弹或高密度层次。

## 3. EXTRA 关验收（task-9）

EXTRA 用 `g._startExtraStage({ skipIntro: true })`；雷米莉亚为中途 Boss，用 `beginBoss('remilia', { midboss: true })`；其余流程与主线相同。12 卡全部通过：

| 编号 | 符卡 | 专属弹型（映射声明） | 实测弹型（存活发数） | 大 / 小 | 截图 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| EX-雷1 | 咒诅「弗拉德·特佩斯」 | 蝙蝠(24)→长枪(25) | 蝙蝠(24) ×43 | 0 / 43 | [PNG](../tools/_shots/card_remilia_0.png) | 通过 |
| EX-雷2 | 天罚「大卫之星」 | 月牙(5)→蝙蝠(24) | 月牙(5) ×394 | 0 / 394 | [PNG](../tools/_shots/card_remilia_1.png) | 通过 |
| EX-芙1 | 禁忌「蔓越莓陷阱」 | 水晶(26)→蝙蝠(24) | 水晶(26) ×327 | 0 / 327 | [PNG](../tools/_shots/card_flandre_0.png) | 通过 |
| EX-芙2 | 禁忌「雷瓦汀」 | 熔岩(27) | 熔岩(27) ×18 | 0 / 18 | [PNG](../tools/_shots/card_flandre_1.png) | 通过 |
| EX-芙3 | 禁忌「四重存在」 | 水晶(26)→蝙蝠(24) | 水晶(26) ×205 | 0 / 205 | [PNG](../tools/_shots/card_flandre_2.png) | 通过 |
| EX-芙4 | 秘弹「然后就一个人都不剩了？」 | 熔岩(27)→蝙蝠(24) | 熔岩(27) ×370 | 0 / 370 | [PNG](../tools/_shots/card_flandre_3.png) | 通过 |
| EX-芙5 | 禁弹「星弧破碎」 | 水晶(26)→蝙蝠(24) | 蝙蝠(24) ×587 | 0 / 587 | [PNG](../tools/_shots/card_flandre_4.png) | 通过 |
| EX-芙6 | 禁弹「折反射」 | 水晶(26) | 水晶(26) ×390 | 0 / 390 | [PNG](../tools/_shots/card_flandre_5.png) | 通过 |
| EX-芙7 | QED「495年的波纹」 | 熔岩(27)→水晶(26) | 熔岩(27) ×691 | 0 / 691 | [PNG](../tools/_shots/card_flandre_6.png) | 通过 |
| EX-芙8 | 禁忌「吸血鬼之宴」 | 蝙蝠(24) | 蝙蝠(24) ×596 | 0 / 596 | [PNG](../tools/_shots/card_flandre_7.png) | 通过 |
| EX-芙9 | 禁忌「破坏之瞳」 | 熔岩(27) | 熔岩(27) ×31 | 0 / 31 | [PNG](../tools/_shots/card_flandre_8.png) | 通过 |
| EX-芙10 | 未明「明けない夜の約束」 | 月牙(5)→蝙蝠(24) | 月牙(5) ×661 | 0 / 661 | [PNG](../tools/_shots/card_flandre_9.png) | 通过 |

补充：EXTRA 共采样 4313 发，0 发旧基础型（0~4，激光除外）、0 发错皮肤（id ≥5 但不在映射表）；无 console 报错。4 张熔岩卡（EX-芙2/4/7/9）在 `lava.js` 修复后全部通过；`cross` 修复后 3 张交叉卡（EX-雷2、EX-芙3、EX-芙6）在默认 `patternIdx=0` 下分别观测到 394 / 205 / 390 发对应皮肤。

### 3.1 延迟弹回归（3 张主线卡）

`boss.js` 在 `_processLater` 前后恢复 `bullets.skinMap`（当前 `boss.js:2020-2024`）后，对原问题 1 的 3 张卡重跑：

| 符卡 | 修复前直方图 | 修复后直方图 | 结论 |
| --- | --- | --- | --- |
| 3-3 冻符「完美冻结」 | `{"9":32,"1":21}` | `{"9":51}`，legacy=[] | 通过 |
| 5M-2 人鬼「未来永劫斩」 | `{"1":24,"22":18}` | `{"22":48}`，legacy=[] | 通过 |
| 6-8 神宝「蓬莱的玉枝 -梦色之乡-」 | `{"20":81,"3":12}` | `{"20":83}`，legacy=[] | 通过 |

复跑命令：

```bash
SHOT_PORT=9385 node tools/_card_shot.mjs tools/_shots/card_cirno_2.png 3 2 300
SHOT_PORT=9386 node tools/_card_shot.mjs tools/_shots/card_youmu_1.png 5m 1 300
SHOT_PORT=9387 node tools/_card_shot.mjs tools/_shots/card_kaguya_7.png 6 7 300
```

回归后这 3 张卡的截图与 `tools/_shots/logs/card_*.json` 已用回归结果覆盖，与 `regress_*.out` 内容一致。

### 3.2 首批 cross 卡的交叉验证（修复前）

`cross` 分支缺失期间，为保证皮肤本身可验收，曾用 `patternIdx=1` 绕开首招：EX-雷2 `hist{"5":772}`、EX-芙3 `hist{"24":294}`、EX-芙6 `hist{"26":31}`，均无 legacy/fatal；结论是皮肤映射正常，问题在 pattern 实现，见问题 5。修复后已用默认 `patternIdx=0` 覆盖截图与日志。

## 4. 问题清单

### 问题 1（已修复并回归）：延迟弹幕未套专属皮肤

- **现象（修复前）**：3 张卡的弹幕里混有旧冰晶家族弹型，与专属弹型同屏：
  - 3-3 冻符「完美冻结」：小冰块(9) 32 发 + 冰棱(1) 21 发
  - 5M-2 人鬼「未来永劫斩」：刀斩(22) 18 发 + 冰棱(1) 24 发
  - 6-8 神宝「蓬莱的玉枝 -梦色之乡-」：玉枝(20) 81 发 + 雪花(3) 12 发
- **根因**：`_scheduleLater` 排队的延迟回调由 `_processLater` 在同一帧稍后执行，原实现只在 `firePattern` 的同步窗口内设置 `b.skinMap` 并在 `finally` 清空，延迟回调 `spawn` 时映射已失效，弹保持旧 type。
- **修复（Lead，`boss.js`）**：`firePattern` 无条件设置 `b.skinMap`（当前 `boss.js:216`），结束后在 `finally` 清空（`boss.js:642`）；`_processLater` 调用前后临时恢复 `bullets.skinMap`（`boss.js:2020-2024`）。
- **回归验证（已通过）**：重跑 3 卡，旧 type 全部消失 ——
  - 3-3：`hist {"9":51}`、legacy=[]、fatal=[]
  - 5M-2：`hist {"22":48}`、legacy=[]、fatal=[]
  - 6-8：`hist {"20":83}`、legacy=[]、fatal=[]
- **复跑命令**：

```bash
SHOT_PORT=9385 node tools/_card_shot.mjs tools/_shots/card_cirno_2.png 3 2 300
SHOT_PORT=9386 node tools/_card_shot.mjs tools/_shots/card_youmu_1.png 5m 1 300
SHOT_PORT=9387 node tools/_card_shot.mjs tools/_shots/card_kaguya_7.png 6 7 300
```

结论：**已修复**；`skinMap` 只改 `type`，未动 `n/speed/rate/spread/angle/turn/spin/radius` 等弹道参数。

### 问题 2（测试环境已规避，非 bug）：STG 道中妖精弹污染统计

首轮 4-1 截图中出现 type 0/1 共 174+ 发，确认是 4 面 STG 道中妖精的子弹，不是符卡弹。截图工具已清空并暂停 `stage.stg.enemies`，重跑后 4-1~4-5 的直方图只剩枫叶(10)。正常游戏中道中弹与符卡弹同屏属正常玩法，不算符卡皮肤问题。

### 问题 3（说明）：`map` 型在招牌 variant 中未必出现

2-3、5-3、5-6 的 `map` 型（小虫 / 樱花）位于该卡其它 variant，本次前 5 秒招牌 pattern 内只观测到萤火虫(7) / 樱瓣(12) / 樱花(11)。这不影响卡面专属弹型成立；若需要逐 variant 全覆盖，可用截图工具第 9 参 `patternIdx=1..3` 再统计。

### 问题 4（说明）：5M-1 声明刀斩、实测太刀

`cardSkins.js` 对 5M-1 的规则是 `skin=22 (刀斩)`、`map[1]=21 (太刀)`；该卡主弹 spawn 的是 type 1，经映射后就是太刀(21)，因此截图中是太刀而不是刀斩，属映射预期。

### 问题 5（非皮肤 bug，已修复）：内置 cross pattern 缺实现分支

- **现象**：EX-雷2、EX-芙3、EX-芙6 的首个招牌 pattern 都是 `cross`；强制该 pattern 步进 300 帧后 `activeCount=0`、`hist {}`，无 console fatal，截图空场。
- **影响面**：主线 3-3、4-2、6-3 的 `BOSS_DEFS` 也写了 `cross`，但被 `bossPatternDesigns` 覆盖，实际不受影响；只有 EXTRA 这 3 张按 `BOSS_DEFS` 走。
- **根因**：`boss.js:96` 的 `firePattern` 分发链覆盖 ring/fan/spray/bloom/... 但没有 `cross` 分支；`boss.js:159` 注释与 BOSS_DEFS 均把 cross 当合法 pattern。
- **修复（Lead，`boss.js`）**：在 spray 与 bloom 之间补 `cross` 多向扇实现，`node --check` 通过。
- **回归验证（已通过）**：默认 `patternIdx=0` 重跑，均命中对应皮肤且截图已覆盖为修复版 ——
  - EX-雷2：`hist {"5":394}`、activePattern=cross
  - EX-芙3：`hist {"26":205}`
  - EX-芙6：`hist {"26":390}`
- **复跑命令**：

```bash
SHOT_PORT=9388 node tools/_card_shot.mjs tools/_shots/card_remilia_1.png extra-mid 1 300 1280 720
SHOT_PORT=9389 node tools/_card_shot.mjs tools/_shots/card_flandre_2.png extra 2 300 1280 720
SHOT_PORT=9390 node tools/_card_shot.mjs tools/_shots/card_flandre_5.png extra 5 300 1280 720
```

结论：**已修复**；皮肤映射本身无问题（修复前 `patternIdx=1` 已交叉验证，见 3.2）。

### 问题 6（已修复）：`lava.js` 热核参数类型错误导致渲染崩溃

- **现象**：EX-芙2/4/7/9 首轮必现 ——

```
TypeError: Cannot read properties of undefined (reading '0')
    at rgba (_lib.js:75)
    at hotCore (_lib.js:287)
    at build (lava.js:72)
```

  截图流程中断，4 张熔岩卡无法验收。
- **根因**：`lava.js:72` 调用 `hotCore(g, S*0.26, [颜色数组], 0.9)`，而 `hotCore` 第 3 参应为选项对象 `{ hot: ... }`；`_lib.js:287` 读 `opts.hot[0]` 时对颜色数组取不到 `.hot`，遂为 `undefined[0]`。
- **修复（art-flandre-ex，`lava.js:72`；QA 报障、Lead 转达）**：改为 `hotCore(g, S*0.26, { hot: mix(LAVA, WHITE, 0.5) }, 0.9)`。
- **回归验证（已通过）**：重跑 4 卡，`hist` 分别 `{"27":18}`、`{"27":370}`、`{"27":691}`、`{"27":31}`；fatal=[]、legacy=[]，截图正常。
- **复跑命令**：

```bash
SHOT_PORT=9391 node tools/_card_shot.mjs tools/_shots/card_flandre_1.png extra 1 300 1280 720
SHOT_PORT=9392 node tools/_card_shot.mjs tools/_shots/card_flandre_3.png extra 3 300 1280 720
SHOT_PORT=9393 node tools/_card_shot.mjs tools/_shots/card_flandre_6.png extra 6 300 1280 720
SHOT_PORT=9394 node tools/_card_shot.mjs tools/_shots/card_flandre_8.png extra 8 300 1280 720
```

结论：**已修复**；属 `_lib` 调用契约误用，不是熔岩弹型设计问题。

## 5. 产物

- 截图工具：`tools/_card_shot.mjs`（第 9 参 `patternIdx` 可切换招牌 pattern）
- 43 张逐卡截图：`tools/_shots/card_<boss>_<i>.png`（主线 31 + EXTRA 12）
- 日志：主线 `tools/_shots/logs/card_<boss>_<i>.json`（含完整直方图）；EXTRA 与回归 `tools/_shots/logs/*.out`（末行 `CARD_SHOT_RESULT`）
- 总览图：`tools/_shots/skin_overview.png`（主线 8 卡）、`tools/_shots/extra_overview.png`（EXTRA 8 卡）
- 拼接脚本：`tools/_shots/_make_overview.py`、`tools/_shots/_make_extra_overview.py`
- 汇总数据：`tools/_shots/_qa_data.json`；一键复跑：`tools/_shots/_run_extra.sh`、`tools/_shots/_run_regress.sh`

## 6. 结论

主线 31 张 + EXTRA 12 张 = **43 张符卡全部通过**：每张卡都能在实战渲染帧中看到本角色专属弹型，大弹/小弹层次正常，控制台零报错；43 卡合计采样 7436 发（主线 3123 + EXTRA 4313），**0 发旧基础型（激光除外）、0 发错皮肤**。

验收期间发现并修复 3 个问题，均已回归通过：延迟弹幕未套皮肤（问题 1，`boss.js` skinMap 恢复）、内置 `cross` pattern 缺失（问题 5，`boss.js` 补实现）、`lava.js` 热核参数崩溃（问题 6）。问题 2/3/4 为测试环境或映射预期说明，非缺陷。

结论：**弹型皮肤系统验收通过，可合并。**

## 7. 最终美术版本复跑（Lead）

art-remilia-ex（血蝠 24 / 血枪 25）与 art-flandre-ex（血水晶 26 / 熔岩 27）在 QA 首轮之后又做了对比度打磨（各 9 / 6 轮迭代，只改 `bat.js` `spear.js` `crystal.js` `lava.js`，ext 与编号未变）。Lead 用同一套 `tools/_shots/_run_extra.sh` 重跑 EXTRA 12 卡（CDP 9372~9383，1280×720）：

- 12/12 exit=0，`pass":true` 全通过；`card_remilia_0..1.png`、`card_flandre_0..9.png` 已覆盖为最终美术版本；
- `tools/_shots/extra_overview.png` 已用新截图重新拼接；
- 最终弹型预览：`tools/_shots/art-remilia_final.png`、`tools/_shots/art-flandre_final.png`（含 ×3 / r9 / r7 / r5 / 混色 / 弹幕墙）。

结论：美术终版不影响映射与判定，43/43 结论保持有效。
## 8. 「禁忌『四重存在』」人物四重存在（Lead，2026-10-24）

需求：本卡不只是换弹型，还要在人物层面真正「四重存在」——本体之外 3 个芙兰同屏，且四个人都会发射弹幕。

实现（`src/game/boss.js`，只作用于 flandre 卡 index 2）：

- `_syncClones()`：仅当 `key==='flandre' && spellIdx===2 && state==='battle'` 时创建/维持 3 个纯幻影分身（不吃伤害、不碰撞、不进 HP 结算），偏移带缩放以错开远近：`{dx:-300,dy:58,alpha:0.80,scale:0.94}`、`{dx:-150,dy:-46,alpha:0.72,scale:0.92}`、`{dx:158,dy:42,alpha:0.64,scale:0.90}`（阵型刻意错开高度/远近，四个立绘都很大，纯一字排开会糊成一团）；换卡或败退立即置空。
- `_fireClonePatterns()`：本体每拍 `firePattern` 之后，**每 3 拍**（`this.volleys % 3 === 0`）由一个分身接拍开火，三个分身按 `_cloneTurn` 轮转（本体每一拍都开火）；开火时临时把本体坐标挪到该分身位置、`pressure*0.45`、`speedCap*0.85`，复用同一 `firePattern` 派发（`_cloneDispatching` 防重入、`bulletBudget` 上限保护，finally 还原坐标/压力/弹速）。**减密原因**：三个分身齐射时花瓣变招实测 645 发、把屏铺满，用户反馈「太密了」；改为单分身每 3 拍轮转后，花瓣 569 发、cross 171 发，已回到原卡密度量级（无分身基线：花瓣 365、cross 194）。弹道/配色/专属弹型与本体同源，因此分身弹也自动套 B_CRYSTAL / B_BAT。
- `_drawClones()`：在 `Boss.draw` 已 translate 的上下文内按相对偏移绘制，画在本体之下；每个分身带 `accent` 猩红柔光、相位差浮动与各自缩放（0.94/0.92/0.90），画在本体之下以拉开层次。

验证（headless Edge 1280×720，`tools/_card_shot.mjs`，2026-10-24 减密后终版）：

```bash
# cross（招牌首招，每 3 拍轮转单分身）
SHOT_PORT=9412 node tools/_card_shot.mjs tools/_shots/card_flandre_2_cross6.png extra 2 300
# petal（花瓣，原本密度最高的变招）
SHOT_PORT=9411 node tools/_card_shot.mjs tools/_shots/card_flandre_2_petal6.png extra 2 300 1280 720 "" 1
# 下一张卡（验证分身收场）
SHOT_PORT=9392 node tools/_card_shot.mjs tools/_shots/card_flandre_3.png extra 3 300
# 其余卡回归（中途雷米莉亚）
SHOT_PORT=9393 node tools/_card_shot.mjs tools/_shots/card_remilia_0_regress.png extra-mid 0 300
```

密度实测（同一工具、300 帧，petal 取 patternIdx 1）：

| 方案 | petal 发数 | cross 发数 |
| --- | --- | --- |
| 无分身基线 | 365 | 194（240 帧） |
| 三分身隔拍齐射（用户看到的第一版） | 645 | 334 |
| 单分身每拍轮转 | 601 | 325 |
| 单分身每 2 拍轮转 | 539 | 263 |
| **终版：单分身每 3 拍轮转、pressure .45** | **569 / 381** | **171 / 196** |

- 四重存在卡（cross，终版）：`pass:true`，`hist {"26":171}`、`consoleIssues []`、`fatal []`；截图 `card_flandre_2_cross6.png` 可见 4 个芙兰按高/低/远/近错落站位，本体与最右分身脚下各有自己的弹流，证明分身确实在开火。
- 四重存在卡（petal，终版）：`pass:true`，`hist {"24":569}`（花瓣全为血蝠）。petal 计数随变招/走位方差较大（同参数复跑 381 / 569），但相较第一版 645 已明显退密、接近原卡基线 365；画面中四个芙兰不再被弹幕糊住。
- 下一张卡（4/10 秘弹）：`pass:true`，`hist {"27":314}`，画面只有 1 个芙兰 → 分身随卡结束正确消失，未外溢。
- 中途雷米莉亚 0 卡回归：`pass:true`，`hist {"24":55}`，无分身、零报错 → 其余 42 卡不受影响。

结论：**人物四重存在 + 四个芙兰都会发射弹幕、且密度已按「太密了」反馈压低到原卡量级，实机验证通过**；纯幻影不影响判定与 HP 结算，卡结束自动收场。截图：`tools/_shots/card_flandre_2_cross6.png`（四重存在·cross）、`tools/_shots/card_flandre_2_petal6.png`（四重存在·petal）、`tools/_shots/card_flandre_3.png`（下一卡恢复单人）。
