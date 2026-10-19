// 诊断：headless + GPU 能否稳定跑游戏页。
import { spawn } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[2] || 9462);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-gpudiag-'));
const logPath = join(profile, 'browser.log');
const fd = openSync(logPath, 'a');
const proc = spawn(EDGE, ['--headless=new', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: ['ignore', 'ignore', fd] });
proc.on('exit', (c, s) => appendFileSync(logPath, `\n[exit] code=${c} sig=${s}\n`));
const logTail = (n = 30) => { try { return readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-n).join('\n'); } catch { return ''; } };
let page = null;
for (let i = 0; i < 100 && !page; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); page = l.find((t) => t.type === 'page'); } catch {}
  if (!page) await sleep(200);
}
if (!page) { console.log('NO TARGET\n' + logTail()); proc.kill(); process.exit(1); }
console.log('target:', page.url, page.title);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('wserr ' + e.message)); });
let id = 0; const pending = new Map();
ws.onclose = (e) => { console.log('WS CLOSED', e.code, e.reason); for (const [, p] of pending) p.rej(new Error('ws closed')); pending.clear(); };
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); if (d.error) rej(new Error(JSON.stringify(d.error))); else res(d.result); return; }
  if (d.method === 'Runtime.exceptionThrown') console.log('EXC:', JSON.stringify(d.params.exceptionDetails).slice(0, 300));
};
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || '')); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8138/index.html?diag=' + Date.now() });
let ok = false;
for (let i = 0; i < 60; i++) {
  try { ok = await evaluate('!!(window.__game && window.__game.input)'); } catch (e) { console.log('eval err', i, e.message); break; }
  if (ok) break;
  await sleep(250);
}
console.log('booted:', ok);
if (ok) {
  const gpuInfo = await evaluate('(() => { const c=document.createElement("canvas"); const gl=c.getContext("webgl2")||c.getContext("webgl"); const e=gl&&gl.getExtension("WEBGL_debug_renderer_info"); const s=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):""; return { renderer: s, lowSpec: window.__game.renderer.lowSpec, postLevel: window.__game.renderer.postLevel, ema: window.__game.renderer.bloomEmaMs, backing: window.__game.renderer.backing, canvas: window.__game.renderer.canvas.width+"x"+window.__game.renderer.canvas.height }; })()');
  console.log('gpu info:', JSON.stringify(gpuInfo));
  for (let i = 0; i < 6; i++) {
    await sleep(500);
    try { console.log('tick', i, await evaluate('window.__game.loop.renderCount')); } catch (e) { console.log('tick err', e.message); break; }
  }
}
console.log('--- log tail ---\n' + logTail());
try { ws.close(); } catch {}
proc.kill();
