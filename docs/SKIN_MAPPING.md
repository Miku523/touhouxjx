# 符卡专属弹型 · 映射与施工规范

> 需求来源：用户 m00001 —— 每张符卡必须有自己的专属弹种，**在原弹幕基础上优化美化，不是替代弹幕**（弹道参数 n/speed/rate/spread/angle/turn 一律不动，只换弹型外观与配色）。

## 1. 系统分层

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 编号真源 | `src/game/bulletArt/types.js` | B_CRESCENT=5 … B_SPIRIT=23，禁止裸数字 |
| 材质/打光库 | `src/game/bulletArt/_lib.js` | 只读共享（除 Lead 外不改） |
| 弹型美术 | `src/game/bulletArt/{dark,bug,ice,leaf,sakura,jewel,stone,flame,bird,blade,bat,spear,crystal,lava}.js` | 每个模块只画自己的编号 |
| 汇总 | `src/game/bulletArt/index.js` | SKIN_META / skinGlow |
| 逐卡映射 | `src/game/bulletArt/cardSkins.js` | `CARD_SKINS[bossKey][cardIndex] = { skin, map }` |
| 接线 | `src/game/boss.js` + `src/game/bullets.js` | firePattern 里同步设置 `bullets.skinMap`，spawn 时换 type（Lead 已完成） |
| 逐卡配色 | `src/game/bossBullets.js` | 每个 CUSTOM_PATTERNS 方法的硬编码色 → 卡面色板 |
| 预览 | `tools/bulletSkinPreview.html` + `tools/shot_skins.mjs` | 单独看弹型长相 |
| 实战截图 | `tools/_card_shot.mjs`（QA 建） | 进 Boss 战逐卡截图 |

## 2. 弹型 ↔ 符卡

| 面 | 角色 | 符卡 | 专属弹型 |
| --- | --- | --- | --- |
| 1 | 露米娅 | 1-1 月之暗面 | B_CRESCENT 月牙（红/暗） |
| 1 | 露米娅 | 1-2 黑暗吞噬 | B_DARKORB 吞噬暗球 |
| 2 | 莉格露 | 2-1 萤火虫现象 | B_FIREFLY 萤火虫 |
| 2 | 莉格露 | 2-2 小虫风暴 | B_BUG 小虫 |
| 2 | 莉格露 | 2-3 萤火虫之夜 | B_FIREFLY，大弹 B_BUG |
| 3 | 琪露诺 | 3-1~3-4 | B_ICECUBE 小冰块 |
| 4 | 射命丸文 | 4-1~4-5 | B_MAPLE 枫叶 |
| 5 | 幽幽子 | 5-1~5-6 | B_SAKURA 樱花 / B_PETAL 樱瓣 |
| 5 | 魂魄妖梦（中途） | 现世斩 / 未来永劫斩 / 剑楼阁 | B_SLASHARC 刀斩 / B_BLADE 太刀 / B_SPIRIT 半灵 |
| 6 | 辉夜 | 6-1 龙颈之玉 | B_FIVEJEWEL 五色玉（大弹 B_DRAGONORB） |
| 6 | 辉夜 | 6-2 耀眼的龙玉 | B_DRAGONORB 龙玉 |
| 6 | 辉夜 | 6-3 佛御石之钵 | B_STONE 碎石 |
| 6 | 辉夜 | 6-4 佛体的金刚石 | B_DIAMOND 金刚石 |
| 6 | 辉夜 | 6-5 火鼠的皮衣 | B_FLAME 不灭之火 |
| 6 | 辉夜 | 6-6 火蜥蜴之盾 | B_SCALE 火鳞 |
| 6 | 辉夜 | 6-7 燕的子安贝 | B_SWALLOW 燕尾贝 |
| 6 | 辉夜 | 6-8 蓬莱的玉枝 | B_BRANCH 玉枝 |
| EX | 雷米莉亚（中途） | 咒诅「弗拉德·特佩斯」 | B_BAT 血蝠，螺旋 B_SPEAR 血枪 |
| EX | 雷米莉亚（中途） | 天罚「大卫之星」 | B_CRESCENT 血月，反向螺旋 B_BAT 血蝠 |
| EX | 芙兰朵露 | 禁忌「蔓越莓陷阱」 | B_CRYSTAL 血水晶，泡弹 B_BAT |
| EX | 芙兰朵露 | 禁忌「雷瓦汀」 | B_LAVA 熔岩 |
| EX | 芙兰朵露 | 禁忌「四重存在」 | B_CRYSTAL，花瓣 B_BAT；**本卡另有「人物四重存在」：本体 + 3 个幻影分身同屏、每 3 拍轮转一人开火（四个都会开火）** |
| EX | 芙兰朵露 | 秘弹「然后就一个人都不剩了？」 | B_LAVA，泡弹 B_BAT |
| EX | 芙兰朵露 | 禁弹「星弧破碎」 | B_CRYSTAL，螺旋/弧 B_BAT |
| EX | 芙兰朵露 | 禁弹「折反射」 | B_CRYSTAL |
| EX | 芙兰朵露 | QED「495 年的波纹」 | B_LAVA，大环 B_CRYSTAL |
| EX | 芙兰朵露 | 禁忌「吸血鬼之宴」 | B_BAT（本卡母题就是蝙蝠群） |
| EX | 芙兰朵露 | 禁忌「破坏之瞳」 | B_LAVA |
| EX | 芙兰朵露 | 未明「明けない夜の約束」 | B_CRESCENT 血月，螺旋/花瓣 B_BAT |

