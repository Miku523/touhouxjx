/**
 * bulletArt/dark.js —— 1 面 · 露米娅（月之暗面 / 黑暗吞噬）
 *
 * 主题：近黑的月体 + 本卡色系的受光刃。暗部带冷紫环境色，不能用中性灰，
 * 否则在夜色背景里糊成一块。两枚弹型共用同一套「暗底 + 单侧受光」口径，
 * 让整张符卡的弹幕看起来像同一族。
 *
 * 配色跟着卡走（PAL.rumia 的 bright/dark/moon 三种弹同型不同色）：
 *   先在卡色相上把饱和度拉起来（粉紫一类的浅色原色也能出「亮弹幕」），
 *   再按原色亮度分档（亮弹满档、暗弹压到 ~0.5），
 *   这样「亮面月牙」与「暗面月牙」在夜里一眼能分开，而不是都糊成一团深红。
 *
 * 5 月牙：暗面必须「平」——亮暗之间是硬阴影，不是球面渐变；
 *         受光面是 0.5R 宽的弓（小尺寸读到的是「亮月牙 + 黑盘」，
 *         而不是「一颗有高光的暗球」）。
 * 6 吞噬暗球：血色日冕 → 带断口的吸积絮旋进视界 → 偏心的黑核 + 一侧被压亮的环。
 *         断口与偏心是关键：连成整圈、正中的螺旋会读成「同心圆 / 眼睛」。
 */
import { B_CRESCENT, B_DARKORB } from './types.js';
import {
  WHITE, TAU, mix, rgba, mat, softHalo, glint, hash01, clamp, lerp,
  hexToRgb, rgbToHsl, hslToRgb,
} from './_lib.js';

const VOID = [7, 2, 11];         // 近黑（带紫，别用中性黑）

/* ============================================================
   本卡色 → 打光口径
   ============================================================ */

/** 亮度乘档（越界夹住，免得暗弹被抬成亮弹、亮弹过曝） */
function tone(c, k) {
  return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
}

/**
 * 由原色派生的打光色：
 *   1) 保色相、把饱和度拉到 0.86 以上 —— 卡色若是 #c9a6ff 这类浅粉紫，
 *      直接画出来是一层灰蒙蒙的粉，小尺寸等于没有；
 *   2) 明度夹在 0.36~0.60，保证「亮弹」亮得起来、「暗弹」沉得下去；
 *   3) 档位 k 由原色亮度算（mat() 已经把三色归一化，档位只能从原色拿）。
 */
function palette(color) {
  const P = mat(color, 'dark');
  const raw = hexToRgb(color);
  const v = Math.max(raw[0], raw[1], raw[2]) / 255;
  const k = clamp(0.36 + v * 0.78, 0.50, 1.05);
  const hsl = rgbToHsl(mix(P.hi, raw, 0.22));
  const limb0 = tone(hslToRgb(hsl.h, Math.max(hsl.s, 0.88), clamp(hsl.l * 1.04, 0.38, 0.60)), k);
  /* 暗弹补偿：卡色本身接近黑（如 #3a0a16）时，受光面按 k 会一起沉进夜空，
     剪影就没了。用 lift 把「亮段的暗端」往 limb 拉回来，亮弹 lift≈0 不受影响。 */
  const lift = clamp((0.92 - k) * 1.55, 0, 0.46);
  const hot = mix(limb0, WHITE, 0.60);               // 刃口白热（只用在极窄的边上）
  const limb = mix(limb0, hot, lift * 0.30);         // 受光面主色（暗弹被抬一点）
  const mid = mix(tone(mix(limb0, P.shade, 0.34), 0.74), limb, lift);
  const deep = mix(tone(mix(P.deep, P.shade, 0.28), Math.max(k, 0.70)), limb, lift * 0.72);
  return {
    P,
    k,
    lift,
    limb,                                            // 受光面主色（饱和版）
    hot,
    mid,
    deep,
    face: mix(P.edge, [30, 14, 44], 0.34),           // 暗面（近黑，别做成紫球）
    faceDim: mix(P.edge, [10, 4, 17], 0.50),
    rim: mix(P.deep, [96, 78, 132], 0.50),           // 暗面的冷边（交代剪影，别跳出卡色系）
    glow: mix(P.glow, limb, 0.45),
  };
}

