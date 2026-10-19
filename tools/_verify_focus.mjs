// 验证：按住 Shift = 低速移动 + 显示判定点；魔理沙判定点更小
// 用法: node tools/_verify_focus.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9391;
const URL_BASE = 'http://127.0.0.1:8138/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-focus-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL_BASE}?focus=${Date.now()}` });
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) break;
  await sleep(200);
}

// 真实按键绑定检查：模拟按下左 Shift，input 是否进入 fast
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
await sleep(120);
const keyDown = await evaluate('window.__game.input.down("fast")');
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 });
await sleep(120);
const keyUp = await evaluate('window.__game.input.down("fast")');

const result = await evaluate(`(async () => {
  const g = window.__game;
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true;
  g.showTitle(); g.startGame();
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(1/60); };
  g.showTitle();
  g.startStage(0, { skipIntro: true });

  const p = g.stage.player;
  const out = {};

  // 平台关：低速 vs 正常速度
  g.input._set('right', true);
  g.input._set('fast', true);
  for (let i = 0; i < 20; i++) { p.invuln = 9; step(1); }
  out.platformFocus = { focus: p.focus, vx: Math.abs(p.vx), hitR: g.stage.playerHitPoint.r };
  g.render(1);
  const camX = g.stage.camera.x;
  const hpFocus = g.stage.playerHitPoint;
  out.platformFocus.screen = { x: hpFocus.x - camX, y: hpFocus.y };
  out.platformShot = document.querySelector('canvas').toDataURL('image/png');
  g.input._set('fast', false);
  for (let i = 0; i < 16; i++) { p.invuln = 9; step(1); }
  out.platformNormal = { focus: p.focus, vx: Math.abs(p.vx) };
  g.render(1);
  const hpNormal = g.stage.playerHitPoint;
  out.platformNormal.screen = { x: hpNormal.x - g.stage.camera.x, y: hpNormal.y };
  g.input._set('right', false);

  // 魔理沙判定点更小
  p.char = 'marisa';
  out.platformMarisaR = g.stage.playerHitPoint.r;
  p.char = 'reimu';

  // 飞行关
  g.startStage(3, { skipIntro: true });
  const s = g.stage;
  const sp = s.player;
  out.stgMode = s.mode;
  g.input._set('right', true);
  g.input._set('fast', true);
  for (let i = 0; i < 20; i++) { sp.invuln = 9; step(1); }
  out.stgFocus = { focus: sp.focus, vx: Math.abs(sp.vx), hitR: sp.hitPoint.r, sx: sp.sx, sy: sp.sy };
  g.render(1);
  out.stgShot = document.querySelector('canvas').toDataURL('image/png');
  g.input._set('fast', false);
  for (let i = 0; i < 16; i++) { sp.invuln = 9; step(1); }
  out.stgNormal = { focus: sp.focus, vx: Math.abs(sp.vx) };
  g.render(1);
  g.input._set('right', false);
  sp.char = 'marisa';
  out.stgMarisaR = sp.hitPoint.r;

  return out;
})()`);

writeFileSync('_focus_platform.png', Buffer.from(result.platformShot.replace(/^data:image\/png;base64,/, ''), 'base64'));
writeFileSync('_focus_stg.png', Buffer.from(result.stgShot.replace(/^data:image\/png;base64,/, ''), 'base64'));

console.log(JSON.stringify({ keyDown, keyUp, ...result, platformShot: undefined, stgShot: undefined }, null, 2));
ws.close();
proc.kill();
