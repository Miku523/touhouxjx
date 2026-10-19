// 实机输入验收：真的按键跑图 + 射击，看整条链路是否报错、演出是否正常
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9356;
const profile = mkdtempSync(join(tmpdir(), 'edge-play-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`,
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
if (!page) { console.log('no page'); proc.kill(); process.exit(1); }

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
  } else if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EVAL_ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join('tools', name), Buffer.from(r.data, 'base64'));
  console.log('shot ->', name);
};
const key = async (type, code, keyName, keyCode) => {
  await send('Input.dispatchKeyEvent', {
    type, code, key: keyName, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
  });
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: `http://127.0.0.1:8139/index.html?play=${Date.now()}` });
await sleep(4000);

// 直接开局，然后按住空格把开场对白过完
await evl(`window.__game.startGame()`);
await sleep(600);
for (let i = 0; i < 30; i++) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await sleep(260);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await sleep(140);
}
console.log('ready:', await evl(`JSON.stringify({state: window.__game.state, stage: !!window.__game.stage, x: Math.round(window.__game.stage?.player?.x ?? -1)})`));

// 按住 → + Z 跑图射击 3 秒
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyZ', key: 'z', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await sleep(3000);
await shot('_probe3_play.png');
const mid = await evl(`(() => {
  const g = window.__game, s = g.stage, p = s.player;
  return JSON.stringify({ state: g.state, time: Math.round(s.time*10)/10, x: Math.round(p.x), facing: p.facing,
    shots: s.shots.pool.filter(b=>b.active).length, special: s.shots.pool.filter(b=>b.active&&b.special).length,
    power: Math.round(p.power), lv: p.fireLevel, extend: s.extendPts, lives: p.lives, fps: g.loop?.fps });
})()`);
console.log('running:', mid);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyZ', key: 'z', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
await sleep(500);

// 放符卡（真实按键 X），先补足 POWER 到 14
await evl(`window.__game.stage.player.power = 14`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyX', key: 'x', windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88 });
await sleep(160);
const cutinNow = await evl(`(() => { const c = document.getElementById('spellCutin');
  const p = document.querySelector('#scPortrait');
  return JSON.stringify({ show: c.classList.contains('show'), cls: c.className, op: p ? getComputedStyle(p).opacity : null,
    name: document.getElementById('scName')?.textContent, castFx: Math.round(window.__game.stage.castFx*100)/100 }); })()`);
console.log('cutinNow:', cutinNow);
await shot('_probe3_cast.png');
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyX', key: 'x', windowsVirtualKeyCode: 88, nativeVirtualKeyCode: 88 });
console.log('cast:', await evl(`(() => { const s = window.__game.stage; const c = document.getElementById('spellCutin');
  return JSON.stringify({ show: c.classList.contains('show'), castFx: Math.round(s.castFx*100)/100, power: Math.round(s.player.power), lv: s.player.fireLevel, state: window.__game.state }); })()`));
await sleep(1500);
console.log('afterCast:', await evl(`(() => { const s = window.__game.stage; const c = document.getElementById('spellCutin');
  return JSON.stringify({ show: c.classList.contains('show'), castFx: Math.round(s.castFx*100)/100, power: Math.round(s.player.power), lv: s.player.fireLevel }); })()`));

console.log('logs:', logs.join(' | ') || '(none)');
ws.close();
proc.kill();
