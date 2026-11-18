/**
 * 分数（SCORE）全局规则 —— 一处定义，玩家 / 关卡 / HUD / 存档共用。
 *
 * 设计（对齐东方正作的计分骨架，适配「平台跳跃 + 弹幕」混合形态）：
 *  - 擦弹给分，且带连击倍率：连续擦弹不断，倍率一路涨到 2.0；
 *    停手约 2 秒后倍率平滑衰减回 1.0。原作是 graze 数直接换分，
 *    本作改为倍率，是因为擦弹本来就是「贴着子弹走」的操作秀，
 *    让它有一个可见的涨落过程比单纯堆数字更有手感（也让 HUD 的倍率条有意义）。
 *  - 拾取 / 击破 / 符卡收取 / 通关各有一档基础分。
 *  - 分数只增不减：所有入口只接受正的有限数，负数/NaN 一律丢弃。
 *    同一次事件重复上报（例如一帧里两次命中判定）靠 `kill(kind, id)` 的去重表挡住。
 *
 * 分数不做难度系数：难度已经体现在「能不能打下去」和残机/擦弹数上，
 * 再乘一层系数会让不同难度的榜互相不可比，反而降低重玩动力。
 *
 * 计分单位刻意取整（不为浮点分留位置）：HUD 是补零显示，
 * 出现 1234.56 这种分数只会让人以为显示坏了。
 */

/** localStorage 键：榜单独占一个键，和设置 / 进度 / 键位互不影响 */
const SCORE_KEY = 'hks.score.v1';

/**
 * 每档（关卡 × 难度）保留的名次数。
 * ponytail: 只存 5 条 —— 东方正作也是 top 5 起，且 localStorage 每档 5 条
 * 已经够玩家知道「自己离榜首多远」。真要做完整排行榜（分页、好友、云端）
 * 再换成服务端存储，那时这个常量会被一起换掉。
 */
const TOP_N = 5;

export const SCORE = Object.freeze({
  digits: 8,              // 补零位数（东方正作的 8 位显示）

  // ---- 擦弹 ----
  graze: 30,              // 每颗擦弹的基础分（乘上当前倍率）
  grazeStep: 50,          // 每累计 50 颗擦弹，倍率 +0.1
  grazeStepGain: 0.1,
  grazeMultMax: 2.0,      // 倍率上限
  grazeHold: 2.0,         // 停手多久（秒）后倍率开始回落
  grazeFall: 0.6,         // 回落速度（倍率/秒）：从 2.0 掉回 1.0 约 1.7 秒

  // ---- 拾取 ----
  coin: 300,              // 金币
  power: 50,              // P 点
  oneup: 5000,            // 1UP 道具（残机直接 +1，分数给个整数好认）

  // ---- 击破 ----
  killFairy: 200,         // 道中杂兵 / 飞怪
  killMidboss: 5000,      // 小头目
  killBoss: 20000,        // Boss 一整场（不是每张符卡）

  // ---- 符卡收取（只管分数，POWER / 1UP 奖励在 stage.js 里照旧）----
  cardBase: 50000,        // 按时击破的基础分
  cardNoHitMul: 2,        // 无伤再乘这个系数（按时 + 无伤 = 10 万）
  cardOvertime: 8000,     // 超时保底分：还给一点，别让人白打

  // ---- 通关结算 ----
  clearLife: 100000,      // 每剩一条残机
  clearGrazePer: 100,     // 每颗擦弹
  clearNoContinue: 500000,// 一次续命都没用过的额外奖励
});

/**
 * 分数补零显示（东方风格 8 位）。
 * 负数 / NaN 统一当 0：分数不可能为负，出现负数只说明上游算错了。
 */
export function formatScore(n = 0) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return String(v).padStart(SCORE.digits, '0');
}

/**
 * 一次游玩（一关）的计分器。
 *
 * 为什么要对象而不是纯函数：擦弹倍率是有状态的（连击、停手计时），
 * 这些状态必须跟着「本关」走，死亡 / 复活都不清（清分会惩罚玩家，和设计相反），
 * 只有换关 / 重开时才 reset()。
 */
export class Score {
  constructor() {
    this.reset();
  }

  reset() {
    this._total = 0;        // 总分
    this._graze = 0;        // 本关擦弹数（HUD 与通关结算都要用）
    this._mult = 1;         // 当前倍率（浮点）
    this._idle = 0;         // 距上次擦弹的秒数
    this._seen = new Map(); // 击破去重表：id → true（有上限，见 kill()）
  }

  /** 当前总分 */
  get total() {
    return this._total;
  }

  /** 本关累计擦弹数 */
  get grazeCount() {
    return this._graze;
  }

  /** 当前擦弹倍率（1.0 起，封顶 SCORE.grazeMultMax） */
  get mult() {
    return this._mult;
  }

