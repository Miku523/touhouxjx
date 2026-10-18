// QA 诊断：标题首屏时序 / 对话立绘来源 / 音效触发
// 用法: node tools/_qa_probe.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9363);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-qa-'));
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
const reqs = [];
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
      errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    }
    if (m.method === 'Network.requestWillBeSent') reqs.push({ url: m.params.request.url, t: m.params.timestamp, reqId: m.params.requestId });
    if (m.method === 'Network.loadingFinished') {
      const r = reqs.find((x) => x.reqId === m.params.requestId);
      if (r) r.end = m.params.timestamp;
    }
    if (m.method === 'Network.responseReceived') {
      const r = reqs.find((x) => x.reqId === m.params.requestId);
      if (r) r.status = m.params.response.status;
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // 记录首屏时序：overlay 可见 / 标题图 load / 角色图 load
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__qa = { t0: performance.now(), events: [] };
      const push = (k, extra) => window.__qa.events.push(Object.assign({ k, t: Math.round(performance.now()) }, extra || {}));
      const origImage = window.Image;
      window.Image = function(...a) {
        const img = new origImage(...a);
        img.addEventListener('load', () => push('img-load', { src: img.currentSrc || img.src }));
        return img;
      };
      window.Image.prototype = origImage.prototype;
      document.addEventListener('DOMContentLoaded', () => push('dom-ready'));
      window.addEventListener('load', () => push('window-load'));
    `,
  });

  const t0 = Date.now();
  await send('Page.navigate', { url: `${URL0}?qa=${t0}` });

  // 首屏前 3 秒连拍
  for (let i = 0; i < 8; i++) {
    await sleep(i === 0 ? 250 : 350);
    await shot(`_qa_title_t${i}.png`);
  }

  const boot = await ev(`JSON.stringify({
    ok: !!window.__game,
    events: window.__qa?.events || [],
    perf: performance.getEntriesByType('resource').filter(e => /art\\/gen/.test(e.name)).map(e => ({ n: e.name.split('/').slice(-2).join('/'), s: Math.round(e.startTime), d: Math.round(e.duration) })),
    overlayVisibleAt: (() => { const o = document.getElementById('overlay'); return o ? !o.classList.contains('hidden') : null; })(),
    charImg: (() => { const g = window.__game; if (!g) return null; const im = g._titleCharImgs?.reimu; return im ? { complete: im.complete, nw: im.naturalWidth } : null; })(),
    bgImg: (() => { const g = window.__game; if (!g) return null; const im = g._titleBgImg; return im ? { complete: im.complete, nw: im.naturalWidth } : null; })(),
  })`);
  console.log('BOOT', boot);

  // 强制进第一关（会播开场对话），截图并检查 AI 立绘是否加载
  await ev(`(() => {
    const g = window.__game;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false; g.lives = 2;
    const def = g._mainStages()[0];
    g._createStage(def, 0, false);
    return true;
  })()`);
  await sleep(1200);
  await shot('_qa_dialogue1.png');
  const dlg1 = await ev(`JSON.stringify({
    state: window.__game.state,
    active: window.__game.dialogue.active,
    left: window.__game.dialogue.leftChar,
    right: window.__game.dialogue.rightChar,
    speaker: window.__game.dialogue.speaker,
    inDialogue: !document.getElementById('dialogue').classList.contains('hidden'),
    canvasL: (() => { const c = document.getElementById('portraitL'); if (!c) return null; const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n = 0; for (let i=3;i<d.length;i+=4) if (d[i]) n++; return n; })(),
    canvasR: (() => { const c = document.getElementById('portraitR'); if (!c) return null; const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n = 0; for (let i=3;i<d.length;i+=4) if (d[i]) n++; return n; })(),
    aiPortraits: performance.getEntriesByType('resource').filter(e => /art\\/gen\\/(reimu|marisa|rumia)\\.png/.test(e.name)).map(e => ({ n: e.name.split('/').pop(), s: Math.round(e.startTime), size: e.transferSize })),
  })`);
  console.log('DIALOGUE', dlg1);

  // 推进对白，检查第二个立绘
  await ev(`(() => { for (let i=0;i<5;i++) window.__game.dialogue.advance(); return window.__game.dialogue.index; })()`);
  await sleep(600);
  await shot('_qa_dialogue2.png');

  // 音效：monkey-patch play 记录调用；先模拟手势解锁
  const audio = await ev(`(() => {
    const g = window.__game;
    const log = [];
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (name, opts) => { log.push(name); return orig(name, opts); };
    window.__audioLog = log;
    // 模拟一次用户手势（键盘/点击都走 pointerdown 解锁）
    window.dispatchEvent(new PointerEvent('pointerdown'));
    g.audio.unlock();
    return {
      ctx: !!g.audio.ctx,
      state: g.audio.ctx?.state,
      sfxOn: g.audio.sfxEnabled,
      sfxVol: g.audio.sfxVolume,
      muted: g.audio.muted,
    };
  })()`);
  console.log('AUDIO', audio);

  // 触发事件：coin / enemy hit / shot hit 观察
  await ev(`(() => {
    const g = window.__game;
    g.stage.onEvent('coin', { value: 1 });
    return true;
  })()`);
  console.log('PLAYLOG_AFTER_COIN', await ev(`JSON.stringify(window.__audioLog)`));

  // 真实射击 / 命中敌人：直接驱动 stage 一小段
  await ev(`(() => {
    const g = window.__game; const s = g.stage;
    g.state = 'play';
    // 把玩家放到敌人附近并持续射击
    const e = s.enemies?.list?.[0] || s.enemies?.items?.[0];
    if (e) { s.player.x = e.x - 120; s.player.y = e.y - 20; }
    return !!e;
  })()`);
  await ev(`(() => {
    const g = window.__game, s = g.stage;
    s.player.x = 500; s.player.y = 300;
    for (let i=0;i<30;i++) { s._tryShoot(null); s.shots.update(1/60, {w:s.level.w,h:s.level.h}); s.enemies?.damageWithShots(s.shots, s.fx, {onKill:()=>{}}); }
    return { shots: s.shots.list?.length ?? s.shots.count ?? null, log: window.__audioLog };
  })()`);
  console.log('PLAYLOG_AFTER_SHOTS', await ev(`JSON.stringify(window.__audioLog)`));

  console.log('PAGE_ERRORS', JSON.stringify(errors));
} finally {
  try { ws?.close(); } catch {}
  try { proc.kill(); } catch {}
  await sleep(300);
  process.exit(0);
}
