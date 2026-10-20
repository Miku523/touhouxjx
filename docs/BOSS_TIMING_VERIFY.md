# BOSS 符卡限时 · 验收报告（最终版）

- **验收人**：verifier（独立复核，不改 `src/**`）
- **规格**：`docs/BOSS_TIMING_SPEC.md`（§1 目标时长表、§2 结算规则、§3.6 验证要求）
- **对象工作树**：`C:\Users\GuSheng\Downloads\HKS`
- **最终轮次**：2026-10-21 **00:33:08–00:34:08**（Normal 1–6，`--fullRun 4 --hpScaleMode none`）；T/D 复核 00:35:45 同树
- **工具**：`tools/_verify_bosscards.mjs`（headless Edge + CDP，自包含，可一键重跑）

## 结论

**整体：PASS**（Normal 28 卡全部 `|dev| ≤ 15%`；机制全部 PASS；控制台 0 error / 0 warning）

| 维度 | 结果 |
| --- | --- |
| Normal 28 卡计时（\|dev\| ≤ 15%） | **28 / 28 PASS**，最大偏差 -12.4%（s5 卡2：limit 60s → 实测 52.58s） |
| 每卡独立计时 / 切卡清零 / 落命不重置 | PASS |
| damage 卡血条打空才结束、超时不跳过 | PASS |
| survival 卡免疫伤害 + 到点自动切卡 + 视为成功 | PASS（5/5） |
| 奖励：成功 +POWER；满槽 1UP；超时 +10 点 | PASS（life 24 卡；power / points 分支 T 跑覆盖） |
| HUD 计时：damage「限时 剩余」、survival「坚持」、超时「超时 · 击破 +10 点」、逐卡重置 | PASS |
| darkSpot 黑暗聚光（玩家周围亮、其余近黑） | PASS（见 §7） |
| 控制台 error / warning | 0 / 0（28 卡 6 跑 + T/D + E/H 抽样） |

**本轮需知（不影响 PASS 判定）：4 张 damage 卡贴线超时**（elapsed 略超 limit → `ok=false`，按规则发 +10 点，不是计时/结算缺陷）：

| 卡 | limit | elapsed | 偏差 | 说明 |
| --- | --- | --- | --- | --- |
| s1 卡2 暗符「黑暗吞噬」 | 60s | 63s | +5.0% | 贴线超时 → +10 点 |
| s3 卡3 冻符「完美冻结」 | 90s | 90.6s | +0.7% | 贴线超时 → +10 点 |
| s4 卡1 风符「风神一扇」 | 66s | 67.07s | +1.6% | 贴线超时 → +10 点 |
| s4 卡4 风神「天狗颪」 | 90s | 93.17s | +3.5% | 贴线超时 → +10 点 |

> 这些卡偏差都在 ±15% 内（+0.7% ~ +5.0%），属 bot 单跑方差（见 §8）；若要 100% 成功可把对应 dps 再微调约 5%，但当前**不构成验收失败**。

## 1. 校准回填复核（Lead 依首轮报告微调 3 张卡）

| 卡 | dps 变更 | 新 hp | 本轮实测 | 偏差 | 预期 | ok | reward |
| --- | --- | --- | --- | --- | --- | --- | --- |
| s1 卡1 宵暗「月之暗面」 | 196→220 | 11,000 | 48.17s | -3.7% | ≈47.5s（-5%） | true | life |
| s2 卡3 隐虫「萤火虫之夜」 | 207→195 | 17,550 | 85.85s | -4.6% | ≈85.6s | true | life |
| s4 卡3 岐符「天之八衢」 | 149→171 | 15,390 | 85.45s | -5.1% | ≈85.6s（-5%） | true | life |

三张回填卡全部落入预期区间；s2c3 由上一轮「+1.0% 贴线超时」变为本轮「-4.6% 成功」。

## 2. 验收方法（可复现）

