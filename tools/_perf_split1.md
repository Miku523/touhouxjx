# 首屏测量 · split1

- 入口：http://127.0.0.1:8138/index.html
- 限速：15KB/s · RTT400ms · 冷 profile · 缓存禁用
- 运行次数：1（成功 1）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| -1ms | 24379ms | 52987ms | 72518ms | 854KB | 35 | 5ms | 52873ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 24379ms | 52987ms | 72518ms | 854KB | 35 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/main.js?v=1.6.50 | 194.9KB | 50094ms | 2635ms |
| /src/engine/audio.js | 67.8KB | 42776ms | 2635ms |
| /src/title.css?v=1.6.50 | 55.9KB | 21980ms | 2338ms |
| /src/art/gen/marisa.avif | 49.8KB | 19723ms | 52734ms |
| /src/engine/songs/title_full.js | 45.9KB | 45603ms | 2727ms |
| /src/art/gen/title_bg.avif | 43.2KB | 17390ms | 2635ms |
| /src/art/gen/reimu.avif | 40.2KB | 16313ms | 52734ms |
| /src/game/bullets.js | 39.6KB | 15904ms | 52747ms |
| /src/ui/platform.js | 37.8KB | 26173ms | 2635ms |
| /src/engine/renderer.js | 30.5KB | 15036ms | 2635ms |
| /src/art/gen/marisa_title.avif | 26.6KB | 11327ms | 2635ms |
| /src/ui/mobile.css?v=1.6.50 | 23.3KB | 42774ms | 2432ms |
| /src/engine/input.js | 22.5KB | 18654ms | 2635ms |
| /src/art/gen/reimu_title.avif | 22.3KB | 9368ms | 2635ms |
| /src/game/hud.js | 17.9KB | 28117ms | 2635ms |

## 按发起者分类字节（第 1 次）

- link: 187KB
- script: 577KB
- img: 90KB