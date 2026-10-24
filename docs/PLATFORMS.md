# 多端平台层 · PLATFORMS

> 代码：`src/ui/platform.js` + `src/ui/platform.css` + `manifest.webmanifest` + `sw.js`
> 目标：一份 Web 构建同时跑在桌面浏览器、iOS Safari/PWA、Android Chrome、鸿蒙、微信/QQ 内置浏览器里；
> **桌面端表现必须与没有平台层时完全一致**，所有移动端修复都靠 `<html>` 上的 class 门控。

---

## 一、接入方式（index.html 只需一行）

```html
<!-- <head> 里：平台层样式（桌面不产生任何可见规则） -->
<link rel="stylesheet" href="./src/ui/platform.css?v=1.6.1" />
```

- **不要再用 `<script type="module" src="./src/ui/platform.js">` 单独引入**：`src/main.js` 已经 `import` 了平台层，模块加载时自动调用 `initPlatform()`。再加一个带 `?v=` 的 script 标签会形成两个模块实例（安装条、返回键、音频解锁监听各挂两遍）。
- 业务要接「返回键」时再调一次即可（不会重复初始化，只更新回调）：

```js
import { initPlatform } from './src/ui/platform.js?v=1.6.1';

initPlatform({
  onBack: () => {
    // 用户在游戏里按了安卓返回键 / 侧滑返回
    // 例：从关卡回到标题；平台层会重新压栈，页面不会被退掉
  },
});
```

- 随时取状态：`import { platform } from './src/ui/platform.js'`，控制台可看 `window.__hksPlatform` / `window.__hksEnv`。

---

## 二、环境识别（职责 1）

UA + Client Hints（`navigator.userAgentData`）+ `navigator.standalone`
+ `matchMedia('(display-mode: standalone)')` + `matchMedia('(pointer: coarse)')`。

| 字段 | 判定 | 说明 |
| --- | --- | --- |
| `ios` | iPhone/iPad/iPod；iPadOS 13+ 伪装 macOS 时用 `maxTouchPoints > 1` 拆穿 | |
| `android` | UA `android` / Client Hints platform=Android | |
| `harmony` | UA `HarmonyOS` / `OpenHarmony` / `ArkWeb` | HarmonyOS NEXT 的 ArkWeb 内核 |
| `wechat` | UA `MicroMessenger` | |
| `qq` | UA `QQ/x.y` / `MQQBrowser` / `QZone`（先排除微信） | |
| `webview` | 微信/QQ，或 iOS 无 `Safari/`、安卓 UA 带 `; wv)` | 内置 WebView 通用判定 |
| `standalone` | `navigator.standalone === true` 或 display-mode 为 standalone/fullscreen | 从桌面图标启动 |
| `touch` | `(pointer: coarse)`，或触点数>0 且是移动系统 | 桌面触屏本按鼠标处理 |
| `coarse` | 原始 `(pointer: coarse)` 结果 | |
| `safari` | 真 Safari（排除 Chrome/CriOS/FxiOS/Edg/OPR/微信/QQ/安卓 UA） | iOS 上的 Chrome 也是 WebKit，但没有 A2HS 能力 |

识别结果同步写成 `<html class="...">`（只加 true 的，桌面端一个 class 都不加）：

```html
<html class="ios touch standalone webview wechat qq android harmony">
```

所以 platform.css 里挂在 `html.touch` 下的规则在桌面端全部不生效。

---

## 三、API 契约（职责 3~7）

```js
export function initPlatform({ onBack } = {}): env     // 幂等；返回环境识别结果
export const platform = {
  env,                       // 同 initPlatform 返回值
  isStandalone(),            // 是否从桌面图标/独立窗口启动
  isWeChat(),                // 是否微信内置浏览器
  isFullscreen(),            // 当前是否元素全屏
  toggleFullscreen(),        // true=已发起/已退出；false=不支持（会 toast 说明）
  onFullscreenChange(cb),    // cb(on:boolean)；返回取消订阅函数
  onInstallPrompt(cb),       // cb(available:boolean)（安装能力出现/失效时通知）
  promptInstall(),           // Promise<boolean>；iOS 弹「分享→添加到主屏幕」图文
  showToast(text, ms=2200),  // 单例 toast，不抢焦点
  setGameState(name),        // title|menu|settings|play|paused|dialogue|ending|gameover|clear；只有 title 允许安装条/A2HS
  setBackGuard(bool),        // true=拦住返回键（popstate→onBack→重新压栈）
  onBack,                    // 业务回调，initPlatform({onBack}) 或直接赋值
};
```

