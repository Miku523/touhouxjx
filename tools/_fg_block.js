  /* 前景剪影：贴边的东西（枝、苇、竹、花）以更大视差缓慢横移，建立三层景深。
     只画在屏幕最外侧与上下角，中央留空，不挡判定。 */
  _drawForeground(ctx, theme, cam) {
    if (this.mode === 'stg') return;
    const W = VIEW_W, H = VIEW_H, t = this.t;
    const sway = Math.sin(cam.x * 0.0022 + 0.6) * 16;
    const cfg = {
      shrine:   { ink: '#1c0814', rim: 'rgba(255,150,110,0.16)' },
      forest:   { ink: '#03120c', rim: 'rgba(120,240,200,0.13)' },
      lake:     { ink: '#061018', rim: 'rgba(170,220,255,0.16)' },
      mountain: { ink: '#120a14', rim: 'rgba(255,190,140,0.13)' },
      nether:   { ink: '#160412', rim: 'rgba(255,120,170,0.14)' },
      moon:     { ink: '#050a18', rim: 'rgba(160,190,255,0.15)' },
      mansion:  { ink: '#140208', rim: 'rgba(255,90,110,0.15)' },
    }[theme] || { ink: '#0a0812', rim: 'rgba(200,200,255,0.12)' };

    const hash = (n) => {
      let x = (n | 0) + 0x9e3779b9;
      x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
      x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
      return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
    };

    const reed = (bx, by, n, hMax, dir) => {
      for (let i = 0; i < n; i++) {
        const r1 = hash(i * 31 + bx);
        const r2 = hash(i * 57 + by);
        const h = hMax * (0.55 + r1 * 0.55);
        const x = bx + dir * (i * 9 + r2 * 8);
        const bend = dir * (10 + r2 * 22);
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.quadraticCurveTo(x + bend * 0.35, by - h * 0.6, x + bend, by - h);
        ctx.strokeStyle = cfg.ink;
        ctx.lineWidth = 3.2 - i * 0.28;
        ctx.stroke();
        // 穗
        ctx.beginPath();
        ctx.ellipse(x + bend, by - h - 6, 2.6, 7 + r1 * 5, dir * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = cfg.ink;
        ctx.fill();
      }
    };

    const bamboo = (bx, by, h, dir) => {
      const lean = dir * (6 + hash(bx) * 10);
      ctx.beginPath();
      ctx.moveTo(bx - 5, by);
      ctx.quadraticCurveTo(bx + lean * 0.4, by - h * 0.55, bx + lean, by - h);
      ctx.lineTo(bx + lean + 7, by - h);
      ctx.quadraticCurveTo(bx + lean * 0.4 + 7, by - h * 0.55, bx + 3, by);
      ctx.closePath();
      ctx.fillStyle = cfg.ink;
      ctx.fill();
      // 竹节
      ctx.strokeStyle = cfg.rim;
      ctx.lineWidth = 1;
      for (let k = 1; k < 6; k++) {
        const yy = by - (h * k) / 6;
        ctx.beginPath();
        ctx.moveTo(bx - 4 + lean * (k / 6) * 0.4, yy);
        ctx.lineTo(bx + 7 + lean * (k / 6) * 0.4, yy);
        ctx.stroke();
      }
      // 斜枝 + 叶
      for (let k = 0; k < 3; k++) {
        const yy = by - h * (0.55 + k * 0.14);
        const xx = bx + lean * (0.55 + k * 0.14);
        const d = (k % 2 ? 1 : -1) * dir;
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.quadraticCurveTo(xx + d * 30, yy - 16, xx + d * 58, yy - 26);
        ctx.strokeStyle = cfg.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let m = 0; m < 4; m++) {
          const ex = xx + d * (28 + m * 9), ey = yy - 14 - m * 4;
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(d * (0.5 + m * 0.22));
          ctx.beginPath();
          ctx.ellipse(0, 0, 15, 2.6, 0, 0, Math.PI * 2);
          ctx.fillStyle = cfg.ink;
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const branch = (x0, y0, len, ang, depth) => {
      if (depth <= 0 || len < 12) return;
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + Math.cos(ang + 0.5) * 6, (y0 + y1) / 2, x1, y1);
      ctx.strokeStyle = cfg.ink;
      ctx.lineWidth = Math.max(1.2, depth * 2.4);
      ctx.lineCap = 'round';
      ctx.stroke();
      if (depth <= 2) {
        for (let k = 0; k < 3; k++) {
          const a = ang + (k - 1) * 0.75 + 0.3;
          const r = 11 + hash(k + depth) * 7;
          ctx.beginPath();
          ctx.arc(x1 + Math.cos(a) * r, y1 + Math.sin(a) * r, 2.4 + hash(k * 7) * 1.8, 0, Math.PI * 2);
          ctx.fillStyle = cfg.ink;
          ctx.fill();
        }
      }
      branch(x1, y1, len * 0.62, ang + 0.56 + hash(depth * 13) * 0.26, depth - 1);
      branch(x1, y1, len * 0.55, ang - 0.5 - hash(depth * 29) * 0.3, depth - 1);
      branch(x1, y1, len * 0.4, ang + 0.06, depth - 1);
    };

    const trunk = (bx, by, h, w, dir) => {
      ctx.beginPath();
      ctx.moveTo(bx - w * 0.5, by);
      ctx.bezierCurveTo(bx - w * 0.36, by - h * 0.5, bx - w * 0.3 + dir * 10, by - h * 0.8, bx - w * 0.16 + dir * 16, by - h);
      ctx.lineTo(bx + w * 0.2 + dir * 16, by - h);
      ctx.bezierCurveTo(bx + w * 0.34 + dir * 8, by - h * 0.7, bx + w * 0.44, by - h * 0.4, bx + w * 0.5, by);
      ctx.closePath();
      ctx.fillStyle = cfg.ink;
      ctx.fill();
      ctx.strokeStyle = cfg.rim;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.5 - 2, by);
      ctx.bezierCurveTo(bx + w * 0.4, by - h * 0.45, bx + w * 0.26 + dir * 8, by - h * 0.8, bx + w * 0.2 + dir * 16, by - h);
      ctx.stroke();
    };

    const lily = (bx, by, h, dir) => {
      ctx.strokeStyle = cfg.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + dir * 14, by - h * 0.55, bx + dir * 4, by - h);
      ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.5;
        const rr = 12 + (k % 2) * 6;
        ctx.save();
        ctx.translate(bx + dir * 4, by - h);
        ctx.rotate(a + dir * 0.1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(rr * 0.5, -rr * 0.4, rr, -rr * 0.1);
        ctx.quadraticCurveTo(rr * 0.5, rr * 0.16, 0, 0);
        ctx.fillStyle = cfg.ink;
        ctx.fill();
        ctx.restore();
      }
    };

    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.translate(sway, 0);

    if (theme === 'shrine') {
      branch(-40, -30, 120, 0.55, 4);
      branch(W + 20, -40, 100, Math.PI - 0.5, 4);
      reed(30, H + 4, 9, 74, 1);
      reed(W - 22, H + 4, 8, 62, -1);
    } else if (theme === 'forest') {
      trunk(-18, H + 20, 560, 92, 1);
      trunk(W + 20, H + 20, 520, 84, -1);
      branch(70, -20, 92, 0.8, 3);
      branch(W - 60, -10, 80, Math.PI - 0.85, 3);
    } else if (theme === 'lake') {
      reed(20, H + 4, 12, 96, 1);
      reed(W - 16, H + 4, 10, 84, -1);
      branch(W - 30, -40, 92, Math.PI - 0.6, 3);
    } else if (theme === 'mountain') {
      branch(-30, -20, 118, 0.5, 4);
      reed(40, H + 4, 7, 52, 1);
      reed(W - 40, H + 4, 7, 58, -1);
    } else if (theme === 'nether') {
      lily(46, H + 6, 92, 1);
      lily(96, H + 6, 70, 1);
      lily(W - 52, H + 6, 96, -1);
      lily(W - 104, H + 6, 66, -1);
      branch(W + 10, -30, 86, Math.PI - 0.7, 3);
    } else if (theme === 'moon') {
      bamboo(26, H + 8, 400, 1);
      bamboo(74, H + 8, 330, 1);
      bamboo(W - 30, H + 8, 420, -1);
      bamboo(W - 82, H + 8, 350, -1);
    } else if (theme === 'mansion') {
      branch(-20, -24, 106, 0.62, 4);
      branch(W + 16, -18, 96, Math.PI - 0.56, 4);
      trunk(-10, H + 16, 300, 64, 1);
      trunk(W + 10, H + 16, 300, 64, -1);
    }

    // 近景飞絮：比背景花瓣更大、更快，强化视差
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 10; i++) {
      const ph = (t * 0.07 + i * 0.13) % 1;
      const x = ((i * 197 + 83) % W) + Math.sin(t * 0.7 + i) * 24 - sway * 0.5;
      const y = ph * (H + 60) - 30;
      const s = 4 + (i % 3) * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 0.6 + i);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = theme === 'nether' ? '#3a0a18' : '#0b0710';
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

