// 截 Boss 战实际画面：验证战斗中是 AI 立绘还是矢量小人
// 用法: node tools/_shot_boss_fight.mjs [port] [stage] [outfile]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9520);
const STAGE = process.argv[3] ?? '0';
const OUT = process.argv[4] ?? '_bossart_fight.png';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8141/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-'));

const proc = spawn(EDGE, ['--headless=new', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(250);
  }
  throw new Error('no target');
}
const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL0 });
await sleep(3200);

// 起关 + 装输入 + 传送
console.log(await ev(`(() => {
  const g = window.__game;
  g.lives = 99; g.char = 'reimu';
  g.startStage(${STAGE});
  const inp = g.input; const S = { want: {}, edge: {}, ax: 0 };
  window.__S = S;
  inp.down = (a) => !!S.want[a];
  inp.pressed = (a) => { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = () => false;
  Object.defineProperty(inp, 'axisX', { get: () => S.ax, configurable: true });
  S.want = { shoot: true, right: true }; S.ax = 1;
  return 'setup ok';
})()`));

// 反复推进对话 + 等待 Boss 生成
let boss = null;
for (let round = 0; round < 40; round++) {
  await sleep(400);
  const st = JSON.parse(await ev(`(() => {
    const g = window.__game;
    let n = 0;
    while (g.state === 'dialogue' && g.dialogue.active && n++ < 60) g.dialogue.advance();
    const s = g.stage, b = s && s.boss;
    if (!s) return JSON.stringify({ st: g.state, none: true });
    if (!b && s.player && s.level) {
      const bx = s.level.w - 520 + 80;
      if (s.player.x < bx - 40) { s.player.x = bx - 60; s.player.y = 13 * 32; s.player.vx = 0; s.player.vy = 0; s.camera.snapTo(s.player.x); }
    }
    return JSON.stringify({ st: g.state, boss: b ? { key: b.key, hp: Math.round(b.hp), state: b.state, alpha: +Number(b.alpha).toFixed(2) } : null });
  })()`));
  if (st.boss) { boss = st.boss; console.log('Boss 已出现:', JSON.stringify(st.boss), 'round', round); break; }
  if (round % 5 === 0) console.log('  waiting... state=' + st.st);
}
if (!boss) { console.log('FATAL: Boss 未生成'); proc.kill(); process.exit(1); }

const MODE = process.argv[5] ?? 'normal';
if (MODE === 'placeholder') {
  // 故意把 key 改成不存在的值：模拟立绘缺失，验证兜底不会画出小人
  const r = await ev(`(() => { const b = window.__game.stage.boss; b.key = '__none__'; b.state = 'intro'; b.introT = 0; b.artWaitT = 0; b.alpha = 0; b.baseY = b.y; return 'forced-missing'; })()`);
  console.log('模式: 强制立绘缺失 ->', r);
}

// 等 Boss 亮相/进入战斗，再截图（不再调 eval，避免页面忙碌时 evaluate 卡住）
const SHOTS = MODE === 'placeholder' ? [[1, 2200], [2, 2500], [3, 2500]] : [[1, 2500], [2, 3500], [3, 4000]];
for (const [tag, ms] of SHOTS) {
  await sleep(ms);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const b64 = shot.result?.data;
  if (!b64) { console.log('截图失败 @' + tag); continue; }
  const file = OUT.replace(/\.png$/, `_${tag}.png`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('已保存:', file, '(累计等待 ' + ms + 'ms)');
}

proc.kill();
process.exit(0);
