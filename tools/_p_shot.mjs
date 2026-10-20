// 截图：把玩家放到 stage1 第一颗 P 点旁边，看「稀但值钱」的 P 在实机里的密度
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = process.env.PT_BASE || 'http://127.0.0.1:8137';
const PORT = 9443;
const profile = mkdtempSync(join(tmpdir(), 'edge-pshot-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const out = process.argv[2] || '_p_item';
try {
  await send('Page.enable');
  await send('Page.navigate', { url: `${URL0}/index.html?pshot=${Date.now()}` });
  for (let i = 0; i < 160; i++) { try { if (await ev('!!window.__game && document.readyState === "complete"')) break; } catch {} await sleep(150); }
  await sleep(500);
  const info = await ev(`(async () => {
    const g = window.__game;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play';
    const s = g.stage, p = s.player;
    p.power = 12; p.maxPower = 64;
    const pick = s.pickups.find((it) => it.kind === 'power');
    p.x = pick.x - 70; p.y = pick.y - 6;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(120);
    document.querySelector('#powerFill').style.width = '';
    return { pick: { x: pick.x, y: pick.y }, power: p.power, max: p.maxPower };
  })()`);
  await sleep(500);
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}_full.png`, Buffer.from(shot1.data, 'base64'));
  console.log('shot', `${out}_full.png`, JSON.stringify(info));
} finally {
  try { ws.close(); } catch {}
  proc.kill();
  await sleep(200);
}
