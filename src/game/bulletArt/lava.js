/**
 * bulletArt/lava.js —— EXTRA 关底 · 芙兰朵露：熔岩（雷瓦汀 / 不剩一人 / 吸血鬼之宴 / 破坏之瞳）
 *
 * 主题：被捏碎的岩浆球——暗红硬壳 + 从内部透出的白热裂纹（细分叉、越外越细）
 * + 边缘冷壳亮线 + 少量飞溅火星。中心留白热内核。
 *
 * 实战可读性：暗红壳压边，白热裂纹与内核负责在暗红城堡底发光，
 * 近黑轮廓与冷壳亮线负责在亮红月面上不糊。所有点位由 hash01 派生，确定性。
 */
import { B_LAVA } from './types.js';
import { WHITE, TAU, mix, rgba, hexToRgb, softHalo, hotCore, glint, hash01 } from './_lib.js';

/* 口径色（和传入 color 混合，逐卡配色不丢） */
const EMBER = [255, 138, 48];   // 橙红热体
const CRIMSON = [255, 77, 106]; // 外层透出的血红
const SHELL = [46, 5, 10];      // 硬壳深酒红
const EDGE = [12, 1, 4];        // 近黑轮廓

function palette(color) {
  const src = hexToRgb(color);
  const body = mix(EMBER, src, 0.28);
  return {
    src,
    body,
    hot: mix(WHITE, body, 0.10),
    heat: mix(body, WHITE, 0.55),
    hotline: mix(WHITE, body, 0.22),
    crackGlow: mix(body, [255, 74, 18], 0.34),
    shell: mix(SHELL, src, 0.18),
    shellEdge: mix(SHELL, EDGE, 0.50),
    plate: mix(SHELL, body, 0.12),
    plateLit: mix(SHELL, body, 0.30),
    crackSlot: mix(SHELL, EDGE, 0.62),
    edge: mix(EDGE, src, 0.06),
    rim: mix([255, 226, 233], body, 0.26),
    glow: mix(body, CRIMSON, 0.32),
  };
}

function poly(g, pts, fill) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

function seg(g, a, b, w, color) {
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.lineWidth = w;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.stroke();
}

/** 在给定起点 / 朝向下折出一条毛边裂纹，返回世界坐标点列 */
function crackPts(x0, y0, a0, seed, n, len, jitter) {
  let a = a0;
  const pts = [[x0, y0]];
  const step = len / (n - 1);
  for (let i = 1; i < n; i++) {
    a += (hash01(seed * 31 + i * 7) - 0.5) * jitter;
    const p = pts[i - 1];
    pts.push([p[0] + Math.cos(a) * step, p[1] + Math.sin(a) * step]);
  }
  return pts;
}

/** 把一条折线压成段：宽度沿路径递减，靠外的段不再给白芯 */
function pushCrack(list, pts, w0, coreFrac) {
  const n = pts.length;
  for (let i = 1; i < n; i++) {
    const t = (i - 1) / Math.max(1, n - 1);
    const w = Math.max(0.14, w0 * Math.pow(1 - t, 1.75));
    list.push({ a: pts[i - 1], b: pts[i], w, core: coreFrac > 0 && t < coreFrac });
  }
}

/** 四层叠出「从内部透出来」的裂缝：暗槽 / 橙红晕 / 白热 / 白芯 */
function paintCracks(g, P, list, small) {
  const line = small ? mix(P.heat, P.body, 0.35) : P.hotline;
  for (const s of list) seg(g, s.a, s.b, Math.max(0.34, s.w * 1.35), rgba(P.crackSlot, 0.72));
  for (const s of list) seg(g, s.a, s.b, Math.max(0.34, s.w * 1.48), rgba(P.crackGlow, small ? 0.85 : 0.70));
  for (const s of list) seg(g, s.a, s.b, Math.max(0.22, s.w * 0.55), rgba(line, 0.96));
  if (!small) for (const s of list) if (s.core) seg(g, s.a, s.b, Math.max(0.16, s.w * 0.30), rgba(WHITE, 0.94));
}

