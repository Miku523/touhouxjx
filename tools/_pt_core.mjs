/**
 * 反向试玩共享内核：独立 headless Edge + CDP，真实键盘/鼠标事件、错误与网络采集。
 *
 * 用法：
 *   import { launch, sleep } from './_pt_core.mjs';
 *   const T = await launch({ port: 9411 });
 *   await T.boot();                       // 导航到 8138 并等 __game
 *   await T.key('Enter');                 // 真实 keyDown/keyUp
 *   await T.eval('window.__game.state');
 *   await T.shot('_pt/flow/01.png');
 *   const r = await T.report();           // { errors, warns, netFails, http4xx, resources }
 *   await T.close();
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, openSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const BASE = process.env.PT_BASE || 'http://127.0.0.1:8138';

/* 常用键：code / key / keyCode —— 游戏只读 e.code，keyCode 交给浏览器合成 */
const KEYS = {
  Enter: ['Enter', 13], Escape: ['Escape', 27], Space: ['Space', 32],
  ArrowLeft: ['ArrowLeft', 37], ArrowUp: ['ArrowUp', 38], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40],
  ShiftLeft: ['Shift', 16], ShiftRight: ['Shift', 16],
  KeyA: ['a', 65], KeyB: ['b', 66], KeyC: ['c', 67], KeyD: ['d', 68], KeyE: ['e', 69], KeyF: ['f', 70],
  KeyG: ['g', 71], KeyH: ['h', 72], KeyI: ['i', 73], KeyJ: ['j', 74], KeyK: ['k', 75], KeyL: ['l', 76],
  KeyM: ['m', 77], KeyN: ['n', 78], KeyO: ['o', 79], KeyP: ['p', 80], KeyQ: ['q', 81], KeyR: ['r', 82],
  KeyS: ['s', 83], KeyT: ['t', 84], KeyU: ['u', 85], KeyV: ['v', 86], KeyW: ['w', 87], KeyX: ['x', 88],
  KeyY: ['y', 89], KeyZ: ['z', 90],
  Digit0: ['0', 48], Digit1: ['1', 49], Digit2: ['2', 50], Digit3: ['3', 51], Digit4: ['4', 52],
  Digit5: ['5', 53], Digit6: ['6', 54], Digit7: ['7', 55], Digit8: ['8', 56], Digit9: ['9', 57],
  Backspace: ['Backspace', 8], Delete: ['Delete', 46], Tab: ['Tab', 9],
  F5: ['F5', 116], F12: ['F12', 123],
};

