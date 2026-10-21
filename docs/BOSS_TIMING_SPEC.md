# Boss 符卡节奏 · 限时奖励 · 卡面差异 改造规格（v1）

> 来源：用户 2026-10-20 语音需求 m00054 / m00085 / m00087 / m00089 / m00097 / m00099 / m00102 / m00104 / m00106 / m00107 / m00109 / m00177。
> 范围：stage1–6 的 **28 张符卡**（2+3+4+5+6+8；早前文档误写 30，已按 `BOSS_DEFS` 校正）；EXTRA（remilia / flandre）本轮**不改**（保持现状：无计时、无新奖励）。
> 工作方式：Lead + 5 名智能体协作（见任务板）。

## 1. 目标时长表（Normal 难度，单位秒）

“模式”列：`damage` = 打空血条进下一张；`survival` = Boss 免疫伤害、坚持到时间自动进下一张。
`fx` / `effect` 只是占位键名，具体视觉/机制由创意弹幕位定稿。

> 2026-10-21：本轮**只调血量、不改限时**（限时列仍是游戏内 HUD 倒计时）。血量按「正常玩家能在限时内击破」重标，见 §2.9。

| 面 | Boss | # | 符卡名 | 模式 | 限时 | 备注 |
|---|---|---|---|---|---|---|
| 1 | 露米娅 | 1 | 宵暗「月之暗面」 | damage | 50 | 黑暗氛围 |
| 1 | 露米娅 | 2 | 暗符「黑暗吞噬」 | damage | 60 | 黑暗吞噬氛围 |
| 2 | 莉格露 | 1 | 灯符「萤火虫现象」 | damage | 60 | 萤火虫氛围 |
| 2 | 莉格露 | 2 | 蠢符「小虫风暴」 | damage | 105 | 用户区间 90–120，取中 |
| 2 | 莉格露 | 3 | 隐虫「萤火虫之夜」 | damage | 90 | 用户区间 60–120，取中；**黑暗聚光效果**（玩家周围亮、其余全黑，m00085） |
| 3 | 琪露诺 | 1 | 冰符「冰柱落下」 | damage | 30 | |
| 3 | 琪露诺 | 2 | 雹符「冰雹风暴」 | damage | 120 | |
| 3 | 琪露诺 | 3 | 冻符「完美冻结」 | damage | 90 | 用户区间 60–120，取中 |
| 3 | 琪露诺 | 4 | 雪符「钻石风暴」 | damage | 99 | |
| 4 | 射命丸文 | 1 | 风符「风神一扇」 | damage | 66 | |
| 4 | 射命丸文 | 2 | 疾风「风神少女」 | survival | 30 | 打不到 Boss；弹幕密度与弹速显著加大（m00089 + m00102） |
| 4 | 射命丸文 | 3 | 岐符「天之八衢」 | damage | 90 | |
| 4 | 射命丸文 | 4 | 风神「天狗颪」 | damage | 90 | |
| 4 | 射命丸文 | 5 | 「幻想风靡」 | survival | 180 | 打不到 Boss；只能用符卡清弹幕；m00102 改为坚持 3 分钟 |
| 5 | 西行寺幽幽子 | 1 | 幽雅「死出诱蛾灯」 | damage | 50 | |
| 5 | 西行寺幽幽子 | 2 | 蝶符「花之舞」 | damage | 60 | |
| 5 | 西行寺幽幽子 | 3 | 蝶符「死蝶之华尔兹」 | damage | 150 | 用户区间 120–180，取中 |
| 5 | 西行寺幽幽子 | 4 | 亡乡「亡我乡 -宿罪-」 | survival | 44 | m00102 强调“坚持 44 秒” |
| 5 | 西行寺幽幽子 | 5 | 冥符「常夜樱」 | damage | 120 | |
| 5 | 西行寺幽幽子 | 6 | 反魂蝶「八分咲」 | damage | 180 | |
| 6 | 蓬莱山辉夜 | 1 | 难题「龙颈之玉 -五色的弹丸-」 | survival | 60 | 用户“站到 60 秒” |
| 6 | 蓬莱山辉夜 | 2 | 神宝「耀眼的龙玉」 | damage | 99 | |
| 6 | 蓬莱山辉夜 | 3 | 难题「佛御石之钵 -不碎的意志-」 | damage | 120 | |
| 6 | 蓬莱山辉夜 | 4 | 神宝「佛体的金刚石」 | damage | 180 | |
| 6 | 蓬莱山辉夜 | 5 | 难题「火鼠的皮衣 -不焦躁的内心-」 | damage | 360 | |
| 6 | 蓬莱山辉夜 | 6 | 神宝「火蜥蜴之盾」 | damage | 240 | **用户未指定，暂定 240s，待确认** |
| 6 | 蓬莱山辉夜 | 7 | 难题「燕的子安贝 -永命线-」 | damage | 300 | 与 `BOSS_DEFS` 现名一致 |
| 6 | 蓬莱山辉夜 | 8 | 神宝「蓬莱的玉枝 -梦色之乡-」 | survival | 66 | 用户“坚持 66 秒” |

