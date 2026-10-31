# 曲库模块加载失败的自我修复（音乐不再"整关没声"）

> 状态：已实现（1.6.52）
> 范围：`src/engine/audio.js`（`_scheduleSongRetry` / `_retrySongLoad` / `_queueSongLoad` / `_startSynthMusic` / `playMusic`）
> 台架：`tools/_music_fault.mjs`（故障注入）· `tools/_music_trace.mjs`（真实流程追踪）
> 约束：纯原生 ES Module，零依赖零构建；不新增资源、不改曲库数据格式

## 0. 一句话

曲库模块（`src/engine/songs/*.js`）某次请求失败时，老逻辑只 `console.warn` 一句就放弃：
正在桥接等待的新曲永远不来（旧曲一直响），旧曲又已经被停掉时整关彻底没声。
现在按 1.5s / 3s / 6s 退避自动重试，最多 3 次；期间旧曲继续响，重试成功即无缝接班。

## 1. 故障怎么复现的

**教训**：被 Service Worker 接管的模块请求，page target 的 `Fetch` 拦不到。
台架必须先 `Network.setBypassServiceWorker { bypass: true }`，否则 `import()` 照样命中 SW 缓存，
注入等于没做（第一次实验就是假阴性：paused 为 0，Boss 曲正常响）。

```bash
# 永久失败（验证"重试上限"与优雅降级）：只拦 youma_stage1 的模块请求，全部失败
FAULT_TARGET=youma_stage1 FAULT_MODE=fail FAULT_LABEL=hardfail CDP_PORT=9553 \
  node tools/_music_fault.mjs

# 瞬态失败（验证"自愈"）：只让前 4 个匹配请求失败（boot 门禁 / 进关预载 / 预热 / Boss 切歌），
# 第 5 个（也就是 1.5s 后那次重试）放行
FAULT_TARGET=youma_stage1 FAULT_MODE=fail FAULT_COUNT=4 FAULT_LABEL=heal4 CDP_PORT=9552 \
  node tools/_music_fault.mjs
```

台架流程：揭幕 → 标题 → 第 1 面（`state === 'play'`）→ `__game.stage.beginBoss()`，
每 50ms 采样 `{ on, req, cur, snd, swap, prog }`，输出 `tools/_music_fault_<label>.json`。

## 2. 修复前的证据（1.6.52 之前，`fail-boss2`）

- 4 次 `net::ERR_FAILED`（boot 门禁 1 + 进关 `_ensureStageMusic` 1 + `warmSongs` 1 + Boss 切歌 1）。
- Boss 战整场快照：`cur='stage1'` 但 `snd='pre1'`、`swap='pre1'`，进度曲线是 84.534s 的道中曲
  —— Boss 曲永远不响，玩家听到的是"一直放道中曲"。
- `silentSpans: []`：桥接保住了声音，所以这条路径不是静音而是"放错曲"；
  若失败发生时旧曲已被 stop（`silenceMusic` / `playOutMusic` / 五面呼吸区），结果就是彻底没声。
- `_songSwap='pre1'` 永久残留：`playMusic('stage1')` 再调也会被 :227 的"同名在播"早退吞掉。

**真实触发**：4G / 弱网抖一下、切网瞬间，或发布后 SW 缓存刚失效时某模块请求失败一次。

## 3. 修复内容（`src/engine/audio.js`）

| 位置 | 行为 |
| --- | --- |
| `_queueSongLoad` 失败分支 | `_warnMissingSong(name)` 之后 `_scheduleSongRetry(name)`；成功分支 `_songRetryCounts.delete(name)` 清账 |
| `_scheduleSongRetry(name)` | 每曲最多 3 次，退避 `1500 * 2^n`（1.5s / 3s / 6s）；同一时刻只排一个定时器 |
| `_retrySongLoad()` | 到点按"此刻"的 `_songName` / `_musicRequested` / `ctx` 重新拉模块；期间切歌、关音乐、静音自动作废；正在渐出/收尾或已有在途加载时不插一脚 |
| 模块已到货但没响 | `!_musicOn` → `_startMusic()`；桥接等待期（`_songSwap`）→ `_stopMusic()` + `_startMusic()` |
| `_startSynthMusic` 空事件表 | 不再静默 return，排一次重试（音频文件链路失败 + 曲库数据缺失的另一条无声路径） |
| `playMusic` 早退 | 增加 `&& !this._songSwap`：桥接等待期同名再请求要真的重新拉模块（玩家手动重试 / 回忆室再点同一首不再被吞） |

重试上限 3 次、约 10.5s 封顶：永久断网时宁可保持"旧曲继续响/安静"，也不无限打网络。

## 4. 验证结果（1.6.52）

| 实验 | 结果 |
| --- | --- |
| `heal4`（第 4 次失败、第 5 次放行） | 5 次请求：4 失败 + 1 成功（35594B / 4ms）；事件链 `_scheduleSongRetry@22052 → _retrySongLoad@23566 → _queueSongLoad → _stopMusic → _startMusic → _beginSong(stage1)`，**1.53s 后自愈**；`snaps.C_boss`：`cur/snd='stage1'`，`prog.duration=39.252`（真 Boss 曲）；`silentSpans: []` |
| `hardfail`（永久失败） | 恰好 7 次请求（4 + 3 次重试）后停止；旧曲继续响（`snd='pre1'`）、无异常、`silentSpans: []` —— 优雅降级 |
| `_music_trace` 全流程（标题→第 1 面→跳关 2..6） | 1246 样本：`进度停走>400ms: 无`、`errors: []`、`warns: []`、`netFails: []`；唯一静音段是五面 `playOutMusic` 的设计内呼吸区 |
| `_lead_smoke.mjs`（1.6.52，PT_BASE=8138） | 14/14 PASS：揭幕 1802ms、门禁三路全绿、第 1 面两首曲目揭幕前到货、进关 BGM=pre1、无 console error |

## 5. 后续注意

- 台架里 `Network.setBypassServiceWorker` 不能删，否则故障注入对 `import()` 无效。
- 改 `_songSwap` / 桥接逻辑时，`playMusic` 早退条件、`_stopMusic` 清 swap、
  `_queueSongLoad` 成功分支的"桥接换曲"三处必须一起看（语义互相依赖）。
- 版本 bump 后 SW `codeHandler` 才会 `purgeCodeCache` 重新拉 `audio.js`；只改文件不 bump 时，
  复访用户会命中同版本代码缓存，看不到修复。
