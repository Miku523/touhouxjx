/**
 * 符卡练习模式（Spell Practice）
 *
 * 东方正作的 Practice Start：直接从「某个 Boss 的第 N 张符卡」开打，
 * 不用把整面道中重跑一遍。本模块负责三件事：
 *
 *  1. 数据层：从 BOSS_DEFS / LEVELS 推出「可练习清单」，不硬编码任何卡名。
 *     卡名唯一真源是 BOSS_DEFS[key].phases[i].name —— bossPatternDesigns.js 的
 *     CARD_INDEX 与它有出入（且缺 remilia / flandre / sakuya），所以不引用。
 *  2. 开局配置：buildPracticeRun() 吐出一份能直接喂给 main.js startStage() 的参数。
 *  3. 页面 UI：整屏 DOM（和 musicRoom.js 同一个形状：show / hide / handleKey），
 *     列表按「面」分组、可滚动、可键盘导航，未解锁的显示「？？？」。
 *
 * 与游戏的约定：
 *  - 练习局**不碰 hks.progress.v1**，也不写任何排行榜；自己的记录单独存 hks.practice.v1。
 *    练习是为了练，不是为了刷——写进存档会把「通关」这件事稀释掉。
 *  - 打完一张卡就结束，不进下一张、不播结局（由宿主在 cardResult / clear 事件里截住）。
 *  - 键盘事件由宿主的 window keydown 转发给 handleKey()，返回 true 表示已消费。
 */

import { tr, getLang, localizeDom } from '../i18n/index.js';
import { BOSS_DEFS } from './boss.js';
import { LEVELS } from '../assets/levels.js';

/** 练习记录存档键。本模块独占，宿主不要读写。 */
export const PRACTICE_KEY = 'hks.practice.v1';

/** 练习局的固定规则（照东方正作的 Practice Start：残机有限、火力给够） */
export const PRACTICE_RULES = Object.freeze({
  // 3 残机：够玩家把一张卡的弹型看懂两三遍，又不会多到可以无脑硬吃。
  lives: 3,
  // 起手火力 Lv.4（POWER.perLevel=24 × 3 = 72，满 128）。
  // 理由：0 火力只有 Lv.1 单发、连符卡都放不出，等于让玩家在练弹幕的同时练生存；
  // EXTRA_TIMELINE.retryPower 也是 72，注释写的就是「别让复习从零开始」。
  power: 72,
  // 擦弹 / 得分从 0 起：这两项是「本局表现」的度量，带进去就分不清是练出来的还是带来的。
});

/* ------------------------------------------------------------------
 * 一、数据层：Boss → 面 → 符卡
 * ---------------------------------------------------------------- */

/**
 * EXTRA 三 Boss 没有普通关卡可借场地。
 * 练习局必须在「非 extra 的关」里跑：Stage 构造里 `this.extraChain = !!extra` 一旦为真，
 * beginBoss() 就会 spawnExMiniboss() 拉小头目进场，而且 EXTRA 关的道中曲/限时也会掺进来。
 * STAGE 4 是唯一的非 EXTRA 飞行关（mode:'stg'），弹幕战场地正合适，就借它。
 */
const HOST_STAGE_ID = 'stage4';

/**
 * Boss key → 面序号（LEVELS 下标）；midboss 也算「这一面的」。
 *
 * 注意雷米莉亚和咲夜：她们只作为 EXTRA 连环战的中途 Boss 出现（stage.js 的 EXTRA_CHAIN），
 * 不挂在任何 LEVELS 项上。漏掉她们会导致 48 张卡里少 7 张，所以最后兜一层：
 * 凡是没在 LEVELS 里出现过的 Boss，一律归到 EXTRA 面。
 */
