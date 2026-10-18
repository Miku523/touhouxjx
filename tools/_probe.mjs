// 对比度回归探针：node tools/_probe.mjs [out.json]
// 逐屏抓取关键文字元素的 computed style，用于「改版前后必须完全一致」的比对。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? '_probe.json';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9633 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'edge-probe-'));
const W = 1280, H = 720;

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await r.json()).find((t) => t.type === 'page');
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
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
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?probe=${Date.now()}` });

let ready = false;
for (let i = 0; i < 100; i++) {
  ready = await evaluate('!!window.__game');
  if (ready) break;
  await sleep(150);
}
if (!ready) throw new Error('game did not boot');
await sleep(400);

const DUMP = `(() => {
  const sels = ['#subtitle','#hint','.hint','.dc-meta','.dc-key','.dd-m','.dd-blurb','.cc-note','.cc-key',
    '.help-tip','.seg b','.set-row .k','.btn .k','.back-ghost','.set-foot-btn','.dlg-next','.boss-head',
    '#bossPhase','.pdim','.pdim b','.plv b','.sn','.tm','.hud-settings','.overlay #title','.title-mode .btn',
    '.title-mode .btn .en','.title-ver','#bossBar','.ov-bg-caption'];
  const out = {};
  for (const s of sels) {
    const el = document.querySelector(s);
    if (!el) { out[s] = null; continue; }
    const cs = getComputedStyle(el);
    out[s] = {
      color: cs.color, opacity: cs.opacity, textShadow: cs.textShadow,
      bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 80),
      border: cs.borderTopColor,
    };
  }
  const bb = document.querySelector('#bossBar');
  out['#bossBar::before'] = bb ? (() => { const c = getComputedStyle(bb, '::before');
    return { bgImg: c.backgroundImage.slice(0, 120), inset: c.inset, z: c.zIndex }; })() : null;
  return JSON.stringify(out);
})()`;

const scenarios = [
  ['title', 'window.__game.showTitle()'],
  ['difficulty', 'window.__game.showDifficultySelect()'],
  ['char', 'window.__game.showCharSelect()'],
  ['settings', 'window.__game._showSettings(0, "title")'],
  ['help', 'window.__game.showHelp()'],
  ['pause', "(()=>{const g=window.__game;g.startGame();try{g.dialogue?.close()}catch(e){};g._showPause()})()"],
  ['gameover', "(()=>{const g=window.__game;g.startGame();try{g.dialogue?.close()}catch(e){};g._onGameOver()})()"],
  ['hud', "(()=>{const g=window.__game;g.startGame();try{g.dialogue?.close()}catch(e){};document.getElementById('hud').classList.remove('hidden');g.state='play';const b=document.getElementById('bossBar');if(b){b.classList.remove('hidden');document.getElementById('bossName').textContent='蓬莱山辉夜';document.getElementById('bossPhase').textContent='难题「龙颈之玉 -五色的弹丸-」';}})()"],
];

const report = {};
for (const [name, js] of scenarios) {
  await evaluate(js);
  await sleep(700);
  report[name] = JSON.parse(await evaluate(DUMP));
}

writeFileSync(out, JSON.stringify(report, null, 1));
console.log('wrote', out, Object.keys(report).join(','));
ws.close();
proc.kill();
await sleep(300);
process.exit(0);
