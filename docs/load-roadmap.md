# 首屏再优化路线（1.6.49 起）

> 写于 1.6.48 发布后。前四刀已完成并上线，本文只讨论**还能往哪走**，不含已做的改动。
> 度量口径：弱网台架 = `tools/_perf_measure.mjs --throttle`（15KB/s + RTT400ms、服务器端共享令牌桶、冷 profile）；
> 线上 = `PT_BASE=https://mikuascendlog.com/touhouxjx`，真实网络 3 次取中位。

## 一、现在在哪

| 版本 | 弱网台架 | 线上中位 | 首屏字节 | 请求 |
|---|---|---|---|---|
| 1.6.46 原始 | 168.97s | 65.9s | 2517KB | 79 |
| 1.6.47 第一刀（进关 kit 动态化） | 83.58s | — | 1309KB | 39 |
| 1.6.48 第二刀（pad/gamepad/musicRoom）+ 标题图重压 | 63.93s | 4.85s | 1015KB | 35 |
| 1.6.48 第三刀（结局模块） | **60.23s** | **6.07s** | **961KB** | **33** |

累计：**时间 -64%、字节 -62%、请求 -58%**。线上从 65.9s 掉到 6s 上下（首访冷 CDN 约 20s）。

剩下的 961KB 长这样：

| 项 | 字节 | 明细 |
|---|---|---|
| JS 22 模块 | 441KB | main.js 181.2 / audio 65.0 / title_full 45.6 / platform 37.5 / renderer 30.2 / input 22.2 / hud 17.6 / songs-index 13.6 / genchars 12.0 / dialogue 11.6 / 其余 12 项 60 |
| CSS 4 份 | 179KB | style 142.3 / mobile 23.0 / platform 9.5 / title-intro 4.6 |
| 标题插画 3 张 | 135KB | title_bg 74（已重压 -53%）+ 两张立绘 61（-45%） |
| index.html | 14KB | 含内联 `boot-fallback` 启动幕样式 |
| 其余 | ~190KB | SW / manifest / favicon / preload 重复计数 |

结论：**能"白拿"的已经拿完了**。再往下走，三条路，性质完全不同。

---

## 二、路线 A：切完游戏内的 6 个模块（-50KB，低风险）

### 做什么
把 `hud.js`(17.6) / `spellCutin.js`(6.8) / `dialogue.js`(11.6) / `genboss.js`(9.4) / `power.js`(3.0) / `balance.js`(2.2) 从静态 import 改成进关时动态 import。

这六个是**唯一**还挂在首屏、但标题页完全不用的模块。合计 50.6KB —— 这是"继续切"的天花板，不是起点。

### 怎么做
沿用第三刀的形态，把 `loadGameKit()` 扩成 `loadInGameKit()`（或并列一个 `loadUiKit()`）：

```js
let Hud = null, SpellCutin = null, Dialogue = null, ensureBossArt = null;
let _uiKitPromise = null;
function loadUiKit() { ... }        // Promise.all([import(...), ...])
async function _ensureUiKit() { ... } // 幂等，失败可重试
```

构造函数里 `this.hud = null; this.cutin = null; this.dialogue = null;`，
在 5 个进关入口的 `ensureGameKit()` 之后串一个 `await _ensureUiKit()` 再 new。

### 风险点（比第三刀硬）
- `hud` 是**每帧**调用：`draw` / `update` 各一处，`hideBossBar` / `clearBanner` / `drawHud` 分散在十余处 → 全部要 `this.hud?.`
- `dialogue` 在故事流程里同步用（`preparePortraits` / `play` / `advance`），异步加载后第一次进关会多等 30–150ms
- `ensureBossArt` 现在是静态 import 的**函数**，动态化后调用点（`_createStage` 附近的 `ensureBossArt(def.boss)`）要改 await

### 预期
- 弱网台架 60.2s → **约 54s**，首屏 961KB → **910KB**
- 线上 6.0s → **约 5.6s**（在 TTFB 波动的噪声里，肉眼无感）

### 工作量 / 风险
半天。风险低-中（`hud` 判空面广，但都是机械改动，写个冒烟测一遍即可）。

**值不值：收益 50KB 换半天和一堆 `?.`，边际收益已经很低。**

---

## 三、路线 B：标题页独立入口（-250KB，高风险）

### 做什么
把「标题页」从 `main.js` 里整体拆出来，做成独立轻壳：

```
index.html
  └─ title.js（新，约 40–60KB）
       ├─ 启动幕 #boot + BootScreen
       ├─ 标题 DOM + 菜单 / 设置 / 操作说明 / 难度 / 选人
       ├─ BGM（轻量 audio 层）
       └─ 点「开始游戏」→ import('./game.js')
            └─ 原 Game 类：Renderer / Input / 引擎 / 关卡 / 对局
```

