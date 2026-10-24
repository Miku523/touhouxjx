/**
 * bulletArt/leaf.js —— 4 面 · 射命丸文（四面秋瀑 · 枫叶）
 *
 * 主题：五裂掌状枫叶。五个裂片从同一个叶基点呈扇形张开（掌状），
 * 中央裂片最长、左右两侧依次变短、基部两片最短且近水平，裂片之间是细而深的缺口；
 * 叶面沿五条主脉分出明暗（掌状叶脉），细叶柄从叶基下方探出来。
 */
import { B_MAPLE } from './types.js';
import { WHITE, TAU, mix, rgba, mat, outline, litRim, softHalo, glint, path, hash01 } from './_lib.js';

const DEG = Math.PI / 180;
const BASE = [0, 0.26];   // 裂片扇形原点（整片叶子略偏上，把中心让给叶柄）
const STEM_TOP = 0.46;    // 叶柄接点相对 BASE 的下探量

/** 五个裂片：canvas 角度（0 = +x，-90 = 上）、半张角、长度 */
const LOBES = [
  { a: 161, half: 21, len: 0.86 },       // 左下（基部小裂片，朝下外）
  { a: 218, half: 22, len: 1.22 },       // 左上
  { a: 270, half: 23, len: 1.34 },       // 顶（长轴朝上，最长最锐）
  { a: 322, half: 22, len: 1.22 },       // 右上
  { a: 379, half: 21, len: 0.86 },       // 右下
];

/** 裂片侧缘：[半张角比例, 长度比例]；中段宽、靠尖快速收窄 → 掌状裂片 */
const EDGE = [
  [-1.00, 0.56], [-0.94, 0.63], [-0.84, 0.72], [-0.68, 0.82],
  [-0.50, 0.90], [-0.30, 0.96], [-0.12, 0.995], [0.00, 1.00],
  [0.12, 0.995], [0.30, 0.96], [0.50, 0.90], [0.68, 0.82],
  [0.84, 0.72], [0.94, 0.63], [1.00, 0.56],
];
/** 侧缘小锯齿（沿半径方向凸出一点，隔一个点一个齿） */
const SERR = [0, 0.026, 0.008, 0.030, 0.010, 0.024, 0.006, 0.000, 0.006, 0.024, 0.010, 0.030, 0.008, 0.026, 0];
/** 裂片缺口深度（× 相邻较短裂片长度）：基部两处更深 */
const NOTCH = [0.45, 0.42, 0.42, 0.45];

/** 以叶基为原点的极坐标取点 */
function pt(ang, r, S) {
  return [BASE[0] * S + Math.cos(ang) * r * S, BASE[1] * S + Math.sin(ang) * r * S];
}

/** 五裂掌状轮廓（含裂片缺口与叶基凹口），顺序绕一圈 */
function leafPts(S) {
  const pts = [];
  for (let i = 0; i < LOBES.length; i++) {
    const L = LOBES[i];
    for (let k = 0; k < EDGE.length; k++) {
      const a = (L.a + EDGE[k][0] * L.half) * DEG;
      pts.push(pt(a, L.len * (EDGE[k][1] + SERR[k]), S));
    }
    if (i < LOBES.length - 1) {
      const nx = LOBES[i + 1];
      const mid = ((L.a + L.half) + (nx.a - nx.half)) * 0.5;
      pts.push(pt(mid * DEG, Math.min(L.len, nx.len) * NOTCH[i], S));
    }
  }
  // 叶基：右下裂片根部 → 叶柄接点凹口 → 左下裂片根部
  pts.push([0.18 * S, 0.66 * S]);
  pts.push([0, (BASE[1] + STEM_TOP) * S]);
  pts.push([-0.18 * S, 0.66 * S]);
  return pts;
}

