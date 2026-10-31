// 故障注入探针：拦截某首曲子的曲库模块，看音乐是否永久静音 / 一直放旧曲
// env: FAULT_TARGET(youma_stage1) FAULT_MODE(fail|delay) FAULT_DELAY(4000) FAULT_COUNT(Infinity)
//      FAULT_LABEL CDP_PORT PT_BASE
// FAULT_COUNT = 故障窗口：只拦前 N 个匹配请求，之后放行（模拟「网络抖一下随后恢复」）
import { writeFileSync } from 'node:fs';
import { launch, BASE } from './_pt_core.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGET = process.env.FAULT_TARGET || 'youma_stage1';
const MODE = process.env.FAULT_MODE || 'fail';
const DELAY = Number(process.env.FAULT_DELAY || 4000);
const LABEL = process.env.FAULT_LABEL || (MODE + '-' + TARGET);
const COUNT = process.env.FAULT_COUNT ? Number(process.env.FAULT_COUNT) : Infinity;
let seen = 0;
const PORT = Number(process.env.CDP_PORT || 9551);

const T = await launch({ port: PORT });
const paused = [];
T.onEvent((d) => {
  if (d.method !== 'Fetch.requestPaused') return;
  const rid = d.params.requestId;
  seen += 1;
  const allow = seen > COUNT; // 故障窗口之外一律放行
  paused.push({ url: d.params.request.url, mode: allow ? 'pass' : MODE, n: seen, t: Date.now() });
  if (allow) {
    T.send('Fetch.continueRequest', { requestId: rid }).catch(() => {});
    return;
  }
  if (MODE === 'fail') {
    T.send('Fetch.failRequest', { requestId: rid, errorReason: 'Failed' }).catch(() => {});
  } else {
    setTimeout(() => { T.send('Fetch.continueRequest', { requestId: rid }).catch(() => {}); }, DELAY);
  }
});
await T.send('Network.setBypassServiceWorker', { bypass: true });
await T.send('Fetch.enable', { patterns: [{ urlPattern: '*songs/' + TARGET + '*', requestStage: 'Request' }] });

const SNIP = [
'(() => {',
'  const g = window.__game, a = g && g.audio;',
'  if (!a) return { err: "no audio" };',
'  const num = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : (v === undefined ? null : v));',
'  return {',
'    t: Math.round(performance.now()),',
'    state: g.state,',
'    on: !!a._musicOn, req: !!a._musicRequested,',
'    cur: a._songName || null, snd: a.soundingSong || null, swap: a._songSwap || null,',
'    prog: num(a.musicProgress), ctx: a.ctx ? a.ctx.state : null,',
'    pend: !!a._songLoadPending, apend: !!a._audioPending, stream: !!a._audioStream,',
'  };',
'})()'
].join('\n');

