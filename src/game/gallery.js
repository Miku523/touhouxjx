/**
 * 图鉴（Spell Card Gallery / Enemy Gallery）
 *
 * 两个 tab：符卡、敌机。和 musicRoom.js 完全同一个形状——
 * 整屏层自己建、分组列表、未收录显示「？？？」、独立的 localStorage 档案。
 *
 * 为什么不做敌人立绘：本仓库已明确不再保留「程序化人物路径」（见 src/art/roster.js 头注释），
 * 而立绘要靠外部素材，零依赖项目里没有这条路。所以视觉区分靠**配色**：
 * 每个条目取一段主题色做左侧色条 + 编号，靠颜色和排版区分，不画图。
 *
 * 数据来源：
 *  - 符卡：practice.js 的 listBossCards()（同一份 BOSS_DEFS 解析，不重复解析）
 *  - 敌机：enemies.js 的 PLATFORM_KINDS + stg.js 的 ENEMY_KINDS + miniboss.js 的三种原型。
 *    后两者的表**没有导出**，所以数值/配色在本文件里重声明一遍；描述本来就是注释里的中文，
 *    没有可引用的数据源，也放在下面的表里。
 */

import { tr, getLang, localizeDom } from '../i18n/index.js';
import { PLATFORM_KINDS } from './enemies.js';
import { listBossCards } from './practice.js';

/** 图鉴档案键。本模块独占。 */
export const GALLERY_KEY = 'hks.gallery.v1';

/* ------------------------------------------------------------------
 * 一、敌机数据
 * ---------------------------------------------------------------- */

/**
 * 平台关杂兵的出现面。GROUND_WEIGHTS / AIR_WEIGHTS（enemies.js:98-111）没有导出，
 * 这里按同一份权重表抄「首次出现面」，改权重表时记得回来同步。
 */
const PLATFORM_LORE = {
  fairy: {
    name: '妖精', group: 'platform', appear: 1, color: '#ff8aa8', hp: null,
    desc: '最常见的杂鱼妖精：红白裙，地面巡逻，自己不开火，撞上来才是威胁。',
  },
  lancer: {
    name: '御币妖精', group: 'platform', appear: 1, color: '#7fc4ff', hp: null,
    desc: '手持神主御币的妖精。蓄力后突进撞人，顺手打出 1-3 发瞄准米弹。',
  },
  weaver: {
    name: '蛛网妖精', group: 'platform', appear: 2, color: '#c9a2ff', hp: null,
    desc: '土蜘蛛一脉。定期闪到前方地面，向四方撒交叉星弹，身后拖着蛛网。',
  },
  flyer: {
    name: '狙击妖精', group: 'platform', appear: 1, color: '#9ad0ff', hp: null,
    desc: '空中狙击妖精。悬停后对准玩家收束，是最早教人「别站着不动」的那一种。',
  },
  spreader: {
    name: '蝶妖精', group: 'platform', appear: 1, color: '#ffb0e0', hp: null,
    desc: '三只小蝶绕身飞舞，环射时蝶群同时振翅。弹幕是一圈均匀的星弹。',
  },
  bomber: {
    name: '提灯妖精', group: 'platform', appear: 2, color: '#ffb066', hp: null,
    desc: '身下悬一盏纸提灯，从上方抛落延迟的鬼火雨。落点有预警，别贪刀。',
  },
  spinner: {
    name: '魔法妖精', group: 'platform', appear: 3, color: '#c79bff', hp: null,
    desc: '魔法森林出身。脚下踩着旋转的星之魔法阵，弹幕跟着法阵一起转。',
  },
};

