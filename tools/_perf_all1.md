# 首屏测量 · all1

- 入口：http://127.0.0.1:8139/index.html
- 限速：15KB/s · RTT400ms · 冷 profile · 缓存禁用
- 运行次数：1（成功 1）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| -1ms | 20098ms | 32242ms | 51495ms | 517KB | 35 | 4ms | 32114ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 20098ms | 32242ms | 51495ms | 517KB | 35 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/main.js?v=1.6.50 | 84.8KB | 28115ms | 2643ms |
| /src/art/gen/marisa.avif | 49.8KB | 19538ms | 31933ms |
| /src/title.css?v=1.6.50 | 46.0KB | 17678ms | 2349ms |
| /src/engine/songs/title_full.js | 43.9KB | 29190ms | 2737ms |
| /src/art/gen/title_bg.avif | 43.2KB | 16881ms | 2642ms |
| /src/art/gen/reimu.avif | 40.2KB | 16313ms | 31933ms |
| /src/art/gen/marisa_title.avif | 26.6KB | 11319ms | 2643ms |
| /src/engine/audio.js | 24.7KB | 22164ms | 2643ms |
| /src/art/gen/reimu_title.avif | 22.3KB | 9371ms | 2643ms |
| /src/ui/mobile.css?v=1.6.50 | 17.8KB | 27244ms | 2436ms |
| /src/ui/platform.js | 15.1KB | 15820ms | 2643ms |
| /src/game/bullets.js | 14.8KB | 6625ms | 31949ms |
| /src/engine/renderer.js | 12.0KB | 7994ms | 2643ms |
| /src/game/hud.js | 10.4KB | 20406ms | 2643ms |
| /src/engine/input.js | 9.6KB | 12394ms | 2643ms |

## 按发起者分类字节（第 1 次）

- link: 166KB
- script: 261KB
- img: 90KB