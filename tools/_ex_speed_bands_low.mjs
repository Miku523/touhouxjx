// 一次性质检：主线 stg（第 4 面）在 E / N / L 下的道中弹速分档
//   E 应只有一种速度（bands [1,1]），N/H/L 应逐渐拉开快慢差。
// 每档都用一次全新导航，避免上一关残留状态影响采样。
// 用法: node tools/_ex_speed_bands_low.mjs [cdpPort] [httpPort]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9514);
const HTTP = Number(process.argv[3] ?? 8138);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-exlow-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 400));
  return r.result?.result?.value;
};
await send('Page.enable'); await send('Runtime.enable');

const runOne = async (diff) => {
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/index.html` });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(900);
  return JSON.parse(await ev(`(() => {
    const g = window.__game;
    g.difficulty = '${diff}';
    g.startStage(3, { skipIntro: true });
    const inp = g.input;
    inp.down = (a) => a === 'shoot';
    inp.pressed = () => false;
    inp.released = () => false;
    Object.defineProperty(inp, 'axisX', { get: () => 0, configurable: true });
    const stg = g.stage.stg;
    const bands = stg.enemyMods.bands || null;
    const all = [];
    const volley = { calls: 0, multi: 0, single: 0, overCap: 0 };
    const bs = g.stage.bullets;
    for (const name of ['fan', 'ring']) {
      const orig = bs[name].bind(bs);
      bs[name] = (...a) => {
        const n = a[2];
        const speed = name === 'fan' ? a[5] : a[3];
        const o = name === 'fan' ? (a[6] || {}) : (a[4] || {});
        const vs = o.speedVar;
        if (vs) {
          volley.calls++;
          const cap = o.speedCap || 0;
          const list = [];
          for (let i = 0; i < n; i++) {
            let sp = speed * vs[i % vs.length];
            if (cap && sp > cap) sp = cap;
            list.push(sp);
          }
          if (new Set(list.map((v) => v.toFixed(1))).size > 1) volley.multi++; else volley.single++;
          if (cap && list.some((v) => v > cap + 0.01)) volley.overCap++;
        }
        return orig(...a);
      };
    }
    for (let f = 0; f < 60 * 24; f++) {
      const s = g.stage, sg = s && s.stg;
      if (!sg) break;
      if (s.player) s.player.invuln = 99999;
      g.loop.update(1 / 60);
      if (g.state !== 'play' || f % 4 !== 0) continue;
      if (!bs || !bs.pool) continue;
      for (const b of bs.pool) {
        if (!b.active) continue;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp >= 1 && sp <= 900) all.push(sp);
      }
    }
    all.sort((a, b) => a - b);
    const q = (p) => (all.length ? +all[Math.min(all.length - 1, Math.floor(all.length * p))].toFixed(1) : 0);
    return JSON.stringify({
      diff: '${diff}', bands, n: all.length, p10: q(0.1), p50: q(0.5), p90: q(0.9),
      buckets: new Set(all.map((v) => Math.round(v / 10) * 10)).size, volley,
    });
  })()`));
};

const out = [];
for (const d of ['E', 'N', 'H', 'L']) out.push(await runOne(d));
console.log(JSON.stringify(out, null, 1));
ws.close();
proc.kill();
