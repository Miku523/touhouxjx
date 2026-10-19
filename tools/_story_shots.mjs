// 临时：截取开场对话 / 道中对话 / 结局卡，做视觉检查
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9344;
const OUT = 'tools/_shots';
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('saved', name);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?shots=${Date.now()}` });
await sleep(3500);

await evaluate(`(() => { const g = window.__game; g.char = 'reimu'; g.difficulty = 'N'; g.startGame(); return true; })()`);
await sleep(2200);
await shot('01-opening-reimu.png');

// 跳过开场，进入第一面，再触发道中第一段
await evaluate(`(() => {
  const g = window.__game;
  for (let i = 0; i < 1200 && g.dialogue.active; i++) g.dialogue.advance();
  g.startStage(0, { skipIntro: true });
  g._skipBeats = false; g._midShown = [false, false];
  g.stage.player.x = g.stage.level.w * 0.27;
  g.state = 'play';
  g._maybeMidDialogue();
  return true;
})()`);
await sleep(2000);
await shot('02-mid-stage1-reimu.png');

// 真结局卡
await evaluate(`(() => {
  const g = window.__game;
  for (let i = 0; i < 1200 && g.dialogue.active; i++) g.dialogue.advance();
  g.ending?.stop?.();
  g.inExtra = false; g.char = 'reimu'; g.difficulty = 'N'; g.continues = 0;
  g._onAllCleared();
  return true;
})()`);
await sleep(2500);
await evaluate(`(() => { const g = window.__game; g.ending.skipToCard(); return true; })()`);
await sleep(1200);
await shot('03-ending-card-reimu-good.png');

// 遗憾结局卡（魔理沙）
await evaluate(`(() => {
  const g = window.__game;
  g.ending?.stop?.();
  g.inExtra = false; g.char = 'marisa'; g.difficulty = 'N'; g.continues = 2;
  g._onAllCleared();
  return true;
})()`);
await sleep(2200);
await evaluate(`(() => { const g = window.__game; g.ending.skipToCard(); return true; })()`);
await sleep(1200);
await shot('04-ending-card-marisa-bad.png');

ws.close();
proc.kill();