/** 一条主裂 + 两处分叉 + 分叉上的细毛边（越靠外越细） */
function growCrack(list, R, seed, a0, len, wMax) {
  const main = crackPts(0, 0, a0, seed, 10, R * len, 0.72);
  pushCrack(list, main, wMax, 0.62);

  const forks = [[2, 0.62], [4, -0.58], [6, 0.70]];
  for (const [idx, spread] of forks) {
    const p = main[idx];
    const q = main[idx + 1];
    const baseAng = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const fl = R * len * (0.30 + hash01(seed * 7 + idx) * 0.16);
    const fpts = crackPts(p[0], p[1], baseAng + spread + (hash01(seed * 11 + idx) - 0.5) * 0.4,
      seed * 17 + idx, 6, fl, 0.95);
    const fw = Math.max(0.20, wMax * 0.36);
    pushCrack(list, fpts, fw, 0);

    /* 分叉再分一根小毛刺，让「细分叉」在 ×3 下看得见 */
    if (idx !== 4) {
      const q2 = fpts[2];
      const q3 = fpts[3];
      const ba = Math.atan2(q3[1] - q2[1], q3[0] - q2[0]);
      const g2 = crackPts(q2[0], q2[1], ba + (hash01(seed * 23 + idx) - 0.5) * 0.9,
        seed * 29 + idx, 4, fl * 0.55, 0.9);
      pushCrack(list, g2, fw * 0.58, 0);
    }
  }
}

