// 临时生成器：把 scenes.js 内联进 preview-scenes.html（file:// 双击可直接打开）
import fs from 'node:fs';

const src = fs.readFileSync('src/art/scenes.js', 'utf8');
// 去掉 ES Module 的 export 关键字，让同一段代码可以直接跑在普通 <script> 里
const plain = src
  .replace(/export\s*\{[^}]*\};/g, '')
  .replace(/^export\s+/gm, '');

const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>《东方新纪行》场景预览 · 七套主题</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #07070c; color: #e8e2f0; }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
    min-height: 100vh;
    background:
      radial-gradient(1200px 600px at 50% -10%, #241430 0%, rgba(7,7,12,0) 65%),
      #07070c;
  }
  header {
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
    padding: 18px 26px 10px;
  }
  header h1 {
    font-size: 19px; font-weight: 600; letter-spacing: .06em; margin: 0;
    background: linear-gradient(90deg, #ffb7d8, #c8b6ff 45%, #9fd8ff);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  header .sub { font-size: 12.5px; color: #8a8398; letter-spacing: .04em; }
  header .spacer { flex: 1; }
  .btn {
    font: inherit; font-size: 12.5px; color: #d8d2e6; cursor: pointer;
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.13);
    border-radius: 999px; padding: 6px 14px; transition: all .18s;
  }
  .btn:hover { background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.25); }
  #fps { font-size: 12px; color: #7fd8a8; min-width: 74px; text-align: right; font-variant-numeric: tabular-nums; }
  main { padding: 0 26px 30px; }
  .frame {
    border-radius: 16px; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(255,255,255,.09), 0 24px 70px rgba(0,0,0,.65);
    background: #05050a;
  }
  canvas { display: block; width: 100%; height: auto; }
  footer { padding: 0 26px 26px; font-size: 12px; color: #726b82; line-height: 1.9; }
  footer b { color: #b9aecf; font-weight: 500; }
  #zoomWrap {
    position: fixed; inset: 0; z-index: 50; display: none;
    background: rgba(4,3,8,.92);
    align-items: center; justify-content: center; flex-direction: column; gap: 10px;
    cursor: zoom-out; backdrop-filter: blur(3px);
  }
  #zoomWrap.on { display: flex; }
  #zoom {
    width: min(95vw, calc(92vh * 16 / 9)); height: auto;
    border-radius: 10px; box-shadow: 0 0 0 1px rgba(255,255,255,.14), 0 30px 90px #000;
  }
  #zoomHint { font-size: 12px; color: #8f88a0; letter-spacing: .06em; }
</style>
</head>
<body>
<header>
  <h1>《东方新纪行》场景预览</h1>
  <span class="sub">七套主题 · 天空 / 三层视差 / 地形 / 环境粒子</span>
  <span class="spacer"></span>
  <span id="fps">-- fps</span>
  <button class="btn" id="slow">慢动作</button>
  <button class="btn" id="pause">暂停</button>
</header>
<main>
  <div class="frame"><canvas id="sheet" width="1920" height="1080"></canvas></div>
</main>
<footer>
  点击任意画格可全屏放大（1:1 逻辑分辨率 1280×720）看细节，点击任意处返回。
  每个画格都是一次完整的渲染管线调用：<b>drawSky → drawParallax → drawTiles → drawAmbient</b>，
  相机在关卡里缓慢横移，可观察视差与水面 / 粒子动画。本页内联了 <b>src/art/scenes.js</b> 的当前快照，因此可以直接双击打开。
</footer>

<div id="zoomWrap"><canvas id="zoom" width="1280" height="720"></canvas><div id="zoomHint">点击任意处返回</div></div>

