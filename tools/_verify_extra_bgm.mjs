// EXTRA 结局（W1/W2）BGM 验证：曲目切换 / 曲目数据 / 柔和总线是否挂上 / 无异常。
// 运行：node tools/_verify_extra_bgm.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const W = 1280, H = 720;
const BASE = 'http://127.0.0.1:8137/index.html';
const OUT = 'C:/Users/GuSheng/Downloads/HKS';

const profile = mkdtempSync(join(tmpdir(), 'edge-extrabgm-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.text || '') + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
};

const probe = () => ev(`(() => {
  const g = window.__game, a = g && g.audio;
  if (!a) return null;
  const s = a._song || {};
  return {
    state: g.state, song: a.currentSong, musicOn: a._musicOn,
    ctx: a.ctx && a.ctx.state,
    events: a._events ? a._events.length : 0,
    duration: s.duration, tracks: (s.tracks || []).length,
    drums: (s.drums || []).length, soft: !!s.soft,
    songSoft: !!a._songSoft, softIn: !!a._softIn,
    voices: a._musicVoices.size,
    endingKey: g.ending && g.ending.spec ? g.ending.spec.key : null,
    cnt: window.__cnt ? { ...window.__cnt } : null,
  };
})()`);

const problems = [];
const check = (label, cond, detail) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) problems.push(label);
};

