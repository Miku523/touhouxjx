// 一次性：给 EX 道中拍两张密度对照图（55s / 100s），存 root 的 _ex_mid_*.png（gitignore 已忽略）
// 用法: node tools/_ex_shot.mjs [cdpPort] [httpPort]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9507);
const HTTP = Number(process.argv[3] ?? 8138);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-exs-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 300));
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/index.html` });
for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
await sleep(1200);

await ev(`(() => {
  const g = window.__game;
  g.lives = 50; g.char = 'reimu'; g.unlockedExtra = true; g.inExtra = true;
  g.carryPower = 0; g.continues = 0;
  g._startExtraStage({ skipIntro: true });
  const inp = g.input;
  inp.down = (a) => a === 'shoot';
  inp.pressed = () => false;
  inp.released = () => false;
  let ax = 0;
  Object.defineProperty(inp, 'axisX', { get: () => ax, configurable: true });
  window.__advanceTo = (sec) => {
    const st = g.stage;
    for (let i = 0; i < 60 * 400; i++) {
      if (st.extraT >= sec) break;
      if (st.player) st.player.invuln = 99999;
      ax = (Math.floor(i / 90) % 2) ? 0.55 : -0.55;
      g.loop.update(1 / 60);
    }
    const s = g.stage;
    return JSON.stringify({
      extraT: +(+s.extraT).toFixed(1), state: g.state,
      bullets: s.bullets ? s.bullets.activeCount : -1,
      enemies: s.stg ? s.stg.enemies.length : -1,
      power: s.player ? +(+s.player.power).toFixed(0) : -1,
    });
  };
  return 'OK';
})()`);

for (const sec of [55, 100]) {
  const stats = await ev(`window.__advanceTo(${sec})`);
  console.log(`t=${sec}s`, stats);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.result.data, 'base64');
  const out = `_ex_mid_${sec}s.png`;
  writeFileSync(out, buf);
  console.log('  saved', out, buf.length, 'bytes');
}

try { proc.kill(); } catch {}
ws.close();
process.exit(0);
