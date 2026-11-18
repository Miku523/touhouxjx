/**
 * 排行榜页面 + 每日挑战入口。
 *
 * 形状照 gallery.js / practice.js：整屏 DOM 层（show / hide / handleKey），
 * CSS 自己注入一个 <style>（index.html 的样式表带 ?v= 硬链，不能加新文件）。
 *
 * 数据来源分两处：
 *  - 排行榜读 score.js 的 localStorage 榜单（hks.score.v1），只读不写。
 *  - 每日挑战自己记一个键（hks.ranking.v1），只存「哪一天打过、当天最好多少」。
 *    挑战本身不是新玩法：dailySeed() 算出的数字塞进 main.js 已有的 ?seed= 参数，
 *    整局随机序列就被钉死，人人都打同一套弹幕。这个文件只算 seed 并回调，
 *    不改 URL、不开局 —— 那是 Lead 那边接线的事。
 */

import { tr, getLang } from '../i18n/index.js';
import { loadBoard, formatScore, dailySeed, dailyKey } from './score.js';
import { LEVELS } from '../assets/levels.js';

/** score.js 的 TOP_N 是模块私有 const（未 export），这里镜像一份，别去改那个文件 */
const TOP_N = 5;

export const RANKING_KEY = 'hks.ranking.v1';
export const DAILY_KEY = RANKING_KEY;

/**
 * 难度 tab。id 必须是 score.js 存档里的难度键。
 * main.js 存榜传的是 this.difficulty，即 difficulty.js 的 DIFFICULTY_KEYS 短键
 * （E/N/H/L），EXTRA 特例存 'EX'。别写成 'normal' —— 那样查不到任何真人成绩。
 */
export const DIFFICULTY_TABS = Object.freeze([
  { id: 'E', label: '简单' },
  { id: 'N', label: '普通' },
  { id: 'H', label: '困难' },
  { id: 'L', label: '狂气' },
  { id: 'EX', label: 'EXTRA' },
]);

const CN_NUM = ['一', '二', '三', '四', '五', '六'];

/**
 * 关卡 tab。关名从 LEVELS 现取，不硬编码 —— 关卡标题改了这个页面自动跟上。
 * 标题是「博丽神社 · 黄昏樱花」这种格式，只取第一个 · 前的部分做短名。
 */
export const STAGE_TABS = Object.freeze(
  LEVELS.map((def, i) => {
    const short = String(def.title || def.name || def.id).split(' · ')[0];
    const label = def.extra
      ? 'EXTRA · ' + short
      : CN_NUM[i] + '面 · ' + short;
    return { id: def.id, label };
  })
);

/** 榜单：包一层 score.js 的 loadBoard。读不出来/没打过一律 [] */
export function listBoard(stageId, difficulty) {
  const board = loadBoard();
  const list = board?.[stageId]?.[difficulty];
  return Array.isArray(list) ? list.slice(0, TOP_N) : [];
}

function readDaily() {
  let raw = null;
  try {
    raw = localStorage.getItem(RANKING_KEY);
  } catch {
    return {}; // 隐私模式：当作从来没打过
  }
  if (!raw) return {};
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return data;
}

function writeDaily(data) {
  try {
    localStorage.setItem(RANKING_KEY, JSON.stringify(data));
  } catch {
    // 写不进去（配额 / 隐私模式）不影响本局，只是明天还会显示「尚未挑战」
  }
}

/** 今日挑战状态：{ seed, key, done, best } */
export function dailyInfo(date = new Date()) {
  const key = dailyKey(date);
  const seed = dailySeed(date);
  const rec = readDaily()[key];
  const best = Math.max(0, Math.floor(Number(rec?.best) || 0));
  return { seed, key, done: !!rec && (rec.done === true || best > 0), best };
}

/** 记一次当日成绩（只留最高）。返回 { seed, key, best } */
export function markDailyDone(date = new Date(), score = 0) {
  const key = dailyKey(date);
  const seed = dailySeed(date);
  const got = Math.max(0, Math.floor(Number(score) || 0));
  const data = readDaily();
  const prev = Math.max(0, Math.floor(Number(data[key]?.best) || 0));
  data[key] = { done: true, best: Math.max(prev, got), at: Date.now() };
  writeDaily(data);
  return { seed, key, best: data[key].best };
}

