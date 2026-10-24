// AI 试玩：入口/按键探测（隐藏跳关 Shift+1-6、暂停/恢复、暂停中 R、游戏中 R 重开）
// 用真实 CDP Input.dispatchKeyEvent 走页面 keydown 路径，验证状态机与 console 异常。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const URL_ = opt('url', 'http://127.0.0.1:8138/index.html');
const PORT = Number(opt('port', 9531));
const OUT = opt('out', '_pt/ai/entries_probe.json');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(path.dirname(OUT), { recursive: true });
const profile = mkdtempSync(path.join(tmpdir(), 'hks-probe-'));
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function connect() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
          if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push((m.params.args || []).map((a) => a.value ?? a.description).join(' '));
          if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push('[log] ' + m.params.entry.text);
        };
        return;
      }
    } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('edge devtools connect timeout');
}
async function evalv(expr) {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return { __err: r.exceptionDetails.text };
      return r.result?.value;
    } catch { await sleep(150); }
  }
  return null;
}
async function waitFor(fn, timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = await fn(); if (v) return v; await sleep(200); }
  return null;
}
const MOD = { 1: ['!', 49], 2: ['@', 50], 3: ['#', 51], 4: ['$', 52], 5: ['%', 53], 6: ['^', 54] };
async function tapShiftDigit(n) {
  const [key, vk] = MOD[n];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 8, key, code: `Digit${n}`, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 8, key, code: `Digit${n}`, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(450);
}
async function tap(code, key, vk, modifiers = 0) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(120);
}
const snap = () => evalv(`(()=>{const g=window.__game; if(!g) return null; const s=g.stage; return {state:g.state, levelIndex:g.levelIndex, name:s&&s.name, stageRef:s?1:0, lives:g.lives, continues:g.continues, paused:g.state==='paused', inExtra:!!g.inExtra};})()`);

const res = { url: URL_, steps: [] };
try {
  await connect();
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Page.navigate', { url: URL_ });
  const booted = await waitFor(() => evalv(`!!(window.__game && window.__game.state)`), 30000);
  res.booted = !!booted;
  await sleep(1200);
  res.titleState = await snap();

  // A. 标题页 Shift+1..6：逐面跳关（每次记录 state/levelIndex/name）
  res.steps.push({ phase: 'A-title-warp' });
  for (let n = 1; n <= 6; n++) {
    await tapShiftDigit(n);
    res.steps.push({ warp: n, snap: await snap(), errs: exceptions.length });
  }
  // 回到第1面，测逐级
  await tapShiftDigit(1);
  res.steps.push({ warpBack1: await snap() });

  // B. 游戏中 R 重开：stage 对象应被替换
  await evalv(`window.__stageRef = window.__game.stage; window.__stageRefId = window.__game.stage && window.__game.stage.name;`);
  await tap('KeyR', 'r', 82);
  const afterR = await evalv(`(()=>{const g=window.__game; return {same: g.stage===window.__stageRef, state:g.state, name:g.stage&&g.stage.name};})()`);
  res.steps.push({ phase: 'B-play-R-restart', afterR });

  // C. 暂停/恢复（Esc），暂停中 R（预期不重开）
  await tap('Escape', 'Escape', 27);
  const paused = await snap();
  await evalv(`window.__stageRef2 = window.__game.stage;`);
  await tap('KeyR', 'r', 82);
  const rInPause = await evalv(`(()=>{const g=window.__game; return {state:g.state, same: g.stage===window.__stageRef2, page:g._page||null};})()`);
  await tap('Escape', 'Escape', 27);
  const resumed = await snap();
  res.steps.push({ phase: 'C-pause', paused, rInPause, resumed });

  // D. 暂停中跳关（非改键页应生效）
  await tap('Escape', 'Escape', 27);
  const paused2 = await snap();
  await tapShiftDigit(4);
  const warpInPause = await snap();
  res.steps.push({ phase: 'D-warp-in-pause', paused2, warpInPause });

  // E. 连续跳关切换（音频/对话/ending 是否残留）：快速 1→6→1→3
  for (const n of [6, 1, 3]) { await tapShiftDigit(n); }
  const rapid = await snap();
  res.steps.push({ phase: 'E-rapid-warp', rapid });

  // F. 跳关后暂停再恢复，确认无卡死
  await tap('Escape', 'Escape', 27); const f1 = await snap();
  await tap('Escape', 'Escape', 27); const f2 = await snap();
  res.steps.push({ phase: 'F-warp-pause', f1, f2 });

  res.consoleErrors = consoleErrors;
  res.exceptions = exceptions.slice(0, 10);
  res.ok = true;
} catch (e) {
  res.ok = false; res.error = String(e);
} finally {
  try { ws?.close(); } catch {}
  try { edge.kill(); } catch {}
  await sleep(800);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}