```bash
# 最终判定跑（Normal 1-6；stage4 为 STG 面，用整关跑避免 force-boss 站位失真）
node tools/_verify_bosscards.mjs --plan "N:1-6" --fullRun 4 --hpScaleMode none
# 奖励 / 落命不重置 专项（同树）
node tools/_verify_bosscards.mjs --plan "T:1;D:1" --hpScaleMode none
```

- 静态服务器：`python tools/serve_nocache.py 8141` → `http://127.0.0.1:8141/index.html`（`Cache-Control: no-store`）。
- 角色灵梦；玩家由 `tools/sim_bot.js` 驱动（god、满火力 `carryPower=128` → 当前 POWER 上限 64）。
- 固定条件：`Math.random` 固定 LCG + `Date.now` 冻结 + `loop.stop()` 手动推进；Boss 构造前重播 LCG 使 Boss RNG 与道中解耦。
- 计时口径：Boss 运行期 `cardElapsed`（`spellLock` 归零起累计）与 `onCardResult` 事件；`limit` 与规格 §1 表独立比对（脚本内置 oracle，不从 `bossTuning` 抄）。

## 3. 验收环境变更声明（重要）

B 阶段验收期间，**工作区被另一个并行会话修改**（非本任务写权限范围），另有一次 Lead 依本报告做的 dps 回填：

| 时间（10-21） | 变更 |
| --- | --- |
| 00:06–00:13 | `src/game/power.js` POWER 系统重做（max 16→64、perLevel 4→16、castCost 6→24）、`player.js`、`main.js`（carryPower/maxPower 兜底）、`index.html`（powerMax 64、符卡消耗 24）、README；另有音乐/关卡生成（`audio.js`、`levelgen`、新增 eurobeat 曲）等外部改动 |
| 00:18:31 | `power.js` 掉落物 POWER pickup 1→4 |
| 00:21:27 | `power.js` 再次被外部改动（B 跑次之间） |
| 00:32 左右 | Lead 依首轮报告回填 3 个 dps（仅 `src/game/bossTuning.js` + `docs/BOSS_TIMING_TABLE.md`）：s1c1 196→220、s2c3 207→195、s4c3 149→171 |

因此 B 首轮（00:06–00:10）、二轮（00:25）数据只作历史参照；**最终结论以本轮 00:33:08–00:34:08（跑前/跑后 sha256 一致）为准**。

最终轮工作树关键文件 sha256（前 32 位；完整值见 `_pt/final4/before.sha`）：

```
bf5d9d6fc8f8c27e09637814840d7c09  src/game/boss.js
625b722cb9406b8b89c3aa240e8d1284  src/game/bossTuning.js
4b0b986854faddc4bf562a656d6d60eb  src/game/power.js
ca64a83bfd6ccc219d8a7b715dc30ea0  src/game/player.js
cd4cc2fdec06be07ccbd05c1fbfd05fd  src/game/stage.js
b2d00468bf4208ccd9f134a0d6fc3b70  src/game/cardfx.js
177d377b584746b73d0c086b73279bb6  src/game/cardEffects.js
31cc808ca0250a213b1b9c6356956b09  src/game/hud.js
6385bff75b3f4965f0f5c1dcdba64a08  src/game/bossBullets.js
87a2d19401ba76e9413275670ecfdd1f  src/game/bossPatternDesigns.js
a4d952f43d0551b2cbcaa5ec2af9af5a  src/main.js
d61d9ce7d6bc0eec81ca14e5fabe1fe9  index.html
7e13be943e08aa73a18840526aa47849  docs/BOSS_TIMING_TABLE.md
```

> 提示：POWER 改为 perLevel=16 后，规格 §2.4 文字「成功 POWER += 4 点」已过期；代码按 `POWER.perLevel` 发放，机制正确，建议同步改规格描述。

## 4. Normal 28 卡逐卡结果（最终轮）

