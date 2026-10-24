/**
 * 剧情冒烟：起本地静态服务器 → 无头 Edge 开游戏 → startGame() 播开场 → 逐句 advance → 截图。
 *
 * 用法：node tools/_probe_dialogue.mjs [reimu|marisa] [推进次数] [截图名]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const CHAR = process.argv[2] || 'reimu';
const STEPS = Number(process.argv[3] || 6);
const NAME = process.argv[4] || `dialogue_${CHAR}`;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const CDP_PORT = 9800 + Math.floor(Math.random() * 190);
const profile = mkdtempSync(join(tmpdir(), 'edge-plot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${CDP_PORT}`, 'about:blank'], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`); page = (await r.json()).find((t) => t.type === 'page'); if (page) break; } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); return; }
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push('ERR ' + msg.params.entry.text + ' @' + (msg.params.entry.url || ''));
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?plot=${Date.now()}` });
await sleep(4500);
await evaluate(`window.__game.char='${CHAR}';window.__game.startGame();'ok'`);
await sleep(2200);
for (let i = 0; i < STEPS; i++) {
  await evaluate(`window.__game.dialogue.advance();'ok'`);
  await sleep(700);
}
await sleep(800);
const st = await evaluate(`JSON.stringify({state:window.__game.state,char:window.__game.char,idx:window.__game.dialogue?._idx,who:window.__game.dialogue?._cur?.who,text:(window.__game.dialogue?._cur?.text||'').slice(0,40),line:(window.__game.dialogue?._cur?.text||'').length, lines:(window.__game.dialogue?._lines||[]).length})`);
console.log('状态 ' + st);
console.log(logs.length ? logs.slice(0, 8).join('\n') : '页面无报错');
const shot = await send('Page.captureScreenshot', { format: 'png' });
const outPng = join(ROOT, `docs/RE_STORY/artifacts/_smoke_${NAME}.png`);
writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
console.log('截图：' + outPng);
ws.close(); proc.kill(); server.close();
