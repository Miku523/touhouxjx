# BOSS 符卡创意设计表（创造模式）

> 创意位交付物 · 28 张卡逐卡定制。每张卡 = 1 个专属弹幕签名（`bossBullets.js` 的 `CUSTOM_PATTERNS`）+ 3–4 个同机制变体（`bossPatternDesigns.js` 的 `CARD_PATTERNS`）+ 1 个画面 fx（`cardfx.js`）+ 可选的玩家副作用（`cardEffects.js`）。
>
> 总原则：**先读卡名再设计弹幕**。卡名是「月亮 / 萤火 / 冰雹 / 风 / 蝶 / 玉」的叙事，弹幕要做成这张卡自己的一幅画，而不是换色复用。
> 弹数 / 环缝护栏沿用 `docs/BOSS_TIMING_SPEC.md`：单拍 spawn ≤ 同屏预算（1180 的 93%），环状弹按 30px 弧长留缝。

## 一、28 卡逐卡表

| 面 | Boss | # | 符卡名 | 签名弹幕 / 机制 | 玩家效果 | 画面 fx | 主色 |
|---|---|---|---|---|---|---|---|
| 1 | 露米娅 | 0 | 宵暗「月之暗面」 | `moonHalo`：正反两层月牙交替旋出，每两拍补一颗缓缓下坠的大月亮（B_BIG），路径永不封口 | — | `moon` | `#b48cff` |
| 1 | 露米娅 | 1 | 暗符「黑暗吞噬」 | `devour`：双向吞噬螺旋把弹幕往中心卷，顶端补碎屑雨；反向层做安全缝 | `devourPull` | `night` | `#8f6bd8` |
| 2 | 莉格露 | 0 | 灯符「萤火虫现象」 | `fireflySwarm`：一小群萤火散开，随机一只突然瞄准直扑（弱追踪），其余继续漂 | — | `fireflies` | `#a8ff8f` |
| 2 | 莉格露 | 1 | 蠢符「小虫风暴」 | `bugStorm`：两股反向虫群穿插，每拍风向偏移；debris 爆裂散虫再补一层 | — | `fireflies` | `#a8ff8f` |
| 2 | 莉格露 | 2 | 隐虫「萤火虫之夜」 | `nightFireflies`：**暗弹多、亮萤少**。全屏近黑，只有玩家周围一圈亮——亮区外连 Boss 与弹幕都不可见（2026-10-21 用户追加：二次压暗），环境萤火是唯一提前光 | `darkSpot` | `darkSpot` | `#a8ff8f` |
| 3 | 琪露诺 | 0 | 冰符「冰柱落下」 | `icicleFall`：竖直冰棱加速砸下，底部碎冰反向浮起，形成「落—升」两段 | — | `hail` | `#bfeaff` |
| 3 | 琪露诺 | 1 | 雹符「冰雹风暴」 | `hailSurge`：斜向冰雹阵发，gust 波一阵紧一阵松，密度随 `fireT` 呼吸 | — | `hail` | `#bfeaff` |
| 3 | 琪露诺 | 2 | 冻符「完美冻结」 | `perfectFreeze`：先钉一圈**静止**结晶，半秒后同时炸向玩家；静止期是唯一安全读条 | `frostSlide` | `freeze` | `#a8e8ff` |
| 3 | 琪露诺 | 3 | 雪符「钻石风暴」 | `diamondMatrix`：菱形晶阵自转，角度逐拍错开，阵心随机补 spark | `diamondFocus` | `freeze` | `#bfeaff` |
| 4 | 射命丸文 | 0 | 风符「风神一扇」 | `kamaitachi`：一把巨大**单侧**风刃横扫，扇轴留一颗风眼；只封半屏，另半屏是生路 | — | `wind` | `#ff9a9a` |
| 4 | 射命丸文 | 1 | 疾风「风神少女」 | `windRush`：高速螺旋风墙 + 反向补环 + 瞄准快风；**生存 30s，密度/弹速显著提高**（tuning `densityMul 1.28 / speedMul 1.12`） | `tailwind` | `wind` | `#ff6b6b` |
| 4 | 射命丸文 | 2 | 岐符「天之八衢」 | `crossroad`：八条放射「衢」依次点亮，骨架圈缓慢旋转；每一次只有 1–2 条是实弹 | — | `wind` | `#ff9a9a` |
| 4 | 射命丸文 | 3 | 风神「天狗颪」 | `downburst`：大片下压风带加速度，两侧回旋风往中间挤，形成「风谷」 | — | `wind` | `#ff6b6b` |
| 4 | 射命丸文 | 4 | 「幻想风靡」 | `fantasyStorm`：三拍循环风暴（螺旋→环→雨），每段留一条可跟着转的安全带；**生存 180s，打不到 Boss**，靠符卡清弹 | `stormEye` | `wind` | `#ff6b6b` |
| 5 | 西行寺幽幽子 | 0 | 幽雅「死出诱蛾灯」 | `mothLure`：一盏大灯缓缓坠向玩家，小弹同向绕灯；灯是「诱饵」，绕灯弹才是判读点 | — | `night` | `#ffa8d8` |
| 5 | 西行寺幽幽子 | 1 | 蝶符「花之舞」 | `flowerDance`：成对花瓣镜像旋出，单边永远有路，像一支双人舞 | — | `petals` | `#ffa8d8` |
| 5 | 西行寺幽幽子 | 2 | 蝶符「死蝶之华尔兹」 | `butterflyWaltz`：三拍一组镜像蝶翼，拍间整体旋转 120°，跟着拍子走就安全 | — | `petals` | `#ffa8d8` |
| 5 | 西行寺幽幽子 | 3 | 亡乡「亡我乡 -宿罪-」 | `sinfulRealm`：纵列罪柱 + 横向锁链缓慢收网；**生存 44s**，网眼只在移动中开合 | `sinGravity` | `night` | `#ffa8d8` |
| 5 | 西行寺幽幽子 | 4 | 冥符「常夜樱」 | `nightSakura`：大量自转花瓣压下，叠稀疏花环；花瓣是「雪」，环是「风」 | — | `petals` | `#ff8fd0` |
| 5 | 西行寺幽幽子 | 5 | 反魂蝶「八分咲」 | `resurrectionBloom`：八拍开一分，第八拍满开补大环；越到后面越像花真的开了 | `bloomGrace` | `petals` | `#ffa8d8` |
| 6 | 蓬莱山辉夜 | 0 | 难题「龙颈之玉 -五色的弹丸-」 | `dragonJewel`：五色轮流领唱，螺旋相位转动；**生存 60s**，颜色顺序就是节奏 | `jewelGaze` | `moon` | `#ffe9b0` |
| 6 | 蓬莱山辉夜 | 1 | 神宝「耀眼的龙玉」 | `shiningJewel`：中心一颗大玉缓缓飘，六向细长光矢从玉体射出；射线可见、可绕 | — | `night` | `#fff8d0` |
| 6 | 蓬莱山辉夜 | 2 | 难题「佛御石之钵 -不碎的意志-」 | `stoneBowl`：缺口石钵围栏缓慢收缩 + 落石；缺口是唯一的「意志」 | — | `darkVeil` | `#fff8d0` |
| 6 | 蓬莱山辉夜 | 3 | 神宝「佛体的金刚石」 | `adamant`：旋转菱形晶阵 + 定时硬直激光；晶阵旋转有固定角速度，可预判 | — | `freeze` | `#fff8d0` |
| 6 | 蓬莱山辉夜 | 4 | 难题「火鼠的皮衣 -不焦躁的内心-」 | `fireRat`：极慢的不灭火涡轮 + 上窜火星；**360s 长卡，慢就是压力**，不逼走位逼耐心 | — | `voidFlame` | `#ffe9b0` |
| 6 | 蓬莱山辉夜 | 5 | 神宝「火蜥蜴之盾」 | `lizardShield`：六面盾弧交替开合，永远只开一半方向——盾不是墙，是节拍器 | — | `voidFlame` | `#ffe9b0` |
| 6 | 蓬莱山辉夜 | 6 | 难题「燕之子安贝 -不死之药-」 | `swallowTrail`：极快燕尾双叉 + 慢速燕迹；快的负责吓，慢的负责封 | — | `wind` | `#ffe9b0` |
| 6 | 蓬莱山辉夜 | 7 | 神宝「蓬莱的玉枝 -梦色之乡-」 | `dreamBranch`：金枝分叉，慢速铺开成一棵发光的树；**生存 66s**，越到后面树冠越密 | `dreamBough` | `fairyDust` | `#ffe9b0` |

