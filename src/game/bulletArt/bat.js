/**
 * bulletArt/bat.js —— EXTRA 中途 Boss · 雷米莉亚·斯卡雷特（咒诅「弗拉德·特佩斯」/ 天罚「大卫之星」）
 *
 * 主题：张开的蝠翼 + 血。画法以「真实战斗尺寸 r=4~7」为第一优先：
 *   - 剪影：一对三角蝠翼向两侧上方张开，翼尖挑成钩；外缘垂下来收成两枚翼指（扇贝缺口）；
 *     中间是绒球身体 + 头顶两只尖耳 + 两只白热血眼 —— 一眼是「蝙蝠」而不是飞蛾 / 蝴蝶结；
 *   - 翼膜分两段：前缘受光段（亮猩红）与翼根暗段（近黑酒红）被两根近黑翼骨断开，
 *     翼骨上缘再压一道细亮线 —— 小尺寸也有「分节」；
 *   - 亮边：整圈「近黑压边 + 浅玫瑰内边」双描边，前缘再压白热刃光：
 *     暗红城堡底靠亮边、亮红月面靠黑边，两种底色都勾得住剪影；
 *   - 身体比翼膜亮（#c8324f~#ff9aa8 区间），r5 时只靠亮边 + 两只眼 + 翼尖高光也认得出；
 *   - 颜色全部由 b.color 派生（亮阶亮部 / 暗阶暗部随卡色明度、饱和度浮动），不写死单一红。
 */
import { B_BAT } from './types.js';
import {
  WHITE, TAU, hexToRgb, rgbToHsl, hslToRgb, mix, rgba, clamp,
  mat, softHalo, glint, hash01,
} from './_lib.js';

/** 亮阶 / 暗阶：色相永远跟着 b.color，明度 / 饱和由卡色决定 */
function palette(color) {
  const { h, s } = rgbToHsl(hexToRgb(color));
  const B = mat(color, 'pink'); // 亮阶
  const D = mat(color, 'dark'); // 暗阶
  const vivid = (lum) => hslToRgb(h, clamp(s, 0.6, 1), lum);
  return {
    hot: mix(WHITE, vivid(0.62), 0.16),   // 白热（刃光 / 眼底）
    rim: mix(WHITE, vivid(0.54), 0.28),   // 亮边
    lit: mix(B.light, WHITE, 0.30),       // 受光面
    bodyHi: mix(B.light, WHITE, 0.14),    // 绒球亮部 ~#ff9aa8
    bodyMid: mix(B.base, B.deep, 0.20),   // 绒球中调 ~#c8324f
    wingHi: mix(B.base, B.light, 0.34),   // 外段翼膜（受光）
    wingMid: mix(B.base, B.deep, 0.50),   // 内段翼膜
    wingDeep: mix(B.deep, D.deep, 0.42),  // 翼根 / 下缘
    ink: mix(D.edge, [9, 2, 10], 0.42),   // 近黑轮廓（带一点紫，不用中性灰）
    eye: vivid(0.55),                     // 血红眼
    glow: mix(B.glow, [255, 150, 180], 0.30),
  };
}

/** 单侧翼形（dir = ±1）：肩 → 前缘 → 上挑翼尖 → 外缘 → 外翼指 → 缺口 → 中翼指 → 缺口 → 腰 */
function wingPath(g, S, dir) {
  g.beginPath();
  g.moveTo(dir * S * 0.15, -S * 0.10); // 肩窝
  g.bezierCurveTo(dir * S * 0.55, -S * 0.50, dir * S * 1.00, -S * 0.66, dir * S * 1.14, -S * 0.60); // 前缘（臂）
  g.lineTo(dir * S * 1.30, -S * 0.90); // 翼尖上挑
  g.bezierCurveTo(dir * S * 1.34, -S * 0.54, dir * S * 1.20, -S * 0.18, dir * S * 1.045, S * 0.015); // 外缘落下 → 外翼指
  g.quadraticCurveTo(dir * S * 0.972, -S * 0.090, dir * S * 0.888, -S * 0.145); // 缺口 1（加深）
  g.quadraticCurveTo(dir * S * 0.862, S * 0.050, dir * S * 0.795, S * 0.185); // 中翼指
  g.quadraticCurveTo(dir * S * 0.728, S * 0.040, dir * S * 0.648, -S * 0.062); // 缺口 2（加深）
  g.quadraticCurveTo(dir * S * 0.40, S * 0.10, dir * S * 0.155, S * 0.20); // 收进腰
  g.closePath();
}

