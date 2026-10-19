// 真实输入冒烟：真实键盘事件驱动自机移动/射击/跳跃，检查运行时错误与位移
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9339;
const profile = mkdtempSync(join(tmpdir(), 'edge-smoke-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--mute-audio', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
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
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?smoke=${Date.now()}` });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(800);

const boot = await ev(`(async () => {
  const g = window.__game;
  g.startStage(0);
  await new Promise((r) => setTimeout(r, 400));
  try { g.dialogue?.close(); } catch (e) {}
  document.getElementById('overlay')?.classList.add('hidden');
  document.getElementById('dialogue')?.classList.add('hidden');
  return JSON.stringify({ state: g.state, sstate: g.stage?.state, mode: g.stage?.mode, x: Math.round(g.stage?.player?.x ?? -1) });
})()`);
console.log('BOOT', boot);

const key = (type, code, keyName, keyCode) => send('Input.dispatchKeyEvent', {
  type, code, key: keyName, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
});
// 右移 + 射击 1.6s
await key('keyDown', 'ArrowRight', 'ArrowRight', 39);
await key('keyDown', 'KeyX', 'x', 88);
await sleep(900);
await key('keyDown', 'Space', ' ', 32);
await sleep(120);
await key('keyUp', 'Space', ' ', 32);
await sleep(600);
const mid = await ev(`(() => { const p = window.__game.stage?.player; return JSON.stringify({ x: Math.round(p?.x ?? -1), y: Math.round(p?.y ?? -1), shots: window.__game.stage?.playerShots?.activeCount ?? -1, hearts: p?.hearts, jumpsLeft: p?.jumpsLeft }); })()`);
console.log('MID', mid);
await key('keyUp', 'KeyX', 'x', 88);
await key('keyUp', 'ArrowRight', 'ArrowRight', 39);

// 进入 Boss 战再跑 2s，确认近战系统在真实循环里无异常
const boss = await ev(`(async () => {
  const s = window.__game.stage;
  s.beginBoss();
  s.boss.state = 'battle'; s.boss.alpha = 1;
  s.boss.x = s.player.x + 160;
  await new Promise((r) => setTimeout(r, 2200));
  const b = s.boss;
  return JSON.stringify({ boss: b.key, melee: b.platformMelee, y: Math.round(b.y), dive: b._dive.state, poise: +b.poise.toFixed(1), bullets: s.bullets.activeCount, bossHp: Math.round(b.hp) });
})()`);
console.log('BOSS', boss);
console.log('ERRORS', JSON.stringify(errors.slice(0, 6)));
try { ws.close(); } catch {}
try { proc.kill(); } catch {}
process.exit(0);
