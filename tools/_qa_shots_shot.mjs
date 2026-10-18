// 截图：灵梦 / 魔理沙 实机弹道（真输入，真关卡）
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9373);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
async function target() {
  for (let i = 0; i < 100; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = list.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(200);
  }
  throw new Error('no target');
}
let ws, id = 0; const pending = new Map(); const errors = [];
function send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); }); }
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('shot', f); };
try {
  const page = await target(); ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}?qashot=${Date.now()}` });
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(100); }
  await sleep(900);

  for (const ch of ['reimu', 'marisa']) {
    await ev(`(() => {
      const g = window.__game;
      g.char = ${JSON.stringify(ch)}; g.difficulty = 'N'; g.inExtra = false;
      g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
      g.state = 'play';
      g.stage.state = 'play';
      const s = g.stage, p = s.player;
      const e = s.enemies.list.find(x => x.alive);
      if (e) { p.x = e.x - 240; p.y = e.y + 130; p.facing = 1; }
      window.__game.input.actions = window.__game.input.actions || {};
      window.__g = { s, p };
      return ${JSON.stringify(ch)};
    })()`);
    // 按下射击键
    await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true }))`);
    await sleep(450);
    await shot(`_qa_shots_${ch}.png`);
    await ev(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', bubbles: true }))`);
    await sleep(120);
  }
  console.log('ERRORS', JSON.stringify(errors));
} finally { try { ws?.close(); } catch {} try { proc.kill(); } catch {} await sleep(300); process.exit(0); }
