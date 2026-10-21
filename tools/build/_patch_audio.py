# -*- coding: utf-8 -*-
import io
p='src/engine/audio.js'
s=io.open(p,encoding='utf-8').read().replace('\r\n','\n')
assert 'this._musicVoices = new Set();' in s

# 1) 构造函数补字段
s=s.replace("    this._musicVoices = new Set(); // BGM 节点，切歌/关闭时强制 stop",
"""    this._musicVoices = new Set(); // BGM 节点，切歌/关闭时强制 stop
    this._audioCache = new Map();  // 音频文件曲目：url → AudioBuffer（解码一次复用）
    this._audioPending = null;     // 正在加载的音频曲目 key，防重复请求""")

# 2) _startMusic 拆出合成路径，带 audio 的曲目走音频文件
old = """  _startMusic() {
    if (!this.ctx || this._musicOn) return; // 幂等守卫：绝不叠音
    const name = this._songName || 'title';
    const song = SONGS[name];
    if (!song || !song.duration) return; // 没有曲目数据就保持安静
    this._song = song;
    this._songSoft = !!song.soft;
    this._songWarm = !!song.warm;
    this._events = this._getEvents(name, song);"""
new = """  _startMusic() {
    if (!this.ctx || this._musicOn) return; // 幂等守卫：绝不叠音
    const name = this._songName || 'title';
    const song = SONGS[name];
    if (!song || !(song.duration || song.audio)) return; // 没有曲目数据就保持安静
    // 带 audio 字段的曲目直接播音频文件（离线渲染的成品），合成数据留作加载失败时的回退
    if (song.audio) {
      this._startAudioMusic(name, song);
      return;
    }
    this._startSynthMusic(name, song);
  }

  /** 走音频文件的 BGM：fetch → decodeAudioData → 无缝循环播放 */
  _startAudioMusic(name, song) {
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
        src.start(when);
        this._song = Object.assign({}, song, { duration: buf.duration });
        this._songStart = when;
        this._songIdx = 0;
        this._songLoop = 0;
        this._events = [];
        this._musicOn = true;
        this._musicVoices.add(src);
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
      this._startSynthMusic(name, song);
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
        if (this._songName === name && this._musicRequested) this._startSynthMusic(name, song);
      });
  }

  /** 走实时合成的 BGM（曲库音符事件表 + 前瞻调度） */
  _startSynthMusic(name, song) {
    if (!this.ctx || this._musicOn) return;
    this._song = song;
    this._songSoft = !!song.soft;
    this._songWarm = !!song.warm;
    this._events = this._getEvents(name, song);"""
assert old in s
s=s.replace(old,new)

# 3) _stopMusic 清音频状态
old2 = """  _stopMusic() {
    this._musicOn = false;"""
new2 = """  _stopMusic() {
    this._musicOn = false;
    this._audioPending = null;"""
assert old2 in s
s=s.replace(old2,new2)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
print('patched audio.js')
