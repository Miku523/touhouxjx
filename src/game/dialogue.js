/**
 * 剧情对话系统：DOM 文本 + AI 立绘（缺图时只留柔光，不画任何矢量人物）+ 打字机效果。
 *
 * 例外：中途 Boss 魂魄妖梦（youmu）没有 AI 立绘，复用 genboss.js 的程序化战斗立绘当对话立绘，
 * 保证「战斗里看到的她」和「对话里说话的她」是同一张画。
 *
 * 用法：
 *   const dlg = new Dialogue();
 *   dlg.play(script, { onEnd: () => resume() });
 *   // 每帧：dlg.update(dt)  —— 即使用户不看对话，也要驱动立绘呼吸/眨眼
 *   // 推进：dlg.advance()   —— 空格/确认键/点击
 */
import { preloadWhenIdle } from '../engine/lazy_preload.js';
import { tr } from '../i18n/index.js';

/* ---------------- AI 立绘（Seedream 生成，tools/cutout.py 抠图） ---------------- */
const AI_PORTRAITS = {
  reimu: 'reimu.webp',
  marisa: 'marisa.webp',
  rumia: 'rumia.webp',
  wriggle: 'wriggle.webp',
  cirno: 'cirno.webp',
  aya: 'aya.webp',
  yuyuko: 'yuyuko.webp',
  kaguya: 'kaguya.webp',
  flandre: 'flandre.webp',
  remilia: 'remilia.webp',
  youmu: 'youmu.webp',
  sakuya: 'sakuya.webp',
};
const AI_BASE = new URL('../art/gen/', import.meta.url);
const aiImages = {};
const aiPending = {};

/**
 * 取一个角色 AI 立绘。已缓存直接返回；加载中复用同一个 Promise；
 * 失败不 reject，返回 null（画面只留柔光），绝不把对话卡死。
 */
