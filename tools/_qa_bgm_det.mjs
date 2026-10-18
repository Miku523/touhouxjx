// 确定性验收：切关后由测试端主动驱动 _musicTick（不依赖 headless 定时器）
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8138/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9378);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-det-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
try {
  let page;
  for (let i = 0; i < 100 && !page; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!page) await sleep(200);
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || '').split('\n')[0]);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: `${URL0}?det=${Date.now()}` });
  for (let i = 0; i < 60 && !(await ev('!!window.__game')); i++) await sleep(200);
  await ev('window.__game.audio.unlock()');
  await sleep(500);
  const expect = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'extra'];
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const r = await ev(`(async () => {
      ${i < 6 ? `window.__game.startStage(${i});` : 'window.__game._startExtraStage();'}
      const a = window.__game.audio;
      const song = a.currentSong, n = a._events.length;
      const idx0 = a._songIdx;
      let peak = 0, moved = 0;
      for (let k = 0; k < 40; k++) {
        await new Promise((res) => setTimeout(res, 25));
        a._musicTick();
        peak = Math.max(peak, a._musicVoices.size);
      }
      return { song, n, idx0, idx1: a._songIdx, loop: a._songLoop, peak, on: a._musicOn,
        moved: a._songIdx !== idx0 || a._songLoop > 0 };
    })()`);
    rows.push({ stage: i + 1, ...r });
    console.log(`stage${i + 1}: song=${r.song} ev=${r.n} 推进=${r.moved} idx=${r.idx0}->${r.idx1} loop=${r.loop} 峰值声部=${r.peak}`);
  }
  const bad = rows.filter((r, i) => r.song !== expect[i] || r.n === 0 || !r.moved || r.peak === 0);
  console.log(bad.length ? `${bad.length} 关异常: ${bad.map((b) => b.stage).join(',')}` : '7 关全部正常 ✓');
  console.log('JS 异常:', errors.length ? errors.slice(0, 3).join(' | ') : '无');
} catch (e) { console.error('ERROR', e); } finally { try { ws && ws.close(); } catch {} try { proc.kill(); } catch {} }
