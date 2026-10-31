# 首屏测量 · online51

- 入口：https://mikuascendlog.com/touhouxjx/index.html
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：3（成功 3）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 49901ms | 3854ms | 12122ms | 63114ms | 502KB | 75 | 1926ms | 12006ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | 52870ms | 1909ms | 3032ms | 65022ms | 502KB | 75 |
| 2 | 43172ms | 5987ms | 12122ms | 63114ms | 502KB | 75 |
| 3 | 49901ms | 3854ms | 21736ms | 53399ms | 519KB | 75 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /touhouxjx/src/art/gen/marisa.avif | 49.8KB | 62127ms | 2838ms |
| /touhouxjx/src/art/gen/title_bg.avif | 43.2KB | 1278ms | 1121ms |
| /touhouxjx/src/art/gen/reimu.avif | 40.2KB | 61452ms | 2838ms |
| /touhouxjx/src/art/scenes.js | 29.9KB | 14606ms | 4802ms |
| /touhouxjx/src/main.js?v=1.6.51 | 27.0KB | 551ms | 1121ms |
| /touhouxjx/src/art/gen/marisa_title.avif | 26.6KB | 1336ms | 1121ms |
| /touhouxjx/src/game/story.js | 25.2KB | 1945ms | 2850ms |
| /touhouxjx/src/art/gen/reimu_title.avif | 22.3KB | 559ms | 1121ms |
| /touhouxjx/src/game/boss.js | 20.7KB | 31343ms | 4802ms |
| /touhouxjx/src/game/stage.js | 16.6KB | 1947ms | 2849ms |
| /touhouxjx/src/engine/songs/honou_pre1.js | 12.7KB | 1947ms | 2850ms |
| /touhouxjx/src/engine/songs/title_full.js | 9.9KB | 1713ms | 1121ms |
| /touhouxjx/src/title.css?v=1.6.51 | 9.3KB | 743ms | 1120ms |
| /touhouxjx/src/game/stg.js | 8.1KB | 23538ms | 4802ms |
| /touhouxjx/src/game/enemies.js | 8.0KB | 20763ms | 4802ms |

## 按发起者分类字节（第 1 次）

- link: 110KB
- script: 303KB
- img: 90KB