# 现有剧情结构审计 —「不落的春天」剧情插槽地图

> 目的：整条剧情即将换成新故事。本文件只回答一个问题——**哪些文字可以随便换，哪些是被系统 / 资源 / 存档锁死的硬结构**。
> 审计方式：只读源码与文档，不改任何游戏文件。行号基于当前工作区快照；`行号 = 脚本数组第一条台词的起始行`（同一段落两条线共用时以首现为准）。
> 统计口径：`字` 为 `text` 字段的字符数（不含代码块、不含 `tips`）。数据由 `.dsh-ops/audit_raw.json` 解析得出。

## 结论摘要

- **剧情层是纯数据**：主线 + EXTRA 全部是 `src/game/story.js` 里的对象；结局是 `src/game/endings.js` 里的对象。换剧情不需要动引擎，只需要「按同样的键名交出新 JSON」。
- **真正锁死的只有四类**：① 槽位键名与段数（每面每线 `intro / mid[0] / mid[1] / preBoss / postBoss`，26% / 55% 两个触发点）；② 结局对象结构（固定 3 个 `shots`、`noLabel` 的 `W` 前缀、`code / kindLabel / quote` 显示位）；③ 资源 key（`bg` / `cast.key` / `still` / `mote` / `glow` / 立绘 key）；④ 音乐 key 与解锁判定（`hks.progress.v1`、`hks.music.v1`）。
- **文本总量**：主线 + EXTRA **70 段 / 871 条 / 11,664 字**；结局 **6 份 / 193 条 / 2,764 字**；音乐室解说 **19 段 ≈ 2,518 字**。合计约 **1.7 万字**；加上 README 故事/结局/音乐室章节与 `docs/` 设定文档，全量重写约 **2 万字**。

---

## 1. 关卡与剧情插槽表

### 1.1 六面 + Extra 总表

| 面 | 关卡 id | 关卡名 · 主题 | 模式 | Boss | 中间 Boss | 道中纯跑图 | gen.cols | levels.js | story.js 起始 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `stage1` | 博丽神社 · 黄昏樱花（`shrine`） | 平台 | `rumia` 露米娅 | — | 3:00 | 600 | `src/assets/levels.js:54-66` | `src/game/story.js:69` |
| 2 | `stage2` | 魔法森林 · 萤火夜雾（`forest`） | 平台 | `wriggle` 莉格露 | — | 3:30 | 755 | `src/assets/levels.js:67-79` | `src/game/story.js:213` |
| 3 | `stage3` | 雾之湖 · 冰蓝晨曦（`lake`） | 平台 | `cirno` 琪露诺 | — | 4:00 | 871 | `src/assets/levels.js:80-92` | `src/game/story.js:359` |
| 4 | `stage4` | 妖怪之山 · 瀑布溪谷（`mountain`） | 飞行（`stg`） | `aya` 射命丸文 | — | 4:30 | 497 | `src/assets/levels.js:93-105` | `src/game/story.js:534` |
| 5 | `stage5` | 白玉楼 · 冥界花海（`nether`） | 平台 | `yuyuko` 西行寺幽幽子 | **`youmu` 魂魄妖梦** | 5:00 | 1170 | `src/assets/levels.js:106-125` | `src/game/story.js:680` |
| 6 | `stage6` | 月都 · 永远亭（`moon`） | 平台 | `kaguya` 蓬莱山辉夜 | — | 5:30 | 1324 | `src/assets/levels.js:126-138` | `src/game/story.js:909` |
| EX | `extra` | 红魔馆地下 · 血月水晶（`mansion`） | 飞行（`stg`） | `flandre` 芙兰朵露 | **`remilia` 雷米莉亚（3:00）** | 6:00 道中 + 中途战 | 1900 | `src/assets/levels.js:139-157` | `src/game/story.js:1056` |

- 关卡数量与顺序 = `LEVELS` 数组顺序（`src/assets/levels.js:53`），主线取 `LEVELS.filter(!extra)`（`src/main.js:32`），剧情键名由 `STAGE_KEY(i)` 拼成 `stage${i+1}`（`src/main.js:34`）。
- 道中时长：3:00 起逐面 +0:30（`src/assets/levels.js:6-8`）。EXTRA 走独立时间轴（见 §4）。
- 每面每线固定 5 个剧情槽位：`intro / mid[0] / mid[1] / preBoss / postBoss`，约定写在 `src/game/story.js:21-22`。

### 1.2 每个槽位的行号 · 条数 · 字数

**STAGE 1（`src/game/story.js:69`）**

| 槽位 | 灵梦 行/条/字 | 魔理沙 行/条/字 |
|---|---|---|
| `intro` | `:72` 6 / 117 | `:141` 7 / 111 |
| `mid[0]` | `:81` 9 / 158 | `:151` 12 / 169 |
| `mid[1]` | `:92` 10 / 113 | `:165` 9 / 127 |
| `preBoss` | `:105` 15 / 163 | `:177` 14 / 189 |
| `postBoss` | `:122` 15 / 219 | `:193` 15 / 200 |
| 小计 | 55 条 / 770 字 | 57 条 / 796 字 |

