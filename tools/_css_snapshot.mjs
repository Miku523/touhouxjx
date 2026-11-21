// 临时工具：抓取 DOM 全量计算样式指纹，用于 CSS 重构前后比对。
// 用法: node tools/_css_snapshot.mjs before.json
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_FILE = process.argv[2] || 'snap.json';
const URL_TARGET = 'http://127.0.0.1:8138/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9800 + Math.floor(Math.random() * 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { name: '1440x900', w: 1440, h: 900, dpr: 1, mobile: false },
  { name: '1280x720', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: '1024x768', w: 1024, h: 768, dpr: 2, mobile: true },
  { name: '673x997', w: 673, h: 997, dpr: 2, mobile: true },
  { name: '360x640', w: 360, h: 640, dpr: 2, mobile: true },
];

const profile = mkdtempSync(join(tmpdir(), 'edge-css-'));
const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`,
  '--window-size=1280,900', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let target;
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    target = (await r.json()).find((t) => t.type === 'page');
    if (target) break;
  } catch {}
  await sleep(200);
}
if (!target) { console.error('no page target'); proc.kill(); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waits.has(msg.id)) { waits.get(msg.id)(msg); waits.delete(msg.id); }
});
const waits = new Map();
let seq = 0;
await new Promise((r) => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  waits.set(id, (msg) => (msg.error ? rej(new Error(method + ': ' + msg.error.message)) : res(msg.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');

const FINGERPRINT = `(() => {
  const styles = document.querySelectorAll('style');
  const width = window.innerWidth;
  const path = (el) => {
    const parts = [];
    let e = el;
    while (e && e.nodeType === 1) {
      let i = 0, s = e;
      while ((s = s.previousElementSibling)) i++;
      parts.unshift(e.tagName.toLowerCase() + ':' + i);
      e = e.parentElement;
    }
    return parts.join('/');
  };
  const out = {};
  for (const el of document.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
    const cs = getComputedStyle(el);
    const parts = [];
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      parts.push(p + ':' + cs.getPropertyValue(p));
    }
    parts.sort();
    out[path(el)] = parts.join(';');
  }
  return { width, count: Object.keys(out).length, map: out };
})()`;

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const snapshot = {};

for (const vp of VIEWPORTS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr, mobile: vp.mobile,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: 1 });
  await send('Page.navigate', { url: URL_TARGET });
  await sleep(1500);
  await evaluate(`new Promise((res) => {
    const t = setTimeout(res, 9000);
    const i = setInterval(() => {
      if (!document.querySelector('.overlay.title-mode.intro')) { clearInterval(i); clearTimeout(t); res(); }
    }, 200);
  })`);

  const states = [
    ['title', `null`],
    ['settings', `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('设置'))?.click(), 600`],
    ['sub1', `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('音乐回忆室'))?.click(), 800`],
    ['sub2', `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('幻想乡图鉴'))?.click(), 800`],
    ['sub3', `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('排行榜'))?.click(), 800`],
    ['sub4', `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('录像回顾'))?.click(), 800`],
    ['sub5', `[...document.querySelectorAll('.btn')].find(b => b.textContent.includes('操作说明'))?.click(), 800`],
  ];

  for (const [name, action] of states) {
    if (action !== 'null') {
      const [expr, delay] = action.split(/, (\d+)$/);
      await evaluate(`(() => { ${expr}; return 1; })()`).catch(() => {});
      await sleep(Number(delay || 600));
    }
    const fp = await evaluate(FINGERPRINT);
    const map = {};
    for (const [k, v] of Object.entries(fp.map)) map[k] = hash(v);
    snapshot[vp.name + '/' + name] = { count: fp.count, map };
    // 回标题页，保证下一个状态从同一入口进入
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.btn,button')].find(x => /返回标题|返回|关闭/.test(x.textContent));
      if (b) b.click();
      return 1;
    })()`).catch(() => {});
    await sleep(400);
    await evaluate(`window.__game && window.__game.showTitle && window.__game.showTitle()`).catch(() => {});
    await sleep(700);
  }
  console.error('done', vp.name);
}

writeFileSync(OUT_FILE, JSON.stringify(snapshot));
console.error('wrote', OUT_FILE, Object.keys(snapshot).length, 'states');
ws.close();
proc.kill();
