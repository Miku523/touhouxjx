# 启动幕（开屏 loading）设计 v2

> 状态：已实现（v2 全量门禁），待过目
> 范围：`index.html` 的 `#boot` 段 · `src/style.css` 的 `#boot` 段（含 `.boot-status`） · `src/game/bootScreen.js` · `src/main.js` 门禁接入（`_waitBootReady` 三路并联 + `_bootStatus` 状态行 + 进关音乐兜底 + 揭幕后 `_warmRemainingSongs`） · `src/engine/lazy_preload.js` 的 `holdIdleQueue()`
> 约束：纯 CSS + 原生 ES Module，零依赖零构建；所有尺寸乘 `var(--s)`，和 1280×720 逻辑画面永远同比例

## 0. 一句话

打开游戏先看到一片深紫夜空：金色「東方新紀行」逐字亮起，中间一条红→金的细进度条在真实加载，
底下「少女祈祷中」的三个点跟着亮。**标题图、进关模块、第 1 面曲目都到位后**启动幕才淡掉，
标题页在同一位置接上——不会出现「标题已经好了，点进去还要干等关卡和音乐」。

## 1. 版式

### 1.1 竖排结构（居中一列，重心上移 26px）

```
              ┌─ 月光晕（Logo 身后的圆）
      ▁▁▁     ← 38×2px 红→金短横（标题页 logo-block 的同款语言）
   東 方 新 紀 行         62px / 600 / 逐字竖直金渐变，5 字错 70ms 入场
    ～ Chronicle of Gensokyo ～   12px / 字距 3.4px / #ffd8a6 @82%
    正在绘制标题…            11px / 字距 1.4px / #ffe2be @58%（JS 动态插入的状态行）
    ────────────────       132×1px 淡金细线
  LOADING ▮▮▮▮▮▮───── 34%   460px 一行：左小标 + 3px 轨道 + 右百分比
       少女祈祷中 ···        13px / 字距 3px / 三个点错 220ms 呼吸
```

| 元素 | 关键尺寸 | 入场 |
| --- | --- | --- |
| 短金横 `.boot-rule-top` | 38×2px | `bootIn` .8s，延迟 .06s |
| 字标 `.boot-logo` | 62px / 600 / 字内 padding 10px 撑字距 | `bootCh` .78s，逐字 +60ms |
| 副标 `.boot-sub` | 12px，字距 3.4px | `bootIn` .9s，延迟 .34s |
| 状态行 `.boot-status` | 11px，字距 1.4px，`min-height` 15px 预留空位 | 无入场动画，`opacity` 0→1 于 .4s |
| 细线 `.boot-rule` | 132×1px | `bootIn` .9s，延迟 .4s |
| 进度行 `.boot-meter` | 宽 460px，轨道高 3px，间距 14px | `bootIn` .9s，延迟 .46s |
| 祈祷 `.boot-pray` | 13px，字距 3px | `bootIn` 1s，延迟 .54s |

字标的字距用**每个字的内边距**撑开而不是 `letter-spacing`：`background-clip: text` 会给整段渐变，
用 letter-spacing 会把渐变在字与字之间拉出断口。所以每个 `.bl-ch` 各自一段竖直金渐变
（`#fffdf7 → #ffefd0 → #ffd98f → #f0b355 → #ffe8b8 → #fffdf4`，178deg），和标题页 `#title` 同一套色。

### 1.2 夜空层（纯 CSS，全部 pointer-events:none）

| 层 | 做法 | 动 |
| --- | --- | --- |
| 底色 | 三层 radial-gradient 叠 `#05030a`：46% 处暗角、36% 处紫雾、底部 104% 一点残红 | — |
| 月晕 `.boot-glow` | 560px 圆，中心 `rgba(255,246,232,.13)` 暖白 → 粉 → 透明 | `bootBreath` 7.5s 呼吸 |
| 星点 `.boot-stars` | 16 个 1.2~1.8px 的点，一次多背景写完，位置固定无随机 | `bootTwinkle` 6.4s |
| 落樱 `.boot-petals` | 7 片，`nth-child` 写死 5%~95% 的横向起点与 16~24s 的周期，负延迟让首帧就在半空 | `bootPetal` 匀速位移+旋转 |
| 远近层次 | `scale: .66 / 1.22`（独立属性，不和 transform 动画打架）做三档大小 | — |
| 内框 `.boot-frame` | `inset: 13px`，1px 淡金边 + 四角 26px 角饰 | `bootFade` 1.4s |

