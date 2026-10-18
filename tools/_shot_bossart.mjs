// 雷米莉亚战斗立绘在游戏里的最终观感（AI 图 + 引擎特效）
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8138/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9375);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-ba-'));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
async function firstPage() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools target');
}
const page = await firstPage();
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL0}?ba=${Date.now()}` });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};
for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);

// 预热 AI 立绘，避免抽到程序化 fallback
await ev(`(async () => {
  await Promise.all(['src/art/gen/boss/remilia.png', 'src/art/gen/remilia.png'].map((u) =>
    new Promise((r) => { const im = new Image(); im.onload = im.onerror = r; im.src = u; })));
  return 1;
})()`);
await sleep(1200);

await ev(`(() => {
  const g = window.__game;
  g.unlockedExtra = true; g.extraChar = 'marisa'; g.char = 'marisa';
  g.inExtra = true; g._startExtraStage();
  g.dialogue?.stop?.(); g.dialogue?.close?.();
  const s = g.stage;
  g.state = 'play'; s.state = 'play';
  s.extraT = 300; s.midbossDone = false;
  s.pendingBossKey = 'remilia'; s.pendingBossMid = true;
  s.beginBoss();
  const p = s.player; p.alive = true; p.invuln = 9999; p.power = 96;
  return 1;
})()`);
await sleep(3500);
await ev(`(() => { const g = window.__game; const b = g.stage.boss; if (b) b.t = 3; return 1; })()`);
for (let i = 0; i < 12; i++) {
  await ev(`(() => { const g = window.__game; g.stage.bullets.clear(); g.stage.player.invuln = 9999; g.render(0); return 1; })()`);
  await sleep(120);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('_boss-art.png', Buffer.from(shot.data, 'base64'));
console.log('SHOT _boss-art.png');
console.log('INFO', await ev(`(() => { const g = window.__game; const b = g.stage.boss; return JSON.stringify({ st: b?.state, t: +(b?.t || 0).toFixed(1), alpha: b?.alpha }); })()`));
ws.close();
proc.kill();
await sleep(300);
process.exit(0);
