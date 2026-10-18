// 修复验证 3：人为延迟标题三张图 1.8s，确认启动幕一直盖着，揭幕时界面+人物同时出现
// 只拦 src/art/gen/* 图片请求，不影响 JS 加载（复现用户弱网下「先界面后人物」的时序）
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9373);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-slowimg-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 100; i++) {
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
let paused = 0;
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
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
};

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
    if (m.method === 'Fetch.requestPaused') {
      paused++;
      const rid = m.params.requestId;
      setTimeout(() => { send('Fetch.continueRequest', { requestId: rid }).catch(() => {}); }, 1800);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*art/gen/*', requestStage: 'Request' }] });

  const t0 = Date.now();
  await send('Page.navigate', { url: `${URL0}?slowimg=${t0}` });

  let bootDoneAt = null, revealState = null, earlyShot = false;
  const timeline = [];
  for (let i = 0; i < 200; i++) {
    await sleep(50);
    const s = JSON.parse(await ev(`JSON.stringify((() => {
      const boot = document.getElementById('boot');
      const g = window.__game;
      return {
        t: Math.round(performance.now()),
        bootVisible: boot ? !boot.classList.contains('done') : false,
        overlay: !document.getElementById('overlay')?.classList.contains('hidden'),
        bg: g?._titleBgImg ? { c: g._titleBgImg.complete, nw: g._titleBgImg.naturalWidth } : null,
        chars: g?._titleCharImgs ? Object.fromEntries(Object.entries(g._titleCharImgs).map(([k, im]) => [k, { c: im.complete, nw: im.naturalWidth }])) : null,
        charDrawn: !!g?._titleCharImgs?.reimu?.complete,
      };
    })())`));
    timeline.push({ t: s.t, boot: s.bootVisible, bg: s.bg?.nw || 0, chars: s.chars?.reimu?.nw || 0 });
    if (!earlyShot && s.t > 700) { await shot('_fix_slow_still_boot.png'); earlyShot = true; }
    if (!s.bootVisible && bootDoneAt == null) {
      bootDoneAt = s.t;
      revealState = s;
      await shot('_fix_slow_reveal_now.png');
      await sleep(700);
      await shot('_fix_slow_revealed.png');
      break;
    }
  }
  console.log('PAUSED_REQUESTS', paused);
  console.log('BOOT_DONE_AT', bootDoneAt);
  console.log('REVEAL_STATE', JSON.stringify(revealState));
  console.log('TIMELINE', JSON.stringify(timeline.filter((_, i) => i % 4 === 0 || i === timeline.length - 1)));
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
}
