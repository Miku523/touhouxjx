/**
 * bulletArt/bug.js —— 2 面 · 莉格露（萤火虫现象 / 小虫风暴 / 萤火虫之夜）
 *
 * 主题：暗色鞘翅 + 自发光的腹节。
 * 夜景里虫类弹不靠「亮身体」被认出来，而是靠「集中一个发光点 + 暗剪影 + 亮边」，
 * 所以两种弹型共用一套口径：
 *   1) 虫体压暗（鞘翅近黑带橄榄环境色），靠亮缘线与描边把剪影钉住；
 *   2) 光只放在该放的地方（萤火虫 = 腹部尾灯；小虫 = 复眼与甲壳高光）；
 *   3) 8 条腿 / 触角用「亮于虫体的橄榄色」而不是近黑，否则深色夜空里直接消失。
 */
import { B_FIREFLY, B_BUG } from './types.js';
import {
  WHITE, TAU, mix, rgba, mat, path, outline, litRim, softHalo, glint, clamp,
} from './_lib.js';

const GLOW = [214, 255, 118];      // 萤火黄绿
const GLOW_DEEP = [120, 210, 60];
const LANT_HOT = [248, 255, 216];  // 尾灯白热芯
const CHITIN = [10, 14, 4];        // 鞘翅暗部（带橄榄环境色，不用中性灰）
const LEG = [150, 178, 84];        // 腿/触角（比虫体亮，才看得见）

/** 右半边轮廓 → 镜像成闭合多边形（点数够多，小尺寸下也是圆滑的剪影） */
function mirrored(half) {
  const out = half.slice();
  for (let i = half.length - 2; i >= 1; i--) out.push([-half[i][0], half[i][1]]);
  return out;
}

function scalePts(pts, k) {
  return pts.map((p) => [p[0] * k, p[1] * k]);
}

/* 萤火虫虫体：头 -1.04、尾 +1.06，肩最宽 0.31，尾端收尖（单位 size） */
const FIREFLY_HALF = [
  [0.000, -1.040], [0.090, -1.030], [0.150, -0.990], [0.185, -0.930],
  [0.190, -0.865], [0.170, -0.800], [0.220, -0.760], [0.268, -0.700],
  [0.292, -0.620], [0.305, -0.480], [0.312, -0.240], [0.312, 0.000],
  [0.310, 0.220], [0.300, 0.440], [0.278, 0.640], [0.238, 0.800],
  [0.178, 0.922], [0.108, 1.010], [0.052, 1.058], [0.000, 1.066],
];

/** 小虫甲壳：俯视椭圆，头端（-y）收窄一点，尾端圆 */
function shellPts(S, n = 30) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    const ry = s < 0 ? 0.82 : 0.88;
    const rx = 0.50 * (1 - 0.20 * Math.pow(Math.max(0, -s), 1.4));
    p.push([c * rx * S, s * ry * S]);
  }
  return p;
}

/** 一条两段式虫腿（股节 + 胫节），亮色描，末端带一小节 */
function leg(g, S, s, y0, reach, w) {
  const ax = s * S * 0.42, ay = S * y0;
  const kx = s * S * (0.42 + reach * 0.55), ky = ay - S * 0.15;
  const fx = s * S * (0.42 + reach), fy = ay + S * 0.11;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(kx, ky);
  g.lineTo(fx, fy);
  g.lineWidth = w;
  g.strokeStyle = rgba(LEG, 0.92);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
  // 关节：一个小亮点，让「有腿」在小尺寸也成立
  g.beginPath();
  g.arc(kx, ky, w * 0.62, 0, TAU);
  g.fillStyle = rgba(mix(LEG, WHITE, 0.45), 0.95);
  g.fill();
}

