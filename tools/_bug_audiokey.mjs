// 复现「按任意键后游戏静音」：真实 CDP 键盘事件 + 真实音频链路 RMS 测量
// 用法: node tools/_bug_audiokey.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8145/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9401);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-akey-'));
// 注意：故意不加 --autoplay-policy=no-user-gesture-required，模拟真实浏览器
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
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
  ShiftLeft: { key: 'Shift', code: 'ShiftLeft', vk: 16 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  KeyM: { key: 'm', code: 'KeyM', vk: 77 },
  KeyB: { key: 'b', code: 'KeyB', vk: 66 },
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  KeyZ: { key: 'z', code: 'KeyZ', vk: 90 },
};
async function tap(name) {
  const k = KEYS[name];
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
    text: k.key.length === 1 ? k.key : undefined,
  });
  await sleep(30);
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
  });
}

/** 装一个挂到 master 输出的分析器，测 300ms 真实 RMS */
const installAnalyser = () => ev(`(() => {
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

const probe = () => ev(`(() => {
  const g = window.__game, a = g && g.audio;
  if (!a) return null;
  return {
    state: g.state, song: a.currentSong, musicOn: a._musicOn, requested: a._musicRequested,
    ctx: a.ctx && a.ctx.state, muted: a._muted, gameMusicOn: g.musicOn,
    masterGain: a._master ? a._master.gain.value : null,
    musicGain: a._musicGain ? a._musicGain.gain.value : null,
    sfxGain: a._sfxGain ? a._sfxGain.gain.value : null,
    voices: a._musicVoices ? a._musicVoices.size : null,
    events: a._events ? a._events.length : null,
    t: a.ctx ? +a.ctx.currentTime.toFixed(2) : null,
    notes: window.__cnt || null,
  };
})()`);

async function show(label) {
  const s = await probe();
  const r = await rms();
  console.log(`  [${label}] rms=${typeof r === 'number' ? r.toFixed(5) : r}  ${JSON.stringify(s)}`);
  return { s, r };
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}?bugkey=${Date.now()}` });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(800);

  // 计数钩子：装在任何手势之前
  await ev(`(() => {
    const a = window.__game.audio;
    window.__cnt = { note: 0, drum: 0, music: 0 };
    const o1 = a._musicNote.bind(a), o2 = a._scheduleDrum.bind(a);
    a._musicNote = (...x) => { window.__cnt.note++; return o1(...x); };
    a._scheduleDrum = (...x) => { window.__cnt.drum++; return o2(...x); };
    return 1;
  })()`);

  console.log('[0] 手势前（autoplay 策略下 ctx 应为 null）');
  await show('before');

  console.log('[1] 按下第一个键 ShiftLeft（真实 CDP 键盘事件）');
  await tap('ShiftLeft');
  await sleep(400);
  await installAnalyser();
  await sleep(400);
  await show('after-key1');

  console.log('[2] 再按一下 ArrowLeft');
  await tap('ArrowLeft');
  await sleep(700);
  await show('after-key2');

  console.log('[3] 再按 KeyZ');
  await tap('KeyZ');
  await sleep(700);
  await show('after-key3');

  console.log('[4] 鼠标点击页面中心（对照手势）');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: W / 2, y: H / 2, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: W / 2, y: H / 2, button: 'left', clickCount: 1 });
  await sleep(700);
  await show('after-click');

  console.log('[5] 再按键 KeyM（静音动作键）');
  await tap('KeyM');
  await sleep(700);
  await show('after-M');

  console.log('[6] JS 异常:', errors.length ? errors.slice(0, 5) : 'none');
} catch (e) {
  console.error('PROBE ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