  /**
   * 加分入口：唯一写 _total 的地方。
   * 只接受正的有限数 —— 分数只增不减是硬规则，任何上游算错都不该把分扣掉。
   */
  _add(points) {
    const p = Math.floor(Number(points));
    if (!Number.isFinite(p) || p <= 0) return 0;
    this._total += p;
    return p;
  }

  /**
   * 擦弹计分：n 颗擦弹，按当前倍率结算后倍率上涨。
   * 上涨放在结算之后 —— 这样「第 50 颗」那一颗仍按旧倍率给分，
   * 玩家看到的倍率跳变和拿到的分数是对应的。
   */
  graze(n = 1) {
    const g = Math.floor(Number(n));
    if (!Number.isFinite(g) || g <= 0) return 0;
    this._graze += g;
    this._idle = 0;
    const got = this._add(g * SCORE.graze * this._mult);
    // 倍率按累计擦弹数推算到「本次应到的档位」，而不是按帧 +0.002：
    // 一次擦到 3 颗时倍率应该一次跳到位，不能少算。
    this._raiseMult();
    return got;
  }

  /** 按累计擦弹数把倍率抬到该有的档位（只升不降，降由 tick 负责） */
  _raiseMult() {
    const target = 1 + Math.floor(this._graze / SCORE.grazeStep) * SCORE.grazeStepGain;
    const capped = Math.min(SCORE.grazeMultMax, target);
    if (capped > this._mult) this._mult = capped;
  }

  /**
   * 每帧推进：停手超过 grazeHold 后倍率开始回落。
   * 单独一个方法而不是塞进 graze()，是因为「不擦弹」也需要被驱动 ——
   * 玩家停手时不会有任何输入事件，只能靠帧回调把倍率降下去。
   */
  tick(dt = 0) {
    const d = Number(dt);
    if (!Number.isFinite(d) || d <= 0) return this._mult;
    if (this._mult <= 1) return this._mult;
    this._idle += d;
    if (this._idle <= SCORE.grazeHold) return this._mult;
    this._mult = Math.max(1, this._mult - SCORE.grazeFall * d);
    // 倍率降到 1 就位时把累计擦弹数清零：连击彻底断了，
    // 否则下次擦弹会因为 graze 总数很高而瞬间蹦回上限，衰减就白做了。
    if (this._mult <= 1) this._graze = 0;
    return this._mult;
  }

  /** 拾取：'coin' | 'power' | 'oneup' */
  item(kind) {
    if (kind === 'coin') return this._add(SCORE.coin);
    if (kind === 'oneup') return this._add(SCORE.oneup);
    return this._add(SCORE.power);
  }

  /**
   * 击破：'fairy' | 'midboss' | 'boss'
   * id 可选；给了就去重 —— 同一只敌人被 `enemyKill` 和 `stomp` 双报时不重复计分。
   */
  kill(kind, id) {
    if (id != null) {
      if (this._seen.has(id)) return 0;
      // 去重表只留最近 256 条：同屏敌人不会超过这个量级，
      // 老 id 掉出去之后即使被重报，那也已经是「另一个时代」的击破了。
      // ponytail: 定长 FIFO 而不是 Set 全留。若将来出现「一关内同一 id 合法
      // 复活后再次击破」的玩法，需要改成按 boss/card 轮次清表。
      if (this._seen.size >= 256) this._seen.delete(this._seen.keys().next().value);
      this._seen.set(id, true);
    }
    if (kind === 'midboss') return this._add(SCORE.killMidboss);
    if (kind === 'boss') return this._add(SCORE.killBoss);
    return this._add(SCORE.killFairy);
  }

  /**
   * 符卡收取的分数奖励（POWER / 1UP 那套不在这里，别重复实现）。
   * opts.onTime：是否在限时内击破；opts.noHit：是否无伤。
   * 超时给保底分，且不吃无伤系数 —— 超时那一刻这张卡的「收取」已经失败了。
   */
  cardClear(opts = {}) {
    const onTime = opts.onTime !== false;
    if (!onTime) return this._add(SCORE.cardOvertime);
    const got = SCORE.cardBase * (opts.noHit ? SCORE.cardNoHitMul : 1);
    return this._add(got);
  }

  /**
   * 通关结算：残机 × 固定分 + 擦弹 × 固定分 + 无续命奖励。
   * 返回明细，方便结算画面逐行显示（分数本身已经加进 total 了）。
   */
  stageClear(opts = {}) {
    const lives = Math.max(0, Math.floor(Number(opts.lives) || 0));
    const graze = Math.max(0, Math.floor(Number(opts.graze) || this._graze));
    const continues = Math.max(0, Math.floor(Number(opts.continues) || 0));
    const lifeBonus = this._add(lives * SCORE.clearLife);
    const grazeBonus = this._add(graze * SCORE.clearGrazePer);
    const continueBonus = continues === 0 ? this._add(SCORE.clearNoContinue) : 0;
    return {
      lives: lifeBonus,
      graze: grazeBonus,
      noContinue: continueBonus,
      total: this._total,
    };
  }
}