| 面 | # | 符卡 | 模式 | limit | elapsed | 偏差 | ok | reward | `spellMaxHp` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| s1 露米娅 | 1 | 宵暗「月之暗面」 | damage | 50s | 48.17s | -3.7% | true | life | 11000 |
| s1 露米娅 | 2 | 暗符「黑暗吞噬」 | damage | 60s | 63s | +5.0% | **false** | points | 13380 |
| s2 莉格露 | 1 | 灯符「萤火虫现象」 | damage | 60s | 56.4s | -6.0% | true | life | 12300 |
| s2 莉格露 | 2 | 蠢符「小虫风暴」 | damage | 105s | 101.57s | -3.3% | true | life | 22365 |
| s2 莉格露 | 3 | 隐虫「萤火虫之夜」 | damage | 90s | 85.85s | -4.6% | true | life | 17550 |
| s3 琪露诺 | 1 | 冰符「冰柱落下」 | damage | 30s | 28.67s | -4.4% | true | life | 6210 |
| s3 琪露诺 | 2 | 雹符「冰雹风暴」 | damage | 120s | 107.55s | -10.4% | true | life | 23400 |
| s3 琪露诺 | 3 | 冻符「完美冻结」 | damage | 90s | 90.6s | +0.7% | **false** | points | 18270 |
| s3 琪露诺 | 4 | 雪符「钻石风暴」 | damage | 99s | 90.52s | -8.6% | true | life | 18612 |
| s4 射命丸文 | 1 | 风符「风神一扇」 | damage | 66s | 67.07s | +1.6% | **false** | points | 10296 |
| s4 射命丸文 | 2 | 疾风「风神少女」 | SURVIVE | 30s | 30.02s | +0.1% | true | life | 6408 |
| s4 射命丸文 | 3 | 岐符「天之八衢」 | damage | 90s | 85.45s | -5.1% | true | life | 15390 |
| s4 射命丸文 | 4 | 风神「天狗颪」 | damage | 90s | 93.17s | +3.5% | **false** | points | 13680 |
| s4 射命丸文 | 5 | 「幻想风靡」 | SURVIVE | 180s | 180s | +0.0% | true | life | 9228 |
| s5 幽幽子 | 1 | 幽雅「死出诱蛾灯」 | damage | 50s | 44.88s | -10.2% | true | life | 9550 |
| s5 幽幽子 | 2 | 蝶符「花之舞」 | damage | 60s | 52.58s | -12.4% | true | life | 11580 |
| s5 幽幽子 | 3 | 蝶符「死蝶之华尔兹」 | damage | 150s | 142.07s | -5.3% | true | life | 28800 |
| s5 幽幽子 | 4 | 亡乡「亡我乡 -宿罪-」 | SURVIVE | 44s | 44.02s | +0.0% | true | life | 8599 |
| s5 幽幽子 | 5 | 冥符「常夜樱」 | damage | 120s | 118.83s | -1.0% | true | life | 23160 |
| s5 幽幽子 | 6 | 反魂蝶「八分咲」 | damage | 180s | 168.75s | -6.2% | true | life | 33300 |
| s6 辉夜 | 1 | 难题「龙颈之玉 -五色的弹丸-」 | SURVIVE | 60s | 60.02s | +0.0% | true | life | 6190 |
| s6 辉夜 | 2 | 神宝「耀眼的龙玉」 | damage | 99s | 92.62s | -6.4% | true | life | 19008 |
| s6 辉夜 | 3 | 难题「佛御石之钵 -不碎的意志-」 | damage | 120s | 111.5s | -7.1% | true | life | 22800 |
| s6 辉夜 | 4 | 神宝「佛体的金刚石」 | damage | 180s | 168.6s | -6.3% | true | life | 33120 |
| s6 辉夜 | 5 | 难题「火鼠的皮衣 -不焦躁的内心-」 | damage | 360s | 343.67s | -4.5% | true | life | 67680 |
| s6 辉夜 | 6 | 神宝「火蜥蜴之盾」 | damage | 240s | 226.47s | -5.6% | true | life | 44400 |
| s6 辉夜 | 7 | 难题「燕的子安贝 -永命线-」 | damage | 300s | 278.15s | -7.3% | true | life | 53100 |
| s6 辉夜 | 8 | 神宝「蓬莱的玉枝 -梦色之乡-」 | SURVIVE | 66s | 66.02s | +0.0% | true | life | 9122 |