try {
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${BASE}?qaextrabgm=${Date.now()}` });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(700);

  await ev(`(() => {
    const a = window.__game.audio;
    a.unlock();
    window.__cnt = { note: 0, drum: 0 };
    const o1 = a._musicNote.bind(a), o2 = a._scheduleDrum.bind(a);
    a._musicNote = (...x) => { window.__cnt.note++; return o1(...x); };
    a._scheduleDrum = (...x) => { window.__cnt.drum++; return o2(...x); };
    return 'ok';
  })()`);
  await sleep(600);

  console.log('[1] EXTRA 胜利 · 灵梦 → W1');
  await ev(`(() => {
    const g = window.__game;
    g.difficulty = 'N'; g.char = 'reimu'; g.unlockedExtra = true; g.inExtra = true;
    g._playEnding('extra');
    return 'ok';
  })()`);
  await sleep(1200);
  let s = await probe();
  console.log('   ', JSON.stringify(s));
  check('切到 endingW 曲', s.song === 'endingW', `song=${s.song}`);
  check('进入 ending 状态', s.state === 'ending', `state=${s.state}`);
  check('曲目是 W1 结局', s.endingKey === 'edW1', `key=${s.endingKey}`);
  check('曲目数据非空', s.events > 0 && s.duration > 30, `ev=${s.events} dur=${s.duration}`);
  check('歌曲带 soft 标记', s.soft === true && s.songSoft === true);
  check('柔和总线已建立', s.softIn === true);
  check('正在发声（音符 + 鼓）', s.cnt.note > 0, `note=${s.cnt.note}`);
  await shot('_vgm_w1_ending.png');

  console.log('[2] 播 6 秒确认持续排期 + 循环数据');
  const before = s.cnt.note;
  await sleep(6000);
  s = await probe();
  check('持续发声', s.musicOn && s.cnt.note > before, `note ${before} → ${s.cnt.note}`);
  check('仍无异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('[3] EXTRA 胜利 · 魔理沙 → W2');
  await ev(`(() => { const g = window.__game; g.char = 'marisa'; g._playEnding('extra'); return 'ok'; })()`);
  await sleep(1000);
  s = await probe();
  console.log('   ', JSON.stringify(s));
  check('W2 同样是 endingW', s.song === 'endingW' && s.endingKey === 'edW2', `song=${s.song} key=${s.endingKey}`);
  await shot('_vgm_w2_ending.png');

  console.log('[4] 回归：真结局仍是原创 ending 曲，且不走柔和总线');
  await ev(`(() => { const g = window.__game; g.char = 'reimu'; g._playEnding('main'); return 'ok'; })()`);
  await sleep(1000);
  s = await probe();
  console.log('   ', JSON.stringify(s));
  check('普通结局仍用 ending', s.song === 'ending', `song=${s.song}`);
  check('普通结局不走柔和总线', s.songSoft === false && s.softIn === true);

  console.log('[5] 柔和度实测：同一个 220Hz 方波分别过「柔和总线」和「直连总线」，比频谱质心');
  const toneTest = async (via) => ev(`(async () => {
    const a = window.__game.audio;
    const ctx = a.ctx;
    const dest = ${JSON.stringify('__X__')} === 'soft' ? a._softIn : a._musicGain;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0.1;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    osc.connect(g);
    g.connect(dest);
    an.connect(mute);
    mute.connect(ctx.destination);
    a._musicGain.connect(an);
    osc.start();
    const td = new Float32Array(an.fftSize);
    const fd = new Float32Array(an.frequencyBinCount);
    const hzPerBin = ctx.sampleRate / an.fftSize;
    let cSum = 0, rSum = 0, frames = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 1400) {
      await new Promise((r) => setTimeout(r, 100));
      an.getFloatFrequencyData(fd);
      an.getFloatTimeDomainData(td);
      let num = 0, den = 0;
      for (let i = 1; i < fd.length; i++) {
        const p = Math.pow(10, fd[i] / 20);
        num += i * hzPerBin * p;
        den += p;
      }
      if (den > 0) { cSum += num / den; frames++; }
      let ss = 0;
      for (let i = 0; i < td.length; i++) ss += td[i] * td[i];
      rSum += Math.sqrt(ss / td.length);
    }
    osc.stop();
    try { osc.disconnect(); g.disconnect(); } catch (e) {}
    try { a._musicGain.disconnect(an); } catch (e) {}
    an.disconnect();
    mute.disconnect();
    return { via: ${JSON.stringify(via)}, centroid: Math.round(cSum / Math.max(1, frames)),
             rms: +((rSum / Math.max(1, frames)) * 1000).toFixed(1), frames };
  })()`.replace('"__X__"', JSON.stringify(via)));
  await ev(`(() => { const g = window.__game; g.char = 'reimu'; g._playEnding('extra'); return 'ok'; })()`);
  await sleep(1200);
  await ev(`(() => { window.__game.audio.setMusic(false); return 'ok'; })()`);
  await sleep(900);
  let tSoft = await toneTest('soft');
  console.log('   ', JSON.stringify(tSoft));
  let tDry = await toneTest('dry');
  console.log('   ', JSON.stringify(tDry));
  check('柔和总线砍掉了高频（质心明显更低）',
    tSoft.centroid > 0 && tSoft.centroid < tDry.centroid * 0.85,
    `soft=${tSoft.centroid}Hz dry=${tDry.centroid}Hz`);
  await ev(`(() => { window.__game.audio.setMusic(true); return 'ok'; })()`);
  await sleep(1500);

  const measure = async (label) => ev(`(async () => {
    const a = window.__game.audio;
    const ctx = a.ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 4096;
    an.smoothingTimeConstant = 0.1;
    a._musicGain.connect(an);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    an.connect(mute);
    mute.connect(ctx.destination);
    const td = new Float32Array(an.fftSize);
    const fd = new Float32Array(an.frequencyBinCount);
    const hzPerBin = ctx.sampleRate / an.fftSize;
    let cSum = 0, rSum = 0, peak = 0, frames = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      await new Promise((r) => setTimeout(r, 120));
      an.getFloatFrequencyData(fd);
      an.getFloatTimeDomainData(td);
      let num = 0, den = 0;
      for (let i = 1; i < fd.length; i++) {
        const p = Math.pow(10, fd[i] / 20);
        num += i * hzPerBin * p;
        den += p;
      }
      if (den > 0) { cSum += num / den; frames++; }
      let ss = 0;
      for (let i = 0; i < td.length; i++) { ss += td[i] * td[i]; peak = Math.max(peak, Math.abs(td[i])); }
      rSum += Math.sqrt(ss / td.length);
    }
    an.disconnect(); mute.disconnect();
    return { label: ${JSON.stringify(label)}, centroid: Math.round(cSum / Math.max(1, frames)),
             rms: +((rSum / Math.max(1, frames)) * 1000).toFixed(1),
             peak: +peak.toFixed(3), frames };
  })()`);
  const mSoft = await measure('soft');
  console.log('   ', JSON.stringify(mSoft));
  check('音量不炸（峰值 < 0.9）', mSoft.peak < 0.9, `peak=${mSoft.peak}`);
  check('确实有声音（RMS > 5‰）', mSoft.rms > 5, `rms=${mSoft.rms}‰`);

  console.log('[6] 音量对照：stage1 BOSS 曲 vs endingW');
  await ev(`(() => { window.__game.audio.playMusic('stage1'); return 'ok'; })()`);
  await sleep(2000);
  const mBoss = await measure('stage1');
  console.log('   ', JSON.stringify(mBoss));
  const ratio = mBoss.rms > 0 ? mSoft.rms / mBoss.rms : 0;
  check('结局曲比 BOSS 曲轻（0.3–1.0 倍），但不至于听不见',
    ratio > 0.3 && ratio <= 1.0,
    `ending=${mSoft.rms}‰ boss=${mBoss.rms}‰ ratio=${ratio.toFixed(2)}`);

  console.log('[7] JS 异常');
  check('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(problems.length ? `\n${problems.length} 项失败: ${problems.join('; ')}` : '\nEXTRA 结局 BGM 验证通过 ✓');
  process.exitCode = problems.length ? 1 : 0;
} catch (e) {
  console.error('PROBE ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
