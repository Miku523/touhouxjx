/**
 * 结局演出：canvas 动态背景 + 立绘 + 粒子 + DOM 字幕 / 结局卡。
 *
 * 用法：
 *   const ending = new Ending();
 *   ending.play(ENDINGS.ed2, { onFinish: () => showTitle(), onCard: () => audio.play('win') });
 *   // 每帧：ending.update(dt)；渲染：ending.draw(ctx)
 *   // 推进：ending.advance()（Enter / 空格 / 点击）；ending.skipToCard()（跳过演出）
 *
 * 视角约定与主循环一致：逻辑分辨率 1280x720，由 Renderer 统一缩放。
 */
import { VIEW_W, VIEW_H } from '../engine/renderer.js';
import { preloadWhenIdle, setPriority } from '../engine/lazy_preload.js';
import { ENDINGS } from './endings.js';
import { getLang, tr } from '../i18n/index.js';
import { CHAR_NAMES } from './dialogue.js';
import { artUrl, onArtError } from '../art/img.js';

const BG_BASE = new URL('../art/gen/bg/', import.meta.url);
const ART_BASE = new URL('../art/gen/', import.meta.url);

const TYPE_SPEED = 34;      // 每秒字数
const SHOT_IN = 1.05;       // 新镜头淡入 + 字幕延迟
const LINE_IN = 0.16;       // 同一镜头内换行延迟
const CARD_PROMPT_AT = 1.35;
const CARD_EXIT_AT = 0.75;  // 结局卡出现后至少停留多久才允许离开
const BAR_H = 54;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (v) => 1 - Math.pow(1 - clamp01(v), 3);
const easeInOut = (v) => {
  const x = clamp01(v);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export class Ending {
  constructor() {
    this.root = document.getElementById('ending');
    this.chapterEl = document.getElementById('edChapter');
    this.linesEl = document.getElementById('edLines');
    this.speakerEl = document.getElementById('edSpeaker');
    this.textEl = document.getElementById('edText');
    this.cardEl = document.getElementById('edCard');
    this.cardNoEl = document.getElementById('edCardNo');
    this.cardKindEl = document.getElementById('edCardKind');
    this.cardTitleEl = document.getElementById('edCardTitle');
    this.cardTitleCnEl = document.getElementById('edCardTitleCn');
    this.cardEnEl = document.getElementById('edCardEn');
    this.cardCharEl = document.getElementById('edCardChar');
    this.cardQuoteEl = document.getElementById('edCardQuote');
    this.promptEl = document.getElementById('edPrompt');
    this.skipEl = document.getElementById('edSkip');

    this.active = false;
    this.spec = null;
    this.opts = null;
    this.t = 0;
    this.phase = 'scene';
    this.shotIndex = 0;
    this.shotT = 0;
    this.lineIndex = 0;
    this.fullText = '';
    this.shown = 0;
    this.lineDone = true;
    this.holdT = 0;
    this._lineDelay = 0;
    this.cardT = 0;

    this.bgImgs = new Map();
    this.charImgs = new Map();
    // 结局素材（3 张背景 + 4 张立绘，约 960KB）排到首屏空闲时段：
    // 弱网受限链路会跳过，进最后一面时由 preloadAssets() 提前拉，真到结局也只按需补。
    preloadWhenIdle(() => this._preload());

    this._onPointer = (e) => {
      if (!this.active) return;
      if (e.target?.closest?.('.ed-skip')) return;
      this.advance();
    };
    this.root?.addEventListener('pointerdown', this._onPointer);
    this.skipEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipEl.blur?.();
      this.skipToCard();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 素材                                                                */
  /* ------------------------------------------------------------------ */

  /** 提前拉起全部结局素材；重复调用无副作用 */
  preloadAssets() {
    this._preload();
  }

  _preload() {
    if (this._endedPreload) return;
    this._endedPreload = true;
    const bgs = new Set();
    const chars = new Set();
    for (const spec of Object.values(ENDINGS)) {
      if (spec.still) bgs.add(spec.still);
      for (const shot of spec.shots) {
        if (shot.bg) bgs.add(shot.bg);
        for (const c of shot.cast || []) chars.add(c.key);
      }
    }
    for (const name of bgs) {
      const img = new Image();
      img.decoding = 'async';
      setPriority(img, 'low');
      const webp = new URL(`${name}.webp`, BG_BASE).href;
      img.onerror = () => onArtError(img, webp);
      img.src = artUrl(webp);
      this.bgImgs.set(name, img);
    }
    for (const key of chars) {
      const img = new Image();
      img.decoding = 'async';
      setPriority(img, 'low');
      const webp = new URL(`${key}.webp`, ART_BASE).href;
      img.onerror = () => onArtError(img, webp);
      img.src = artUrl(webp);
      this.charImgs.set(key, img);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 播放控制                                                            */
  /* ------------------------------------------------------------------ */

  play(spec, opts = {}) {
    if (!spec) return;
    this._preload(); // 兜底：弱网下空闲预取被跳过时，结局开场才开始下载
    this.spec = spec;
    this.opts = opts;
    this.active = true;
    this.t = 0;
    this.phase = 'scene';
    this.shotIndex = 0;
    this.shotT = 0;
    this.lineIndex = 0;
    this.cardT = 0;

    if (this.root) {
      this.root.classList.remove('hidden');
      this.root.classList.toggle('is-w', String(spec.noLabel).startsWith('W'));
      this.root.classList.remove('is-card');
      this.root.classList.remove('is-typing');
    }
    if (this.chapterEl) this.chapterEl.textContent = spec.code || '';
    if (this.linesEl) {
      this.linesEl.classList.remove('hidden');
      this.linesEl.classList.remove('narrator');
    }
    this.cardEl?.classList.remove('show');
    this.promptEl?.classList.remove('show');
    this.skipEl?.classList.remove('hidden');
    if (this.promptEl) this.promptEl.textContent = tr('ENTER / 点击继续');

    this._enterShot(0);
    this.opts.onStart?.();
  }

  /** 直接停止（返回标题 / 退出时用），不触发 onFinish */
  stop() {
    this.active = false;
    this.spec = null;
    this.opts = null;
    this.root?.classList.add('hidden');
    this.cardEl?.classList.remove('show');
    this.promptEl?.classList.remove('show');
    // 只清文字，不能清空 edLines 的 innerHTML：edSpeaker / edText 是它的子节点，
    // 清空会让构造函数缓存的引用变成游离节点，之后整场演出都没有字幕。
    if (this.linesEl) this.linesEl.classList.add('hidden');
    if (this.speakerEl) this.speakerEl.textContent = '';
    this._setText('');
  }

  _enterShot(index) {
    this.shotIndex = index;
    this.shotT = 0;
    this.lineIndex = 0;
    this.phase = 'scene';
    this.cardT = 0;
    const shot = this.spec.shots[index];
    this._applyLine(SHOT_IN);
    if (this.cardEl) this.cardEl.classList.remove('show');
    if (this.promptEl) {
      this.promptEl.textContent = tr('ENTER / 点击继续');
      this.promptEl.classList.remove('show');
    }
    this.root?.classList.remove('is-card');
    this.linesEl?.classList.remove('hidden');
    if (shot) this._retrigger(this.linesEl);
  }

  _applyLine(delay) {
    const shot = this.spec?.shots[this.shotIndex];
    const line = shot?.lines[this.lineIndex];
    if (!line) {
      this.fullText = '';
      this.shown = 0;
      this.lineDone = true;
      this._setText('');
      return;
    }
    const who = line.who || 'narrator';
    this.fullText = tr(line.text || '');
    this.shown = 0;
    this.lineDone = !this.fullText;
    this.holdT = 0;
    this._lineDelay = delay;
    let whoName = '';
    if (who === 'player') whoName = CHAR_NAMES[this.spec.char] || '';
    else if (who === 'partner') whoName = CHAR_NAMES[this.spec.char === 'reimu' ? 'marisa' : 'reimu'] || '';
    else if (who !== 'narrator') whoName = CHAR_NAMES[who] || who;
    if (this.speakerEl) this.speakerEl.textContent = whoName ? tr(whoName) : '';
    this.linesEl?.classList.toggle('narrator', who === 'narrator');
    this._setText('');
    this._retrigger(this.linesEl);
  }

  _setText(s) {
    if (this.textEl) this.textEl.textContent = s;
  }

  _retrigger(el) {
    if (!el) return;
    el.classList.remove('line-in');
    // 读一次布局，让 CSS 动画可以重新触发
    void el.offsetWidth;
    el.classList.add('line-in');
  }

  _readTime(text) {
    return Math.min(4.6, 1.15 + String(text || '').length * 0.042);
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;

    if (this.phase === 'card') {
      this.cardT += dt;
      if (this.cardT >= CARD_PROMPT_AT) this.promptEl?.classList.add('show');
      return;
    }

    this.shotT += dt;
    if (this._lineDelay > 0) {
      this._lineDelay -= dt;
      if (this._lineDelay > 0) return;
      this._lineDelay = 0;
    }

    if (!this.lineDone) {
      this.shown += dt * TYPE_SPEED;
      if (this.shown >= this.fullText.length) {
        this.shown = this.fullText.length;
        this.lineDone = true;
        this.holdT = this._readTime(this.fullText);
      }
      this._setText(this.fullText.slice(0, Math.floor(this.shown)));
    } else {
      this.holdT -= dt;
      if (this.holdT <= 0) this._nextLine();
    }
  }

  /** Enter / 空格 / 点击：先补完当前行，再推进 */
  advance() {
    if (!this.active) return;
    if (this.phase === 'card') {
      if (this.cardT >= CARD_EXIT_AT) this.finish();
      return;
    }
    if (this._lineDelay > 0) {
      this._lineDelay = 0;
      return;
    }
    if (!this.lineDone) {
      this.shown = this.fullText.length;
      this.lineDone = true;
      this.holdT = this._readTime(this.fullText);
      this._setText(this.fullText);
      return;
    }
    this._nextLine();
  }

  _nextLine() {
    const shot = this.spec?.shots[this.shotIndex];
    if (!shot) return;
    if (this.lineIndex + 1 < shot.lines.length) {
      this.lineIndex++;
      this._applyLine(LINE_IN);
    } else {
      this._nextShot();
    }
  }

  _nextShot() {
    if (!this.spec) return;
    if (this.shotIndex + 1 < this.spec.shots.length) {
      this._enterShot(this.shotIndex + 1);
    } else {
      this._enterCard();
    }
  }

  /** 跳过演出，直接看结局卡（SKIP 按钮 / Esc） */
  skipToCard() {
    if (!this.active || this.phase === 'card') return;
    this._enterCard();
  }

  _enterCard() {
    if (!this.spec) return;
    this.phase = 'card';
    this.cardT = 0;
    this.root?.classList.add('is-card');
    this.linesEl?.classList.add('hidden');
    this.skipEl?.classList.add('hidden');
    this.promptEl?.classList.remove('show');

    const s = this.spec;
    // 结局卡：每种语言只显示本语言标题，不叠英文/中文副标题，避免混排。
    const zhUi = getLang() === 'zh-Hans' || getLang() === 'zh-Hant';
    const titleCn = zhUi && s.titleCn && s.titleCn !== s.title ? tr(s.titleCn) : '';
    const enSub = '';
    if (this.cardNoEl) this.cardNoEl.textContent = s.noLabel;
    if (this.cardKindEl) this.cardKindEl.textContent = s.kindLabel;
    if (this.cardTitleEl) this.cardTitleEl.textContent = tr(s.title);
    if (this.cardTitleCnEl) {
      this.cardTitleCnEl.textContent = titleCn;
      this.cardTitleCnEl.hidden = !titleCn;
    }
    if (this.cardEnEl) {
      this.cardEnEl.textContent = enSub;
      this.cardEnEl.hidden = !enSub;
    }
    if (this.cardCharEl) this.cardCharEl.textContent = `${tr(s.charName)} · ${s.code}`;
    if (this.cardQuoteEl) this.cardQuoteEl.textContent = tr(s.quote);
    if (this.promptEl) this.promptEl.textContent = tr('ENTER / 点击返回');

    if (this.cardEl) {
      this.cardEl.classList.remove('show');
      void this.cardEl.offsetWidth;
      this.cardEl.classList.add('show');
    }
    this.opts?.onCard?.();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.root?.classList.add('hidden');
    this.cardEl?.classList.remove('show');
    this.promptEl?.classList.remove('show');
    const cb = this.opts?.onFinish;
    this.opts = null;
    cb?.();
  }

  /* ------------------------------------------------------------------ */
  /* 渲染                                                                */
  /* ------------------------------------------------------------------ */

  draw(ctx) {
    if (!this.active || !this.spec) return;
    const spec = this.spec;
    const shots = spec.shots;
    const shot = shots[Math.min(this.shotIndex, shots.length - 1)];
    const prev = this.shotIndex > 0 ? shots[this.shotIndex - 1] : null;

    ctx.save();
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 背景：上一镜头与当前镜头交叉淡入
    const cardFade = this.phase === 'card' ? clamp01(this.cardT / 0.7) : 0;
    const push = this.phase === 'card'
      ? 1.05 + 0.04 * clamp01(this.cardT / 12)
      : 1.045 + 0.055 * clamp01(this.shotT / 22);

    if (prev && this.shotT < 1.15) {
      this._drawBg(ctx, prev.bg, 1.045 + 0.055 * clamp01(this.shotT / 22), this.shotIndex - 1, 1);
      ctx.globalAlpha = easeInOut(this.shotT / 1.15);
    } else {
      ctx.globalAlpha = this.shotIndex === 0 ? easeOut(this.t / 1.2) : 1;
    }
    this._drawBg(ctx, this.phase === 'card' ? (spec.still || shot.bg) : shot.bg, push, this.shotIndex, 1);
    ctx.globalAlpha = 1;

    // 色调与月/祭典的柔光
    this._drawGrade(ctx, spec, shot);

    // 立绘
    const castFade = 1 - easeInOut(cardFade);
    if (castFade > 0.01) {
      this._drawCast(ctx, shot.cast || [], this.shotT, castFade, spec);
    }

    // 前景粒子
    this._drawMotes(ctx, spec.mote, this.t, cardFade);

    // 底部压暗，给字幕让位
    const bg = ctx.createLinearGradient(0, VIEW_H * 0.56, 0, VIEW_H);
    bg.addColorStop(0, 'rgba(3, 2, 8, 0)');
    bg.addColorStop(0.62, 'rgba(3, 2, 8, 0.34)');
    bg.addColorStop(1, 'rgba(3, 2, 8, 0.86)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 结局卡底：压暗 + 角色色柔光
    if (this.phase === 'card') {
      const a = easeOut(clamp01(this.cardT / 0.9));
      ctx.fillStyle = `rgba(4, 2, 10, ${0.26 + 0.34 * a})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.46, 20, VIEW_W / 2, VIEW_H * 0.46, 560);
      rg.addColorStop(0, `rgba(${spec.glow}, ${0.16 * a})`);
      rg.addColorStop(0.45, `rgba(${spec.glow}, ${0.06 * a})`);
      rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }

    this._drawVignette(ctx);

    // 电影黑边
    ctx.fillStyle = '#030208';
    ctx.fillRect(0, 0, VIEW_W, BAR_H);
    ctx.fillRect(0, VIEW_H - BAR_H, VIEW_W, BAR_H);
    ctx.fillStyle = 'rgba(242, 210, 75, 0.13)';
    ctx.fillRect(0, BAR_H, VIEW_W, 1);
    ctx.fillRect(0, VIEW_H - BAR_H - 1, VIEW_W, 1);

    this._drawGrain(ctx);
    ctx.restore();
  }

  _drawBg(ctx, name, zoom, index, alpha) {
    const img = this.bgImgs.get(name);
    const panX = Math.sin(index * 1.7 + 0.4) * 13;
    const panY = -7 * clamp01(this.shotT / 22);
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (img && img.complete && img.naturalWidth) {
      const scale = Math.max(VIEW_W / img.naturalWidth, VIEW_H / img.naturalHeight) * zoom;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (VIEW_W - w) / 2 + panX, (VIEW_H - h) / 2 + panY, w, h);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      g.addColorStop(0, '#151027');
      g.addColorStop(1, '#07040f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.restore();
  }

  _drawGrade(ctx, spec, shot) {
    ctx.save();
    // 统一色温：极淡的角色色，不抢插画
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(${spec.glow}, 0.18)`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();

    // 左上柔光（月光 / 灯笼），随镜头缓慢呼吸
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.9 + Math.sin(this.t * 0.5) * 0.1;
    const gx = VIEW_W * (shot.cast?.length ? 0.22 : 0.4);
    const gy = VIEW_H * 0.2;
    const rg = ctx.createRadialGradient(gx, gy, 20, gx, gy, 430 * pulse);
    rg.addColorStop(0, `rgba(${spec.glow}, 0.13)`);
    rg.addColorStop(0.5, `rgba(${spec.glow}, 0.04)`);
    rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  _drawCast(ctx, cast, shotT, globalAlpha, spec) {
    for (let i = 0; i < cast.length; i++) {
      const c = cast[i];
      const img = this.charImgs.get(c.key);
      if (!img || !img.complete || !img.naturalWidth) continue;
      const appear = easeOut((shotT - 0.30 - (c.delay || 0)) / 0.9);
      if (appear <= 0.001) continue;
      const h = (c.h || 500) * (1 + Math.sin(this.t * 1.15 + i * 1.7) * 0.004);
      const w = img.naturalWidth * (h / img.naturalHeight);
      const dir = c.x < 0.5 ? -1 : 1;
      const x = VIEW_W * c.x - w / 2 + (1 - appear) * dir * 58;
      const bottom = VIEW_H + 20;

      ctx.save();
      ctx.globalAlpha = globalAlpha * appear;

      // 背光：把人物从插画里剥出来
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ag = ctx.createRadialGradient(VIEW_W * c.x, bottom - h * 0.55, 20, VIEW_W * c.x, bottom - h * 0.55, h * 0.62);
      ag.addColorStop(0, `rgba(${spec.glow}, 0.16)`);
      ag.addColorStop(0.55, `rgba(${spec.glow}, 0.05)`);
      ag.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ag;
      ctx.fillRect(VIEW_W * c.x - h * 0.7, bottom - h * 1.3, h * 1.4, h * 1.4);
      ctx.restore();

      // 地面阴影
      ctx.save();
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = 'rgba(2, 1, 6, 0.7)';
      ctx.beginPath();
      ctx.ellipse(VIEW_W * c.x, bottom - 6, w * 0.36, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.drawImage(img, x, bottom - h, w, h);
      ctx.restore();
    }
  }

  _drawMotes(ctx, kind, t, cardFade) {
    ctx.save();
    if (kind === 'star') {
      this._drawStars(ctx, t, cardFade);
    } else if (kind === 'ember') {
      this._drawEmbers(ctx, t, cardFade);
    } else {
      this._drawPetals(ctx, t, cardFade);
    }
    ctx.restore();
  }

  _drawPetals(ctx, t, cardFade) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 58; i++) {
      const layer = i % 3;
      const seed = i * 977.3;
      const x = ((seed * 3.7 + t * (16 + layer * 13)) % (VIEW_W + 260)) - 130;
      const y = ((seed * 2.3 + t * (20 + layer * 17)) % (VIEW_H + 200)) - 100;
      const s = 2.2 + layer * 1.5 + (i % 4) * 0.5;
      ctx.globalAlpha = (0.16 + layer * 0.14) * (1 - cardFade * 0.35);
      ctx.fillStyle = i % 3 === 0 ? '#ffe0ec' : (layer === 2 ? '#ffa9d1' : '#e98bb8');
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.35, s * 0.72, Math.sin(t * 0.8 + i) * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawEmbers(ctx, t, cardFade) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 54; i++) {
      const seed = i * 613.1;
      const x = ((seed * 5.1 + Math.sin(t * 0.4 + i) * 30) % VIEW_W + VIEW_W) % VIEW_W;
      const span = VIEW_H + 120;
      const y = (((seed * 3.3 - t * (12 + (i % 5) * 5)) % span) + span) % span - 40;
      const r = 1 + (i % 4) * 0.7;
      ctx.globalAlpha = (0.22 + (i % 3) * 0.13) * (0.55 + 0.45 * Math.sin(t * 1.6 + i)) * (1 - cardFade * 0.3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
      g.addColorStop(0, 'rgba(255, 228, 150, 0.95)');
      g.addColorStop(0.4, 'rgba(255, 178, 96, 0.30)');
      g.addColorStop(1, 'rgba(255, 140, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawStars(ctx, t, cardFade) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 76; i++) {
      const x = hash(i * 3.1) * VIEW_W;
      const span = VIEW_H + 80;
      const y = (((hash(i * 7.7) * span - t * (4 + (i % 6) * 2.2)) % span) + span) % span - 40;
      const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + (i % 5) * 0.2) + i));
      ctx.globalAlpha = (0.18 + (i % 4) * 0.16) * twinkle * (1 - cardFade * 0.4);
      ctx.fillStyle = i % 5 === 0 ? '#fff3c0' : '#fffbe8';
      const r = 0.8 + (i % 4) * 0.55;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (i % 17 === 0) {
        ctx.strokeStyle = `rgba(255, 244, 200, ${0.5 * twinkle})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6);
        ctx.stroke();
      }
    }
  }

  _drawVignette(ctx) {
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.48, 170, VIEW_W / 2, VIEW_H * 0.5, 790);
    vg.addColorStop(0, 'rgba(2, 1, 6, 0)');
    vg.addColorStop(0.6, 'rgba(2, 1, 6, 0.16)');
    vg.addColorStop(1, 'rgba(2, 1, 6, 0.8)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  _drawGrain(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = '#fff6e0';
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 1.37 + 10) * VIEW_W;
      const y = hash(i * 2.71 + 20) * VIEW_H;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }
}