额外便利 API（契约之外，向后兼容，给主流程/QA 用）：

| API | 说明 |
| --- | --- |
| `platform.version` | 平台层版本串（与 `?v=`、`sw.js CACHE_VERSION` 同步） |
| `platform.viewport` | 最近一次 `{w,h,vw,vh,dpr,portrait,orientation,scale,offsetTop,standalone}` |
| `platform.refreshViewport()` | 手动重算一次（一般用不到） |
| `platform.onViewport(cb)` | 订阅视口变化，返回取消函数 |
| `platform.onAudioUnlock(cb)` | 微信里音频可以解锁了（桥就绪/首次触摸），见第六节 |
| `platform.canInstall()` | 是否已拿到 `beforeinstallprompt` |
| `platform.gameState` | 只读，当前 `title|menu|settings|play|paused|dialogue|ending|gameover|clear` |
| `platform.registerSW()` | 手动注册（幂等，正常自动执行） |
| `platform.warmCache()` | 手动触发离线缓存预热 |

**幂等 & 桌面零副作用**：重复 `initPlatform()` 只更新 `onBack`；
桌面端不添加 class、不显示安装条/A2HS、不改任何布局尺寸、不产生控制台输出。

---

## 四、PWA：manifest / Service Worker / 安装（职责 2、3）

### manifest.webmanifest

| 字段 | 值 |
| --- | --- |
| `name` | 东方新纪行 ～ Chronicle of Gensokyo |
| `short_name` | 新纪行 |
| `start_url` | `./index.html?src=pwa`（`src=pwa` 可用于识别「从桌面启动」，不影响游戏） |
| `scope` | `./` |
| `display` | `standalone` |
| `orientation` | `any`（横竖屏由游戏自己的 `.rotate-hint` 提示，不锁死） |
| `background_color` | `#05030a`（主题 `--ink`） |
| `theme_color` | `#150e1e`（与 index.html 的 `theme-color` 一致） |
| `icons` | 192 / 512 PNG，由 `src/art/apple-touch-icon.png` 用 Pillow 放大锐化生成，压到 `--ink` 底色上 |

### Service Worker（`sw.js`）

缓存版本：`CACHE_VERSION = 'hks-v1.6.1'`（前缀 `hks-`，activate 时删掉所有旧版本）。

| 请求类型 | 策略 |
| --- | --- |
| 导航（`request.mode === 'navigate'`） | network-first（4s 超时），失败/非 2xx 回退缓存 `./index.html`，连缓存都没有返回内置离线页 |
| 带 `?v=` 的静态资源 | cache-first（版本号变了 URL 就变，缓存永不脏） |
| 其它同源 GET | stale-while-revalidate |
| 不处理 | 非 GET、跨域、带 `Range` 的分片、非 200、`chrome-extension://`、`sw.js` 自身、DevTools `only-if-cached` |

- `install`：预缓存 `./`、`./index.html`、`./manifest.webmanifest`、`./src/ui/platform.css?v=1.6.1`（单个失败不影响安装）+ `skipWaiting()`
- `activate`：清旧 cache + `clients.claim()`
- **首访即离线**：页面加载完后 `platform.js` 会把本次真实请求过的资源（`performance.getEntriesByType('resource')`）
  通过 `postMessage({type:'hks:warm'})` 交给 SW 预热缓存，所以**第一次打开之后断网也能进标题页**。
- 注册条件：`http(s)` + `window.isSecureContext`；失败静默（无痕模式、老 WebView 不影响游戏）。
- 调试开关：URL 加 `?nosw=1`，或提前设 `window.__HKS_NO_SW = true`（避免开发时吃旧缓存）；
  `window.__HKS_PLATFORM_NO_AUTO = true` 可让模块「只加载不初始化」，供单元测试用。

> ⚠️ **升版本必须同时改三处**：`sw.js` 的 `CACHE_VERSION`、`index.html` 的 `?v=`、`src/ui/platform.js` 的 `PLATFORM_VERSION`
> （platform.css 的 href 由它拼出来）。