**STAGE 2（`:213`）**

| 槽位 | 灵梦 | 魔理沙 |
|---|---|---|
| `intro` | `:216` 5 / 95 | `:284` 6 / 99 |
| `mid[0]` | `:224` 13 / 180 | `:293` 12 / 157 |
| `mid[1]` | `:239` 10 / 136 | `:307` 12 / 112 |
| `preBoss` | `:252` 11 / 136 | `:322` 11 / 145 |
| `postBoss` | `:265` 15 / 215 | `:335` 19 / 248 |
| 小计 | 54 / 762 | 60 / 761 |

**STAGE 3（`:359`）**

| 槽位 | 灵梦 | 魔理沙 |
|---|---|---|
| `intro` | `:362` 5 / 86 | `:442` 9 / 104 |
| `mid[0]` | `:370` 13 / 169 | `:454` 13 / 155 |
| `mid[1]` | `:385` 15 / 196 | `:469` 19 / 210 |
| `preBoss` | `:403` 14 / 166 | `:491` 18 / 201 |
| `postBoss` | `:419` 19 / 239 | `:511` 18 / 214 |
| 小计 | 66 / 856 | 77 / 884 |

**STAGE 4（`:534`，飞行关）**

| 槽位 | 灵梦 | 魔理沙 |
|---|---|---|
| `intro` | `:537` 3 / 70 | `:605` 4 / 72 |
| `mid[0]` | `:543` 9 / 138 | `:612` 8 / 119 |
| `mid[1]` | `:554` 12 / 204 | `:622` 14 / 185 |
| `preBoss` | `:569` 12 / 140 | `:639` 13 / 134 |
| `postBoss` | `:583` 18 / 239 | `:654` 21 / 285 |
| 小计 | 54 / 791 | 60 / 795 |

**STAGE 5（`:680`）** — 幽幽子前多一段妖梦守门战

| 槽位 | 灵梦 | 魔理沙 |
|---|---|---|
| `intro` | `:683` 4 / 77 | `:758` 5 / 80 |
| `mid[0]` | `:690` 13 / 159 | `:766` 11 / 114 |
| `mid[1]` | `:705` 17 / 186 | `:779` 19 / 174 |
| `preBoss` | `:725` 12 / 137 | `:801` 15 / 155 |
| `postBoss` | `:739` 15 / 210 | `:818` 22 / 223 |
| **`youmuPre`（公共）** | `:847` **33 / 546** | 同左（不分线） |
| **`youmuPost`（公共）** | `:882` **23 / 361** | 同左（不分线） |
| 小计 | 61 / 769 + 56 / 907 | 72 / 746 + 56 / 907 |

> 妖梦两段挂在**关卡层级**（`STORY.stages.stage5.youmuPre/youmuPost`），不在 `reimu/marisa` 之下；取用走 `midbossStoryFor()`（`src/game/story.js:1177-1185`），缺失返回 `[]`。

**STAGE 6（`:909`）**

| 槽位 | 灵梦 | 魔理沙 |
|---|---|---|
| `intro` | `:912` 4 / 78 | `:981` 6 / 82 |
| `mid[0]` | `:919` 8 / 123 | `:990` 8 / 120 |
| `mid[1]` | `:929` 17 / 170 | `:1000` 13 / 139 |
| `preBoss` | `:949` 9 / 88 | `:1016` 9 / 84 |
| `postBoss` | `:960` 17 / 209 | `:1027` 21 / 261 |
| 小计 | 55 / 668 | 57 / 686 |

**EXTRA（`:1056`）**

| 槽位 | 灵梦 | 魔理沙 | 触发 |
|---|---|---|---|
| `extra.intro` | `:1059` 12 / 186 | `:1073` 12 / 184 | 标题选「禁忌的祭典」后（`src/main.js:888`） |
| `extra.midBoss` | `:1088` 10 / 226 | 同左（不分线） | 3:00 雷米莉亚战前 |
| `extra.midBossOut` | `:1100` 8 / 113 | 同左（不分线） | 雷米莉亚击破后 |
| `extra.postBoss` | `:1111` 10 / 132 | `:1123` 10 / 101 | 芙兰击破后 → W1 / W2 |

**开场与杂项**

| 槽位 | 行号 | 条 / 字 | 触发 |
|---|---|---|---|
| `opening.reimu` | `src/game/story.js:34` | 13 / 280 | 首页「开始游戏」→ `startGame()`（`src/main.js:865-870`） |
| `opening.marisa` | `src/game/story.js:49` | 12 / 251 | 同上 |
| `tips`（3 条） | `src/game/story.js:1139` | 操作提示，非剧情 | 关卡开局提示 |

### 1.3 触发点（改剧情时最需要对齐的 6 个位置）

