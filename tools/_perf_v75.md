# 首屏测量 · v75

- 入口：https://mikuascendlog.com/touhouxjx/index.html
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| -1ms | 4450ms | 6696ms | 8690ms | 280KB | 40 | 2445ms | 6601ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | -1ms | 4450ms | 6696ms | 8690ms | 277KB | 36 |
| 2 | -1ms | 1779ms | 5921ms | 7593ms | 280KB | 40 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /touhouxjx/src/art/gen/title_bg.avif | 43.2KB | 3326ms | 2450ms |
| /touhouxjx/src/main.js?v=1.6.75 | 28.3KB | 1922ms | 2450ms |
| /touhouxjx/src/art/gen/marisa_title.avif | 26.6KB | 2266ms | 2450ms |
| /touhouxjx/src/art/gen/reimu_title.avif | 22.3KB | 2591ms | 2450ms |
| /touhouxjx/src/art/gen/marisa.avif | 21.0KB | 1109ms | 6589ms |
| /touhouxjx/src/style.css | 20.3KB | 1393ms | 6599ms |
| /touhouxjx/src/art/gen/reimu.avif | 18.3KB | 2034ms | 6589ms |
| /touhouxjx/src/game/stage.js | 17.8KB | 1826ms | 6599ms |
| /touhouxjx/src/engine/songs/title_full.js | 9.9KB | 914ms | 7709ms |
| /touhouxjx/src/title.css?v=1.6.75 | 9.3KB | 1924ms | 2450ms |
| /touhouxjx/src/engine/audio.js | 7.1KB | 1107ms | 6601ms |
| /touhouxjx/src/ui/platform.js | 6.1KB | 3327ms | 2451ms |
| /touhouxjx/src/game/bullets.js | 5.7KB | 1156ms | 6599ms |
| /touhouxjx/src/ui/mobile.css?v=1.6.75 | 4.3KB | 1921ms | 2453ms |
| /touhouxjx/src/engine/renderer.js | 4.2KB | 1175ms | 2451ms |

## 按发起者分类字节（第 1 次）

- link: 130KB
- other: 65KB
- img: 39KB
- script: 43KB