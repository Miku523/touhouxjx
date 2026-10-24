/**
 * 符卡 cut-in：释放瞬间的全屏演出。
 *
 * 参考原作 Bomb 的四拍节奏：
 *   ① 白闪炸开、画面压暗
 *   ② 立绘带着残影从左破屏冲入，速度线刷过
 *   ③ 符卡名逐字砸出，符阵圆环同时扩张
 *   ④ 白光收束、整体退场
 * 总时长 1.15s，期间游戏照常推进（伤害与判定不在这里结算）。
 */

import { tr } from '../i18n/index.js';

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

/** 演出总时长（毫秒），与 style.css 里的 cut-in 动画时长保持同步 */
const DURATION = 1150;

export class SpellCutin {
  constructor() {
    this.el = document.getElementById('spellCutin');
    this.elName = document.getElementById('scName');
    this.elSub = document.getElementById('scSub');
    this.canvas = document.getElementById('scPortrait');
    this.ghost = document.getElementById('scPortrait2');
    this.elGame = document.getElementById('game');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.gctx = this.ghost ? this.ghost.getContext('2d') : null;
    this._imgs = new Map();
    this._timer = 0;
    this._n = { reimu: 0, marisa: 0 };
    this._last = null;
  }

  _img(char) {
    const key = char === 'marisa' ? 'marisa' : 'reimu';
    let entry = this._imgs.get(key);
    if (!entry) {
      const img = new Image();
      entry = { img, ready: false };
      img.onload = () => {
        entry.ready = true;
        // 立绘往往在第一次放符卡时才加载完，赶上了就立刻补画
        if (this._last === key && this.el?.classList.contains('show')) this._paint(key);
      };
      img.src = new URL(`${key}_title.png`, BASE).href;
      this._imgs.set(key, entry);
    }
    return entry;
  }

  _paint(char) {
    const entry = this._img(char);
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

  /** 播放一次符卡演出。char = 'reimu' | 'marisa' */
  show(char) {
    if (!this.el) return;
    const key = char === 'marisa' ? 'marisa' : 'reimu';
    const list = SPELLS[key] || SPELLS.reimu;
    const spell = list[this._n[key]++ % list.length];
    this._last = key;

    this._setName(tr(spell.name));
    if (this.elSub) this.elSub.textContent = tr(spell.sub);
    this.el.classList.toggle('marisa', key === 'marisa');
    this._paint(key);

    // 重播 CSS 动画：先摘掉 show，强制一次重排，再挂回去
    this.el.classList.remove('show');
    void this.el.offsetWidth;
    this.el.classList.add('show');

    // 世界层镜头 punch：只推 canvas，UI 保持不动
    if (this.elGame) {
      this.elGame.classList.remove('sc-punch');
      void this.elGame.offsetWidth;
      this.elGame.classList.add('sc-punch');
    }

    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.hide(), DURATION);
  }

  hide() {
    clearTimeout(this._timer);
    this._timer = 0;
    this.el?.classList.remove('show');
  }
}