| 触发 | 代码位置 | 机制 |
|---|---|---|
| 开场 | `src/main.js:865-870` | `openingFor(char)` → 播完才 `startStage(0)` |
| 道中 26% / 55% | `src/main.js:1468-1489`（阈值 `[0.26, 0.55]` 在 `:1475`，调用点 `:1636`） | 进度 = 玩家中心 `x / level.w`（平台）或 `scroll / bossTriggerScroll`（飞行），`_storyProgress()` 在 `src/main.js:1452-1462`。每节点只播一次（`_midShown`）；**EXTRA 直接跳过**（`:1470`） |
| Boss 前 | `src/main.js:1213-1237` | 中途 Boss 播 `midbossPreFor` / `STORY.extra.midBoss`；关底播 `stageStoryFor(...).preBoss` |
| 中途 Boss 后 | `src/main.js:1174-1197` | 播 `midbossPostFor` 或 `STORY.extra.midBossOut`（延迟 1.8s） |
| Boss 后 | `src/main.js:1275-1301` | `postBoss` / `extra.postBoss`，横幅 1.8s 后播，再进下一关 |
| 结局 | `src/main.js:1316-1334` → `_playEnding()` `:1341-1357` | 见 §3 |

---

## 2. 角色出场表

### 2.1 名表与立绘资源

| key | `CHAR_NAMES`（`src/game/dialogue.js:112-126`） | AI 对话立绘（`AI_PORTRAITS`，`:16-28`） | Boss 战斗立绘（`src/art/genboss.js:16` `KEYS` / `BOSS_H` `:20-33`） | 出场面 | 说话脚本 | Boss 弹幕套件（`src/game/boss.js`） |
|---|---|---|---|---|---|---|
| `reimu` | 博丽灵梦 | `reimu.png` | —（自机） | 全 7 关 + 全部结局 | 开场、每面全部槽位、结局 | — |
| `marisa` | 雾雨魔理沙 | `marisa.png` | —（自机） | 全 7 关 + 全部结局 | 同上 | — |
| `rumia` | 露米娅 | `rumia.png` | `rumia` / 242 | 1 面 | stage1 `mid[0]` `mid[1]` `preBoss` `postBoss` | `:580` 2 卡：宵暗「月之暗面」/ 暗符「黑暗吞噬」 |
| `wriggle` | 莉格露·奈特巴格 | `wriggle.png` | `wriggle` / 254 | 2 面 | stage2 `mid[0]` `mid[1]` `preBoss` `postBoss` | `:602` 3 卡：灯符「萤火虫现象」/ 蠢符「小虫风暴」/ 隐虫「萤火虫之夜」 |
| `cirno` | 琪露诺 | `cirno.png` | `cirno` / 250 | 3 面 | stage3 `mid[0]` `mid[1]` `preBoss` `postBoss` | `:634` 4 卡：冰符「冰柱落下」/ 雹符「冰雹风暴」/ 冻符「完美冻结」/ 雪符「钻石风暴」 |
| `aya` | 射命丸文 | `aya.png` | `aya` / 244 | 4 面（飞行关） | stage4 `mid[0]` `mid[1]` `preBoss` `postBoss` | `:673` 5 卡：风符「风神一扇」/ 疾风「风神少女」/ 岐符「天之八衢」/ 风神「天狗颪」/「幻想风靡」 |
| `yuyuko` | 西行寺幽幽子 | `yuyuko.png` | `yuyuko` / 236 | 5 面 | stage5 `mid[0]` `mid[1]` `preBoss` `postBoss` | `:768` 6 卡：幽雅「死出诱蛾灯」/ 蝶符「花之舞」/ 蝶符「死蝶之华尔兹」/ 亡乡「亡我乡 -宿罪-」/ 冥符「常夜樱」/ 反魂蝶「八分咲」 |
| `youmu` | 魂魄妖梦 | `youmu.png` | `youmu` / 238 | 5 面中途 | `stage5.youmuPre` / `youmuPost`（不分线） | `:722` 3 卡：人符「现世斩」/ 人鬼「未来永劫斩」/ 断灵「剑楼阁」 |
| `kaguya` | 蓬莱山辉夜 | `kaguya.png` | `kaguya` / 238 | 6 面 | stage6 `mid[0]` `mid[1]` `preBoss` `postBoss` | `:820` 8 卡：龙颈之玉 / 耀眼的龙玉 / 佛御石之钵 / 佛体的金刚石 / 火鼠的皮衣 / 火蜥蜴之盾 / 燕的子安贝 / 蓬莱的玉枝 |
| `flandre` | 芙兰朵露·斯卡雷特 | `flandre.png` | `flandre` / 256 | EXTRA 终盘 + 结局 | `extra.postBoss`、ED02 / ED04 / W1 / W2 | `:915` **10 卡**（禁忌「蔓越莓陷阱」→最终「永不结束的祭典」） |
| `remilia` | 雷米莉亚·斯卡雷特 | `remilia.png` | `remilia` / 236 | EXTRA 3:00 中途 + 结局 | `extra.midBoss`、`extra.midBossOut`、W1 / W2 | `:890` 2 卡：咒诅「弗拉德·特佩斯」/ 天罚「大卫之星」 |
| `sakuya` | 十六夜咲夜 | 无 | 无 | **未使用**（仅名表占位） | — | — |
| `unknown` | ？？？ | 无 | 无 | 未使用 | — | — |

