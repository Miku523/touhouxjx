# 移动端自动化验收（MOBILE QA）

> 面向维护者：改完触屏 / 手柄 / 平台层后，用同一套脚本回归。
> 最近一次全量：2026-10-24 21:15–21:26（约 11 分钟，13 用例全 PASS，0 WARN / 0 FAIL）。

## 1. 怎么跑

前置：仓库根目录起静态服务器（默认 8137），本地用系统 Edge 无头跑。

```bash
# 全设备矩阵（横竖屏 + PWA 离线 + Gamepad mock）
node tools/_mobile_qa.mjs --device=all --out=_shots_mobile/full

# 单设备 / 单方向
node tools/_mobile_qa.mjs --device=iphone13 --orientation=landscape --out=_shots_mobile/_ip13

# 跳过 PWA（改动不涉及离线壳时省时间）
node tools/_mobile_qa.mjs --device=ipad --orientation=landscape --skip-pwa --out=_shots_mobile/_ipad
```

可选 `--device=`：`iphone-se` / `iphone13` / `pixel7` / `ipad` / `fold` / `wechat` / `desktop` / `all`。
脚本用无头 Edge + CDP 的 `Emulation.setDeviceMetricsOverride` 模拟视口与 DPR，不写 `localStorage`、不改 `src`。
调试时 URL 会带 `?nosw=1` 跳过 Service Worker，避免旧缓存干扰。

## 2. 覆盖矩阵（最近一次全量）

| 设备 | 视口 | 方向 | 结果 |
| --- | --- | --- | --- |
| iPhone SE | 375×667 @2x | 横 / 竖 | PASS / PASS |
| iPhone 13 | 844×390 @3x | 横 / 竖 | PASS / PASS |
| Pixel 7 | 412×915 @2.6x | 横 / 竖 | PASS / PASS |
| iPad | 1024×768 @2x | 横 / 竖 | PASS / PASS |
| 折叠屏 | 717×512 | 横 / 竖 | PASS / PASS |
| 微信 WebView (iPhone 13) | 844×390 | 横 / 竖 | PASS / PASS |
| 桌面回归 | 1280×800 | 横 | PASS（不出现触屏手柄） |

13 用例、9/9 流程、console 0 error / 0 warn、HTTP≥400 为 0。完整报告与截图：
`_shots_mobile/full/report.md`、`_shots_mobile/full/report.json`、`_shots_mobile/full/<device>/<orientation>/*.png`。

## 3. 每个用例测什么

- 启动 → 开始 → 难度 → 选人 → 进关 → 对话 → 暂停 → 设置 → 返回 → 退出 → 回标题（9 步）。
- 触屏操作优先用真实 `Input.dispatchTouchEvent`；菜单点击用 `el.click()` 兜底时报告会标 `eval-click-fallback`。
- 虚拟手柄：`data-hks-pad` 数量、是否互相重叠、是否压 HUD、是否出视口、旧 `#touch` 是否残留。
- 多点触控：摇杆右推 + 按住射击，读 `window.__game.input.moveX / held`，松手归零。
- 摇杆半推模拟量（snap8 开/关）与布局编辑后的按钮位置。
- 蓝牙手柄：mock 一个 Gamepad，断言每帧调用与 `statusText`；不依赖真实硬件。
- 设置页：底部「返回」/「重开」是否在首屏或滚动可达；iPad 横屏用 2 列「操作」组 + 吸底。
- 安装条 / iOS 添加到桌面：只允许在标题页出现，进入设置 / 对局自动收起，回标题再补。
- 旋转：横竖切换后画布与手柄复位。
- PWA：manifest 200 且字段齐全、SW 已注册、断网 reload 能进标题。
- 桌面回归：`pad.active=false`、无 `data-hks-pad`、无安装条、设置页 12 行且无「操作」组。

## 4. 结果怎么读

- **PASS / WARN / FAIL**：FAIL 才算回归；WARN 是「功能通过但体验有建议」。
- **N/A**：当前设备未集成该能力（桌面无 `data-hks-pad`、PWA 被 `--skip-pwa` 跳过），不是失败。
- **canvas-small**：竖屏下 16:9 画布只占视口高度的一部分，属 letterbox 正常现象；页面顶部有「建议横屏游玩」提示。
- **FPS**：无头 Edge 的 rAF 数值仅供回归对比，不代表真机帧率。

## 5. 已知限制（不算回归）

- iOS Safari 不支持网页全屏与 `navigator.vibrate`，设置里会提示用「添加到主屏幕」。
- 竖屏下游戏画面按 16:9 居中留黑边，操作可用但视野小于横屏；建议横屏。
- 本机 8137 对 `.webmanifest` 返回 `application/octet-stream`（200 + 合法 JSON）。真正的可安装性取决于部署层的 `Content-Type: application/manifest+json`，自动化只看 200 与字段。
- 非标准映射手柄只保证标准键位部分，报告里的 mock 不代表所有杂牌手柄。
- 微信 / QQ WebView 的全屏与安装能力取决于宿主，拿不到时给提示而不是卡死。

## 6. 代码位置

| 层 | 文件 |
| --- | --- |
| 输入合并 / 边沿 / 模拟量 | `src/engine/input.js` |
| 蓝牙手柄 | `src/engine/gamepad.js` |
| 虚拟手柄 UI / 三方案 / 布局编辑 | `src/ui/virtualPad.js`、`src/ui/mobile.css` |
| 平台层 / PWA / 安装条 / 返回键 | `src/ui/platform.js`、`src/ui/platform.css`、`sw.js`、`manifest.webmanifest` |
| 集成 / 设置页 / 触觉 / 菜单手柄导航 | `src/main.js` |
| 玩家与关卡移动模拟量 | `src/game/player.js`、`src/game/stg.js`、`src/game/stage.js` |
| 验收脚本 | `tools/_mobile_qa.mjs` |

相关文档：`docs/MOBILE_CONTROLS.md`（玩法与设置）、`docs/PLATFORMS.md`（平台层）、`docs/GAMEPAD.md`（蓝牙手柄）。
