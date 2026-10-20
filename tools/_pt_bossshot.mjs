// Boss 战 / 特效回归截图（#3 视觉回归用）。
// 直接把关卡推进到 Boss 场地，beginBoss() 后同步步进 N 帧，再冻结画面截图。
// 会屏蔽 Boss 登场对白（否则整屏盖 0.35 暗幕），并隐藏 DOM HUD。
//
// 用法：node tools/_pt_bossshot.mjs --stage 3 --frames 240 --out _pt/boss/cur_s4.png \
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
const PORT = Number(argv.port || 9391);
const URL_BASE = argv.url || 'http://127.0.0.1:8138/index.html';
const STAGE = Number(argv.stage ?? 0);
const FRAMES = Number(argv.frames || 240);
const OUT = argv.out || `_pt/boss/s${STAGE + 1}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(dirname(OUT), { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'edge-bossshot-'));
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
  // 确定性随机数：跨构建 A/B 时 Boss 弹幕/粒子完全一致
  let __s = ${Number(argv.seed ?? 1234567)} >>> 0;
  Math.random = () => { __s = (__s * 1664525 + 1013904223) >>> 0; return __s / 4294967296; };
  // 冻结逻辑推进，等背景加载时不让 rAF 主循环消耗随机数/推进关卡
  const __upd = g.update.bind(g);
  g.update = () => {};
  // Boss 登场对白会盖 0.35 暗幕：整场禁用对白
  g._playDialogue = () => {};
  g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true; g.showTitle();
  g.lives = 9; g.runLives = 9; g.carryPower = 4; g.continues = 0; g.levelIndex = 0;
  ${argv.extra ? `g.inExtra = true; g.carryPower = 0; g._startExtraStage();` : `g.inExtra = false; g.startStage(${STAGE});`}
  g.state = 'play';
  for (const hid of ['hud', 'banner']) {
    const el = document.getElementById(hid);
    if (el) el.style.display = 'none';
  }
  const s = g.stage;
  const theme = s.level.theme;
  // 等背景图加载
  for (let i = 0; i < 240; i++) {
    g.render(0.5);
    const lays = s._bgLayers && s._bgLayers[theme];
    const cnt = lays ? lays.filter((x) => !!x).length : 0;
    if (cnt >= 2) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  try { g.dialogue?.stop?.(); } catch {}
  g.state = 'play';
  // 把玩家/Boss 场地挪到关卡末尾
  const W = 1280;
  if (s.mode === 'stg' && s.stg) {
    s.stg.scroll = Math.max(0, (s.level.w || W) - 1280);
    s.stg.reachedBoss = true;
    s.camera.x = s.stg.scroll; s.camera.prevX = s.stg.scroll; s.camera.tx = s.stg.scroll;
  } else {
    s.camera.x = Math.max(0, (s.level.w || W) - 1280);
    s.camera.prevX = s.camera.x; s.camera.tx = s.camera.x;
    const p = s.player;
    if (p) { p.x = Math.max(0, s.camera.x + 960 - p.w / 2); p.y = Math.max(0, (s.level.h || 720) - 420); p.vx = 0; p.vy = 0; }
  }
  s.beginBoss();
  // 同步步进：让 Boss 发弹/入场演出跑起来
  for (let i = 0; i < ${FRAMES}; i++) {
    try { __upd(1 / 60); } catch (e) { break; }
  }
  // 冻结
  g.update = () => {};
  for (let i = 0; i < 3; i++) g.render(0.5);
  const boss = s.boss;
  return {
    stage: s.level.name, theme, mode: s.mode, state: g.state,
    bossKey: boss && boss.key, bossHp: boss && boss.hp, bossMax: boss && boss.maxHp,
    bullets: s.bullets ? s.bullets.length : 0, shots: s.shots ? s.shots.length : 0,
    fx: s.fx ? s.fx.length : 0, cam: Math.round(s.camera.x),
    postLevel: g.renderer.postLevel, lowSpec: g.renderer.lowSpec,
  };
})()`);
await sleep(150);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ ...info, out: OUT }));
ws.close();
proc.kill();