## 2. 规则

1. **计时**：每张卡独立计时，从该卡开卡演出结束（`spellLock` 归零）后开始累计 `battle` 时间；切卡清零；玩家落命不重置。
2. **damage 卡**：血条打空即为结束。若 `elapsed <= limit` → 成功奖励；否则 → 失败奖励。
   血条不会因超时而跳过，玩家必须打空才进下一张。
3. **survival 卡**：Boss 免疫玩家伤害；`elapsed >= limit` 时自动结束并进入下一张，视为成功奖励。玩家中弹/落命照常，计时继续；残机耗尽走原有 gameover。
4. **成功奖励**：`POWER += POWER.perLevel`（当前 `POWER.perLevel = 16` 点 = 火力升一格；实现按常量取，不写死数值，走 `stage._addPower` 以同步 1UP 计数）。
   **若当前 POWER 已满**（`player.power >= player.maxPower`）→ 残机 +1（沿用现有 `extend` 事件/横幅）。
5. **失败奖励**：`stage._addExtend(10)`（+10 点，99 点换 1 命的既有系统），UI 提示「+10 点」。
6. 每张卡只结算一次；最后一张卡结算后仍进入 `state='defeat'`。
7. **取消 E/N 的裁卡**：`difficulty.js` 的 `trimHardCards`（E: [4,5]，N: [4,5,6]）改为空数组，六面所有难度都打全部符卡。
   **逐卡限时卡的血量不再乘难度 `hpScale`**：Easy 提前 15%、Hard 必然超时 15% 会让限时成功奖励在 Hard 上系统性拿不到，因此限时卡时长跨难度一致；难度差异由既有弹幕预算/弹速承担。EXTRA 与非限时逻辑不受影响。
8. **EXTRA 不做任何改动**：仍无计时、无结算奖励。
9. 血量对齐（2026-10-21 修订，用户 m00001 / m00123）：每张 damage 卡的有效血量 `H = limit × dps`（不乘难度系数），`dps` = 2026-10-20 标定值（满火力实测 ×0.95 贴线）再 ×0.8，等价于「满火力实测有效 DPS × 0.76」。标定含义：
   - **满火力 bot 约 0.76×limit 击破**（旧口径 0.95×limit，正常玩家一失误就超时）；
   - **掉一级火力（Lv3）约 1.2–1.4×limit**：落命一次 POWER 64→32、主弹 5→3 发，实测 DPS ≈0.58–0.61×，作为失误惩罚保留；
   - **正常玩家（在 bot 命中率之上再折损 ~20%）约 0.92–0.95×limit 击破**，留 ≥5% 余量 —— 这就是「正常玩家能在规定时间内击破」的落地口径。
   验收口径：`ratio = elapsed / limit`；`ratio ≤ 0.95` PASS（余量不足 5% 即 FAIL），`ratio < 0.65` 仅告警（打得偏快，多为 bot 噪声）；N/E/H 三档均需 0 失败（见 `BOSS_TIMING_VERIFY.md`）。
   **逐卡 dps 必须按关型分别取**：stage4（射命丸文）是 stg 关，bot 站位/命中天生低，其 damage 卡 dps（125–142）明显低于其他面（147–178），拉平到 ~190 会使实测超时 20%+。
   **EXTRA（remilia / flandre）除外**：无逐卡数据，本轮不调血量。