内框**故意和标题页 `.title-mode .title-deco` 用同一套几何**（都是 inset 13px + 26px 角）：
启动幕淡出时边框留在原处，落到标题页时不会有任何位移。

## 2. 真实进度模型

进度不是假动画：每一格都对应主线程真做完的事。v2 起启动幕同时等三件事——标题三图、进关模块
（game kit）、第 1 面曲目——三路全绿才揭幕，挡掉「标题好了，但进关和音乐还没好」的中间态。

| 读数 | 对应事实 | 位置 |
| --- | --- | --- |
| 0.08 | 本模块构造完成（HTML/CSS 已出首帧，模块图加载完） | `src/game/bootScreen.js` 构造函数 |
| 0.10 | 门禁开始，三路并联：标题三图 / 进关模块 / 第 1 面曲目 | `main.js` `_waitBootReady()` |
| 0.10→0.42 | 标题三图各占 1/3，按 `decode()` 完成推进（每张 ≈ +0.107） | `main.js` `_bootGateTitleArt()` |
| 0.42→0.82 | 进关模块按已到货的 script 资源条数线性映射（`KIT_MODULE_EST = 49`，到货瞬间再抬到 0.86） | `main.js` `_bootGateGameKit()` |
| 0.86 | 进关模块全部到货（`loadGameKit()` 兑现：`stage.js` / `bullets.js` / `story.js` 及其依赖） | 同上 |
| 0.92 | 三路全绿：`window.__hksBootGate = { art, kit, music, done }`，`failed` 为空 | `main.js` `_waitBootReady()` |
| 0.94 | 门禁收尾，等标题首帧（保留原 0.94 里程碑语义） | 同上 |
| 1.00 | 最短停留 1400ms 到点后追满 | `bootScreen.js` `finish()` |

门禁的三条取舍（为什么不是「全等」也不是「只等标题」）：

1. **只等第 1 面音乐，不等全部 18 首**：18 首懒加载曲目 gzip 共约 291KB，弱网（15KB/s）要多等约 19s。
   第 2 面起由「进关前 `_ensureStageMusic()` 补齐本关曲目 + 提前一面 `warmSongs()` 预热」兜底，
   玩家走到那一关时曲目早已在缓存/解码队列里。
2. **失败不阻断**：任何一路失败只记进 `__hksBootGate.failed`（`kit` / `music` / `timeout`）+ `console.warn`，
   照常揭幕；`_revealTitle()` 发现 `kit` 未绿会补一次后台 `_prefetchGameKit()`，进关时 `ensureGameKit()`
   与 `_ensureStageMusic()`（最多等 4s）还会各等一次。开屏负责「尽量都到齐」，不当单点故障。
3. **门禁期间暂停空闲预取**：`lazy_preload.js` 的 `holdIdleQueue(true)` 让背景/立绘的空闲预取先排队，
   不和 game kit、曲目抢带宽；揭幕时 `holdIdleQueue(false)` 释放。所以 0.42→0.82 那段是真下载。
4. **其余曲目不进门禁、揭幕后空闲预热**：门禁放行时 `_warmRemainingSongs()` 把 6 面（含 EXTRA）的
   `musicPre` / `musicMid` / `music` 灌进 `warmSongs()` 的串行空闲队列，玩家看标题、挑难度、读过场剧情的
   空档慢慢到货；`linkTier() === 'constrained'` 时整段跳过（沿用「按需加载负责能用到的素材」的旧策略）。
   真到用还没好，进关前 `_ensureStageMusic()`（≤4s）仍会当场等。

