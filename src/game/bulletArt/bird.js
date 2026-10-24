/**
 * bulletArt/bird.js —— 6 面 · 蓬莱山辉夜「燕之子安贝」「蓬莱的玉枝」
 *
 * 主题：燕与枝。
 *  · 燕尾贝：立起来的扇贝——壳顶尖、腹宽、底缘剪成一对朝外张开的燕尾叉，
 *    放射肋 + 同心生长弧给出「贝」的网格，叉口内缘一条亮线保证 r=5 还认得出剪刀口。
 *    没有眼睛、没有横向翼，靠剪影和叉口读「贝」。
 *  · 玉枝：金属感亮金枝干（左侧白热反光带 + 右侧暗面 + 深棕硬描边）+ 翡翠叶 + 玉珠，
 *    先保证金枝在夜空里看得见，再让玉叶错落。
 */
import { B_SWALLOW, B_BRANCH } from './types.js';
import {
  WHITE, TAU, mix, rgba, mat, path, softHalo, glint,
} from './_lib.js';

const JADE = [110, 235, 168];
const GOLD = [255, 226, 140];

/** 燕尾贝轮廓：壳顶尖 → 扇面张开 → 收腰 → 一对长而外张的燕尾叉（中央深凹口） */
function shellPath(g, S) {
  g.beginPath();
  g.moveTo(0, -S * 1.20);
  g.bezierCurveTo(S * 0.30, -S * 1.12, S * 0.58, -S * 0.76, S * 0.70, -S * 0.28);
  g.bezierCurveTo(S * 0.77, S * 0.04, S * 0.82, S * 0.40, S * 0.84, S * 0.68);
  g.bezierCurveTo(S * 0.86, S * 0.94, S * 0.86, S * 1.04, S * 0.86, S * 1.10);
  g.bezierCurveTo(S * 0.60, S * 0.98, S * 0.34, S * 0.70, S * 0.22, S * 0.44);
  g.bezierCurveTo(S * 0.15, S * 0.29, S * 0.07, S * 0.15, 0, S * 0.02);
  g.bezierCurveTo(-S * 0.07, S * 0.15, -S * 0.15, S * 0.29, -S * 0.22, S * 0.44);
  g.bezierCurveTo(-S * 0.34, S * 0.70, -S * 0.60, S * 0.98, -S * 0.86, S * 1.10);
  g.bezierCurveTo(-S * 0.86, S * 1.04, -S * 0.86, S * 0.94, -S * 0.84, S * 0.68);
  g.bezierCurveTo(-S * 0.82, S * 0.40, -S * 0.77, S * 0.04, -S * 0.70, -S * 0.28);
  g.bezierCurveTo(-S * 0.58, -S * 0.76, -S * 0.30, -S * 1.12, 0, -S * 1.20);
  g.closePath();
}

/** 三次贝塞尔取样 */
function bez(p, t) {
  const u = 1 - t;
  return [
    u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
    u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
  ];
}

