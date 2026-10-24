/**
 * 剧情冒烟：起本地静态服务器 → 无头 Edge 打开游戏 → 在页面里真实 import 剧本模块，
 * 检查模块能加载、数据显示正常、标题画面无报错，并截图。
 *
 * 用法（仓库根目录）：node tools/_smoke_story.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) { console.log('找不到 Edge，跳过浏览器冒烟'); server.close(); process.exit(0); }

const CDP_PORT = 9400 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'edge-story-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${CDP_PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
if (!page) { console.log('无法连接无头浏览器'); proc.kill(); server.close(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    logs.push('ERR ' + msg.params.entry.text + ' @' + (msg.params.entry.url || ''));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?smoke=${Date.now()}` });
await sleep(5000);

const expr = `(async () => {
  const out = {};
  const story = await import('/src/game/story.js');
  const endings = await import('/src/game/endings.js');
  const music = await import('/src/game/musicTracks.js');
  const { STORY } = story, { ENDINGS } = endings, { MUSIC_TRACKS, MUSIC_TOTAL } = music;
  out.stages = Object.keys(STORY.stages);
  out.opening = [STORY.opening.reimu.length, STORY.opening.marisa.length];
  out.midCounts = {};
  for (const k of out.stages) out.midCounts[k] = [STORY.stages[k].reimu.mid.length, STORY.stages[k].marisa.mid.length];
  out.youmu = [STORY.stages.stage5.youmuPre?.length, STORY.stages.stage5.youmuPost?.length];
  out.extra = Object.keys(STORY.extra);
  out.getters = {
    openingFor: story.openingFor('marisa').length,
    stageStoryFor: !!story.stageStoryFor('reimu', 'stage3').preBoss,
    extraIntroFor: story.extraIntroFor('reimu').length,
    extraPostFor: story.extraPostFor('marisa').length,
    midbossPreFor: story.midbossPreFor('reimu', 'stage5').length,
    midbossPostFor: story.midbossPostFor('marisa', 'stage5').length,
  };
  out.edKeys = Object.keys(ENDINGS);
  out.edShots = out.edKeys.map((k) => ENDINGS[k].shots.length);
  out.edTitles = out.edKeys.map((k) => ENDINGS[k].title);
  out.edBg = out.edKeys.map((k) => ENDINGS[k].shots.map((s) => s.bg).join('>'));
  out.musicTotal = MUSIC_TOTAL;
  out.game = typeof window.__game === 'object';
  out.state = window.__game?.state;
  out.char = window.__game?.char;
  return out;
})()`;

const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(r.result.value, null, 1));
if (logs.length) {
  console.log('--- 页面日志 ---');
  console.log(logs.slice(0, 30).join('\n'));
} else {
  console.log('--- 页面日志：无报错 ---');
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
const outPng = join(ROOT, 'docs/RE_STORY/artifacts/01_title.png');
(await import('node:fs')).writeFileSync(outPng, Buffer.from(shot.data, 'base64'));
console.log('截图：' + outPng);

ws.close();
proc.kill();
server.close();