/** 飞行关（STG）杂兵。数值取 src/game/stg.js:321-330 的 ENEMY_KINDS（未导出）。 */
const STG_LORE = {
  scout: {
    name: '侦察妖精', group: 'stg', appear: 4, color: '#8fd8ff', hp: 13,
    desc: '最基础的编队机，飞得快、单发瞄准。三种「补枪式」里最慢的那种。',
  },
  gunner: {
    name: '炮击妖精', group: 'stg', appear: 4, color: '#ff9ad0', hp: 26,
    desc: '慢速排队推进，一轮散开扇形弹。摆动扇面会一点点扫过来。',
  },
  diver: {
    name: '俯冲妖精', group: 'stg', appear: 4, color: '#ffd27a', hp: 10,
    desc: '血最薄、冲最快。俯冲时点射补枪陡而急，通常成对出现。',
  },
  sniper: {
    name: '弓妖精', group: 'stg', appear: 4, color: '#9ad0ff', hp: 20,
    desc: '远距离架弓，蓄力后照直线打一发。看得见光的时候还有余地躲。',
  },
  spinner: {
    name: '魔法妖精', group: 'stg', appear: 4, color: '#c79bff', hp: 23,
    desc: '悬停不动地慢慢转，弹幕随法阵一圈圈扩大。放着不管最省事也最危险。',
  },
  bomber: {
    name: '提灯妖精', group: 'stg', appear: 4, color: '#ffb066', hp: 33,
    desc: '飞得最慢、血最厚。抛下延迟鬼火，封的是你刚想过去的那条路。',
  },
  turret: {
    name: '大妖精', group: 'stg', appear: 4, color: '#9fe6a0', hp: 39,
    desc: '体型最大、血量最厚的游击机。弹幕厚，但推进慢，可以绕着打。',
  },
};

/**
 * 中途头目（miniboss.js 的三种原型）。ARCH_LOOK 未导出，配色照抄。
 * 它们没有名字——游戏里就只显示 SNIPER / DANCER / BOMBER 三个标签，
 * 图鉴照这个来，别自己编人名。
 */
const ARCH_LORE = {
  sniper: {
    name: 'SNIPER', group: 'arch', appear: 7, color: '#7fc4ff', hp: null,
    desc: '中头目原型「狙」。从屏幕外滑入，架线瞄准，一枪一枪逼你换位。',
  },
  dancer: {
    name: 'DANCER', group: 'arch', appear: 7, color: '#c9a2ff', hp: null,
    desc: '中头目原型「舞」。大幅横摆的走位，弹幕跟着画弧，追不到也躲不干净。',
  },
  bomber: {
    name: 'BOMBER', group: 'arch', appear: 7, color: '#ff9d6e', hp: null,
    desc: '中头目原型「爆」。投下延时爆弹，先把场地切碎再慢慢收网。',
  },
};

const GROUP_LABEL = {
  platform: '杂兵 · 平台关',
  stg: '杂兵 · 飞行关',
  arch: '中途头目',
};

/**
 * 全量敌机表。
 * @returns {{id:string,name:string,group:string,groupLabel:string,appear:number,
 *   color:string,hp:number|null,desc:string}[]}
 */
export function listEnemies() {
  const out = [];
  const push = (rawId, lore) => {
    out.push({
      // id 带组前缀：平台关和飞行关都有 bomber/spinner，但那是两种不同的敌人。
      // 不加前缀的话图鉴会把它们当成同一格，收录一个两个都亮了。
      id: lore.group + ':' + rawId,
      name: lore.name,
      group: lore.group,
      groupLabel: GROUP_LABEL[lore.group] || lore.group,
      // appear 用「第几面」表示；ARCH_LORE 用 7 表示 EXTRA（LEVELS 只有 0..6）
      appear: lore.appear | 0,
      color: lore.color,
      // 平台关杂兵的血量在 PLATFORM_KINDS 里有基准值（随难度缩放，只能算参考）；
      // 中头目和飞行关的值不在这张表里，别去它那儿查，否则 bomber 会查到同名的杂兵。
      hp: lore.hp != null ? lore.hp
        : (lore.group === 'platform' && PLATFORM_KINDS[rawId] ? PLATFORM_KINDS[rawId].hp : null),
      desc: lore.desc,
    });
  };
  for (const id of Object.keys(PLATFORM_KINDS)) {
    if (PLATFORM_LORE[id]) push(id, PLATFORM_LORE[id]);
  }
  for (const id of Object.keys(STG_LORE)) push(id, STG_LORE[id]);
  for (const id of Object.keys(ARCH_LORE)) push(id, ARCH_LORE[id]);
  // 按组、再按首次出现面排；同组同面内保持表顺序
  const gorder = { platform: 0, stg: 1, arch: 2 };
  out.sort((a, b) => (gorder[a.group] - gorder[b.group]) || (a.appear - b.appear));
  return out;
}

