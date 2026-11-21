// 自动跑图：无敌机器人连续开打，抓 console 报错、卡死、长帧。
// 用法: node tools/auto_play.mjs [url] [--stages=3] [--secs=25] [--diff=normal] [--json=out.json]
//
// 只读地驱动游戏（不改 src）：把残机每 200ms 顶回 999，摇杆随机游走 + 常按射击，
// 对话自动翻页。任何 console.error / 未捕获异常 / 单帧 >100ms / 状态在 20s 内没有任何推进
// 都算问题，退出码 1。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const URL_TARGET = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8138/';
const STAGES = Number(flag('stages', 3));
const SECS = Number(flag('secs', 25));
const DIFF = flag('diff', 'normal');
const OUT = flag('json', '');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9600 + Math.floor(Math.random() * 250);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'edge-play-'));
const proc = spawn(EDGE, [
  // 后台节流三连：不加这几条，切到第二面后 rAF 会被压到个位数 fps，
  // 关卡时钟几乎不走，看起来像「卡死」（实测 stage.t 30 秒只涨 0.07）。
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion',
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    target = (await r.json()).find((t) => t.type === 'page');
  } catch {}
  if (!target) await sleep(150);
}
if (!target) { console.error('浏览器没起来'); proc.kill(); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
const errors = [];
const longFrames = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    const text = `exception: ${d.exception?.description || d.text}`;
    // 浏览器插件自己的报错（临时 profile 也拦不住某些 Chrome/Edge 插件注入）不算游戏问题
    if (!text.includes('chrome-extension://')) errors.push(text);
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    // 504 Offline 是本地 http.server 偶发断连，与配色/逻辑无关
    if (!msg.params.entry.text.includes('504')) errors.push(`log: ${msg.params.entry.text}`);
  } else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
    const { url, status } = msg.params.response;
    // 本机策略把某个 Edge 插件强装进来了，它会把相对路径改写成 /hybridaction/... 再请求，
    // 这些必然 404/504，与游戏无关（同样用 --disable-extensions 压不住，只好按路径过滤）。
    if (!url.includes('/hybridaction/')) errors.push(`http ${status}: ${url}`);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL_TARGET });

// 等游戏对象就绪（启动幕门禁 + 首屏素材）+ 挂帧监视。每次整页重载后都要重跑。
const warmup = async () => {
  for (let i = 0; i < 120; i++) {
    if (await evaluate('!!window.__game && !!window.__game.startStage').catch(() => false)) break;
    await sleep(250);
  }
  await evaluate(`(() => {
    window.__perf = { long: 0, max: 0, frames: 0 };
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = now - last; last = now;
      if (dt > 50) { window.__perf.long++; window.__perf.max = Math.max(window.__perf.max, dt); }
      window.__perf.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`);
};
await warmup();

const states = [];
const results = [];
for (let stage = 0; stage < STAGES; stage++) {
  // 每面都整页重载：连着打完一面再 startStage(下一面) 会卡在旧流程里
  //（实测第 2 面起 clock 恒为 0，而单独 startStage 完全正常）。重载最笨也最干净。
  if (stage > 0) {
    await send('Page.navigate', { url: URL_TARGET });
    // headless 下重载后的页面可能不算「前台」，rAF 完全不跑（实测 __perf.frames 恒 0、
    // stage.t 恒 0）——bringToFront + 一次指标覆盖把它拽回可见渲染。
    await send('Page.bringToFront');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(1500);
    await warmup();
  }
  const boot = await evaluate(`(async () => {
    const g = window.__game;
    try { g.showTitle(); } catch (e) {}
    g.difficulty = ${JSON.stringify(DIFF)};
    g.char = g.char || 'reimu';
    await g.startStage(${stage}, { skipIntro: true });
    return { state: g.state, char: g.char, diff: g.difficulty };
  })()`).catch((e) => ({ error: String(e) }));

  // 进关头 3 秒不算帧：贴图解码、着色器编译、音乐起播都挤在这，headless 没有 GPU，
  // 长帧必然出现，拿它判失败只会一直红。
  await sleep(3000);
  const perfBase = await evaluate('({ long: __perf.long, max: __perf.max, frames: __perf.frames })').catch(() => ({ long: 0, max: 0, frames: 0 }));

  const t0 = Date.now();
  let lastSeen = '';
  let lastSig = '';
  let lastSnap = null;
  let firstSnap = null;
  let lastProgressAt = Date.now();
  let cleared = false;
  const seen = new Set();
  while (Date.now() - t0 < SECS * 1000) {
    const snap = await evaluate(`(() => {
      const g = window.__game;
      const st = g.stage;
      const p = st && st.player;
      if (p) { try { p.lives = 999; p.invuln = 9999; } catch (e) {} }
      if (g.state === 'dialogue' && g.dialogue && g.dialogue.active) {
        try { g.dialogue.advance(); } catch (e) {}
      }
      if (g.input) {
        const t = performance.now() / 700;
        try {
          g.input.setStick(Math.sin(t) * 0.8, Math.cos(t * 0.7) * 0.5);
          g.input.padPress('shoot');
        } catch (e) {}
      }
      return {
        state: g.state,
        score: st ? (st.score?.total ?? st.score ?? 0) : 0,
        stage: g.levelIndex,
        boss: !!(st && st.boss && st.boss.active),
        lives: p ? p.lives : -1,
        level: st && st.def ? st.def.name : '',
        clock: st ? Math.round((st.time ?? st.clock ?? st.frames ?? 0) * 100) / 100 : 0,
        t: st ? st.t : null,
        stState: st ? st.state : null,
        loopFrames: window.__game.loop ? window.__game.loop.frames : null,
      };
    })()`).catch((e) => ({ state: 'evalerror', error: String(e) }));

    const key = `${snap.state}:${snap.boss ? 1 : 0}`;
    seen.add(key);
    states.push(key);
    const sig = `${snap.state}|${snap.boss}|${snap.score}|${snap.level}|${Math.floor(snap.clock)}`;
    if (sig !== lastSig) { lastSig = sig; lastProgressAt = Date.now(); }
    lastSnap = snap;
    if (!firstSnap) firstSnap = snap;
    if (snap.state === 'clear' || snap.state === 'ending' || snap.state === 'ending-run') { cleared = true; break; }
    if (Date.now() - lastProgressAt > 20000) {
      results.push({ stage, stuck: { state: snap.state, boss: snap.boss, level: snap.level }, states: [...seen], last: snap });
      break;
    }
    await sleep(200);
  }
  if (!results.some((r) => r.stage === stage)) {
    results.push({ stage, stuck: null, cleared, states: [...seen], first: firstSnap, last: lastSnap });
  }
  const now = await evaluate('({ long: __perf.long, max: __perf.max })').catch(() => null);
  if (now) {
    const r = results[results.length - 1];
    r.perf = { longSinceStart: now.long - perfBase.long, max: now.max };
  }
  await sleep(300);
}

const perf = await evaluate('window.__perf').catch(() => null);
const janky = results.some((r) => r.perf && r.perf.longSinceStart > 6);
const summary = {
  url: URL_TARGET,
  diff: DIFF,
  stages: STAGES,
  secs: SECS,
  errors: [...new Set(errors)],
  perf,
  results,
  verdict: errors.length === 0 && results.every((r) => !r.stuck) && !janky ? 'OK' : 'PROBLEM',
};
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log('VERDICT:', summary.verdict);
ws.close();
proc.kill();
process.exit(summary.verdict === 'OK' ? 0 : 1);
