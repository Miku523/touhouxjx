// 符卡 cut-in 动画分镜验收：把 CSS 动画暂停在指定时间点逐帧截图，
// 避免 Page.captureScreenshot 自身耗时导致「采样错过某一拍」的假象。
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9360;
const URL = 'http://127.0.0.1:8139/index.html';
const profile = mkdtempSync(join(tmpdir(), 'edge-cutin-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--mute-audio', `--user-data-dir=${profile}`,
  '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let page;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page');
    if (page) break;
  } catch {}
  await sleep(250);
}
if (!page) { console.log('no page'); proc.kill(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('EXC ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('CONSOLE ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EVAL_ERR ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join('tools', name), Buffer.from(r.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

const results = {};
try {
  await send('Page.navigate', { url: URL });
  await sleep(1200);
  for (let i = 0; i < 40; i++) {
    if (await evl('!!window.__game')) break;
    await sleep(250);
  }
  results.boot = await evl('({ game: !!window.__game, cutin: !!window.__game?.cutin })');

  // 进关（跳过道中对白），给足 POWER 让符卡能放
  results.start = await evl(`(async () => {
    const g = window.__game;
    g.startGame();
    await new Promise(r => setTimeout(r, 700));
    g.startStage(0, { skipIntro: true });
    await new Promise(r => setTimeout(r, 900));
    if (g.stage?.player) g.stage.player.power = 14;
    return { state: g.state, mode: g.stage?.mode, power: g.stage?.player?.power };
  })()`);
  await sleep(600);

  // 放一次符卡，拿到真实演出
  results.cast = await evl(`(() => {
    const g = window.__game;
    g.stage._castSpell({ cost: 6, levelBefore: 4 });
    return {
      show: document.getElementById('spellCutin').classList.contains('show'),
      cls: document.getElementById('spellCutin').className,
      name: document.getElementById('scName').textContent,
      chars: document.querySelectorAll('#scName .ch').length,
      slow: g._slowT,
      castFx: g.stage.castFx,
      anims: document.getAnimations().length,
    };
  })()`);

  // 逐拍截图：每次重新 show 一次（清掉自动收场定时器），再把动画钉在指定时间点
  const frame = async (ms, name) => {
    const info = await evl(`(() => {
      const g = window.__game;
      g.cutin._n.reimu = 0; // 固定符卡名，便于逐帧对比
      g.cutin.show('reimu');
      clearTimeout(g.cutin._timer);
      const list = document.getAnimations();
      for (const a of list) { a.pause(); a.currentTime = ${ms}; }
      return { n: list.length, t: ${ms}, name: document.getElementById('scName').textContent };
    })()`);
    await sleep(80);
    await shot(name);
    return info;
  };

  results.f090 = await frame(90, '_cutin_f090.png');
  results.f300 = await frame(300, '_cutin_f300.png');
  results.f560 = await frame(560, '_cutin_f560.png');
  results.f1000 = await frame(1000, '_cutin_f1000.png');

  // 魔理沙版本（金色配色 + 换立绘）
  results.marisa = await evl(`(() => {
    const g = window.__game;
    g.cutin._n.marisa = 0;
    g.cutin.show('marisa');
    clearTimeout(g.cutin._timer);
    for (const a of document.getAnimations()) { a.pause(); a.currentTime = 560; }
    return { cls: document.getElementById('spellCutin').className, name: document.getElementById('scName').textContent };
  })()`);
  await sleep(120);
  await shot('_cutin_marisa560.png');

  // 恢复正常速度，确认 1.15s 后收场 & 减速已回升
  results.recover = await evl(`(async () => {
    const g = window.__game;
    g.cutin.show('reimu');
    await new Promise(r => setTimeout(r, 1400));
    const after = {
      show: document.getElementById('spellCutin').classList.contains('show'),
      slow: g._slowT,
      timeScale: g._timeScale,
      punch: document.getElementById('game').classList.contains('sc-punch'),
    };
    // 手动推 90 帧，确认 castFx 正常衰减（对白中 stage.update 会冻结）
    const fake = { down: () => false, pressed: () => false, released: () => false };
    for (let i = 0; i < 90; i++) g.stage.update(1 / 60, fake);
    after.castFx = g.stage.castFx;
    return after;
  })()`);
} catch (e) {
  results.fatal = String(e);
}
results.errors = errors;
console.log(JSON.stringify(results, null, 2));
ws.close();
proc.kill();
process.exit(0);
