# tools/ — 开发、QA 与素材工具

游戏**运行时不需要**这个目录（部署只上传 `index.html` + `src/` + `assets/`）。
这里是一次次迭代里攒下来的校验、截图、性能基准和素材生成脚本。

## 前置条件

| 依赖 | 说明 |
| - | - |
| Node ≥ 20 | 开发环境用的是 v26；所有 `*.mjs` 脚本直接 `node` 跑，无 npm 依赖 |
| Python 3.13 | `_imgdiff.py`（Pixel diff，需要 numpy + Pillow）、`gen_*.py` 素材脚本 |
| Edge | 无头浏览器写死 `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`；换机器改脚本顶部的 `EDGE` 常量 |
| 本地服务器 | 必开：`python tools/serve_nocache.py 8138`（ES Module + `no-store`，浏览器不会吃缓存）。地址可用 `PT_BASE` 覆盖 |

```bash
# 1) 起服务器（单独开一个终端，别关）
python tools/serve_nocache.py 8138

# 2) 冒烟 + 主回归（流程 / 菜单 / 设置 / 性能下限；分区分套跑，总共数分钟，软光栅下更慢）
node tools/_pt_lead_regression.mjs

# 3) 确认 headless 能拿到真 GPU（可选，跑 GPU 后期基准前先做这一步）
node tools/_gpu_diag.mjs 9462
```

## 三类脚本，别混着跑

### A. 纯 Node 逻辑脚本（不起浏览器，秒级）

直接用 `import` 拉起 `src/` 里的模块，在 Node 里造 mock ctx 或者读地形数据：

`_mapdump.mjs`（关卡生成/检查点分布）、`_diag_cp6*.mjs`（stage6 尾段地形）、
`_probe_balance.mjs`（难度梯度）、`_boss_rand_probe.mjs`（Boss 弹幕随机性/可复现性）、
`_nan_probe.mjs`（非法坐标）、`_perf_count.mjs` / `_draw_ops.mjs`（每帧 Canvas2D 调用数）、
`qa_audio.mjs`（BGM 调度）、`validate_songs.mjs`（曲库数据）、`_verify_levels.mjs`、
`_verify_stage5_youmu.mjs`（第 5 面短图：配置 / 生成 / 触发门控 / 整局模拟 / 对白契约）。

### B. headless Edge + CDP（默认软件光栅）

`_pt_*`、`_sim*.mjs`、`_playtest.mjs`、`_verify_*`、`_shot_*`、`_boss_shot*.mjs`、`_deploy_check.mjs`……
`_verify_stage5_short.mjs`（第 5 面短图：真实走位捡 4P+1UP、击破掉落、检查点、关底触发，顺带出截图）。
`_verify_boss_arena.mjs`（1–6 面 Boss 结界：平台关左右锁区、出界回拉、复活/读档检查点同步、
妖梦舞台击破后放开、4 面滚动条冻结；画面证据落 `_pt/boss_arena/`）。

这些脚本自己 spawn 独立 headless Edge（临时 profile、指定调试端口），通过 CDP
发**真实键盘/鼠标事件**、读 `window.__game` 状态、收集 console 错误和 4xx，最后打印 JSON 结论。

- 默认参数含 `--disable-gpu` → 软件光栅 → `lowSpec=true`、`postLevel=0`、backing 1.0，
  **等于在模拟最差机器**。流程 / UI / 逻辑类测试就应该用这套。
- 每个脚本默认端口不同（`_pt_core.mjs` 从 9410 起）；并发跑多份时要显式传 `--port`，否则会抢端口。
- 共享内核：`_pt_core.mjs`（`launch/nav/boot/key/eval/shot/report`、`makeChecks`、`saveJson`）、
  `sim_bot.js`（页面内自动玩家，`install({god:true})` 后可无人干扰跑关）、
  `_pt_flow_chain_lib.mjs` / `_pt_flow_menu_util.mjs`（分区套件封装）。

### C. GPU 后期 / 性能基准（**不要** 加 `--disable-gpu`）

软件光栅下后期整段是关掉的，任何 bloom / post / 帧率数据都会是「没跑」的假 0。
所以这些脚本必须走真 GPU：

| 脚本 | 用途 |
| - | - |
| `_gpu_diag.mjs` | 先确认 headless + GPU 能起来：打印 renderer 字符串、lowSpec/postLevel/backing |
| `_bloom_bench.mjs` | bloom 变体基准（`none/current/noBlur/filterSmall/.../live/pair/ab`），测**提交耗时** |
| `_post_bench.mjs` | 后期四段（bloom / 分级 / 暗角 / 颗粒）逐段开关基准 |
| `_fps_probe.mjs` | 真实 rAF：自适应 bloom vs 强制每帧 vs 关后期 |
| `_perf_live.mjs` / `_perf_back.mjs` / `_prof_render.mjs` | 实时帧预算、渲染子系统分项 |

