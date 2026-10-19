// 真实循环里验证俯冲 → 落地冲击波 → 可踩窗口
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9340;
const profile = mkdtempSync(join(tmpdir(), 'edge-dive-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 60; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); if (page) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?dive=${Date.now()}` });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(800);
console.log('SETUP', await ev(`(async () => {
  const g = window.__game; g.startStage(0); await new Promise((r) => setTimeout(r, 400));
  try { g.dialogue?.close(); } catch (e) {}
  document.getElementById('overlay')?.classList.add('hidden');
  document.getElementById('dialogue')?.classList.add('hidden');
  const s = g.stage; s.beginBoss(); const b = s.boss;
  b.state = 'battle'; b.alpha = 1; b.spellLock = 0; b.poise = 0;
  b.x = s.player.x + 200; b.homeX = b.x;
  s.player.invuln = 9999; s.player.hearts = 5;
  b._diveCd = 0.3;
  window.__log = [];
  const t0 = performance.now();
  const tick = () => {
    window.__log.push({ t: Math.round(performance.now() - t0), dive: b._dive.state, y: Math.round(b.y), bullets: s.bullets.activeCount, poise: +b.poise.toFixed(1), stagger: +b.staggerT.toFixed(2) });
    if (performance.now() - t0 < 4200) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return 'started';
})()`));
await sleep(4800);
const log = await ev('JSON.stringify(window.__log.filter((_, i) => i % 12 === 0))');
console.log('LOG', log);
console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
try { ws.close(); } catch {}
try { proc.kill(); } catch {}
process.exit(0);