function buildStageMap() {
  const map = new Map();
  LEVELS.forEach((def, i) => {
    if (def.boss) map.set(def.boss, i);
    if (def.midboss && def.midboss.key) map.set(def.midboss.key, i);
  });
  const extraIdx = LEVELS.findIndex((d) => d.extra);
  if (extraIdx >= 0) {
    for (const k of Object.keys(BOSS_DEFS)) {
      if (!map.has(k) && BOSS_DEFS[k]?.phases?.length) map.set(k, extraIdx);
    }
  }
  return map;
}

const STAGE_OF_BOSS = buildStageMap();
const HOST_INDEX = Math.max(0, LEVELS.findIndex((d) => d.id === HOST_STAGE_ID));

/**
 * 一个 Boss 的归属信息。
 * 归属（stageId/stageName）和加载场地（hostStageId/hostStageIndex）是两件事：
 * 雷米莉亚确实属于 EXTRA，但练习局借 STAGE 4 的场地开打。
 */
function placementOf(bossKey) {
  const idx = STAGE_OF_BOSS.get(bossKey);
  if (idx == null) return null;
  const def = LEVELS[idx];
  const extra = !!def.extra;
  return {
    stageId: def.id,
    stageName: def.title || def.name,
    stageIndex: idx,
    extra,
    hostStageId: extra ? HOST_STAGE_ID : def.id,
    hostStageIndex: extra ? HOST_INDEX : idx,
  };
}

/**
 * 全量符卡表（含未解锁）。practice 与 gallery 共用这一份，别再各自解析一遍 BOSS_DEFS。
 *
 * @returns {{bossKey:string,bossName:string,bossTitle:string,accent:string,
 *   cardIndex:number,cardName:string,cardHp:number,patternCount:number,
 *   stageId:string,stageName:string,stageIndex:number,extra:boolean,
 *   hostStageId:string,hostStageIndex:number,key:string,difficulty:null}[]}
 */
export function listBossCards() {
  const out = [];
  for (const [bossKey, def] of Object.entries(BOSS_DEFS)) {
    const place = placementOf(bossKey);
    if (!place) continue; // 关卡表里没登记的 Boss 无处安放，跳过而不是瞎猜
    (def.phases || []).forEach((phase, i) => {
      out.push({
        bossKey,
        bossName: def.name,
        bossTitle: def.title || '',
        accent: def.accent || '#ffd66f',
        cardIndex: i,
        cardName: phase.name,
        cardHp: phase.hp | 0,
        patternCount: Array.isArray(phase.patterns) ? phase.patterns.length : 0,
        ...place,
        // 难度不写死：练习局跟随玩家当前设置。Boss 的 trimHardCards 全难度都是空数组，
        // 所以卡序号在任何难度下都和 BOSS_DEFS 一一对应，不需要按难度另算。
        difficulty: null,
        key: `${bossKey}:${i}`,
      });
    });
  }
  // 按面的顺序排，同面内保持 BOSS_DEFS 的卡序
  out.sort((a, b) => (a.stageIndex - b.stageIndex) || (a.cardIndex - b.cardIndex)
    || a.bossKey.localeCompare(b.bossKey));
  return out;
}

/**
 * 可练习清单。
 *
 * 解锁口径（与 main.js 的进度存档对齐，不另建一套解锁状态）：
 *  - 普通关（含 STAGE 5 中途的妖梦）的 Boss，玩家能走到那一面就说明打得到，全部开放；
 *  - EXTRA 三 Boss（雷米莉亚 / 芙兰朵露 / 咲夜）需要 hks.progress.v1 里的 extraUnlocked。
 *
 * @param {{extraUnlocked?:boolean}} [progress] main.js 的 this.unlockedExtra
 */
export function listPracticeTargets(progress = {}) {
  const extraUnlocked = !!progress.extraUnlocked;
  return listBossCards().map((c) => ({
    bossKey: c.bossKey,
    bossName: c.bossName,
    bossTitle: c.bossTitle,
    stageId: c.stageId,
    stageName: c.stageName,
    stageIndex: c.stageIndex,
    hostStageId: c.hostStageId,
    hostStageIndex: c.hostStageIndex,
    cardIndex: c.cardIndex,
    cardName: c.cardName,
    cardHp: c.cardHp,
    patternCount: c.patternCount,
    accent: c.accent,
    difficulty: c.difficulty,
    extra: c.extra,
    key: c.key,
    locked: c.extra && !extraUnlocked,
  }));
}

