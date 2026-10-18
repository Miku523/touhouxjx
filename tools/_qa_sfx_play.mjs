// 修复验证 5：真实玩法里三种音效是否真的被触发（走 sim_bot 真输入路径）
// 记录 audio.play 调用序列：coin / shotHit / enemyKill / bossHit / stomp
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9375);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-sfxplay-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
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
      errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const t0 = Date.now();
  await send('Page.navigate', { url: `${URL0}?sfxplay=${t0}` });
  for (let i = 0; i < 300; i++) {
    await sleep(100);
    if (await ev('!!window.__game')) break;
  }

  // 键盘解锁（Shift 不触发菜单操作）
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
  await sleep(200);

  const setup = await ev(`(() => {
    const g = window.__game;
    window.__sfxLog = [];
    window.__sfxRaw = [];
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (n, o) => { window.__sfxRaw.push(n); window.__sfxLog.push({ n, t: Math.round(performance.now()) }); return orig(n, o); };
    return JSON.stringify({ ctx: !!g.audio.ctx, state: g.audio.ctx?.state || null, state2: g.state });
  })()`);
  console.log('SETUP', setup);

  const install = await ev(`import('/tools/sim_bot.js?t=${Date.now()}').then(m => !!m.install({ god: true, maxRetries: 2 }))`);
  console.log('BOT_INSTALLED', install);
  // 从标题进游戏（开局对话由 bot 推进）
  await ev('window.__game.startGame()');
  await sleep(2000);
  console.log('AFTER_START', await ev('JSON.stringify({ state: window.__game.state, dialogue: window.__game.dialogue.active })'));

  // 推进 12000 逻辑帧（约 200 秒游戏时间），分块跑避免单次 eval 太久
  for (let round = 0; round < 20; round++) {
    const s = await ev(`JSON.stringify((() => {
      const b = window.__game.input.__simBot;
      b.run(600);
      return { steps: b.steps, state: window.__game.state, stage: window.__game.stageIndex, log: window.__sfxLog.length, events: window.__game.stage?.events || null };
    })())`);
    if (round % 4 === 0) console.log('ROUND', round, s.slice(0, 220));
  }
  const summary = await ev(`JSON.stringify((() => {
    const raw = window.__sfxRaw;
    const c = {};
    for (const n of raw) c[n] = (c[n] || 0) + 1;
    const first = {};
    for (const n of raw) if (!(n in first)) first[n] = window.__sfxLog.find(x => x.n === n)?.t ?? null;
    const b = window.__game.input.__simBot;
    return {
      counts: c,
      firstAt: first,
      total: raw.length,
      order: raw.slice(0, 40),
      state: window.__game.state,
      stage: window.__game.stageIndex,
      bot: { steps: b.steps, deaths: b.deaths, gameovers: b.gameovers, stages: b.stages, events: b.events?.slice?.(-8) || b.events },
      ctx: window.__game.audio.ctx?.state || null,
      music: {
        song: window.__game.audio.currentSong,
        on: window.__game.audio._musicOn,
        requested: window.__game.audio._musicRequested,
        voices: window.__game.audio._musicVoices?.size ?? null,
        events: window.__game.audio._events?.length ?? null,
        t: Math.round((window.__game.audio.ctx?.currentTime || 0) * 100) / 100,
      },
    };
  })())`);
  console.log('SFX_SUMMARY', summary);
  console.log('ERRORS', JSON.stringify(errors));
} finally {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
}
