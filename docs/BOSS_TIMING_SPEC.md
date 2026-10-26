# Boss 符卡节奏 · 限时奖励 · 卡面差异 改造规格（v1；限时 / 血量 v2、奖励 v3）

> 来源：用户 2026-10-20 语音需求 m00054 / m00085 / m00087 / m00089 / m00097 / m00099 / m00102 / m00104 / m00106 / m00107 / m00109 / m00177；
> 2026-10-24 全量重定标 m00001 / m00113 / m00142 / m00144。
> 范围：**全 43 张**（主线 28 + 5 面中途妖梦 3 + EXTRA 12：蕾米莉亚 2 + 芙兰朵露 10）。EXTRA 自 2026-10-24 起**已接入逐卡限时与结算奖励**（旧文档「EXTRA 不改」作废，见 §0 / §2.8）。
> 本轮（v3）把**逐卡奖励**定型为「基础 1/4P + 无伤 1/2P，超时 +10 点」，并给擦弹加 1UP 点数，全 43 张一致，见 §0.1 / §2 规则 4。
> **v3.1（2026-10-24 深夜）**：按实际落地实现（`src/game/power.js` / `src/game/stage.js` / `src/main.js`）校正——基础与无伤合并成一笔入账、满槽走 `_addExtend(POWER.extend + bonus)`、横幅实际文案与「满槽无伤不静默」。
> 工作方式：Lead + 5 名智能体协作（见任务板）。

## 0. 2026-10-24 重定标（v2，数值以本文 §0 + `BOSS_TIMING_TABLE.md` v4 为准，§1 为历史稿）

用户这一轮的要求：**每张符卡重新给「限时」和「难度」**，覆盖 EXTRA 全部浮卡。

1. **逐卡限时全部重给**（用户口述，见 `BOSS_TIMING_TABLE.md` v4 §1「限时」列）。主线 3189s → 1736s（28 张关底卡），EXTRA 12 张首次有表。
2. **新增逐卡难度档 1–5**（`bossTuning.js` 的 `CARD_TIER_MUL`）：只调这一张卡的弹数与弹速，
   1 = ×0.75/×0.90，2 = ×0.88/×0.95，3 = ×1.00/×1.00（基准），4 = ×1.15/×1.06，5 = ×1.30/×1.12。
   旧的散装 `densityMul` / `speedMul`（只存在于几张 survival 卡）已被档位取代。
3. **血量锚点改为「三挡火力 Lv3」**（2026-10-25 三挡重定标，当日下午再下调一档）：`hp = round(limit × dps × CARD_HP_ANCHOR)`，`CARD_HP_ANCHOR = CARD_LV3_SHARE = 0.655`。
   含义：**三挡（Lv3 = power 48、3 发主弹）、不落命**的玩家约 0.79–0.88×limit 打空 —— 60 秒卡打完还剩 7–13 秒（典型 9–10 秒），这是用户 2026-10-25 下午「中下程度下调」后的手感。
   （`0.655` 是 bot 口径：验收 bot 开无敌敢贴脸，同一张卡比真人快 1.2–1.35×；`dps` 一律用「当前构建、`--lockPower 48` 钉死三挡」的实测值回填 —— 旧 dps 是 2026-10-21 攻击力翻倍前的旧单位，已全部作废。改了主弹数 / `PLAYER_ATK_SCALE` / POWER 档位后必须重测：`node tools/_verify_bosscards.mjs --plan "N:1-6" --fullRun 1,2,3,4,5,6 --power 48 --lockPower 48 --god 1 --noShots 1 --targetRatio 0.655`。）
4. **存活卡收敛为 4 张**：4-5、5-4、6-7（燕的子安贝）、芙-4；4-2 / 6-1 / 6-8 改回击破卡，芙-7（QED）当天深夜又按用户要求改回击破卡并把限时压到 90s。
5. **新增 `mode: 'both'` 双条件卡**：芙-10 未明「明けない夜の約束」——撑满 60s **或**打空血条，任一即过关；
   限时 **120s**、三挡重定标后血量 **17118**（全 EXTRA 最高，第二是芙-2 的 14365）；
   实测三挡打空分支约 81–89s（0.67–0.74×limit），撑满 120s 同样过关。
