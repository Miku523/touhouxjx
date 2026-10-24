/**
 * bulletArt/crystal.js —— EXTRA 关底 · 芙兰朵露：血水晶（蔓越莓陷阱 / 四重存在 / 星弧破碎 / 折反射）
 *
 * 主题：被血浸透的晶簇。一主两副三根柱晶：每根都有冠锥 / 三面柱身 / 底尖，
 * 左面受光（玫瑰白）、正面主体（饱和玫红）、右面背光（深酒红 #4a0d1c），
 * 腰线是棱面上的折射高光带（每个面各自折一下、左亮右隐），不是一条横线。
 *
 * 实战可读性（r=4~7）优先：近黑轮廓 + 饱和玫红主体 + 白热棱脊三层分开，
 * 白只给棱脊 / 冠尖 / 腰线，绝不平涂成灰白；所有随机量来自 hash01，可复现。
 */
import { B_CRYSTAL } from './types.js';
import { WHITE, mix, rgba, hexToRgb, softHalo, glint, path } from './_lib.js';

/* 口径色（会和传入 color 混合，保证逐卡配色但不会掉进灰） */
const ROSE = [255, 208, 216];   // 受光面
const PUNCH = [255, 44, 102];   // 主体（饱和玫红 / 品红）
const CRIMSON = [255, 77, 106]; // 辉光
const WINE = [74, 13, 28];      // 背光面（深酒红，锁死 #4a0d1c 附近的色相）
const EDGE = [14, 1, 6];        // 近黑轮廓