<script>
/* ================================================================= */
/*  以下为 src/art/scenes.js 内联快照（去掉模块语法，便于 file:// 打开） */
/* ================================================================= */
${plain}
/* ================================================================= */
/*  预览页逻辑                                                        */
/* ================================================================= */
(function () {
  'use strict';

  var canvas = document.getElementById('sheet');
  var ctx = canvas.getContext('2d');
  var zcanvas = document.getElementById('zoom');
  var zctx = zcanvas.getContext('2d');
  var zoomWrap = document.getElementById('zoomWrap');
  var zoomIdx = -1;
  var CW = 640, CH = 360;          // 单个画格
  var COLS = 3, ROWS = 3;          // 3x3 网格
  var keys = ['shrine', 'forest', 'lake', 'mountain', 'nether', 'moon', 'mansion'];
  var labels = {
    shrine: '博丽神社 · 黄昏樱',
    forest: '魔法森林 · 萤火夜雾',
    lake: '雾之湖 · 冰蓝晨曦',
    mountain: '妖怪之山 · 瀑布溪谷',
    nether: '白玉楼 · 冥界花海',
    moon: '月都 · 永远亭',
    mansion: '红魔馆地下 · 血月水晶'
  };

  /* ---- 预览用假关卡（几何形状固定，只换主题） ---- */
  function makeLevel(theme) {
    var cols = 80, rows = 22;
    var grid = new Uint8Array(cols * rows);
    function set(cx, cy, v) {
      if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[cy * cols + cx] = v;
    }
    var heights = new Array(cols);
    for (var cx = 0; cx < cols; cx++) {
      var h = 18 + Math.round(Math.sin(cx * 0.22) * 1.2);
      if (cx >= 2 && cx <= 12) h = 15;
      if (cx >= 26 && cx <= 30) h = 99;   // 深渊
      if (cx >= 44 && cx <= 51) h = 20;   // 水池
      if (cx >= 62 && cx <= 72) h = 16;   // 高台
      heights[cx] = h;
    }
    for (var cx2 = 0; cx2 < cols; cx2++) {
      var top = heights[cx2];
      if (top > rows) continue;
      for (var cy = top; cy < rows; cy++) set(cx2, cy, cy === top ? 2 : 1);
    }
    // 水池
    for (var wx = 44; wx <= 51; wx++) {
      for (var wy = 20; wy <= 21; wy++) set(wx, wy, wy === 21 ? 1 : 8);
    }
    // 尖刺
    [14, 15, 58].forEach(function (sx) {
      var hh = heights[sx];
      if (hh < 22) set(sx, hh, 5);
    });
    // 蘑菇
    set(22, heights[22], 7);
    // 冰面
    for (var ix = 36; ix <= 40; ix++) set(ix, heights[ix], 6);
    // 藤蔓墙
    for (var vx = 73; vx <= 75; vx++) {
      for (var vy = 13; vy < heights[vx]; vy++) set(vx, vy, 9);
    }
    // 砖块结构
    for (var bx = 66; bx <= 70; bx++) {
      for (var by = 10; by <= 12; by++) set(bx, by, 3);
    }
    // 单向平台
    for (var px = 20; px <= 24; px++) set(px, 12, 4);
    for (var px2 = 27; px2 <= 29; px2++) set(px2, 13, 4);
    for (var px3 = 33; px3 <= 37; px3++) set(px3, 11, 4);
    for (var px4 = 54; px4 <= 58; px4++) set(px4, 13, 4);
    // 漂浮冰砖
    for (var fx = 31; fx <= 32; fx++) set(fx, 15, 6);
    // 起点附近的小砖台
    for (var sx2 = 8; sx2 <= 10; sx2++) set(sx2, 10, 3);

    return {
      theme: theme,
      cols: cols,
      rows: rows,
      w: cols * 32,
      h: rows * 32,
      grid: grid,
      tileAt: function (tx, ty) {
        if (tx < 0 || tx >= cols) return 1;
        if (ty < 0 || ty >= rows) return 0;
        return grid[ty * cols + tx];
      }
    };
  }

  var levels = keys.map(makeLevel);

  /* ---- 状态 ---- */
  var paused = false;
  var slow = false;
  var t = 0;
  var last = performance.now();
  var frames = 0;
  var fpsAcc = 0;
  var fps = 0;

  /* ---- 绘制 ---- */
  function drawCell(i, theme, cam, time) {
    var px = (i % COLS) * CW;
    var py = Math.floor(i / COLS) * CH;
    var level = levels[i];

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, CW, CH);
    ctx.clip();
    ctx.translate(px, py);
    ctx.scale(0.5, 0.5);
    drawSky(ctx, theme, cam, time);
    drawParallax(ctx, theme, cam, time);
    drawTiles(ctx, level, cam, time);
    drawAmbient(ctx, theme, cam, time);
    ctx.restore();

    // 画格内描边
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, CW - 1, CH - 1);
    ctx.restore();

    // 主题标签
    var th = THEMES[theme];
    ctx.save();
    var bx2 = px + 14, by2 = py + CH - 44;
    ctx.fillStyle = 'rgba(8,6,14,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx2, by2, 224, 32, 8);
    else ctx.rect(bx2, by2, 224, 32);
    ctx.fill();
    ctx.font = '600 15px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[theme], bx2 + 12, by2 + 17);
    // 调色板点
    ctx.fillStyle = th.accent;
    ctx.beginPath();
    ctx.arc(bx2 + 200, by2 + 16, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = th.far;
    ctx.beginPath();
    ctx.arc(bx2 + 212, by2 + 16, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function render(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < keys.length; i++) {
      var cam = {
        x: 300 + Math.sin(time * 0.10 + i * 0.65) * 130,
        y: 0
      };
      drawCell(i, keys[i], cam, time);
    }

    // 第八格：标题/图例
    var px = (7 % COLS) * CW, py = Math.floor(7 / COLS) * CH;
    ctx.save();
    ctx.translate(px, py);
    var g = ctx.createLinearGradient(0, 0, CW, CH);
    g.addColorStop(0, '#0b0812');
    g.addColorStop(1, '#151024');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (var gy = 0; gy < CH; gy += 24) {
      ctx.fillRect(0, gy, CW, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (var gx = 0; gx < CW; gx += 24) {
      ctx.fillRect(gx, 0, 1, CH);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 22px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.fillText('场景绘制说明', 28, 46);
    ctx.font = '13.5px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(205,196,224,0.85)';
    var lines = [
      '· 天空：三元渐变 + 确定性星空 + 天体辉光 + 云带',
      '· 视差：远 0.08 / 中 0.22 / 近 0.45，纵向轻微视差',
      '· 地形：泥土分层纹理、草叶、砖缝、冰棱、水波',
      '· 粒子：樱瓣 / 萤火 / 霜雪 / 水沫 / 花屑 / 月尘 / 血雾',
      '· 全部程序化矢量，无图片、无 Math.random 抖动',
      '· drawTiles 仅遍历可见范围（约 42×24 tile）'
    ];
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], 28, 84 + li * 27);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.strokeRect(0.5, 0.5, CW - 1, CH - 1);
    ctx.restore();
  }

  function renderZoom(time) {
    var theme = keys[zoomIdx];
    var cam = { x: 380 + Math.sin(time * 0.06) * 420, y: 0 };
    zctx.clearRect(0, 0, 1280, 720);
    // 与引擎一致：天空 / 视差是屏幕坐标，地形是“已被相机平移”的世界坐标
    drawSky(zctx, theme, { x: 0, y: 0 }, time);
    drawParallax(zctx, theme, cam, time);
    zctx.save();
    zctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    drawTiles(zctx, levels[zoomIdx], cam, time);
    zctx.restore();
    drawAmbient(zctx, theme, cam, time);

    zctx.save();
    var th = THEMES[theme];
    zctx.fillStyle = 'rgba(6,4,12,0.5)';
    zctx.fillRect(18, 18, 268, 44);
    zctx.font = '600 19px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    zctx.fillStyle = 'rgba(255,255,255,0.95)';
    zctx.textBaseline = 'middle';
    zctx.fillText(labels[theme], 32, 41);
    zctx.fillStyle = th.accent;
    zctx.beginPath();
    zctx.arc(258, 40, 6, 0, Math.PI * 2);
    zctx.fill();
    zctx.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    frames++;
    fpsAcc += dt;
    if (fpsAcc >= 0.5) {
      fps = frames / fpsAcc;
      frames = 0;
      fpsAcc = 0;
      document.getElementById('fps').textContent = fps.toFixed(0) + ' fps';
    }

    if (!paused) t += dt * (slow ? 0.18 : 1);
    // 预览限帧到 30fps，保证多画格下依旧顺滑
    if (!frame._next || now >= frame._next) {
      frame._next = now + 32;
      if (zoomIdx >= 0) renderZoom(t);
      else render(t);
    }
  }

  canvas.addEventListener('click', function (e) {
    var r = canvas.getBoundingClientRect();
    var bx = (e.clientX - r.left) * canvas.width / r.width;
    var by = (e.clientY - r.top) * canvas.height / r.height;
    var idx = Math.floor(by / CH) * COLS + Math.floor(bx / CW);
    if (idx >= 0 && idx < keys.length) {
      zoomIdx = idx;
      zoomWrap.classList.add('on');
    }
  });
  zoomWrap.addEventListener('click', function () {
    zoomIdx = -1;
    zoomWrap.classList.remove('on');
  });

  document.getElementById('pause').addEventListener('click', function () {
    paused = !paused;
    this.textContent = paused ? '继续' : '暂停';
  });
  document.getElementById('slow').addEventListener('click', function () {
    slow = !slow;
    this.textContent = slow ? '正常速度' : '慢动作';
  });

  // #forest 之类的 hash 可直接放大对应主题
  var hi = keys.indexOf(decodeURIComponent(location.hash.replace(/^#/, '')));
  if (hi >= 0) {
    zoomIdx = hi;
    zoomWrap.classList.add('on');
  }

  requestAnimationFrame(frame);
})();
</script>
</body>
</html>
`;

fs.writeFileSync('preview-scenes.html', page);
console.log('preview-scenes.html:', page.length, 'bytes');