```bash
node tools/_gpu_diag.mjs 9462                    # GPU 冒烟
node tools/_bloom_bench.mjs --variant all        # 全部变体，输出 JSON 到 _pt/perf/
node tools/_bloom_bench.mjs --shot filterSmall   # 单独起页截一个变体（避免读回污染）
node tools/_bloom_bench.mjs --dsf 2              # 高 DPI
node tools/_bloom_bench.mjs --variant ab         # 真实 rAF 循环里老/新实现交替 A/B（最可信）
node tools/_bloom_bench.mjs --variant pair       # 同一同步循环里交替跑刷新段（看相对差）
```

### ⚠ 基准脚本的两个坑（踩过）

1. **不要在计时循环里 `getImageData` / `toDataURL` 强制同步**。Chrome 会把这块 canvas
   降级成 CPU 光栅，之后测到的后期耗时全部虚高（实测 0.2ms 变成 18ms），而且不可逆、
   污染同一页里后续所有变体。要么只测「提交耗时」（`_bloom_bench.mjs` 的做法），
   要么每个变体单独起页、只在最后读一次。
2. 软光栅下不跑后期，GPU 下才跑；同一个脚本换没换 `--disable-gpu` 结论会完全相反。

### 2026-10-19 bloom 实测：结论是「不用改」

背景：曾怀疑 `_bloomPass` 把 filter 挂在**整帧**降采样上，1/4 处理相当于白费，于是想改成
「先无滤镜降采样，再在 480×270 上跑滤镜」。实测下来**没有收益，未改动 `src/engine/renderer.js`**：

- **真实游戏循环交替 A/B**（`--variant ab`，同一页面同一场景，老/新实现各 4 次、每次 1.4s，
  用 renderer 自己的 `bloomEmaMs`）：老 **0.786ms** vs 新 0.834ms，差异在 ±6% 噪声内 ——
  Skia 本来就按目标尺寸（480×270）执行滤镜，旧写法已经是高效的，加一步反而多一次绘制。
- `--variant pair`（同步循环交替）同样显示新写法略慢。
- 画面差异：两种写法同参数合成场景最大像素差 13/255（肉眼不可见）；而去掉 blur 会差
  67/255（可见），所以 blur 不能删。
- 线上 320 弹幕 Boss 战 bloom 每刷新约 0.8ms，`_tuneBloom` 在弱机自动把间隔降到 1/2~1/4
  摊平成本——这层自适应本来就是对中端机的保护，不需要额外改动。

教训：**判断后期成本不要只看「整帧 vs 小图」的直觉，要按真实 rAF 循环 A/B**。同步循环里
测出的提交耗时会被命令队列状态放大/扭曲（同一份实现在不同页面能差 3 倍），不能当依据。
截图 / 读回会污染 canvas 加速路径，见上一节两个坑。

### D. 素材压缩与网络测量（国内访问优化，1.6.15）

| 脚本 | 用途 |
| - | - |
| `optimize_art_webp.py` | 把 `src/art/gen/` 的 PNG/JPG 批量转 WebP（原图保留，引用改成 `.webp`）；`--dry-run` / `--force` / `--strict-gate`，逐张体积与 PSNR 落 `_opt/webp_table.md`、`_opt/webp_report.json` |
| `optimize_audio_mp3.py` | 三首预渲染 BGM 母版转 MP3（自写 Xing/Info + LAME tag，保证解码时长与循环接缝精确）；`--dry-run` / `--force` / `--mode` / `--bitrate` / `--only` / `--json` |
| `verify_audio_mp3.mjs` | 起 headless Edge 解码 MP3 vs WAV：时长差、采样数、互相关、真实循环渲染 SNR（页面是 `verify_audio_mp3.html`） |
| `_opt_art_check.mjs` | WebP 运行时验收：62 张 decode / 尺寸 / MIME / 404 检查 + 游戏内截图 |
| `gen_modulepreload.py` | 静态解析入口 import 图，生成 `index.html` 的 modulepreload 清单；`--write` 写入、`--check` 只校验。`src/` 的 import 关系一变要重跑，否则清单过期 |
| `_serve_h2.mjs` | 本地 HTTP/2 + gzip 服务（自签证书）；`--latency=N` 给每个响应加固定延迟，模拟公网 RTT，用来 A/B 测 modulepreload 这类「省 RTT」的改动 |
| `_net_probe.mjs` | CDP 冷缓存 + 限速网络探针，输出 nav / 资源 / 失败 JSON；**统计字节数要带 `?nosw=1`**（Service Worker 转发的请求在页面 target 上是 `encoded: 0`） |
| `_net_strip.mjs` | 在线 A/B：用 CDP `Fetch` 拦截线上 `index.html` 响应，把 modulepreload 只保留前 `--keep=N` 条再回填，比 DCL——不用发版就能验证并发相关改动。注意拦截本身会引入秒级抖动，只适合看数量级，定论要用本地 `--latency` 的受控 A/B |
| `_net_whoimg.mjs` | 劫持 `HTMLImageElement.prototype.src` setter 打印赋值栈，定位「这张图是谁在请求」；加 `--enter` 会先进第一面再继续记录（看「进关之后」的请求） |