/* ------------------------------------------------------------------
 * 二、开局配置
 * ---------------------------------------------------------------- */

/**
 * 把一条练习目标翻成 main.js 能直接用的开局参数。
 *
 * 接入方式：复用 _createStage 里现成的 `opts.resumeBoss` 分支（main.js:2515-2531），
 * 它会把玩家放到 Boss 前、Boss 直接登场、跳过战前对白——正是练习要的。
 * 唯一缺口是它不传卡切片（cardFrom/cardCount），那 2 个参数 Boss 构造函数本来支持
 * （boss.js:1528-1534），只是 stage.js:2086-2087 只从 EXTRA_CHAIN 取。见报告。
 *
 * 用法（Lead 在 main.js 里）：
 *   const run = buildPracticeRun(target);
 *   this.practiceRun = run;
 *   this.carryPower = run.power;   // 必须在 startStage 之前设：Stage 构造时读它
 *   this.runLives = run.lives;
 *   await this.startStage(run.hostStageIndex, run.opts);
 *
 * @param {object} target listPracticeTargets() 的一项（或任何带同样字段的对象）
 * @returns {object|null} target 无效时返回 null
 */
export function buildPracticeRun(target) {
  if (!target || !target.bossKey) return null;
  const bossKey = target.bossKey;
  const cardIndex = target.cardIndex | 0;
  const total = (BOSS_DEFS[bossKey]?.phases || []).length;
  if (!total) return null;
  const from = Math.min(Math.max(0, cardIndex), total - 1);
  return {
    kind: 'practice',
    // 归属（界面标题用）
    bossKey,
    bossName: target.bossName || BOSS_DEFS[bossKey]?.name || bossKey,
    cardIndex: from,
    cardName: target.cardName || BOSS_DEFS[bossKey].phases[from].name,
    cardTotal: total,
    stageId: target.stageId,
    stageName: target.stageName,
    // 加载场地（喂给 startStage 的第一参数）
    hostStageId: target.hostStageId || target.stageId,
    hostStageIndex: target.hostStageIndex | 0,
    // 规则
    lives: PRACTICE_RULES.lives,
    power: PRACTICE_RULES.power,
    difficulty: null,
    // startStage 的第二参数
    opts: {
      practice: true,
      resumeBoss: true,
      bossKey,
      bossMid: false,
      skipIntro: true,
      cardFrom: from,
      cardCount: 1,
    },
  };
}

/* ------------------------------------------------------------------
 * 三、练习记录（hks.practice.v1）
 * ---------------------------------------------------------------- */