/** 细叶柄：上粗下细、略向右弯，受光侧一条金线 */
function drawStem(g, S, CRIMSON, DEEP, GOLD) {
  g.beginPath();
  g.moveTo(-0.050 * S, 0.48 * S);
  g.quadraticCurveTo(-0.032 * S, 0.76 * S, 0.026 * S, 1.00 * S);
  g.lineTo(0.072 * S, 0.982 * S);
  g.quadraticCurveTo(0.032 * S, 0.76 * S, 0.050 * S, 0.48 * S);
  g.closePath();
  const grad = g.createLinearGradient(-0.05 * S, 0.48 * S, 0.08 * S, 0.99 * S);
  grad.addColorStop(0, rgba(mix(CRIMSON, GOLD, 0.24), 1));
  grad.addColorStop(0.55, rgba(CRIMSON, 1));
  grad.addColorStop(1, rgba(DEEP, 1));
  g.fillStyle = grad;
  g.fill();
  g.lineWidth = 0.044 * S;
  g.lineJoin = 'round';
  g.strokeStyle = rgba([44, 10, 8], 0.92);
  g.stroke();
  g.beginPath();
  g.moveTo(-0.030 * S, 0.53 * S);
  g.quadraticCurveTo(-0.020 * S, 0.76 * S, 0.024 * S, 0.965 * S);
  g.lineWidth = 0.020 * S;
  g.lineCap = 'round';
  g.strokeStyle = rgba(mix(GOLD, WHITE, 0.40), 0.66);
  g.stroke();
}

