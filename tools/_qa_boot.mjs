// 修复验证：标题启动幕是否等插画+立绘一起出现；进 Boss 对话前 AI 立绘是否已就绪；键盘是否解锁音频
// 用法: node tools/_qa_boot.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9371);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-boot-'));
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
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__qa = { t0: performance.now(), events: [] };
      window.__pushQa = (k, extra) => window.__qa.events.push(Object.assign({ k, t: Math.round(performance.now()) }, extra || {}));
      const origImage = window.Image;
      window.Image = function(...a) {
        const img = new origImage(...a);
        img.addEventListener('load', () => window.__pushQa('img-load', { src: img.currentSrc || img.src }));
        return img;
      };
      window.Image.prototype = origImage.prototype;
      document.addEventListener('DOMContentLoaded', () => window.__pushQa('dom-ready'));
      window.addEventListener('load', () => window.__pushQa('window-load'));
    `,
  });

  // 模拟弱网：约 400KB/s + 150ms 延迟，复现「菜单先出现、人物后到」
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: 400 * 1024 / 8, uploadThroughput: 120 * 1024 / 8,
  });

  const t0 = Date.now();
  await send('Page.navigate', { url: `${URL0}?qa=${t0}` });

  const snaps = [];
  for (let i = 0; i < 70; i++) {
    await sleep(150);
    const s = await ev(`JSON.stringify((() => {
      const boot = document.getElementById('boot');
      const g = window.__game;
      return {
        t: Math.round(performance.now()),
        boot: boot ? !boot.classList.contains('done') : null,
        bootOpacity: boot ? getComputedStyle(boot).opacity : null,
        overlay: (() => { const o = document.getElementById('overlay'); return o ? !o.classList.contains('hidden') : null; })(),
        bg: g?._titleBgImg ? { c: g._titleBgImg.complete, nw: g._titleBgImg.naturalWidth } : null,
        chars: g?._titleCharImgs ? Object.fromEntries(Object.entries(g._titleCharImgs).map(([k, im]) => [k, { c: im.complete, nw: im.naturalWidth }])) : null,
        state: g?.state || null,
      };
    })())`);
    const o = JSON.parse(s);
    snaps.push(o);
    if (i === 3) await shot('_fix_boot_early.png');
    if (!o.boot) { await shot('_fix_boot_done.png'); break; }
  }

  // 恢复正常网速，继续验证对话立绘
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await sleep(600);

  // 键盘解锁计数（真实按键）
  await ev(`(() => {
    const au = window.__game?.audio; if (!au) return false;
    window.__unlockCount = 0;
    if (!au.__origUnlock) {
      au.__origUnlock = au.unlock.bind(au);
      au.unlock = function() { window.__unlockCount++; return au.__origUnlock(); };
    }
    return true;
  })()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(200);
  const unlock = await ev(`JSON.stringify({ count: window.__unlockCount || 0, ctx: !!window.__game?.audio?.ctx, state: window.__game?.audio?.ctx?.state || null })`);

  // 强制进第一关并触发战前对话
  const dlg = await ev(`(async () => {
    const g = window.__game;
    if (!g) return JSON.stringify({ err: 'no game' });
    // 回到标题态，避免 Enter 已经进了某页
    g.showTitle();
    g.char = 'reimu';
    const def = g._mainStages()[0];
    g._createStage(def, 0, false, { skipIntro: true });
    // 记录 dialogue.play 的时刻与 AI 图加载时刻
    window.__dlgPlayAt = null;
    const origPlay = g.dialogue.play.bind(g.dialogue);
    g.dialogue.play = (script, opts) => {
      window.__dlgPlayAt = performance.now();
      window.__dlgScript = script;
      return origPlay(script, opts);
    };
    const t = performance.now();
    g._onBossTrigger();
    // 等对话真正开始
    for (let i = 0; i < 40; i++) {
      if (window.__dlgPlayAt != null) break;
      await new Promise(r => setTimeout(r, 50));
    }
    await new Promise(r => setTimeout(r, 700));
    const rumia = performance.getEntriesByType('resource').filter(e => /gen\\/rumia\\.png$/.test(e.name))[0];
    return JSON.stringify({
      state: g.state,
      active: g.dialogue.active,
      left: g.dialogue.leftChar,
      right: g.dialogue.rightChar,
      dlgPlayAt: window.__dlgPlayAt,
      rumia: rumia ? { start: Math.round(rumia.startTime), end: Math.round(rumia.responseEnd), size: rumia.transferSize } : null,
      aiLoadedBeforePlay: !!(rumia && window.__dlgPlayAt != null && rumia.responseEnd <= window.__dlgPlayAt),
      sinceCreateMs: window.__dlgPlayAt != null ? Math.round(window.__dlgPlayAt - t) : null,
      unlockCount: window.__unlockCount,
      audioCtx: !!g.audio?.ctx,
      audioState: g.audio?.ctx?.state || null,
      qa: window.__qa.events.filter(e => e.k === 'img-load' && /title|rumia/.test(e.src)).map(e => ({ t: e.t, src: e.src.split('/').slice(-1)[0] })),
    });
  })()`);
  await shot('_fix_bossdlg.png');
  console.log('SNAPS_LAST3', JSON.stringify(snaps.slice(-3)));
  console.log('UNLOCK', unlock);
  console.log('DIALOGUE', dlg);
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
}