状态行 `.boot-status` 只播报门禁真实阶段，不编台词：`正在绘制标题…` → `正在准备游戏资源与音乐…`
（两路谁先到就切成 `正在准备游戏资源…` / `正在准备音乐…`）→ `即将开始…` → `准备完成`。
文案由 `main.js` `_refreshBootStatus()` 按 `__hksBootGate` 的三个标志算，每路结算时刷一次；
`?bootgate=off` 时整行留空，进度条回退 v1 行为。

四条平滑规则，保证「不假」也不「难看」：

1. **只进不退**：`setTarget()` 收到比当前目标小的值直接忽略。倒着走的进度条比停住更让人怀疑卡死。
2. **追赶有上限**：每帧走剩余距离的 6 倍/秒，最快 95%/s、最慢 5%/s。缓存命中时三张图常在同一帧就绪，
   里程碑会瞬间连跳，条子要在 ~0.5s 内追平，而不是一帧跳到 100% 显得假。
3. **等图空档微爬**：目标和当前值咬住后，以 1.2%/s 微速爬行，最多越过目标 5%（不冒充下一段真实进度）。
   读数不会「粘」死不动。
4. **收尾贴满**：`target = 1` 且只差 1.5% 时直接到 100——指数追赶的尾巴会白拖半秒，肉眼又看不出。

最短总时长 `MIN_PAGE_MS = 1400`：素材全在缓存里也留住这一小段品牌过场；从 `performance.now()`
（navigation start）算，所以慢网不会额外多等。

**实测**（本地 8138 静态服务器，`performance.now()` 毫秒）：

```
v1（只等标题三图）：boot 154 / 三图就绪 314 / 开始追满 1414 / 满格 1668 / 揭幕 1706
v2（三路门禁）：    揭幕 1711–1714 / __hksBootGate = {art,kit,music,done} / failed = []
                    曲目 honou_pre1 · youma_stage1 与 kit 入口 stage · bullets · story 的 responseEnd 均 ≈ 87–96
                    时间线 boot > t10 > t21 > t31 > t42 > t86 > t92 > t94 > fill > full > hide
```

本地同机取数，三路几乎同时到，所以门禁只把揭幕推迟约 5ms；线上预热后预计多 0.3~0.6s，
冷启动/弱网时 0.42→0.86 段会跟着真下载一格格爬（这是有意的，不是卡住）。

## 3. 揭幕衔接

1. `finish()` 兑现（条子到 100%）后，`main.js` 等 **两帧**，确认标题页首帧已经画出来；
2. `boot.hide()` 加 `.done` → `opacity .55s` 淡出；
3. 900ms 后 `display: none`，把夜空的 CSS 动画彻底停掉（不占 GPU，也不影响战斗帧率）；
4. 标题页的内框与启动幕内框同位，淡出过程中边框不跳；
5. 标题页自己的入场动画（`src/title-intro.css`）同时在跑，两者的淡入淡出叠成一个过场。

## 4. 降级与边界

