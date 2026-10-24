/**
 * bulletArt/sakura.js —— 5 面 · 西行寺幽幽子（樱花 / 樱瓣）
 *
 * 主题：五瓣樱花与单片花瓣。
 * 暗夜里先读「形」再读「粉」，所以两种弹型共用同一条视觉策略：
 *   1. 轮廓：花瓣是「瓣基收窄 + 宽端两枚圆角瓣 + 中央浅缺口」的小扇形，瓣间露出夜空 → r5 也认得出是樱；
 *   2. 明度：瓣尖近白（暗背景里的第一眼），瓣根压到洋红，深梅描边锁住剪影；
 *   3. 身份：尖端樱花缺口 + 暖黄花蕊，是 r9 分辨「樱」而不是「星」的两处锚点。
 * 樱瓣是同一支粉的单片花瓣：更瘦长、缺口更浅，整片带一点横向弯（bend），
 * 读成「被风托着落下的一片」，而不是对称的心形图标。
 */
import { B_SAKURA, B_PETAL } from './types.js';
import { WHITE, TAU, mix, rgba, mat, softHalo, glint } from './_lib.js';

/* 幽幽子的粉色阶梯：不直接吃满材质表，保证任何卡面配色下都还是「樱」 */
const PINK_TIP = [255, 246, 252];
const PINK_LIT = [255, 198, 226];
const PINK_MID = [250, 126, 186];
const PINK_DEEP = [198, 44, 122];
const PINK_ROOT = [102, 16, 68];
const STAMEN = [255, 238, 168];
const STAMEN_DEEP = [206, 132, 44];

const STEP = TAU / 5;

/**
 * 花瓣形状参数（单位都是 size）：
 *   hw=半宽, L=瓣基到瓣尖的长度, yBase=瓣基在圆心下方多少,
 *   notch=宽端中央缺口深度（占 L）, bulge=两枚瓣角鼓起的高度（占 L）,
 *   bend=瓣尖横向弯曲量（px）：越靠瓣尖偏移越大，整片微微弯。
 */
function petalBend(sh, y) {
  const b = sh.bend || 0;
  return b * Math.pow(Math.max(0, (sh.yBase - y) / sh.L), 1.7);
}

/** 樱瓣轮廓（宽端朝 -Y，瓣基在 yBase）。 */
function sakuraPetal(g, sh) {
  const { hw, L, yBase } = sh;
  const notch = sh.notch === undefined ? 0.10 : sh.notch;
  const bulge = sh.bulge === undefined ? 0.055 : sh.bulge;
  // 缺口可以偏心（nick），左瓣也可以比右瓣矮（bulgeL）：单片花瓣用偏心缺口破掉心形对称
  const bulgeL = sh.bulgeL === undefined ? bulge : sh.bulgeL;
  const nx = (sh.nick || 0) * hw;
  const yT = yBase - L;          // 宽端两角的高度
  const yN = yT + L * notch;     // 缺口底
  const C = (x1, y1, x2, y2, x, y) =>
    g.bezierCurveTo(x1 + petalBend(sh, y1), y1, x2 + petalBend(sh, y2), y2, x + petalBend(sh, y), y);

  g.beginPath();
  g.moveTo(petalBend(sh, yBase), yBase);
  C(hw * 0.50, yBase - L * 0.16, hw * 0.95, yBase - L * 0.42, hw * 0.99, yBase - L * 0.62);
  C(hw * 1.00, yBase - L * 0.80, hw * 0.96, yBase - L * 0.94, hw * 0.82, yT - L * 0.020);
  // 右瓣：圆顶鼓起（高于两角连线），再落进中央缺口
  C(hw * 0.73, yT - L * bulge * 1.30, hw * 0.55, yT - L * bulge, hw * 0.44, yT - L * bulge);
  C(hw * 0.28, yT - L * bulge * 0.95, hw * 0.10, yN - L * 0.010, nx, yN);
  C(-hw * 0.10, yN - L * 0.010, -hw * 0.28, yT - L * bulgeL * 0.95, -hw * 0.44, yT - L * bulgeL);
  C(-hw * 0.55, yT - L * bulgeL, -hw * 0.73, yT - L * bulgeL * 1.30, -hw * 0.82, yT - L * 0.020);
  C(-hw * 0.96, yBase - L * 0.94, -hw * 1.00, yBase - L * 0.80, -hw * 0.99, yBase - L * 0.62);
  C(-hw * 0.95, yBase - L * 0.42, -hw * 0.50, yBase - L * 0.16, 0, yBase);
  g.closePath();
}

