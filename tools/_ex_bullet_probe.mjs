// 一次性质检：EX 道中实际同屏弹量 / 敌机数（判断 1250 弹量预算是否已经打满）
// 用法: node tools/_ex_bullet_probe.mjs [cdpPort] [httpPort]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9505);
const HTTP = Number(process.argv[3] ?? 8138);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-exb-'));

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
await sleep(900);

const out = JSON.parse(await ev(`(() => {
  const g = window.__game;
  g.lives = 50; g.char = 'reimu'; g.unlockedExtra = true; g.inExtra = true;
  g.carryPower = 0; g.continues = 0;
  g._startExtraStage({ skipIntro: true });
  const inp = g.input;
  inp.down = (a) => a === 'shoot';
  inp.pressed = () => false;
  inp.released = () => false;
  Object.defineProperty(inp, 'axisX', { get: () => 0, configurable: true });

  const st = g.stage;
  st.player.invuln = 99999;
  const samples = [];
  let maxB = 0, maxE = 0, maxP = 0;
  let freezeB = 0, frames = 0;
  for (let f = 0; f < 60 * 185; f++) {
    const s = g.stage, sg = s && s.stg;
    if (!sg) break;
    if (s.player) s.player.invuln = 99999;
    g.loop.update(1 / 60);
    if (f % 6 !== 0) continue;
    if (g.state !== 'play' || s.extraT > 119.5) continue;
    const b = s.bullets ? (s.bullets.activeCount ?? 0) : 0;
    const e = sg.enemies ? sg.enemies.length : 0;
    if (b > maxB) maxB = b;
    if (e > maxE) maxE = e;
    if (e > maxP) maxP = e;
    if (b >= 1200) freezeB++;
    frames++;
    samples.push({ t: +(+s.extraT).toFixed(1), b, e, ky: sg.enemies ? sg.enemies.length : 0 });
  }
  const hist = (key) => {
    const v = samples.map((x) => x[key]).sort((a, b) => a - b);
    const q = (p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
    const mean = v.reduce((a, b) => a + b, 0) / (v.length || 1);
    return { max: v[v.length - 1], p50: q(0.5), p90: q(0.9), p99: q(0.99), mean: +mean.toFixed(1) };
  };
  return JSON.stringify({
    budget: st.stg.enemyBulletBudget,
    samples: samples.length,
    bullets: hist('b'),
    enemies: hist('e'),
    nearCapFrames: freezeB, totalSampled: frames,
    timeline: samples.filter((_, i) => i % 20 === 0).map((x) => \`\${x.t}s b=\${x.b} e=\${x.e}\`),
    state: g.state, extraT: +(+st.extraT).toFixed(1),
  });
})()`));

console.log(JSON.stringify({ budget: out.budget, samples: out.samples, bullets: out.bullets, enemies: out.enemies, nearCap: `${out.nearCapFrames}/${out.totalSampled}`, state: out.state, extraT: out.extraT }, null, 2));
console.log('\n时间线（每 2 秒采样）:');
console.log(out.timeline.join('\n'));
try { proc.kill(); } catch {}
ws.close();
process.exit(0);
