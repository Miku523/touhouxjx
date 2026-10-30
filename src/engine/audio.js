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
 *    每首曲子是「按秒排好的音符事件表」，前瞻调度、无缝循环。曲库按名字懒加载：
 *    首访只带标题曲，_startMusic 发现曲目不在就先 ensureSong()，到货后再起播。
 * 4. 曲目切换：playMusic(name) 立即换曲（先掐掉旧曲已排期的节点，不会叠音）；
 *    setMusic(false) 清定时器并停掉所有音乐节点；setMusic(true) 恢复当前曲目；
 *    playOutMusic() 让当前曲目把这一轮放完，再用 5 秒渐出（fadeOutMusic）收尾。
 * 5. 所有对外方法在 unlock() 之前调用都是安全 no-op，任何情况不抛错。
 * 6. 音量克制：单次音效峰值 ≤ 0.25，BGM 单声部峰值 ≤ 0.16。
 * 7. 总线：master ← sfxGain（音效）/ musicGain（BGM）。音量 0~1 与开关
 *    分别作用于两条总线，静音（muted）作用于 master，互不干扰。
 */

import { getSong, ensureSong } from './songs/index.js';

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

/**
 * 音频文件 BGM 的慢链路策略（见 _startAudioMusic）：
 *  - AUDIO_STREAM_GRACE_MS：fetch + decode 超过这么久还没拿到整首，就先改用
 *    HTMLAudioElement 流式播放同一个 URL（边下边听），不再等 1~2 MB 的 mp3 全部下完。
 *  - AUDIO_STALL_MS：文件方式在这段时间内没有任何可播放进度（整首没下完、流式也没起来），
 *    或文件直接失败，就放弃文件、回退曲库里的合成数据——慢链路「永远 pending」不再发生。
 *    流式播放看的是「缓冲有没有增长」：只要 buffered / readyState 还在涨就续期，
 *    完全没进度满 STALL_MS 才放弃，避免把饱和链路上正常缓冲的流式误杀。
 *  - AUDIO_STREAM_MAX_WAIT_MS：流式从开始缓冲算起最长等这么久（有进度也会续期，但总等待封顶），
 *    防止元素一直攒不够可播数据时永远静音、连合成器兜底都不触发。
 * 三个值导出是为了测试能读到；实例字段 _audioStreamGraceMs / _audioStallMs 可临时改小。
 */
