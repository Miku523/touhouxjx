// 线上加载挂起诊断：window load 是否触发 / 标题图 / 空闲预加载是否跑
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'https://mikuascendlog.com/touhouxjx/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9366);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-qa4-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
async function target() {
  for (let i = 0; i < 100; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {} await sleep(200); }
  throw new Error('no target');
}
let ws, id = 0; const pending = new Map(); const errors = []; const fails = [];
function send(m, p = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); }
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.data, 'base64')); };
try {
  const page = await target(); ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    if (m.method === 'Network.loadingFailed') fails.push({ url: m.params.requestId, err: m.params.errorText, canceled: m.params.canceled });
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__t = { load: null, dcl: null };
    addEventListener('load', () => { window.__t.load = Math.round(performance.now()); });
    document.addEventListener('DOMContentLoaded', () => { window.__t.dcl = Math.round(performance.now()); });
  ` });
  await send('Page.navigate', { url: `${URL0}?qa4=${Date.now()}` });
  for (let i = 1; i <= 12; i++) {
    await sleep(5000);
    const st = await ev(`JSON.stringify({
      t: Math.round(performance.now()),
      timingLoad: performance.timing.loadEventEnd ? Math.round(performance.timing.loadEventEnd - performance.timing.navigationStart) : 0,
      load: window.__t.load, dcl: window.__t.dcl,
      ready: document.readyState,
      art: (()=>{ const g=window.__game; return g ? { bg: !!g._titleBgImg?.complete, chars: Object.fromEntries(Object.entries(g._titleCharImgs||{}).map(([k,v])=>[k,!!v.complete])) } : null; })(),
      rumia: performance.getEntriesByType('resource').some(e => /gen\\/rumia\\.png$/.test(e.name)),
      n: performance.getEntriesByType('resource').length,
    })`);
    console.log('T' + i * 5 + 'S', st);
    if (i === 2) await shot('_qa4_title5s.png');
    if (i === 6) await shot('_qa4_title30s.png');
  }
  await shot('_qa4_title60s.png');
  // 现在尝试进 Boss 对话：先看 AI 立绘有没有加载
  await ev(`(() => { const g = window.__game; if (!g) return false; g.char='reimu'; g.difficulty='N'; g.inExtra=false; g._createStage(g._mainStages()[0],0,false,{skipIntro:true}); g._onBossTrigger(); return true; })()`);
  await sleep(2500);
  await shot('_qa4_bossdlg.png');
  console.log('DLG', await ev(`JSON.stringify({ right: window.__game?.dialogue?.rightChar, idx: window.__game?.dialogue?.index })`));
  console.log('FAILS', JSON.stringify(fails.slice(0, 10)));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
} finally { try { ws?.close(); } catch {} try { proc.kill(); } catch {} await sleep(300); process.exit(0); }