## 二、每张卡的变体编排

`CARD_PATTERNS[key][i]` 每卡 4 个变体、共 **112** 个 pattern 实例：

| Boss | 卡数 | 每卡变体 | 变体来源 |
|---|---|---|---|
| 露米娅 | 2 | 4 / 4 | 签名 `moonHalo` / `devour` 互为主副，spin 正反、n 与速度错开 |
| 莉格露 | 3 | 4 / 4 / 4 | `fireflySwarm`、`bugStorm`、`nightFireflies` 同族互串（萤→虫→暗萤） |
| 琪露诺 | 4 | 4 / 4 / 4 / 4 | `icicleFall` / `hailSurge` / `perfectFreeze` / `diamondMatrix` 按「落→雹→冻→晶」递进 |
| 射命丸文 | 5 | 4 / 4 / 4 / 4 / 4 | `kamaitachi` / `windRush` / `crossroad` / `downburst` / `fantasyStorm`，生存卡必带 `windRush` 兜底 |
| 西行寺幽幽子 | 6 | 4×6 | 「灯→花→蝶→罪→樱→咲」六段叙事，每卡签名 + 相邻主题 1 个 |
| 蓬莱山辉夜 | 8 | 4×8 | 「玉→龙玉→钵→金刚石→火鼠→火蜥蜴→燕→玉枝」八宝，每卡签名 + 相邻 1 个 |