| 情况 | 行为 |
| --- | --- |
| JS 还没起来（首屏 CSS 阶段） | 只显示扫描光带在轨道里走（`--boot-p` 回退 0%）+ 读数 0%；菱形头先隐藏，JS 接管（`#boot.js`）后再出现 |
| `prefers-reduced-motion: reduce` | 夜空球、星点、落樱、扫描光带、内框、三个点全部 `animation: none`；条子本身仍按真实进度走（信息量，不是装饰） |
| 某张标题图 404 / `decode()` 抛错 | 该图按已就绪计数（`catch` 后照常 `ready += 1`），不会把条子卡在 2/3 |
| 标题图 8s 兜底 | 标题图那一路的 `Promise.race` 超时后按已就绪计数继续（v1 行为不变） |
| 门禁 90s 硬超时 | 三路没全绿也不再等，记 `failed: ['timeout']` 后揭幕；进关前 `ensureGameKit()` / `_ensureStageMusic()` 还会各等一次 |
| 门禁某一路失败（模块 404 / 曲目模块没就绪） | 只写进 `__hksBootGate.failed` 并 `console.warn`，不阻断揭幕；`kit` 未绿时 `_revealTitle()` 补一次后台预取 |
| `?bootgate=off` | 排障 / A-B 对照开关：只等标题图，回到 v1「揭幕后后台预取 game kit」的行为；状态行同时留空 |
| 状态行所在的 `#boot` 还没解析出来 | `_bootStatus()` 每路结算时重新找 `#boot .boot-sub` 作锚点，找不到就静默跳过，不影响门禁 |
| 限流链路（`linkTier() === 'constrained'`） | 揭幕后不做全曲库空闲预热（`_warmRemainingSongs()` 直接 return），进关前仍按需 `_ensureStageMusic()` |
| 后台标签页打开 | rAF 暂停 → 条子停在原处；切回前台继续追，不会在看不见的时候白白动画完 |
| `#boot` 元素缺失 | `BootScreen` 所有方法安全空转，`main.js` 的 `?.` 调用不影响启动 |
| 界面语言切换 | 「少女祈祷中」走语言包（`data-i18n`），缺译回退中文；「東方新紀行」是品牌汉字，不做外语版 |
| 从游戏内退回标题 | 启动幕只走一次（`hide()` 后 `display:none` 且 `done=true`），不会再盖住画面 |

## 5. 验证

```bash
node tools/_boot_qa.mjs          # 启动幕本体回归（需 8138 上有静态服务器，tools/serve_nocache.py）
node tools/_boot_gate_qa.mjs     # v2 门禁专项：正常网 / 节流 / kit 404 / 曲目 404 / 进关冒烟 / ?bootgate=off
node tools/_gate_v2_check.mjs    # v2 附加项：状态行文案与位置 + 揭幕后全曲库空闲预热（11 条）
```

门禁的验收契约（QA 套件按此断言）：

1. 揭幕瞬间 `window.__hksBootGate.done === true` 且 `failed` 为空；
2. 第 1 面两首曲目模块与三个 game kit 入口模块的 `responseEnd` 都早于 `#boot` 隐藏时刻；
3. 任何一路失败都必须在 90s 内揭幕（不锁死），失败项如实出现在 `failed` 里；
4. `?bootgate=off` 下行为与 v1 一致（不报错、揭幕后仍有后台 game kit 预取）。

性能口径：同一份冻结副本跑 `/index.html`（门禁开）vs `/index.html?bootgate=off`（门禁关），
差值即门禁净代价；另用 `git archive HEAD` 的旧版作参考行（注明含另一会话未提交改动）。

启动幕本体三段场景、13 条断言（v1 既有，v2 后重跑仍全绿）：

| 断言 | 目的 | 实测（本地 8138 + headless Edge） |
| --- | --- | --- |
| A 进度单调不倒退 | 条子不能倒着走 | 22 个采样点，0 次回退 |
| A 起点不是满格 | 不能一上来就 100% | 首个可读读数 8% |
| A 揭幕时 pct=100 | 揭幕瞬间必须是满格 | 100 |
| A 揭幕后 #boot 不可见 + display:none | 淡出要真的收尾（动画停掉） | `display: none` |
| A 揭幕后进入菜单 | 揭幕不能把标题页顶掉 | `state = menu` |
| A 总时长 ≥ 1.4s | 最短停留没被跳过 | 2249ms（Node 侧含采样开销） |
| B 开屏期间 Enter/Arrow 被门禁吃掉 | 不能盲选到「开始游戏」 | 仍是 `state = menu` |
| C 节流下进度条有中间态 | 慢网要看得出在动 | 53 个中间态采样 |
| C 节流下揭幕明显变慢 | 门禁确实占满加载窗口 | 6011ms（fast 下 ~1.8s） |
| C 节流下最终仍揭幕 / pct=100 | 不卡死、不跳动画 | 正常揭幕，pct=100 |
| 零 console error | 不引入新报错 | 0 |

