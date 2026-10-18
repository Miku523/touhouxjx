// 把 EXTRA 结局曲（endingW）从真实运行中的 WebAudio 总线录成 16kHz 单声道 WAV，
// 用于人工试听「柔和化」效果 + 波形自检。
// 用法: node tools/_render_ending_wav.mjs [url] [out.wav] [seconds]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const OUT = process.argv[3] || join(process.cwd(), '_preview_endingW.wav');
const SECS = Number(process.argv[4] || 62);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9351);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-wav-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('没有拿到 CDP target');
}

let ws = null;
let id = 0;
const pending = new Map();
const errs = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error('EVAL: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result && r.result.value;
}

function wavHeader(dataBytes, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);              // PCM
  h.writeUInt16LE(1, 22);              // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);       // byte rate
  h.writeUInt16LE(2, 32);              // block align
  h.writeUInt16LE(16, 34);             // bits
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

try {
  const t = await getTarget();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errs.push((msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || '').split('\n')[0]);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', { url: `${URL0}?rendwav=${Date.now()}` });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(600);

  await ev(`(() => { window.__game.audio.unlock(); return 'ok'; })()`);
  for (let i = 0; i < 40; i++) {
    if (await ev('!!(window.__game.audio && window.__game.audio.ctx)')) break;
    await sleep(200);
  }

  await ev(`(() => { const g = window.__game; g.char = 'reimu'; g._playEnding('extra'); return 'ok'; })()`);
  await sleep(1200);

  const info = await ev(`(() => {
    const a = window.__game.audio;
    const ctx = a.ctx;
    window.__cap = [];
    window.__capOn = false;
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => {
      if (!window.__capOn) return;
      window.__cap.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    a._musicGain.connect(sp);
    sp.connect(ctx.destination);
    window.__sp = sp;
    window.__capOn = true;
    return { sr: ctx.sampleRate, state: ctx.state, song: a._song && a._song.key, on: a._songSoft };
  })()`);
  console.log('capture:', JSON.stringify(info));

  await sleep(SECS * 1000);

  const meta = await ev(`(() => {
    window.__capOn = false;
    const cap = window.__cap;
    let n = 0;
    for (const c of cap) n += c.length;
    const flat = new Float32Array(n);
    let off = 0;
    for (const c of cap) { flat.set(c, off); off += c.length; }
    window.__cap = null;
    window.__flat = flat;
    return { samples: n, sr: window.__sr };
  })()`);
  const sr = await ev('window.__game.audio.ctx.sampleRate');
  console.log('raw:', (meta.samples / sr).toFixed(1), 's @', sr, 'Hz');

  const DS = Math.round(sr / 16000);
  const rate = sr / DS;
  const blocks = [];
  const step = Math.floor(sr * DS * 3); // 每次 ~3 秒
  for (let start = 0; start < meta.samples; start += step) {
    const b64 = await ev(`(() => {
      const flat = window.__flat, ds = ${DS};
      const start = ${start}, end = Math.min(${start} + ${step}, flat.length);
      const n = Math.floor((end - start) / ds);
      const i16 = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = 0; k < ds; k++) s += flat[start + i * ds + k];
        const v = Math.max(-1, Math.min(1, s / ds));
        i16[i] = Math.round(v * 32767);
      }
      const bytes = new Uint8Array(i16.buffer);
      let out = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      }
      return btoa(out);
    })()`);
    blocks.push(Buffer.from(b64, 'base64'));
    await sleep(40);
  }
  const data = Buffer.concat(blocks);
  writeFileSync(OUT, Buffer.concat([wavHeader(data.length, rate), data]));
  console.log('写出', OUT, (data.length / 1024).toFixed(0) + ' KB', rate + 'Hz', (data.length / 2 / rate).toFixed(1) + 's');
  if (errs.length) console.log('JS 异常:', errs.slice(0, 3).join(' | '));
} catch (e) {
  console.error('RENDER ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
