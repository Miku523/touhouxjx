/**
 * BGM 调度离线体检：node tools/qa_audio.mjs
 *
 * 用假的 AudioContext 驱动 AudioEngine，检查：
 *  - playMusic 能切歌、setMusic(false/true) 能停/恢复
 *  - 音符按 曲目 time + 循环长度 × 轮数 排期，不重不漏
 *  - 循环边界连续、无 NaN/负时值
 * 若曲库已就绪，再对全部 10 首做一遍排期统计。
 */
import { AudioEngine } from '../src/engine/audio.js';
import { SONGS } from '../src/engine/songs/index.js';

class Param {
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
  cancelScheduledValues() {}
}
class Node {
  connect() { return this; }
  disconnect() {}
  start() {}
  stop() {}
}
class Osc extends Node {
  constructor() { super(); this.type = 'sine'; this.frequency = new Param(); this.onended = null; }
  start(t) { this._start = t; }
  stop(t) { this._stop = t; }
}
class Ctx {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = new Node();
  }
  resume() {}
  createGain() { const n = new Node(); n.gain = new Param(1); return n; }
  createOscillator() { return new Osc(); }
  createBufferSource() { const n = new Node(); n.buffer = null; n.playbackRate = new Param(1); return n; }
  createBiquadFilter() { const n = new Node(); n.type = 'lowpass'; n.Q = new Param(1); n.frequency = new Param(1000); return n; }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
}

let failed = 0;
const fail = (m) => { failed++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

globalThis.window = { AudioContext: Ctx };
const audio = new AudioEngine();
audio.unlock();

function runSong(name, seconds = 8) {
  audio._stopMusic();
  audio._musicRequested = false;
  audio._eventCache.delete(name);
  const calls = [];
  const orig = audio._scheduleEvent.bind(audio);
  audio._scheduleEvent = (e, when) => { calls.push({ when, e }); orig(e, when); };
  audio.playMusic(name);
  audio.setMusic(true);
  if (audio._musicTimer) { clearTimeout(audio._musicTimer); audio._musicTimer = null; }
  const ctx = audio.ctx;
  const start = audio._songStart;
  const step = 0.01;
  for (let i = 0; i < Math.ceil(seconds / step); i++) {
    ctx.currentTime = start + i * step;
    audio._musicTick();
    if (audio._musicTimer) { clearTimeout(audio._musicTimer); audio._musicTimer = null; }
  }
  audio._scheduleEvent = orig;
  audio._stopMusic();
  return { calls, events: audio._getEvents(name, SONGS[name]), duration: SONGS[name]?.duration, start };
}

/** 在 [0, seconds+0.18) 内应排上的事件数（按循环展开） */
function expectedCount(events, duration, seconds) {
  const horizon = seconds + 0.18 - 1e-9;
  let n = 0;
  for (let loop = 0; loop * duration < horizon; loop++) {
    for (const e of events) {
      if (loop * duration + e[0] < horizon) n++;
      else break;
    }
  }
  return n;
}

/* ---------- 1. 合成一首测试曲，验证排期逻辑 ---------- */
SONGS.__qa = {
  title: 'QA',
  duration: 2,
  tracks: [
    { wave: 'square', gain: 0.1, notes: [[0, 69, 0.2, 100], [0.5, 72, 0.2, 100], [1.5, 74, 0.3, 100]] },
    { wave: 'triangle', gain: 0.1, notes: [[0, 45, 0.4, 100], [1, 43, 0.4, 100]] },
  ],
  drums: [[0, 0, 110], [0.5, 1, 100], [1, 2, 80], [1.5, 2, 80]],
};
console.log('[1] 调度逻辑 / 无缝循环');
{
  const SECONDS = 6;
  const { calls, events, duration, start } = runSong('__qa', SECONDS);
  const melodic = calls.filter((c) => c.e[1] !== 4);
  const drum = calls.filter((c) => c.e[1] === 4);
  const exp = expectedCount(events, duration, SECONDS);
  const expMel = expectedCount(events.filter((e) => e[1] !== 4), duration, SECONDS);
  const expDrum = exp - expMel;
  if (calls.length !== exp) fail(`排期事件数 ${calls.length}，期望 ${exp}`);
  else ok(`事件排期 ${calls.length} 个 = 期望值`);
  if (melodic.length !== expMel || drum.length !== expDrum) {
    fail(`旋律/鼓 ${melodic.length}/${drum.length}，期望 ${expMel}/${expDrum}`);
  } else ok(`旋律 ${melodic.length} / 鼓 ${drum.length}`);

  const seen = new Set();
  let prev = -Infinity;
  for (const c of calls) {
    if (c.when < prev - 1e-9) fail('排期时间倒退');
    prev = c.when;
    const loop = Math.floor((c.when - start) / duration + 1e-9);
    const key = `${loop}:${(c.when - start - loop * duration).toFixed(3)}:${c.e[1]}:${c.e[3]}`;
    if (seen.has(key)) fail(`同一事件重复排期 ${key}`);
    seen.add(key);
  }
  ok('每轮每个事件恰好排一次、时间单调');
  if (calls.some((c) => !Number.isFinite(c.when))) fail('出现 NaN 排期时间');
  // 循环边界：最后一轮事件时间必须越过 duration，证明第二轮接上了
  if (duration * 2 > SECONDS) fail('测试窗口太短，未跨两个循环');
  else ok('循环跨轮排期正常');
}

/* ---------- 2. 切歌 / 关开 ---------- */
console.log('[2] 切歌与开关');
{
  audio._stopMusic();
  audio.playMusic('__qa');
  audio.setMusic(true);
  const first = audio._songName;
  audio.playMusic('title');
  const second = audio._songName;
  audio.setMusic(false);
  const off = audio._musicOn;
  audio.setMusic(true);
  const on = audio._musicOn;
  audio._stopMusic();
  if (first !== '__qa' || second !== 'title') fail('playMusic 未切换曲目');
  else ok('切歌正常');
  if (off || !on) fail(`setMusic 状态异常 off=${off} on=${on}`);
  else ok('setMusic(false/true) 正常');
}

/* ---------- 3. 正式曲库逐首体检 ---------- */
const KEYS = ['title', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'extra', 'gameover', 'ending'];
console.log('[3] 曲库排期');
for (const name of KEYS) {
  const song = SONGS[name];
  if (!song) { fail(`缺少曲目 ${name}`); continue; }
  const totalNotes = (song.tracks || []).reduce((a, t) => a + (t.notes || []).length, 0) + (song.drums || []).length;
  const { calls } = runSong(name, Math.min(12, song.duration + 1));
  const expect = totalNotes * Math.max(1, Math.floor(12 / song.duration) + 1);
  const uniq = new Set(calls.map((c) => `${c.e[0]}:${c.e[1]}:${c.e[3]}`));
  console.log(`  ${name}: ${song.duration.toFixed(1)}s notes=${totalNotes} scheduled=${calls.length} unique=${uniq.size}`);
  if (!calls.length) fail(`${name} 没有排上任何音`);
  if (uniq.size < Math.min(totalNotes, 10)) fail(`${name} 排期覆盖太少`);
  if (calls.some((c) => !Number.isFinite(c.when))) fail(`${name} 排期含 NaN`);
  void expect;
}
console.log(failed ? `\n${failed} 项失败` : '\n全部通过 ✓');
process.exit(failed ? 1 : 0);
