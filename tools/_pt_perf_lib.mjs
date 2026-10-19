/**
 * 帧率分区专用工具库（perf 自建，不修改 _pt_core.mjs / src/**）
 *
 * _pt_core.launch 固定 `--disable-gpu`，做环境对照需要可配置启动参数，
 * 所以这里复制一份最小 CDP 客户端并扩展：
 *   - headless / headful、GPU 开/关、窗口尺寸、DPR(force-device-scale-factor)、窗口位置
 *   - SystemInfo.getInfo 读 GPU 设备信息（判定 ANGLE/D3D11 vs SwiftShader）
 *   - Performance.getMetrics 读 TaskDuration / ScriptDuration 等 CDP 指标
 *   - 帧闩锁（rAF 间隔 + longtask + 后台/前台标记），可 reset
 *   - 真键盘（与 _pt_core 相同的 key code 表）
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const BASE = process.env.PT_BASE || 'http://127.0.0.1:8138';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 常用键：code -> [key, keyCode]；游戏只读 e.code */
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
  Backspace: ['Backspace', 8], Delete: ['Delete', 46], Tab: ['Tab', 9], F5: ['F5', 116],
};

/* 全局记录已启动的浏览器，进程退出时兜底清理 */
const LIVE = new Set();
process.on('exit', () => { for (const p of LIVE) { try { p.kill(); } catch {} } });

/**
 * 启动一档环境。
 * cfg: { port, width, height, dsf, headless, gpu, windowPos, extraArgs, label }
 *  - gpu:false -> 追加 --disable-gpu（软件光栅，= 基线）
 *  - dsf:2     -> --force-device-scale-factor=2 + Emulation deviceScaleFactor=2
 *  - headless:false -> 有头窗口（真实 GPU 合成路径）
 */
