# 首屏测量 · cfpages

- 入口：https://touhouxjx.pages.dev/index.html
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：3（成功 3）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| -1ms | 1361ms | 1480ms | 1886ms | 552KB | 70 | 757ms | 1384ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 1720ms | 2210ms | 3145ms | 324KB | 38 |
| 2 | -1ms | 1361ms | 1480ms | 1764ms | 552KB | 70 |
| 3 | -1ms | 1142ms | 1257ms | 1886ms | 554KB | 72 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/art/gen/marisa.avif | 49.8KB | 792ms | 2100ms |
| /src/art/gen/title_bg.avif | 43.2KB | 590ms | 965ms |
| /src/art/gen/reimu.avif | 40.2KB | 867ms | 2100ms |
| /src/main.js?v=1.6.54 | 28.1KB | 888ms | 965ms |
| /src/art/gen/marisa_title.avif | 26.6KB | 908ms | 965ms |
| /src/game/story.js | 26.3KB | 705ms | 2113ms |
| /src/art/gen/reimu_title.avif | 22.3KB | 631ms | 965ms |
| /src/game/stage.js | 18.0KB | 659ms | 2113ms |
| /src/title.css?v=1.6.54 | 9.5KB | 644ms | 961ms |
| /src/ui/platform.js | 6.1KB | 1131ms | 965ms |
| /src/game/bullets.js | 5.9KB | 573ms | 2113ms |
| /src/ui/mobile.css?v=1.6.54 | 4.5KB | 1712ms | 961ms |
| /src/engine/renderer.js | 4.4KB | 682ms | 965ms |
| /src/engine/input.js | 3.5KB | 501ms | 965ms |
| /src/game/hud.js | 3.3KB | 500ms | 965ms |

## 按发起者分类字节（第 1 次）

- link: 110KB
- script: 124KB
- img: 90KB