/**
 * 读榜单。任何异常（没装过、被清过、旧版本结构、手工改坏）都返回空表 ——
 * 最高分属于「锦上添花」，读不出来绝不能让游戏崩在开局。
 */
export function loadBoard() {
  let raw = null;
  try {
    raw = localStorage.getItem(SCORE_KEY);
  } catch {
    return {}; // 隐私模式 / 禁用存储：当作没有榜
  }
  if (!raw) return {};
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  for (const stageId of Object.keys(data)) {
    const byDiff = data[stageId];
    if (!byDiff || typeof byDiff !== 'object' || Array.isArray(byDiff)) continue;
    const clean = {};
    for (const diff of Object.keys(byDiff)) {
      const list = byDiff[diff];
      if (!Array.isArray(list)) continue;
      const entries = list.filter(isEntry).slice(0, TOP_N);
      if (entries.length) clean[diff] = entries;
    }
    if (Object.keys(clean).length) out[stageId] = clean;
  }
  return out;
}

/** 单条记录的结构校验：坏一条就丢这条，不牵连整个榜 */
function isEntry(e) {
  return !!e && typeof e === 'object'
    && Number.isFinite(e.score) && e.score >= 0
    && typeof e.char === 'string';
}

function saveBoard(board) {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(board));
  } catch {
    // 忽略写入失败（配额满 / 隐私模式）：榜单丢了不影响本局
  }
}

/** 取某档的第一名分数（没有榜就 0），用于「差多少能破纪录」之类的提示 */
export function bestScore(stageId, difficulty) {
  const board = loadBoard();
  const list = board[stageId]?.[difficulty];
  return Array.isArray(list) && list.length ? list[0].score : 0;
}

/**
 * 提交成绩到「关卡 × 难度」档，返回 { rank, best, isNew }。
 *  - rank：进榜后的名次（1 起）；没进前 TOP_N 返回 0
 *  - best：本次提交前的该档第一名（用来显示「NEW RECORD」时对比）
 *  - isNew：是否刷新了第一名（Lead 用它决定播不播 NEW RECORD 横幅）
 * 即使没进榜也会落盘（榜单本身不写），所以调用方不必自己判重。
 */
export function submitScore(stageId, difficulty, entry) {
  const key = String(stageId || '');
  const diff = String(difficulty || '');
  if (!key || !diff) return { rank: 0, best: 0, isNew: false };
  const board = loadBoard();
  const list = (board[key] && board[key][diff]) || [];
  const prevBest = list.length ? list[0].score : 0;

  const rec = {
    score: Math.max(0, Math.floor(Number(entry?.score) || 0)),
    char: String(entry?.char || 'reimu'),
    graze: Math.max(0, Math.floor(Number(entry?.graze) || 0)),
    date: String(entry?.date || localDate()),
  };
  const rank = list.filter((e) => e.score >= rec.score).length + 1;
  const isNew = rec.score > prevBest;

  if (rank <= TOP_N) {
    list.push(rec);
    // 分相同时先来的排前面（稳定排序），不让新成绩顶掉同分的老纪录
    list.sort((a, b) => b.score - a.score);
    list.length = Math.min(list.length, TOP_N);
    if (!board[key]) board[key] = {};
    board[key][diff] = list;
    saveBoard(board);
  }
  return { rank: rank <= TOP_N ? rank : 0, best: prevBest, isNew };
}

/** 本地日期 YYYY-MM-DD（用本地时间，不用 UTC：玩家眼里的「今天」是本地今天） */
function localDate(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 每日挑战种子：同一自然日的所有玩家拿到同一个种子。
 *
 * 用途（Lead 接线）：把返回值当成 `?seed=` 的数值塞给 main.js 已有的
 * Math.random 重写机制（`/[?&]seed=(\d+)/` + mulberry32），
 * 于是同一天开局的弹幕 / 掉落序列全球一致，分数榜才有可比性。
 * 返回值是「非零 32 位无符号整数」——和 main.js 的 `(Number(m[1])>>>0) || 1`
 * 完全兼容（0 会在那边退化成 1，这里直接保证不为 0）。
 *
 * 用 FNV-1a 而不是 Math.random：必须确定性、无状态，同一天调多少次都一样。
 */
export function dailySeed(date = new Date()) {
  const key = localDate(date);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

/** 当前本地日期的挑战标识（'2026-11-18'），客户端显示 / 存档比对用 */
export function dailyKey(date = new Date()) {
  return localDate(date);
}