- 对话里 `who` 用 `'player'` / `'partner'` / `'narrator'` 三种逻辑角色，由 `dialogue.js` 替换成当前自机与搭档；`narrator` 不显示立绘（`src/game/story.js:4-9`）。
- 对话立绘路径 `src/art/gen/<key>.png`（`src/game/dialogue.js:29`），战斗立绘 `src/art/gen/boss/<key>.png`（`src/art/genboss.js:15-16`）；缺图不报错，只铺柔光。
- `mood` 枚举：`normal / smile / angry / sad / smug / panic`（`src/game/story.js:9`）。
- 角色名册另有一份 `BOSS_INFO`（名 / 称号 / 主色 / theme）在 `src/art/roster.js:18-29`；改名或换 Boss 必须三处同步（`roster.js`、`boss.js` `BOSS_DEFS`、`genboss.js` `KEYS`）。

---

## 3. 结局系统

### 3.1 判定链（全部在 `src/main.js`）

1. 难度配置：`E` 只有 5 面（`stageCount: 5`，`src/game/difficulty.js:41`）且不解锁 EXTRA（`unlockExtra: false`，`:42`）；`N/H/L` 6 面且可解锁（`:64-139`）；EX 是隐藏档（`:148-176`，不进难度菜单）。
2. 通关第 5/6 面后进 `_onAllCleared()`（`src/main.js:1316-1335`）：
   `const good = !this.inExtra && diff.unlockExtra && this.continues === 0;`（`:1322`）
3. 续命计数：游戏结束后选择「再战 Boss / 重新挑战本关」时 `continues += 1`（`:1420`）；暂停菜单的「重新开始本关」不计入（README.md:53）。
4. 真结局才能解锁 EXTRA：`unlockedExtra = true`、`extraChar = char` 并写档（`:1326-1332`）；此后打遗憾结局不会锁回。
5. 结局取本：`_playEnding(mode)`（`:1341-1357`）→ `endingFor(char, mode)`（`src/game/endings.js:490-496`）；EXTRA 胜利传 `'extra'`（`:1334`）。
6. 结局音乐：`mode === 'extra' ? 'endingW' : 'ending'`（`:1352`）。

**判定结果矩阵**

| 情形 | 结局 |
|---|---|
| E 难度通关（任意方式，含续命） | `ed1`（灵梦）/ `ed3`（魔理沙）遗憾 |
| N/H/L 通关，用过续命 | `ed1` / `ed3` 遗憾 |
| N/H/L 通关，一次续命都没用 | `ed2`（灵梦）/ `ed4`（魔理沙）真结局，并解锁 EXTRA |
| 通关 EXTRA（不看续命） | `edW1`（灵梦）/ `edW2`（魔理沙） |

### 3.2 六份结局档案

| 结局 | key | 行号 | `code` / `noLabel` / `kindLabel` | 标题 / 英文 | 主题句 | 结构 | 规模 |
|---|---|---|---|---|---|---|---|
| 灵梦 · 遗憾 | `ed1` | `src/game/endings.js:19`（shots `:33`） | ENDING 01 / END 01 / REGRET ENDING | 不落之春 / The Spring That Never Fell | 「我结束了异变。只是没有结束任何人的等待。」 | 3 shots | 36 条 / 469 字 |
| 灵梦 · 真 | `ed2` | `:97`（shots `:111`） | ENDING 02 / END 02 / TRUE ENDING | 春之尽头 / At the End of Spring | 「原来结束不是把门关上。是替谁把门留着。」 | 3 shots | 32 / 493 |
| 魔理沙 · 遗憾 | `ed3` | `:178`（shots `:192`） | ENDING 03 / END 03 / REGRET ENDING | 借来的春天 / A Spring That Was Only Borrowed | 「我借来了春天，却不知道该还给谁。」 | 3 shots | 36 / 453 |
| 魔理沙 · 真 | `ed4` | `:256`（shots `:270`） | ENDING 04 / END 04 / TRUE ENDING | 还给春天的东西 / What Was Returned to Spring | 「这一次，我没有借。我把春天，还给了它一直在等的人。」 | 3 shots | 31 / 488 |
| EXTRA·灵梦 | `edW1` | `:333`（shots `:347`） | EXTRA ENDING · W1 / W1 / W ENDING | 迟到的祭典 / A Festival, Four Hundred Ninety-Five Years Late | 「四百九十五年很长。可是今晚的灯，是替她亮的。」 | 3 shots | 27 / 404 |
| EXTRA·魔理沙 | `edW2` | `:410`（shots `:424`） | EXTRA ENDING · W2 / W2 / W ENDING | 第一次送人的宝贝 / The First Treasure I Ever Gave Away | 「送出去的东西，才是最好的收藏。」 | 3 shots | 31 / 457 |

**每份结局的字段结构**（`src/game/endings.js:490` 之前每个对象）：

```
key / char / charName / code / noLabel / kindLabel / title / titleCn / en / quote /
still / glow / mote / shots: [ { bg, cast: [{ key, x, h }], lines: [{ who, text }] } × 3 ]
```

