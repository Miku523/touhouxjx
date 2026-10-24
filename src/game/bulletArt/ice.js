/**
 * bulletArt/ice.js —— 3 面 · 琪露诺（小冰块）
 *
 * 主题：切角冰立方。等距立方体的顶 / 左 / 右三面拉开明度，
 * 六个轮廓角各切掉一刀做成「敲过的冰块」；半透明感来自两块：
 * 面里透出来的背面棱线 + 内部裂光/气泡。
 */
import { B_ICECUBE } from './types.js';
import { WHITE, mix, rgba, mat, outline, litRim, softHalo, glint, hash01, path as path2 } from './_lib.js';

/* 等距立方体（单位 = size）：顶面菱形 + 左右两个竖直侧面 */
const W = 0.82;   // 半宽
const TH = 0.40;  // 顶面菱形半高
const H = 0.92;   // 竖直棱长
const CY = -0.44; // 顶面中心 y
const CUT = 0.13; // 轮廓切角

const N = [0, CY - TH], E = [W, CY], SF = [0, CY + TH], WP = [-W, CY];
const EB = [W, CY + H], SB = [0, CY + TH + H], WB = [-W, CY + H];
const NB = [0, CY - TH + H]; // 背面底角（透过冰体看见的那个）

const HEX = [N, E, EB, SB, WB, WP];
const TOP = [N, E, SF, WP];
const LEFT = [WP, SF, SB, WB];
const RIGHT = [SF, E, EB, SB];

/** 带拍平角的多边形路径；cuts[i] = 该顶点切角长度（0 = 保留尖角） */
function polyPath(g, pts, cuts) {
  const n = pts.length;
  g.beginPath();
  let first = true;
  for (let i = 0; i < n; i++) {
    const v = pts[i];
    const pv = pts[(i + n - 1) % n];
    const qv = pts[(i + 1) % n];
    const cut = cuts ? cuts[i] : 0;
    if (!cut) {
      if (first) { g.moveTo(v[0], v[1]); first = false; } else g.lineTo(v[0], v[1]);
      continue;
    }
    const dp = Math.hypot(pv[0] - v[0], pv[1] - v[1]) || 1;
    const dq = Math.hypot(qv[0] - v[0], qv[1] - v[1]) || 1;
    const c = Math.min(cut, dp * 0.34, dq * 0.34);
    const a = [v[0] + ((pv[0] - v[0]) / dp) * c, v[1] + ((pv[1] - v[1]) / dp) * c];
    const b = [v[0] + ((qv[0] - v[0]) / dq) * c, v[1] + ((qv[1] - v[1]) / dq) * c];
    if (first) { g.moveTo(a[0], a[1]); first = false; } else g.lineTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
  }
  g.closePath();
}

/** 切角三角形 (沿边切点 a, 原顶点 v, 沿边切点 b) */
function chamferTri(pts, i, cut) {
  const n = pts.length;
  const v = pts[i];
  const pv = pts[(i + n - 1) % n];
  const qv = pts[(i + 1) % n];
  const dp = Math.hypot(pv[0] - v[0], pv[1] - v[1]) || 1;
  const dq = Math.hypot(qv[0] - v[0], qv[1] - v[1]) || 1;
  const c = Math.min(cut, dp * 0.34, dq * 0.34);
  return [
    [v[0] + ((pv[0] - v[0]) / dp) * c, v[1] + ((pv[1] - v[1]) / dp) * c],
    v,
    [v[0] + ((qv[0] - v[0]) / dq) * c, v[1] + ((qv[1] - v[1]) / dq) * c],
  ];
}

/** 切角后的真实轮廓（12 点，描边 / 内棱线都用它） */
function chamferPts(pts, cut) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const t = chamferTri(pts, i, cut);
    out.push(t[0], t[2]);
  }
  return out;
}

/** 折线 */
function line(g, pts, w, style, cap = 'round') {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.lineWidth = w;
  g.strokeStyle = style;
  g.lineCap = cap;
  g.lineJoin = 'round';
  g.stroke();
}

