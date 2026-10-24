# 《未明之约》落地说明（实现层）

> 提案与全文见 `docs/RE_STORY/PLOT_REBOOT.md`；本文件只记录「改了哪些文件、为什么这么改、怎么验证」。  
> 一句话主线：幻想乡的夜停在了例大祭的前一天；十年前一位巫女答应红魔馆地下的孩子「祭典的晚上我在门口等你」，  
> 她走到了门口，手举起来，没有敲，那年冬天死了。今年十回忌，她回到门外站着，一夜叠成七十夜。

## 一、改了哪些文件

| 文件                        | 改动                      | 说明                                                                                                                                 |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/game/story.js`       | 整体重写，1637 行 / 76,083 字符 | 六面 + EXTRA 全部换成新剧本；每条线 6 个对话点（intro / mid×3 / preBoss / postBoss）；stage5 妖梦槽 `youmuPre`/`youmuPost` 各 12 句；尾段 `tips` 与 8 个取词函数原样保留 |
| `src/game/endings.js`     | 整体重写，577 行 / 22,367 字符  | 六份结局全换（ed1–ed4 / edW1 / edW2），仍是 3 shots；文件末尾保留 `export function endingFor(char, mode)`（`src/main.js:19` 依赖它）                      |
| `src/main.js`             | 3 处                     | `_midShown` 两处扩成 3 位（`:122`、`:1006`）；`thresholds` 改 `[0.22, 0.48, 0.72]`（`:1477`）；EXTRA 按钮文案「禁忌的祭典」→「门内的祭典」（`:604`、`:608`）         |
| `src/game/musicTracks.js` | 19 段 `note` 全部重写        | 字段 `key/no/title/sub/cat/place/orig/tone/glow/time` 全保留，只换第一人称解说，长度 108–222 字                                                      |
| `src/game/musicRoom.js`   | 2 处静态占位                 | `:477` `11`→`19`、`:518` `No.?? / 11`→`No.?? / 19`（运行时本就会被 `tracks.length` 覆盖）                                                      |
| `src/game/boss.js`        | 1 行                     | 芙兰终符显示名 `最终「永不结束的祭典」` → `未明「明けない夜の約束」`（血量与弹幕未动）                                                                                    |
| `README.md`               | 故事 / 结局 / 音乐 / 关卡表      | 故事节整段重写；结局六行换新名；11 首→19 首；Stage 2/5 标题与 `src/assets/levels.js` 对齐（萤火夜雾 / 冥界花海）                                                     |
| `_ENHL_改名总结.md`           | 2 句                     | 旧的「春天停在了第七十天」改成「夜停在了例大祭的前一天」                                                                                                       |
| `docs/RE_STORY/*`         | 新增                      | 提案 `PLOT_REBOOT.md`、审计 `AUDIT_CURRENT.md`、两份研究、文风守则 `STYLE_HUMAN.md`、本文件、`artifacts/` 截图                                           |

未改动：`src/game/levelgen.js`、`src/game/stage.js`、`src/game/difficulty.js`、`src/assets/levels.js`、`src/art/**`。  
关卡名（黄昏樱花 / 冰蓝晨曦 / 冥界花海……）刻意不动：黄昏=前夜，冰蓝晨曦=被冻住的黎明，语义仍然成立。

## 二、为什么改引擎（唯一的「加内容」）

原来每面每条线只有 **2** 个道中点（26% / 55%）。新剧情需要「第三个结」才能把每面的代价与私心讲完，  
所以：

- `_midShown` 从 2 位扩到 3 位（两处初始化）；
- `thresholds` 由 `[0.26, 0.55]` 改为 `[0.22, 0.48, 0.72]`。

只动了这两个常量与一个数组长度，没有新增分支。共新增 12 段剧情（6 面 × 2 条线），原有 5 个对话点全部保留。

## 三、装配与校验（可重跑）

```bash
node tools/_build_story.mjs     # 片段 → src/game/story.js（读 _header.txt + _build/{opening,stage1..6,extra}.js，尾段从旧 story.js 截取）
node tools/_verify_story.mjs    # 结构 / 白名单 / 禁用词 / 资源 key 校验
node tools/_smoke_story.mjs     # 无头 Edge 真加载三个模块，输出各面句数与截图
node tools/_smoke_ending.mjs good reimu 8    # 真结局渲染截图
node tools/_probe_dialogue.mjs reimu 5       # 开场对话渲染截图
```

- `tools/_verify_story.mjs` 的核心断言：每线 `mid` 必须 3 段；`extra` 必须恰为 `intro/midBoss/midBossOut/postBoss`；  
  结局必须 6 份 × 3 shots；`cast` 只用有立绘的 11 个 key；REGRET 与 TRUE 首 shot 不许出现芙兰/雷米莉亚（门未开）；  
  `bg` 必须在 14 张背景白名单内；`mote` 只能是 `petals/ember/star`。
- 片段源在 `docs/RE_STORY/_build/`：改台词请改那里再装配，不要直接改 `src/game/story.js`（会被下次装配覆盖）。

## 四、写死的接口（改剧情时不要碰）

1. `STORY.stages.stage5.youmuPre` / `youmuPost`（`src/game/story.js` 取词函数 `midbossStoryFor` 按这两个键名取）。
2. 六个关卡键必须恰为 `stage1..stage6`，`extra` 必须是那四个键。
3. 结局 key 必须恰为 `ed1/ed2/ed3/ed4/edW1/edW2`，且每份 `shots` 长度为 3（`src/game/ending.js` 按 shots 顺序推进）。
4. `who` 只能是 `player/partner/narrator` 或 11 个有立绘的角色 key；`sakuya` 只有名字没有立绘，一律用 narrator 引号转述。
5. 先代（博麗先代）不设立绘、不给个人名，只能由 narrator 用「」转述，或由活人复述。
6. 音乐 key 与 `hks.progress.v1` / `hks.music.v1` 字段未改。

## 五、已验证

- 语法：`node --input-type=module --check` 对 `story.js` / `endings.js` / `musicTracks.js` / `main.js` 全通过。
- 结构：`_verify_story.mjs` ✅ 通过（40 条提醒均为两线共用句的「重复句」）。
- 体量：主角台词 1566 句 / 21,176 字；结局 277 句；六面 mid 全部 `3 3`；妖梦槽 12 + 12。
- 运行时：无头 Edge 真加载，`window.__game.state` 到 `menu`，页面零报错；开场对话、真结局、REGRET 结局、EXTRA 结局四张实机截图在 `docs/RE_STORY/artifacts/`。

## 六、去人机味（2025-10-24 第二轮）

用户反馈「人机味别太重，要有人类的真情实感」，于是做了一轮**只改质感、不动设定**的修订。

- 守则：`docs/RE_STORY/STYLE_HUMAN.md`（六病 + 五手法 + 禁用清单 + 前后对照例）。
- 范围：`src/game/story.js` 全部对话（六面 + EXTRA）与 `src/game/endings.js` 六份结局；`musicTracks.js` 的 `note` 是匿名乐评口吻，保留。
- 做法：每段最多留 1 处真收尾，其余改收在动作、打断、沉默上；明喻压到每段 ≤1 处；允许答非所问、抢话、说错话又补救；补进无用细节（塌角的纸灯笼、杯底茶渍、翅尖缺口、冻硬的门槛）与具体小账（「守了十年，谁给你发工钱。」）；两线同一场戏必须换顺序、换物件、换收尾。
- 顺带修掉一处逻辑漏洞：REGRET 结局（`ed1`）原稿灵梦凭空念出三句遗言，现改为她先说「……我不知道你要说什么。」，人影点头，她才代念。
- 当前体量：`story.js` 1637 行 / 76,083 字符，主角台词 1566 句 / 21,176 字；结局 277 句；`endings.js` 576 行。
- 改词入口：`docs/RE_STORY/_build/{opening,stage1..stage6,extra}.js` + `endings.js`，改完跑 `node tools/_build_story.mjs`。