export const AUDIO_STREAM_GRACE_MS = 2500;
export const AUDIO_STALL_MS = 8000;
export const AUDIO_STREAM_MAX_WAIT_MS = 30000;

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
    // ---- 音频文件曲目的慢链路策略（边下边听 / 停滞兜底 / 可取消） ----
    this._audioGen = 0;            // 请求代号：切歌 / 停止 / 回退合成时自增，作废在途异步回调
    this._audioAbort = null;       // 在途整首下载的 AbortController
    this._audioFetch = null;       // 同一 URL 共享的在途下载 { url, promise, controller }
    this._audioGraceTimer = null;  // 「这么久还没下完就先流式起播」的定时器
    this._audioStallTimer = null;  // 「这么久还没有任何可播进度就回退合成」的定时器
    this._audioStreamGraceMs = AUDIO_STREAM_GRACE_MS; // 可临时改小（测试用）
    this._audioStallMs = AUDIO_STALL_MS;              // 同上
    this._audioEl = null;          // 流式播放的 <audio>：只建一个，反复换 src
    this._audioElNode = null;      // 它的 MediaElementAudioSourceNode（只建一次）
    this._audioStream = null;      // 当前正在流式播放的 <audio>（停止时卸掉）
    this._audioStreamSeq = 0;      // 流式会话号：防止过期回调 / 定时器动到新的流
    this._audioStreaming = false;  // 当前 BGM 是否走「边下边听」流式路径（诊断用）
    this._audioMode = null;        // 当前 BGM 实际发声方式：'buffer' | 'stream' | 'synth'
    this._audioSongStarted = false;// 本曲是否已触发过 onSongStart（流式 → buffer 只触发一次）
    this._songLoadToken = 0;       // 曲库懒加载的批次号：切歌/关音乐时自增，作废未完成的加载
    this._songLoadPending = null;  // 正在等曲库模块的曲目 { token, name }
    this._songLoadFrom = 0;        // 等模块期间记下的起播偏移，见 _queueSongLoad()
    this._warnedSongs = new Set(); // 曲目加载失败只警告一次，不刷屏
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
    // 正在播、或上一首的文件还在下 / 流式还挂着，都先收干净再起新曲
    if (this._musicOn || this._musicVoices.size || this._audioPending || this._audioStream) this._stopMusic();
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
    // 流式文件曲目（边下边听）：按 element 当前播放位置算这一轮还剩多久
    const el = this._audioStream;
    if (el) {
      const dur = Number(el.duration) || Number(this._song && this._song.duration) || 0;
      const cur = Number(el.currentTime) || 0;
      const elapsed = dur > 0 ? ((cur % dur) + dur) % dur : 0;
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
    // 流式元素没接进总线时总线渐出对它无效，单独把 element 音量降下去
    if (this._audioStream && !this._audioElNode) this._fadeStreamVolume(s);
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
    // 流式元素没接总线时静音 / 恢复要单独作用到 element
    this._syncStreamVolume();
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
    // 流式元素没接总线时音量跟随 _musicVolume
    this._syncStreamVolume();
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

      // 秘籍输对：E–G–B 快速上行 + 高八度长音收尾 + 高音闪光。
      // 和「胜利」的四音上行都错开：换成三角波主奏、最后一口拖长，
      // 一耳朵就知道是「解锁成功」而不是又打赢了一关。
      case 'secret': {
        const notes = [659.25, 783.99, 987.77, 1318.5];
        for (let i = 0; i < notes.length; i++) {
          const last = i === notes.length - 1;
          const dur = last ? 0.34 : 0.075;
          this._tone('triangle', notes[i], notes[i], dur, g(0.16), t0 + i * 0.09);
          this._tone('square', notes[i] / 2, notes[i] / 2, dur, g(0.045), t0 + i * 0.09);
        }
        this._noise(0.3, g(0.05), 'highpass', 5000, 9200, t0 + 0.18);
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

  /** 起播当前曲目。fromOverride 只给「曲库懒加载到货后重入」用，平时走 _startFrom */
  _startMusic(fromOverride) {
    // 起播偏移（playMusic(name, {from})）只对这一次起播有效：先取走再判断，
    // 免得「曲目数据缺失 / 已在放」这几种提前返回把偏移留到下一次莫名其妙的起播上
    const from = fromOverride !== undefined
      ? Math.max(0, Number(fromOverride) || 0)
      : Math.max(0, Number(this._startFrom) || 0);
    this._startFrom = 0;
    if (!this.ctx || this._musicOn) return; // 幂等守卫：绝不叠音
    // 显式「静音进关」状态（silenceMusic 把曲目留空）：没有待播曲目就保持安静，
    // 别把空曲目当成标题曲放出来。
    const name = this._songName;
    if (!name) return;
    const song = getSong(name);
    if (!song) {
      // 曲库懒加载：这首还没到（首次到某关、回忆室点未加载曲目）。先取模块，
      // 到货后回到这里起播；异步期间的切歌 / 关音乐 / 静音都会让它作废。
      this._queueSongLoad(name, from);
      return;
    }
    this._beginSong(name, song, from);
  }

  /** 曲目数据已就位时的真正起播（原 _startMusic 的同步部分，语义不变） */
  _beginSong(name, song, from) {
    if (!this.ctx || this._musicOn) return; // 幂等守卫：绝不叠音
    if (!song || !(song.duration || song.audio)) return; // 没有曲目数据就保持安静
    this._songPlayOut = 0; // 起播一律从「循环」开始，收尾由 playOutMusic() 现点
    // 带 audio 字段的曲目直接播音频文件（离线渲染的成品），合成数据留作加载失败时的回退
    if (song.audio) {
      this._startAudioMusic(name, song, from);
      return;
    }
    this._startSynthMusic(name, song, from);
  }

  /**
   * 曲库懒加载：等 ensureSong() 到货后重新进入 _startMusic。
   * 竞态守卫：加载期间的切歌 / 关音乐 / silenceMusic 都会让 _songLoadToken 自增
   * （见 _stopMusic 与 _queueSongLoad），旧请求回来发现 token 变了就直接丢弃，
   * 绝不会起播旧曲；到货时再核一遍曲名 / 意图 / ctx / 是否已经在放。
   */
  _queueSongLoad(name, from) {
    const pending = this._songLoadPending;
    if (pending && pending.name === name) {
      // 同一首的重复请求（playMusic 之后紧跟 setMusic(true)）：共用一次加载，
      // 只把明确 >0 的定位升级进去，别把带偏移的起播降回 0
      if (from > 0) this._songLoadFrom = from;
      return;
    }
    const token = ++this._songLoadToken;
    this._songLoadPending = { token, name };
    this._songLoadFrom = from;
    ensureSong(name).then((song) => {
      if (token !== this._songLoadToken) return; // 已被切歌 / 关音乐 / 静音作废
      this._songLoadPending = null;
      if (!song) {
        this._warnMissingSong(name);
        return;
      }
      if (this._songName !== name) return;
      if (!this._musicRequested || !this.ctx || this._musicOn) return;
      const nextFrom = this._songLoadFrom;
      this._songLoadFrom = 0;
      this._startMusic(nextFrom);
    });
  }

  /** 曲目加载失败 / 曲库没有这个名字：保持安静，只警告一次，不抛错、不刷屏 */
  _warnMissingSong(name) {
    if (!name || this._warnedSongs.has(name)) return;
    this._warnedSongs.add(name);
    try {
      console.warn('[audio] 曲目不可用，保持安静：' + name);
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 走音频文件的 BGM：优先 fetch → decodeAudioData → 无缝循环播放（快链路主路径）。
   *
   * 慢链路（整首 1~2 MB 的 mp3 迟迟下不完）不再傻等整首：
   *  - fetch 超过 AUDIO_STREAM_GRACE_MS 还没好，就改用 <audio> 流式播放同一个 URL
   *    （边下边听），几秒内先出声，并停掉整首下载把带宽让给流式；
   *  - 下载完成后如果流式正在放，热切到 buffer 版本继续无缝循环；
   *  - AUDIO_STALL_MS 内没有任何可播放进度，或文件直接失败：回退 _startSynthMusic
   *    （from 偏移 / 循环计数 / 进度条 / onSongStart 语义不变）。
   * 切歌 / 关音乐 / stopMusic 会 abort 在途请求、卸掉流式元素，_audioPending 不会卡死。
   * 老环境（无 fetch / 无 decodeAudioData）保持原行为：直接合成。
   *
   * from = 从第几秒起播（默认 0）
   */
  _startAudioMusic(name, song, from = 0) {
    if (!this.ctx || this._musicOn || this._audioPending === name) return;
    const url = song.audio;
    // 已经解码好的：直接复用缓存的 AudioBuffer，不重复下载
    const cached = this._audioCache.get(url);
    if (cached) {
      this._beginAudioBuffer(name, song, from, cached);
      return;
    }
    if (typeof fetch !== 'function' || typeof this.ctx.decodeAudioData !== 'function') {
      // 老环境没有 fetch、或 AudioContext 不支持解码（离线测试用的假 context）：
      // 别把 BGM 空着，直接用曲库里的合成数据播
      this._startSynthMusic(name, song, from);
      return;
    }

    // 新的文件请求：先把上一首可能还挂着的下载 / 流式元素收干净，再开新代号
    this._cancelAudioLoad();
    const gen = ++this._audioGen;
    this._audioSongStarted = false;
    this._audioPending = name;
    this._audioMode = null;

    // 1) 快链路主路径：fetch + decode 整首，成功后无缝循环（与 1.6.44 行为一致）
    const load = this._loadAudioBuffer(url);
    // 2) 慢链路：grace 内还没下完就先流式起播（边下边听）。网络已经明确很差时不必等
    const grace = this._slowLinkHint() ? 0 : this._audioStreamGraceMs;
    this._audioGraceTimer = setTimeout(() => {
      this._audioGraceTimer = null;
      if (gen !== this._audioGen || this._audioPending !== name) return;
      this._startAudioStream(name, song, from, gen, url);
    }, grace);
    // 3) 兜底：STALL_MS 内没有任何可播放进度 → 放弃文件方式，回退合成器
    this._audioStallTimer = setTimeout(() => {
      this._audioStallTimer = null;
      if (gen !== this._audioGen || this._audioPending !== name || this._musicOn) return;
      this._fallbackToSynth(name, song, from, gen);
    }, this._audioStallMs);

    load.then((buf) => {
      if (gen !== this._audioGen) return; // 已经被切歌 / 停止作废
      this._clearAudioLoadTimers();
      this._audioPending = null;
      if (this._songName !== name || !this._musicRequested || !this.ctx) {
        this._releaseAudioStream();
        return;
      }
      const el = this._audioStream;
      if (el) {
        // 慢链路流式已经在缓冲 / 在放：从它当前的位置接上 buffer 版本，听感不断
        const at = Number(el.currentTime) || 0;
        this._audioStream = null;
        this._audioStreamSeq++;
        this._audioStreaming = false;
        const ok = this._beginAudioBuffer(name, song, from, buf, at, true);
        if (ok) {
          this._detachAudioStream(el);
        } else {
          // buffer 起播失败：把流式还回去继续放
          this._audioStream = el;
          this._audioStreamSeq++;
          this._audioStreaming = true;
          this._audioMode = 'stream';
        }
        return;
      }
      this._beginAudioBuffer(name, song, from, buf);
    }).catch(() => {
      if (gen !== this._audioGen) return;
      // 流式已经接上（正在缓冲或在放）：这是慢链路的正常路径，不算失败。
      // 关键：不能顺手清定时器——_startAudioStream 会主动 abort 这条整首 fetch，
      // 它的 catch 正好在流式看门狗装好之后触发，清掉就等于把兜底静默关掉。
      if (this._audioStreaming || this._musicOn) return;
      this._clearAudioLoadTimers();
      this._fallbackToSynth(name, song, from, gen);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 音频文件 BGM：下载 / 流式 / 兜底 / 取消                              */
  /* ------------------------------------------------------------------ */

  /**
   * 下载 + 解码整首。同一 URL 的在途请求共享同一个 promise（_audioFetch），
   * 换歌 / 停止时用 AbortController 立刻取消，不把一个 1~2 MB 的下载拖到结束。
   */
  _loadAudioBuffer(url) {
    const inflight = this._audioFetch;
    if (inflight && inflight.url === url) return inflight.promise;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const init = controller ? { signal: controller.signal } : undefined;
    const promise = fetch(url, init)
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      })
      .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => {
        this._audioCache.set(url, buf);
        if (this._audioFetch && this._audioFetch.promise === promise) this._audioFetch = null;
        return buf;
      }, (err) => {
        if (this._audioFetch && this._audioFetch.promise === promise) this._audioFetch = null;
        throw err;
      });
    this._audioFetch = { url, promise, controller };
    this._audioAbort = controller;
    return promise;
  }

  /** 取消在途的整首下载（切歌 / 停止 / 转流式 / 回退合成时） */
  _abortAudioFetch() {
    const ctrl = this._audioAbort;
    this._audioAbort = null;
    this._audioFetch = null;
    if (ctrl) {
      try {
        ctrl.abort();
      } catch (e) {
        // 已经结束的请求 abort 也不会抛，忽略
      }
    }
  }

  /** 清掉「开始流式」「回退合成」两个定时器 */
  _clearAudioLoadTimers() {
    if (this._audioGraceTimer !== null) {
      clearTimeout(this._audioGraceTimer);
      this._audioGraceTimer = null;
    }
    if (this._audioStallTimer !== null) {
      clearTimeout(this._audioStallTimer);
      this._audioStallTimer = null;
    }
  }

  /**
   * 作废当前文件 BGM 的所有在途工作：下载、解码回调、流式元素、定时器。
   * _audioPending 一并清空——切歌之后上一首的请求绝不会再挡着新曲目起播。
   */
  _cancelAudioLoad() {
    this._audioGen++;
    this._abortAudioFetch();
    this._clearAudioLoadTimers();
    this._releaseAudioStream();
    this._audioPending = null;
    this._audioStreaming = false;
    this._audioMode = null;
    this._audioSongStarted = false;
  }

  /** 网络已经很差 / 省流量：不用等 grace，直接边下边听 */
  _slowLinkHint() {
    try {
      const c = typeof navigator !== 'undefined' ? navigator.connection : null;
      if (!c) return false;
      if (c.saveData) return true;
      return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g';
    } catch (e) {
      return false;
    }
  }

  /**
   * 流式播放用的 <audio>：整个引擎只建一个元素、只接一次 MediaElementAudioSourceNode。
   * 接进 WebAudio 后音量 / 静音 / 渐出仍然走 musicGain 总线；接不进去就退化为
   * element.volume 跟随 _musicVolume、静音时 pause（见 _syncStreamVolume）。
   */
  _ensureAudioElement() {
    if (this._audioEl) return this._audioEl;
    if (typeof Audio !== 'function' || typeof document === 'undefined') return null;
    try {
      const el = new Audio();
      el.preload = 'auto';
      el.loop = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      if (this.ctx && this._musicGain && typeof this.ctx.createMediaElementSource === 'function') {
        try {
          this._audioElNode = this.ctx.createMediaElementSource(el);
          this._audioElNode.connect(this._musicGain);
        } catch (e) {
          this._audioElNode = null; // 接不进总线就走降级音量
        }
      }
      this._audioEl = el;
      return el;
    } catch (e) {
      return null;
    }
  }

  /**
   * 慢链路「边下边听」：用 HTMLAudioElement 流式播放同一个 URL。
   * 只要缓冲到能出声就先响起来，不等整首下完；在途的整首 fetch 同时停掉，
   * 把带宽让给流式播放（两条连接并行会互相饿死，首声反而更晚）。
   * 起播后如果 buffer 版本也下完了，_startAudioMusic 会热切过去。
   */
  _startAudioStream(name, song, from, gen, url) {
    if (gen !== this._audioGen || this._audioPending !== name || this._musicOn || !this.ctx) return;
    const el = this._ensureAudioElement();
    if (!el) return; // 建不出元素就交给 STALL_MS 兜底去合成
    this._abortAudioFetch(); // 慢链路：不再整首下载，带宽全给流式
    this._audioStream = el;
    this._audioStreamSeq++;
    this._audioStreaming = true;
    this._audioMode = 'stream';
    // 兜底看门狗：以「缓冲有没有增长」判进度，而不是以「有没有出声」判。
    // 饱和链路（15KB/s 全站共享）下元素常常要十几秒才攒够可播数据，固定窗口
    // 会把正常缓冲误杀；只要 buffered / readyState 还在涨就续期，完全没进度
    // 满 STALL_MS 才回合成器。总等待封顶 AUDIO_STREAM_MAX_WAIT_MS，避免无声死等。
    if (this._audioStallTimer) { clearTimeout(this._audioStallTimer); this._audioStallTimer = null; }
    const streamT0 = Date.now();
    let lastBufEnd = 0;
    let lastReadyState = 0;
    const armStreamStall = () => {
      this._audioStallTimer = setTimeout(() => {
        this._audioStallTimer = null;
        if (gen !== this._audioGen || this._audioPending !== name || this._musicOn) return;
        let bufEnd = 0;
        try {
          bufEnd = el.buffered && el.buffered.length ? el.buffered.end(el.buffered.length - 1) : 0;
        } catch (e) {
          bufEnd = 0;
        }
        const rs = Number(el.readyState) || 0;
        // 缓冲在涨 / 元数据推进 / 连接仍在下载（networkState=LOADING）都算「有进度」：
        // 15KB/s 饱和链路攒够首帧前 buffered/readyState 可能一直是 0，但字节确实在涨。
        const progressed = bufEnd > lastBufEnd + 0.02 || rs > lastReadyState ||
          Number(el.networkState) === 2; /* HTMLMediaElement.NETWORK_LOADING */
        lastBufEnd = Math.max(lastBufEnd, bufEnd);
        lastReadyState = Math.max(lastReadyState, rs);
        if (progressed && Date.now() - streamT0 < AUDIO_STREAM_MAX_WAIT_MS) {
          armStreamStall();
          return;
        }
        this._fallbackToSynth(name, song, from, gen);
      }, this._audioStallMs);
    };
    armStreamStall();
    const offset = Math.max(0, Number(from) || 0);
    const seq = this._audioStreamSeq;
    // 事件回调只在「这段流式仍然是当前曲目」时生效，切歌 / 停止后一律闭嘴
    const active = () => gen === this._audioGen && this._audioStreamSeq === seq &&
      this._audioStream === el && this._songName === name && this._musicRequested;

    el.onloadedmetadata = () => {
      if (!active()) return;
      if (offset > 0.05) {
        try {
          const d = Number(el.duration) || 0;
          if (d > 0) el.currentTime = ((offset % d) + d) % d;
        } catch (e) {
          // 不支持 seek 就从头播，进度语义由 _songStart 兜住
        }
      }
    };
    el.onplaying = () => {
      if (!active()) return;
      if (this._musicOn) return; // buffer 版本已经接上了，别叠音
      this._onAudioStreamPlaying(name, song, el);
    };
    el.onerror = () => {
      if (!active()) return;
      this._fallbackToSynth(name, song, from, gen);
    };
    try {
      el.preload = 'auto';
      el.loop = true;
      el.src = url;
      this._syncStreamVolume();
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // 自动播放被拒 / 播放失败：同样当作文件方式失败，回退合成器
          if (active()) this._fallbackToSynth(name, song, from, gen);
        });
      }
    } catch (e) {
      this._fallbackToSynth(name, song, from, gen);
    }
  }

  /** 流式已经真正出声：接管进度条 / 循环计数状态，语义与 buffer 版本对齐 */
  _onAudioStreamPlaying(name, song, el) {
    this._clearAudioLoadTimers();
    this._audioPending = null;
    const dur = Number(el.duration) || Number(song.duration) || 0;
    const cur = Number(el.currentTime) || 0;
    const offset = dur > 0 ? ((cur % dur) + dur) % dur : 0;
    this._song = dur > 0 ? Object.assign({}, song, { duration: dur }) : song;
    this._songSoft = !!song.soft;
    this._songWarm = !!song.warm;
    // 进度按「整首」算：把已经播掉的 offset 从起点里减掉（与 buffer 版本一致）
    this._songStart = this.ctx.currentTime - offset;
    this._songIdx = 0;
    this._songLoop = 0;
    this._events = [];
    this._musicOn = true;
    this._audioSrc = null;
    this._audioStreaming = true;
    this._audioMode = 'stream';
    this._syncStreamVolume();
    this._markAudioStarted(name);
  }

  /** 卸掉流式元素：暂停 + 断开下载，元素本身留着复用（MediaElementSource 只能建一次） */
  _detachAudioStream(el) {
    if (!el) return;
    try {
      el.pause();
    } catch (e) {
      // 忽略
    }
    try {
      el.onplaying = null;
      el.onerror = null;
      el.onloadedmetadata = null;
    } catch (e) {
      // 忽略
    }
    try {
      el.preload = 'none';
      el.removeAttribute('src');
      el.load();
    } catch (e) {
      // 忽略
    }
  }

  /** 停 / 切掉当前流式播放（_audioPending 的清空由调用方负责） */
  _releaseAudioStream() {
    const el = this._audioStream;
    this._audioStream = null;
    this._audioStreamSeq++;
    this._audioStreaming = false;
    if (el) this._detachAudioStream(el);
  }

  /**
   * 流式元素没接进 WebAudio 总线时的降级音量：跟随 _musicVolume，静音时 pause。
   * 接进总线时音量 / 静音 / 渐出全交给 musicGain，这里只把元素音量拉满。
   */
  _syncStreamVolume() {
    const el = this._audioStream;
    if (!el) return;
    try {
      if (this._audioElNode) {
        el.volume = 1;
        el.muted = false;
        return;
      }
      const v = this._muted ? 0 : Math.max(0, Math.min(1, this._musicVolume));
      el.volume = v;
      el.muted = !!this._muted;
      if (this._muted) {
        if (!el.paused) el.pause();
      } else if (this._musicRequested && this._musicOn) {
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {
      // 忽略
    }
  }

  /** 流式元素没接总线时的降级渐出（接进总线时由 musicGain 完成） */
  _fadeStreamVolume(sec) {
    const el = this._audioStream;
    if (!el || this._audioElNode) return;
    const start = Number(el.volume) || 0;
    const t0 = Date.now();
    const dur = Math.max(0.2, Number(sec) || MUSIC_FADE_OUT) * 1000;
    const tick = () => {
      if (this._audioStream !== el) return;
      const k = Math.min(1, (Date.now() - t0) / dur);
      try {
        el.volume = Math.max(0, start * (1 - k));
      } catch (e) {
        return;
      }
      if (k < 1) setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  }

  /** 本曲第一次真正发出声音时通知外部（流式 → buffer 热切时只通知一次） */
  _markAudioStarted(name) {
    if (this._audioSongStarted) return;
    this._audioSongStarted = true;
    this.onSongStart?.(name);
  }

  /** 文件方式失败 / 停滞：清理干净后回退曲库里的合成数据（语义同 1.6.44 的 .catch 分支） */
  _fallbackToSynth(name, song, from, gen) {
    if (gen !== this._audioGen) return;
    this._audioGen++; // 作废还在回调链上的下载 / 解码
    this._abortAudioFetch();
    this._clearAudioLoadTimers();
    const wasStreaming = this._audioStreaming;
    this._releaseAudioStream();
    this._audioPending = null;
    this._audioStreaming = false;
    this._audioMode = 'synth';
    if (wasStreaming) this._musicOn = false; // 流式如果已经在放，先当它停了，换合成器
    if (!this._musicOn && this._songName === name && this._musicRequested) {
      this._startSynthMusic(name, song, from);
    }
  }

  /**
   * 解码好的整首 buffer → 无缝循环起播（快链路主路径；也可从流式热切过来）。
   * resumeAt / switching 用于「从流式当前位置接上」：已经在放也允许起播，
   * 起播偏移取流式刚播到的位置，听感不断。
   * @returns {boolean} 是否真的起播了
   */
  _beginAudioBuffer(name, song, from, buf, resumeAt = 0, switching = false) {
    if (!buf || !this.ctx) return false;
    if (this._songName !== name || !this._musicRequested) return false;
    if (this._musicOn && !switching) return false;
    let src = null;
    try {
      src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this._musicOut());
      const when = this.ctx.currentTime + 0.06;
      // 从中间接上时直接从对应采样位置起播；_songStart 前推同样的偏移，
      // 进度条 / 循环计数 / playOutMusic 的「这一轮还剩多久」仍然按整首算
      const dur = Number(buf.duration) || Number(song.duration) || 0;
      let offset = dur > 0 ? ((from % dur) + dur) % dur : 0;
      if (switching && Number.isFinite(resumeAt) && resumeAt > 0 && dur > 0) {
        offset = ((resumeAt % dur) + dur) % dur;
      }
      src.start(when, offset);
      this._song = Object.assign({}, song, { duration: buf.duration });
      this._songSoft = !!song.soft;
      this._songWarm = !!song.warm;
      this._songStart = when - offset;
      this._songIdx = 0;
      this._songLoop = 0;
      this._events = [];
      this._musicOn = true;
      this._audioSrc = src;
      this._audioStreaming = false;
      this._audioMode = 'buffer';
      this._musicVoices.add(src);
      src.onended = () => {
        this._musicVoices.delete(src);
        // 只有自然放完 / 被 stop 的曲目会走到这儿；渐出收尾由 fadeOutMusic 的定时器负责
        if (this._audioSrc !== src) return;
        this._audioSrc = null;
        this._songPlayOut = 0;
        this._musicOn = false;
      };
      this._markAudioStarted(name);
      return true;
    } catch (e) {
      try {
        if (src) {
          src.onended = null;
          if (typeof src.disconnect === 'function') src.disconnect();
        }
      } catch (e2) {
        // 忽略
      }
      if (!switching) {
        // 起播失败就退回合成
        this._audioSrc = null;
        this._musicOn = false;
        this._audioMode = null;
        this._audioPending = null;
        if (this._songName === name && this._musicRequested) this._startSynthMusic(name, song, from);
      }
      return false;
    }
  }

  /** 走实时合成的 BGM（曲库音符事件表 + 前瞻调度）。from = 从第几秒起播（默认 0） */
  _startSynthMusic(name, song, from = 0) {
    if (!this.ctx || this._musicOn) return;
    this._song = song;
    this._songSoft = !!song.soft;
    this._songWarm = !!song.warm;
    this._events = this._getEvents(name, song);
    if (!this._events || !this._events.length) return;
    this._audioMode = 'synth';
    this._audioStreaming = false;
    // 真正开始发声时才算「听见」：音乐关着时切歌不会误解锁回忆室里的曲目
    this._markAudioStarted(name);

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
    // 让还在路上的曲库懒加载作废：停音乐 / 切歌 / silence 之后到货的模块不许再起播
    this._songLoadToken++;
    this._songLoadPending = null;
    this._musicOn = false;
    this._audioPending = null;
    this._songPlayOut = 0;
    this._audioSrc = null;
    // 文件 BGM 的在途下载 / 流式元素一并收掉：切歌不会被上一首的请求卡住
    this._cancelAudioLoad();
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
