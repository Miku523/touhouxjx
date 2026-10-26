// 直接进 EXTRA 第一场（咲夜）并连拍，用于检查立绘与弹幕
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const prefix = process.argv[2] ?? 'shot_sakuya';
const W = 1280, H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9371;
const profile = mkdtempSync(join(tmpdir(), 'edge-sak-'));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--window-size=${W},${H}`,`--remote-debugging-port=${PORT}`,'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const list = await r.json(); const p = list.find(t => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}
const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?probe=${Date.now()}` });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result?.value;
};
for (let i = 0; i < 100; i++) { if (await evaluate('!!window.__game')) break; await sleep(150); }
await evaluate(`(() => { const g = window.__game; g._startExtraStage(); return 1; })()`);
// 推进并推进对话，直到咲夜上场
let info = 'none';
for (let i = 0; i < 120; i++) {
  info = await evaluate(`(() => { const g = window.__game; const s = g.stage; try { if (g.dialogue && g.dialogue.active) g.dialogue.advance(); } catch(e) {} for (let i = 0; i < 20; i++) { try { g.update(1/60); } catch(e) { return 'ERR ' + e.message; } } return s && s.boss ? s.boss.key : (s ? 'nostage-boss' : 'nostage'); })()`);
  if (info === 'sakuya') break;
  await sleep(120);
}
console.log('INFO', info);
const setup = await evaluate(`(() => {
  const g = window.__game; const s = g.stage; if (!s || !s.boss) return 'no boss';
  try { g.dialogue?.close(); } catch(e) {}
  g.state = 'play'; s.state = 'play';
  if (s.boss.state !== 'battle') { try { s.beginBoss(); } catch(e) {} }
  const p = s.player; p.alive = true; p.hearts = 99; p.invuln = 9999;
  const b = s.boss;
  p.x = Math.max(60, b.x - 260); p.y = b.y + 120;
  if (s.mode === 'stg') { s.stg.scroll = Math.max(0, b.x - 900); s.camera.x = s.stg.scroll; }
  document.getElementById('overlay')?.classList.add('hidden');
  document.getElementById('dialogue')?.classList.add('hidden');
  for (let i = 0; i < 420; i++) g.update(1/60);
  return JSON.stringify({ key: b.key, state: b.state, phase: b.phase, phaseName: b.phaseName, hp: Math.round(b.hp), maxHp: b.maxHp });
})()`);
console.log('SETUP', setup);
let stepped = 0;
for (let i = 0; i < 3; i++) {
  const frames = i === 0 ? 90 : 260;
  const st = await evaluate(`(() => {
    const g = window.__game; const s = g.stage; const b = s.boss;
    for (let i = 0; i < ${frames}; i++) g.update(1/60);
    if (s.mode === 'stg' && b) { s.stg.scroll = Math.max(0, b.x - 900); s.camera.x = s.stg.scroll; }
    g.render(0);
    return JSON.stringify({ state: b.state, phase: b.phase, phaseName: b.phaseName, bullets: s.bullets.activeCount, hp: Math.round(b.hp), alpha: b.alpha });
  })()`);
  stepped += frames; await sleep(200);
  const file = `${prefix}-${i + 1}.png`;
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log('SHOT', file, `t≈${(stepped / 60).toFixed(1)}s`, st);
}
ws.close(); proc.kill(); await sleep(300); process.exit(0);
