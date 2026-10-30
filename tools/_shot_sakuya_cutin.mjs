// 截「登场 / 符卡」cut-in 的定格帧：把 CSS 动画暂停在指定毫秒，方便逐处核对文字层。
// 用法: node tools/_shot_sakuya_cutin.mjs <outPrefix> [frameMs] [port] [mode]
//   例: node tools/_shot_sakuya_cutin.mjs tools/shots/boss_cutin_after 650
//       node tools/_shot_sakuya_cutin.mjs tools/shots/spell_cutin_check 650 9337 spell
// 前置：python tools/serve_nocache.py 8138
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const prefix = process.argv[2] ?? 'tools/shots/sakuya_cutin';
const frameMs = Number(process.argv[3] ?? 650);
const PORT = Number(process.argv[4] ?? 9337);
/** boss = EX 咲夜登场 cut-in；spell = 玩家符卡 cut-in（回归：SPELL CARD 那行要照旧在） */
const mode = process.argv[5] === 'spell' ? 'spell' : 'boss';
const BASE = process.env.PT_BASE || 'http://127.0.0.1:8138';
const W = 1280;
const H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const profile = mkdtempSync(join(tmpdir(), 'edge-cutin-'));
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/index.html?cutin=${Date.now()}` });

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

let ready = false;
for (let i = 0; i < 80; i++) {
  ready = await evaluate('!!(window.__game && window.__boot && window.__boot.done)');
  if (ready) break;
  await sleep(200);
}
if (!ready) throw new Error('game did not boot');

// 清掉标题层，留一块干净的底色；先放一次 cut-in 把 sakuya_title.webp 解码进缓存，
// 再重放一次并把所有 CSS 动画暂停在同一帧（JS 的收起定时器一并清掉，帧不会自己消失）。
const info = await evaluate(`(async () => {
  const g = window.__game;
  const boot = document.getElementById('boot');
  if (boot) boot.style.display = 'none';
  document.getElementById('overlay')?.classList.add('hidden');
  document.getElementById('dialogue')?.classList.add('hidden');
  document.getElementById('game').style.background = '#0a0b12';
  g.cutin.${mode === 'spell' ? "show('reimu')" : "showBoss('sakuya')"};
  await new Promise((r) => setTimeout(r, 500));
  g.cutin.hide();
  g.cutin.${mode === 'spell' ? "show('reimu')" : "showBoss('sakuya')"};
  clearTimeout(g.cutin._timer);
  document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = ${frameMs}; } catch (e) {} });
  const el = document.getElementById('spellCutin');
  const tag = el.querySelector('.sc-tag');
  const cs = getComputedStyle(tag);
  return JSON.stringify({
    cls: el.className,
    tagText: tag.textContent,
    tagDisplay: cs.display,
    tagOpacity: cs.opacity,
    name: document.getElementById('scName').textContent,
    sub: document.getElementById('scSub').textContent,
  });
})()`);
console.log('STATE', info);

await sleep(200);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${prefix}.png`, Buffer.from(shot.data, 'base64'));
console.log('SHOT', `${prefix}.png`, `frame=${frameMs}ms`);

ws.close();
proc.kill();
await sleep(300);
process.exit(0);