try {
  await T.nav(BASE + '/index.html?fault=' + encodeURIComponent(LABEL) + '&t=' + Date.now());
  const okGame = await T.waitFor('!!window.__game', 90000, 200);
  if (!okGame) throw new Error('game 未启动');
  await T.eval([
    '(() => {',
    '  const a = window.__game.audio;',
    '  window.__mt = { ev: [], s: [] };',
    '  const names = ["playMusic","setMusic","silenceMusic","playOutMusic","_startMusic","_beginSong","_queueSongLoad","_startAudioMusic","_startAudioStream","_startSynthMusic","_fallbackToSynth","_stopMusic","fadeOutMusic","_warnMissingSong","_beginAudioBuffer","_loadAudioBuffer","unlock","_ensureCtx","_scheduleSongRetry","_retrySongLoad"];',
    '  names.forEach((n) => {',
    '    const f = a[n];',
    '    if (typeof f !== "function") return;',
    '    a[n] = function (...args) {',
    '      try { window.__mt.ev.push({ t: Math.round(performance.now()), n, a: args.map((x) => (typeof x === "string" || typeof x === "number" ? x : (x === null || x === undefined ? x : typeof x))) }); } catch (e) {}',
    '      return f.apply(this, args);',
    '    };',
    '  });',
    '  window.__mtSampler = setInterval(() => { try { window.__mt.s.push(' + SNIP + '); } catch (e) {} }, 50);',
    '  return true;',
    '})()'
  ].join('\n'));
  const bootShown = await T.waitFor('!!document.getElementById("boot")', 30000, 100);
  const revealed = await T.waitFor('document.getElementById("boot") && document.getElementById("boot").classList.contains("done")', 120000, 150);
  const menu = await T.waitFor('window.__game.state === "menu" && !document.getElementById("overlay").classList.contains("hidden")', 20000, 150);
  const snaps = {};
  const take = async (k) => { snaps[k] = await T.eval(SNIP); };
  await sleep(1500); await take('A_title');

  await T.key('Enter'); await sleep(700);
  await T.key('Enter'); await sleep(700);
  await T.key('Enter'); await sleep(700);
  let pressed = 3;
  for (let i = 0; i < 300; i++) {
    const st = await T.eval('window.__game.state');
    if (st === 'play') break;
    await T.key('Enter'); pressed++;
    await sleep(120);
  }
  await sleep(6000); await take('B_stage1');
  const bossRes = await T.eval('(() => { const s = window.__game.stage; if (!s) return "no-stage"; if (!s.beginBoss) return "no-beginBoss"; try { s.beginBoss(); return "called"; } catch (e) { return "throw:" + e.message; } })()');
  await sleep(9000); await take('C_boss');
  await sleep(9000); await take('D_boss2');

  const intro = await T.eval('(async () => { try { const m = await import("/src/engine/songs/index.js"); const song = m.getSong("' + TARGET.replace(/^.*_/, "") + '"); return { keys: Object.keys(m.SONGS), has: !!song, dur: song && song.duration, perf: performance.getEntriesByType("resource").filter((e) => e.name.indexOf("' + TARGET + '") >= 0).map((e) => ({ n: e.name.split("/").pop(), size: e.transferSize, dur: Math.round(e.duration) })) }; } catch (e) { return { err: String(e && e.message) }; } })()');
  const info = await T.eval('(() => { const a = window.__game.audio; return { warned: a._warnedSongs ? Array.from(a._warnedSongs) : null, lastNamed: a._songName || null, swap: a._songSwap || null, state: window.__game.state, levelIndex: window.__game.levelIndex, bootGate: window.__hksBootGate || null }; })()');
  const col = await T.eval([
    '(() => {',
    '  clearInterval(window.__mtSampler);',
    '  const ev = window.__mt.ev, s = window.__mt.s;',
    '  const spans = []; let st = null;',
    '  for (const p of s) {',
    '    const silent = p.req && !p.on;',
    '    if (silent && st == null) st = p.t;',
    '    if (!silent && st != null) { if (p.t - st >= 300) spans.push({ from: st, to: p.t, ms: p.t - st }); st = null; }',
    '  }',
    '  if (st != null) spans.push({ from: st, to: s.length ? s[s.length - 1].t : st, ms: (s.length ? s[s.length - 1].t : st) - st, open: true });',
    '  const curSeen = [...new Set(s.map((p) => p.cur).filter(Boolean))];',
    '  const sndSeen = [...new Set(s.map((p) => p.snd).filter(Boolean))];',
    '  const progByCur = {};',
    '  for (const p of s) { if (p.cur && p.prog != null) { progByCur[p.cur] = progByCur[p.cur] || []; if (progByCur[p.cur].length < 8) progByCur[p.cur].push(p.prog); } }',
    '  return { ev, samples: s.length, spans, curSeen, sndSeen, progByCur };',
    '})()'
  ].join('\n'));

  const warns = T.warns.filter((w) => /\[audio\]|\[music\]|曲目/.test(w));
  const out = { intro, label: LABEL, mode: MODE, target: TARGET, delay: DELAY, pressed, bootShown, revealed, menu, bossRes, info, snaps, paused, warns, errors: T.errors.slice(0, 8), netFails: T.netFails.filter((f) => !f.canceled).slice(0, 8), col };
  writeFileSync('tools/_music_fault_' + LABEL + '.json', JSON.stringify(out, null, 2));
  console.log('=== ' + LABEL + ' ===');
  console.log('bootShown', bootShown, 'revealed', revealed, 'menu', menu, 'pressed', pressed, 'boss', bossRes);
  console.log('paused', JSON.stringify(paused.map((p) => p.url)));
  console.log('curSeen', JSON.stringify(col.curSeen), 'sndSeen', JSON.stringify(col.sndSeen));
  console.log('progByCur', JSON.stringify(col.progByCur));
  console.log('silentSpans', JSON.stringify(col.spans));
  console.log('snaps', JSON.stringify(snaps));
  console.log('intro', JSON.stringify(intro));
  console.log('info', JSON.stringify(info));
  console.log('warns', JSON.stringify(warns.slice(0, 10)));
  console.log('errors', JSON.stringify(out.errors));
  console.log('events', JSON.stringify(col.ev.map((e) => String(e.n) + '@' + Math.round(e.t) + (e.a && e.a.length ? '(' + e.a.join(',') + ')' : ''))));
} finally {
  await T.close();
}
