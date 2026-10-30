// 实机键位验证：真实游戏循环 + KeyboardEvent 放符卡，确认 Input→Player→Stage→HUD 全链路
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341, W = 1280, H = 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-powlive-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-background-timer-throttling',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8138/index.html?powlive=${Date.now()}` });
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(400);

const out = JSON.parse(await ev(`(async () => {
  const g = window.__game;
  const defs = g._mainStages();
  const pIdx = defs.findIndex(d => (d.mode || 'platform') !== 'stg');
  g._createStage(defs[pIdx], pIdx, false);
  g.dialogue.stop();
  g.hudEl.classList.remove('hidden');
  g.state = 'play';
  const st = g.stage;
  st.state = 'play';
  st.player.power = 128;
  st.player.alive = true;
  st.player.invuln = 0;
  await new Promise(r => setTimeout(r, 220)); // 让 HUD / 游戏循环稳定到 Lv.4
  const settle = {
    power: st.player.power,
    hudLevel: document.getElementById('powerLvNum')?.textContent,
    powerNum: document.getElementById('powerNum')?.textContent,
  };
  // 先铺 8 发敌弹，确认真实循环里的符卡也会清屏
  for (let i = 0; i < 8; i++) st.bullets.spawn({ x: 500 + i * 10, y: 300, vx: 0, vy: 30, life: 5, r: 5, color: '#ff5ea8' });
  const bulletsBefore = st.bullets.activeCount;
  // 真实按键：按住 X 约 120ms（跨若干帧），再松开
  const down = new KeyboardEvent('keydown', { code: 'KeyX', key: 'x', bubbles: true });
  window.dispatchEvent(down);
  await new Promise(r => setTimeout(r, 120));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX', key: 'x', bubbles: true }));
  await new Promise(r => setTimeout(r, 120));
  return JSON.stringify({
    settle,
    powerAfter: st.player.power,
    levelAfter: st.player.fireLevel,
    bulletsBefore, bulletsAfter: st.bullets.activeCount,
    invuln: st.player.invuln,
    hudLevel: document.getElementById('powerLvNum')?.textContent,
    hudPips: document.querySelectorAll('#powerPips i.on').length,
    powerNum: document.getElementById('powerNum')?.textContent,
    pop: document.getElementById('powerPop')?.textContent,
    casting: st.player.casting,
    state: g.state,
  });
})()`));

writeFileSync('_power_live.json', JSON.stringify({ out, errors }, null, 2));
writeFileSync('_power_live.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
const checks = [
  ['HUD 稳定 Lv.4', out.settle.hudLevel === '4' && out.settle.powerNum === '128', JSON.stringify(out.settle)],
  ['真实按键扣 50：128→78', out.powerAfter === 78, String(out.powerAfter)],
  ['真实按键降级 4→3', out.levelAfter === 3, String(out.levelAfter)],
  ['真实按键清空 8 发敌弹', out.bulletsBefore === 8 && out.bulletsAfter === 0, `${out.bulletsBefore}→${out.bulletsAfter}`],
  ['真实按键给无敌', out.invuln > 1, String(out.invuln)],
  ['HUD 同步 Lv.3 / 3 格', out.hudLevel === '3' && out.hudPips === 3, `${out.hudLevel}/${out.hudPips}`],
  ['HUD 数字 78', out.powerNum === '78', String(out.powerNum)],
  ['无 JS 异常', errors.length === 0, JSON.stringify(errors)],
];
const fail = checks.filter((c) => !c[1]);
console.log('RESULT', JSON.stringify({ ok: !fail.length, checks, out, errors }, null, 2));
ws.close(); proc.kill(); await sleep(300); process.exit(fail.length ? 1 : 0);