映射实现：`cardSkins.js` 的 map 只覆盖 0-3 号弹；4 号激光默认保留（避免光束被图案弹换掉失去观感）。共 43 张卡（31 张主线 + 12 张 EXTRA）。

补充（四重存在，2026-10-24 终版）：「禁忌『四重存在』」不止换弹型，`boss.js` 还实现了人物层面的四重存在——`_syncClones()` 只在该卡维持 3 个幻影分身 `{dx:-300,dy:58,scale:.94}/{dx:-150,dy:-46,scale:.92}/{dx:158,dy:42,scale:.90}`（刻意错开高度与远近，避免四个立绘糊成一团），纯幻影（不吃伤害、不碰撞、不进 HP 结算），换卡/败退立即清空；`_fireClonePatterns()` 在本体每拍开火后、**每 3 拍**（`volleys % 3 === 0`）由一个分身按 `_cloneTurn` 轮转接拍开火，临时把本体坐标挪到该分身位置、`pressure*0.45`、`speedCap*0.85`，直接复用同一 `firePattern` 派发，所以四个芙兰的弹道/配色/专属弹型完全同源。最初三个分身隔拍齐射会把花瓣招铺满屏（645 发，用户反馈「太密了」），改成单分身每 3 拍轮转后 cross 171 发、petal 569 发（基线 194/365），回到原卡密度量级。`_drawClones()` 在 `Boss.draw` 的 translate 上下文内按相对偏移与各自缩放绘制，画在本体之下。

补充（EXTRA）：EX 的雷米莉亚/芙兰走 `boss.js` 里 BOSS_DEFS 的内置 patterns，不经 CUSTOM_PATTERNS，因此 `firePattern` 开头的 `b.skinMap = skinMapper(boss.key, boss.spellIdx)` 改成无条件设置，并用 try/finally 只覆盖「这一拍开火」；延迟壳弹（meteor/mine）的二次爆裂在 `Boss.update` 的 `_processLater` 外面单独套同一张映射。弹池 stage.bullets 与道中妖精共用，映射用完必须立刻清空。

## 3. 卡面色板（bossBullets.js 逐卡配色用）

| 角色 | main | bright | dark/deep | 说明 |
| --- | --- | --- | --- | --- |
| 露米娅 | #ff4d6a | #ff9aa8 | #3a0a16 | 红 + 暗，暗面弹用深红近黑 |
| 莉格露 | #a8ff8f | #d6ff7a | #2f5c22 | 黄绿 + 亮黄萤火 #fff6a8 |
| 琪露诺 | #bfeaff | #ffffff | #1b6fa8 | 冰蓝 + 白，浅到发亮 |
| 射命丸文 | #ff7a3c | #ffb347 | #7a2410 | 枫叶暖橙红 |
| 幽幽子 | #ffe6f4 | #ffa8d8 | #8a2352 | 樱粉 |
| 魂魄妖梦 | #9fe8d0 | #dff4ff | #1f6a58 | 薄荷刀光 |
| 辉夜 | #ffe9b0 | #fff8d0 | #7a5a1a | 金 + 玉，按宝物再分 8 套细节 |
| 雷米莉亚（EX） | #ff4d6a | #ffd0e0 | #3a0a16 | 血蝠/血枪/血月，逐卡再叠 hue 偏移 |
| 芙兰朵露（EX） | #ff4d6a | #ff8fa8 | #ffd0d8 | 血晶/熔岩/血蝠，逐卡再叠 hue 偏移（EX_TINT） |

## 4. 红线

1. **不改弹道**：n / speed / rate / spread / angle / turn / spin / radius / 弹数预算逻辑一律不动。
2. 不碰判定：bullet 的 r（命中半径）不改；只改外观。
3. 禁止 Math.random（美术模块必须确定性，hash01 可用）。
4. 只改自己名下的文件；`_lib.js`、`bullets.js`、`boss.js`、`cardSkins.js` 只读。
5. 每次改完必须：`node --input-type=module -e "import('./src/game/bulletArt/<mod>.js').then(m=>console.log(Object.keys(m.default)))"` 通过 + 截图自查。

## 5. 自查截图

```bash
# 只看指定弹型（types 逗号分隔）
SHOT_PORT=9351 node tools/shot_skins.mjs tools/_shots/art_darkbug_1.png "types=5,6" 400
```
截图后用 read_image 看，标准：
- r=9 能一眼认出是什么（月牙要像月牙、枫叶要像枫叶、刀要像刀）；
- r=5 仍能分辨轮廓，不糊成光点；
- 深色背景上不脏、不暗成一团；同屏 100+ 发仍能分清敌弹。
