/**
 * PIXEL DASH —— 程序化 8-bit 音频引擎（契约 B）
 *
 * 实现要点：
 * 1. constructor 只做字段初始化，绝不创建 AudioContext（浏览器需要用户手势）；
 *    unlock() 时才创建/恢复 AudioContext，可重复调用，幂等。
 * 2. 全部音效用 WebAudio 振荡器 + 增益包络实时合成，无任何外部音频文件。
 * 3. 包络：attack 2~5ms 线性/指数起音 + 指数衰减到 0.0001，避免爆音。
 * 4. stomp / hurt / die / land 叠加白噪声 buffer（低通或带通滤波）做打击感。
 * 5. BGM：递归 setTimeout 前瞻调度（lookahead），方波旋律 + 三角波低音 +
 *    极轻噪声踩镲，BPM 140，Am–F–C–G 走 8 小节循环。
 * 6. setMusic(false) 立即清定时器并 stop 掉所有已排期的音乐发声节点，
 *    重复 setMusic(true) 有 _musicOn 守卫，不会叠音。
 * 7. 所有对外方法在 unlock() 之前调用都是安全 no-op，任何情况不抛错。
 * 8. 音量克制：单次音效峰值 ≤ 0.25，BGM 峰值 ≤ 0.06。
 * 9. 文件自包含，不 import 其他模块；除 window.AudioContext 外不访问 DOM。
 * 10. 总线：master ← sfxGain（音效）/ musicGain（BGM）。音量 0~1 与开关
 *     分别作用于两条总线，静音（muted）作用于 master，互不干扰。
 */

/** MIDI 音高 → 频率（Hz） */
function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** BPM 140 的十六分音符时长（秒） */
const STEP_DUR = 60 / 140 / 4;

/** 和弦低音根音（MIDI）：A2、F2、C3、G2 —— 对应 Am、F、C、G */
const BASS_ROOTS = [45, 41, 48, 43];
/** 低音每拍的音程走向：根音、五度、根音、高八度 */
const BASS_PATTERN = [0, 7, 0, 12];

/**
 * 旋律（每和弦 16 个八分音符位置，0 表示休止）
 * Am / F / C / G 各一句，每句循环 1 小节，每和弦占 2 小节。
 */
const MELODY = [
  // Am: A4 E5 C5 E5 A4 C5 B4 E4
  [69, 0, 76, 0, 72, 0, 76, 0, 69, 0, 72, 0, 71, 0, 64, 0],
  // F: F4 C5 A4 C5 F4 A4 G4 C4
  [65, 0, 72, 0, 69, 0, 72, 0, 65, 0, 69, 0, 67, 0, 60, 0],
  // C: E4 G4 C5 G4 E4 G4 A4 B4
  [64, 0, 67, 0, 72, 0, 67, 0, 64, 0, 67, 0, 69, 0, 71, 0],
  // G: D4 G4 B4 G4 D4 G4 F4 D4
  [62, 0, 67, 0, 71, 0, 67, 0, 62, 0, 67, 0, 65, 0, 62, 0],
];

export class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} unlock 之前为 null */
    this.ctx = null;
    this._master = null;      // 总输出增益（静音用）
    this._sfxGain = null;     // 音效总线（音量 / 音效开关）
    this._musicGain = null;   // BGM 总线（比音效更轻）
    this._noiseBuffer = null; // 白噪声 buffer，懒创建
    this._muted = false;
    this._sfxOn = true;       // 音效开关（菜单可关）
    this._sfxVolume = 1;      // 音效音量 0~1
    this._musicVolume = 0.8;  // 音乐音量 0~1
    this._musicOn = false;
    this._musicRequested = false; // unlock 之前 setMusic(true) 的意图，unlock 后补启动
    this._musicTimer = null;
    this._musicStep = 0;
    this._musicNextTime = 0;
    this._sfxVoices = new Set();   // 一次性音效节点，仅用于回收引用
    this._musicVoices = new Set(); // BGM 节点，setMusic(false) 时强制 stop
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
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;

    try {
      if (!this.ctx) {
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
        this._ensureNoiseBuffer();
      }
      // 浏览器策略下 ctx 可能处于 suspended，需要 resume
      if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      // unlock 之前请求过音乐，这里补启动
      if (this._musicRequested) this._startMusic();
    } catch (e) {
      // 音频初始化失败不应影响游戏
      this.ctx = null;
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

      // 死亡：长下滑，带一点悲壮尾音
      case 'die':
        this._tone('sawtooth', 300, 60, 0.5, g(0.2), t0);
        this._tone('triangle', 150, 40, 0.5, g(0.08), t0);
        this._noise(0.4, g(0.07), 'lowpass', 900, 120, t0);
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
    const dest = music ? this._musicGain : this._sfxGain;
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
    const dest = music ? this._musicGain : this._sfxGain;
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

  _startMusic() {
    if (!this.ctx || this._musicOn) return; // 幂等守卫：绝不叠音
    this._musicOn = true;
    this._musicStep = 0;
    this._musicNextTime = this.ctx.currentTime + 0.08;
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

  /** 前瞻调度：每 30ms 检查一次，提前 0.12s 排好音符 */
  _musicTick() {
    this._musicTimer = null;
    if (!this._musicOn || !this.ctx) return;
    try {
      const horizon = this.ctx.currentTime + 0.12;
      while (this._musicNextTime < horizon) {
        this._scheduleStep(this._musicStep, this._musicNextTime);
        this._musicStep = (this._musicStep + 1) % 128; // 8 小节 × 16 步
        this._musicNextTime += STEP_DUR;
      }
    } catch (e) {
      // 调度异常不中断游戏
    }
    if (this._musicOn) {
      this._musicTimer = setTimeout(() => this._musicTick(), 30);
    }
  }

  /**
   * 排一个十六分音符位置上的所有声部。
   * @param {number} step 0~127
   * @param {number} when 绝对开始时间
   */
  _scheduleStep(step, when) {
    const bar = Math.floor(step / 16) % 8;   // 8 小节循环
    const chord = Math.floor(bar / 2) % 4;   // 每和弦占 2 小节

    // 方波旋律：每 2 步一个八分音符
    if (step % 2 === 0) {
      const idx = Math.floor(step / 2) % 16;
      const note = MELODY[chord][idx];
      if (note > 0) {
        this._tone('square', midiToFreq(note), midiToFreq(note), STEP_DUR * 1.6, 0.05, when, true);
      }
    }

    // 三角波低音：每拍（4 步）一个音
    if (step % 4 === 0) {
      const bi = Math.floor(step / 4) % 4;
      const f = midiToFreq(BASS_ROOTS[chord] + BASS_PATTERN[bi]);
      this._tone('triangle', f, f, STEP_DUR * 3.2, 0.055, when, true);
    }

    // 极轻的噪声踩镲：反拍
    if (step % 4 === 2) {
      this._noise(0.03, 0.016, 'highpass', 6000, 6000, when, 0.7, true);
    }
  }
}
