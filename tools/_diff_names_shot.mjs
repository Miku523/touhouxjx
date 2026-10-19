// 难度改名后的视觉核对：截「选择难度」整屏 + 读出四张卡的中文名
// 用法: node tools/_diff_names_shot.mjs [outPng]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '_diff_rename.png';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9351;
const profile = mkdtempSync(join(tmpdir(), 'edge-names-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
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
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?names=${Date.now()}` });

let ready = false;
for (let i = 0; i < 120; i++) {
  ready = await evaluate('!!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) throw new Error('game did not boot');

await evaluate('window.__game.showTitle(); window.__game.showDifficultySelect(); true');
await sleep(700);

const texts = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('.diff-card')].map((c) => ({
    key: (c.querySelector('.dc-key')?.textContent || '').trim(),
    cn: (c.querySelector('.dc-cn')?.textContent || '').trim(),
    en: (c.querySelector('.dc-en')?.textContent || '').trim(),
  }));
  const detail = document.querySelector('.diff-detail')?.innerText.replace(/\\s+/g, ' ').trim() || '';
  return { cards, detail };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));

// 主角选择页的「当前难度」副标题也要跟着变
await evaluate(`window.__game.difficulty = 'L'; window.__game.showCharSelect(); true`);
await sleep(500);
const sub = await evaluate(`(() => {
  const el = document.querySelector('.panel-sub, .ov-sub, .sub, .panel-subtitle');
  return el ? el.textContent.trim() : (document.body.innerText.match(/当前难度：[^\\n]*/) || [''])[0];
})()`);
console.log('CHAR_SELECT_SUB', sub);
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out.replace(/\.png$/i, '_charselect.png'), Buffer.from(shot2.data, 'base64'));
console.log(JSON.stringify(texts, null, 2));
ws.close();
proc.kill();
console.log('SAVED', out);
