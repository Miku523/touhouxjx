/**
 * bulletArt/jewel.js —— 6 面 · 蓬莱山辉夜「五色的弹丸」「耀眼的龙玉」
 *
 * 主题：玉。
 *   五色玉：五段等角色相切面 + 交错明暗的切工 + 中央五边形台面；
 *           色相从卡面配色的色相出发每 72° 转一格，逐卡配色仍然生效。
 *   龙玉：亮金珠体 + 一圈明显离体的光环 + 盘在玉体上的金龙纹。
 *         龙用「金色主体 + 暗金描边」两档明度：在珠体的亮部与暗部上都读得出来。
 */
import { B_FIVEJEWEL, B_DRAGONORB } from './types.js';
import {
  WHITE, TAU, mix, rgba, mat, rgbToHsl, hslToRgb, softHalo, glint, hash01,
} from './_lib.js';

const GOLD_HOT = [255, 250, 226];
const GOLD = [255, 232, 160];
const GOLD_DEEP = [212, 150, 42];
const AMBER = [122, 60, 6];
const AMBER_DEEP = [58, 24, 3];
const STEP5 = TAU / 5;

/* ============================================================
   龙纹的几何工具（只在本文件内用）
   ============================================================ */

/** 三次贝塞尔取点 */
function bezPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

/** 把若干段三次贝塞尔按等参数取样成一条中心线 */
function sampleChain(segs, per) {
  const pts = [];
  for (const [p0, p1, p2, p3] of segs) {
    for (let i = 0; i < per; i++) pts.push(bezPoint(p0, p1, p2, p3, i / per));
  }
  pts.push(segs[segs.length - 1][3].slice());
  return pts;
}

/**
 * 中心线 → 可变宽度的龙身条带。
 * 宽度从颈部 taper 到尾尖；返回外沿 / 内沿两串点（法线统一朝外）。
 */
function ribbonEdges(pts, R) {
  const n = pts.length;
  const outer = [];
  const inner = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, n - 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    let nx = -ty;
    let ny = tx;
    if (nx * p[0] + ny * p[1] < 0) { nx = -nx; ny = -ny; }
    const u = i / (n - 1);
    const w = R * (0.165 - 0.145 * Math.pow(u, 0.80) + 0.010 * Math.sin(Math.PI * u));
    outer.push([p[0] + nx * w, p[1] + ny * w]);
    inner.push([p[0] - nx * w, p[1] - ny * w]);
  }
  return { outer, inner };
}

/** 条带路径 */
function ribbonPath(g, outer, inner) {
  g.beginPath();
  g.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i < outer.length; i++) g.lineTo(outer[i][0], outer[i][1]);
  for (let i = inner.length - 1; i >= 0; i--) g.lineTo(inner[i][0], inner[i][1]);
  g.closePath();
}