## 3. 代码接口契约（实现依据）

### 3.1 `src/game/bossTuning.js`（tuning-data 位负责）
```js
export const BOSS_CARD_TUNING = {
  rumia: {
    hpMul: 12.74,                      // 与 BOSS_DEFS 一致，供血量反推
    cards: [
      { limit: 50, mode: 'damage', fx: 'darkVeil', accent: '#b48cff',
        effect: 'none', dps: 200,        // dps: Normal 满火力下该卡实测 hp/s（首轮 200 占位）
        note: '宵暗「月之暗面」' },
      // …按 # 顺序；数量必须等于该 Boss 的卡数
    ],
  },
  // wriggle / cirno / aya / yuyuko / kaguya …
  // remilia / flandre 不提供（EXTRA 不改）
};
export function cardTuningFor(key) { … }
```
字段：`limit`(秒|null)、`mode`('damage'|'survival')、`fx`(字符串)、`accent`(色号)、`effect`(字符串)、`dps`(数字)、`hp`(可选，直接给 Boss 定义里的基础血量，优先于 dps 反推)、`patterns`(可选，覆盖该卡 pattern 数组，由创意位产出)、`densityMul`/`speedMul`(可选)。

### 3.2 `src/game/boss.js`（Lead 负责）
运行期由 Boss 暴露（HUD/Stage 只读）：
```
boss.mode          'damage' | 'survival'
boss.cardLimit     number | null
boss.cardElapsed   本卡已战斗秒数（spellLock 期间不累计）
boss.cardRemain    number | null（limit - elapsed，≥0）
boss.cardRatio     本卡进度：damage 卡 = spellHp/spellMaxHp；survival 卡 = 1 - elapsed/limit
boss.cardFx        fx 键
boss.cardEffect    effect 键
boss.cardAccent    accent 色号
boss.lastCardResult 最近一次结算 { index, name, mode, ok, elapsed, limit, rewardPreview } | null
```
`boss.update(dt, player, bullets, fx, opts)` 新增回调：
```
opts.onCardResult({ index, name, mode, ok, elapsed, limit, last })
```
在卡结束时（打空或 survival 到点）调用一次，随后正常切卡/进入 defeat。

### 3.3 `src/game/stage.js`（stage-rewards 位负责）
- `boss.update(..., { onPhase, onCardResult: (res)=>this._onBossCardResult(res) })`
- `_onBossCardResult(res)`：
  - `ok`：POWER 满 → `player.lives += 1; player.maxLives = max(...)` + `onEvent('extend', …)`；否则 `_addPower(POWER.perLevel)`；`onEvent('cardResult', {...res, reward:'power'|'life'})`。
  - `!ok`：`_addExtend(10)`；`onEvent('cardResult', {...res, reward:'points'})`。
- `hudState.boss` 追加：`mode, cardLimit, cardElapsed, cardRemain, cardRatio, cardFx, cardEffect, cardAccent, cardIndex: spellIdx, cardTotal: spellCount, lastResult`。
- Boss 战期间每帧调用 `updateCardEffect(player, boss.cardEffect, dt)`（`src/game/cardEffects.js`）；卡面渲染分两层调用 `drawCardFx`：①世界层（地形/道具/敌机）之后、Boss/玩家/弹幕之前——让场景泡在卡面气氛里；②仅 `darkSpot` 在 Boss/玩家/弹幕之后、环境层之前再压一层——亮区外连 Boss 与弹幕都不可见（用户 2026-10-21 追加要求）。

