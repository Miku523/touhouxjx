# UI 排布与功能优化方案（v1.7 后）

目标：桌面（≥1280×720、1440×900）与移动端（iPad 横、Fold 竖、360×640）同一套 DOM，
  文字不再被等比缩到不可读，任何视口下无遮挡、无横向溢出、按钮均可点。

## 一、现状问题（有截图/代码证据）

1. **单一缩放因子**
   `src/engine/renderer.js:196-205` 把 canvas 的 `scale` 同时写进 `--s`，DOM 叠加层一律 `calc(var(--s) * 16px)`。
   竖屏手机按宽适配时 `--s≈0.3`，16px 正文变 ~5px；`_shots_mobile/fold/portrait/09-settings.png` 里设置项文字约 10px。
2. **没有真正的断点体系**
   `src/style.css` 4550 行，媒体查询只有 6 条（`max-height:820px` ×4、`max-height:560px` ×2、`orientation:portrait` ×1）。
   竖屏/窄屏完全无断点，布局仍是 16:9 内的绝对定位 + 事后覆盖。
3. **覆盖层债务**
   `.hint` 在 style.css 定义 7 次（649/723/897/994/1058/1887/2199/2666/2780/2797/2810），
   `overlay.screen-mode` 在 1208/1887/2199/2666 反复重写同一批属性。改一处排布要动 3~5 个地方。
4. **设置页靠遮挡解决溢出**
   `09-settings.png`：底部「重新开始本关 / 返回暂停菜单」吸底条压住「操作」分组，
   「帧率上限」这一行被「音效」卡片盖住。原因是网格高度不受控 + 底栏绝对定位。
5. **标题页竖屏按钮层不可见**
   `_shots_mobile/fold/portrait/11-title-back.png` 只剩插画与 PWA 安装条，`#buttons` 未出现在可视区，
   需查 `.title-mode` 的定位与 `overflow:hidden` 裁剪。
6. **字号/间距无 token**
   数值散落各处（`--s * Npx`、`clamp()`、写死 px 混用），无法一次调整密度。

## 二、方案

### 批次 1：基础层（不动视觉，先拆依赖）

- **缩放拆分**：`renderer.js` 保留画布 `scale`，另算 `uiScale = clamp(scale, 0.72, 1.5)` 写入 `--s-ui`；
  `#ui` 与所有 UI 尺寸改用 `--s-ui`，画布坐标不受影响。
- **密度 token**：`:root` 增加 `--fs-sm/base/lg`、`--gap-1..4`、`--row-h`、`--radius`，
  现有 `calc(var(--s)*Npx)` 逐步映射到 token（按 section 改，不全局替换）。
- **断点收敛**：统一为 4 组
  `(max-width:560px)` 窄竖屏 / `(561-899px)` 中 / `(min-width:900px)` 宽 / `(max-height:560px)` 短屏，
  删掉重复的 820px 特例。
- **去重**：`.hint`、`.overlay.screen-mode` 的重复定义合并为单一规则块，删 5 处冗余。
- **z-index 表**：`HUD 10 / 关卡横幅 20 / 菜单 30 / toast 40 / 确认弹窗 50`，写进 :root 注释。

### 批次 2：标题页 + 主菜单

- 结构固定为三段：logo → 按钮区 → 底部装饰（版本/语言）。不再依赖绝对居中。
- `#buttons` 分组（复用 `main.js:599-650` 已有的 `group` → `.set-group` 卡片机制）：
  1. 开始 / 继续 / 角色·难度
  2. 画廊 / 音乐室 / 排行 / 练习 / 回放
  3. 设置 / 语言 / 关于
- 宽屏 2 列（`.buttons.grid2` 已有，1084 行），窄屏与竖屏单列；竖屏按钮区改为占满可视高并内部滚动。
- 交互：最小点击区 44px、统一 focus ring（已有 a11y.css，补 `:focus-visible` 一致性）、
  Tab 顺序与现有 ↑↓/Enter 键盘导航对齐；菜单记忆上次停留项（localStorage，键 `hks.menu.last`）。
- 修 11-title-back 的按钮不可见（定位 + 裁剪）。

### 批次 3：设置页

- 容器改为「sticky 页头 + 内部滚动区 + sticky 底栏」，内容不再被底栏遮挡。
- 网格：`grid-template-columns` 在 ≥760px 两列、以下单列；卡片高度 `auto`，`align-items:start`。
- 行布局统一为「标签（左，可折行）| 控件（右，固定列宽 120-160px）」；滑杆与分段控件同高 `var(--row-h)`。
- 分组可折叠，折叠状态记忆（`hks.settings.collapsed`）；默认全展开，短屏默认只展开「声音」。
- 危险项（重置数据/清档）单独一组，保留二次确认，底栏只留「返回」。

### 批次 4：游戏内 HUD + 子页面

- HUD 顶部按 `env(safe-area-inset-*)` 内缩；窄屏把 lives/power/score 收成单行紧凑条，
  BOSS 血条下移贴顶栏；触屏方向键/按钮区不压 HUD（已有 `#touch` 与 `virtualPad.js` 两套，需确认只启用一套）。
