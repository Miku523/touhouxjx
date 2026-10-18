import io

p = 'src/game/stage.js'
s = io.open(p, encoding='utf-8').read()

helpers = '''
  /** 冰晶前景剪影：只在湖/月都出现，作为「立体布景」的近景，画在背景之后、地形之前 */
  _drawIceCrystals(ctx, theme) {
    if (theme !== 'lake' && theme !== 'moon') return;
    const W = VIEW_W, H = VIEW_H;
    ctx.save();
    const cluster = (bx, dir, alpha) => {
      ctx.save();
      ctx.translate(bx, H + 8);
      ctx.scale(dir, 1);
      const shards = [
        [0, 0, 54, 150], [40, 0, 30, 96], [70, 0, 38, 124], [-36, 0, 24, 78], [100, 0, 20, 56],
      ];
      for (let i = 0; i < shards.length; i++) {
        const x = shards[i][0], y = shards[i][1], w = shards[i][2], h = shards[i][3];
        ctx.beginPath();
        ctx.moveTo(x - w * 0.5, y);
        ctx.lineTo(x - w * 0.26, y - h * 0.7);
        ctx.lineTo(x, y - h);
        ctx.lineTo(x + w * 0.32, y - h * 0.64);
        ctx.lineTo(x + w * 0.5, y);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, y, 0, y - h);
        g.addColorStop(0, 'rgba(8, 16, 32, ' + (0.9 * alpha) + ')');
        g.addColorStop(0.62, 'rgba(16, 40, 68, ' + (0.82 * alpha) + ')');
        g.addColorStop(1, 'rgba(132, 206, 246, ' + (0.24 * alpha) + ')');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(168, 228, 255, ' + (0.2 * alpha) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    };
    cluster(34, 1, 0.92);
    cluster(W - 34, -1, 0.92);
    cluster(150, 1, 0.5);
    cluster(W - 150, -1, 0.5);
    ctx.restore();
  }

  /** 雪/冰尘：冷色主题的环境天气，屏幕坐标，画在最上层但不挡判定 */
  _drawWeather(ctx, theme) {
    const cold = theme === 'lake' || theme === 'mountain' || theme === 'moon';
    if (!cold) return;
    const t = this.t;
    const W = VIEW_W, H = VIEW_H;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 64; i++) {
      const d = 0.35 + ((i * 53) % 97) / 97 * 0.75;
      const spd = 10 + d * 26;
      const x0 = (i * 181 + 37) % W;
      const y = ((i * 127) % (H + 40) + t * spd) % (H + 40) - 20;
      const x = (x0 + Math.sin(t * (0.3 + d * 0.5) + i * 1.7) * 18 * d + t * 5 * d) % W;
      const r = 0.7 + d * 2.1;
      ctx.globalAlpha = 0.16 + d * 0.32;
      ctx.fillStyle = '#e6f6ff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 9; i++) {
      const ph = (t * 0.5 + i * 0.77) % 1;
      const x = ((i * 233 + 91) % W) + Math.sin(t * 0.6 + i) * 10;
      const y = ((i * 157 + 43) % H) + Math.sin(t * 0.9 + i * 2) * 8;
      const s = 2.2 + (i % 3) * 1.2;
      ctx.globalAlpha = (0.1 + 0.22 * Math.sin(ph * Math.PI)) * 0.9;
      ctx.strokeStyle = '#dff4ff';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
      ctx.stroke();
    }
    ctx.restore();
  }

'''

marker = '  draw(ctx, alpha) {'
assert marker in s
s = s.replace(marker, helpers + marker, 1)

old_bg = '''    if (usable.length) {
      this._drawPaintedBg(ctx, usable, cam, theme);
    } else {'''
new_bg = '''    if (usable.length) {
      this._drawPaintedBg(ctx, usable, cam, theme);
      this._drawIceCrystals(ctx, theme);
    } else {'''
assert old_bg in s
s = s.replace(old_bg, new_bg, 1)

old_amb = '''    ctx.save();
    drawAmbient(ctx, theme, cam, this.t);
    ctx.restore();'''
new_amb = '''    ctx.save();
    drawAmbient(ctx, theme, cam, this.t);
    ctx.restore();

    // 冷色主题的雪与冰尘
    this._drawWeather(ctx, theme);'''
assert old_amb in s
s = s.replace(old_amb, new_amb, 1)

io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
