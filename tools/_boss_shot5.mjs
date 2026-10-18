// 直接进 Boss 战并连续截图的验证脚本（独立 headless Edge）
// 用法: node tools/_boss_shot.mjs <stage> <outPrefix> [waitMs]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stage = Number(process.argv[2] ?? 0);
const prefix = process.argv[3] ?? 'shot';
const waitMs = Number(process.argv[4] ?? 6000);
const dmg = Number(process.argv[5] ?? 0);
const W = 1280;
const H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const profile = mkdtempSync(join(tmpdir(), 'edge-boss-'));

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await getTarget();
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?boss=${Date.now()}` });

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

let ready = false;
for (let i = 0; i < 80; i++) {
  ready = await evaluate('!!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) throw new Error('game did not boot');

await evaluate(`(() => {
  const g = window.__game;
  if (${JSON.stringify(String(process.argv[2] ?? '0'))} === 'extra') g._startExtraStage();
  else g.startStage(${stage});
  return 'started';
})()`);
for (let i = 0; i < 60; i++) {
  const ok = await evaluate(`(() => { const g = window.__game; return !!(g.stage && g.stage.boss && g.stage.boss.key === 'flandre'); })()`);
  if (ok) break;
  await sleep(200);
}
await sleep(300);

const info = await evaluate(`(() => {
  const g = window.__game;
  const s = g.stage;
  try { g.dialogue?.close(); } catch (e) {}
  g.state = 'play';
  s.state = 'play';
  s.beginBoss();
  const p = s.player;
  p.alive = true;
  p.hearts = 999;
  p.invuln = 9999;
  if (s.mode === 'stg') {
    p.x = 420;
    p.y = 620;
    if (s.camera?.view) { s.camera.view.x = Math.max(0, s.boss.x - 700); }
  } else {
    p.x = Math.max(120, s.boss.x - 430);
    p.y = s.level.h - 220;
    if (s.camera?.snapTo) s.camera.snapTo(s.boss.x - 420);
  }
  document.getElementById('overlay')?.classList.add('hidden');
  document.getElementById('dialogue')?.classList.add('hidden');
  return JSON.stringify({ boss: s.boss.key, bx: Math.round(s.boss.x), by: Math.round(s.boss.y), lw: s.level.w, lh: s.level.h, mode: s.mode });
})()`);
console.log('SETUP', info);

// 先空转让相机追上玩家（否则刚传送完 Boss 还在画面外）
await evaluate(`(() => { const g = window.__game; for (let i = 0; i < 420; i++) g.update(1/60); return 1; })()`);

const shots = [];
let stepped = 0;
for (let i = 0; i < 3; i++) {
  // headless 的 rAF 会被节流，直接手动步进游戏逻辑再渲染，保证弹幕真的展开
  const frames = i === 0 ? 60 : 240;
  const state = await evaluate(`(() => {
    const g = window.__game;
    const s = g.stage;
    if (${i === 1 && dmg > 0} && s.boss.state === 'battle') {
      s.boss.damage(s.boss.maxHp * ${dmg});
    }
    for (let i = 0; i < ${frames}; i++) g.update(1 / 60);
    if (s.mode === 'stg' && s.boss) { s.stg.scroll = s.boss.x - 900; s.camera.x = s.stg.scroll; }
    else if (s.boss) { s.camera.x = Math.max(0, Math.min(s.boss.x - 880, s.level.w - 1280)); }
    g.render(0);
    const b = s.boss;
    return JSON.stringify({
      state: b.state, phase: b.phase, phaseName: b.phaseName, pat: b.patternIdx,
      volleys: b.volleys, bullets: s.bullets.activeCount,
      bx: Math.round(b.x), by: Math.round(b.y), hp: Math.round(b.hp), al: b.alpha, st: b.state, camx: Math.round(s.camera.x), sx: Math.round(b.x - s.camera.x), sy: Math.round(b.y - s.camera.y),
    });
  })()`);
  stepped += frames;
  await sleep(180);
  const file = `${prefix}-${i + 1}.png`;
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', file, `t≈${(stepped / 60).toFixed(1)}s`, state);
  shots.push(file);
}

ws.close();
proc.kill();
await sleep(300);
process.exit(0);
