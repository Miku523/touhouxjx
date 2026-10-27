/**
 * 符卡 cut-in / Boss 登场演出：释放或登场瞬间的全屏演出。
 *
 * 参考原作 Bomb 的四拍节奏：
 *   ① 白闪炸开、画面压暗
 *   ② 立绘带着残影从左破屏冲入，速度线刷过
 *   ③ 符卡名/角色名逐字砸出，符阵圆环同时扩张
 *   ④ 白光收束、整体退场
 * 总时长 1.15s，期间游戏照常推进（伤害与判定不在这里结算）。
 *
 * Boss 登场复用同一套 DOM：.boss 修饰类把主色换成冷银蓝，并隐藏符阵圆环与
 * 那行「BOSS」小字（角色身后不留任何光环/刀圈，文字只留名字与称号，只保留斜光带与速度线）。
 */

import { tr } from '../i18n/index.js';
import { preloadWhenIdle } from '../engine/lazy_preload.js';

const BASE = new URL('../art/gen/', import.meta.url);

/** 各角色可用的符卡名，按释放次数轮流切换（同名连放会腻） */
const SPELLS = {
  reimu: [
    { name: '梦想封印', sub: '灵符「梦想封印」' },
    { name: '二重结界', sub: '梦符「二重结界」' },
  ],
  marisa: [
    { name: '极限火花', sub: '恋符「Master Spark」' },
    { name: '星尘幻想', sub: '魔符「Stardust Reverie」' },
  ],
};

/** Boss 登场：立绘 / 名字 / 称号（不放「BOSS」小字，见 style.css 的 .spell-cutin.boss .sc-tag） */
const BOSSES = {
  sakuya: { name: '十六夜咲夜', sub: '完美而潇洒的从者', img: 'sakuya_title.webp' },
};

/** 演出总时长（毫秒），与 style.css 里的 cut-in 动画时长保持同步 */
const DURATION = 1150;

export class SpellCutin {
  constructor() {
    this.el = document.getElementById('spellCutin');
    this.elName = document.getElementById('scName');
    this.elSub = document.getElementById('scSub');
    this.elTag = this.el ? this.el.querySelector('.sc-tag') : null;
    this.canvas = document.getElementById('scPortrait');
    this.ghost = document.getElementById('scPortrait2');
    this.elGame = document.getElementById('game');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.gctx = this.ghost ? this.ghost.getContext('2d') : null;
    this._imgs = new Map();
    this._timer = 0;
    this._n = { reimu: 0, marisa: 0 };
    this._last = null;
    // 预热 Boss 登场立绘：不然第一次登场的前 100~200ms 会是空画布。
    // 排到首屏空闲时段（弱网受限链路跳过；真到登场时 _img 仍会按需请求，onload 后补画）。
    preloadWhenIdle(() => {
      for (const k of Object.keys(BOSSES)) this._img(BOSSES[k].img);
    });
  }

  /** file = src/art/gen/ 下的文件名，例如 reimu_title.webp */
  _img(file) {
    let entry = this._imgs.get(file);
    if (!entry) {
      const img = new Image();
      entry = { img, ready: false };
      img.onload = () => {
        entry.ready = true;
        // 立绘往往在第一次放符卡时才加载完，赶上了就立刻补画
        if (this._last === file && this.el?.classList.contains('show')) this._paint(file);
      };
      img.src = new URL(file, BASE).href;
      this._imgs.set(file, entry);
    }
    return entry;
  }

  _paint(file) {
    const entry = this._img(file);
    const targets = [
      [this.ctx, this.canvas],
      [this.gctx, this.ghost],
    ];
    for (const [ctx, cv] of targets) {
      if (!ctx || !cv) continue;
      const W = cv.width;
      const H = cv.height;
      ctx.clearRect(0, 0, W, H);
      if (!entry.ready) continue;
      const img = entry.img;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) continue;
      // contain：立绘整张放进画布，绝不裁头。
      // （立绘 PNG 的头发一直画到图片顶端，若按宽度铺满会削掉头顶，切出一条水平硬边）
      const sc = Math.min(W / iw, H / ih);
      const dw = iw * sc;
      const dh = ih * sc;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (W - dw) / 2, H - dh, dw, dh);
    }
  }

  /** 符卡名逐字包一层 span，让 CSS 能一字一字砸下来 */
  _setName(text) {
    if (!this.elName) return;
    this.elName.textContent = '';
    const chars = Array.from(text || '');
    for (let i = 0; i < chars.length; i++) {
      const ch = document.createElement('span');
      ch.className = 'ch';
      ch.style.setProperty('--i', String(i));
      ch.textContent = chars[i];
      this.elName.appendChild(ch);
    }
  }

  /** 重播一遍 CSS 动画：先摘掉 show，强制一次重排，再挂回去 */
  _replay() {
    this.el.classList.remove('show');
    // 世界层镜头 punch：只推 canvas，UI 保持不动。
    // 两个元素先一起摘类、只强制同步一次布局（读一次 offsetWidth 就会把两者的样式一起刷干净），
    // 再一起挂回去 —— 第二次 offsetWidth 读在 Boss 登场那一帧是白给的主线程停顿。
    if (this.elGame) this.elGame.classList.remove('sc-punch');
    void this.el.offsetWidth;
    this.el.classList.add('show');
    if (this.elGame) this.elGame.classList.add('sc-punch');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.hide(), DURATION);
  }

  /** 播放一次符卡演出。char = 'reimu' | 'marisa' */
  show(char) {
    if (!this.el) return;
    const key = char === 'marisa' ? 'marisa' : 'reimu';
    const list = SPELLS[key] || SPELLS.reimu;
    const spell = list[this._n[key]++ % list.length];
    const file = `${key}_title.webp`;
    this._last = file;

    this.el.classList.remove('boss');
    if (this.elTag) this.elTag.textContent = 'SPELL CARD';
    this._setName(tr(spell.name));
    if (this.elSub) this.elSub.textContent = tr(spell.sub);
    this.el.classList.toggle('marisa', key === 'marisa');
    this._paint(file);
    this._replay();
  }

  /**
   * Boss 登场演出：全屏 cut-in。
   * 立绘进 src/art/gen/<key>_title.webp，主色走 .boss 冷银蓝；不放「BOSS」小字
   * —— tag 留空且整行隐藏（style.css 的 .spell-cutin.boss .sc-tag），文字只有名字与称号。
   * @param {string} key 例：'sakuya'
   * @returns {boolean} 是否有这个 Boss 的配置
   */
  showBoss(key) {
    const info = BOSSES[key];
    if (!this.el || !info) return false;
    this._last = info.img;

    this.el.classList.remove('marisa');
    this.el.classList.add('boss');
    // Boss 登场不显示 tag 那行小字（2026-10-27）；空串而不是留着上一次的 'SPELL CARD'。
    if (this.elTag) this.elTag.textContent = '';
    this._setName(tr(info.name));
    if (this.elSub) this.elSub.textContent = tr(info.sub);
    this._paint(info.img);
    this._replay();
    return true;
  }

  hide() {
    clearTimeout(this._timer);
    this._timer = 0;
    this.el?.classList.remove('show');
  }
}