/* ============================================================
   本地画笔工具（只在本模块用）
   ============================================================ */

/**
 * 月牙路径：外圆 (0,0,R) 减掉内圆 (d,0,r)，开口朝 +x（右）。
 * 弓宽 = R + d - r；宽度一旦超过 0.62R 就连月牙都算不上了。
 */
function crescentPath(g, R, r, d) {
  const x = (d * d + R * R - r * r) / (2 * d);
  const y = Math.sqrt(Math.max(0, R * R - x * x));
  const a = Math.atan2(y, x);        // 外圆上的交点角
  const b = Math.atan2(y, x - d);    // 内圆上的交点角
  g.beginPath();
  g.arc(0, 0, R, a, TAU - a, false);  // 沿外圆绕左侧一大段
  g.arc(d, 0, r, TAU - b, b, true);   // 沿内圆绕回来（缺口那一侧）
  g.closePath();
}

/** 两端渐隐的弧光：切成小段描，alpha 按 sin 包络两端收掉（避免硬切口） */
function arcFade(g, cx, cy, R, a0, a1, w, color, aMax = 0.92, segs = 20) {
  const prevCap = g.lineCap;
  g.lineCap = 'butt';
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const al = aMax * Math.pow(Math.sin(Math.PI * (t0 + t1) * 0.5), 0.75);
    if (al <= 0.004) continue;
    g.beginPath();
    g.lineWidth = w;
    g.strokeStyle = rgba(color, al);
    g.arc(cx, cy, R, a0 + (a1 - a0) * t0, a0 + (a1 - a0) * t1);
    g.stroke();
  }
  g.lineCap = prevCap;
}

/**
 * 渐细的带子：沿切线两侧各偏半个宽度拼成闭合带（用渐变填充才像「流」）。
 * taper=true 时两端收成尖，像被拉断的絮。
 */
