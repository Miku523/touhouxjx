// 部署冒烟：任意静态地址（本地或 GitHub Pages）加载游戏，检查报错 / 资源 404 / 标题与第一面可渲染。
//   node tools/_deploy_check.mjs <url> [outPrefix]
// 输出一行 JSON 汇总；截图写到 <outPrefix>_title.png / <outPrefix>_stage.png
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const OUT = process.argv[3] || '_deploy_local';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9361);
const WAIT_STEPS = Number(process.env.DEPLOY_WAIT_STEPS || 100); // ×200ms 等 __game 就绪；跨境慢链路可调大
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-deploy-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
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
const consoleErrors = [];
const httpErrors = [];
const loaded = [];

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.text || '') + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
};
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
};

try {
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
      const d = m.params.exceptionDetails;
      errors.push((d.exception?.description || d.text || '').split('\n')[0]);
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
    if (m.method === 'Network.responseReceived') {
      const r = m.params.response;
      if (r.status >= 400) httpErrors.push(`${r.status} ${r.url}`);
    }
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) {
      errors.push(`net fail: ${m.params.errorText} ${m.params.requestId}`);
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status === 200) {
      loaded.push(m.params.response.url);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const url = `${URL0}${URL0.includes('?') ? '&' : '?'}deploycheck=${Date.now()}`;
  await send('Page.navigate', { url });

  let booted = false;
  for (let i = 0; i < WAIT_STEPS; i++) {
    try { if (await ev('!!window.__game')) { booted = true; break; } } catch {}
    await sleep(200);
  }
  await sleep(1500);

  const title = booted ? JSON.parse(await ev(`JSON.stringify({
    state: window.__game.state,
    char: window.__game.char,
    difficulty: window.__game.difficulty,
    buttons: [...document.querySelectorAll('#buttons .btn, #buttons button, #buttons div')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 12),
    canvas: (() => { const c = document.getElementById('game'); return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null; })(),
    titleScreen: window.__game.state === 'title',
  })`)) : null;
  await shot(`${OUT}_title.png`);

  // 直接构造第一面：验证关卡 / 渲染管线 / 资源
  let stage = null;
  if (booted) {
    await ev(`(() => {
      const g = window.__game;
      g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false; g.lives = 2;
      g._createStage(g._mainStages()[0], 0, false);
      return true;
    })()`);
    await sleep(3500);
    stage = JSON.parse(await ev(`JSON.stringify({
      state: window.__game.state,
      hasStage: !!window.__game.stage,
      level: window.__game.stage?.level?.name || window.__game.stage?.level?.title || null,
      player: window.__game.stage?.player ? { x: Math.round(window.__game.stage.player.x), y: Math.round(window.__game.stage.player.y) } : null,
      bullets: window.__game.stage?.bullets?.length ?? null,
      fps: Math.round(window.__game.fps ?? 0),
    })`));
    await shot(`${OUT}_stage.png`);
  }

  console.log(JSON.stringify({
    ok: booted && errors.length === 0 && httpErrors.length === 0,
    url: URL0, booted, title, stage,
    errors: errors.slice(0, 8),
    consoleErrors: consoleErrors.slice(0, 8),
    httpErrors: httpErrors.slice(0, 8),
    resources: loaded.filter((u) => /\.(js|css|png|jpg|jpeg|json)(\?|$)/.test(u)).length,
  }, null, 2));
} finally {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
  await sleep(400);
  process.exit(0);
}
