// 验证假设：_settingsMuted 快照过期 → 每次按键 _applyAudio() 把静音状态打回去
// 用法: node tools/_bug_mutesnap.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8145/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9403);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-mute-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools target');
}
let ws, id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.text || '') + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};
const KEYS = { ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 }, KeyM: { key: 'm', code: 'KeyM', vk: 77 } };
async function tap(name) {
  const k = KEYS[name];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, text: k.key.length === 1 ? k.key : undefined });
  await sleep(30);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
}
const st = () => ev(`(() => { const g = window.__game, a = g.audio;
  return { muted: a._muted, settingsMuted: g._settingsMuted, master: a._master ? +a._master.gain.value.toFixed(3) : null, ctx: a.ctx && a.ctx.state, state: g.state };
})()`);

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(600);
  // 写入「上次静音过」的存档，然后刷新
  await ev(`localStorage.setItem('hks.settings.v1', JSON.stringify({ muted: true, musicOn: true, musicVolume: 0.8, sfxVolume: 1, frameCap: 0, lives: 3, difficulty: 'N', sfxOn: true })); 1`);
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(800);

  console.log('[A] 载入后（存档 muted=true）', JSON.stringify(await st()));
  await tap('ArrowLeft');
  await sleep(300);
  console.log('[B] 按一下任意键之后', JSON.stringify(await st()));

  // 模拟用户按 M 解除静音
  await ev(`window.__game.audio.setMuted(false); 1`);
  await sleep(300);
  console.log('[C] 解除静音后', JSON.stringify(await st()));
  await tap('ArrowLeft');
  await sleep(300);
  const after = await st();
  console.log('[D] 再按任意键之后', JSON.stringify(after));
  console.log(after.muted ? '  ✗ BUG 复现：任意键把静音又打回来了' : '  ✓ 未复现');

  // 反向：存档 muted=false，按 M 静音后按键是否被解除
  await ev(`localStorage.setItem('hks.settings.v1', JSON.stringify({ muted: false, musicOn: true, musicVolume: 0.8, sfxVolume: 1, frameCap: 0, lives: 3, difficulty: 'N', sfxOn: true })); 1`);
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(800);
  await tap('ArrowLeft');
  await sleep(200);
  await ev(`window.__game.audio.setMuted(true); 1`);
  await sleep(200);
  console.log('[E] 静音后', JSON.stringify(await st()));
  await tap('ArrowLeft');
  await sleep(300);
  console.log('[F] 再按任意键之后（期望仍然静音）', JSON.stringify(await st()));
} catch (e) {
  console.error('PROBE ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
