// 修复验证 2：标题揭幕瞬间素材是否齐、键盘是否解锁音频、命中音效名是否可播
// 用法: node tools/_qa_reveal.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9372);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-reveal-'));
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
      window.__qaReveal = null;
      window.__qaBoot = { at: null, bg: null, chars: null };
      // 在启动幕结束时记录标题素材状态（必须全部 decode 完成）
      new MutationObserver(() => {
        const boot = document.getElementById('boot');
        if (boot && boot.classList.contains('done') && window.__qaBoot.at == null) {
          const g = window.__game || {};
          window.__qaBoot = {
            at: Math.round(performance.now()),
            bg: g._titleBgImg ? { c: g._titleBgImg.complete, nw: g._titleBgImg.naturalWidth } : null,
            chars: g._titleCharImgs ? Object.fromEntries(Object.entries(g._titleCharImgs).map(([k, im]) => [k, { c: im.complete, nw: im.naturalWidth }])) : null,
            state: g.state || null,
          };
        }
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true });
      document.addEventListener('DOMContentLoaded', () => {
        const boot = document.getElementById('boot');
        if (boot) {
          window.__qaBoot.bgAtDom = null;
          window.__qaBoot.visibleAtDom = !boot.classList.contains('done') && getComputedStyle(boot).visibility !== 'hidden';
        }
      });
    `,
  });

  const t0 = Date.now();
  await send('Page.navigate', { url: `${URL0}?qa=${t0}` });

  // 等 game 建好
  let readyAt = null;
  for (let i = 0; i < 400; i++) {
    await sleep(100);
    const ok = await ev('!!window.__game');
    if (ok) { readyAt = Date.now() - t0; break; }
  }
  const pre = await ev(`JSON.stringify({
    readyAt: ${readyAt},
    bootDone: document.getElementById('boot')?.classList.contains('done'),
    overlay: !document.getElementById('overlay')?.classList.contains('hidden'),
    bg: (() => { const g = window.__game; return g?._titleBgImg ? { c: g._titleBgImg.complete, nw: g._titleBgImg.naturalWidth } : null; })(),
    chars: (() => { const g = window.__game; if (!g?._titleCharImgs) return null; const o = {}; for (const [k, im] of Object.entries(g._titleCharImgs)) o[k] = { c: im.complete, nw: im.naturalWidth }; return o; })(),
  })`);
  await shot('_fix_boot_game_ready.png');

  // 等启动幕结束
  let done = null;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    done = await ev('document.getElementById("boot")?.classList.contains("done")');
    if (done) break;
  }
  await sleep(700); // 等 0.55s 淡出
  const reveal = await ev('JSON.stringify(window.__qaBoot)');
  await shot('_fix_title_revealed.png');

  // 键盘解锁音频
  await ev('window.__unlockCount = 0; (() => { const au = window.__game.audio; au.__o = au.__o || au.unlock.bind(au); au.unlock = function(){ window.__unlockCount++; return au.__o(); }; })()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(250);
  const audio = await ev(`JSON.stringify({
    unlockCount: window.__unlockCount || 0,
    ctx: !!window.__game.audio?.ctx,
    state: window.__game.audio?.ctx?.state || null,
  })`);

  // 五个音效名直接播一遍，确认合成器不抛错
  const sfx = await ev(`JSON.stringify((() => {
    const g = window.__game; const out = {};
    for (const n of ['coin','shotHit','enemyKill','bossHit','stomp']) {
      try { g.audio.play(n); out[n] = 'ok'; } catch (e) { out[n] = 'ERR ' + e.message; }
    }
    // 事件 -> 音效映射（捕获 play 调用）
    const log = [];
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (n) => { log.push(n); };
    g._onStageEvent('coin', {});
    g._onStageEvent('shotHit', {});
    g._onStageEvent('enemyKill', {});
    g._onStageEvent('bossHit', {});
    g._onStageEvent('stomp', {});
    g.audio.play = orig;
    return { plays: out, events: log, sfxAt: g._sfxAt || null };
  })())`);

  console.log('READY', pre);
  console.log('BOOT_DONE', done, reveal);
  console.log('AUDIO', audio);
  console.log('SFX', sfx);
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
}
