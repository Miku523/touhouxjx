# 首屏测量 · lazyaudio

- 入口：http://127.0.0.1:8138/index.html
- 限速：15KB/s · RTT400ms · 冷 profile · 缓存禁用
- 运行次数：1（成功 1）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 47680ms | 24077ms | 44373ms | 99660ms | 1366KB | 55 | 6ms | 44257ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | 47680ms | 24077ms | 44373ms | 99660ms | 1366KB | 55 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /src/main.js?v=1.6.53 | 200.1KB | 41600ms | 2639ms |
| /src/style.css | 143.1KB | 52019ms | 47582ms |
| /src/game/stage.js | 129.7KB | 47923ms | 44255ms |
| /src/game/story.js | 122.2KB | 46950ms | 44255ms |
| /src/title.css?v=1.6.53 | 55.9KB | 21683ms | 2335ms |
| /src/art/gen/marisa.avif | 49.8KB | 18846ms | 44243ms |
| /src/art/gen/title_bg.avif | 43.2KB | 17371ms | 2639ms |
| /src/art/gen/reimu.avif | 40.2KB | 15619ms | 44243ms |
| /src/game/bullets.js | 39.6KB | 15219ms | 44255ms |
| /src/ui/platform.js | 37.8KB | 26173ms | 2639ms |
| /src/engine/renderer.js | 30.5KB | 15038ms | 2639ms |
| /src/art/gen/marisa_title.avif | 26.6KB | 11330ms | 2639ms |
| /src/ui/mobile.css?v=1.6.53 | 23.3KB | 34866ms | 2436ms |
| /src/engine/input.js | 22.5KB | 18948ms | 2639ms |
| /src/art/gen/reimu_title.avif | 22.3KB | 9461ms | 2639ms |

## 按发起者分类字节（第 1 次）

- link: 330KB
- script: 946KB
- img: 90KB