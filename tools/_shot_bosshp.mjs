// Boss 血条显示体检：进 Boss 战 → 满血 / 扣血 / 切符卡 三个状态各截一张图
// 目的：确认 HUD 血条读的是「当前符卡比例」还是「总血」，以及切卡时会不会回满
// 用法: node tools/_shot_bosshp.mjs [port] [stage]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9510);
const STAGE = process.argv[3] ?? '0';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8142/index.html';
const OUT = 'C:/Users/GuSheng/Downloads/HKS';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-bosshp-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

let errors = [];
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
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push('EXC: ' + (x.exception?.description || x.text || '').split('\n')[0]); }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR: ' + (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) errors.push('EVAL: ' + (r.result.exceptionDetails.exception?.description || '').split('\n')[0]);
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'));
  return name;
};

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: URL0 });
for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
await sleep(900);

await ev(`(() => {
  const g = window.__game, inp = g.input;
  const S = { want: {}, edge: {}, ax: 0 };
  window.__S = S;
  inp.down = (a) => !!S.want[a];
  inp.pressed = (a) => { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = () => false;
  Object.defineProperty(inp, 'axisX', { get: () => S.ax, configurable: true });
  return 'OK';
})()`);

await ev(`(() => { const g = window.__game; g.lives = 99; g.char = 'reimu'; g.startStage(${STAGE}); return g.state; })()`);
await sleep(500);
await ev(`(() => { const g = window.__game; let n = 0; while (g.state === 'dialogue' && n++ < 100) g.dialogue.advance(); return n; })()`);
await sleep(250);

// 传送到 Boss 触发点
console.log('teleport:', await ev(`(() => {
  const g = window.__game, st = g.stage, p = st.player, lv = st.level;
  if (st.mode === 'stg') return 'SKIP(STG)';
  const tx = Math.max(200, Math.min((st.goalX || lv.w) - 120, (lv.w - 520) - 420));
  const col = Math.floor((tx - 200) / 32);
  let cy = 0;
  for (; cy < lv.rows; cy++) if (lv.isSolidTile(col, cy) || lv.isPlatformTile(col, cy)) break;
  p.x = col * 32; p.y = Math.max(0, (cy - 2) * 32); p.vx = 0; p.vy = 0; p.onGround = true;
  if (st.camera) st.camera.snapTo(p.x);
  return 'col=' + col;
})()`));

const STEP = `(async () => {
  const g = window.__game, S = window.__S;
  const N = ${1};
  const n = Number(N);
  for (let k = 0; k < n; k++) {
    if (g.state === 'dialogue' && g.dialogue && g.dialogue.active) g.dialogue.advance();
    const s = g.stage; if (!s) break;
    S.want = {}; S.ax = 0;
    g.loop.update(1 / 60);
    if (k % 20 === 19) await new Promise((r) => setTimeout(r, 4));
  }
  const s = g.stage;
  return JSON.stringify({ state: g.state, col: s.player ? Math.round(s.player.x / 32) : -1,
    boss: s.boss ? { st: s.boss.state, hp: Math.round(s.boss.hp), maxHp: s.boss.maxHp,
      spellHp: Math.round(s.boss.spellHp), spellMax: s.boss.spellMaxHp,
      ratio: +(s.boss.hpRatio || 0).toFixed(3), idx: s.boss.spellIdx, count: s.boss.spellCount,
      name: s.boss.def.name } : null,
    fillW: (document.getElementById('bossFill') || {}).style?.width || '',
    phaseTxt: (document.getElementById('bossPhase') || {}).textContent || '' });
})()`;

const step = async (frames) => {
  const src = STEP.replace('${1}', String(frames));
  return JSON.parse(await ev(src));
};

// 直接触发 Boss（跳过走过去的时间）
await ev(`(() => { const g = window.__game; g._onBossTrigger({}); return g.state; })()`);
await sleep(2200);
await ev(`(() => { const g = window.__game; let n = 0; while (g.state === 'dialogue' && n++ < 100) g.dialogue.advance(); return n; })()`);
await sleep(1200);

// 走到 Boss 出现
let r = null;
for (let i = 0; i < 40; i++) {
  r = await step(30);
  if (r.boss) break;
  await sleep(120);
}
console.log('boss 出现:', JSON.stringify(r && r.boss), 'state=', r && r.state);

// 等符卡无敌解除（出场宣言期间 damage 会被忽略）
for (let i = 0; i < 60; i++) {
  const locked = await ev(`(() => { const b = window.__game.stage.boss; return b ? (b.spellLock > 0 || b.state !== 'battle') : true; })()`);
  if (!locked) break;
  r = await step(20); await sleep(100);
}
console.log('\n[1] 满血     ', JSON.stringify(r.boss), '\n    HUD宽度:', r.fillW, ' 符卡:', r.phaseTxt);
await sleep(600);
console.log('截图:', await shot('_hp_1_full.png'));

// 扣到 40%
await ev(`(() => { const b = window.__game.stage.boss; if (b) b.damage(b.spellMaxHp * 0.6); return 1; })()`);
r = await step(20); await sleep(600);
console.log('\n[2] 扣血 60% ', JSON.stringify(r.boss), '\n    HUD宽度:', r.fillW);
console.log('截图:', await shot('_hp_2_damaged.png'));

// 打空当前符卡 → 切下一张
await ev(`(() => { const b = window.__game.stage.boss; if (b) b.damage(b.spellHp + 1); return 1; })()`);
for (let i = 0; i < 30; i++) { r = await step(20); if (r.boss && r.boss.idx > 0) break; await sleep(60); }
await sleep(700);
console.log('\n[3] 切到第2张', JSON.stringify(r.boss), '\n    HUD宽度:', r.fillW, ' 符卡:', r.phaseTxt);
console.log('截图:', await shot('_hp_3_nextspell.png'));

console.log('\nJS 错误:', errors.length ? errors.slice(0, 4).join(' | ') : '无');
proc.kill();
process.exit(0);
