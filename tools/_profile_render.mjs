// 定位进关首帧卡顿落在哪个渲染环节：begin / stage.draw / present / _bloomPass
// 用法: node tools/_profile_render.mjs [port]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9550);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8142/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-rend-'));

const proc = spawn(EDGE, ['--headless=new', '--no-first-run', '--mute-audio',
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
  return r.result?.result?.value ?? JSON.stringify(r.result?.result);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL0 });
await sleep(3200);
console.log('页面:', await ev('(() => { const g = window.__game; return g ? "ok state=" + g.state : "NO_GAME"; })()'));

const out = await ev(`(async () => {
  const g = window.__game;
  const R = g.renderer;
  const stageMod = await import('/src/game/stage.js');
  const LOG = [];
  let fn = -1;
  const rec = (k, ms) => {
    // 预热等「帧外」调用时 fn 可能是 -1，必须兜住，否则抛异常会被上层 catch 吞掉
    const i = fn < 0 ? 0 : fn;
    while (LOG.length <= i) LOG.push({});
    LOG[i][k] = +( (LOG[i][k] || 0) + ms ).toFixed(1);
  };

  const wrap = (obj, name, key) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return false;
    obj[name] = function (...a) {
      const t0 = performance.now();
      const r = orig.apply(this, a);
      rec(key, performance.now() - t0);
      return r;
    };
    return true;
  };

  const ok = [];
  if (wrap(R, 'begin', 'begin')) ok.push('begin');
  if (wrap(R, 'present', 'present')) ok.push('present');
  if (wrap(R, '_bloomPass', 'bloom')) ok.push('bloom');
  if (wrap(stageMod.Stage.prototype, 'draw', 'stageDraw')) ok.push('stageDraw');

  // 每帧开始：fn+1
  const origBegin = R.begin;
  R.begin = function (...a) { fn++; return origBegin.apply(this, a); };

  g.lives = 99; g.char = 'reimu';
  const t0 = performance.now();
  g.startStage(0);
  const startStageMs = performance.now() - t0;

  await new Promise(r => setTimeout(r, 2500));

  return JSON.stringify({
    wrapped: ok,
    startStageMs: +startStageMs.toFixed(1),
    prewarm: window.__prewarmInfo,
    前12帧: LOG.slice(0, 12),
    稳态均值: (() => {
      const s = LOG.slice(15, 60);
      if (!s.length) return null;
      const keys = ['begin','stageDraw','present','bloom'];
      const o = {};
      for (const k of keys) o[k] = +(s.reduce((a, b) => a + (b[k] || 0), 0) / s.length).toFixed(2);
      return o;
    })(),
  });
})()`);

console.log('\n=== 各渲染环节逐帧耗时 (ms) ===');
const j = JSON.parse(out);
console.log('插桩:', j.wrapped.join(', '), '| startStage:', j.startStageMs, 'ms | prewarm:', JSON.stringify(j.prewarm));
console.log('帧   begin   stageDraw   present   bloom');
for (let i = 0; i < j.前12帧.length; i++) {
  const f = j.前12帧[i] || {};
  const pad = (v) => String(v ?? '-').padStart(6);
  console.log(String(i).padStart(3) + pad(f.begin) + pad(f.stageDraw) + pad(f.present) + pad(f.bloom));
}
console.log('\n稳态均值:', JSON.stringify(j.稳态均值));

proc.kill();
process.exit(0);
