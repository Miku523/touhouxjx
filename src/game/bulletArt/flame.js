/**
 * bulletArt/flame.js —— 6 面 · 蓬莱山辉夜「火鼠的皮衣」「火蜥蜴之盾」
 *
 * 主题：不灭的火。
 *  · 不灭火：三层火舌（橙红外焰 / 金黄中焰 / 白热内芯）+ 一道白热边光，
 *    尖端收成一条偏向一侧的舌锋，暗背景里靠硬描边不化开。
 *  · 火鳞：火蜥蜴的鳞片。扇面 + 三片下垂扇瓣的裙边，伞心放射七道骨、
 *    裙边一道熔金亮边、瓣谷透出热光 —— r=5 也读得出「扇形 + 波浪底边」的鳞。
 */
import { B_FLAME, B_SCALE } from './types.js';
import {
  WHITE, TAU, mix, rgba, mat, path, softHalo, glint, hash01, shadeDown,
} from './_lib.js';

const EMBER = [255, 120, 46];
const GOLD = [255, 226, 132];

/** 火舌轮廓：底部宽、尖端细、略向右舔（左/右不对称 = 有风向） */
function flamePath(g, S, k = 1) {
  g.beginPath();
  g.moveTo(0, S * 0.98 * k);
  g.bezierCurveTo(-S * 0.56 * k, S * 0.90 * k, -S * 0.82 * k, S * 0.30 * k, -S * 0.54 * k, -S * 0.26 * k);
  g.bezierCurveTo(-S * 0.36 * k, -S * 0.60 * k, -S * 0.18 * k, -S * 0.84 * k, -S * 0.06 * k, -S * 1.20 * k);
  g.bezierCurveTo(S * 0.12 * k, -S * 0.94 * k, S * 0.26 * k, -S * 0.74 * k, S * 0.38 * k, -S * 0.50 * k);
  g.bezierCurveTo(S * 0.66 * k, -S * 0.22 * k, S * 0.72 * k, S * 0.32 * k, S * 0.14 * k, S * 0.90 * k);
  g.bezierCurveTo(S * 0.06 * k, S * 0.96 * k, S * 0.02 * k, S * 0.97 * k, 0, S * 0.98 * k);
  g.closePath();
}

/** 火鳞的鳞片轮廓：顶端伞心 → 扇面张开 → 底缘三片下垂扇瓣（鳞片的裙边） */
function scalePath(g, S) {
  g.beginPath();
  g.moveTo(0, -S * 1.06);
  g.bezierCurveTo(S * 0.42, -S * 0.98, S * 0.74, -S * 0.62, S * 0.84, -S * 0.20);
  g.bezierCurveTo(S * 0.89, S * 0.06, S * 0.88, S * 0.28, S * 0.82, S * 0.48);
  g.lineTo(S * 0.46, S * 0.98);        // 右齿尖
  g.lineTo(S * 0.27, S * 0.62);        // 齿谷
  g.lineTo(0, S * 1.10);               // 中齿尖
  g.lineTo(-S * 0.27, S * 0.62);
  g.lineTo(-S * 0.46, S * 0.98);
  g.lineTo(-S * 0.82, S * 0.48);
  g.bezierCurveTo(-S * 0.88, S * 0.28, -S * 0.89, S * 0.06, -S * 0.84, -S * 0.20);
  g.bezierCurveTo(-S * 0.74, -S * 0.62, -S * 0.42, -S * 0.98, 0, -S * 1.06);
  g.closePath();
}