标题页只留 `renderer`(30.2) + `input`(22.2) + `platform`(37.5) + `i18n`(8.9) + `bootScreen`(6.7) + `lazy_preload`(5.6) + `levels`(7.9) + `difficulty`(10.1) + 新 title.js(50) + 轻 BGM(15) ≈ **194KB**；
`main.js` 的 181.2 + `audio` 65 + `title_full` 45.6 + 游戏内 50.6 ≈ **342KB** 全部推到点击之后。

### 预期
- 弱网台架 60.2s → **28–32s**，首屏 961KB → **约 700KB**
- 线上 6.0s → **3.0–3.5s**

### 难点（逐条，都是真的）
1. **状态机是全局的**。`this.state` 在 `'menu'/'select'/'play'/'dialogue'/'ending'` 之间流转，`showTitle()` 有**十余处**调用点（对局结束、暂停退出、错误回退…）。拆成两个模块后，"回标题"必须先销毁 game 侧再唤醒 title 侧 —— 这是这次重构里最容易出 bug 的地方。
2. **标题插画是 canvas 画的**，不是 CSS 背景。`_revealTitle()` 注释写明「确保 renderer 已经用补全后的标题插画画过至少一帧，再淡出启动幕」。所以 `Renderer` 必须留在 title 侧，game 侧复用同一个实例和同一个 canvas —— 共享上下文要设计好。
3. **三个子页依赖同一批实例**：设置页要 `audio.input.platform.pad`，音乐回忆室要 `audio` 的曲目表，难度页要 `difficulty` 与 `LEVELS`。
4. **开屏动画必须原样保留**：人物从右侧滑入、标题与选项从左侧滑入、启动幕淡出，三者时序咬合（`title-intro.css` + `_playTitleIntro()`）。重写等于把这段动画重做一遍，回归风险高。
5. `_prefetchGameKit()` 的时机得重新设计：现在揭幕就预取 kit，拆开后"揭幕"发生在 title 侧，要决定是 title 侧预取还是等点击。

### 工作量 / 风险
3–5 天，需要 4 种视口 × 3 种网络的完整回归。**风险：高。**

**值不值：这是唯一能把首屏砍到 700KB 的办法。如果目标是把弱网 60s 干到 30s，只能走这条。**

---

## 四、路线 C：不动字节，改「看到东西的时间」（感知优化，性价比最高）

### 问题在哪
弱网下用户盯着启动幕看 60 秒 —— 但**启动幕本身**是 `index.html` 内联样式画的，第一个像素就是游戏画面，不白屏。

真正的问题是 `_revealTitle()` 要等 **4 个 CSS 全部到齐**（`window.__hksAfterCss`）才撤启动幕：

```js
// index.html 里面 4 个 <link rel="stylesheet" media="print" onload=...>
// style 142.3 + intro 4.6 + mobile 23.0 + platform 9.5 = 179KB
// 15KB/s 下 = 12 秒的纯等待
```

而标题页真正需要的样式，都在 `style.css` 里（205 条标题相关规则），外部 CSS 到手前一个都拿不到。

### 做什么
1. **抽 critical CSS 内联**：从 `style.css` 里按标题页实际 DOM（`#overlay` / `.panel` / `.logo-block` / `#title` / `#subtitle` / `.menu-block` / `#buttons` / `.btn` / `.title-deco` / `.title-ver` / `#boot` 及其子元素）提取规则，压成约 **12–18KB** 内联进 `index.html`。项目已经为启动幕做过一次同样的事（`<style id="boot-fallback">`），这次只是把范围扩到标题页。
2. **改揭幕条件**：`html.css-ready` 的门槛从"4 个 CSS 全到"改成"内联 critical CSS 已就位 + 3 张标题图已解码"。主样式表 142KB 继续后台下，到齐后加 `.css-full` 类，由主 CSS 接管细化样式与开屏动画。
3. **保证不跳版**：内联 critical CSS 与主 CSS 同源抽取、同选择器同值，避免主 CSS 到达时布局重排。要做 4 视口 × 2 DPR 的截图比对。

### 预期
- 弱网台架：**"到菜单"指标不变**（仍要等 441KB JS）；但新增 `titleVisible` 指标 —— **60.2s → 约 11s**（HTML 30KB + 3 张图 135KB ≈ 165KB / 15KB/s）
- 线上：看到标题 **6.0s → 约 2.5s**（TTFB 1–2s + HTML + 图）
- 字节：**0 变化**（只是把 CSS 换了个到达顺序）