/** 清空每日挑战记录（排行榜成绩在 score.js 那边，不归这里删） */
export function clearRankingData() {
  try {
    localStorage.removeItem(RANKING_KEY);
  } catch {
    // 忽略
  }
}

const CSS = `
.rk{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;
  pointer-events:none;opacity:0;transition:opacity .22s ease}
.rk.is-in{opacity:1;pointer-events:auto}
.rk.hidden{display:none}
.rk-veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,
  rgba(28,10,26,.72), rgba(6,4,12,.92))}
.rk-frame{position:relative;width:min(1080px,92vw);max-height:86vh;display:flex;flex-direction:column;
  background:linear-gradient(180deg,rgba(22,12,24,.96),rgba(12,7,16,.97));
  border:1px solid rgba(255,214,111,.22);
  box-shadow:0 0 0 1px rgba(0,0,0,.6),0 18px 70px rgba(0,0,0,.6);
  transform:translateY(10px);transition:transform .22s ease}
.rk.is-in .rk-frame{transform:none}
.rk-head{display:flex;align-items:baseline;gap:18px;padding:16px 26px 12px;
  border-bottom:1px solid rgba(255,214,111,.16)}
.rk-title{font-family:"Optima","Palatino Linotype","Times New Roman",serif;
  font-size:calc(20px * var(--s,1));color:#ffd66f;letter-spacing:.2em}
.rk-tabs{display:flex;gap:6px;margin-left:auto}
.rk-tab{padding:4px 14px;font-size:calc(12px * var(--s,1));letter-spacing:.14em;
  color:rgba(255,255,255,.45);border-bottom:1px solid transparent}
.rk-tab.is-on{color:#ffd66f;border-bottom-color:#ffd66f}
.rk-body{flex:1;min-height:0;overflow:auto;padding:16px 26px 8px;display:flex;
  flex-direction:column;gap:14px}
.rk-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.rk-fgroup{display:flex;gap:4px;border:1px solid rgba(255,255,255,.1);padding:3px}
.rk-chip{padding:3px 11px;font-size:calc(12px * var(--s,1));
  color:rgba(255,255,255,.5);letter-spacing:.1em;white-space:nowrap}
.rk-chip.is-on{color:#0e0810;background:#ffd66f}
.rk-chiplabel{font-size:calc(11px * var(--s,1));color:rgba(255,255,255,.34);
  letter-spacing:.18em;margin-right:2px}
.rk-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.rk-row{display:grid;grid-template-columns:3.4em 1fr 9em 6em;align-items:baseline;gap:12px;
  padding:9px 12px;font-size:calc(13px * var(--s,1));
  border-bottom:1px solid rgba(255,255,255,.05)}
.rk-row.is-head{color:rgba(255,255,255,.35);font-size:calc(11px * var(--s,1));
  letter-spacing:.16em;border-bottom-color:rgba(255,214,111,.2)}
.rk-rank{color:rgba(255,214,111,.6);font-family:"Optima","Palatino Linotype",serif}
.rk-row.is-top .rk-rank{color:#ffd66f}
.rk-score{color:#fff;letter-spacing:.14em}
.rk-char{color:rgba(255,255,255,.72)}
.rk-graze{color:rgba(255,255,255,.45);text-align:right}
.rk-empty{padding:36px 12px;text-align:center;color:rgba(255,255,255,.42);
  font-size:calc(13px * var(--s,1));letter-spacing:.14em}
.rk-daily{display:flex;flex-direction:column;gap:16px;padding:10px 2px}
.rk-daily-date{font-size:calc(15px * var(--s,1));color:#ffd66f;letter-spacing:.18em}
.rk-daily-kv{display:flex;gap:22px;flex-wrap:wrap;font-size:calc(12px * var(--s,1));
  color:rgba(255,255,255,.55);letter-spacing:.1em}
.rk-daily-kv b{color:#fff;font-weight:400}
.rk-daily-cta{margin-top:auto;padding:22px 0;text-align:center;
  font-size:calc(18px * var(--s,1));color:rgba(255,255,255,.86);letter-spacing:.16em;
  border-top:1px solid rgba(255,214,111,.16)}
.rk-daily-cta.is-done{color:rgba(255,214,111,.7)}
.rk-foot{padding:11px 26px;border-top:1px solid rgba(255,214,111,.16);
  font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.45);letter-spacing:.1em;
  display:flex;gap:22px;flex-wrap:wrap}
.rk-foot b{color:#ffd66f;font-weight:400}
`;

function injectCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('hks-ranking-css')) return;
  const st = document.createElement('style');
  st.id = 'hks-ranking-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/**
 * 排行榜页面。
 *
 * 两个 tab：'board'（排行榜）/ 'daily'（每日挑战）。
 * 键位：上/下 选关卡，左/右 选难度，Tab 切 tab；每日挑战页里面板为空，
 * 左/右 直接切回排行榜（免得和难度的左右键打架）。
 */
export class RankingRoom {
  /**
   * @param {object} opt
   * @param {import('../engine/input.js').Input} opt.input
   * @param {HTMLElement} opt.host
   * @param {() => void} [opt.onExit]
   * @param {(info: {seed:number, key:string}) => void} [opt.onDailyStart] 确认开始今日挑战
   */
  constructor({ input, host, onExit, onDailyStart }) {
    this.input = input;
    this.host = host;
    this.onExit = onExit || (() => {});
    this.onDailyStart = onDailyStart || null;

    this._visible = false;
    this.el = null;
    this.d = null;
    this.tab = 'board';       // 'board' | 'daily'
    this.stageIdx = 0;
    this.diffIdx = 1;         // 默认普通
    this._builtLang = '';
    this._hideTimer = 0;
  }

  get visible() { return this._visible; }

  show() {
    this._build();
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = 0; }
    this._visible = true;
    this.el.classList.remove('hidden');
    this._paint();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (this._visible && this.el) this.el.classList.add('is-in');
      });
    } else {
      this.el.classList.add('is-in');
    }
  }

  hide() {
    if (!this.el) return;
    this._visible = false;
    this.el.classList.remove('is-in');
    this._hideTimer = setTimeout(() => {
      if (!this._visible && this.el) this.el.classList.add('hidden');
      this._hideTimer = 0;
    }, 220);
  }

  handleKey(e) {
    if (!this._visible) return false;
    const a = this.input?.actionOf?.(e.code) || '';

    if (e.code === 'Tab') {
      e.preventDefault();
      this._setTab(this.tab === 'board' ? 'daily' : 'board');
      return true;
    }
    if (a === 'pause' || a === 'cancel' || e.code === 'Escape') {
      e.preventDefault();
      this.onExit();
      return true;
    }

    if (this.tab === 'board') {
      if (a === 'up') { e.preventDefault(); this._moveStage(-1); return true; }
      if (a === 'down') { e.preventDefault(); this._moveStage(1); return true; }
      if (a === 'left') { e.preventDefault(); this._moveDiff(-1); return true; }
      if (a === 'right') { e.preventDefault(); this._moveDiff(1); return true; }
    } else {
      if (a === 'left' || a === 'right') { e.preventDefault(); this._setTab('board'); return true; }
      if (a === 'confirm') {
        e.preventDefault();
        const info = dailyInfo();
        this.onDailyStart?.({ seed: info.seed, key: info.key });
        return true;
      }
    }
    // 独立页面：没定义的键也吞掉，别让标题页快捷键在背后生效
    return true;
  }

  update() {}

  /* ---------- 内部 ---------- */

  _setTab(tab) {
    if (tab === this.tab) return;
    this.tab = tab;
    this._paint();
  }

  _moveStage(dir) {
    const n = STAGE_TABS.length;
    this.stageIdx = (this.stageIdx + dir + n) % n;
    this._paint();
  }

  _moveDiff(dir) {
    const n = DIFFICULTY_TABS.length;
    this.diffIdx = (this.diffIdx + dir + n) % n;
    this._paint();
  }

  _build() {
    if (this.el) {
      if (this._builtLang === getLang()) return;
      this.el.remove();
      this.el = null;
      this.d = null;
    }
    injectCss();
    this._builtLang = getLang();

    const el = document.createElement('div');
    el.className = 'rk rk-root hidden';
    el.innerHTML =
      '<div class="rk-veil"></div>' +
      '<div class="rk-frame">' +
        '<div class="rk-head">' +
          '<span class="rk-title">' + tr('排行榜') + '</span>' +
          '<div class="rk-tabs">' +
            '<span class="rk-tab" data-tab="board"></span>' +
            '<span class="rk-tab" data-tab="daily"></span>' +
          '</div>' +
        '</div>' +
        '<div class="rk-body">' +
          '<div class="rk-filters">' +
            '<span class="rk-chiplabel">' + tr('关卡') + '</span>' +
            '<div class="rk-fgroup" data-f="stage"></div>' +
            '<span class="rk-chiplabel">' + tr('难度') + '</span>' +
            '<div class="rk-fgroup" data-f="diff"></div>' +
          '</div>' +
          '<div class="rk-board"></div>' +
          '<div class="rk-daily"></div>' +
        '</div>' +
        '<div class="rk-foot">' +
          '<span><b>↑↓</b> ' + tr('选关卡') + '</span>' +
          '<span><b>←→</b> ' + tr('选难度') + '</span>' +
          '<span><b>Tab</b> ' + tr('切换页面') + '</span>' +
          '<span><b>Enter</b> ' + tr('开始挑战') + '</span>' +
          '<span><b>Esc</b> ' + tr('返回') + '</span>' +
        '</div>' +
      '</div>';

    this.host.appendChild(el);
    this.el = el;

    const q = (sel) => el.querySelector(sel);
    this.d = {
      tabs: [...el.querySelectorAll('.rk-tab')],
      stageGroup: q('[data-f="stage"]'),
      diffGroup: q('[data-f="diff"]'),
      filters: q('.rk-filters'),
      board: q('.rk-board'),
      daily: q('.rk-daily'),
    };

    // 滤镜条只在排行榜 tab 有意义
    this.d.filters.style.display = '';
  }

  _paint() {
    if (!this.el) return;
    const d = this.d;

    for (const t of d.tabs) {
      const on = t.dataset.tab === this.tab;
      t.classList.toggle('is-on', on);
      t.textContent = t.dataset.tab === 'board' ? tr('排行榜') : tr('每日挑战');
    }

    d.filters.style.display = this.tab === 'board' ? '' : 'none';
    d.board.style.display = this.tab === 'board' ? '' : 'none';
    d.daily.style.display = this.tab === 'board' ? 'none' : '';

    if (this.tab === 'board') this._paintBoard();
    else this._paintDaily();
  }

  _paintBoard() {
    const d = this.d;
    const stage = STAGE_TABS[this.stageIdx];
    const diff = DIFFICULTY_TABS[this.diffIdx];

    d.stageGroup.innerHTML = STAGE_TABS
      .map((s, i) => '<span class="rk-chip' + (i === this.stageIdx ? ' is-on' : '') + '">'
        + tr(s.label) + '</span>').join('');
    d.diffGroup.innerHTML = DIFFICULTY_TABS
      .map((x, i) => '<span class="rk-chip' + (i === this.diffIdx ? ' is-on' : '') + '">'
        + tr(x.label) + '</span>').join('');

    const list = listBoard(stage.id, diff.id);
    if (!list.length) {
      d.board.innerHTML = '<div class="rk-empty">' + tr('还没有记录。') + '</div>';
      return;
    }

    const head = '<div class="rk-row is-head">'
      + '<span class="rk-rank">' + tr('名次') + '</span>'
      + '<span class="rk-score">' + tr('分数') + '</span>'
      + '<span class="rk-char">' + tr('自机') + '</span>'
      + '<span class="rk-graze">' + tr('擦弹') + '</span>'
      + '</div>';
    const rows = list.map((e, i) =>
      '<div class="rk-row' + (i === 0 ? ' is-top' : '') + '">'
      + '<span class="rk-rank">' + (i + 1) + '</span>'
      + '<span class="rk-score">' + formatScore(e.score) + '</span>'
      + '<span class="rk-char">' + String(e.char || '—') + '</span>'
      + '<span class="rk-graze">' + (Math.floor(Number(e.graze) || 0)) + '</span>'
      + '</div>').join('');
    d.board.innerHTML = '<div class="rk-list">' + head + rows + '</div>';
  }

  _paintDaily() {
    const info = dailyInfo();
    const d = this.d;
    const status = info.done
      ? tr('今日最好 {score}', { score: formatScore(info.best) })
      : tr('今日尚未挑战');

    d.daily.innerHTML =
      '<div class="rk-daily-date">' + info.key + '</div>' +
      '<div class="rk-daily-kv">' +
        '<span>' + tr('今日种子 {seed}', { seed: info.seed }) + '</span>' +
        '<span><b>' + status + '</b></span>' +
      '</div>' +
      '<div class="rk-daily-cta' + (info.done ? ' is-done' : '') + '">' +
        tr('按 ENTER 以今日种子开始挑战') +
      '</div>';
  }
}