v2 门禁专项套件（`tools/_boot_gate_qa.mjs`）定稿跑：**after 119/119 PASS（A–F 全绿）**；
base（`git archive HEAD` 旧版）69/86 通过，差距全部是门禁专属断言（探针缺失、揭幕时曲目未就绪、失败路径无 warn），
说明套件有区分度。关键实测：

| 场景 | 结果 |
| --- | --- |
| A 正常快网 | 揭幕 1922ms；`__hksBootGate={art,kit,music,done,failed:[]}`；stage/bullets/story end≈128.9ms、honou_pre1≈130.6ms、youma_stage1≈130.8ms，全部早于 revealT=1749.5ms；揭幕后 182ms 进难度页 |
| B 节流 700KB/s | 揭幕拉长到 5833ms，pct 出现 36 个不同值、timeline 18 档目标，逐格推进；最终 pct=100 |
| C kit 失败（404 stage.js） | 揭幕 1910ms（远小于 95s 上限）；`failed:["kit"]` + warn；进关 `ensureGameKit()` 再失败后退回难度页、不崩、#kitLoad 隐藏 |
| D 曲目失败（404 youma_stage1） | 揭幕 1883ms 不被阻断；`failed:["music"]`；进关 `_ensureStageMusic` ≤4s 兜底后舞台仍建（7532ms） |
| E 进关冒烟 | 揭幕 1970ms；三次确认进关，18 行开场对白后舞台 8024ms 建成，`soundingSong="pre1"`，#kitLoad 可见 0 次 |
| F `?bootgate=off` | 只跑标题图 `{art:true,kit:false,music:false,failed:[],done:true}`；揭幕后仍发起 stage.js 预取；无 console.error |

v2 附加项（启动幕状态行 + 揭幕后曲库空闲预热）由 `tools/_gate_v2_check.mjs` 覆盖，**11/11 PASS**：
状态行按 `正在绘制标题…` → `正在准备游戏资源…` → `准备完成` 播报（文案随三路到货顺序变化），
位置在副标下方（51×15px，未挤压布局）；揭幕时 `failed=[]`、三路全绿；揭幕后 9s 内 15 个曲库模块
（6 面 + EXTRA + EX 曲）出现在 ResourceTiming，说明空闲预热生效；零 console error。
`?bootgate=off` 下整行留空（见 F）。

定稿构建再跑一轮（含新增断言）：**135/135 全绿**——A 25 / B 27 / E 18 / F 16，外加 C/D 失败路径 49；
v1 的 119 条断言在新构建上全部保持通过。新增两条断言实测：状态行 rect 51×15 @top 336，`.boot-sub`
311–326 在其上方不重叠、DOM 顺序 `previousElementSibling = .boot-sub`；揭幕后 10s 曲库模块去重
A/E 各 17 条（档位 unknown → 预热生效），B 场景 700KB/s 实测 ≈197KB/s 判为 `constrained`、按设计跳过预热
（4 条），F 状态下 `text=""`、`on=false`、`opacity:0`。报告 `_gate/report/qa_v2_report.md`。

性能口径实测（同一冻结副本 `/index.html` vs `?bootgate=off`，本地 headless Edge，中位数）：

| 条件 | 揭幕（门禁开 / 关） | 门禁净代价 | 揭幕前已下载 |
| --- | --- | --- | --- |
| 本机无节流 | 1700 / 1702ms | ≈0（被 `MIN_PAGE_MS` 地板吸收） | 2.31 / 1.47MB |
| 700KB/s + 220ms RTT | 5649 / 3444ms | +2.2s | 2.26 / 1.02MB |
| 150KB/s + 220ms RTT | 17291 / 7845ms | +9.4s | 2.26 / 0.92MB |