变体之间只错开 `n / rate / speed / spin / radius / cycle / beat / arms / lit` 等参数，**不换弹型**——同一张卡从头到尾是同一幅画的不同笔触。

## 三、新增 typeName 清单（28 个，全部在 `src/game/bossBullets.js`）

| typeName | 卡 | 一句话机制 |
|---|---|---|
| `moonHalo` | rumia#0 | 正反月牙交替 + 缓落大月 |
| `devour` | rumia#1 | 双向吞噬螺旋 + 顶部碎屑 |
| `fireflySwarm` | wriggle#0 | 萤群散开，个别瞄准直扑 |
| `bugStorm` | wriggle#1 | 两股反向虫群穿插 + 爆裂散虫 |
| `nightFireflies` | wriggle#2 | 暗弹多亮萤少的黑暗萤群 |
| `icicleFall` | cirno#0 | 竖直冰棱加速下落 + 底部碎冰上浮 |
| `hailSurge` | cirno#1 | 斜向阵发冰雹，gust 呼吸 |
| `perfectFreeze` | cirno#2 | 静止结晶 → 半秒后齐爆 |
| `diamondMatrix` | cirno#3 | 自转菱形晶阵 + spark |
| `kamaitachi` | aya#0 | 单侧巨型风刃横扫 + 风眼 |
| `windRush` | aya#1 | 高速螺旋风墙 + 反向补环 + 瞄准快风 |
| `crossroad` | aya#2 | 八向放射「衢」依次点亮 |
| `downburst` | aya#3 | 下压风带 + 两侧回旋挤风 |
| `fantasyStorm` | aya#4 | 三拍循环风暴，留安全带 |
| `mothLure` | yuyuko#0 | 诱蛾灯：大灯坠向玩家 + 绕灯小弹 |
| `flowerDance` | yuyuko#1 | 成对花瓣镜像旋出 |
| `butterflyWaltz` | yuyuko#2 | 三拍镜像蝶翼，拍间旋转 120° |
| `sinfulRealm` | yuyuko#3 | 纵列罪柱 + 横向锁链收网 |
| `nightSakura` | yuyuko#4 | 自转花瓣暴雪 + 稀疏花环 |
| `resurrectionBloom` | yuyuko#5 | 八拍渐开，第八拍满开大环 |
| `dragonJewel` | kaguya#0 | 五色轮流领唱螺旋 |
| `shiningJewel` | kaguya#1 | 大玉飘 + 六向细长光矢 |
| `stoneBowl` | kaguya#2 | 缺口石钵围栏收缩 + 落石 |
| `adamant` | kaguya#3 | 旋转菱形晶阵 + 硬直激光 |
| `fireRat` | kaguya#4 | 极慢不灭火涡轮 + 火星 |
| `lizardShield` | kaguya#5 | 六面盾弧交替开合 |
| `swallowTrail` | kaguya#6 | 极快燕尾双叉 + 慢速燕迹 |
| `dreamBranch` | kaguya#7 | 金枝分叉成发光树 |

