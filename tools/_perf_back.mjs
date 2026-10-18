// 倒序任务专用：帧预算压力测试（只测逻辑 update 与 render 的耗时，不追求画面）
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a[v.slice(2)] = arr[i + 1]; return a; }, {});
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(argv.port || 9351);
const profile = mkdtempSync(join(tmpdir(), 'edge-perf-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
if (!page) { console.log(JSON.stringify({ error: 'no page' })); proc.kill(); process.exit(1); }
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
  }
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?boot=${Date.now()}` });
await sleep(3500);
const r = await send('Runtime.evaluate', { expression: `JSON.stringify({game:!!window.__game})`, returnByValue: true });
if (!JSON.parse(r.result.value).game) { console.log(JSON.stringify({ error: 'boot', logs })); ws.close(); proc.kill(); process.exit(1); }
const expr = `(async () => {
  const g = window.__game;
  const warm = ${Number(argv.secs || 150)} * 60, meas = ${Number(argv.frames || 900)};
  g.carryPower = 128;
  if (${argv.extra ? 'true' : 'false'}) { g.unlockedExtra = true; g.startExtra(); }
  else { g.levelIndex = ${Number(argv.stage || 5)}; g.startStage(${Number(argv.stage || 5)}); }
  const mod = await import('/tools/_sim_bot_back.js?t=' + Date.now());
  const bot = mod.install({ god: true, maxRetries: 0 });
  for (let i = 0; i < warm; i++) bot.run(1);
  const s = g.stage, b = s.boss;
  const nb = () => { const pl = s.bullets && s.bullets.pool; if (!pl) return 0; let n = 0; for (let i = 0; i < pl.length; i++) if (pl[i].active) n++; return n; };
  const upd = [], ren = [], bl = [];
  const hasRender = typeof g.render === 'function';
  const batch = 30;
  for (let k = 0; k < 12; k++) {
    bl.push(nb());
    let t0 = performance.now();
    for (let i = 0; i < batch; i++) g.update(1/60);
    upd.push((performance.now() - t0) / batch);
    if (hasRender) { t0 = performance.now(); for (let i = 0; i < 5; i++) g.render(); ren.push((performance.now() - t0) / 5); }
  }
  const q = (a, p) => { if (!a.length) return null; const c = a.slice().sort((x, y) => x - y); return +Number(c[Math.min(c.length - 1, Math.floor(c.length * p))]).toFixed(2); };
  return JSON.stringify({
    diff: g.difficulty, extra: !!g.inExtra !== undefined ? g.inExtra : null, stageName: s.name,
    boss: b ? { name: b.name || b.def?.name, hp: Math.round(b.hp), maxHp: Math.round(b.maxHp || 0), spellIdx: b.spellIdx } : null,
    bullets: { max: Math.max(...bl), med: q(bl, 0.5), p95: q(bl, 0.95) },
    update: { p50: q(upd, 0.5), p95: q(upd, 0.95), max: q(upd, 0.999), avg: +(upd.reduce((a, c) => a + c, 0) / upd.length).toFixed(2), frames: upd.length },
    render: ren.length ? { p50: q(ren, 0.5), p95: q(ren, 0.95), avg: +(ren.reduce((a, c) => a + c, 0) / ren.length).toFixed(2) } : null,
    heads: { MAX_BULLETS: typeof MAX_BULLETS !== 'undefined' ? MAX_BULLETS : null, gstate: g.state, sstate: s.state }
  });
})()`;
const out = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
if (out.exceptionDetails) console.log(JSON.stringify({ error: out.exceptionDetails.text + ' ' + (out.exceptionDetails.exception?.description || ''), logs }, null, 1));
else console.log(JSON.stringify({ perf: JSON.parse(out.result.value), logs }, null, 1));
ws.close(); proc.kill();