### 3.4 `src/game/bossPatternDesigns.js` + `src/game/bossBullets.js` + `src/game/cardEffects.js`（创意位负责）
- `bossPatternDesigns.js`：`export const CARD_PATTERNS = { rumia: [ [patternSpec,…], … ], … }`（按关卡卡序，只写要覆盖的 Boss/卡；缺省用原 BOSS_DEFS 的 patterns）。
- `bossBullets.js`：`export const CUSTOM_PATTERNS = { typeName: (p, boss, ctx, fireT)=>{…} }`；Lead 在 `firePattern()` 顶部挂注册表，`ctx` 提供 `{ b, px, py, color, r, life, type, wild, helpers }`，`helpers = { TAU, clamp, rnd(a,b), count(base,lo,hi), ringN(base,lo,hi), varySpeed(base,k), aim(), spawn(opts), ring(x,y,n,speed,opts), fan(x,y,n,spread,base,opts) }`。
- `cardEffects.js`：`export function updateCardEffect(player, effectKey, dt)`；只允许改玩家可安全调整的属性（移速/受击半径/擦弹半径等），不许改判定核心；未识别的 key 直接 no-op。**必须逐个 key 写注释与数值**。
- `cardfx.js`：`export function drawCardFx(ctx, fxKey, opts)`；`opts={w,h,px,py,playerR,time}`；只画屏幕空间叠加层，不改世界。至少实现 `darkSpot`（莉格露 3 卡：全屏近黑 + 玩家周围圆形亮区渐变，半径约 150–180px）、`darkVeil`、`fireflies`、`hail`、`freeze`、`wind`、`petals`、`night`、`none`。`darkSpot` 会被调用两次（见 §3.3）：第二层压在 Boss 与弹幕之上，**亮区外 Boss/敌弹/自机弹一律不可见**，只留 `drawAmbient` 的环境萤火（画在最上层）作为气氛。

### 3.5 `src/game/hud.js` + `index.html` + `src/main.js`（hud-timer 位负责）
- 血条下方一行计时：damage 卡显示「限时 剩余 12.4s」（超时后显示「超时 · 击破 +10 点」）；survival 卡显示「坚持 12.4s」且血条改用 `cardRatio`。
- `main.js` 的 `_onStageEvent` 增加 `case 'cardResult'`：成功 → `hud.banner('+POWER', '火力 +1 格', 1.4)`；满槽 → `hud.banner('1UP', '残机 +1', 1.6)`；失败 → `hud.banner('超时', '奖励 +10 点', 1.4)`。
- 不改动现有生命/火力/残机 HUD 的布局与行为。

### 3.6 验证（verifier 位负责）
- 复用 `tools/_verify_stage.mjs` 的 headless Edge/CDP 思路，新建 `tools/_verify_bosscards.mjs`：跑 stage1–6（至少 N；E/H/L 抽样），从页面抓 `cardResult` 事件与 `hudState.boss`，输出 `_pt/bosscards_s<N>_<diff>.json`。
- 检查：每张 damage 卡实际击破时间 vs limit（±15% 内为通过）；survival 卡到点自动切卡；POWER 满时给残机、未满时 `+POWER.perLevel`（随版本常量，当前 16）；超时卡 +10；Wriggle 3 卡黑暗截图；HUD 计时文本截图；控制台无报错。
- 产出 `docs/BOSS_TIMING_VERIFY.md`（表格 + 截图路径 + 结论）。

## 4. 文件分工（写作用域，互不重叠）

| 角色 | 文件 |
|---|---|
| Lead | `src/game/boss.js`、`src/game/difficulty.js`、`docs/BOSS_TIMING_SPEC.md`、最终集成 |
| tuning-data | `src/game/bossTuning.js`、`docs/BOSS_TIMING_TABLE.md` |
| creative-boss | `src/game/bossPatternDesigns.js`、`src/game/bossBullets.js`、`src/game/cardEffects.js`、`src/game/cardfx.js`、`docs/BOSS_CREATIVE_DESIGN.md`、`tools/fx_preview.html` |
| stage-rewards | `src/game/stage.js` |
| hud-timer | `src/game/hud.js`、`index.html`、`src/main.js` |
| verifier | `tools/_verify_bosscards.mjs`、`docs/BOSS_TIMING_VERIFY.md`、`_pt/**` |

## 5. 已知取舍 / 待确认
- 辉夜第 6 卡未给时长 → 暂定 240s，验收后可改。
- 莉格露 2/3 卡与幽幽子 3 卡给了区间 → 取中值。
- 取消 E/N 裁卡，保证用户给的每张卡时长都能被验证到；如要保留裁卡需重新指定被裁卡。
- 奖励成功按「一格 = 4 POWER（一个火力等级）」实现；若用户想要的是一整条满槽（16）或 1 点，改 `POWER.perLevel` 一处即可。
