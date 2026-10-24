# 设置区整改 · 四语言切换设计 v1

> 状态：待验收（已按主人拍板的四个前提设计）
> 范围：设置区新增「简体中文 / 繁体中文 / English / 日本語」切换；标题页加快捷入口。
> 原则：纯原生 ES Module、零依赖零构建，不引入打包器与 npm 依赖。

## 0. 已确认的四个前提

| 项 | 结论 |
| --- | --- |
| 覆盖范围 | **全量**：界面 + 专名 + 剧情对白 + 结局正文 + 曲目解说 |
| 入口 | 设置页「画面」卡首行（唯一入口；标题页快捷胶囊已按主人要求取消） |
| 首启默认 | 跟随浏览器语言（手动选过则永远以选择为准并持久化） |
| 繁中生产 | 人工词表 + 四语专名固定译法表（不做纯自动简转繁） |

## 1. 目标 / 不做什么

做：

- 四种语言热切换，不刷新页面、不丢存档、不打断对局。
- 语言选择持久化（`hks.settings.v1.lang`），首启跟随 `navigator.languages`。
- 字体随语言切换（繁中/日文用各自的明朝/宋体栈，避免简体字形）。
- 全量文本可翻译、可增量回填、缺译时优雅回退中文。

不做（除非另行追加）：

- 标题汉字品牌图形不做外语版拉丁标题（副标 `～ Chronicle of Gensokyo` 本来就是英文）。
- 语音与 UI 图片本地化；`assets` 内美术不随语言变化。
- 玩家自定义键位的 `ACTION_DEFS.label` 进语言包（按键名如「跳跃」语言包里翻，但键位记录仍是 code）。

## 2. 交互设计

### 2.1 设置页：语言行

位置：「画面」卡首行（语言是显示层设置，且只有这里跨页通用）。

```
┌ 畫面 ────────────────────────────────────────────┐
│ 语言    [ 简中 ][ 繁中 ][ EN ][ 日文 ]        L   │
│ 画质    [ 自动 ][ 高 ][ 低 ]                  G   │
│ 当前渲染  自动 · backing 1.0 · bloom 开           │
│ 屏幕震动  ●──                                H   │
│ 帧率上限  [ ∞ ][ 30 ][ 60 ][ 120 ]           F   │
└───────────────────────────────────────────────────┘
```

- 控件沿用 `.seg` 皮肤（现有画质/帧率同一套视觉），四段各 2 字以内，宽度自适应。
- 交互：`↑↓` 定位 → `←→` 前后切换、`Enter` 同点击、`L` 直接切下一个语言；鼠标/触屏直接点某个语言块即切（阻止冒泡，不再触发整行 onPick）。
- 切换后整页 `_showSettings(this.menuIndex, origin)` 重建，当前行高亮跟随。
- 说明文案：页面副标末尾追加「语言即时生效」，不再额外占行。

### 2.2 标题页快捷胶囊（已取消）

> **2026-10-24 主人拍板取消**：标题页右下角不再放语言胶囊，四语切换只从设置页进入。
> `#langPill` 的 DOM、`.lang-pill`/`.lang-chip` 样式、`_renderLangPill()` 均已移除。
> 理由：标题页已经承载 logo、插画、开屏动画与六行菜单，再加悬浮控件会抢视觉；设置页的行控件也已够用。

### 2.3 切换时的行为

| 场景 | 行为 |
| --- | --- |
| 标题页切 | 标题页不提供入口；`html.lang` 只随设置页的切换同步 |
| 设置页切 | `_showSettings(i, origin)` 重建，选中行与滚动位置保持 |
| 暂停菜单切 | `_showPause()` 重建 |
| 对话中切 | 重新渲染当前一行（不推进对话、不播打字机动画、不重置已读进度） |
| 战斗中切 | 只刷 HUD 文本（关卡名/符卡名/提示），不触碰弹幕与计时；只有 `?lang=` 预览这一条路径，正常不会发生 |
| 音乐回忆室切 | 列表与当前曲解说重渲染，播放状态保持 |
| 结局演出切 | 当前章节与行重渲染，letterbox 演出继续 |

## 3. 判定与持久化

优先级（从高到低）：

1. URL `?lang=zh-Hant|zh-Hans|en|ja` —— 仅本次生效，不写入设置（方便给外语朋友发链接）。
2. `hks.settings.v1.lang` —— 玩家手动选过的。
3. `navigator.languages` —— 按顺序取第一个能识别的：
   - `^ja\b` → ja
   - `^en\b` → en
   - `^zh(-|_)(tw|hk|mo|hant)` → zh-Hant
   - `^zh` → zh-Hans
   - 其他/失败 → zh-Hans
4. 都没有 → zh-Hans。

旧档兼容：`lang` 字段缺失 = 未手动选过（继续走自动判定），不写默认值；第一次手动点击才写入。

