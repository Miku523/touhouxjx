/**
 * 关卡生成器
 *
 * 手写几百列地图不现实，这里按「地块模板」拼接出 3000+ 列的长关卡，
 * 同时保证可跳性：
 *   - 地面高度每列最多变 1 格，坡道成阶梯；
 *   - 坑宽 <= 4 格（单跳 4 格、二段跳 6 格），崩落砖桥宽 4~5；
 *   - 浮台与地面落差 <= 3 格（单跳上限），需要二段跳的高台另有落脚点；
 *   - 每关末尾留出 ~46 列平地当 Boss 场；
 *   - 检查点每 ~640 列一个，坑/砖桥前必有落脚点。
 *
 * 输出仍是字符行数组，Level 的解析路径完全不变。
 * gen 配置：
 *   { kind:'platform', rows, ground, cols, seed, style }
 *   { kind:'stg', rows, cols }
 */

const AIR = '.';
const DIRT = '#';
const GRASS = 'G';

/* ---------------- 随机数 ---------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 风格地块权重 ----------------
 * 每个风格挑一组地块类型，重复权重。新机制（崩落砖桥 / 水域游泳）在所有风格里都会出现，
 * 只是频率和密度不同。
 */
const STYLE_CHUNKS = {
  shrine: [
    ['flat', 3], ['hill', 3], ['pit', 2], ['platforms', 3], ['stairs', 2],
    ['crumble', 2], ['spikes', 2], ['tunnel', 2], ['gate', 1], ['water', 1],
  ],
  forest: [
    ['flat', 2], ['hill', 3], ['pit', 2], ['platforms', 3], ['mushroom', 2],
    ['vine', 2], ['crumble', 2], ['spikes', 1], ['water', 2], ['tunnel', 1],
  ],
  lake: [
    ['flat', 2], ['hill', 2], ['pit', 2], ['platforms', 2], ['water', 3],
    ['ice', 3], ['crumble', 3], ['spikes', 1], ['tunnel', 1],
  ],
  nether: [
    ['flat', 2], ['hill', 3], ['pit', 2], ['platforms', 3], ['stairs', 2],
    ['crumble', 3], ['spikes', 2], ['tunnel', 2], ['water', 1], ['gate', 1],
  ],
  moon: [
    ['flat', 2], ['hill', 2], ['pit', 2], ['platforms', 3], ['bricks', 3],
    ['crumble', 3], ['spikes', 2], ['ice', 1], ['gate', 1],
  ],
};

class Builder {
  constructor(gen) {
    this.gen = gen;
    this.rows = gen.rows;
    this.ground = gen.ground;
    this.cols = gen.cols;
    this.rng = mulberry32(gen.seed >>> 0);
    this.top = new Int16Array(this.cols).fill(this.ground);
    this.gap = new Uint8Array(this.cols);
    this.surface = new Array(this.cols).fill(GRASS);
    this.cells = Array.from({ length: this.rows }, () => new Array(this.cols).fill(AIR));
    this.crumble = [];
    this.cursor = 0;
    this.nextCheckpoint = 620; // 第一段之后每 ~640 列一个
    this.lastTop = this.ground;
  }

