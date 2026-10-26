/**
 * bulletArt/knife.js —— EXTRA · 十六夜咲夜：飞刀
 *
 * 造型来源：_sakuya_design/DESIGN.md §2「七色飞刀弹幕」
 *   - 细长刀形子弹，**子弹朝向 = 速度方向**（bullets.js 对 autoSpin 弹型自动按速度对齐，
 *     本地只画「刀尖朝上」，绘制时整体旋转）；
 *   - 刀身是银钢金属高光，**刀刃带同色发光边** —— 七色靠 b.color 换色，剪影一像素不改；
 *   - 拖尾由 bullets.js 的加法层用本体精灵叠加，颜色天然同色，这里不做处理。
 *
 * 小尺寸可读性（判定 r=5、屏幕刀长约 23px）：
 *   钢色只留 35% 明度打底，其余全部让给主题色；刃口三层同色描边 + 白热细线，
 *   保证在红色血月背景上「一眼是刀」，且七色一色一色分得开。
 *
 * 造型：投掷用短刃（双刃 roulette，刀尖 → 刀镡 → 短柄 → 柄头）。
 *   绘制内部再放大 ART_SCALE，让刀比判定圈更长（细长弹幕的观感就是「比判定大」）。
 */
import { B_KNIFE } from './types.js';
import { WHITE, TAU, mix, rgba, mat, softHalo, glint } from './_lib.js';

const ART_SCALE = 1.96;                 // 绘制放大：刀长 ≈ 4.4 × 判定半径（外接 ext 同步放大）
const STEEL_DARK = [22, 30, 42];
const STEEL_MID = [140, 154, 170];
const STEEL_LIGHT = [224, 236, 248];
const GUARD = [96, 80, 62];             // 黄铜刀镡
const GRIP = [24, 26, 32];              // 柄（缠绳）

/** 短刃轮廓（一次闭合：刀尖 → 右刃 → 刀镡 → 柄 → 左背 → 回刀尖） */
function knifePath(g, S) {
  g.beginPath();
  g.moveTo(0, -S * 1.56);                                                       // 刀尖
  g.bezierCurveTo(S * 0.10, -S * 1.28, S * 0.20, -S * 0.70, S * 0.19, -S * 0.20); // 右刃
  g.lineTo(S * 0.12, -S * 0.10);
  g.lineTo(S * 0.30, -S * 0.04);                                                // 刀镡右
  g.lineTo(S * 0.30, S * 0.10);
  g.lineTo(S * 0.09, S * 0.14);
  g.lineTo(S * 0.085, S * 0.80);                                                // 柄右
  g.lineTo(S * 0.15, S * 0.90);                                                 // 柄头右
  g.lineTo(S * 0.12, S * 1.02);
  g.lineTo(-S * 0.12, S * 1.02);
  g.lineTo(-S * 0.15, S * 0.90);
  g.lineTo(-S * 0.085, S * 0.80);
  g.lineTo(-S * 0.09, S * 0.14);
  g.lineTo(-S * 0.30, S * 0.10);
  g.lineTo(-S * 0.30, -S * 0.04);
  g.lineTo(-S * 0.12, -S * 0.10);
  g.bezierCurveTo(-S * 0.20, -S * 0.70, -S * 0.10, -S * 1.28, 0, -S * 1.56);   // 背
  g.closePath();
}

/** 刃口那条线（画同色发光边用；与轮廓右刃同一条曲线） */
function edgePath(g, S) {
  g.beginPath();
  g.moveTo(0, -S * 1.56);
  g.bezierCurveTo(S * 0.10, -S * 1.28, S * 0.20, -S * 0.70, S * 0.19, -S * 0.20);
  g.lineTo(S * 0.12, -S * 0.10);
}

