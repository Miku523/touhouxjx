// 自动玩家：从 stage6 最后一个检查点（col 3220）向右跑到 Boss 场，记录是否掉坑/死亡
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9414;
const URL0 = 'http://127.0.0.1:8138/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-s6run-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

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
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p(d); }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const rr = r.result;
  if (rr?.exceptionDetails) throw new Error('eval: ' + (rr.exceptionDetails.exception?.description || rr.exceptionDetails.text || ''));
  return rr?.result?.value;
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(1000);
  await ev('window.__game.startStage(5)');
  await sleep(600);
  for (let i = 0; i < 80; i++) {
    const active = await ev('!!(window.__game.dialogue && window.__game.dialogue.active)');
    if (!active) break;
    await ev('window.__game.dialogue.advance()');
    await sleep(100);
  }
  await sleep(600);

  const res = await ev(`(() => {
    const s = window.__game.stage; const p = s.player; const lv = s.level;
    const T = 32;
    p.x = 3220 * T; p.y = 23 * T - p.h; p.vx = 0; p.vy = 0; p.alive = true; p.invuln = 999; p.onGround = true;
    let jumpReq = false;
    const fake = {
      down(a) { return a === 'right'; },
      pressed(a) { return a === 'jump' ? jumpReq : false; },
      released() { return false; },
      get axisX() { return 1; },
      endFrame() {},
    };
    const dt = 1 / 60;
    const deaths = [];
    let lastX = p.x;
    const log = [];
    for (let i = 0; i < 3600; i++) {
      // 前方探测：脚底前方 8..56px 是否有可站立面（往下 2 格）
      const fx = p.x + p.w + 10;
      const footY = p.y + p.h;
      let aheadSolid = false;
      for (let ox = 0; ox <= 56; ox += 14) {
        for (let oy = 2; oy <= 70; oy += 16) {
          const cx = Math.floor((fx + ox) / T);
          const cy = Math.floor((footY + oy) / T);
          if (lv.isSolidTile(cx, cy) || lv.isPlatformTile(cx, cy)) { aheadSolid = true; break; }
        }
        if (aheadSolid) break;
      }
      jumpReq = false;
      // 前方没地面 or 前方有墙 -> 跳
      let wall = false;
      for (let oy = -p.h + 8; oy < -8; oy += 16) {
        const cx = Math.floor((p.x + p.w + 6) / T);
        const cy = Math.floor((p.y + p.h + oy) / T);
        if (lv.isSolidTile(cx, cy)) { wall = true; break; }
      }
      if (p.onGround && (!aheadSolid || wall)) jumpReq = true;
      // 撞墙/脚下空时用二段跳翻越
      if (!p.onGround && wall && p.jumpsLeft > 0 && p.vy > -80) jumpReq = true;
      // 空中贴近地面时若脚下空且前方空，二段跳兜底
      if (!p.onGround && p.vy > 120 && !aheadSolid && p.jumpsLeft > 0) jumpReq = true;
      p.update(dt, fake);
      if (i % 20 === 0) log.push([i, Math.round(p.x / T), Math.round(p.y), p.onGround ? 1 : 0]);
      if (!p.alive || p.y > lv.h + 80) {
        deaths.push({ frame: i, col: Math.round(p.x / T), y: Math.round(p.y), fell: p.y > lv.h + 80 });
        break;
      }
      if (p.x > 3712 * T) { log.push(['REACHED_END', Math.round(p.x / T)]); break; }
    }
    return JSON.stringify({ endX: Math.round(p.x / T), alive: p.alive, deaths, log: log.slice(-40) });
  })()`);
  const data = JSON.parse(res);
  console.log('endX(col)=', data.endX, 'alive=', data.alive);
  console.log('deaths=', JSON.stringify(data.deaths));
  for (const l of data.log) console.log(l.join('\t'));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { proc.kill(); } catch {}
  process.exit(0);
}