export default {
  [B_MAPLE]: {
    name: '枫叶',
    ext: 1.26,
    autoSpin: true,
    glowKey: 'warm',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'warm');
      const CRIMSON = [158, 26, 26];
      const DEEP = [96, 14, 14];
      const GOLD = [255, 190, 84];
      const pts = leafPts(S);
      const vB = [0, 0.55 * S];   // 主脉汇聚点（叶基内侧）

      // 0. 秋色光晕
      softHalo(g, S * 1.24, mix(GOLD, CRIMSON, 0.28), 0.18);

      // 1. 叶柄（先画，压在叶面下）
      drawStem(g, S, CRIMSON, DEEP, GOLD);

      // 2. 叶面
      g.save();
      path(g, pts);
      g.clip();

      // 2a. 底色：左上受光偏金，右下深橙红 → 整片叶子是亮的一整块
      const bg = g.createLinearGradient(-0.95 * S, -1.00 * S, 0.90 * S, 0.80 * S);
      bg.addColorStop(0, rgba(mix(P.light, WHITE, 0.34), 1));
      bg.addColorStop(0.32, rgba(mix(P.base, P.light, 0.44), 1));
      bg.addColorStop(0.66, rgba(P.base, 1));
      bg.addColorStop(1, rgba(mix(P.base, [166, 38, 18], 0.48), 1));
      g.fillStyle = bg;
      g.fillRect(-1.5 * S, -1.5 * S, 3 * S, 3 * S);

      // 2b. 透光叶缘：靠近边缘更亮，像被秋阳从背后照亮
      const eg = g.createRadialGradient(0, 0.10 * S, 0.52 * S, 0, 0.10 * S, 1.28 * S);
      eg.addColorStop(0, rgba(GOLD, 0));
      eg.addColorStop(0.72, rgba(mix(GOLD, P.hi, 0.35), 0.16));
      eg.addColorStop(1, rgba(mix(GOLD, P.hi, 0.35), 0.26));
      g.fillStyle = eg;
      g.fillRect(-1.5 * S, -1.5 * S, 3 * S, 3 * S);

      // 2b2. 叶基压深：让叶片从叶柄处「站起来」
      const bg2 = g.createRadialGradient(0, 0.52 * S, 0.02 * S, 0, 0.52 * S, 0.62 * S);
      bg2.addColorStop(0, rgba(DEEP, 0.22));
      bg2.addColorStop(0.55, rgba(DEEP, 0.09));
      bg2.addColorStop(1, rgba(DEEP, 0));
      g.fillStyle = bg2;
      g.fillRect(-1.5 * S, -1.5 * S, 3 * S, 3 * S);

      // 2c. 缺口里的阴影（把五个裂片分开）
      for (let i = 0; i < LOBES.length - 1; i++) {
        const nx = LOBES[i + 1];
        const mid = ((LOBES[i].a + LOBES[i].half) + (nx.a - nx.half)) * 0.5;
        const sp = pt(mid * DEG, Math.min(LOBES[i].len, nx.len) * NOTCH[i], S);
        // 只在缺口根部压一道短影，别从叶心放射（否则像花心）
        g.beginPath();
        g.moveTo(vB[0] + (sp[0] - vB[0]) * 0.42, vB[1] + (sp[1] - vB[1]) * 0.42);
        g.lineTo(sp[0], sp[1]);
        g.lineWidth = 0.13 * S;
        g.lineCap = 'round';
        g.strokeStyle = rgba(DEEP, 0.16);
        g.stroke();
        g.beginPath();
        g.moveTo(vB[0] + (sp[0] - vB[0]) * 0.55, vB[1] + (sp[1] - vB[1]) * 0.55);
        g.lineTo(sp[0], sp[1]);
        g.lineWidth = 0.05 * S;
        g.strokeStyle = rgba(DEEP, 0.24);
        g.stroke();
      }

      // 2d. 五条主脉：暗刻线 + 左上侧一条细亮棱（叶脉是凹下去的）
      for (let i = 0; i < LOBES.length; i++) {
        const L = LOBES[i];
        const a = L.a * DEG;
        const tip = pt(a, L.len * 0.94, S);
        const sway = (i < 2 ? -1 : i > 2 ? 1 : 0) * 0.026 * S;
        const perp = [-Math.sin(a), Math.cos(a)];
        const cx = vB[0] + (tip[0] - vB[0]) * 0.56 + perp[0] * sway;
        const cy = vB[1] + (tip[1] - vB[1]) * 0.56 + perp[1] * sway;

        // 亮棱（偏左上）
        g.beginPath();
        g.moveTo(vB[0] - 0.014 * S, vB[1] - 0.010 * S);
        g.quadraticCurveTo(cx - 0.014 * S, cy - 0.010 * S, tip[0] - 0.012 * S, tip[1] - 0.012 * S);
        g.lineCap = 'round';
        g.lineWidth = (i === 2 ? 0.034 : 0.028) * S;
        g.strokeStyle = rgba(mix(P.light, GOLD, 0.50), 0.30);
        g.stroke();
        // 暗刻线
        g.beginPath();
        g.moveTo(vB[0], vB[1]);
        g.quadraticCurveTo(cx, cy, tip[0], tip[1]);
        g.lineWidth = (i === 2 ? 0.050 : 0.040) * S;
        g.strokeStyle = rgba(mix(DEEP, P.base, 0.26), 0.38);
        g.stroke();

        // 分叉脉（两条，靠裂片外半段）
        const t = 0.62;
        const px = (1 - t) * (1 - t) * vB[0] + 2 * t * (1 - t) * cx + t * t * tip[0];
        const py = (1 - t) * (1 - t) * vB[1] + 2 * t * (1 - t) * cy + t * t * tip[1];
        const span = Math.hypot(tip[0] - vB[0], tip[1] - vB[1]);
        const baseAng = Math.atan2(tip[1] - vB[1], tip[0] - vB[0]);
        for (const s of [-1, 1]) {
          const ba = baseAng + s * 0.44;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(px + Math.cos(ba) * span * 0.30, py + Math.sin(ba) * span * 0.30);
          g.lineWidth = 0.026 * S;
          g.strokeStyle = rgba(mix(DEEP, P.base, 0.30), 0.38);
          g.stroke();
        }
      }

      // 2d2. 裂片尖端的透光（逆光时叶尖最薄、最亮）
      for (let i = 0; i < LOBES.length; i++) {
        const L = LOBES[i];
        const tx = BASE[0] * S + Math.cos(L.a * DEG) * L.len * 0.82 * S;
        const ty = BASE[1] * S + Math.sin(L.a * DEG) * L.len * 0.82 * S;
        const tg2 = g.createRadialGradient(tx, ty, 0.01 * S, tx, ty, 0.46 * S);
        tg2.addColorStop(0, rgba(mix(GOLD, P.hot, 0.30), 0.30));
        tg2.addColorStop(1, rgba(GOLD, 0));
        g.fillStyle = tg2;
        g.fillRect(-1.5 * S, -1.5 * S, 3 * S, 3 * S);
      }

      // 2e. 叶面杂色（确定性排布，别太抢）
      for (let i = 0; i < 3; i++) {
        const a = hash01(i * 13 + 5) * TAU;
        const rr = S * (0.34 + hash01(i * 13 + 6) * 0.42);
        g.beginPath();
        g.ellipse(Math.cos(a) * rr, Math.sin(a) * rr - 0.02 * S, S * 0.10, S * 0.055, a, 0, TAU);
        g.fillStyle = rgba(DEEP, 0.10);
        g.fill();
      }
      g.restore();

      // 3. 叶缘：近黑描边 + 受光侧金边
      outline(g, pts, P, S * 0.11);
      litRim(g, pts, P, S * 0.075, 0.95);

      // 4. 叶尖一点金
      glint(g, 0.02 * S, -0.86 * S, 0.13 * S, rgba(mix(GOLD, WHITE, 0.45), 0.38), 0.6);
      glint(g, -0.60 * S, -0.54 * S, 0.11 * S, rgba(mix(GOLD, WHITE, 0.35), 0.30), 0.5);
    },
  },
};
