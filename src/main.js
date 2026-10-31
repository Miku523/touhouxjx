/**
 * 入口：《东方新纪行 ～ Chronicle of Gensokyo》
 *
 * 负责：初始化、菜单流程、关卡流程、对话调度、HUD 同步、音频事件。
 */
import { Renderer, VIEW_W, VIEW_H } from './engine/renderer.js';
import { Input, ACTION_DEFS, keyLabel } from './engine/input.js';
import { platform, initPlatform } from './ui/platform.js';
import { Loop } from './engine/loop.js';
import { setPriority, preloadWhenIdle, holdIdleQueue, linkTier } from './engine/lazy_preload.js';
import { warmSongs, preloadSongs, isSongLoaded } from './engine/songs/index.js';
import { AudioEngine } from './engine/audio.js';
import { LEVELS } from './assets/levels.js';
import { Hud } from './game/hud.js';
import { SpellCutin } from './game/spellCutin.js';
import { BootScreen } from './game/bootScreen.js';
import { Dialogue } from './game/dialogue.js';
import { DIFFICULTY_KEYS, DIFFICULTIES, getDifficulty } from './game/difficulty.js';

/* ============================================================
   首屏之后才加载的重模块（代码分割）
   ------------------------------------------------------------
   进关用到的整棵依赖树（stage.js 及其 20 个依赖，未压缩 ~886KB）+ 剧情文本
   （story.js ~122KB）一旦静态 import，index.html 生成的 modulepreload 图就有
   69 项 / 1.9MB，弱网首访（实测 ~17KB/s、RTT 400ms）光是下载到菜单就要 66s
   —— 见 tools/_perf_online.md。
   改成动态 import 后首屏静态图只剩菜单真正用得到的那批，进关前再 await 这两包；
   首屏一揭幕就立刻在后台开始下（见 _prefetchGameKit），玩家看菜单的这几秒正好下载。
   ============================================================ */
let Stage = null, EXTRA_CHAIN = null, prefetchStageBg = null, warmStageBg = null;
let waitStageBg = null, stageBgReady = null;
let prewarmSpriteCache = null;
let STORY = null, openingFor = null, stageStoryFor = null,
  extraIntroFor = null, extraPostFor = null, midbossPreFor = null, midbossPostFor = null;

let _gameKitPromise = null;
/** 启动幕门禁的硬超时：15KB/s 弱网下首屏 + 整棵 game kit 本身就要 ~90s，这里只防连接挂死 */
const BOOT_GATE_TIMEOUT_MS = 90000;
/** 启动幕门禁的软上限：超过这么久还没全绿就先揭幕，剩下两路继续在后台下（真机网络实测：
 *  三路全绿在 4G 上要 40s+，而玩家只想快点看到标题，进门再等那一次是可接受的）。 */
const BOOT_GATE_SOFT_MS = 2500;
/** 进关依赖图模块数的估计值（tools/gen_modulepreload.py 统计约 49 项）；只用于进度条观感刻度 */
const KIT_MODULE_EST = 49;
/** 载入进关才用得到的模块；并发调用共享同一个 promise，失败后允许重试 */
function loadGameKit() {
  if (_gameKitPromise) return _gameKitPromise;
  _gameKitPromise = Promise.all([
    import('./game/stage.js'),
    import('./game/bullets.js'),
    import('./game/story.js'),
  ]).then(([stage, bullets, story]) => {
    Stage = stage.Stage;
    EXTRA_CHAIN = stage.EXTRA_CHAIN;
    prefetchStageBg = stage.prefetchStageBg;
    warmStageBg = stage.warmStageBg;
    waitStageBg = stage.waitStageBg;
    stageBgReady = stage.stageBgReady;
    prewarmSpriteCache = bullets.prewarmSpriteCache;
    STORY = story.STORY;
    openingFor = story.openingFor;
    stageStoryFor = story.stageStoryFor;
    extraIntroFor = story.extraIntroFor;
    extraPostFor = story.extraPostFor;
    midbossPreFor = story.midbossPreFor;
    midbossPostFor = story.midbossPostFor;
  }).catch((err) => {
    _gameKitPromise = null;   // 网络抖动允许下次进关重试，不要把失败永久钉住
    throw err;
  });
  return _gameKitPromise;
}

/* ------------------------------------------------------------
   结局模块（ending.js 演出的绘制/推进 + endings.js 的结局文本，未压缩约 51KB）
   只有真正打出结局才会用到，不进首屏静态图。打到第 5 面时提前拉（见 _createStage）。
   ------------------------------------------------------------ */
let Ending = null, endingFor = null;
let _endingModulePromise = null;
/** 载入结局模块；并发调用共享同一个 promise，失败后允许重试 */
function loadEndingModule() {
  if (_endingModulePromise) return _endingModulePromise;
  _endingModulePromise = Promise.all([
    import('./game/ending.js'),
    import('./game/endings.js'),
  ]).then(([endingMod, endingsMod]) => {
    Ending = endingMod.Ending;
    endingFor = endingsMod.endingFor;
  }).catch((err) => {
    _endingModulePromise = null;  // 网络抖动允许下次重试
    throw err;
  });
  return _endingModulePromise;
}

/** game kit 还没就绪时给玩家一个整屏「载入中」兜底，别让难度页按了 Enter 之后一动不动 */
function kitLoading(on, text) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('kitLoad');
  if (!on) {
    if (el) el.style.display = 'none';
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'kitLoad';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;'
      + 'justify-content:center;background:#05030a;color:#f2e9d8;letter-spacing:.14em;'
      + 'font:14px/1.8 "Songti SC","SimSun",serif;text-align:center;padding:24px;';
    (document.body || document.documentElement).appendChild(el);
  }
  el.textContent = text || '正在载入关卡…';
  el.style.display = 'flex';
}

/**
 * 进关入口统一走这里：先确保 game kit 已到，再继续原来的同步流程。
 * @returns {Promise<boolean>} kit 是否就绪（失败时提示并返回 false）
 */
// 完整样式表（src/style.css，约 140KB）首屏不再阻塞：首屏只加载 src/title.css（标题页那部分规则）。
// 这里在揭幕之后异步补齐，游戏内以 style.css 为准；进关前 ensureGameKit() 会等它到货。
let _gameCssPromise = null;
function loadGameCss() {
  if (_gameCssPromise) return _gameCssPromise;
  _gameCssPromise = new Promise((resolve) => {
    if (document.getElementById('hks-game-css')) { resolve(); return; }
    const l = document.createElement('link');
    l.id = 'hks-game-css';
    l.rel = 'stylesheet';
    l.fetchPriority = 'low';
    l.href = new URL('./style.css', import.meta.url).href;
    l.onload = () => resolve();
    l.onerror = () => {
      // 样式表挂了不影响开跑：游戏内会退回浏览器默认样式，比卡在载入界面好
      if (typeof console !== 'undefined') console.warn('[css] style.css 载入失败，游戏内样式可能不全');
      resolve();
    };
    document.head.appendChild(l);
  });
  return _gameCssPromise;
}

async function ensureGameKit() {
  if (_gameKitPromise === null) {
    // 首次触发并且在慢链路上：这一等可能要十几秒，先盖一张载入中
    kitLoading(true, '正在载入关卡…');
  }
  try {
    await loadGameKit();
    await loadGameCss();
    return true;
  } catch (err) {
    kitLoading(true, '关卡资源载入失败，请检查网络后重试');
    if (typeof console !== 'undefined') console.error('[gamekit] 载入失败', err);
    return false;
  } finally {
    // 载入遮罩由调用方在真正开始画关卡时关掉（见 kitLoading(false)）
  }
}

import { ensureCharArt } from './art/genchars.js';
import { ensureBossArt } from './art/genboss.js';
import { artUrl, onArtError } from './art/img.js';
import { initLang, tr, localizeDom, getLang, setLang, LANGS, isManualLang, onChange } from './i18n/index.js';

const MAIN_STAGES = () => LEVELS.filter((l) => !l.extra);
const EXTRA_STAGE = () => LEVELS.find((l) => l.extra);
const STAGE_KEY = (i) => `stage${i + 1}`;
/** 可玩主角：EXTRA 按这顺序各自解锁、各自可选 */
const CHAR_KEYS = ['reimu', 'marisa'];
const PROGRESS_KEY = 'hks.progress.v1';
/**
 * EXTRA 解锁秘籍：在标题画面或「操作说明」页依次按下这 16 个数字键。
 * 与真结局解锁等价（写进 hks.progress.v1），只是给不想等到真结局的玩家 / 排查用。
 */
const SECRET_EXTRA_CODE = '2002081120260909';
/** 音乐回忆室：听过哪些曲子（与通关进度分开存，重置进度不清空回忆） */
const MUSIC_KEY = 'hks.music.v1';
/** 符卡演出的世界减速：总时长（秒）与最大减速比例（0.55 = 掉到 45% 速度） */
const SLOW_TIME = 0.34;
const SLOW_AMOUNT = 0.55;

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
 * 难度卡的视觉素材：四档各一个主题色（tone 实色 / glow 供 rgba 用）。
 * 卡片只负责辨认，不再放强度说明；实际梯度见 difficulty.js。
 */
const DIFF_CARDS = {
  E: { tone: '#8fd8ff', glow: '143, 216, 255' },
  N: { tone: '#ffa6d0', glow: '255, 156, 203' },
  H: { tone: '#ffbf6b', glow: '255, 178, 96' },
  L: { tone: '#c79bff', glow: '186, 130, 255' },
};

/**
 * 选择界面的场景底图：每个页面一套独立景别，避免所有子页共用同一块暗紫卡片。
 * img 对应 src/art/gen/bg/*.webp；mote 是前景粒子（petal 花瓣 / mote 光点 / ember 余烬）；
 * zh 是画面右缘的竖排题签（简体原文，其余语言走 tr），en 是它下面那行小字。
 */
