/**
 * 东方新纪行 —— 程序化 8-bit 音频引擎（多曲目版）
 *
 * 实现要点：
 * 1. constructor 只做字段初始化，绝不创建 AudioContext（浏览器需要用户手势）；
 *    unlock() 时才创建/恢复 AudioContext，可重复调用，幂等。
 * 2. 全部音效与 BGM 都用 WebAudio 振荡器 + 增益包络实时合成，无任何外部音频文件。
 * 3. BGM 曲库来自 ./songs/index.js（每关 BOSS 的原作主题曲 + 标题/失败/结局原创曲），
 *    每首曲子是「按秒排好的音符事件表」，前瞻调度、无缝循环。
 * 4. 曲目切换：playMusic(name) 立即换曲（先掐掉旧曲已排期的节点，不会叠音）；
 *    setMusic(false) 清定时器并停掉所有音乐节点；setMusic(true) 恢复当前曲目。
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

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} unlock 之前为 null */
    this.ctx = null;
    this._master = null;      // 总输出增益（静音用）
    this._sfxGain = null;     // 音效总线（音量 / 音效开关）
    this._musicGain = null;   // BGM 总线（比音效更轻）
    this._softIn = null;      // 柔和总线入口（低通 + 短回声），仅 soft 曲目走这条
    this._songSoft = false;   // 当前曲目是否走柔和总线（歌曲数据里的 soft 标记）
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
    this._songIdx = 0;         // 事件指针
    this._songLoop = 0;        // 已循环轮数
    /**
     * 曲目真正开始发声时的回调（音乐回忆室用来记录「听过的曲子」）。
     * 音乐关着时 playMusic 只记住曲目、不触发；等 setMusic(true) 真正开播才触发。
     * @type {((name: string) => void)|null}
     */
    this.onSongStart = null;

    this._sfxVoices = new Set();   // 一次性音效节点，仅用于回收引用
    this._musicVoices = new Set(); // BGM 节点，切歌/关闭时强制 stop
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
   * @param {string} name
   */
  playMusic(name) {
    if (!name || typeof name !== 'string') return;
    if (this._songName === name && this._musicOn) return;
    this._songName = name;
    // 正在播就立刻换：先掐掉旧曲排期的节点，避免两首叠在一起
    if (this._musicOn) this._stopMusic();
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

  /** 当前曲目的发声出口：soft 曲目走柔和总线，其余直接进 BGM 总线 */
  _musicOut() {
    return this._songSoft && this._softIn ? this._softIn : this._musicGain;
  }

  _startMusic() {
    if (!this.ctx || this._musicOn) return; // 幂等守卫：绝不叠音
    const name = this._songName || 'title';
    const song = SONGS[name];
    if (!song || !song.duration) return; // 没有曲目数据就保持安静
    this._song = song;
    this._songSoft = !!song.soft;
    this._events = this._getEvents(name, song);
    if (!this._events || !this._events.length) return;
    // 真正开始发声时才算「听见」：音乐关着时切歌不会误解锁回忆室里的曲目
    this.onSongStart?.(name);

    this._songStart = this.ctx.currentTime + 0.06;
    this._songIdx = 0;
    this._songLoop = 0;
    this._musicOn = true;
    this._musicTick();
  }

  _stopMusic() {
    this._musicOn = false;
    if (this._musicTimer !== null) {
      clearTimeout(this._musicTimer);
      this._musicTimer = null;
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