## 四、玩家效果（`src/game/cardEffects.js`，11 键，全部可还原）

只动三类安全属性：移速（位移积分补偿）、受击判定半径（实例遮蔽 getter）、开火节奏（每帧加减 `shootCd`）。不碰 `hurt / die / 碰撞核心`；未识别 key 直接 no-op。

| effectKey | 挂卡 | 数值 | 直觉 |
|---|---|---|---|
| `none` | 其余 18 张 | — | 无副作用 |
| `darkSpot` | wriggle#2 | 移速 ×0.93，判定 −0.3 | 摸黑，身体发虚 |
| `devourPull` | rumia#1 | 移速 ×0.9，判定 +0.15 | 被漩涡吸住 |
| `frostSlide` | cirno#2 | 移速 ×1.1，判定 +0.1 | 脚下打滑 |
| `diamondFocus` | cirno#3 | 移速 ×0.96，判定 −0.35，开火 ×1.15 | 晶光晃眼但难被瞄 |
| `tailwind` | aya#1（生存 30s） | 移速 ×1.18，判定 +0.2，开火 ×1.25 | 顺风推背 |
| `stormEye` | aya#4（生存 180s） | 移速 ×1.22，判定 −0.45，开火 ×1.35 | 站在风暴眼 |
| `sinGravity` | yuyuko#3（生存 44s） | 移速 ×0.88，判定 −0.5 | 罪业压身、身体半透明 |
| `jewelGaze` | kaguya#0（生存 60s） | 移速 ×0.9，判定 −0.5，开火 ×1.1 | 宝光定身 |
| `dreamBough` | kaguya#7（生存 66s） | 移速 ×1.12，判定 −0.35，开火 ×1.6 | 金枝托底、动作轻快 |
| `bloomGrace` | yuyuko#5 | 移速 ×0.95，判定 −0.25，开火 ×1.5 | 花开八分、节奏被带快 |

5 张生存卡 + 黑暗卡全部覆盖，其余为观感型小改。

## 五、需要 Lead 接线 / 回填的部分（我不能改的文件）

1. **`src/game/bossTuning.js`（必改）**：现在是占位——`effect` 全为 `'none'`、无 `densityMul/speedMul`、kaguya#2–#6 的 `fx` 还是 `'none'`。按上表回填 `fx / effect / accent`，并给 5 张生存卡加：
   - `aya[1]`: `densityMul: 1.28, speedMul: 1.12`
   - `aya[4]`: `densityMul: 1.35, speedMul: 1.10`
   - `yuyuko[3]`: `densityMul: 1.15, speedMul: 1.05`
   - `kaguya[0]`: `densityMul: 1.12, speedMul: 1.08`
   - `kaguya[7]`: `densityMul: 1.10, speedMul: 1.0`