/* ------------------------------------------------------------------
 * 二、档案（hks.gallery.v1）
 * ---------------------------------------------------------------- */

function readAll() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return { cards: {}, enemies: {}, seeded: false };
    return {
      cards: (v.cards && typeof v.cards === 'object') ? v.cards : {},
      enemies: (v.enemies && typeof v.enemies === 'object') ? v.enemies : {},
      seeded: !!v.seeded,
    };
  } catch {
    return { cards: {}, enemies: {}, seeded: false };
  }
}

function writeAll(data) {
  try { localStorage.setItem(GALLERY_KEY, JSON.stringify(data)); } catch { /* 忽略配额 / 隐私模式 */ }
}

const cardKey = (bossKey, i) => `${bossKey}:${i | 0}`;

/**
 * 首次建立档案时按已有进度补记。
 *
 * 为什么要有这一步：进度存档（hks.progress.v1）只记 EXTRA 是否解锁，没有逐关通关记录，
 * 所以没法精确回填「你到底打到过哪」。EXTRA 解锁意味着前六面全清——这种情况下
 * 把所有普通符卡和杂兵一次补齐，玩家才不会面对一屏「？？？」怀疑自己白打了。
 * 未解锁 EXTRA 就什么都不补，从零开始收。这和 musicRoom.js 的老档补记是同一套做法。
 *
 * @param {{extraUnlocked?:boolean}} [progress]
 * @returns {{seeded:boolean}} 是否发生了补记
 */
export function ensureGallery(progress = {}) {
  const data = readAll();
  if (data.seeded) return { seeded: false };
  data.seeded = true;
  if (progress.extraUnlocked) {
    for (const c of listBossCards()) {
      if (!c.extra) data.cards[cardKey(c.bossKey, c.cardIndex)] = 1;
    }
    for (const e of listEnemies()) {
      if (e.group !== 'arch') data.enemies[e.id] = 1;
    }
  }
  writeAll(data);
  return { seeded: !!progress.extraUnlocked };
}

/** 记一条符卡已收录（宿主在 bossPhase / cardResult 里调用）。 */
export function markCardSeen(bossKey, cardIndex) {
  const data = readAll();
  const k = cardKey(bossKey, cardIndex);
  if (data.cards[k]) return false;
  data.cards[k] = 1;
  writeAll(data);
  return true;
}

/** 记一种敌机已收录（宿主在遭遇时调用；同一种只写一次）。 */
export function markEnemySeen(id) {
  if (!id) return false;
  const data = readAll();
  if (data.enemies[id]) return false;
  data.enemies[id] = 1;
  writeAll(data);
  return true;
}

/** 已收录数量，给标题页或报告用。 */
export function galleryStats() {
  const data = readAll();
  const cards = Object.keys(data.cards).length;
  const enemies = Object.keys(data.enemies).length;
  return { cards, enemies, cardTotal: listBossCards().length, enemyTotal: listEnemies().length };
}

/** 清空图鉴（调试用）。 */
export function clearGallery() {
  writeAll({ cards: {}, enemies: {}, seeded: true });
}

/* ------------------------------------------------------------------
 * 三、页面 UI
 * ---------------------------------------------------------------- */

