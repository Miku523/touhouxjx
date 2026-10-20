// 运行时统计：每关实体（P 道具 / 敌人）数量，以及 POWER 供给估算
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = process.env.PT_BASE || 'http://127.0.0.1:8137';
const PORT = 9433;
const profile = mkdtempSync(join(tmpdir(), 'edge-psup-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
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
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
try {
  await send('Page.enable');
  await send('Page.navigate', { url: `${URL0}/index.html?psup=${Date.now()}` });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game')) break; await sleep(120); }
  await sleep(600);

  const out = await ev(`(async () => {
    const { LEVELS } = await import('/src/assets/levels.js');
    const { Level } = await import('/src/game/level.js');
    const { POWER } = await import('/src/game/power.js');
    const rows = [];
    LEVELS.forEach((def, i) => {
      const lv = new Level(def, i);
      const by = {};
      for (const e of lv.entities) by[e.type] = (by[e.type] || 0) + 1;
      const enemies = (by.fairy || 0) + (by.flyer || 0);
      rows.push({ id: def.id || i, mode: def.mode || 'platform', powerItems: by.power || 0, coins: by.coin || 0, fairy: by.fairy || 0, flyer: by.flyer || 0, boss: !!def.boss, killGain: POWER.kill, pickup: POWER.pickup, killStg: POWER.killStg, max: POWER.max });
    });
    return rows;
  })()`);
  for (const r of out) console.log(JSON.stringify(r));
  const platform = out.filter((r) => r.mode === 'platform');
  const sum = (k, arr = out) => arr.reduce((n, r) => n + (r[k] || 0), 0);
  console.log('---');
  console.log('平台关(1-3): P道具', sum('powerItems', platform), '敌人', sum('fairy', platform) + sum('flyer', platform));
  console.log('全部可吃 P(道具)', sum('powerItems'), '× pickup =', sum('powerItems') * out[0].pickup);
} finally {
  try { ws.close(); } catch {}
  proc.kill();
  await sleep(200);
}
