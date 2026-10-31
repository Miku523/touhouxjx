/**
 * 音乐卡顿追踪：真实键盘走一遍 标题→选难度→选人→第1面，再跳关 2..6，
 * 每 50ms 采样 AudioEngine 状态 + 包装起播/换曲方法 + longtask。
 * 输出：请求了曲目但没在响的区段（无法播放）、进度停走、长任务。
 */
import { launch, sleep, saveJson } from './_pt_core.mjs';

const PORT = Number(process.env.TRACE_PORT || 9541);
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8138';
const LABEL = process.env.TRACE_LABEL || 'trace';
const WARP = (process.env.TRACE_WARP || '2,3,4,5,6').split(',').map(Number);

const recorder = `(() => {
  const A = window.__game && window.__game.audio;
  if (!A) return 'no-audio';
  if (window.__at) return 'already';
  const L = { t0: performance.now(), ev: [], polls: [], long: [] };
  const now = () => +(performance.now() - L.t0).toFixed(1);
  const safe = (v) => { try { return typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : v; } catch (e) { return String(v); } };
  const wrap = (name) => {
    const f = A[name];
    if (typeof f !== 'function' || f.__wrapped) return;
    const w = function (...args) {
      L.ev.push({ t: now(), m: name, a: args.map(safe) });
      try { return f.apply(this, args); } catch (e) { L.ev.push({ t: now(), m: name + ':ERR', e: String(e) }); throw e; }
    };
    w.__wrapped = true;
    A[name] = w;
  };
  ['playMusic', 'setMusic', 'playOutMusic', '_startMusic', '_beginSong', '_queueSongLoad',
   '_startAudioMusic', '_startAudioStream', '_startSynthMusic', '_fallbackToSynth', '_stopMusic'].forEach(wrap);
  try {
    L.obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) L.long.push({ t: now(), d: Math.round(e.duration) }); });
    L.obs.observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  L.timer = setInterval(() => {
    const p = A.musicProgress;
    L.polls.push({ t: now(), on: !!A._musicOn, req: !!A._musicRequested, cur: A._songName, snd: A.soundingSong,
      swap: A._songSwap, prog: p ? +p.elapsed.toFixed(2) : null, ctx: A.ctx && A.ctx.state,
      pending: A._songLoadPending && A._songLoadPending.name, apending: A._audioPending, stream: !!A._audioStream, fade: A._fadeTimer !== null });
  }, 50);
  window.__at = L;
  return 'ok';
})()`;

const dump = `(() => {
  const L = window.__at; if (!L) return null;
  clearInterval(L.timer); try { L.obs && L.obs.disconnect(); } catch (e) {}
  return { ev: L.ev, polls: L.polls, long: L.long };
})()`;

const T = await launch({ port: PORT, url: BASE + '/index.html' });
const t0 = Date.now();
const ok = await T.waitFor('!!(window.__game && window.__game.audio)', 30000);
if (!ok) throw new Error('game 未启动');
console.log('[trace] audio ready at', Date.now() - t0, 'ms');
await T.eval(recorder);
await T.waitFor('window.__game.state === "menu"', 12000);
await sleep(2500);

const snap = async (tag) => {
  const s = await T.eval(`(() => { const A = window.__game.audio; const p = A.musicProgress; return { state: window.__game.state, page: window.__game._page, cur: A._songName, snd: A.soundingSong, on: !!A._musicOn, req: !!A._musicRequested, prog: p ? +p.elapsed.toFixed(2) : null, ctx: A.ctx && A.ctx.state, swap: A._songSwap, pending: A._songLoadPending && A._songLoadPending.name, apending: A._audioPending, stream: !!A._audioStream }; })()`);
  console.log('[snap]', tag, JSON.stringify(s));
  return s;
};
const pressEnter = async (n = 1, hold = 250) => { for (let i = 0; i < n; i++) { await T.key('Enter'); await sleep(hold); } };
const phase = [];