export async function launchCfg(cfg = {}) {
  const port = cfg.port ?? 9413;
  const W = cfg.width ?? 1280, H = cfg.height ?? 720;
  const dsf = cfg.dsf ?? 1;
  const headless = cfg.headless !== false;
  const gpu = cfg.gpu !== false;
  const profile = mkdtempSync(join(tmpdir(), 'edge-ptperf-'));
  const args = [];
  if (headless) args.push('--headless=new');
  if (!gpu) args.push('--disable-gpu');
  args.push(
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    `--window-size=${W},${H}`,
  );
  if (dsf !== 1) args.push(`--force-device-scale-factor=${dsf}`);
  if (cfg.windowPos) args.push(`--window-position=${cfg.windowPos}`);
  if (cfg.extraArgs) args.push(...cfg.extraArgs);
  args.push(`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank');
  const proc = spawn(EDGE, args, { stdio: 'ignore' });
  LIVE.add(proc);
  proc.on('exit', () => LIVE.delete(proc));

  let page = null;
  for (let i = 0; i < 120 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = list.find((t) => t.type === 'page') || null;
    } catch {}
    if (!page) await sleep(200);
  }
  if (!page) { try { proc.kill(); } catch {} throw new Error('no devtools target on ' + port); }

  let ws;
  try {
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('ws open timeout ' + port)), 15000);
      ws.onopen = () => { clearTimeout(to); res(); };
      ws.onerror = () => { clearTimeout(to); rej(new Error('ws error ' + port)); };
    });
  } catch (e) {
    try { proc.kill(); } catch {}
    LIVE.delete(proc);
    if (!cfg._retried) { await sleep(800); return launchCfg({ ...cfg, _retried: true }); }
    throw e;
  }
  let id = 0;
  const pending = new Map();
  const errors = [], warns = [], logs = [];
  const failAll = (why) => { for (const [mid, p] of pending) { clearTimeout(p.timer); p.rej(new Error('CDP aborted: ' + why)); } pending.clear(); };
  ws.onclose = () => failAll('ws closed');
  ws.onmessage = (m) => {
    let d; try { d = JSON.parse(m.data); } catch { return; }
    if (d.id && pending.has(d.id)) {
      const { res, rej, timer } = pending.get(d.id); pending.delete(d.id);
      clearTimeout(timer);
      if (d.error) rej(new Error('CDP ' + JSON.stringify(d.error))); else res(d.result);
      return;
    }
    if (d.method === 'Runtime.exceptionThrown') {
      const x = d.params.exceptionDetails;
      errors.push(String((x.exception && x.exception.description) || x.text || '').split('\n').slice(0, 2).join(' | '));
    } else if (d.method === 'Runtime.consoleAPICalled') {
      const txt = (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      if (d.params.type === 'error') errors.push('CONSOLE: ' + txt.slice(0, 200));
      else if (d.params.type === 'warning') warns.push(txt.slice(0, 200));
    } else if (d.method === 'Log.entryAdded') {
      logs.push({ level: d.params.entry.level, text: (d.params.entry.text || '').slice(0, 200) });
    }
  };
  const send = (method, params = {}, timeoutMs = 30000) => new Promise((res, rej) => {
    const mid = ++id;
    const timer = setTimeout(() => { if (pending.delete(mid)) rej(new Error('CDP timeout ' + method)); }, timeoutMs);
    pending.set(mid, { res, rej, timer });
    try { ws.send(JSON.stringify({ id: mid, method, params })); } catch (e) { clearTimeout(timer); pending.delete(mid); rej(e); }
  });

  const T = {
    port, proc, page, profile, send, errors, warns, logs,
    cfg: { ...cfg, width: W, height: H, dsf, headless, gpu },
    async eval(expr, { awaitPromise = true, timeout = 30000 } = {}) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true, userGesture: true }, timeout);
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('eval failed: ' + ((d.exception && d.exception.description) || d.text) + '\n>>> ' + String(expr).slice(0, 200));
      }
      return r.result?.value;
    },
    async waitFor(expr, timeout = 15000, step = 100) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try { if (await T.eval(expr, { awaitPromise: false })) return true; } catch {}
        await sleep(step);
      }
      return false;
    },
    async nav(url = BASE + '/index.html') { await send('Page.navigate', { url }); await sleep(60); },
    async boot({ query = '', timeout = 40000, waitTitle = true } = {}) {
      await T.nav(BASE + '/index.html' + query);
      const ok = await T.waitFor('!!window.__game', timeout);
      if (!ok) throw new Error('game 未启动');
      if (waitTitle) await T.waitFor('window.__game.state === "menu" && !document.getElementById("overlay").classList.contains("hidden")', 15000);
      await sleep(400);
      return ok;
    },
    _keyInfo(code) { return KEYS[code] || [code, 0]; },
    async keyDown(code) {
      const [k, vk] = T._keyInfo(code);
      const text = ((vk >= 32 && vk < 127 && code.startsWith('Key')) || /^Digit/.test(code) || code === 'Space')
        ? (code === 'Space' ? ' ' : k) : undefined;
      await send('Input.dispatchKeyEvent', { type: text !== undefined ? 'keyDown' : 'rawKeyDown', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code, key: k, text, unmodifiedText: text });
    },
    async keyUp(code) {
      const [k, vk] = T._keyInfo(code);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, code, key: k });
    },
    async key(code, holdMs = 30) { await T.keyDown(code); await sleep(holdMs); await T.keyUp(code); await sleep(50); },
    async holdKeys(codes, ms) {
      for (const c of codes) await T.keyDown(c);
      await sleep(ms);
      for (const c of [...codes].reverse()) await T.keyUp(c);
      await sleep(50);
    },
    async shot(file) {
      mkdirSync(dirname(file), { recursive: true });
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      return file;
    },
    async setViewport(w, h, scale = 1) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    },
    async metrics() {
      try {
        const r = await send('Performance.getMetrics');
        const o = {}; for (const m of (r.metrics || [])) o[m.name] = m.value;
        return o;
      } catch { return null; }
    },
    async close() {
      try { ws.close(); } catch {}
      try { proc.kill(); } catch {}
      LIVE.delete(proc);
      await sleep(200);
    },
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  try { await send('Performance.enable'); } catch {}
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dsf, mobile: false });
  return T;
}

/** 浏览器级 SystemInfo（GPU 设备 / ANGLE 后端），用独立 ws 连接 /json/version */
export async function systemInfo(port) {
  try {
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result); }
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const r = await send('SystemInfo.getInfo');
    ws.close();
    return {
      gpu: r.gpu?.devices,
      auxAttributes: r.gpu?.auxAttributes,
      featureStatus: r.gpu?.featureStatus,
      modelName: r.modelName,
      browserVersion: ver.Browser,
      commandLine: (r.commandLine || '').slice(0, 400),
    };
  } catch (e) { return { error: String(e) }; }
}

/** 页面内 WebGL renderer 字符串（UNMASKED_RENDERER_WEBGL），判断硬件还是 SwiftShader */
export async function webglInfo(T) {
  return T.eval(`(() => {
    const out = { webgl: false, renderer: null, vendor: null, dpr: devicePixelRatio, innerW: innerWidth, innerH: innerHeight };
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return out;
      out.webgl = true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) { out.renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); out.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL); }
      out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } catch (e) { out.error = String(e); }
    return out;
  })()`.replace('(() => {', '(() => {'));
}

/* ============================== 帧闩锁 ============================== */
/** 安装/重置页面内 rAF 探针；reset=true 时清空历史并立即开始新窗口 */
export async function installProbe(T, reset = true) {
  await T.eval(`(() => {
    const old = window.__pfp;
    if (old && old.obs) { try { old.obs.disconnect(); } catch {} }
    const F = { gaps: [], long: [], worst: 0, t0: performance.now(), hidden: 0, resets: (old ? old.resets || 0 : 0) + 1, marks: [] };
    let last = performance.now();
    const tick = (now) => {
      const d = now - last; last = now;
      if (d > 0) { F.gaps.push(d); if (d > F.worst) F.worst = d; }
      if (F.gaps.length > 20000) F.gaps.splice(0, 8000);
      if (document.visibilityState === 'hidden') F.hidden++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      F.obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) F.long.push(Math.round(e.duration)); });
      F.obs.observe({ entryTypes: ['longtask'] });
    } catch (e) {}
    window.__pfp = F;
    return 'ok';
  })()`);
}

/** 读取探针（与 _pt_core.readFrameProbe 同口径，多返回 hidden/longCount/区间） */
export async function readProbe(T) {
  return T.eval(`(() => {
    const F = window.__pfp; if (!F) return null;
    const gaps = F.gaps.slice(-9000);
    const sorted = gaps.slice().sort((a, b) => a - b);
    const q = (p) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(2) : 0;
    const sum = gaps.reduce((a, b) => a + b, 0);
    return {
      frames: gaps.length, avg: +(sum / (gaps.length || 1)).toFixed(2),
      p50: q(.5), p95: q(.95), p99: q(.99), worst: +F.worst.toFixed(2),
      longtasks: F.long.length, longMax: F.long.length ? Math.max(...F.long) : 0,
      longSample: F.long.slice(-12),
      over33: gaps.filter((d) => d > 33.4).length, over50: gaps.filter((d) => d > 50).length,
      hiddenFrames: F.hidden, elapsedMs: Math.round(performance.now() - F.t0),
    };
  })()`);
}

/** g.render() 手动串行计时：返回单帧绘制 ms 分布（软件光栅下能直接暴露同步开销） */
export function manualRenderScript(n = 20) {
  return `(() => {
    const g = window.__game;
    if (!g || !g.renderer) return { error: 'no game' };
    const times = [];
    const t0 = performance.now();
    // 预热 2 帧
    g.render(0.5); g.render(0.5);
    for (let i = 0; i < ${n}; i++) {
      const a = performance.now();
      g.render(0.5);
      times.push(performance.now() - a);
    }
    const total = performance.now() - t0;
    const s = times.slice().sort((a, b) => a - b);
    const q = (p) => +(s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0).toFixed(2);
    const r = g.renderer;
    return {
      n: times.length, avg: +(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2),
      p50: q(.5), p95: q(.95), worst: +(Math.max(...times)).toFixed(2),
      all: times.map((t) => +t.toFixed(1)),
      renderer: { postEnabled: r.postEnabled, postLevel: r.postLevel, bloomInterval: r.bloomInterval,
        bloomEmaMs: +(r.bloomEmaMs || 0).toFixed(2), backing: r.backing, dpr: r.dpr, scale: r.scale,
        canvasW: r.canvas.width, canvasH: r.canvas.height },
      loop: { frameCap: g.loop.frameCap, fps: +(g.loop.fps || 0).toFixed(1), lastStepMs: +(g.loop.lastStepMs || 0).toFixed(2) },
    };
  })()`;
}

/** 保存 json */
export function saveJson(file, obj) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
}

export function median(arr) {
  const a = arr.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : +((a[m - 1] + a[m]) / 2).toFixed(2);
}

/** 进入 stage1 实战（与 _pt_boot 完全相同的真实键盘路径），返回进入后的快照 */
export async function bootStage1(T, { chars = 40, shot = null } = {}) {
  await T.key('Enter');
  await T.waitFor('document.getElementById("title")?.textContent === "选择难度"', 5000);
  await T.key('KeyE');
  await T.waitFor('document.getElementById("title")?.textContent === "选择主角"', 5000);
  await T.key('Digit1');
  await T.waitFor('!!window.__game.stage || window.__game.dialogue.active || window.__game.state === "play"', 8000);
  let skipped = 0;
  for (let i = 0; i < chars; i++) {
    const active = await T.eval('!!window.__game.dialogue.active');
    if (!active) break;
    await T.key('Enter', 20);
    skipped++;
    await sleep(120);
  }
  await T.waitFor('window.__game.state === "play" && !!window.__game.stage', 8000);
  await sleep(600);
  if (shot) await T.shot(shot);
  return { skipped, snap: await snap(T) };
}

/** 轻量状态快照（只读） */
export async function snap(T) {
  return T.eval(`(() => {
    const g = window.__game, st = g.stage;
    const out = {
      state: g.state, level: g.levelIndex, mode: st?.mode, diff: g.difficulty, char: g.char,
      bullets: st?.bullets ? (st.bullets.activeCount ?? st.bullets.pool?.filter((b) => b.active).length ?? 0) : null,
      enemies: st?.enemies?.list?.length ?? null,
      boss: st?.boss ? { state: st.boss.state, hp: Math.round(st.boss.hp), spell: st.boss.spellIdx } : null,
      fps: +(g.loop?.fps || 0).toFixed(1), frameCap: g.loop?.frameCap,
      stepMs: +(g.loop?.lastStepMs || 0).toFixed(2), t: +(st?.t || 0).toFixed(1),
      renderer: g.renderer ? { postLevel: g.renderer.postLevel, postEnabled: g.renderer.postEnabled, interval: g.renderer.bloomInterval, backing: g.renderer.backing, canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height } : null,
    };
    return out;
  })()`);
}
