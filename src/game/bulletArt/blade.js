/**
 * bulletArt/blade.js —— 5 面中途 Boss · 魂魄妖梦（人符「现世斩」/ 人鬼「未来永劫斩」/ 断灵「剑楼阁」）
 *
 * 主题：刀。妖梦的弹幕必须一眼能看出「刀」：
 *   1) 太刀本体：细长、带反り（弧度）、刀背暗刀刃亮、刃口有薄荷色刀光；
 *   2) 刀斩弧：一段两端收尖的新月刀光，速度感靠细长的月牙；
 *   3) 半灵：半透明的灵体，给刀阵做「魂」的陪衬。
 * 三者的亮部都偏冷薄荷，暗部带蓝灰，避免和辉夜的暖金混淆。
 */
import { B_BLADE, B_SLASHARC, B_SPIRIT } from './types.js';
import {
  WHITE, TAU, mix, rgba, mat, clamp, outline, litRim, softHalo, hotCore,
  glint, streak, hash01,
} from './_lib.js';

const MINT = [168, 255, 226];   // 妖梦的薄荷刀光
const MINT_HOT = [225, 255, 246];
const STEEL_DARK = [30, 46, 62];

/** 太刀刀身轮廓（一次闭合路径：茎 → 刀背 → 切先 → 刀刃） */
function bladePath(g, S) {
  g.beginPath();
  g.moveTo(-S * 0.13, S * 0.94);        // 柄头左侧
  g.lineTo(-S * 0.16, S * 0.56);        // 茎（刀柄）收窄
  g.bezierCurveTo(-S * 0.20, S * 0.10, -S * 0.20, -S * 0.58, -S * 0.02, -S * 1.40); // 刀背
  g.lineTo(S * 0.22, -S * 1.62);        // 切先斜刃
  g.bezierCurveTo(S * 0.30, -S * 0.86, S * 0.26, -S * 0.06, S * 0.15, S * 0.56);    // 刀刃
  g.lineTo(S * 0.15, S * 0.94);         // 柄头右侧
  g.closePath();
}

