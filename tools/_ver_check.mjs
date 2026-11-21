// 临时：核对版本水印（.title-ver 文本 + #boot::after 的 content）是否等于 PLATFORM_VERSION
// 用法：node tools/_ver_check.mjs   （需先 python -m http.server 8138 --bind 127.0.0.1）
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9700 + Math.floor(Math.random() * 200);
const URL_BASE = 'http://127.0.0.1:8138/';

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.cwd() + '/.tmp_shots/_edgeprof_ver',
  '--no-first-run', '--disable-gpu', '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await r.json();
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl || null;
  } catch {}
}
if (!wsUrl) { console.error('no devtools'); child.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
const pending = new Map();
let id = 0;
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
});
await new Promise((r) => ws.addEventListener('open', r));

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL_BASE });
await sleep(2500);

const out = await ev(`(() => {
  const tv = document.querySelector('.title-ver');
  const boot = document.querySelector('#boot');
  return {
    titleVerText: tv ? tv.textContent.trim() : null,
    hksVar: getComputedStyle(document.documentElement).getPropertyValue('--hks-ver').trim(),
    bootAfter: boot ? getComputedStyle(boot, '::after').content : null,
    platformVersion: window.__hksPlatform ? 'present' : 'absent',
  };
})()`);
console.log(JSON.stringify(out, null, 2));
ws.close();
child.kill();
process.exit(0);
