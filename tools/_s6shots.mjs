// stage6 最后一段实机截图：检查点附近 + Boss 场入口
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9412;
const URL0 = 'http://127.0.0.1:8138/index.html';
const OUT = 'C:/Users/GuSheng/Downloads/HKS/tools';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-s6s-'));

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
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
  console.log('shot', name);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(1200);

  const info = await ev(`(() => {
    const g = window.__game;
    const list = g._mainStages();
    return JSON.stringify(list.map(s => s.id + ':' + s.title));
  })()`);
  console.log('stages:', info);

  await ev(`window.__game.startStage(5)`);
  await sleep(800);
  // 跳过开场对白：一直 advance 到对话结束
  for (let i = 0; i < 80; i++) {
    const active = await ev('!!(window.__game.dialogue && window.__game.dialogue.active)');
    if (!active) break;
    await ev('window.__game.dialogue.advance()');
    await sleep(120);
  }
  await sleep(800);
  console.log('state:', await ev('window.__game.state'), 'stage:', await ev('!!(window.__game.stage && window.__game.stage.player)'));

  await sleep(4000);
  console.log('stage state:', await ev('window.__game.stage && window.__game.stage.state'),
    'p.x:', await ev('window.__game.stage && window.__game.stage.player && window.__game.stage.player.x'));

  // 传送到检查点 col 3220 附近
  const teleport = async (col, row) => {
    const r = await ev(`(() => {
      const s = window.__game.stage; if (!s || !s.player) return 'nostage';
      const p = s.player;
      p.x = ${col} * 32; p.y = ${row} * 32 - p.h - 4;
      p.vx = 0; p.vy = 0;
      s.camera.follow = true;
      s.camera.snapTo(p.x + p.w / 2);
      s.camera.prevX = s.camera.x; s.camera.prevY = s.camera.y;
      return JSON.stringify({state:s.state,x:p.x,y:p.y,h:p.h,cam:s.camera.x});
    })()`);
    await sleep(500);
    return r;
  };

  console.log('tp 3190:', await teleport(3190, 23));
  console.log('after tp p.x:', await ev('window.__game.stage.player.x'), 'cam:', await ev('window.__game.stage.camera.x'));
  await shot('_s6_cp_3220.png');

  await teleport(3230, 23);
  await shot('_s6_after_cp.png');

  await teleport(3242, 23);
  await shot('_s6_pit_gap.png');

  await teleport(3640, 23);
  await shot('_s6_boss_entry_a.png');

  await teleport(3660, 23);
  await shot('_s6_boss_entry_b.png');

  // 走到 Boss 场入口边缘看看
  await ev(`(() => { const s=window.__game.stage; const p=s.player; p.x = 3666*32; p.y=23*32-p.h-4; p.vx=0;p.vy=0; s.camera.snapTo(p.x+p.w/2); s.camera.prevX=s.camera.x; s.camera.prevY=s.camera.y; return 1; })()`);
  await sleep(500);
  await shot('_s6_boss_entry_edge.png');
  console.log('edge p.x:', await ev('window.__game.stage.player.x'), 'p.y:', await ev('window.__game.stage.player.y'),
    'cam:', await ev('window.__game.stage.camera.x'), 'stageState:', await ev('window.__game.stage.state'));
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { proc.kill(); } catch {}
  process.exit(0);
}