6. **`bossTuning.js` 支持可选 `hp` 字段**：EXTRA 12 张没有历史 dps，用 **8 seeds 的三挡（power 48）实测 dps** 反推
   （击破卡 `hp = round(limit × dps × CARD_EX_SHARE)`，`CARD_EX_SHARE = 0.77` = 主线 0.655 × 1.18，即 EX 比主线再硬 15–20%；双条件卡同式）。
   那套 dps 是 2026-10-25 当场实测的新单位，与主线旧标定链不能混用，故 EX 一律显式 `hp`。

## 0.1 2026-10-24 第三轮：擦弹点数与符卡奖励（本文 v3；`BOSS_TIMING_TABLE.md` v4 的限时 / 血量不变）

奖励以 **P 基准 = 满火力槽 64 点** 计量：1/4P = 16 POWER、1/2P = 32 POWER、3/4P = 48 POWER。
文案一律写「1/4P / 1/2P / 3/4P」，括号里的点数只是当前数值，实现按 `power.js` 常量取（比例 × `POWER.max`）。

1. **擦弹点数**：飞行关（STG）每擦到一颗子弹，POWER 仍 +0.075（`POWER.graze`，保留原收益但**不计入 1UP**），1UP 进度 **+0.02「点」**（`POWER.grazePoints`）。
   这个「点」是 **99 点制的 1UP 累计点数**（HUD 的 1UP 计数），**不是 POWER**；擦弹每颗的 1UP 总增量就是 **0.02**，不是 0.075 + 0.02（`_addPower` 在擦弹处传 `countExtend=false`，避免把 POWER 收益重复记进 1UP）。
   同一颗弹只结算一次（沿用 `bullets.grazeTest` 的 `grazed` 标记）。
2. **符卡基础奖励 1/4P**：每张 Boss 符卡**按时击破**（damage / both 打空）或**存活卡坚持到点**（survival / both 到点），给 `POWER.cardClear = 0.25` → `POWER.max × 0.25`（当前 16 POWER）。
   击破符与存活符同待遇，主线 / 中途战（妖梦、蕾米莉亚）/ EXTRA 同待遇，全 43 张一致。
3. **无伤加算 1/2P**：该卡期间玩家**没有受击、也没有落命** → 额外 `POWER.cardNoHit = 0.5` → 当前 32 POWER；
   基础 + 无伤 = 3/4P（48 POWER）。两笔**合并成一笔入账，不是先给 `base` 再给 `bonus`**：未满槽 `_addPower(base + bonus)`，满槽 `_addExtend(POWER.extend + bonus)`（见本 § 第 5 条）。
4. **超时不改**：击破卡没在限时内打空仍按旧规则 `stage._addExtend(10)`（+10 点，99 点制 1UP 点数），**不发 1/4P**、也不看无伤。
5. **满槽分流**：POWER 已满（`player.power >= player.maxPower`）时基础 1/4P 仍走旧的「转 1 残机」通道，但**与无伤 1/2P 合并成一次** `_addExtend(POWER.extend + bonus)`（99 + 32 = 131 点）；结算前若已有 ≥67 点进度，这一帧会连给 2 条残机。
   `extend` 事件照常播「1UP / 残机 +1」，无伤时 `main.js` 再补「无伤通过 / 1UP + 1/2P」覆盖同帧横幅（**满槽无伤不是静默**）。
6. 常量集中在 `src/game/power.js`：新增 `grazePoints: 0.02`、`cardClear: 0.25`、`cardNoHit: 0.5`（后者是**比例**，乘 `POWER.max`）。

## 1. 目标时长表（Normal 难度，单位秒）· 历史稿

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
   **`both`（双条件）卡**（2026-10-24 新增，仅芙-10）：Boss **会掉血**，`elapsed >= limit` 时按 survival 规则自动结束并成功；若先被打空血条则按 damage 规则结束。两条路都算过关。