- `still`：结局卡阶段的背景（`src/game/ending.js:372`）；`glow` 是 `"r,g,b"` 字符串，直接拼进 `rgba()`（`:403-404`）；`mote` 是粒子类型（花瓣 / 星 / ember，`:385`）。
- `noLabel` 以 `W` 开头会加 `is-w` 样式（`src/game/ending.js:136`）——**W1/W2 前缀是硬约束**。
- 卡片显示位：`noLabel` → 编号、`kindLabel` → 类型、`charName · code` → 署名、`quote` → 主题句（`src/game/ending.js:317-323`）。
- `cast.key` 决定立绘，`x` 是横向站位（0–1），`h` 是显示高度（440–500 左右）；`bg` 必须在背景资源里存在（预加载见 `src/game/ending.js:96-97`）。
- 结局总量：**6 份 × 3 shots = 18 个镜头 / 193 条台词 / 2,764 字**。

---

## 4. Extra 结构

### 4.1 时间轴与战斗

| 时间 | 段落 | 内容 | 依据 |
|---|---|---|---|
| 0:00–3:00 | 道中 A | 零火力起手，敌机波次铺到 3 分钟 | `src/game/stage.js:33` |
| 3:00 | 中途 Boss | **雷米莉亚**，2 张符卡（咒诅「弗拉德·特佩斯」/ 天罚「大卫之星」），不打通进不去 | `src/game/stage.js:34`、`src/game/boss.js:890-913` |
| 3:00–6:00 | 道中 B | 击破后继续推进 3 分钟 | `src/game/stage.js:35` |
| 6:00 | 终盘 Boss | **芙兰朵露**，10 张符卡 | `src/game/stage.js:36`、`src/game/boss.js:915` |
| 全程 | Boss 战时长 | 芙兰 27,080 × 1.1 × 1.8 × 0.9 ≈ 48,236 HP，按当前自机输出约 **10 分钟** | `src/game/difficulty.js:155-156` |

- 时间轴常量：`EXTRA_TIMELINE`（`src/game/stage.js:42-47`）——`midbossKey: 'remilia'`（`:43`）、`midbossAt: 180`（`:44`）、`finalAt: 360`（`:45`）、`retryPower: 48`（`:46`）。
- 调度：道中计时只在「可以操作」时推进（Boss 战 / 对话 / 死亡暂停）；到点弹 `pendingBossKey`（`src/game/stage.js:822-839`）；中途 / 终盘再战从对应段落重开并补 48 火力（`:896-904`）。
- 实际节奏：道中合计 6:00，叠上中途战约 2 分钟，到芙兰约 8 分钟，再加约 10 分钟芙兰战（`src/game/stage.js:37-38`）。
- 音乐切换：开场 `ex_pre` → 3:00 中途战 `ex_mid` → 6:00 芙兰 `extra`（`src/assets/levels.js:148-150`；切歌在 `src/main.js:1150-1169`）。
- 关卡长度：`gen.cols: 1900`，`w = 60,800`，滚动上限 `w - 1400 = 59,400px`，正好 360 秒（`src/assets/levels.js:154-156`）。

### 4.2 剧情槽位与专属结局

| 槽位 | 行号 | 条 / 字 | 条件 |
|---|---|---|---|
| `extra.intro`（灵梦 / 魔理沙） | `src/game/story.js:1059` / `:1073` | 12 / 186 · 12 / 184 | 标题页选「禁忌的祭典」后（`src/main.js:888`） |
| `extra.midBoss` | `:1088` | 10 / 226 | 3:00 雷米莉亚出现时 |
| `extra.midBossOut` | `:1100` | 8 / 113 | 雷米莉亚击破后 |
| `extra.postBoss`（灵梦 / 魔理沙） | `:1111` / `:1123` | 10 / 132 · 10 / 101 | 芙兰击破后 → W1 / W2 |

- EXTRA 没有 26% / 55% 道中对话（`src/main.js:1470` 直接 return）。
- 专属结局：`edW1` / `edW2`（`src/game/endings.js:333` / `:410`），由 `endingFor(char, 'extra')` 分流；看的是**通关 EXTRA 时用的自机**，不受续命影响（README.md:55）。
- 解锁与封存：只有真结局写 `unlockedExtra` / `extraChar`（`src/main.js:1326-1332`）；标题页「重置进度」清空并提示「已重置进度 · EXTRA 重新封闭」（`src/main.js:1874-1883`）；已解锁后 EXTRA 按钮常驻（`src/main.js:603-611`）。
- `startExtra()` 会强制使用达成真结局的那位自机，并把火力清零（`src/main.js:873-889`）。

---

## 5. 音乐映射（19 首曲目）

字段约定见 `src/game/musicTracks.js:4-15`：`key / no / title / sub / cat / place / orig / tone / glow / time / note`。**`bpm` 不在曲目表里**，音乐室从 `SONGS` 现取（`src/game/musicRoom.js:49-52`）。