function ribbon(g, pts, w0, w1, taper = false) {
  const n = pts.length;
  const A = [];
  const B = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q0 = pts[Math.max(0, i - 1)];
    const q1 = pts[Math.min(n - 1, i + 1)];
    let tx = q1[0] - q0[0];
    let ty = q1[1] - q0[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const t = i / (n - 1);
    const env = taper ? Math.pow(Math.sin(Math.PI * t), 0.55) : 1;
    const w = lerp(w0, w1, t) * 0.5 * env;
    A.push([p[0] - ty * w, p[1] + tx * w]);
    B.push([p[0] + ty * w, p[1] - tx * w]);
  }
  g.beginPath();
  g.moveTo(A[0][0], A[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(A[i][0], A[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(B[i][0], B[i][1]);
  g.closePath();
}

/** 取对数螺旋上 [t0,t1] 的一段（t 越大越靠里） */
function spiralRun(a0, turns, rOut, rIn, t0, t1, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = lerp(t0, t1, i / n);
    const rho = rOut + (rIn - rOut) * Math.pow(t, 1.30);
    const th = a0 + turns * TAU * t;
    pts.push([Math.cos(th) * rho, Math.sin(th) * rho]);
  }
  return pts;
}

export default {
  /* ==========================================================
     5 · 月牙（暗月盘 + 本卡色受光弓）
     ========================================================== */
  [B_CRESCENT]: {
    name: '月牙',
    ext: 1.34,
    autoSpin: true,      // 让月牙随 spin 自转，摆出「月相轮转」的感觉
    glowKey: 'dark',
    build(g, size, color) {
      const S = size;
      const R = S * 1.22;
      const C = palette(color);
      const small = S < 6.5;
      const IR = R * 0.93;                    // 内圆半径
      const ID = R * (small ? 0.47 : 0.44);   // 内圆偏移（开口朝 +x）→ 弓宽 0.51R

      /* 1. 偏心雾：光只朝受光面那一侧铺，观感才是「这一边被照亮」 */
      g.save();
      g.translate(-R * 0.20, -R * 0.04);
      softHalo(g, R * 0.96, C.glow, small ? 0.30 : 0.24);
      g.restore();

      /* 2. 暗面：整颗月球，但必须是「平」的——球面渐变一出来就变成紫球 */
      const face = g.createRadialGradient(-R * 0.26, -R * 0.30, R * 0.05, 0, 0, R * 1.02);
      face.addColorStop(0, rgba(C.face, 1));
      face.addColorStop(0.62, rgba(C.faceDim, 1));
      face.addColorStop(1, rgba(mix(VOID, C.faceDim, 0.55), 1));
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.fillStyle = face;
      g.fill();

      g.save();
      g.beginPath();
      g.arc(0, 0, R * 0.985, 0, TAU);
      g.clip();

      /* 3. 极淡的地球反照：只在明暗界线内侧渗一点，够交代「暗面不是空的」就行 */
      const es = g.createRadialGradient(-R * 0.60, 0, R * 0.06, -R * 0.44, 0, R * 0.98);
      es.addColorStop(0, rgba(mix(C.P.deep, [104, 74, 142], 0.62), 0.16));
      es.addColorStop(0.55, rgba(mix(C.P.deep, [62, 40, 92], 0.55), 0.06));
      es.addColorStop(1, rgba(C.P.deep, 0));
      g.fillStyle = es;
      g.fillRect(-R, -R, R * 2, R * 2);

      /* 3b. 月海：极淡软斑（小尺寸省掉，免得糊成脏块） */
      if (!small) {
        const MARIA = [
          [0.40, -0.28, 0.28, 0.18, -0.50, 0.16],
          [0.50, 0.22, 0.22, 0.12, 0.40, 0.13],
          [0.26, 0.54, 0.26, 0.11, 0.10, 0.10],
        ];
        for (const [mx, my, rx, ry, rot, a] of MARIA) {
          g.beginPath();
          g.ellipse(mx * R, my * R, rx * R, ry * R, rot, 0, TAU);
          g.fillStyle = rgba([3, 1, 7], a);
          g.fill();
        }
      }
      g.restore();

      /* 2b. 背光侧的冷边：夜空里暗盘只剩这道冷光能交代剪影（压得很淡，别读成环光） */
      arcFade(g, 0, 0, R * 0.950, -1.15, 1.15, S * (small ? 0.09 : 0.06),
        mix(C.limb, C.rim, 0.55), 0.30, 14);

      /* 4. 受光弓：裁到月牙里，横截面「外侧热 → 中部饱和卡色 → 内侧深色」 */
      crescentPath(g, R, IR, ID);
      g.save();
      g.clip();

      const lit = g.createLinearGradient(-R * 1.02, 0, ID - IR, 0);
      lit.addColorStop(0.00, rgba(mix(C.hot, WHITE, 0.30), 1));
      lit.addColorStop(0.11, rgba(mix(C.limb, C.hot, 0.35), 1));
      lit.addColorStop(0.40, rgba(mix(C.limb, C.hot, 0.16), 1));
      lit.addColorStop(0.66, rgba(mix(C.limb, C.mid, 0.55), 1));
      lit.addColorStop(0.84, rgba(mix(C.mid, C.limb, C.lift * 0.55), 1));
      lit.addColorStop(1.00, rgba(mix(C.deep, C.limb, C.lift * 0.70), 1));
      g.fillStyle = lit;
      g.fillRect(-R * 1.1, -R * 1.1, R * 2.2, R * 2.2);

      /* 4b. 上下方向的明暗：光从左上来，下端的角要沉下去 */
      const vsh = g.createLinearGradient(0, -R, 0, R);
      vsh.addColorStop(0, rgba(WHITE, 0.07));
      vsh.addColorStop(0.34, rgba(WHITE, 0));
      vsh.addColorStop(0.70, rgba(VOID, 0.14));
      vsh.addColorStop(1, rgba(VOID, 0.28));
      g.fillStyle = vsh;
      g.fillRect(-R, -R, R * 2, R * 2);
      g.restore();

      /* 4c. 外侧刃光：只走受光的那段弧，两端收掉 → 弯月的「锋」 */
      arcFade(g, 0, 0, R * 0.956, 1.30, 4.98, S * 0.050,
        mix(C.hot, WHITE, 0.16), small ? 1.0 : 0.88, 26);

      /* 4d. 明暗界线：亮暗之间是一条硬阴影，弓才不像「球上的一片亮」 */
      arcFade(g, ID, 0, IR * 0.985, 2.06, 4.22, S * (small ? 0.10 : 0.065),
        mix(C.faceDim, VOID, 0.45), 0.92, 16);

      /* 4e. 亮弓里的一粒热反光（月体不是纯色块） */
      if (!small) {
        g.beginPath();
        g.ellipse(-R * 0.72, -R * 0.46, R * 0.10, R * 0.19, 0.50, 0, TAU);
        g.fillStyle = rgba(mix(C.hot, WHITE, 0.35), 0.34);
        g.fill();
      }

      /* 5. 弓面上的小高光（和火星方向一致） */
      glint(g, -R * 0.83, -R * 0.40, S * 0.17, rgba(mix(C.hot, WHITE, 0.20), 0.50), 0.85);
    },
  },

  /* ==========================================================
     6 · 吞噬暗球（吸积漩涡 + 视界黑核）
     ========================================================== */
  [B_DARKORB]: {
    name: '吞噬暗球',
    ext: 1.30,
    autoSpin: true,
    glowKey: 'dark',
    build(g, size, color) {
      const S = size;
      const R = S * 1.14;
      const C = palette(color);
      const small = S < 6.5;
      const CORE = R * 0.30;           // 视界半径
      const HX = -R * 0.05;            // 黑核偏心（正中会读成瞳子）
      const HY = -R * 0.06;

      /* 1. 血色日冕：柔光晕打底，球才不闷在黑里 */
      softHalo(g, R * 0.94, C.glow, small ? 0.28 : 0.22);

      /* 2. 盘面：近黑底盘（漩涡要落在一个黑盘上才「吞」得住光） */
      const disc = g.createRadialGradient(HX, HY, CORE * 0.6, 0, 0, R * 0.96);
      disc.addColorStop(0, rgba(VOID, 1));
      disc.addColorStop(0.45, rgba(mix(VOID, C.P.edge, 0.55), 1));
      disc.addColorStop(0.84, rgba(mix(VOID, C.P.deep, 0.26), 1));
      disc.addColorStop(1, rgba(mix(VOID, C.P.deep, 0.14), 1));
      g.beginPath();
      g.arc(0, 0, R * 0.96, 0, TAU);
      g.fillStyle = disc;
      g.fill();

      /* 3. 吸积絮的笔：中段最亮（越靠视界越热），外缘与洞口都淡下去 */
      const ARM = mix(C.limb, C.hot, C.lift * 0.95);   // 暗弹：臂要提亮才看得见「吸积」
      const armGrad = g.createRadialGradient(HX, HY, 0, HX, HY, R * 0.96);
      armGrad.addColorStop(0.00, rgba(ARM, 0));
      armGrad.addColorStop(0.18, rgba(ARM, 0.12));
      armGrad.addColorStop(0.38, rgba(ARM, 0.78 + C.lift * 0.28));
      armGrad.addColorStop(0.56, rgba(mix(ARM, C.hot, 0.50), 1));
      armGrad.addColorStop(0.76, rgba(ARM, 0.72 + C.lift * 0.20));
      armGrad.addColorStop(0.92, rgba(ARM, 0.22));
      armGrad.addColorStop(1.00, rgba(ARM, 0));

      g.save();
      g.beginPath();
      g.arc(0, 0, R * 0.96, 0, TAU);
      g.clip();

      const TURNS = small ? 1.10 : 1.30;
      // 断口是重点：连成整圈的螺旋会读成「同心圆 / 眼睛」
      const BREAKS = small
        ? [[0.05, 0.56], [0.66, 0.97]]
        : [[0.03, 0.50], [0.60, 0.97]];
      for (let k = 0; k < 2; k++) {
        const a0 = -1.02 + k * Math.PI;
        for (const [t0, t1] of BREAKS) {
          g.fillStyle = armGrad;
          ribbon(g, spiralRun(a0, TURNS, R * 0.95, CORE * 1.02, t0, t1, 18),
            S * (k === 0 ? 0.235 : 0.155), S * 0.030, true);
          g.fill();
        }
        /* 3b. 臂芯：内半段一条更细更亮的芯，小尺寸靠它保住「螺旋」的形 */
        g.fillStyle = rgba(mix(C.hot, WHITE, 0.14), small ? 0.66 : 0.50);
        ribbon(g, spiralRun(a0, TURNS, R * 0.78, CORE * 1.18, 0.34, 0.68, 12),
          S * 0.062, S * 0.018, true);
        g.fill();
      }

      /* 3c. 洞口外两圈紧窄的轨道弧：交代「一圈圈被卷进去」的速度 */
      arcFade(g, HX, HY, CORE * 1.52, -2.60, -0.20, S * 0.045, mix(C.hot, C.limb, 0.45), 0.55, 12);
      arcFade(g, HX, HY, CORE * 2.10, 0.40, 2.30, S * 0.035, mix(C.limb, C.mid, 0.50), 0.34, 10);

      /* 3d. 反向的碎屑带：交代盘有厚度，别只有两根线 */
      if (!small) {
        g.fillStyle = rgba(mix(C.limb, C.deep, 0.50), 0.24);
        ribbon(g, spiralRun(2.20, 0.62, R * 0.92, R * 0.58, 0.06, 0.92, 14),
          S * 0.080, S * 0.030, true);
        g.fill();
      }
      g.restore();

      /* 4. 视界：先羽化吃掉臂的光，再压一颗实心黑核 */
      const hz = g.createRadialGradient(HX, HY, CORE * 0.66, HX, HY, CORE * 1.24);
      hz.addColorStop(0, rgba([0, 0, 0], 1));
      hz.addColorStop(0.60, rgba([0, 0, 0], 1));
      hz.addColorStop(1, rgba([0, 0, 0], 0));
      g.beginPath();
      g.arc(HX, HY, CORE * 1.24, 0, TAU);
      g.fillStyle = hz;
      g.fill();
      g.beginPath();
      g.arc(HX, HY, CORE * 0.92, 0, TAU);
      g.fillStyle = rgba([0, 0, 0], 1);
      g.fill();

      /* 5. 光子环：左上一侧被压亮压厚（相对论集束），右下只剩细细一道 */
      arcFade(g, HX, HY, CORE * 1.06, -2.80, 0.42, S * 0.082,
        mix(C.hot, WHITE, 0.34), 0.96, 20);
      arcFade(g, HX, HY, CORE * 1.05, 0.70, 2.00, S * 0.034,
        mix(C.limb, WHITE, 0.10), 0.30, 12);

      /* 6. 外缘：亮在上左、暗在下右，而且不许连成整圈（连成圈就成行星环了） */
      arcFade(g, 0, 0, R * 0.940, -2.66, -0.46, S * 0.080,
        mix(C.limb, C.hot, 0.40), 0.62, 16);
      arcFade(g, 0, 0, R * 0.940, 0.66, 2.26, S * 0.045,
        mix(C.limb, C.deep, 0.55), 0.24, 12);

      /* 7. 被吸进去的碎光：位置由 hash01 定（确定性），贴着臂的方向走 */
      const motes = small ? 3 : 5;
      for (let i = 0; i < motes; i++) {
        const t = 0.22 + 0.66 * hash01(i * 17 + 3);
        const arm = i % 2;
        const th = -1.02 + arm * Math.PI + TURNS * TAU * t;
        const rho = lerp(R * 0.95, CORE * 1.02, Math.pow(t, 1.30));
        const a = 0.24 + 0.40 * hash01(i * 43 + 11);
        glint(g, Math.cos(th) * rho, Math.sin(th) * rho,
          S * (0.045 + 0.045 * hash01(i * 29 + 7)),
          rgba(mix(C.hot, WHITE, 0.14), a), a);
      }
    },
  },
};
