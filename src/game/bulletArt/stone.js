/**
 * bulletArt/stone.js —— 6 面 · 蓬莱山辉夜「佛御石之钵」「佛体的金刚石」
 *
 * 主题：石与晶体。
 *  · 碎石：竖向长条石屑（高 2.40 : 宽 1.58），左右各带一处崩口，
 *    四个裂面按「顶白 / 右黄 / 左冷 / 底黑」拉开明度台阶，体积靠面与面的
 *    硬色差读，所以 r=5 缩成 9px 仍是一块有棱的石子，而不是一坨鹅卵石。
 *  · 金刚石：冠部台面 + 切面环 + 亭部聚拢 + 一条腰线高光，明亮式切割的正面。
 */
import { B_STONE, B_DIAMOND } from './types.js';
import {
  WHITE, TAU, mix, rgba, mat, path, outline, litRim, shadeDown, softHalo, glint, hash01,
} from './_lib.js';

export default {
  [B_STONE]: {
    name: '碎石',
    ext: 1.34,
    autoSpin: true,
    glowKey: 'stone',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'stone');

      // 0. 剪影：不规则石屑，尖顶朝上，两处崩口打破「鹅卵石」的圆
      const V = [
        [-0.05, -1.24], [0.44, -1.02], [0.79, -0.55], [0.60, -0.24],
        [0.71, 0.12], [0.33, 0.70], [0.12, 1.16], [-0.35, 0.93],
        [-0.77, 0.32], [-0.71, -0.53],
      ].map(([x, y]) => [x * S, y * S]);
      const C = [-0.03 * S, -0.03 * S];

      softHalo(g, S * 1.24, mix(P.glow, [152, 172, 208], 0.55), 0.16);

      // 材质阶梯（月光从左上来）：顶面近白 / 右面土黄 / 左面冷灰 / 底面近黑
      const TOP0 = mix(P.hi, [246, 250, 255], 0.42);
      const TOP1 = mix(P.base, [196, 204, 220], 0.50);
      const RGT0 = mix(P.base, [148, 136, 118], 0.62);
      const RGT1 = mix(P.deep, [36, 30, 24], 0.62);
      const LFT0 = mix(P.base, [118, 132, 158], 0.62);
      const LFT1 = mix(P.deep, [56, 64, 84], 0.48);
      const BOT0 = mix(P.shade, [58, 52, 44], 0.58);
      const BOT1 = mix(P.deep, [6, 6, 6], 0.90);

      const facet = (pts, c0, c1, x0, y0, x1, y1) => {
        const gr = g.createLinearGradient(x0 * S, y0 * S, x1 * S, y1 * S);
        gr.addColorStop(0, rgba(c0, 1));
        gr.addColorStop(0.62, rgba(mix(c0, c1, 0.55), 1));
        gr.addColorStop(1, rgba(c1, 1));
        path(g, pts);
        g.fillStyle = gr;
        g.fill();
      };

      // 1. 四个裂面
      facet([V[9], V[0], V[1], V[2], V[3], C], TOP0, TOP1, -0.55, -1.2, 0.60, 0.10);
      facet([V[3], V[4], V[5], C], RGT0, RGT1, 0.30, -0.30, 0.60, 0.72);
      facet([V[5], V[6], V[7], C], BOT0, BOT1, 0.16, 0.44, -0.10, 1.14);
      facet([V[7], V[8], V[9], C], LFT0, LFT1, -0.24, -0.86, -0.80, 0.36);

      // 2. 崩口：贴着左上棱的一块新断面（碎石的关键识别点）
      path(g, [[-0.48 * S, -0.80 * S], [-0.31 * S, -0.55 * S], [-0.60 * S, -0.44 * S]]);
      g.fillStyle = rgba(mix(TOP0, WHITE, 0.28), 1);
      g.fill();
      g.lineWidth = S * 0.030;
      g.strokeStyle = rgba(mix(P.edge, [40, 30, 24], 0.3), 0.42);
      g.stroke();

      // 2b. 右上再崩一块：顶面裂成两级台阶，破掉「一整块纸板」的平
      path(g, [[0.44 * S, -1.02 * S], [0.34 * S, -0.50 * S], [0.66 * S, -0.60 * S]]);
      g.fillStyle = rgba(mix(TOP1, RGT0, 0.55), 1);
      g.fill();
      g.lineWidth = S * 0.030;
      g.strokeStyle = rgba(mix(P.edge, [30, 24, 20], 0.3), 0.55);
      g.stroke();
      path(g, [[0.66 * S, -0.60 * S], [0.79 * S, -0.55 * S], [0.60 * S, -0.24 * S]]);
      g.fillStyle = rgba(mix(RGT0, TOP0, 0.42), 1);
      g.fill();

      // 3. 裂面棱线：暗线打底，朝光的两道补一道冷白
      g.lineCap = 'round';
      const ridge = (k, w, col, a) => {
        g.beginPath();
        g.moveTo(C[0], C[1]);
        g.lineTo(C[0] + (V[k][0] - C[0]) * 0.93, C[1] + (V[k][1] - C[1]) * 0.93);
        g.lineWidth = S * w;
        g.strokeStyle = rgba(col, a);
        g.stroke();
      };
      for (const k of [0, 1, 2, 5, 8, 9]) ridge(k, 0.040, mix(P.edge, [40, 32, 24], 0.35), 0.55);
      for (const k of [0, 1, 9]) ridge(k, 0.020, mix(WHITE, P.hi, 0.35), 0.42);

      // 4. 细裂纹
      const crack = (pts, w, a) => {
        g.beginPath();
        g.moveTo(pts[0][0] * S, pts[0][1] * S);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * S, pts[i][1] * S);
        g.lineWidth = S * w;
        g.strokeStyle = rgba(mix(P.edge, [8, 6, 4], 0.4), a);
        g.stroke();
      };
      crack([[0.32, -0.08], [0.18, 0.26], [0.27, 0.56]], 0.034, 0.5);
      crack([[0.18, 0.26], [0.44, 0.34]], 0.026, 0.45);
      crack([[-0.34, 0.14], [-0.22, 0.40]], 0.026, 0.45);

      // 5. 收光 + 硬边
      shadeDown(g, V, P, 0.20);
      outline(g, V, P, S * 0.115);
      litRim(g, V, P, S * 0.085, 1);

      // 6. 碎屑：两颗跟着转的小石片（「碎」的语义）
      const chip = (x, y, r, rot) => {
        g.save();
        g.translate(x * S, y * S);
        g.rotate(rot);
        path(g, [[-r * S, r * S * 0.4], [r * S * 0.9, -r * S * 0.2], [r * S * 0.2, r * S]]);
        g.fillStyle = rgba(mix(P.base, [150, 140, 124], 0.35), 0.85);
        g.fill();
        g.lineWidth = S * 0.028;
        g.strokeStyle = rgba(P.edge, 0.55);
        g.stroke();
        g.restore();
      };
      chip(1.02, -0.34, 0.085, hash01(3) * TAU);
      chip(-0.96, 0.72, 0.062, hash01(7) * TAU);

      glint(g, -S * 0.26, -S * 0.60, S * 0.22, rgba(mix(WHITE, [214, 230, 255], 0.4), 0.6), 0.9);
      glint(g, S * 0.30, S * 0.02, S * 0.12, rgba([190, 206, 232], 0.35), 0.4);
    },
  },

  [B_DIAMOND]: {
    name: '金刚石',
    ext: 1.34,
    autoSpin: false,
    glowKey: 'cold',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'cold');

      const gl = [-0.86 * S, -0.14 * S], crl = [-0.46 * S, -0.66 * S], crr = [0.46 * S, -0.66 * S], gr = [0.86 * S, -0.14 * S];
      const wl = [-0.84 * S, 0.04 * S], wr = [0.84 * S, 0.04 * S], tip = [0, 1.08 * S];
      const sil = [gl, crl, crr, gr, wr, tip, wl];
      const silhouette = () => path(g, sil);

      softHalo(g, S * 1.30, mix(P.glow, [190, 240, 255], 0.5), 0.24);

      const bg = g.createLinearGradient(0, -S * 0.9, 0, S * 1.04);
      bg.addColorStop(0, rgba(mix(P.hi, WHITE, 0.6), 1));
      bg.addColorStop(0.32, rgba(mix(P.base, WHITE, 0.2), 1));
      bg.addColorStop(0.70, rgba(P.base, 1));
      bg.addColorStop(1, rgba(mix(P.deep, [16, 20, 60], 0.4), 1));
      silhouette();
      g.fillStyle = bg;
      g.fill();

      const Q = (pts, col, a) => {
        path(g, pts);
        g.fillStyle = rgba(col, a);
        g.fill();
      };
      const T = [
        [-0.24 * S, -0.54 * S], [0.24 * S, -0.54 * S], [0.46 * S, -0.40 * S],
        [0.30 * S, -0.26 * S], [-0.30 * S, -0.26 * S], [-0.46 * S, -0.40 * S],
      ];

      g.save();
      silhouette();
      g.clip();

      // 2. 冠部：切面环 + 台面
      Q([crl, crr, T[1], T[0]], WHITE, 0.40);
      Q([crl, T[0], T[5], gl], WHITE, 0.20);
      Q([crr, gr, T[2], T[1]], mix([10, 26, 70], P.deep, 0.4), 0.30);
      Q([gl, T[5], T[4], T[3], T[2], gr], WHITE, 0.14);

      const tg = g.createLinearGradient(0, -0.58 * S, 0, -0.24 * S);
      tg.addColorStop(0, rgba(WHITE, 0.98));
      tg.addColorStop(0.55, rgba(mix(WHITE, P.hi, 0.35), 0.96));
      tg.addColorStop(1, rgba(mix(WHITE, P.base, 0.40), 0.94));
      path(g, T);
      g.fillStyle = tg;
      g.fill();
      g.lineWidth = S * 0.028;
      g.strokeStyle = rgba(WHITE, 0.75);
      g.stroke();

      // 3. 亭部：四个切面聚到尖底 + 内反射
      const g1 = [-0.42 * S, -0.02 * S], g2 = [0, 0.06 * S], g3 = [0.42 * S, -0.02 * S];
      Q([wl, g1, tip], WHITE, 0.13);
      Q([g1, g2, tip], mix([10, 20, 60], P.deep, 0.35), 0.34);
      Q([g2, g3, tip], WHITE, 0.09);
      Q([g3, wr, tip], mix([8, 16, 52], P.deep, 0.35), 0.36);

      const rg = g.createRadialGradient(0, 0.28 * S, 0, 0, 0.30 * S, 0.44 * S);
      rg.addColorStop(0, rgba(WHITE, 0.30));
      rg.addColorStop(1, rgba(WHITE, 0));
      g.fillStyle = rg;
      g.beginPath();
      g.arc(0, 0.30 * S, 0.44 * S, 0, TAU);
      g.fill();

      g.lineWidth = S * 0.022;
      g.strokeStyle = rgba(mix(WHITE, P.hi, 0.3), 0.55);
      for (const p of [g1, g2, g3]) {
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(tip[0], tip[1]); g.stroke();
      }
      g.beginPath();
      g.moveTo(wl[0], wl[1]); g.lineTo(tip[0], tip[1]);
      g.moveTo(wr[0], wr[1]); g.lineTo(tip[0], tip[1]);
      g.stroke();

      // 4. 腰线：一条高光把上下两半切开
      const wg = g.createLinearGradient(-0.86 * S, 0, 0.86 * S, 0);
      wg.addColorStop(0, rgba(WHITE, 0.55));
      wg.addColorStop(0.5, rgba(WHITE, 0.95));
      wg.addColorStop(1, rgba(WHITE, 0.50));
      g.beginPath();
      g.moveTo(gl[0], gl[1]); g.lineTo(gr[0], gr[1]); g.lineTo(wr[0], wr[1]); g.lineTo(wl[0], wl[1]);
      g.closePath();
      g.fillStyle = wg;
      g.fill();
      g.restore();

      // 5. 硬边
      outline(g, sil, P, S * 0.09);
      litRim(g, sil, P, S * 0.09, 0.95);

      // 6. 星芒 + 两粒色散火花
      g.save();
      g.translate(-S * 0.20, -S * 0.50);
      for (let i = 0; i < 4; i++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(S * (i % 2 ? 0.055 : 0.075), -S * 0.60);
        g.lineTo(0, -S * 0.30);
        g.closePath();
        g.fillStyle = rgba(WHITE, 0.85);
        g.fill();
      }
      g.restore();
      glint(g, -S * 0.20, -S * 0.50, S * 0.24, rgba(WHITE, 0.95), 1);
      glint(g, -S * 0.62, -S * 0.02, S * 0.11, rgba([255, 150, 210], 0.55), 0.75);
      glint(g, S * 0.58, S * 0.14, S * 0.10, rgba([150, 255, 220], 0.50), 0.70);
    },
  },
};
