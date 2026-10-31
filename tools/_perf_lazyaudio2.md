# 首屏测量 · lazyaudio2

- 入口：http://127.0.0.1:8140/index.html
- 限速：15KB/s · RTT400ms · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 47778ms | 24342ms | 44487ms | 104245ms | 1399KB | 56 | 4ms | 44364ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | 47778ms | 24342ms | 44470ms | 104245ms | 1399KB | 56 |
| 2 | 47760ms | 24244ms | 44487ms | 104241ms | 1399KB | 56 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/main.js?v=1.6.53 | 198.2KB | 41697ms | 2637ms |
| /src/style.css | 147.5KB | 56527ms | 47674ms |
| /src/game/story.js | 124.0KB | 47545ms | 44352ms |
| /src/game/stage.js | 124.0KB | 47248ms | 44352ms |
| /src/title.css?v=1.6.53 | 56.4KB | 21884ms | 2342ms |
| /src/art/gen/marisa.avif | 49.8KB | 18657ms | 44339ms |
| /src/art/gen/title_bg.avif | 43.2KB | 17375ms | 2543ms |
| /src/art/gen/reimu.avif | 40.2KB | 15628ms | 44339ms |
| /src/game/bullets.js | 39.6KB | 15318ms | 44352ms |
| /src/ui/platform.js | 38.9KB | 26959ms | 2637ms |
| /src/engine/renderer.js | 30.5KB | 15334ms | 2637ms |
| /src/art/gen/marisa_title.avif | 26.6KB | 11428ms | 2543ms |
| /src/ui/mobile.css?v=1.6.53 | 24.1KB | 35256ms | 2342ms |
| /src/game/playerShots.js | 23.2KB | 9770ms | 91602ms |
| /src/engine/input.js | 23.1KB | 18852ms | 2637ms |

## 按发起者分类字节（第 1 次）

- link: 336KB
- script: 973KB
- img: 90KB