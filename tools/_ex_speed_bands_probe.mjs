// 一次性质检：EX 道中「快慢混编」是否真的落到屏幕上
//   1) 采样活跃敌弹的实际速度（hypot(vx,vy)），看是否分成多档而不是一个速度；
//   2) 包一层 bullets.fan / ring，检查每一轮带 speedVar 的齐射里至少有两种速度、
//      且快档没有超过 bulletSpeedCap；
//   3) 顺手复核同屏弹量没有被速度分档带偏（EX 预算 1250）。
// 用法: node tools/_ex_speed_bands_probe.mjs [cdpPort] [httpPort]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9506);
const HTTP = Number(process.argv[3] ?? 8138);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-exspd-'));

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
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params?.exceptionDetails?.exception?.description || 'exception');
  if (d.method === 'Runtime.consoleAPICalled' && d.params?.type === 'error') {
    errors.push((d.params.args || []).map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 400));
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${HTTP}/index.html` });
for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
await sleep(900);

const boot = `
  const g = window.__game;
  g.lives = 50; g.char = 'reimu'; g.unlockedExtra = true; g.inExtra = true;
  g.carryPower = 0; g.continues = 0;
  g._startExtraStage({ skipIntro: true });
  const inp = g.input;
  inp.down = (a) => a === 'shoot';
  inp.pressed = () => false;
  inp.released = () => false;
  Object.defineProperty(inp, 'axisX', { get: () => 0, configurable: true });
  if (g.stage.player) g.stage.player.invuln = 99999;
  // 包一层 fan / ring：记录每轮齐射的速度谱
  const bs = g.stage.bullets;
  window.__vol = { calls: 0, multi: 0, single: 0, overCap: 0, samples: [] };
  const speedsOf = (n, speed, o) => {
    const vs = o && o.speedVar ? o.speedVar : null;
    const cap = (o && o.speedCap) || 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      let sp = speed * (vs ? vs[i % vs.length] : 1);
      if (cap && sp > cap) sp = cap;
      list.push(+sp.toFixed(1));
    }
    return { vs, cap, list };
  };
  for (const name of ['fan', 'ring']) {
    const orig = bs[name].bind(bs);
    bs[name] = (...a) => {
      const n = a[2];
      const speed = name === 'fan' ? a[5] : a[3];
      const o = name === 'fan' ? (a[6] || {}) : (a[4] || {});
      const r = speedsOf(n, speed, o);
      if (r.vs) {
        window.__vol.calls++;
        const uniq = new Set(r.list.map((v) => v.toFixed(1)));
        if (uniq.size > 1) window.__vol.multi++; else window.__vol.single++;
        if (r.cap && r.list.some((v) => v > r.cap + 0.01)) window.__vol.overCap++;
        if (window.__vol.samples.length < 6) window.__vol.samples.push({ n, base: +speed.toFixed(1), list: r.list });
      }
      return orig(...a);
    };
  }
  'ok';
`;
await ev(`(() => { ${boot} })()`);

const run = JSON.parse(await ev(`(() => {
  const g = window.__game;
  const st = g.stage;
  const buckets = new Map();
  const all = [];
  let samples = 0, sumB = 0, maxB = 0, sumE = 0, maxE = 0;
  for (let f = 0; f < 60 * 126; f++) {
    const s = g.stage, sg = s && s.stg;
    if (!sg) break;
    if (s.player) s.player.invuln = 99999;
    g.loop.update(1 / 60);
    if (g.state !== 'play' || s.extraT > 119.5) continue;
    if (f % 6 !== 0) continue;
    samples++;
    const bs = s.bullets;
    const act = bs ? (bs.activeCount ?? 0) : 0;
    sumB += act; if (act > maxB) maxB = act;
    const en = sg.enemies ? sg.enemies.length : 0;
    sumE += en; if (en > maxE) maxE = en;
    if (bs && bs.pool) {
      for (const b of bs.pool) {
        if (!b.active) continue;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < 1 || sp > 900) continue;
        all.push(sp);
        const k = Math.round(sp / 10) * 10;
        buckets.set(k, (buckets.get(k) || 0) + 1);
      }
    }
  }
  all.sort((a, b) => a - b);
  const q = (p) => all.length ? +all[Math.min(all.length - 1, Math.floor(all.length * p))].toFixed(1) : 0;
  const hist = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ sp: k, n: v }));
  const total = all.length || 1;
  const share = (pred) => +((all.filter(pred).length / total) * 100).toFixed(1);
  const med = q(0.5);
  return JSON.stringify({
    samples,
    bullets: { mean: +(sumB / (samples || 1)).toFixed(1), max: maxB },
    enemies: { mean: +(sumE / (samples || 1)).toFixed(1), max: maxE },
    speed: {
      n: all.length, min: q(0), p10: q(0.1), p25: q(0.25), p50: med, p75: q(0.75), p90: q(0.9), max: q(1),
      distinctBuckets: hist.length,
      fastSharePct: share((v) => v > med * 1.12),
      slowSharePct: share((v) => v < med * 0.9),
    },
    hist,
    volley: window.__vol,
  });
})()`));

// —— 低难度对照：E 应同速、N 应只有轻微快慢差 ——
const lowRun = async (diff, frames) => JSON.parse(await ev(`(() => {
  const g = window.__game;
  g.inExtra = false;
  g.difficulty = '${diff}';
  g.startStage(3, { skipIntro: true });
  const inp = g.input;
  inp.down = (a) => a === 'shoot';
  inp.pressed = () => false;
  inp.released = () => false;
  Object.defineProperty(inp, 'axisX', { get: () => 0, configurable: true });
  if (g.stage.player) g.stage.player.invuln = 99999;
  const bands = (g.stage.stg && g.stage.stg.enemyMods && g.stage.stg.enemyMods.bands) || null;
  const diag = { state: g.state, hasStg: !!(g.stage && g.stage.stg) };
  const all = [];
  let notPlay = 0, noBul = 0, seen = 0;
  for (let f = 0; f < ${frames}; f++) {
    const s = g.stage, sg = s && s.stg;
    if (!sg) break;
    if (s.player) s.player.invuln = 99999;
    g.loop.update(1 / 60);
    if (g.state !== 'play') { notPlay++; continue; }
    if (f % 4 !== 0) continue;
    const bs = s.bullets;
    if (!bs || !bs.pool) { noBul++; continue; }
    seen++;
    for (const b of bs.pool) {
      if (!b.active) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 1 || sp > 900) continue;
      all.push(sp);
    }
  }
  all.sort((a, b) => a - b);
  const q = (p) => all.length ? +all[Math.min(all.length - 1, Math.floor(all.length * p))].toFixed(1) : 0;
  const uniq = new Set(all.map((v) => Math.round(v / 10) * 10));
  return JSON.stringify({ diff: '${diff}', stageDiff: g.stage && g.stage.difficulty, mods: g.stage && g.stage.stg ? g.stage.stg.enemyMods : null, notPlay, noBul, seen, bands, diag, n: all.length, p10: q(0.1), p50: q(0.5), p90: q(0.9), buckets: uniq.size });
})()`));

const ez = await lowRun('E', 60 * 22);
const nz = await lowRun('N', 60 * 22);
const lz = await lowRun('L', 60 * 22);

const report = { ex: run, easy: ez, normal: nz, lunatic: lz, errors };
console.log(JSON.stringify(report, null, 1));
ws.close();
proc.kill();