/** 沿点串描一条纯色线 */
function strokeLine(g, pts, from, to) {
  g.beginPath();
  g.moveTo(pts[from][0], pts[from][1]);
  for (let i = from + 1; i <= to; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

/** 中心线在 i 处的切线（单位向量） */
function tangentAt(pts, i) {
  const a = pts[Math.max(i - 1, 0)];
  const b = pts[Math.min(i + 1, pts.length - 1)];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/** 一笔「先暗后亮」的描线：暗底保证金色在亮部也读得出来 */
function gildedLine(g, S, draw, darkW, goldW, goldA = 0.96) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw();
  g.lineWidth = darkW;
  g.strokeStyle = rgba(AMBER_DEEP, 0.90);
  g.stroke();
  draw();
  g.lineWidth = goldW;
  g.strokeStyle = rgba(mix(GOLD_HOT, GOLD, 0.25), goldA);
  g.stroke();
}

/** 龙头（局部 +x = 朝向）：金色头骨、暗色口缝、两支后撇的角、暗眼、金色龙须 */
function dragonHead(g, R, x, y, ang, k = 1.18) {
  const s = R * k;
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // 头骨（上颚 + 下颚合成一块，口缝用暗色画出来）
  g.beginPath();
  g.moveTo(-0.075 * s, -0.115 * s);
  g.bezierCurveTo(0.10 * s, -0.145 * s, 0.25 * s, -0.105 * s, 0.285 * s, -0.030 * s);
  g.lineTo(0.255 * s, 0.038 * s);
  g.bezierCurveTo(0.20 * s, 0.105 * s, 0.09 * s, 0.130 * s, -0.075 * s, 0.118 * s);
  g.closePath();
  const headGrad = g.createLinearGradient(-0.10 * s, -0.14 * s, 0.22 * s, 0.14 * s);
  headGrad.addColorStop(0, rgba(GOLD_HOT, 1));
  headGrad.addColorStop(0.55, rgba(GOLD, 1));
  headGrad.addColorStop(1, rgba(GOLD_DEEP, 1));
  g.fillStyle = headGrad;
  g.fill();
  g.lineWidth = 0.030 * s;
  g.strokeStyle = rgba(AMBER_DEEP, 0.92);
  g.stroke();

  // 口缝（暗）
  g.beginPath();
  g.moveTo(0.010 * s, -0.030 * s);
  g.lineTo(0.262 * s, -0.020 * s);
  g.lineTo(0.232 * s, 0.030 * s);
  g.lineTo(0.010 * s, 0.045 * s);
  g.closePath();
  g.fillStyle = rgba(AMBER_DEEP, 0.95);
  g.fill();

  // 两支朝后外撇的角
  gildedLine(g, s, () => {
    g.beginPath();
    g.moveTo(-0.020 * s, -0.080 * s);
    g.quadraticCurveTo(-0.150 * s, -0.235 * s, -0.380 * s, -0.260 * s);
  }, 0.062 * s, 0.038 * s);
  gildedLine(g, s, () => {
    g.beginPath();
    g.moveTo(0.010 * s, 0.055 * s);
    g.quadraticCurveTo(-0.130 * s, 0.195 * s, -0.330 * s, 0.220 * s);
  }, 0.056 * s, 0.032 * s);

  // 眼：暗窝 + 白点
  g.beginPath();
  g.arc(0.090 * s, -0.058 * s, 0.048 * s, 0, TAU);
  g.fillStyle = rgba(AMBER_DEEP, 0.95);
  g.fill();
  g.beginPath();
  g.arc(0.096 * s, -0.062 * s, 0.030 * s, 0, TAU);
  g.fillStyle = rgba(WHITE, 0.98);
  g.fill();

  // 龙须：暗描边 + 金线，向前飘出
  gildedLine(g, s, () => {
    g.beginPath();
    g.moveTo(0.255 * s, -0.020 * s);
    g.quadraticCurveTo(0.330 * s, -0.105 * s, 0.405 * s, -0.062 * s);
  }, 0.030 * s, 0.014 * s, 0.85);
  gildedLine(g, s, () => {
    g.beginPath();
    g.moveTo(0.240 * s, 0.032 * s);
    g.quadraticCurveTo(0.330 * s, 0.100 * s, 0.395 * s, 0.078 * s);
  }, 0.030 * s, 0.014 * s, 0.85);
  g.restore();
}

export default {
  [B_FIVEJEWEL]: {
    name: '五色玉',
    ext: 1.30,
    autoSpin: true,
    glowKey: 'cold',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'cold');
      const R = S * 1.14;
      const hsl = rgbToHsl(P.base);
      const facets = [];

      // 0. 玉光
      softHalo(g, R * 1.20, mix(P.glow, [255, 222, 240], 0.35), 0.24);

      g.save();
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.clip();

      // 1. 五段色相切面：从卡面色相起每 72° 一格，明暗交错做切工
      for (let i = 0; i < 5; i++) {
        const c = hslToRgb((hsl.h + i * 0.2) % 1, 0.93, i % 2 ? 0.51 : 0.64);
        facets.push(c);
        const a0 = -Math.PI / 2 + i * STEP5;
        const a1 = a0 + STEP5 + 0.012;
        const deep = mix(c, P.deep, 0.62);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.02);
        grad.addColorStop(0, rgba(mix(c, WHITE, 0.58), 1));
        grad.addColorStop(0.13, rgba(mix(c, WHITE, 0.22), 1));
        grad.addColorStop(0.46, rgba(c, 1));
        grad.addColorStop(0.76, rgba(mix(c, deep, 0.42), 1));
        grad.addColorStop(0.93, rgba(deep, 1));
        grad.addColorStop(1, rgba(mix(deep, P.edge, 0.35), 1));
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, R * 1.02, a0, a1);
        g.closePath();
        g.fillStyle = grad;
        g.fill();
      }

      // 2. 棱线：一条深缝 + 一条细亮棱 —— 切面对比度的来源
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * STEP5;
        const x = Math.cos(a) * R;
        const y = Math.sin(a) * R;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(x, y);
        g.lineWidth = S * 0.062;
        g.strokeStyle = rgba(P.edge, 0.28);
        g.stroke();
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(x, y);
        g.lineWidth = S * 0.020;
        g.strokeStyle = rgba(mix(WHITE, facets[i], 0.30), 0.55);
        g.stroke();
      }

      // 3. 中央的五边形台面：宝石切工最强的一眼
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * STEP5;
        const x = Math.cos(a) * R * 0.49;
        const y = Math.sin(a) * R * 0.49;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      const table = g.createRadialGradient(-R * 0.12, -R * 0.14, 0, 0, 0, R * 0.50);
      table.addColorStop(0, rgba(WHITE, 0.50));
      table.addColorStop(0.55, rgba(mix(WHITE, P.light, 0.45), 0.26));
      table.addColorStop(1, rgba(WHITE, 0.05));
      g.fillStyle = table;
      g.fill();
      g.lineWidth = S * 0.024;
      g.strokeStyle = rgba(WHITE, 0.50);
      g.stroke();

      // 4. 台面中心的小白热芯
      const core = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.15);
      core.addColorStop(0, rgba(WHITE, 0.98));
      core.addColorStop(0.5, rgba(mix(WHITE, GOLD_HOT, 0.4), 0.42));
      core.addColorStop(1, rgba(WHITE, 0));
      g.fillStyle = core;
      g.beginPath();
      g.arc(0, 0, R * 0.15, 0, TAU);
      g.fill();
      g.restore();

      // 5. 外圈：深色圈压边 + 内圈亮棱
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.lineWidth = S * 0.085;
      g.strokeStyle = rgba(P.edge, 0.85);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, R * 0.945, -2.62, -1.36);
      g.lineWidth = S * 0.058;
      g.strokeStyle = rgba(WHITE, 0.62);
      g.lineCap = 'round';
      g.stroke();

      // 6. 高光
      glint(g, -R * 0.42, -R * 0.44, S * 0.22, rgba(WHITE, 0.50), 0.92);
    },
  },

  [B_DRAGONORB]: {
    name: '龙玉',
    ext: 1.56,
    autoSpin: true,
    glowKey: 'warm',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'warm');
      const R = S * 0.99;
      const Rh = R * 1.30;            // 光环半径：一圈断续金线（不是闭合圆环，免得读成碗口）

      // 1. 大光晕
      softHalo(g, R * 1.46, mix(GOLD, P.glow, 0.40), 0.24);
      softHalo(g, R * 1.14, mix(GOLD_HOT, P.glow, 0.30), 0.30);

      // 2. 光环：断续细金线，左上两段最长最亮 —— 读成「法力光环」，不是金属边框
      const arcs = [[-2.98, -2.10], [-1.82, -0.94], [-0.70, 0.20], [0.44, 1.32], [1.58, 2.80]];
      g.lineCap = 'round';
      for (let i = 0; i < arcs.length; i++) {
        const hot = i < 2;
        g.beginPath();
        g.arc(0, 0, Rh, arcs[i][0], arcs[i][1]);
        g.lineWidth = S * (hot ? 0.050 : 0.038);
        g.strokeStyle = hot
          ? rgba(mix(GOLD_HOT, WHITE, 0.12), 0.96)
          : rgba(mix(GOLD, GOLD_HOT, 0.55), 0.70);
        g.stroke();
      }
      // 环上小星（确定性角度）
      for (let i = 0; i < 3; i++) {
        const a = -2.10 + i * 1.90 + hash01(i + 7) * 0.30;
        const x = Math.cos(a) * Rh;
        const y = Math.sin(a) * Rh;
        const sp = S * (0.072 + hash01(i + 3) * 0.030);
        g.beginPath();
        for (let k = 0; k < 8; k++) {
          const aa = (k * TAU) / 8;
          const rr = k % 2 ? sp * 0.28 : sp;
          const px = x + Math.cos(aa) * rr;
          const py = y + Math.sin(aa) * rr;
          if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.fillStyle = rgba(mix(GOLD_HOT, WHITE, 0.22), 0.92);
        g.fill();
      }

      // 3. 玉体：左上白热 → 金 → 琥珀 → 深琥珀（整体压深一档，给金龙纹让出对比）
      const body = g.createRadialGradient(-R * 0.30, -R * 0.40, R * 0.04, 0, 0, R * 1.02);
      body.addColorStop(0, rgba(mix(WHITE, GOLD_HOT, 0.62), 1));
      body.addColorStop(0.22, rgba(mix(GOLD_HOT, GOLD, 0.30), 1));
      body.addColorStop(0.48, rgba(mix(GOLD, GOLD_DEEP, 0.48), 1));
      body.addColorStop(0.76, rgba(mix(GOLD_DEEP, AMBER, 0.38), 1));
      body.addColorStop(1, rgba(mix(AMBER, AMBER_DEEP, 0.35), 1));
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.fillStyle = body;
      g.fill();

      // 4. 玉体内部：两笔很淡的祥云弧 + 边缘暗环（体积）
      g.save();
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.clip();
      g.lineCap = 'round';
      g.strokeStyle = rgba(GOLD_HOT, 0.18);
      g.lineWidth = S * 0.028;
      g.beginPath();
      g.arc(-R * 0.10, R * 0.16, R * 0.66, -2.95, -1.95);
      g.stroke();
      g.strokeStyle = rgba(GOLD_HOT, 0.10);
      g.beginPath();
      g.arc(R * 0.06, R * 0.00, R * 0.40, 0.30, 1.30);
      g.stroke();
      const rimShade = g.createRadialGradient(0, 0, R * 0.62, 0, 0, R);
      rimShade.addColorStop(0, rgba(AMBER_DEEP, 0));
      rimShade.addColorStop(1, rgba(AMBER_DEEP, 0.42));
      g.fillStyle = rimShade;
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.fill();
      g.restore();

      // 5. 金龙纹：头在顶部朝左上，龙身绕右侧与底部，尾鳍甩在左下
      const segs = [
        [[0.00, -0.56], [0.22, -0.34], [0.34, -0.06], [0.30, 0.14]],
        [[0.30, 0.14], [0.24, 0.38], [-0.04, 0.48], [-0.30, 0.36]],
        [[-0.30, 0.36], [-0.54, 0.26], [-0.66, 0.04], [-0.64, -0.14]],
      ].map((seg) => seg.map(([x, y]) => [x * R, y * R]));
      const pts = sampleChain(segs, 14);
      const { outer, inner } = ribbonEdges(pts, R);

      // 5a. 龙身：暗描边 + 金色主体
      g.lineJoin = 'round';
      g.lineCap = 'round';
      ribbonPath(g, outer, inner);
      g.lineWidth = S * 0.058;
      g.strokeStyle = rgba(AMBER_DEEP, 0.92);
      g.stroke();
      ribbonPath(g, outer, inner);
      const drag = g.createLinearGradient(0, -R * 0.6, 0, R * 0.5);
      drag.addColorStop(0, rgba(GOLD_HOT, 1));
      drag.addColorStop(0.42, rgba(mix(GOLD, GOLD_HOT, 0.30), 1));
      drag.addColorStop(0.78, rgba(GOLD_DEEP, 1));
      drag.addColorStop(1, rgba(mix(GOLD_DEEP, AMBER, 0.45), 1));
      g.fillStyle = drag;
      g.fill();
      ribbonPath(g, outer, inner);
      g.lineWidth = S * 0.014;
      g.strokeStyle = rgba(AMBER_DEEP, 0.45);
      g.stroke();

      // 5b. 背脊亮线（贴内沿）：把龙身从珠体上「点亮」
      const ridge = inner.map(([x, y], i) => {
        const p = pts[i];
        return [x + (p[0] - x) * 0.30, y + (p[1] - y) * 0.30];
      });
      g.lineWidth = S * 0.024;
      g.strokeStyle = rgba(mix(WHITE, GOLD_HOT, 0.30), 0.72);
      strokeLine(g, ridge, 1, ridge.length - 2);

      // 5c. 背鳍：沿龙背外沿挑四个小三角（金 + 暗边）
      for (let k = 1; k <= 4; k++) {
        const idx = Math.round((k / 5) * (pts.length - 1));
        const p = pts[idx];
        const o = outer[idx];
        let nx = o[0] - p[0];
        let ny = o[1] - p[1];
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl;
        ny /= nl;
        const tx = -ny;
        const ty = nx;
        const sp = R * (0.080 - k * 0.008);
        g.beginPath();
        g.moveTo(o[0] + tx * R * 0.030, o[1] + ty * R * 0.030);
        g.lineTo(o[0] + nx * sp, o[1] + ny * sp);
        g.lineTo(o[0] - tx * R * 0.030, o[1] - ty * R * 0.030);
        g.closePath();
        g.fillStyle = rgba(GOLD, 0.95);
        g.fill();
        g.lineWidth = S * 0.014;
        g.strokeStyle = rgba(AMBER_DEEP, 0.80);
        g.stroke();
      }

      // 5d. 尾鳍：尾端甩出的三片鳍
      {
        const p = pts[pts.length - 1];
        const [dx, dy] = tangentAt(pts, pts.length - 1);
        const base = Math.atan2(dy, dx);
        for (let i = -1; i <= 1; i++) {
          const a = base + i * 0.44;
          const len = R * (i === 0 ? 0.25 : 0.19);
          g.beginPath();
          g.moveTo(p[0] - dy * R * 0.025, p[1] + dx * R * 0.025);
          g.lineTo(p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len);
          g.lineTo(p[0] + dy * R * 0.025, p[1] - dx * R * 0.025);
          g.closePath();
          g.fillStyle = rgba(mix(GOLD, GOLD_HOT, 0.25), 0.95);
          g.fill();
          g.lineWidth = S * 0.014;
          g.strokeStyle = rgba(AMBER_DEEP, 0.85);
          g.stroke();
        }
      }

      // 5e. 前爪：从龙身伸向珠心，三只勾爪
      {
        const idx = Math.round(0.30 * (pts.length - 1));
        const p = pts[idx];
        const [dx, dy] = tangentAt(pts, idx);
        const ix = -dy;
        const iy = dx;
        const sgn = ix * p[0] + iy * p[1] > 0 ? -1 : 1;
        const wx = p[0] + ix * sgn * R * 0.14;
        const wy = p[1] + iy * sgn * R * 0.14;
        gildedLine(g, R, () => {
          g.beginPath();
          g.moveTo(p[0], p[1]);
          g.lineTo(wx, wy);
        }, 0.058, 0.034);
        for (let i = -1; i <= 1; i++) {
          const a = Math.atan2(wy - p[1], wx - p[0]) + i * 0.58;
          gildedLine(g, R, () => {
            g.beginPath();
            g.moveTo(wx, wy);
            g.quadraticCurveTo(
              wx + Math.cos(a + 0.40) * R * 0.10, wy + Math.sin(a + 0.40) * R * 0.10,
              wx + Math.cos(a) * R * 0.155, wy + Math.sin(a) * R * 0.155,
            );
          }, 0.042, 0.024);
        }
      }

      // 5f. 龙头
      {
        const [dx, dy] = tangentAt(pts, 0);
        dragonHead(g, R, pts[0][0], pts[0][1], Math.atan2(-dy, -dx), 1.44);
      }

      // 6. 玉体描边 + 左上亮弧
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.lineWidth = S * 0.070;
      g.strokeStyle = rgba(AMBER_DEEP, 0.72);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, R * 0.968, -2.62, -1.10);
      g.lineWidth = S * 0.068;
      g.strokeStyle = rgba(mix(GOLD_HOT, WHITE, 0.12), 0.84);
      g.lineCap = 'round';
      g.stroke();

      // 7. 顶部高光
      glint(g, -R * 0.34, -R * 0.52, S * 0.21, rgba(WHITE, 0.42), 1);
    },
  },
};
