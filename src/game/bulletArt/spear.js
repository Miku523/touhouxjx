/**
 * bulletArt/spear.js —— EXTRA 中途 Boss · 雷米莉亚·斯卡雷特（高速穿刺的猩红长枪）
 *
 * 主题：一杆「看得懂的枪」，不是红铅笔。真实战斗尺寸 r=4~7 优先：
 *   - 剪影：细长菱形枪头（左刃受光 / 右刃压暗 / 白热中脊，尖在最高处）、
 *     十字护手（横向最大宽度 + 中心圆芯）、长杆（暗红杆身 + 白热亮芯）、尾端收尖；
 *     长轴笔直朝上（autoSpin:false，不旋转）；
 *   - 亮边：全形「近黑压边 + 浅玫瑰内边」，枪头左刃再压白热刃光 + 枪尖高光：
 *     暗红城堡底靠亮边、亮红月面靠黑边，两种底色都勾得住；r5 时枪尖 + 亮芯 + 护手横梁仍可辨；
 *   - 颜色全部由 b.color 派生（亮阶 / 暗阶随卡色浮动），不写死单一红。
 */
import { B_SPEAR } from './types.js';
import {
  WHITE, hexToRgb, rgbToHsl, hslToRgb, mix, rgba, clamp,
  mat, path, softHalo, glint,
} from './_lib.js';

/** 亮阶 / 暗阶：色相跟着 b.color，明度 / 饱和由卡色决定 */
function palette(color) {
  const { h, s } = rgbToHsl(hexToRgb(color));
  const B = mat(color, 'pink'); // 亮阶
  const D = mat(color, 'dark'); // 暗阶
  const vivid = (lum) => hslToRgb(h, clamp(s, 0.6, 1), lum);
  return {
    hot: mix(WHITE, vivid(0.64), 0.14),   // 白热（枪尖 / 亮芯 / 中脊）
    rim: mix(WHITE, vivid(0.56), 0.26),   // 亮边
    lit: mix(B.light, WHITE, 0.30),       // 受光刃面
    bodyHi: mix(B.light, WHITE, 0.14),    // 杆身亮部
    bodyMid: mix(B.base, B.deep, 0.22),   // 杆身中调
    wingHi: mix(B.base, B.light, 0.50),   // 刃面亮面
    wingMid: mix(B.base, B.deep, 0.46),   // 刃面暗面
    wingDeep: mix(B.deep, D.deep, 0.44),  // 暗部
    ink: mix(D.edge, [9, 2, 10], 0.40),   // 近黑轮廓
    eye: vivid(0.52),                     // 血光
    glow: mix(B.glow, [255, 150, 180], 0.28),
  };
}

