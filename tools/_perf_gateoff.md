# 首屏测量 · gateoff

- 入口：https://mikuascendlog.com/touhouxjx/index.html?bootgate=off
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 27142ms | 4576ms | 26035ms | 28360ms | 363KB | 42 | 2513ms | 25921ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | 27142ms | 4576ms | 26035ms | 28360ms | 363KB | 42 |
| 2 | -1ms | 2325ms | 2640ms | 2757ms | 281KB | 31 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /touhouxjx/src/art/gen/marisa.avif | 49.8KB | 1580ms | 25806ms |
| /touhouxjx/src/art/gen/title_bg.avif | 43.2KB | 5783ms | 3111ms |
| /touhouxjx/src/art/gen/reimu.avif | 40.2KB | 1280ms | 25806ms |
| /touhouxjx/src/main.js?v=1.6.52 | 27.0KB | 5783ms | 3112ms |
| /touhouxjx/src/art/gen/marisa_title.avif | 26.6KB | 18052ms | 3112ms |
| /touhouxjx/src/game/story.js | 25.2KB | 1018ms | 27100ms |
| /touhouxjx/src/art/gen/reimu_title.avif | 22.3KB | 1429ms | 3112ms |
| /touhouxjx/src/style.css | 20.3KB | 1126ms | 27101ms |
| /touhouxjx/src/game/stage.js | 16.6KB | 768ms | 27100ms |
| /touhouxjx/src/engine/songs/title_full.js | 9.9KB | 22438ms | 3112ms |
| /touhouxjx/src/title.css?v=1.6.52 | 9.3KB | 1358ms | 3111ms |
| /touhouxjx/src/engine/audio.js | 7.1KB | 19202ms | 3112ms |
| /touhouxjx/src/ui/platform.js | 6.1KB | 1357ms | 3112ms |
| /touhouxjx/src/game/bullets.js | 5.6KB | 364ms | 27100ms |
| /touhouxjx/src/ui/mobile.css?v=1.6.52 | 4.3KB | 22998ms | 3111ms |

## 按发起者分类字节（第 1 次）

- link: 130KB
- script: 143KB
- img: 90KB