function palette(color) {
  const src = hexToRgb(color);
  return {
    src,
    hi: mix(WHITE, src, 0.10),
    lit: mix(ROSE, src, 0.14),
    crown: mix(ROSE, WHITE, 0.34),
    body: mix(PUNCH, src, 0.16),
    wine: mix(WINE, src, 0.10),
    deep: mix(WINE, EDGE, 0.45),
    edge: mix(EDGE, src, 0.05),
    glow: mix(CRIMSON, src, 0.42),
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

/** 一个面：两色线性渐变（方向由 dir 决定），硬边由棱线负责 */
function face(g, pts, c0, c1, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, rgba(c0, 1));
  gr.addColorStop(1, rgba(c1, 1));
  poly(g, pts, gr);
}

/**
 * 一根柱晶：冠锥（tip→肩）+ 三面柱身 + 底尖。
 * o = { x, y, w, h, tilt, dark }；dark = 0 主晶 / 1 后景副晶（更暗更小）。
 */
function shard(g, S, P, o) {
  const w = o.w * S;
  const h = o.h * S;
  const dk = o.dark || 0;

  const C = dk ? {
    hi: mix(P.hi, P.wine, 0.36),
    lit: mix(P.lit, P.wine, 0.42),
    crown: mix(P.crown, P.wine, 0.36),
    body: mix(P.body, P.wine, 0.38),
    wine: mix(P.wine, P.edge, 0.42),
    deep: mix(P.deep, P.edge, 0.30),
    edge: P.edge,
  } : P;

  g.save();
  g.translate(o.x * S, o.y * S);
  if (o.tilt) g.rotate(o.tilt);

  const ov = Math.max(0.78, S * 0.052);   // 轮廓线宽
  const fl = Math.max(0.40, S * 0.026);   // 棱线线宽

  const tip = [0.04 * w, -1.00 * h];
  const shL = [-0.82 * w, -0.60 * h];
  const shR = [0.76 * w, -0.64 * h];
  const coLt = [-1.00 * w, -0.46 * h];
  const coLb = [-0.93 * w, 0.32 * h];
  const baL = [-0.46 * w, 0.62 * h];
  const bot = [0.02 * w, 0.98 * h];
  const baR = [0.52 * w, 0.56 * h];
  const coRb = [0.94 * w, 0.28 * h];
  const coRt = [0.85 * w, -0.50 * h];
  const sil = [tip, shL, coLt, coLb, baL, bot, baR, coRb, coRt, shR];

  /* 柱身三条竖棱：把周向切成左亮面 / 正面 / 右暗面（正面最宽 = 主体玫红占主导） */
  const e1 = -0.50 * w;
  const e2 = 0.34 * w;
  const topY = -0.50 * h;
  const botY = 0.40 * h;
  const p1t = [e1, topY];
  const p1b = [e1 + 0.02 * w, botY];
  const p2t = [e2, topY - 0.01 * h];
  const p2b = [e2 - 0.02 * w, botY - 0.02 * h];

  const leftF = [coLt, p1t, p1b, coLb];
  const frontF = [p1t, p2t, p2b, p1b];
  const rightF = [p2t, coRt, coRb, p2b];
  const crownL = [tip, shL, coLt, p1t];
  const crownM = [tip, p1t, p2t];
  const crownR = [tip, p2t, coRt, shR];
  const bottomL = [coLb, baL, bot, p1b];
  const bottomR = [p2b, bot, baR, coRb];

  /* 1) 暗底：先钉死剪影，防止背景色透进晶体 */
  poly(g, sil, rgba(C.deep, 1));

  /* 2) 柱身三面：硬分面 */
  face(g, leftF, mix(C.lit, WHITE, 0.16), mix(C.lit, mix(C.body, C.wine, 0.3), 0.30), -w, -h, -w * 0.2, h);
  face(g, frontF, mix(C.body, C.hi, 0.10), mix(C.body, C.wine, 0.42), -w, -h, w, h);
  face(g, rightF, mix(C.wine, C.body, 0.10), mix(C.wine, C.edge, 0.32), w, -h, w, h);

  /* 3) 冠锥：尖端最亮；底尖压暗 */
  face(g, crownL, C.crown, mix(C.lit, C.body, 0.34), 0, -h, 0, 0);
  face(g, crownM, mix(C.body, C.hi, 0.20), mix(C.body, C.lit, 0.10), 0, -h, 0, 0);
  poly(g, crownR, rgba(mix(C.wine, C.edge, 0.22), 1));

  /* 2.5) 正面内部的折射竖带：晶体不是一块平色，越靠左棱越亮、靠右棱压一条暗折 */
  g.save();
  path(g, frontF);
  g.clip();
  const rf = g.createLinearGradient(e1, 0, e1 + 0.55 * w, 0);
  rf.addColorStop(0, rgba(mix(WHITE, C.body, 0.55), 0.30));
  rf.addColorStop(1, rgba(WHITE, 0));
  g.fillStyle = rf;
  g.fillRect(e1, -h, 0.55 * w, 2 * h);
  const rd = g.createLinearGradient(e2 - 0.34 * w, 0, e2, 0);
  rd.addColorStop(0, rgba(C.wine, 0));
  rd.addColorStop(1, rgba(C.wine, 0.34));
  g.fillStyle = rd;
  g.fillRect(e2 - 0.34 * w, -h, 0.34 * w, 2 * h);
  g.restore();
  face(g, bottomL, mix(C.body, C.lit, 0.34), mix(C.body, C.wine, 0.42), 0, 0, 0, h);
  poly(g, bottomR, rgba(mix(C.wine, C.edge, 0.45), 1));

  /* 4) 腰线：每个面各一段，跟着棱折一下（左亮右隐，不是一条横线） */
  /*   正面：主折射高光带，横向渐亮渐隐 */
  g.save();
  path(g, frontF);
  g.clip();
  const fy = 0.02 * h;
  const fbh = 0.12 * h;
  const fq = [
    [-1.2 * w, fy - 0.03 * h], [1.2 * w, fy + 0.05 * h],
    [1.2 * w, fy + 0.05 * h + fbh], [-1.2 * w, fy - 0.03 * h + fbh],
  ];
  const fg = g.createLinearGradient(-w, 0, w, 0);
  fg.addColorStop(0, rgba(mix(C.hi, WHITE, 0.35), 0.10));
  fg.addColorStop(0.20, rgba(mix(C.hi, WHITE, 0.30), 0.92));
  fg.addColorStop(0.55, rgba(C.hi, 0.66));
  fg.addColorStop(0.82, rgba(mix(C.hi, C.body, 0.5), 0.22));
  fg.addColorStop(1, rgba(C.body, 0));
  poly(g, fq, fg);
  seg(g, [-1.2 * w, fy - 0.03 * h], [1.2 * w, fy + 0.05 * h],
    rgba(mix(C.hi, WHITE, 0.55), 0.55), Math.max(0.30, S * 0.011));
  g.restore();

  /*   左受光面：一条更淡的折射带，位置略高 */
  g.save();
  path(g, leftF);
  g.clip();
  const ly = -0.01 * h;
  const lbh = 0.10 * h;
  const lq = [
    [-1.2 * w, ly - 0.02 * h], [0.2 * w, ly + 0.04 * h],
    [0.2 * w, ly + 0.04 * h + lbh], [-1.2 * w, ly - 0.02 * h + lbh],
  ];
  const lg = g.createLinearGradient(-w, 0, 0, 0);
  lg.addColorStop(0, rgba(WHITE, 0.08));
  lg.addColorStop(0.45, rgba(C.hi, 0.38));
  lg.addColorStop(1, rgba(C.hi, 0.12));
  poly(g, lq, lg);
  g.restore();

  /*   右暗面：只在靠棱的内侧留一小段暖反光 */
  g.save();
  path(g, rightF);
  g.clip();
  const ry = 0.05 * h;
  const rbh = 0.08 * h;
  const rq = [
    [e2 - 0.02 * w, ry], [1.2 * w, ry + 0.05 * h],
    [1.2 * w, ry + 0.05 * h + rbh], [e2 - 0.02 * w, ry + rbh],
  ];
  const rg = g.createLinearGradient(e2, 0, w, 0);
  rg.addColorStop(0, rgba(mix(C.body, C.hi, 0.45), 0.34));
  rg.addColorStop(1, rgba(C.body, 0));
  poly(g, rq, rg);
  g.restore();

  /* 5) 棱线：受光外棱亮、背光棱暗，「硬」全靠这层 */
  seg(g, tip, shL, rgba(mix(C.hi, WHITE, 0.35), 0.62), fl);
  seg(g, shL, coLt, rgba(mix(C.hi, WHITE, 0.30), 0.55), fl * 0.9);
  seg(g, coLt, coLb, rgba(mix(C.hi, WHITE, 0.45), 0.85), fl * 1.15);
  seg(g, tip, p1t, rgba(C.hi, 0.55), fl * 0.9);
  seg(g, p1t, p1b, rgba(mix(C.hi, WHITE, 0.50), 0.90), fl * 1.15);
  seg(g, p2t, p2b, rgba(C.edge, 0.85), fl * 1.25);
  seg(g, tip, p2t, rgba(C.edge, 0.45), fl * 0.9);
  seg(g, coRt, coRb, rgba(C.edge, 0.72), fl * 1.1);
  seg(g, shR, coRt, rgba(C.edge, 0.42), fl * 0.8);
  seg(g, p1b, bot, rgba(C.hi, 0.42), fl * 0.8);
  seg(g, p2b, bot, rgba(C.edge, 0.55), fl * 0.8);
  /* 亮棱内侧压一条暗线：让硬边有厚度，也防止亮面糊成一片 */
  seg(g, [e1 - 0.035 * w, topY + 0.02 * h], [e1 - 0.025 * w, botY - 0.02 * h],
    rgba(C.deep, 0.42), fl * 0.8);

  /* 6) 近黑轮廓压在最上面（亮背景下的辨识全靠它） */
  g.beginPath();
  g.moveTo(sil[0][0], sil[0][1]);
  for (let i = 1; i < sil.length; i++) g.lineTo(sil[i][0], sil[i][1]);
  g.closePath();
  g.lineWidth = ov;
  g.lineJoin = 'round';
  g.strokeStyle = rgba(C.edge, 0.96);
  g.stroke();

  /* 7) 冠尖白热星点 + 腰线亮点 */
  if (dk < 0.5) {
    glint(g, tip[0] + 0.01 * w, tip[1] + 0.03 * h, S * 0.050, rgba(C.hi, 0.92), 0.95);
    glint(g, e1 + 0.06 * w, fy + fbh * 0.42, S * 0.042, rgba(mix(C.hi, WHITE, 0.4), 0.85), 0.8);
  } else {
    glint(g, tip[0], tip[1] + 0.05 * h, S * 0.032, rgba(C.hi, 0.55), 0.7);
  }

  g.restore();
}

export default {
  [B_CRYSTAL]: {
    name: '血水晶',
    ext: 1.48,
    autoSpin: true,
    glowKey: 'pink',
    build(g, size, color) {
      const S = size;
      const P = palette(color);

      softHalo(g, S * 1.08, mix(P.glow, P.lit, 0.16), 0.10);

      /* 一主两副：副晶压暗放后面，主晶最大最亮，凑成晶簇（占满 ext 才不显碎） */
      shard(g, S, P, { x: -0.76, y: 0.24, w: 0.36, h: 0.66, tilt: -0.36, dark: 1 });
      shard(g, S, P, { x: 0.72, y: 0.30, w: 0.31, h: 0.56, tilt: 0.38, dark: 1 });
      shard(g, S, P, { x: 0.03, y: -0.01, w: 0.53, h: 1.10, tilt: 0.02, dark: 0 });

      /* 底部晶屑：贴着主晶底尖的两粒微光，别散成浮尘 */
      glint(g, -S * 0.30, S * 0.90, S * 0.034, rgba(P.lit, 0.50), 0.65);
      glint(g, S * 0.29, S * 0.92, S * 0.030, rgba(P.hi, 0.46), 0.60);
    },
  },
};
