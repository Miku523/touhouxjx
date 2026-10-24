// 一次性排查：stage6（34 行关卡，相机可纵向滚动）画面上下亮度硬边 + 近景草叶跟随问题
// 用法: node tools/_bug_light_probe.mjs [stageIndex=5] [outPrefix=_bug_probe]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGE = Number(process.argv[2] ?? 5);
const OUT = process.argv[3] || '_bug_probe';
const PORT = 9421;
const URL0 = 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-bug-'));
const ROOT = 'C:/Users/GuSheng/Downloads/HKS';

const proc = spawn(EDGE, ['--headless=new', '--hide-scrollbars', '--no-first-run',
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
  writeFileSync(join(ROOT, name), Buffer.from(r.result.data, 'base64'));
  console.log('shot', name);
};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
  await sleep(1500);
  console.log('renderer:', await ev('JSON.stringify(window.__rendererInfo)'));
  console.log('quality:', await ev('window.__game.renderer && window.__game.renderer.quality'));

  await ev(`window.__game._warpToStage(${STAGE + 1})`);
  await sleep(2000);
  for (let i = 0; i < 40; i++) {
    if (await ev("window.__game.state === 'play'")) break;
    await ev('window.__game.dialogue && window.__game.dialogue.stop && window.__game.dialogue.stop()');
    await sleep(250);
  }
  await sleep(1200);
  console.log('state:', await ev('window.__game.state'), 'level:', await ev('window.__game.stage && window.__game.stage.level.id'),
    'mode:', await ev('window.__game.stage && window.__game.stage.mode'),
    'rows:', await ev('window.__game.stage && window.__game.stage.level.rows'),
    'levelH:', await ev('window.__game.stage && window.__game.stage.level.h'));

  // 传送玩家到某个 tile 列，站到地面上
  const tp = async (col) => {
    return await ev(`(() => {
      const s = window.__game.stage; if (!s || !s.player) return 'nostage';
      const p = s.player, lv = s.level;
      // 从 world 行里找该列最高的地面
      let row = 0;
      for (let r = lv.rows - 1; r > 1; r--) {
        if (lv.isSolidTile(${col}, r) && !lv.isSolidTile(${col}, r - 1) && !lv.isSolidTile(${col}, r - 2)) { row = r; break; }
      }
      p.x = ${col} * 32; p.y = row * 32 - p.h - 4;
      p.invuln = 1e9;
      p.vx = 0; p.vy = 0;
      s.camera.follow = true;
      s.camera.snapTo(p.x + p.w / 2);
      s.camera.prevX = s.camera.x; s.camera.prevY = s.camera.y;
      const wantY = Math.max(0, Math.min(p.y - 720 * 0.55, Math.max(0, lv.h - 720)));
      s.camera.y = wantY;
      s.camera.prevY = s.camera.y;
      return JSON.stringify({ row, px: p.x, py: p.y, camX: s.camera.x, camY: s.camera.y, maxY: Math.max(0, lv.h - 720) });
    })()`);
  };
  // 自动找一个「有地面可站」的列（从关卡 1/4 处往后扫）
  const autoCol = await ev(`(() => {
    const s = window.__game.stage, lv = s.level;
    const start = Math.max(8, Math.floor(lv.cols * 0.18));
    for (let pass = 0; pass < 2; pass++) {
      for (let c = start; c < lv.cols - 8; c++) {
        for (let r = lv.rows - 1; r > 3; r--) {
          if (lv.isSolidTile(c, r) && !lv.isSolidTile(c, r - 1) && !lv.isSolidTile(c, r - 2)
              && lv.isSolidTile(c + 1, r) && lv.isSolidTile(c + 2, r)) return c;
        }
      }
    }
    return -1;
  })()`);
  console.log('autoCol:', autoCol, 'cols:', await ev('window.__game.stage.level.cols'));
  console.log('tp:', await tp(autoCol));
  await sleep(900);
  console.log('cam now:', await ev('JSON.stringify(window.__game.stage.camera.viewAt(1))'));
  await shot(`${OUT}_a.png`);

  // 逐行亮度分析：每 4 行取一条，找相邻跃变
  const scan = async () => ev(`(() => {
    const cv = document.querySelector('canvas');
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const img = g.getImageData(0, 0, W, H).data;
    const rows = [];
    for (let y = 0; y < H; y += 4) {
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let x = 0; x < W; x += 8) {
        const i = (y * W + x) * 4;
        sr += img[i]; sg += img[i + 1]; sb += img[i + 2]; n++;
      }
      const lum = 0.2126 * (sr / n) + 0.7152 * (sg / n) + 0.0722 * (sb / n);
      rows.push([y, +lum.toFixed(2), +((sr/n)|0), +((sg/n)|0), +((sb/n)|0)]);
    }
    // 找最大跃变
    let best = null;
    for (let i = 2; i < rows.length - 2; i++) {
      const d = Math.abs(rows[i][1] - rows[i - 2][1]);
      if (!best || d > best.d) best = { d: +d.toFixed(2), y: rows[i][0], before: rows[i - 2][1], after: rows[i][1] };
    }
    return JSON.stringify({ W, H, best, sample: rows.filter((r, i) => i % 10 === 0) });
  })()`);
  const s1 = await scan();
  console.log('SCAN_A', s1);

  // 玩家横向移动后，比较近景草叶位置：截 3 张不同 cam.x 的图
  for (const col of [600, 900, 1200]) {
    console.log(`tp2 ${col}:`, await tp(col));
    await sleep(700);
    await shot(`${OUT}_c${col}.png`);
  }

  const scan2 = await scan();
  console.log('SCAN_B', scan2);
} catch (e) {
  console.error('ERR', e.message);
} finally {
  try { proc.kill(); } catch {}
  process.exit(0);
}