4. **成功奖励（按时击破 / 存活到点）= 基础 1/4P + 无伤 1/2P，合并成一笔结算**：
   - `power.js` 导出辅助函数 `cardClearPower()` = `round(POWER.max × POWER.cardClear)`（当前 0.25 × 64 = 16）与 `cardNoHitPower()` = `round(POWER.max × POWER.cardNoHit)`（当前 0.5 × 64 = 32）。
   - **火力未满**（`player.power < player.maxPower`）→ `stage._addPower(base + bonus)`：16 + 32 = 48 **一次入账**（不是 16、32 两次），超出槽上限的部分照旧由 `_addPower` 转进 1UP 进度。
   - **火力已满**（`player.power >= player.maxPower`）→ `stage._addExtend(POWER.extend + bonus)`：99 + 32 = 131 点**一次**进 1UP 循环；结算前若已有 ≥67 点进度，这一帧会连给 2 条残机。`extend` 事件照常触发（横幅「1UP / 残机 +1」），无伤时 `main.js` 再补「无伤通过 / 1UP + 1/2P」覆盖它（见 §3.5）。
   - 「基础 + 无伤」= 3/4P = 48 POWER。表述统一用「1/4P / 1/2P / 3/4P」，不把 16/32 当作唯一口径（改 `POWER.max` 时点数随之变）。
5. **失败奖励**：`stage._addExtend(10)`（+10 点，99 点换 1 命的既有系统），UI 提示「+10 点」；
   **超时的击破卡不发 1/4P**（也不看无伤），与 v2 一致。
6. 每张卡只结算一次；最后一张卡结算后仍进入 `state='defeat'`。
7. **取消 E/N 的裁卡**：`difficulty.js` 的 `trimHardCards`（E: [4,5]，N: [4,5,6]）改为空数组，六面所有难度都打全部符卡。
   **逐卡限时卡的血量不再乘难度 `hpScale`**：Easy 提前 15%、Hard 必然超时 15% 会让限时成功奖励在 Hard 上系统性拿不到，因此限时卡时长跨难度一致；难度差异由既有弹幕预算/弹速承担。EXTRA 与非限时逻辑不受影响。
8. **EXTRA 不再例外（2026-10-24 起）**：蕾米莉亚 2 张 + 芙兰朵露 10 张全部登记进 `BOSS_CARD_TUNING`，
   逐卡有 `limit` / `mode` / `tier` / `fx` / `accent`，到点结算走与主线完全相同的 `_onBossCardResult`（奖励/横幅一致）。
   旧规则「EXTRA 无计时、无结算奖励」作废。