| 编号 | key | 曲名 | 分类 | 对应场景 | 原曲出处 | 曲长 s | 解说行 |
|---|---|---|---|---|---|---|---|
| 01 | `title` | 東方新紀行 ～ Chronicle of Gensokyo | TITLE | 博丽神社 · 黄昏缘侧 | 历代主题曲改编 · 编曲：本作 | 144 | `src/game/musicTracks.js:29` |
| 02 | `pre1` | ほおずきみたいに紅い魂 | STAGE 1 · 道中 | 博丽神社 · 夜樱小径 | 原曲 / ZUN | 84.5 | `:46` |
| 03 | `stage1` | 妖魔夜行 | STAGE 1 | 博丽神社 · 夜樱小径 | 原曲 / ZUN | 39.3 | `:62` |
| 04 | `pre2` | 幻視の夜 ～ Ghostly Eyes | STAGE 2 · 道中 | 魔法森林 · 萤火夜雾 | 原曲 / ZUN | 61.1 | `:78` |
| 05 | `stage2` | 蠢々秋月 ～ Mooned Insect | STAGE 2 | 魔法森林 · 萤火夜雾 | 原曲 / ZUN | 112.6 | `:94` |
| 06 | `pre3` | ルーネイトエルフ | STAGE 3 · 道中 | 雾之湖 · 冰蓝晨曦 | 原曲 / ZUN | 66.7 | `:110` |
| 07 | `stage3` | おてんば恋娘 | STAGE 3 | 雾之湖 · 冰蓝晨曦 | 原曲 / ZUN（含 3 曲拼贴） | 101.7 | `:126` |
| 08 | `pre4` | フォールオブフォール ～ 秋めく滝 | STAGE 4 · 道中 | 妖怪之山 · 瀑布溪谷 | 原曲 / ZUN | 64.8 | `:142` |
| 09 | `stage4` | 風神少女 | STAGE 4 | 妖怪之山 · 瀑布溪谷 | 原曲 / ZUN | 155.8 | `:159` |
| 10 | `pre5` | 広有射怪鳥事 ～ Till When? | STAGE 5 · 道中 | 白玉楼 · 冥界花海 | 原曲 / ZUN | 105.3 | `:175` |
| 11 | `stage5` | 幽雅に咲かせ、墨染の桜 ～ Border of Life | STAGE 5 | 白玉楼 · 冥界花海 | 原曲 / ZUN | 141.1 | `:192` |
| 12 | `pre6` | ヴォヤージュ1970（旅人编） | STAGE 6 · 道中 | 月都 · 永远亭 | 原曲 / ZUN | 77.1 | `:209` |
| 13 | `stage6` | 竹取飛翔 ～ Lunatic Princess | STAGE 6 | 月都 · 永远亭 | 原曲 / ZUN | 151.2 | `:227` |
| 14 | `ex_pre` | ツェペシュの幼き末裔（血月编） | EXTRA · 道中 | 红魔馆地下 · 血月水晶 | 原曲 / ZUN | 55.4 | `:245` |
| 15 | `ex_mid` | 亡き王女の為のセプテット（血月圆舞编） | EXTRA · 中段 | 红魔馆地下 · 血月水晶 | 原曲 / ZUN | 120.8 | `:263` |
| 16 | `extra` | U.N.オーエンは彼女なのか？ | EXTRA | 红魔馆地下 · 血月水晶 | 原曲 / ZUN | 148.6 | `:282` |
| 17 | `gameover` | 失われた道標 | GAME OVER | 无名的路口 | 原创 · 本作 | 33.3 | `:302` |
| 18 | `ending` | 帰り道の夕暮れ | ENDING | 归途 · 黄昏坂道 | 原创 · 本作 | 70 | `:317` |
| 19 | `endingW` | 魔法少女達の百年祭 | EXTRA ENDING | 百年祭 · 八音盒房间 | 原曲 / ZUN · 柔和改编 | 48.6 | `:333` |

- 曲目表顺序 = 游戏流程顺序，也决定音乐室编号（`src/game/musicTracks.js:15`）。
- 音乐室遍历整张 `MUSIC_TRACKS`（`src/game/musicRoom.js:49`），所以**道中曲（pre1–pre6、ex_pre、ex_mid）也进目录**，实际是 19 首。
- 每首的 `note` 都是 100–220 字的第一人称杂谈，**大量剧透角色与剧情**（例如 `:29` 提到灵梦/魔理沙，`:263` 提到「姐姐」，`:282` 提到芙兰），换剧情时必须整段重写，而不是只改曲名。

---

## 6. 改剧情：硬约束清单 vs 自由字段清单

### 6.1 必须保留的槽位（动了就要改代码）

