# 接口契约（模块之间必须严格遵守）

游戏名：**PIXEL DASH** —— 网页端 2D 像素平台跳跃动作游戏。
技术：纯原生 ES Module + Canvas2D，**零依赖、零构建**。
内部渲染分辨率固定 **480 x 270**，整数倍放大到窗口（`image-rendering: pixelated`）。

## 坐标与单位
- 单位：像素（游戏内逻辑像素），tile 尺寸 **16x16**。
- 世界坐标原点在左上，x 向右、y 向下为**正**。
- 时间：秒（浮点）。

## 文件分工（禁止越界修改别人的文件）
- `lead`：index.html、src/main.js、src/engine/loop.js、src/engine/input.js、
  src/engine/renderer.js、src/game/* 全部、src/assets/levels.js
- `art`：**只写** `src/assets/sprites.js`
- `audio`：**只写** `src/engine/audio.js`

---

## 契约 A：src/assets/sprites.js（art 负责）

必须导出**唯一**一个函数：

```js
export function buildSprites(): Sprites
```

返回对象结构（所有值都是**离屏 HTMLCanvasElement**，尺寸严格按表中数值，透明背景）：

```js
{
  player: {
    idle:  [c],                  // 1 帧，12x16
    run:   [c,c,c,c],            // 4 帧，12x16
    jump:  [c],                  // 1 帧，12x16
    fall:  [c],                  // 1 帧，12x16
  },
  slime:  [c,c],                 // 2 帧，16x16（地面敌人，两帧做挤压呼吸感）
  bat:    [c,c],                 // 2 帧，16x12（飞行敌人，翅膀上下）
  spike:  [c],                   // 1 帧，16x16（尖刺，底部对齐）
  coin:   [c,c,c,c],             // 4 帧，10x10（旋转金币动画）
  flag:   [c],                   // 1 帧，16x32（终点旗，底边对齐 y=32）
  tiles: {                       // 全部 16x16
    solid: [c,c,c,c],            // 4 种地面/泥土变体，可无缝拼接
    grass: [c],                  // 顶部带草的方块
    brick: [c],                  // 砖块
    platform: [c],               // 单向平台（视觉上轻薄，只占下半部分）
    spike:  [c],                 // 尖刺瓷砖版本
    bg:     [c,c,c],             // 背景装饰块（半透明/暗色，不参与碰撞）
  },
  particle: [c,c,c],             // 3 帧，4x4 的方形小点（白/亮色，运行时染色）
  heart: [c],                    // 1 帧，8x8，满血
  heartEmpty: [c],               // 1 帧，8x8，空血
}
```

要求：
1. 使用 `document.createElement('canvas')`，`ctx.imageSmoothingEnabled = false`。
2. 像素画用字符地图 + 调色板逐像素 `fillRect(1,1)` 绘制，**不要**用渐变/抗锯齿。
3. 复古 8-bit 配色：主体饱和、暗部用深色描边（1px outline），整体明度偏低以便和背景分离。
4. 每个精灵四周留 0~1px 透明边，不要顶满。
5. 玩家角色：小个子冒险者，有头盔/眼睛/披风，朝**右**（渲染时会 `scale(-1,1)` 翻转）。
6. 文件自包含：不能 import 其他模块；不能访问 DOM 之外的全局状态；不依赖窗口尺寸。
7. 纯函数式：多次调用返回新 canvas，互不共享可变状态。
8. 顶部写一行注释说明每个精灵是什么。

---

## 契约 B：src/engine/audio.js（audio 负责）

必须导出：

```js
export class AudioEngine {
  constructor()                       // 只做初始化，不要在此创建 AudioContext（可能没有用户手势）
  unlock();                           // 在首次点击/按键时调用；创建/恢复 AudioContext，幂等
  play(name, opts = {});              // 播放一次性音效
  setMusic(on: boolean);              // 开/关 BGM
  setMuted(muted: boolean);           // 全局静音
  get muted();                        // 只读
}
```

`play` 支持的名字（缺一不可，都是短促的 8-bit 音色）：
`jump` `doubleJump` `land` `coin` `hurt` `stomp` `die` `win` `checkpoint` `dash` `menu` `select` `bounce`

要求：
- 完全用 **WebAudio 振荡器 + 增益包络** 程序化合成，**不允许**任何外部音频文件。
- 波形以 `square` / `triangle` 为主，必要时叠一点噪声（用 AudioBuffer 白噪声）做打击感。
- 单次音效时长 0.05s ~ 0.35s；音量克制（峰值 gain ≤ 0.25），不要刺耳；`hurt`/`die` 可用下滑音。
- BGM：一首循环的 chiptune 小段落（8~16 小节、方波旋律 + 三角波低音即可），用 `setTimeout`/`AudioBuffer` 调度；`setMusic(false)` 必须立即停止且可重入不叠音。
- 任何方法在 `unlock()` 之前调用都必须**安全 no-op**，不能抛错。
- 文件自包含（不 import 其他模块），不访问 DOM 除 `window.AudioContext`。
- 顶部注释列出实现要点。

---

## 共享约定
- 不引入 npm / 框架 / 打包器。
- 所有模块用 `export` / `import`。
- 代码注释用中文。
- 完成后各自跑一次 `node --check` 之类的语法自检（模块语法可用 `node --input-type=module --eval` 或直接读一遍）。
