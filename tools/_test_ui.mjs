// 交互自测：node tools/_test_ui.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1280, H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9700 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'edge-test-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + JSON.stringify(msg.params.exceptionDetails?.exception?.description || msg.params));
  }
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?t=${Date.now()}` });
let ready = false;
for (let i = 0; i < 100; i++) {
  ready = await evaluate('!!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) throw new Error('boot failed');
await sleep(400);

const script = `(() => {
  const g = window.__game;
  const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  const out = {};

  // 1) 难度页：方向键移动 + 详情联动 + 数字快捷键
  g.showDifficultySelect();
  out.overlayCls = document.getElementById('overlay').className;
  out.startIndex = g.menuIndex;
  press('ArrowDown');
  out.afterDown = g.menuIndex;
  out.detailHasHard = /困难|HARD/.test(document.querySelector('.diff-detail').textContent);
  press('ArrowRight');
  out.afterRight = g.menuIndex;
  press('ArrowUp');
  press('ArrowUp');
  out.afterUp2 = g.menuIndex;
  out.selCount = document.querySelectorAll('.diff-card.sel').length;
  press('KeyE');
  out.hotkeyLeadsTo = document.getElementById('title').textContent;
  out.difficultyAfterHotkey = g.difficulty;

  // 2) 设置页：点击 / 快捷键 / ←→ 调值 / 帧率分段
  g._showSettings(0, 'title');
  out.setRows = document.querySelectorAll('.set-row').length;
  out.setGroups = [...document.querySelectorAll('.set-group')].map((x) => x.dataset.g);
  press('ArrowDown'); press('ArrowDown');
  out.rowAt2 = g.menuIndex;
  const volBefore = g.audio.musicVolume;
  press('ArrowRight');
  out.musicVol = [volBefore, g.audio.musicVolume];
  out.sldNums = [...document.querySelectorAll('.sld-num')].map((x) => x.textContent);
  press('KeyM');
  out.mutedAfterM = g.audio.muted;
  out.swOn = [...document.querySelectorAll('.sw')].map((x) => x.classList.contains('on'));
  const capBefore = g.frameCap;
  g._showSettings(6, 'title');
  press('ArrowRight');
  out.frameCap = [capBefore, g.frameCap];
  out.segOn = [...document.querySelectorAll('.seg b.on')].map((x) => x.textContent);
  const livesBefore = g.lives;
  g._showSettings(7, 'title');
  press('ArrowRight');
  out.lives = [livesBefore, g.lives];
  out.pipsOn = document.querySelectorAll('.pips i.on').length;
  press('Escape');
  out.backToTitle = !document.getElementById('overlay').classList.contains('screen-mode');

  // 3) 按键页：改键流程
  g.showKeybinds(0);
  out.kbGroups = [...document.querySelectorAll('.set-group')].map((x) => x.dataset.g);
  out.kbSelLabel = document.querySelectorAll('.btn')[g.menuIndex]?.textContent.trim();
  document.querySelectorAll('.kb-row')[0].click();
  out.capturing = !!g._captureAction;
  press('KeyZ');
  out.captureCleared = g._captureAction === null;
  out.leftLabel = g.input.labelFor('left');
  g.input.resetBinds();
  g._showSettings(0, 'title');

  // 4) 选择主角页
  g.showCharSelect();
  out.ccOverlay = document.getElementById('overlay').className;
  out.ccCards = document.querySelectorAll('.cc-card').length;
  out.ccNames = [...document.querySelectorAll('.cc-name')].map((x) => x.textContent);
  out.ccSelIndex = g.menuIndex;
  press('ArrowRight');
  out.ccAfterRight = g.menuIndex;
  out.ccSelOne = document.querySelectorAll('.cc-card.sel').length;
  out.ccHotkeys = [...document.querySelectorAll('.btn')].slice(0, 2).map((b) => b._spec?.hotkey);
  press('Escape');
  out.afterCcEsc = document.getElementById('title').textContent;
  g.showCharSelect();
  document.querySelectorAll('.cc-card')[1].click();
  out.ccPick = [g.char, g.state];
  g.showTitle();

  // 5) 操作说明页
  g.showHelp();
  out.helpGroups = [...document.querySelectorAll('.set-group')].map((x) => x.dataset.g);
  out.helpRows = document.querySelectorAll('.help-row').length;
  out.helpSelLabel = document.querySelectorAll('.btn')[g.menuIndex]?.textContent.trim();
  press('Escape');
  out.afterHelpEsc = document.getElementById('title').textContent;

  return JSON.stringify(out, null, 1);
})()`;

console.log(await evaluate(script));
console.log('LOGS', JSON.stringify(logs));
ws.close();
proc.kill();
await sleep(300);
process.exit(0);
