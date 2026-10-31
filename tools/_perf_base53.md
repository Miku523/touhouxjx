# 首屏测量 · base53

- 入口：http://127.0.0.1:8141/index.html
- 限速：15KB/s · RTT400ms · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 56952ms | 24522ms | 53788ms | 127019ms | 1665KB | 62 | 4ms | 53665ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | 56952ms | 24360ms | 53788ms | 126499ms | 1665KB | 62 |
| 2 | 56894ms | 24522ms | 53724ms | 127019ms | 1665KB | 62 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/main.js?v=1.6.53 | 200.1KB | 50783ms | 2735ms |
| /src/style.css | 147.5KB | 69609ms | 56855ms |
| /src/game/story.js | 124.0KB | 48511ms | 53539ms |
| /src/game/stage.js | 124.0KB | 48418ms | 53539ms |
| /src/engine/audio.js | 71.2KB | 43458ms | 2736ms |
| /src/engine/songs/honou_pre1.js | 57.7KB | 23616ms | 53539ms |
| /src/title.css?v=1.6.53 | 56.4KB | 21867ms | 2448ms |
| /src/art/gen/marisa.avif | 49.8KB | 19723ms | 53524ms |
| /src/engine/songs/title_full.js | 46.0KB | 46092ms | 2736ms |
| /src/art/gen/title_bg.avif | 43.2KB | 17394ms | 2633ms |
| /src/art/gen/reimu.avif | 40.2KB | 16297ms | 53524ms |
| /src/game/bullets.js | 39.6KB | 16003ms | 53539ms |
| /src/game/miniboss.js | 38.9KB | 22755ms | 101958ms |
| /src/ui/platform.js | 38.9KB | 27058ms | 2736ms |
| /src/engine/songs/youma_stage1.js | 34.8KB | 29863ms | 53539ms |

## 按发起者分类字节（第 1 次）

- link: 336KB
- script: 1239KB
- img: 90KB