| # | 硬约束 | 依据 |
|---|---|---|
| 1 | **关卡数量与顺序**：主线 6 关 + EXTRA；`LEVELS` 顺序即 Boss 顺序；E 难度只有前 5 面 | `src/assets/levels.js:53-157`、`src/main.js:32-34`、`src/game/difficulty.js:41` |
| 2 | **每面每线 5 个剧情键**：`intro / mid[0] / mid[1] / preBoss / postBoss`；`mid` 必须恰好 2 段（第 3 段起不会被播；`thresholds` 只有 2 个） | `src/game/story.js:21-22`、`src/main.js:1473-1487` |
| 3 | **剧情取词函数与分线回退**：`openingFor / stageStoryFor / extraIntroFor / extraPostFor / midbossStoryFor`；`routeOf()` 把非 `marisa` 一律当 `reimu` | `src/game/story.js:1148-1195` |
| 4 | **角色 key 必须存在于名表与资源**：`who` 只能是 `player / partner / narrator` 或 `CHAR_NAMES` 的 key；说话角色要有对话立绘或接受「无立绘」 | `src/game/story.js:4-9`、`src/game/dialogue.js:112-126` |
| 5 | **5 面中途 Boss 的键名**：`STORY.stages.stage5.youmuPre / youmuPost` 是写死的字段名（`midbossStoryFor` 里 `field = phase === 'post' ? 'youmuPost' : 'youmuPre'`）；换中途 Boss 必须改这里 + `levels.js` 的 `STAGE5_MIDBOSS.key` + `genboss.js` `KEYS` + `roster.js` `BOSS_INFO` + `AI_PORTRAITS` | `src/game/story.js:1177-1185`、`src/assets/levels.js:40-51` |
| 6 | **EXTRA 三个时间点**：0:00 道中 / 3:00 中途 Boss / 6:00 终盘；`midbossKey`、`midbossAt`、`finalAt`、`retryPower` | `src/game/stage.js:42-47` |
| 7 | **结局判定**：`good = !inExtra && diff.unlockExtra && continues === 0`；E 必定遗憾；只有真结局写 `unlockedExtra / extraChar` | `src/main.js:1316-1334`、`src/game/difficulty.js:41-42` |
| 8 | **结局对象结构**：`code / noLabel / kindLabel / title / titleCn / en / quote / still / glow / mote / shots`；固定 3 个 shots；W 结局 `noLabel` 以 `W` 开头 | `src/game/endings.js:19-483`、`src/game/ending.js:136, 317-323` |
| 9 | **结局取本映射**：`ed1/ed2/ed3/ed4/edW1/edW2` 六个键名被 `endingFor` 写死；mode 兼容 `easy→bad`、`main→good` | `src/game/endings.js:490-496` |
| 10 | **音乐 key**：`title / pre1–pre6 / stage1–stage6 / ex_pre / ex_mid / extra / gameover / ending / endingW` 必须与 `SONGS`、`levels.js` 的 `musicPre/music/musicMid`、`main.js:1352` 的结局曲一致；`note/time/place` 是展示层，可改 | `src/game/musicTracks.js:17-338`、`src/game/musicRoom.js:49-52` |
| 11 | **音乐室「未听过显示 ？？？」**：判定挂 `AudioEngine.onSongStart`，记录在 `hks.music.v1`；重置进度不能清它 | `src/game/musicRoom.js:407-446`、`src/main.js:151, 2109-2141`、README.md:117 |
| 12 | **存档字段**：`hks.progress.v1 = { extraUnlocked, extraChar }`；`hks.music.v1 = { heard[] }`；`hks.settings.v1` | `src/main.js:2075-2098, 2109-2141, 2055-2071` |
| 13 | **资源 key 有效**：`bg`（`src/art/gen/bg/<theme>.jpg` 变体数见 `src/game/stage.js:59-64`）、`still`、`mote`、`cast.key`、`glow` 的 `r,g,b` 格式 | `src/game/ending.js:96-97, 317-323, 385, 403-404` |
| 14 | **占位符与 `mood`**：`{me} / {partner} / {self}` 由 dialogue.js 替换；`mood` 只在 6 个枚举内 | `src/game/dialogue.js`、`src/game/story.js:9` |

### 6.2 可以自由改写的文本（不改代码）

- `story.js` 里**所有 `text` 文案**、每条台词的 `who`（在上述枚举内）、`mood`、段落内条数（≥ 0；`mid` 段数必须 2）。
- 各段的选择顺序与内部节奏（先旁白还是先拌嘴）、语气、梗、主题句——只要槽位数量不变。
- `endings.js` 的 `title / titleCn / en / quote`、每 shot 的 `lines` 文案、`cast` 的 `x / h`、`glow` 数值、`mote` 类型（在已有资源类型内）。
- `musicTracks.js` 的 `title / sub / cat / place / orig / tone / glow / time / note`（`key` 不建议改）。
- README 的「故事」「结局」「音乐回忆室」「关卡与 Boss」「Boss 符卡一览」段落，`docs/BOSS_*.md`，以及标题页副标题 `～ Chronicle of Gensokyo ～`（`src/main.js:619-620`）。
- 难度中文别名（`昨日行 / 现在行 / 明日行 / 永夜行`，`src/game/difficulty.js:40,67,93,118`）。

---

## 7. 风险提示：改剧情时最容易漏改的联动点

