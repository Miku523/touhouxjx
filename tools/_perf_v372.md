# 首屏测量 · v372

- 入口：https://mikuascendlog.com/touhouxjx/index.html
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 49963ms | 5134ms | 8293ms | 59907ms | 475KB | 75 | 2397ms | 8200ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | 49963ms | 5134ms | 7440ms | 59907ms | 475KB | 75 |
| 2 | -1ms | 4560ms | 8293ms | 9710ms | 327KB | 45 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /touhouxjx/src/art/gen/title_bg.avif | 43.2KB | 2356ms | 3294ms |
| /touhouxjx/src/art/scenes.js | 29.9KB | 9689ms | 13073ms |
| /touhouxjx/src/main.js?v=1.6.72 | 28.3KB | 2917ms | 3294ms |
| /touhouxjx/src/art/gen/marisa_title.avif | 26.6KB | 2917ms | 3294ms |
| /touhouxjx/src/engine/songs/pre1.js | 22.6KB | 17571ms | 23837ms |
| /touhouxjx/src/art/gen/reimu_title.avif | 22.3KB | 1455ms | 3294ms |
| /touhouxjx/src/engine/songs/youma_stage1.js | 21.8KB | 25635ms | 23837ms |
| /touhouxjx/src/game/boss.js | 21.4KB | 3534ms | 13073ms |
| /touhouxjx/src/art/gen/marisa.avif | 21.0KB | 52468ms | 7339ms |
| /touhouxjx/src/style.css | 20.3KB | 3257ms | 7349ms |
| /touhouxjx/src/art/gen/reimu.avif | 18.3KB | 51098ms | 7339ms |
| /touhouxjx/src/game/stage.js | 17.8KB | 5723ms | 7349ms |
| /touhouxjx/src/engine/songs/title_full.js | 9.9KB | 10531ms | 13302ms |
| /touhouxjx/src/title.css?v=1.6.72 | 9.3KB | 1720ms | 3294ms |
| /touhouxjx/src/game/stg.js | 8.1KB | 4551ms | 13073ms |

## 按发起者分类字节（第 1 次）

- link: 130KB
- script: 306KB
- img: 39KB