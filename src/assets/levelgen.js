/**
 * 关卡生成器
 *
 * 手写几千列地图不现实，这里按「地块模板」拼接出长关卡，同时保证可跳性：
 *   - 地面高度每列最多变 1 格（slope / 阶梯），坑宽 <= 4 格；
 *   - 浮台与上一落脚点落差 <= 3 格（单跳可及），平台宽 >= 3 列；
 *   - 崩落砖桥 / 水面浮台 / 洞窟顶板都按同一套约束拼；
 *   - 每关末尾留出 50 列平地当 Boss 场，出生点前 20 列清空；
 *   - 检查点每 650 列一个，必须落在实地上（跳过水面 / 冰面 / 尖刺）。
 *
 * rows=34 的关卡（stage5/6）额外放开垂直空间：多层台地、塔楼、之字高地等
 * 模板会给出可选的高低路线，但每一级台阶仍 <= 3 格，不需要超出二段跳能力。
 *
 * 输出仍是字符行数组，Level 的解析路径完全不变。
 * gen 配置：
 *   { kind:'platform', rows, ground, cols, seed, style, collectStats? }
 *   { kind:'stg', rows, cols }
 *   midboss?: 见 levels.js 的 STAGE5_MIDBOSS —— 挖平地 / 停刷小怪 / 补 P 都用它。
 */

import { POWER } from '../game/power.js';

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
 * 每个风格都有一种「签名地形」，权重最高；flat 只留 1 份当低频喘息，
 * 其余旧模板与新增模板混排，避免出现长直平地。新机制（崩落砖桥 / 水域游泳）
 * 在所有风格里都会出现，只是频率和密度不同。
 *
 * 新增模板：
 *   terraces    多层台地（shrine 签名）
 *   canopy      树冠+藤蔓高地（forest 签名）
 *   waterfall   水面+浮台（lake 签名）
 *   tower       垂直塔楼（nether 签名）
 *   bridgeChain 连续碎裂桥（moon 签名）
 *   canyon      深谷
 *   cave        洞窟钟乳石
 *   gauntlet    尖刺+坑组合
 *   zigzag      之字高地
 *   floorHoles  地板多坑
 *   overhang    岩檐
 */
const STYLE_CHUNKS = {
  // 博丽神社：石阶、鸟居、庭院水与岩檐；不出现洞窟和尖刺走廊（神社后山没那么凶）
  shrine: [
    ['flat', 1], ['hill', 2], ['pit', 1], ['terraces', 4], ['platforms', 2],
    ['stairs', 2], ['crumble', 2], ['spikes', 1], ['gate', 1], ['water', 1],
    ['overhang', 2], ['zigzag', 1],
  ],
  // 魔法森林：树冠、蘑菇、藤蔓、树根洞与荆棘
  forest: [
    ['flat', 1], ['hill', 2], ['pit', 1], ['canopy', 4], ['platforms', 2],
    ['mushroom', 2], ['vine', 2], ['crumble', 1], ['spikes', 1], ['water', 1],
    ['tunnel', 1], ['zigzag', 2], ['floorHoles', 2], ['gauntlet', 1],
  ],
  // 雾之湖：瀑布水潭、浮冰与冰洞；湖面平坦，不放深谷
  lake: [
    ['flat', 1], ['hill', 1], ['pit', 1], ['waterfall', 4], ['water', 3],
    ['ice', 2], ['crumble', 2], ['platforms', 2], ['floorHoles', 1],
    ['spikes', 1], ['bridgeChain', 1],
  ],
  // 白玉楼：楼阁、黄泉洞、庭园与墓门
  nether: [
    ['flat', 1], ['hill', 2], ['pit', 1], ['tower', 4], ['platforms', 2],
    ['stairs', 2], ['crumble', 2], ['spikes', 1], ['gauntlet', 2],
    ['cave', 2], ['canyon', 2], ['water', 1], ['gate', 1], ['overhang', 1],
  ],
  // 月都：永远亭的碎裂桥、月面砖、竹台与月门；不用雾之湖的冰面
  moon: [
    ['flat', 1], ['hill', 1], ['pit', 1], ['bridgeChain', 4], ['bricks', 2],
    ['crumble', 2], ['platforms', 2], ['spikes', 1], ['gate', 1],
    ['terraces', 2], ['overhang', 1], ['tower', 2], ['floorHoles', 1],
  ],
};

/**
 * 分面刷怪密度：不同主题「能站人的合法地面格」数量差别很大（森林断层多、湖面/月都开阔），
 * 按列随机步进会让各面小怪数漂 ±15%。这里改成「按每屏目标数量在合法格上等距取样」：
 *   perScreen = 每屏（40 列 / 1280px）目标小怪数（改造前基线 × ~1.5），
 *   groundRatio = 地面 s 与空中 f 的比例（沿用改造前各面的 s:f）。
 * 这样关卡长度改变（levels.js 的 cols 调整）时密度仍然稳定，不会因首尾边缘区占比变化而漂。
 */
const MONSTER_SPAWN = {
  shrine: { perScreen: 2.06, groundRatio: 1.92 },
  forest: { perScreen: 1.71, groundRatio: 1.84 },
  lake: { perScreen: 1.88, groundRatio: 1.41 },
  nether: { perScreen: 1.85, groundRatio: 2.24 },
  moon: { perScreen: 2.18, groundRatio: 1.84 },
};

/**
 * P 点（火力道具）掉落率倍率。
 * 0.5 = 掉落总量砍半；配合 POWER.pickup = 3，把前两面的火力总供给
 * 压在「满打满吃约 2.8 条满槽」附近：P 变稀少，但每一颗都能看见血条跳一截。
 * 想整体调稠/调稀只改这一个数（1 = 恢复旧密度）。
 */
