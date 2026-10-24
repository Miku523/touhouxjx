// 标题开屏动画自检（headless Edge + CDP）
// 用法：
//   1) node tools/_static_server.mjs 8137   （另开一个进程）
//   2) node tools/_title_intro_verify.mjs
// 产出：_pt/intro/*.png 截图与输出里的时间线 / 类名 / 位移 / 跳过 / 重播检查
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = '_pt/intro';
mkdirSync(OUT, { recursive: true });

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const W = Number(process.env.VW) || 1280;
const H = Number(process.env.VH) || 720;
const profile = mkdtempSync(join(tmpdir(), 'edge-intro-'));

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
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
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    logs.push(`[console.${msg.params.type}] ${text}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${msg.params.exceptionDetails?.text || ''} ${msg.params.exceptionDetails?.exception?.description || ''}`);
  }
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
  if (r.exceptionDetails) throw new Error('eval error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};

async function shot(name) {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
}

const stateExpr = `(() => {
  const ov = document.getElementById('overlay');
  const title = document.getElementById('title');
  const btn0 = document.querySelector('.title-mode .btn');
  const btn3 = document.querySelectorAll('.title-mode .btn')[3];
  const cs = (el) => { if (!el) return null; const s = getComputedStyle(el); return { translate: s.translate, opacity: s.opacity, anim: s.animationName, delay: s.animationDelay }; };
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) }; };
  return JSON.stringify({
    t: window.__introT ? Math.round(performance.now() - window.__introT) : null,
    lead: ov?.style.getPropertyValue('--lead') || '',
    cls: ov?.className || '',
    boot: window.__game?._bootDone,
    prog: window.__game?._titleIntroProgress?.(),
    page: window.__game?._page,
    sheets: [...document.styleSheets].map((s) => s.href || 'inline').slice(-4),
    title: { rect: r(title), style: cs(title) },
    logo: { rect: r(document.querySelector('.logo-block')), style: cs(document.querySelector('.logo-block')) },
    btn0: { rect: r(btn0), style: cs(btn0) },
    btn3: { rect: r(btn3), style: cs(btn3) },
  });
})()`;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?introv=${Date.now()}` });

let ready = false;
for (let i = 0; i < 120; i++) {
  ready = await evaluate('!!(window.__game && window.__game._bootDone)');
  if (ready) break;
  await sleep(150);
}
if (!ready) {
  const info = await evaluate('JSON.stringify({u:location.href,r:document.readyState,e:(window.__loadErr||"")})');
  console.log('BOOT_FAIL', info);
  ws.close(); proc.kill();
  process.exit(1);
}
console.log('BOOT_OK 初始加载完成');
// 启动幕刚揭晓：趁人物还在滑入连拍几张，确认开屏动画真的在幕布拉开时播
console.log('BOOT_INSTANT', await evaluate(stateExpr));
await shot('00_boot_0');
await sleep(260);
await shot('00_boot_1');
await sleep(260);
await shot('00_boot_2');
await sleep(2200); // 等首屏开屏动画走完

console.log('首屏状态:', await evaluate(stateExpr));
await shot('00_after_boot');

// ---- 重播：直接调用 _playTitleIntro，按时间抓帧 ----
await evaluate('(() => { window.__game._playTitleIntro(); window.__introT = window.__game._titleIntroT0; })()');
const plan = [80, 480, 900, 1400, 1800, 2200, 2700, 3300];
let elapsed = 0;
for (let i = 0; i < plan.length; i++) {
  const wait = plan[i] - elapsed;
  elapsed = plan[i];
  if (wait > 0) await sleep(wait);
  const st = await evaluate(stateExpr);
  console.log(`FRAME ${String(i).padStart(2, '0')} t≈${plan[i]}ms`, st);
  await shot(`01_replay_f${i}_${plan[i]}ms`);
}

// ---- 动画自然结束后：.intro 应被摘掉，切语言重绘不应再重播 ----
await sleep(600);
const settledCls = await evaluate(`document.getElementById('overlay').className`);
console.log('AFTER_INTRO_CLASS', settledCls);
const langSwitch = await evaluate(`(() => {
  window.__game.showTitle();
  const st = getComputedStyle(document.querySelector('.title-mode .btn'));
  return JSON.stringify({ cls: document.getElementById('overlay').className, anim: st.animationName, translate: st.translate });
})()`);
console.log('LANG_SWITCH_AFTER_SETTLE', langSwitch);

// ---- 跳过：动画中途按任意键 ----
await evaluate('(() => { window.__game._playTitleIntro(); window.__introT = window.__game._titleIntroT0; })()');
await sleep(240);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x', bubbles: true }))`);
await sleep(60);
const skipped = await evaluate(stateExpr);
console.log('SKIP_STATE', skipped);
await shot('02_skip');
await evaluate('window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyX", key: "x", bubbles: true }))');

// ---- 从子页回到标题：应重播开屏 ----
await evaluate('window.__game.showDifficultySelect()');
await sleep(500);
await evaluate('window.__game.showTitle()');
await sleep(80);
const backState = await evaluate(`JSON.stringify({ t0: !!window.__game._titleIntroT0, cls: document.getElementById('overlay').className, prog: window.__game._titleIntroProgress() })`);
console.log('BACK_TO_TITLE', backState);
await shot('03_back_80ms');
await sleep(700);
await shot('04_back_780ms');

// ---- 减少动态效果：不播位移 ----
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const reduced = await evaluate(`(() => {
  const ov = document.getElementById('overlay');
  ov.classList.remove('intro', 'intro-done');
  window.__game._titleIntroT0 = 0; window.__game._titleIntroOn = false;
  window.__game._playTitleIntro();
  return JSON.stringify({ cls: ov.className, prog: window.__game._titleIntroProgress(), on: window.__game._titleIntroOn });
})()`);
console.log('REDUCED_MOTION', reduced);
await shot('05_reduced_motion');

// ---- 回标题页正常状态截图（结束姿态） ----
await send('Emulation.setEmulatedMedia', { features: [] });
// ---- 卡拍：模拟 BGM 已在半拍处，lead 应补到下一拍，CSS 延时整体后移 ----
const leadTest = await evaluate(`(() => {
  const g = window.__game;
  Object.defineProperty(g.audio, 'musicProgress', { configurable: true, get: () => ({ elapsed: 1.25, duration: 144, loop: 0 }) });
  g._titleIntroT0 = 0; g._titleIntroOn = false;
  g._playTitleIntro();
  const ov = document.getElementById('overlay');
  const btn0 = document.querySelector('.title-mode .btn');
  const lead = { var: ov.style.getPropertyValue('--lead'), wait: Math.round(g._titleIntroT0 - performance.now()), btnDelay: getComputedStyle(btn0).animationDelay, prog: g._titleIntroProgress() };
  delete g.audio.musicProgress;
  return JSON.stringify(lead);
})()`);
console.log('LEAD_TEST', leadTest);
await sleep(500);

await evaluate('window.__game.showTitle()');
await sleep(2800);
await shot('06_settled');

console.log('CONSOLE_LOGS', JSON.stringify(logs.slice(0, 40), null, 1));
ws.close();
proc.kill();
await sleep(400);
process.exit(0);
