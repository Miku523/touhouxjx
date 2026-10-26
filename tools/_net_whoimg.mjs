// 临时诊断：抓 image src 赋值的调用栈，确认受限链路下非关键图由谁发起。
// 用法: node tools/_net_whoimg.mjs --url=... --port=... --wait=... --rtt=... --down=... --up=... [--insecure] [--enter [--wait2=9000]]
//   --enter：首屏稳定后直接建第一面，观察「进关之后」才发起的图片请求。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith('--' + n + '=')); return h ? h.slice(n.length + 3) : d; };
const URL_ = arg('url', 'https://127.0.0.1:8445/');
const PORT = Number(arg('port', 9490));
const WAIT = Number(arg('wait', 12000));
const RTT = Number(arg('rtt', 220));
const DOWN = Number(arg('down', 8));
const UP = Number(arg('up', 2));
const OUT = arg('out', '_pt_whoimg.json');
const INSECURE = process.argv.includes('--insecure');
const ENTER = process.argv.includes('--enter');
const WAIT2 = Number(arg('wait2', 9000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-who-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', ...(INSECURE ? ['--ignore-certificate-errors', '--allow-insecure-localhost'] : []), '--user-data-dir=' + profile, '--window-size=1280,720', '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 80; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); page = (await r.json()).find((t) => t.type === 'page'); if (page) break; } catch {} await sleep(250); }
if (!page) { console.error('edge not ready'); proc.kill(); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
if (RTT || DOWN || UP) await send('Network.emulateNetworkConditions', { offline: false, latency: RTT, downloadThroughput: DOWN * 1024 * 1024 / 8, uploadThroughput: UP * 1024 * 1024 / 8 });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  window.__imgLog = [];
  const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() { return d.get.call(this); },
    set(v) {
      try {
        const raw = String(v);
        const st = (new Error()).stack || '';
        window.__imgLog.push({ f: raw.split('/').pop(), t: Math.round(performance.now()), st: st.split('\\n').slice(2, 7).map((s) => s.trim().replace(/^at /, '')).join(' < ') });
      } catch (e) {}
      return d.set.call(this, v);
    },
  });
})();` });
await send('Page.navigate', { url: URL_ });
await sleep(WAIT);
// --enter：首屏稳定后直接建第一面，用来看「进关之后」才发起的图片请求
if (ENTER) {
  let booted = false;
  for (let i = 0; i < 100 && !booted; i++) {
    const v = await send('Runtime.evaluate', { expression: '!!window.__game', returnByValue: true });
    booted = !!v.result.value;
    if (!booted) await sleep(200);
  }
  await send('Runtime.evaluate', { expression: "(() => { const g = window.__game; g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false; g.lives = 2; g._createStage(g._mainStages()[0], 0, false); return true; })()", returnByValue: true });
  await sleep(WAIT2);
}
const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__imgLog || [])', returnByValue: true });
const log = JSON.parse(r.result.value);
writeFileSync(OUT, JSON.stringify({ url: URL_, throttle: { RTT, DOWN, UP }, log }, null, 1));
console.log('IMG COUNT', log.length);
for (const e of log) console.log(String(e.t).padStart(6), e.f.slice(0, 40).padEnd(42), e.st.slice(0, 220));
ws.close(); proc.kill();
