// 背景明暗测量截图：#3 验收用。
// 把相机直接挪到指定关卡进度（0..1）再渲染，避开 Boss 战 / 敌人干扰，
// 得到「纯背景 + 地形 + 环境层」的画面，用来量中心区平均亮度。
//
// 用法：node tools/_pt_bgshot.mjs --stage 0 --prog 0.5 --out _pt/bg/s1_p50.png \
//         [--url http://127.0.0.1:8138/index.html] [--port 9390] [--extra]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const argv = {};
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { argv[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    if (i + 1 < raw.length && !raw[i + 1].startsWith('--')) argv[key] = raw[++i];
    else argv[key] = '1';
  }
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(argv.port || 9390);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const PROG = Number(argv.prog ?? 0.5);
const OUT = argv.out || `_pt/bg/s${STAGE + 1}_p${Math.round(PROG * 100)}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(dirname(OUT), { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'edge-bgshot-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL_BASE}?shot=${Date.now()}` });
let booted = false;
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; }
  await sleep(200);
}
if (!booted) throw new Error('boot timeout');

const info = await evaluate(`(async () => {
  const g = window.__game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 冻结逻辑推进（rAF 仍会 render，但 update 不再跑）：保证相机/时间/敌人都静止
  g.update = () => {};
  // 关掉所有开场对白：对白激活时 render 会盖 0.35 暗幕，污染亮度测量
  g._playDialogue = () => {};
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true; g.showTitle();
  g.lives = 3; g.runLives = null; g.carryPower = 4; g.continues = 0; g.levelIndex = 0;
  ${argv.extra ? `g.inExtra = true; g.carryPower = 0; g._startExtraStage();` : `g.inExtra = false; g.startStage(${STAGE});`}
  g.state = 'play';
  ${argv.post ? "g.renderer.postEnabled = true; g.renderer.lowSpec = false; g.renderer.postLevel = 2; g.renderer.skipPost = 0;" : ""}
  // 隐藏 DOM 层 HUD / 关卡横幅（截图会连 DOM 一起截，白色横幅会抬高中心区亮度）
  for (const id of ['hud', 'banner']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  const s = g.stage;
  const theme = s.level.theme;
  // 等厚涂背景图加载 + 预合成完成（首帧就会触发 _composeBgLayer）
  for (let i = 0; i < 240; i++) {
    g.render(0.5);
    const lays = s._bgLayers && s._bgLayers[theme];
    const cnt = lays ? lays.filter((x) => !!x).length : 0;
    if (cnt >= 2) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  // 关掉开场对话（对话激活时 render 会盖 0.35 暗幕，污染亮度测量）
  try { g.dialogue?.stop?.(); } catch {}
  g.state = 'play';
  // 相机直接挪到目标进度（platform / stg 同一套进度定义）
  const W = 1280;
  const lvlW = Math.max(1, (s.level.w || W) - W);
  const camX = Math.max(0, Math.min(lvlW, ${PROG} * lvlW));
  s.camera.x = camX; s.camera.prevX = camX; s.camera.tx = camX;
  if (s.mode === 'stg' && s.stg) { s.stg.scroll = camX; s.stg.reachedBoss = false; }
  // 连渲染几次让缓存/平滑稳定
  for (let i = 0; i < 4; i++) g.render(0.5);
  const lays = s._bgLayers && s._bgLayers[theme];
  return {
    stage: s.level.name, theme, mode: s.mode, state: g.state,
    levelW: s.level.w, lvlW, prog: ${PROG}, cam: Math.round(s.camera.x),
    bgLayers: lays ? lays.filter((x) => !!x).length : 0,
    bgSlots: lays ? lays.map((x) => (x ? 'ok' : '-')) : [],
    postLevel: g.renderer.postLevel, lowSpec: g.renderer.lowSpec,
    t: s.t,
  };
})()`);
await sleep(150);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ ...info, out: OUT }));
ws.close();
proc.kill();