const CSS = `
.gg{position:absolute;inset:0;z-index:30;pointer-events:auto;display:flex;align-items:center;
  justify-content:center;opacity:0;transition:opacity .18s ease;font-family:var(--font-ui,system-ui,sans-serif)}
.gg.is-in{opacity:1}
.gg.hidden{display:none}
.gg-veil{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,#221b34 0%,#110e1c 55%,#07060d 100%)}
.gg-veil::after{content:'';position:absolute;inset:0;
  background:radial-gradient(60% 50% at 50% 0%,rgba(255,214,111,.09),transparent 70%)}
.gg-frame{position:relative;width:min(1120px,94vw);height:min(660px,90vh);display:flex;flex-direction:column;
  border:1px solid rgba(255,214,111,.22);background:rgba(10,8,18,.82);box-shadow:0 24px 80px rgba(0,0,0,.6)}
.gg-head{display:flex;align-items:baseline;gap:20px;padding:16px 26px 0;
  border-bottom:1px solid rgba(255,214,111,.16)}
.gg-title{font-size:calc(21px * var(--s,1));letter-spacing:.22em;color:#ffd66f}
.gg-tabs{display:flex;gap:6px;margin-left:auto}
.gg-tab{padding:6px 16px;font-size:calc(12px * var(--s,1));letter-spacing:.14em;cursor:pointer;
  color:rgba(255,255,255,.5);border-bottom:2px solid transparent;transition:color .12s,border-color .12s}
.gg-tab.on{color:#ffd66f;border-bottom-color:#ffd66f}
.gg-count{padding:0 0 12px;font-size:calc(11px * var(--s,1));color:rgba(255,255,255,.42);letter-spacing:.1em}
.gg-body{flex:1;display:flex;min-height:0}
.gg-list-wrap{flex:0 0 60%;overflow-y:auto;padding:8px 0 24px;scrollbar-width:thin}
.gg-list-wrap::-webkit-scrollbar{width:6px}
.gg-list-wrap::-webkit-scrollbar-thumb{background:rgba(255,214,111,.28);border-radius:3px}
.gg-grp{padding:14px 26px 4px;font-size:calc(11px * var(--s,1));letter-spacing:.2em;
  color:rgba(255,214,111,.72);border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:4px}
.gg-row{display:flex;align-items:center;gap:12px;padding:9px 26px;cursor:pointer;
  border-left:2px solid transparent;transition:background .12s}
.gg-row.is-sel{background:linear-gradient(90deg,rgba(255,214,111,.14),transparent 80%);border-left-color:#ffd66f}
.gg-bar{flex:0 0 3px;align-self:stretch;border-radius:2px;opacity:.85}
.gg-no{flex:0 0 46px;font-family:"Optima","Palatino Linotype","Times New Roman",serif;
  font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.42);letter-spacing:.06em}
.gg-row.is-sel .gg-no{color:#ffd66f}
.gg-name{flex:1;font-size:calc(14px * var(--s,1));color:#f2ecff;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.gg-row.is-locked .gg-name{color:rgba(255,255,255,.42);letter-spacing:.16em}
.gg-row.is-locked .gg-bar{opacity:.16}
.gg-side{flex:1;border-left:1px solid rgba(255,214,111,.14);padding:22px 24px;display:flex;
  flex-direction:column;gap:12px;min-width:0}
.gg-side-no{font-family:"Optima","Palatino Linotype","Times New Roman",serif;
  font-size:calc(28px * var(--s,1));color:rgba(255,214,111,.28);letter-spacing:.14em}
.gg-side-name{font-size:calc(17px * var(--s,1));color:#fff;line-height:1.5;word-break:break-word}
.gg-side-line{height:1px;background:linear-gradient(90deg,rgba(255,214,111,.5),transparent)}
.gg-kv{display:flex;gap:10px;font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.6)}
.gg-kv b{color:#ffd66f;font-weight:400;min-width:4.5em}
.gg-desc{font-size:calc(13px * var(--s,1));line-height:1.85;color:rgba(255,255,255,.72);
  margin-top:4px;white-space:pre-wrap}
.gg-foot{padding:12px 26px;border-top:1px solid rgba(255,214,111,.16);
  font-size:calc(12px * var(--s,1));color:rgba(255,255,255,.5);letter-spacing:.1em;
  display:flex;gap:22px;flex-wrap:wrap}
.gg-foot b{color:#ffd66f;font-weight:400}
`;