### 安装入口

- `beforeinstallprompt`：捕获并 `preventDefault()`（不让浏览器弹默认横幅），移动端自动显示底部安装条
  （`.hks-install`，可关闭，`localStorage['hks.install.v1']` 记住 `dismissed` / `installed`，之后不再打扰）；
  桌面端**不自动弹**，只保留 `onInstallPrompt` / `promptInstall` 给业务自己用。
- iOS Safari（非 standalone）：首次访问 1.6s 后弹一次「分享 → 添加到主屏幕」图文提示
  （`.hks-a2hs`，`localStorage['hks.a2hs.v1'] = 'seen'` 只弹一次）。
  微信/QQ/iOS 上的第三方浏览器不弹（它们没有 A2HS 能力，`safari` 判定已排除）。
- `appinstalled`：记录 `installed` 并收起安装条。
- **状态感知（只在标题页出现）**：main.js 每次状态变化调用 `platform.setGameState(name)`，
  `name` 取值固定为：`title` | `menu` | `settings` | `play` | `paused` | `dialogue` | `ending` | `gameover` | `clear`。

  | gameState | 安装条 | iOS A2HS |
  | --- | --- | --- |
  | `title`（标题页） | 有安装事件且没 dismiss/installed 就显示 | 有挂起就补弹一次 |
  | 其它全部（含 `settings`、`paused`、`dialogue`、结算） | 立刻收起；有安装能力则记账 pending | 1.6s 到点也不弹，挂起 |

  实现上所有显示都走 `applyInstallVisibility()`：只有「`gameState === 'title'` + 有 `beforeinstallprompt` + 没 dismiss/installed」
  才真的 `add('show')`，保证安装条不会挡住虚拟摇杆（左下）、射击/跳跃键（右下），也不会盖住设置页底部的操作组。
  在非 title 状态收到 `beforeinstallprompt` 只记 pending，回到 title 再显示。
  iOS A2HS 是模态层：弹出后一旦离开 title（例如进设置页）会立刻收起；它只提示一次（`hks.a2hs.v1=seen`），回标题不会反复补弹，
  只有「1.6s 到点时不在 title」这种还没弹过的情况才会挂起到回 title 再弹。

---

## 五、返回键（职责 6）

```js
platform.setBackGuard(true);   // 进关卡/进菜单时调用
platform.setBackGuard(false);  // 回到标题、允许正常退出时调用
```

实现：`setBackGuard(true)` 会 `history.pushState({hksGuard:n})` 压一层；用户按返回键触发 `popstate`
→ 先调 `platform.onBack()`，然后**立刻再压一层**，所以返回键永远不会把页面退掉
（安卓 WebView / 微信手势返回 / 浏览器侧滑都一样）。
`setBackGuard(false)` 会主动 `history.back()` 退掉自己压的那层（并抑制这次 popstate，不触发 `onBack`）。

注意：`onBack` 里不要再调 `setBackGuard`，平台层已经重新压栈了；`onBack` 抛错也不会让页面退出。

---

## 六、移动端体验修复清单（职责 6、7）

全部挂在 `html.touch` / `html.wechat` / `html.qq` / `html.ios` / `html.standalone` 下：

| 问题 | 处理 |
| --- | --- |
| 刘海屏/圆角/手势条 | `--sat/--sab/--sal/--sar` 四个 CSS 变量；standalone 时 `#wrap` 让出安全区 |
| 移动端 100vh 抖动 | `--app-h`（JS 写入 visualViewport 高度，CSS 兜底 `100dvh`）；`--vh` 保留老写法 `calc(var(--vh)*100)` |
| 橡皮筋/下拉刷新 | `overscroll-behavior: none`；微信/QQ 里额外吞掉顶部下拉手势（`#touch`、输入框区域不抢） |
| 双击缩放 | `touch-action: manipulation` + 两次 `touchend<320ms` 时 `preventDefault` |
| iOS 双指缩放 | `gesturestart/gesturechange` 阻止 |
| 长按 canvas 弹菜单 | `contextmenu` 只在 canvas 上阻止（不误伤 HUD 文本） |
| 微信 iOS 音频不响 | `WeixinJSBridgeReady` / 首次触摸触发 `CustomEvent('hks:audio-unlock')` 和 `platform.onAudioUnlock(cb)`，**音频层需要接这个回调并 `ctx.resume()`** |
| 地址栏伸缩 | `visualViewport` 的 resize/scroll → 重算 `--app-h` |

