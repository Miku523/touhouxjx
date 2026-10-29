# BGM WAV → MP3 转换与无缝循环验证报告

任务：**task-2**（teammate `audio-mp3`）｜ 生成时间：2026-10-27
结论：**三首 BGM 已转为 MP3，合计 5.32MB（原 20.4MB，-74.0%），时长/采样数零漂移，循环接缝行为与 WAV 一致；浏览器端 49 项断言全绿（49 pass / 0 fail）。**

---

> **注（后续更新）**：本报告记录 2026-10-27 首轮三首 BGM 的 WAV→MP3 转换，当时的一首为「extra_mad」；该曲已在 v2/v3 重做中被《恶魔之妹》（「flandre_devil」，150.0s / 1,696,800 B）取代，三首合计与当前体积见 「docs/NETWORK_CN.md」 的资产表。下面的逐项验证方法与其它两首仍然有效。

## 1. 产物与体积

| 曲目 | 原 WAV | MP3 | 码率 | 压缩比 |
|---|---:|---:|---:|---:|
| sakuya_ex | 5,292,044 B (5.05 MiB) | 1,369,893 B (1.31 MiB) | 91.33 kbps | 0.259 |
| festival_box | 9,664,118 B (9.22 MiB) | 2,545,365 B (2.43 MiB) | 92.92 kbps | 0.263 |
| extra_mad | 5,483,526 B (5.23 MiB) | 1,401,593 B (1.34 MiB) | 90.18 kbps | 0.256 |
| **合计** | **20,439,688 B (19.49 MiB)** | **5,316,851 B (5.07 MiB)** | **~91.5 kbps** | **0.260** |

- 格式：MPEG-2 Layer III，22050 Hz，**单声道**，VBR（VBR-MTRH / mean 112kbps 档，实测 ~91.5kbps）。
- 与 CBR 96kbps 方案（5,564,707 B = 5.56MB）相比体积更小且码率分配更好，故采用 VBR。
- 原 WAV 全部保留未删；`tools/build/` 下渲染脚本未动。

## 2. 编码与 gapless 做法

`tools/optimize_audio_mp3.py`：

1. lameenc 编码（`set_quality(2)`；VBR 用 `set_vbr(3)` + `set_vbr_mean_bitrate_kbps(112)`）。
2. lameenc 不写 Xing/Info 头，浏览器（FFmpeg demuxer）就无法做 gapless 修剪 → 解码长度会多出 1105 采样（~0.05s）。
3. 脚本自建 **Xing/Info 帧 + LAME tag**：写正确的总帧数、`delay=576`、`padding = 576×F_raw − N`，保证
   `解码采样数 = 576 × 总帧数 − delay − padding = N`（逐采样精确）。
4. 尾部 slack 不足 1105 采样时自动补零重编，避免浏览器按 1105 下限修剪导致尾部被截。
5. TOC 用真实帧偏移计算（VBR 下位置准确，外部播放器拖动/跳转正常）。

**复现**（默认参数即当前成品）：

```bash
python tools/optimize_audio_mp3.py --dry-run      # 只看方案与预估体积
python tools/optimize_audio_mp3.py --force        # 重新生成（默认 vbr/112）
python tools/optimize_audio_mp3.py --mode cbr --bitrate 96 --force   # 备选 CBR 96 方案
python tools/optimize_audio_mp3.py --only sakuya_ex --force
```

## 3. 时长与采样数（`decodeAudioData`，headless Edge）

两种 AudioContext 都测：**native 22050Hz** 与 **默认 48000Hz（= 游戏实际播放采样率）**。

| 曲目 | WAV dur / 采样数 (22.05k / 48k) | MP3 dur / 采样数 (22.05k / 48k) | Δdur (22.05k / 48k) |
|---|---|---|---|
| sakuya_ex | 120 / 120 s；2,646,000 / 5,760,000 | 120 / 120 s；2,646,000 / 5,760,000 | **0 s / 0 采样点 (0 / 0)** |
| festival_box | 219.14 / 219.14 s；4,832,037 / 10,518,720 | 219.14 / 219.14 s；4,832,037 / 10,518,720 | **0 s / 0 采样点 (0 / 0)** |
| extra_mad | 124.341995 / 124.341979 s；2,741,741 / 5,968,415 | 124.341995 / 124.341979 s；2,741,741 / 5,968,415 | **0 s / 0 采样点 (0 / 0)** |

判据 `|dur_mp3 − dur_wav| ≤ 0.02s`：**全部 0，无需补偿方案**。48kHz 下采样数也完全一致（若修剪不精确，这里的差值会是数十采样）。
与 WAV 波形互相关对齐：`lag = 0`（三首、两种采样率），相关系数 0.9994–0.99998 —— 没有时移。

## 4. 循环接缝

### 4.1 首/末 128 采样窗口 + 接缝跳变（native 22050Hz）

| 曲目 | 指标 | WAV | MP3 |
|---|---|---:|---:|
| sakuya_ex | 首窗 RMS / 末窗 RMS | 0.120252 / 0.105823 | 0.114232 / 0.100323 |
| | 接缝跳变 \|x_last − x_first\| | 0.018159 | 0.017373 |
| | 该跳变在内部跳变分布的分位 | 49.39% | 49.17% |
| festival_box | 首窗 RMS / 末窗 RMS | 0.001886 / 0.004352 | 0.001789 / 0.004134 |
| | 接缝跳变 | 0.000305 | 0.000270 |
| | 分位 | 98.40% | 98.43% |
| extra_mad | 首窗 RMS / 末窗 RMS | 0.000991 / 0.011913 | 0.000947 / 0.011325 |
| | 接缝跳变 | 0.009857 | 0.008992 |
| | 分位 | 45.89% | 47.51% |

