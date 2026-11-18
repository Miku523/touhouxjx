# 首屏测量 · lite71

- 入口：http://127.0.0.1:8138/index.html
- 限速：15KB/s · RTT400ms · 冷 profile · 缓存禁用
- 运行次数：1（成功 1）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| -1ms | 23844ms | 45038ms | 100998ms | 1421KB | 53 | 4ms | 44945ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 23844ms | 45038ms | 100998ms | 1421KB | 53 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/main.js?v=1.6.71 | 210.1KB | 42296ms | 2632ms |
| /src/style.css | 143.1KB | 55937ms | 44942ms |
| /src/game/stage.js | 132.3KB | 52029ms | 44942ms |
| /src/game/story.js | 122.2KB | 48423ms | 44943ms |
| /src/engine/audio.js | 71.2KB | 45478ms | 44945ms |
| /src/title.css?v=1.6.71 | 55.9KB | 21391ms | 2336ms |
| /src/art/gen/marisa.avif | 49.8KB | 19713ms | 44932ms |
| /src/art/gen/title_bg.avif | 43.2KB | 17387ms | 2631ms |
| /src/game/bullets.js | 41.8KB | 17163ms | 44943ms |
| /src/art/gen/reimu.avif | 40.2KB | 16295ms | 44932ms |
| /src/ui/platform.js | 37.8KB | 26661ms | 2632ms |
| /src/engine/renderer.js | 30.5KB | 15441ms | 2632ms |
| /src/art/gen/marisa_title.avif | 26.6KB | 11424ms | 2631ms |
| /src/ui/mobile.css?v=1.6.71 | 23.3KB | 34863ms | 2446ms |
| /src/engine/input.js | 22.5KB | 18754ms | 2632ms |

## 按发起者分类字节（第 1 次）

- link: 330KB
- script: 1001KB
- img: 90KB