/** 瓣面底色：瓣根深梅 → 中部粉 → 宽端近白（受光方向） */
function petalBody(g, P, sh) {
  const { L, yBase } = sh;
  const yT = yBase - L;
  const grad = g.createLinearGradient(
    petalBend(sh, yBase), yBase, petalBend(sh, yT), yT,
  );
  grad.addColorStop(0, rgba(PINK_ROOT, 1));
  grad.addColorStop(0.18, rgba(PINK_DEEP, 1));
  grad.addColorStop(0.44, rgba(mix(PINK_MID, P.base, 0.35), 1));
  grad.addColorStop(0.70, rgba(mix(PINK_LIT, P.light, 0.40), 1));
  grad.addColorStop(0.88, rgba(mix(P.hi, PINK_TIP, 0.40), 1));
  grad.addColorStop(1, rgba(mix(PINK_TIP, WHITE, 0.55), 1));
  g.fillStyle = grad;
  g.fill();
}

/** 花瓣上的立体处理：左侧受光、右侧压暗、瓣脉、深梅描边 */
function petalSurface(g, S, P, sh, veins) {
  const { hw, L, yBase } = sh;
  g.save();
  sakuraPetal(g, sh);
  g.clip();
  // 侧向明暗：左边是被夜色反衬的一线高光，右边沉下去
  const side = g.createLinearGradient(-hw * 1.05, 0, hw * 1.05, 0);
  side.addColorStop(0, rgba(mix(WHITE, PINK_LIT, 0.45), 0.30));
  side.addColorStop(0.42, rgba(PINK_LIT, 0));
  side.addColorStop(1, rgba(PINK_ROOT, 0.36));
  g.fillStyle = side;
  g.fillRect(-hw * 1.8 - L * 0.3, -L * 1.15, hw * 3.6 + L * 0.6, L * 1.2 + yBase);
  if (veins) {
    // 三条瓣脉：只在放大细节里出现，真实尺寸不添噪点
    g.lineCap = 'round';
    g.strokeStyle = rgba(PINK_DEEP, 0.24);
    g.lineWidth = S * 0.020;
    const vb = petalBend(sh, -L * 0.5);
    g.beginPath();
    g.moveTo(0, -L * 0.08);
    g.lineTo(vb, -L * 0.90);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -L * 0.10);
    g.quadraticCurveTo(-hw * 0.40 + vb * 0.5, -L * 0.44, -hw * 0.34 + vb, -L * 0.78);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -L * 0.10);
    g.quadraticCurveTo(hw * 0.40 + vb * 0.5, -L * 0.44, hw * 0.34 + vb, -L * 0.78);
    g.stroke();
  }
  g.restore();

  // 深梅描边：把粉瓣从弹幕辉光里「切」出来
  sakuraPetal(g, sh);
  g.lineWidth = S * 0.050;
  g.lineJoin = 'round';
  g.strokeStyle = rgba(mix(PINK_ROOT, P.edge, 0.35), 0.90);
  g.stroke();
}

