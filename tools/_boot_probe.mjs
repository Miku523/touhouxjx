// 临时：抓页面启动错误
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9342;
const profile = mkdtempSync(join(tmpdir(), 'edge-boot-'));
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
    logs.push('LOG ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push('ENTRY ' + msg.params.entry.level + ' ' + msg.params.entry.text + ' @' + (msg.params.entry.url || ''));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?boot=${Date.now()}` });
await sleep(4000);
const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({game: !!window.__game, title: document.title, url: location.href})', returnByValue: true });
console.log(r.result.value);
console.log(logs.join('\n'));
ws.close();
proc.kill();