function injectCss() {
  if (document.getElementById('hks-gallery-css')) return;
  const st = document.createElement('style');
  st.id = 'hks-gallery-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

function unknownMarks(n) {
  return (getLang() === 'en' ? '?' : '？').repeat(n);
}

/** 面序号 → 显示名。「7」是 EXTRA 的约定值（见 ARCH_LORE）。 */
function stageLabelOf(n) {
  if (n === 7) return 'EXTRA';
  if (!n) return '—';
  return 'STAGE ' + n;
}

/**
 * 图鉴页面。
 *
 * 同一份 DOM 里做两个 tab，切换只换列表内容，不重建整屏层——
 * 重建会丢滚动位置，翻到一半切 tab 回来又回到顶部很难受。
 */
export class GalleryRoom {
  /**
   * @param {object} opt
   * @param {import('../engine/input.js').Input} opt.input
   * @param {HTMLElement} opt.host
   * @param {() => boolean} [opt.isExtraUnlocked] 读 hks.progress.v1 的 EXTRA 解锁位
   * @param {() => void} opt.onExit
   */
  constructor({ input, host, isExtraUnlocked, onExit }) {
    this.input = input;
    this.host = host;
    this.isExtraUnlocked = isExtraUnlocked || (() => false);
    this.onExit = onExit || (() => {});

    this.visible = false;
    this.el = null;
    this.d = null;
    this.tab = 'card';     // 'card' | 'enemy'
    this.rows = [];
    this.sel = 0;
    this._builtLang = '';
    this._hideTimer = 0;
    this._scroll = { card: 0, enemy: 0 };
  }

  show() {
    ensureGallery({ extraUnlocked: this.isExtraUnlocked() });
    this._build();
    if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = 0; }
    this.visible = true;
    this.el.classList.remove('hidden');
    this._refresh();
    localizeDom(this.el);
    requestAnimationFrame(() => {
      if (this.visible && this.el) this.el.classList.add('is-in');
    });
  }

  hide() {
    if (!this.el) return;
    this.visible = false;
    this.el.classList.remove('is-in');
    this._hideTimer = setTimeout(() => {
      if (!this.visible && this.el) this.el.classList.add('hidden');
      this._hideTimer = 0;
    }, 220);
  }

  handleKey(e) {
    if (!this.visible) return false;
    const a = this.input?.actionOf?.(e.code) || '';
    if (a === 'up') { e.preventDefault(); this._move(-1); return true; }
    if (a === 'down') { e.preventDefault(); this._move(1); return true; }
    // 左右切 tab（符卡页面里左右只是翻得快一点，这里语义更自然）
    if (a === 'left') { e.preventDefault(); this._setTab('card'); return true; }
    if (a === 'right') { e.preventDefault(); this._setTab('enemy'); return true; }
    if (e.code === 'Tab') { e.preventDefault(); this._setTab(this.tab === 'card' ? 'enemy' : 'card'); return true; }
    if (a === 'pause' || a === 'cancel' || e.code === 'Escape') {
      e.preventDefault();
      this.onExit();
      return true;
    }
    // 独立页面：没定义的键也吞掉，别让标题页快捷键在背后生效
    return true;
  }

  update() {}

  _setTab(tab) {
    if (tab === this.tab) return;
    // 记住当前 tab 的滚动位置，切回来还在原地
    const wrap = this.d?.wrap;
    if (wrap) this._scroll[this.tab] = wrap.scrollTop;
    this.tab = tab;
    this.sel = 0;
    this._paintTab();
  }

  _move(dir) {
    if (!this.rows.length) return;
    const n = this.rows.length;
    this.sel = ((this.sel + dir) % n + n) % n;
    this._refresh();
  }

  /* ---------- 渲染 ---------- */

  _build() {
    if (this.el) {
      if (this._builtLang === getLang()) return;
      this.el.remove();
      this.el = null;
      this.d = null;
      this.rows = [];
    }
    injectCss();
    this._builtLang = getLang();

    const el = document.createElement('div');
    el.className = 'gg hidden';
    el.innerHTML =
      '<div class="gg-veil"></div>' +
      '<div class="gg-frame">' +
        '<div class="gg-head">' +
          '<span class="gg-title">' + tr('幻想乡图鉴') + '</span>' +
          '<span class="gg-count"></span>' +
          '<div class="gg-tabs">' +
            '<div class="gg-tab" data-tab="card">' + tr('符卡') + '</div>' +
            '<div class="gg-tab" data-tab="enemy">' + tr('敌机') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="gg-body">' +
          '<div class="gg-list-wrap"><ul class="gg-list"></ul></div>' +
          '<div class="gg-side">' +
            '<div class="gg-side-no"></div>' +
            '<div class="gg-side-name"></div>' +
            '<div class="gg-side-line"></div>' +
            '<div class="gg-kv"><b>' + tr('分类') + '</b><span class="gg-v-cat"></span></div>' +
            '<div class="gg-kv"><b>' + tr('所属面') + '</b><span class="gg-v-stage"></span></div>' +
            '<div class="gg-desc"></div>' +
          '</div>' +
        '</div>' +
        '<div class="gg-foot">' +
          '<span><b>↑↓</b> ' + tr('选择') + '</span>' +
          '<span><b>←→ / TAB</b> ' + tr('切换分类') + '</span>' +
          '<span><b>ESC</b> ' + tr('返回') + '</span>' +
        '</div>' +
      '</div>';

    const $ = (s) => el.querySelector(s);
    this.d = {
      count: $('.gg-count'),
      wrap: $('.gg-list-wrap'),
      list: $('.gg-list'),
      no: $('.gg-side-no'),
      name: $('.gg-side-name'),
      cat: $('.gg-v-cat'),
      stage: $('.gg-v-stage'),
      desc: $('.gg-desc'),
      tabs: [...el.querySelectorAll('.gg-tab')],
    };
    for (const t of this.d.tabs) {
      t.addEventListener('click', () => { if (this.visible) this._setTab(t.dataset.tab); });
    }

    this.host.appendChild(el);
    this.el = el;
    this._paintTab();
  }

  /** 切 tab 时重建列表（数据量小，直接重建比做 diff 省事）。 */
  _paintTab() {
    if (!this.d) return;
    for (const t of this.d.tabs) t.classList.toggle('on', t.dataset.tab === this.tab);
    const list = this.d.list;
    list.innerHTML = '';
    this.rows = [];
    this.sel = 0;

    if (this.tab === 'card') this._paintCards(list);
    else this._paintEnemies(list);

    const wrap = this.d.wrap;
    wrap.scrollTop = this._scroll[this.tab] || 0;
    const stat = galleryStats();
    this.d.count.textContent = this.tab === 'card'
      ? tr('已收录 {a} / {b}', { a: stat.cards, b: stat.cardTotal })
      : tr('已收录 {a} / {b}', { a: stat.enemies, b: stat.enemyTotal });
    this._refresh();
  }

  _paintCards(list) {
    const cards = listBossCards();
    const data = readAll();
    const groups = [];
    const byStage = new Map();
    for (const c of cards) {
      let g = byStage.get(c.stageIndex);
      if (!g) {
        g = { stageIndex: c.stageIndex, name: c.stageName, extra: c.extra, items: [] };
        byStage.set(c.stageIndex, g);
        groups.push(g);
      }
      g.items.push(c);
    }

    for (const g of groups) {
      const head = document.createElement('li');
      head.className = 'gg-grp';
      head.textContent = (g.extra ? 'EXTRA' : 'STAGE ' + (g.stageIndex + 1)) + '　' + tr(g.name);
      list.appendChild(head);
      g.items.forEach((c) => {
        const seen = !!data.cards[cardKey(c.bossKey, c.cardIndex)];
        const li = document.createElement('li');
        li.className = 'gg-row' + (seen ? '' : ' is-locked');
        li.innerHTML =
          '<span class="gg-bar" style="background:' + (c.accent || '#ffd66f') + '"></span>' +
          '<span class="gg-no">No. ' + String(c.cardIndex + 1).padStart(2, '0') + '</span>' +
          '<span class="gg-name">' + (seen ? tr(c.cardName) : unknownMarks(6)) + '</span>';
        const idx = this.rows.length;
        this.rows.push({
          li,
          seen,
          no: 'No. ' + String(c.cardIndex + 1).padStart(2, '0'),
          name: seen ? tr(c.cardName) : unknownMarks(8),
          cat: seen ? tr(c.bossName) + '　' + tr(c.bossTitle) : unknownMarks(4),
          stage: (c.extra ? 'EXTRA' : 'STAGE ' + (c.stageIndex + 1)) + '　' + tr(c.stageName),
          desc: seen
            ? tr('耐久 {hp}　{pat} 式弹幕', { hp: c.cardHp, pat: c.patternCount })
            : tr('尚未收录。打到这一张就会记进来。'),
          color: c.accent || '#ffd66f',
        });
        this._bindRow(li, idx);
        list.appendChild(li);
      });
    }
  }

  _paintEnemies(list) {
    const enemies = listEnemies();
    const data = readAll();
    let cur = '';
    enemies.forEach((e) => {
      if (e.group !== cur) {
        cur = e.group;
        const head = document.createElement('li');
        head.className = 'gg-grp';
        head.textContent = tr(e.groupLabel);
        list.appendChild(head);
      }
      const seen = !!data.enemies[e.id];
      const li = document.createElement('li');
      li.className = 'gg-row' + (seen ? '' : ' is-locked');
      // 编号用全局序号，这样「No. 07」是稳定的，不会因为分组换了就变
      const n = enemies.indexOf(e) + 1;
      li.innerHTML =
        '<span class="gg-bar" style="background:' + e.color + '"></span>' +
        '<span class="gg-no">No. ' + String(n).padStart(2, '0') + '</span>' +
        '<span class="gg-name">' + (seen ? tr(e.name) : unknownMarks(4)) + '</span>';
      const idx = this.rows.length;
      this.rows.push({
        li,
        seen,
        no: 'No. ' + String(n).padStart(2, '0'),
        name: seen ? tr(e.name) : unknownMarks(6),
        cat: seen ? tr(e.groupLabel) : unknownMarks(4),
        stage: stageLabelOf(e.appear),
        desc: seen ? tr(e.desc) : tr('尚未收录。在关卡里遇到就会记进来。'),
        color: e.color,
      });
      this._bindRow(li, idx);
      list.appendChild(li);
    });
  }

  _bindRow(li, idx) {
    li.addEventListener('mouseenter', () => {
      if (!this.visible || this.sel === idx) return;
      this.sel = idx;
      this._refresh();
    });
    li.addEventListener('click', () => {
      if (!this.visible) return;
      this.sel = idx;
      this._refresh();
    });
  }

  _refresh() {
    if (!this.d) return;
    this.rows.forEach((r, i) => r.li.classList.toggle('is-sel', i === this.sel));
    const r = this.rows[this.sel];
    if (!r) {
      this.d.no.textContent = '';
      this.d.name.textContent = '';
      this.d.cat.textContent = '';
      this.d.stage.textContent = '';
      this.d.desc.textContent = '';
      return;
    }
    this.d.no.textContent = r.no;
    this.d.name.textContent = r.name;
    this.d.name.style.color = r.seen ? '#fff' : 'rgba(255,255,255,.5)';
    this.d.cat.textContent = r.cat;
    this.d.stage.textContent = r.stage;
    this.d.desc.textContent = r.desc;
    this.d.desc.style.borderLeft = '2px solid ' + (r.seen ? r.color : 'rgba(255,255,255,.14)');
    this.d.desc.style.paddingLeft = '10px';
    r.li.scrollIntoView({ block: 'nearest' });
  }
}