统计：damage 23 卡中 19 卡 `ok=true`；survival 5 卡全部 `ok=true`；奖励 `life` 24 卡（满槽 1UP）、`points` 4 卡（超时 +10 点）。

## 5. E/H 抽样（sanity，不作判定依据）

按 Lead 口径：E/H 只验「不崩、奖励能发、\|dev vs limit\| ≤ 25%」（限时卡血量不乘难度系数）。
数据取自 00:21–00:23 工作树（早于本轮 dps 回填），**仅作 sanity**。

| 面 | # | 符卡 | limit | elapsed | 偏差 | ok | reward |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E s1 | 1 | 宵暗「月之暗面」 | 50s | 44.03s | -11.9% | true | life |
| E s1 | 2 | 暗符「黑暗吞噬」 | 60s | 59.95s | -0.1% | true | life |
| E s4 | 1 | 风符「风神一扇」 | 66s | 50.12s | -24.1% | true | life |
| E s4 | 2 | 疾风「风神少女」 | 30s | 30.02s | +0.1% | true | life |
| E s4 | 3 | 岐符「天之八衢」 | 90s | 91.33s | +1.5% | false | points |
| E s4 | 4 | 风神「天狗颪」 | 90s | 81.23s | -9.7% | true | life |
| E s4 | 5 | 「幻想风靡」 | 180s | 180s | +0.0% | true | life |
| H s2 | 1 | 灯符「萤火虫现象」 | 60s | 57.77s | -3.7% | true | life |
| H s2 | 2 | 蠢符「小虫风暴」 | 105s | 102.92s | -2.0% | true | life |
| H s2 | 3 | 隐虫「萤火虫之夜」 | 90s | 89.22s | -0.9% | true | life |
| H s3 | 1 | 冰符「冰柱落下」 | 30s | 29.68s | -1.1% | true | life |
| H s3 | 2 | 雹符「冰雹风暴」 | 120s | 114.05s | -5.0% | true | life |
| H s3 | 3 | 冻符「完美冻结」 | 90s | 86.85s | -3.5% | true | life |
| H s3 | 4 | 雪符「钻石风暴」 | 99s | 93.88s | -5.2% | true | life |

- 全部 \|dev\| ≤ 25%（最大 E s4 卡1 -24.1%，属“E 难度偏短”，Lead 已确认可接受）；未崩、控制台 0 error、卡数不裁。
- 抽样时同一张卡的 `spellMaxHp` 在 N/E/H 三档相同（当时 s1 [9800,13380]、s2 [12300,22365,18630]、s3 [6210,23400,18270,18612]、s4 [10296,13410,13680]）→ hpScale 已移除；本轮回填后 s1c1=11000、s2c3=17550、s4c3=15390（仅 Normal 值更新）。
- 注：工具默认硬阈值 15%，E s4 卡1 的 -24.1% 在 JSON 里会被标 FAIL；按 E/H sanity 口径（≤25%）属 PASS，不计入整体判定。

## 6. 规则与 HUD 复核（本轮 T/D 同树）

**每卡独立计时 / 切卡清零**：每卡 `hudStart` 重置为该卡 limit（s1「限时 剩余 49.1s」→「59.1s」；s6「359.1s → 239.1s → 299.1s」）；28 卡 `cardElapsed` 在 `spellLock` 期间不增长（`lockViolation=false` 全量）。

