// 视觉验收截图：长图、水域、高关卡、Boss 场、EX 弹幕
// 用法: node tools/_qa_mapshots.mjs [url]  → 输出 tools/_shots/*.png
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8138/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9373);
const W = 1280, H = 720;
const OUT = 'tools/_shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-shots-'));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools target');
}

let ws, id = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || ''));
  return r.result?.value;
};
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, name + '.png');
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  shot', file);
}

const TELEPORT = `window.__tp = (targetX) => {
  const st = window.__game.stage;
  const lv = st.level;
  const p = st.player;
  let best = null;
  for (let dx = 0; dx < 400 && !best; dx++) {
    for (const s of [dx, -dx]) {
      const cx = Math.round(targetX / 32) + s;
      if (cx < 4 || cx > lv.cols - 60) continue;
      for (let cy = 2; cy < lv.rows - 3; cy++) {
        if (lv.isSolidTile(cx, cy) && !lv.isSolidTile(cx, cy - 1) && !lv.isSolidTile(cx, cy - 2)) {
          best = { x: cx * 32 + 8, y: cy * 32 - p.h - 2 };
          break;
        }
      }
      if (best) break;
    }
  }
  if (!best) return false;
  p.x = best.x; p.y = best.y; p.vx = 0; p.vy = 0; p.onGround = false;
  p.invuln = 999;
  st.camera.snapTo(p.x);
  st.camera.y = Math.max(0, Math.min(best.y - 360, lv.h - 720));
  st.camera.ty = st.camera.y;
  return { x: Math.round(best.x), y: Math.round(best.y) };
};`;

try {
  mkdirSync(OUT, { recursive: true });
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}?qashot=${Date.now()}` });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(600);
  await ev(TELEPORT);

  console.log('[1] stage1 起点 + 中段');
  await ev(`window.__game.startStage(0, { skipIntro: true })`);
  await sleep(900);
  await ev(`(() => { const g = window.__game; g.stage.player.invuln = 999; g.stage.camera.snapTo(g.stage.player.x); })()`);
  await sleep(300);
  await shot('01-stage1-start');
  await ev(`window.__tp(52000)`);
  await sleep(700);
  await shot('02-stage1-mid');

  console.log('[2] stage3 水域');
  await ev(`window.__game.startStage(2, { skipIntro: true })`);
  await sleep(500);
  const water = await ev(`(() => {
    const g = window.__game, st = g.stage, lv = st.level;
    for (let cy = 0; cy < lv.rows; cy++) for (let cx = 200; cx < lv.cols - 200; cx++) {
      if (lv.isWaterTile(cx, cy) && lv.isWaterTile(cx, cy + 1)) {
        const p = st.player;
        p.x = cx * 32 + 6; p.y = cy * 32 - 20; p.vx = 0; p.vy = 0; p.invuln = 999;
        st.camera.snapTo(p.x); st.camera.y = Math.max(0, Math.min(cy * 32 - 400, lv.h - 720));
        st.camera.ty = st.camera.y;
        return { cx, cy };
      }
    }
    return null;
  })()`);
  console.log('   water at', JSON.stringify(water));
  await sleep(700);
  await shot('03-stage3-water');

  console.log('[3] stage5 高关卡');
  await ev(`window.__game.startStage(4, { skipIntro: true })`);
  await sleep(600);
  await ev(`window.__tp(30000)`);
  await sleep(700);
  await shot('04-stage5-tall');

  console.log('[4] stage1 Boss 场');
  await ev(`window.__game.startStage(0, { skipIntro: true })`);
  await sleep(500);
  await ev(`(() => {
    const g = window.__game, st = g.stage;
    g.dialogue.stop();
    g.state = 'play'; st.state = 'play';
    st.beginBoss();
    const p = st.player;
    p.x = st.boss.x - 380; p.y = 320; p.vx = 0; p.vy = 0; p.invuln = 999;
    st.camera.snapTo(p.x); st.camera.y = 0; st.camera.ty = 0;
  })()`);
  await sleep(4200);
  await shot('05-stage1-boss');

  console.log('[5] EX 弹幕');
  await ev(`(() => { const g = window.__game; g.unlockedExtra = true; g.inExtra = true; g._startExtraStage(); })()`);
  await sleep(700);
  const ex = await ev(`(async () => {
    const g = window.__game, st = g.stage;
    g.dialogue.stop();
    g.state = 'play'; st.state = 'play';
    st.beginBoss();
    const p = st.player;
    p.x = st.boss.x - 360; p.y = 340; p.vx = 0; p.vy = 0; p.invuln = 999; p.power = 128;
    st.camera.snapTo(p.x); st.camera.y = 0; st.camera.ty = 0;
    const samples = [];
    for (let i = 0; i < 9; i++) {
      await new Promise(r => setTimeout(r, 1000));
      samples.push(st.bullets.activeCount);
    }
    return { diff: st.difficulty, maxHp: st.boss.maxHp, samples, budget: st.boss.bulletBudget, pressure: +st.boss.pressure.toFixed(2), phase: st.boss.phaseIndex };
  })()`);
  console.log('   EX density', JSON.stringify(ex));
  await shot('06-extra-boss');

  console.log('[6] 长图巡场');
  for (const [stageIdx, tag, fracs] of [[0, 's1', [0.12, 0.3, 0.48, 0.66, 0.84]], [4, 's5', [0.2, 0.5, 0.8]]]) {
    await ev(`window.__game.startStage(${stageIdx}, { skipIntro: true })`);
    await sleep(500);
    const w = await ev(`window.__game.stage.level.w`);
    for (const f of fracs) {
      await ev(`window.__tp(${Math.round((w - 400) * f)})`);
      await sleep(450);
      await shot(`07-${tag}-${String(Math.round(f * 100)).padStart(2, '0')}`);
    }
  }

  console.log(errors.length ? 'JS 异常: ' + errors.slice(0, 3).join(' | ') : '无 JS 异常 ✓');
} catch (e) {
  console.error('PROBE ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