## 4. 架构

### 4.1 目录

```
src/i18n/index.js         // 运行时：tr / setLang / getLang / load / onChange / 回退
src/i18n/glossary.js      // 专名固定表（简 → 繁/英/日）
src/i18n/packs/zh-hant.js // { "原文": "譯文", ... }
src/i18n/packs/en.js
src/i18n/packs/ja.js
tools/i18n_extract.mjs    // 扫描 src/ + index.html → locales/_source.tsv
tools/i18n_build.mjs      // 合并译文 → packs/*.js + 覆盖率报告
locales/*.tsv             // 人工/校对工作区（不进部署）
```

`index.html` 只多一个 `<script type="module" src="./src/i18n/boot.js?v=…">` 或直接由 `main.js` 首行 `await initLang()`（推荐后者：避免多一次请求，`main.js` 是 module，可 top-level await）。主入口需在 `new Game()` 之前完成语言判定 + 首次语言包加载，首屏才不会闪中文。

### 4.2 键策略：原文为键

`tr('设置')` → 查当前语言包字典。理由：

- 剧情 1194 句 + 结局 274 句不用加 id、不改数据结构，`dialogue.js` 只在渲染处包一层 `tr()`。
- 语言包可读可 grep，翻译/校对直接看源文，不需要另一张对照表。
- 缺译 → 回退中文原文，增量交付永远不崩。
- 代价：包体多存一份原文（gzip 后每语言约 +30~40KB，懒加载可接受）。

模板化字符串改写为显式占位符：`tr('第 {n} 面', { n: 3 })`；`{me}/{partner}/{self}` 这类在 `_subst` 之前先用 `tr()` 处理模板，再替换。

### 4.3 缺译与回退

`tr(text, vars)`：
1. `packs[lang]?.[text]`；
2. 繁体/日文缺 → 不再回退到别的外语（避免混排），直接原文（简中）；
3. 开发模式 `console.warn` 一次性汇总缺译条数（不做逐条刷屏）。

发布门禁：UI 层（菜单/设置/HUD/说明/暂停/结算/音乐室外壳）覆盖率必须 100%；剧情/结局允许先上线、按章回填，门禁只告警。

### 4.4 语言包加载

- 中文（zh-Hans）不需要包：原文即译文。
- 其余三语 `import('./packs/en.js')` 动态加载，按需、带缓存；失败时静默回退并保留中文，不阻断开玩。
- 预算：单包 gzip ≤ 60KB（原文+译文），懒加载所以首屏零成本；不得把包塞进 `main.js`。

### 4.5 渲染刷新

- DOM 文本统一 `tr()`；`index.html` 内的静态文案（启动幕 tip、对话「空格继续」、SKIP、aria-label）用 `data-i18n` 标记，`setLang()` 时批量替换。
- 每个屏幕的重建入口集中到 `applyLang()`：按当前屏幕类型调用 `showTitle / _showSettings / _showPause / 对话重绘 / 音乐室重绘 / 结算重绘`。新屏幕只需在 `applyLang` 里加一条分支。
- Canvas 内文字只有 6 处（`boss.js` 连击/COUNTER/DASH/STAGGER/贴身压制、`stage.js` 的 `'P'`），绘制时直接 `tr()`，不缓存。
- HUD 是 DOM（`hud.js` 全 `textContent`），语言切换时 `_refreshHudTexts()` 一次即可，不重建整个 HUD。

## 5. 专名表（glossary v1 摘录）

| 简中 | 繁中 | English | 日本語 |
| --- | --- | --- | --- |
| 博丽灵梦 | 博麗靈夢 | Reimu Hakurei | 博麗霊夢 |
| 雾雨魔理沙 | 霧雨魔理沙 | Marisa Kirisame | 霧雨魔理沙 |
| 芙兰朵露·斯卡雷特 | 芙蘭朵露·斯卡雷特 | Flandre Scarlet | フランドール・スカーレット |
| 雷米莉亚·斯卡雷特 | 雷米莉亞·斯卡雷特 | Remilia Scarlet | レミリア・スカーレット |
| 西行寺幽幽子 | 西行寺幽幽子 | Yuyuko Saigyouji | 西行寺幽々子 |
| 射命丸文 | 射命丸文 | Aya Shameimaru | 射命丸文 |
| 幻想乡 | 幻想鄉 | Gensokyo | 幻想郷 |
| 符卡（スペルカード） | 符卡 | Spell Card | スペルカード |

规则：

- Boss 名与符卡名以日文原名/官方写法为准（英日都用官方转写）；灵梦/魔理沙沿用 `靈夢/霊夢`、`魔理沙`。
- 符卡引号结构保留：`QED「495年の波紋」`；英文 `QED "495-Year Wave"`。
- 短名（`dialogue.js` 里 灵梦/魔理沙）单独一条，不靠截断全名。
- 专名表是唯一真源：语言包生成时若出现专名，由 `glossary.js` 覆盖，禁止各文件各自译名。