**survival 卡**（s4c2 / s4c5 / s5c4 / s6c1 / s6c8）：elapsed = 30.02 / 180.00 / 44.02 / 60.02 / 66.02（= limit + 一帧），Boss 免疫伤害（`dmg=0`、`immune=true`），到点自动切卡/进 defeat（`autoAdvance=true`），`ok=true` 且正常发奖励；HUD「坚持 Xs」+ SURVIVE（`_pt/shots/hud_survival_s4_N.png` 等）。

**damage 超时**：本轮 s1c2（63.00s > 60s）、s3c3（90.60s > 90s）→ `ok=false`、HUD「超时 · 击破 +10 点」、横幅「超时奖励 +10 点」、extendPts +10；血条打空后才切卡（未跳过）。T 专项再强制放大血条 ×1.6（s1c2 → 99.80s > 60s）复验同一路径：`ok=false` / `points` / extendPts 94→5（+10 后跨 99 换 1 命，余 5 点）、残机 4→5。

**落命不重置计时**（D 跑，同树）：s1c1 `cardElapsed=15.00s` 处强制落命 → death/respawn 事件 19.62s/20.52s（死亡动画约 4.6s），`respawned=true`、回到同一张卡（`elapsedAfterRespawn=15.88s`，单调不回退）；随后同卡继续，最终 47.65s 正常结算；落命后 POWER 64→32（`respawnKeep.platform=0.5`）、残机 3→2。

**成功奖励分支**：

| 分支 | 条件 | 实测 | 证据 |
| --- | --- | --- | --- |
| life（1UP） | 满槽（power ≥ maxPower=64） | 全量跑 24 卡：残机 +1、POWER 不变、横幅「1UP 残机 +1」 | `_pt/final4/bosscards_s*_N.json` |
| power（+火力） | 未满槽 | T 跑卡1：power 0→16（= `POWER.perLevel`）、横幅「+POWER 火力 +1 格」、extendPts 90→7（结算 +16 后跨 99 换 1 命，余 7 点）、残机 3→4 | `_pt/final4/bosscards_s1_N_rewardtest.json` |
| points（+10 点） | 超时失败 | T 跑卡2（人为放大血条 ×1.6 强制超时 99.80s）：extendPts 94→5（+10 后跨 99 换 1 命，余 5 点）、残机 4→5；HUD「超时」/横幅「超时 奖励 +10 点」 | 同上 |

> 说明：B 全量跑把 `carryPower` 钳到满槽，因此成功奖励走 `life` 分支；`power` 与 `points` 分支由 T 专项覆盖（Lead 指定的覆盖方式）。

## 7. darkSpot 黑暗聚光像素统计

> 2026-10-21 追加（Lead）：按用户「莉格露黑了以后，弹幕/Boss 在黑暗处不可见」的要求，`stage.js` 在 Boss/玩家/自机弹/敌弹之后又压了一层同一 `darkSpot` 遮罩（亮区中心透明）。下表为追加后重截的数据（`_pt/shots/dark_s2c3.png` = `dark_s2_N.png`，1280×720，s2 卡3「隐虫『萤火虫之夜』」elapsed 20s 自动截取，玩家约 (580, 575)）。旧一轮（只压世界层）数据见 git 历史。

| 环带（以玩家为圆心） | 中位亮度（0–255） | 相对 0–60px 核心 |
| --- | --- | --- |
| 0–60px（玩家核心） | 127.7 | 100% |
| 60–120px | 87.5 | 69% |
| 120–150px | 62.8 | 49% |
| 150–180px | 109.0 | 85% |
| 180–220px | 83.5 | 65% |
| 220–280px | 24.5 | 19% |
| 280–350px | 3.1 | 2% |
| 350–450px | 1.1 | ≈1% |
| 450–600px | 1.1 | ≈1% |
| 四角（TL/TR/BL/BR） | 1.1 / 1.1 / 1.1 / 1.1 | ≈0.4% |

