// 验证标题菜单 Extra 锁定态：灰显、不可点、不可选、无提示；解锁后可进入
// 用法：node tools/_verify_extra_lock.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const W = 1280, H = 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-extra-'));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};

const key = async (code) => {
  const vk = { ArrowDown: 40, ArrowUp: 38, Enter: 13, KeyE: 69 }[code] ?? 0;
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(120);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?verify=${Date.now()}` });

let ready = false;
for (let i = 0; i < 80; i++) {
  ready = await evaluate('!!window.__game && !!document.querySelector(".overlay:not(.hidden) .buttons")');
  if (ready) break;
  await sleep(150);
}
if (!ready) throw new Error('game did not boot to title');

await sleep(600);
// 清掉可能存在的持久化进度，保证锁定态
await evaluate('localStorage.removeItem("hks.progress.v1")');
await evaluate('window.__game.unlockedExtra = false; window.__game.showTitle();');
await sleep(300);

const buttonsExpr = `JSON.stringify([...document.querySelectorAll('.overlay:not(.hidden) .buttons .btn')].map((b, i) => ({
  i, text: b.textContent.trim().replace(/\\s+/g, ' '),
  cls: b.className, disabled: b.disabled,
  hotkey: b._spec && b._spec.hotkey || null,
})))`;
const before = JSON.parse(await evaluate(buttonsExpr));
const locked = before.find((b) => b.cls.includes('locked'));
const extraIdx = before.findIndex((b) => b.text.startsWith('Extra'));

const state0 = await evaluate('window.__game.state');
// 1) 点击锁定项：必须是 no-op
await evaluate(`document.querySelector('.btn.locked').click()`);
await sleep(250);
const afterClick = {
  state: await evaluate('window.__game.state'),
  inExtra: await evaluate('window.__game.inExtra'),
  panel: await evaluate('document.querySelector(".overlay:not(.hidden)")?.className || ""'),
};
// 2) 键盘 E 快捷键：必须是 no-op
await key('KeyE');
const afterKeyE = {
  state: await evaluate('window.__game.state'),
  inExtra: await evaluate('window.__game.inExtra'),
};
// 3) 方向键选择必须跳过锁定项
await evaluate('window.__game.showTitle()');
await sleep(200);
const selLabels = [];
for (let i = 0; i < 4; i++) {
  await key('ArrowDown');
  selLabels.push(await evaluate('(document.querySelector(".btn.sel")||{}).textContent?.trim() || null'));
}
// 4) Enter 在选中项上不会进入 Extra（此时应选中“退出游戏”以外的项，仅记录）
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('_extra_locked.png', Buffer.from(shot.data, 'base64'));

// 5) 解锁后：标题菜单恢复可点 + 快捷键 E 能进入
await evaluate('window.__game.unlockedExtra = true; window.__game.showTitle();');
await sleep(300);
const unlocked = JSON.parse(await evaluate(buttonsExpr));
await key('KeyE');
await sleep(400);
const afterUnlockKeyE = {
  inExtra: await evaluate('window.__game.inExtra'),
  state: await evaluate('window.__game.state'),
  overlay: await evaluate('document.querySelector(".overlay:not(.hidden)")?.className || ""'),
};
// 恢复锁定态进度（不污染真实存档：直接清掉）
await evaluate('localStorage.removeItem("hks.progress.v1")');

console.log('RESULT', JSON.stringify({
  state0,
  extraIdx,
  locked,
  before,
  afterClick,
  afterKeyE,
  selLabels,
  unlockedExtra: unlocked.find((b) => b.text.startsWith('Extra')),
  afterUnlockKeyE,
}, null, 2));
ws.close();
proc.kill();
await sleep(300);
process.exit(0);