### 视口事件：`hks:viewport`（职责 7）

`resize` / `orientationchange` / `visualViewport.resize` / `screen.orientation.change`
都会（rAF 合并后）重算并广播：

```js
window.addEventListener('hks:viewport', (e) => {
  const { w, h, vw, vh, dpr, portrait, orientation, scale, offsetTop, standalone } = e.detail;
  // 折叠屏展开、分屏拖拽、横竖屏切换都会到这里
});
```

**平台层只广播尺寸，不碰 canvas**。渲染器（`src/renderer.js` / `src/main.js`）如果要做自适应，
请自己监听这个事件再决定是否 `resize`，避免和游戏内逻辑打架。

---

## 七、全屏与横屏（职责 4）

- `toggleFullscreen()` 兼容 `webkit/ms` 前缀；进入后尝试 `screen.orientation.lock('landscape')`（失败静默）。
- iOS Safari 没有元素全屏 API：返回 `false` 并 toast 提示「分享 → 添加到主屏幕」。
- 已是 standalone（从桌面图标启动）时返回 `false` 并提示「当前已是应用全屏模式」。
- `onFullscreenChange(cb)` 监听 `fullscreenchange` + `webkitfullscreenchange`。

---

## 八、平台矩阵（实测覆盖）

| 平台 | ios/android/harmony | wechat/qq | webview | standalone | 备注 |
| --- | --- | --- | --- | --- | --- |
| 桌面 Chrome/Edge 1280×720 | 全 false | false | false | false | 零 class、零视觉差 |
| iPhone Safari | ios | false | false | 视启动方式 | A2HS 提示、无全屏 API |
| iPhone 微信 | ios | wechat | true | false | 无 A2HS、音频解锁事件 |
| Android Chrome | android | false | false | 视启动方式 | 安装条、全屏+锁横屏 |
| Android 微信/QQ | android | wechat/qq | true | false | 吞下拉刷新、地址栏归零 |
| HarmonyOS | harmony（通常也 android） | 视容器 | 视容器 | 视启动方式 | ArkWeb 内按 webview 处理 |
| 折叠屏/分屏 | 跟随 `touch` | — | — | — | `hks:viewport` 连续广播 |

---

## 九、已知限制

1. **iOS Safari 无法网页全屏**（系统限制，只能靠 A2HS 从桌面启动）。
2. **微信内置浏览器的 SW 支持不稳定**：注册失败会被静默忽略，此时没有离线能力，但游戏正常。
3. **音频解锁需要音频层配合**：平台层只负责「通知」，`src/engine/audio.js`（或现有 `src/audio.js`）
   需要 `platform.onAudioUnlock(() => ctx.resume())`，否则微信 iOS 首屏 BGM 无声。
4. **桌面端不会自动弹安装条**（为了「桌面零视觉变化」）；需要时业务自己调 `platform.promptInstall()`。
5. 首访预热缓存需要几秒（视资源数量），期间断网可能只拿到离线壳。

---

## 十、调试 / 验收

```bash
# 静态服务器（已跑在 127.0.0.1:8138）
python tools/serve_nocache.py

# 桌面基线 vs 平台层：像素对比（应完全一致）
node _pt/plat/desktop_diff.mjs

# 移动端（iPhone / Android / 微信 UA）+ manifest + SW + 安装条
node _pt/plat/mobile_probe.mjs

# 断网重载仍能进标题
node _pt/plat/offline_probe.mjs
```

产物：`_shots_mobile/`（截图）、`_pt/plat/*.json`（报告）。页面里调试：

```js
__hksPlatform.env          // 环境识别结果
__hksPlatform.viewport     // 最近一次视口
__hksPlatform.canInstall() // 是否拿到安装事件
__hksPlatform.setGameState('play')    // 模拟进关：安装条应立刻收起
__hksPlatform.setGameState('title')   // 回标题页：有 pending 会补显示
__hksPlatform.showToast('测试')
__hksPlatform.registerSW() // 手动注册（幂等）
```
