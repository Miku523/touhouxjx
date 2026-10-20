#!/usr/bin/env node
/**
 * verifier 独立复核 · #3 前景亮度测量（同一浏览器批量抓 7 面 × 3 进度点）
 *
 * 协议（与 visuals 的 tools/_pt_bgshot.mjs 保持一致，避免口径漂移）：
 *   - 冻结逻辑：g.update = () => {}
 *   - 关掉对白（render 会给对话加 0.35 暗幕）
 *   - 隐藏 DOM 层 #hud / #banner（截图连 DOM 一起截）
 *   - 等背景厚涂层预合成 >= 2 层
 *   - 相机直接挪到 prog 位置：camX = prog * (level.w - 1280)（platform/stg 同一进度定义）
 *   - render 预热 4 帧后 Page.captureScreenshot 存 PNG
 *
 * 亮度数值由 tools/_verify_luma.py 计算（中心区 30%-70% × 25%-65%，L=0.299R+0.587G+0.114B）。
 *
 * 用法：
 *   node tools/_verify_bright.mjs --label baseline --url http://127.0.0.1:8150/index.html \
 *        --outdir _pt/bright/baseline --port 9142
 *   node tools/_verify_bright.mjs --label after --url http://127.0.0.1:8141/index.html \
 *        --outdir _pt/bright/after --port 9142
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

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
const PORT = Number(argv.port || 9142);
const URL_BASE = argv.url || 'http://127.0.0.1:8150/index.html';
const LABEL = argv.label || 'baseline';
const OUTDIR = resolve(argv.outdir || `_pt/bright/${LABEL}`);
const STAGES = String(argv.stages || '1,2,3,4,5,6,7').split(',').map(Number);
const PROGS = String(argv.progs || '10,50,85').split(',').map((v) => Number(v) / 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUTDIR, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'edge-verify-bright-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

let ws = null;
let id = 0;
const pending = new Map();
async function connect() {
  const page = await getTarget();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
    }
  };
}
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

await connect();
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

const out = [];
try {
  for (const stage of STAGES) {
    const isExtra = stage === 7;
    const navigate = async () => {
      await send('Page.navigate', { url: `${URL_BASE}?bright=${Date.now()}-${stage}` });
      let booted = false;
      for (let i = 0; i < 150; i++) {
        try { if (await evaluate('!!(window.__game && window.__game.input)')) { booted = true; break; } } catch {}
        await sleep(200);
      }
      if (!booted) throw new Error(`boot timeout stage ${stage}`);
    };
    await navigate();
    const meta = await evaluate(`(async () => {
      const g = window.__game;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      g.update = () => {};              // 冻结逻辑，只留 render
      g._playDialogue = () => {};
      g.difficulty = 'N'; g.char = 'reimu'; g.musicOn = false; g.unlockedExtra = true; g.showTitle();
      g.lives = 3; g.runLives = null; g.carryPower = 4; g.continues = 0; g.levelIndex = 0;
      ${isExtra ? `g.inExtra = true; g.carryPower = 0; g._startExtraStage();` : `g.inExtra = false; g.startStage(${stage - 1});`}
      g.state = 'play';
      for (const id of ['hud', 'banner']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
      const s = g.stage;
      const theme = s.level.theme;
      for (let i = 0; i < 240; i++) {
        g.render(0.5);
        const lays = s._bgLayers && s._bgLayers[theme];
        if (lays && lays.length >= 2) break;
        await sleep(50);
      }
      try { g.dialogue?.stop?.(); } catch {}
      g.state = 'play';
      return { stage: s.level.name, theme, mode: s.mode, levelW: s.level.w, bgLayers: (s._bgLayers && s._bgLayers[theme] || []).length };
    })()`);

    for (const prog of PROGS) {
      const info = await evaluate(`(() => {
        const g = window.__game;
        const s = g.stage;
        const W = 1280;
        const lvlW = Math.max(1, (s.level.w || W) - W);
        const camX = Math.max(0, Math.min(lvlW, ${prog} * lvlW));
        s.camera.x = camX; s.camera.prevX = camX; s.camera.tx = camX;
        if (s.mode === 'stg' && s.stg) { s.stg.scroll = camX; s.stg.reachedBoss = false; }
        for (let i = 0; i < 4; i++) g.render(0.5);
        return { cam: Math.round(s.camera.x), lvlW, t: s.t };
      })()`);
      const pct = Math.round(prog * 100);
      const file = join(OUTDIR, `s${stage}_p${pct}.png`);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      const row = { stage, extra: isExtra, prog: pct, file, ...meta, ...info };
      out.push(row);
      console.log(`[bright] ${LABEL} s${stage} p${pct} cam=${info.cam}/${info.lvlW} ${meta.stage} theme=${meta.theme} mode=${meta.mode} bg=${meta.bgLayers}`);
    }
  }
  const jsonFile = join(OUTDIR, 'meta.json');
  writeFileSync(jsonFile, JSON.stringify({ label: LABEL, url: URL_BASE, box: [0.30, 0.25, 0.70, 0.65], rows: out }, null, 2));
  console.log(`[bright] wrote ${out.length} shots -> ${OUTDIR}`);
} finally {
  try { ws.close(); } catch {}
  try { proc.kill(); } catch {}
  await sleep(300);
  process.exit(0);
}