MP3/WAV 比值 1.03–1.13，**同量级**；MP3 接缝跳变全部 **小于**各自曲目的平均相邻采样跳变（如 sakuya 0.0174 vs 平均 0.0250），且分位 ≈ 中位数 —— **不构成咔哒声**。

### 4.2 真实循环渲染（`AudioBufferSourceNode.loop = true`，OfflineAudioContext 48kHz）

从 `duration − 0.1s` 起播、渲染 0.25s，跨越循环边界，取边界前后 ±512 采样：

| 曲目 | 边界跳变 WAV / MP3 | 边界局部 RMS WAV / MP3 | MP3 渲染 vs WAV 渲染 SNR |
|---|---:|---:|---:|
| sakuya_ex | 0.056398 / 0.054697 | 0.113486 / 0.107858 | 25.05 dB |
| festival_box | 0.000480 / 0.000453 | 0.003652 / 0.003469 | 26.22 dB |
| extra_mad | 0.007358 / 0.006663 | 0.008881 / 0.008432 | 25.80 dB |

即：**MP3 在真实循环播放时的接缝行为与 WAV 逐样本级一致**（SNR ≈ 编码固有噪声水平），既没有额外咔哒，也没有掉帧/空档。

## 5. 引用改动

只改 `src/engine/songs/index.js`（3 条路径 + 3 条同步注释）：

| 行 | 改动前 | 改动后 |
|---|---|---|
| L54 (`endingW`) | `src/assets/bgm/festival_box.wav` | `src/assets/bgm/festival_box.mp3` |
| L77 (`ex_pre`) | `src/assets/bgm/sakuya_ex.wav?v=1.6.14` | `src/assets/bgm/sakuya_ex.mp3?v=1.6.14`（query 原样保留） |
| L92 (`extra`) | `src/assets/bgm/extra_mad.wav` | `src/assets/bgm/extra_mad.mp3` |
| L52 / L75 / L90 | 注释中的文件名 | 同步为 `.mp3` |

- `src/engine/audio.js`：`_startAudioMusic`（L757 起）是 `fetch → arrayBuffer → decodeAudioData → AudioBufferSourceNode`，**无按扩展名/MIME 分支**（只判断解码是否抛错，失败回退合成曲），因此不需要改。
- grep 结果：`src/` 下已无这三个 `.wav` 的运行时引用；`index.html` 仅有 `L138 modulepreload .../songs/sakuya_ex.js`（模块，非音频）；`src/engine/lazy_preload.js`、`sw.js` 均无 bgm 引用。
- 版本号 `?v=1.6.14` 未动，留给 Lead 统一升。

## 6. 风险与注意

1. **VBR 而非纯 CBR**：实测 ~91.5kbps VBR，体积/质量优于 CBR 96；若要求严格 CBR，用 `--mode cbr --bitrate 96`，体积变 5.56MB（略超 5.5MB 目标）。
2. **extra_mad 源素材开头有 0.717s（15,803 采样）数字静音** —— 每次循环回到开头会静 0.7s。这是原 WAV 本身的特性，MP3 完全一致；若要消除需在离线渲染侧剪掉/加淡入（属渲染脚本作者侧，本任务未动）。
3. **循环点本身存在素材级跳变**：sakuya_ex 末尾 0.0812 → 开头 0.0994（Δ0.018）、extra_mad 0.0138 → 0.0040。WAV 与 MP3 一致，MP3 未放大；若要更平滑建议渲染端做首尾交叉淡化。
4. **文档仍写 WAV**：`README.md` 提到 `src/assets/bgm/*.wav`，需文档侧同步（属 Lead 的 `docs/` 范围，未改）。
5. **缓存**：`sakuya_ex` 带 `?v=1.6.14`，其余两首无版本参数；上线时若需强制刷新，建议 Lead 统一加/升 `?v=`。
6. 旧 WAV 仍随仓库发布（合计 20.4MB）。是否需要把 WAV 移出版本库/发布包由 Lead 决定（本任务要求保留原件，未动）。

## 7. 验证设施（可复跑）

| 文件 | 作用 |
|---|---|
| `tools/verify_audio_mp3.html` | 浏览器侧：fetch 字节数/MIME、双采样率 decode、接缝与对齐指标、OfflineAudioContext 真实循环渲染（`window.runVerify()`） |
| `tools/verify_audio_mp3.mjs` | CDP 驱动 headless Edge 跑上面的页面并断言（写 `tools/_audio_mp3_verify.json/.txt`） |

```bash
# 仓库根启动静态服务（已带 no-store 头）
python tools/serve_nocache.py 8140
# 另一终端跑验证（CDP 端口默认 9552）
node tools/verify_audio_mp3.mjs
```

最近一次结果：**49 pass / 0 fail**（含 MIME `audio/mpeg`、体积比、时长/采样数、对齐、接缝、真实循环六类断言）。