dev server 不发 gzip，故上述是未压缩字节口径；按 kit 1.2MB→0.31–0.45MB、首面曲目 157KB→~50KB 折算，
真实部署的净代价约 700KB/s +0.5~0.6s、150KB/s +2.9~3.0s。三档下 `__hksBootGate.failed` 均空、console error 0。
性能取舍见 `_gate/report/gate_perf.md`。

已知非缺陷（记录备查）：`window.__boot.target` 是构造时快照（只同步 `pct`），QA 的「逐格推进」改用 pct 不同值数 +
timeline 档位判定；headless 偶发 `visibilityState="hidden"` 会让 rAF 降频、关内对白推进变慢，套件已加
`Page.bringToFront` + 点击兜底，与门禁逻辑无关。

配套的截图脚本（临时，未入库）：`_pt/_boot_shots.mjs`（冻结在 12/34/62/88/100% 与纯 CSS 阶段）、
`_pt/_boot_trans.mjs`（揭幕中间帧 + 1600×900 缩放比例）。

## 6. 调参速查

| 想改什么 | 改哪里 |
| --- | --- |
| 字标字号 / 逐字节奏 | `src/style.css` `.boot-logo`（62px 与 `filter`）、`.bl-ch` 的 `animation-delay` |
| 进度条宽度 / 粗细 | `.boot-meter` 的 460px、`.bm-track` 的 3px |
| 条子配色 | `.bm-fill` 的 `linear-gradient(90deg, rgba(232,54,79,.72), #f2d24b 58%, #fff6da)` |
| 最短停留时长 | `src/game/bootScreen.js` `MIN_PAGE_MS`（1400） |
| 追赶速度 | 同文件 `_tick()` 里的 `Math.min(0.95, Math.max(0.05, gap * 6))` |
| 微爬速度 | 同文件 `CREEP_PER_SEC`（0.012 = 1.2%/s） |
| 淡出时长 | `src/style.css` `#boot` 的 `transition: opacity .55s`，以及 `hide()` 里的 `setTimeout(..., 900)` |
| 门禁硬超时 | `src/main.js` `BOOT_GATE_TIMEOUT_MS`（90000） |
| 进关模块估数（0.42→0.86 的映射分母） | `src/main.js` `KIT_MODULE_EST`（49；依赖图变化时同步改，只影响观感不影响门禁） |
| 启动幕要等哪些音乐 | `src/main.js` `_bootGateStage1Music()`（现在只等第 1 面的 `musicPre` / `music`） |
| 揭幕后预热哪些音乐 | `src/main.js` `_warmRemainingSongs()`（LEVELS 全部曲目；受限链路跳过） |
| 状态行文案 / 位置 | `src/main.js` `_refreshBootStatus()` 里四条分支；样式 `src/style.css` `#boot .boot-status`，锚点 `.boot-sub` |
| 门禁期间是否暂停空闲预取 | `src/engine/lazy_preload.js` 的 `holdIdleQueue()` 调用点（`main.js` 构造函数 / `_waitBootReady`） |
| 夜空的夜色 / 月晕位置 | `#boot` 的 `background` 三层 radial、`.boot-glow` 的 `top: 30%` |
| 落樱数量 / 疏密 | `.boot-petals i` 的 `nth-child` 起点与周期（现在 7 片） |

## 7. 有意不做

- **不做假进度条**：0.10→0.42 严格跟着三张标题图的 `decode()` 走，0.42→0.86 跟着 game kit 真到货的
  模块数走（ResourceTiming），都是真事；缓存命中时跳得快，那是对的。
- **不塞小贴士 / 版权行 / 「按任意键」**：这一屏只承担 1~2 秒的品牌过场，字越多越像卡住。
  唯一的例外是 `.boot-status` 那行门禁状态：它播报的是真实阶段（在等什么），不是随机提示文案。
- **不画立绘 / 不复用标题插画**：开屏的任务是「让玩家知道在加载」，插画留给标题页；全屏深色也能让
  标题页的粉紫云海一亮出来就是“开场”。
- **不加音效**：浏览器在首次手势前不放声，开屏放音只会被静音策略吞掉。