两个坑：`_serve_h2.mjs` 必须 `createSecureServer(opts)` + `server.on('stream')`（`createSecureServer(opts, handler)` 里的 res 没有 `.respond`）；`_deploy_check.mjs` 的输出目录要先 `mkdir`，否则会静默退出。

## 四语 i18n 回归

语言运行时在 `src/i18n/`，语言包 `src/i18n/packs/{en,ja,zh-hant}.js` 由
`tools/_i18n_build_packs.mjs` 生成（译者稿在 `_i18n_work/`，手写 UI 文案补在
`_i18n_work/ui-extra-local.json`，繁中走 OpenCC）。改完翻译后跑：

```bash
python tools/serve_nocache.py 8139
export PT_BASE=http://127.0.0.1:8139

node tools/i18n_extract.mjs          # tr() 键 344/344 ×3；裸中文=数据层（剧情/结局/曲目）
node tools/i18n_data_coverage.mjs    # 剧情节拍 + 结局字幕 + 曲目档案 1591/1591 ×3
node tools/_pt_i18n_smoke.mjs        # 设置页四语切换 / 持久化 / ?lang= 30 项
node tools/_pt_p1_ui.mjs             # 标题→选人→难度→操作说明 14 项
node tools/_pt_p1b_music_ui.mjs      # 音乐回忆室三语 14 项
node tools/_pt_story_ui.mjs          # 开场剧情三语 10 项（取样 __game.dialogue.fullText）
node tools/_pt_ending_ui.mjs         # good ending 字幕三语 7 项

node tools/i18n_gate.mjs             # 门禁：tr 键 strict + 数据层覆盖，任一有缺即退出码 1
node tools/_pt_i18n_matrix.mjs       # 四语 × 9 屏截图（_pt/i18n-matrix/<screen>-<lang>.png）
python tools/_i18n_matrix_sheet.py   # 拼 2×2 对照图 sheet-<screen>.png
```

注意：启动幕退场前按键会被有意吞掉（防盲选），脚本要等 `__game._bootDone === true`
再按 Enter。语言包 URL 带 `?v=`（入口脚本版本号），发版时只递增 `index.html` 的
`?v=` 就能同时踢掉包缓存。

## 视觉对比

```bash
# 两张 PNG 的像素差（max / mean / 超阈值像素占比），第三个参数是放大 8 倍的差异图
python tools/_imgdiff.py a.png b.png diff.png
```

截图脚本产出的图片都在 `_pt/` 或 `_shots/` 下面，已被 `.gitignore` 忽略；分区套件
（`_pt_flow_chain_*` / `_pt_flow_menu_*`）的原始报告在 `_pt/flow_chain/report.json`，
各分区会再写 `_pt/flow_chain/SUMMARY.md`。

## 命名约定

- `_` 前缀 = **一次性/历史脚本**（某轮 QA 或某个 bug 的临时产物），能跑就行，不保证接口稳定，
  也不保证随机数/弹幕/时序完全可复现。
- 无前缀 = 相对长期维护：`serve_nocache.py`、`shot_cdp.mjs`、`sim_bot.js`、`qa_audio.mjs`、`validate_songs.mjs`、`optimize_art_webp.py`、`optimize_audio_mp3.py`、`gen_modulepreload.py`。
- 素材类 `gen_*.py` / `build_*.py` / `cutout.py` / `compose_*.py` 依赖外部图像 API 或本地素材库，
  不适合进 CI；它们生成的是 `assets/` 下的成品，重跑前先看清脚本头部说明。