/** 花心：洋红凹坑 + 暖黄花蕊簇（整朵花在弹幕墙里的第二识别点） */
function flowerCore(g, S, P) {
  const pit = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.42);
  pit.addColorStop(0, rgba(mix(PINK_DEEP, PINK_ROOT, 0.45), 0.90));
  pit.addColorStop(0.62, rgba(PINK_DEEP, 0.66));
  pit.addColorStop(1, rgba(PINK_DEEP, 0));
  g.fillStyle = pit;
  g.beginPath();
  g.arc(0, 0, S * 0.42, 0, TAU);
  g.fill();

  // 花丝 + 花药：先画丝，再压花药，成一簇而不是一个黄饼
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * (TAU / 6) + 0.26;
    const r1 = S * (0.30 + (i % 2) * 0.045);
    g.beginPath();
    g.moveTo(Math.cos(a) * S * 0.06, Math.sin(a) * S * 0.06);
    g.quadraticCurveTo(Math.cos(a + 0.16) * S * 0.20, Math.sin(a + 0.16) * S * 0.20,
      Math.cos(a) * r1, Math.sin(a) * r1);
    g.lineWidth = S * 0.030;
    g.strokeStyle = rgba(STAMEN_DEEP, 0.85);
    g.lineCap = 'round';
    g.stroke();
  }

  const core = g.createRadialGradient(-S * 0.03, -S * 0.04, 0, 0, 0, S * 0.24);
  core.addColorStop(0, rgba(mix(STAMEN, WHITE, 0.60), 1));
  core.addColorStop(0.50, rgba(STAMEN, 0.96));
  core.addColorStop(0.82, rgba(STAMEN_DEEP, 0.85));
  core.addColorStop(1, rgba(STAMEN_DEEP, 0));
  g.fillStyle = core;
  g.beginPath();
  g.arc(0, 0, S * 0.24, 0, TAU);
  g.fill();

  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * (TAU / 6) + 0.26;
    const r1 = S * (0.30 + (i % 2) * 0.045);
    g.beginPath();
    g.arc(Math.cos(a) * r1, Math.sin(a) * r1, S * 0.045, 0, TAU);
    g.fillStyle = rgba(mix(STAMEN, WHITE, 0.70), 0.98);
    g.fill();
  }
}