1. **README 与实际不一致**：README 三处写「11 首」（README.md:25、:26、:105），而 `MUSIC_TRACKS` 实际是 **19 首**（`src/game/musicTracks.js:17-338`，道中曲也进音乐室）。换曲后必须同时修 README，否则文档继续骗人。
2. **音乐室硬编码「11」**：`src/game/musicRoom.js:477` 与 `:518` 直接写死 `11`，而 `:424/:447` 用 `this.tracks.length` 动态计算——曲目数一变，界面就会自相矛盾。这是纯前端文案，但很容易漏。
3. **`musicTracks.note` 是隐藏剧情**：19 段解说都是第一人称杂谈，逐首提到角色关系、场景、甚至结局（`:29`、`:263`、`:282`、`:317`）。只换主线不换解说，音乐室会变成「世界观罗生门」。
4. **结局曲名与 W1/W2 文案**：`ending` 叫《帰り道の夕暮れ》、`endingW` 叫《魔法少女達の百年祭》（`src/game/musicTracks.js:307-337`）；README.md:50-51 的 W1/W2 描述与之呼应。换结局必须同步曲名 / `sub` / README。
5. **标题页文案**：主标题 `東方新紀行` 与副标题 `～ Chronicle of Gensokyo ～` 在 `src/main.js:619-620` 写死；EXTRA 按钮「禁忌的祭典」及锁定提示（`:604-610`）也属于世界观文案。
6. **进度/存档语义**：没有成就系统，但旧存档只有 `extraUnlocked` 与 `extraChar`（`src/main.js:2075-2098`）。如果新剧情改了「真结局」定义，老玩家会带着旧解锁状态直接进新 EXTRA；`extraChar` 还会把 EXTRA 锁死在旧主角上。
7. **双主角对称**：开场 2 段、6 面 × 5 段 × 2 线、EXTRA 4 段 × 2 线，缺一条线不会报错，只会静默回退到灵梦线（`routeOf`，`src/game/story.js:1148-1150`）——表现为「魔理沙说着灵梦的台词」。
8. **26% / 55% 的触发是距离比例**：平台关按 `x / level.w`，飞行关按 `scroll / bossTriggerScroll`（`src/main.js:1452-1462`）。重写时把中段剧情写成「刚出门」或「快到 Boss」的语气，会和实际触发位置不符。
9. **EXTRA 没有道中剧情**：`_maybeMidDialogue` 对 `inExtra` 直接 return（`src/main.js:1470`）。若新 EXTRA 需要道中剧情，必须改代码，而不是加数据。
10. **`docs/BOSS_YOUMU.md` 与 `roster.js` 的过期注释**：`src/art/roster.js:13-15` 仍写「妖梦尚无 AI 立绘」，但 `AI_PORTRAITS` 与 `genboss.js` 的 `KEYS` 都已包含 `youmu`（`src/game/dialogue.js:27`、`src/art/genboss.js:16`）。新剧情若以妖梦为中途 Boss，先修注释，避免后续按错误前提施工。
11. **EXTRA 的空招问题**：`docs/BOSS_CREATIVE_DESIGN.md:117-120` 记录雷米莉亚 / 芙兰仍有 `typeName: 'cross'`，而 `firePattern` 内没有 `cross` 分支——这三招现在是空放（文档引用的 `boss.js:852/880/901` 是旧行号，当前 `cross` 出现在 `:906`、`:934` 等）。与剧情无关，但换 Boss 顺序时若沿用这两份 def，会连带继承空招。
12. **`levels.js` 注释与数值漂移**：文件头写「1–6 面生成 2.1k–3.9k 列」（`src/assets/levels.js:6`），实际 `gen.cols` 是 600 / 755 / 871 / 497 / 1170 / 1324。改关卡长度或节奏时以 `gen.cols` 为准，不要信注释。
13. **结局镜头数与资源**：`ending.js` 用 `spec.shots[index]` 逐镜推进（`src/game/ending.js:175-294`），并预加载所有 `still` 与 `shot.bg`（`:96-97`）。少写一个 shot 不会崩，但会少一段演出；写错 `bg` 名会退化成黑底/占位。
14. **Boss 符卡名同时是剧情素材**：`boss.js` 里 28 张卡名 + EXTRA 12 张卡名（雷米莉亚 2 + 芙兰 10）会被 UI 与 README「Boss 符卡一览」（README.md:185）引用。若新剧情要求换 Boss 主题，符卡名要么保留（剧情别提到旧卡名），要么同步改 `boss.js` 与 README、`docs/BOSS_CREATIVE_DESIGN.md`。
15. **操作提示 `tips` 不是剧情**：`src/game/story.js:1139-1142` 是按键说明，改剧情时不要顺手删掉或改写按键。

---

## 附：统计口径与复核方式

| 项目 | 数值 | 说明 |
|---|---|---|
| 主线 + EXTRA 脚本数组 | 70 段 | 6 面 × 2 线 × 5 槽 + 开场 2 + 妖梦 2 + EXTRA 6 |
| 主线 + EXTRA 台词条数 | 871 条 | 解析 `story.js` 得到 |
| 主线 + EXTRA 字数 | 11,664 字 | 不含 `tips` |
| 结局 | 6 份 / 18 镜头 / 193 条 / 2,764 字 | 每份固定 3 shots |
| 音乐室解说 | 19 段 / ≈ 2,518 字 | `note` 字段 |
| 合计可换文本 | ≈ 16,946 字 | 主线 + 结局 + 音乐解说 |
