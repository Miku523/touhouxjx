// 验证秘籍「无敌模式」：Shift → QQ PPP VVVV Space×5 解锁 / 再输一遍解除
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9351, W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-cheat-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || '')); return r.result?.value; };

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?cheat=${Date.now()}` });
for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await sleep(500);

// 干净起点：清掉秘籍存档，回到标题
await ev(`localStorage.removeItem('hks.cheat.v1'); window.__game.showTitle();`);
await sleep(300);

// 页面内部按键助手：直接向 window 派发 keydown，走真实监听链路
await ev(`
window.__press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', {
  code, key: code === 'Space' ? ' ' : code.replace(/^Key/, ''), bubbles: true, cancelable: true,
}));
window.__seq = (codes) => codes.forEach((c, i) => setTimeout(() => window.__press(c), i * 60));
window.__cheat = ['ShiftLeft','KeyQ','KeyQ','KeyP','KeyP','KeyP','KeyV','KeyV','KeyV','KeyV','Space','Space','Space','Space','Space'];
true;
`);

const snapshot = async () => JSON.parse(await ev(`JSON.stringify({
  saved: localStorage.getItem('hks.cheat.v1'),
  state: window.__game.state,
  page: window.__game._page,
  subtitle: (document.getElementById('subtitle') || {}).textContent || '',
  badge: (() => { const b = document.querySelector('.cheat-badge'); return b ? { hidden: b.classList.contains('hidden'), text: b.textContent } : null; })(),
  lives: window.__game.lives,
  hearts: window.__game.stage?.player?.hearts,
})`));

const before = await snapshot();

// 1) 正确序列 → 解锁
await ev('window.__seq(window.__cheat)');
await sleep(1400);
const unlocked = await snapshot();
writeFileSync('_cheat_title_on.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

// 1b) 提示 2.6s 后应还原成原副标题
await sleep(3000);
const hintRestored = await snapshot();

// 2) 进关（真实 startGame 流程）：HUD 徽章出现 + 伤害免疫
await ev(`localStorage.setItem('hks.cheat.v1','1'); window.__game.startGame();`);
await sleep(700);
await ev(`(() => { const d = window.__game.dialogue; let n = 0; while (d.active && n < 600) { d.advance(); n++; } })()`);
await sleep(1600);
const inStage = JSON.parse(await ev(`JSON.stringify({
  state: window.__game.state,
  hudHidden: document.getElementById('hud')?.classList.contains('hidden'),
  badge: (() => { const b = document.querySelector('.cheat-badge'); return b ? { hidden: b.classList.contains('hidden'), text: b.textContent } : null; })(),
  hudInvincible: window.__game.hud?._invincible,
  hearts0: window.__game.stage?.player?.hearts,
})`));
const hurtResult = JSON.parse(await ev(`JSON.stringify((() => {
  const p = window.__game.stage.player;
  const h0 = p.hearts, alive0 = p.alive;
  p.hurt(1, p.x + 100);
  p.hurt(-1);
  return { h0, h1: p.hearts, alive0, alive1: p.alive, invuln: p.invuln };
})())`));

// 2b) 无敌时掉出地图：不掉命，送回检查点
await ev(`(() => { const g = window.__game; let n = 0; while (g.dialogue.active && n < 1200) { g.dialogue.advance(); n++; } })()`);
await sleep(1200);
const fallBefore = JSON.parse(await ev(`JSON.stringify((() => {
  const g = window.__game, p = g.stage.player;
  p.x = p.checkpoint.x + 80;
  p.y = p.level.h + 300;
  return { state: g.state, cp: { ...p.checkpoint }, lives: g.lives, hearts: p.hearts, alive: p.alive, y: p.y };
})())`));
await sleep(500);
const fallAfter = JSON.parse(await ev(`JSON.stringify((() => {
  const g = window.__game, p = g.stage.player;
  return { state: g.state, x: p.x, y: p.y, lives: g.lives, hearts: p.hearts, alive: p.alive, cp: { ...p.checkpoint } };
})())`));
writeFileSync('_cheat_stage.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

// 3) 回到标题，再输一遍序列 → 解除
await ev(`window.__game.showTitle();`);
await sleep(500);
await ev('window.__seq(window.__cheat)');
await sleep(1400);
const relocked = await snapshot();
writeFileSync('_cheat_title_off.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));

// 4) 解除后再进关：伤害正常生效
await ev(`window.__game.showTitle();`);
await sleep(400);
await ev(`window.__game.startGame();`);
await sleep(700);
await ev(`(() => { const d = window.__game.dialogue; let n = 0; while (d.active && n < 600) { d.advance(); n++; } })()`);
await sleep(1600);
const hurtNormal = JSON.parse(await ev(`JSON.stringify((() => {
  const p = window.__game.stage.player;
  const h0 = p.hearts;
  p.invuln = 0;
  p.hurt(1, p.x + 100);
  return { h0, h1: p.hearts, badgeHidden: document.querySelector('.cheat-badge')?.classList.contains('hidden') };
})())`));

// 5) 输入错误序列（先 Shift 再按错键）应重置而不解锁
await ev(`window.__game.showTitle();`);
await sleep(400);
await ev(`window.__press('ShiftLeft'); window.__press('KeyZ'); window.__press('KeyQ'); window.__press('KeyQ');`);
await sleep(400);
const wrongSeq = await snapshot();

// 6) 只按 Shift 不动 → 不影响正常操作（Shift 是 fast 键，不应吞掉其它逻辑）
const shiftOnly = JSON.parse(await ev(`JSON.stringify((() => {
  window.__game.showTitle();
  return { state: window.__game.state, page: window.__game._page };
})())`));

await ev(`localStorage.removeItem('hks.cheat.v1')`);
console.log('RESULT', JSON.stringify({
  before, unlocked, hintRestored, inStage, hurtResult, fallBefore, fallAfter, relocked, hurtNormal, wrongSeq, shiftOnly, errors,
}, null, 2));
ws.close(); proc.kill(); await sleep(300); process.exit(0);