export default {
  [B_SAKURA]: {
    name: '樱花',
    ext: 1.42,
    autoSpin: true,
    glowKey: 'pink',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'pink');
      const sh = { hw: S * 0.49, L: S * 1.32, yBase: S * 0.10, notch: 0.105, bulge: 0.055, bend: 0 };

      // 0. 粉色柔光（只交代「这发弹在发光」，别抢花瓣的形）
      softHalo(g, S * 1.28, mix(P.glow, [255, 150, 205], 0.45), 0.22);

      // 1. 花瓣背衬：比正瓣大 4%，压成深梅色 → 暗背景上一圈干净的剪影边
      for (let i = 0; i < 5; i++) {
        g.save();
        g.rotate(i * STEP);
        g.scale(1.045, 1.045);
        sakuraPetal(g, sh);
        g.fillStyle = rgba(mix(PINK_ROOT, P.deep, 0.35), 0.95);
        g.fill();
        g.restore();
      }

      // 2. 五枚正瓣：各自独立的轮廓，瓣间露出夜空形成五道深缝
      for (let i = 0; i < 5; i++) {
        g.save();
        g.rotate(i * STEP);
        sakuraPetal(g, sh);
        petalBody(g, P, sh);
        petalSurface(g, S, P, sh, true);
        g.restore();
      }

      // 3. 花心
      flowerCore(g, S, P);

      // 4. 左上瓣面的一点高光
      glint(g, -S * 0.34, -S * 0.60, S * 0.28, rgba(mix(WHITE, PINK_LIT, 0.35), 0.50), 0.85);
    },
  },

  [B_PETAL]: {
    name: '樱瓣',
    ext: 1.52,
    autoSpin: true,
    glowKey: 'pink',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'pink');
      // 瘦长 + 浅缺口 + 横向弯：读成「落下来的一片」，不是对称的心形
      const sh = {
        hw: S * 0.40, L: S * 1.62, yBase: S * 0.44,
        notch: 0.060, bulge: 0.042, bulgeL: 0.026, nick: -0.30, bend: -0.16,
      };
      const { hw, L, yBase } = sh;
      const yT = yBase - L;
      const yN = yT + L * sh.notch;

      softHalo(g, S * 1.22, mix(P.glow, [255, 160, 210], 0.42), 0.20);

      // 1. 深梅背衬（比本体大一点，保证真实尺寸下有干净的边）
      g.save();
      g.scale(1.035, 1.035);
      sakuraPetal(g, sh);
      g.fillStyle = rgba(mix(PINK_ROOT, P.deep, 0.30), 0.95);
      g.fill();
      g.restore();

      // 2. 本体
      sakuraPetal(g, sh);
      petalBody(g, P, sh);
      petalSurface(g, S, P, sh, true);

      g.save();
      sakuraPetal(g, sh);
      g.clip();

      // 3. 中央瓣脊：一条纵向的亮带，让「一片花瓣」有折起来的感觉
      const crease = g.createLinearGradient(-hw * 0.40, 0, hw * 0.40, 0);
      crease.addColorStop(0, rgba(WHITE, 0));
      crease.addColorStop(0.5, rgba(WHITE, 0.18));
      crease.addColorStop(1, rgba(WHITE, 0));
      g.fillStyle = crease;
      g.fillRect(-hw * 0.45 - L * 0.08, yT, hw * 0.9, L);

      // 4. 缺口内侧的暖白高光：真实尺寸下靠这一点把两枚瓣角分开
      const nx = petalBend(sh, yN) + (sh.nick || 0) * hw;
      const ng = g.createRadialGradient(nx, yN, 0, nx, yN, L * 0.24);
      ng.addColorStop(0, rgba(mix(WHITE, PINK_TIP, 0.3), 0.80));
      ng.addColorStop(0.45, rgba(PINK_TIP, 0.26));
      ng.addColorStop(1, rgba(PINK_TIP, 0));
      g.fillStyle = ng;
      g.fillRect(-hw * 2, yT - L * 0.06, hw * 4, L * 0.36);

      // 5. 瓣基的收窄暗部（花瓣是从这里被摘下来的）
      const foot = g.createRadialGradient(0, yBase, 0, 0, yBase, S * 0.40);
      foot.addColorStop(0, rgba(PINK_ROOT, 0.62));
      foot.addColorStop(1, rgba(PINK_ROOT, 0));
      g.fillStyle = foot;
      g.beginPath();
      g.arc(0, yBase, S * 0.40, 0, TAU);
      g.fill();
      g.restore();

      // 6. 瓣基的小花梗（一片花瓣的「根」）
      g.beginPath();
      g.moveTo(-S * 0.040, yBase + S * 0.040);
      g.lineTo(0, yBase - S * 0.10);
      g.lineTo(S * 0.040, yBase + S * 0.040);
      g.closePath();
      g.fillStyle = rgba(PINK_ROOT, 0.75);
      g.fill();

      // 7. 斜向亮痕 + 左上高光
      g.save();
      sakuraPetal(g, sh);
      g.clip();
      const vb = petalBend(sh, -L * 0.55);
      const shg = g.createLinearGradient(-hw * 0.7 + vb * 0.4, -L * 0.95, hw * 0.5 + vb, -L * 0.15);
      shg.addColorStop(0, rgba(WHITE, 0.24));
      shg.addColorStop(0.45, rgba(WHITE, 0.02));
      shg.addColorStop(1, rgba(WHITE, 0));
      g.fillStyle = shg;
      g.fillRect(-hw * 1.6 - L * 0.3, yBase - L * 1.1, hw * 3.2 + L * 0.6, L * 1.2);
      g.restore();

      glint(g, -hw * 0.34 + petalBend(sh, -L * 0.62), -L * 0.62, S * 0.17, rgba(WHITE, 0.30), 0.85);
    },
  },
};
