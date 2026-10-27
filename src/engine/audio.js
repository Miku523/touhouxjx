/**
 * 东方新纪行 —— 程序化 8-bit 音频引擎（多曲目版）
 *
 * 实现要点：
 * 1. constructor 只做字段初始化，绝不创建 AudioContext（浏览器需要用户手势）；
 *    unlock() 时才创建/恢复 AudioContext，可重复调用，幂等。
 * 2. 音效与常规 BGM 都用 WebAudio 振荡器 + 增益包络实时合成，不依赖音频文件；
 *    例外：曲目数据里带 audio 字段时（如 EX 曲），改为 fetch + decodeAudioData 播放
 *    离线渲染好的音频文件并无缝循环，加载失败时自动回退到合成数据。
 * 3. BGM 曲库来自 ./songs/index.js（每关 BOSS 的原作主题曲 + 标题/失败/结局原创曲），
 *    每首曲子是「按秒排好的音符事件表」，前瞻调度、无缝循环。
 * 4. 曲目切换：playMusic(name) 立即换曲（先掐掉旧曲已排期的节点，不会叠音）；
 *    setMusic(false) 清定时器并停掉所有音乐节点；setMusic(true) 恢复当前曲目；
 *    playOutMusic() 让当前曲目把这一轮放完，再用 5 秒渐出（fadeOutMusic）收尾。
 * 5. 所有对外方法在 unlock() 之前调用都是安全 no-op，任何情况不抛错。
 * 6. 音量克制：单次音效峰值 ≤ 0.25，BGM 单声部峰值 ≤ 0.16。
 * 7. 总线：master ← sfxGain（音效）/ musicGain（BGM）。音量 0~1 与开关
 *    分别作用于两条总线，静音（muted）作用于 master，互不干扰。
 */

import { SONGS } from './songs/index.js';

/** MIDI 音高 → 频率（Hz） */
function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** 曲库里 wave 字段的索引表（调度时用整数，避免每帧查字符串） */
const WAVES = ['square', 'triangle', 'sawtooth', 'sine'];
/** 事件表里 kind = 4 表示打击乐 */
const DRUM_KIND = 4;
/**
 * 「放完渐出」默认时长（秒）：本轮循环放完后，音乐在这么多秒内线性淡出到静音，
 * 再真正停掉。避免半句被硬切，也给剧情收尾留出呼吸。
 */
