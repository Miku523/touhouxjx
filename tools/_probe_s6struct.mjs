// 探测游戏对象结构，便于把玩家放到 stage6 最后一段
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9411;
const URL0 = 'http://127.0.0.1:8138/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-s6-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
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
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p(d); }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const rr = r.result;
  if (rr?.exceptionDetails) throw new Error('eval: ' + (rr.exceptionDetails.exception?.description || rr.exceptionDetails.text || ''));
  return rr?.result?.value;
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 60; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  console.log('booted:', await ev('!!window.__game'));
  console.log('game keys:', await ev('Object.keys(window.__game).join(",")'));
  console.log('game proto:', await ev('(window.__game.constructor && window.__game.constructor.name) || ""'));
  console.log('stage?:', await ev('window.__game.stage ? Object.keys(window.__game.stage).slice(0,40).join(",") : "NO"'));
  console.log('scene/state:', await ev('JSON.stringify({state: window.__game.state, scene: window.__game.scene, mode: window.__game.mode})'));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { proc.kill(); } catch {}
  process.exit(0);
}