结论：玩家周围 0–180px 维持高亮（150–180px 含亮区边缘萤光带，中位 109），220–280px 降至 19%，280–350px 仅 2%，350px 外≈全黑，四角 1.1/255 → 符合规格「玩家周围 150–180px 亮、其余近黑」。第二层压暗生效后，亮区外 Boss/敌弹/自机弹不可见；交互示例见 `_pt/shots/dark_hide_far.png`（玩家远离 Boss：全黑）与 `_pt/shots/dark_hide_near.png`（走进亮区：Boss 与弹幕显现）。环境萤火由 `drawAmbient` 画在最上层，亮区外仍可见。

## 8. 方差与可复现性说明

- 同工作树、同 seed 的重复跑并非逐帧一致：早前 s1/s4 两次复跑恰好一致（42.32/42.32、74.57/74.57），但 s3 重复跑实测 86.90s / 90.60s，s4 卡1 58.65s / 67.07s，s1 卡2 59.38s / 63.00s → **bot 单跑方差约 ±5%~±13%**（s4 STG 面最明显）。
- 影响：落在 limit±5% 内的卡，`ok` 可能在不同轮次翻转（本轮 s1c2 +5.0%、s3c3 +0.7%、s4c1 +1.6%、s4c4 +3.5% 均为一跑之差落在限时之外）——这是 bot 测时代理指标的固有抖动，不是计时逻辑缺陷。
- 本轮跑前/跑后 12 个关键文件 sha256 一致，排除“边跑边改”；最终判定采用本轮单次全量结果（Lead 指定口径）。

## 9. 产物索引

| 路径 | 内容 |
| --- | --- |
| `_pt/bosscards_s1_N.json` … `s6_N.json`（权威副本） | 最终轮 28 卡原始数据（含 HUD/奖励快照、截图元数据）；归档原件 `_pt/final4/` |
| `_pt/final4/bosscards_s1_N_rewardtest.json` | 奖励分支 T 跑（power / points） |
| `_pt/final4/bosscards_s1_N_deathtest.json` | 落命不重置计时 D 跑 |
| `_pt/bosscards_s1_E.json` / `s4_E.json` / `s2_H.json` / `s3_H.json` | E/H 抽样（旧树 sanity，归档 `_pt/final2/`） |
| `_pt/final2/var/*.json` | 首轮 s1/s4 同参复跑（历史） |
| `_pt/bosscards_summary.json` / `_pt/bosscards_table.md` | 汇总（权威集重建） |
| `_pt/shots/dark_s2c3.png` / `dark_s2_N.png` | darkSpot 黑暗聚光截图（同内容 alias，2026-10-21 追加二层压暗后重截） |
| `_pt/shots/dark_hide_far.png` / `dark_hide_near.png` | 追加行为示例：远（Boss/弹幕不可见）/ 近（亮区内显现） |
| `_pt/shots/hud_damage_s*_N.png` | HUD 限时计时截图（1–6 面） |
| `_pt/shots/hud_survival_s4_N.png` / `s5_N` / `s6_N` | survival「坚持 Xs」HUD 截图 |
| `_pt/shots/hud_overtime_*.png` | 超时 HUD 截图 |
| `_pt/_dark_analyze.py` | 暗区像素统计脚本（参数：图片、玩家屏 x、y） |

## 10. 判断口径与已知边界

- 判定只覆盖**限时/生存时长 + 结算奖励 + HUD + 控制台**；Boss 弹幕设计、美术效果、音乐不在本报告范围。
- Bot 测时为代理指标（god、满火力、固定 seed）；真人会因走位/中弹损失火力而更慢，限时卡实际体验可能比 bot 偏慢。
- s4（STG 面）必须整关跑；force-boss 传送会破坏 STG 站位/瞄准（阶段 A 已证伪，DPS 仅 ~90）。
- 本轮 4 张 damage 卡贴线超时（+0.7%~+5.0%）：按 §2 规则发 +10 点，非失败缺陷；若目标是“damage 卡 100% 成功”，可对对应 dps 再微调约 5%，但会牺牲其它轮次的目标时长贴合度。