export default {
  [B_FIREFLY]: {
    name: '萤火虫',
    ext: 1.42,
    autoSpin: false,     // 有明确朝向（头朝前），不吃 rot
    glowKey: 'bug',
    build(g, size, color) {
      const S = size;
      const small = S < 6.5;
      const P = mat(color, 'bug');

      const body = scalePts(mirrored(FIREFLY_HALF), S);
      const bodyMid = mix(P.shade, CHITIN, 0.52);            // 鞘翅中间调（压暗，亮只留给尾灯）
      const bodyDark = mix(P.deep, [4, 6, 2], 0.55);         // 暗面
      const shellHi = mix(P.hi, GLOW, 0.30);                 // 受光亮边
      const lant = mix(GLOW, P.hi, 0.16);                    // 尾灯主色（跟着卡色偏一点）

      /* 1. 尾灯光晕：偏心到腹部 → 一眼看出「亮点在屁股上」 */
      g.save();
      g.translate(0, S * 0.52);
      softHalo(g, S * 0.88, lant, small ? 0.30 : 0.36);
      g.restore();

      /* 2. 薄翅：半透明长翅，压在虫体后面（翅脉只有一道，别织网） */
      for (const s of [-1, 1]) {
        g.save();
        g.translate(s * S * 0.20, -S * 0.30);
        g.rotate(s * 0.95);
        g.beginPath();
        g.ellipse(0, -S * 0.12, S * 0.160, S * 0.66, 0, 0, TAU);
        const wg = g.createLinearGradient(0, -S * 0.60, 0, S * 0.64);
        wg.addColorStop(0, rgba(mix(P.hi, GLOW, 0.62), small ? 0.30 : 0.42));
        wg.addColorStop(0.55, rgba(mix(P.hi, GLOW, 0.40), 0.20));
        wg.addColorStop(1, rgba(mix(P.shade, GLOW_DEEP, 0.30), 0.06));
        g.fillStyle = wg;
        g.fill();
        g.lineWidth = S * 0.042;
        g.strokeStyle = rgba(mix(P.hi, WHITE, 0.30), 0.46);
        g.stroke();
        // 翅的外缘压一圈暗线：翅是「膜」，不是又一片叶子
        g.lineWidth = S * 0.022;
        g.strokeStyle = rgba(mix(CHITIN, [30, 46, 14], 0.55), 0.45);
        g.stroke();
        if (!small) {
          g.beginPath();
          g.moveTo(0, -S * 0.44);
          g.quadraticCurveTo(s * S * 0.055, S * 0.04, 0, S * 0.50);
          g.lineWidth = S * 0.026;
          g.strokeStyle = rgba(mix(P.hi, WHITE, 0.35), 0.40);
          g.stroke();
        }
        g.restore();
      }

      /* 3. 虫体：横向渐变（左受光 / 右入暗）→ 圆柱体积 */
      const bg = g.createLinearGradient(-S * 0.36, -S * 0.30, S * 0.36, S * 0.34);
      bg.addColorStop(0, rgba(mix(bodyMid, shellHi, 0.42), 1));
      bg.addColorStop(0.24, rgba(bodyMid, 1));
      bg.addColorStop(0.66, rgba(bodyDark, 1));
      bg.addColorStop(1, rgba(mix(bodyDark, CHITIN, 0.62), 1));
      path(g, body);
      g.fillStyle = bg;
      g.fill();

      /* 4. 鞘翅内部：上身压暗 → 缝线 → 尾灯（灯只准亮在腹部） */
      g.save();
      path(g, body);
      g.clip();

      // 4a. 上身再压一层暗（暗鞘翅是「萤火」这个母题的另一半）
      const up = g.createLinearGradient(0, -S * 0.66, 0, S * 0.30);
      up.addColorStop(0, rgba(CHITIN, 0.42));
      up.addColorStop(0.62, rgba(CHITIN, 0.32));
      up.addColorStop(1, rgba(CHITIN, 0.05));
      g.fillStyle = up;
      g.fillRect(-S * 0.5, -S * 1.2, S, S * 1.52);

      // 4b. 鞘翅中缝（暗线 + 左缘一道细受光）
      g.beginPath();
      g.moveTo(0, -S * 0.60);
      g.lineTo(0, S * 0.16);
      g.lineWidth = S * 0.030;
      g.strokeStyle = rgba(mix(CHITIN, [40, 34, 10], 0.30), 0.55);
      g.stroke();
      g.beginPath();
      g.moveTo(-S * 0.20, -S * 0.56);
      g.quadraticCurveTo(-S * 0.28, -S * 0.18, -S * 0.25, S * 0.10);
      g.lineWidth = S * 0.045;
      g.strokeStyle = rgba(mix(shellHi, WHITE, 0.30), 0.26);
      g.stroke();

      // 4c. 尾灯：二次裁到腹部，越靠尾端越白热
      g.save();
      g.beginPath();
      g.rect(-S * 0.5, S * 0.13, S, S * 1.0);
      g.clip();
      const lg = g.createRadialGradient(0, S * 0.60, 0, 0, S * 0.60, S * 0.62);
      lg.addColorStop(0.00, rgba(LANT_HOT, 1));
      lg.addColorStop(0.30, rgba(lant, 1));
      lg.addColorStop(0.62, rgba(mix(lant, GLOW_DEEP, 0.45), 0.82));
      lg.addColorStop(1.00, rgba(GLOW_DEEP, 0));
      g.fillStyle = lg;
      g.fillRect(-S * 0.42, S * 0.10, S * 0.84, S * 1.10);
      // 腹节分割线：光从节缝里透出来
      for (let i = 0; i < 2; i++) {
        const y = S * (0.44 + i * 0.205);
        g.beginPath();
        g.moveTo(-S * 0.34, y);
        g.quadraticCurveTo(0, y + S * 0.05, S * 0.34, y);
        g.lineWidth = S * (small ? 0.045 : 0.030);
        g.strokeStyle = rgba(mix(CHITIN, [60, 50, 16], 0.40), 0.55);
        g.stroke();
      }
      g.restore();
      g.restore();

      /* 5. 前胸背板：肩上一块受光的硬壳，把「头」和「腹」分开 */
      g.beginPath();
      g.ellipse(0, -S * 0.615, S * 0.268, S * 0.115, 0, 0, TAU);
      const pg = g.createLinearGradient(-S * 0.24, -S * 0.72, S * 0.24, -S * 0.50);
      pg.addColorStop(0, rgba(mix(bodyMid, shellHi, 0.72), 1));
      pg.addColorStop(0.55, rgba(mix(bodyMid, bodyDark, 0.35), 1));
      pg.addColorStop(1, rgba(bodyDark, 1));
      g.fillStyle = pg;
      g.fill();
      g.beginPath();
      g.ellipse(0, -S * 0.615, S * 0.268, S * 0.115, 0, Math.PI * 1.06, Math.PI * 1.94);
      g.lineWidth = S * 0.030;
      g.strokeStyle = rgba(mix(shellHi, WHITE, 0.45), 0.70);
      g.stroke();

      /* 6. 头部：一小块暗壳 + 复眼 + 触角（触角是萤火虫的第二识别点） */
      g.beginPath();
      g.ellipse(0, -S * 0.925, S * 0.145, S * 0.115, 0, 0, TAU);
      g.fillStyle = rgba(mix(bodyDark, CHITIN, 0.55), 1);
      g.fill();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * S * 0.085, -S * 0.985);
        g.quadraticCurveTo(s * S * 0.24, -S * 1.16, s * S * 0.315, -S * 1.245);
        g.lineWidth = S * (small ? 0.055 : 0.036);
        g.strokeStyle = rgba(mix(LEG, WHITE, 0.28), 0.80);
        g.lineCap = 'round';
        g.stroke();
        g.beginPath();
        g.arc(s * S * 0.315, -S * 1.245, S * (small ? 0.055 : 0.042), 0, TAU);
        g.fillStyle = rgba(mix(LANT_HOT, WHITE, 0.35), 0.85);
        g.fill();
        // 复眼
        g.beginPath();
        g.arc(s * S * 0.078, -S * 0.945, S * (small ? 0.070 : 0.055), 0, TAU);
        g.fillStyle = rgba(mix(EYE_HI(), lant, 0.35), 0.92);
        g.fill();
      }

      /* 7. 收口：近黑描边钉住剪影，再补一道左上受光缘线 */
      outline(g, body, { edge: mix(CHITIN, [2, 3, 1], 0.45) }, S * (small ? 0.10 : 0.082));
      litRim(g, body, { hi: mix(shellHi, WHITE, 0.30) }, S * (small ? 0.075 : 0.058), 0.90);

      /* 8. 尾灯的最后一粒高光（灯芯） */
      glint(g, 0, S * 0.60, S * 0.26, rgba(mix(LANT_HOT, lant, 0.30), 0.85), 0.95);
    },
  },

  [B_BUG]: {
    name: '小虫',
    ext: 1.34,
    autoSpin: true,
    glowKey: 'bug',
    build(g, size, color) {
      const S = size;
      const small = S < 6.5;
      const P = mat(color, 'bug');

      const shell = shellPts(S);
      const bodyMid = mix(P.shade, [26, 34, 10], 0.30);
      const bodyDark = mix(P.deep, CHITIN, 0.40);
      const shellHi = mix(P.hi, [255, 240, 150], 0.30);
      const legCol = mix(mix(LEG, [86, 104, 46], 0.50), P.hi, 0.16);   // 亮但不刺眼的橄榄


      /* 1. 背光晕：很淡，只用来把弹体从夜空里「托」起来 */
      softHalo(g, S * 1.10, mix(GLOW_DEEP, [40, 30, 10], 0.35), 0.16);

      /* 2. 六足：亮橄榄色（比虫体亮），三段两折，压在甲壳下面 */
      for (let i = 0; i < 3; i++) {
        const y0 = -0.36 + i * 0.38;
        for (const s of [-1, 1]) {
          const ax = s * S * 0.40, ay = S * y0;
          const kx = s * S * (small ? 60 : 62) / 100, ky = ay - S * 0.17;
          const fx = s * S * (small ? 68 : 74) / 100, fy = ay + S * 0.12;
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(kx, ky);
          g.lineTo(fx, fy);
          g.lineCap = 'round';
          g.lineJoin = 'round';
          // 暗底衬：让亮腿和背后的辉光分开（否则腿糊成一团光斑）
          g.lineWidth = S * (small ? 0.115 : 0.098);
          g.strokeStyle = rgba(mix(CHITIN, [24, 30, 10], 0.50), 0.92);
          g.stroke();
          g.lineWidth = S * (small ? 0.072 : 0.058);
          g.strokeStyle = rgba(legCol, 0.90);
          g.stroke();
          g.beginPath();
          g.arc(kx, ky, S * (small ? 0.042 : 0.032), 0, TAU);
          g.fillStyle = rgba(mix(legCol, WHITE, 0.35), 0.90);
          g.fill();
        }
      }

      /* 3. 甲壳：左上受光 → 右下入暗 */
      const cg = g.createLinearGradient(-S * 0.46, -S * 0.72, S * 0.48, S * 0.80);
      cg.addColorStop(0.00, rgba(mix(shellHi, WHITE, 0.18), 1));
      cg.addColorStop(0.30, rgba(mix(bodyMid, shellHi, 0.40), 1));
      cg.addColorStop(0.66, rgba(bodyMid, 1));
      cg.addColorStop(1.00, rgba(mix(bodyDark, CHITIN, 0.45), 1));
      path(g, shell);
      g.fillStyle = cg;
      g.fill();

      /* 4. 鞘翅细节（裁在甲壳内）：中缝 + 两片分色 + 上部横刻纹 */
      g.save();
      path(g, shell);
      g.clip();
      // 中缝：暗线 + 左侧一条细受光线 → 两片鞘翅分开
      g.beginPath();
      g.moveTo(0, -S * 0.80);
      g.lineTo(0, S * 0.90);
      g.lineWidth = S * 0.070;
      g.strokeStyle = rgba(mix(CHITIN, [10, 16, 4], 0.40), 0.88);
      g.stroke();
      g.beginPath();
      g.moveTo(S * 0.045, -S * 0.74);
      g.lineTo(S * 0.045, S * 0.62);
      g.lineWidth = S * 0.028;
      g.strokeStyle = rgba(mix(shellHi, WHITE, 0.25), 0.42);
      g.stroke();
      // 右半片压暗：两片受光不同，体积就出来了
      const half = g.createLinearGradient(0, -S * 0.7, S * 0.55, S * 0.7);
      half.addColorStop(0, rgba(CHITIN, 0.08));
      half.addColorStop(1, rgba(CHITIN, 0.52));
      g.fillStyle = half;
      g.fillRect(0, -S, S * 0.6, S * 2);
      // 横向刻纹（只在鞘翅上半，小尺寸省略）
      if (!small) {
        for (let i = 0; i < 3; i++) {
          const y = S * (-0.30 + i * 0.34);
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(s * S * 0.055, y);
            g.quadraticCurveTo(s * S * 0.26, y - S * 0.05, s * S * 0.44, y + S * 0.03);
            g.lineWidth = S * 0.024;
            g.strokeStyle = rgba(mix(CHITIN, [70, 60, 20], 0.35), 0.40);
            g.stroke();
          }
        }
      }
      // 甲壳高光：左上一条拉长的反光
      const sp = g.createRadialGradient(-S * 0.22, -S * 0.36, 0, -S * 0.22, -S * 0.36, S * 0.46);
      sp.addColorStop(0, rgba(mix(WHITE, shellHi, 0.30), 0.55));
      sp.addColorStop(1, rgba(WHITE, 0));
      g.fillStyle = sp;
      g.fillRect(-S * 0.8, -S * 0.9, S * 1.0, S * 1.2);
      g.restore();

      /* 5. 头部：暗壳 + 复眼（复眼是小尺寸下的第二识别点）+ 触角 */
      g.beginPath();
      g.ellipse(0, -S * 0.80, S * 0.285, S * 0.215, 0, 0, TAU);
      const hg = g.createLinearGradient(-S * 0.2, -S * 0.98, S * 0.2, -S * 0.62);
      hg.addColorStop(0, rgba(mix(bodyMid, shellHi, 0.30), 1));
      hg.addColorStop(1, rgba(mix(bodyDark, CHITIN, 0.35), 1));
      g.fillStyle = hg;
      g.fill();
      for (const s of [-1, 1]) {
        // 触角
        g.beginPath();
        g.moveTo(s * S * 0.14, -S * 0.92);
        g.quadraticCurveTo(s * S * 0.36, -S * 1.06, s * S * 0.50, -S * 1.10);
        g.lineWidth = S * (small ? 0.062 : 0.046);
        g.strokeStyle = rgba(mix(legCol, CHITIN, 0.28), 0.90);
        g.lineCap = 'round';
        g.stroke();
        // 复眼：暗眼窝托着一粒亮（不然只是两颗白点）
        g.beginPath();
        g.arc(s * S * 0.135, -S * 0.845, S * (small ? 0.098 : 0.080), 0, TAU);
        g.fillStyle = rgba(mix(CHITIN, [10, 14, 4], 0.30), 0.85);
        g.fill();
        g.beginPath();
        g.arc(s * S * 0.135, -S * 0.845, S * (small ? 0.066 : 0.053), 0, TAU);
        g.fillStyle = rgba(mix([236, 255, 236], GLOW, 0.35), 0.92);
        g.fill();
        g.beginPath();
        g.arc(s * S * 0.115, -S * 0.862, S * (small ? 0.028 : 0.022), 0, TAU);
        g.fillStyle = rgba(WHITE, 0.85);
        g.fill();
      }
      // 前胸背板：头与鞘翅之间一道暗带 + 受光顶边（甲虫的「项」）
      g.beginPath();
      g.moveTo(-S * 0.27, -S * 0.66);
      g.quadraticCurveTo(0, -S * 0.58, S * 0.27, -S * 0.66);
      g.lineWidth = S * 0.075;
      g.strokeStyle = rgba(mix(bodyDark, CHITIN, 0.45), 0.85);
      g.stroke();
      g.beginPath();
      g.moveTo(-S * 0.20, -S * 0.665);
      g.quadraticCurveTo(0, -S * 0.605, S * 0.20, -S * 0.665);
      g.lineWidth = S * 0.030;
      g.strokeStyle = rgba(mix(shellHi, WHITE, 0.30), 0.42);
      g.stroke();
      // 上颚：头前一对短尖，别让头部读成圆球
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * S * 0.10, -S * 0.98);
        g.lineTo(s * S * 0.19, -S * 1.055);
        g.lineTo(s * S * 0.055, -S * 1.045);
        g.closePath();
        g.fillStyle = rgba(mix(bodyDark, CHITIN, 0.30), 0.95);
        g.fill();
      }

      /* 6. 收口：近黑描边 + 左上受光缘线（剪影与体积） */
      outline(g, shell, { edge: mix(CHITIN, [2, 3, 1], 0.50) }, S * (small ? 0.105 : 0.085));
      litRim(g, shell, { hi: mix(shellHi, WHITE, 0.35) }, S * (small ? 0.080 : 0.062), 0.92);
      // 尾端鞘翅的收尖（卵形 → 甲虫，不是叶子）
      g.beginPath();
      g.moveTo(-S * 0.070, S * 0.775);
      g.lineTo(0, S * 0.905);
      g.lineTo(S * 0.070, S * 0.775);
      g.lineWidth = S * 0.034;
      g.strokeStyle = rgba(mix(CHITIN, [120, 104, 40], 0.35), 0.85);
      g.stroke();

      /* 7. 甲壳上的白热小光点（和螢火同族的高光语言） */
      glint(g, -S * 0.20, -S * 0.34, S * (small ? 0.26 : 0.22), rgba(mix(WHITE, shellHi, 0.35), 0.60), 0.9);
    },
  },
};

/** 复眼/口器用的一点冷白（包一层避免和主题色抢） */
function EYE_HI() {
  return [236, 255, 236];
}