9. 血量对齐（**2026-10-25 三挡重定标 + 当日下午再下调**，用户 m00001 / m00752 口述）：每张 damage 卡的有效血量 `H = round(limit × dps × 0.655 × finalHpMulFor(key))`（不乘难度系数；2026-10-26 起多一层终局倍率，见本节末条），`dps` = **当前构建、钉死三挡（power 48）的实测有效 DPS**（`tools/_verify_bosscards.mjs --lockPower 48`）。标定含义：
   - **三挡 bot 约 0.655×limit 击破**；bot 开无敌敢贴脸，真人约慢 1.2–1.35× → **真人 0.79–0.88×limit**，60 秒卡打完还剩 7–13 秒（典型 9–10 秒，用户 2026-10-25 下午要的手感）；
   - **5 面中途妖梦 3 张单独再松 10%**（显式 `hp = round(limit × dps × 0.655 × 0.90)`），用户要求「妖梦适当下调」；
   - 二档（Lv2 = power 24–47、2 发主弹）DPS 只有三挡的一半，**同样的卡会打不完** —— 这是设计上的「需要三挡火力」，不是 bug；
   - 落命降到 Lv1（1 发主弹）基本必超时，仍作为失误惩罚。
   验收口径：`ratio = elapsed / limit`；`--targetRatio 0.75` 时 `ratio > 0.90` FAIL、`0.60–0.90` PASS、`< 0.60` WARN（打得偏快）；N 难度 3 seeds 需 0 失败（见 `BOSS_TIMING_VERIFY.md`）。
   **逐卡 dps 必须实测回填**：同一挡位下各卡差异极大（三挡实测 150–375 dps，是 bot 站位/命中率不同），不要用全局倍率反推。
   **EXTRA（remilia / flandre）**：2026-10-25 起同样用三挡实测 DPS 钉显式血量（`hp = round(limit × 实测 dps × 0.77)`），
   `0.77 = 0.655 × 1.18` —— 用户要求 EX 比主线再硬 15–20%。实测值见 `BOSS_TIMING_TABLE.md` v7 §4.2（内容仍是 v6 血量基线，含 EXTRA「慢轮 / 快轮」两种跑法的说明）。
   - **2026-10-26 终局血量倍率**（用户当日口述「将全BOSS血量上调5%左右」「蕾米莉亚上调8%」「芙兰朵路上调10%」）：`BOSS_FINAL_HP_MUL = 1.05`（主线 7 个 Boss，含 5 面中途妖梦）、`BOSS_FINAL_HP_MUL_OVERRIDE = { remilia: 1.08, flandre: 1.10 }`（**覆盖值，不叠加全局 5%**）。实现：`src/game/bossTuning.js` 的 `finalHpMulFor(key)`，`boss.js` 构造器在逐卡数据（显式 `hp` / `limit × dps × 锚点`）之后、`maxHp` 之前逐卡 `ph.hp = max(1, round(ph.hp × finalHpMulFor(key)))`。锚点 0.655 / 0.77、限时、模式、档位、dps、弹幕全部不动 → bot 目标占比仍是 0.655 / 妖梦 0.59 / EXTRA 0.77，实测耗时与占比按倍率同步放大（主线 ×1.05、蕾米莉亚 ×1.08、芙兰 ×1.10）；43 张总血量 360,475 → 383,755（+6.5%）。以后想整体调松紧只改这几个常量。

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
        tier: 3,                         // 1–5 档（2026-10-24 新增，只调该卡弹数/弹速）
      // …按 # 顺序；数量必须等于该 Boss 的卡数
    ],
  },
  // wriggle / cirno / aya / yuyuko / kaguya …
  // remilia / flandre 自 2026-10-24 起也必须提供（EXTRA 已接入限时；EXTRA 卡用显式 hp）
};
export function cardTuningFor(key) { … }
```
字段：`limit`(秒|null)、`mode`('damage'|'survival'|'both')、`fx`(字符串)、`accent`(色号)、`effect`(字符串)、`dps`(数字)、`hp`(可选，直接给 Boss 定义里的基础血量，优先于 dps 反推)、`patterns`(可选，覆盖该卡 pattern 数组，由创意位产出)、`tier`(1–5，可选，缺省 3)、`densityMul`/`speedMul`(可选，与 tier 相乘，一般不再手写)。

### 3.2 `src/game/boss.js`（Lead 负责）
运行期由 Boss 暴露（HUD/Stage 只读）：
```
boss.mode          'damage' | 'survival'（'both' 双条件卡在运行期按 'damage' 暴露，另有 boss.cardDual=true）
boss.cardLimit     number | null
boss.cardElapsed   本卡已战斗秒数（spellLock 期间不累计）
boss.cardRemain    number | null（limit - elapsed，≥0）
boss.cardRatio     本卡进度：damage 卡 = spellHp/spellMaxHp；survival 卡 = 1 - elapsed/limit
boss.cardFx        fx 键
boss.cardEffect    effect 键
boss.cardAccent    accent 色号
boss.lastCardResult 最近一次结算 { index, name, mode, ok, elapsed, limit, last } | null   // 与 _cardResultSnapshot() 一致（boss.js:1530）；实发 reward / noHit / base / bonus 只出现在 stage 补全的 cardResult 事件里（§3.3）
```
`boss.update(dt, player, bullets, fx, opts)` 新增回调：
```
opts.onCardResult({ index, name, mode, ok, elapsed, limit, last })
```
在卡结束时（打空或 survival 到点）调用一次，随后正常切卡/进入 defeat。

### 3.3 `src/game/stage.js`（stage-rewards 位负责）
- `boss.update(..., { onPhase, onCardResult: (res)=>this._onBossCardResult(res) })`
- `_onBossCardResult(res)`（以下为实际实现顺序）：
  - `noHit = !!res.ok && !this._cardDamaged`；`base = res.ok ? cardClearPower() : 0`；`bonus = noHit ? cardNoHitPower() : 0`。**先算 `noHit`，再算 `base` / `bonus`**。
  - `noHit` 判定在 stage 侧做：开卡 / 切卡时 `_cardDamaged = false`，Boss battle 期间收到受击 / 落命事件即置 true，结算时读一次——**不改 boss.js 的职责**（boss 只报 `ok` / `elapsed`）。
  - `ok` 且 POWER 满（`p.power >= p.maxPower`）→ `_addExtend(POWER.extend + bonus)`（99 + 32 = 131 点，一次结算，视已有进度可能连给 2 条残机）+ `onEvent('extend', …)`；`reward:'life'`。
  - `ok` 且 POWER 未满 → `_addPower(base + bonus)`（16 + 32 = 48 点一次入账）；`reward:'power'`。
  - `!ok` → `_addExtend(10)`；`reward:'points'`，且 `noHit` 恒 false、`base = bonus = 0`（不发 1/4P、不看无伤）。
  - `onEvent('cardResult', { ...res, reward, noHit, base, bonus })`；`res` 仍是 boss 的 `{ index, name, mode, ok, elapsed, limit, last }`，新增字段由 stage 补齐。
- 1UP 记账细节：`_addExtend` 内按 `Math.round(x * 1e4) / 1e4` 保留 4 位小数再累加（擦弹 0.02 的粒度不会漂成 98.9999）；`extendPts` 初始化上限为 `POWER.extend - 1e-6`（构造处），关间继承时不会把小数进度截掉。
- `hudState.boss` 追加：`mode, cardLimit, cardElapsed, cardRemain, cardRatio, cardFx, cardEffect, cardAccent, cardIndex: spellIdx, cardTotal: spellCount, lastResult`。
- Boss 战期间每帧调用 `updateCardEffect(player, boss.cardEffect, dt)`（`src/game/cardEffects.js`）；卡面渲染分两层调用 `drawCardFx`：①世界层（地形/道具/敌机）之后、Boss/玩家/弹幕之前——让场景泡在卡面气氛里；②仅 `darkSpot` 在 Boss/玩家/弹幕之后、环境层之前再压一层——亮区外连 Boss 与弹幕都不可见（用户 2026-10-21 追加要求）。

### 3.4 `src/game/bossPatternDesigns.js` + `src/game/bossBullets.js` + `src/game/cardEffects.js`（创意位负责）
- `bossPatternDesigns.js`：`export const CARD_PATTERNS = { rumia: [ [patternSpec,…], … ], … }`（按关卡卡序，只写要覆盖的 Boss/卡；缺省用原 BOSS_DEFS 的 patterns）。
- `bossBullets.js`：`export const CUSTOM_PATTERNS = { typeName: (p, boss, ctx, fireT)=>{…} }`；Lead 在 `firePattern()` 顶部挂注册表，`ctx` 提供 `{ b, px, py, color, r, life, type, wild, helpers }`，`helpers = { TAU, clamp, rnd(a,b), count(base,lo,hi), ringN(base,lo,hi), varySpeed(base,k), aim(), spawn(opts), ring(x,y,n,speed,opts), fan(x,y,n,spread,base,opts) }`。
- `cardEffects.js`：`export function updateCardEffect(player, effectKey, dt)`；只允许改玩家可安全调整的属性（移速/受击半径/擦弹半径等），不许改判定核心；未识别的 key 直接 no-op。**必须逐个 key 写注释与数值**。
- `cardfx.js`：`export function drawCardFx(ctx, fxKey, opts)`；`opts={w,h,px,py,playerR,time}`；只画屏幕空间叠加层，不改世界。至少实现 `darkSpot`（莉格露 3 卡：全屏近黑 + 玩家周围圆形亮区渐变，半径约 150–180px）、`darkVeil`、`fireflies`、`hail`、`freeze`、`wind`、`petals`、`night`、`none`。`darkSpot` 会被调用两次（见 §3.3）：第二层压在 Boss 与弹幕之上，**亮区外 Boss/敌弹/自机弹一律不可见**，只留 `drawAmbient` 的环境萤火（画在最上层）作为气氛。

### 3.5 `src/game/hud.js` + `index.html` + `src/main.js`（hud-timer 位负责）
- 血条下方一行计时：damage 卡显示「限时 剩余 12.4s」（超时后显示「超时 · 击破 +10 点」）；survival 卡显示「坚持 12.4s」且血条改用 `cardRatio`。
- `main.js` 的 `_onStageEvent` 增加 `case 'cardResult'`，按 `reward` + `noHit` 播横幅（点数用比例文案，不写死 16/32）：
  - `reward==='power'` 且 `noHit===false` → `hud.banner('符卡击破', '火力 +1/4P', 1.4)`；
  - `reward==='power'` 且 `noHit===true` → `hud.banner('无伤通过', '火力 +3/4P', 1.8)`；
  - `reward==='life'` 且 `noHit===false` → 不额外弹横幅，沿用同帧 `extend` 事件的 `hud.banner('1UP', '残机 +1', 1.6)`；
  - `reward==='life'` 且 `noHit===true` → `hud.banner('无伤通过', '1UP + 1/2P', 1.8)`，**覆盖同帧的 1UP 横幅**（满槽无伤不静默）；
  - `reward==='points'` → `hud.banner('超时', '奖励 +10 点', 1.4)`。
- 1UP 计数文本（`hud.js`）：整数显示整数，带小数时 `floor(x*100)/100` 后再 `toFixed(2)`（如 `0.02`、`12.34`），分母固定 99；`index.html` 的 `#extendBox` title 已同步（本文只记录，不改 HTML）。
- 不改动现有生命/火力/残机 HUD 的布局与行为。

