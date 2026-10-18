// 模拟玩家从 Boss 场入口边缘向右走/跳，检查是否会掉出地图或卡住
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9413;
const URL0 = 'http://127.0.0.1:8138/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-s6w-'));

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
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(1000);
  await ev('window.__game.startStage(5)');
  await sleep(600);
  for (let i = 0; i < 80; i++) {
    const active = await ev('!!(window.__game.dialogue && window.__game.dialogue.active)');
    if (!active) break;
    await ev('window.__game.dialogue.advance()');
    await sleep(100);
  }
  await sleep(600);

  const res = await ev(`(() => {
    const s = window.__game.stage; const p = s.player;
    const T = 32;
    const startCol = 3664;
    p.x = startCol * T; p.y = 23 * T - p.h - 4; p.vx = 0; p.vy = 0; p.alive = true;
    const fake = {
      _h: new Set(['right']),
      down(a) { return this._h.has(a); },
      pressed() { return false; },
      released() { return false; },
      get axisX() { return this._h.has('right') ? 1 : this._h.has('left') ? -1 : 0; },
      endFrame() {},
    };
    const trace = [];
    const dt = 1 / 60;
    for (let i = 0; i < 240; i++) {
      p.update(dt, fake);
      if (i % 6 === 0) trace.push([i, Math.round(p.x), Math.round(p.y), Math.round(p.vy), p.onGround ? 1 : 0]);
      if (p.y > s.level.h + 80) { trace.push(['FELL', i, Math.round(p.x), Math.round(p.y)]); break; }
    }
    return JSON.stringify({ h: s.level.h, w: s.level.w, end: { x: Math.round(p.x), y: Math.round(p.y), onGround: p.onGround, alive: p.alive }, trace });
  })()`);
  const data = JSON.parse(res);
  console.log('level h=', data.h, 'w=', data.w);
  console.log('end=', JSON.stringify(data.end));
  for (const t of data.trace) console.log(t.join('\t'));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { proc.kill(); } catch {}
  process.exit(0);
}