export default {
  [B_BLADE]: {
    name: '太刀',
    ext: 1.86,
    autoSpin: true,      // 让刀身随 spin 小幅摆动，像被掷出的刀
    glowKey: 'steel',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'steel');

      // 0. 冷薄荷刀光晕
      softHalo(g, S * 1.52, mix(MINT, P.glow, 0.5), 0.26);

      // 1. 刀身：横向渐变，刀背暗、刀刃亮
      bladePath(g, S);
      const bg = g.createLinearGradient(-S * 0.22, 0, S * 0.30, 0);
      bg.addColorStop(0, rgba(mix(STEEL_DARK, P.deep, 0.5), 1));
      bg.addColorStop(0.42, rgba(mix(P.base, [90, 120, 140], 0.35), 1));
      bg.addColorStop(0.72, rgba(mix(P.hi, WHITE, 0.35), 1));
      bg.addColorStop(1, rgba(WHITE, 1));
      g.fillStyle = bg;
      g.fill();

      // 2. 刃文（hamon）：沿刃口起伏的一串亮纹
      g.save();
      bladePath(g, S);
      g.clip();
      const hamon = [
        [-0.42, 0.16], [-0.06, 0.30], [0.28, 0.18], [0.52, 0.28], [0.72, 0.14], [0.88, 0.20],
      ];
      g.beginPath();
      g.moveTo(S * 0.12, S * 0.50);
      for (let i = 0; i < hamon.length; i++) {
        const [ty, amp] = hamon[i];
        const yy = S * (0.50 - ty * 2.0);
        g.quadraticCurveTo(S * (0.13 + amp * 0.13), yy + S * 0.08, S * (0.13 - amp * 0.10), yy - S * 0.02);
      }
      g.lineWidth = S * 0.055;
      g.strokeStyle = rgba(mix(WHITE, MINT, 0.35), 0.55);
      g.stroke();
      // 刀身反光：一道沿刀背的长条亮带
      const gl = g.createLinearGradient(0, S * 0.4, 0, -S * 1.2);
      gl.addColorStop(0, rgba(WHITE, 0.0));
      gl.addColorStop(0.5, rgba(WHITE, 0.32));
      gl.addColorStop(1, rgba(WHITE, 0.0));
      g.fillStyle = gl;
      g.beginPath();
      g.moveTo(-S * 0.10, S * 0.30);
      g.lineTo(-S * 0.02, -S * 1.24);
      g.lineTo(S * 0.06, -S * 1.20);
      g.lineTo(S * 0.02, S * 0.28);
      g.closePath();
      g.fill();
      g.restore();

      // 3. 刃口白光（最亮的一条线）
      g.beginPath();
      g.moveTo(S * 0.15, S * 0.52);
      g.bezierCurveTo(S * 0.26, -S * 0.06, S * 0.30, -S * 0.86, S * 0.22, -S * 1.62);
      g.lineWidth = S * 0.075;
      g.strokeStyle = rgba(mix(WHITE, MINT, 0.45), 0.95);
      g.lineCap = 'round';
      g.stroke();
      g.lineWidth = S * 0.028;
      g.strokeStyle = rgba(WHITE, 0.95);
      g.stroke();

      // 4. 刀镡 + 柄卷（小，但能把「刀」这件事说清楚）
      g.save();
      g.translate(0, S * 0.62);
      g.beginPath();
      g.ellipse(0, 0, S * 0.32, S * 0.10, 0, 0, TAU);
      g.fillStyle = rgba(mix([92, 40, 28], P.deep, 0.3), 1);
      g.fill();
      g.lineWidth = S * 0.04;
      g.strokeStyle = rgba(MINT, 0.75);
      g.stroke();
      g.restore();
      g.fillStyle = rgba([30, 22, 20], 0.95);
      g.beginPath();
      g.moveTo(-S * 0.13, S * 0.70);
      g.lineTo(S * 0.15, S * 0.70);
      g.lineTo(S * 0.15, S * 0.94);
      g.lineTo(-S * 0.13, S * 0.94);
      g.closePath();
      g.fill();
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-S * 0.11, S * (0.74 + i * 0.07));
        g.lineTo(S * 0.13, S * (0.76 + i * 0.07));
        g.lineWidth = S * 0.035;
        g.strokeStyle = rgba(MINT, 0.35);
        g.stroke();
      }

      // 5. 近黑描边 + 刀尖高光
      bladePath(g, S);
      g.lineWidth = S * 0.075;
      g.strokeStyle = rgba([14, 24, 36], 0.85);
      g.lineJoin = 'round';
      g.stroke();
      glint(g, -S * 0.06, -S * 1.28, S * 0.24, rgba(WHITE, 0.7), 0.9);
    },
  },

  [B_SLASHARC]: {
    name: '刀斩',
    ext: 1.56,
    autoSpin: false,     // 斩击弧自带方向，交给 spin 反而乱
    glowKey: 'steel',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'steel');
      const a0 = -2.62, a1 = -0.36;
      const N = 34;
      const R0 = S * 1.30;
      // 弧厚：起手细、中后段最厚、收刀再尖（不对称才像「拖刀」而不是「盖子」）
      const thick = (t) => S * 0.34 * Math.pow(Math.sin(Math.PI * t), 1.0) * (0.58 + 0.75 * t);
      const arc = (R, t0, t1) => {
        g.beginPath();
        for (let i = 0; i <= N; i++) {
          const t = t0 + (t1 - t0) * (i / N);
          const a = a0 + (a1 - a0) * t;
          const x = Math.cos(a) * R;
          const y = Math.sin(a) * R;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
      };

      g.save();
      g.rotate(-0.62);    // 斜着走：一道「/」的斩痕，跟着弹道转，不可能是「盖子」

      // 0. 沿弧的刀光（贴着弧发光，而不是一个大圆盘）
      for (const [w, al] of [[0.66, 0.10], [0.36, 0.15], [0.18, 0.22]]) {
        arc(R0 + S * 0.02, 0.02, 0.98);
        g.lineWidth = S * w;
        g.lineCap = 'round';
        g.strokeStyle = rgba(mix(MINT, P.glow, 0.45), al);
        g.stroke();
      }

      // 1. 拖影：顺着斩击方向甩出去的两道细弧
      for (let fb = 1; fb <= 2; fb++) {
        g.save();
        g.rotate(0.16 * fb);
        arc(R0 * (1 - 0.10 * fb), 0.10 + 0.05 * fb, 0.92 - 0.04 * fb);
        g.lineWidth = S * (0.06 - fb * 0.015);
        g.lineCap = 'round';
        g.strokeStyle = rgba(mix(MINT, WHITE, 0.45), 0.30 - fb * 0.09);
        g.stroke();
        g.restore();
      }

      // 2. 主斩痕：闭合月牙，外缘白热、内缘透成薄荷
      const outer = [];
      const inner = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const a = a0 + (a1 - a0) * t;
        const th = thick(t);
        outer.push([Math.cos(a) * R0, Math.sin(a) * R0]);
        inner.push([Math.cos(a) * (R0 - th), Math.sin(a) * (R0 - th)]);
      }
      g.beginPath();
      g.moveTo(outer[0][0], outer[0][1]);
      for (let i = 1; i <= N; i++) g.lineTo(outer[i][0], outer[i][1]);
      for (let i = N; i >= 0; i--) g.lineTo(inner[i][0], inner[i][1]);
      g.closePath();
      const sg = g.createLinearGradient(Math.cos(a0) * R0, Math.sin(a0) * R0, Math.cos(a1) * R0, Math.sin(a1) * R0);
      sg.addColorStop(0, rgba(mix(MINT, P.base, 0.55), 0.55));
      sg.addColorStop(0.55, rgba(mix(WHITE, MINT, 0.40), 0.96));
      sg.addColorStop(1, rgba(WHITE, 0.99));
      g.fillStyle = sg;
      g.fill();

      // 3. 白热刃芯：贴着外缘的一条极细高光
      arc(R0 - S * 0.03, 0.03, 0.97);
      g.lineWidth = S * 0.05;
      g.lineCap = 'round';
      g.strokeStyle = rgba(WHITE, 0.95);
      g.stroke();

      // 4. 起手一点高光（斩击的「闪」）
      glint(g, Math.cos(a0 + 0.22) * R0, Math.sin(a0 + 0.22) * R0, S * 0.22, rgba(mix(WHITE, MINT, 0.5), 0.65), 0.9);

      g.restore();
    },
  },

  [B_SPIRIT]: {
    name: '半灵',
    ext: 1.36,
    autoSpin: true,
    glowKey: 'steel',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'steel');
      const R = S * 0.92;

      // 0. 灵体光晕
      softHalo(g, S * 1.44, mix(MINT, WHITE, 0.25), 0.26);

      // 1. 灵体主体：半透明球（中心亮、边缘化开）
      const body = g.createRadialGradient(-R * 0.22, -R * 0.28, R * 0.05, 0, 0, R);
      body.addColorStop(0, rgba(mix(WHITE, MINT, 0.35), 0.95));
      body.addColorStop(0.42, rgba(mix(MINT, P.base, 0.35), 0.62));
      body.addColorStop(0.80, rgba(P.base, 0.26));
      body.addColorStop(1, rgba(P.base, 0));
      g.beginPath();
      g.arc(0, -S * 0.10, R, 0, TAU);
      g.fillStyle = body;
      g.fill();

      // 2. 灵体上的一圈光环（魂环）
      g.save();
      g.rotate(-0.32);
      g.beginPath();
      g.ellipse(0, -S * 0.10, R * 1.02, R * 0.36, 0, 0, TAU);
      g.lineWidth = S * 0.075;
      g.strokeStyle = rgba(mix(MINT, WHITE, 0.4), 0.85);
      g.stroke();
      g.lineWidth = S * 0.030;
      g.strokeStyle = rgba(WHITE, 0.9);
      g.stroke();
      g.restore();

      // 3. 白热内芯
      hotCore(g, R * 0.46, { hot: mix(WHITE, MINT, 0.4) }, 0.5);
      glint(g, -R * 0.30, -R * 0.44, S * 0.22, rgba(WHITE, 0.85), 0.95);

      // 4. 下方飘散的三缕灵尾
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * S * 0.30;
        const len = S * (0.86 + hash01(i * 9 + 3) * 0.34);
        g.beginPath();
        g.moveTo(dx, S * 0.52);
        g.bezierCurveTo(dx + S * 0.16, S * 0.82, dx - S * 0.20, S * 1.02, dx + S * 0.04, S * 0.52 + len);
        g.lineWidth = S * (0.14 - i * 0.02);
        g.strokeStyle = rgba(mix(MINT, P.base, 0.35), 0.42 - i * 0.08);
        g.lineCap = 'round';
        g.stroke();
      }

      // 5. 边缘一圈冷光（灵体不能散成雾）
      g.beginPath();
      g.arc(0, -S * 0.10, R * 0.96, -2.6, -0.9);
      g.lineWidth = S * 0.09;
      g.strokeStyle = rgba(mix(MINT, WHITE, 0.55), 0.75);
      g.lineCap = 'round';
      g.stroke();
    },
  },
};