export default {
  [B_KNIFE]: {
    name: '飞刀',
    ext: 3.34,            // 剪影外沿 = 2.8 × size（内部按 ART_SCALE 放大作画）
    autoSpin: true,       // 朝向 = 速度方向
    glowKey: 'steel',
    build(g, size, color) {
      const S = size * ART_SCALE;
      const P = mat(color, 'steel');
      const edge = P.base;                          // 同色发光边 = 主题色本体
      const edgeHot = mix(edge, WHITE, 0.42);

      // 0. 同色柔光：整把刀裹一层自己的颜色，是七色里「一色一色分得开」的第一层保险
      softHalo(g, S * 1.58, edge, 0.46);

      // 1. 轮廓外的同色辉光边（先画在刀身下面，外溢出来就是「发光的刃」）
      knifePath(g, S);
      g.lineWidth = S * 0.30;
      g.lineJoin = 'round';
      g.strokeStyle = rgba(edge, 0.55);
      g.stroke();

      // 2. 刀身：左刀背暗 → 刀身中段开始让位给主题色 → 右刃白热
      knifePath(g, S);
      const bg = g.createLinearGradient(-S * 0.30, 0, S * 0.30, 0);
      bg.addColorStop(0, rgba(mix(STEEL_DARK, P.deep, 0.80), 1));
      bg.addColorStop(0.26, rgba(mix(STEEL_MID, edge, 0.78), 1));
      bg.addColorStop(0.52, rgba(edge, 1));
      bg.addColorStop(0.74, rgba(mix(edge, WHITE, 0.34), 1));
      bg.addColorStop(1, rgba(mix(WHITE, edge, 0.30), 1));
      g.fillStyle = bg;
      g.fill();

      // 3. 整片染色：把钢白压回主题色（远看是一把彩色刀，不是白刀）
      knifePath(g, S);
      g.fillStyle = rgba(edge, 0.34);
      g.fill();

      // 4. 血槽（fuller）：暗线 + 窄高光
      g.save();
      knifePath(g, S);
      g.clip();
      g.beginPath();
      g.moveTo(-S * 0.015, -S * 1.24);
      g.lineTo(-S * 0.015, -S * 0.26);
      g.lineWidth = S * 0.10;
      g.strokeStyle = rgba(mix(STEEL_DARK, P.deep, 0.4), 0.45);
      g.stroke();
      g.beginPath();
      g.moveTo(S * 0.06, -S * 1.16);
      g.lineTo(S * 0.06, -S * 0.30);
      g.lineWidth = S * 0.045;
      g.strokeStyle = rgba(WHITE, 0.5);
      g.stroke();
      g.restore();

      // 5. 刃口：外扩三层同色 + 白热细线（远看就是一道彩色刀锋）
      for (const [w, a] of [[0.52, 0.22], [0.30, 0.46], [0.15, 0.95]]) {
        edgePath(g, S);
        g.lineWidth = S * w;
        g.lineCap = 'round';
        g.strokeStyle = rgba(edge, a);
        g.stroke();
      }
      edgePath(g, S);
      g.lineWidth = S * 0.065;
      g.strokeStyle = rgba(edgeHot, 0.95);
      g.stroke();

      // 6. 刀镡 / 柄（把「这是刀」说清楚）
      g.beginPath();
      g.ellipse(0, S * 0.045, S * 0.31, S * 0.075, 0, 0, TAU);
      g.fillStyle = rgba(mix(edge, GUARD, 0.45), 1);
      g.fill();
      g.lineWidth = S * 0.035;
      g.strokeStyle = rgba(edgeHot, 0.7);
      g.stroke();

      g.fillStyle = rgba(GRIP, 0.97);
      g.fillRect(-S * 0.085, S * 0.14, S * 0.17, S * 0.66);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-S * 0.085, S * (0.22 + i * 0.16));
        g.lineTo(S * 0.085, S * (0.26 + i * 0.16));
        g.lineWidth = S * 0.04;
        g.strokeStyle = rgba(mix(WHITE, edge, 0.5), 0.5);
        g.stroke();
      }
      g.beginPath();
      g.arc(0, S * 0.92, S * 0.085, 0, TAU);
      g.fillStyle = rgba(mix(edge, STEEL_LIGHT, 0.5), 1);
      g.fill();

      // 7. 近黑描边（压住亮背景；色相靠上面几层彩光透出来）+ 刀尖高光
      knifePath(g, S);
      g.lineWidth = S * 0.06;
      g.lineJoin = 'round';
      g.strokeStyle = rgba([10, 14, 22], 0.8);
      g.stroke();

      glint(g, S * 0.02, -S * 1.32, S * 0.22, rgba(edgeHot, 0.85), 0.9);
    },
  },
};