export async function launch(opts = {}) {
  const port = opts.port ?? 9410;
  const W = opts.width ?? 1280, H = opts.height ?? 720;
  const profile = mkdtempSync(join(tmpdir(), 'edge-pt-'));
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    '--mute-audio', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--window-size=' + W + ',' + H,
  ];
  if (opts.forceDeviceScale) args.push('--force-device-scale-factor=' + opts.forceDeviceScale);
  args.push(`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank');
  const logPath = join(profile, 'browser.log');
  const errFd = openSync(logPath, 'a');
  const proc = spawn(EDGE, args, { stdio: ['ignore', 'ignore', errFd] });
  proc.on('exit', (code, sig) => {
    try { appendFileSync(logPath, `\n[edge-exit] code=${code} sig=${sig} at ${new Date().toISOString()}\n`); } catch {}
  });
  const logTail = (n = 40) => {
    try { return readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-n).join('\n'); } catch { return ''; }
  };

  async function target() {
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const p = list.find((t) => t.type === 'page');
        if (p) return p;
      } catch {}
      await sleep(200);
    }
    throw new Error('no devtools target on ' + port);
  }

  const page = await target();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  /** 浏览器崩了 / 被关掉时，别让调用方永远等下去：把所有 pending 直接拒绝 */
  let socketClosed = false;
  const failAll = (why) => {
    socketClosed = true;
    for (const [, p] of pending) p.rej(new Error('浏览器连接已断开: ' + why));
    pending.clear();
  };
  ws.onclose = (ev) => failAll('close code=' + ev.code);
  ws.onerror = () => failAll('socket error');
  proc.on('exit', (code, sig) => { if (!socketClosed) failAll('process exit ' + code + '/' + sig); });

  let id = 0;
  const pending = new Map();
  const errors = [], warns = [], netFails = [], httpBad = [], logs = [];
  const requests = [];
  const responses = new Map();
  const consoleAll = [];

  ws.onmessage = (m) => {
    let d;
    try { d = JSON.parse(m.data); } catch { return; }
    if (d.id && pending.has(d.id)) {
      const { res, rej } = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) rej(new Error('CDP ' + d.method + ': ' + JSON.stringify(d.error)));
      else res(d.result);
      return;
    }
    switch (d.method) {
      case 'Runtime.exceptionThrown': {
        const x = d.params.exceptionDetails;
        errors.push('EXCEPTION: ' + String((x.exception && x.exception.description) || x.text || '').split('\n').slice(0, 3).join(' | '));
        break;
      }
      case 'Runtime.consoleAPICalled': {
        const txt = (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        consoleAll.push({ type: d.params.type, text: txt.slice(0, 500) });
        if (d.params.type === 'error') errors.push('CONSOLE: ' + txt.slice(0, 300));
        else if (d.params.type === 'warning') warns.push(txt.slice(0, 200));
        break;
      }
      case 'Log.entryAdded': {
        const e = d.params.entry;
        logs.push({ level: e.level, text: e.text, url: e.url });
        if (e.level === 'error') errors.push('LOG: ' + (e.text || '').slice(0, 300) + (e.url ? ' @' + e.url : ''));
        else if (e.level === 'warning') warns.push((e.text || '').slice(0, 200));
        break;
      }
      case 'Network.requestWillBeSent': {
        requests.push({ id: d.params.requestId, url: d.params.request.url, type: d.params.type, t: Date.now() });
        break;
      }
      case 'Network.responseReceived': {
        const r = d.params.response;
        responses.set(d.params.requestId, { url: r.url, status: r.status, type: d.params.type, mime: r.mimeType, headers: r.headers });
        if (r.status >= 400) httpBad.push({ status: r.status, url: r.url });
        break;
      }
      case 'Network.loadingFailed': {
        netFails.push({ url: requests.find((q) => q.id === d.params.requestId)?.url || '?', err: d.params.errorText, canceled: !!d.params.canceled });
        break;
      }
    }
  };

  const send = (method, params = {}, opt = {}) => new Promise((res, rej) => {
    const mid = ++id;
    const timeoutMs = opt.timeoutMs ?? 20000;
    const timer = setTimeout(() => {
      if (!pending.has(mid)) return;
      pending.delete(mid);
      rej(new Error(`CDP 超时(${timeoutMs}ms): ${method} —— 渲染进程可能卡死`));
    }, timeoutMs);
    pending.set(mid, {
      res: (v) => { clearTimeout(timer); res(v); },
      rej: (e) => { clearTimeout(timer); rej(e); },
    });
    try {
      ws.send(JSON.stringify({ id: mid, method, params }));
    } catch (e) {
      clearTimeout(timer); pending.delete(mid); rej(e);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: opts.deviceScaleFactor ?? 1, mobile: !!opts.mobile });

  const T = {
    port, proc, page, send, profile, logPath, logTail,
    errors, warns, netFails, httpBad, logs, requests, responses, consoleAll,
    async eval(expr, { awaitPromise = true } = {}) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('eval failed: ' + ((d.exception && d.exception.description) || d.text) + '\n>>> ' + String(expr).slice(0, 300));
      }
      return r.result?.value;
    },
    async nav(url = BASE + '/index.html') {
      await send('Page.navigate', { url });
      await sleep(50);
    },
    async waitFor(expr, timeout = 15000, step = 100) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try { if (await T.eval(expr, { awaitPromise: false })) return true; } catch {}
        await sleep(step);
      }
      return false;
    },
    async boot({ query = '', timeout = 30000, waitTitle = true } = {}) {
      await T.nav(BASE + '/index.html' + query);
      const ok = await T.waitFor('!!window.__game', timeout);
      if (!ok) throw new Error('game 未启动');
      if (waitTitle) await T.waitFor('window.__game.state === "menu" && !document.getElementById("overlay").classList.contains("hidden")', 12000);
      await sleep(300);
      return ok;
    },
    _keyInfo(code) { return KEYS[code] || [code, 0]; },
    async keyDown(code) {
      const [k, vk] = T._keyInfo(code);
      const text = vk >= 32 && vk < 127 && code.startsWith('Key') || /^Digit/.test(code) || code === 'Space' ? (code === 'Space' ? ' ' : k) : undefined;
      await send('Input.dispatchKeyEvent', { type: text !== undefined ? 'keyDown' : 'rawKeyDown', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code, key: k, text, unmodifiedText: text });
    },
    async keyUp(code) {
      const [k, vk] = T._keyInfo(code);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code, key: k });
    },
    async key(code, holdMs = 30) {
      await T.keyDown(code);
      await sleep(holdMs);
      await T.keyUp(code);
      await sleep(40);
    },
    async tap(code) { return T.key(code, 20); },
    async holdKeys(codes, ms) {
      for (const c of codes) await T.keyDown(c);
      await sleep(ms);
      for (const c of [...codes].reverse()) await T.keyUp(c);
      await sleep(40);
    },
    async mouse(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(60);
    },
    async shot(file) {
      mkdirSync(dirname(file), { recursive: true });
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async reload() {
      await send('Page.reload', { ignoreCache: true });
      await sleep(100);
    },
    async clearCollection() {
      errors.length = 0; warns.length = 0; netFails.length = 0; httpBad.length = 0;
      logs.length = 0; requests.length = 0; responses.clear(); consoleAll.length = 0;
    },
    async report(extra = {}) {
      const res = await T.eval(`(() => performance.getEntriesByType('resource').map(e => ({ n: e.name.split('/').slice(-3).join('/'), s: e.transferSize, d: Math.round(e.duration), i: e.initiatorType })))()`).catch(() => []);
      return {
        errors: [...errors], warns: [...warns],
        netFails: netFails.filter((f) => !f.canceled),
        httpBad: [...httpBad],
        resources: res,
        ...extra,
      };
    },
    async close() {
      try { ws.close(); } catch {}
      try { proc.kill(); } catch {}
      await sleep(150);
    },
    sleep,
  };
  return T;
}

/** 读取游戏内遥测快照（只读，不改游戏状态） */
export async function snapshot(T) {
  return T.eval(`(() => {
    const g = window.__game; const st = g.stage;
    const out = { state: g.state, level: g.levelIndex, inExtra: !!g.inExtra, char: g.char, diff: g.difficulty,
      lives: g.runLives, carryPower: g.carryPower, continues: g.continues, fps: +(g.loop?.fps||0).toFixed(1),
      steps: +(g.loop?.stepsPerSec||0).toFixed(1), stepMs: +(g.loop?.lastStepMs||0).toFixed(2), dialogue: !!g.dialogue?.active };
    if (st) {
      const p = st.player;
      out.mode = st.mode; out.stState = st.state; out.time = +st.time.toFixed(1);
      out.px = p ? Math.round(p.x) : null; out.py = p ? Math.round(p.y) : null;
      out.alive = p ? !!p.alive : null; out.invuln = p ? +((p.invuln||0).toFixed ? p.invuln.toFixed(2) : p.invuln) : null;
      out.bullets = st.bullets ? (st.bullets.activeCount ?? st.bullets.pool?.filter((b) => b.active).length ?? 0) : null;
      out.enemies = st.enemies ? (st.enemies.list?.length ?? null) : null;
      out.boss = st.boss ? { state: st.boss.state, hp: Math.round(st.boss.hp), phase: st.boss.phase, stagger: st.boss.staggerCount } : null;
      out.progress = st.progress !== undefined ? +(+st.progress).toFixed(3) : null;
      out.cameraX = st.camera ? Math.round(st.camera.x) : null;
      out.frameCap = g.loop?.frameCap ?? g.frameCap;
      out.nan = [p?.x, p?.y, p?.vx, p?.vy, out.time].some((v) => typeof v === 'number' && !Number.isFinite(v));
    }
    return out;
  })()`);
}

/** 在页面里装一个帧时长闩锁：记录 rAF 间隔、长任务、最差帧 */
export async function installFrameProbe(T) {
  await T.eval(`(() => {
    if (window.__fp) return 'ok';
    const F = { gaps: [], worst: 0, long: [], t0: performance.now(), marks: [] };
    let last = performance.now();
    const tick = (now) => {
      const d = now - last; last = now;
      F.gaps.push(d); if (d > F.worst) F.worst = d;
      if (F.gaps.length > 6000) F.gaps.splice(0, 2000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      F.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) F.long.push(Math.round(e.duration)); });
      F.obs.observe({ entryTypes: ['longtask'] });
    } catch (e) {}
    window.__fp = F;
    return 'ok';
  })()`);
}

export async function readFrameProbe(T) {
  return T.eval(`(() => {
    const F = window.__fp; if (!F) return null;
    const gaps = F.gaps.slice(-3600);
    const s = gaps.slice().sort((a,b)=>a-b);
    const q = (p) => s.length ? +s[Math.min(s.length-1, Math.floor(s.length*p))].toFixed(2) : 0;
    return { frames: gaps.length, avg: +(gaps.reduce((a,b)=>a+b,0)/(gaps.length||1)).toFixed(2), p50: q(.5), p95: q(.95), p99: q(.99),
      worst: +F.worst.toFixed(2), longtasks: F.long.slice(-40), longTotal: F.long.length,
      over33: gaps.filter(d=>d>33.4).length, over50: gaps.filter(d=>d>50).length };
  })()`);
}

/** 把日志写成 json 文件 */
export function saveJson(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
}

/** 极简断言收集器 */
export function makeChecks() {
  const rows = [];
  const chk = (ok, name, detail = '') => { rows.push({ ok: !!ok, name, detail: String(detail).slice(0, 500) }); return !!ok; };
  const eq = (a, b, name, detail = '') => chk(a === b, name, detail || (a === b ? '' : `${JSON.stringify(a)} !== ${JSON.stringify(b)}`));
  const sum = () => ({ pass: rows.filter((r) => r.ok).length, fail: rows.filter((r) => !r.ok).length, rows });
  return { chk, eq, rows, sum };
}
