/**
 * 静音回归：真的按键，确认「任何键都不会改动静音状态」。
 * 用法: node tools/_qa_mute.mjs [url]
 *
 * 覆盖：
 *  1. 进游戏后按 M 静音 → 再按移动键仍是静音（旧 bug：任意键按 _settingsMuted 快照打回）
 *  2. 再按 M 解除静音 → 再按移动键仍在播
 *  3. 设置页「全部静音」行切换后，按键不会把它翻回去
 *  4. 静音状态落盘：刷新后仍然是静音；解除后刷新也仍然是解除
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8145/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9405);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-muteqa-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools target');
}
let ws, id = 0;
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
const KEYS = {
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  Space: { key: ' ', code: 'Space', vk: 32 },
  KeyZ: { key: 'z', code: 'KeyZ', vk: 90 },
  KeyX: { key: 'x', code: 'KeyX', vk: 88 },
  KeyK: { key: 'k', code: 'KeyK', vk: 75 },
  KeyC: { key: 'c', code: 'KeyC', vk: 67 },
  ShiftLeft: { key: 'Shift', code: 'ShiftLeft', vk: 16 },
  KeyP: { key: 'p', code: 'KeyP', vk: 80 },
  KeyR: { key: 'r', code: 'KeyR', vk: 82 },
  KeyQ: { key: 'q', code: 'KeyQ', vk: 81 },
  Digit1: { key: '1', code: 'Digit1', vk: 49 },
  Slash: { key: '/', code: 'Slash', vk: 191 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  KeyM: { key: 'm', code: 'KeyM', vk: 77 },
  KeyS: { key: 's', code: 'KeyS', vk: 83 },
};
async function tap(name) {
  const k = KEYS[name];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, text: k.key.length === 1 ? k.key : undefined });
  await sleep(20);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
  await sleep(90);
}
const st = () => ev(`(() => { const g = window.__game, a = g.audio;
  return { state: g.state, muted: a._muted, settingsMuted: g._settingsMuted,
    musicOn: a._musicOn, voices: a._musicVoices.size, ctx: a.ctx && a.ctx.state,
    master: a._master ? +a._master.gain.value.toFixed(3) : null };
})()`);

let failed = 0;
const check = (label, cond, detail) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? '   ' + detail : ''}`);
  if (!cond) failed++;
};

async function boot(fresh = false) {
  if (fresh) {
    await send('Page.navigate', { url: `${URL0}?muteqa=${Date.now()}` });
    for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
    await sleep(700);
  }
  await tap('ArrowRight'); // 首个手势：解锁音频
  await sleep(300);
}

/** 一路按 Enter 进到关卡内（state === 'play'） */
async function enterPlay() {
  for (let i = 0; i < 40; i++) {
    const s = await ev('window.__game.state');
    if (s === 'play') return true;
    await tap('Enter');
    await sleep(180);
  }
  return (await ev('window.__game.state')) === 'play';
}

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
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
  await send('Page.navigate', { url: `${URL0}?muteqa=${Date.now()}` });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(700);
  await boot(true);

  console.log('[1] 进关');
  const inPlay = await enterPlay();
  check('已进入关卡（state=play）', inPlay, `state=${(await st()).state}`);

  console.log('[2] 关卡内 M 静音');
  await tap('KeyM');
  let s = await st();
  check('按下 M 后静音', s.muted === true, JSON.stringify(s));
  await tap('ArrowRight');
  s = await st();
  check('再按移动键仍是静音（不许被快照打回）', s.muted === true, JSON.stringify(s));

  console.log('[3] 再按 M 解除静音');
  await tap('KeyM');
  s = await st();
  check('解除静音', s.muted === false, JSON.stringify(s));
  await tap('ArrowRight');
  s = await st();
  check('再按移动键仍在放音', s.muted === false && s.musicOn === true, JSON.stringify(s));

  console.log('[4] 乱按一通：任何键都不许改动静音状态，BGM 必须一直在响');
  await ev(`(() => {
    const a = window.__game.audio;
    if (!a.ctx || !a._master) return 'no-ctx';
    if (!window.__an) {
      window.__an = a.ctx.createAnalyser();
      window.__an.fftSize = 2048;
      a._master.connect(window.__an);
      window.__buf = new Float32Array(window.__an.fftSize);
    }
    return 'ok';
  })()`);
  const rms = () => ev(`(() => {
    const an = window.__an;
    if (!an) return -1;
    an.getFloatTimeDomainData(window.__buf);
    let s = 0;
    for (let i = 0; i < window.__buf.length; i++) s += window.__buf[i] * window.__buf[i];
    return Math.sqrt(s / window.__buf.length);
  })()`);
  // 单帧取样会正好落进音符之间的空隙（同一轮里既能读到 0.11 也能读到 0.00000），
  // 所以一次「有声」判定取 300ms 内的峰值，而不是单帧。
  const peakRms = async (reads = 6, gap = 50) => {
    let mx = 0;
    for (let i = 0; i < reads; i++) { mx = Math.max(mx, Number(await rms())); await sleep(gap); }
    return mx;
  };
  const spam = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyX', 'KeyK',
    'KeyC', 'ShiftLeft', 'Digit1', 'Slash', 'Tab', 'Backspace', 'ArrowRight', 'ArrowLeft'];
  let minRms = 1, muteHits = 0;
  for (const k of spam) {
    await tap(k);
    const r = await peakRms();
    const s2 = await st();
    if (s2.muted) muteHits++;
    if (s2.state === 'play') minRms = Math.min(minRms, r);
    if (s2.state !== 'play') { // 误触暂停：继续，重新回到关卡
      await tap('Escape');
      await sleep(150);
    }
  }
  s = await st();
  check('乱按后没有变静音', muteHits === 0 && s.muted === false, `muteHits=${muteHits} muted=${s.muted}`);
  check('音乐仍在发声（RMS > 0）', minRms > 0.0005, `minRms=${minRms.toFixed(5)}`);

  console.log('[5] 设置页「全部静音」行');
  await tap('Escape'); // 暂停菜单
  await sleep(200);
  await tap('KeyS');   // 设置
  await sleep(250);
  await ev(`(() => { const b = window.__game.menuButtons.find((x) => x._spec?.hotkey === 'KeyM'); b && b.click(); return !!b; })()`);
  await sleep(250);
  s = await st();
  check('设置行切换后静音', s.muted === true, JSON.stringify(s));
  await tap('ArrowRight');
  s = await st();
  check('设置页里按键仍是静音', s.muted === true, JSON.stringify(s));

  console.log('[6] 刷新后静音状态保留');
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(700);
  await boot();
  s = await st();
  check('刷新后仍然静音', s.muted === true, JSON.stringify(s));
  await ev(`window.__game.audio.setMuted(false); window.__game._settingsMuted = false; window.__game._saveSettings(); 1`);
  await sleep(200);
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(700);
  await boot();
  s = await st();
  check('解除静音后刷新仍是解除', s.muted === false, JSON.stringify(s));

  console.log('[6] JS 异常');
  check('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(failed ? `\n${failed} 项失败` : '\n静音回归全部通过 ✓');
  process.exitCode = failed ? 1 : 0;
} catch (e) {
  console.error('PROBE ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