const MUSIC_FADE_OUT = 5;

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} unlock 之前为 null */
    this.ctx = null;
    this._master = null;      // 总输出增益（静音用）
    this._sfxGain = null;     // 音效总线（音量 / 音效开关）
    this._musicGain = null;   // BGM 总线（比音效更轻）
    this._softIn = null;      // 柔和总线入口（低通 + 短回声），仅 soft 曲目走这条
    this._songSoft = false;   // 当前曲目是否走柔和总线（歌曲数据里的 soft 标记）
    this._warmIn = null;      // 温总线入口（轻低通 + 短反射），warm 曲目走这条去 8-bit 干声
    this._songWarm = false;   // 当前曲目是否走温总线（歌曲数据里的 warm 标记）
    this._noiseBuffer = null; // 白噪声 buffer，懒创建
    this._muted = false;
    this._sfxOn = true;       // 音效开关（菜单可关）
    this._sfxVolume = 1;      // 音效音量 0~1
    this._musicVolume = 0.8;  // 音乐音量 0~1
    this._musicOn = false;
    this._musicRequested = false; // unlock 之前 setMusic(true) 的意图，unlock 后补启动
    this._musicTimer = null;

    // ---- BGM 曲目状态 ----
    this._songName = 'title';  // 当前曲目 key
    this._song = null;         // 曲目原始数据
    this._events = null;       // 展平并按时间排序的事件表
    this._eventCache = new Map(); // key → events，切歌不用重排
    this._songStart = 0;       // 本轮循环的绝对起始时间（ctx 时间）
    this._startFrom = 0;       // 下一次起播的偏移（秒，本圈内）：见 playMusic(name, {from})
    this._songIdx = 0;         // 事件指针
    this._songLoop = 0;        // 已循环轮数
    this._songPlayOut = 0;     // >0 = 本轮放完后渐出（秒数），见 playOutMusic()
    this._fadeTimer = null;    // 渐出结束后的收尾定时器（fadeOutMusic 起）
    this._playOutTimer = null; // 音频文件曲目：等到循环点再开始渐出的定时器
    this._audioSrc = null;     // 音频文件曲目正在播的 BufferSource
    /**
     * 曲目真正开始发声时的回调（音乐回忆室用来记录「听过的曲子」）。
     * 音乐关着时 playMusic 只记住曲目、不触发；等 setMusic(true) 真正开播才触发。
     * @type {((name: string) => void)|null}
     */
    this.onSongStart = null;

    this._sfxVoices = new Set();   // 一次性音效节点，仅用于回收引用
    this._musicVoices = new Set(); // BGM 节点，切歌/关闭时强制 stop
    this._audioCache = new Map();  // 音频文件曲目：url → AudioBuffer（解码一次复用）
    this._audioPending = null;     // 正在加载的音频曲目 key，防重复请求
  }

  /* ------------------------------------------------------------------ */
  /* 对外接口                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 首次用户手势时调用：创建或恢复 AudioContext。幂等，可重复调用。
   */
  unlock() {
    // Node / 无浏览器环境下直接安全退出
    if (typeof window === 'undefined') return;
    if (!this._ensureCtx()) return;
    this._resumeCtx();
  }

  /**
   * 空闲预热：赶在第一个用户手势之前把 AudioContext 建好。
   *
   * `new AudioContext()` 在不少环境要 50~120ms（音频后端初始化），如果拖到
   * 「按 Enter 开始游戏」那一刻才建，玩家会看到一次明显卡顿。这里在标题页
   * 的空闲帧里先付掉这笔钱：浏览器允许无手势创建，只是上下文处于 suspended，
   * 真正发声仍要等手势里的 resume()。
   * @returns {boolean} 上下文是否就绪
   */
  prewarm() {
    return this._ensureCtx();
  }

  /** 建好 AudioContext 与各总线（幂等；失败静默，不影响游戏） */
  _ensureCtx() {
    if (typeof window === 'undefined') return false;
    if (this.ctx) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;

    try {
      this.ctx = new Ctor();
      // 总输出：1.0；静音时拉到 0
      this._master = this.ctx.createGain();
      this._master.gain.value = this._muted ? 0 : 1;
      this._master.connect(this.ctx.destination);
      // 音效总线：独立音量与开关
      this._sfxGain = this.ctx.createGain();
      this._sfxGain.gain.value = this._sfxOn ? this._sfxVolume : 0;
      this._sfxGain.connect(this._master);
      // BGM 总线：整体再压一层，确保 BGM 足够轻
      this._musicGain = this.ctx.createGain();
      this._musicGain.gain.value = 0.9 * this._musicVolume;
      this._musicGain.connect(this._master);
      this._buildSoftBus();
      this._buildWarmBus();
      this._ensureNoiseBuffer();
      return true;
    } catch (e) {
      // 音频初始化失败不应影响游戏
      this.ctx = null;
      return false;
    }
  }

  /** 浏览器策略下 ctx 可能处于 suspended，需要 resume；unlock 之前请求过音乐则补启动 */
  _resumeCtx() {
    try {
      // 浏览器策略下 ctx 可能处于 suspended，需要 resume
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      // unlock 之前请求过音乐，这里补启动
      if (this._musicRequested) this._startMusic();
    } catch (e) {
      // 恢复失败保持静音，不影响游戏
    }
  }

  /**
   * 播放一次性音效。
   * @param {string} name 音效名
   * @param {{volume?:number}} opts 可选：volume 为音量倍率
   */
  play(name, opts = {}) {
    if (!this.ctx || !this._master || !this._sfxGain || this._muted || !this._sfxOn) return;
    try {
      const t0 = this.ctx.currentTime + 0.005;
      const v = opts && typeof opts.volume === 'number' ? opts.volume : 1;
      const g = (p) => Math.max(0.0002, Math.min(0.25, p * v));
      this._playSfx(name, t0, g);
    } catch (e) {
      // 单个音效失败不影响整体
    }
  }

  /**
   * 切换 BGM 曲目。name 必须是曲库 key
   * （title / stage1..stage6 / extra / gameover / ending / endingW）。
   * 音乐开关关闭时只记住曲目，等 setMusic(true) 再播。
   *
   * opts.from：从这首曲子的第几秒开始放（缺省 0 = 从头）。EXTRA 连环战里同一首战斗曲
   * 再次登场时用它接着上次被换下去的位置，而不是从头重来。偏移按「本圈内」折算，
   * 循环曲目同样适用（超过曲长取模）。
   * @param {string} name
   * @param {{from?: number}} [opts]
   */
  playMusic(name, opts) {
    if (!name || typeof name !== 'string') return;
    // 同一首且正在播就直接返回；但正在渐出收尾时不算「在播」，要重新起播把它拉回来。
    // 已经在放的这首不用再摆位置：从中间接上的请求本来就该落在它现在的位置附近。
    if (this._songName === name && this._musicOn && this._fadeTimer === null) return;
    const from = opts && Number.isFinite(opts.from) ? Math.max(0, opts.from) : 0;
    this._songName = name;
    this._startFrom = from; // 起播偏移：_startMusic 消费一次就清掉
    // 正在播就立刻换：先掐掉旧曲排期的节点，避免两首叠在一起。
    // 「放完渐出」留下的尾音也归这里管——换曲时照样收干净。
    if (this._musicOn || this._musicVoices.size) this._stopMusic();
    if (this._musicRequested && this.ctx) this._startMusic();
  }

  /** 供外部查询当前曲目 key */
  get currentSong() {
    return this._songName;
  }

  /**
   * 当前 BGM 的播放进度（音乐回忆室的进度条用）。
   * 没有在发声（未 unlock / 音乐关 / 还没排期）时返回 null。
   * @returns {{elapsed: number, duration: number, loop: number}|null}
   */
  get musicProgress() {
    if (!this._musicOn || !this.ctx || !this._song) return null;
    const duration = Number(this._song.duration) || 0;
    if (!duration) return null;
    // _songStart 是第一次循环起点的 ctx 时间；进度按「本圈内」折算，循环次数单独给出
    const t = Math.max(0, this.ctx.currentTime - this._songStart);
    const loop = Math.floor(t / duration);
    return { elapsed: t - loop * duration, duration, loop };
  }

  /**
   * 让当前 BGM 把这一轮放完，再用 fadeSec 秒渐出到静音（默认 5 秒），最后完全停掉。
   *
   * 给剧情收尾用（五面：妖梦击破后让道中曲自己放完，渐出后再安静下来，等幽幽子登场再切曲）：
   *  - 合成曲目：先把本轮事件排完（不会半句硬切）；到本轮末尾开始渐出，
   *    渐出期间继续排下一轮的音符，听感是音乐自己淡下去，收尾后 _musicOn 置 false。
   *  - 音频文件曲目：等这一轮播到头再渐出，渐出结束后停掉循环。
   * 收尾后曲目名一并清空：这一曲算「放完了」，再开关 BGM 也不会从头重播。
   * 期间 playMusic / setMusic(false) 仍会立即切掉它。没有在播时是安全的空操作。
   * @param {number} [fadeSec] 渐出时长（秒）
   */
  playOutMusic(fadeSec = MUSIC_FADE_OUT) {
    if (!this._musicOn) return;
    const sec = Math.max(0.5, Number(fadeSec) || MUSIC_FADE_OUT);
    // 已经点过一次就等它走完，别叠定时器
    if (this._songPlayOut || this._fadeTimer !== null || this._playOutTimer !== null) return;
    const src = this._audioSrc;
    if (src) {
      // 音频文件曲目：算出这一轮还剩多久，到循环点再开始渐出（循环保持开着，渐出期间不断音）
      const dur = Number(src.buffer && src.buffer.duration) || 0;
      const now = this.ctx ? this.ctx.currentTime : 0;
      const elapsed = dur > 0 ? ((now - this._songStart) % dur + dur) % dur : 0;
      const remain = dur > 0 ? Math.max(0.05, dur - elapsed) : 0.05;
      this._playOutTimer = setTimeout(() => {
        this._playOutTimer = null;
        this.fadeOutMusic(sec);
      }, remain * 1000);
      return;
    }
    // 合成曲目：记下渐出时长，等 _musicTick 走到本轮末尾再开始渐出
    this._songPlayOut = sec;
  }

  /**
   * 让当前 BGM 在 sec 秒内线性淡出到静音，然后真正停掉。
   *
   * 渐出期间照常排下一轮音符（音乐是连贯淡下去，而不是残响突然没声）；
   * 结束后由 _stopMusic 收尾，并把 BGM 总线增益恢复，下一首照常音量。
   * 没有在播时是安全的空操作；重复调用只认第一次。
   * @param {number} [sec] 渐出时长（秒）
   */
  fadeOutMusic(sec = MUSIC_FADE_OUT) {
    if (!this.ctx || !this._musicGain || !this._musicOn) return;
    if (this._fadeTimer !== null) return;
    const s = Math.max(0.2, Number(sec) || MUSIC_FADE_OUT);
    this._songPlayOut = 0;
    if (this._playOutTimer !== null) {
      clearTimeout(this._playOutTimer);
      this._playOutTimer = null;
    }
    try {
      const now = this.ctx.currentTime;
      const g = this._musicGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.0001, now + s);
    } catch (e) {
      // 忽略
    }
    this._fadeTimer = setTimeout(() => {
      this._fadeTimer = null;
      // 这时总线已经收到听不见，stop 不会有断口；总线增益也在这里恢复。
      // 曲目名一并清掉：这一曲是「放完了」，不是「被暂停」——
      // 之后玩家再打开 BGM 也不该从头重播，而是安静等到下一场 Boss 的 playMusic。
      this._stopMusic();
      this._songName = null;
    }, (s + 0.08) * 1000);
  }

  /** 开/关 BGM。true 可重复调用而不会叠音。 */
  setMusic(on) {
    if (on) {
      this._musicRequested = true;
      if (!this.ctx) return; // 等 unlock
      this._startMusic();
    } else {
      this._musicRequested = false;
      this._stopMusic();
    }
  }

  /**
   * 静音进关：停掉当前 BGM（标题曲 / 上一关的曲子都一起），但不动音乐开关意图。
   *
   * 给「开场准备区与剧情全静音、等第一场 Boss 战才起播」的关卡用（五面）：
   * 曲目留空后，音乐开着时下一次 playMusic(name) 会直接起播；音乐关着就安静等 setMusic(true)。
   * 与 setMusic(false) 的区别是保留 _musicRequested，不会把用户的「音乐开」设置改成关。
   */
  silenceMusic() {
    this._songName = null;
    this._stopMusic();
  }

  /** 全局静音。 */
  setMuted(muted) {
    this._muted = !!muted;
    if (!this.ctx || !this._master) return;
    try {
      const now = this.ctx.currentTime;
      const g = this._master.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(this._muted ? 0 : 1, now + 0.02);
    } catch (e) {
      // 忽略
    }
  }

  /** 只读静音状态 */
  get muted() {
    return this._muted;
  }

  /* ---------------- 音量与开关（设置界面用） ---------------- */

  /** 设置音乐音量（0~1）。unlock 之前调用也会记住，unlock 后生效。 */
  setMusicVolume(v) {
    this._musicVolume = Math.max(0, Math.min(1, Number(v) || 0));
    this._rampBus(this._musicGain, 0.9 * this._musicVolume);
  }

  get musicVolume() {
    return this._musicVolume;
  }

  /** 设置音效音量（0~1）。 */
  setSfxVolume(v) {
    this._sfxVolume = Math.max(0, Math.min(1, Number(v) || 0));
    this._rampBus(this._sfxGain, this._sfxOn ? this._sfxVolume : 0);
  }

  get sfxVolume() {
    return this._sfxVolume;
  }

  /** 音效总开关（不影响 BGM 与静音）。 */
  setSfxEnabled(on) {
    this._sfxOn = !!on;
    this._rampBus(this._sfxGain, this._sfxOn ? this._sfxVolume : 0);
  }

  get sfxEnabled() {
    return this._sfxOn;
  }

  get musicOn() {
    return this._musicOn;
  }

  /** 20ms 线性过渡，避免拉音量出现爆音 */
  _rampBus(gainNode, value) {
    if (!gainNode || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const g = gainNode.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(Math.max(0, value), now + 0.02);
    } catch (e) {
      // 忽略
    }
  }

  /* ------------------------------------------------------------------ */
  /* 音效表                                                              */
  /* ------------------------------------------------------------------ */

  _playSfx(name, t0, g) {
    switch (name) {
      // 跳跃：方波上滑，干净利落
      case 'jump':
        this._tone('square', 220, 520, 0.06, g(0.18), t0);
        break;

      // 二段跳：更高更空灵，叠一个三角波泛音
      case 'doubleJump':
        this._tone('square', 660, 1100, 0.07, g(0.15), t0);
        this._tone('triangle', 330, 550, 0.07, g(0.05), t0);
        break;

      // 落地：低频下坠 + 短噪声
      case 'land':
        this._tone('triangle', 130, 70, 0.08, g(0.2), t0);
        this._noise(0.08, g(0.1), 'lowpass', 1300, 220, t0);
        break;

      // 金币：B5 → E6 两音琶音
      case 'coin':
        this._tone('square', 988, 988, 0.055, g(0.13), t0);
        this._tone('square', 1319, 1319, 0.06, g(0.13), t0 + 0.06);
        break;

      // 受伤：锯齿下滑 + 噪声
      case 'hurt':
        this._tone('sawtooth', 300, 90, 0.22, g(0.18), t0);
        this._noise(0.22, g(0.09), 'lowpass', 2200, 400, t0);
        break;

      // 踩敌人：噪声打击 + 方波下坠
      case 'stomp':
        this._noise(0.12, g(0.16), 'lowpass', 1800, 280, t0);
        this._tone('square', 200, 80, 0.12, g(0.18), t0);
        break;

      // 子弹命中：极短高频「叮」，一发一声，压得低免得连射刺耳
      case 'shotHit':
        this._tone('triangle', 1500, 1000, 0.04, g(0.07), t0);
        break;

      // 杂兵击杀：短促爆裂 pop，噪声 + 方波下坠
      case 'enemyKill':
        this._noise(0.08, g(0.1), 'lowpass', 2000, 300, t0);
        this._tone('square', 300, 120, 0.08, g(0.12), t0);
        break;

      // Boss 命中：更低沉厚实，命中大目标要有分量但不盖过 BGM
      case 'bossHit':
        this._tone('triangle', 160, 70, 0.09, g(0.16), t0);
        this._noise(0.06, g(0.08), 'lowpass', 900, 200, t0);
        break;

      // 死亡：长下滑，带一点悲壮尾音
      case 'die':
        this._tone('sawtooth', 300, 60, 0.5, g(0.2), t0);
        this._tone('triangle', 150, 40, 0.5, g(0.08), t0);
        this._noise(0.4, g(0.07), 'lowpass', 900, 120, t0);
        break;

      // 踩 Boss 头顶：比踩小怪更沉的撞击 + 短促上挑的「得手」音
      case 'bossStomp':
        this._noise(0.15, g(0.2), 'lowpass', 1500, 180, t0);
        this._tone('square', 170, 60, 0.16, g(0.2), t0);
        this._tone('triangle', 680, 980, 0.09, g(0.08), t0 + 0.02);
        break;

      // 破势打满：两下明亮警报，提示硬直窗口开启
      case 'bossStagger':
        this._tone('square', 880, 880, 0.07, g(0.12), t0);
        this._tone('square', 1320, 1320, 0.1, g(0.12), t0 + 0.09);
        this._noise(0.12, g(0.06), 'highpass', 3000, 6000, t0);
        break;

      // 俯冲砸地：低频轰 + 长噪声尾巴
      case 'bossDive':
        this._tone('sawtooth', 110, 40, 0.3, g(0.2), t0);
        this._noise(0.3, g(0.16), 'lowpass', 1200, 120, t0);
        break;

      // 胜利：C-E-G-C 四音上行
      case 'win': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < notes.length; i++) {
          const last = i === notes.length - 1;
          const dur = last ? 0.2 : 0.1;
          this._tone('square', notes[i], notes[i], dur, g(0.15), t0 + i * 0.11);
          this._tone('triangle', notes[i] / 2, notes[i] / 2, dur, g(0.05), t0 + i * 0.11);
        }
        break;
      }

      // 符卡：低频轰鸣 + 上扬扫频 + 明亮和弦，一耳朵听出「清屏大招」
      case 'spell': {
        this._noise(0.5, g(0.2), 'lowpass', 2600, 200, t0);
        this._tone('sawtooth', 90, 40, 0.5, g(0.16), t0);
        this._tone('triangle', 320, 1280, 0.32, g(0.09), t0 + 0.04);
        const chord = [523.25, 659.25, 783.99, 1046.5];
        for (let i = 0; i < chord.length; i++) {
          this._tone('square', chord[i], chord[i], 0.34, g(0.07), t0 + 0.06 + i * 0.02);
        }
        break;
      }

      // 1UP：五连上行琶音 + 高音闪光
      case 'extend': {
        const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
        for (let i = 0; i < notes.length; i++) {
          const last = i === notes.length - 1;
          this._tone('square', notes[i], notes[i], last ? 0.24 : 0.08, g(0.13), t0 + i * 0.075);
          this._tone('triangle', notes[i] * 2, notes[i] * 2, last ? 0.24 : 0.08, g(0.04), t0 + i * 0.075);
        }
        this._noise(0.18, g(0.05), 'highpass', 4000, 8000, t0 + 0.01);
        break;
      }

      // 存档点：784 → 1046 两音上行
      case 'checkpoint':
        this._tone('square', 784, 784, 0.09, g(0.13), t0);
        this._tone('square', 1046, 1046, 0.12, g(0.13), t0 + 0.09);
        break;

      // 冲刺：噪声过带通扫频，像气流
      case 'dash':
        this._noise(0.09, g(0.14), 'bandpass', 400, 3000, t0, 2.2);
        this._tone('square', 900, 300, 0.06, g(0.08), t0);
        break;

      // 菜单：极短两音
      case 'menu':
        this._tone('square', 523, 523, 0.04, g(0.12), t0);
        this._tone('square', 784, 784, 0.04, g(0.12), t0 + 0.045);
        break;

      // 选择/确认：极短两音，更高更亮
      case 'select':
        this._tone('square', 880, 880, 0.04, g(0.14), t0);
        this._tone('square', 1174, 1174, 0.05, g(0.14), t0 + 0.045);
        break;

      // 弹簧：快速上滑，带回弹感
      case 'bounce':
        this._tone('triangle', 400, 900, 0.1, g(0.18), t0);
        this._tone('square', 200, 450, 0.1, g(0.06), t0);
        break;

      default:
        // 未知音效名安静忽略，绝不抛错
        break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 合成基础件                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * 单振荡器 + 增益包络。
   * @param {string} type square / triangle / sawtooth / sine
   * @param {number} f0 起始频率
   * @param {number} f1 结束频率（等于 f0 时不扫频）
   * @param {number} dur 时长（秒）
   * @param {number} peak 峰值增益
   * @param {number} when 绝对开始时间（ctx.currentTime 基准）
   * @param {boolean} music 是否走 BGM 总线
   */
  _tone(type, f0, f1, dur, peak, when, music = false) {
    const ctx = this.ctx;
    const dest = music ? this._musicOut() : this._sfxGain;
    if (!ctx || !dest) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(0.001, f0), when);
    if (f1 && f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, f1), when + dur);
    }

    // 起音 2~5ms 避免爆音，然后指数衰减
    const attack = Math.min(0.004, dur * 0.4);
    const peakSafe = Math.max(0.0002, peak);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peakSafe, when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.03);
    this._track(osc, music);
  }

  /**
   * 白噪声打击 / 扫频。
   * @param {number} dur 时长
   * @param {number} peak 峰值增益
   * @param {string} filterType lowpass / bandpass / highpass
   * @param {number} f0 滤波起始频率
   * @param {number} f1 滤波结束频率
   * @param {number} when 绝对开始时间
   * @param {number} q 滤波器 Q
   * @param {boolean} music 是否走 BGM 总线
   */
  _noise(dur, peak, filterType, f0, f1, when, q = 1, music = false) {
    const ctx = this.ctx;
    const dest = music ? this._musicOut() : this._sfxGain;
    if (!ctx || !dest) return;
    this._ensureNoiseBuffer();
    if (!this._noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const flt = ctx.createBiquadFilter();
    flt.type = filterType;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(Math.max(20, f0), when);
    if (f1 && f1 !== f0) {
      flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    }
    const gain = ctx.createGain();
    const peakSafe = Math.max(0.0002, peak);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peakSafe, when + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    src.connect(flt);
    flt.connect(gain);
    gain.connect(dest);
    src.start(when);
    src.stop(when + dur + 0.03);
    this._track(src, music);
  }

  /** 懒创建 0.6s 白噪声 buffer */
  _ensureNoiseBuffer() {
    if (this._noiseBuffer || !this.ctx) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
    } catch (e) {
      this._noiseBuffer = null;
    }
  }

  /** 记录发声节点以便回收 / BGM 停止时强制打断 */
  _track(node, music) {
    const set = music ? this._musicVoices : this._sfxVoices;
    set.add(node);
    node.onended = () => {
      set.delete(node);
    };
  }

  /* ------------------------------------------------------------------ */
  /* BGM 调度                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 柔和总线：给带 soft 标记的曲目（EXTRA 结局 BGM）再兜一层软边。
   *
   *   softIn → 低通(2.4kHz, Q 0.7) ─┬→ 干声 0.92 → musicGain
   *                                 └→ 回声 0.28s（反馈 0.22）→ 湿声 0.15 → musicGain
   *
   * 低通削掉方波的高次谐波（硬边变软），短回声补一点空间感，
   * 让「8-bit 原作曲」在安静的结局画面里不扎耳。整条链只在 unlock 时建一次。
   * 实测：220Hz 方波过这条链，频谱质心 3.3kHz → 1.1kHz；整首歌 -27dBFS / 峰值 0.18。
   */
  _buildSoftBus() {
    const ctx = this.ctx;
    if (!ctx || this._softIn || !this._musicGain) return;
    try {
      const input = ctx.createGain();
      input.gain.value = 1;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      lp.Q.value = 0.7;

      const dry = ctx.createGain();
      dry.gain.value = 0.92;

      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.28;
      const fb = ctx.createGain();
      fb.gain.value = 0.22;
      const wet = ctx.createGain();
      wet.gain.value = 0.15;

      input.connect(lp);
      lp.connect(dry);
      dry.connect(this._musicGain);
      lp.connect(delay);
      delay.connect(fb);
      fb.connect(delay); // 含延迟节点的环路，WebAudio 允许
      delay.connect(wet);
      wet.connect(this._musicGain);

      this._softIn = input;
    } catch (e) {
      this._softIn = null;
    }
  }

  /**
   * 温总线：给带 warm 标记的曲目去掉「干、硬、像游戏机」的听感。
   *
   *   warmIn → 低通(5.2kHz, Q 0.6) ─┬→ 干声 0.95 → musicGain
   *                                 └→ 反射 0.21s（反馈 0.15）→ 湿声 0.11 → musicGain
   *
   * 比柔和总线（2.4kHz / 湿 0.15）轻一档：只削最刺的高次谐波、补一点房间感，
   * 旋律的明亮度保留。整条链只在 unlock 时建一次。
   */
  _buildWarmBus() {
    const ctx = this.ctx;
    if (!ctx || this._warmIn || !this._musicGain) return;
    try {
      const input = ctx.createGain();
      input.gain.value = 1;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      lp.Q.value = 0.6;

      const dry = ctx.createGain();
      dry.gain.value = 0.95;

      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.21;
      const fb = ctx.createGain();
      fb.gain.value = 0.15;
      const wet = ctx.createGain();
      wet.gain.value = 0.11;

      input.connect(lp);
      lp.connect(dry);
      dry.connect(this._musicGain);
      lp.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(this._musicGain);

      this._warmIn = input;
    } catch (e) {
      this._warmIn = null;
    }
  }

  /** 当前曲目的发声出口：soft 走柔和总线，warm 走温总线，其余直接进 BGM 总线 */
  _musicOut() {
    if (this._songSoft && this._softIn) return this._softIn;
    if (this._songWarm && this._warmIn) return this._warmIn;
    return this._musicGain;
  }

  _startMusic() {
    // 起播偏移（playMusic(name, {from})）只对这一次起播有效：先取走再判断，
    // 免得「曲目数据缺失 / 已在放」这几种提前返回把偏移留到下一次莫名其妙的起播上
    const from = Math.max(0, Number(this._startFrom) || 0);
    this._startFrom = 0;
    if (!this.ctx || this._musicOn) return; // 幂等守卫：绝不叠音
    // 显式「静音进关」状态（silenceMusic 把曲目留空）：没有待播曲目就保持安静，
    // 别把空曲目当成标题曲放出来。
    const name = this._songName;
    if (!name) return;
    const song = SONGS[name];
    if (!song || !(song.duration || song.audio)) return; // 没有曲目数据就保持安静
    this._songPlayOut = 0; // 起播一律从「循环」开始，收尾由 playOutMusic() 现点
    // 带 audio 字段的曲目直接播音频文件（离线渲染的成品），合成数据留作加载失败时的回退
    if (song.audio) {
      this._startAudioMusic(name, song, from);
      return;
    }
    this._startSynthMusic(name, song, from);
  }

  /** 走音频文件的 BGM：fetch → decodeAudioData → 无缝循环播放。from = 从第几秒起播（默认 0） */
  _startAudioMusic(name, song, from = 0) {
    if (!this.ctx || this._musicOn || this._audioPending === name) return;
    const url = song.audio;
    const begin = (buf) => {
      this._audioPending = null;
      if (!buf || !this.ctx) return;
      // 加载期间已经切走/关掉音乐就不要再起播
      if (this._songName !== name || !this._musicRequested) return;
      try {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(this._musicOut());
        const when = this.ctx.currentTime + 0.06;
        // 从中间接上时直接从对应采样位置起播；_songStart 前推同样的偏移，
        // 进度条 / 循环计数 / playOutMusic 的「这一轮还剩多久」仍然按整首算
        const dur = Number(buf.duration) || Number(song.duration) || 0;
        const offset = dur > 0 ? ((from % dur) + dur) % dur : 0;
        src.start(when, offset);
        this._song = Object.assign({}, song, { duration: buf.duration });
        this._songStart = when - offset;
        this._songIdx = 0;
        this._songLoop = 0;
        this._events = [];
        this._musicOn = true;
        this._audioSrc = src;
        this._musicVoices.add(src);
        src.onended = () => {
          this._musicVoices.delete(src);
          // 只有自然放完 / 被 stop 的曲目会走到这儿；渐出收尾由 fadeOutMusic 的定时器负责
          if (this._audioSrc !== src) return;
          this._audioSrc = null;
          this._songPlayOut = 0;
          this._musicOn = false;
        };
        this.onSongStart?.(name);
      } catch (e) {
        // 播放失败就退回合成
      }
    };
    this._audioPending = name;
    const cached = this._audioCache.get(url);
    if (cached) {
      begin(cached);
      return;
    }
    if (typeof fetch !== 'function') {
      // 老环境没有 fetch：直接回退合成，别让 BGM 空着
      this._audioPending = null;
      this._startSynthMusic(name, song, from);
      return;
    }
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      })
      .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => {
        this._audioCache.set(url, buf);
        begin(buf);
      })
      .catch(() => {
        // 文件缺失 / 解码失败：回退到合成器版本
        this._audioPending = null;
        if (this._songName === name && this._musicRequested) this._startSynthMusic(name, song, from);
      });
  }

  /** 走实时合成的 BGM（曲库音符事件表 + 前瞻调度）。from = 从第几秒起播（默认 0） */
  _startSynthMusic(name, song, from = 0) {
    if (!this.ctx || this._musicOn) return;
    this._song = song;
    this._songSoft = !!song.soft;
    this._songWarm = !!song.warm;
    this._events = this._getEvents(name, song);
    if (!this._events || !this._events.length) return;
    // 真正开始发声时才算「听见」：音乐关着时切歌不会误解锁回忆室里的曲目
    this.onSongStart?.(name);

    // 从中间接上：跳过偏移之前的事件，起播点前推同样的时间（进度 / 循环 / 渐出仍按整首算）。
    // 偏移可能落在最后一个事件之后——那就直接从下一圈的第一个事件排起，别让常驻静音。
    const dur = Number(song.duration) || 0;
    const offset = dur > 0 ? ((from % dur) + dur) % dur : 0;
    let idx = this._eventIndexAt(this._events, offset);
    let loop = 0;
    if (idx >= this._events.length) {
      idx = 0;
      loop = 1;
    }
    this._songStart = this.ctx.currentTime + 0.06 - offset;
    this._songIdx = idx;
    this._songLoop = loop;
    this._musicOn = true;
    this._musicTick();
  }

  /** 事件表里第一个时间 ≥ t 的下标（从曲中接上时定位起播点用） */
  _eventIndexAt(events, t) {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid][0] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  _stopMusic() {
    this._musicOn = false;
    this._audioPending = null;
    this._songPlayOut = 0;
    this._audioSrc = null;
    if (this._musicTimer !== null) {
      clearTimeout(this._musicTimer);
      this._musicTimer = null;
    }
    if (this._fadeTimer !== null) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
    if (this._playOutTimer !== null) {
      clearTimeout(this._playOutTimer);
      this._playOutTimer = null;
    }
    // 渐出把 BGM 总线压到 0 了：停完把增益恢复，下一首才是正常音量
    if (this._musicGain && this.ctx) {
      try {
        const g = this._musicGain.gain;
        g.cancelScheduledValues(this.ctx.currentTime);
        g.setValueAtTime(0.9 * this._musicVolume, this.ctx.currentTime);
      } catch (e) {
        // 忽略
      }
    }
    // 打断所有已排期的 BGM 节点，立即静音且不残留
    this._musicVoices.forEach((node) => {
      try {
        if (typeof node.stop === 'function') node.stop();
      } catch (e) {
        // 已经停止的节点会抛错，忽略
      }
    });
    this._musicVoices.clear();
  }

  /** 把曲目数据展平成按时间排序的事件表，并缓存（切回来不用重排） */
  _getEvents(name, song) {
    const cached = this._eventCache.get(name);
    if (cached) return cached;

    const events = [];
    for (const tr of song.tracks || []) {
      const waveIdx = Math.max(0, WAVES.indexOf(tr.wave));
      const gain = Number(tr.gain) || 0.1;
      for (const n of tr.notes || []) {
        // [t, kind, gain, midi, dur, vel]
        events.push([n[0], waveIdx, gain, n[1], n[2], n[3] || 100]);
      }
    }
    for (const d of song.drums || []) {
      events.push([d[0], DRUM_KIND, 0.12, d[1], 0, d[2] || 100]);
    }
    events.sort((a, b) => a[0] - b[0]);
    this._eventCache.set(name, events);
    return events;
  }

  /** 前瞻调度：每 25ms 检查一次，提前 0.18s 排好音符 */
  _musicTick() {
    this._musicTimer = null;
    if (!this._musicOn || !this.ctx || !this._events || !this._song) return;
    try {
      const t0 = this.ctx.currentTime;
      const horizon = t0 + 0.18;
      const evs = this._events;
      const dur = this._song.duration;
      // guard 防止曲目损坏时死循环
      for (let guard = 0; guard < 512; guard++) {
        const e = evs[this._songIdx];
        const when = this._songStart + this._songLoop * dur + e[0];
        if (when > horizon) break;
        if (when >= t0 - 0.02) this._scheduleEvent(e, when);
        this._songIdx++;
        if (this._songIdx >= evs.length) {
          this._songIdx = 0;
          this._songLoop++;
          // playOutMusic()：这一轮放完了，开始渐出（默认 5 秒）。
          // 注意这里不 return、也不调 _stopMusic：渐出期间还要继续排下一轮的音符，
          // 听感才是音乐自己淡下去；收尾由 fadeOutMusic 的定时器负责。
          if (this._songPlayOut) {
            const fadeSec = this._songPlayOut;
            this._songPlayOut = 0;
            this.fadeOutMusic(fadeSec);
          }
        }
      }
    } catch (e) {
      // 调度异常不中断游戏
    }
    if (this._musicOn) {
      this._musicTimer = setTimeout(() => this._musicTick(), 25);
    }
  }

  /** 排一个曲库事件：旋律或打击乐 */
  _scheduleEvent(e, when) {
    if (e[1] === DRUM_KIND) {
      this._scheduleDrum(e[3], e[5], e[2], when);
    } else {
      this._musicNote(e[1], e[3], e[4], e[2], e[5], when);
    }
  }

  /**
   * 曲库旋律：带保持段的包络，比音效更绵长，像老主机的发声单元。
   */
  _musicNote(waveIdx, midi, dur, gain, vel, when) {
    const ctx = this.ctx;
    const dest = this._musicOut();
    if (!ctx || !dest) return;
    const d = Math.max(0.03, Math.min(dur, 4));
    const peak = Math.max(0.0004, Math.min(0.2, gain * (0.4 + 0.6 * vel / 127)));
    const f = midiToFreq(midi);

    const osc = ctx.createOscillator();
    osc.type = WAVES[waveIdx] || 'square';
    osc.frequency.setValueAtTime(f, when);

    const g = ctx.createGain();
    const attack = Math.min(0.012, d * 0.3);
    const hold = Math.max(attack, d * 0.66);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + d);

    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + d + 0.02);
    this._track(osc, true);
  }

  /**
   * 曲库鼓：0=底鼓 1=军鼓 2=闭镲 3=开镲 4=吊镲
   */
  _scheduleDrum(kind, vel, gain, when) {
    const v = (gain || 0.12) * (0.45 + 0.55 * (vel || 100) / 127);
    switch (kind) {
      case 0: // 底鼓：三角波快速下坠
        this._tone('triangle', 150, 46, 0.11, Math.min(0.2, v * 1.6), when, true);
        break;
      case 1: // 军鼓：带通噪声 + 一点方波
        this._noise(0.11, Math.min(0.14, v), 'bandpass', 1900, 1300, when, 0.8, true);
        this._tone('square', 220, 150, 0.05, Math.min(0.06, v * 0.45), when, true);
        break;
      case 2: // 闭镲
        this._noise(0.028, Math.min(0.07, v * 0.6), 'highpass', 7800, 7800, when, 0.7, true);
        break;
      case 3: // 开镲
        this._noise(0.13, Math.min(0.06, v * 0.5), 'highpass', 6800, 6500, when, 0.7, true);
        break;
      case 4: // 吊镲
        this._noise(0.45, Math.min(0.055, v * 0.4), 'highpass', 5200, 3600, when, 0.6, true);
        break;
      default:
        break;
    }
  }
}