phase.push('title'); await snap('title');

await pressEnter(1, 900); phase.push('afterEnter1'); await snap('difficulty');
await pressEnter(1, 900); phase.push('afterEnter2'); await snap('charselect');
await pressEnter(1, 900); phase.push('afterEnter3'); await snap('dialogue?');
let presses = 0;
for (; presses < 60; presses++) {
  const st = await T.eval('window.__game.state');
  if (st === 'play') break;
  await T.key('Enter');
  await sleep(220);
}
phase.push('stage1'); await snap('stage1-start');
await sleep(8000);
phase.push('stage1-settled'); await snap('stage1-settled');

for (const n of WARP) {
  await T.eval('window.__game._warpToStage(' + n + ')', { awaitPromise: true }).catch((e) => console.log('[warp err]', n, String(e).slice(0, 120)));
  await sleep(1200);
  await snap('warp' + n);
  await sleep(6000);
  phase.push('stage' + n); await snap('stage' + n + '-settled');
}

const data = await T.eval(dump);
const rep = await T.report();
const out = { label: LABEL, base: BASE, t0: t0, phases: phase, presses: presses, audio: data, errors: rep.errors, warns: rep.warns, netFails: rep.netFails, httpBad: rep.httpBad, resources: rep.resources.filter((r) => /songs|bgm|music/.test(r.n)) };
saveJson('tools/_music_trace_' + LABEL + '.json', out);

const polls = data?.polls || [];
const ev = data?.ev || [];
let silentSpans = [];
let span = null;
for (const p of polls) {
  const silent = p.req && !p.on;
  if (silent) {
    if (!span) span = { from: p.t, to: p.t, song: p.cur, reasons: new Set() };
    span.to = p.t;
    span.reasons.add(p.pending ? 'waiting-module' : (p.apending ? 'waiting-audio' : (p.swap ? 'bridge' : 'unknown')));
  } else if (span) { silentSpans.push({ from: span.from, to: span.to, dur: +(span.to - span.from).toFixed(1), song: span.song, reasons: [...span.reasons] }); span = null; }
}
if (span) silentSpans.push({ from: span.from, to: span.to, dur: +(span.to - span.from).toFixed(1), song: span.song, reasons: [...span.reasons] });
let stalls = [];
let st = null;
for (let i = 1; i < polls.length; i++) {
  const a = polls[i - 1], b = polls[i];
  const stuck = b.on && a.on && a.prog != null && b.prog != null && Math.abs(b.prog - a.prog) < 0.02;
  if (stuck) { if (!st) st = { from: a.t, to: b.t, song: b.cur }; st.to = b.t; }
  else if (st) { if (st.to - st.from > 400) stalls.push({ from: st.from, to: st.to, dur: +(st.to - st.from).toFixed(1), song: st.song }); st = null; }
}
const long = data?.long || [];
console.log('\n== ' + LABEL + ' ==');
console.log('采样', polls.length, '事件', ev.length, '长任务', long.length, 'presses', presses);
console.log('静音区段(请求了但没声):', silentSpans.length ? JSON.stringify(silentSpans) : '无');
console.log('进度停走>400ms:', stalls.length ? JSON.stringify(stalls) : '无');
console.log('长任务>50ms:', long.length ? JSON.stringify(long.slice(0, 15)) : '无');
console.log('errors:', JSON.stringify(rep.errors.slice(0, 5)));
console.log('warns:', JSON.stringify(rep.warns.slice(0, 8)));
console.log('netFails:', JSON.stringify(rep.netFails.slice(0, 5)));
console.log('music assets:', JSON.stringify((out.resources || []).map((r) => r.n + ' ' + r.s + 'B ' + r.d + 'ms')));
console.log('ev:', JSON.stringify(ev.slice(0, 120)));
await T.close();
console.log('saved tools/_music_trace_' + LABEL + '.json');