### 3.6 验证（verifier 位负责）
- 复用 `tools/_verify_stage.mjs` 的 headless Edge/CDP 思路，新建 `tools/_verify_bosscards.mjs`：跑 stage1–6（至少 N；E/H/L 抽样），从页面抓 `cardResult` 事件与 `hudState.boss`，输出 `_pt/bosscards_s<N>_<diff>.json`。
- 检查：每张 damage 卡实际击破时间 vs limit（±15% 内为通过）；survival 卡到点自动切卡；POWER 满时 `_addExtend(POWER.extend + cardNoHitPower())` 给残机、未满时 `_addPower(cardClearPower() + cardNoHitPower())` 一次入账（当前 16 + 32；无伤要求 `res.ok && !_cardDamaged`）；超时卡 +10；擦弹每颗 +0.02 点进 1UP；Wriggle 3 卡黑暗截图；HUD 计时文本截图；控制台无报错。
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

## 5. 已知取舍 / 待确认（2026-10-25 三挡重定标后）
- 辉夜第 6 卡（火蜥蜴之盾）2026-10-24 用户拍定 **30s**（原暂定 240s，已作废）。
- 4-2 / 6-1 / 6-8 三张卡的 dps 已在 2026-10-25 按三挡实测回填（4-2 **231.8**、6-1 **220.9**、6-8 **193.5**），
  不再有「估算待补」的卡：43 张里除 4 张存活卡（`dps = null`）全部是实测值。