- 画廊/音乐室/排行：统一页头（返回 + 标题 + 计数）与卡片网格 `repeat(auto-fit, minmax(180px,1fr))`。
- 音乐室左目录/右唱片在窄屏改上下堆叠（3783 行两栏断点）。

### 功能优化（低成本、顺手）

- 分组折叠状态与菜单停留项记忆（上面已含）。
- 所有页面 Esc 行为一致：子页 → 上级，菜单 → 关闭/返回，不直接退出游戏。
- 按钮上的快捷键标签统一渲染（现在有的行有 `key` 有的没有），只做显示层统一。
- **不做**：主题皮肤系统、拖拽布局、自定义 UI 缩放滑杆（等基础层稳定后再议）。

## 三、验收

新增 `tools/ui_viewports.mjs`（复用 `_lq_sweep.mjs` 的 playwright 方式），一次跑 5 个视口截图 + 断言：

| 视口 | 断言 |
| --- | --- |
| 1440×900 | 无横向滚动，设置页两列，底栏不遮内容 |
| 1280×720 | 主菜单 2 列，全部按钮可点 |
| iPad 1024×768 横 | 设置页两列，HUD 不贴边 |
| Fold 673×997 竖 | 标题页按钮可见；设置页单列可滚动；正文 ≥11px |
| 360×640 | 无溢出；点击区 ≥44px |

判定口径：`document.documentElement.scrollWidth <= innerWidth`、关键元素 `getBoundingClientRect` 不与底栏相交、
最小字号由 `getComputedStyle` 采样。

## 四、落地顺序与风险

1 → 2 → 3 → 4，每批次独立提交并跑一次截图断言。
批次 1 只改缩放与 token 映射，视觉应基本不变；若某屏字体突然变大/变小，说明该处混用了 `--s` 与像素值，按屏修。
批次 2/3 会动结构（sticky/滚动容器），需回归暂停菜单、键位设置页、回放/练习子页。

## 五、落地记录（已完成，2026-11-21）

改动集中在两处，旧规则一条没删，全部由文件末尾的 `LAYOUT v2` 区块覆盖裁定：

- `src/engine/renderer.js:201-210`：新增 `--s-ui`（`scale` 夹在 0.78～1.5 之间）与 `html[data-ui-dense]`。
  画布仍按 16:9 letterbox，菜单/覆盖层改用 `--s-ui`，竖屏手机不再出现 5px 字。
- `src/style.css` 末尾 `LAYOUT v2` 区块：
  - token：`--s-ui / --gap-1..3 / --tap:44px / --z-*` 层级；`.overlay{--s:var(--s-ui)}`。
  - 点击区：`.btn/.set-row` 最小 44px（桌面 `hover:hover` 时 34px），`:focus-visible` 统一描边。
  - 窄屏 `@media (max-width:900px),(orientation:portrait)`：`.overlay{position:fixed}` 铺满视口、
    `.panel` 可滚动、标题页改 flex 贴底 + 满宽按钮 + 菜单渐深底、底栏吸底。
  - 设置页：`.set-grid` 改 `auto-fit minmax(290px,1fr)` 自动流，删掉手工 `grid-row` 摆放；
    行内改为「装不下就换行」，热键 chip 右对齐，info 行文本可换行。
  - 短屏 `@media (max-height:720px) and ((max-width:900px) or (orientation:portrait))`：
    标题 32px、副标题隐藏、按钮 38px。
  - `#hud` padding 改用 `max(计算值, env(safe-area-inset-*))`，刘海/挖孔屏不留死角。
- 缓存版本：`index.html`/`sw.js`/`src/ui/platform.js` 统一升到 `1.7.1`（CACHE_VERSION `hks-v1.7.1`）。

验收工具：`node tools/ui_viewports.mjs`（需先起静态服务器 8138）——5 个视口 × 标题/设置，
另加 360x640 下 5 个子页面；断言 `overflowX / panelOutOfView / minFont / rowH / coveredRows`，
截图落 `.tmp_shots/ui_v2/`。

### 后续（原「明确不做」，已在第六节完成）

- 音乐回忆室 / 幻想乡图鉴 / 排行榜 / 录像回顾：本轮原先留作独立议题，见第六节已落地。

## 六、四子页面重排（SUBPAGE v2 / v2.1，2026-11-21）

病根不是页内排版，而是坐标系：四页根节点都是 `position:absolute; inset:0`，被锁在 16:9 的 stage 里，
360 宽手机上 stage 只有 205px 高，整页缩成中间一条。所以先换坐标系，再调版式。

样式来源分裂，改动全部追加在 `src/style.css` 末尾（旧规则一条没删）：

- `musicRoom` 的样式本来就在 `src/style.css`；`gallery / ranking / replayRoom` 各自在模块 JS 里
  `document.createElement('style')` 注入，注入表后插入、同特异性即赢 —— 所以覆盖一律多带一层祖先
  （`.gg .x`、`body .rr`）靠特异性压，不赌顺序。

