import io

p = 'src/game/stage.js'
s = io.open(p, encoding='utf-8').read()

old = """    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(a.img, (cv.width - iw) / 2, (cv.height - ih) / 2, iw, ih);

    // 顶部压暗"""
new = """    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    // 统一调色：提高对比与饱和、压低整体亮度，让 AI 图不再「灰白平」
    c.filter = 'saturate(1.14) contrast(1.10) brightness(0.94)';
    c.drawImage(a.img, (cv.width - iw) / 2, (cv.height - ih) / 2, iw, ih);
    c.filter = 'none';

    // 冷色主题：把画面里那颗「白描边太阳」包成有体积的月亮/冷日
    if (theme === 'lake' || theme === 'moon' || theme === 'mountain') {
      const gx = cv.width * 0.29, gy = H * 0.43, gr = 120;
      const glow = c.createRadialGradient(gx, gy, gr * 0.2, gx, gy, gr);
      glow.addColorStop(0, 'rgba(228, 240, 255, 0.34)');
      glow.addColorStop(0.45, 'rgba(190, 215, 255, 0.16)');
      glow.addColorStop(1, 'rgba(160, 190, 255, 0)');
      c.fillStyle = glow;
      c.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }

    // 冷色光柱：斜向体积光，给 2D 背景一点「3D 布景」的空气感
    if (theme === 'lake' || theme === 'moon' || theme === 'mountain') {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        c.save();
        c.translate(cv.width * (0.22 + i * 0.24), -40);
        c.rotate(0.28 + i * 0.05);
        const sh = c.createLinearGradient(0, 0, 0, H * 1.1);
        sh.addColorStop(0, 'rgba(210, 236, 255, ' + (0.10 - i * 0.022) + ')');
        sh.addColorStop(0.6, 'rgba(180, 215, 255, 0.035)');
        sh.addColorStop(1, 'rgba(150, 190, 255, 0)');
        c.fillStyle = sh;
        c.beginPath();
        c.moveTo(-14, 0); c.lineTo(14, 0); c.lineTo(120, H * 1.15); c.lineTo(-150, H * 1.15);
        c.closePath();
        c.fill();
        c.restore();
      }
      c.restore();
    }

    // 顶部压暗"""
assert old in s
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
