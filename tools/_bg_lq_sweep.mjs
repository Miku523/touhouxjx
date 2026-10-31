// 临时验证：7 个主题全部走一遍「低清先贴 + 高清升档」，抓每一面的首帧画面
// 用法: node tools/_bg_lq_sweep.mjs <url> <tag> [kbps] [extra]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_TARGET = process.argv[2] || 'http://127.0.0.1:8300/index.html';
const TAG = process.argv[3] || 'sweep';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9560 + Math.floor(Math.random() * 40);
const profile = mkdtempSync(join(tmpdir(), 'edge-sweep-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('.tmp_shots', { recursive: true });   // 截图与 json 落在这里（临时产物，不入库）

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch { /* not up yet */ }
  await sleep(250);
}
if (!page) { console.error('no page target'); proc.kill(); process.exit(2); }

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
  const p = msg.params;
  if (msg.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  if (msg.method === 'Runtime.consoleAPICalled') logs.push('LOG ' + p.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false });
  return r.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Page.navigate', { url: URL_TARGET });
for (let i = 0; i < 180; i++) {
  const v = await evalJs(`JSON.stringify({game: !!window.__game, gate: window.__hksBootGate || null})`);
  try {
    const o = JSON.parse(v || '{}');
    if (o.game && o.gate && o.gate.done) break;
  } catch { /* mid-navigation */ }
  await sleep(500);
}
const bootMs = Date.now();
await evalJs(`window.__game.ensureGameKit?.()`);
await sleep(1500);

const rows = [];
const ONLY_EXTRA = process.argv[5] === 'extra';
const STAGE_LIST = ONLY_EXTRA ? [-1] : [0, 1, 2, 3, 4, 5];
for (const stage of STAGE_LIST) {
  const t0 = Date.now();
  if (stage < 0) {
    await evalJs(`window.__game._startExtraStage({skipIntro:true})`);
  } else {
    await evalJs(`window.__game.startStage(${stage}, {skipIntro:true})`);
  }
  let born = -1, shown = -1, theme = null, best = -1;
  for (let i = 0; i < 200; i++) {
    const v = await evalJs(`JSON.stringify({
      hasStage: !!window.__game.stage,
      fade: window.__game.stage ? +window.__game.stage._bgFade : -1,
      theme: (window.__game.stage && window.__game.stage.level && window.__game.stage.level.theme) || null
    })`);
    let o = {};
    try { o = JSON.parse(v || '{}'); } catch { /* ignore */ }
    const t = Date.now() - t0;
    if (o.theme) theme = o.theme;
    if (o.hasStage && born < 0) born = t;
    if (o.fade > best) best = o.fade;
    if (o.hasStage && o.fade > 0 && shown < 0) shown = t;
    if (shown >= 0 && t > shown + 1500) break;
    await sleep(200);
  }
  await sleep(2500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`.tmp_shots/${TAG}_s${stage < 0 ? 'ex' : stage + 1}.png`, Buffer.from(shot.data, 'base64'));
  rows.push({ stage: stage < 0 ? 'EX' : stage + 1, theme, bornMs: born, shownMs: shown, fade: best });
  console.error(`stage${stage < 0 ? 'EX' : stage + 1} ${theme} born=${born} shown=${shown} fade=${best}`);
}
const out = { url: URL_TARGET, bootMs, rows, logs: logs.slice(-20) };
writeFileSync(`.tmp_shots/${TAG}.json`, JSON.stringify(out, null, 1), 'utf8');
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
