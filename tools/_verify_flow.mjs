// 验证主流程：难度选择（4 项，无 EX）→ 难度对应面数 → 角色选择 → N 通关解锁 Extra 并持久化
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9336, W = 1280, H = 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-flow-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
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
  throw new Error('no target');
}
const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};
await send('Page.enable'); await send('Runtime.enable');
const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
});
const boot = async () => {
  await evaluate('window.__game && window.__game.showTitle && window.__game.showTitle()');
  for (let i = 0; i < 80; i++) {
    if (await evaluate('!!window.__game && !!document.querySelector(".overlay:not(.hidden) .buttons")')) return;
    await sleep(150);
  }
  throw new Error('boot fail');
};

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?flow=${Date.now()}` });
await boot();
await evaluate('localStorage.removeItem("hks.progress.v1")');
await evaluate('window.__game.unlockedExtra = false; window.__game.showTitle()');
await sleep(400);

// 1) 标题（未解锁）
const titleLocked = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.overlay:not(.hidden) .buttons .btn')].map(b => ({t:b.textContent.trim(), cls:b.className, d:b.disabled})))`));

// 2) 直接写入进度并刷新 → 解锁态
await evaluate('localStorage.setItem("hks.progress.v1", JSON.stringify({extraUnlocked:true}))');
await send('Page.reload');
await boot();
await sleep(400);
const titleUnlocked = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.overlay:not(.hidden) .buttons .btn')].map(b => ({t:b.textContent.trim(), cls:b.className, d:b.disabled})))`));

// 3) 解锁后点 Extra → 进入 Extra 流程
await evaluate(`document.querySelector('.overlay:not(.hidden) .btn.extra').click()`);
await sleep(300);
const extraEnter = { inExtra: await evaluate('window.__game.inExtra'), state: await evaluate('window.__game.state') };
await evaluate('window.__game.showTitle()');
await sleep(200);

// 4) 开始游戏 → 难度选择
await evaluate('window.__game.showDifficultySelect()');
await sleep(300);
const diffPanel = JSON.parse(await evaluate(`JSON.stringify({
  cards: [...document.querySelectorAll('.overlay:not(.hidden) .diff-card')].map(c => c.textContent.replace(/\\s+/g,' ').trim()),
  count: document.querySelectorAll('.overlay:not(.hidden) .diff-card').length,
  anyExtra: [...document.querySelectorAll('.overlay:not(.hidden) .buttons .btn')].some(b => /Extra/i.test(b.textContent) && !b.classList.contains('diff-card')),
  state: window.__game.state
})`));
let shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('_diff_select.png', Buffer.from(shot.data, 'base64'));

// 5) 面数：E=5，N/H/L=6
const stageCounts = {};
for (const k of ['E', 'N', 'H', 'L']) {
  stageCounts[k] = await evaluate(`(() => { window.__game.difficulty = '${k}'; return window.__game._mainStages().length; })()`);
}

// 6) 选 N → 角色选择（卡片）→ 选灵梦 → 进入剧情
await evaluate(`window.__game.difficulty='N'; window.__game.showCharSelect()`);
await sleep(300);
const charPanel = JSON.parse(await evaluate(`JSON.stringify({
  cards: [...document.querySelectorAll('.overlay:not(.hidden) .cc-card')].map(c => c.textContent.replace(/\\s+/g,' ').trim()),
  count: document.querySelectorAll('.overlay:not(.hidden) .cc-card').length,
})`));
shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('_char_select.png', Buffer.from(shot.data, 'base64'));
await evaluate(`window.__game.char='reimu'; window.__game.startGame()`);
await sleep(300);
const started = { state: await evaluate('window.__game.state'), levelIndex: await evaluate('window.__game.levelIndex'), inExtra: await evaluate('window.__game.inExtra') };

// 7) 模拟 N 全六面通关 → 解锁 + 本地保存
await evaluate('window.__game._playDialogue = (s, cb) => {}; window.__game.difficulty = "N"; window.__game.inExtra = false; window.__game._onAllCleared()');
const unlockAfterClear = {
  unlocked: await evaluate('window.__game.unlockedExtra'),
  saved: await evaluate('localStorage.getItem("hks.progress.v1")'),
};

// 8) 刷新后仍解锁
await send('Page.reload');
await boot();
await sleep(500);
const titleAfterReload = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('.overlay:not(.hidden) .buttons .btn')].map(b => ({t:b.textContent.trim(), cls:b.className, d:b.disabled})))`));

// 清理测试进度，避免影响用户实际体验
await evaluate('localStorage.removeItem("hks.progress.v1")');

console.log('RESULT', JSON.stringify({
  titleLocked, titleUnlocked, extraEnter, diffPanel, stageCounts,
  charPanel, started, unlockAfterClear, titleAfterReload, errors,
}, null, 2));
ws.close(); proc.kill(); await sleep(300); process.exit(0);
