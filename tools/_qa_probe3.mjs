// 线上环境诊断：标题首屏时序 + 等 AI 立绘真正加载后再看 Boss 对话
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'https://mikuascendlog.com/touhouxjx/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9365);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-qa3-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
async function target() {
  for (let i = 0; i < 100; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(200);
  }
  throw new Error('no target');
}
let ws, id = 0; const pending = new Map(); const errors = [];
function send(m, p = {}) { return new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); }
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.data, 'base64')); };
try {
  const page = await target(); ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__qa = { t0: performance.now(), events: [] };
    const push = (k, ex) => window.__qa.events.push(Object.assign({ k, t: Math.round(performance.now()) }, ex || {}));
    const OI = window.Image;
    window.Image = function(...a) { const im = new OI(...a); im.addEventListener('load', () => push('img', { src: im.src.split('/').pop() })); return im; };
    window.Image.prototype = OI.prototype;
    addEventListener('load', () => push('load'));
    document.addEventListener('DOMContentLoaded', () => push('dom'));
  ` });
  await send('Page.navigate', { url: `${URL0}?qa3=${Date.now()}` });
  for (let i = 0; i < 40; i++) { await sleep(120); await shot(`_qa3_t${String(i).padStart(2, '0')}.png`); if (await ev(`!!(window.__game)`).catch(() => false)) break; }
  // 记录 overlay 出现 / 标题图加载
  console.log('EARLY', await ev(`JSON.stringify({
    ev: window.__qa?.events || [],
    titleArt: (window.__game?._titleArtState?.()) || null,
    char: (()=> { const im = window.__game?._titleCharImgs?.reimu; return im ? { c: im.complete, nw: im.naturalWidth } : null; })(),
    bg: (()=> { const im = window.__game?._titleBgImg; return im ? { c: im.complete, nw: im.naturalWidth } : null; })(),
    overlayHidden: document.getElementById('overlay')?.classList.contains('hidden'),
    canvasBlank: (()=>{ const c=document.getElementById('game'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=0;i<d.length;i+=16000) if(d[i]||d[i+1]||d[i+2]) n++; return n; })(),
  })`));
  // 等 AI 立绘 rumia.png 真正加载（最多 30s）
  let loaded = false;
  for (let i = 0; i < 120; i++) {
    loaded = await ev(`performance.getEntriesByType('resource').some(e => /gen\\/rumia\\.png$/.test(e.name) && e.transferSize > 0) || [...document.images].some(i => /gen\\/rumia\\.png$/.test(i.src) && i.complete && i.naturalWidth > 0)`);
    if (loaded) break;
    await sleep(250);
  }
  console.log('AI_RUMIA_LOADED', loaded);
  await ev(`(() => {
    const g = window.__game; if (!g) return false;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    window.__audioLog = [];
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (n, o) => { window.__audioLog.push(n); return orig(n, o); };
    window.dispatchEvent(new PointerEvent('pointerdown')); g.audio.unlock();
    g._onBossTrigger();
    return true;
  })()`);
  await sleep(1500);
  await shot('_qa3_bossdlg.png');
  console.log('DLG', await ev(`JSON.stringify({ idx: window.__game?.dialogue?.index, who: window.__game?.dialogue?.speaker, right: window.__game?.dialogue?.rightChar, active: window.__game?.dialogue?.active })`));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
} finally { try { ws?.close(); } catch {} try { proc.kill(); } catch {} await sleep(300); process.exit(0); }
