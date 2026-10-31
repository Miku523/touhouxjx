# 首屏测量 · min1

- 入口：http://127.0.0.1:8139/index.html
- 限速：15KB/s · RTT400ms · 冷 profile · 缓存禁用
- 运行次数：1（成功 1）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| -1ms | 35129ms | 35898ms | 55214ms | 571KB | 35 | 5ms | 35806ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 35129ms | 35898ms | 55214ms | 571KB | 35 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/style.css?v=1.6.50 | 101.1KB | 32714ms | 2345ms |
| /src/main.js?v=1.6.50 | 84.4KB | 30773ms | 2632ms |
| /src/art/gen/marisa.avif | 49.8KB | 19520ms | 35652ms |
| /src/engine/songs/title_full.js | 43.9KB | 32914ms | 2734ms |
| /src/art/gen/title_bg.avif | 43.2KB | 16896ms | 2632ms |
| /src/art/gen/reimu.avif | 40.2KB | 16204ms | 35652ms |
| /src/art/gen/marisa_title.avif | 26.6KB | 11332ms | 2632ms |
| /src/engine/audio.js | 23.8KB | 22464ms | 2632ms |
| /src/art/gen/reimu_title.avif | 22.3KB | 9376ms | 2632ms |
| /src/ui/mobile.css?v=1.6.50 | 17.8KB | 30079ms | 2438ms |
| /src/ui/platform.js | 15.1KB | 15832ms | 2632ms |
| /src/game/bullets.js | 14.8KB | 6723ms | 35667ms |
| /src/engine/renderer.js | 12.0KB | 8007ms | 2632ms |
| /src/game/hud.js | 10.4KB | 20509ms | 2632ms |
| /src/engine/input.js | 9.6KB | 12410ms | 2632ms |

## 按发起者分类字节（第 1 次）

- link: 221KB
- script: 260KB
- img: 90KB