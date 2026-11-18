# 首屏测量 · v74

- 入口：https://mikuascendlog.com/touhouxjx/index.html
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 143895ms | 6507ms | 14426ms | 18134ms | 2804KB | 186 | 3282ms | 14328ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 2548ms | 14426ms | 18134ms | 443KB | 35 |
| 2 | 143895ms | 6507ms | 11534ms | -1ms | 2804KB | 186 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /touhouxjx/src/main.js?v=1.6.74 | 71.8KB | 5146ms | 1019ms |
| /touhouxjx/src/game/stage.js | 46.6KB | 2881ms | 14326ms |
| /touhouxjx/src/art/gen/title_bg.avif | 43.2KB | 5899ms | 1019ms |
| /touhouxjx/src/style.css | 32.6KB | 2069ms | 14326ms |
| /touhouxjx/src/art/gen/marisa_title.avif | 26.6KB | 2113ms | 1019ms |
| /touhouxjx/src/engine/audio.js | 22.4KB | 2362ms | 14328ms |
| /touhouxjx/src/art/gen/reimu_title.avif | 22.3KB | 8258ms | 1019ms |
| /touhouxjx/src/art/gen/marisa.avif | 21.0KB | 3762ms | 14315ms |
| /touhouxjx/src/art/gen/reimu.avif | 18.3KB | 1707ms | 14315ms |
| /touhouxjx/src/game/bullets.js | 14.7KB | 3290ms | 14326ms |
| /touhouxjx/src/ui/platform.js | 13.8KB | 2515ms | 1019ms |
| /touhouxjx/src/engine/renderer.js | 11.6KB | 1608ms | 1019ms |
| /touhouxjx/src/engine/songs/title_full.js | 10.4KB | 2050ms | 16026ms |
| /touhouxjx/src/title.css?v=1.6.74 | 10.1KB | 1417ms | 1018ms |
| /touhouxjx/src/engine/input.js | 7.5KB | 11535ms | 1019ms |

## 按发起者分类字节（第 1 次）

- link: 147KB
- script: 257KB
- img: 39KB