2. **`src/game/boss.js`（一处遗留 bug，可选修）**：EXTRA 的 remilia / flandre 仍有 3 处 `typeName: 'cross'`（boss.js:852 / 880 / 901），而 `firePattern` 内没有 `cross` 执行块 → **这三招现在是空的（不发射任何弹）**。
   - 最小改法：把这三处 `typeName: 'cross'` 改成 `'crossroad'`（我的注册表里已有，读 `n/dirs/speed/spin`）；
   - 或者：在 `firePattern` 补 `cross` 分支。
   - 28 张 N 卡已全部被 `CARD_PATTERNS` override，不受此影响。
3. **`src/game/stage.js`（已接线，无需改）**：`drawCardFx(ctx, boss.cardFx, {w,h,px,py,playerR,time})` 与 `updateCardEffect(p, cardEff, dt)` 已在渲染/移动前调用。

## 六、自检

```bash
# 语法
node --check _pt/_syncheck/bossBullets.mjs
node --check _pt/_syncheck/bossPatternDesigns.mjs
node --check _pt/_syncheck/cardEffects.mjs
node --check _pt/_syncheck/cardfx.mjs

# 结构 + fire + effect + fx 全量自检
node _pt/selftest.mjs
```

最近一次结果：`28 卡 / 112 变体 / 28 新弹型 / 14 fx / 11 effect`，全量 fire 无 throw、单拍 spawn 均 >0 且 ≤ 预算，判定半径与移速效果可还原，`[SELFTEST OK]`。

## 七、平衡风险（请 verifier 重点看）

- **wriggle#2 黑暗卡**：全屏 94.5% 黑 + 仅玩家周围亮区；**亮区外连 Boss/敌弹/自机弹都不可见**（stage.js 第二层压暗，2026-10-21 用户要求），环境萤火可见。若实测「看不见弹」过难，优先调大 `CARD_FX_LIGHT_R` 或把第二层压暗降为半透明；`darkSpot` 判定 −0.3 仍兜底。
- **aya#4 幻想风靡（180s）**：`fantasyStorm` 的三拍循环里，第二拍环是最大密度点；`densityMul 1.35` 下若出现无解环，降低 `ring` 参数或把 `cycle` 拉长，不要动 `rate`（节奏感会散）。
- **kaguya#4 火鼠（360s）**：故意是慢速长卡，别为了「不无聊」加弹速——它的设计就是逼耐心；若玩家反馈闷，改 `embers` 数量而非弹速。
- **生存卡 `stormEye` 判定 −0.45**：4.2 → 3.75，配合移速 ×1.22 属于「高机动高容错」，若太简单把 `hitAdd` 调回 −0.2。
- **所有自定义弹型均有 `room()` 早退**（同屏 >93% 预算整拍跳过），不会叠成无解弹墙；但 `densityMul` 拉高时实际触发更频繁，观感上会更「满」——验收以 60fps 可读性为准。

## 八、文件

- `src/game/bossBullets.js` — 28 个签名弹型（`CUSTOM_PATTERNS` / `customPattern()`）
- `src/game/bossPatternDesigns.js` — 28 卡 × 4 变体（`CARD_PATTERNS` / `patternsFor()` / `CARD_INDEX`）
- `src/game/cardfx.js` — 14 个画面 fx（`drawCardFx()` / `FX_KEYS`）
- `src/game/cardEffects.js` — 11 个玩家效果（`updateCardEffect()` / `EFFECT_KEYS` / `EFFECT_INFO` / `effectStats()`）
- `tools/fx_preview.html` — 手动打开的 fx / 效果预览页