export default {
  [B_LAVA]: {
    name: '熔岩',
    ext: 1.40,
    autoSpin: true,
    glowKey: 'flame',
    build(g, size, color) {
      const S = size;
      const P = palette(color);
      const R = S * 0.88;
      const small = S <= 8.5;   // r<=8 只保留能读出「暗壳 + 橙心」的大结构
      const ov = Math.max(0.8, S * 0.055);

      softHalo(g, S * 1.05, mix(P.glow, CRIMSON, 0.26), 0.20);

      /* 1) 暗红硬壳底（先钉死剪影与暗边） */
      const bg = g.createRadialGradient(-R * 0.12, -R * 0.14, 0, 0, 0, R);
      bg.addColorStop(0, rgba(mix(P.shell, P.body, 0.12), 1));
      bg.addColorStop(0.70, rgba(P.shell, 1));
      bg.addColorStop(1, rgba(mix(P.shell, P.edge, 0.58), 1));
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.fillStyle = bg;
      g.fill();

      /* 2) 内部熔浆：中心白热 → 橙红 → 暗壳，只从壳缝和裂纹里透出来 */
      const ig = g.createRadialGradient(-R * 0.05, -R * 0.07, 0, 0, 0, R * 0.92);
      ig.addColorStop(0, rgba(WHITE, 1));
      ig.addColorStop(0.10, rgba(P.hot, 1));
      ig.addColorStop(0.26, rgba(P.heat, 0.98));
      ig.addColorStop(0.48, rgba(P.body, 0.92));
      ig.addColorStop(0.72, rgba(mix(P.body, P.shell, 0.55), 0.72));
      ig.addColorStop(1, rgba(P.shell, 0));
      g.fillStyle = ig;
      g.beginPath();
      g.arc(0, 0, R * 0.92, 0, TAU);
      g.fill();

      /* 3) 硬壳板：外缘贴边、内缘毛糙，板缝透出内部热光；每块板的边都带折点，
            避免直边多边形看起来像沙滩球 */
      for (let i = 0; i < 6; i++) {
        const seed = i * 13 + 2;
        const aC = (i / 6) * TAU + 0.18 + hash01(seed) * 0.22;
        const halfA = 0.38 + hash01(seed + 1) * 0.09;
        const r0 = R * (0.46 + hash01(seed + 2) * 0.12);
        const r1 = R * (0.972 + hash01(seed + 3) * 0.018);
        const pts = [];
        const steps = 5;
        for (let k = 0; k <= steps; k++) {
          const a = aC - halfA + (2 * halfA) * (k / steps);
          const rr = r1 * (1 - 0.016 * hash01(seed + 10 + k));
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        /* 右侧裂缝边：两个带折点的中间点，边缘不直 */
        for (let k = 1; k >= 0; k--) {
          const f = k * 0.5 + 0.25;
          const a = aC + halfA - 0.10 * f + (hash01(seed + 30 + k) - 0.5) * 0.16 * f;
          const rr = r1 + (r0 - r1) * f + (hash01(seed + 35 + k) - 0.5) * R * 0.07;
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        for (let k = steps; k >= 0; k--) {
          const a = aC - halfA + (2 * halfA) * (k / steps);
          const rr = r0 * (0.88 + 0.26 * hash01(seed + 20 + k));
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        for (let k = 0; k < 2; k++) {
          const f = 0.75 - k * 0.5;
          const a = aC - halfA + 0.10 * f + (hash01(seed + 40 + k) - 0.5) * 0.16 * f;
          const rr = r1 + (r0 - r1) * f + (hash01(seed + 45 + k) - 0.5) * R * 0.07;
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
        }
        const warm = 0.10 + 0.20 * hash01(seed + 5);
        poly(g, pts, rgba(mix(P.plate, P.plateLit, warm), 0.93));
        /* 板缘一细线暖光：让壳有厚度（×3 才看得到，真实尺寸靠整体明暗） */
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
        g.closePath();
        g.lineWidth = Math.max(0.26, S * 0.011);
        g.strokeStyle = rgba(mix(P.body, P.heat, 0.35), 0.14);
        g.stroke();
      }

      /* 4) 裂纹：六条主裂从内核向外，细分叉、越外越细 */
      const wMax = Math.max(small ? 0.82 : 0.70, S * 0.062);
      const base = 0.70;
      const list = [];
      for (let i = 0; i < 7; i++) {
        const a0 = base + (i / 7) * TAU + (hash01(i * 5.3 + 1.7) - 0.5) * 0.30;
        const len = 0.60 + hash01(i * 2.9 + 3.1) * 0.32;
        growCrack(list, R, i * 3 + 1, a0, len, wMax);
      }
      g.save();
      g.beginPath();
      g.arc(0, 0, R * 0.965, 0, TAU);
      g.clip();
      paintCracks(g, P, list, small);
      g.restore();

      /* 5) 白热内核（裂纹都从这里长出去） */
      if (small) {
        /* 小尺寸：白核会缩成一枚「金币高光」，换成偏橙的熔心，才像烧红的核 */
        const cg = g.createRadialGradient(-R * 0.04, -R * 0.05, 0, 0, 0, R * 0.46);
        cg.addColorStop(0, rgba(mix(P.heat, WHITE, 0.22), 1));
        cg.addColorStop(0.35, rgba(P.heat, 0.98));
        cg.addColorStop(0.68, rgba(P.crackGlow, 0.50));
        cg.addColorStop(1, rgba(P.crackGlow, 0));
        g.fillStyle = cg;
        g.beginPath();
        g.arc(0, 0, R * 0.46, 0, TAU);
        g.fill();
      } else {
        hotCore(g, R * 0.26, P, 0.92);
        glint(g, -R * 0.02, -R * 0.03, S * 0.085, rgba(P.hot, 0.95), 1);
      }

      /* 6) 边缘冷壳亮线：左上受光一段亮，其余只留一点点；亮线贴边不悬空 */
      g.lineCap = 'round';
      g.beginPath();
      g.arc(0, 0, R * 0.982, 0, TAU);
      g.lineWidth = Math.max(0.32, S * 0.022);
      g.strokeStyle = rgba(P.rim, 0.16);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, R * 0.982, Math.PI * 1.04, Math.PI * 1.58);
      g.lineWidth = Math.max(0.48, S * 0.040);
      g.strokeStyle = rgba(P.rim, 0.94);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, R * 0.982, Math.PI * 0.30, Math.PI * 0.47);
      g.lineWidth = Math.max(0.34, S * 0.026);
      g.strokeStyle = rgba(mix(P.rim, P.body, 0.40), 0.34);
      g.stroke();

      /* 7) 近黑轮廓（亮红月面上全靠它） */
      g.beginPath();
      g.arc(0, 0, R, 0, TAU);
      g.lineWidth = ov;
      g.strokeStyle = rgba(P.edge, 0.92);
      g.stroke();

      /* 8) 飞溅火星：只朝上/右偏，带一小段拖尾 */
      for (let i = 0; i < 3; i++) {
        const a = -1.45 + hash01(i * 5.7 + 2.2) * 2.55;
        const r = R * (1.10 + hash01(i * 3.3 + 0.7) * 0.13);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        const sr = S * (0.016 + hash01(i * 1.9 + 4.4) * 0.012);
        g.beginPath();
        g.moveTo(x + Math.cos(a) * sr * 1.8, y + Math.sin(a) * sr * 1.8);
        g.lineTo(x, y);
        g.lineWidth = Math.max(0.22, sr * 0.70);
        g.strokeStyle = rgba(P.crackGlow, 0.55);
        g.stroke();
        glint(g, x, y, sr, rgba(mix(P.hotline, WHITE, 0.45), 0.92), 0.95);
      }
    },
  },
};
