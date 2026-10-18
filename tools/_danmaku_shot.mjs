// 四档难度弹幕截图对比（E / N / H / L，同关卡同种子）
// 用法: node tools/_danmaku_shot.mjs [stageIndex] [outDir]
// 输出 shot_e/ n / h / l 三张（同一次符卡的 3.5s 时刻）
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stage = Number(process.argv[2] ?? 2);
const outDir = process.argv[3] ?? '.';
const DIFFS = ['E', 'N', 'H', 'L'];
const W = 1280;
const H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9342;
const profile = mkdtempSync(join(tmpdir(), 'edge-dmshot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SEED = 77;
mkdirSync(outDir, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

const shots = [];
for (const diff of DIFFS) {
  let ready = false;
  await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?seed=${SEED}&shot=${Date.now()}` });
  for (let i = 0; i < 100; i++) {
    ready = await evaluate('!!window.__game');
    if (ready) break;
    await sleep(150);
  }
  if (!ready) throw new Error('game did not boot');

  const info = await evaluate(`(() => {
    const g = window.__game;
    g.showTitle();
    g.difficulty = ${JSON.stringify(diff)};
    g.startStage(${stage});
    try { g.dialogue.stop(); } catch (e) {}
    g.state = 'play';
    const s = g.stage;
    s.state = 'play';
    s.beginBoss();
    const b = s.boss;
    const p = s.player;
    p.alive = true;
    p.hearts = 999;
    p.invuln = 9999;
    // 站到 Boss 正下方，让画面里能看到真实的「可站立空间」
    p.x = Math.max(120, b.x - 360);
    p.y = (s.mode === 'stg' ? 620 : s.level.h - 190);
    if (s.camera?.snapTo) s.camera.snapTo(b.x - 420);
    else if (s.camera) s.camera.x = Math.max(0, Math.min(b.x - 700, s.level.w - 1280));
    // 钉住当前符卡：只观察这一招在四档下的弹幕形态差异
    b.maxHp = 1e9; b.hp = 1e9;
    b.spellMaxHp = 1e9; b.spellHp = 1e9;
    document.getElementById('overlay')?.classList.add('hidden');
    document.getElementById('dialogue')?.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('hidden');
    return JSON.stringify({ mode: s.mode, boss: b.key, bx: Math.round(b.x), by: Math.round(b.y), budget: b.bulletBudget, cap: b.speedCap });
  })()`);

  const stats = await evaluate(`(() => {
    const g = window.__game;
    const s = g.stage;
    let peak = 0;
    for (let i = 0; i < ${Number(process.argv[4] ?? 540)}; i++) {
      g.update(1 / 60);
      if (s.bullets.activeCount > peak) peak = s.bullets.activeCount;
    }
    const b = s.boss;
    if (s.mode === 'stg') { s.stg.scroll = b.x - 900; s.camera.x = s.stg.scroll; }
    else if (s.camera) s.camera.x = Math.max(0, Math.min(b.x - 700, s.level.w - 1280));
    g.render(0);
    return JSON.stringify({ peak, active: s.bullets.activeCount, spell: b.spellIdx, state: b.state });
  })()`);

  await sleep(120);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const path = join(outDir, `shot_${diff.toLowerCase()}.png`);
  writeFileSync(path, Buffer.from(shot.data, 'base64'));
  shots.push({ diff, path, info: JSON.parse(info), stats: JSON.parse(stats) });
  console.log(diff, info, stats);
}

writeFileSync(join(outDir, 'shots.json'), JSON.stringify(shots, null, 2));
ws.close();
proc.kill();
console.log('DONE', shots.map((s) => s.path).join(' '));
