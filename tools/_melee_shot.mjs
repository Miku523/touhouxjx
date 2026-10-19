// 平台关近战演出截图：破势条 / 可踩箭头 / 硬直 STAGGER / 俯冲落地冲击波
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9338;
const profile = mkdtempSync(join(tmpdir(), 'edge-melee-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await r.json();
    page = list.find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?melee=${Date.now()}` });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(600);

const setup = await ev(`(async () => {
  const g = window.__game;
  g.startStage(1);
  await new Promise((r) => setTimeout(r, 300));
  const s = g.stage;
  try { g.dialogue?.close(); } catch (e) {}
  g.state = 'play'; s.state = 'play';
  s.beginBoss();
  const b = s.boss;
  const p = s.player;
  p.alive = true; p.hearts = 999; p.invuln = 9999;
  p.x = b.x - 150; p.y = s.level.h - 92;
  if (s.camera?.snapTo) s.camera.snapTo(b.x - 240);
  b.state = 'battle'; b.alpha = 1; b.spellLock = 0;
  b.x = b.homeX; b.y = b.baseY;
  document.getElementById('overlay')?.classList.add('hidden');
  document.getElementById('dialogue')?.classList.add('hidden');
  return JSON.stringify({ bx: Math.round(b.x), by: Math.round(b.y), ground: b.groundY, melee: b.platformMelee });
})()`);
console.log('SETUP', setup);

async function frame(n = 1) {
  await ev(`(() => { const g = window.__game; for (let i = 0; i < ${n}; i++) g.update(1 / 60); g.render(0); return 1; })()`);
  await sleep(120);
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('node:fs');
  fs.writeFileSync(name, Buffer.from(r.data, 'base64'));
  console.log('SHOT', name);
}

// A：破势半满，悬停中（看破势条位置）
await ev(`(() => { const b = window.__game.stage.boss; b.poise = 52; b._diveCd = 99; return 1; })()`);
await frame(2);
await shot('melee-a-poise.png');

// B：破势打满 → 坠地硬直（看 STAGGER / 眩晕星 / 可踩箭头）
await ev(`(() => { const b = window.__game.stage.boss; b.poise = 100; b._addPoise(0.1); return 1; })()`);
await frame(40);
const st = await ev(`(() => { const b = window.__game.stage.boss; return JSON.stringify({ staggerT: b.staggerT.toFixed(2), y: Math.round(b.y), poiseMax: b.poiseMax }); })()`);
console.log('STAGGER', st);
await shot('melee-b-stagger.png');

// C：俯冲落地（看冲击波 + 可踩箭头）
await ev(`(() => { const b = window.__game.stage.boss; b.staggerT = 0; b.y = b.baseY; b._dive.state = 'idle'; b._diveCd = 0; return 1; })()`);
for (let i = 0; i < 200; i++) {
  const ds = await ev(`(() => { const b = window.__game.stage.boss; return b._dive.state; })()`);
  await frame(1);
  if (ds === 'land') break;
}
await frame(3);
const dv = await ev(`(() => { const b = window.__game.stage.boss; return JSON.stringify({ dive: b._dive.state, y: Math.round(b.y), bullets: window.__game.stage.bullets.activeCount }); })()`);
console.log('DIVE', dv);
await shot('melee-c-dive.png');

try { ws.close(); } catch {}
try { proc.kill(); } catch {}
process.exit(0);
