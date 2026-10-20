// 验证：吃一枚 P 点 = +4 POWER / +4 extend 进度 / 条宽 +6%
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = process.env.PT_BASE || 'http://127.0.0.1:8137';
const PORT = 9437;
const profile = mkdtempSync(join(tmpdir(), 'edge-ppick-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`, '--window-size=1280,720',
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
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
let fails = 0;
const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' -> ' + JSON.stringify(detail)}`); };
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Runtime.addBinding', { name: '__err' }).catch(() => {});
  await send('Log.enable').catch(() => {});
  await send('Page.navigate', { url: `${URL0}/index.html?ppick=${Date.now()}` });
  let booted = false;
  for (let i = 0; i < 160; i++) {
    try { if (await ev('!!window.__game && document.readyState === "complete"')) { booted = true; break; } } catch {}
    await sleep(150);
  }
  if (!booted) {
    console.log('BOOT-DIAG', JSON.stringify(await ev('({ href: location.href, ready: document.readyState, game: typeof window.__game })').catch((e) => String(e))));
    throw new Error('game never booted');
  }
  await sleep(600);

  await ev(`(() => {
    const g = window.__game;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play';
    const p = g.stage.player;
    p.power = 0; p.maxPower = 64;
    window.__p0 = { power: p.power };
    return true;
  })()`);
  await sleep(300);

  const out = await ev(`(async () => {
    const g = window.__game;
    const s = g.stage;
    const p = s.player;
    const pick = s.pickups.find((it) => it.kind === 'power' && !it.taken);
    if (!pick) return { err: 'no power pickup' };
    const { POWER } = await import('/src/game/power.js');
    const before = { power: p.power, ext: s.extendPts || 0 };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    p.x = pick.x; p.y = pick.y - 4;
    await wait(220);
    const fill = document.querySelector('#powerFill');
    const after = { power: p.power, ext: s.extendPts || 0, fill: fill ? fill.style.width : null, num: document.querySelector('#powerNum')?.textContent, x: pick.x, y: pick.y };
    // 再吃第二颗，验证叠加
    const pick2 = s.pickups.find((it) => it.kind === 'power' && !it.taken);
    let second = null;
    if (pick2) { p.x = pick2.x; p.y = pick2.y - 4; await wait(220); second = { power: p.power, ext: s.extendPts || 0, fill: fill ? fill.style.width : null, num: document.querySelector('#powerNum')?.textContent }; }
    const hud = s.hudState;
    return { POWER: { pickup: POWER.pickup, kill: POWER.kill, max: POWER.max }, before, after, second, hud: { power: hud.power, max: hud.maxPower }, total: s.pickups.filter((it) => it.kind === 'power').length };
  })()`);
  console.log('DATA', JSON.stringify(out, null, 1));
  if (!out.err) {
    check('P.pickup = 4', out.POWER.pickup === 4, out.POWER);
    check('吃 1 颗 P → +4 POWER', out.after.power - out.before.power === 4, out);
    check('吃 1 颗 P → +4 extend 进度', out.after.ext - out.before.ext === 4, out);
    check('条宽 0% → 6%（4/64）', out.after.fill === '6%' && out.after.num === '4', out.after);
    if (out.second) {
      check('再吃 1 颗 → 8 点 / 13%', out.second.power === 8 && out.second.fill === '13%', out.second);
    }
  }
  console.log('RESULT', fails ? `FAIL ${fails}` : 'PASS all');
} finally {
  try { ws.close(); } catch {}
  proc.kill();
  await sleep(200);
}
