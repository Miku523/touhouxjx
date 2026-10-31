import io, sys

p = 'src/main.js'
s = io.open(p, encoding='utf-8').read()
n = 0

def rep(old, new, cnt=1):
    global s, n
    assert old in s, 'anchor missing: ' + old[:70]
    s = s.replace(old, new, cnt)
    n += 1

# 1) 静态 import → 动态
rep(
"""import { warmSongs, preloadSongs, isSongLoaded } from './engine/songs/index.js';
import { AudioEngine } from './engine/audio.js';""",
"""// 音频引擎（audio.js 66KB）与曲库索引（songs/index.js 14KB）不进首屏：浏览器策略本来就要等
// 第一次用户手势才允许出声，所以首屏先挂空壳（createAudioStub），首次点击/按键时才 import 真身。
// 省下约 80KB 静态图（压缩后约 35KB），弱网到菜单快约 5s。
let AudioEngine = null, warmSongs = null, preloadSongs = null, isSongLoaded = null;
let _audioModulePromise = null;
function loadAudioModule() {
  if (_audioModulePromise) return _audioModulePromise;
  _audioModulePromise = Promise.all([
    import('./engine/audio.js'),
    import('./engine/songs/index.js'),
  ]).then(([a, s]) => {
    AudioEngine = a.AudioEngine;
    warmSongs = s.warmSongs;
    preloadSongs = s.preloadSongs;
    isSongLoaded = s.isSongLoaded;
  }).catch((err) => { _audioModulePromise = null; throw err; });
  return _audioModulePromise;
}

/** 首屏音频占位：方法全是空操作，常用属性给安全默认值；真身到货后由 _unlockAudio() 整体换掉 */
function createAudioStub() {
  const DEFAULTS = {
    muted: false, sfxEnabled: true, musicEnabled: true,
    sfxVolume: 1, musicVolume: 1,
    currentSong: null, soundingSong: null, ctx: null,
    musicProgress: { elapsed: 0, duration: 0 },
  };
  return new Proxy({}, {
    get(t, prop) {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in DEFAULTS) return DEFAULTS[prop];
      return () => undefined;
    },
    set() { return true; },
  });
}""")

# 2) 构造函数：占位替代真身
rep("    this.audio = new AudioEngine();",
    "    this.audio = createAudioStub();   // 真身等第一次用户手势再建（见 _unlockAudio）")

# 3) 构造函数里的 _prewarmAudio 挪到解锁之后
rep(
"""    // 一次性尖峰预算：
    // ① AudioContext 创建要 50~120ms，直接放在启动幕还在盖屏的时候同步付掉，
    //    绝不能留给第一次按键（那时玩家正盯着难度页，卡一下最明显）；
    // ② 弹幕精灵烘焙（~12ms 总量）排到标题页之后，分片跑，不和首屏抢带宽。
    this._prewarmAudio();""",
"""    // 一次性尖峰预算：
    // ① AudioContext 创建要 50~120ms —— 它现在跟音频引擎一起挪到第一次手势之后（_unlockAudio），
    //    因为浏览器策略本来就不让首屏出声，提前建只是白付；那一下卡顿发生在玩家第一次
    //    点击/按键时，比盯着难度页时更不容易被察觉。
    // ② 弹幕精灵烘焙（~12ms 总量）排到标题页之后，分片跑，不和首屏抢带宽。""")

# 4) _unlockAudio 改成异步 + 建真身
rep(
"""  _unlockAudio() {
    const hadCtx = !!this.audio.ctx;
    this.audio.unlock?.();
    if (!hadCtx && this.audio.ctx) this._applyAudio();
  }""",
"""  async _unlockAudio() {
    if (this._audioLoading || this._audioReady) {
      // 引擎已在加载或已就绪：只补一次 unlock（重复调用无害）
      if (this._audioReady) { this.audio.unlock?.(); }
      return;
    }
    this._audioLoading = true;
    try {
      if (!AudioEngine) {
        await loadAudioModule();
        this.audio = new AudioEngine();   // 换掉占位壳，后续 this.audio.xxx 全部落到真身
        this._applyAudio();
        this._prewarmAudio();
      }
      this._audioReady = true;
    } catch (err) {
      this._audioLoading = false;
      if (typeof console !== 'undefined') console.warn('[audio] 音频引擎载入失败，本次静音运行', err);
      return;
    }
    const hadCtx = !!this.audio.ctx;
    this.audio.unlock?.();
    if (!hadCtx && this.audio.ctx) this._applyAudio();
  }""")

# 5) 门禁第 1 面曲目：引擎未就绪时直接放行（这路本来就要靠手势后的加载）
rep(
"""    if (!names.length) { gate.music = true; return Promise.resolve(); }
    return preloadSongs(names).then(() => {""",
"""    if (!names.length) { gate.music = true; return Promise.resolve(); }
    // 音频引擎要等第一次手势才加载，首屏阶段这路必然还没就绪：不算失败，进关前 _ensureStageMusic 兜底
    if (typeof preloadSongs !== 'function') { gate.music = true; return Promise.resolve(); }
    return preloadSongs(names).then(() => {""")

# 6) 预热调用加守卫
rep("    try { warmSongs(names); } catch (e) { /* ignore */ }",
    "    try { warmSongs?.(names); } catch (e) { /* ignore */ }")
rep("      warmSongs(names.filter(Boolean));",
    "      warmSongs?.(names.filter(Boolean));")

# 7) _ensureStageMusic：引擎未就绪就跳过（进关时 _unlockAudio 已在加载）
rep(
"""    const names = this._stageSongs(def).filter((n) => !isSongLoaded(n));
    if (!names.length) return true;""",
"""    if (typeof isSongLoaded !== 'function' || typeof preloadSongs !== 'function') return true;
    const names = this._stageSongs(def).filter((n) => !isSongLoaded(n));
    if (!names.length) return true;""")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched %d 处' % n)