  /* ---------- 随机助手 ---------- */
  rnd() { return this.rng(); }
  ri(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  chance(p) { return this.rng() < p; }

  /* ---------- 基础写入 ---------- */
  set(cx, cy, ch) {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return;
    this.cells[cy][cx] = ch;
  }

  get(cx, cy) {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return AIR;
    return this.cells[cy][cx];
  }

  /** 把第 c 列的地面写到 top 行：草皮 + 下方泥土。gap 列写空气。 */
  commit(c, topRow, surface = GRASS) {
    if (c < 0 || c >= this.cols) return;
    this.top[c] = topRow;
    this.gap[c] = 0;
    this.surface[c] = surface;
    if (topRow >= this.rows) return;
    this.cells[topRow][c] = surface;
    for (let r = topRow + 1; r < this.rows; r++) this.cells[r][c] = DIRT;
  }

  /** 只登记地面高度，稍后统一填充（用于坡道批量）。 */
  stamp(c, topRow, surface = GRASS) {
    if (c < 0 || c >= this.cols) return;
    this.top[c] = topRow;
    this.gap[c] = 0;
    this.surface[c] = surface;
  }

  flush(c) {
    if (c < 0 || c >= this.cols) return;
    const t = this.top[c];
    if (this.gap[c]) return;
    this.cells[t][c] = this.surface[c];
    for (let r = t + 1; r < this.rows; r++) this.cells[r][c] = DIRT;
  }

  /** 从当前地面平滑过渡到 endTop（每列最多变 1），返回新高度。 */
  slope(start, len, endTop) {
    const maxTop = this.ground;
    const minTop = Math.max(3, this.ground - (this.rows >= 34 ? 8 : 3));
    const from = this.top[Math.max(0, start - 1)] || this.lastTop;
    const target = Math.max(minTop, Math.min(maxTop, endTop));
    for (let i = 0; i < len; i++) {
      const c = start + i;
      if (c >= this.cols) break;
      const want = Math.round(from + (target - from) * ((i + 1) / len));
      const prev = i === 0 ? from : this.top[c - 1];
      const delta = Math.max(-1, Math.min(1, want - prev));
      this.stamp(c, Math.max(minTop, Math.min(maxTop, prev + delta)));
    }
    for (let i = 0; i < len; i++) this.flush(start + i);
    this.lastTop = this.top[Math.min(this.cols - 1, start + len - 1)] || target;
    return this.lastTop;
  }

  /** 可用的向上空间（22 行关 4 格，34 行关 10 格）。 */
  skyRoom() {
    return this.rows >= 34 ? 10 : 4;
  }

  /** 天空平台（单向），x 为起始列，y 为目标行，宽 w 列。 */
  platform(cx, cy, w, surface = '=') {
    for (let i = 0; i < w; i++) this.set(cx + i, cy, surface);
  }

  /** 砖墙/砖柱，从 fromRow 到 toRow。 */
  brickColumn(cx, fromRow, toRow, w = 1) {
    for (let i = 0; i < w; i++) {
      for (let r = fromRow; r <= toRow; r++) this.set(cx + i, r, 'B');
    }
  }

  /* ---------- 金币 / 补给 / 检查点 ---------- */
  coins(cx, cy, n, gap = 1) {
    for (let i = 0; i < n; i++) {
      if (this.get(cx + i * gap, cy) === AIR) this.set(cx + i * gap, cy, 'o');
    }
  }

  coinArc(cx, topRow, halfW) {
    for (let i = -halfW; i <= halfW; i++) {
      const h = halfW - Math.abs(i);
      this.set(cx + i, topRow - 1 - Math.floor(h / 2), 'o');
    }
  }

  power(cx, cy) {
    if (this.get(cx, cy) === AIR) this.set(cx, cy, 'p');
  }

  /* ---------- 地块模板 ---------- */
  flat(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    return len;
  }

  hill(len) {
    const t = this.lastTop;
    const amp = this.ri(1, this.rows >= 34 ? 6 : 2);
    const dir = this.chance(0.5) ? -1 : 1;
    const minTop = Math.max(3, this.ground - (this.rows >= 34 ? 8 : 3));
    const end = Math.max(minTop, Math.min(this.ground, t + dir * amp));
    this.slope(this.cursor, len, end);
    return len;
  }

  stairs(len) {
    const t = this.lastTop;
    const step = this.chance(0.5) ? -1 : 1;
    const steps = Math.max(2, Math.floor(len / 3));
    const minTop = Math.max(3, this.ground - (this.rows >= 34 ? 8 : 3));
    const end = Math.max(minTop, Math.min(this.ground, t + step * Math.min(steps, this.rows >= 34 ? 6 : 3)));
    this.slope(this.cursor, len, end);
    return len;
  }

  pit(len) {
    const c0 = this.cursor;
    const n = Math.min(4, len - 2);
    const t = this.lastTop;
    // 坑前必有一段平地在上一块末尾已保证；坑本身不写地面
    for (let i = 0; i < n; i++) {
      this.top[c0 + i] = t;
      this.gap[c0 + i] = 1;
    }
    // 坑上方的金币弧
    this.coinArc(c0 + Math.floor(n / 2), t - 2, Math.max(1, Math.floor(n / 2)));
    // 收尾 1~2 列平地
    for (let i = n; i < len; i++) this.commit(c0 + i, t);
    return len;
  }

  crumbleBridge(len) {
    const c0 = this.cursor;
    const t = this.lastTop;
    const n = Math.min(5, len - 3);
    for (let i = 0; i < n; i++) {
      this.top[c0 + i] = t;
      this.gap[c0 + i] = 1;
      this.set(c0 + i, t, 'B');
      this.crumble.push([c0 + i, t]);
    }
    this.set(c0 + Math.floor(n / 2), t - 3, 'o');
    for (let i = n; i < len; i++) this.commit(c0 + i, t);
    return len;
  }

  platforms(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const n = this.ri(1, 3);
    for (let k = 0; k < n; k++) {
      const px = c0 + 3 + Math.floor((k * (len - 6)) / Math.max(1, n));
      const pw = this.ri(3, 5);
      const ph = t - this.ri(2, this.rows >= 34 ? 6 : 3);
      this.platform(px, ph, pw);
      this.coins(px, ph - 1, pw, 1);
      if (this.chance(0.25)) this.power(px + 1, ph - 1);
    }
    return len;
  }

  bricks(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const h = this.ri(3, this.rows >= 34 ? 6 : 4);
    this.brickColumn(c0 + this.ri(2, len - 6), t - h, t - 1, this.ri(1, 2));
    const px = c0 + 2;
    this.platform(px, t - h, this.ri(3, 4));
    this.coins(px, t - h - 1, 3);
    return len;
  }

  spikes(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const n = this.ri(2, 4);
    for (let i = 0; i < n; i++) this.set(c0 + 2 + i, t - 1, '^');
    // 尖刺上方给一块落脚平台，鼓励跳过去
    this.platform(c0 + 2, t - 4, n);
    return len;
  }

  tunnel(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const ceil = Math.max(2, t - (this.rows >= 34 ? 7 : 5));
    const inset = 2;
    const span = len - 4;
    // 顶板只铺中段，两端各留 3 列不做顶，读作洞门而不是悬空土块
    for (let i = inset + 3; i < inset + span - 3; i++) this.set(c0 + i, ceil, DIRT);
    for (let i = inset + 6; i < inset + span - 6; i++) this.set(c0 + i, ceil - 1, DIRT);
    // 两端用单向木梁（可穿过）当支撑柱，视觉上把顶板接回地面
    for (const px of [c0 + inset + 1, c0 + inset + span - 2]) {
      for (let r = ceil; r < t - 1; r++) this.set(px, r, '=');
    }
    // 洞顶垂下的藤蔓/砖，制造窄缝
    for (let i = 6; i < span - 6; i += 5) {
      this.set(c0 + inset + i, ceil + 1, this.chance(0.5) ? 'V' : 'B');
    }
    this.coins(c0 + 4, t - 2, 4);
    return len;
  }

  water(len) {
    const t = this.lastTop;
    const c0 = this.cursor;
    const n = Math.min(len - 4, this.ri(4, 9));
    const off = 2;
    for (let i = 0; i < len; i++) {
      const c = c0 + i;
      if (i >= 2 && i < 2 + n) {
        // 池底比岸低 2 格，水面与岸齐平
        this.commit(c, t + off);
        for (let r = t; r < t + off; r++) this.set(c, r, 'W');
      } else {
        this.commit(c, t);
      }
    }
    this.coins(c0 + 2 + Math.floor(n / 2), t - 1, 2);
    return len;
  }

  ice(len) {
    const t = this.lastTop;
    const c0 = this.cursor;
    for (let i = 0; i < len; i++) this.commit(c0 + i, t, 'I');
    this.coins(c0 + 3, t - 1, 4);
    return len;
  }

  mushroom(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const mx = c0 + Math.floor(len / 2);
    this.commit(mx, t, 'M');
    this.platform(mx - 2, t - 6, 4);
    this.coins(mx - 2, t - 7, 4);
    this.set(mx + 1, t - 1, 'o');
    return len;
  }

  vine(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const px = c0 + 3;
    for (let r = t - 6; r < t; r++) {
      this.set(px, r, 'V');
      this.set(px + 1, r, 'V');
    }
    // 藤蔓底部留 1 格空隙，可钻过去
    this.set(px, t - 1, AIR);
    this.set(px + 1, t - 1, AIR);
    this.coins(px, t - 3, 2);
    return len;
  }

  gate(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const gx = c0 + Math.floor(len / 2);
    for (let r = t - 6; r < t; r++) {
      this.set(gx - 2, r, 'B');
      this.set(gx + 2, r, 'B');
    }
    for (let i = -3; i <= 3; i++) this.set(gx + i, t - 7, 'B');
    this.set(gx, t - 8, 'B');
    this.coins(gx - 1, t - 2, 3);
    return len;
  }

  /* ---------- 收尾 ---------- */
  placeEntities() {
    const lastSafe = this.cols - 70;
    let lastBest = -1;
    // 检查点：等距放在平地上
    for (let target = this.nextCheckpoint; target < lastSafe; target += 650) {
      let best = -1;
      for (let d = 0; d < 40; d++) {
        const c = target + d;
        if (c < lastSafe && !this.gap[c] && this.surface[c] !== 'W' && this.surface[c] !== 'I') { best = c; break; }
      }
      if (best < 0) continue;
      lastBest = best;
      const row = this.top[best] - 1;
      if (row > 1 && this.get(best, row) === AIR) this.set(best, row, 'C');
      this.coins(best + 2, this.top[best] - 1, 3);
    }
    // 最后一个检查点之后，玩家要一路走到 Boss 场，不能再掉出地图。
    // 把紧随其后的无底深坑填成地面（崩落砖桥保留，地表是 'B'）。
    // 否则刚复活就踩空，死亡→复活→再踩空，看起来像「进不了游戏」。
    if (lastBest >= 0) {
      for (let c = lastBest + 1; c < Math.min(lastBest + 41, this.cols); c++) {
        if (this.gap[c] && this.get(c, this.top[c]) === AIR) this.commit(c, this.top[c]);
      }
    }

    // 金币串 / 妖精：从第 40 列开始，避开 Boss 场与检查点附近
    for (let c = 40; c < lastSafe; c += this.ri(11, 19)) {
      if (this.gap[c]) {
        if (c + 1 < this.cols && !this.gap[c + 1]) this.coinArc(c, this.top[c] - 2, 2);
        continue;
      }
      const t = this.top[c];
      if (this.chance(0.55)) this.coins(c, t - 2, this.ri(2, 4));
      if (this.chance(0.30)) this.power(c + 1, t - 1);
    }

    for (let c = 60; c < lastSafe; c += this.ri(28, 46)) {
      if (this.gap[c] || this.surface[c] === 'M') continue;
      const row = this.top[c] - 1;
      if (this.get(c, row) === AIR && this.get(c + 1, row) !== 'C') this.set(c, row, 's');
      if (this.chance(0.45)) {
        const fr = this.top[c] - this.ri(3, this.rows >= 34 ? 8 : 6);
        if (this.get(c, fr) === AIR) this.set(c, fr, 'f');
      }
    }

    // 出生点：开头清出 18 列平地
    for (let c = 0; c < Math.min(20, this.cols); c++) {
      this.commit(c, this.ground);
      for (let r = 0; r < this.ground; r++) this.set(c, r, AIR);
    }
    this.set(2, this.ground - 1, 'P');
    this.coins(6, this.ground - 2, 4);

    // Boss 场：最后 46 列平地，终点旗在前一点的位置
    const bossStart = Math.max(0, this.cols - 50);
    const entryTop = bossStart > 0 ? this.top[bossStart - 1] : this.ground;
    for (let c = bossStart; c < this.cols; c++) {
      this.commit(c, this.ground);
      for (let r = 0; r < this.ground; r++) this.set(c, r, AIR);
    }
    // 入口落差过大时，在中间补一段单向平台当落脚点：
    // 34 行关地面可能比 Boss 场高 4~8 格，直接摔下去像掉出地图，也难跳回主路。
    if (entryTop <= this.ground - 4) {
      const midRow = Math.round((entryTop + this.ground) / 2);
      this.platform(bossStart, midRow, Math.min(18, this.cols - bossStart));
    }
    this.set(this.cols - 8, this.ground - 1, 'F');
    this.coins(this.cols - 46, this.ground - 2, 4);
  }

  build() {
    const chunks = STYLE_CHUNKS[this.gen.style] || STYLE_CHUNKS.shrine;
    const total = chunks.reduce((s, [, w]) => s + w, 0);
    const end = this.cols - 70;
    while (this.cursor < end) {
      let roll = this.rnd() * total;
      let name = 'flat';
      for (const [n, w] of chunks) { roll -= w; if (roll <= 0) { name = n; break; } }
      let len = 0;
      switch (name) {
        case 'flat': len = this.ri(8, 14); this.flat(len); break;
        case 'hill': len = this.ri(10, 16); this.hill(len); break;
        case 'stairs': len = this.ri(8, 12); this.stairs(len); break;
        case 'pit': len = this.ri(5, 7); this.pit(len); break;
        case 'crumble': len = this.ri(8, 11); this.crumbleBridge(len); break;
        case 'platforms': len = this.ri(12, 18); this.platforms(len); break;
        case 'bricks': len = this.ri(10, 14); this.bricks(len); break;
        case 'spikes': len = this.ri(10, 14); this.spikes(len); break;
        case 'tunnel': len = this.ri(12, 18); this.tunnel(len); break;
        case 'water': len = this.ri(12, 16); this.water(len); break;
        case 'ice': len = this.ri(10, 14); this.ice(len); break;
        case 'mushroom': len = this.ri(9, 12); this.mushroom(len); break;
        case 'vine': len = this.ri(9, 12); this.vine(len); break;
        case 'gate': len = this.ri(9, 12); this.gate(len); break;
        default: len = 10; this.flat(len);
      }
      this.cursor += len;
      if (len <= 0) break;
    }
    // 尾巴：先补平地到结尾
    while (this.cursor < this.cols) { this.flat(1); this.cursor++; }
    this.placeEntities();
    return this.cells.map((row) => row.join(''));
  }
}

/**
 * 生成关卡字符行。
 * @param {object} gen 关卡生成配置
 * @returns {{rows:string[], crumble:[number,number][]}}
 */
export function buildLevelRows(gen) {
  if (!gen) return { rows: [], crumble: [] };
  if (gen.kind === 'stg') {
    const rows = Array.from({ length: gen.rows || 22 }, () => AIR.repeat(gen.cols));
    return { rows, crumble: [] };
  }
  const b = new Builder(gen);
  const rows = b.build();
  return { rows, crumble: b.crumble };
}