export default {
  [B_SPEAR]: {
    name: '血枪',
    ext: 1.72,
    autoSpin: false,
    glowKey: 'pink',
    build(g, size, color) {
      const S = size;
      const small = S < 6.5;
      const P = palette(color);
      const w = (k) => S * k;

      // 关键尺寸（单位 S，中心在 0，-y 朝上）
      const tipY = -S * 1.72;
      const wideY = -S * 1.33;
      const bladeBase = -S * 1.06;
      const collarTop = -S * 1.06;
      const collarBot = -S * 0.94;
      const gy = -S * 0.90;
      const gh = S * (small ? 0.072 : 0.058);
      const gw = S * (small ? 0.415 : 0.375);
      const shaftTop = -S * 0.96;
      const shaftBot = S * 0.70;
      const tailTip = S * 1.22;
      const hw = S * (small ? 0.098 : 0.078);
      const halfW = S * (small ? 0.205 : 0.175);

      // 0. 外圈血光（月面上先立一层暖）
      softHalo(g, S * 1.30, P.glow, small ? 0.17 : 0.21);

      // 1. 尾焰：向后拖的血线（高速感）
      const tg = g.createLinearGradient(0, shaftBot, 0, S * 1.52);
      tg.addColorStop(0, rgba(P.eye, 0.50));
      tg.addColorStop(0.40, rgba(P.eye, 0.18));
      tg.addColorStop(1, rgba(P.eye, 0));
      g.beginPath();
      g.moveTo(-S * 0.055, shaftBot);
      g.lineTo(S * 0.055, shaftBot);
      g.lineTo(0, S * 1.52);
      g.closePath();
      g.fillStyle = tg;
      g.fill();

      // 2. 枪杆：暗红杆身 + 白热亮芯 + 尾部收尖
      const shaftPts = [
        [-hw, shaftTop],
        [hw, shaftTop],
        [hw * 0.55, shaftBot],
        [0, tailTip],
        [-hw * 0.55, shaftBot],
      ];
      const sg = g.createLinearGradient(-hw, 0, hw, 0);
      sg.addColorStop(0.00, rgba(P.wingDeep, 1));
      sg.addColorStop(0.22, rgba(P.wingMid, 1));
      sg.addColorStop(0.46, rgba(mix(P.bodyHi, P.wingMid, 0.34), 1));
      sg.addColorStop(0.66, rgba(P.wingMid, 1));
      sg.addColorStop(1.00, rgba(P.wingDeep, 1));
      path(g, shaftPts);
      g.fillStyle = sg;
      g.fill();
      // 白热亮芯：护手下方最亮，越靠近尾端越暗（避免整根变成荧光棒）
      const cg = g.createLinearGradient(0, shaftTop, 0, tailTip);
      cg.addColorStop(0.00, rgba(P.hot, 1));
      cg.addColorStop(0.42, rgba(P.hot, 0.66));
      cg.addColorStop(0.60, rgba(mix(P.hot, P.eye, 0.55), 0.74));
      cg.addColorStop(0.86, rgba(P.eye, 0.46));
      cg.addColorStop(1.00, rgba(P.eye, 0.08));
      g.beginPath();
      g.moveTo(0, shaftTop + S * 0.02);
      g.lineTo(0, tailTip - S * 0.06);
      g.lineWidth = w(small ? 0.052 : 0.032);
      g.lineCap = 'round';
      g.strokeStyle = cg;
      g.stroke();
      // 杆身近黑轮廓（开口路径：尾尖收成尖，不封成一坨黑）
      g.beginPath();
      g.moveTo(-hw, shaftTop);
      g.lineTo(-hw * 0.55, shaftBot);
      g.lineTo(0, tailTip - S * 0.012);
      g.lineTo(hw * 0.55, shaftBot);
      g.lineTo(hw, shaftTop);
      g.lineWidth = w(small ? 0.048 : 0.032);
      g.strokeStyle = rgba(P.ink, 0.95);
      g.lineJoin = 'round';
      g.stroke();
      // 尾尖一道亮边（尾部不塌成暗块）
      g.beginPath();
      g.moveTo(-hw * 0.52, shaftBot - S * 0.02);
      g.lineTo(0, tailTip - S * 0.02);
      g.lineWidth = w(small ? 0.026 : 0.017);
      g.strokeStyle = rgba(P.rim, 0.72);
      g.lineCap = 'round';
      g.stroke();
      // 杆身左缘亮边（勾住细杆，小尺寸尤其重要）
      g.beginPath();
      g.moveTo(-hw * 0.86, shaftTop + S * 0.02);
      g.lineTo(-hw * 0.60, shaftBot - S * 0.06);
      g.lineWidth = w(small ? 0.034 : 0.022);
      g.strokeStyle = rgba(P.rim, small ? 0.85 : 0.62);
      g.lineCap = 'round';
      g.stroke();

      // 3. 枪头插座（刃与护手之间的过渡块）
      const collarPts = [
        [-S * 0.100, collarTop],
        [S * 0.100, collarTop],
        [S * 0.074, collarBot],
        [-S * 0.074, collarBot],
      ];
      const clg = g.createLinearGradient(-S * 0.100, 0, S * 0.100, 0);
      clg.addColorStop(0, rgba(P.wingHi, 1));
      clg.addColorStop(0.46, rgba(P.bodyHi, 1));
      clg.addColorStop(1, rgba(P.wingDeep, 1));
      path(g, collarPts);
      g.fillStyle = clg;
      g.fill();
      path(g, collarPts);
      g.lineWidth = w(small ? 0.048 : 0.032);
      g.strokeStyle = rgba(P.ink, 0.95);
      g.stroke();
      g.beginPath();
      g.moveTo(-S * 0.092, collarTop + S * 0.016);
      g.lineTo(S * 0.092, collarTop + S * 0.016);
      g.lineWidth = w(small ? 0.036 : 0.024);
      g.strokeStyle = rgba(P.rim, 0.92);
      g.lineCap = 'round';
      g.stroke();

      // 4. 十字护手：横向最大宽度，两端收尖 + 中心菱形芯（"十字"的横）
      const guardPts = [
        [-gw, gy],
        [-gw * 0.82, gy - gh],
        [-gw * 0.22, gy - gh * 0.92],
        [gw * 0.22, gy - gh * 0.92],
        [gw * 0.82, gy - gh],
        [gw, gy],
        [gw * 0.82, gy + gh],
        [gw * 0.22, gy + gh * 0.92],
        [-gw * 0.22, gy + gh * 0.92],
        [-gw * 0.82, gy + gh],
      ];
      const gg = g.createLinearGradient(0, gy - gh, 0, gy + gh);
      gg.addColorStop(0, rgba(P.hot, 1));
      gg.addColorStop(0.40, rgba(P.bodyMid, 1));
      gg.addColorStop(1, rgba(P.wingDeep, 1));
      path(g, guardPts);
      g.fillStyle = gg;
      g.fill();
      path(g, guardPts);
      g.lineWidth = w(small ? 0.058 : 0.040);
      g.strokeStyle = rgba(P.ink, 0.95);
      g.lineJoin = 'round';
      g.stroke();
      // 护手上缘亮边 / 下缘弱亮边
      g.beginPath();
      g.moveTo(-gw * 0.86, gy - gh * 0.78);
      g.lineTo(gw * 0.86, gy - gh * 0.78);
      g.lineWidth = w(small ? 0.042 : 0.028);
      g.strokeStyle = rgba(P.rim, 0.95);
      g.lineCap = 'round';
      g.stroke();
      g.beginPath();
      g.moveTo(-gw * 0.58, gy + gh * 0.60);
      g.lineTo(gw * 0.58, gy + gh * 0.60);
      g.lineWidth = w(small ? 0.026 : 0.018);
      g.strokeStyle = rgba(P.rim, 0.38);
      g.stroke();
      // 护手两端白热小点
      for (const dir of [-1, 1]) {
        glint(g, dir * gw * 0.95, gy, S * (small ? 0.10 : 0.072), rgba(P.hot, 0.55), 0.85);
      }
      // 中心菱形芯（十字的交点）
      const bossPts = [
        [0, gy - S * 0.138],
        [S * 0.058, gy],
        [0, gy + S * 0.128],
        [-S * 0.058, gy],
      ];
      const bsg = g.createLinearGradient(-S * 0.052, 0, S * 0.052, 0);
      bsg.addColorStop(0, rgba(P.lit, 1));
      bsg.addColorStop(0.55, rgba(P.bodyMid, 1));
      bsg.addColorStop(1, rgba(P.wingDeep, 1));
      path(g, bossPts);
      g.fillStyle = bsg;
      g.fill();
      path(g, bossPts);
      g.lineWidth = w(small ? 0.042 : 0.028);
      g.strokeStyle = rgba(P.ink, 0.95);
      g.lineJoin = 'round';
      g.stroke();
      glint(g, 0, gy - S * 0.005, S * (small ? 0.085 : 0.058), rgba(P.hot, 0.55), 0.9);

      // 5. 菱形枪头：左刃受光 / 右刃压暗 / 白热中脊
      const bladePts = [
        [0, tipY],
        [-halfW, wideY],
        [0, bladeBase],
        [halfW, wideY],
      ];
      const bg = g.createLinearGradient(-halfW, 0, halfW, 0);
      bg.addColorStop(0.00, rgba(P.lit, 1));
      bg.addColorStop(0.22, rgba(P.wingHi, 1));
      bg.addColorStop(0.50, rgba(mix(P.wingHi, P.wingMid, 0.62), 1));
      bg.addColorStop(0.78, rgba(P.wingMid, 1));
      bg.addColorStop(1.00, rgba(P.wingDeep, 1));
      path(g, bladePts);
      g.fillStyle = bg;
      g.fill();
      // 右刃面再压一层暗（两刃面拉开）
      path(g, [[0, tipY], [halfW, wideY], [0, bladeBase]]);
      g.fillStyle = rgba(mix(P.wingDeep, P.ink, 0.34), 0.42);
      g.fill();
      // 左刃面「刃身」斜向高光（不是整片白，留猩红材质）
      path(g, [[0, tipY], [-halfW * 0.80, wideY - S * 0.03], [-halfW * 0.34, wideY + S * 0.07]]);
      g.fillStyle = rgba(P.hot, 0.11);
      g.fill();
      // 白热中脊（从尖到底）
      const rg2 = g.createLinearGradient(0, tipY, 0, bladeBase);
      rg2.addColorStop(0.00, rgba(P.hot, 1));
      rg2.addColorStop(0.55, rgba(P.hot, 0.90));
      rg2.addColorStop(1.00, rgba(P.hot, 0.45));
      g.beginPath();
      g.moveTo(0, tipY + S * 0.095);
      g.lineTo(0, bladeBase - S * 0.02);
      g.lineWidth = w(small ? 0.046 : 0.030);
      g.strokeStyle = rg2;
      g.lineCap = 'round';
      g.stroke();
      // 刃轮廓：近黑 → 左刃白热刃光 → 右刃弱亮边
      path(g, bladePts);
      g.lineWidth = w(small ? 0.072 : 0.050);
      g.strokeStyle = rgba(P.ink, 0.95);
      g.lineJoin = 'miter'; // 枪尖要尖，不用圆角
      g.miterLimit = 3;
      g.stroke();
      g.beginPath();
      g.moveTo(0, tipY + S * 0.035);
      g.lineTo(-halfW * 0.95, wideY + S * 0.01);
      g.lineTo(0, bladeBase - S * 0.025);
      g.lineWidth = w(small ? 0.052 : 0.034);
      g.strokeStyle = rgba(P.hot, 0.96);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.stroke();
      g.beginPath();
      g.moveTo(0, tipY + S * 0.045);
      g.lineTo(halfW * 0.94, wideY + S * 0.01);
      g.lineTo(0, bladeBase - S * 0.03);
      g.lineWidth = w(small ? 0.030 : 0.020);
      g.strokeStyle = rgba(P.rim, 0.72);
      g.stroke();
      // 枪尖白热
      glint(g, 0, tipY + S * 0.042, S * (small ? 0.085 : 0.068), rgba(P.hot, 0.50), 0.95);
    },
  },
};