function readAll() {
  try {
    const raw = localStorage.getItem(PRACTICE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return (v && typeof v === 'object' && v.cards && typeof v.cards === 'object') ? v : { cards: {} };
  } catch {
    // 存档坏了就当没练过：练习记录不值得为它阻断整个页面
    return { cards: {} };
  }
}

function writeAll(data) {
  try { localStorage.setItem(PRACTICE_KEY, JSON.stringify(data)); } catch { /* 隐私模式 / 配额满：忽略 */ }
}

/** 一条卡的练习记录：{ tries, best } —— best 是「打完时剩多少残机」。 */
export function practiceRecord(bossKey, cardIndex) {
  const rec = readAll().cards[`${bossKey}:${cardIndex | 0}`];
  return rec ? { tries: rec.tries | 0, best: rec.best | 0 } : { tries: 0, best: 0 };
}

/**
 * 记一次练习结果。只在**打完这张卡**时调用（宿主在 cardResult / clear 里接线）。
 * 残机用完不算——那正是要接着练的信号，不记进 best。
 *
 * @param {string} bossKey
 * @param {number} cardIndex
 * @param {{cleared?:boolean, livesLeft?:number}} result
 */
export function recordPracticeResult(bossKey, cardIndex, result = {}) {
  const data = readAll();
  const k = `${bossKey}:${cardIndex | 0}`;
  const rec = data.cards[k] || { tries: 0, best: 0 };
  rec.tries = (rec.tries | 0) + 1;
  if (result.cleared) rec.best = Math.max(rec.best | 0, result.livesLeft | 0);
  data.cards[k] = rec;
  writeAll(data);
  return { tries: rec.tries, best: rec.best };
}

/** 清空练习记录（调试 / 设置页用）。 */
export function clearPracticeRecords() {
  writeAll({ cards: {} });
}

/* ------------------------------------------------------------------
 * 四、页面 UI
 * ---------------------------------------------------------------- */

const CSS = `
.hp{position:absolute;inset:0;z-index:30;pointer-events:auto;display:flex;align-items:center;
  justify-content:center;opacity:0;transition:opacity .18s ease;font-family:var(--font-ui,system-ui,sans-serif)}
.hp.is-in{opacity:1}
.hp.hidden{display:none}
.hp-veil{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,#241a3a 0%,#120d1e 55%,#08060f 100%)}
.hp-veil::after{content:'';position:absolute;inset:0;
  background:radial-gradient(60% 50% at 50% 0%,rgba(255,214,111,.10),transparent 70%)}
.hp-frame{position:relative;width:min(1120px,94vw);height:min(660px,90vh);display:flex;flex-direction:column;
  border:1px solid rgba(255,214,111,.22);background:rgba(10,8,18,.82);backdrop-filter:blur(2px);
  box-shadow:0 24px 80px rgba(0,0,0,.6)}
.hp-head{display:flex;align-items:baseline;gap:14px;padding:18px 26px 12px;
  border-bottom:1px solid rgba(255,214,111,.16)}
.hp-title{font-size:calc(22px * var(--s,1));letter-spacing:.22em;color:#ffd66f}
.hp-count{font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.5);letter-spacing:.12em}
.hp-body{flex:1;display:flex;min-height:0}
.hp-list-wrap{flex:0 0 58%;overflow-y:auto;padding:10px 0 24px;scrollbar-width:thin}
.hp-list-wrap::-webkit-scrollbar{width:6px}
.hp-list-wrap::-webkit-scrollbar-thumb{background:rgba(255,214,111,.28);border-radius:3px}
.hp-grp{padding:14px 26px 4px;font-size:calc(11px * var(--s,1));letter-spacing:.2em;
  color:rgba(255,214,111,.72);border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:4px}
.hp-grp.is-locked{color:rgba(255,255,255,.28)}
.hp-row{display:flex;align-items:center;gap:12px;padding:9px 26px;cursor:pointer;
  border-left:2px solid transparent;transition:background .12s,border-color .12s}
.hp-row.is-sel{background:linear-gradient(90deg,rgba(255,214,111,.14),transparent 80%);
  border-left-color:#ffd66f}
.hp-row.is-locked{opacity:.42;cursor:default}
.hp-no{flex:0 0 42px;font-family:"Optima","Palatino Linotype","Times New Roman",serif;
  font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.42);letter-spacing:.08em}
.hp-row.is-sel .hp-no{color:#ffd66f}
.hp-name{flex:1;font-size:calc(14px * var(--s,1));color:#f2ecff;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.hp-row.is-locked .hp-name{color:rgba(255,255,255,.45);letter-spacing:.16em}
.hp-rec{flex:0 0 auto;font-size:calc(11px * var(--s,1));color:rgba(255,214,111,.55);letter-spacing:.06em}
.hp-side{flex:1;border-left:1px solid rgba(255,214,111,.14);padding:22px 24px;display:flex;
  flex-direction:column;gap:12px;min-width:0}
.hp-side-no{font-family:"Optima","Palatino Linotype","Times New Roman",serif;
  font-size:calc(30px * var(--s,1));color:rgba(255,214,111,.28);letter-spacing:.14em}
.hp-side-name{font-size:calc(17px * var(--s,1));color:#fff;line-height:1.5;word-break:break-word}
.hp-side-boss{font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.55);letter-spacing:.08em}
.hp-side-line{height:1px;background:linear-gradient(90deg,rgba(255,214,111,.5),transparent)}
.hp-kv{display:flex;gap:10px;font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.6)}
.hp-kv b{color:#ffd66f;font-weight:400;min-width:4.5em}
.hp-dots{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
.hp-dot{width:14px;height:4px;background:rgba(255,255,255,.16)}
.hp-dot.on{background:#ffd66f}
.hp-foot{padding:12px 26px;border-top:1px solid rgba(255,214,111,.16);
  font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.5);letter-spacing:.1em;
  display:flex;gap:22px;flex-wrap:wrap}
.hp-foot b{color:#ffd66f;font-weight:400}
`;

function injectCss() {
  if (document.getElementById('hks-practice-css')) return;
  const st = document.createElement('style');
  st.id = 'hks-practice-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/** 未解锁时显示的占位符：英文用半角问号，其它语言用全角（和 musicRoom 一致）。 */
function unknownMarks(n) {
  return (getLang() === 'en' ? '?' : '？').repeat(n);
}

/**
 * 符卡练习页面。
 *
 * 形状照 musicRoom.js：整屏层自己 createElement 建，宿主只负责 show / hide /
 * 转发按键 / 在确认时执行 onStart。
 */
export class PracticeRoom {
  /**
   * @param {object} opt
   * @param {import('../engine/input.js').Input} opt.input
   * @param {HTMLElement} opt.host           DOM 宿主（#ui）
   * @param {() => boolean} [opt.isExtraUnlocked] 读 hks.progress.v1 的 EXTRA 解锁位
   * @param {(run: object) => void} opt.onStart   确认练习：把 buildPracticeRun() 的结果交出去
   * @param {() => void} opt.onExit               返回标题
   */
  constructor({ input, host, isExtraUnlocked, onStart, onExit }) {
    this.input = input;
    this.host = host;
    this.isExtraUnlocked = isExtraUnlocked || (() => false);
    this.onStart = onStart || (() => {});
    this.onExit = onExit || (() => {});

    this.visible = false;
    this.el = null;
    this.d = null;
    this.rows = [];      // 只含可选项，索引即 sel
    this.sel = 0;
    this._builtLang = '';
    this._hideTimer = 0;
  }

  /* ---------- 生命周期 ---------- */

  show() {
    this._build();
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = 0; }
    this.visible = true;
    this.el.classList.remove('hidden');
    this._refresh();
    localizeDom(this.el);
    // 下一帧再加 is-in：同一帧里 remove('hidden') + add('is-in') 浏览器会合并成一次样式计算，
    // transition 根本不跑，页面会「啪」地出现而不是淡入。
    requestAnimationFrame(() => {
      if (this.visible && this.el) this.el.classList.add('is-in');
    });
  }

  hide() {
    if (!this.el) return;
    this.visible = false;
    this.el.classList.remove('is-in');
    // 等淡出跑完再 display:none，否则过渡会被立刻掐断
    this._hideTimer = setTimeout(() => {
      if (!this.visible && this.el) this.el.classList.add('hidden');
      this._hideTimer = 0;
    }, 220);
  }

  /**
   * 处理一个 keydown。返回 true 表示已消费。
   * 未定义的键也吞掉：这是独立页面，漏出去会让标题页的 S / Q 之类快捷键在背后生效。
   */
  handleKey(e) {
    if (!this.visible) return false;
    const a = this.input?.actionOf?.(e.code) || '';
    if (a === 'up') { e.preventDefault(); this._move(-1); return true; }
    if (a === 'down') { e.preventDefault(); this._move(1); return true; }
    if (a === 'left') { e.preventDefault(); this._move(-5); return true; }
    if (a === 'right') { e.preventDefault(); this._move(5); return true; }
    if (a === 'confirm' || a === 'jump') { e.preventDefault(); this._confirm(); return true; }
    if (a === 'pause' || a === 'cancel' || e.code === 'Escape') {
      e.preventDefault();
      this.onExit();
      return true;
    }
    return true;
  }

  /** 静态列表，帧循环里不需要更新；留个空实现让宿主的 update 调用不用判空。 */
  update() {}

  /* ---------- 选择 ---------- */

  _move(dir) {
    if (!this.rows.length) return;
    const n = this.rows.length;
    // 环形回绕：从第一项再往上就回到最后一项，省得玩家按到边界还在按
    this.sel = ((this.sel + dir) % n + n) % n;
    this._refresh();
  }

  _confirm() {
    const row = this.rows[this.sel];
    if (!row || row.locked) return;
    const run = buildPracticeRun(row.target);
    if (!run) return;
    this.onStart(run);
  }

  /* ---------- 渲染 ---------- */

  _build() {
    // 语言变了就重建：静态标签在构建期翻译，不重建会留在旧语言
    if (this.el) {
      if (this._builtLang === getLang()) return;
      this.el.remove();
      this.el = null;
      this.d = null;
      this.rows = [];
    }
    injectCss();
    this._builtLang = getLang();

    const targets = listPracticeTargets({ extraUnlocked: this.isExtraUnlocked() });

    // 按面分组：同一面的 Boss 排在一起，组头显示面名
    const groups = [];
    const byStage = new Map();
    for (const t of targets) {
      let g = byStage.get(t.stageIndex);
      if (!g) {
        g = { stageIndex: t.stageIndex, name: t.stageName, extra: t.extra, items: [] };
        byStage.set(t.stageIndex, g);
        groups.push(g);
      }
      g.items.push(t);
    }

    const total = targets.length;
    const opened = targets.filter((t) => !t.locked).length;

    const el = document.createElement('div');
    el.className = 'hp hidden';
    el.innerHTML =
      '<div class="hp-veil"></div>' +
      '<div class="hp-frame">' +
        '<div class="hp-head">' +
          '<span class="hp-title">' + tr('符卡练习') + '</span>' +
          '<span class="hp-count">' + tr('可练习 {a} / {b}', { a: opened, b: total }) + '</span>' +
        '</div>' +
        '<div class="hp-body">' +
          '<div class="hp-list-wrap"><ul class="hp-list"></ul></div>' +
          '<div class="hp-side">' +
            '<div class="hp-side-no"></div>' +
            '<div class="hp-side-name"></div>' +
            '<div class="hp-side-line"></div>' +
            '<div class="hp-side-boss"></div>' +
            '<div class="hp-kv"><b>' + tr('所属面') + '</b><span class="hp-v-stage"></span></div>' +
            '<div class="hp-kv"><b>' + tr('耐久') + '</b><span class="hp-v-hp"></span></div>' +
            '<div class="hp-kv"><b>' + tr('弹幕') + '</b><span class="hp-v-pat"></span></div>' +
            '<div class="hp-kv"><b>' + tr('练习次数') + '</b><span class="hp-v-tries"></span></div>' +
            '<div class="hp-kv"><b>' + tr('最佳残机') + '</b><span class="hp-v-best"></span></div>' +
            '<div class="hp-dots"></div>' +
          '</div>' +
        '</div>' +
        '<div class="hp-foot">' +
          '<span><b>↑↓</b> ' + tr('选择') + '</span>' +
          '<span><b>ENTER</b> ' + tr('开始练习') + '</span>' +
          '<span><b>ESC</b> ' + tr('返回') + '</span>' +
        '</div>' +
      '</div>';

    const $ = (s) => el.querySelector(s);
    const list = $('.hp-list');
    this.d = {
      list,
      no: $('.hp-side-no'),
      name: $('.hp-side-name'),
      boss: $('.hp-side-boss'),
      stage: $('.hp-v-stage'),
      hp: $('.hp-v-hp'),
      pat: $('.hp-v-pat'),
      tries: $('.hp-v-tries'),
      best: $('.hp-v-best'),
      dots: $('.hp-dots'),
    };
    this.rows = [];

    for (const g of groups) {
      const locked = g.items.every((t) => t.locked);
      const head = document.createElement('li');
      head.className = 'hp-grp' + (locked ? ' is-locked' : '');
      head.textContent = (g.extra ? 'EXTRA' : 'STAGE ' + (g.stageIndex + 1)) + '　' + tr(g.name);
      list.appendChild(head);

      g.items.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = 'hp-row' + (t.locked ? ' is-locked' : '');
        const no = String(i + 1).padStart(2, '0');
        const rec = t.locked ? { tries: 0, best: 0 } : practiceRecord(t.bossKey, t.cardIndex);
        li.innerHTML =
          '<span class="hp-no">' + (g.extra ? 'EX-' : '') + no + '</span>' +
          '<span class="hp-name">' + (t.locked ? unknownMarks(6) : tr(t.cardName)) + '</span>' +
          (rec.tries ? '<span class="hp-rec">×' + rec.tries + '</span>' : '');
        const idx = this.rows.length;
        this.rows.push({ target: t, locked: t.locked, li });
        // 鼠标只是便利：键盘才是主路径，所以点击直接复用 _move + _confirm
        li.addEventListener('mouseenter', () => {
          if (!this.visible || this.sel === idx) return;
          this.sel = idx;
          this._refresh();
        });
        li.addEventListener('click', () => {
          if (!this.visible) return;
          this.sel = idx;
          this._refresh();
          this._confirm();
        });
        list.appendChild(li);
      });
    }

    if (!this.rows.length) {
      const li = document.createElement('li');
      li.className = 'hp-row';
      li.innerHTML = '<span class="hp-name">' + tr('（没有可练习的符卡）') + '</span>';
      list.appendChild(li);
    }

    this.host.appendChild(el);
    this.el = el;
    this.sel = Math.min(this.sel, Math.max(0, this.rows.length - 1));
  }

  _refresh() {
    if (!this.d) return;
    const row = this.rows[this.sel];
    this.rows.forEach((r, i) => r.li.classList.toggle('is-sel', i === this.sel));
    if (!row) return;

    const t = row.target;
    const rec = t.locked ? { tries: 0, best: 0 } : practiceRecord(t.bossKey, t.cardIndex);
    const total = (BOSS_DEFS[t.bossKey]?.phases || []).length;

    this.d.no.textContent = 'No. ' + String(t.cardIndex + 1).padStart(2, '0');
    this.d.name.textContent = t.locked ? unknownMarks(8) : tr(t.cardName);
    this.d.boss.textContent = t.locked ? unknownMarks(6) : t.bossName + '　' + t.bossTitle;
    this.d.stage.textContent = (t.extra ? 'EXTRA　' : 'STAGE ' + (t.stageIndex + 1) + '　') + tr(t.stageName);
    this.d.hp.textContent = t.locked ? '—' : String(t.cardHp);
    this.d.pat.textContent = t.locked ? '—' : tr('{n} 式', { n: t.patternCount });
    this.d.tries.textContent = rec.tries ? String(rec.tries) : '—';
    this.d.best.textContent = rec.best ? String(rec.best) : '—';

    // 卡序号的小圆点：一眼看出这是这个 Boss 的第几张
    this.d.dots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'hp-dot' + (i === t.cardIndex ? ' on' : '');
      this.d.dots.appendChild(dot);
    }

    row.li.scrollIntoView({ block: 'nearest' });
  }
}
