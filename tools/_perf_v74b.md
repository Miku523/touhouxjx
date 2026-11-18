# 首屏测量 · v74b

- 入口：https://mikuascendlog.com/touhouxjx/index.html
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 76188ms | 5355ms | 9359ms | 7767ms | 2554KB | 217 | 3116ms | 9273ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 2610ms | 5783ms | 7767ms | 270KB | 35 |
| 2 | 76188ms | 5355ms | 9359ms | -1ms | 2554KB | 217 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /touhouxjx/src/art/gen/title_bg.avif | 43.2KB | 1758ms | 1529ms |
| /touhouxjx/src/main.js?v=1.6.74 | 28.3KB | 2368ms | 1529ms |
| /touhouxjx/src/art/gen/marisa_title.avif | 26.6KB | 2283ms | 1529ms |
| /touhouxjx/src/art/gen/reimu_title.avif | 22.3KB | 1758ms | 1529ms |
| /touhouxjx/src/art/gen/marisa.avif | 21.0KB | 1762ms | 5680ms |
| /touhouxjx/src/style.css | 20.3KB | 1933ms | 5690ms |
| /touhouxjx/src/art/gen/reimu.avif | 18.3KB | 1484ms | 5680ms |
| /touhouxjx/src/game/stage.js | 17.8KB | 2188ms | 5690ms |
| /touhouxjx/src/title.css?v=1.6.74 | 9.3KB | 963ms | 1529ms |
| /touhouxjx/src/engine/audio.js | 7.1KB | 2210ms | 5692ms |
| /touhouxjx/src/ui/platform.js | 6.1KB | 3397ms | 1529ms |
| /touhouxjx/src/game/bullets.js | 5.7KB | 1761ms | 5690ms |
| /touhouxjx/src/ui/mobile.css?v=1.6.74 | 4.3KB | 4376ms | 1529ms |
| /touhouxjx/src/engine/renderer.js | 4.2KB | 3396ms | 1529ms |
| /touhouxjx/src/game/spellCutin.js | 3.4KB | 3397ms | 1530ms |

## 按发起者分类字节（第 1 次）

- link: 130KB
- script: 100KB
- img: 39KB