export const P_DROP_SCALE = 0.5;

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
    // 中途 Boss 舞台的统计（列区间 / 取消的小怪数 / 补偿 P 数），供自测脚本与平衡检查读取
    this.midbossInfo = null;
    this.chunkStats = Object.create(null);    this.chunkLog = [];
    this.stepCount = 0;
    this.cursor = 0;
    // 第一个存档点到出生点的距离：太远会让开局失误代价过高（原 620 列 ≈ 52 秒）
    this.nextCheckpoint = 200;
    // 之后每隔多少列放一个存档点（原 650 列 ≈ 55 秒，死亡退回成本过高）
    this.checkpointGap = 260;
    this.lastTop = this.ground;
  }

  /* ---------- 随机助手 ---------- */
  rnd() { return this.rng(); }
  ri(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  chance(p) { return this.rng() < p; }

  /** P 点掉落判定 = 原始概率 × P_DROP_SCALE（掉落率统一走这里） */
  pDrop(base) { return this.rng() < base * P_DROP_SCALE; }

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

  /** 当前块起点处的地表高度（上一列）。 */
  groundTop() {
    return this.cursor > 0 ? this.top[this.cursor - 1] : this.lastTop;
  }

  /** 把高度夹到本关允许的地形高度范围内。 */
  clampTop(row) {
    const minTop = Math.max(3, this.ground - (this.rows >= 34 ? 8 : 3));
    return Math.max(minTop, Math.min(this.ground, row));
  }

  /** 连续铺 len 列平整地面，并同步 lastTop。 */
  bed(start, len, topRow, surface = GRASS) {
    for (let i = 0; i < len; i++) this.commit(start + i, topRow, surface);
    this.lastTop = topRow;
  }

  /** 开一段无底坑：只登记 gap，不写地面。 */
  hole(start, len, topRow) {
    for (let i = 0; i < len; i++) {
      const c = start + i;
      if (c >= this.cols) break;
      this.top[c] = topRow;
      this.gap[c] = 1;
    }
    this.lastTop = topRow;
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

  /* ---------- 旧地块模板 ---------- */
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
    this.lastTop = t;
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
    this.lastTop = t;
    return len;
  }

  platforms(len) {
    const t = this.lastTop;
    const c0 = this.cursor;
    this.bed(c0, len, t);
    // 34 行关铺 2~3 层阶梯状浮台，每层只比上一层高 2~3 格（单跳可及）
    const tiers = this.rows >= 34 ? this.ri(2, 3) : 1;
    // 浮台高度按「离地 2~3 格」算；不能夹到 minTop，否则在抬升地形上会被压回地面
    let y = Math.max(2, t - this.ri(2, 3));
    let px = c0 + 2;
    for (let k = 0; k < tiers; k++) {
      const pw = this.ri(3, 4);
      if (px + pw > c0 + len - 1) break;
      this.platform(px, y, pw);
      this.coins(px, y - 1, pw);
      if (this.pDrop(0.2)) this.power(px + 1, y - 1);
      px += pw + this.ri(2, 3);
      y = Math.max(2, y - this.ri(2, 3));
    }
    return len;
  }

  bricks(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const h = this.ri(2, 3);
    // 砖柱与左侧浮台错开，避免两段装饰叠在一起
    this.brickColumn(c0 + this.ri(6, Math.max(6, len - 4)), t - h, t - 1, this.ri(1, 2));
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
    // 尖刺上方给一块落脚平台（比地面高 3 格、宽度 >=3），鼓励跳过去
    const pw = Math.max(3, n);
    this.platform(c0 + 2, t - 3, pw);
    this.coins(c0 + 2, t - 4, pw);
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

  /**
   * 水面：岸 -> 浅水 -> 深水池 -> 浅水 -> 岸，池底每列只降 1 格。
   * 水面与岸齐平，池底最深 2 格；水面列 surface 记为 'W'，检查点不会落进去。
   */
  water(len) {
    const c0 = this.cursor;
    const t = this.groundTop();
    const n = Math.min(len - 6, this.ri(4, 9));
    for (let i = 0; i < len; i++) {
      const c = c0 + i;
      let top = t;
      if (i >= 2 && i <= n + 1) top = t + 1;      // 浅水边
      if (i >= 3 && i <= n) top = t + 2;          // 深水池底
      this.commit(c, top);
      if (top > t) {
        this.set(c, top - 1, 'W');
        if (top === t + 2) this.set(c, top - 2, 'W');
        this.surface[c] = 'W';
      }
    }
    this.lastTop = t;
    this.coins(c0 + 3, t - 1, 3);
    return len;
  }

  ice(len) {
    const t = this.lastTop;
    const c0 = this.cursor;
    this.bed(c0, len, t, 'I');
    this.coins(c0 + 3, t - 1, 4);
    return len;
  }

  mushroom(len) {
    const t = this.lastTop;
    for (let i = 0; i < len; i++) this.commit(this.cursor + i, t);
    const c0 = this.cursor;
    const mx = c0 + Math.floor(len / 2);
    this.commit(mx, t, 'M');
    this.platform(mx - 2, t - 3, 4);
    this.coins(mx - 2, t - 4, 4);
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
    // 门柱必须让出地面通道：旧版柱子 6 行直插地面，门楣又盖在柱顶，
    // 二段跳最大上升约 223px，够不到 224px 的门楣顶，等于一堵不可通过的软锁墙。
    // 现在柱子只从门楣往下垂 2 行（离地 96px），玩家可以从门下走过；
    // 门楣顶 192px 仍在二段跳射程内，想上房梁也上得去。
    for (let r = t - 5; r < t - 3; r++) {
      this.set(gx - 2, r, 'B');
      this.set(gx + 2, r, 'B');
    }
    for (let i = -3; i <= 3; i++) this.set(gx + i, t - 6, 'B');
    this.set(gx, t - 7, 'B');
    this.coins(gx - 1, t - 2, 3);
    return len;
  }

  /* ---------- 新增地块模板 ---------- */

  /**
   * 多层台地：一级一级往上抬（每列 <=1），台面 4~6 列，可回头下折。
   * 34 行关最多叠 4 级，形成可选的上下层路线；22 行关 1~2 级。
   */
  terraces(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    const tiers = this.rows >= 34 ? this.ri(2, 4) : this.ri(1, 2);
    let used = 0;
    let top = base;
    for (let k = 0; k < tiers; k++) {
      if (len - used < 8) break;
      const rise = this.ri(2, 3);
      const ramp = Math.min(rise + 1, len - used - 4);
      this.slope(c0 + used, ramp, this.clampTop(top - rise));
      used += ramp;
      top = this.top[c0 + used - 1];
      const ledge = Math.min(this.ri(4, 6), len - used - 4);
      if (ledge < 3) break;
      this.bed(c0 + used, ledge, top);
      this.coins(c0 + used - ledge + 1, top - 1, Math.min(4, ledge - 1));
      // 台地边缘再放一级可选小平台（高 3 格，宽 3 列）
      if (ledge >= 4) this.platform(c0 + used - 3, Math.max(2, top - 3), 3);
      used += ledge;
      if (k + 1 < tiers && len - used >= 6) {
        this.slope(c0 + used, 2, this.clampTop(top + this.ri(1, 2)));
        used += 2;
        top = this.top[c0 + used - 1];
      }
    }
    if (used < len) this.slope(c0 + used, len - used, base);
    return len;
  }

  /** 深谷：先下坡到谷底（最多 3/5 格深），走一段谷底再上坡；可下水可跳台。 */
  canyon(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    const maxDepth = this.rows >= 34 ? 5 : 3;
    const depth = this.ri(2, maxDepth);
    const floor = this.clampTop(base + depth);
    const realDepth = floor - base;
    if (realDepth <= 0) {
      this.bed(c0, len, base);
      return len;
    }
    const ramp = Math.min(realDepth + 1, Math.floor(len / 3));
    this.slope(c0, ramp, floor);
    let used = ramp;
    const bottom = this.top[c0 + used - 1];
    const flat = Math.min(len - used - ramp, this.ri(6, 10));
    if (flat >= 3) {
      this.bed(c0 + used, flat, bottom);
      this.coins(c0 + used + 1, bottom - 1, Math.min(4, flat - 1));
      if (this.pDrop(0.5)) this.power(c0 + used + Math.floor(flat / 2), bottom - 1);
      used += flat;
    }
    if (used < len) this.slope(c0 + used, len - used, base);
    return len;
  }

  /**
   * 垂直塔楼：主路平地照走，头顶叠 2~3 层单向浮台（每层只高 2~3 格、
   * 水平错开 1~2 列），是可选的爬高路线，顶层放补给。
   */
  tower(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    this.bed(c0, len, base);
    const steps = this.rows >= 34 ? this.ri(2, 3) : this.ri(1, 2);
    let x = c0 + this.ri(4, 6);
    let y = Math.max(2, base - 2);
    for (let k = 0; k < steps; k++) {
      const w = this.ri(3, 4);
      if (x + w > c0 + len - 2) break;
      this.platform(x, y, w);
      this.coins(x, y - 1, w);
      if (k === steps - 1) this.power(x + 1, y - 1);
      const dir = this.chance(0.5) ? 1 : -1;
      const nx = x + dir * (w + this.ri(1, 2));
      const ny = Math.max(2, y - this.ri(2, 3));
      if (nx < c0 + 2 || nx + 3 > c0 + len - 2) break;
      x = nx;
      y = ny;
    }
    return len;
  }

  /** 连续碎裂桥：碎砖段 3~4 列 + 实心小岛 3~4 列，反复 2~3 次。 */
  bridgeChain(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    let used = 0;
    this.bed(c0, 2, base);
    used = 2;
    const rounds = this.ri(2, 3);
    for (let k = 0; k < rounds; k++) {
      const bw = this.ri(3, 4);
      const island = this.ri(3, 4);
      if (used + bw + island > len - 2) break;
      for (let i = 0; i < bw; i++) {
        const c = c0 + used + i;
        this.top[c] = base;
        this.gap[c] = 1;
        this.set(c, base, 'B');
        this.crumble.push([c, base]);
      }
      this.coinArc(c0 + used + Math.floor(bw / 2), base - 2, 1);
      used += bw;
      this.bed(c0 + used, island, base);
      used += island;
    }
    if (used < len) this.bed(c0 + used, len - used, base);
    this.lastTop = base;
    return len;
  }

  /**
   * 洞窟：地面微抬，上方铺顶板并垂下钟乳石；钟乳石最低到头顶上方 2 格，
   * 不会把通路堵死。34 行关顶更高，允许在洞内加一块可选平台。
   */
  cave(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    const rise = this.rows >= 34 ? this.ri(1, 3) : this.ri(0, 2);
    const top = this.clampTop(base - rise);
    const lead = Math.max(2, rise + 1);
    this.slope(c0, lead, top);
    let used = lead;
    const inner = len - lead * 2;
    if (inner < 8) {
      if (used < len) this.slope(c0 + used, len - used, base);
      return len;
    }
    this.bed(c0 + used, inner, top);
    used += inner;
    const ceil = Math.max(2, top - (this.rows >= 34 ? 7 : 5));
    const x0 = c0 + lead + 1;
    const x1 = c0 + len - lead - 2;
    // 顶板（中段加厚一层）
    for (let x = x0; x < x1; x++) {
      this.set(x, ceil, DIRT);
      if ((x - x0) % 3 !== 0) this.set(x, ceil - 1, DIRT);
    }
    // 钟乳石：最低不超过 top-4，保证头顶留出通行空间
    const maxHang = Math.max(0, Math.min(2, (top - 4) - ceil));
    for (let x = x0 + 2; x < x1 - 1; x += this.ri(3, 5)) {
      const hang = Math.min(maxHang, this.ri(0, 2));
      for (let j = 1; j <= hang; j++) {
        this.set(x, ceil + j, this.chance(0.35) ? 'V' : DIRT);
      }
    }
    // 两端单向木梁支撑（可穿过）
    for (const px of [c0 + lead, c0 + len - lead - 1]) {
      for (let r = ceil; r < top - 1; r++) this.set(px, r, '=');
    }
    if (this.rows >= 34) {
      this.platform(c0 + used - Math.floor(inner / 2), Math.max(2, top - 3), 3);
    }
    this.coins(c0 + lead + 2, top - 2, 4);
    if (used < len) this.slope(c0 + used, len - used, base);
    return len;
  }

  /** 尖刺+坑组合：踩尖刺前有踏板，坑前有落脚点，坑宽 <=3。 */
  gauntlet(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    let used = 0;
    this.bed(c0, 3, base);
    used = 3;
    const rounds = this.rows >= 34 ? this.ri(2, 3) : this.ri(2, 2);
    for (let k = 0; k < rounds; k++) {
      const sw = this.ri(2, 3);
      if (used + sw + 6 > len) break;
      // 尖刺列的地面也要铺：它们位于前一段平地之后
      this.bed(c0 + used, sw, base);
      for (let i = 0; i < sw; i++) this.set(c0 + used + i, base - 1, '^');
      const pw = Math.max(3, sw);
      this.platform(c0 + used, base - 3, pw);
      this.coins(c0 + used, base - 4, pw);
      used += sw;
      this.bed(c0 + used, 2, base);
      used += 2;
      const gapW = this.ri(2, 3);
      if (used + gapW + 3 > len) break;
      this.hole(c0 + used, gapW, base);
      used += gapW;
      this.bed(c0 + used, 3, base);
      used += 3;
    }
    if (used < len) this.bed(c0 + used, len - used, base);
    this.lastTop = base;
    return len;
  }

  /** 瀑布/水面+浮台：池底逐列下潜 1 格，水面上方架宽 3 的单向浮台。 */
  waterfall(len) {
    const c0 = this.cursor;
    const t = this.groundTop();
    const n = Math.min(len - 10, this.ri(6, 9));
    for (let i = 0; i < len; i++) {
      const c = c0 + i;
      let top = t;
      if (i >= 3 && i <= n + 2) top = t + 1;
      if (i >= 4 && i <= n + 1) top = t + 2;
      this.commit(c, top);
      if (top > t) {
        this.set(c, top - 1, 'W');
        if (top === t + 2) this.set(c, top - 2, 'W');
        this.surface[c] = 'W';
      }
    }
    this.lastTop = t;
    // 水面上方 2 格的成串浮台，落差 2 格、宽 3 列，替代游泳的快速路线
    for (let px = 3; px + 3 <= n + 3; px += 5) {
      this.platform(c0 + px, t - 2, 3);
      this.coins(c0 + px, t - 3, 3);
    }
    if (this.pDrop(0.5)) this.power(c0 + 2, t - 1);
    return len;
  }

  /** 之字高地：在两档高度之间来回折，每档台面 3 列，全程每列 <=1。 */
  zigzag(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    const high = this.clampTop(base - (this.rows >= 34 ? this.ri(3, 4) : 2));
    const low = base;
    let used = 0;
    if (len >= 8) {
      this.slope(c0, 2, high);
      used = 2;
    }
    let goingUp = false;
    while (len - used >= 7) {
      const seg = Math.min(3, len - used - 3);
      this.slope(c0 + used, seg, goingUp ? high : low);
      used += seg;
      const top = this.top[c0 + used - 1];
      this.bed(c0 + used, 3, top);
      this.coins(c0 + used, top - 1, 3);
      used += 3;
      goingUp = !goingUp;
    }
    if (used < len) this.slope(c0 + used, len - used, base);
    return len;
  }

  /** 地板多坑：平地 + 2~4 个 1~3 列宽的坑，坑与坑之间留 3 列落脚。 */
  floorHoles(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    let used = 0;
    this.bed(c0, 3, base);
    used = 3;
    const holes = this.rows >= 34 ? this.ri(3, 4) : this.ri(2, 3);
    for (let k = 0; k < holes; k++) {
      const w = this.ri(1, this.rows >= 34 ? 3 : 2);
      if (used + w + 3 > len - 1) break;
      this.hole(c0 + used, w, base);
      this.coinArc(c0 + used + Math.floor(w / 2), base - 2, Math.max(1, Math.floor(w / 2)));
      used += w;
      const land = Math.min(this.ri(3, 5), len - used - 1);
      if (land <= 0) break;
      this.bed(c0 + used, land, base);
      used += land;
    }
    if (used < len) this.bed(c0 + used, len - used, base);
    this.lastTop = base;
    return len;
  }

  /** 岩檐：头顶横出一段岩板，下方留 3 格通行；檐下塞金币和小 P 点。 */
  overhang(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    this.bed(c0, len, base);
    const w = Math.min(len - 6, this.ri(5, 8));
    // 岩檐在头顶 4 格处，不夹到 minTop，抬升地形上也能保持通行空间
    const row = Math.max(2, base - 4);
    for (let i = 0; i < w; i++) {
      this.set(c0 + 2 + i, row, DIRT);
      if (i < w - 2) this.set(c0 + 2 + i, row - 1, DIRT);
    }
    this.coins(c0 + 3, base - 2, Math.min(4, w - 2));
    if (this.pDrop(0.5)) this.power(c0 + 4, base - 2);
    return len;
  }

  /** 树冠高地：土丘抬 1~3 格，头顶铺藤蔓树冠，树冠下留 3 格通行。 */
  canopy(len) {
    const c0 = this.cursor;
    const base = this.groundTop();
    const rise = this.rows >= 34 ? this.ri(2, 3) : this.ri(1, 2);
    const top = this.clampTop(base - rise);
    const ramp = rise + 1;
    this.slope(c0, ramp, top);
    let used = ramp;
    const mound = Math.min(len - used - ramp, this.ri(7, 11));
    if (mound < 4) {
      if (used < len) this.slope(c0 + used, len - used, base);
      return len;
    }
    this.bed(c0 + used, mound, top);
    used += mound;
    const crown = Math.max(2, top - (this.rows >= 34 ? 8 : 5));
    const maxHang = Math.max(0, Math.min(2, top - 4 - crown));
    const x0 = c0 + 2;
    const x1 = c0 + len - 2;
    for (let x = x0; x < x1; x += this.ri(3, 5)) {
      const w = Math.min(this.ri(2, 3), x1 - x);
      for (let i = 0; i < w; i++) this.set(x + i, crown, 'V');
      const hang = Math.min(maxHang, this.ri(0, 2));
      for (let j = 1; j <= hang; j++) this.set(x + Math.floor(w / 2), crown + j, 'V');
    }
    this.coins(c0 + used - mound + 2, top - 1, Math.min(4, mound - 1));
    if (used < len) this.slope(c0 + used, len - used, base);
    return len;
  }

  /* ---------- 收尾 ---------- */
  /**
   * 中途 Boss 舞台（STAGE5 的妖梦）：把关卡中段挖成和关底 Boss 场同一层的空地。
   *
   * gen.midboss 的几何用「距关卡右端像素」描述（与 stage.js 的触发线共用 levels.js
   * 里同一份配置），这里换算成列。之所以在 placeEntities 最前面就挖好：
   * 后面的检查点 / 小怪 / 金币 / P 点都按「这段已经是平地」来判定，
   * 不会先刷出小怪再被清场抹掉（那样小怪数和火力补偿都会算不准）。
   *
   * @returns {{ms:number, me:number}|null} 舞台列区间 [ms, me)
   */
  _prepareMidbossArena() {
    const m = this.gen.midboss;
    if (!m) return null;
    const half = Math.max(6, Math.round((m.arenaHalf || 900) / 32));
    const center = this.cols - Math.round((m.arenaFromEnd || 0) / 32);
    // 舞台靠左时不再硬性留 60 列：STAGE5 的第一个道中已取消，舞台左边就是开场准备区，
    // 具体还剩多少列由 cols 与 arenaFromEnd 决定（见 _prepareOpening）。
    const ms = Math.max(8, center - half);
    // 不侵入关底 Boss 场（最后 50 列），中间至少留 4 列过渡
    const me = Math.min(this.cols - 54, center + half);
    if (me - ms < 8) return null;

    const entryTop = ms > 0 ? this.top[ms - 1] : this.ground;
    for (let c = ms; c < me; c++) {
      this.commit(c, this.ground);
      for (let r = 0; r < this.ground; r++) this.set(c, r, AIR);
    }
    // 从更高的主路直接跳下来时补一段单向平台当落脚点（和关底 Boss 场同款处理）
    if (entryTop <= this.ground - 4) {
      this.platform(ms, Math.round((entryTop + this.ground) / 2), Math.min(18, me - ms));
    }
    // 出口缓坡：舞台地面在本关最低层，直接接主路会出现一堵跳不上去的高墙。
    // 用 8 列把地面抬回原高度（每列最多抬 1 格，与生成器的可跳性约束一致）。
    // 8 列要抬 8 格太陡（每步都是 1 格宽的竖阶），留够长度时铺成 ~0.6 格/列，跳起来顺手
    const rampLen = Math.min(14, this.cols - me - 51);
    if (rampLen > 0) {
      const exitTop = this.top[me + rampLen] || this.ground;
      // 坡道这几列原来的地形可能比舞台高很多：flush() 只会把地面往下重写，
      // 上层残留的实心块会变成一堵跳不上去的墙（打完妖梦卡在这里）。
      // 先把坡道各列的「舞台地面以上」全部挖空，再交给 slope 落坡。
      for (let i = 0; i < rampLen; i++) {
        const c = me + i;
        for (let r = 0; r < this.ground; r++) this.set(c, r, AIR);
      }
      this.slope(me, rampLen, exitTop);
    }
    return { ms, me };
  }

  /**
   * 开场准备区（STAGE5 专用）。
   *
   * 第一个道中取消后，关卡从妖梦舞台左侧直接开场：把关卡起点到舞台入口这一整段
   * 铺成和舞台同层的平地，再把 P 点与 1UP 摆在路面上 —— 补给只放在地图上，
   * 由玩家自己走过去捡（引擎不再在开战时直接补火力，见 levels.js 的 opening）。
   *
   * @returns {{to:number, power:number, life:number}|null} 准备区末列与实际放置数量
   */
  _prepareOpening(mid) {
    const m = this.gen.midboss;
    const open = m && m.opening;
    if (!mid || !open) return null;
    const prep = mid.ms; // 准备区 = 关卡起点到舞台入口（舞台本身由 _prepareMidbossArena 铺平）
    if (prep < 16) return null;
    for (let c = 0; c < prep; c++) {
      this.commit(c, this.ground);
      for (let r = 0; r < this.ground; r++) this.set(c, r, AIR);
    }
    // 一枚道具找最近的空格：优先贴地（看得见、走过去就吃到），被占就往上让一格
    const put = (c, ch) => {
      for (let r = this.ground - 1; r >= this.ground - 4; r--) {
        if (this.get(c, r) === AIR) { this.set(c, r, ch); return true; }
      }
      return false;
    };
    // 出生点贴在左端，整段准备区都留出来给玩家捡东西
    this.set(3, this.ground - 1, 'P');
    this.coins(6, this.ground - 2, 4);
    const nPower = Math.max(0, Math.min(8, Math.round(open.power || 0)));
    const nLife = Math.max(0, Math.min(2, Math.round(open.life || 0)));
    // P 点从出生点右侧均匀铺到妖梦线前：一路捡过去，走到线前刚好捡完
    const left = 10;
    const span = Math.max(1, prep - 6 - left);
    let power = 0;
    for (let i = 0; i < nPower; i++) {
      const c = Math.round(left + (span * (i + 0.5)) / nPower);
      if (put(c, 'p')) power += 1;
    }
    // 1UP 收在准备区最后几列：进战前的最后一份补给
    let life = 0;
    for (let i = 0; i < nLife; i++) {
      if (put(prep - 3 - i * 2, 'U')) life += 1;
    }
    return { to: prep, power, life };
  }

  /**
   * 舞台出口 → 关底场之间的检查点。
   *
   * 通用检查点从第 200 列才开始（见构造函数的 nextCheckpoint），STAGE5 新版只有 208 列：
   * 打掉妖梦后还有一整段第二道中，这段路上死一次不该被扔回舞台入口。
   * 只在出口缓坡之后的实地上放灯笼，地形不满足就直接跳过（不强改地形）。
   *
   * @param {{ms:number, me:number}|null} mid
   * @returns {number} 检查点列号，-1 = 没放
   */
  _placePostArenaCheckpoint(mid) {
    if (!mid) return -1;
    const rampLen = Math.max(0, Math.min(14, this.cols - mid.me - 51));
    const start = mid.me + rampLen + 4;
    const end = this.cols - 60;
    for (let c = start; c < end; c++) {
      const surf = this.surface[c];
      if (this.gap[c] || (surf !== GRASS && surf !== DIRT)) continue;
      // 脚下三列同高：复活点不能压在台阶/窄台边缘
      if (this.top[c - 1] !== this.top[c] || this.top[c + 1] !== this.top[c]) continue;
      const row = this.top[c] - 1;
      if (row <= 1 || this.get(c, row) !== AIR) continue;
      this.set(c, row, 'C');
      this.coins(c + 2, row, 3);
      return c;
    }
    return -1;
  }

  /**
   * 坑前起跳区：把每个无底坑左侧 3 列铺成同高、干净的平地。
   *
   * 生成器偶尔会在坑前留一格窄台阶（STAGE6 的 col 1109 就是「1 格窄台 + 3 列无底坑」），
   * 起跳点只有 32px 宽：自动玩家会踩空，人手也容易踩偏。这里只动坑左侧 3 列，
   * 取三列里最高的地面当基准（不往下挖，避免把金币/装饰擦掉），并夹到与更左一列
   * 高差 <=1，保证「走近 → 站定 → 起跳」是一条平路。
   *
   * 只处理 Boss 场（最后 50 列）之前的坑，关底地形保持原样。
   */
  _widenPitRunways() {
    const limit = Math.max(0, this.cols - 50);
    for (let c = 3; c < limit; c++) {
      if (!this.gap[c] || this.gap[c - 1]) continue; // 只看每段坑的第一列
      let base = Math.min(this.top[c - 1], this.top[c - 2], this.top[c - 3]);
      // 与再左一列的高差压到 1 格以内，别在起跳区左侧造一堵墙
      const left = this.top[c - 4];
      if (Number.isFinite(left)) base = Math.max(left - 1, Math.min(left + 1, base));
      for (let d = 1; d <= 3; d++) {
        const col = c - d;
        const old = this.top[col];
        // 先清掉这一列原来的地表以上所有东西（尖刺、单向台、蘑菇等）
        for (let r = 0; r < Math.max(old, base); r++) this.set(col, r, AIR);
        this.commit(col, base);
      }
    }
  }

  placeEntities() {
    // 舞台先挖：见 _prepareMidbossArena 的注释
    const mid = this._prepareMidbossArena();
    // 开场准备区（STAGE5）：舞台左侧铺平地 + 摆好 4 枚 P 点与 1UP，
    // 必须在刷金币 / 小怪之前落地，否则道具会被后续模板盖掉。
    const opening = this._prepareOpening(mid);
    // 坑前起跳区（放在舞台之后：舞台出口坡道不会再被误抬）
    this._widenPitRunways();
    const lastSafe = this.cols - 70;
    // 中途 Boss 舞台窗口：金币 / 小怪都不进这一段（窗口比舞台左右各多留 10 列）
    const MID_MARGIN = 10;
    const inMidWindow = (c) => !!mid && c >= mid.ms - MID_MARGIN && c < mid.me + MID_MARGIN;
    let lastBest = -1;
    // 检查点：等距放在平地上；尖刺/水面/冰面/蘑菇弹床/碎砖/已有装饰占位的列跳过。
    // 只认「普通草皮/土」地表：检查点落在 'M' 上会让玩家复活瞬间被弹床弹飞，
    // 落在碎砖 'B' 上会随砖块崩落而失效。
    const cpSafe = (c) => {
      const surf = this.surface[c];
      return !this.gap[c] && (surf === GRASS || surf === DIRT);
    };
    for (let target = this.nextCheckpoint; target < lastSafe; target += (this.checkpointGap || 260)) {
      let best = -1;
      // 在 160 列内找一块干净的实地；真正找不到时兜底占用第一个安全实地列
      for (let d = 0; d < 160; d++) {
        const c = target + d;
        if (c >= lastSafe) break;
        if (!cpSafe(c)) continue;
        // 脚下 3 列同高：避免落点压在 1 格窄台/台阶边缘，复活后一迈步就掉下去
        if (this.top[c - 1] !== this.top[c] || this.top[c + 1] !== this.top[c]) continue;
        const row = this.top[c] - 1;
        if (row <= 1) continue;
        if (this.get(c, row) !== AIR) continue;
        best = c;
        break;
      }
      if (best < 0) {
        for (let c = target; c < Math.min(target + 160, lastSafe); c++) {
          if (cpSafe(c)) { best = c; this.set(c, this.top[c] - 1, AIR); break; }
        }
      }
      if (best < 0) continue;
      lastBest = best;
      const row = this.top[best] - 1;
      this.set(best, row, 'C');
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
    // 短关卡（STAGE5 新版只有 208 列）通用检查点一个都放不下：舞台出口到关底之间
    // 还有一整段第二道中，单独在坡道之后的实地上补一个灯笼（见 _placePostArenaCheckpoint）。
    const postCp = this._placePostArenaCheckpoint(mid);

    // 金币串 / 妖精：从第 40 列开始，避开 Boss 场、中途舞台窗口与检查点附近
    for (let c = 40; c < lastSafe; c += this.ri(11, 19)) {
      if (inMidWindow(c)) continue;
      if (this.gap[c]) {
        if (c + 1 < this.cols && !this.gap[c + 1]) this.coinArc(c, this.top[c] - 2, 2);
        continue;
      }
      const t = this.top[c];
      if (this.chance(0.55)) this.coins(c, t - 2, this.ri(2, 4));
      if (this.pDrop(0.30)) this.power(c + 1, t - 1);
    }

    // 小怪刷点：先收集合法地面格，再按「每屏目标数」等距取样（旧版按列随机步进，各面波动 ±15%）。
    // 妖精实体不参与地形碰撞：只写在 AIR 格上 → 不堵路、不改可跳性；
    // 同时跳过蘑菇面与检查点，保证检查点/复活点干净。
    const groundSlots = [];
    for (let c = 60; c < lastSafe; c++) {
      if (this.gap[c] || this.surface[c] === 'M') continue;
      const row = this.top[c] - 1;
      if (this.get(c, row) !== AIR) continue;
      if (this.get(c + 1, row) === 'C') continue;
      // 坑边留安全距离：离坑（含 2 列小坑）2 格内的位置不刷地面兵，
      // 免得踩踏/受击的弹跳把人带进坑里，也避免自动玩家在坑沿被逼出失误。
      let nearGap = false;
      for (let d = -6; d <= 6 && !nearGap; d++) nearGap = !!this.gap[c + d];
      if (nearGap) continue;
      groundSlots.push(c);
    }
    const spawn = MONSTER_SPAWN[this.gen.style] || MONSTER_SPAWN.shrine;
    const screens = this.cols / 40;
    const totalTarget = Math.max(4, Math.round(spawn.perScreen * screens));
    const sTarget = Math.max(1, Math.round((totalTarget * spawn.groundRatio) / (1 + spawn.groundRatio)));
    const fTarget = Math.max(1, totalTarget - sTarget);
    /** 在合法刷点列上等距取 count 个（确定性；不同 seed 的合法格分布不同，位置仍然自然） */
    const pickEven = (count) => {
      const picked = [];
      const n = groundSlots.length;
      if (!n) return picked;
      for (let k = 0; k < count; k++) {
        picked.push(groundSlots[Math.min(n - 1, Math.floor(((k + 0.5) / count) * n))]);
      }
      return picked;
    };
    // 中途 Boss 舞台取消小怪：窗口内本来会刷的 s / f 不再出场。
    // 小怪火力按 POWER.kill=1 点/只、P 点按 POWER.pickup=4 点/枚折算成舞台上的 P 点，
    // 让玩家进战前的火力与「没取消小怪」持平（略高）：撤掉小怪 ≠ 白扣玩家火力。
    // 窗口比舞台左右各多留 10 列：入场前最后一段和出口缓坡也不放怪，跑进战场不会迎面撞上妖精。
    // （MID_MARGIN / inMidWindow 已在 placeEntities 顶部定义，金币串也用它避开舞台。）
    let midSuppressed = 0;
    for (const c of pickEven(sTarget)) {
      if (inMidWindow(c)) { midSuppressed += 1; continue; }
      this.set(c, this.top[c] - 1, 's');
    }
    // 空中妖精：单独取样，偶尔与地面点同列（看起来像一高一低伴飞）
    const airRange = this.rows >= 34 ? 8 : 6;
    for (const c of pickEven(fTarget)) {
      if (inMidWindow(c)) { midSuppressed += 1; continue; }
      let fr = this.top[c] - this.ri(3, airRange);
      let guard = 0;
      while (this.get(c, fr) !== AIR && fr > 1 && guard < airRange) { fr--; guard++; }
      if (this.get(c, fr) === AIR) this.set(c, fr, 'f');
    }
    // 火力补偿 P 点：铺在舞台地面上（进场一路捡过去），数量 = 被取消小怪的总火力 / 单枚 P 值。
    // STAGE5 新版由开场准备区直接摆 P 点（见 _prepareOpening），舞台上不再额外撒补给；
    // 至少 2 枚：本关窗口内的取样可能只有 0~1 只小怪，空舞台也要留下补给感。
    let midP = 0;
    if (mid && !opening) {
      midP = Math.min(8, Math.max(2, Math.ceil((midSuppressed * POWER.kill) / POWER.pickup)));
      const span = Math.max(1, mid.me - mid.ms - 6);
      for (let i = 0; i < midP; i++) {
        const c = mid.ms + 3 + Math.round((span * (i + 0.5)) / midP);
        // 舞台地面在 ground 行；P 点放在地面上方，被地形/金币占住就往上找一格
        for (let r = this.ground - 2; r >= this.ground - 5; r--) {
          if (this.get(c, r) === AIR) { this.set(c, r, 'p'); break; }
        }
      }
    }
    this.midbossInfo = mid
      ? { from: mid.ms, to: mid.me, suppressed: midSuppressed, power: midP, opening }
      : null;

    // 出生点：有开场准备区时由 _prepareOpening 负责（它已铺好平地、摆好 4P + 1UP）；
    // 其余关卡照旧在开头清出 20 列平地。
    if (!opening) {
      for (let c = 0; c < Math.min(20, this.cols); c++) {
        this.commit(c, this.ground);
        for (let r = 0; r < this.ground; r++) this.set(c, r, AIR);
      }
      this.set(2, this.ground - 1, 'P');
      this.coins(6, this.ground - 2, 4);
    }

    // Boss 场：最后 50 列平地，终点旗在前一点的位置
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
    // 出生点前 24 列固定平地：清场后不会在出生点右侧留下台阶
    this.bed(0, Math.min(24, this.cols), this.ground);
    this.cursor = Math.min(24, this.cols);
    while (this.cursor < end) {
      let roll = this.rnd() * total;
      let name = 'flat';
      for (const [n, w] of chunks) { roll -= w; if (roll <= 0) { name = n; break; } }
      let len = 0;
      switch (name) {
        case 'flat': len = this.ri(8, 12); this.flat(len); break;
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
        // 新增模板
        case 'terraces': len = this.ri(18, 26); this.terraces(len); break;
        case 'canyon': len = this.ri(16, 22); this.canyon(len); break;
        case 'tower': len = this.ri(14, 18); this.tower(len); break;
        case 'bridgeChain': len = this.ri(14, 20); this.bridgeChain(len); break;
        case 'cave': len = this.ri(16, 22); this.cave(len); break;
        case 'gauntlet': len = this.ri(15, 21); this.gauntlet(len); break;
        case 'waterfall': len = this.ri(14, 18); this.waterfall(len); break;
        case 'zigzag': len = this.ri(16, 22); this.zigzag(len); break;
        case 'floorHoles': len = this.ri(14, 18); this.floorHoles(len); break;
        case 'overhang': len = this.ri(12, 16); this.overhang(len); break;
        case 'canopy': len = this.ri(18, 24); this.canopy(len); break;
        default: len = 10; this.flat(len);
      }
      this.cursor += len;
      this.chunkStats[name] = (this.chunkStats[name] || 0) + 1;
      this.chunkLog.push({ name, start: this.cursor - len, len });
      if (len <= 0) break;
      // 地块之间加 1 列 ±1 的微台阶：打断连续平地，也避免「长直跑道」；
      // 台阶本身满足每列高差 <=1，不会影响可跳性。
      if (this.cursor < end - 1) {
        const cur = this.top[this.cursor - 1];
        const minT = this.clampTop(-999);
        let dir = cur >= this.ground ? -1 : cur <= minT ? 1 : (this.chance(0.5) ? -1 : 1);
        let target = this.clampTop(cur + dir);
        if (target === cur) {
          dir = -dir;
          target = this.clampTop(cur + dir);
        }
        if (target !== cur) {
          this.slope(this.cursor, 1, target);
          this.cursor += 1;
          this.stepCount += 1;
          this.chunkLog.push({ name: 'step', start: this.cursor - 1, len: 1 });
        }
      }
    }
    // 尾巴：先补平地到结尾
    while (this.cursor < this.cols) { this.flat(1); this.cursor++; }
    this.placeEntities();
    // 清场/收尾可能抹掉个别崩落砖，只保留仍真实存在的砖块坐标
    this.crumble = this.crumble.filter(([cx, cy]) => this.cells[cy] && this.cells[cy][cx] === 'B');
    return this.cells.map((row) => row.join(''));
  }
}

/**
 * 生成关卡字符行。
 * @param {object} gen 关卡生成配置
 * @returns {{rows:string[], crumble:[number,number][], midboss?:object|null, chunkStats?:object}}
 *   midboss: 中途 Boss 舞台的列区间与补偿统计（gen.midboss 存在时才有），不参与 Level 解析。
 */
export function buildLevelRows(gen) {
  if (!gen) return { rows: [], crumble: [] };
  if (gen.kind === 'stg') {
    const rows = Array.from({ length: gen.rows || 22 }, () => AIR.repeat(gen.cols));
    return { rows, crumble: [] };
  }
  const b = new Builder(gen);
  const rows = b.build();
  const out = { rows, crumble: b.crumble, midboss: b.midbossInfo };
  if (gen.collectStats) {
    out.chunkStats = b.chunkStats;
    out.debug = { top: Array.from(b.top), gap: Array.from(b.gap), chunks: b.chunkLog, steps: b.stepCount, midboss: b.midbossInfo };
  }
  return out;
}
