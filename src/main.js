/**
 * 入口：《东方新纪行 ～ Chronicle of Gensokyo》
 *
 * 负责：初始化、菜单流程、关卡流程、对话调度、HUD 同步、音频事件。
 */
import { Renderer, VIEW_W, VIEW_H } from './engine/renderer.js';
import { Input, ACTION_DEFS, keyLabel } from './engine/input.js';
import { Loop } from './engine/loop.js';
import { setPriority, preloadWhenIdle } from './engine/lazy_preload.js';
import { AudioEngine } from './engine/audio.js';
import { LEVELS } from './assets/levels.js';
import { Stage } from './game/stage.js';
import { Hud } from './game/hud.js';
import { Dialogue } from './game/dialogue.js';
import { Ending } from './game/ending.js';
import { endingFor } from './game/endings.js';
import { STORY } from './game/story.js';
import { DIFFICULTY_KEYS, DIFFICULTIES, getDifficulty } from './game/difficulty.js';

const MAIN_STAGES = () => LEVELS.filter((l) => !l.extra);
const EXTRA_STAGE = () => LEVELS.find((l) => l.extra);
const STAGE_KEY = (i) => `stage${i + 1}`;
const PROGRESS_KEY = 'hks.progress.v1';

/**
 * ?seed=数字 复现弹幕：把 Math.random 换成 mulberry32 的确定性序列。
 * 换关时把序列重置回该 seed，保证「同一关 + 同样操作 → 同样的随机弹幕」，
 * 不受菜单动画消耗随机数的影响。
 */
let seedReset = null;
(() => {
  const m = /[?&]seed=(\d+)/.exec(location.search);
  if (!m) return;
  const seed = (Number(m[1]) >>> 0) || 1;
  let a = seed;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  seedReset = () => { a = seed; };
})();

/**
 * 难度卡的视觉素材：四档各一个主题色（tone 实色 / glow 供 rgba 用）
 * meters 是「弹幕强度」四格条的相对强度（0–1，手调，比从倍率换算更好看）。
 * 四格顺序与 _difficultyDetailHTML 的 names 一致：密度 / 速度 / 敌弹频率 / 符卡强度。
 * 对应 difficulty.js 里的实际梯度：E 0.64×/0.84×，N 0.96×/1.00×，H 1.16×/1.10×，L 1.45×/1.22×。
 */
const DIFF_CARDS = {
  E: { tone: '#8fd8ff', glow: '143, 216, 255', stars: '★☆☆☆☆', meters: [0.10, 0.15, 0.10, 0.12] },
  N: { tone: '#ffa6d0', glow: '255, 156, 203', stars: '★★☆☆☆', meters: [0.48, 0.45, 0.42, 0.44] },
  H: { tone: '#ffbf6b', glow: '255, 178, 96', stars: '★★★☆☆', meters: [0.72, 0.70, 0.70, 0.72] },
  L: { tone: '#c79bff', glow: '186, 130, 255', stars: '★★★★☆', meters: [1.00, 0.95, 0.98, 1.00] },
};

/**
 * 选择界面的场景底图：每个页面一套独立景别，避免所有子页共用同一块暗紫卡片。
 * img 对应 src/art/gen/bg/*.jpg；mote 是前景粒子（petal 花瓣 / mote 光点 / ember 余烬）；
 * jp 是画面右缘的竖排题签，en 是它下面那行小字。
 */
