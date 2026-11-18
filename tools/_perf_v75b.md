# 首屏测量 · v75b

- 入口：https://mikuascendlog.com/touhouxjx/index.html
- 限速：不限速（本机真实网络） · 冷 profile · 缓存禁用
- 运行次数：2（成功 2）

## 中位

| 揭幕(title) | style.css 到 | 到菜单 | load | 传输字节 | 请求数 | TTFB | DCL |
|---|---|---|---|---|---|---|---|
| 111841ms | 6044ms | 13622ms | 15706ms | 1127KB | 134 | 1712ms | 13531ms |

## 逐次

| # | 揭幕 | style.css | menu | load | 字节 | 请求 |
|---|---|---|---|---|---|---|
| 1 | 111841ms | 6044ms | 13622ms | 15706ms | 1127KB | 134 |
| 2 | 66389ms | 3491ms | 5031ms | 7109ms | 1038KB | 130 |

## 最大资源（第 1 次）

| 资源 | 字节 | 耗时 | 起始 |
|---|---|---|---|
| /touhouxjx/src/engine/songs/kaguya_stage6.js | 49.2KB | 59162ms | 15804ms |
| /touhouxjx/src/art/gen/title_bg.avif | 43.2KB | 5402ms | 2152ms |
| /touhouxjx/src/engine/songs/aya_stage4.js | 40.7KB | 27850ms | 15804ms |
| /touhouxjx/src/engine/songs/remilia_septette.js | 38.0KB | 67535ms | 15805ms |
| /touhouxjx/src/engine/songs/pre4.js | 37.1KB | 23112ms | 15804ms |
| /touhouxjx/src/engine/songs/cirno_stage3.js | 34.4KB | 20287ms | 15804ms |
| /touhouxjx/src/engine/songs/wriggle_stage2.js | 31.7KB | 15478ms | 15804ms |
| /touhouxjx/src/engine/songs/pre6.js | 30.9KB | 35457ms | 15804ms |
| /touhouxjx/src/art/scenes.js | 29.9KB | 3389ms | 15084ms |
| /touhouxjx/src/engine/songs/yuuga_stage5.js | 29.0KB | 32333ms | 15804ms |
| /touhouxjx/src/main.js?v=1.6.75 | 28.3KB | 9939ms | 2152ms |
| /touhouxjx/src/art/gen/marisa_title.avif | 26.6KB | 8411ms | 2152ms |
| /touhouxjx/src/engine/songs/pre1.js | 22.6KB | 10683ms | 15804ms |
| /touhouxjx/src/art/gen/reimu_title.avif | 22.3KB | 6209ms | 2152ms |
| /touhouxjx/src/engine/songs/youma_stage1.js | 21.8KB | 13367ms | 15804ms |

## 按发起者分类字节（第 1 次）

- link: 130KB
- script: 701KB
- img: 279KB
- other: 18KB