窄屏 `@media (max-width:900px),(orientation:portrait)`：

- `body .mr, body .gg, body .rk, body .rr { position: fixed; inset: 0; --s: var(--s-ui) }`，
  frame 改 `inset:0; width/height:auto; max-height:none; border-radius:0`（铺满真实视口）。
- 四页页头统一 `display:grid; grid-template-columns:minmax(0,1fr) auto`：标题 1/1，计数与 tab 1/2，
  标题 `nowrap + ellipsis`；图鉴计数落到第二行。
- 音乐室：单列，列表自身滚动、详情常驻
  （`.mr-body{flex:1 1 auto;overflow:hidden}`、`.mr-list-wrap` 竖 flex、`.mr-list{flex:1 1 auto;overflow-y:auto}`、
  `.mr-detail{flex:0 0 auto}`）；唱片缩到 92px 与文字并排；底部键位提示触屏隐藏。
- 图鉴：列表滚动 + 详情吸底（`.gg-side{max-height:40%;overflow-y:auto;border-top}`）。
- 排行：筛选两组各占一行、chip 横向滑动；行模板收窄并隐藏擦弹列；空状态改虚线卡。
- 回放：页头两行、列表上半屏可滚、键盘提示隐藏。

视觉层次（宽屏同样生效的 `SUBPAGE v2` 块 + 窄屏块）：

- 四页面板统一质感：`background-color: rgba(9,7,16,.96)` + 金色顶光 / 冷色右下 / 纵向渐变三层、
  内高光 `inset 0 1px 0 rgba(255,255,255,.07)`、`backdrop-filter: blur(3px)`。
- 图鉴/排行叠 1px 扫描线与边缘压暗；表头加金色分隔线；行 hover 改暖色高亮 + 过渡。
- 安装条（`.hks-install`）会让位：`body:has(> .hks-install.show) …{padding-bottom: calc(env(safe-area-inset-bottom) + 84px)}`。

验收：`SUB_VPS='[{"name":"fold-673x997","w":673,"h":997,"dpr":2,"mobile":true}]' node tools/ui_viewports.mjs`
（`SUB_VPS` 覆盖子页面视口）。实测 360x640 / 673x997 / 1024x768 / 1440x900 四页 `overflowX` 均为 0，
360 下正文 11px 级可读、按钮可见。缓存版本随之升到 `1.7.2`。

## 七、样式表合并与去重（2026-11-21）

目标：`src/style.css` 末尾不再堆"覆盖块"，同一属性只留最后生效的那一条定义。

怎么改的、怎么证明没改坏：

1. **先建立"改动前后计算样式指纹"基线**：`node tools/_css_snapshot.mjs <out.json>` 驱动 Edge headless，
   5 个视口（1440x900 / 1280x720 / 1024x768 dpr2 / 673x997 dpr2 / 360x640 dpr2）× 7 个状态
   （标题 / 设置 / 音乐回忆室 / 幻想乡图鉴 / 排行榜 / 录像回顾 / 操作说明）= 35 态，
   对每个元素取全量 `getComputedStyle` 做 sha1。
2. **同版本抓两次**得到"噪声集合"（设置页开关、唱片与均衡器、说明书 canvas 有动画/随机），
   之后只把不在噪声集合里的差异算作回归：`node tools/_css_diff.mjs before.json after.json noise.json`，
   输出 `VERDICT: OK` 才算过。
3. **机械去重**：`tools/_css_merge.py`（一次性）按括号配对解析 at-rule 作用域链 + 选择器 + 声明区间，
   只删"同一作用域链 + 同一选择器文本 + 同一属性名 + 后出现的同属性覆盖前面"的声明，
   `!important` 不对称时不删。删掉 **110 行**被判死的声明，跑两遍确认幂等（第二次 removed 0）。
4. **结论（重要）**：末尾那三段不是纯粹的重复代码。除了已删的死声明，其余都是**条件化叠加层**
   （`html.touch` 前缀、`@media` 断点），构成长度不同的另一条分支，删任一条都会改变真机表现
   ——实测删掉设置页的手工 `grid-row` 摆位会让触屏短屏布局位移（`html.touch` 让旧规则特异性更高）。
   所以合并 = 去重 + 重命名分区，而不是"把末尾整段删掉"。

改完的分区命名（文件尾）：

- `响应式与布局层：缩放 / 断点 / 点击区 / 层级`（原 `LAYOUT v2`）
- `四子页面：音乐回忆室 / 幻想乡图鉴 / 排行榜 / 录像回顾`（原 `SUBPAGE v2`）
- `四子页面：小屏（≤900px / 竖屏）细节`（原 `SUBPAGE v2.1 返工`）

验证：改前基线 vs 改后 `VERDICT: OK (only known-volatile elements differ)`；
`node tools/ui_viewports.mjs` 5 视口全绿（`overflowX` 全 0、`panelOutOfView` 全 false）。
缓存版本升到 `1.7.3`。

两个验证工具留在 `tools/`（`_css_snapshot.mjs` / `_css_diff.mjs`），以后改样式先跑一遍基线再改。
