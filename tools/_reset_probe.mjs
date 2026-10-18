// 临时验证：标题 → 设置 → 重置进度 → EXTRA 重新封闭
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9347;
const BASE = 'http://127.0.0.1:8137';
const profile = mkdtempSync(join(tmpdir(), 'edge-reset-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + JSON.stringify(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const t = msg.params.args.map((a) => a.value ?? a.description).join(' ');
    if (!/Frame|fps/i.test(t)) logs.push('LOG ' + t);
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push('ENTRY ' + msg.params.entry.level + ' ' + msg.params.entry.text);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('EVAL ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join('tools', name), Buffer.from(r.data, 'base64'));
};
const waitGame = async () => {
  for (let i = 0; i < 80; i++) {
    const ok = await evalJs('!!(window.__game && window.__game.menuButtons && window.__game.menuButtons.length)');
    if (ok) return true;
    await sleep(250);
  }
  return false;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

// 1) 写一个"已通关解锁 EXTRA"的存档，重新加载
await send('Page.navigate', { url: `${BASE}/index.html?reset=${Date.now()}` });
await waitGame();
await evalJs(`localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true }))`);
await send('Page.reload', { ignoreCache: true });
await waitGame();
await sleep(1200);

const before = await evalJs(`(() => {
  const extra = document.querySelector('.overlay .btn.extra');
  return {
    unlockedExtra: window.__game.unlockedExtra,
    stored: localStorage.getItem('hks.progress.v1'),
    extraDisabled: extra ? !!extra.disabled : null,
    extraText: extra ? extra.textContent.replace(/\\s+/g, ' ').trim() : null,
    title: window.__game.titleEl ? window.__game.titleEl.textContent : null,
  };
})()`);

// 2) 标题 → 设置
await evalJs(`(() => {
  const b = [...document.querySelectorAll('.overlay .btn')].find((x) => /SETTINGS/.test(x.textContent));
  if (!b) throw new Error('no settings btn');
  b.click();
})()`);
await sleep(700);
const settings = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.overlay .btn')];
  const reset = btns.find((x) => /重置进度/.test(x.textContent));
  return {
    page: window.__game._page,
    resetFound: !!reset,
    resetText: reset ? reset.textContent.replace(/\\s+/g, ' ').trim() : null,
    resetDanger: reset ? reset.classList.contains('set-foot-danger') : null,
    total: btns.length,
  };
})()`);
await shot('_reset_settings.png');

// 3) 打开确认页（顺带检查默认高亮落在"取消"）
await evalJs(`[...document.querySelectorAll('.overlay .btn')].find((x) => /重置进度/.test(x.textContent)).click()`);
await sleep(600);
const confirm = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.overlay .btn')];
  return {
    title: window.__game.titleEl.textContent,
    subtitle: window.__game.subtitleEl.textContent,
    buttons: btns.map((b) => b.textContent.replace(/\\s+/g, ' ').trim()),
    selected: btns[window.__game.menuIndex] ? btns[window.__game.menuIndex].textContent.replace(/\\s+/g, ' ').trim() : null,
    screenMode: window.__game.overlay.classList.contains('screen-mode'),
  };
})()`);
await shot('_reset_confirm.png');

// 4) 先点"取消"，应回到设置页且存档不动
await evalJs(`[...document.querySelectorAll('.overlay .btn')].find((x) => /取消/.test(x.textContent)).click()`);
await sleep(600);
const afterCancel = await evalJs(`({
  page: window.__game._page,
  stored: localStorage.getItem('hks.progress.v1'),
  unlockedExtra: window.__game.unlockedExtra,
})`);

// 5) 再进确认 → 确认重置
await evalJs(`[...document.querySelectorAll('.overlay .btn')].find((x) => /重置进度/.test(x.textContent)).click()`);
await sleep(500);
await evalJs(`[...document.querySelectorAll('.overlay .btn')].find((x) => /确认重置/.test(x.textContent)).click()`);
await sleep(900);
const after = await evalJs(`(() => {
  const extra = document.querySelector('.overlay .btn.extra');
  return {
    unlockedExtra: window.__game.unlockedExtra,
    stored: localStorage.getItem('hks.progress.v1'),
    extraDisabled: extra ? !!extra.disabled : null,
    extraText: extra ? extra.textContent.replace(/\\s+/g, ' ').trim() : null,
    hint: window.__game.hintEl ? window.__game.hintEl.textContent : null,
    page: window.__game._page,
  };
})()`);
await shot('_reset_after.png');

// 6) 刷新后仍应保持封闭
await send('Page.reload', { ignoreCache: true });
await waitGame();
await sleep(1200);
const persist = await evalJs(`(() => {
  const extra = document.querySelector('.overlay .btn.extra');
  return {
    unlockedExtra: window.__game.unlockedExtra,
    stored: localStorage.getItem('hks.progress.v1'),
    extraDisabled: extra ? !!extra.disabled : null,
  };
})()`);

// 7) 暂停来源的设置页不应该出现"重置进度"
await evalJs(`window.__game.startGame()`);
await sleep(1600);
await evalJs(`window.__game._pause()`);
await sleep(500);
await evalJs(`window.__game._showSettings(0, 'pause')`);
await sleep(600);
const pauseSide = await evalJs(`(() => {
  const btns = [...document.querySelectorAll('.overlay .btn')];
  return {
    origin: window.__game._settingsOrigin,
    resetFound: btns.some((x) => /重置进度/.test(x.textContent)),
    retryFound: btns.some((x) => /重新开始本关/.test(x.textContent)),
  };
})()`);
await shot('_reset_settings_pause.png');

console.log(JSON.stringify({ before, settings, confirm, afterCancel, after, persist, pauseSide, logs: logs.slice(0, 25) }, null, 2));
ws.close();
proc.kill();