const SCENES = {
  shrine: { img: 'shrine', zh: '博丽神社', en: 'HAKUREI SHRINE', mote: 'petal' },
  mountain: { img: 'mountain', zh: '妖怪之山', en: 'YOUKAI MOUNTAIN', mote: 'mote' },
  forest: { img: 'forest', zh: '魔法森林', en: 'FOREST OF MAGIC', mote: 'mote' },
  mansion: { img: 'mansion', zh: '红魔馆', en: 'SCARLET MANSION', mote: 'ember' },
  moon: { img: 'moon', zh: '迷途竹林', en: 'BAMBOO OF THE LOST', mote: 'mote' },
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input();
    this.hud = new Hud();
    this.cutin = new SpellCutin();
    this.dialogue = new Dialogue();
    this.ending = null;   // 51KB 的结局演出模块，打出结局时才建（见 _ensureEnding）
    this.audio = new AudioEngine();
    // 平台层：环境识别 / PWA / 全屏 / 安全区 / 安卓返回键。
    // index.html 里没有单独引它 —— import 即自动初始化，桌面端不会产生副作用。
    this.platform = platform;
    initPlatform({ onBack: () => this._onSystemBack() });
    // 微信 / iOS Safari 的首个手势不一定落在 canvas 上（可能点在平台层的安装条上），
    // 平台层会在任意首次手势里广播解锁事件，这里把 AudioContext 一并唤醒。
    platform.onAudioUnlock?.(() => { try { this.audio.unlock?.(); } catch (e) { /* 忽略 */ } });
    // 蓝牙/USB 手柄：轮询式接入，没有手柄时每帧只多一次 getGamepads() 空跑。
    // 桌面端插着手柄也能直接玩，且与键盘、触屏摇杆并存（Input 按来源合并）。
    // 手柄模块 30KB 而绝大多数访客根本没插手柄：先探一次已连接，没有就等插入事件。
    this.gamepad = null;
    this._gamepadPromise = null;
    this._initGamepad();
    // 虚拟手柄模拟器：只依赖 Input 的 setStick/padPress/padRelease。
    // 59KB 的模块桌面端完全用不到，只有触屏设备才去拿；拿到之前 this.pad 是 null，
    // 所有调用点都已做了可选链或判空，所以桌面端与模块到货前的操作都不受影响。
    this.pad = null;
    if (this.input.touchDevice) {
      import('./ui/virtualPad.js')
        .then(({ TouchPad }) => { this.pad = new TouchPad({ input: this.input }); })
        .catch(() => { /* 拿不到就没有虚拟摇杆，键盘/手柄仍然可玩 */ });
    }
    // 切后台 / 锁屏 / 被来电盖住：触屏设备自动暂停。没有这一步，
    // 手机切出去再回来时往往已经被弹幕打死了。桌面端刻意不接管，保持原有节奏。
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play' && this.stage && this.input.touchDevice) {
        this._pause();
      }
    });
    // 场景底图在空闲时预热，避免第一次进设置页 / 难度页时闪一下黑底
    this._warmScenes();

    // 标题页右下角的版本号跟着入口 ?v= 走：以前这里写死 ver 1.1，缓存版本串早就
    // 涨到 1.4.x 了，玩家看到的仍是很旧的版本，反馈时容易对不上号。
    const entryVer = new URL(import.meta.url).searchParams.get('v');
    const verEl = document.querySelector('.title-ver');
    if (entryVer && verEl) verEl.textContent = 'Chronicle of Gensokyo · ver ' + entryVer;

    this.input.pointerHandler = () => this._unlockAudio();

    this.state = 'menu';
    this.stage = null;
    this.char = 'reimu';
    this.lives = 3;
    this.difficulty = 'N';
    this.levelIndex = 0;
    this.inExtra = false;
    // 开局给一点 POWER（24 = 火力 2 级），否则第一关 Boss 只能拿 1 级火力磨
    this.carryPower = 24;
    // 本次挑战内的残机与 1UP 进度：在设置页选的 lives 只是「开局值」，
    // 中途 1UP 拿到的残机、没满 99 的 extend 进度都要带进下一关，
    // 否则「99 点换一命」会在转关时凭空蒸发，等于白攒。
    this.runLives = null;
    this.carryExtend = 0;
    // 符卡减速：_slowT 是剩余减速时间，_timeScale 是当前世界时间倍率
    this._slowT = 0;
    this._timeScale = 1;
    // 续命次数：N/H/L 只要用过一次续命，就与真结局无缘
    this.continues = 0;
    // 道中对话节点是否已经播过（每关三个），以及本关是否整体跳过剧情
    this._midShown = [false, false, false];
    this._skipBeats = false;
    this.unlockedExtra = false;
    // EXTRA 由两位主角各自解锁：灵梦不续命通关只开灵梦，魔理沙同理；两位都通关后才能任选。
    this.extraChars = { reimu: false, marisa: false };
    // 本次 EXTRA 使用的自机（EXTRA 选人页写入，旧存档迁移时也用它兜底）
    this.extraChar = null;
    this.t = 0;
    this.frameCap = 0;
    this.musicOn = true;
    this.screenShake = true;
    // 画质档位：'auto' 跟随硬件检测，'high' / 'low' 玩家强制覆盖（设置页「画质」行）
    this.quality = 'auto';
    // 操作方式：'keys' 键盘（默认）/ 'wasd-mouse' WASD 移动 + 鼠标左键射击、右键符卡
    this.controlScheme = 'keys';
    this._pendingTimeout = 0;
    this.menuIndex = 0;
    this.menuButtons = [];
    // 秘籍输入缓冲：依次按下的数字；按到别的键就清空
    this._secretBuf = '';

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
    // 设置加载完再把操作方式同步给 Input（Input 在 105 行就建好了，必须先有设置值）
    this._applyControlScheme();
    this._loadProgress();
    // 音乐回忆：先读出「听过哪些曲子」，再让音频引擎在每次换曲时回报
    this._heardSongs = new Set();
    this._loadMusicMemory();
    this.audio.onSongStart = (name) => this._rememberSong(name);
    this._applyAudio();
    // 画质档位必须在 _loadSettings 之后生效（高/低档会重建 backing store）
    this.renderer.setQuality?.(this.quality);

    /* ---------- 标题画面素材：插画背景 + 两套主角立绘 ---------- */
    // 这三张是首屏唯一必需的图：给最高优先级，其余预加载会自动让路（见 engine/lazy_preload.js）
    const titleBg = new URL('./art/gen/title_bg.webp', import.meta.url).href;
    this._titleBgImg = new Image();
    this._titleBgImg.decoding = 'async';
    setPriority(this._titleBgImg, 'high');
    // AVIF 优先；不支持 AVIF 的浏览器在 onerror 里退回 .webp（只回退一次）
    this._titleBgImg.onerror = () => onArtError(this._titleBgImg, titleBg);
    this._titleBgImg.src = artUrl(titleBg);

    this._titleCharImgs = {};
    for (const key of ['reimu', 'marisa']) {
      const img = new Image();
      img.decoding = 'async';
      setPriority(img, 'high');
      const webp = new URL(`./art/gen/${key}_title.webp`, import.meta.url).href;
      img.onerror = () => onArtError(img, webp);
      img.src = artUrl(webp);
      this._titleCharImgs[key] = img;
    }
    if (typeof window !== 'undefined') {
      window.__titleArt = [this._titleBgImg, ...Object.values(this._titleCharImgs)];
    }

    // 首屏启动幕：标题背景 + 立绘 decode 完之前盖住整屏，
    // 揭幕时 canvas 插画与 DOM 菜单同一帧出现，不会「先看到界面、后看到人物」。
    // 进度条读的是真实里程碑（见 bootScreen.js），不是定时假动画。
    this._boot = new BootScreen(document.getElementById('boot'));
    this._bootEl = this._boot.el;
    this._bootDone = false;
    // 标题开屏：0 = 未播放（静态），非 0 = performance.now() 起点
    this._titleIntroT0 = 0;
    this._titleIntroOn = false;
    this._titleIntroTimer = 0;
    // 揭幕门禁：标题三图 + 进关 game kit + 第 1 面曲库都就绪才放行（见 _waitBootReady）。
    // 三路状态同时挂在 window.__hksBootGate 上，QA 与线上排障都读它。
    this._bootGate = {
      art: false, kit: false, music: false, failed: [],
      startedAt: 0, finishedAt: 0, done: false,
    };
    if (typeof window !== 'undefined') window.__hksBootGate = this._bootGate;
    // 门禁期间暂停空闲预取（立绘 / 关卡背景 / 弹幕精灵），别和 game kit、曲库抢带宽；
    // 放行由 _waitBootReady 负责（三路都完成、失败或硬超时都会放行，不会一直卡住预取）
    holdIdleQueue(true);
    this._waitBootReady();

    // 一次性尖峰预算：
    // ① AudioContext 创建要 50~120ms，直接放在启动幕还在盖屏的时候同步付掉，
    //    绝不能留给第一次按键（那时玩家正盯着难度页，卡一下最明显）；
    // ② 弹幕精灵烘焙（~12ms 总量）排到标题页之后，分片跑，不和首屏抢带宽。
    this._prewarmAudio();
    // 弹幕精灵烘焙要用 bullets.js（属于进关才加载的 game kit），首屏这里跑不了：
    // 改到 _createStage 里进关时再启动（那边 1673 行本来就有一次调用）。

    window.addEventListener('keydown', (e) => {
      // 开屏动画期间任意按键直接落到结束姿态，不耽误想立刻开菜单的玩家
      this._skipTitleIntro();
      // 只用键盘启动的玩家也要解锁音频：浏览器策略只认用户手势，按键同样算
      this._unlockAudio();
      // 开屏期间整屏被启动幕盖着：按键不能漏进菜单，否则会盲选到「开始游戏」
      if (!this._bootDone) return;
      // 隐藏跳关：Shift + 1–6 直达主线第 1–6 面（回忆室 / 改键页里会让位）
      if (this._tryStageWarp(e)) return;
      // 音乐回忆室是整屏页面：按键先交给它，消费掉就不再漏进标题菜单
      if (this.musicRoom?.handleKey(e)) return;
      // 秘籍：依次按下 16 位数字解锁 EXTRA（标题画面 / 操作说明页，见 SECRET_EXTRA_CODE）
      if (this._trySecretCode(e)) return;
      // 静音键：标题页的 M 另有用途（音乐室），其余状态（暂停 / 对话 / 结局 /
      // 结算面板）也该能一键静音。play 状态由主循环里的 mute 动作处理，避免重复触发。
      if (e.code === 'KeyM' && !this._captureAction && this.state !== 'menu' && this.state !== 'play') {
        e.preventDefault();
        this._toggleMute();
        // 设置页里的「全部静音」开关是渲染快照，按 M 后必须重画一次，
        // 否则开关还停在旧状态，玩家会以为没静音成功。
        if (this._page === 'settings') this._showSettings(this.menuIndex, this._settingsOrigin);
        return;
      }
      this._onMenuKey(e);
    });

    this.overlay = document.getElementById('overlay');
    this.titleEl = document.getElementById('title');
    this.subtitleEl = document.getElementById('subtitle');
    this.buttonsEl = document.getElementById('buttons');
    this.hintEl = document.getElementById('hint');
    this.uiEl = document.getElementById('ui');
    this.hudEl = document.getElementById('hud');

    // 音乐回忆室：独立整屏层，进入时收起标题菜单，返回时由 showTitle 复原。
    // 53KB 的模块只在真正进去时才加载，先留空（showMusicRoom 里补建）。
    this.musicRoom = null;

    // HUD 右上角设置键：打开暂停菜单（继续 / 设置 / 退出）
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      if (this.state === 'play' && this.stage) {
        this.audio.play?.('select');
        this._pause();
      }
    });

    // 鼠标点击解锁音频；开屏期间点一下也直接落位
    window.addEventListener('pointerdown', () => this._unlockAudio(), { once: true });
    window.addEventListener('pointerdown', () => this._skipTitleIntro(), { passive: true });

    this.loop = new Loop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
      { frameCap: this.frameCap }
    );
    this.loop.start();

    this.showTitle();

    // 切语言后按「当前这一页」重建：setLang 已经换好 <html lang> 和 data-i18n 静态文案，
    // 这里只负责标题 / 设置 / 暂停这些由 JS 拼出来的页面。不刷新页面，不丢存档与光标。
    onChange(() => this.applyLang());
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
      if (b.feedback) {
        // 例如锁着的 EXTRA：`.btn.locked` 默认 pointer-events:none，
        // 这里只放开点击（视觉仍为 locked），点了给一条「尚未解锁」提示。
        // aria-disabled 让读屏 / Tab 走查也知道它现在不可进入。
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
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
        if (!el.classList.contains('info') && !el.disabled && !el._spec?.noSelect && !this._captureAction) this._selectMenu(i);
      });
      parent.appendChild(el);
    });

    this.menuButtons = Array.from(this.buttonsEl.querySelectorAll('.btn'));
    this._selectMenu(Number.isInteger(opts.select) ? opts.select : 0);
    // 旧面板大量文案是中文直写；统一在一处按当前字典扫一遍，
    // 避免每个按钮/提示都手工包 tr()。查不到译文的节点保持原样。
    if (this.overlay) localizeDom(this.overlay);
  }

  /** 空闲时把五张场景底图解码进缓存（不阻塞首屏，失败也不影响运行） */
  _warmScenes() {
    const go = () => {
      for (const s of Object.values(SCENES)) {
        try {
          const im = new Image();
          im.decoding = 'async';
          setPriority(im, 'low');
          const webp = new URL(`./art/gen/bg/${s.img}.webp`, import.meta.url).href;
          im.onerror = () => onArtError(im, webp);
          im.src = artUrl(webp);
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
    const captionJp = tr(scene.zh);
    if (this._sceneId === id && this._ovBg) {
      const cap = this._ovBg.querySelector('.ov-bg-caption span');
      if (cap) cap.textContent = captionJp;
      return;
    }
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
    const sceneWebp = new URL(`./art/gen/bg/${scene.img}.webp`, import.meta.url).href;
    const sceneUrl = artUrl(sceneWebp);
    this._ovBg.innerHTML =
      `<div class="ov-bg-img" style="background-image:url('${sceneUrl}')"></div>` +
      '<div class="ov-bg-grade"></div>' +
      '<div class="ov-bg-vignette"></div>' +
      '<div class="ov-bg-grain"></div>' +
      `<div class="ov-bg-motes">${motes}</div>` +
      `<div class="ov-bg-caption"><span>${captionJp}</span></div>` +
      '<span class="ov-corner tl"></span><span class="ov-corner tr"></span>' +
      '<span class="ov-corner bl"></span><span class="ov-corner br"></span>';
    // CSS 背景拿不到 onerror：用同一张 AVIF 做探针，不支持 AVIF 的浏览器上把背景改回 WebP。
    // 图已在 _warmScenes 里预热过，探针通常直接命中缓存，不会多一次网络请求。
    if (sceneUrl !== sceneWebp) {
      const probe = new Image();
      probe.onerror = () => {
        if (this._sceneId !== id) return;
        const el = this._ovBg?.querySelector('.ov-bg-img');
        if (el) el.style.backgroundImage = `url("${sceneWebp}")`;
      };
      probe.src = sceneUrl;
    }
  }

  /** 菜单选中态（键盘 / 鼠标共用），自动跳过 .info 纯文本行、disabled 项与 noSelect 项 */
  _selectMenu(index, dir = 1) {
    const list = this.menuButtons || [];
    const n = list.length;
    if (!n) return;
    const dead = (el) => el.classList.contains('info') || el.disabled || !!el._spec?.noSelect;
    let k = ((index % n) + n) % n;
    for (let guard = 0; guard < n && dead(list[k]); guard++) {
      k = (k + dir + n) % n;
    }
    if (dead(list[k])) return;
    this.menuIndex = k;
    // 记住设置页的光标位置：返回标题/暂停菜单再进来时不跳回第一行
    if (this._page === 'settings') this._settingsIndex = k;
    if (this._page === 'paused') this._pauseIndex = k;
    list.forEach((el, i) => el.classList.toggle('sel', i === k));
    this._onSelect?.(list[k], k);
  }

  _menuStep(dir) {
    this._selectMenu(this.menuIndex + dir, dir);
  }

  /**
   * 菜单动作：键盘、蓝牙手柄、虚拟手柄共用这一条路径。
   * 键盘在 keydown 里调用（需要 preventDefault），手柄/触屏在 update 里消费边沿。
   * 返回 true 表示这一下被菜单吃掉了。
   */
  _menuAction(action) {
    if (!action || this._captureAction) return false;
    if (this.state !== 'menu' && this.state !== 'paused' && this.state !== 'gameover') return false;
    if (!this.overlay || this.overlay.classList.contains('hidden')) return false;

    // 上下选择
    if (action === 'up' || action === 'down') {
      this._menuStep(action === 'up' ? -1 : 1);
      return true;
    }

    // 左右调整当前行的数值（音量 / 帧率 / 画质）；没有可调项的页面里左右也当作移动
    if (action === 'left' || action === 'right') {
      const adjust = this.menuButtons[this.menuIndex]?._spec?.adjust;
      if (adjust) adjust(action === 'left' ? -1 : 1);
      else this._menuStep(action === 'left' ? -1 : 1);
      return true;
    }

    // 确认
    if (action === 'confirm' || action === 'jump') {
      const el = this.menuButtons[this.menuIndex];
      if (el && !el.classList.contains('info') && !el.disabled) {
        el.click();
        return true;
      }
      return false;
    }

    // 返回：优先 back 项，其次标注 Esc 的项（如暂停菜单的「继续」）
    if (action === 'pause') {
      const back =
        this.menuButtons.find((b) => b._spec?.back) ||
        this.menuButtons.find((b) => b._spec?.key === 'ESC' && !b.classList.contains('info'));
      if (back) {
        back.click();
        return true;
      }
      return false;
    }
    return false;
  }

  /**
   * 没有 keydown 事件可用的输入源（蓝牙手柄 / 虚拟手柄）在这里消费菜单边沿。
   * 只在菜单类状态生效；键盘按下时 _onMenuKey 已经处理并 endFrame，不会重复走一次。
   */
  _padMenuTick() {
    if (this.state !== 'menu' && this.state !== 'paused' && this.state !== 'gameover') return;
    if (this._captureAction) return;
    const inp = this.input;
    let action = null;
    if (inp.pressed('up')) action = 'up';
    else if (inp.pressed('down')) action = 'down';
    else if (inp.pressed('left')) action = 'left';
    else if (inp.pressed('right')) action = 'right';
    else if (inp.pressed('confirm') || inp.pressed('jump')) action = 'confirm';
    else if (inp.pressed('pause')) action = 'pause';
    if (action && this._menuAction(action)) this.input.endFrame();
  }

  /** 状态机 → 虚拟手柄语义状态 */
  _touchStateName() {
    switch (this.state) {
      case 'play': return 'play';
      case 'paused': return 'paused';
      case 'dialogue': return 'dialogue';
      case 'ending': return 'ending';
      case 'gameover': return 'gameover';
      default: return 'menu';
    }
  }

  /**
   * 手柄模块按需加载：已经插着手柄就立刻拿，否则等第一次插入。
   * 拿回来之前 this.gamepad 是 null，update 里的 poll、震动、设置页都已判空。
   */
  _initGamepad() {
    let connected = false;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : null;
      connected = !!pads && Array.from(pads).some((p) => !!p);
    } catch (e) { connected = false; }
    if (connected) this._loadGamepad();
    // 插入时才去下这 30KB；handleConnected 里再 start() 一次，接上第一帧就生效。
    window.addEventListener('gamepadconnected', () => { this._loadGamepad(); });
  }

  /** 加载 GamepadManager（重复调用共用同一个 promise） */
  _loadGamepad() {
    if (!this._gamepadPromise) {
      this._gamepadPromise = import('./engine/gamepad.js')
        .then(({ GamepadManager }) => {
          if (this.gamepad) return this.gamepad;
          this.gamepad = new GamepadManager({ input: this.input });
          this.gamepad.start?.();
          return this.gamepad;
        })
        .catch(() => { this._gamepadPromise = null; return null; });
    }
    return this._gamepadPromise;
  }

  /**
   * 结局演出模块按需加载（ending.js + endings.js，约 51KB）。
   * 打到第 5 面就开始预取，正常情况下等玩家真的通关时早就下好了；
   * 万一是弱网没赶上，_playEnding 会 await 这里并挂整屏提示。
   */
  async _ensureEnding() {
    if (this.ending) return this.ending;
    await loadEndingModule();
    if (!this.ending) this.ending = new Ending();
    return this.ending;
  }

  /** 每帧同步虚拟手柄状态（TouchPad 内部会判重，未变化时几乎零开销） */
  _syncTouchState() {
    const pad = this.pad;
    if (!pad || typeof pad.setGameState !== 'function') return;
    const name = this._touchStateName();
    if (name === this._touchState) return;
    this._touchState = name;
    pad.setGameState(name);
  }

  /** 设置页：触屏方案循环（摇杆 → 手势 → 按键）并就地重画 */
  _cyclePadScheme(dir = 1, origin = this._settingsOrigin) {
    const pad = this.pad;
    if (!pad || !pad.active) return;
    if (typeof pad.cycleScheme === 'function') pad.cycleScheme(dir);
    this._showSettings(this.menuIndex, origin);
  }

  /**
   * 安卓返回键 / 手势返回：对局中先暂停，暂停里逐级返回。
   * 只在触屏设备上由平台层挂载，桌面浏览器返回键行为不变。
   */
  _onSystemBack() {
    this._unlockAudio?.();
    // 布局编辑器/手柄内部面板开着时，返回键先关它，不要顺带把暂停菜单也退掉
    if (this.pad?.closeOverlay?.()) return;
    if (this._captureAction) {
      this._captureAction = null;
      this.showKeybinds(this._keybindIndex, tr('已取消改键'));
      this.input.endFrame();
      return;
    }
    if (this.state === 'dialogue' && this.dialogue.active) {
      this.dialogue.advance();
      return;
    }
    if (this.state === 'ending') {
      this.ending?.advance();
      return;
    }
    if (this.state === 'play') {
      this._pause();
      return;
    }
    if (this._menuAction('pause')) return;
    if (this.state === 'paused') this._resume();
  }

  /**
   * 状态机 → 平台层语义状态。
   * 平台层据此决定安装条 / iOS 添加到桌面弹窗能不能出现：
   * 只允许 'title'，其余状态（含设置页）都压住，别盖在游戏和按钮上。
   */
  _platformStateName() {
    // 开机动画还没放完先按 menu 算，别让安装条压在 BootScreen 上
    if (!this._bootDone) return 'menu';
    if (this.state === 'menu' || this.state === 'paused') {
      if (this._page === 'settings' || this._page === 'keybinds') return 'settings';
      if (this.state === 'menu') return this._page === 'title' ? 'title' : 'menu';
      return 'paused';
    }
    return this._touchStateName();
  }

  /** 平台层同步：语义状态 + 系统返回键拦截（只在触屏端） */
  _syncPlatformState() {
    const pf = this.platform;
    if (!pf || !pf.env) return;
    // 安装条只在标题页出现，其余状态（菜单/设置/对局/剧情）一律让它退场
    const name = this._platformStateName();
    if (name !== this._platformState) {
      this._platformState = name;
      if (typeof pf.setGameState === 'function') pf.setGameState(name);
    }
    if (!pf.env.touch) return;
    const want =
      this.state === 'play' || this.state === 'paused' || this.state === 'dialogue' ||
      this.state === 'ending' || this.state === 'gameover';
    if (want === this._backGuardOn) return;
    this._backGuardOn = want;
    pf.setBackGuard(want);
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
    // gameover 面板也要吃键盘：Enter 重新挑战 / Esc 回标题 / ↑↓ 选择按钮
    if (this.state !== 'menu' && this.state !== 'paused' && this.state !== 'gameover') return;
    if (!this.overlay || this.overlay.classList.contains('hidden')) return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

    const action = this.input.actionOf(e.code);

    // 0) 按键设置页：Del / 退格 一键恢复默认
    if ((e.code === 'Delete' || e.code === 'Backspace') && this._page === 'keybinds') {
      e.preventDefault();
      this.input.resetBinds();
      this.audio.play?.('select');
      this.showKeybinds(this._keybindIndex, tr('已恢复默认键位'));
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

    // 2) 方向 / 确认 / 返回：统一交给 _menuAction（手柄、虚拟手柄走同一条路径）
    if (['up', 'down', 'left', 'right', 'confirm', 'jump', 'pause'].includes(action)) {
      e.preventDefault();
      if (this._menuAction(action)) {
        // 立刻清边沿：否则同一帧的 update 会把这一下当成手柄/触屏输入再走一次
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
      this.showKeybinds(this._keybindIndex, tr('已取消改键'));
      // 清掉这一下 Esc 的边沿：否则同一帧 _padMenuTick 会再当 pause 消费一次，
      // 页面从 keybinds 直接退到 settings，玩家以为一次 Esc 跳了两级。
      this.input.endFrame();
      return;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      this.input.resetBinds();
      this._captureAction = null;
      this.audio.play?.('select');
      this.showKeybinds(this._keybindIndex, tr('已恢复默认键位'));
      this.input.endFrame();
      return;
    }
    if (!e.code) return;

    // 浏览器保留键 / 功能键不能绑：绑了 F5 会直接刷新页面、绑 Tab 会把焦点移走，
    // 玩家会以为「这个动作被我按坏了」。这里统一拒绝并给出提示。
    const RESERVED_KEYS = new Set([
      'Tab', 'CapsLock',
      'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
      'ContextMenu', 'PrintScreen', 'ScrollLock', 'Pause', 'Insert',
      'Home', 'End', 'PageUp', 'PageDown',
      ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
    ]);
    if (RESERVED_KEYS.has(e.code)) {
      // 保持捕获态，玩家可以继续按别的键；只提示一句
      this.showKeybinds(this._keybindIndex, tr('这个键浏览器要用（或功能键），换一个吧'));
      return;
    }

    const changed = this.input.setBind(action, e.code);
    this._captureAction = null;
    this.audio.play?.(changed ? 'select' : 'menu');
    this.showKeybinds(this._keybindIndex);
    this.input.endFrame();
  }

  _hidePanel() {
    this.overlay?.classList.add('hidden');
  }

  /* ---------------- 首屏启动幕 ---------------- */

  /**
   * 揭幕门禁：三路并行，全绿（或失败 / 硬超时）才放行。
   *
   *   ① 标题三图（背景 + 两张立绘）下载并 decode —— 进度 0.10 → 0.42
   *   ② 进关 game kit（stage 树 + 弹幕 + 剧情，动态 import 的整棵依赖图）—— 0.42 → 0.86
   *   ③ 第 1 面曲库（道中曲 pre1 + Boss 曲 stage1 模块）—— 三路都完成后抬到 0.92
   *
   * 「标题好了但游戏 / 音乐没好」的体验就此消掉：揭幕那一刻点「开始游戏」，
   * game kit 已在内存里、第一面 BGM 模块也已在曲库，进关不再有黑屏载入遮罩与静音。
   * 任何一路失败都只记进 failed[] 并 console.warn，依旧放行：宁可退回程序化素材，
   * 也不能一直黑屏；进关时 ensureGameKit() / _ensureStageMusic() 还有二次兜底。
   * 90s 硬超时只防「连接挂住不报错」把启动幕卡死（量级见 BOOT_GATE_TIMEOUT_MS）。
   */
  _waitBootReady() {
    const gate = this._bootGate;
    gate.startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this._boot?.setTarget(0.10);
    // 排障 / A-B 测速开关：?bootgate=off 只等标题图（等价改造前的旧行为）；
    // 默认开启门禁，线上玩家不会带这个参数。
    const gateOff = typeof location !== 'undefined' && /[?&]bootgate=off(?:[&#]|$)/.test(location.search);
    this._bootGateOff = gateOff;
    this._refreshBootStatus();
    const tasks = gateOff
      ? [this._bootGateTitleArt()]
      : [this._bootGateTitleArt(), this._bootGateGameKit(), this._bootGateStage1Music()];
    // 软上限：真机网络下「进关模块 + 第 1 面曲目」往往要几十秒，不能让启动幕一直盖着。
    // 到点先揭幕，未就绪的那几路继续下载，进关前的 ensureGameKit / _ensureStageMusic 还有二次兜底。
    const softCap = new Promise((resolve) => setTimeout(() => {
      if (gate.done) return;
      gate.softTimeout = true;
      gate.failed.push('soft-timeout');
      resolve();
    }, BOOT_GATE_SOFT_MS));
    const hardCap = new Promise((resolve) => setTimeout(() => {
      if (gate.done) return;
      gate.failed.push('timeout');
      if (typeof console !== 'undefined') {
        console.warn('[boot] 门禁 90s 硬超时，先揭幕；未就绪的模块交给进关前的兜底再等');
      }
      resolve();
    }, BOOT_GATE_TIMEOUT_MS));
    Promise.race([Promise.all(tasks), softCap, hardCap])
      .then(() => {
        gate.done = true;
        gate.finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
        // 三路都到齐时进度条一口气走到 92%，再由 finish() 追满
        this._boot?.setTarget(0.92);
        // 门禁结束：空闲预取（立绘 / 背景 / 弹幕精灵）这时才能开始抢带宽
        holdIdleQueue(false);
        // 第 1 面之外的曲库模块：不进门禁，揭幕后排进空闲队列慢慢灌（见 _warmRemainingSongs）
        this._warmRemainingSongs();
        this._refreshBootStatus();
        if (!gateOff && gate.failed.length && typeof console !== 'undefined') {
          console.warn('[boot] 门禁未全绿就揭幕：', gate.failed.join(','));
        }
        this._boot?.setTarget(0.94);
        // 最短停留时间到点后追满 100%，兑现后 main 再等两帧揭幕
        return this._boot ? this._boot.finish() : Promise.resolve();
      })
      .then(() => this._revealTitle());
  }

  /**
   * 门禁 ①：标题三图 decode。每张推进 1/3，失败或 8s 超时也放行（退回程序化夜空）。
   */
  _bootGateTitleArt() {
    const imgs = [this._titleBgImg, ...Object.values(this._titleCharImgs)].filter(Boolean);
    const total = imgs.length || 1;
    let ready = 0;
    const decodeAll = Promise.all(imgs.map((img) => new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        ready += 1;
        this._boot?.setTarget(0.10 + 0.32 * (ready / total));
        resolve();
      };
      if (img.complete && img.naturalWidth) { done(); return; }
      if (typeof img.decode === 'function') {
        img.decode().then(done, done);
      } else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    })));
    const timeout = new Promise((resolve) => setTimeout(resolve, 8000));
    return Promise.race([decodeAll, timeout]).then(() => {
      this._bootGate.art = true;
      this._refreshBootStatus();
    });
  }

  /**
   * 门禁 ②：进关 game kit 全量模块。
   * 进度条用 ResourceTiming 里「门禁开始之后才发起的 script 请求」数量粗略映射到 0.42→0.82
   * （KIT_MODULE_EST 只是观感刻度，真正放行看 loadGameKit() 的 promise）。
   * 失败只记 failed，不阻断揭幕。
   */
  _bootGateGameKit() {
    const gate = this._bootGate;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let timer = 0;
    if (typeof performance !== 'undefined' && typeof setInterval === 'function') {
      timer = setInterval(() => {
        try {
          const list = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
          let n = 0;
          for (const e of list) {
            if (e.initiatorType !== 'script' || e.startTime < t0) continue;
            if (/\/engine\/songs\//.test(e.name || '')) continue;   // 曲库模块不算进关进度
            n += 1;
          }
          this._boot?.setTarget(0.42 + 0.40 * Math.min(1, n / KIT_MODULE_EST));
        } catch (e) { /* 进度只是观感，量不到就算了 */ }
      }, 200);
    }
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };
    return loadGameKit().then(() => {
      stop();
      gate.kit = true;
      this._boot?.setTarget(0.86);
      this._refreshBootStatus();
    }, (err) => {
      stop();
      gate.failed.push('kit');
      this._refreshBootStatus();
      if (typeof console !== 'undefined') console.warn('[boot] 进关模块预载失败，先揭幕；进关时会再等一次', err);
    });
  }

  /**
   * 门禁 ③：第 1 面曲库模块（道中曲 + Boss 曲）。
   * 只门禁第 1 面（gzip 约 21KB）；全曲库 18 首 ~291KB 会把弱网首屏拖成 +19s，
   * 后续面由进关前的 _ensureStageMusic() 与 _warmStageMusic() 的「提前一面预热」覆盖。
   * preloadSongs 不会 reject，所以这里用 isSongLoaded 复核是否真的到货。
   */
  _bootGateStage1Music() {
    const gate = this._bootGate;
    const def = this._mainStages()[0];
    const names = this._stageSongs(def);
    if (!names.length) { gate.music = true; return Promise.resolve(); }
    return preloadSongs(names).then(() => {
      const missing = names.filter((n) => !isSongLoaded(n));
      if (missing.length) {
        gate.failed.push('music');
        if (typeof console !== 'undefined') console.warn('[boot] 第 1 面曲目模块未就绪：', missing);
      } else {
        gate.music = true;
      }
      this._refreshBootStatus();
    });
  }

  /**
   * 启动幕状态行：把门禁现在卡在哪一段说出来（标题图 / 进关模块 / 曲库）。
   *
   * 只往 #boot 里插一个 <p class="boot-status">，不改 index.html；样式见 style.css。
   * 纯观感文案：失败路径也照样播报，玩家看到的是「还在准备」而不是假进度。
   * ?bootgate=off 时 kit/music 恒为 false，会一直停在「准备游戏资源…」，所以直接不显示。
   */
  _bootStatus(text) {
    const bootEl = document.getElementById('boot');
    if (!bootEl) return;
    let el = this._bootStatusEl;
    if (!el || !el.isConnected) {
      const anchor = bootEl.querySelector('.boot-sub');
      if (!anchor || !anchor.parentNode) return;
      el = document.createElement('p');
      el.className = 'boot-status';
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
      this._bootStatusEl = el;
    }
    const next = text || '';
    if (el.textContent === next) return;
    el.textContent = next;
    el.classList.toggle('on', !!next);
  }

  /** 按门禁三路的完成度刷新状态行文案（每路结算时调用一次）。 */
  _refreshBootStatus() {
    if (this._bootGateOff) { this._bootStatus(''); return; }
    const g = this._bootGate;
    if (!g) return;
    if (g.done) { this._bootStatus('准备完成'); return; }
    if (!g.art) { this._bootStatus('正在绘制标题…'); return; }
    if (!g.kit && !g.music) { this._bootStatus('正在准备游戏资源与音乐…'); return; }
    if (!g.kit) { this._bootStatus('正在准备游戏资源…'); return; }
    if (!g.music) { this._bootStatus('正在准备音乐…'); return; }
    this._bootStatus('即将开始…');
  }

  /**
   * 揭幕之后把余下各面的曲库模块排进空闲预热队列（第 1 面已在门禁里到货）。
   *
   * 为什么不做成硬门禁：全曲库 18 首 ~291KB gzip，弱网（15KB/s）会把揭幕再拖长 ~19s。
   * 这里交给 warmSongs 的串行空闲队列，在玩家看标题 / 选难度 / 看剧情的空档慢慢灌；
   * 真到用的时候还没好，进关前的 _ensureStageMusic() 仍会当场等（≤4s）。
   * 受限链路整段跳过，沿用既有「按需加载负责能用到的素材」策略。
   */
  _warmRemainingSongs() {
    if (this._songsWarmed) return;
    this._songsWarmed = true;
    try {
      if (linkTier() === 'constrained') return;
      const names = [];
      for (const def of LEVELS) names.push(def.musicPre, def.musicMid, def.music);
      warmSongs(names.filter(Boolean));
    } catch (e) { /* 预热失败不影响进关：进关前 _ensureStageMusic 还会再等一次 */ }
  }

  _revealTitle() {
    if (this._bootDone) return;
    this._bootDone = true;
    // 门禁已把进关模块拉下来时这里什么都不用做；只有门禁失败（404 / 断网 / 超时）
    // 才在揭幕后补一次后台重试 —— 玩家在标题页犹豫、挑难度、看选人页这几秒正好把它吃掉。
    // 就算这次也失败也没关系：进关前 ensureGameKit() 还会再等一次。
    if (!this._bootGate?.kit) this._prefetchGameKit();
    const reveal = () => {
      // 等两帧：确保 renderer 已经用补全后的标题插画画过至少一帧，再淡出启动幕
      requestAnimationFrame(() => requestAnimationFrame(() => {
        // hide() 内部加 .done 淡出、淡完 display:none，和标题开屏动画同时开始
        this._boot?.hide();
        // 启动幕刚开始淡出就开演：人物从右侧滑进来，标题与选项从左侧滑进来
        this._playTitleIntro();
      }));
    };
    // 主样式表（src/style.css）没到之前不许撤启动幕：撤掉首绘兜底又没样式，
    // 露出来的就是未排版的裸 DOM（1.6.41 弱网「紫屏 + 裸 HUD 文字」的根因）。
    // index.html 的 __hksAfterCss 会在样式表就绪（或已弹出错误面板）后回调。
    if (typeof window.__hksAfterCss === 'function') window.__hksAfterCss(reveal);
    else reveal();
  }

  /**
   * 后台预取进关模块。只在启动幕揭幕时触发一次。
   * 用 requestIdleCallback 让标题开屏动画的首帧先走，避免下载把它挤出去。
   */
  _prefetchGameKit() {
    if (this._kitPrefetchStarted) return;
    this._kitPrefetchStarted = true;
    const go = () => {
      loadGameKit().catch(() => { /* 失败留给进关时的 ensureGameKit 兜底 */ });
      loadGameCss();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 1200 });
    else setTimeout(go, 300);
  }

  /* ---------------- 标题开屏动画 ----------------
     标题曲 150 BPM（一拍 0.4s），所有节拍都压在拍点上：
       0.0s  人物从右侧屏外滑入，4 拍（1.6s）落位
       0.8s  标题从左屏外滑入，2 拍落位（正好和人物同时到位）
       1.0s  副标题跟着滑入
       1.2s  金线展开、选项区斜向扫光
       1.6s  起六行选项逐行斜向滑入，每行再迟半拍（0.2s），1.5 拍到位
       1.6s  内框角饰淡入
       1.8s  版本号与语言胶囊淡入
       2.0s  底部提示淡入
     开场前会用 audio.musicProgress 把整段挪到下一拍，人物第一步正好踩鼓点；
     DOM 部分交给 CSS（.overlay.title-mode.intro 触发，CSS 里用 --lead 补齐卡拍偏移），
     这里只管开关与画布计时；任意按键 / 点击会立刻摘掉 .intro，直接落到结束姿态。 */

  _playTitleIntro() {
    const ov = this.overlay;
    if (!ov || !ov.classList.contains('title-mode')) return;
    clearTimeout(this._titleIntroTimer);
    if (this._prefersReducedMotion()) {
      this._titleIntroOn = false;
      this._titleIntroT0 = 0;
      return;
    }
    const beat = 0.4; // 标题曲 150 BPM
    // 卡拍：等到下一个拍点再起步；已经踩在拍上（±30ms）就立刻开始
    let lead = 0;
    const elapsed = this.audio?.musicProgress?.elapsed;
    if (Number.isFinite(elapsed)) {
      const phase = ((elapsed % beat) + beat) % beat;
      if (phase >= 0.03 && beat - phase >= 0.03) lead = beat - phase;
    }
    this._titleIntroOn = true;
    this._titleIntroT0 = performance.now() + lead * 1000;
    // CSS 的每段延时都会加上 --lead，让标题与选项跟着人物一起踩同一个拍点
    ov.style.setProperty('--lead', lead.toFixed(3) + 's');
    // 每行一个序号：CSS 用它算出「越往下越靠左、越靠下、也越晚到」的斜向梯度
    this.menuButtons?.forEach((el, i) => el.style.setProperty('--ti', i));
    // 同名动画要先摘掉再强制重排，才肯从头播（回标题 / 重绘都靠这个重播）
    ov.classList.remove('intro');
    void ov.offsetWidth;
    ov.classList.add('intro');
    // 演完就把类摘掉：之后切语言等重绘不会再莫名其妙重播一遍入场
    this._titleIntroTimer = setTimeout(() => {
      this._titleIntroOn = false;
      this.overlay?.classList.remove('intro');
    }, lead * 1000 + 3600);
  }

  /** 按键或点击：跳过开屏，直接落到结束姿态 */
  _skipTitleIntro() {
    if (!this._titleIntroOn) return;
    this._titleIntroOn = false;
    this._titleIntroT0 = 0;
    clearTimeout(this._titleIntroTimer);
    // 摘掉 .intro 会让进行中的 CSS 动画立刻取消，元素直接回到静止时的最终姿态
    this.overlay?.classList.remove('intro');
  }

  _prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** 人物入场进度：0 = 右侧屏外，1 = 落位（没在播时恒为 1） */
  _titleIntroProgress() {
    const t0 = this._titleIntroT0;
    if (!t0 || !this._titleIntroOn) return 1;
    return Math.min(1, Math.max(0, (performance.now() - t0 - 40) / 1600));
  }

  /**
   * EXTRA 还锁着时的统一反馈。
   * 底部提示行在深色背景里只有 12px 半透明字，锁着的菜单项又不参与选中，
   * 玩家点了以后很容易以为什么都没发生——所以再叠一条平台 toast（桌面 / 手机都可见）。
   * 只报「尚未解锁」这一句状态：解锁方式（N / H / L 不续命通关）不写在提示里。
   */
  _extraLockedFeedback() {
    const msg = tr('EXTRA 尚未解锁');
    try { platform.showToast?.(msg, 3200); } catch (e) { /* toast 失败也不能挡住标题 */ }
    this.showTitle(msg);
  }

  /**
   * 回标题。
   * @param {string} [notice] 底部提示行（例如「已重置进度」），留空则不显示
   */
  showTitle(notice = '') {
    // 从子页 / 回忆室回到标题时重播开屏；标题页自身重绘（切语言、EXTRA 提示）不重播
    const replayIntro = this._bootDone
      && (this._page !== 'title' || this.overlay?.classList.contains('hidden'));
    // 先掐断上一局的残留：隐藏中的对话、关卡结算的延迟回调，
    // 否则回到标题后按 Enter 会被旧剧本吃掉，甚至把游戏重新拉进关卡。
    this._pendingTimeout = 0;
    this.dialogue?.stop?.();
    this.ending?.stop?.();
    // 还在等立绘开播的剧本也一并作废，否则它会在回标题后把画面抢走
    this._flowGen = (this._flowGen || 0) + 1;
    this.inExtra = false;
    this.state = 'menu';
    this.stage = null;
    this._captureAction = null;
    this.hudEl?.classList.add('hidden');
    this.hud.hideBossBar();
    this.hud.clearBanner();
    this.hud.reset();
    this.audio.playMusic?.('title');
    this.audio.setMusic?.(this.musicOn !== false);

    this._titleNotice = notice || '';

    const buttons = [
      { label: tr('开始游戏'), en: 'START', key: 'ENTER', cls: 'primary', onPick: () => this.showDifficultySelect() },
      this.unlockedExtra
        ? { label: tr('门内的祭典'), en: 'EXTRA', key: 'E', hotkey: 'KeyE', cls: 'extra', onPick: () => this.showExtraCharSelect() }
        : {
          // 锁着也给出反馈：保留 locked 视觉（样式表 pointer-events:none 由 feedback 覆盖），
          // 点击 / 按 E 只提示「EXTRA 尚未解锁」，不再展开解锁条件。noSelect 保证它不参与 ↑↓ 与 Enter 默认选中。
          label: tr('门内的祭典'), en: 'EXTRA', key: 'E', hotkey: 'KeyE',
          cls: 'extra locked', noSelect: true, feedback: true,
          onPick: () => this._extraLockedFeedback(),
        },
    ];
    buttons.push({ label: tr('操作说明'), en: 'MANUAL', key: '?', hotkey: 'Slash', onPick: () => this.showHelp() });
    buttons.push({ label: tr('音乐回忆室'), en: 'MUSIC ROOM', key: 'M', hotkey: 'KeyM', onPick: () => this.showMusicRoom() });
    buttons.push({ label: tr('设置'), en: 'SETTINGS', key: 'S', hotkey: 'KeyS', onPick: () => this._showSettings(this._settingsIndex || 0, 'title') });
    buttons.push({ label: tr('退出游戏'), en: 'QUIT', key: 'Q', hotkey: 'KeyQ', cls: 'danger', onPick: () => this.showQuit() });

    this._setPanel(
      '東方新紀行',
      '～ Chronicle of Gensokyo ～',
      buttons,
      notice || '',
      { title: true, page: 'title' }
    );
    if (replayIntro) this._playTitleIntro();
    else if (this.overlay?.classList.contains('intro')) {
      // 开屏途中切语言会重建按钮：补上序号，新按钮仍按斜向梯度入场
      this.menuButtons?.forEach((el, i) => el.style.setProperty('--ti', i));
    }
  }

  /* ---------------- 四语言 ----------------
     设计见 docs/SETTINGS_I18N_DESIGN.md：原文当键、语言包懒加载、缺译回退中文。 */

  /** 语言变了之后，把当前这一页按新语言重建（由 i18n 的 onChange 触发） */
  applyLang() {
    const page = this._page;
    if (page === 'settings') return this._showSettings(this._settingsIndex || 0, this._settingsOrigin);
    if (page === 'keybinds') return this.showKeybinds(this._keybindIndex || 0);
    if (page === 'paused') return this._showPause();
    if (page === 'title') return this.showTitle(this._titleNotice || '');
    // 其他页（难度 / 说明 / 回忆室等）P1 再逐个接线，目前只保持 <html lang> 与静态文案同步
  }

  /** 切到某种语言：加载语言包（首次可能 await）→ 写入设置 → 重建当前页 */
  async _setLanguage(tag) {
    if (!LANGS.some((l) => l.tag === tag) || tag === getLang()) return;
    this.audio.play?.('menu');
    await setLang(tag, { manual: true });
    // 手动选择要写进设置：_saveSettings 里只在 isManualLang() 时带 lang 字段
    this._saveSettings();
  }

  /** 语言行上 ← → / Enter：按 LANGS 顺序循环 */
  _cycleLang(dir = 1) {
    const list = LANGS;
    const i = Math.max(0, list.findIndex((l) => l.tag === getLang()));
    const next = list[(i + (dir > 0 ? 1 : list.length - 1)) % list.length];
    this._setLanguage(next.tag);
  }

  /**
   * 音乐回忆室：标题菜单进入，整屏接管。
   * 没通关也能进；没在旅途中听过的曲子显示成「？？？」，播放前会先询问一次。
   */
  async showMusicRoom() {
    // 回忆室模块 53KB，只有真的进去才下：菜单点进来时现拿，拿好前给个整屏提示
    if (!this.musicRoom) {
      kitLoading(true, '正在载入音乐回忆室…');
      try {
        const { MusicRoom } = await import('./game/musicRoom.js');
        this.musicRoom = new MusicRoom({
          audio: this.audio,
          input: this.input,
          host: this.uiEl,
          isHeard: (key) => this._heardSongs.has(key),
          markHeard: (key) => this._rememberSong(key),
          onExit: () => this._leaveMusicRoom(),
          onMute: () => this._toggleMute(),
        });
      } catch (err) {
        console.error('[musicRoom] 载入失败', err);
        kitLoading(true, '音乐回忆室载入失败，请检查网络后重试');
        setTimeout(() => kitLoading(false), 2200);
        return;
      }
      kitLoading(false);
    }
    this.state = 'menu';
    this._hidePanel();
    this.hudEl?.classList.add('hidden');
    this.musicRoom.show();
  }

  /** 从回忆室返回标题（MusicRoom 的 onExit） */
  _leaveMusicRoom() {
    this.showTitle();
  }

  showCharSelect() {
    this.state = 'menu';
    const art = (file) => new URL(`./art/gen/${file}`, import.meta.url).href;
    const cards = [
      {
        key: 'reimu', name: tr('博丽灵梦'), en: 'HAKUREI REIMU',
        note: tr('追踪御札 · 符卡「梦想封印」'), digit: '1',
        tone: '#ff92a8', glow: '255, 120, 145', img: art('reimu_title.webp'),
      },
      {
        key: 'marisa', name: tr('雾雨魔理沙'), en: 'KIRISAME MARISA',
        note: tr('扩散穿透 · 符卡「魔炮」'), digit: '2',
        tone: '#ffd45e', glow: '255, 205, 110', img: art('marisa_title.webp'),
      },
    ];

    const rows = cards.map((c) => ({
      cls: 'cc-card',
      tone: c.tone,
      glow: c.glow,
      hotkey: `Digit${c.digit}`,
      html:
        '<span class="cc-portrait"><img src="' + artUrl(c.img) + '" data-art-webp="' + c.img + '" alt="" decoding="async" draggable="false" /></span>' +
        '<span class="cc-key">' + c.digit + '</span>' +
        '<span class="cc-body">' +
          '<span class="cc-en">' + c.en + '</span>' +
          '<span class="cc-name">' + c.name + '</span>' +
          '<span class="cc-note">' + c.note + '</span>' +
        '</span>',
      onPick: () => { this.char = c.key; this.startGame(); },
    }));

    rows.push({
      label: tr('返回'), cls: 'back-ghost', key: 'ESC', back: true,
      onPick: () => this.showDifficultySelect(),
    });

    const diff = getDifficulty(this.difficulty);
    this._setPanel(tr('选择主角'), tr('当前难度：{d} · {n} 面', { d: tr(diff.cn), n: diff.stageCount }), rows,
      tr('← → 选择　ENTER 确认　ESC 返回难度'),
      // page 标记：数字键 1 / 2 在这一页是选人热键，秘籍输入要靠 _page 让位（见 _trySecretCode）
      { screen: true, en: 'SELECT HEROINE', grid: 'cc-grid', scene: 'shrine', page: 'charselect', select: this.char === 'marisa' ? 1 : 0 }
    );
    this._bindPortraitArt();
  }

  /**
   * EXTRA 选人页：门内的祭典用哪位主角。
   *
   * 与主线选人不同，EXTRA 不是「选谁都行」：每位主角要各自在 N / H / L 难度
   * 一次续命都不用地打通 1–6 面，才会在 EXTRA 里解锁。只解锁一位时另一位保持
   * 灰显 + 锁标，点它会给出解锁条件，玩家能直接看出「为什么只能用灵梦」。
   * @param {string} [notice] 底部提示（例如点了未解锁的主角）
   */
  showExtraCharSelect(notice = '') {
    if (!this.unlockedExtra) {
      this._extraLockedFeedback();
      return;
    }
    this.state = 'menu';
    const art = (file) => new URL(`./art/gen/${file}`, import.meta.url).href;
    const cards = [
      {
        key: 'reimu', name: tr('博丽灵梦'), en: 'HAKUREI REIMU',
        note: tr('追踪御札 · 符卡「梦想封印」'), digit: '1',
        tone: '#ff92a8', glow: '255, 120, 145', img: art('reimu_title.webp'),
      },
      {
        key: 'marisa', name: tr('雾雨魔理沙'), en: 'KIRISAME MARISA',
        note: tr('扩散穿透 · 符卡「魔炮」'), digit: '2',
        tone: '#ffd45e', glow: '255, 205, 110', img: art('marisa_title.webp'),
      },
    ];

    const rows = cards.map((c) => {
      const on = this._extraUnlockedFor(c.key);
      return {
        cls: 'cc-card' + (on ? '' : ' locked'),
        tone: c.tone,
        glow: c.glow,
        hotkey: on ? `Digit${c.digit}` : undefined,
        noSelect: !on,
        feedback: !on,
        html:
          (on ? '' : '<span class="cc-lock">' + tr('未解锁') + '</span>') +
          '<span class="cc-portrait"><img src="' + artUrl(c.img) + '" data-art-webp="' + c.img + '" alt="" decoding="async" draggable="false" /></span>' +
          '<span class="cc-key">' + c.digit + '</span>' +
          '<span class="cc-body">' +
            '<span class="cc-en">' + c.en + '</span>' +
            '<span class="cc-name">' + c.name + '</span>' +
            '<span class="cc-note">' + (on ? c.note : tr('不续命通关 1–6 面后解锁')) + '</span>' +
          '</span>',
        onPick: () => {
          if (on) { this.startExtra(c.key); return; }
          // 未解锁也要有反馈：告诉玩家这位主角差什么，而不是按了没反应
          this.showExtraCharSelect(
            tr('{name}还没有在 EXTRA 解锁：用她在 N / H / L 难度一次续命都不用地通过 1–6 面即可开启', { name: c.name })
          );
        },
      };
    });

    const onCount = this._extraCharKeys().length;
    rows.push({
      label: tr('返回'), cls: 'back-ghost', key: 'ESC', back: true,
      onPick: () => this.showTitle(),
    });

    this._setPanel(
      tr('EXTRA 选择主角'),
      tr('已解锁 {n} / {m} 位 · 门内的祭典', { n: onCount, m: CHAR_KEYS.length }),
      rows,
      notice || tr('EXTRA 的主角各自解锁：N / H / L 不续命通关 1–6 面，那位主角才能进入 EXTRA'),
      {
        screen: true, en: 'SELECT HEROINE · EXTRA', grid: 'cc-grid', scene: 'mansion',
        // 同主线选人页：EXTRA 选人的 1 / 2 也是热键，别被秘籍输入吃掉
        page: 'extrachar',
        select: Math.max(0, cards.findIndex((c) => this._extraUnlockedFor(c.key))),
      }
    );
    this._bindPortraitArt();
  }

  /** 某位主角是否已独立解锁 EXTRA */
  _extraUnlockedFor(key) {
    return !!(this.extraChars && this.extraChars[key]);
  }

  /** 已解锁 EXTRA 的主角 id（顺序固定：灵梦 → 魔理沙） */
  _extraCharKeys() {
    return CHAR_KEYS.filter((k) => this._extraUnlockedFor(k));
  }

  /**
   * 角色卡立绘兜底：首次加载失败（CDN 抖动 / 缓存损坏 / 被拦）时带 cache-bust 参数重试一次。
   * 以前这里用 CSS background-image，请求失败后没有任何重试路径，卡片就一直是空的，只能整页刷新。
   */
  _bindPortraitArt() {
    for (const img of document.querySelectorAll('.cc-portrait img')) {
      if (img.dataset.artBound === '1') continue;
      img.dataset.artBound = '1';
      img.addEventListener('error', () => {
        // AVIF 加载失败先静默退回 .webp（只回退一次），别把它当成真正的加载失败
        if (onArtError(img, img.dataset.artWebp)) return;
        if (img.dataset.artRetried === '1') {
          console.warn('[charselect] 立绘重试仍失败：', img.src);
          return;
        }
        img.dataset.artRetried = '1';
        console.warn('[charselect] 立绘加载失败，正在重试：', img.src);
        img.src = img.src.split('?')[0] + '?retry=' + Date.now();
      });
    }
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
        html:
          '<span class="dc-now">' + tr('当前难度') + '</span>' +
          '<span class="dc-key">' + key + '</span>' +
          '<span class="dc-glyph">' + key + '</span>' +
          '<span class="dc-cn">' + tr(d.cn) + '</span>' +
          '<span class="dc-en">' + d.label + '</span>',
        onPick: () => {
          this.difficulty = key;
          this._saveSettings();
          this.showCharSelect();
        },
      };
    });

    rows.push({
      label: tr('返回标题'),
      cls: 'back-ghost',
      key: 'ESC',
      back: true,
      onPick: () => this.showTitle(),
    });

    this._setPanel(
      tr('选择难度'),
      tr('按 E / N / H / L 选择　·　Enter 确认'),
      rows,
      tr('↑ ↓ ← → 选择　ENTER 确认　ESC 返回标题'),
      {
        screen: true,
        en: 'SELECT DIFFICULTY',
        grid: 'diff-grid',
        scene: 'mountain',
        select: Math.max(0, DIFFICULTY_KEYS.indexOf(this.difficulty)),
        page: 'difficulty',
      }
    );
  }

  showHelp() {
    this.state = 'menu';
    const K = (a) => this.input.labelFor(a);
    const cap = (a) => `<span class="keycap">${K(a)}</span>`;
    // WASD + 鼠标 方案里，射击/符卡改用鼠标键帽；键盘键位其实还能用，只是不再主推
    const mouseMode = this.input.scheme === 'wasd-mouse';
    const mcap = (label) => `<span class="keycap">${tr(label)}</span>`;
    const row = (group, label, ctl) => ({
      cls: 'info help-row',
      group,
      html: `<span class="set-label">${label}</span><span class="set-ctl">${ctl}</span>`,
    });

    const rows = [
      { ...row('help-move', tr('左右移动'), cap('left') + cap('right')), groupTitle: tr('移动'), glyph: '動' },
      row('help-move', tr('上下移动 / 选择'), cap('up') + cap('down')),
      row('help-move', tr('跳跃'), cap('jump') + '<span class="help-tip">' + tr('二段跳') + '</span>'),
      // label 别写太长：三栏面板里「低速移动 / 判定点」会折成两行（试玩反馈 P3-4）
      row('help-move', tr('低速 / 判定点'), cap('slow') + '<span class="help-tip">' + tr('按住显示判定点') + '</span>'),
      { ...row('help-act', tr('射击'), mouseMode ? mcap('鼠标左键') : cap('shoot')), groupTitle: tr('战斗'), glyph: '戰' },
      row('help-act', tr('向上射击'), cap('up') + '<span class="help-tip">' + tr('按住打空中') + '</span>'),
      row('help-act', tr('向下射击'), cap('down') + '<span class="help-tip">' + tr('按住打脚下') + '</span>'),
      // 冲刺只做高速位移，没有无敌帧（别照旧文案写「无敌」）；符卡消耗 POWER.castCost=48
      row('help-act', tr('冲刺'), cap('dash') + '<span class="help-tip">' + tr('可穿敌') + '</span>'),
      row('help-act', tr('符卡'), (mouseMode ? mcap('鼠标右键') : cap('cast')) +
        '<span class="help-tip">' + tr('耗 24 · 火力下降') + '</span>'),
      { ...row('help-sys', tr('暂停菜单'), cap('pause')), groupTitle: tr('系统'), glyph: '系' },
      row('help-sys', tr('界面'), '<span class="help-tip">' + tr('↑↓ 选择 · ENTER 确认') + '</span>'),
      row('help-sys', tr('静音'), cap('mute')),
      row('help-sys', tr('退出游戏'), cap('quit')),
      { label: tr('返回'), cls: 'set-foot-btn back-ghost', key: 'ESC', back: true, group: 'help-foot', onPick: () => this.showTitle() },
    ];

    this._setPanel(tr('操作说明'), tr('键位可在「设置 → 按键设置」中修改'),
      rows,
      tr('设置页内：K 按键设置　G 画质　F 帧率　M 静音　X 重置进度　ESC 返回'),
      { screen: true, en: 'HOW TO PLAY', page: 'help', grid: 'help-grid', scene: 'forest', select: rows.length - 1 }
    );
  }

  /**
   * 把当前操作方式落到 Input 与画布光标上。启动时（_loadSettings 之后）也要调一次。
   */
  _applyControlScheme() {
    this.controlScheme = this.controlScheme === 'wasd-mouse' ? 'wasd-mouse' : 'keys';
    this.input.setScheme(this.controlScheme);
    // WASD + 鼠标 方案里光标换成准星，提示「这里点得了」
    if (this.canvas) this.canvas.style.cursor = this.controlScheme === 'wasd-mouse' ? 'crosshair' : '';
  }

  /** 操作方式：键盘 ↔ WASD + 鼠标。即时生效并写入设置，不重开对局。 */
  _cycleControlScheme(dir = 1, origin = this._settingsOrigin) {
    const order = ['keys', 'wasd-mouse'];
    const at = Math.max(0, order.indexOf(this.controlScheme));
    this.controlScheme = order[(at + (dir >= 0 ? 1 : -1) + order.length) % order.length];
    this._applyControlScheme();
    this.audio.play?.('menu');
    this._saveSettings();
    this._showSettings(this.menuIndex, origin || 'title');
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

  /* ---------------- 画质档位（自动 / 高 / 低） ---------------- */

  /** 画质档位顺序：自动跟随硬件检测 → 高 → 低 */
  static QUALITIES = ['auto', 'high', 'low'];

  /** 软件光栅下 renderer.setQuality 会强制 low：「高」这一档不可选（perf.md §9 表第 1 行） */
  _qualityLockedLow() {
    return !!this.renderer?.softwareRaster;
  }

  /** 画质环切的下一个档位；软件光栅下跳过「高」，否则置灰了还能被键盘选到 */
  _nextQuality(dir) {
    const qs = Game.QUALITIES;
    const at = Math.max(0, qs.indexOf(this.quality || 'auto'));
    const step = dir > 0 ? 1 : qs.length - 1;
    let next = (at + step) % qs.length;
    if (this._qualityLockedLow()) {
      for (let i = 0; i < qs.length && qs[next] === 'high'; i++) next = (next + step) % qs.length;
    }
    return qs[next];
  }

  cycleQuality(fromSettings = false, index = this.menuIndex) {
    this._applyQuality(this._nextQuality(1));
    if (fromSettings) this._showSettings(index, this._settingsOrigin);
  }

  /** ←→ 调画质（dir = ±1） */
  _adjustQuality(dir) {
    this._applyQuality(this._nextQuality(dir));
  }

  /**
   * 写入画质档位并立即生效：渲染器重建 backing store / 后期档，
   * 随后把窗口上的诊断信息与本地存档同步。
   */
  _applyQuality(q) {
    this.quality = q === 'high' || q === 'low' ? q : 'auto';
    this.renderer.setQuality?.(this.quality);
    // 画质切档立即同步给当前关卡（低配纹理采样/混合层开关跟着变）
    if (this.stage) this.stage.lowSpec = !!this.renderer.lowSpec;
    this._saveSettings();
  }

  /* ============================================================
     流程控制
     ============================================================ */

  /** 当前难度下的主线关卡（E 只有前 5 面） */
  _mainStages() {
    return MAIN_STAGES().slice(0, getDifficulty(this.difficulty).stageCount);
  }

  /**
   * 把某主题的厚涂背景「加载 → decode → 合成层」预热到非关键窗口。
   *
   * 合成一张 1700×720 的背景层在软件光栅下要几十毫秒，原来会在进关首帧
   * （或 _prewarmStageArt 里）同步发生 —— 这是「进关顿一下」的主因之一。
   * warmStageBg 内部按 safe() 轮询：只有不在关卡进行中（或开场对白正开着）
   * 才真正合成，所以不会在弹幕里插卡顿。失败静默，不影响进关。
   */
  _warmStageBg(theme) {
    if (!theme || typeof warmStageBg !== 'function') return;
    try {
      warmStageBg(theme, () => this.state !== 'play' || !!(this.dialogue && this.dialogue.active));
    } catch (e) { /* 预热失败不影响游玩 */ }
  }

  /**
   * 音乐预热：把本关 + 下一面要用到的曲目模块提前拉下来。
   *
   * 曲库是懒加载的（首访只带 title 曲），按需加载 = 「等 playMusic 那一拍才发请求」，
   * 弱网下这一拍就是进关 / Boss 登场先静音好几秒。进关这一刻正好有开场对白、
   * 背景与立绘下载占着几秒，够曲库模块（gzip 后 5~30KB）串行下完。
   * 只报「本关 + 下一面」的曲目，不做全曲库预取：首访字节不变，弱网也不挤带宽。
   * @param {object|null} def 关卡定义
   * @param {number} index 关卡序号（EXTRA 传 0）
   * @param {boolean} isExtra
   */
  _warmStageMusic(def, index, isExtra) {
    const names = [];
    if (def) names.push(def.musicPre, def.musicMid, def.music);
    if (!isExtra) {
      const next = this._mainStages()[index + 1];
      if (next) names.push(next.musicPre, next.musicMid, next.music);
    }
    // 出错不影响进关：预热本来就是「能提前就提前」，失败下一拍还有按需加载兜着
    try { warmSongs(names); } catch (e) { /* ignore */ }
  }

  /**
   * 一关会用到的曲目名（道中 / 中 Boss / Boss）。
   * @param {object|null} def 关卡定义
   * @returns {string[]}
   */
  _stageSongs(def) {
    if (!def) return [];
    return [def.musicPre, def.musicMid, def.music].filter(Boolean);
  }

  /**
   * 进关前确保本关曲目模块已经到货。
   *
   * 启动幕门禁只保证第 1 面；第 2 面往后靠这里「进关前 await 本关曲目」。
   * 平时 _warmStageMusic 已经提前一面预热过，这里通常 0ms 直接过；
   * 4s 上限：宁可有几秒静音，也不能把进关卡住（audio 里还有流式 / 合成器兜底）。
   * @param {object|null} def 关卡定义
   * @returns {Promise<boolean>} 是否全部到货
   */
  async _ensureStageMusic(def) {
    const names = this._stageSongs(def).filter((n) => !isSongLoaded(n));
    if (!names.length) return true;
    try {
      await Promise.race([
        preloadSongs(names),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch (e) { /* preloadSongs 本身不会 reject，这里只是防御 */ }
    const missing = names.filter((n) => !isSongLoaded(n));
    if (missing.length && typeof console !== 'undefined') {
      console.warn('[music] 进关前曲目模块仍未就绪：', missing);
    }
    return missing.length === 0;
  }

  async startGame() {
    this._hidePanel();
    this.inExtra = false;
    this.carryPower = 24;
    this.continues = 0;
    this.levelIndex = 0;
    this.runLives = null;
    this.carryExtend = 0;
    this.hudEl?.classList.remove('hidden');
    this.hud.setMaxLives(this.lives, this.char);
    this.audio.unlock?.();
    this.audio.setMusic?.(this.musicOn !== false);
    // 第 1 面的道中曲 / Boss 曲现在就排进预热：开场对白这几秒足够模块到货，
    // 进关时 playMusic 直接命中曲库，不用现等（弱网下这就是几秒静音的区别）
    this._warmStageMusic(this._mainStages()[0], 0, false);

    // 进关才用得到的模块（stage 树 ~886KB + 剧情 ~122KB）这里是第一次用到：
    // 弱网首访要现下十几秒，await 之前先盖一张「载入中」，别让难度页按了 Enter 之后一动不动
    if (!(await ensureGameKit())) {
      kitLoading(false);
      this.showDifficultySelect();   // 网络失败退回难度页，玩家可以再试一次
      return;
    }
    kitLoading(false);

    // 开场对白这几秒正好让第 1 面的厚涂背景下载完，进关就不会先看到程序化天空；
    // 顺便把背景合成层也在对白期做好（warmStageBg 会等 safe 窗口，不抢进关首帧）
    prefetchStageBg(this._mainStages()[0]?.theme);
    this._warmStageBg(this._mainStages()[0]?.theme);

    const opening = openingFor(this.char);
    this._playDialogue(opening, () => this.startStage(0));
  }

  /**
   * 进入 EXTRA：门内的祭典。
   *
   * @param {string} [charKey] 选人页选中的主角；不传时沿用最近一次选择，再不行用第一位已解锁的。
   *   只有已解锁的主角能进（重试不经过这里，直接走 `_startExtraStage` 沿用当前角色）。
   */
  async startExtra(charKey) {
    if (!this.unlockedExtra) return;
    // 只认已解锁的主角：非法参数 / 未解锁角色一律回退，不让她们偷渡进门
    const unlocked = this._extraCharKeys();
    if (!unlocked.length) {
      this._extraLockedFeedback();
      return;
    }
    const pick = unlocked.includes(charKey)
      ? charKey
      : (unlocked.includes(this.extraChar) ? this.extraChar : unlocked[0]);
    this.extraChar = pick;
    this.char = pick;
    this._hidePanel();
    this.inExtra = true;
    // EXTRA 是零火力开局：道中边打边吃 P 点，中途 Boss 之前要自己攒出火力
    this.carryPower = 0;
    this.continues = 0;
    this.levelIndex = 0;
    this.runLives = null;
    this.carryExtend = 0;
    this.hudEl?.classList.remove('hidden');
    this.hud.setMaxLives(this.lives, this.char);
    this.audio.unlock?.();
    this.audio.setMusic?.(this.musicOn !== false);
    // EXTRA 的三首（ex_pre / ex_mid / extra）同样是曲库懒加载：开场对白期间先排进预热
    this._warmStageMusic(EXTRA_STAGE(), 0, true);
    // 进关才用得到的模块（stage 树 / 剧情）在这里第一次用到，弱网首访要现下
    if (!(await ensureGameKit())) {
      kitLoading(false);
      this.showExtraCharSelect?.();
      return;
    }
    kitLoading(false);
    // EXTRA 的厚涂背景也在开场对白期间先下好（EXTRA 只有一面，没有「上一面」可蹭）
    prefetchStageBg(EXTRA_STAGE()?.theme);
    this._warmStageBg(EXTRA_STAGE()?.theme);
    this._playDialogue(extraIntroFor(this.char), () => this._startExtraStage());
  }

  async _startExtraStage(opts = {}) {
    const def = EXTRA_STAGE();
    if (!def) { this.showTitle(); return; }
    if (!(await ensureGameKit())) { kitLoading(false); this.showTitle(); return; }
    // EXTRA 三道曲目（ex_pre / ex_mid / extra）在这里补齐；通常开场对白期间已预热完
    await this._ensureStageMusic(def);
    // 厚涂背景图（低清档）：EXTRA 没有「上一面」可蹭，开场对白期间没下完就在这里等
    await this._ensureStageBg(def);
    // 连环战从第几场开始：新挑战 = 0（咲夜一阶段），失败接关 = 当前场次
    this._extraChainIdx = opts.chainFrom == null
      ? 0
      : Math.max(0, Math.min(EXTRA_CHAIN.length - 1, opts.chainFrom | 0));
    this._createStage(def, 0, true, opts);
  }

  async startStage(index, opts) {
    const list = this._mainStages();
    if (!list.length) { this.showTitle(); return; }
    const def = list[index];
    if (!def) { this._onAllCleared(); return; }
    if (!(await ensureGameKit())) { kitLoading(false); this.showTitle(); return; }
    // 本关曲目模块（启动幕门禁只保第 1 面，后续面在这里补齐；通常已预热，0ms）
    await this._ensureStageMusic(def);
    // 厚涂背景图（低清档）：没到就先等，别进关后先画程序化天空再突变
    await this._ensureStageBg(def);
    this._createStage(def, index, false, opts);
  }

  /**
   * 进关前保一下这一面的厚涂背景（见 docs/BG_PROGRESSIVE.md）。
   *
   * 高清档单张 135–460KB，线上弱网实测单张要 10–40s；等到它才进关等于让玩家干等。
   * 所以 stage.js 里每张背景都配了一份 1280 宽的低清档（30–80KB，1–2s 到货），
   * 这里只等低清档：到货就进关，画面已经是厚涂图，高清档随后在空闲帧静默升档。
   * 已经预热过的关（标题页、上一面顺带下的）零等待、连遮罩都不会闪。
   * @param {object} def 关卡定义
   */
  async _ensureStageBg(def) {
    const theme = def && def.theme;
    if (!theme || typeof waitStageBg !== 'function') return;
    let ready = false;
    try { ready = !!(stageBgReady && stageBgReady(theme)); } catch (err) { ready = false; }
    if (ready) return;
    // 低清还没到：顺带把高清也排上（_bgEntry 内部幂等，重复调用无副作用）
    try { prefetchStageBg?.(theme); } catch (err) { /* 预取失败不影响进关 */ }
    kitLoading(true, '正在准备关卡画面…');
    try { await waitStageBg(theme, 9000); } catch (err) { /* 超时也照常进关 */ }
    kitLoading(false);
  }

  /**
   * 秘籍输入：依次按下 SECRET_EXTRA_CODE 的 16 位数字解锁 EXTRA。
   * 标题画面和「操作说明」页都认（秘籍就写在说明页上，玩家看到就能当场按）。
   *
   * 只吃纯数字键：带 Shift / Ctrl / Alt / Meta 的一律放过——Shift + 1–6 是隐藏跳关，
   * 别把玩家「想跳关」的按键吞进秘籍缓冲。改键录音、音乐回忆室整屏接管时也让位。
   * 选人页的 1 / 2 是主角热键、改键页数字键可能正被绑成动作，这两个页面不抢。
   * 按到数字以外的键就把缓冲清空：玩家会自然地「重新数一遍」，
   * 也避免一天里零散按到的数字凑成秘籍。
   * @returns {boolean} 是否已消费这次按键
   */
  _trySecretCode(e) {
    if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
    if (this._captureAction) return false;
    if (this.musicRoom?.visible) return false;
    // 只在菜单类页面（标题 / 难度 / 说明 / 设置）生效；游戏里、暂停里都不吃数字键
    if (this.state !== 'menu') return false;
    if (!this.overlay || this.overlay.classList.contains('hidden')) return false;
    const page = this._page;
    if (page === 'charselect' || page === 'extrachar' || page === 'keybinds') return false;
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
    if (!m) {
      if (this._secretBuf) this._secretBuf = '';
      return false;
    }
    // 数字键在菜单里本来没有功能，命中就吞掉（也挡住浏览器 / 输入法的默认行为）
    e.preventDefault();
    // 只留最后 16 位：输错一位也只要再补 16 位就能命中，不用回标题重来
    this._secretBuf = (this._secretBuf + m[1]).slice(-SECRET_EXTRA_CODE.length);
    if (this._secretBuf === SECRET_EXTRA_CODE) {
      this._secretBuf = '';
      this._onSecretCode();
    }
    return true;
  }

  /**
   * 秘籍命中：EXTRA 直接解锁。
   * 秘籍与「用哪位主角达成真结局」无关，所以两位主角一起开；写进 hks.progress.v1，
   * 和真结局解锁的记录等价（设置页「重置进度」会一起清掉）。
   * 反馈只给音效（需求：「输对有音效提示」）：不弹 toast、也不在说明页写秘籍卡，
   * 彩蛋不贴到明面上。解锁后按当前页重绘一次，标题画面的 EXTRA 立刻从灰显变可点。
   */
  _onSecretCode() {
    this.unlockedExtra = true;
    this.extraChars = { reimu: true, marisa: true };
    // 旧格式只认 extraChar：给个合法值，滚回旧版也不会读到不认识的主角
    if (!CHAR_KEYS.includes(this.extraChar)) {
      this.extraChar = CHAR_KEYS.includes(this.char) ? this.char : CHAR_KEYS[0];
    }
    this._saveProgress();
    this.audio?.play?.('secret');
    if (this._page === 'help') this.showHelp();
    else this.showTitle();
  }

  /**
   * 隐藏跳关的按键判定：按住 Shift 再按 1–6（主键盘 / 小键盘都认）。
   * 正在录音新键、或者音乐回忆室整屏接管时让位，别抢它们的按键。
   * @returns {boolean} 是否已消费这次按键
   */
  _tryStageWarp(e) {
    if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (!e.shiftKey || this._captureAction) return false;
    // 按键设置页里 Shift 本身可能正被绑成某个动作，别抢它的按键
    if (this.state === 'paused' && this._page === 'keybinds') return false;
    if (this.musicRoom?.visible) return false;
    const m = /^(?:Digit|Numpad)([1-6])$/.exec(e.code || '');
    if (!m) return false;
    e.preventDefault();
    this._warpToStage(Number(m[1]));
    return true;
  }

  /**
   * 隐藏跳关：从主线第 n 面（1–6）重新开一局。
   *
   * 按「从这一面重新开始」处理：残机回到设置值，续命次数、1UP 进度、
   * 上一关带过来的残机与火力全部清零；跳过开场与道中剧情，直接落进关卡。
   * 跳关本身不写任何存档，跳进去之后正常打完的结算规则与平时一致
   * （所以 EASY 也能跳第 6 面，但 EASY 没有真结局）。
   */
  async _warpToStage(n) {
    const all = MAIN_STAGES();
    if (!all.length) return;
    // 需求写的是 1–6；万一关卡表更短就夹到最后一关，绝不越界
    const index = Math.max(0, Math.min(all.length, 6, n) - 1);
    // 上一局的残留全部掐断：结局层、对话、等横幅的延迟回调、改键捕获。
    // _flowGen 让还在等立绘的旧剧本作废，免得它过几秒把画面抢回旧对话。
    this._pendingTimeout = 0;
    this._flowGen = (this._flowGen || 0) + 1;
    this.dialogue?.stop?.();
    this.ending?.stop?.();
    this._captureAction = null;
    this._hidePanel();
    this.inExtra = false;
    // 「重开一局」的开局状态：只保留当前难度与自机
    this.lives = Math.max(1, Math.min(4, Number(this.lives) || 3));
    this.continues = 0;
    this.runLives = null;
    this.carryExtend = 0;
    this.carryPower = 24;
    this.levelIndex = index;
    this.audio.unlock?.();
    if (!(await ensureGameKit())) { kitLoading(false); this.showTitle(); return; }
    kitLoading(false);
    // 跳关 / 重开：背景图同样要先保到能画，否则玩家一进关就看到程序化天空
    await this._ensureStageBg(all[index]);
    // skipIntro 只跳过开场对白；跳关是捷径，道中剧情也一并跳过（_skipBeats 会置 true）
    this._createStage(all[index], index, false, { skipIntro: true });
  }

  /**
   * EXTRA 连环战切曲：同一首战斗曲再次登场时接着上次的位置放。
   * 咲夜第一场放 ex_pre，蕾米莉亚登场换成 ex_mid 时把 ex_pre 停在第几秒记下来；
   * 咲夜第二场又要 ex_pre → 从记下的那一段接着放（紧跟第一次结束后的部分），不从头上重来。
   * 记账放在 this._chainMusicPos（曲目 key → 本圈内的秒数），重开本关 / 续关随 _createStage 重置。
   * @param {string} name 曲目 key
   */
  _playChainMusic(name) {
    if (!name) return;
    const pos = this._chainMusicPos || (this._chainMusicPos = new Map());
    // 记账要用「耳朵里在响的那首」：不静音换曲的等待期里 currentSong 已经翻成刚请求的
    // 新曲，但放着的还是旧曲，用 currentSong 会把账记到错的那首上。
    const cur = this.audio?.soundingSong ?? this.audio?.currentSong;
    const prog = this.audio?.musicProgress;
    // 换下去的曲目先记账；同一首（第一场刚开打就是它）不用记，也别把它掐断重播
    if (cur && cur !== name && prog) pos.set(cur, prog.elapsed);
    const from = pos.get(name);
    if (from == null) {
      this.audio.playMusic?.(name);
      return;
    }
    pos.delete(name); // 只用一次：之后这场再被切走会重新记账
    this.audio.playMusic?.(name, { from });
  }

  _createStage(def, index, isExtra, opts = {}) {
    this._hidePanel();
    // 离开标题页：释放立绘阴影烘焙层（一张约 1000×850 的离屏 canvas）
    this._titleBake = null;
    // 曲目模块最先排进预热队列：本关的（读档 / 重开 / 续关都绕过了 startGame 的预热）
    // 与下一面的。串行 + 空闲帧发起，不会跟下面的背景 / 立绘抢同一条连接。
    this._warmStageMusic(def, index, isExtra);
    // 厚涂背景现在就请求：本关的（万一还没预取）与下一面的（一关好几分钟，
    // 等玩家走到下一面时图早就下完了，5/6 面开场不会再先闪出程序化天空兜底）。
    prefetchStageBg(def.theme);
    if (!isExtra) prefetchStageBg(this._mainStages()[index + 1]?.theme);
    // 背景合成层预热：本关（读档/重开等绕过开场对白的路径）与下一面
    // 都在对白/暂停等安全窗口里做完，不压进关首帧
    this._warmStageBg(def.theme);
    if (!isExtra) this._warmStageBg(this._mainStages()[index + 1]?.theme);
    // 结局素材（约 960KB）在首屏是空闲预取、弱网下会被跳过：进最后两面时提前拉，
    // 等真正通关（还要再打一两面）时早下完了，结局开场不会空白。
    if (!isExtra && index >= 4) {
      // 结局模块 51KB 与素材（约 960KB）一起提前拉，真通关时早就下完了
      this._ensureEnding().then(() => this.ending?.preloadAssets?.()).catch(() => {});
    }
    // 本关 Boss 立绘（每张约 90KB）也在开场就拉：弱网首访时闸门会跳过全量预取，
    // 若等 Boss 登场才请求，boss.js 的「立绘未就绪暂缓出场」会白等最多 3 秒。
    if (def?.boss) ensureBossArt(def.boss);
    // 进关后没有菜单页在生效：清掉残留的 _page（否则从暂停/选人页重开后
    // _page 还停在 'paused'/'charselect'，后续靠 _page 判定的分支会读错上下文）
    this._page = '';
    this.state = 'play';
    this.levelIndex = index;
    // 本局残机：1UP 拿到的会一路带下去；没有就按设置页的开局值
    const startLives = this.runLives ?? this.lives;
    this.runLives = startLives;
    seedReset?.(); // ?seed= 时把关卡随机序列拨回起点，保证弹幕可复现
    // 本关音乐：配了 musicPre 的关卡（1–6 面 + EXTRA）先进道中曲，Boss 登场时再切 Boss 曲；
    // 其余关卡没有 musicPre，照旧一首到底。必须在 beginBoss() 之前登记——resumeBoss 会在
    // 建完 Stage 后立刻开战并同步触发 bossStart，那时就得知道本关该放哪首。
    this._levelMusic = {
      pre: def.musicPre || null,
      mid: def.musicMid || null,   // 中途 Boss 战斗曲：EXTRA 的雷米莉亚（三段式）、STAGE5 的妖梦
      boss: def.music || null,
      // STAGE5：妖梦击破后让 mid 曲自己放完，再 5 秒渐出（不循环），第二道中（呼吸区）静音
      midOnce: !!def.musicMidOnce,
    };
    // 本次进关还没切到 Boss 曲；resumeBoss 时下面的 beginBoss() 会同步把它翻成 true，
    // 稍后的播曲那里就不会把道中曲再盖上去。
    this._bossMusicSwitched = false;
    // EXTRA 连环战：每首战斗曲「上次放到第几秒」。换下去时记一笔，同一首再次登场
    // （咲夜第二场的 ex_pre）就接着那段放，不从头上重来；重开本关 / 续关都从零开始。
    this._chainMusicPos = new Map();
    this.stage = new Stage({
      def,
      index,
      // EXTRA 用选人页选中的主角（普通关卡用当前选择）
      char: (isExtra && this.extraChar) ? this.extraChar : this.char,
      lives: startLives,
      extendPts: this.carryExtend,
      // Extra 的强度在 Stage 内固定为 H；主线使用本局选择的难度
      difficulty: isExtra ? 'EX' : this.difficulty,
      power: this.carryPower,
      // 软件光栅低配：关卡据此降低纹理采样质量、跳过全屏混合层（perf.md §8）
      lowSpec: this.renderer.lowSpec,
      onEvent: (type, data) => this._onStageEvent(type, data),
    });
    // 切场景 / 开新关：前两帧先不做后期，把 bloom 的冷启动成本挪出可见卡顿
    this.renderer.skipPostFrames?.(2);
    // 关卡会在接下来几秒里喷新变体：空闲帧先把常见的 (型, 色, 尺寸) 烤好
    this._prewarmBulletSprites();
    // 场景美术（天空 / 视差 / 地形 / 环境光）的 sprite、gradient、pattern 全是懒缓存，
    // 首帧要一次性建 40+ 个离屏 canvas。先离屏跑一遍完整绘制，把这笔开销挪出可见卡顿。
    this._prewarmStageArt();
    this.stage.onEvent = (type, data) => this._onStageEvent(type, data);
    // 本关会出场的 AI 立绘（玩家 + Boss）现在就开始下载：
    // 等跑到 Boss 触发对话时已经就绪，不会出现等待态柔光。
    // Boss 战前对话还会有搭档登场，一并预热（幂等，已下载的角色立即返回）
    // 自机动作帧高优先级预载（幂等）：进关前抢带宽，避免开局只有柔光
    ensureCharArt((isExtra && this.extraChar) ? this.extraChar : this.char);
    const _partner = this.char === 'marisa' ? 'reimu' : 'marisa';
    // EXTRA 还会出场：咲夜（Boss 立绘 + 对话立绘）。美术文件另开对话补，这里先把路径排进预载。
    const _extraCast = isExtra ? ['sakuya', 'remilia'] : [];
    this.dialogue?.preparePortraits?.([this.char, _partner, def.boss, def.midboss?.key, ..._extraCast].filter(Boolean));
    // 道中剧情节点：重来 / 再战 / EXTRA 不再重复播放
    this._midShown = [false, false, false];
    this._skipBeats = !!(isExtra || opts.skipIntro || opts.resumeBoss);
    if (this.stage.camera) this.stage.camera.shakeEnabled = this.screenShake;
    // STG 关的玩家是另一个类（StgPlayer），这里统一补一次火力继承。
    // 注意：EXTRA 是「零火力开局」，0 是合法值，不能当成「没取到」再补满。
    if (this.stage.player && !this.stage.player.power && !isExtra) {
      this.stage.player.power = this.carryPower;
    }

    // EXTRA 的「再战」：从第 chainFrom 场直接接上（前面的场次算已清），不再有道中要跑
    if (isExtra && opts.chainFrom != null) {
      const from = Math.max(0, Math.min(EXTRA_CHAIN.length - 1, opts.chainFrom | 0));
      this._extraChainIdx = from;
      this.stage.resumeExtraChain(from);
      const rp = this.stage.player;
      if (rp) { rp.invuln = Math.max(rp.invuln || 0, 1.5); rp.vx = 0; rp.vy = 0; }
      // pendingBossKey 已由 resumeExtraChain 设成本场 Boss，直接开打（战前对白跳过）
      this.stage.beginBoss();
    }

    // 重挑战回 Boss：把玩家放回 Boss 前的检查点，Boss 直接登场，
    // 不用把整段跑图再走一遍（战前对白也跳过，因为已经看过）。
    // STAGE5 有两场 Boss：opts.bossKey / bossMid 指明重开的是哪一场（打妖梦时续命不能直接放幽幽子）；
    // 妖梦已击破（呼吸区里翻车）则没有 bossKey，只把 midbossDone 带过去，让玩家走完全程。
    if (!isExtra && opts.resumeBoss) {
      const p = this.stage.player;
      if (p && typeof p.reset === 'function') {
        const cp = opts.checkpoint || p.checkpoint;
        if (cp && Number.isFinite(cp.x) && Number.isFinite(cp.y)) p.reset(cp.x, cp.y);
        // reset() 会把 POWER 清零（Player.reset 的语义），但续命再战不能 0 火力：
        // 0 火力只有 Lv.1 单发、连符卡都放不出，等于把玩家直接推进死局。
        // 按「本关开局火力」补齐（和 1UP / 残机一起回到开局值），最多补到槽上限。
        p.power = Math.min(p.maxPower || 128, Math.max(0, this.carryPower || 0));
        p.setCheckpoint?.(p.x, p.y);
        p.vx = 0; p.vy = 0;
        p.invuln = Math.max(p.invuln || 0, 1.5);  // 出场给一小段无敌，别一复活就挨弹
        this.stage.midbossDone = !!opts.midbossDone;
        if (opts.bossKey) this.stage.beginBoss(opts.bossKey, { midboss: !!opts.bossMid });
        this.stage.camera?.snapTo?.(p.x + p.w / 2);
      }
    }

    // 结局 / 游戏结束时 _onGameOver 会隐藏整个 HUD；重新进关必须恢复显示，
    // 否则 POWER 条、残机、计时、Boss 血条在重开后全部不可见。
    this.hudEl?.classList.remove('hidden');
    this.hud.reset();
    this.hud.setMaxLives(startLives, this.char);
    this.hud.setStageName(isExtra ? 'EXTRA' : `STAGE ${index + 1}`, tr(def.title) || '');
    // STG 面（第 4 面）开场 1s 就有弹幕和道具列车，横幅再压 2.6s 会挡住视线；
    // 横向卷轴面缩到 1.6s，平台面保持原来的节奏。
    const bannerSec = this.stage?.mode === 'stg' ? 1.6 : 2.6;
    this.hud.banner(isExtra ? 'EXTRA STAGE' : `STAGE ${index + 1}`, tr(def.title) || '', bannerSec);
    // 五面：开场准备区（捡补给）与开场 / 道中对话先不放 BGM——连标题曲也一起停掉，
    // 等妖梦登场（bossStart）才起播；def.musicIntro === false 的关卡都这么进关。
    // 其余面照旧：进关就放道中曲（没有 musicPre 的面直接放 Boss 曲）。
    if (def.musicIntro === false) {
      if (!this._bossMusicSwitched) this.audio.silenceMusic?.();
    } else {
      if (!this._bossMusicSwitched) {
        this.audio.playMusic?.(this._levelMusic.pre || this._levelMusic.boss || 'stage1');
      }
      this.audio.setMusic?.(this.musicOn !== false);
    }
    this.audio.play?.('menu');

    // 关卡开场对话（Extra 的开场已经在外面播过了；重挑战本关时也跳过，直接继续）
    const script = (isExtra || opts.skipIntro)
      ? []
      : (stageStoryFor(this.char, STAGE_KEY(index)).intro || []);
    if (script.length) {
      this.state = 'dialogue';
      this._playDialogue(script, () => { this.state = 'play'; });
    } else {
      this.state = 'play';
    }
  }

  /**
   * 带节流的音效：射击命中一帧可能结算多发子弹，
   * 不节流会把合成器叠爆，听起来像电流噪声。
   */
  _sfx(name, gap = 0) {
    if (gap > 0) {
      const now = performance.now();
      if (now - (this._sfxAt?.[name] || 0) < gap) return;
      (this._sfxAt || (this._sfxAt = {}))[name] = now;
    }
    this.audio.play?.(name);
  }

  /**
   * 触觉反馈：统一走这里，手机用 navigator.vibrate，蓝牙手柄用马达。
   * 设置里的「手柄震动」只控手柄；手机震动跟系统静音/专注模式走，不做开关。
   */
  _haptic(kind = 'tap') {
    // TouchPad 只分轻/重两档：受伤、死亡给重震，其余给轻震。
    // 是否真的震由它内部读 hks.touch.v1 的 haptics 开关决定。
    this.pad?.haptic?.(kind === 'hurt' || kind === 'death' ? 'heavy' : 'light');
    const gp = this.gamepad;
    if (!gp || !gp.getVibration?.()) return;
    const table = {
      hurt: [0.75, 0.3, 120],
      death: [1, 0.6, 340],
      cast: [0.9, 0.4, 240],
      boss: [0.45, 0.15, 80],
      clear: [0.55, 0.2, 160],
    };
    const [strong, weak, ms] = table[kind] || table.boss;
    gp.rumble?.(strong, weak, ms);
  }

  _onStageEvent(type, data) {
    switch (type) {
      case 'hurt':
        this.audio.play?.('hurt');
        this._haptic('hurt');
        break;
      case 'death':
        this.audio.play?.('die');
        this._haptic('death');
        break;
      case 'checkpoint':
        this.audio.play?.('checkpoint');
        this.hud.banner('CHECKPOINT', '', 1.2);
        break;
      case 'coin':
        this._sfx('coin', 25);
        break;
      case 'shotHit':
        this._sfx('shotHit', 55);
        break;
      case 'enemyKill':
        this._sfx('enemyKill', 40);
        break;
      case 'bossHit':
        this._sfx('bossHit', 90);
        break;
      case 'bossStomp':
        this._sfx('bossStomp', 100);
        break;
      case 'bossStagger':
        this._sfx('bossStagger', 110);
        break;
      case 'bossDiveLand':
        this._sfx('bossDive', 110);
        break;
      case 'stomp':
        this._sfx('stomp', 45);
        break;
      case 'cast':
        // 符卡演出：全屏 cut-in + 专属音效（清屏与伤害结算在 Stage 内部完成）
        this.cutin.show(this.stage?.char || this.char);
        this._slowT = SLOW_TIME; // 世界短暂减速，cut-in 更有冲击力
        this._sfx('spell');
        this._haptic('cast');
        break;
      case 'extend':
        // 1UP 累计满 99 点（拾取 POWER / 擦弹 / 符卡奖励）→ 恢复 1 命
        this.hud.banner('1UP', tr('残机 +1'), 1.6);
        this._sfx('extend');
        break;
      case 'cardResult': {
        // 符卡限时结算（spec 3.5）：Stage 决定 reward —— 按时击破/坚持到点给 1/4P（满槽改残机），
        // 本卡无伤再追加 1/2P；超时仍只给 10 点。
        const reward = data && data.reward;
        const noHit = !!(data && data.noHit);
        if (reward === 'power') {
          if (noHit) {
            this.hud.banner(tr('无伤通过'), tr('火力 +3/4P'), 1.8);
          } else {
            this.hud.banner(tr('符卡击破'), tr('火力 +1/4P'), 1.4);
          }
          this._sfx('checkpoint'); // 复用存档点双音上行：小奖励，不盖过 Boss 主题曲
        } else if (reward === 'life') {
          // 满火力基础奖励残机：stage 侧走 _addExtend 已同步 emit 'extend'，
          // 1UP 横幅与音效交给上面的 case 'extend' 播一次即可；
          // 无伤时补一条合并提示（1UP + 额外 1/2P），覆盖同帧的 1UP 横幅。
          if (noHit) this.hud.banner(tr('无伤通过'), tr('1UP + 1/2P'), 1.8);
        } else if (reward === 'points') {
          this.hud.banner(tr('超时'), tr('奖励 +10 点'), 1.4);
          this._sfx('bossStagger'); // 复用破势警报：超时提示要能一下听出来
        }
        break;
      }
      case 'bossTrigger':
        // 事件带信息：EXTRA 靠 data.midboss 区分「中途 Boss」和「终盘 Boss」
        this._onBossTrigger(data);
        break;
      case 'bossStart':
        seedReset?.(); // 从开战这一帧把随机序列拨回起点，弹幕才有复现意义
        this.hud.banner(tr(data.name || ''), tr(data.title || ''), 2.0);
        // EXTRA 连环战：咲夜首次登场放一次全屏 cut-in（立绘 sakuya_title.webp，无符阵圆环，
        // 不放「BOSS」小字，只有名字与称号）。第二场（chainIndex 2）她是「再战」，不再重复登场演出。
        if (data && data.chain && data.key === 'sakuya' && (data.chainIndex | 0) === 0) {
          this.cutin.showBoss('sakuya');
        }
        this.audio.play?.('menu');
        // 道中曲 → Boss 曲：只有配了 musicPre 的关卡这么切，其余保持原样。
        // 中途 Boss 若配了 musicMid 就用它：EXTRA 的雷米莉亚（三段式），以及 STAGE5 的妖梦
        // （五面道中曲只在妖梦战里放，Boss 曲不在这里占掉，留给幽幽子）。
        // EXTRA 的姐姐认输后 midbossClear 切回道中曲；STAGE5 则让妖梦战曲放完再 5 秒渐出。
        // _bossMusicSwitched 在这里置 true，免得 _createStage 末尾把道中曲盖到这首上
        // （resumeBoss 会同步走到这里）。
        {
          const lm = this._levelMusic;
          if (this.inExtra && data.chain) {
            // 连环战：每场按 EXTRA_CHAIN.music 选曲（咲夜 ex_pre / 蕾米 ex_mid / 芙兰 extra）。
            // 同一首再次登场（咲夜第二场）不从头重播，接着第一次被换下去的位置继续。
            this._extraChainIdx = data.chainIndex | 0;
            const slot = data.music === 'mid' ? 'mid' : data.music === 'boss' ? 'boss' : 'pre';
            const wanted = (lm && lm[slot]) || (lm && lm.pre) || (lm && lm.boss);
            if (wanted) {
              this._bossMusicSwitched = true;
              this._playChainMusic(wanted);
            }
          } else if (lm && lm.mid && data.midboss) {
            this._bossMusicSwitched = true;
            this.audio.playMusic?.(lm.mid);
          } else if (lm && lm.pre && lm.boss && !this._bossMusicSwitched && !data.midboss) {
            this._bossMusicSwitched = true;
            this.audio.playMusic?.(lm.boss);
          }
        }
        break;
      case 'bossPhase':
        this.hud.banner('', tr(data.name || ''), 1.4);
        this._haptic('boss');
        break;
      case 'midbossClear':
        this.hud.banner('MID BOSS CLEAR', '', 1.4);
        this.audio.play?.('win');
        // EXTRA 的连环战不走这里（链调度另发 chainClear）；
        // STAGE5：妖梦击破 → 让妖梦战曲自己把这一轮放完，再 5 秒渐出收尾。
        if (this._levelMusic && this._levelMusic.midOnce) {
          // STAGE5：妖梦击破 → 让妖梦战曲自己把这一轮放完，再用 5 秒渐出收尾（不硬切、不循环），
          // 呼吸区安静下来；幽幽子登场时 bossStart 再切 Boss 曲。
          this._bossMusicSwitched = false;
          this.audio.playOutMusic?.();
        }
        // 中途 Boss 的战后对话：EXTRA 是姐姐认输的几句，平台关（STAGE5 妖梦）走 story.js
        // 的兜底键。脚本为空就什么都不排：横幅照播，道中照走，state 不动。
        {
          const st = this.stage;
          const script = this._midbossStory('post');
          if (st && !st.skipBossDialogue && script.length) {
            this._after(1.8, () => {
              if (this.stage !== st || this.state !== 'play') return;
              this._playDialogue(script, () => {
                if (this.stage === st) this.state = 'play';
              });
            });
          }
        }
        break;
      case 'chainClear': {
        // 连环战打完一场（还不是最后一场）：横幅 → 播战后台词 → 放下一场
        const st = this.stage;
        const idx = data.chainIndex | 0;
        this.hud.banner('MID BOSS CLEAR', '', 1.4);
        this.audio.play?.('win');
        this._sfx('checkpoint');
        const script = (st && !st.skipBossDialogue) ? this._extraChainScript('chainPost', idx) : [];
        const next = () => {
          if (!st || this.stage !== st) return;
          this.state = 'play';
          st.advanceChain();
        };
        if (script.length) {
          this._after(1.4, () => {
            if (!st || this.stage !== st || this.state !== 'play') return;
            this._playDialogue(script, next);
          });
        } else {
          this._after(1.2, next);
        }
        break;
      }
      case 'chainTimeout':
        // 限时到点：咲夜收手退场，剧情照常进下一场（没打完的卡不算击破、不给奖励）
        this.hud.banner(tr('时间到'), tr('她收手了'), 1.6);
        this._sfx('spell');
        break;
      case 'clear':
        this._haptic('clear');
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

  /**
   * 取连环 Boss Rush 的剧本：STORY.extra.chainPre / chainPost 是 [{reimu,marisa}, …]，
   * 按自机分路取；取不到就返回空数组（安全跳过对白，流程照走）。
   */
  _extraChainScript(which, i) {
    const arr = STORY.extra ? STORY.extra[which] : null;
    const item = Array.isArray(arr) ? arr[i | 0] : null;
    if (!item) return [];
    return item[this.char] || item.reimu || [];
  }

  _onBossTrigger(data) {
    if (!this.stage) return;
    this.state = 'dialogue';
    const stage = this.stage;
    let script;
    if (this.inExtra) {
      // 连环战：每一场都有自己的战前对白（STORY.extra.chainPre[i]，按自机分路）。
      // 再战（resumeExtraChain）时整段跳过，别把看过的台词重复一遍。
      if (stage.skipBossDialogue) script = [];
      else script = this._extraChainScript('chainPre', (data && data.chain) ? (data.chainIndex | 0) : 0);
    } else {
      // STAGE5 现在有两场 Boss：道中妖梦（midboss）有自己的登场对话，幽幽子仍走 preBoss。
      // 对话键路径由 story.js 决定，这里按候选顺序兜底，取不到就安全跳过（见 _midbossStory）。
      script = (data && data.midboss)
        ? this._midbossStory('pre')
        : (stageStoryFor(this.char, STAGE_KEY(this.levelIndex)).preBoss || []);
    }
    const start = () => {
      this.state = 'play';
      this.stage.beginBoss();
    };
    if (script.length) this._playDialogue(script, start);
    else start();
  }

  /**
   * 取「道中中途 Boss」的战前 / 战后对话（目前是 STAGE5 的妖梦）。
   *
   * 正式键由剧情侧确定：STORY.stages.<stage>.youmuPre / youmuPost，
   * 由 story.js 的 midbossPreFor() / midbossPostFor() 读取（缺失返回 []）。
   * 这里先走官方函数，再按候选顺序兜底；全部拿不到就返回空数组，
   * 调用方按「没有对话」处理 —— 绝不抛错。key 从关卡的 midboss 配置读，引擎里不写死。
   */
  _midbossStory(phase) {
    const key = this.stage?.midbossCfg?.key;
    if (!key) return [];
    const post = phase === 'post';
    const sk = STAGE_KEY(this.levelIndex);
    // 1) story.js 官方入口（STORY.stages.<stage>.<key>Pre / <key>Post）
    try {
      const official = post ? midbossPostFor(this.char, sk) : midbossPreFor(this.char, sk);
      if (Array.isArray(official) && official.length) return official;
    } catch { /* 剧情表缺失也不该拦住 Boss 战 */ }
    // 2) 兜底：路线层 → 关卡层 → 角色独立段（键名变了也不会哑火）
    const route = stageStoryFor(this.char, sk) || {};
    const top = (STORY.stages && STORY.stages[sk]) || STORY[sk] || {};
    const solo = STORY[key] || {};
    const names = post
      ? [`${key}Post`, 'midBossOut', `${key}Out`, `${key}After`]
      : [`${key}Pre`, 'midBoss', 'midBossPre', `${key}Intro`, `${key}Before`];
    for (const pool of [route, top, solo]) {
      for (const name of names) {
        const v = pool ? pool[name] : null;
        if (Array.isArray(v) && v.length) return v;
      }
    }
    // 3) 另一套单人写法：STORY.youmu = { before: [...], after: [...] }
    const alt = solo[post ? 'after' : 'before'] || solo[post ? 'post' : 'pre'];
    return Array.isArray(alt) && alt.length ? alt : [];
  }

  _onStageClear() {
    this.state = 'clear';
    // 火力继承：打完这关的 POWER 带进下一关
    if (this.stage?.player) {
      const p = this.stage.player;
      this.carryPower = Math.min(p.maxPower || 128, Math.round(p.power || 0));
      // 残机与 1UP 进度同样继承：这关靠 99 点换来的命、没满的进度都不能蒸发
      this.runLives = p.lives;
      this.carryExtend = this.stage.extendPts || 0;
    }
    this.hud.banner('STAGE CLEAR', '', 1.6);
    this.audio.play?.('win');

    const isExtra = this.inExtra;
    const post = isExtra
      ? extraPostFor(this.char)
      : (stageStoryFor(this.char, STAGE_KEY(this.levelIndex)).postBoss || []);

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
    const diff = getDifficulty(this.inExtra ? 'EX' : this.difficulty);

    // E 只有前 5 面：没有真结局；
    // N/H/L 打完第 6 面：一次续命都没用过，才是真结局（END 02 / END 04）；
    // 只有 END 02 / END 04 解锁 EXTRA；EXTRA 胜利进入 W1 / W2（失败不进结局）。
    const good = !this.inExtra && diff.unlockExtra && this.continues === 0;

    // 只有真结局解锁 EXTRA；解锁后不会因为后来打了遗憾结局又被锁回去。
    // 每位主角各自记一次：灵梦通关只开灵梦，魔理沙通关只开魔理沙，
    // 两位都通关后 EXTRA 才能任选（选人页在 `showExtraCharSelect`）。
    if (!this.inExtra && good) {
      const already = this._extraUnlockedFor(this.char);
      this.unlockedExtra = true;
      if (this.extraChars) this.extraChars[this.char] = true;
      // 记住「最近一次达成真结局的主角」：选人页默认高亮她，旧版本也读这个字段
      this.extraChar = this.char;
      if (!already) this._saveProgress();
    }

    this._playEnding(this.inExtra ? 'extra' : (good ? 'good' : 'bad'));
  }

  /**
   * 结局演出入口。
   * @param {'good'|'bad'|'extra'} mode 真结局 / 遗憾结局 / EXTRA 胜利
   */
  async _playEnding(mode) {
    // 先切状态：调用方（通关流程）不必等模块，也不会继续跑对局逻辑
    this.state = 'ending';
    this._pendingTimeout = 0;
    this._hidePanel();
    this.dialogue?.stop?.();
    this.hudEl?.classList.add('hidden');
    this.hud.hideBossBar();
    this.hud.clearBanner();
    // EXTRA 胜利（W1/W2）用《魔法少女達の百年祭》8-bit 柔和版，其余结局用原创 ending 曲
    this.audio.playMusic?.(mode === 'extra' ? 'endingW' : 'ending');
    this.audio.play?.('win');

    if (!this.ending) {
      kitLoading(true, '正在载入结局…');
      try {
        await this._ensureEnding();
      } catch (err) {
        console.error('[ending] 载入失败', err);
        kitLoading(true, '结局载入失败，请检查网络后重试');
        setTimeout(() => { kitLoading(false); this.showTitle(); }, 2200);
        return;
      }
      kitLoading(false);
    }

    const spec = endingFor(this.char, mode);
    if (!spec) { this.showTitle(); return; }
    this.ending.play(spec, {
      onFinish: () => this.showTitle(),
    });
  }

  _onGameOver() {
    this.state = 'gameover';
    this.hudEl?.classList.add('hidden');
    this.audio.playMusic?.('gameover');
    this.audio.play?.('die');
    // 已经打到 Boss 的话，重挑战回 Boss 场地而不是从头跑一遍
    const atBoss = this._canResumeBoss();
    // 真正在 Boss 战里（而不是「妖梦已击破、关底还没出」的道中状态）
    const midFight = !!this.stage?.bossStarted;
    // EXTRA 没有 platform Boss 检查点：_retryStage 会按时间轴回到 2:00 / 3:00 的检查点。
    // 这里用与 _retryStage 完全相同的判定算出恢复点，按钮文案必须跟实际接关位置一致，
    // 否则玩家看到「重新挑战本关」却直接从 2:00 雷米莉亚战开始，文案与行为不符。
    // 文案保持精简（检查点细节放在脚注），避免长标签在 960 宽下压到右侧 ENTER 键帽。
    const s = this.stage;
    // EXTRA 没有道中检查点：失败就从「当前这一场」重新开始（前面的场次保持已清）
    const extraIdx = this.inExtra
      ? Math.max(0, Math.min(EXTRA_CHAIN.length - 1, (this._extraChainIdx ?? s?.chainIdx ?? 0) | 0))
      : 0;
    const extraName = this.inExtra
      ? ({ sakuya: tr('十六夜咲夜'), remilia: tr('雷米莉亚'), flandre: tr('芙兰朵露') }[EXTRA_CHAIN[extraIdx].key] || '')
      : '';
    const retryLabel = this.inExtra
      ? tr('从第 {n} 战继续', { n: extraIdx + 1 })
      : (midFight ? tr('再战 Boss') : atBoss ? tr('从中途继续') : tr('重新挑战本关'));
    const extraFoot = this.inExtra
      ? tr('将从第 {n} 战（{name}）重新开始', { n: extraIdx + 1, name: extraName })
      : '';
    const canTrue = !this.inExtra && getDifficulty(this.difficulty).unlockExtra;
    const sub = this.inExtra
      ? tr('残机用尽 · EXTRA STAGE')
      : tr('残机用尽 · STAGE {n} · 续命 {c} 次', { n: this.levelIndex + 1, c: this.continues });
    const foot = this.inExtra
      ? tr('EXTRA 关失败不会触发结局') + '\n' + extraFoot
      : [
        atBoss
          ? (midFight
            ? tr('从 Boss 场地重新开始') + '\n' + tr('前面的进度不会丢失')
            : tr('从中途战后的检查点继续') + '\n' + tr('前面的进度不会丢失'))
          : '',
        canTrue
          ? tr('续命将无法进入真结局，也无法解锁 EXTRA') + '\n' + tr('想要 TRUE ENDING 与 EXTRA，请一次通过')
          : tr('EASY 难度没有真结局') + '\n' + tr('EXTRA 需要在 N/H/L 一次续命都不用地通关'),
      ].filter(Boolean).join('\n');
    this._setPanel(tr('游戏结束'), sub, [
      { label: retryLabel, key: 'ENTER', cls: 'primary', onPick: () => this._retryStage() },
      { label: tr('返回标题'), key: 'ESC', onPick: () => this.showTitle() },
    ], foot);
  }

  /**
   * 当前这关是否有可恢复的进度（重挑战不用从头跑）。
   * - 正在打关底 / 中途 Boss：bossStarted
   * - 中途 Boss 已击破、关底还没出来：midbossDone（呼吸区里翻车不该重打一遍妖梦）
   */
  _canResumeBoss() {
    const s = this.stage;
    if (!s || s.mode !== 'platform' || !s.player || this.inExtra) return false;
    return !!(s.bossStarted || (s.midbossDone && !s.finished));
  }

  _retryStage() {
    // 游戏结束后的重来 = 续命；暂停菜单里的「重新开始本关」不计入续命
    const fromGameOver = this.state === 'gameover';
    if (fromGameOver && !this.inExtra) this.continues += 1;
    this._hidePanel();
    this.lives = Math.max(1, this.lives);
    // 续命重来 = 重新挑战：1UP 进度和攒下的残机清零，回到设置页的开局值
    this.runLives = null;
    this.carryExtend = 0;
    if (this.inExtra) {
      // EXTRA 失败：从当前这一场重新开始（前面的场次算已清），
      // 不用把已经打过的 Boss 再打一遍（火力用 retryPower 兜底，不从零开始）。
      const s = this.stage;
      const idx = Math.max(0, Math.min(EXTRA_CHAIN.length - 1, (this._extraChainIdx ?? s?.chainIdx ?? 0) | 0));
      this._startExtraStage({ chainFrom: idx });
      return;
    }
    // 重挑战是「续命重来」，不是重开一局：跳过已看过的开场对白，直接回到操作
    else if (this._canResumeBoss()) {
      const s = this.stage;
      // 记下 Boss 前的检查点，重建关卡后把玩家放回去再开 Boss
      this.startStage(this.levelIndex, {
        skipIntro: true,
        resumeBoss: true,
        checkpoint: s.player.checkpoint || s._safeSpot || null,
        // 恢复点带上「正在打哪一场」：打妖梦时续命不能把幽幽子直接放出来；
        // 妖梦已击破（呼吸区里翻车）则没有 bossKey，只把 midbossDone 带过去。
        bossKey: s.bossStarted ? (s.boss?.key || null) : null,
        bossMid: !!s.bossStarted && !!s.bossMid,
        midbossDone: !!s.midbossDone,
      });
    } else this.startStage(this.levelIndex, { skipIntro: true });
  }

  /** 本关推进度 0..1（以 Boss 触发点为终点） */
  _storyProgress() {
    const s = this.stage;
    if (!s) return 0;
    if (s.mode === 'stg') {
      const total = s.stg?.bossTriggerScroll || 0;
      return total > 0 ? Math.max(0, Math.min(1, (s.stg.scroll || 0) / total)) : 0;
    }
    const p = s.player;
    const w = s.level?.w || 1;
    return Math.max(0, Math.min(1, ((p?.x || 0) + (p?.w || 0) / 2) / w));
  }

  /**
   * 道中剧情：推进到 22% / 48% / 72% 时插入一段对话。
   * 每一关每个节点只播一次；重来、再战、EXTRA 不重复。
   */
  _maybeMidDialogue() {
    const s = this.stage;
    if (!s || this._skipBeats || this.inExtra) return;
    if (this.state !== 'play') return;
    if (s.bossPending || s.bossStarted) return;
    const beats = stageStoryFor(this.char, STAGE_KEY(this.levelIndex)).mid || [];
    if (!beats.length) return;
    const thresholds = [0.22, 0.48, 0.72];
    const progress = this._storyProgress();
    for (let i = 0; i < Math.min(beats.length, thresholds.length); i++) {
      if (this._midShown[i] || progress < thresholds[i]) continue;
      this._midShown[i] = true;
      const script = beats[i];
      if (!script || !script.length) continue;
      // 先冻结关卡，避免立绘预加载期间玩家继续赶路、甚至一头撞进 Boss
      this.state = 'dialogue';
      this._playDialogue(script, () => {
        if (this.stage === s) this.state = 'play';
      });
      return;
    }
  }

  /** 用主循环时钟安排一次性回调，避免 setTimeout 与暂停状态脱节 */
  _after(delay, fn) {
    this._pendingTimeout = { t: delay, fn };
  }

  /**
   * 空输入：所有按键恒为「未按」。
   * 用于立绘预热等待期推进场景 —— 玩家这段时间不能操作，也不会误触。
   * 以真实 input 为原型创建，缺失的成员仍走原实现，避免 stage 调了别的接口而报错。
   */
  _idleInput() {
    if (!this.__idleInput) {
      const idle = Object.create(this.input);
      idle.down = () => false;
      idle.pressed = () => false;
      idle.released = () => false;
      idle.endFrame = () => {};
      Object.defineProperty(idle, 'axisX', { get: () => 0, configurable: true });
      Object.defineProperty(idle, 'axisY', { get: () => 0, configurable: true });
      // 模拟量也必须归零：否则立绘等待期玩家不能操作，
      // stage 读 input.moveX/moveY 却还能拿到真实摇杆值。
      Object.defineProperty(idle, 'moveX', { get: () => 0, configurable: true });
      Object.defineProperty(idle, 'moveY', { get: () => 0, configurable: true });
      this.__idleInput = idle;
    }
    return this.__idleInput;
  }

  /* ============================================================
     对话
     ============================================================ */

  _playDialogue(script, onEnd) {
    if (!script || !script.length) { onEnd?.(); return; }
    // 本轮剧本的代号：等立绘期间若被跳关 / 回标题打断，旧的 begin 直接作废，
    // 不会在几秒后把新画面抢回旧对话。
    const gen = this._flowGen = (this._flowGen || 0) + 1;
    const begin = () => {
      if (gen !== this._flowGen) return;
      this._preState = this.state;
      this.state = 'dialogue';
      this.dialogue.setPlayerChar(this.char);
      this.dialogue.play(script, {
        onEnd: () => {
          this.input.endFrame();
          onEnd?.();
        },
      });
    };

    // 对话出现前先把这一场会登场的 AI 立绘准备好（最多等 1.4s），
    // 避免立绘还没下载完时先画等待态柔光。
    const keys = [this.char];
    for (const line of script) {
      const who = line?.who || '';
      if (who === 'player') keys.push(this.char);
      else if (who === 'partner') keys.push(this.char === 'marisa' ? 'reimu' : 'marisa');
      else keys.push(who);
    }
    const ready = this.dialogue.preparePortraits?.([...new Set(keys)]);
    if (!ready) { begin(); return; }

    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      // 等待期玩家可能乱按过：开播前清一次，别让第一句台词被瞬间跳过
      this.input.endFrame();
      begin();
    };
    // 等待期画面仍在推进（见主循环的 'dialogue 未激活' 分支），
    // 超时只为了让对话不僵住；没等到图也只画柔光，绝不回退矢量人物。
    Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 1400))]).then(go, go);
  }

  /* ============================================================
     主循环
     ============================================================ */

  update(dt) {
    this.t += dt;

    // 输入设备维护：蓝牙手柄每逻辑帧轮询一次；虚拟手柄跟着状态机显示/隐藏。
    // 两者都不会产生 keydown，菜单导航要在这里主动消费边沿。
    this.gamepad?.poll?.();
    this._padMenuTick();
    this._syncTouchState();
    this._syncPlatformState();

    // 符卡演出的「时停感」：放 Bomb 后世界短暂减速，再在 0.34s 内平滑回升。
    // 用真实 dt 计衰减，避免减速把自己拖成更长的慢动作。
    if (this._slowT > 0) {
      this._slowT = Math.max(0, this._slowT - dt);
      const k = this._slowT / SLOW_TIME;
      this._timeScale = 1 - SLOW_AMOUNT * k * k;
      dt *= this._timeScale;
    } else {
      this._timeScale = 1;
    }

    // 音乐回忆室：播放进度 / 均衡器 / 状态灯（与游戏状态机无关，开着就刷新）
    this.musicRoom?.update(dt);

    // 延迟回调（暂停期间冻结：否则玩家一暂停就会把排在 1.8s 后的道中/关底对话吞掉）
    if (this._pendingTimeout && this.state !== 'paused') {
      this._pendingTimeout.t -= dt;
      if (this._pendingTimeout.t <= 0) {
        const fn = this._pendingTimeout.fn;
        this._pendingTimeout = 0;
        fn();
      }
    }

    // 结局演出：优先处理，避免按键漏到菜单 / 关卡
    if (this.state === 'ending') {
      if (!this.ending) { this.input.endFrame(); return; }   // 结局模块还在路上
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
      // 开场对话发生在 _createStage 之前，此时 HUD 里还是上一个画面残留的
      // 默认数值（POWER 0 / 64），看起来像状态没接上（试玩反馈 P2-4）。
      // 没有关卡就先把 HUD 藏起来，等关卡建好、数值真实时再露出来。
      if (!this.stage) {
        this.hudEl?.classList.add('hidden');
        this.hud.hideBossBar();
      } else {
        this.hud.update(this.stage.hudState, dt);
      }
      if (this.input.pressed('confirm') || this.input.pressed('jump') || this.input.pressed('shoot')) {
        this.dialogue.advance();
      }
      this.input.endFrame();
      return;
    }

    // 立绘预热等待期：_playDialogue 会把 state 切成 'dialogue' 再等 AI 立绘下载，
    // 此时 dialogue 尚未 play。若直接 return，画面（含 Boss 入场镜头）会整个静止，
    // 看起来像卡死。这里用空输入继续推进场景，让镜头 / 粒子 / 待机动画保持流动。
    if (this.state === 'dialogue' && !this.dialogue.active && this.stage) {
      this.stage.update(dt, this._idleInput());
      this.hud.update(this.stage.hudState, dt);
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
      // R 是高频误触键：先问一句，避免把本关的残机 / 1UP / 符卡积累一键清空
      if (this.input.pressed('restart')) { this._showRestartRun(); this.input.endFrame(); return; }
      if (this.input.pressed('mute')) this._toggleMute();
      this.stage.update(dt, this.input);
      this.hud.update(this.stage.hudState, dt);
      this._maybeMidDialogue();
    }

    this.input.endFrame();
  }

  _pause() {
    this._prevState = this.state;
    this._showPause();
  }

  /** 暂停菜单：继续 / 设置 / 重新开始本关 / 退出 */
  _showPause() {
    this.state = 'paused';
    this._captureAction = null;
    const left = this.stage?.player?.lives ?? this.lives;
    const diff = this.inExtra ? 'EXTRA' : this.difficulty;
    this._setPanel(tr('暂停'), tr('游戏已暂停 · 难度 {d} · 剩余残机 {n}', { d: diff, n: left }), [
      { label: tr('继续'), key: 'ESC', cls: 'primary', onPick: () => this._resume() },
      { label: tr('设置'), key: 'S', hotkey: 'KeyS', onPick: () => this._showSettings(this._settingsIndex || 0, 'pause') },
      // README 写的是「重开本关：暂停菜单 → 重新开始本关，或 R」，
      // 之前按钮丢了导致文案与实现对不上；这里补回来，R 也走同一条路径。
      { label: tr('重新开始本关'), key: 'R', hotkey: 'KeyR', cls: 'danger', onPick: () => this._showRestartRun() },
      { label: tr('退出到标题'), key: 'Q', hotkey: 'KeyQ', onPick: () => this._showQuitRun() },
    ], tr('↑ ↓ 选择　ENTER 确认　Esc 返回　重开会重置本关进度'), {
      page: 'paused',
      // 从设置/退出确认返回时保持光标，别每次都跳回「继续」（试玩反馈的一致性小项）
      select: this._pauseIndex || 0,
    });
  }

  /**
   * 暂停 → 退出到标题的二次确认。
   * 直接退出会丢掉本局进度，这里默认高亮「继续游戏」，防止手快误触。
   */
  _showQuitRun() {
    this.state = 'paused';
    this._captureAction = null;
    const diff = this.inExtra ? 'EXTRA' : this.difficulty;
    const level = this.inExtra ? 'EXTRA' : `STAGE ${this.levelIndex + 1}`;
    this._setPanel(
      tr('退出到标题'),
      tr('当前进度不会保存，确定离开本局？'),
      [
        // 取消退出后光标回到「继续游戏」，别停在危险项上（试玩反馈 P3-2）
        { label: tr('继续游戏'), key: 'ESC', back: true, onPick: () => { this._pauseIndex = 0; this._showPause(); } },
        { label: tr('退出到标题'), key: 'Q', hotkey: 'KeyQ', cls: 'danger', onPick: () => this.showTitle() },
      ],
      tr('{level} · 难度 {d} · 退出后需从标题重新开始', { level, d: diff }),
      { select: 0, page: 'paused' }
    );
  }

  /**
   * 暂停 → 重新开始本关的二次确认。
   * 和退出确认同理：R 在暂停菜单里太容易误触，而重开会清掉本关的
   * 残机、1UP 与符卡积累，用默认高亮的「继续游戏」兜一层。
   */
  _showRestartRun() {
    this.state = 'paused';
    this._captureAction = null;
    const diff = this.inExtra ? 'EXTRA' : this.difficulty;
    const level = this.inExtra ? 'EXTRA' : `STAGE ${this.levelIndex + 1}`;
    this._setPanel(
      tr('重新开始本关'),
      tr('本关进度、残机与 1UP 加成都会重置，确定重开？'),
      [
        { label: tr('继续游戏'), key: 'ESC', back: true, onPick: () => { this._pauseIndex = 0; this._showPause(); } },
        { label: tr('重新开始本关'), key: 'R', hotkey: 'KeyR', cls: 'danger', onPick: () => { this._hidePanel(); this._retryStage(); } },
      ],
      tr('{level} · 难度 {d} · 重开会回到本关起点', { level, d: diff }),
      { select: 0, page: 'paused' }
    );
  }

  /* ============================================================
     设置
     ============================================================ */

  /** 设置页：声音 / 画面 / 游戏 三张卡片，右侧是真正的控件而不是文字 */
  _showSettings(index = 0, origin = this._settingsOrigin || 'title') {
    this._settingsOrigin = origin === 'pause' ? 'pause' : 'title';
    this._settingsIndex = index;
    // 从标题进入设置时并没有对局，状态保持 'menu'（试玩反馈 P2-9：
    // 之前无条件写成 'paused'，状态机语义和对局状态不符）。
    this.state = this._settingsOrigin === 'pause' ? 'paused' : 'menu';
    this._captureAction = null;

    // —— 控件 HTML ——
    const sw = (on) => `<span class="sw${on ? ' on' : ''}"><i></i></span>`;
    const sld = (v) => {
      const p = Math.round(v * 100);
      return `<span class="sld"><span class="sld-track"><i style="width:${p}%"></i></span>` +
        `<span class="sld-num">${p}%</span></span>`;
    };
    // 残机：数字 + 四枚菱形魂珠。只给菱形时，用键盘调数值看不出现在到底是几条（试玩反馈 P2-5）。
    const pips = `<span class="sld-num">${this.lives}</span><span class="pips">${[0, 1, 2, 3]
      .map((i) => `<i class="${i < this.lives ? 'on' : ''}"></i>`).join('')}</span>`;
    const seg = `<span class="seg">${Game.FRAME_CAPS.map((cap) => {
      const txt = cap === 0 ? '∞' : String(cap);
      return `<b class="${cap === this.frameCap ? 'on' : ''}">${txt}</b>`;
    }).join('')}</span>`;
    // 画质：自动 / 高 / 低（分段控件，与帧率上限同一套皮肤）。
    // 软件光栅下 renderer.setQuality 会强制 low，「高」选了也不生效 —— 这里置灰不可选，
    // 并在下面「当前渲染」行补一句中文说明（perf.md §9 表第 1 行）。
    const qLocked = this._qualityLockedLow();
    const qSel = qLocked ? 'low' : (this.quality || 'auto');
    const qseg = `<span class="seg">${[['auto', tr('自动')], ['high', tr('高')], ['low', tr('低')]].map(([k, txt]) =>
      qLocked && k === 'high'
        ? `<b class="off" style="opacity:.35" title="${tr('软件光栅下不可用')}">${txt}</b>`
        : `<b class="${k === qSel ? 'on' : ''}">${txt}</b>`).join('')}</span>`;
    const qi = this.renderer?.qualityInfo?.() || { label: tr('自动'), detail: '' };
    // 触屏方案三分段：摇杆 / 手势 / 按键。选中态与 TouchPad 内部设置同源（hks.touch.v1）。
    const tset = this.pad?.getSettings?.() || { scheme: 'stick', haptics: true };
    const schemeSeg = `<span class="seg">${[['stick', tr('摇杆')], ['gesture', tr('手势')], ['keys', tr('按键')]]
      .map(([k, txt]) => `<b class="${k === tset.scheme ? 'on' : ''}">${txt}</b>`).join('')}</span>`;
    // 语言：四语分段控件。点哪格直接切哪门（监听在函数末尾统一挂），
    // ← → / Enter 则按顺序循环——鼠标党和键盘党都不别扭。
    const langSeg = `<span class="seg seg-lang" data-i18n-skip>${LANGS.map((l) =>
      `<b class="${l.tag === getLang() ? 'on' : ''}" data-lang="${l.tag}">${l.short}</b>`).join('')}</span>`;
    // 操作方式：键盘（默认）/ WASD + 鼠标（鼠标左键射击、右键符卡）。
    // 只换操作方式，不改键位表：两种方案的键盘键位完全一样。
    const cseg = `<span class="seg">${[['keys', tr('键盘')], ['wasd-mouse', tr('WASD + 鼠标')]]
      .map(([k, txt]) => `<b class="${k === (this.controlScheme || 'keys') ? 'on' : ''}">${txt}</b>`).join('')}</span>`;
    const row = (text, ctl, key) =>
      `<span class="set-label">${text}</span><span class="set-ctl">${ctl}</span>` +
      (key ? `<span class="k">${key}</span>` : '');

    const rows = [
      /* ---- 声音 ---- */
      {
        group: 'sound', groupTitle: tr('声音'), glyph: '音',
        cls: 'set-row', key: 'M', hotkey: 'KeyM',
        html: row(tr('全部静音'), sw(!!this.audio.muted), 'M'),
        onPick: (i) => {
          this._toggleMute();
          this._showSettings(i, origin);
        },
      },
      {
        group: 'sound',
        cls: 'set-row', key: 'B', hotkey: 'KeyB',
        html: row(tr('背景音乐'), sw(this.musicOn !== false), 'B'),
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
        html: row(tr('音乐音量'), sld(this.audio.musicVolume), '← → / ENTER'),
        adjust: (d) => this._adjustVolume('music', d, origin),
        onPick: () => this._adjustVolume('music', 1, origin),
      },
      {
        group: 'sound',
        cls: 'set-row', key: 'N', hotkey: 'KeyN',
        html: row(tr('音效'), sw(this.audio.sfxEnabled), 'N'),
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
        html: row(tr('音效音量'), sld(this.audio.sfxVolume), '← → / ENTER'),
        adjust: (d) => this._adjustVolume('sfx', d, origin),
        onPick: () => this._adjustVolume('sfx', 1, origin),
      },

      /* ---- 画面 ----
         第一行放语言：外语玩家一进设置页就能看到，不用先猜「语言」藏在哪个二级页。 */
      {
        group: 'display', groupTitle: tr('画面'), glyph: '畫',
        cls: 'set-row set-row-lang', key: 'L', hotkey: 'KeyL',
        html: row(tr('语言'), langSeg, 'L'),
        adjust: (d) => this._cycleLang(d),
        onPick: () => this._cycleLang(1),
      },
      {
        group: 'display',
        cls: 'set-row', key: 'G', hotkey: 'KeyG',
        html: row(tr('画质'), qseg, 'G'),
        adjust: (d) => {
          this._adjustQuality(d);
          this._showSettings(this.menuIndex, origin);
        },
        onPick: (i) => this.cycleQuality(true, i),
      },
      {
        // 只读行：让玩家看得见当前到底跑在什么渲染模式上（软件光栅 / GPU、实际 backing、辉光开关）；
        // 软件光栅下「高」不可选，行内补一句中文说明（不新增行，避免打乱面板的导航索引）
        group: 'display', cls: 'set-row info',
        html: row(tr('当前渲染'), `<span class="qinfo">${qi.label} · ${qi.detail}${qLocked ? ' · ' + tr('软件光栅下「高」画质不可用') : ''}</span>`, ''),
      },
      {
        group: 'display',
        cls: 'set-row', key: 'H', hotkey: 'KeyH',
        html: row(tr('屏幕震动'), sw(this.screenShake), 'H'),
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
        html: row(tr('帧率上限'), seg, 'F'),
        adjust: (d) => {
          this._adjustFrameCap(d);
          this._showSettings(this.menuIndex, origin);
        },
        onPick: (i) => this.cycleFrameCap(true, i),
      },

      /* ---- 操作与外设（触屏 / 蓝牙手柄专属；桌面无手柄时整组不出现） ---- */
      ...((this.input.touchDevice || (this.gamepad?.connected?.length > 0)) ? [
        // 手柄模块是插入后才按需加载的，没插手柄时 this.gamepad 仍是 null，这组就不出现
        ...(this.gamepad ? [{
          group: 'device', groupTitle: tr('操作'), glyph: '操',
          cls: 'set-row', key: 'J', hotkey: 'KeyJ',
          html: row(tr('手柄震动'), sw(!!this.gamepad.getVibration?.()), 'J'),
          onPick: (i) => {
            const on = !this.gamepad.getVibration?.();
            this.gamepad.setVibration?.(on);
            this.gamepad.rumble?.(0.3, 0.1, 60); // 开启时给一次轻震当确认
            this._saveSettings();
            this._showSettings(i, origin);
          },
        }, {
          group: 'device', cls: 'set-row info',
          html: row(tr('蓝牙手柄'), `<span class="qinfo">${this.gamepad.statusText?.() || tr('未连接')}</span>`, ''),
        }] : []),
      ] : []),
      ...(this.pad?.active ? [
        {
          group: 'device', cls: 'set-row', key: 'T', hotkey: 'KeyT',
          html: row(tr('触屏方案'), schemeSeg, 'T'),
          adjust: (d) => this._cyclePadScheme(d, origin),
          onPick: () => this._cyclePadScheme(1, origin),
        },
        {
          group: 'device', cls: 'set-row', key: 'V', hotkey: 'KeyV',
          html: row(tr('触屏震动'), sw(tset.haptics !== false), 'V'),
          onPick: (i) => {
            this.pad.setSetting?.('haptics', tset.haptics === false);
            this.pad.haptic?.('light');
            this._showSettings(i, origin);
          },
        },
        {
          group: 'device', cls: 'set-row set-row-link', key: 'Y', hotkey: 'KeyY',
          html: row(tr('自定义按键布局'), '<span class="chev">›</span>', 'Y'),
          onPick: () => this.pad.openLayoutEditor?.(),
        },
      ] : []),
      ...(this.platform?.env?.touch ? [
        {
          group: 'device', cls: 'set-row', key: 'O', hotkey: 'KeyO',
          html: row(tr('全屏'), sw(this.platform.isFullscreen()), 'O'),
          onPick: (i) => {
            this.platform.toggleFullscreen();
            // 全屏状态由浏览器异步更新，稍等再重画设置页，开关才不会停在旧状态
            setTimeout(() => this._showSettings(i, origin), 160);
          },
        },
        ...(this.platform.canInstall?.() || (this.platform.env.ios && !this.platform.isStandalone?.())
          ? [{
              group: 'device', cls: 'set-row set-row-link', key: 'I', hotkey: 'KeyI',
              html: row(tr('添加到桌面'), '<span class="chev">›</span>', 'I'),
              onPick: () => this.platform.promptInstall?.(),
            }]
          : []),
      ] : []),

      /* ---- 游戏 ---- */
      {
        group: 'game', groupTitle: tr('游戏'), glyph: '戲',
        cls: 'set-row', key: '← →',
        html: row(tr('残机'), pips, '← → / ENTER'),
        adjust: (d) => this._adjustLives(d, origin),
        onPick: () => this._adjustLives(1, origin),
      },
      // 操作方式：桌面端专属。触屏设备走虚拟手柄，没有鼠标可点，这行不出现。
      ...(this.input.touchDevice ? [] : [{
        group: 'game',
        cls: 'set-row', key: 'U', hotkey: 'KeyU',
        html: row(tr('操作方式'), cseg, 'U'),
        adjust: (d) => this._cycleControlScheme(d, origin),
        onPick: () => this._cycleControlScheme(1, origin),
      }]),
      {
        group: 'game',
        cls: 'set-row set-row-link', key: 'K', hotkey: 'KeyK',
        html: row(tr('按键设置'), '<span class="chev">›</span>', 'K'),
        onPick: (i) => {
          this._settingsKeyIndex = i;
          this.showKeybinds(0);
        },
      },
    ];

    // 「操作」组可能因为设备不同而少了首行（例如桌面只有手柄、没有触屏），
    // 组标题挂在第一行上，这里统一补一次，免得出现无标题的裸行。
    {
      const dev = rows.filter((r) => r.group === 'device');
      if (dev.length && !dev[0].groupTitle) {
        dev[0].groupTitle = tr('操作');
        dev[0].glyph = '操';
      }
    }

    /* ---- 底部：重开（仅暂停来源）/ 重置进度（仅标题来源）/ 返回 ---- */
    if (this._settingsOrigin === 'pause') {
      rows.push({
        group: 'foot', cls: 'set-foot-btn', key: 'R', hotkey: 'KeyR',
        html: `<span class="set-label">${tr('重新开始本关')}</span><span class="k">R</span>`,
        onPick: () => { this._hidePanel(); this._showRestartRun(); },
      });
    } else {
      rows.push({
        group: 'foot', cls: 'set-foot-btn set-foot-danger', key: 'X', hotkey: 'KeyX',
        html: `<span class="set-label">${tr('重置进度')}</span><span class="k">X</span>`,
        onPick: (i) => {
          this._settingsIndex = i;
          this.showResetProgress();
        },
      });
    }
    rows.push({
      group: 'foot', cls: 'set-foot-btn', key: 'ESC', back: true,
      html: `<span class="set-label">${origin === 'pause' ? tr('返回暂停菜单') : tr('返回标题')}</span>` +
        '<span class="k">ESC</span>',
      onPick: () => {
        this._settingsIndex = this.menuIndex;
        if (this._settingsOrigin === 'pause') this._showPause(); else this.showTitle();
      },
    });

    this._setPanel(tr('设置'), tr('即时生效，自动保存 · 残机从下一局开始生效'), rows,
      tr('↑ ↓ 选择　← → / ENTER 调整　ESC 返回'),
      { screen: true, en: 'OPTIONS', grid: 'set-grid', scene: 'moon', select: index, page: 'settings' }
    );

    // 语言分段控件：点哪格直接切哪门。必须 stopPropagation，
    // 否则点击会先冒泡到整行按钮，触发 onPick 再切一格。
    // 点方格先把选中行挪到语言行，键盘 ← → 才能接着循环。
    const langRowIdx = rows.findIndex((r) => r.cls && r.cls.includes('set-row-lang'));
    this.buttonsEl.querySelectorAll('.seg-lang [data-lang]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (langRowIdx >= 0) this._selectMenu(langRowIdx);
        this._setLanguage(b.dataset.lang);
      });
    });
  }

  /**
   * 重置进度（标题 → 设置页底部）：清掉 EXTRA 解锁，回到玩家尚未通关的状态。
   * 设置 / 键位各有独立的存储键，不会被这一步带走。
   */
  showResetProgress() {
    this.state = 'paused';
    this._captureAction = null;
    this._setPanel(
      tr('重置进度'),
      tr('清除通关记录？'),
      [
        {
          label: tr('确认重置'), en: 'RESET', key: 'ENTER', cls: 'primary danger',
          onPick: () => this._doResetProgress(),
        },
        {
          label: tr('取消'), key: 'ESC', back: true,
          onPick: () => this._showSettings(this._settingsIndex || 0, 'title'),
        },
      ],
      tr('重置后两位主角的 EXTRA 解锁都会清空；设置、键位与音乐回忆不受影响'),
      // 危险操作：初始高亮落在「取消」上，避免手快再按一次 Enter 就把档删了
      { noDirect: true, select: 1 }
    );
  }

  _doResetProgress() {
    this.unlockedExtra = false;
    this.extraChars = { reimu: false, marisa: false };
    this.extraChar = null;
    try {
      // 直接删掉进度键：下次启动读到的是「未通关」，EXTRA 保持封闭
      window.localStorage.removeItem(PROGRESS_KEY);
    } catch (e) {
      // 无 localStorage：内存里已经清掉，本局内同样保持封闭
    }
    this.audio.play?.('select');
    this.showTitle(tr('已重置进度 · EXTRA 重新封闭'));
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
      { id: 'kb-move', title: tr('移动'), glyph: '動', actions: ['left', 'right', 'up', 'down', 'slow'] },
      { id: 'kb-act', title: tr('战斗'), glyph: '戰', actions: ['jump', 'shoot', 'dash', 'cast'] },
      { id: 'kb-sys', title: tr('系统'), glyph: '系', actions: ['confirm', 'pause', 'restart', 'mute', 'quit'] },
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
          html: `<span class="set-label">${tr(def.label)}</span>` +
            `<span class="set-ctl">` +
            (capturing
              ? `<span class="kb-wait">${tr('按下新键…')}</span>`
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
      html: `<span class="set-label">${tr('恢复默认键位')}</span><span class="k">Del</span>`,
      onPick: () => {
        this.input.resetBinds();
        this._captureAction = null;
        this.audio.play?.('select');
        this.showKeybinds(this._keybindIndex, tr('已恢复默认键位'));
      },
    });
    rows.push({
      group: 'kb-foot', cls: 'set-foot-btn', key: 'ESC', back: true,
      html: `<span class="set-label">${tr('返回')}</span><span class="k">ESC</span>`,
      onPick: () => {
        this._captureAction = null;
        this._showSettings(this._settingsKeyIndex || 0, this._settingsOrigin);
      },
    });

    const wanted = ACTION_DEFS[this._keybindIndex]?.action;
    const select = rowAt.has(wanted) ? rowAt.get(wanted) : 0;

    this._setPanel(
      tr('按键设置'),
      note || (cap ? tr('按下要绑定的新键…') : tr('点选一项，再按下新键；重复的键会自动互换')),
      rows,
      cap ? tr('按任意键绑定　ESC 取消　Del 恢复默认') : tr('↑ ↓ 选择　ENTER 改键　Del 恢复默认　ESC 返回'),
      { screen: true, en: 'KEY CONFIG', grid: 'kb-grid', scene: 'mansion', noDirect: true, page: 'keybinds', select,
        // 方向键导航时把光标行写回 _keybindIndex：重进页面/切语言能停在同一行（QA-02）
        onSelect: (el) => {
          const a = el && el._spec && el._spec.action;
          if (!a) return;
          const idx = ACTION_DEFS.findIndex((x) => x.action === a);
          if (idx >= 0) this._keybindIndex = idx;
        } }
    );
  }

  /* ============================================================
     退出
     ============================================================ */

  showQuit() {
    this.state = 'paused';
    this._captureAction = null;
    this._setPanel(tr('退出游戏'), tr('要离开幻想乡吗？'), [
      { label: tr('退出到桌面'), en: 'QUIT', key: 'ENTER', cls: 'primary danger', onPick: () => this._quitGame() },
      { label: tr('返回标题'), key: 'ESC', back: true, onPick: () => this.showTitle() },
    ], tr('ENTER 确认　ESC 返回'), { noDirect: true });
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
    this._setPanel(tr('已退出游戏'), tr('感谢游玩　東方新紀行'), [
      {
        label: tr('返回标题'), key: 'ENTER', cls: 'primary', back: true,
        onPick: () => {
          this.audio.setMuted?.(this._settingsMuted);
          this.loop.start?.();
          this._applyAudio();
          this.showTitle();
        },
      },
    ], tr('现在可以关闭此页面了'), { noDirect: true });
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
      // 存档只接受白名单内的值：手改/损坏的存档不能把帧率锁死、把隐藏难度
      // 塞进主线、或写进不存在的自机 id
      if (Game.FRAME_CAPS.includes(s.frameCap)) this.frameCap = s.frameCap;
      if (typeof s.musicOn === 'boolean') this.musicOn = s.musicOn;
      if (typeof s.screenShake === 'boolean') this.screenShake = s.screenShake;
      if (s.quality === 'auto' || s.quality === 'high' || s.quality === 'low') this.quality = s.quality;
      if (Number.isFinite(s.lives)) this.lives = Math.max(1, Math.min(4, Math.round(s.lives)));
      if (typeof s.difficulty === 'string' && DIFFICULTY_KEYS.includes(s.difficulty)) this.difficulty = s.difficulty;
      if (typeof s.muted === 'boolean') this._settingsMuted = s.muted;
      if (Number.isFinite(s.musicVolume)) this._settingsMusicVolume = Math.max(0, Math.min(1, s.musicVolume));
      if (Number.isFinite(s.sfxVolume)) this._settingsSfxVolume = Math.max(0, Math.min(1, s.sfxVolume));
      if (typeof s.sfxOn === 'boolean') this._settingsSfxOn = s.sfxOn;
      if (s.controlScheme === 'keys' || s.controlScheme === 'wasd-mouse') this.controlScheme = s.controlScheme;
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
        quality: this.quality || 'auto',
        lives: Math.max(1, Math.min(4, this.lives)),
        difficulty: this.difficulty,
        muted: !!this.audio.muted,
        musicVolume: this.audio.musicVolume,
        sfxVolume: this.audio.sfxVolume,
        sfxOn: this.audio.sfxEnabled,
        // 操作方式：键鼠 / WASD + 鼠标（见 docs/MOUSE_CONTROLS.md）
        controlScheme: this.controlScheme === 'wasd-mouse' ? 'wasd-mouse' : 'keys',
        // 语言只在手选过之后才写：没手选就继续跟随浏览器语言，
        // 换一台设备打开还能自动匹配（见 docs/SETTINGS_I18N_DESIGN.md）。
        ...(isManualLang() ? { lang: getLang() } : {}),
      }));
    } catch (e) {
      // 忽略写入失败
    }
  }

  /**
   * Extra 解锁进度单独存一份，避免和音频设置互相覆盖。
   *
   * 存档格式 v2：`extraChars: ['reimu', 'marisa']` 按主角各自记录，EXTRA 选人页据此放行。
   * 旧存档迁移：
   * - 只有 `extraChar`（最近一次达成真结局的主角）：至少让她能用；另一位有没有通关过
   *   已经无从考证，按未解锁处理——用她再打一次真结局即可解锁，不会白丢两位的记录。
   * - 更老的存档只有 `extraUnlocked` 而没有角色（当时任意自机都能进 EXTRA）：
   *   两位都算解锁，不能把老玩家挡在门外。
   */
  _loadProgress() {
    try {
      const raw = window.localStorage.getItem(PROGRESS_KEY);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return;
      const valid = (k) => CHAR_KEYS.includes(k);
      const chars = { reimu: false, marisa: false };
      let legacy = false;
      // 新格式优先，但空数组不能把「extraUnlocked 为 true 但角色列表被写空」的半坏档
      // 直接读成「完全没解锁」——退回 extraChar / extraUnlocked 的旧口径救回来。
      const listed = Array.isArray(p.extraChars) ? p.extraChars.filter(valid) : [];
      if (listed.length) {
        listed.forEach((k) => { chars[k] = true; });
      } else if (valid(p.extraChar)) {
        chars[p.extraChar] = true;
        legacy = true;
      } else if (p.extraUnlocked) {
        CHAR_KEYS.forEach((k) => { chars[k] = true; });
        legacy = true;
      }
      this.extraChars = chars;
      this.unlockedExtra = !!(chars.reimu || chars.marisa);
      // 自机 id 白名单：损坏存档里的乱码会让立绘/技能表取不到数据
      this.extraChar = valid(p.extraChar) ? p.extraChar : null;
      // 老格式读进来就顺手写成新格式，之后每个主角的进度各自独立
      if (legacy) this._saveProgress();
    } catch (e) {
      // 无 localStorage / 数据损坏：保持未解锁
    }
  }

  _saveProgress() {
    try {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        extraUnlocked: !!this.unlockedExtra,
        // 旧版本只认这个字段：保留它，滚回旧版也不会把最近打通的那位弄丢
        extraChar: this.extraChar || null,
        // 新格式：哪位主角达成过真结局、能在 EXTRA 里选
        extraChars: this._extraCharKeys(),
      }));
    } catch (e) {
      // 忽略写入失败
    }
  }

  /* ---------------- 音乐回忆（听过的曲目） ---------------- */

  /**
   * 与通关进度分开存：重置进度只清 EXTRA 解锁，已经听过的旋律留在回忆室里。
   * 数据损坏或隐私模式下 localStorage 不可用时，安静地从空白档案开始。
   */
  _loadMusicMemory() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(MUSIC_KEY);
    } catch (e) {
      // 隐私模式：本次仍可从空白档案开始
      return;
    }
    if (!raw) {
      // 这个功能上线前就在玩的老存档没有听曲记录。
      // EXTRA 已解锁意味着 1~6 面的曲子都已经在关卡里响过，首次建立回忆档案时补记，
      // 免得老玩家打开音乐室看到满屏「？？？」。只在这一刻补一次，之后完全按实际播放记录。
      if (this.unlockedExtra) {
        // 标题曲每次开游戏都会响，1~6 面的曲子也随关卡播过；按这个证据补记
        ['title', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6'].forEach((k) => {
          this._heardSongs.add(k);
        });
        this._saveMusicMemory();
      }
      return;
    }
    try {
      const m = JSON.parse(raw);
      if (m && Array.isArray(m.heard)) {
        m.heard.forEach((k) => {
          if (typeof k === 'string' && k) this._heardSongs.add(k);
        });
      }
    } catch (e) {
      // 忽略损坏数据
    }
  }

  _saveMusicMemory() {
    try {
      window.localStorage.setItem(MUSIC_KEY, JSON.stringify({ heard: [...this._heardSongs] }));
    } catch (e) {
      // 忽略写入失败
    }
  }

  /** 某首曲子在旅途中第一次响起（标题 / 关卡 / Boss / 结局 / 试听）时记入回忆 */
  _rememberSong(key) {
    if (!key || this._heardSongs.has(key)) return;
    this._heardSongs.add(key);
    this._saveMusicMemory();
  }

  /**
   * 每次用户手势都会调用：第一次真正建好音频链路时才灌一次持久化设置。
   *
   * 这里必须只在「刚刚创建 AudioContext」时灌设置：
   * 之前每次按键都调 _applyAudio()，而 _settingsMuted 只是载入时的快照，
   * 于是玩家用 M 解除静音后，按下任何一个键都会按快照把静音打回去
   * （表现为「一按任意键游戏就没声音」，反过来静音也存不住）。
   */
  _unlockAudio() {
    const hadCtx = !!this.audio.ctx;
    this.audio.unlock?.();
    if (!hadCtx && this.audio.ctx) this._applyAudio();
  }

  /**
   * 空闲预热音频上下文：`new AudioContext()` 在部分环境要 50~120ms，
   * 提前到标题页空闲帧里付掉，第一个按键就不会卡一下。
   * 预建失败（隐私模式 / 老浏览器）就退回「等手势再建」，与以前行为一致。
   */
  _prewarmAudio() {
    if (this.audio.ctx) return;
    try {
      if (!this.audio.prewarm?.()) return;
      // 只灌音量 / 静音 / 音效开关这类总线设置：BGM 的启动仍留给第一次手势后的
      // unlock()，否则「听过的曲子」会在玩家还没真正听到时就被记进回忆室。
      this.audio.setMuted?.(this._settingsMuted);
      this.audio.setMusicVolume?.(this._settingsMusicVolume);
      this.audio.setSfxVolume?.(this._settingsSfxVolume);
      this.audio.setSfxEnabled?.(this._settingsSfxOn);
      if (typeof window !== 'undefined') {
        (window.__prewarmInfo || (window.__prewarmInfo = {})).audio = Math.round(performance.now());
      }
    } catch (e) {
      // 预热失败不影响运行
    }
  }

  /**
   * 空闲分片预热弹幕精灵：每轮最多 6ms、最多 10 轮（200 个常见变体，实测 <15ms 烤完）。
   * 单张精灵烘焙很便宜，但一帧里同时遇到几十个新变体就会顶出长帧。
   */
  _prewarmBulletSprites(rounds = 10, budgetMs = 6) {
    // bullets.js 属于进关才加载的 game kit：首屏阶段还没到，直接跳过（别把 started 置起来）
    if (typeof prewarmSpriteCache !== 'function') return;
    if (this._spritePrewarmStarted) return;
    this._spritePrewarmStarted = true;
    let left = rounds;
    const step = () => {
      let done = true;
      try {
        done = prewarmSpriteCache({ budgetMs }).done;
      } catch (e) {
        done = true;   // 预热失败不影响运行：绘制时还会惰性烘焙
      }
      if (done) {
        if (typeof window !== 'undefined') {
          (window.__prewarmInfo || (window.__prewarmInfo = {})).spritesDone = true;
        }
        return;
      }
      if (--left > 0) setTimeout(step, 16);
    };
    // 标题揭幕后 1.5s 再开始：首屏先把自己的活干完
    setTimeout(step, 1500);
  }

  /**
   * 进关前把场景美术的懒缓存烤热。
   *
   * 天空 / 视差 / 地形 / 环境光的 sprite、gradient、pattern 全是「用到才建」：
   * 实测首帧要一次性建 41 个离屏 canvas、106 个线性渐变、36 个径向渐变，
   * 而稳态每帧是 0 / 8 / 0 —— 这笔冷启动开销就是「进关瞬间画面冻结」的来源
   * （真实 GPU 下约 0.5 秒）。
   *
   * 这里用离屏 ctx 完整跑一遍 stage.draw：走的是和真实渲染完全相同的代码路径，
   * 所以无论当前主题走的是手绘背景还是程序化场景，该建的缓存都会被建好。
   * 同步执行是刻意的 —— 必须在第一帧渲染之前完成，否则等于没预热。
   * 开销落在「菜单消失 → 游戏画面出现」之间，玩家感知是加载而不是卡死。
   */
  _prewarmStageArt() {
    if (typeof document === 'undefined') return;
    const st = this.stage;
    if (!st || typeof st.draw !== 'function') return;
    // 同一关只预热一次：重复调用除了白跑一遍完整 draw 没有任何收益
    if (this._prewarmedStage === st) return;
    try {
      const wantW = this.renderer?.w || 1280;
      const wantH = this.renderer?.h || 720;
      // 复用离屏 canvas：原来每次进关都新建一块 1280×720，再交给 GC 回收
      let cv = this._prewarmCanvas;
      if (!cv) cv = this._prewarmCanvas = document.createElement('canvas');
      if (cv.width !== wantW || cv.height !== wantH) {
        cv.width = wantW;
        cv.height = wantH;
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t0 = now();
      st.draw(ctx, 1);
      const ms = now() - t0;
      this._prewarmedStage = st;
      if (typeof window !== 'undefined') {
        (window.__prewarmInfo || (window.__prewarmInfo = {})).stageArtMs = Math.round(ms);
      }
    } catch (e) {
      // 预热失败不影响游玩：最坏情况就是首帧照旧慢一点
    }
  }

  /** 全局静音开关：引擎状态为准，同时同步持久化快照 */
  _toggleMute() {
    this.audio.setMuted?.(!this.audio.muted);
    this._settingsMuted = !!this.audio.muted;
    this._saveSettings();
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
    // 暂停 / 结算 / 对话 / GameOver：模拟已经冻结，画布没必要跟着 rAF 全速重绘。
    // 这些画面在 1280x720 上仍要跑一遍背景 + 后处理 + 辉光，是纯浪费；
    // 限到约 30fps 既保留窗口缩放 / 淡入的响应，也把 GPU 占用和发热压下来。
    const frozen = this.state === 'paused'
      || this.state === 'clear'
      || this.state === 'gameover'
      || (this.state === 'dialogue' && this.dialogue?.active);
    if (frozen) {
      const now = performance.now();
      if (this._frozenRenderAt && now - this._frozenRenderAt < 32) return;
      this._frozenRenderAt = now;
    } else {
      this._frozenRenderAt = 0;
    }

    const ctx = this.renderer.begin('#05030a');

    if (this.state === 'ending') {
      this.ending?.draw(ctx);
      this.renderer.present(this.t);
      return;
    }

    if (this.stage && (this.state === 'play' || this.state === 'paused' || this.state === 'clear' || this.state === 'dialogue' || this.state === 'gameover')) {
      // 只有逻辑真的在推进时才做插值。暂停 / 对话 / 结算 / GameOver 时模拟已经冻结，
      // 但循环的 alpha 仍在 0→1 循环，继续插值会让角色在上一/当前步之间来回抖。
      // 立绘预热等待期（state=dialogue 但未激活）场景同样在推进，也要插值
      const a = (this.state === 'play' || this.state === 'dialogue') && !this.dialogue.active ? alpha : 1;
      this.stage.draw(ctx, a);
      if (this.state === 'paused') this._drawDim(ctx, 0.45);
      // 只在对话真的开播后压暗；立绘预热等待期保持正常亮度，避免「忽然变暗并静止」
      if (this.dialogue.active) this._drawDim(ctx, 0.35);
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

  /** 标题页三层压暗的预合成图（左侧暗部 + 左上径向暗角 + 底部压暗） */
  _buildTitleShade() {
    const c = document.createElement('canvas');
    c.width = VIEW_W; c.height = VIEW_H;
    const g = c.getContext('2d');
    if (!g) return c;

    let grd = g.createLinearGradient(0, 0, VIEW_W * 0.66, 0);
    grd.addColorStop(0, 'rgba(5, 3, 12, 0.88)');
    grd.addColorStop(0.3, 'rgba(5, 3, 12, 0.66)');
    grd.addColorStop(0.62, 'rgba(5, 3, 12, 0.24)');
    grd.addColorStop(1, 'rgba(5, 3, 12, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    grd = g.createRadialGradient(300, 170, 40, 300, 170, 540);
    grd.addColorStop(0, 'rgba(6, 4, 14, 0.55)');
    grd.addColorStop(0.55, 'rgba(6, 4, 14, 0.24)');
    grd.addColorStop(1, 'rgba(6, 4, 14, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    grd = g.createLinearGradient(0, VIEW_H * 0.66, 0, VIEW_H);
    grd.addColorStop(0, 'rgba(5, 3, 12, 0)');
    grd.addColorStop(1, 'rgba(5, 3, 12, 0.62)');
    g.fillStyle = grd;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    return c;
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

    /* 左侧压暗 / 左上暗角 / 底部压暗三层都是静态的：
       预合成成一张离屏图，每帧只 drawImage 一次，省掉 3 个渐变对象和 3 遍全屏混合。 */
    if (!this._titleShade) this._titleShade = this._buildTitleShade();
    ctx.drawImage(this._titleShade, 0, 0);

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

  /** 右侧站姿立绘：轻微呼吸 + 投影，主角随选择切换；标题开屏时从右侧屏外滑入 */
  _drawTitleCharacter(ctx) {
    const img = this._titleCharImgs?.[this.char] || this._titleCharImgs?.reimu;
    if (!img || !img.complete || !img.naturalWidth) return;

    const t = this.t;
    const breath = 1 + Math.sin(t * 1.15) * 0.0035;
    const h = 700 * breath;
    const w = img.naturalWidth * (h / img.naturalHeight);
    const cx = VIEW_W - 275;
    const bottom = VIEW_H + 42 + Math.sin(t * 0.9) * 3;

    // 开屏进度：0 = 完全在右侧屏外，1 = 落位。落位后 shift / tilt 为 0、alpha 为 1，
    // 画面与静止时逐像素一致，不会因为多包一层变换而跳一下。
    const ip = this._titleIntroProgress();
    const ease = 1 - Math.pow(1 - ip, 3);          // easeOutCubic：快速切入、慢慢停稳
    const shift = (1 - ease) * (w * 0.55 + 300);   // 起点在最右屏外，随立绘宽度自适应
    const tilt = (1 - ease) * 0.045;               // 入场时轻微侧倾，落位归零
    const alpha = Math.min(1, 0.12 + ip * 5);

    // 人物背后的柔光，和插画分离（入场时跟着人物一起走，落位后与原来重合）
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const gx = cx + shift * 0.8;
    const ag = ctx.createRadialGradient(gx, VIEW_H * 0.56, 30, gx, VIEW_H * 0.56, 380);
    ag.addColorStop(0, 'rgba(255, 128, 168, 0.10)');
    ag.addColorStop(0.55, 'rgba(255, 110, 160, 0.045)');
    ag.addColorStop(1, 'rgba(255, 100, 150, 0)');
    ctx.fillStyle = ag;
    ctx.fillRect(gx - 400, VIEW_H * 0.56 - 400, 800, 800);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx + shift, bottom);
    ctx.rotate(tilt);

    // 残影：入场高速段在右后方拖两道，落位前完全淡掉
    if (ip < 0.8) {
      for (let k = 1; k <= 2; k++) {
        ctx.globalAlpha = alpha * (0.16 / k) * (1 - ip / 0.8);
        ctx.drawImage(img, -w / 2 + k * (16 + w * 0.035), -h, w, h);
      }
      ctx.globalAlpha = alpha;
    }

    // 立绘 + 投影走预烘焙层：36px 高斯阴影只算一次，之后每帧只贴一张图。
    // 原来每帧都要给一张 700px 高的立绘做一次整幅高斯模糊（perf.md §2.2）；
    // 软件光栅下这一层本来就不画，走下面的兜底分支，观感逐像素不变。
    const bake = this._titleShadowBake();
    if (bake) {
      const k = breath;
      const dw = (bake.cv.width / bake.backing) * k;
      const dh = (bake.cv.height / bake.backing) * k;
      const padL = (bake.pad / bake.backing) * k;
      // 烘焙图里立绘下沿距底边 pad 个设备像素：贴图底边抬 padL 才能让脚底落回 y=0
      ctx.drawImage(bake.cv, -dw / 2, padL - dh, dw, dh);
    } else {
      if (!this.renderer.lowSpec) {
        ctx.shadowColor = 'rgba(4, 2, 10, 0.75)';
        ctx.shadowBlur = 36;
        ctx.shadowOffsetY = 8;
      }
      ctx.drawImage(img, -w / 2, -h, w, h);
    }
    ctx.restore();
  }

  /**
   * 标题立绘「立绘 + 投影」的预烘焙层。
   *
   * 把带 shadowBlur=36 的立绘一次性画进离屏 canvas，之后每帧只 drawImage。
   * key 里带上 backing：窗口尺寸 / dpr 变化、自动降档改了 backing、换角色
   * 都会让 key 不匹配，从而在这一帧重建一次。烘焙用的是和正式渲染相同的
   * setTransform(backing) 上下文，保证阴影的胖瘦和原来逐像素一致。
   * 软件光栅下返回 null（原来就不画这层阴影，不做无谓的离屏分配）。
   */
  _titleShadowBake() {
    if (this.renderer?.lowSpec) return null;
    const img = this._titleCharImgs?.[this.char] || this._titleCharImgs?.reimu;
    if (!img || !img.complete || !img.naturalWidth) return null;
    const backing = Math.max(0.25, this.renderer?.backing || 1);
    const key = `${this.char}|${img.naturalWidth}x${img.naturalHeight}|${backing.toFixed(3)}`;
    const old = this._titleBake;
    if (old && old.key === key) return old;
    try {
      const h0 = 700;                 // 立绘基准高（呼吸缩放每帧另乘）
      const w0 = h0 * (img.naturalWidth / img.naturalHeight);
      const pad = 72;                 // 逻辑像素：blur 36 + offsetY 8 的扩散余量
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((w0 + pad * 2) * backing);
      cv.height = Math.ceil((h0 + pad * 2) * backing);
      const c = cv.getContext('2d');
      if (!c) return null;
      c.setTransform(backing, 0, 0, backing, 0, 0);
      c.shadowColor = 'rgba(4, 2, 10, 0.75)';
      c.shadowBlur = 36;
      c.shadowOffsetY = 8;
      c.drawImage(img, pad, pad, w0, h0);
      this._titleBake = { key, cv, pad, backing };
      return this._titleBake;
    } catch (e) {
      return null;                    // 烘焙失败就退回原来的每帧阴影路径
    }
  }
}

/* ---------------- 启动 ---------------- */
// 先把语言定下来（可能懒加载一个语言包），再做任何 DOM 渲染，
// 免得标题页先闪一下中文再被替换。
await initLang();
const game = new Game();
window.__game = game;
// 首绘引导：主脚本真的起来了，放行 index.html 里被 hks-ready 挡住的 #ui
// （样式表没到之前这一步不会撤遮盖，由 index.html 的状态机兜住）
try {
  if (typeof window.__hksUiReady === 'function') window.__hksUiReady();
} catch (e) { /* 引导脚本缺失时不影响游戏本体 */ }