/** 沿贝塞尔生成的锥形枝干多边形；返回左右两侧折线（供高光用） */
function taperPath(g, ctrl, w0, w1, n = 14) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = bez(ctrl, t);
    const pa = bez(ctrl, Math.max(0, t - 0.02));
    const pb = bez(ctrl, Math.min(1, t + 0.02));
    let dx = pb[0] - pa[0], dy = pb[1] - pa[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const w = (w0 + (w1 - w0) * t) * 0.5;
    L.push([p[0] - dy * w, p[1] + dx * w]);
    R.push([p[0] + dy * w, p[1] - dx * w]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  return { L, R };
}

export default {
  [B_SWALLOW]: {
    name: '燕尾贝',
    ext: 1.52,
    autoSpin: true,
    glowKey: 'cold',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'cold');

      softHalo(g, S * 1.34, mix(P.glow, [150, 240, 255], 0.5), 0.22);

      // 1. 底色：壳顶珠白 → 腹青 → 燕尾深蓝
      shellPath(g, S);
      const bg = g.createLinearGradient(0, -S * 1.22, 0, S * 1.16);
      bg.addColorStop(0, rgba(mix(P.hi, WHITE, 0.60), 1));
      bg.addColorStop(0.24, rgba(mix(P.base, [200, 244, 255], 0.42), 1));
      bg.addColorStop(0.58, rgba(mix(P.base, [40, 116, 158], 0.40), 1));
      bg.addColorStop(1, rgba(mix(P.deep, [6, 26, 50], 0.55), 1));
      g.fillStyle = bg;
      g.fill();

      g.save();
      shellPath(g, S);
      g.clip();

      // 2. 放射肋：从壳顶张开的楔形明暗（扇贝的骨，缩到 r=5 就是这道纹理）
      const apex = [0, -S * 0.96];
      const N = 7, A0 = -1.14, A1 = 1.14;
      const dir = (a) => [apex[0] + Math.sin(a) * S * 2.8, apex[1] + Math.cos(a) * S * 2.8];
      for (let i = 0; i < N; i++) {
        const p1 = dir(A0 + ((A1 - A0) * i) / N);
        const p2 = dir(A0 + ((A1 - A0) * (i + 1)) / N);
        path(g, [apex, p1, p2]);
        g.fillStyle = i % 2 ? rgba(WHITE, 0.15) : rgba([6, 30, 54], 0.18);
        g.fill();
      }
      g.lineWidth = S * 0.024;
      for (let i = 0; i <= N; i++) {
        const p = dir(A0 + ((A1 - A0) * i) / N);
        g.beginPath();
        g.moveTo(apex[0], apex[1]);
        g.lineTo(p[0], p[1]);
        g.strokeStyle = i % 2 ? rgba(mix(WHITE, P.hi, 0.4), 0.42) : rgba([4, 22, 44], 0.38);
        g.stroke();
      }
      // 3. 同心生长弧（把扇面切成层）
      for (const rr of [0.42, 0.70, 0.98, 1.26]) {
        g.beginPath();
        g.arc(apex[0], apex[1], S * rr, 0, TAU);
        g.lineWidth = S * 0.040;
        g.strokeStyle = rgba(mix(WHITE, [190, 244, 255], 0.35), 0.34);
        g.stroke();
        g.beginPath();
        g.arc(apex[0], apex[1], S * (rr + 0.055), 0, TAU);
        g.lineWidth = S * 0.030;
        g.strokeStyle = rgba([4, 20, 40], 0.34);
        g.stroke();
      }

      // 4. 珠光：一道斜向虹彩
      const ir = g.createLinearGradient(-S * 0.9, S * 0.7, S * 0.8, -S * 0.8);
      ir.addColorStop(0, rgba([120, 255, 210], 0));
      ir.addColorStop(0.40, rgba([140, 255, 220], 0.18));
      ir.addColorStop(0.62, rgba([255, 190, 240], 0.15));
      ir.addColorStop(1, rgba([255, 230, 180], 0));
      g.fillStyle = ir;
      g.fillRect(-S * 1.5, -S * 1.5, S * 3, S * 3);

      // 5. 叉口内缘亮线（r=5 时靠这一条读出「燕尾」）
      g.beginPath();
      g.moveTo(S * 0.86, S * 1.08);
      g.bezierCurveTo(S * 0.60, S * 0.97, S * 0.34, S * 0.70, S * 0.22, S * 0.44);
      g.bezierCurveTo(-S * 0.07, S * 0.15, -S * 0.15, S * 0.29, -S * 0.22, S * 0.44);
      g.bezierCurveTo(-S * 0.34, S * 0.70, -S * 0.60, S * 0.97, -S * 0.86, S * 1.08);
      g.lineWidth = S * 0.058;
      g.strokeStyle = rgba(mix(WHITE, P.hi, 0.30), 0.72);
      g.lineCap = 'round';
      g.stroke();

      // 5b. 尾叉压暗（尾巴是壳的一部分，不能亮成两条腿）
      const tg = g.createLinearGradient(0, S * 0.10, 0, S * 1.14);
      tg.addColorStop(0, rgba([8, 34, 56], 0));
      tg.addColorStop(0.55, rgba([8, 34, 56], 0.30));
      tg.addColorStop(1, rgba([4, 20, 38], 0.58));
      g.fillStyle = tg;
      g.fillRect(-S * 1.2, S * 0.05, S * 2.4, S * 1.2);

      // 6. 边缘压暗 → 有厚度
      const vg = g.createRadialGradient(0, -S * 0.10, S * 0.34, 0, S * 0.05, S * 1.24);
      vg.addColorStop(0, rgba([10, 40, 70], 0));
      vg.addColorStop(1, rgba([4, 16, 34], 0.50));
      g.fillStyle = vg;
      g.fillRect(-S * 1.5, -S * 1.5, S * 3, S * 3);
      g.restore();

      // 6b. 壳口：叉口顶点的铰合齿（这一点点「齿」就把「蝠鲼」拉回「贝」）
      g.beginPath();
      g.ellipse(0, S * 0.14, S * 0.15, S * 0.10, 0, 0, TAU);
      g.fillStyle = rgba([8, 44, 70], 0.85);
      g.fill();
      g.lineWidth = S * 0.022;
      g.strokeStyle = rgba(mix(WHITE, P.hi, 0.4), 0.55);
      g.stroke();
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(i * S * 0.075, S * 0.10);
        g.lineTo(i * S * 0.075, S * 0.20);
        g.lineWidth = S * 0.026;
        g.strokeStyle = rgba(mix(WHITE, [180, 240, 255], 0.3), 0.75);
        g.lineCap = 'round';
        g.stroke();
      }

      // 7. 壳顶螺塔（贝壳的「出生点」）
      g.beginPath();
      g.arc(-S * 0.01, -S * 0.99, S * 0.12, 0.45, Math.PI * 1.95);
      g.lineWidth = S * 0.034;
      g.strokeStyle = rgba(WHITE, 0.60);
      g.stroke();
      g.beginPath();
      g.arc(-S * 0.01, -S * 0.99, S * 0.055, 0.6, Math.PI * 2.0);
      g.lineWidth = S * 0.026;
      g.strokeStyle = rgba(WHITE, 0.45);
      g.stroke();

      // 8. 硬边 + 左上受光棱
      shellPath(g, S);
      g.lineWidth = S * 0.080;
      g.strokeStyle = rgba([6, 24, 44], 0.90);
      g.lineJoin = 'round';
      g.stroke();
      g.beginPath();
      g.moveTo(-S * 0.06, -S * 1.16);
      g.bezierCurveTo(-S * 0.56, -S * 0.92, -S * 0.74, -S * 0.44, -S * 0.72, -S * 0.16);
      g.lineWidth = S * 0.062;
      g.strokeStyle = rgba(mix(WHITE, P.hi, 0.30), 0.85);
      g.lineCap = 'round';
      g.stroke();

      glint(g, -S * 0.26, -S * 0.54, S * 0.18, rgba(WHITE, 0.70), 0.95);
      glint(g, -S * 0.62, S * 0.22, S * 0.12, rgba(mix(WHITE, [150, 240, 255], 0.4), 0.45), 0.7);
    },
  },

  [B_BRANCH]: {
    name: '玉枝',
    ext: 1.50,
    autoSpin: true,
    glowKey: 'jade',
    build(g, size, color) {
      const S = size;
      const P = mat(color, 'jade');

      softHalo(g, S * 1.32, mix(JADE, GOLD, 0.40), 0.22);

      // 1. 金属金渐变（沿枝干方向铺，但真正给「金属」的是左右两道棱）
      const goldRamp = (x0, y0, x1, y1) => {
        const gg = g.createLinearGradient(x0 * S, y0 * S, x1 * S, y1 * S);
        gg.addColorStop(0, rgba([255, 246, 198], 1));
        gg.addColorStop(0.28, rgba([255, 213, 96], 1));
        gg.addColorStop(0.62, rgba([222, 156, 44], 1));
        gg.addColorStop(1, rgba([112, 64, 6], 1));
        return gg;
      };

      const branch = (ctrl, w0, w1, gx0, gy0, gx1, gy1) => {
        const pts = ctrl.map(([x, y]) => [x * S, y * S]);
        const side = taperPath(g, pts, w0 * S, w1 * S);
        g.fillStyle = goldRamp(gx0, gy0, gx1, gy1);
        g.fill();

        g.save();
        taperPath(g, pts, w0 * S, w1 * S);
        g.clip();
        g.lineCap = 'round';
        // 左缘白热反光带
        g.beginPath();
        g.moveTo(side.L[0][0], side.L[0][1]);
        for (let i = 1; i < side.L.length; i++) g.lineTo(side.L[i][0], side.L[i][1]);
        g.lineWidth = S * 0.085;
        g.strokeStyle = rgba([255, 250, 224], 0.72);
        g.stroke();
        // 右缘暗面
        g.beginPath();
        g.moveTo(side.R[0][0], side.R[0][1]);
        for (let i = 1; i < side.R.length; i++) g.lineTo(side.R[i][0], side.R[i][1]);
        g.lineWidth = S * 0.14;
        g.strokeStyle = rgba([96, 52, 4], 0.55);
        g.stroke();
        g.restore();

        // 深棕硬描边
        taperPath(g, pts, w0 * S, w1 * S);
        g.lineWidth = S * 0.050;
        g.strokeStyle = rgba([44, 24, 2], 0.92);
        g.lineJoin = 'round';
        g.stroke();
      };

      // 2. 主干 + 顶部分叉 + 一根侧枝
      branch([[0.02, 1.26], [0.30, 0.80], [0.19, -0.04], [-0.04, -0.66]], 0.30, 0.115, 0.45, -1.2, -0.30, 1.2);
      branch([[0.02, -0.44], [-0.12, -0.62], [-0.30, -0.76], [-0.48, -0.86]], 0.125, 0.045, 0.2, -0.9, -0.5, -0.3);
      branch([[0.05, -0.38], [0.20, -0.56], [0.36, -0.70], [0.52, -0.80]], 0.125, 0.045, 0.6, -0.5, 0.2, -0.9);
      branch([[0.16, 0.30], [-0.06, 0.34], [-0.32, 0.20], [-0.54, 0.00]], 0.135, 0.045, 0.2, -0.2, -0.6, 0.4);

      // 3. 翡翠叶：尖长、有主脉和两道侧脉
      const leaf = (x, y, rot, len) => {
        g.save();
        g.translate(x * S, y * S);
        g.rotate(rot);
        const L2 = len * S;
        const w = L2 * 0.42;
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(w * 0.95, -L2 * 0.24, w * 0.78, -L2 * 0.74, 0, -L2);
        g.bezierCurveTo(-w * 0.78, -L2 * 0.74, -w * 0.95, -L2 * 0.24, 0, 0);
        g.closePath();
        const lg = g.createLinearGradient(-w, 0, w * 0.7, -L2);
        lg.addColorStop(0, rgba(mix(P.base, JADE, 0.30), 1));
        lg.addColorStop(0.30, rgba(mix(P.base, [44, 172, 118], 0.55), 1));
        lg.addColorStop(0.74, rgba(mix(P.base, [14, 108, 76], 0.78), 1));
        lg.addColorStop(1, rgba([5, 56, 40], 1));
        g.fillStyle = lg;
        g.fill();
        g.lineWidth = S * 0.050;
        g.strokeStyle = rgba([4, 40, 28], 0.90);
        g.stroke();
        // 主脉
        g.beginPath();
        g.moveTo(0, -L2 * 0.04);
        g.lineTo(0, -L2 * 0.90);
        g.lineWidth = S * 0.028;
        g.strokeStyle = rgba(mix(WHITE, JADE, 0.45), 0.78);
        g.stroke();
        // 侧脉
        g.lineWidth = S * 0.018;
        g.strokeStyle = rgba(mix(WHITE, JADE, 0.55), 0.45);
        for (const t of [0.32, 0.54]) {
          g.beginPath();
          g.moveTo(0, -L2 * t);
          g.lineTo(w * 0.60, -L2 * (t + 0.17));
          g.moveTo(0, -L2 * t);
          g.lineTo(-w * 0.60, -L2 * (t + 0.17));
          g.stroke();
        }
        g.restore();
      };
      leaf(-0.50, -0.88, -0.72, 0.56);
      leaf(0.54, -0.82, 0.53, 0.52);
      leaf(-0.56, 0.02, -1.34, 0.50);
      leaf(0.34, 0.00, 0.98, 0.44);
      leaf(-0.18, 0.60, -1.02, 0.38);

      // 4. 玉珠（玉枝的「玉」）
      const bead = (x, y, r) => {
        const cx = x * S, cy = y * S, rr = r * S;
        const jg = g.createRadialGradient(cx - rr * 0.36, cy - rr * 0.42, rr * 0.05, cx, cy, rr * 1.05);
        jg.addColorStop(0, rgba(mix(WHITE, JADE, 0.16), 1));
        jg.addColorStop(0.40, rgba(mix(JADE, P.base, 0.35), 1));
        jg.addColorStop(0.82, rgba(mix(P.base, [18, 96, 66], 0.60), 1));
        jg.addColorStop(1, rgba([6, 48, 34], 1));
        g.beginPath();
        g.arc(cx, cy, rr, 0, TAU);
        g.fillStyle = jg;
        g.fill();
        g.lineWidth = S * 0.048;
        g.strokeStyle = rgba([4, 30, 20], 0.88);
        g.stroke();
        // 弧面高光
        g.beginPath();
        g.ellipse(cx - rr * 0.34, cy - rr * 0.40, rr * 0.36, rr * 0.21, -0.7, 0, TAU);
        g.fillStyle = rgba(WHITE, 0.55);
        g.fill();
      };
      bead(-0.02, -0.84, 0.170);
      bead(0.22, -0.68, 0.115);
      bead(-0.30, -0.72, 0.082);

      // 5. 枝头一点星芒（宝光）
      g.save();
      g.translate(-0.02 * S, -0.80 * S);
      for (let i = 0; i < 4; i++) {
        g.rotate(Math.PI / 2);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(S * (i % 2 ? 0.05 : 0.07), -S * 0.40);
        g.lineTo(0, -S * 0.18);
        g.closePath();
        g.fillStyle = rgba(mix(WHITE, GOLD, 0.35), 0.60);
        g.fill();
      }
      g.restore();

      // 6. 金枝上的两点反光
      glint(g, -S * 0.10, S * 0.60, S * 0.14, rgba(WHITE, 0.55), 0.55);
      glint(g, S * 0.34, -S * 0.22, S * 0.10, rgba(mix(WHITE, GOLD, 0.4), 0.55), 0.5);
    },
  },
};