const SCENES = {
  shrine: { img: 'shrine', jp: '博麗神社', en: 'HAKUREI SHRINE', mote: 'petal' },
  mountain: { img: 'mountain', jp: '妖怪の山', en: 'YOUKAI MOUNTAIN', mote: 'mote' },
  forest: { img: 'forest', jp: '魔法の森', en: 'FOREST OF MAGIC', mote: 'mote' },
  mansion: { img: 'mansion', jp: '紅魔館', en: 'SCARLET MANSION', mote: 'ember' },
  moon: { img: 'moon', jp: '迷いの竹林', en: 'BAMBOO OF THE LOST', mote: 'mote' },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input();
    this.hud = new Hud();
    this.dialogue = new Dialogue();
    this.ending = new Ending();
    this.audio = new AudioEngine();
    // 场景底图在空闲时预热，避免第一次进设置页 / 难度页时闪一下黑底
    this._warmScenes();

    this.input.pointerHandler = () => {
      this.audio.unlock?.();
      this._applyAudio();
    };

    this.state = 'menu';
    this.stage = null;
    this.char = 'reimu';
    this.lives = 3;
    this.difficulty = 'N';
    this.levelIndex = 0;
    this.inExtra = false;
    // 开局给一点 POWER（32 = 火力 2 级），否则第一关 Boss 只能拿 1 级火力磨
    this.carryPower = 32;
    this.unlockedExtra = false;
    this.t = 0;
    this.frameCap = 0;
    this.musicOn = true;
    this.screenShake = true;
    this._pendingTimeout = 0;
    this.menuIndex = 0;
    this.menuButtons = [];

    /* ---------- 设置项（可持久化） ---------- */
    this._settingsOrigin = 'title'; // 设置页来源：'title' 标题 / 'pause' 暂停
    this._settingsIndex = 0;
    this._keybindIndex = 0;
    this._captureAction = null;     // 正在等待新按键的动作（改键中）
    this._settingsMuted = false;
    this._settingsMusicVolume = 0.8;
    this._settingsSfxVolume = 1;
    this._settingsSfxOn = true;
    this._loadSettings();
    this._loadProgress();
    this._applyAudio();

    /* ---------- 标题画面素材：插画背景 + 两套主角立绘 ---------- */
    // 这三张是首屏唯一必需的图：给最高优先级，其余预加载会自动让路（见 engine/lazy_preload.js）
    this._titleBgImg = new Image();
    this._titleBgImg.decoding = 'async';
    setPriority(this._titleBgImg, 'high');
    this._titleBgImg.src = new URL('./art/gen/title_bg.jpg', import.meta.url).href;

    this._titleCharImgs = {};
    for (const key of ['reimu', 'marisa']) {
      const img = new Image();
      img.decoding = 'async';
      setPriority(img, 'high');
      img.src = new URL(`./art/gen/${key}_title.png`, import.meta.url).href;
      this._titleCharImgs[key] = img;
    }
    if (typeof window !== 'undefined') {
      window.__titleArt = [this._titleBgImg, ...Object.values(this._titleCharImgs)];
    }

    window.addEventListener('keydown', (e) => this._onMenuKey(e));

    this.overlay = document.getElementById('overlay');
    this.titleEl = document.getElementById('title');
    this.subtitleEl = document.getElementById('subtitle');
    this.buttonsEl = document.getElementById('buttons');
    this.hintEl = document.getElementById('hint');
    this.uiEl = document.getElementById('ui');
    this.hudEl = document.getElementById('hud');

    // HUD 右上角设置键：打开暂停菜单（继续 / 设置 / 退出）
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      if (this.state === 'play' && this.stage) {
        this.audio.play?.('select');
        this._pause();
      }
    });

    // 鼠标点击解锁音频
    window.addEventListener('pointerdown', () => {
      this.audio.unlock?.();
      this._applyAudio();
    }, { once: true });

    this.loop = new Loop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
      { frameCap: this.frameCap }
    );
    this.loop.start();

    this.showTitle();
  }

  /* ============================================================
     菜单
     ============================================================ */

  /**
   * 统一构建菜单面板。
   * opts: title / wide / screen（屏幕式卡片版面）/ en（标题上方的小字英文）/
   *       grid / select / page / noDirect / onSelect（选中行变化时回调，用于联动详情）
   * 按钮 spec 额外支持：
   *   html       自定义 innerHTML（给了就不拼 label/value/en/key）
   *   group      连续的同一 group 按钮会包进一张 .set-group 卡片里
   *   groupTitle 卡片标题
   *   tone/glow  卡片强调色（#hex / "r,g,b"），供难度卡使用
   */
  _setPanel(title, subtitle, buttons, hint, opts = {}) {
    if (this.overlay) {
      this.overlay.classList.remove('hidden');
      this.overlay.classList.toggle('title-mode', !!opts.title);
      this.overlay.classList.toggle('wide-mode', !!opts.wide);
      this.overlay.classList.toggle('screen-mode', !!opts.screen);
    }
    // 场景底图只挂在屏幕式选择页上；标题页交给 canvas 插画，暂停面板保留游戏画面
    this._applyScene(opts.screen && !opts.title ? opts.scene : '');
    if (this.titleEl) {
      this.titleEl.textContent = title;
      if (opts.en) this.titleEl.dataset.en = opts.en;
      else delete this.titleEl.dataset.en;
    }
    if (this.subtitleEl) this.subtitleEl.textContent = subtitle || '';
    if (this.hintEl) {
      // 没有底部操作提示就别占一行，省得面板里留一截空白
      this.hintEl.textContent = hint || '';
      this.hintEl.hidden = !hint;
    }
    if (!this.buttonsEl) return;
    this.buttonsEl.className = 'buttons' + (opts.grid ? ' ' + opts.grid : '');
    this._noDirect = !!opts.noDirect;
    this._page = opts.page || '';
    this._onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;
    this.buttonsEl.innerHTML = '';

    let groupEl = null;
    let groupName = null;
    buttons.forEach((b, i) => {
      // 同 group 的连续按钮进同一张卡片，其余直接挂在 .buttons 下
      let parent = this.buttonsEl;
      if (b.group) {
        if (!groupEl || groupName !== b.group) {
          groupEl = document.createElement('section');
          groupEl.className = 'set-group';
          groupEl.dataset.g = b.group;
          if (b.glyph) groupEl.dataset.glyph = b.glyph;
          if (b.groupTitle) {
            const h = document.createElement('h4');
            h.className = 'set-group-title';
            h.textContent = b.groupTitle;
            groupEl.appendChild(h);
          }
          const rows = document.createElement('div');
          rows.className = 'set-rows';
          groupEl.appendChild(rows);
          groupEl._rows = rows;
          this.buttonsEl.appendChild(groupEl);
          groupName = b.group;
        }
        parent = groupEl._rows;
      } else {
        groupEl = null;
        groupName = null;
      }

      const el = document.createElement('button');
      el.className = 'btn' + (b.cls ? ' ' + b.cls : '');
      el._spec = b;
      if (b.disabled) {
        el.disabled = true;
        el.setAttribute('aria-disabled', 'true');
      }
      if (b.back) el.dataset.back = '1';
      if (b.tone) el.style.setProperty('--dc', b.tone);
      if (b.glow) el.style.setProperty('--glow', b.glow);
      el.innerHTML = b.html !== undefined
        ? b.html
        : `<span class="label">${b.label}</span>` +
          (b.value !== undefined ? `<span class="val">${b.value}</span>` : '') +
          (b.en ? `<span class="en">${b.en}</span>` : '') +
          (b.key ? `<span class="k">${b.key}</span>` : '');
      el.addEventListener('click', () => {
        this.audio.play?.('select');
        b.onPick?.(i);
        el.blur();
      });
      el.addEventListener('pointerenter', () => {
        if (!el.classList.contains('info') && !el.disabled && !this._captureAction) this._selectMenu(i);
      });
      parent.appendChild(el);
    });

    this.menuButtons = Array.from(this.buttonsEl.querySelectorAll('.btn'));
    this._selectMenu(Number.isInteger(opts.select) ? opts.select : 0);
  }

  /** 空闲时把五张场景底图解码进缓存（不阻塞首屏，失败也不影响运行） */
  _warmScenes() {
    const go = () => {
      for (const s of Object.values(SCENES)) {
        try {
          const im = new Image();
          im.decoding = 'async';
          setPriority(im, 'low');
          im.src = new URL(`./art/gen/bg/${s.img}.jpg`, import.meta.url).href;
        } catch (e) {
          // 预热失败无所谓，_applyScene 里还会再请求一次
        }
      }
    };
    preloadWhenIdle(go);
  }

  /**
   * 场景底图：给屏幕式选择页铺一层插画背景 + 调色 / 暗角 / 颗粒 / 前景粒子，
   * 右缘挂竖排题签、四角挂细框，让子页不再是一块黑紫卡片压在模糊底图上。
   * 只有 id 变化时才重建 DOM，切换页面不会反复解码图片。
   */
  _applyScene(id) {
    const ov = this.overlay;
    if (!ov) return;
    const scene = id ? SCENES[id] : null;
    if (!scene) {
      ov.dataset.scene = '';
      this._ovBg?.remove();
      this._ovBg = null;
      this._sceneId = '';
      return;
    }
    ov.dataset.scene = id;
    if (this._sceneId === id && this._ovBg) return;
    this._sceneId = id;
    if (!this._ovBg) {
      const bg = document.createElement('div');
      bg.className = 'ov-bg';
      ov.insertBefore(bg, ov.firstChild);
      this._ovBg = bg;
    }
    // 前景粒子：位置 / 时长 / 漂移用内联变量，CSS 只负责一种运动曲线
    const motes = Array.from({ length: 14 }, (_, i) => {
      const x = (i * 37 + 9) % 96;
      const dur = 15 + (i % 6) * 2.5;
      const delay = -(i * 1.9);
      const sz = 3 + (i % 4) * 1.6;
      const drift = (i % 2 ? 1 : -1) * (26 + (i % 5) * 16);
      return `<i style="--x:${x}%;--dur:${dur}s;--delay:${delay}s;--sz:${sz}px;--drift:${drift}px"></i>`;
    }).join('');
    this._ovBg.dataset.mote = scene.mote;
    // 底图路径必须相对 main.js 解析（index.html 在上一级，故用 import.meta.url）
    const sceneUrl = new URL(`./art/gen/bg/${scene.img}.jpg`, import.meta.url).href;
    this._ovBg.innerHTML =
      `<div class="ov-bg-img" style="background-image:url('${sceneUrl}')"></div>` +
      '<div class="ov-bg-grade"></div>' +
      '<div class="ov-bg-vignette"></div>' +
      '<div class="ov-bg-grain"></div>' +
      `<div class="ov-bg-motes">${motes}</div>` +
      `<div class="ov-bg-caption"><span>${scene.jp}</span><em>${scene.en}</em></div>` +
      '<span class="ov-corner tl"></span><span class="ov-corner tr"></span>' +
      '<span class="ov-corner bl"></span><span class="ov-corner br"></span>';
  }

  /** 菜单选中态（键盘 / 鼠标共用），自动跳过 .info 纯文本行和 disabled 项 */
  _selectMenu(index, dir = 1) {
    const list = this.menuButtons || [];
    const n = list.length;
    if (!n) return;
    const dead = (el) => el.classList.contains('info') || el.disabled;
    let k = ((index % n) + n) % n;
    for (let guard = 0; guard < n && dead(list[k]); guard++) {
      k = (k + dir + n) % n;
    }
    if (dead(list[k])) return;
    this.menuIndex = k;
    list.forEach((el, i) => el.classList.toggle('sel', i === k));
    this._onSelect?.(list[k], k);
  }

  _menuStep(dir) {
    this._selectMenu(this.menuIndex + dir, dir);
  }

  /**
   * 菜单键盘：
   *  - 按钮上标注的快捷键直接触发（B / M / F / K / 1 / 2 …）
   *  - ↑↓ 选择（W/S 同样可用）、Enter / 空格 确认
   *  - ←→ 调整设置行（音量、帧率）
   *  - Esc 返回上一级
   *  - 改键捕获态下，所有按键交给 _handleCapture
   */
  _onMenuKey(e) {
    if (this._captureAction) {
      this._handleCapture(e);
      return;
    }
    if (this.state !== 'menu' && this.state !== 'paused') return;
    if (!this.overlay || this.overlay.classList.contains('hidden')) return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

    const action = this.input.actionOf(e.code);

    // 0) 按键设置页：Del / 退格 一键恢复默认
    if ((e.code === 'Delete' || e.code === 'Backspace') && this._page === 'keybinds') {
      e.preventDefault();
      this.input.resetBinds();
      this.audio.play?.('select');
      this.showKeybinds(this._keybindIndex, '已恢复默认键位');
      this.input.endFrame();
      return;
    }

    // 1) 按钮上标注的快捷键直选（优先级高于移动，避免 S / M 等键被动作抢占）
    if (!this._noDirect) {
      const hot = this.menuButtons.find(
        (b) => !b.classList.contains('info') && !b.disabled && b._spec?.hotkey === e.code
      );
      if (hot) {
        e.preventDefault();
        hot.click();
        this.input.endFrame();
        return;
      }
    }

    // 2) 上下选择
    if (action === 'up' || action === 'down') {
      e.preventDefault();
      this._menuStep(action === 'up' ? -1 : 1);
      return;
    }

    // 3) 左右调整当前行的数值（音量 / 帧率）；没有可调项的页面里左右也当作移动
    if (action === 'left' || action === 'right') {
      const adjust = this.menuButtons[this.menuIndex]?._spec?.adjust;
      e.preventDefault();
      if (adjust) adjust(action === 'left' ? -1 : 1);
      else this._menuStep(action === 'left' ? -1 : 1);
      return;
    }

    // 4) 确认
    if (action === 'confirm' || action === 'jump') {
      const el = this.menuButtons[this.menuIndex];
      if (el && !el.classList.contains('info') && !el.disabled) {
        e.preventDefault();
        el.click();
        this.input.endFrame();
      }
      return;
    }

    // 5) Esc：返回上一级；没有返回项时退化为「标注 Esc 的动作」（如暂停菜单的继续）
    if (action === 'pause') {
      const back =
        this.menuButtons.find((b) => b._spec?.back) ||
        this.menuButtons.find((b) => b._spec?.key === 'ESC' && !b.classList.contains('info'));
      if (back) {
        e.preventDefault();
        back.click();
        this.input.endFrame();
      }
    }
  }

  /** 改键捕获：下一个按下的键绑定给当前动作 */
  _handleCapture(e) {
    e.preventDefault();
    if (e.repeat) return;
    const action = this._captureAction;

    if (e.code === 'Escape') {
      this._captureAction = null;
      this.audio.play?.('menu');
      this.showKeybinds(this._keybindIndex, '已取消改键');
      return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      this.input.resetBinds();
      this._captureAction = null;
      this.audio.play?.('select');
      this.showKeybinds(this._keybindIndex, '已恢复默认键位');
      return;
    }
    if (!e.code) return;

    const changed = this.input.setBind(action, e.code);
    this._captureAction = null;
    this.audio.play?.(changed ? 'select' : 'menu');
    this.showKeybinds(this._keybindIndex);
    this.input.endFrame();
  }

  _hidePanel() {
    this.overlay?.classList.add('hidden');
  }

  showTitle() {
    // 先掐断上一局的残留：隐藏中的对话、关卡结算的延迟回调，
    // 否则回到标题后按 Enter 会被旧剧本吃掉，甚至把游戏重新拉进关卡。
    this._pendingTimeout = 0;
    this.dialogue?.stop?.();
    this.ending?.stop?.();
    this.inExtra = false;
    this.state = 'menu';
    this.stage = null;
    this._captureAction = null;
    this.hudEl?.classList.add('hidden');
    this.hud.hideBossBar();
    this.hud.clearBanner();
    this.hud.reset();
    this.audio.setMusic?.(this.musicOn !== false);

    const buttons = [
      { label: '开始游戏', en: 'START', key: 'ENTER', cls: 'primary', onPick: () => this.showDifficultySelect() },
      this.unlockedExtra
        ? { label: '禁忌的祭典', en: 'EXTRA', key: 'E', hotkey: 'KeyE', cls: 'extra', onPick: () => this.startExtra() }
        : { label: '禁忌的祭典', en: 'EXTRA', cls: 'extra locked', disabled: true },
    ];
    buttons.push({ label: '操作说明', en: 'MANUAL', key: '?', hotkey: 'Slash', onPick: () => this.showHelp() });
    buttons.push({ label: '设置', en: 'SETTINGS', key: 'S', hotkey: 'KeyS', onPick: () => this._showSettings(0, 'title') });
    buttons.push({ label: '退出游戏', en: 'QUIT', key: 'Q', hotkey: 'KeyQ', cls: 'danger', onPick: () => this.showQuit() });

    this._setPanel(
      '東方新紀行',
      '～ Chronicle of Gensokyo ～',
      buttons,
      '',
      { title: true }
    );
  }

  showCharSelect() {
    this.state = 'menu';
    const art = (file) => new URL(`./art/gen/${file}`, import.meta.url).href;
    const cards = [
      {
        key: 'reimu', name: '博丽灵梦', en: 'HAKUREI REIMU',
        note: '符卡「梦想封印」', digit: '1',
        tone: '#ff92a8', glow: '255, 120, 145', img: art('reimu_title.png'),
      },
      {
        key: 'marisa', name: '雾雨魔理沙', en: 'KIRISAME MARISA',
        note: '火力稍强 · 符卡「魔炮」', digit: '2',
        tone: '#ffd45e', glow: '255, 205, 110', img: art('marisa_title.png'),
      },
    ];

    const rows = cards.map((c) => ({
      cls: 'cc-card',
      tone: c.tone,
      glow: c.glow,
      hotkey: `Digit${c.digit}`,
      html:
        '<span class="cc-portrait" style="background-image:url(\'' + c.img + '\')"></span>' +
        '<span class="cc-key">' + c.digit + '</span>' +
        '<span class="cc-body">' +
          '<span class="cc-en">' + c.en + '</span>' +
          '<span class="cc-name">' + c.name + '</span>' +
          '<span class="cc-note">' + c.note + '</span>' +
        '</span>',
      onPick: () => { this.char = c.key; this.startGame(); },
    }));

    rows.push({
      label: '返回', cls: 'back-ghost', key: 'ESC', back: true,
      onPick: () => this.showDifficultySelect(),
    });

    const diff = getDifficulty(this.difficulty);
    this._setPanel('选择主角', `当前难度：${diff.cn} · ${diff.stageCount} 面`, rows,
      '← → 选择　ENTER 确认　ESC 返回难度',
      { screen: true, en: 'SELECT HEROINE', grid: 'cc-grid', scene: 'shrine', select: this.char === 'marisa' ? 1 : 0 }
    );
  }

  /** 开始游戏后的难度选择：E / N / H / L（卡牌式） */
  showDifficultySelect() {
    this.state = 'menu';
    const rows = DIFFICULTY_KEYS.map((key) => {
      const d = DIFFICULTIES[key];
      const art = DIFF_CARDS[key] || DIFF_CARDS.N;
      const current = key === this.difficulty;
      return {
        cls: 'diff-card' + (current ? ' is-current' : ''),
        tone: art.tone,
        glow: art.glow,
        hotkey: `Key${key}`,
        diffKey: key,
        html:
          '<span class="dc-now">当前难度</span>' +
          '<span class="dc-key">' + key + '</span>' +
          '<span class="dc-glyph">' + key + '</span>' +
          '<span class="dc-cn">' + d.cn + '</span>' +
          '<span class="dc-en">' + d.label + '</span>' +
          '<span class="dc-stars">' + art.stars + '</span>' +
          '<span class="dc-meta">' + d.stageCount + ' 面<br>' +
            (d.unlockExtra ? '通关解锁 Extra' : '不解锁 Extra') + '</span>',
        onPick: () => {
          this.difficulty = key;
          this._saveSettings();
          this.showCharSelect();
        },
      };
    });

    // 底部详情条：跟随当前高亮的难度联动（不可点，不参与键盘选择）
    rows.push({
      cls: 'info diff-detail',
      html: this._difficultyDetailHTML(this.difficulty),
    });
    rows.push({
      label: '返回标题',
      cls: 'back-ghost',
      key: 'ESC',
      back: true,
      onPick: () => this.showTitle(),
    });

    this._setPanel(
      '选择难度',
      `当前记录：${getDifficulty(this.difficulty).cn}　·　按 E / N / H / L 可直接选择`,
      rows,
      '↑ ↓ ← → 选择　ENTER 确认　ESC 返回标题',
      {
        screen: true,
        en: 'SELECT DIFFICULTY',
        grid: 'diff-grid',
        scene: 'mountain',
        select: Math.max(0, DIFFICULTY_KEYS.indexOf(this.difficulty)),
        onSelect: (el) => {
          const k = el?._spec?.diffKey;
          if (k) this._updateDiffDetail(k);
        },
      }
    );
  }

  /** 难度详情条内容（弹幕强度四格 + 一句话说明） */
  _difficultyDetailHTML(key) {
    const d = getDifficulty(key);
    const art = DIFF_CARDS[d.key] || DIFF_CARDS.N;
    const names = ['弹幕密度', '弹幕速度', '敌弹频率', '符卡强度'];
    const meters = art.meters.map((pct, i) => {
      const lit = Math.max(1, Math.min(5, Math.round(pct * 4) + 1));
      let ticks = '';
      for (let t = 0; t < 5; t++) ticks += `<i class="${t < lit ? 'on' : ''}"></i>`;
      return `<span class="dd-m"><span class="dd-k">${names[i]}</span>` +
        `<span class="dd-bars">${ticks}</span></span>`;
    }).join('');
    return `<span class="dd-tag" style="--dc:${art.tone}">${d.label}</span>` +
      `<span class="dd-cn">${d.cn}</span>` +
      meters +
      `<span class="dd-blurb">${d.blurb}</span>`;
  }

  /** 高亮难度变化时刷新详情条 */
  _updateDiffDetail(key) {
    const el = this.buttonsEl?.querySelector('.diff-detail');
    if (el && key) el.innerHTML = this._difficultyDetailHTML(key);
  }

  showHelp() {
    this.state = 'menu';
    const K = (a) => this.input.labelFor(a);
    const cap = (a) => `<span class="keycap">${K(a)}</span>`;
    const row = (group, label, ctl) => ({
      cls: 'info help-row',
      group,
      html: `<span class="set-label">${label}</span><span class="set-ctl">${ctl}</span>`,
    });

    const rows = [
      { ...row('help-move', '左右移动', cap('left') + cap('right')), groupTitle: '移动', glyph: '動' },
      row('help-move', '上下移动 / 选择', cap('up') + cap('down')),
      row('help-move', '跳跃', cap('jump') + '<span class="help-tip">二段跳</span>'),
      row('help-move', '加速移动', cap('fast') + '<span class="help-tip">按住</span>'),
      { ...row('help-act', '射击', cap('shoot')), groupTitle: '战斗', glyph: '戰' },
      row('help-act', '向上射击', cap('up') + '<span class="help-tip">按住打空中</span>'),
      row('help-act', '向下射击', cap('down') + '<span class="help-tip">按住打脚下</span>'),
      row('help-act', '冲刺', cap('dash') + '<span class="help-tip">无敌</span>'),
      row('help-act', '符卡', cap('cast') + '<span class="help-tip">耗 50 · 火力等级下降</span>'),
      { ...row('help-sys', '暂停菜单', cap('pause')), groupTitle: '系统', glyph: '系' },
      row('help-sys', '界面', '<span class="help-tip">↑↓ 选择 · ENTER 确认</span>'),
      row('help-sys', '静音', cap('mute')),
      row('help-sys', '退出游戏', cap('quit')),
      { label: '返回', cls: 'set-foot-btn back-ghost', key: 'ESC', back: true, group: 'help-foot', onPick: () => this.showTitle() },
    ];

    this._setPanel('操作说明', '键位可在「设置 → 按键设置」中修改',
      rows,
      '设置页内：S 返回　K 按键设置　R 重开本关　F 帧率',
      { screen: true, en: 'HOW TO PLAY', grid: 'help-grid', scene: 'forest', select: rows.length - 1 }
    );
  }

  /** 帧率上限档位：无上限 / 60 / 120 / 30 */
  static FRAME_CAPS = [0, 60, 120, 30];

  cycleFrameCap(fromSettings = false, index = this.menuIndex) {
    const caps = Game.FRAME_CAPS;
    const at = Math.max(0, caps.indexOf(this.frameCap));
    this.frameCap = caps[(at + 1) % caps.length];
    this.loop.setFrameCap(this.frameCap);
    this._saveSettings();
    if (fromSettings) {
      this._showSettings(index, this._settingsOrigin);
      return;
    }
    this.showTitle();
  }

  /** ←→ 调帧率（dir = ±1） */
  _adjustFrameCap(dir) {
    const caps = Game.FRAME_CAPS;
    const at = Math.max(0, caps.indexOf(this.frameCap));
    const next = (at + (dir > 0 ? 1 : caps.length - 1)) % caps.length;
    this.frameCap = caps[next];
    this.loop.setFrameCap(this.frameCap);
    this._saveSettings();
  }

  /* ============================================================
     流程控制
     ============================================================ */

  /** 当前难度下的主线关卡（E 只有前 5 面） */
  _mainStages() {
    return MAIN_STAGES().slice(0, getDifficulty(this.difficulty).stageCount);
  }

  startGame() {
    this._hidePanel();
    this.inExtra = false;
    this.carryPower = 32;
    this.levelIndex = 0;
    this.hudEl?.classList.remove('hidden');
    this.hud.setMaxLives(this.lives, this.char);
    this.audio.unlock?.();
    this.audio.setMusic?.(this.musicOn !== false);

    const opening = STORY.opening;
    this._playDialogue(opening, () => this.startStage(0));
  }

  startExtra() {
    if (!this.unlockedExtra) return;
    this._hidePanel();
    this.inExtra = true;
    // Extra 是真·终盘关：满火力开局
    this.carryPower = 128;
    this.levelIndex = 0;
    this.hudEl?.classList.remove('hidden');
    this.hud.setMaxLives(this.lives, this.char);
    this._playDialogue(STORY.extra.intro, () => this._startExtraStage());
  }

  _startExtraStage() {
    const def = EXTRA_STAGE();
    if (!def) { this.showTitle(); return; }
    this._createStage(def, 0, true);
  }

  startStage(index, opts) {
    const list = this._mainStages();
    if (!list.length) { this.showTitle(); return; }
    const def = list[index];
    if (!def) { this._onAllCleared(); return; }
    this._createStage(def, index, false, opts);
  }

  _createStage(def, index, isExtra, opts = {}) {
    this._hidePanel();
    this.state = 'play';
    this.levelIndex = index;
    seedReset?.(); // ?seed= 时把关卡随机序列拨回起点，保证弹幕可复现
    this.stage = new Stage({
      def,
      index,
      char: this.char,
      lives: this.lives,
      // Extra 的强度在 Stage 内固定为 H；主线使用本局选择的难度
      difficulty: isExtra ? 'H' : this.difficulty,
      power: isExtra ? 128 : this.carryPower,
      onEvent: (type, data) => this._onStageEvent(type, data),
    });
    this.stage.onEvent = (type, data) => this._onStageEvent(type, data);
    if (this.stage.camera) this.stage.camera.shakeEnabled = this.screenShake;
    // STG 关的玩家是另一个类（StgPlayer），这里统一补一次火力继承
    if (this.stage.player && !this.stage.player.power) {
      this.stage.player.power = isExtra ? 128 : this.carryPower;
    }

    // 重挑战回 Boss：把玩家放回 Boss 前的检查点，Boss 直接登场，
    // 不用把整段跑图再走一遍（战前对白也跳过，因为已经看过）。
    let resumedBoss = false;
    if (!isExtra && opts.resumeBoss) {
      const p = this.stage.player;
      if (p && typeof p.reset === 'function') {
        const cp = opts.checkpoint || p.checkpoint;
        if (cp && Number.isFinite(cp.x) && Number.isFinite(cp.y)) p.reset(cp.x, cp.y);
        p.setCheckpoint?.(p.x, p.y);
        p.vx = 0; p.vy = 0;
        p.invuln = Math.max(p.invuln || 0, 1.5);  // 出场给一小段无敌，别一复活就挨弹
        this.stage.beginBoss();
        this.stage.camera?.snapTo?.(p.x + p.w / 2);
        resumedBoss = true;
      }
    }

    this.hud.reset();
    this.hud.setMaxLives(this.lives, this.char);
    this.hud.setStageName(isExtra ? 'EXTRA' : `STAGE ${index + 1}`, def.title || '');
    this.hud.banner(isExtra ? 'EXTRA STAGE' : `STAGE ${index + 1}`, def.title || '', 2.6);
    this.audio.play?.('menu');

    // 关卡开场对话（Extra 的开场已经在外面播过了；重挑战本关时也跳过，直接继续）
    const script = (isExtra || opts.skipIntro) ? [] : (STORY.stages[STAGE_KEY(index)]?.intro || []);
    const showTip = () => { if (!resumedBoss) this.hud.tip(def.hint || '', 5.5); };
    if (script.length) {
      this.state = 'dialogue';
      this._playDialogue(script, () => { this.state = 'play'; showTip(); });
    } else {
      this.state = 'play';
      showTip();
    }
  }

  _onStageEvent(type, data) {
    switch (type) {
      case 'hurt':
        this.audio.play?.('hurt');
        break;
      case 'death':
        this.audio.play?.('die');
        break;
      case 'checkpoint':
        this.audio.play?.('checkpoint');
        this.hud.banner('CHECKPOINT', '', 1.2);
        break;
      case 'coin':
        this.audio.play?.('coin');
        break;
      case 'cast':
        this.audio.play?.('win');
        break;
      case 'bossTrigger':
        this._onBossTrigger();
        break;
      case 'bossStart':
        seedReset?.(); // 从开战这一帧把随机序列拨回起点，弹幕才有复现意义
        this.hud.banner(data.name || '', data.title || '', 2.0);
        this.audio.play?.('menu');
        break;
      case 'bossPhase':
        this.hud.banner('', data.name || '', 1.4);
        break;
      case 'clear':
        this._onStageClear();
        break;
      case 'gameover':
        this._onGameOver();
        break;
      case 'respawn':
        break;
      default:
        break;
    }
  }

  _onBossTrigger() {
    if (!this.stage) return;
    this.state = 'dialogue';
    const script = this.inExtra
      ? (STORY.extra.postBoss ? [] : []) // Extra 的战前对话已在开场
      : (STORY.stages[STAGE_KEY(this.levelIndex)]?.preBoss || []);
    const start = () => {
      this.state = 'play';
      this.stage.beginBoss();
    };
    if (script.length) this._playDialogue(script, start);
    else start();
  }

  _onStageClear() {
    this.state = 'clear';
    // 火力继承：打完这关的 POWER 带进下一关
    if (this.stage?.player) {
      this.carryPower = Math.min(128, Math.round(this.stage.player.power || 0));
    }
    this.hud.banner('STAGE CLEAR', '', 1.6);
    this.audio.play?.('win');

    const isExtra = this.inExtra;
    const post = isExtra
      ? (STORY.extra.postBoss || [])
      : (STORY.stages[STAGE_KEY(this.levelIndex)]?.postBoss || []);

    // 用逻辑计时等横幅播完，再进对话
    this._after(1.8, () => {
      if (post.length) {
        this._playDialogue(post, () => this._advanceLevel());
      } else {
        this._advanceLevel();
      }
    });
  }

  _advanceLevel() {
    if (this.inExtra) {
      this._onAllCleared();
      return;
    }
    const next = this.levelIndex + 1;
    if (next >= this._mainStages().length) {
      this._onAllCleared();
      return;
    }
    this.startStage(next);
  }

  _onAllCleared() {
    const diff = getDifficulty(this.inExtra ? 'H' : this.difficulty);

    // N 及以上通关解锁 Extra；E 不解锁，也不会把已解锁的 Extra 锁回去
    if (!this.inExtra && diff.unlockExtra && !this.unlockedExtra) {
      this.unlockedExtra = true;
      this._saveProgress();
    }

    // E 只有前 5 面：进入「未完待续」的 EASY 结局；
    // N/H/L 打完第 6 面：进入真结局；
    // EXTRA 胜利：进入 W1 / W2 结局（EXTRA 失败由 _onGameOver 处理，不进结局）。
    this._playEnding(this.inExtra ? 'extra' : (diff.unlockExtra ? 'main' : 'easy'));
  }

  /**
   * 结局演出入口。
   * @param {'easy'|'main'|'extra'} mode E 流程 / N·H·L 流程 / EXTRA 胜利
   */
  _playEnding(mode) {
    const spec = endingFor(this.char, mode);
    if (!spec) { this.showTitle(); return; }
    this.state = 'ending';
    this._pendingTimeout = 0;
    this._hidePanel();
    this.dialogue?.stop?.();
    this.hudEl?.classList.add('hidden');
    this.hud.hideBossBar();
    this.hud.clearBanner();
    this.audio.setMusic?.(false);
    this.audio.play?.('win');
    this.ending.play(spec, {
      onFinish: () => this.showTitle(),
    });
  }

  _onGameOver() {
    this.state = 'gameover';
    this.hudEl?.classList.add('hidden');
    this.audio.play?.('die');
    // 已经打到 Boss 的话，重挑战回 Boss 场地而不是从头跑一遍
    const atBoss = this._canResumeBoss();
    this._setPanel('游戏结束', `残机用尽 · ${this.inExtra ? 'EXTRA STAGE' : 'STAGE ' + (this.levelIndex + 1)}`, [
      { label: atBoss ? '再战 Boss' : '重新挑战本关', key: 'ENTER', cls: 'primary', onPick: () => this._retryStage() },
      { label: '返回标题', key: 'ESC', onPick: () => this.showTitle() },
    ], this.inExtra ? 'EXTRA 关失败不会触发结局\n整理好状态，再挑战一次' : (atBoss ? '从 Boss 场地重新开始\n前面的进度不会丢失' : ''));
  }

  /** 当前这关是否已经打到 Boss（重挑战可以直接回 Boss 场地） */
  _canResumeBoss() {
    const s = this.stage;
    return !!(s && s.bossStarted && s.mode === 'platform' && s.player && !this.inExtra);
  }

  _retryStage() {
    this._hidePanel();
    this.lives = Math.max(1, this.lives);
    if (this.inExtra) this._startExtraStage();
    // 重挑战是「续命重来」，不是重开一局：跳过已看过的开场对白，直接回到操作
    else if (this._canResumeBoss()) {
      const s = this.stage;
      // 记下 Boss 前的检查点，重建关卡后把玩家放回去再开 Boss
      this.startStage(this.levelIndex, {
        skipIntro: true,
        resumeBoss: true,
        checkpoint: s.player.checkpoint || s._safeSpot || null,
      });
    } else this.startStage(this.levelIndex, { skipIntro: true });
  }

  /** 用主循环时钟安排一次性回调，避免 setTimeout 与暂停状态脱节 */
  _after(delay, fn) {
    this._pendingTimeout = { t: delay, fn };
  }

  /* ============================================================
     对话
     ============================================================ */

  _playDialogue(script, onEnd) {
    if (!script || !script.length) { onEnd?.(); return; }
    this._preState = this.state;
    this.state = 'dialogue';
    this.dialogue.setPlayerChar(this.char);
    this.dialogue.play(script, {
      onEnd: () => {
        this.input.endFrame();
        onEnd?.();
      },
    });
  }

  /* ============================================================
     主循环
     ============================================================ */

  update(dt) {
    this.t += dt;

    // 延迟回调
    if (this._pendingTimeout) {
      this._pendingTimeout.t -= dt;
      if (this._pendingTimeout.t <= 0) {
        const fn = this._pendingTimeout.fn;
        this._pendingTimeout = 0;
        fn();
      }
    }

    // 结局演出：优先处理，避免按键漏到菜单 / 关卡
    if (this.state === 'ending') {
      this.ending.update(dt);
      if (this.input.pressed('confirm') || this.input.pressed('jump') || this.input.pressed('shoot')) {
        this.ending.advance();
      }
      if (this.input.pressed('pause')) this.ending.skipToCard();
      this.input.endFrame();
      return;
    }

    // 对话优先
    this.dialogue.update(dt);
    if (this.dialogue.active) {
      if (this.input.pressed('confirm') || this.input.pressed('jump') || this.input.pressed('shoot')) {
        this.dialogue.advance();
      }
      this.input.endFrame();
      return;
    }

    // 暂停：按键全部交给 _onMenuKey 处理（避免恢复后同一帧又被 pause 重新打开）
    if (this.state === 'paused') {
      this.input.endFrame();
      return;
    }

    if (this.state === 'play' && this.stage) {
      if (this.input.pressed('pause')) { this._pause(); this.input.endFrame(); return; }
      if (this.input.pressed('restart')) { this._retryStage(); this.input.endFrame(); return; }
      if (this.input.pressed('mute')) {
        this.audio.setMuted?.(!this.audio.muted);
        this._saveSettings();
      }
      this.stage.update(dt, this.input);
      this.hud.update(this.stage.hudState, dt);
    }

    this.input.endFrame();
  }

  _pause() {
    this._prevState = this.state;
    this._showPause();
  }

  /** 暂停菜单：继续 / 设置 / 退出 */
  _showPause() {
    this.state = 'paused';
    this._captureAction = null;
    const left = this.stage?.player?.lives ?? this.lives;
    const diff = this.inExtra ? 'H' : this.difficulty;
    this._setPanel('暂停', `游戏已暂停 · 难度 ${diff} · 剩余残机 ${left}`, [
      { label: '继续', key: 'ESC', cls: 'primary', onPick: () => this._resume() },
      { label: '设置', key: 'S', hotkey: 'KeyS', onPick: () => this._showSettings(0, 'pause') },
      { label: '退出到标题', key: 'Q', hotkey: 'KeyQ', onPick: () => this.showTitle() },
    ], '↑ ↓ 选择　ENTER 确认　Esc 返回');
  }

  /* ============================================================
     设置
     ============================================================ */

  /** 设置页：声音 / 画面 / 游戏 三张卡片，右侧是真正的控件而不是文字 */
  _showSettings(index = 0, origin = this._settingsOrigin || 'title') {
    this._settingsOrigin = origin === 'pause' ? 'pause' : 'title';
    this.state = 'paused';
    this._captureAction = null;

    // —— 控件 HTML ——
    const sw = (on) => `<span class="sw${on ? ' on' : ''}"><i></i></span>`;
    const sld = (v) => {
      const p = Math.round(v * 100);
      return `<span class="sld"><span class="sld-track"><i style="width:${p}%"></i></span>` +
        `<span class="sld-num">${p}%</span></span>`;
    };
    const pips = `<span class="pips">${[0, 1, 2, 3]
      .map((i) => `<i class="${i < this.lives ? 'on' : ''}"></i>`).join('')}</span>`;
    const seg = `<span class="seg">${Game.FRAME_CAPS.map((cap) => {
      const txt = cap === 0 ? '∞' : String(cap);
      return `<b class="${cap === this.frameCap ? 'on' : ''}">${txt}</b>`;
    }).join('')}</span>`;
    const row = (text, ctl, key) =>
      `<span class="set-label">${text}</span><span class="set-ctl">${ctl}</span>` +
      (key ? `<span class="k">${key}</span>` : '');

    const rows = [
      /* ---- 声音 ---- */
      {
        group: 'sound', groupTitle: '声音', glyph: '音',
        cls: 'set-row', key: 'M', hotkey: 'KeyM',
        html: row('全部静音', sw(!!this.audio.muted), 'M'),
        onPick: (i) => {
          this.audio.setMuted?.(!this.audio.muted);
          this._saveSettings();
          this._showSettings(i, origin);
        },
      },
      {
        group: 'sound',
        cls: 'set-row', key: 'B', hotkey: 'KeyB',
        html: row('背景音乐', sw(this.musicOn !== false), 'B'),
        onPick: (i) => {
          this.musicOn = !(this.musicOn !== false);
          this.audio.setMusic?.(this.musicOn);
          this._saveSettings();
          this._showSettings(i, origin);
        },
      },
      {
        group: 'sound',
        cls: 'set-row', key: '← →',
        html: row('音乐音量', sld(this.audio.musicVolume), '← →'),
        adjust: (d) => this._adjustVolume('music', d, origin),
        onPick: () => this._adjustVolume('music', 1, origin),
      },
      {
        group: 'sound',
        cls: 'set-row', key: 'N', hotkey: 'KeyN',
        html: row('音效', sw(this.audio.sfxEnabled), 'N'),
        onPick: (i) => {
          this.audio.setSfxEnabled?.(!this.audio.sfxEnabled);
          this.audio.play?.('menu');
          this._saveSettings();
          this._showSettings(i, origin);
        },
      },
      {
        group: 'sound',
        cls: 'set-row', key: '← →',
        html: row('音效音量', sld(this.audio.sfxVolume), '← →'),
        adjust: (d) => this._adjustVolume('sfx', d, origin),
        onPick: () => this._adjustVolume('sfx', 1, origin),
      },

      /* ---- 画面 ---- */
      {
        group: 'display', groupTitle: '画面', glyph: '畫',
        cls: 'set-row', key: 'H', hotkey: 'KeyH',
        html: row('屏幕震动', sw(this.screenShake), 'H'),
        onPick: (i) => {
          this.screenShake = !(this.screenShake !== false);
          if (this.stage?.camera) this.stage.camera.shakeEnabled = this.screenShake;
          this._saveSettings();
          this._showSettings(i, origin);
        },
      },
      {
        group: 'display',
        cls: 'set-row', key: 'F', hotkey: 'KeyF',
        html: row('帧率上限', seg, 'F'),
        adjust: (d) => {
          this._adjustFrameCap(d);
          this._showSettings(this.menuIndex, origin);
        },
        onPick: (i) => this.cycleFrameCap(true, i),
      },

      /* ---- 游戏 ---- */
      {
        group: 'game', groupTitle: '游戏', glyph: '戲',
        cls: 'set-row', key: '← →',
        html: row('残机', pips, '← →'),
        adjust: (d) => this._adjustLives(d, origin),
        onPick: () => this._adjustLives(1, origin),
      },
      {
        group: 'game',
        cls: 'set-row set-row-link', key: 'K', hotkey: 'KeyK',
        html: row('按键设置', '<span class="chev">›</span>', 'K'),
        onPick: (i) => {
          this._settingsKeyIndex = i;
          this.showKeybinds(0);
        },
      },
    ];

    /* ---- 底部：重开（仅暂停来源）/ 返回 ---- */
    if (this._settingsOrigin === 'pause') {
      rows.push({
        group: 'foot', cls: 'set-foot-btn', key: 'R', hotkey: 'KeyR',
        html: '<span class="set-label">重新开始本关</span><span class="k">R</span>',
        onPick: () => { this._hidePanel(); this._retryStage(); },
      });
    }
    rows.push({
      group: 'foot', cls: 'set-foot-btn', key: 'ESC', back: true,
      html: `<span class="set-label">${origin === 'pause' ? '返回暂停菜单' : '返回标题'}</span>` +
        '<span class="k">ESC</span>',
      onPick: () => (this._settingsOrigin === 'pause' ? this._showPause() : this.showTitle()),
    });

    this._setPanel('设置', '即时生效，自动保存 · 残机从下一局开始生效', rows,
      '↑ ↓ 选择　← → 调整　ENTER 切换　ESC 返回',
      { screen: true, en: 'OPTIONS', grid: 'set-grid', scene: 'moon', select: index }
    );
  }

  /** 残机 ±1（1–4 条），下一局 / 重开本关时生效 */
  _adjustLives(dir, origin = this._settingsOrigin) {
    this.lives = Math.max(1, Math.min(4, this.lives + (dir > 0 ? 1 : -1)));
    this._saveSettings();
    this.audio.play?.('menu');
    this._showSettings(this.menuIndex, origin);
  }

  /** 音量 ±10%（←→ 或点击），光标留在原行 */
  _adjustVolume(which, dir, origin = this._settingsOrigin) {
    const cur = which === 'music' ? this.audio.musicVolume : this.audio.sfxVolume;
    let v = Math.round((cur + dir * 0.1) * 10) / 10;
    v = Math.max(0, Math.min(1, v));
    if (which === 'music') this.audio.setMusicVolume?.(v);
    else {
      this.audio.setSfxVolume?.(v);
      this.audio.play?.('menu'); // 调音效音量时给个试听
    }
    this._saveSettings();
    this._showSettings(this.menuIndex, origin);
  }

  /** 按键设置页：按 移动 / 战斗 / 系统 分三张卡片，右侧是键帽 */
  showKeybinds(index = 0, note = '') {
    this._keybindIndex = Math.max(0, Math.min(ACTION_DEFS.length - 1, Number(index) || 0));
    this.state = 'paused';
    const cap = this._captureAction;

    const CATEGORIES = [
      { id: 'kb-move', title: '移动', glyph: '動', actions: ['left', 'right', 'up', 'down', 'fast'] },
      { id: 'kb-act', title: '战斗', glyph: '戰', actions: ['jump', 'shoot', 'dash', 'cast'] },
      { id: 'kb-sys', title: '系统', glyph: '系', actions: ['confirm', 'pause', 'restart', 'mute', 'quit'] },
    ];

    const rows = [];
    const rowAt = new Map(); // action -> 在 rows / 按钮列表里的位置
    CATEGORIES.forEach((cat) => {
      cat.actions.forEach((action) => {
        const def = ACTION_DEFS.find((x) => x.action === action);
        if (!def) return;
        const capturing = cap === def.action;
        rowAt.set(action, rows.length);
        rows.push({
          group: cat.id, groupTitle: cat.title, glyph: cat.glyph,
          action: def.action,
          cls: 'set-row kb-row' + (capturing ? ' capturing' : ''),
          html: `<span class="set-label">${def.label}</span>` +
            `<span class="set-ctl">` +
            (capturing
              ? '<span class="kb-wait">按下新键…</span>'
              : `<span class="keycap">${this.input.labelFor(def.action)}</span>`) +
            '</span>',
          onPick: () => {
            this._keybindIndex = ACTION_DEFS.indexOf(def);
            this._captureAction = this._captureAction === def.action ? null : def.action;
            this.audio.play?.('menu');
            this.showKeybinds(this._keybindIndex);
          },
        });
      });
    });

    rows.push({
      group: 'kb-foot', cls: 'set-foot-btn', key: 'Del',
      html: '<span class="set-label">恢复默认键位</span><span class="k">Del</span>',
      onPick: () => {
        this.input.resetBinds();
        this._captureAction = null;
        this.audio.play?.('select');
        this.showKeybinds(this._keybindIndex, '已恢复默认键位');
      },
    });
    rows.push({
      group: 'kb-foot', cls: 'set-foot-btn', key: 'ESC', back: true,
      html: '<span class="set-label">返回</span><span class="k">ESC</span>',
      onPick: () => {
        this._captureAction = null;
        this._showSettings(this._settingsKeyIndex || 0, this._settingsOrigin);
      },
    });

    const wanted = ACTION_DEFS[this._keybindIndex]?.action;
    const select = rowAt.has(wanted) ? rowAt.get(wanted) : 0;

    this._setPanel(
      '按键设置',
      note || (cap ? '按下要绑定的新键…' : '点选一项，再按下新键；重复的键会自动互换'),
      rows,
      cap ? '按任意键绑定　ESC 取消　Del 恢复默认' : '↑ ↓ 选择　ENTER 改键　Del 恢复默认　ESC 返回',
      { screen: true, en: 'KEY CONFIG', grid: 'kb-grid', scene: 'mansion', noDirect: true, page: 'keybinds', select }
    );
  }

  /* ============================================================
     退出
     ============================================================ */

  showQuit() {
    this.state = 'paused';
    this._captureAction = null;
    this._setPanel('退出游戏', '要离开幻想乡吗？', [
      { label: '退出到桌面', en: 'QUIT', key: 'ENTER', cls: 'primary danger', onPick: () => this._quitGame() },
      { label: '返回标题', key: 'ESC', back: true, onPick: () => this.showTitle() },
    ], 'ENTER 确认　ESC 返回', { noDirect: true });
  }

  /** 尝试真正关掉页面；浏览器通常不允许脚本关闭非脚本打开的窗口，这时给一个收尾页 */
  _quitGame() {
    this.audio.play?.('select');
    this._pendingTimeout = 0;
    this.dialogue?.stop?.();
    this._captureAction = null;
    this.stage = null;
    this.state = 'menu';
    this.hudEl?.classList.add('hidden');
    this.audio.setMusic?.(false);
    this.audio.setMuted?.(true);
    this.loop.stop?.();

    let closed = false;
    try {
      window.close();
      closed = !!window.closed;
    } catch (e) {
      closed = false;
    }
    if (!closed) this._showFarewell();
  }

  _showFarewell() {
    this.state = 'menu';
    this._setPanel('已退出游戏', '感谢游玩　東方新紀行', [
      {
        label: '返回标题', key: 'ENTER', cls: 'primary', back: true,
        onPick: () => {
          this.audio.setMuted?.(this._settingsMuted);
          this.loop.start?.();
          this._applyAudio();
          this.showTitle();
        },
      },
    ], '现在可以关闭此页面了', { noDirect: true });
  }

  /* ============================================================
     设置持久化
     ============================================================ */

  _loadSettings() {
    try {
      const raw = window.localStorage.getItem('hks.settings.v1');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return;
      if (Number.isFinite(s.frameCap)) this.frameCap = s.frameCap;
      if (typeof s.musicOn === 'boolean') this.musicOn = s.musicOn;
      if (typeof s.screenShake === 'boolean') this.screenShake = s.screenShake;
      if (Number.isFinite(s.lives)) this.lives = Math.max(1, Math.min(4, Math.round(s.lives)));
      if (typeof s.difficulty === 'string' && DIFFICULTIES[s.difficulty]) this.difficulty = s.difficulty;
      if (typeof s.muted === 'boolean') this._settingsMuted = s.muted;
      if (Number.isFinite(s.musicVolume)) this._settingsMusicVolume = Math.max(0, Math.min(1, s.musicVolume));
      if (Number.isFinite(s.sfxVolume)) this._settingsSfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
      if (typeof s.sfxOn === 'boolean') this._settingsSfxOn = s.sfxOn;
    } catch (e) {
      // 无 localStorage / 数据损坏：用默认值
    }
  }

  _saveSettings() {
    try {
      window.localStorage.setItem('hks.settings.v1', JSON.stringify({
        frameCap: this.frameCap,
        musicOn: this.musicOn !== false,
        screenShake: this.screenShake !== false,
        lives: Math.max(1, Math.min(4, this.lives)),
        difficulty: this.difficulty,
        muted: !!this.audio.muted,
        musicVolume: this.audio.musicVolume,
        sfxVolume: this.audio.sfxVolume,
        sfxOn: this.audio.sfxEnabled,
      }));
    } catch (e) {
      // 忽略写入失败
    }
  }

  /** Extra 解锁进度单独存一份，避免和音频设置互相覆盖 */
  _loadProgress() {
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') this.unlockedExtra = !!p.extraUnlocked;
    } catch (e) {
      // 无 localStorage / 数据损坏：保持未解锁
    }
  }

  _saveProgress() {
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        extraUnlocked: !!this.unlockedExtra,
      }));
    } catch (e) {
      // 忽略写入失败
    }
  }

  /** 把记忆中的设置灌进音频引擎（unlock 前后都可以调用） */
  _applyAudio() {
    this.audio.setMuted?.(this._settingsMuted);
    this.audio.setMusicVolume?.(this._settingsMusicVolume);
    this.audio.setSfxVolume?.(this._settingsSfxVolume);
    this.audio.setSfxEnabled?.(this._settingsSfxOn);
    this.audio.setMusic?.(this.musicOn !== false);
  }

  _resume() {
    this._hidePanel();
    this.state = 'play';
    // 防止同一帧的 Esc/Enter 边沿在恢复后又被游戏逻辑吃一次
    this.input.endFrame();
  }

  render(alpha) {
    const ctx = this.renderer.begin('#05030a');

    if (this.state === 'ending') {
      this.ending.draw(ctx);
      this.renderer.present(this.t);
      return;
    }

    if (this.stage && (this.state === 'play' || this.state === 'paused' || this.state === 'clear' || this.state === 'dialogue' || this.state === 'gameover')) {
      // 只有逻辑真的在推进时才做插值。暂停 / 对话 / 结算 / GameOver 时模拟已经冻结，
      // 但循环的 alpha 仍在 0→1 循环，继续插值会让角色在上一/当前步之间来回抖。
      const a = this.state === 'play' && !this.dialogue.active ? alpha : 1;
      this.stage.draw(ctx, a);
      if (this.state === 'paused') this._drawDim(ctx, 0.45);
      if (this.state === 'dialogue') this._drawDim(ctx, 0.35);
    } else {
      this._drawTitleBg(ctx);
    }

    this.renderer.present(this.t);
  }

  _drawDim(ctx, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  /**
   * 标题背景：夜空 / 月 / 远山 / 神社 / 鸟居 / 樱枝 / 地面雾。
   * 静态部分一次性烘焙到离屏画布，运行时只叠加呼吸辉光、流雾和落樱。
   */
  _buildTitleBg() {
    const c = document.createElement('canvas');
    c.width = VIEW_W; c.height = VIEW_H;
    const g = c.getContext('2d');
    const rnd = (() => {
      let a = 0x9e3779b9;
      return () => {
        a = (Math.imul(a ^ (a >>> 15), 0x85ebca6b) + 0x165667b1) | 0;
        return ((a >>> 8) & 0xffffff) / 0x1000000;
      };
    })();

    /* ---------- 夜空：深蓝到梅紫，地平时分暖 ---------- */
    const sky = g.createLinearGradient(0, 0, 0, 680);
    sky.addColorStop(0, '#04050e');
    sky.addColorStop(0.24, '#090e2b');
    sky.addColorStop(0.44, '#171342');
    sky.addColorStop(0.62, '#311a4c');
    sky.addColorStop(0.78, '#54254e');
    sky.addColorStop(0.90, '#78344a');
    sky.addColorStop(1, '#93414b');
    g.fillStyle = sky;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    /* 银河斜带：一条极淡的紫白尘带 */
    g.save();
    g.translate(240, -60);
    g.rotate(0.34);
    const mw = g.createLinearGradient(0, 0, 0, 230);
    mw.addColorStop(0, 'rgba(120, 140, 220, 0)');
    mw.addColorStop(0.38, 'rgba(150, 160, 240, 0.10)');
    mw.addColorStop(0.58, 'rgba(214, 198, 255, 0.12)');
    mw.addColorStop(0.8, 'rgba(150, 160, 240, 0.07)');
    mw.addColorStop(1, 'rgba(120, 140, 220, 0)');
    g.fillStyle = mw;
    g.fillRect(0, -60, 1900, 360);
    g.restore();

    /* 地平线暖光：神社方向的黄昏余烬 */
    const hz = g.createRadialGradient(760, 596, 30, 760, 596, 760);
    hz.addColorStop(0, 'rgba(255, 146, 96, 0.20)');
    hz.addColorStop(0.4, 'rgba(226, 84, 96, 0.11)');
    hz.addColorStop(1, 'rgba(140, 40, 90, 0)');
    g.fillStyle = hz;
    g.fillRect(0, 300, VIEW_W, 420);

    /* ---------- 星：三级亮度 + 少量十字星 ---------- */
    for (let i = 0; i < 320; i++) {
      const x = rnd() * VIEW_W;
      const y = Math.pow(rnd(), 1.35) * 520;
      const tier = rnd();
      const r = tier > 0.94 ? 1.5 + rnd() * 0.9 : tier > 0.7 ? 0.9 + rnd() * 0.5 : 0.45 + rnd() * 0.3;
      g.globalAlpha = (tier > 0.94 ? 0.75 : tier > 0.7 ? 0.45 : 0.22) + rnd() * 0.18;
      g.fillStyle = rnd() < 0.22 ? '#ffd9e6' : rnd() < 0.5 ? '#dfe8ff' : '#fff6ea';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (tier > 0.965) {
        g.globalAlpha *= 0.5;
        g.strokeStyle = '#fff';
        g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x - r * 3.2, y); g.lineTo(x + r * 3.2, y); g.stroke();
        g.beginPath(); g.moveTo(x, y - r * 3.2); g.lineTo(x, y + r * 3.2); g.stroke();
      }
    }
    g.globalAlpha = 1;

    /* ---------- 月：外晕 / 月体 / 环形山 / 光柱 ---------- */
    const mx = 986, my = 168, mr = 84;
    const haloWide = g.createRadialGradient(mx, my, mr * 0.6, mx, my, 430);
    haloWide.addColorStop(0, 'rgba(214, 224, 255, 0.20)');
    haloWide.addColorStop(0.28, 'rgba(190, 196, 250, 0.09)');
    haloWide.addColorStop(1, 'rgba(150, 160, 240, 0)');
    g.fillStyle = haloWide;
    g.beginPath(); g.arc(mx, my, 430, 0, Math.PI * 2); g.fill();

    const haloWarm = g.createRadialGradient(mx, my, mr * 0.9, mx, my, 190);
    haloWarm.addColorStop(0, 'rgba(255, 240, 214, 0.34)');
    haloWarm.addColorStop(1, 'rgba(255, 226, 200, 0)');
    g.fillStyle = haloWarm;
    g.beginPath(); g.arc(mx, my, 190, 0, Math.PI * 2); g.fill();

    // 光柱：从月亮向下散开，极低透明度
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = -1.9 + i * 0.16;
      g.save();
      g.translate(mx, my);
      g.rotate(a);
      const sh = g.createLinearGradient(0, 0, 0, 620);
      sh.addColorStop(0, 'rgba(226, 232, 255, 0.09)');
      sh.addColorStop(1, 'rgba(180, 190, 255, 0)');
      g.fillStyle = sh;
      g.beginPath();
      g.moveTo(-6, 0); g.lineTo(6, 0); g.lineTo(74, 620); g.lineTo(-86, 620);
      g.closePath(); g.fill();
      g.restore();
    }
    g.restore();

    const body = g.createRadialGradient(mx - mr * 0.34, my - mr * 0.38, 6, mx, my, mr);
    body.addColorStop(0, '#fff8e8');
    body.addColorStop(0.42, '#f4e6c9');
    body.addColorStop(0.74, '#dcc9ab');
    body.addColorStop(1, '#b9a68f');
    g.fillStyle = body;
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
    // 月缘暗化，避免变成纯白圆盘
    const limb = g.createRadialGradient(mx, my, mr * 0.72, mx, my, mr);
    limb.addColorStop(0, 'rgba(86, 74, 92, 0)');
    limb.addColorStop(0.86, 'rgba(86, 74, 92, 0.10)');
    limb.addColorStop(1, 'rgba(70, 58, 82, 0.34)');
    g.fillStyle = limb;
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();

    // 月海与环形山（裁剪在月体内）
    g.save();
    g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.clip();
    // 大块月海
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * (mr - 26);
      g.globalAlpha = 0.10 + rnd() * 0.08;
      g.fillStyle = '#7d7796';
      g.beginPath();
      g.ellipse(mx + Math.cos(a) * d, my + Math.sin(a) * d, 14 + rnd() * 22, 10 + rnd() * 16, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * (mr - 8);
      const cx = mx + Math.cos(a) * d, cy = my + Math.sin(a) * d;
      const cr = 3 + rnd() * 13;
      g.globalAlpha = 0.20 + rnd() * 0.18;
      g.fillStyle = '#9a8672';
      g.beginPath(); g.ellipse(cx, cy, cr, cr * (0.6 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.26 + rnd() * 0.16;
      g.strokeStyle = '#fff6e0';
      g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, cr * 0.86, -2.4, 0.5); g.stroke();
    }
    // 下半侧阴影，制造体积
    const term = g.createLinearGradient(mx, my - mr, mx, my + mr);
    term.addColorStop(0, 'rgba(120, 110, 140, 0)');
    term.addColorStop(0.72, 'rgba(90, 86, 120, 0.14)');
    term.addColorStop(1, 'rgba(70, 66, 104, 0.26)');
    g.globalAlpha = 1;
    g.fillStyle = term;
    g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    g.restore();

    /* ---------- 云：靠近月亮被照亮的薄卷云 ---------- */
    const cloud = (x, y, w, h, alpha, tint) => {
      const cg = g.createLinearGradient(x - w, y, x + w, y);
      cg.addColorStop(0, 'rgba(90, 70, 130, 0)');
      cg.addColorStop(0.42, tint + alpha * 0.55 + ')');
      cg.addColorStop(0.62, tint + alpha + ')');
      cg.addColorStop(1, 'rgba(90, 70, 130, 0)');
      g.fillStyle = cg;
      g.beginPath();
      g.ellipse(x, y, w, h, -0.02, 0, Math.PI * 2);
      g.fill();
    };
    cloud(820, 236, 330, 13, 0.16, 'rgba(236, 226, 255, ');
    cloud(1080, 300, 300, 9, 0.12, 'rgba(255, 226, 236, ');
    cloud(560, 330, 380, 16, 0.10, 'rgba(180, 166, 240, ');
    cloud(940, 404, 420, 12, 0.09, 'rgba(255, 206, 206, ');
    cloud(300, 210, 300, 9, 0.08, 'rgba(180, 190, 250, ');
    cloud(1180, 460, 260, 14, 0.08, 'rgba(255, 190, 190, ');

    /* ---------- 远山：四层，越远越淡 ---------- */
    const ridge = (base, amp, color, phases, rim) => {
      const pts = [];
      for (let x = 0; x <= VIEW_W; x += 6) {
        const y = base
          + Math.sin(x * 0.0052 + phases[0]) * amp
          + Math.sin(x * 0.0131 + phases[1]) * amp * 0.42
          + Math.sin(x * 0.0327 + phases[2]) * amp * 0.15;
        pts.push(x, y);
      }
      g.beginPath();
      g.moveTo(0, VIEW_H);
      for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.lineTo(VIEW_W, VIEW_H);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      if (rim) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.beginPath();
        g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.strokeStyle = rim;
        g.lineWidth = 1.2;
        g.stroke();
        g.restore();
      }
      return pts;
    };
    ridge(478, 46, '#2c2452', [0.4, 2.1, 4.6], 'rgba(150, 170, 255, 0.10)');
    ridge(518, 38, '#241b45', [2.4, 0.8, 3.4], 'rgba(190, 170, 255, 0.08)');
    ridge(556, 30, '#1a1235', [4.1, 3.2, 1.2], 'rgba(255, 180, 190, 0.07)');
    const near = ridge(596, 20, '#120c26', [1.1, 5.4, 2.6], null);

    // 最近一道山脊上的针叶林剪影
    g.fillStyle = '#100a22';
    for (let i = 0; i < 46; i++) {
      const x = 40 + i * 27 + (rnd() - 0.5) * 16;
      const idx = Math.min(near.length - 2, Math.max(0, Math.round(x / 6) * 2));
      const by = near[idx + 1] + 2;
      const h = 10 + rnd() * 22;
      g.beginPath();
      g.moveTo(x, by - h);
      g.lineTo(x + h * 0.30, by);
      g.lineTo(x - h * 0.30, by);
      g.closePath();
      g.fill();
    }

    // 山脚雾带：把山与地面分开
    const mist = g.createLinearGradient(0, 520, 0, 640);
    mist.addColorStop(0, 'rgba(140, 118, 180, 0)');
    mist.addColorStop(0.5, 'rgba(160, 132, 190, 0.16)');
    mist.addColorStop(1, 'rgba(120, 96, 150, 0)');
    g.fillStyle = mist;
    g.fillRect(0, 520, VIEW_W, 130);

    /* ---------- 右：鸟居 + 提灯（暖色记忆点） ---------- */
    const tx = 1076, ty = 566, th = 158;
    g.save();
    g.translate(tx, ty);
    // 柱（略带透视，底宽顶窄）
    const pillar = (bx, bw) => {
      g.beginPath();
      g.moveTo(bx - bw / 2, 0);
      g.lineTo(bx - bw * 0.36, -th + 30);
      g.lineTo(bx + bw * 0.36, -th + 30);
      g.lineTo(bx + bw / 2, 0);
      g.closePath();
      g.fill();
    };
    g.fillStyle = '#150b22';
    pillar(-62, 18);
    pillar(62, 18);
    // 笠木：两端上翘，中间厚
    g.beginPath();
    g.moveTo(-116, -th + 2);
    g.quadraticCurveTo(0, -th - 30, 116, -th + 2);
    g.lineTo(116, -th + 18);
    g.quadraticCurveTo(0, -th - 8, -116, -th + 18);
    g.closePath();
    g.fill();
    // 贯与额束
    g.fillRect(-84, -th + 54, 168, 11);
    g.fillRect(-13, -th + 30, 26, 26);
    g.fillRect(-4, -th + 34, 8, 18);
    // 鸟居上的提灯
    g.fillStyle = '#1a0f24';
    g.fillRect(-6, -th + 66, 12, 5);
    const lg = g.createRadialGradient(0, -th + 88, 2, 0, -th + 88, 46);
    lg.addColorStop(0, 'rgba(255, 176, 96, 0.72)');
    lg.addColorStop(0.35, 'rgba(255, 124, 58, 0.30)');
    lg.addColorStop(1, 'rgba(255, 96, 40, 0)');
    g.fillStyle = lg;
    g.beginPath(); g.arc(0, -th + 88, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffa757';
    g.beginPath(); g.ellipse(0, -th + 88, 9, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255, 244, 214, 0.9)';
    g.beginPath(); g.ellipse(0, -th + 85, 4, 6, 0, 0, Math.PI * 2); g.fill();
    // 月光轮廓
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(214, 206, 255, 0.20)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(72, -th + 40); g.lineTo(74, 0); g.stroke();
    g.beginPath(); g.moveTo(-116, -th + 8); g.quadraticCurveTo(0, -th - 22, 116, -th + 8); g.stroke();
    g.restore();
    g.restore();

    /* ---------- 左：神社 + 石灯籠（暖色记忆点） ---------- */
    g.save();
    g.translate(196, 606);
    // 屋顶
    g.fillStyle = '#150c22';
    g.beginPath();
    g.moveTo(-176, 22);
    g.quadraticCurveTo(-150, -6, -96, -14);
    g.lineTo(-96, -30);
    g.quadraticCurveTo(-40, -40, -24, -66);
    g.quadraticCurveTo(-12, -84, 0, -84);
    g.quadraticCurveTo(12, -84, 24, -66);
    g.quadraticCurveTo(40, -40, 96, -30);
    g.lineTo(96, -14);
    g.quadraticCurveTo(150, -6, 176, 22);
    g.lineTo(150, 22);
    g.quadraticCurveTo(96, 4, 80, 22);
    g.lineTo(-80, 22);
    g.quadraticCurveTo(-96, 4, -150, 22);
    g.closePath();
    g.fill();
    // 屋檐轮廓光
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255, 190, 170, 0.16)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-176, 22); g.quadraticCurveTo(-150, -6, -96, -14);
    g.stroke();
    g.restore();
    // 墙与窗
    g.fillStyle = '#100a1a';
    g.fillRect(-84, 22, 168, 46);
    g.fillStyle = 'rgba(255, 176, 96, 0.34)';
    for (let i = 0; i < 3; i++) g.fillRect(-58 + i * 52, 34, 24, 20);
    g.fillStyle = 'rgba(255, 214, 150, 0.22)';
    for (let i = 0; i < 3; i++) g.fillRect(-58 + i * 52, 34, 24, 5);
    g.restore();

    // 石灯籠
    g.save();
    g.translate(352, 672);
    g.fillStyle = '#170f24';
    g.fillRect(-5, -38, 10, 38);
    g.fillRect(-16, -44, 32, 7);
    g.beginPath();
    g.moveTo(-14, -44); g.lineTo(-8, -62); g.lineTo(8, -62); g.lineTo(14, -44);
    g.closePath(); g.fill();
    g.fillRect(-13, -70, 26, 8);
    const slg = g.createRadialGradient(0, -56, 2, 0, -56, 44);
    slg.addColorStop(0, 'rgba(255, 210, 140, 0.55)');
    slg.addColorStop(0.4, 'rgba(255, 160, 90, 0.18)');
    slg.addColorStop(1, 'rgba(255, 140, 70, 0)');
    g.fillStyle = slg;
    g.beginPath(); g.arc(0, -56, 44, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffcf8a';
    g.fillRect(-6, -60, 12, 10);
    g.restore();

    /* ---------- 左上：樱枝与花簇 ---------- */
    const branch = (x0, y0, x1, y1, x2, y2, w, color) => {
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x1, y1, x2, y2);
      g.strokeStyle = color;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.stroke();
    };
    branch(-24, 76, 150, 118, 356, 96, 8, '#150c1c');
    branch(120, 120, 190, 176, 268, 198, 5, '#150c1c');
    branch(262, 108, 314, 70, 392, 58, 4.5, '#150c1c');
    branch(60, 92, 74, 48, 126, 16, 3.6, '#150c1c');

    const blossom = (x, y, s, hue) => {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const bg = g.createRadialGradient(x, y, 0, x, y, s * 4.2);
      bg.addColorStop(0, 'rgba(255, 150, 196, 0.34)');
      bg.addColorStop(0.5, 'rgba(255, 130, 190, 0.10)');
      bg.addColorStop(1, 'rgba(255, 120, 180, 0)');
      g.fillStyle = bg;
      g.beginPath(); g.arc(x, y, s * 4.2, 0, Math.PI * 2); g.fill();
      g.restore();
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + 0.4;
        g.fillStyle = hue;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.62, s * 0.54, s * 0.42, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255, 244, 248, 0.95)';
      g.beginPath(); g.arc(x, y, s * 0.27, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255, 210, 90, 0.85)';
      g.beginPath(); g.arc(x, y, s * 0.12, 0, Math.PI * 2); g.fill();
    };
    const spots = [
      [44, 92], [92, 108], [140, 128], [190, 168], [232, 188],
      [266, 112], [312, 88], [352, 68], [70, 44], [104, 20], [20, 122],
      [380, 54], [148, 60],
    ];
    spots.forEach(([x, y], i) => {
      blossom(x, y, 3.6 + (i % 3) * 1.2, i % 2 ? '#ff9ecb' : '#ffc6de');
    });

    /* ---------- 地面与前景 ---------- */
    const ground = g.createLinearGradient(0, 604, 0, VIEW_H);
    ground.addColorStop(0, 'rgba(18, 11, 30, 0.0)');
    ground.addColorStop(0.22, 'rgba(13, 8, 24, 0.9)');
    ground.addColorStop(1, '#07040e');
    g.fillStyle = ground;
    g.fillRect(0, 586, VIEW_W, VIEW_H - 586);

    // 前景灌木剪影
    g.fillStyle = '#0a0614';
    for (let i = 0; i < 11; i++) {
      const x = rnd() * VIEW_W;
      const w = 30 + rnd() * 90;
      const h = 10 + rnd() * 26;
      g.beginPath();
      g.ellipse(x, VIEW_H - 6 + rnd() * 4, w, h, 0, Math.PI, 0);
      g.fill();
    }

    // 草叶：两层，近层亮一点
    for (let pass = 0; pass < 2; pass++) {
      g.save();
      g.strokeStyle = pass === 0 ? 'rgba(52, 32, 70, 0.85)' : 'rgba(96, 62, 112, 0.55)';
      g.lineWidth = pass === 0 ? 1.6 : 1.1;
      for (let i = 0; i < 120; i++) {
        const x = (i / 120) * VIEW_W + (rnd() - 0.5) * 14;
        const h = (pass === 0 ? 12 : 20) + rnd() * (pass === 0 ? 26 : 34);
        const lean = (rnd() - 0.5) * (pass === 0 ? 8 : 14);
        g.beginPath();
        g.moveTo(x, VIEW_H + 6);
        g.quadraticCurveTo(x + lean * 0.35, VIEW_H - h * 0.55, x + lean, VIEW_H - h);
        g.stroke();
      }
      g.restore();
    }

    return c;
  }

  /**
   * 标题画面：插画背景 + 右侧主角立绘 + 光雾樱。
   * 插画未加载完成时退回程序化夜空，保证首帧不空。
   */
  _drawTitleBg(ctx) {
    if (!this._titleBg) this._titleBg = this._buildTitleBg();
    const t = this.t;
    const img = this._titleBgImg;

    if (img && img.complete && img.naturalWidth) {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(VIEW_W / iw, VIEW_H / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.drawImage(img, (VIEW_W - dw) / 2, (VIEW_H - dh) / 2, dw, dh);
    } else {
      ctx.drawImage(this._titleBg, 0, 0, VIEW_W, VIEW_H);
    }

    /* 左侧压暗，给 logo 和菜单留出可读的暗部 */
    let g = ctx.createLinearGradient(0, 0, VIEW_W * 0.66, 0);
    g.addColorStop(0, 'rgba(5, 3, 12, 0.88)');
    g.addColorStop(0.3, 'rgba(5, 3, 12, 0.66)');
    g.addColorStop(0.62, 'rgba(5, 3, 12, 0.24)');
    g.addColorStop(1, 'rgba(5, 3, 12, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    /* 左上角再压一层，避免樱枝和 logo 抢在一起 */
    g = ctx.createRadialGradient(300, 170, 40, 300, 170, 540);
    g.addColorStop(0, 'rgba(6, 4, 14, 0.55)');
    g.addColorStop(0.55, 'rgba(6, 4, 14, 0.24)');
    g.addColorStop(1, 'rgba(6, 4, 14, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    /* 底部压暗，让人物落地、提示文字更清楚 */
    g = ctx.createLinearGradient(0, VIEW_H * 0.66, 0, VIEW_H);
    g.addColorStop(0, 'rgba(5, 3, 12, 0)');
    g.addColorStop(1, 'rgba(5, 3, 12, 0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    /* 月亮呼吸辉光：插画里月亮中心约 (817, 236) */
    const pulse = 0.94 + Math.sin(t * 0.55) * 0.06;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mg = ctx.createRadialGradient(817, 236, 70, 817, 236, 310 * pulse);
    mg.addColorStop(0, 'rgba(255, 238, 214, 0.20)');
    mg.addColorStop(0.45, 'rgba(255, 196, 190, 0.09)');
    mg.addColorStop(1, 'rgba(255, 180, 200, 0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(817, 236, 310 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* 月光斜射光柱，缓缓呼吸 */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = 0.26 + i * 0.1 + Math.sin(t * 0.11 + i * 1.7) * 0.012;
      const alpha = 0.075 + Math.sin(t * 0.32 + i) * 0.022;
      ctx.save();
      ctx.translate(817, 236);
      ctx.rotate(a);
      const rg = ctx.createLinearGradient(0, 60, 0, 700);
      rg.addColorStop(0, `rgba(255, 228, 196, ${alpha})`);
      rg.addColorStop(0.55, `rgba(255, 206, 190, ${alpha * 0.38})`);
      rg.addColorStop(1, 'rgba(255, 196, 186, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(-14, 90);
      ctx.lineTo(34, 90);
      ctx.lineTo(150, 720);
      ctx.lineTo(-96, 720);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // 标题立绘只在菜单里出现；开场/ED 对话用同一张插画当背景，
    // 但不能再叠一个巨幅立绘，否则会和对话框立绘撞在一起。
    if (this.state === 'menu') {
      this._drawTitleCharacter(ctx);
    } else {
      ctx.fillStyle = 'rgba(4, 2, 10, 0.42)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    /* 低空流雾：两条错位漂移，压在人物脚边 */
    for (let k = 0; k < 2; k++) {
      const off = ((t * (10 + k * 7)) % (VIEW_W + 420)) - 210;
      const y = 568 + k * 58;
      ctx.save();
      ctx.globalAlpha = 0.42 - k * 0.14;
      const fg = ctx.createLinearGradient(off - 240, y, off + 240, y);
      fg.addColorStop(0, 'rgba(168, 120, 170, 0)');
      fg.addColorStop(0.5, 'rgba(168, 120, 170, 0.18)');
      fg.addColorStop(1, 'rgba(168, 120, 170, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(off + 640, y, 460, 38 + k * 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    /* 月光尘埃：缓慢上浮 */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const sx = 240 + ((i * 173.7) % 980);
      const base = 90 + ((i * 211.3) % 560);
      const x = sx + Math.sin(t * 0.22 + i * 2.1) * 26;
      const span = VIEW_H + 40;
      const y = (((base - t * (3 + (i % 5))) % span) + span) % span - 20;
      const r = 0.8 + (i % 4) * 0.45;
      ctx.globalAlpha = 0.1 + (i % 3) * 0.07;
      ctx.fillStyle = i % 4 === 0 ? '#ffe6c8' : '#ffc9dd';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    /* 落樱：远中近三层，前景压在人物上 */
    ctx.save();
    for (let i = 0; i < 54; i++) {
      const layer = i % 3;
      const speed = 18 + layer * 16;
      const seed = i * 977.3;
      const x = ((seed * 3.7 + t * (22 + layer * 12)) % (VIEW_W + 260)) - 130;
      const y = ((seed * 2.3 + t * speed) % (VIEW_H + 160)) - 80;
      const s = 1.4 + layer * 1.5 + (i % 4) * 0.35;
      ctx.globalAlpha = 0.18 + layer * 0.16;
      ctx.fillStyle = i % 3 === 0 ? '#ffd6e8' : (layer === 2 ? '#ff9ecb' : '#e884b4');
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.25, s * 0.7, Math.sin(t * 0.9 + i) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 右侧站姿立绘：轻微呼吸 + 投影，主角随选择切换 */
  _drawTitleCharacter(ctx) {
    const img = this._titleCharImgs?.[this.char] || this._titleCharImgs?.reimu;
    if (!img || !img.complete || !img.naturalWidth) return;

    const t = this.t;
    const breath = 1 + Math.sin(t * 1.15) * 0.0035;
    const h = 700 * breath;
    const w = img.naturalWidth * (h / img.naturalHeight);
    const cx = VIEW_W - 275;
    const bottom = VIEW_H + 42 + Math.sin(t * 0.9) * 3;
    const x = cx - w / 2;
    const y = bottom - h;

    // 人物背后的柔光，和插画分离
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(cx, VIEW_H * 0.56, 30, cx, VIEW_H * 0.56, 380);
    ag.addColorStop(0, 'rgba(255, 128, 168, 0.10)');
    ag.addColorStop(0.55, 'rgba(255, 110, 160, 0.045)');
    ag.addColorStop(1, 'rgba(255, 100, 150, 0)');
    ctx.fillStyle = ag;
    ctx.fillRect(cx - 400, VIEW_H * 0.56 - 400, 800, 800);
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(4, 2, 10, 0.75)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }
}

/* ---------------- 启动 ---------------- */
const game = new Game();
window.__game = game;