## 6. 字体与排版

`html[lang]` 覆盖 `--serif`：

| lang | 栈 |
| --- | --- |
| zh-Hans（默认） | 现有 `Songti SC, STSong, SimSun, Noto Serif CJK SC …` |
| zh-Hant | `Songti TC, 儷宋 Pro, PMingLiU, Noto Serif CJK TC` |
| ja | `Yu Mincho, Hiragino Mincho ProN, Noto Serif CJK JP, MS PMincho` |
| en | `Optima, Palatino Linotype, Georgia, serif`（标题字保留衬线气质） |

排版约束：

- `.seg b` 由固定 `min-width:38px` 改为按内容自适应（`min-width:2.6em`），英文 `AUTO/HIGH/LOW` 不会被裁。
- 设置行 label 允许 `text-overflow:ellipsis`，但不换行（行高固定）。
- 英文菜单按钮放宽 `--btn-w`，长度超过 14 字符的按钮自动降一号字（`.title-mode .buttons b[data-len="long"]`）。
- 对话气泡按 `lang` 放宽行数上限：英文平均比中文长 40%~60%，`dlg-text` 的 max-height 需允许 4 行。
- 日文避免「保存/戻る」这类长词：按钮文案优先用 2~4 假名（戻る/保存/再開）。

## 7. 翻译数据管线

```
src/**.js + index.html
      │ tools/i18n_extract.mjs（去重、跳过注释/正则、按文件分组）
      ▼
locales/_source.tsv        [file, line, key(原文), 用途(ui/story/boss/music), 繁中, en, ja]
      │ 人工/校对按列填
      ▼
tools/i18n_build.mjs       → src/i18n/packs/*.js + coverage.md（缺口清单）
```

- `_source.tsv` 可重跑；已翻的行按原文 key 保留，源文改动 → 该行标记 `STALE`，回退原文并进缺口。
- 覆盖率报告按模块统计：`ui 100% / boss 100% / music 100% / story x% / ending x%`。
- 剧情按章节拆分批次（一面/二面/…/Extra），每批翻完即可上线，不必等全量。

## 8. QA 与验收

- 新增 `tools/_pt_i18n.mjs`（沿用 `_pt_core.mjs`）：4 语言 × 6 屏（标题/设置/暂停/对话/结算/音乐回忆室）截图矩阵，输出 `_pt/i18n/`。
- 自动检查：`html.lang` 正确、切语言后 `hks.settings.v1` 写入、刷新后保持、`?lang=` 覆盖不落盘、无 console 报错/4xx、按钮仍可点（热键回归 L/G/F/H/M/N/B/K/ESC）。
- 人工检查：无方块字（缺字形）、无截断、无溢出、无「简繁混排」（繁中页不出现简体字形）。
- 回归门禁：`node tools/_pt_lead_regression.mjs` 全绿；`tools/_i18n_count.mjs` 的缺译计数为 0（正式发布前）。

## 9. 分期与工时

| 期 | 内容 | 估时 |
| --- | --- | --- |
| P0 | i18n 运行时 + 设置语言行 + 字体 + 持久化 + 判定（标题胶囊取消） | 0.5–1 天 |
| P1 | 界面层 & 专名三语 + 校对（约 300 条） | 1 天 |
| P2 | 剧情 1194 + 结局 274 + 曲目解说 164（可灵梦线/魔理沙线并行） | 2–3 天 |
| P3 | 截图矩阵 + 覆盖率门禁 + 部署版本号递增 | 0.5 天 |

## 10. 待确认

1. **标题汉字**：四语统一保留「东方新纪行 / 東方新紀行」汉字（品牌图形），英文不加拉丁标题 —— 建议保留，改造成本 ≈ 0。
2. **曲目解说是否进包**：音乐回忆室能看 164 条解说，进包才不混排；但它是长文，翻译与校对成本最高。建议进（P2 里单独一批）。
3. **语言包随仓库发布**：三个包共约 300–400KB（gzip 120KB 左右）静态文件，按需加载，首屏无感。若不愿增大 repo，可后续挪到 CDN。

---

**实现顺序（P0 具体改动点）**

1. `src/i18n/` 落地（index/glossary/packs 空壳 + boot）。
2. `index.html`：`<html lang>`、`#langPill`、静态文案 `data-i18n`、`?v=` 递增。
3. `src/main.js`：`_detectLang()`、`_applyLang()`、`_showSettings` 语言行、`_saveSettings/_loadSettings` 增 `lang`、`_refreshHudTexts()`。
4. `src/style.css`：`.seg-lang`、`.lang-pill`、`html[lang]` 字体栈、英文长文案适配。
5. `tools/i18n_extract.mjs` + `i18n_build.mjs`，产出首批 `_source.tsv`。