- 取消 E/N 裁卡，保证用户给的每张卡时长都能被验证到；如要保留裁卡需重新指定被裁卡。
- EXTRA 逐卡难度档（4–5）会让弹数 +15~30%；2026-10-25 下午 4 轮 8 seeds 复测（都落在「快轮」侧）三挡耗时是限时的 **0.56–0.90**，
  「档位让卡变难」这一点已经包含在 dps 实测里。若用户觉得 EXTRA 变难，只需改 `tier` 数字，不用动血量。
- EXTRA 有**两种跑法**：整轮偏慢（12 卡合计 ≈636s）或整轮偏快（≈568s），同样配置同样 seeds 都会出现，单卡能差 ±40%；
  血量按多轮中位钉在 0.77，出现偏慢那一侧时约再 ×1.1~1.2，所以真实体感会在 0.60–0.95 之间晃。
- 芙-10（双条件）限时 120s、血量 17,118（2026-10-26 终局倍率后 18,830）：三挡打空约 81–89s，撑满 120s 是另一条路；想更宽松就下调 `hp`。
- 奖励已从「火力 +1 格 = `POWER.perLevel`」改为比例制：基础 1/4P（`cardClear` 0.25）+ 无伤加算 1/2P（`cardNoHit` 0.5），都乘 `POWER.max`（当前 128），超时仍是 +10 点；
  要整体调轻 / 调重只改这两个比例，不必动 43 张卡的限时与血量。满槽时基础 1/4P 与无伤 1/2P 合并为一次 `_addExtend(POWER.extend + bonus)`（99 + 32 = 131 点），视已有进度可能一帧连给 2 条残机。