export default {
  [B_FLAME]: {
    name: '不灭火',
    ext: 1.42,
    autoSpin: true,
    glowKey: 'flame',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'flame');

      softHalo(g, S * 1.36, EMBER, 0.30);

      // 1. 外焰：橙红 → 金
      flamePath(g, S, 1.0);
      const og = g.createLinearGradient(0, S * 0.95, S * 0.05, -S * 1.2);
      og.addColorStop(0, rgba(mix(P.deep, [150, 24, 6], 0.5), 1));
      og.addColorStop(0.34, rgba(mix(P.base, EMBER, 0.55), 1));
      og.addColorStop(0.72, rgba(mix(P.light, GOLD, 0.60), 1));
      og.addColorStop(1, rgba(mix(GOLD, WHITE, 0.45), 1));
      g.fillStyle = og;
      g.fill();

      // 2. 外焰暗描边（不能省，否则亮背景里火会化开）
      flamePath(g, S, 1.0);
      g.lineWidth = S * 0.095;
      g.strokeStyle = rgba([92, 18, 6], 0.55);
      g.lineJoin = 'round';
      g.stroke();

      // 3. 白热边光：紧贴描边内圈的一道亮边（r=5 的形状保险）
      flamePath(g, S, 0.975);
      g.lineWidth = S * 0.042;
      g.strokeStyle = rgba(mix(GOLD, WHITE, 0.5), 0.55);
      g.stroke();

      // 4. 侧后方的一小簇火苗（「不灭」的第二簇，压暗不抢主体）
      g.save();
      g.globalAlpha = 0.5;
      g.translate(-S * 0.34, -S * 0.10);
      g.rotate(-0.34);
      flamePath(g, S, 0.30);
      g.fillStyle = rgba(mix(EMBER, GOLD, 0.45), 0.9);
      g.fill();
      g.restore();

      // 5. 中焰：金黄，尖锋错开
      g.save();
      g.translate(-S * 0.045, S * 0.12);
      g.rotate(-0.05);
      flamePath(g, S, 0.62);
      const mg = g.createLinearGradient(0, S * 0.55, 0, -S * 0.72);
      mg.addColorStop(0, rgba(mix(GOLD, EMBER, 0.55), 0.96));
      mg.addColorStop(0.45, rgba(GOLD, 0.99));
      mg.addColorStop(1, rgba(mix(WHITE, GOLD, 0.60), 0.97));
      g.fillStyle = mg;
      g.fill();
      g.restore();

      // 6. 白热内芯
      g.save();
      g.translate(S * 0.02, S * 0.32);
      flamePath(g, S, 0.32);
      const cg = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.34);
      cg.addColorStop(0, rgba(WHITE, 1));
      cg.addColorStop(0.5, rgba(mix(WHITE, GOLD, 0.35), 0.95));
      cg.addColorStop(1, rgba(GOLD, 0));
      g.fillStyle = cg;
      g.fill();
      g.restore();

      // 7. 飞散的火星（固定几粒，hash01 排布）
      for (let i = 0; i < 3; i++) {
        const a = -2.05 + i * 0.52;
        const rr = S * (0.98 + hash01(i * 13 + 2) * 0.30);
        g.beginPath();
        g.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.9, S * (0.065 + 0.04 * hash01(i * 13 + 4)), 0, TAU);
        g.fillStyle = rgba(mix(GOLD, EMBER, 0.4), 0.72);
        g.fill();
      }

      glint(g, -S * 0.10, -S * 0.40, S * 0.28, rgba(WHITE, 0.6), 0.95);
    },
  },

  [B_SCALE]: {
    name: '火鳞',
    ext: 1.36,
    autoSpin: true,
    glowKey: 'flame',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'flame');

      const COKE = mix([104, 14, 4], P.deep, 0.35);     // 焦黑边
      const RED = mix([214, 52, 16], P.base, 0.40);     // 朱红
      const MOLT = mix([255, 128, 44], P.light, 0.35);  // 熔橙
      const SEAM = mix(GOLD, WHITE, 0.45);              // 熔缝金白

      softHalo(g, S * 1.26, mix(EMBER, P.glow, 0.35), 0.26);

      // 1. 鳞片底色：伞心熔金 → 腹地朱红 → 裙边焦黑（火焰从鳞心往外烧）
      scalePath(g, S);
      const bg = g.createRadialGradient(0, -S * 0.70, S * 0.06, 0, -S * 0.50, S * 1.32);
      bg.addColorStop(0, rgba(mix(MOLT, WHITE, 0.35), 1));
      bg.addColorStop(0.30, rgba(MOLT, 1));
      bg.addColorStop(0.60, rgba(RED, 1));
      bg.addColorStop(0.86, rgba(mix(RED, COKE, 0.55), 1));
      bg.addColorStop(1, rgba(COKE, 1));
      g.fillStyle = bg;
      g.fill();

      g.save();
      scalePath(g, S);
      g.clip();
      g.lineCap = 'round';
      g.lineJoin = 'round';

      // 2. 放射骨：从伞心张开的交替明暗楔形（鳞片的骨，r=9 也读得出扇形）
      const apex = [0, -S * 0.88];
      const NW = 6, A0 = -1.04, A1 = 1.04;
      for (let i = 0; i < NW; i++) {
        const a0 = A0 + ((A1 - A0) * i) / NW;
        const a1 = A0 + ((A1 - A0) * (i + 1)) / NW;
        const R = S * 2.0;
        path(g, [
          apex,
          [apex[0] + Math.sin(a0) * R, apex[1] + Math.cos(a0) * R],
          [apex[0] + Math.sin(a1) * R, apex[1] + Math.cos(a1) * R],
        ]);
        g.fillStyle = i % 2
          ? rgba(mix(MOLT, WHITE, 0.45), 0.26)
          : rgba(mix(COKE, RED, 0.45), 0.30);
        g.fill();
      }
      // 骨线：暗槽一道 + 受光侧一道细亮
      for (let i = 0; i <= NW; i++) {
        const a = A0 + ((A1 - A0) * i) / NW;
        const R = S * 2.0;
        g.beginPath();
        g.moveTo(apex[0], apex[1]);
        g.lineTo(apex[0] + Math.sin(a) * R, apex[1] + Math.cos(a) * R);
        g.lineWidth = S * 0.026;
        g.strokeStyle = rgba(mix(COKE, [60, 10, 2], 0.4), 0.42);
        g.stroke();
        if (i < NW) {
          g.beginPath();
          g.moveTo(apex[0] + Math.sin(a + 0.05) * S * 0.2, apex[1] + Math.cos(a + 0.05) * S * 0.2);
          g.lineTo(apex[0] + Math.sin(a + 0.05) * R, apex[1] + Math.cos(a + 0.05) * R);
          g.lineWidth = S * 0.014;
          g.strokeStyle = rgba(mix(SEAM, MOLT, 0.5), 0.28);
          g.stroke();
        }
      }
      // 边缘压暗：甲片是弧面，四周收进暗部
      const eg = g.createRadialGradient(0, -S * 0.42, S * 0.24, 0, -S * 0.32, S * 1.30);
      eg.addColorStop(0, rgba(COKE, 0));
      eg.addColorStop(0.66, rgba(COKE, 0.10));
      eg.addColorStop(1, rgba(COKE, 0.52));
      g.fillStyle = eg;
      g.fillRect(-S * 1.2, -S * 1.3, S * 2.4, S * 2.6);
      // 伞心鼓包：一点隆起的高光
      const cg = g.createRadialGradient(0, -S * 0.76, 0, 0, -S * 0.76, S * 0.30);
      cg.addColorStop(0, rgba(mix(MOLT, WHITE, 0.55), 0.42));
      cg.addColorStop(0.50, rgba(MOLT, 0.16));
      cg.addColorStop(1, rgba(MOLT, 0));
      g.fillStyle = cg;
      g.fillRect(-S * 0.6, -S * 1.2, S * 1.2, S * 1.2);

      // 3. 同心生长弧：把轮廓按伞心缩两圈，描出层层生长线
      for (const k of [0.46, 0.70]) {
        g.save();
        g.translate(apex[0], apex[1]);
        g.scale(k, k);
        g.translate(-apex[0], -apex[1]);
        scalePath(g, S);
        g.lineWidth = (S * 0.030) / k;
        g.strokeStyle = rgba(mix(SEAM, MOLT, 0.5), 0.34 / k);
        g.stroke();
        g.restore();
      }

      // 4. 裙边亮边 —— r=5 时靠这三道弧读出「鳞」
      g.beginPath();
      g.moveTo(S * 0.82, S * 0.48);
      g.lineTo(S * 0.46, S * 0.98);
      g.lineTo(S * 0.27, S * 0.62);
      g.lineTo(0, S * 1.10);
      g.lineTo(-S * 0.27, S * 0.62);
      g.lineTo(-S * 0.46, S * 0.98);
      g.lineTo(-S * 0.82, S * 0.48);
      g.lineWidth = S * 0.055;
      g.lineJoin = 'round';
      g.strokeStyle = rgba(mix(SEAM, MOLT, 0.18), 0.96);
      g.stroke();
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineWidth = S * 0.18;
      g.strokeStyle = rgba(MOLT, 0.26);
      g.stroke();
      g.restore();

      // 5. 瓣谷的热光（火从鳞缝里透出来）
      for (const s of [-1, 1]) {
        const gx = s * S * 0.27;
        const gy = S * 0.62;
        const gg = g.createRadialGradient(gx, gy, 0, gx, gy, S * 0.32);
        gg.addColorStop(0, rgba(WHITE, 0.72));
        gg.addColorStop(0.35, rgba(mix(SEAM, MOLT, 0.4), 0.42));
        gg.addColorStop(1, rgba(MOLT, 0));
        g.fillStyle = gg;
        g.fillRect(gx - S * 0.4, gy - S * 0.4, S * 0.8, S * 0.8);
      }

      // 6. 侧缘压暗 → 弧面
      const vg = g.createLinearGradient(-S * 0.9, 0, S * 0.9, 0);
      vg.addColorStop(0, rgba(COKE, 0.42));
      vg.addColorStop(0.26, rgba(COKE, 0));
      vg.addColorStop(0.74, rgba(COKE, 0));
      vg.addColorStop(1, rgba(COKE, 0.46));
      g.fillStyle = vg;
      g.fillRect(-S * 1.1, -S * 1.2, S * 2.2, S * 2.4);

      // 7. 两道烧穿的亮裂
      const crack = (pts, w, col, a) => {
        g.beginPath();
        g.moveTo(pts[0][0] * S, pts[0][1] * S);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * S, pts[i][1] * S);
        g.lineWidth = S * w;
        g.strokeStyle = rgba(col, a);
        g.stroke();
      };
      crack([[0.10, 0.02], [0.24, 0.22], [0.14, 0.44]], 0.020, SEAM, 0.70);
      crack([[-0.16, 0.10], [-0.30, 0.34]], 0.017, SEAM, 0.55);

      g.restore();

      // 8. 顶部热边（伞心在发亮）
      const rim = g.createLinearGradient(-S * 0.84, 0, S * 0.84, 0);
      rim.addColorStop(0, rgba(WHITE, 0.06));
      rim.addColorStop(0.24, rgba(SEAM, 0.88));
      rim.addColorStop(0.76, rgba(SEAM, 0.88));
      rim.addColorStop(1, rgba(WHITE, 0.06));
      g.beginPath();
      g.moveTo(-S * 0.80, -S * 0.30);
      g.bezierCurveTo(-S * 0.72, -S * 0.82, -S * 0.36, -S * 1.00, 0, -S * 1.04);
      g.bezierCurveTo(S * 0.36, -S * 1.00, S * 0.72, -S * 0.82, S * 0.80, -S * 0.30);
      g.lineWidth = S * 0.075;
      g.strokeStyle = rim;
      g.stroke();
      g.beginPath();
      g.moveTo(-S * 0.70, -S * 0.36);
      g.bezierCurveTo(-S * 0.62, -S * 0.78, -S * 0.32, -S * 0.94, 0, -S * 0.98);
      g.bezierCurveTo(S * 0.32, -S * 0.94, S * 0.62, -S * 0.78, S * 0.70, -S * 0.36);
      g.lineWidth = S * 0.030;
      g.strokeStyle = rgba(WHITE, 0.50);
      g.stroke();

      // 9. 硬描边（暗背景里不化开）
      scalePath(g, S);
      g.lineWidth = S * 0.090;
      g.strokeStyle = rgba([46, 8, 2], 0.90);
      g.lineJoin = 'round';
      g.stroke();

      // 10. 三粒火星
      for (let i = 0; i < 3; i++) {
        const a = -1.15 + i * 0.34;
        const rr = S * (1.02 + 0.12 * hash01(i * 7 + 1));
        g.beginPath();
        g.arc(Math.cos(a) * rr, Math.sin(a) * rr, S * (0.042 + 0.024 * hash01(i * 7 + 3)), 0, TAU);
        g.fillStyle = rgba(mix(SEAM, MOLT, 0.4), 0.82);
        g.fill();
      }

      glint(g, -S * 0.26, -S * 0.66, S * 0.20, rgba(WHITE, 0.55), 0.9);
    },
  },
};