### 工作量 / 风险
1–2 天。风险中-低（唯一真风险是 FOUC 与布局跳动，靠截图比对能压住）。

**值不值：这是唯一能让用户"立刻感觉快了"的改动，而且不碰任何游戏逻辑。**

---

## 五、推荐

| 如果目标是… | 选 |
|---|---|
| 让用户别再抱怨"慢" | **C**（感知 60s → 11s，不碰逻辑） |
| 要可测数字继续掉 | **A + C**（台架 60.2 → 54s，感知 60s → 11s） |
| 要把弱网干到 30s 以内 | **B**（唯一路径，但 3–5 天 + 高回归风险） |

我的建议：**先做 C，再看要不要 A**。理由：用户说的"加载太慢"是体验判断，不是字节数判断；C 用 1–2 天把这个体验问题解决掉，而 A 的 50KB 在线上噪声里根本测不出来。

B 留作"如果要彻底重做标题页"的独立项目，不要和这次优化混在一起做。

---

## 附：可复用的验证手段

```bash
# 弱网台架（本地起服务，先跑 python tools/serve_nocache.py）
node tools/_perf_measure.mjs --runs=3 --label=cut4 --throttle

# 线上真实网络
PT_BASE=https://mikuascendlog.com/touhouxjx node tools/_perf_measure.mjs --runs=3 --label=online5

# 首屏静态 JS 图 + 每个模块字节
node tools/_perf_list_graph.cjs

# 每条 import 边改成动态能省多少
node tools/_perf_cut_analysis.cjs

# 标题页 / 结局 / UI / 懒加载 冒烟
node tools/_perf_title_shot.mjs          # TAG=before|after 截图
node tools/_perf_smoke_kit.mjs
node tools/_perf_smoke_ending.mjs
node tools/_perf_smoke_ui.mjs
node tools/_perf_smoke_lazy.mjs
```

bump 版本三处：`index.html` 14 处 + `src/ui/platform.js` 2 处 + `sw.js` 3 处，然后 `python tools/gen_modulepreload.py --write && python tools/gen_modulepreload.py --check`。

---

## 路线 C 实测结论（2026-10-31 19:35）：**否决，不做**

按用户 m00581 的「开工」把路线 C 实现了：从 src/style.css 自动提取标题页 critical CSS（104 条规则 / 18.1KB），内联进 index.html，并把揭幕门从「等 style.css 到齐」改成「内联 CSS 解析完就放行」（6 处门控改动，详见 tools/_patch_css_ready.py）。

**结果：零收益，已整体回滚（index.html 复原到 b9947f4）。**

### 弱网实测时间线（15KB/s + RTT400ms，冷 profile，同口径）

| 时刻 | 1.6.48（无内联） | 内联 critical CSS 版 |
|---|---|---|
| 内联 CSS 生效（css-ready） | — | **3.7s** |
| style.css 真实到齐 | **56.9s** | 57.4s |
| `window.__game` 出现（主脚本执行） | **61.5s** | 62.0s |
| 启动幕揭开（`_bootDone`） | >67.7s | 63.0s |
| load 事件 | 67.7s | 75.7s |

### 为什么没用

1. **style.css 从来不是瓶颈**：它 56.9s 就到，比主脚本 61.5s 还早 4.6s。原来的揭幕门（`__hksAfterCss`）在 56.9s 就已经满足，只是没人来揭幕。
2. **真正的瓶颈是 main.js 连同它 441KB 的静态 import 图必须全部到齐才能执行**。ESM 依赖图不完整，`main.js` 一行都跑不了，`_revealTitle()` 自然无从触发。门开得再早也没用 —— 门后没人推。
3. 还倒贴 18.5KB HTML（index.html 42.8KB → 61.4KB），弱网下多花约 1.2s。

### 什么条件下路线 C 才会变成有效

只有先做完路线 B（标题页独立入口，把 `Game` 类整体延迟到点击「开始游戏」才 `import()`）：那时标题页由轻量 title.js 驱动，主脚本体积从 441KB 降到约 30KB，内联 critical CSS 才能让标题页在主脚本之后**不再**多等 142KB 的样式表。也就是说 **C 必须依附 B 才成立，单独做没有意义**。

### 顺带发现

- 建设中的「音乐预热」改动（`src/main.js` 的 `_warmStageMusic` / `songs/index.js` 的 `warmSongs`）会让首屏静态图变小（曲库改懒加载），这部分方向是对的，与路线 C 无关。
- 两个会话共用同一工作树，弱网测量会互相污染；本轮所有干净数据都在独立 `git worktree` + 独立端口上取。
