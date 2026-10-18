  /* 前景剪影：贴边的东西（枝、苇、竹、花）作为「最近一层」。
     为了像镜头近景，整层一次性烘焙并加轻微模糊，运行时只做横向视差位移。 */
  _fgBake(theme) {
    const W = VIEW_W, H = VIEW_H;
    const cw = W + 160, ch = H;
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const ctx = cv.getContext('2d');
    if (!ctx) return cv;

    const cfg = {
      shrine:   { ink: '#160510', rim: 'rgba(255,150,110,0.20)' },
      forest:   { ink: '#02100a', rim: 'rgba(120,240,200,0.16)' },
      lake:     { ink: '#040c14', rim: 'rgba(170,220,255,0.20)' },
      mountain: { ink: '#0e0710', rim: 'rgba(255,190,140,0.16)' },
      nether:   { ink: '#12030e', rim: 'rgba(255,120,170,0.18)' },
      moon:     { ink: '#03060f', rim: 'rgba(160,190,255,0.18)' },
      mansion:  { ink: '#100106', rim: 'rgba(255,90,110,0.18)' },
    }[theme] || { ink: '#080610', rim: 'rgba(200,200,255,0.14)' };

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
        const h = hMax * (0.5 + r1 * 0.6);
        const x = bx + dir * (i * 11 + r2 * 9);
        const bend = dir * (14 + r2 * 30);
        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.quadraticCurveTo(x + bend * 0.3, by - h * 0.6, x + bend, by - h);
        ctx.strokeStyle = cfg.ink;
        ctx.lineWidth = 4.2 - i * 0.28;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + bend, by - h - 8, 3 + r1 * 1.6, 9 + r1 * 7, dir * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = cfg.ink;
        ctx.fill();
      }
    };

    const bamboo = (bx, by, h, dir) => {
      const lean = dir * (8 + hash(bx) * 14);
      ctx.beginPath();
      ctx.moveTo(bx - 7, by);
      ctx.quadraticCurveTo(bx + lean * 0.4, by - h * 0.55, bx + lean, by - h);
      ctx.lineTo(bx + lean + 10, by - h);
      ctx.quadraticCurveTo(bx + lean * 0.4 + 10, by - h * 0.55, bx + 5, by);
      ctx.closePath();
      ctx.fillStyle = cfg.ink;
      ctx.fill();
      ctx.strokeStyle = cfg.rim;
      ctx.lineWidth = 1;
      for (let k = 1; k < 7; k++) {
        const yy = by - (h * k) / 7;
        ctx.beginPath();
        ctx.moveTo(bx - 6 + lean * (k / 7) * 0.4, yy);
        ctx.lineTo(bx + 9 + lean * (k / 7) * 0.4, yy);
        ctx.stroke();
      }
      for (let k = 0; k < 3; k++) {
        const yy = by - h * (0.52 + k * 0.15);
        const xx = bx + lean * (0.52 + k * 0.15);
        const d = (k % 2 ? 1 : -1) * dir;
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.quadraticCurveTo(xx + d * 40, yy - 20, xx + d * 78, yy - 34);
        ctx.strokeStyle = cfg.ink;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        for (let m = 0; m < 5; m++) {
          const ex = xx + d * (34 + m * 11), ey = yy - 16 - m * 5;
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(d * (0.46 + m * 0.2));
          ctx.beginPath();
          ctx.ellipse(0, 0, 20, 3.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = cfg.ink;
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const branch = (x0, y0, len, ang, depth) => {
      if (depth <= 0 || len < 14) return;
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + Math.cos(ang + 0.5) * 8, (y0 + y1) / 2, x1, y1);
      ctx.strokeStyle = cfg.ink;
      ctx.lineWidth = Math.max(1.6, depth * 3.4);
      ctx.lineCap = 'round';
      ctx.stroke();
      if (depth <= 2) {
        for (let k = 0; k < 4; k++) {
          const a = ang + (k - 1.5) * 0.6 + 0.3;
          const r = 14 + hash(k + depth) * 10;
          const cx = x1 + Math.cos(a) * r, cy = y1 + Math.sin(a) * r;
          const pr = 3.2 + hash(k * 7) * 2.2;
          for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(pa) * pr * 0.8, cy + Math.sin(pa) * pr * 0.8, pr * 0.9, pr * 0.55, pa, 0, Math.PI * 2);
            ctx.fillStyle = cfg.ink;
            ctx.fill();
          }
        }
      }
      branch(x1, y1, len * 0.64, ang + 0.56 + hash(depth * 13) * 0.26, depth - 1);
      branch(x1, y1, len * 0.56, ang - 0.5 - hash(depth * 29) * 0.3, depth - 1);
      branch(x1, y1, len * 0.42, ang + 0.06, depth - 1);
    };

    const trunk = (bx, by, h, w, dir) => {
      ctx.beginPath();
      ctx.moveTo(bx - w * 0.5, by);
      ctx.bezierCurveTo(bx - w * 0.34, by - h * 0.5, bx - w * 0.28 + dir * 12, by - h * 0.8, bx - w * 0.14 + dir * 20, by - h);
      ctx.lineTo(bx + w * 0.22 + dir * 20, by - h);
      ctx.bezierCurveTo(bx + w * 0.36 + dir * 10, by - h * 0.7, bx + w * 0.46, by - h * 0.4, bx + w * 0.5, by);
      ctx.closePath();
      ctx.fillStyle = cfg.ink;
      ctx.fill();
      ctx.strokeStyle = cfg.rim;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.5 - 2, by);
      ctx.bezierCurveTo(bx + w * 0.4, by - h * 0.45, bx + w * 0.26 + dir * 10, by - h * 0.8, bx + w * 0.22 + dir * 20, by - h);
      ctx.stroke();
    };

    const lily = (bx, by, h, dir) => {
      ctx.strokeStyle = cfg.ink;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + dir * 18, by - h * 0.55, bx + dir * 5, by - h);
      ctx.stroke();
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.46;
        const rr = 16 + (k % 2) * 9;
        ctx.save();
        ctx.translate(bx + dir * 5, by - h);
        ctx.rotate(a + dir * 0.12);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(rr * 0.5, -rr * 0.45, rr, -rr * 0.12);
        ctx.quadraticCurveTo(rr * 0.5, rr * 0.18, 0, 0);
        ctx.fillStyle = cfg.ink;
        ctx.fill();
        ctx.restore();
      }
    };

    ctx.save();
    ctx.filter = 'blur(4px)';
    ctx.globalAlpha = 0.96;
    const X = (x) => x + 80; // 左右各留 80 出血

    if (theme === 'shrine') {
      branch(X(-40), -50, 150, 0.58, 4);
      branch(X(W + 20), -60, 128, Math.PI - 0.52, 4);
      reed(X(36), H + 30, 10, 210, 1);
      reed(X(W - 30), H + 30, 9, 190, -1);
    } else if (theme === 'forest') {
      trunk(X(-30), H + 40, 700, 120, 1);
      trunk(X(W + 30), H + 40, 660, 108, -1);
      branch(X(70), -30, 120, 0.8, 3);
      branch(X(W - 70), -20, 104, Math.PI - 0.85, 3);
    } else if (theme === 'lake') {
      reed(X(24), H + 30, 13, 240, 1);
      reed(X(W - 20), H + 30, 12, 226, -1);
      branch(X(W - 40), -50, 120, Math.PI - 0.58, 3);
      branch(X(20), -40, 96, 0.62, 3);
    } else if (theme === 'mountain') {
      branch(X(-40), -30, 150, 0.5, 4);
      reed(X(34), H + 30, 8, 150, 1);
      reed(X(W - 34), H + 30, 8, 160, -1);
    } else if (theme === 'nether') {
      lily(X(48), H + 30, 220, 1);
      lily(X(112), H + 30, 168, 1);
      lily(X(W - 54), H + 30, 228, -1);
      lily(X(W - 120), H + 30, 160, -1);
      branch(X(W + 20), -40, 110, Math.PI - 0.7, 3);
    } else if (theme === 'moon') {
      bamboo(X(20), H + 40, 560, 1);
      bamboo(X(86), H + 40, 470, 1);
      bamboo(X(W - 24), H + 40, 580, -1);
      bamboo(X(W - 92), H + 40, 500, -1);
    } else if (theme === 'mansion') {
      branch(X(-30), -30, 140, 0.62, 4);
      branch(X(W + 20), -24, 124, Math.PI - 0.56, 4);
      trunk(X(-20), H + 30, 380, 84, 1);
      trunk(X(W + 20), H + 30, 380, 84, -1);
    }
    ctx.restore();
    return cv;
  }

  _drawForeground(ctx, theme, cam) {
    if (this.mode === 'stg') return;
    const W = VIEW_W;
    if (!this._fgLayer || this._fgTheme !== theme) {
      this._fgLayer = this._fgBake(theme);
      this._fgTheme = theme;
    }
    const l = this._fgLayer;
    if (!l) return;
    const sway = Math.sin(cam.x * 0.0022 + 0.6) * 16;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.drawImage(l, -80 + sway - 8, 0, l.width, l.height);
    ctx.restore();
  }
