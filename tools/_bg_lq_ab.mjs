// 弱网 A/B：进关前「低清档先到、高清后升档」是否真的把画面救回来
// 用法: node tools/_bg_lq_ab.mjs <url> <tag> [kbps] [stage] [mode]
//   kbps = 进关瞬间施加的下行限速（KB/s，默认 50，模拟本机到 GitHub Pages 的实测带宽）
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_TARGET = process.argv[2] || 'http://127.0.0.1:8200/index.html';
const TAG = process.argv[3] || 'lq';
const KBPS = Number(process.argv[4] || 50);
const STAGE = Number(process.argv[5] || 0);
// stage = 进关瞬间限速；all = 从打开页面就限速；hold = 从打开页面就限速 + 扣住所有 /bg/ 请求
//        直到进关那一刻才放行（模拟「背景图一点预热都没有」的最坏情况）
const MODE = process.argv[6] || 'stage';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9500 + Math.floor(Math.random() * 40);
const profile = mkdtempSync(join(tmpdir(), 'edge-lq-'));
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
const reqs = new Map();    // requestId -> {url,start}
const done = [];           // {url,ms,status}
const held = [];           // Fetch 扣住的 /bg/ 请求
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    return;
  }
  const p = msg.params;
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push('LOG ' + p.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push('ENTRY ' + p.entry.level + ' ' + p.entry.text + ' @' + (p.entry.url || ''));
  }
  if (msg.method === 'Network.requestWillBeSent') reqs.set(p.requestId, { url: p.request.url, start: Date.now() });
  if (msg.method === 'Network.responseReceived') {
    const rec = reqs.get(p.requestId);
    if (rec) rec.status = p.response.status;
  }
  if (msg.method === 'Network.loadingFinished') {
    const rec = reqs.get(p.requestId);
    if (rec) done.push({ url: rec.url, status: rec.status || 0, ms: Date.now() - rec.start, bytes: p.encodedDataLength });
  }
  if (msg.method === 'Network.loadingFailed') {
    const rec = reqs.get(p.requestId);
    if (rec) done.push({ url: rec.url, status: rec.status || 0, ms: Date.now() - rec.start, fail: p.errorText, canceled: !!p.canceled });
  }
  if (msg.method === 'Fetch.requestPaused') {
    held.push({ requestId: p.requestId, url: p.request.url });
  }
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
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__bgdbg = 1;' });

const t0 = Date.now();
if (MODE === 'all' || MODE === 'hold') {
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 120,
    downloadThroughput: Math.max(1024, KBPS * 1024),
    uploadThroughput: Math.max(1024, KBPS * 512),
  });
}
if (MODE === 'hold' || MODE === 'holdfast') {
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/art/gen/bg/*' }] });
}
await send('Page.navigate', { url: URL_TARGET });

// 1) 等启动幕门禁 + game kit
let gate = null;
const gateDeadline = MODE === 'all' ? 360 : 180;
for (let i = 0; i < gateDeadline; i++) {
  const v = await evalJs(`JSON.stringify({game: !!window.__game, gate: window.__hksBootGate || null})`);
  try {
    const o = JSON.parse(v || '{}');
    gate = o;
    if (o.game && o.gate && o.gate.done) break;
  } catch { /* mid-navigation */ }
  await sleep(500);
}
const bootMs = Date.now() - t0;
await evalJs(`window.__game.ensureGameKit ? window.__game.ensureGameKit() : null`);
// holdfast：先在全速下把 kit / 本关曲目备齐（bg 仍被 Fetch 扣住），再限速放行
if (MODE === 'holdfast') {
  for (let i = 0; i < 60; i++) {
    const v = await evalJs(`JSON.stringify({kit: !!(window.__game.stage !== undefined), music: true})`);
    try { JSON.parse(v || '{}'); } catch { /* ignore */ }
    break;
  }
  await evalJs(`(async () => {
    try {
      const def = window.__game._mainStages()[${STAGE}];
      await window.__game.ensureGameKit?.();
      await window.__game._ensureStageMusic(def);
      return 'warm';
    } catch (e) { return 'err:' + e.message; }
  })()`);
  for (let i = 0; i < 240; i++) {
    const v = await evalJs(`JSON.stringify({kit: window.__hksBootGate ? window.__hksBootGate.kit : null})`);
    let o = {};
    try { o = JSON.parse(v || '{}'); } catch { /* ignore */ }
    if (o.kit === true) break;
    await sleep(500);
  }
  await sleep(1500);
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 120,
    downloadThroughput: Math.max(1024, KBPS * 1024),
    uploadThroughput: Math.max(1024, KBPS * 512),
  });
}
await sleep(1200);