/** 绒球身体（不规则轮廓，靠 hash01 做确定性毛边） */
function bodyPath(g, S) {
  const cx = 0, cy = S * 0.03;
  const rx = S * 0.205, ry = S * 0.248;
  const n = 22;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    const f = 1 + (hash01(i * 17 + 3) - 0.5) * 0.10; // ±5% 毛边
    const x = cx + Math.cos(a) * rx * f;
    const y = cy + Math.sin(a) * ry * f;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

export default {
  [B_BAT]: {
    name: '血蝠',
    ext: 1.34,
    autoSpin: true,
    glowKey: 'pink',
    build(g, size, color) {
      const S = size;
      const small = S < 6.5;
      const P = palette(color);
      const w = (k) => S * k;

      // 0. 外圈血光
      softHalo(g, S * 1.16, P.glow, small ? 0.16 : 0.20);

      for (const dir of [-1, 1]) {
        // 1. 翼膜底色：上缘受光 → 下缘入暗
        wingPath(g, S, dir);
        const wg = g.createLinearGradient(0, -S * 1.00, 0, S * 0.30);
        wg.addColorStop(0.00, rgba(mix(P.wingHi, P.lit, 0.35), 1));
        wg.addColorStop(0.26, rgba(P.wingHi, 1));
        wg.addColorStop(0.58, rgba(P.wingMid, 1));
        wg.addColorStop(0.84, rgba(mix(P.wingDeep, P.wingMid, 0.30), 1));
        wg.addColorStop(1.00, rgba(mix(P.wingDeep, P.ink, 0.32), 1));
        g.fillStyle = wg;
        g.fill();

        // 2. 膜内明暗（裁在翼形内）
        g.save();
        wingPath(g, S, dir);
        g.clip();
        // 2a 翼根阴影：往身体方向压暗
        const rs = g.createRadialGradient(dir * S * 0.12, S * 0.02, 0, dir * S * 0.12, S * 0.02, S * 0.62);
        rs.addColorStop(0, rgba(P.ink, 0.62));
        rs.addColorStop(0.50, rgba(P.ink, 0.22));
        rs.addColorStop(1, rgba(P.ink, 0));
        g.fillStyle = rs;
        g.fillRect(-S * 1.40, -S * 1.40, S * 2.8, S * 2.8);
        // 2b 外段翼膜（前缘 → 第一根翼骨）再提亮，强调「受光的分节」
        g.beginPath();
        g.moveTo(dir * S * 0.15, -S * 0.10);
        g.lineTo(dir * S * 1.14, -S * 0.60);
        g.lineTo(dir * S * 1.30, -S * 0.90);
        g.lineTo(dir * S * 1.10, S * 0.04);
        g.closePath();
        g.fillStyle = rgba(P.rim, 0.16);
        g.fill();
        if (!small) {
          // 2c 内段翼膜压暗：以「腕 → 中翼指」为界，把翼膜分成受光外段 / 暗内段
          g.beginPath();
          g.moveTo(dir * S * 1.12, -S * 0.58);
          g.lineTo(dir * S * 0.80, S * 0.18);
          g.lineTo(dir * S * 0.155, S * 0.20);
          g.lineTo(dir * S * 0.15, -S * 0.10);
          g.closePath();
          g.fillStyle = rgba(P.wingDeep, 0.34);
          g.fill();
          // 2d 膜脉（细弧线，指向翼指）
          g.strokeStyle = rgba(P.rim, 0.26);
          g.lineWidth = w(0.015);
          g.lineCap = 'round';
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.moveTo(dir * S * (0.26 + i * 0.05), -S * (0.14 + i * 0.07));
            g.quadraticCurveTo(dir * S * (0.72 + i * 0.10), -S * (0.20 + i * 0.03), dir * S * (1.04 + i * 0.03), -S * (0.34 + i * 0.08));
            g.stroke();
          }
          // 2e 膜面碎高光（hash01 确定性，不闪）
          for (let i = 0; i < 4; i++) {
            const hx = dir * S * (0.42 + hash01(dir * 31 + i * 7) * 0.58);
            const hy = -S * (0.14 + hash01(dir * 57 + i * 13) * 0.44);
            glint(g, hx, hy, S * 0.021, rgba(P.hot, 0.26), 0.45);
          }
        }
        g.restore();

        // 3. 翼骨：臂骨（前缘内侧一道暗脊）+ 指骨（腕 → 中翼指），把翼膜明确分成两节
        g.lineCap = 'round';
        // 3a 臂骨暗脊：贴着受光前缘走，比前缘暗一档，读作「骨头」而不是第二道亮边
        g.beginPath();
        g.moveTo(dir * S * 0.24, -S * 0.22);
        g.quadraticCurveTo(dir * S * 0.66, -S * 0.46, dir * S * 1.10, -S * 0.54);
        g.lineWidth = w(small ? 0.030 : 0.020);
        g.strokeStyle = rgba(P.ink, 0.22);
        g.stroke();
        // 3b 指骨：腕 → 中翼指，暗影 + 骨脊亮线（比翼膜亮、比轮廓暗）
        const bone = [1.12, -0.58, 1.00, -0.16, 0.80, 0.17];
        g.beginPath();
        g.moveTo(dir * S * bone[0], S * bone[1]);
        g.quadraticCurveTo(dir * S * bone[2], S * (bone[3] + 0.028), dir * S * bone[4], S * (bone[5] + 0.022));
        g.lineWidth = w(small ? 0.058 : 0.040);
        g.strokeStyle = rgba(P.ink, 0.32);
        g.stroke();
        g.beginPath();
        g.moveTo(dir * S * bone[0], S * bone[1]);
        g.quadraticCurveTo(dir * S * bone[2], S * bone[3], dir * S * bone[4], S * bone[5]);
        g.lineWidth = w(small ? 0.038 : 0.024);
        g.strokeStyle = rgba(mix(P.bodyHi, P.rim, 0.45), small ? 0.88 : 0.74);
        g.stroke();

        // 4. 外轮廓：近黑压边 + 浅玫瑰内边（两种底色都能勾住剪影）
        wingPath(g, S, dir);
        g.lineWidth = w(small ? 0.16 : 0.115);
        g.strokeStyle = rgba(P.ink, 0.96);
        g.lineJoin = 'round';
        g.stroke();
        wingPath(g, S, dir);
        g.lineWidth = w(small ? 0.058 : 0.042);
        g.strokeStyle = rgba(P.rim, 0.82);
        g.stroke();
        // 上缘强亮边（前缘 → 翼尖 → 外缘落到外翼指），下缘保持暗，避免小尺寸像"咧嘴"
        g.beginPath();
        g.moveTo(dir * S * 0.15, -S * 0.10);
        g.bezierCurveTo(dir * S * 0.55, -S * 0.50, dir * S * 1.00, -S * 0.66, dir * S * 1.14, -S * 0.60);
        g.lineTo(dir * S * 1.30, -S * 0.90);
        g.bezierCurveTo(dir * S * 1.34, -S * 0.54, dir * S * 1.20, -S * 0.18, dir * S * 1.045, S * 0.008);
        g.lineWidth = w(small ? 0.088 : 0.060);
        g.strokeStyle = rgba(P.rim, 0.98);
        g.stroke();

        // 5. 前缘白热刃光（整条前缘 + 上挑翼尖）
        g.beginPath();
        g.moveTo(dir * S * 0.15, -S * 0.10);
        g.bezierCurveTo(dir * S * 0.55, -S * 0.50, dir * S * 1.00, -S * 0.66, dir * S * 1.14, -S * 0.60);
        g.lineTo(dir * S * 1.30, -S * 0.90);
        g.lineWidth = w(small ? 0.078 : 0.050);
        g.strokeStyle = rgba(P.hot, 0.96);
        g.lineCap = 'round';
        g.stroke();

        // 6. 翼尖白热高光
        glint(g, dir * S * 1.255, -S * 0.875, S * (small ? 0.17 : 0.125), rgba(P.hot, 0.55), 0.85);
      }

      // 7. 耳朵（先画，身体压住耳根）
      for (const dir of [-1, 1]) {
        const ear = [
          [dir * S * 0.042, -S * 0.190],
          [dir * S * 0.208, -S * 0.648],
          [dir * S * 0.244, -S * 0.142],
        ];
        g.beginPath();
        g.moveTo(ear[0][0], ear[0][1]);
        g.lineTo(ear[1][0], ear[1][1]);
        g.lineTo(ear[2][0], ear[2][1]);
        g.closePath();
        const eg = g.createLinearGradient(0, -S * 0.62, 0, -S * 0.16);
        eg.addColorStop(0, rgba(mix(P.bodyHi, P.lit, 0.55), 1));
        eg.addColorStop(0.45, rgba(P.bodyHi, 1));
        eg.addColorStop(1, rgba(P.bodyMid, 1));
        g.fillStyle = eg;
        g.fill();
        // 耳内
        g.beginPath();
        g.moveTo(dir * S * 0.062, -S * 0.252);
        g.lineTo(dir * S * 0.192, -S * 0.596);
        g.lineTo(dir * S * 0.218, -S * 0.186);
        g.closePath();
        g.fillStyle = rgba(P.eye, 0.55);
        g.fill();
        // 耳轮廓 + 内侧亮边（让两只耳在剪影上分开）
        g.beginPath();
        g.moveTo(ear[0][0], ear[0][1]);
        g.lineTo(ear[1][0], ear[1][1]);
        g.lineTo(ear[2][0], ear[2][1]);
        g.closePath();
        g.lineWidth = w(small ? 0.08 : 0.055);
        g.strokeStyle = rgba(P.ink, 0.94);
        g.lineJoin = 'round';
        g.stroke();
        g.beginPath();
        g.moveTo(ear[0][0], ear[0][1]);
        g.lineTo(ear[1][0], ear[1][1]);
        g.lineTo(ear[2][0], ear[2][1]);
        g.closePath();
        g.lineWidth = w(small ? 0.042 : 0.030);
        g.strokeStyle = rgba(P.rim, 0.92);
        g.stroke();
      }

      // 8. 绒球身体：亮血红，脸区最亮
      bodyPath(g, S);
      const fg = g.createRadialGradient(-S * 0.045, -S * 0.10, S * 0.02, 0, S * 0.06, S * 0.40);
      fg.addColorStop(0.00, rgba(P.bodyHi, 1));
      fg.addColorStop(0.32, rgba(mix(P.bodyHi, P.bodyMid, 0.55), 1));
      fg.addColorStop(0.66, rgba(P.bodyMid, 1));
      fg.addColorStop(1.00, rgba(P.wingDeep, 1));
      g.fillStyle = fg;
      g.fill();
      bodyPath(g, S);
      g.lineWidth = w(small ? 0.075 : 0.048);
      g.strokeStyle = rgba(P.ink, 0.95);
      g.lineJoin = 'round';
      g.stroke();
      // 左上受光边（只照亮头顶与左肩，别糊成一整圈）
      g.save();
      bodyPath(g, S);
      g.clip();
      g.beginPath();
      g.ellipse(0, S * 0.03, S * 0.192, S * 0.235, 0, Math.PI * 1.06, Math.PI * 1.55);
      g.lineWidth = w(small ? 0.075 : 0.050);
      g.strokeStyle = rgba(P.rim, 0.92);
      g.lineCap = 'round';
      g.stroke();
      g.restore();

      // 9. 脸：两只白热血眼（眼窝压暗 + 血红虹膜 + 白芯）
      const er = S * (small ? 0.105 : 0.082);
      for (const dir of [-1, 1]) {
        const ex = dir * S * (small ? 0.098 : 0.082);
        const ey = -S * 0.075;
        g.beginPath();
        g.ellipse(ex, ey, er * 1.34, er * 1.24, dir * 0.16, 0, TAU);
        g.fillStyle = rgba(P.ink, 0.80);
        g.fill();
        g.beginPath();
        g.ellipse(ex, ey, er * 1.10, er * 0.88, dir * 0.22, 0, TAU);
        g.fillStyle = rgba(mix(P.eye, P.hot, 0.18), 1);
        g.fill();
        g.beginPath();
        g.ellipse(ex - dir * S * 0.012, ey - S * 0.014, er * 0.46, er * 0.40, 0, 0, TAU);
        g.fillStyle = rgba(WHITE, 0.96);
        g.fill();
      }

      // 10. 鼻尖 / 嘴（只在大尺寸）
      if (!small) {
        g.beginPath();
        g.moveTo(-S * 0.024, -S * 0.010);
        g.lineTo(S * 0.024, -S * 0.010);
        g.lineTo(0, S * 0.024);
        g.closePath();
        g.fillStyle = rgba(P.ink, 0.72);
        g.fill();
        for (const dir of [-1, 1]) {
          g.beginPath();
          g.moveTo(dir * S * 0.020, S * 0.016);
          g.lineTo(dir * S * 0.052, S * 0.016);
          g.lineTo(dir * S * 0.040, S * 0.072);
          g.closePath();
          g.fillStyle = rgba(WHITE, 0.92);
          g.fill();
        }
      }
    },
  },
};