function loadPortrait(key, priority = 'high') {
  if (aiImages[key]) return Promise.resolve(aiImages[key]);
  if (aiPending[key]) return aiPending[key];
  const file = AI_PORTRAITS[key];
  if (!file) return Promise.resolve(null);

  const img = new Image();
  img.decoding = 'async';
  // 对话立绘比场景预热更急：进关卡时就按 high 抢带宽，避免 Boss 战前还在下载
  img.fetchPriority = priority;
  aiPending[key] = new Promise((resolve) => {
    img.onload = () => {
      aiImages[key] = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
  });
  img.src = new URL(file, AI_BASE).href;
  return aiPending[key];
}

/** 预热一批角色的 AI 立绘（未知角色会被忽略）；永不 reject */
export function preloadPortraits(keys) {
  const list = [...new Set(keys || [])].filter((k) => AI_PORTRAITS[k]);
  return Promise.all(list.map((k) => loadPortrait(k, 'high')));
}

// 开局对话就要用灵梦 / 魔理沙：页面一启动就用低优先级先拉，
// 让它们排在标题三张图之后，但比「窗口 load 后的空闲队列」早得多。
for (const key of ['reimu', 'marisa']) loadPortrait(key, 'low');

// 其余角色等首屏稳定后再整批排队；
// 实际进关卡 / 播对话时 preloadPortraits 会把需要的角色再提前拉一次（幂等）。
preloadWhenIdle(() => {
  for (const key of Object.keys(AI_PORTRAITS)) loadPortrait(key);
});

/** 有 AI 立绘就用它（底部中心对齐、高度 560），返回是否画了 */
function paintAiPortrait(ctx, o) {
  const img = aiImages[o.char];
  if (img && img.naturalWidth) {
    const h = 560;
    const w = img.naturalWidth * (h / img.naturalHeight);
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    // 情绪：慌张/受击轻微侧倾，开心稍微抬头
    if (o.mood === 'panic') ctx.rotate(-0.03);
    else if (o.mood === 'sad') ctx.rotate(0.02);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }
  return false;
}

/**
 * 立绘缺图 / 未就绪：只铺一层很淡的柔光，不画任何人物轮廓。
 * （剪影再抽象也会被读成「矢量小人」，宁可留空等 AI 立绘。）
 */
function paintPortrait(ctx, o) {
  if (paintAiPortrait(ctx, o)) return;
  const cy = -300;
  const r = 250;
  ctx.save();
  ctx.globalAlpha = (o.alpha ?? 1) * 0.5;
  const glow = ctx.createRadialGradient(0, cy, 10, 0, cy, r);
  glow.addColorStop(0, 'rgba(255,235,245,0.10)');
  glow.addColorStop(1, 'rgba(255,235,245,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const CHAR_NAMES = {
  reimu: '博丽灵梦',
  marisa: '雾雨魔理沙',
  rumia: '露米娅',
  wriggle: '莉格露·奈特巴格',
  cirno: '琪露诺',
  aya: '射命丸文',
  yuyuko: '西行寺幽幽子',
  kaguya: '蓬莱山辉夜',
  flandre: '芙兰朵露·斯卡雷特',
  remilia: '雷米莉亚·斯卡雷特',
  youmu: '魂魄妖梦',
  sakuya: '十六夜咲夜',
  unknown: '？？？',
};

const CHAR_TYPE_SPEED = 46; // 每秒显示字数

export class Dialogue {
  constructor() {
    this.el = document.getElementById('dialogue');
    this.speakerEl = document.getElementById('speaker');
    this.textEl = document.getElementById('dlgText');
    this.portraitL = document.getElementById('portraitL');
    this.portraitR = document.getElementById('portraitR');
    this.ctxL = this.portraitL ? this.portraitL.getContext('2d') : null;
    this.ctxR = this.portraitR ? this.portraitR.getContext('2d') : null;

    this.active = false;
    this.script = [];
    this.index = 0;
    this.charT = 0;
    this.shown = 0;
    this.fullText = '';
    this.t = 0;
    this.onEnd = null;

    this.speaker = null;
    this.leftChar = null;
    this.rightChar = null;
    this.leftMood = 'normal';
    this.rightMood = 'normal';
    this.playerChar = 'reimu';

    this._clickHandler = () => {
      if (this.active) this._onClick();
    };
    this.el?.addEventListener('pointerdown', this._clickHandler);
  }

  get isTyping() {
    return this.shown < this.fullText.length;
  }

  /**
   * @param {{who:string,text:string,mood?:string,side?:'left'|'right'}[]} script
   * @param {{onEnd?:Function}} [opts]
   */
  play(script, opts = {}) {
    this.script = script || [];
    this.index = 0;
    this.active = true;
    this.onEnd = opts.onEnd || null;
    this.t = 0;
    // 每段剧本从空白立绘开始：旁白行不改立绘，若沿用上一场的 leftChar/rightChar，
    // 上一面 Boss（如 S4 开场右侧的琪露诺）会残留在旁白旁边，像角色走错片场。
    this.leftChar = null;
    this.rightChar = null;
    this.leftMood = 'normal';
    this.rightMood = 'normal';
    this.el?.classList.remove('hidden');
    this._applyLine();
  }

  /** 对话结束 */
  close() {
    this.active = false;
    this.el?.classList.add('hidden');
    const cb = this.onEnd;
    this.onEnd = null;
    if (cb) cb();
  }

  /** 强制中止：返回标题/重开时用，不触发 onEnd，避免旧剧本把游戏重新拉起来 */
  stop() {
    this.active = false;
    this.script = [];
    this.index = 0;
    this.fullText = '';
    this.shown = 0;
    this.onEnd = null;
    this.el?.classList.add('hidden');
  }

  _onClick() {
    this.advance();
  }

  advance() {
    if (!this.active) return;
    if (this.isTyping) {
      this.shown = this.fullText.length;
      this._renderText();
      return;
    }
    this.index++;
    if (this.index >= this.script.length) {
      this.close();
    } else {
      this._applyLine();
    }
  }

  /** 设置当前操作的主角（决定 'player' 这个占位符解释成谁） */
  setPlayerChar(c) {
    this.playerChar = c === 'marisa' ? 'marisa' : 'reimu';
  }

  /**
   * 预载若干角色的 AI 立绘；调用方可以 await 它再开对话，
   * 保证第一帧就是 AI 立绘，而不是等待态柔光。
   */
  preparePortraits(keys) {
    return preloadPortraits(keys);
  }

  /**
   * 解析剧本里的 who：
   *   'player'            → 当前操作的主角
   *   剧本里写死的主角名   → 换成搭档，避免「两个魔理沙同屏」
   *   其它（Boss / 旁白） → 原样返回
   */
  _resolveWho(who) {
    const partnerKey = this.playerChar === 'marisa' ? 'reimu' : 'marisa';
    if (who === 'player') return this.playerChar;
    // 'partner' 明确表示「另一位主角」，与玩家选择无关，永远指向搭档
    if (who === 'partner') return partnerKey;
    // 兼容剧本里写死的主角名：若与玩家重合则视为搭档，避免「两个魔理沙同屏」
    if (who === this.playerChar) return partnerKey;
    return who;
  }

  /** 台词占位符：{me}=玩家名 {partner}=搭档名 {self}=说话人自己 */
  _subst(text, who) {
    if (!text) return '';
    // 先取中文键再翻译，避免「灵梦」被译成罗马音后比较失败
    const meRaw = this.playerChar === 'marisa' ? '魔理沙' : '灵梦';
    const partnerRaw = meRaw === '魔理沙' ? '灵梦' : '魔理沙';
    const me = tr(meRaw);
    const partner = tr(partnerRaw);
    const selfRaw = who === 'reimu' ? '灵梦' : who === 'marisa' ? '魔理沙' : (CHAR_NAMES[who] || who);
    const self = tr(selfRaw);
    return text
      .replace(/\{me\}/g, me)
      .replace(/\{partner\}/g, partner)
      .replace(/\{self\}/g, self);
  }

  _applyLine() {
    const line = this.script[this.index];
    if (!line) return;
    let who = this._resolveWho(line.who || 'unknown');
    const isNarrator = who === 'narrator';
    // 玩家固定在左、搭档固定在右，避免搭档的立绘顶掉玩家
    const side = line.side || (who === this.playerChar ? 'left' : 'right');

    this.speaker = who;
    // 先翻译整句（译文保留 {me}/{partner}/{self} 占位符），再按当前主角替换
    this.fullText = this._subst(tr(line.text || ''), who);
    this.shown = 0;
    this.charT = 0;

    // 说话方立绘高亮（旁白不改动立绘）
    if (!isNarrator) {
      if (side === 'left') {
        this.leftChar = who;
        this.leftMood = line.mood || 'normal';
        this.rightMood = 'normal';
      } else {
        this.rightChar = who;
        this.rightMood = line.mood || 'normal';
        this.leftMood = 'normal';
      }
    }

    if (this.speakerEl) {
      this.speakerEl.textContent = isNarrator ? '' : tr(CHAR_NAMES[who] || who);
    }
    this._renderText();
    this._renderPortraits();
    this._updateActiveClass();
  }

  _renderText() {
    if (!this.textEl) return;
    this.textEl.textContent = this.fullText.slice(0, Math.floor(this.shown));
  }

  _updateActiveClass() {
    const line = this.script[this.index];
    let who = this._resolveWho(line?.who || 'unknown');
    const side = line?.side || (who === this.playerChar ? 'left' : 'right');
    const leftWrap = this.portraitL?.parentElement;
    const rightWrap = this.portraitR?.parentElement;
    if (leftWrap) leftWrap.classList.toggle('active', side === 'left' && !!this.leftChar);
    if (rightWrap) rightWrap.classList.toggle('active', side === 'right' && !!this.rightChar);
    if (leftWrap) leftWrap.classList.toggle('hidden', !this.leftChar);
    if (rightWrap) rightWrap.classList.toggle('hidden', !this.rightChar);
  }

  _renderPortraits() {
    if (this.ctxL && this.leftChar) this._paint(this.ctxL, this.portraitL, this.leftChar, this.leftMood);
    if (this.ctxR && this.rightChar) this._paint(this.ctxR, this.portraitR, this.rightChar, this.rightMood);
  }

  _paint(ctx, canvas, charKey, mood) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height - 10);
    paintPortrait(ctx, {
      char: charKey,
      t: this.t,
      mood: mood || 'normal',
      alpha: 1,
    });
    ctx.restore();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;

    if (this.isTyping) {
      this.charT += dt * CHAR_TYPE_SPEED;
      while (this.charT >= 1 && this.shown < this.fullText.length) {
        this.charT -= 1;
        this.shown++;
      }
      this._renderText();
    }

    // 立绘持续重绘（呼吸 / 眨眼 / 发梢）
    this._renderPortraits();
  }

  destroy() {
    this.el?.removeEventListener('pointerdown', this._clickHandler);
  }
}