// 2) 进关瞬间限速（stage 模式：只压关卡内要下的东西；off = 交给服务端限速）
if (MODE === 'stage') {
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 120,
    downloadThroughput: Math.max(1024, KBPS * 1024),
    uploadThroughput: Math.max(1024, KBPS * 512),
  });
}
const newStage = MODE === 'hold' ? 0 : STAGE;
const tStage = Date.now();
await evalJs(`window.__game.startStage(${newStage}, {skipIntro:true})`);
if (MODE === 'hold') {
  // 进关这一刻才放行被扣住的背景图（模拟「一点预热都没有」的最坏情况）
  for (const h of held) {
    try { await send('Fetch.continueRequest', { requestId: h.requestId }); } catch { /* 已取消 */ }
  }
  try { await send('Fetch.disable'); } catch { /* ignore */ }
  console.error('[hold] released ' + held.length + ' bg requests: ' + held.map((h) => h.url.split('/').pop()).join(','));
}

const trail = [];
let shownAt = -1;
let stageBornAt = -1;
for (let i = 0; i < 240; i++) {          // 最多 60s
  const v = await evalJs(`JSON.stringify({
    hasStage: !!window.__game.stage,
    fade: window.__game.stage ? +window.__game.stage._bgFade : -1,
    theme: window.__game.stage && window.__game.stage.level ? window.__game.stage.level.theme : null,
    mask: (document.getElementById('kitLoad')||{}).style ? document.getElementById('kitLoad').style.display : null,
    maskText: (document.getElementById('kitLoad')||{}).textContent || null
  })`);
  let o = {};
  try { o = JSON.parse(v || '{}'); } catch { /* mid-frame */ }
  const t = Date.now() - tStage;
  if (o.hasStage && stageBornAt < 0) stageBornAt = t;
  if (o.hasStage && o.fade > 0 && shownAt < 0) shownAt = t;
  trail.push({ t, fade: o.fade, hasStage: o.hasStage, mask: o.mask, maskText: o.maskText });
  if (i === 12) {                     // 3s 处先存一张（此刻应该已经贴出低清档）
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`.tmp_shots/${TAG}_3s.png`, Buffer.from(s.data, 'base64'));
  }
  if (shownAt >= 0 && t > shownAt + 12000) break;
  await sleep(250);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`.tmp_shots/${TAG}.png`, Buffer.from(shot.data, 'base64'));

// 3) 恢复全速 + 等升档，再存一张
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await sleep(15000);
const s2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`.tmp_shots/${TAG}_hd.png`, Buffer.from(s2.data, 'base64'));

const bgDone = done.filter((d) => d.url.includes('/bg/'));
const out = {
  url: URL_TARGET, tag: TAG, kbps: KBPS, stage: STAGE, bootMs,
  stageBornMs: stageBornAt, bgShownMs: shownAt,
  bgDone: bgDone.map((d) => ({ f: d.url.split('/').pop(), ms: d.ms, st: d.status, kb: Math.round((d.bytes || 0) / 102.4) / 10, fail: d.fail || null })),
  trailTail: trail.slice(-8),
  logs: logs.slice(-40),
};
writeFileSync(`.tmp_shots/${TAG}.json`, JSON.stringify({ ...out, trail }, null, 1), 'utf8');
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