export default {
  [B_ICECUBE]: {
    name: '小冰块',
    ext: 1.30,
    autoSpin: false,   // 方块有朝向，转起来会散架
    glowKey: 'cold',
    build(g, size, color) {
      const S = size;
      const M = mat(color, 'cold');
      const tiny = S < 6.5;
      const p = (v) => [v[0] * S, v[1] * S];
      const hex = HEX.map(p);
      const cuts = (arr) => arr.map((v) => v * S);
      const SIL = chamferPts(hex, CUT * S);

      // 0. 冷霜光晕
      softHalo(g, S * 1.28, mix(M.glow, [150, 220, 255], 0.42), 0.22);

      // 1. 底光：整块先铺亮霜色，后面的面半透明压上去 → 透光感
      path2(g, SIL);
      const bgg = g.createLinearGradient(-0.85 * S, -0.95 * S, 0.70 * S, 0.90 * S);
      bgg.addColorStop(0, rgba(mix(M.hi, WHITE, 0.40), 1));
      bgg.addColorStop(0.55, rgba(mix(M.light, WHITE, 0.10), 1));
      bgg.addColorStop(1, rgba(mix(M.base, M.deep, 0.30), 1));
      g.fillStyle = bgg;
      g.fill();

      // 2. 顶面（最亮，朝上；前角略深，免得整个面糊成一块白）
      polyPath(g, TOP.map(p), cuts([CUT, CUT, 0, CUT]));
      const tg = g.createLinearGradient(-0.65 * S, -0.95 * S, 0.58 * S, -0.02 * S);
      tg.addColorStop(0, rgba(mix(WHITE, M.hi, 0.42), 0.96));
      tg.addColorStop(0.50, rgba(mix(M.hi, WHITE, 0.16), 0.96));
      tg.addColorStop(1, rgba(mix(M.light, M.base, 0.58), 0.95));
      g.fillStyle = tg;
      g.fill();

      // 3. 左面（受光侧：一亮一暗把竖直面撑起来）
      polyPath(g, LEFT.map(p), cuts([CUT, 0, CUT, CUT]));
      const lg = g.createLinearGradient(-0.85 * S, -0.55 * S, 0.05 * S, 0.75 * S);
      lg.addColorStop(0, rgba(mix(M.light, WHITE, 0.12), 0.95));
      lg.addColorStop(0.55, rgba(mix(M.base, M.light, 0.42), 0.94));
      lg.addColorStop(1, rgba(mix(M.shade, M.base, 0.35), 0.93));
      g.fillStyle = lg;
      g.fill();

      // 4. 右面（背光侧：深冰蓝，和小尺寸下的亮顶面拉开明度差）
      polyPath(g, RIGHT.map(p), cuts([0, CUT, CUT, CUT]));
      const rg = g.createLinearGradient(0.10 * S, -0.10 * S, 0.85 * S, 0.70 * S);
      rg.addColorStop(0, rgba(mix(M.shade, [28, 62, 132], 0.45), 0.94));
      rg.addColorStop(0.60, rgba(mix(M.deep, [20, 46, 108], 0.40), 0.93));
      rg.addColorStop(1, rgba(mix(M.deep, [12, 26, 70], 0.55), 0.92));
      g.fillStyle = rg;
      g.fill();

      // 5. 六个切角小面：上三块朝天的霜面亮，下三块只留冷色
      for (let i = 0; i < HEX.length; i++) {
        const tri = chamferTri(hex, i, CUT * S);
        polyPath(g, tri, null);
        const cg = g.createLinearGradient(tri[0][0], tri[0][1], tri[2][0], tri[2][1]);
        if (i === 0 || i === 1 || i === 5) {
          cg.addColorStop(0, rgba(mix(WHITE, M.hi, 0.30), 0.97));
          cg.addColorStop(1, rgba(mix(M.light, WHITE, 0.25), 0.94));
        } else {
          cg.addColorStop(0, rgba(mix(M.light, WHITE, 0.10), 0.95));
          cg.addColorStop(1, rgba(mix(M.shade, M.base, 0.30), 0.92));
        }
        g.fillStyle = cg;
        g.fill();
      }

      // 6. 透出来的背面棱线 + 内部散光
      g.save();
      path2(g, SIL);
      g.clip();
      g.globalCompositeOperation = 'lighter';
      line(g, [p(NB), p(EB)], 0.040 * S, rgba(mix(WHITE, M.hi, 0.45), 0.20));
      line(g, [p(NB), p(WB)], 0.040 * S, rgba(mix(WHITE, M.hi, 0.45), 0.16));
      glint(g, NB[0] * S, NB[1] * S, 0.10 * S, rgba(mix(WHITE, M.glow, 0.35), 0.28), 0.5);
      // 冰里困住的光
      const tg2 = g.createRadialGradient(-0.14 * S, 0.06 * S, 0.02 * S, -0.14 * S, 0.06 * S, 0.86 * S);
      tg2.addColorStop(0, rgba(mix(WHITE, M.glow, 0.25), 0.20));
      tg2.addColorStop(0.55, rgba(mix(M.hi, WHITE, 0.25), 0.07));
      tg2.addColorStop(1, rgba(M.hi, 0));
      g.fillStyle = tg2;
      g.fillRect(-1.4 * S, -1.4 * S, 2.8 * S, 2.8 * S);
      g.globalCompositeOperation = 'source-over';
      g.restore();

      // 7. 内部裂光（白线 + 分叉 + 气泡，确定性排布）
      if (!tiny) {
        const CRACKS = [
          [[-0.36, -0.02], [-0.22, 0.10], [-0.04, 0.14], [0.16, 0.30]],
          [[0.10, -0.26], [0.20, -0.10], [0.17, 0.06], [0.33, 0.21]],
          [[-0.58, 0.26], [-0.42, 0.32], [-0.25, 0.28], [-0.09, 0.40]],
          [[0.02, 0.00], [0.09, 0.16], [0.05, 0.31], [0.17, 0.46]],
        ];
        g.save();
        path2(g, SIL);
        g.clip();
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < CRACKS.length; i++) {
          const c = CRACKS[i].map(p);
          line(g, c, 0.085 * S, rgba(mix(WHITE, M.glow, 0.35), 0.15));
          line(g, c, 0.030 * S, rgba(mix(WHITE, M.hi, 0.20), 0.66));
          const mx = (c[1][0] + c[2][0]) * 0.5;
          const my = (c[1][1] + c[2][1]) * 0.5;
          const ang = (hash01(i * 9 + 3) - 0.5) * 2.1;
          line(g, [[mx, my], [mx + Math.cos(ang) * 0.16 * S, my + Math.sin(ang) * 0.16 * S]],
            0.022 * S, rgba(WHITE, 0.42));
        }
        for (let i = 0; i < 3; i++) {
          const bx = (hash01(i * 17 + 11) - 0.5) * 0.8 * S;
          const by = (-0.10 + hash01(i * 17 + 12) * 0.62) * S;
          g.beginPath();
          g.arc(bx, by, (0.028 + hash01(i * 17 + 13) * 0.026) * S, 0, Math.PI * 2);
          g.lineWidth = 0.018 * S;
          g.strokeStyle = rgba(WHITE, 0.28);
          g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
        g.restore();
      }

      // 8. 面与面的转折线（先把体积关住，再上描边）
      line(g, [p(SF), p(EB)], 0.045 * S, rgba(mix(M.edge, M.shade, 0.45), 0.42));
      line(g, [p(SF), p(WB)], 0.045 * S, rgba(mix(M.edge, M.shade, 0.45), 0.42));
      line(g, [p(SF), p(SB)], 0.052 * S, rgba(mix(M.edge, M.shade, 0.30), 0.46));
      // 顶面靠前两条棱的冷光（压得低一点，太亮就变钻石台面）
      line(g, [p(WP), p(SF), p(E)], 0.035 * S, rgba(mix(WHITE, M.light, 0.45), 0.45));

      // 9. 近黑外描边（跟着切角轮廓走）+ 受光侧霜边
      outline(g, SIL, M, S * 0.13);
      litRim(g, SIL, M, S * 0.07, 0.95);

      // 10. 极地霜光：顶后棱最亮，前下棱留一道冷边
      line(g, [p(N), p(E)], 0.050 * S, rgba(mix(WHITE, M.glow, 0.18), 0.92));
      line(g, [p(N), p(WP)], 0.050 * S, rgba(mix(WHITE, M.glow, 0.18), 0.92));
      line(g, [p(SB), p(EB)], 0.036 * S, rgba(mix(WHITE, M.glow, 0.30), 0.42));
      line(g, [p(SB), p(WB)], 0.036 * S, rgba(mix(WHITE, M.glow, 0.30), 0.38));
      line(g, [p(E), p(EB)], 0.030 * S, rgba(mix(WHITE, M.glow, 0.35), 0.30));
      line(g, [p(WP), p(WB)], 0.032 * S, rgba(mix(WHITE, M.glow, 0.35), 0.40));

      // 11. 顶面镜面高光 + 冰芯闪点
      if (!tiny) {
        const sg = g.createLinearGradient(-0.55 * S, -0.80 * S, -0.10 * S, -0.42 * S);
        sg.addColorStop(0, rgba(WHITE, 0.50));
        sg.addColorStop(1, rgba(WHITE, 0));
        g.beginPath();
        g.moveTo(-0.46 * S, -0.66 * S);
        g.lineTo(-0.10 * S, -0.83 * S);
        g.lineTo(-0.02 * S, -0.72 * S);
        g.lineTo(-0.38 * S, -0.55 * S);
        g.closePath();
        g.fillStyle = sg;
        g.fill();
      }
      glint(g, -0.16 * S, 0.10 * S, 0.20 * S, rgba(mix(WHITE, M.glow, 0.25), 0.42), 0.65);
      line(g, [[-0.16 * S - 0.12 * S, 0.10 * S], [-0.16 * S + 0.12 * S, 0.10 * S]], 0.020 * S, rgba(WHITE, 0.5));
      line(g, [[-0.16 * S, 0.10 * S - 0.12 * S], [-0.16 * S, 0.10 * S + 0.12 * S]], 0.020 * S, rgba(WHITE, 0.5));
    },
  },
};
