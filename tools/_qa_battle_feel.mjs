// 临时验收 2：弹道混装视觉 / cut-in / 1UP / STG 关符卡
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9354;
const URL = process.env.HKS_URL || 'http://127.0.0.1:8139/index.html';
const profile = mkdtempSync(join(tmpdir(), 'edge-feel2-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
if (!page) { console.log('FAIL: no page'); proc.kill(); process.exit(1); }

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
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    logs.push('ERR ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EVAL_ERR ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join('tools', name), Buffer.from(r.data, 'base64'));
  console.log('shot ->', name);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL}?probe2=${Date.now()}` });
await sleep(4200);
console.log('boot:', await evl(`JSON.stringify({game: !!window.__game, ok: !!document.getElementById('spellCutin')})`));

// ---------- 平台关：弹道 + cut-in + 1UP ----------
console.log('stage1:', await evl(`(() => {
  const g = window.__game;
  g.startStage(0, { skipIntro: true });
  g.state = 'play';
  document.getElementById('dialogue').classList.add('hidden');
  const s = g.stage;
  s.player.power = s.player.maxPower;
  s.player.invuln = 99;
  const fake = { down: () => true, pressed: () => true };
  for (let i = 0; i < 3; i++) { s.player.shootCd = 0; s._tryShoot(fake); }
  return JSON.stringify({ mode: s.mode, lv: s.player.fireLevel, maxPower: s.player.maxPower, shots: s.shots.pool.filter((b) => b.active).length });
})()`));
await sleep(120);
await shot('_probe2_shots.png');

console.log('cast1:', await evl(`(() => {
  const g = window.__game; const s = g.stage;
  s.player.power = 16;
  s._castSpell({ cost: 6, levelBefore: 4 });
  return JSON.stringify({ castFx: Math.round(s.castFx * 100) / 100, show: document.getElementById('spellCutin').classList.contains('show') });
})()`));
await shot('_probe2_cutin.png');
await sleep(1300);
console.log('after:', await evl(`JSON.stringify({castFx: Math.round(window.__game.stage.castFx*100)/100, show: document.getElementById('spellCutin').classList.contains('show')})`));

console.log('extend:', await evl(`(() => {
  const s = window.__game.stage;
  const el = document.getElementById('lives');
  const before = { lives: s.player.lives, icons: el.children.length };
  s._addPower(99); s._addPower(99);
  return JSON.stringify({ before, after: { lives: s.player.lives, icons: document.getElementById('lives').children.length, extendPts: s.extendPts, maxLives: s.player.maxLives }, banner: document.getElementById('banner').textContent });
})()`));
await sleep(220);
await shot('_probe2_hud.png');

// ---------- STG 关 ----------
console.log('stage4:', await evl(`(() => {
  const g = window.__game;
  g.startStage(3, { skipIntro: true });
  g.state = 'play';
  document.getElementById('dialogue').classList.add('hidden');
  const s = g.stage;
  s.player.power = s.player.maxPower;
  const fake = { down: () => true, pressed: () => true };
  for (let i = 0; i < 3; i++) { s.player.shootCd = 0; s._tryShoot(fake); }
  return JSON.stringify({ mode: s.mode, lv: s.player.fireLevel, maxPower: s.player.maxPower, shots: s.shots.pool.filter((b) => b.active).length, special: s.shots.pool.filter((b) => b.active && b.special).length });
})()`));
await sleep(140);
await shot('_probe2_stg_shots.png');

console.log('cast2:', await evl(`(() => { const g = window.__game; g.stage.player.power = 16; g.stage._castSpell({cost:6, levelBefore:4}); return document.getElementById('spellCutin').className; })()`));
await shot('_probe2_stg_cutin.png');

console.log('--- logs ---');
console.log(logs.join('\n') || '(none)');
ws.close();
proc.kill();
