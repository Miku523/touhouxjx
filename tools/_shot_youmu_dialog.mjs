// 对话立绘实机截图：加载 STAGE5，直接播一条妖梦台词并截图（检查 src/art/gen/youmu.png 的上屏尺寸/对齐）
// 用法: node tools/_shot_youmu_dialog.mjs [port]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] || 8138);
const W = 1280;
const H = 720;
const DBG = 9337;
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn(process.execPath, ['tools/_static_server.mjs', String(PORT)], { stdio: 'ignore' });
await sleep(700);
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'edge-dlg-'))}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${DBG}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DBG}/json/list`);
      const p = (await r.json()).find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools 未就绪');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const waiters = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++seq;
  waiters.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)));addEventListener('unhandledrejection',e=>__errs.push('rej:'+e.reason));`,
});
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
await sleep(3500);
await ev(`(()=>{const g=__game;g.startStage(4,{skipIntro:true,skipBossDialogue:true});return 1})()`);
await sleep(1200);
await ev(`(()=>{const g=__game;
  g._playDialogue([{who:'youmu',text:'我是白玉楼的庭师，魂魄妖梦。想要过去，先赢过我手里的两把剑。'}],()=>{});
  return 1})()`);
await sleep(2600);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('tools/_live_youmu_dialog.png', Buffer.from(shot.result.data, 'base64'));
console.log('IMG tools/_live_youmu_dialog.png');
console.log('errors', JSON.stringify(await ev('window.__errs')));
ws.close();
edge.kill();
server.kill();
