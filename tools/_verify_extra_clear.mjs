// 验证 EXTRA 通关链路：中途 Boss → 终盘 Boss（芙兰）→ EXTRA 结局
// EXTRA 终盘 Boss 血量很高（实测 48257），自动玩家正常 DPS 要打 8 分钟以上，
// 这里用「每帧扣固定血量」模拟玩家输出，只为验证打完之后能否正常接上结局。
// 用法: node tools/_verify_extra_clear.mjs [port] [每帧扣血]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9495);
const DPS = Number(process.argv[3] ?? 60);      // 每帧扣血量
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8141/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-ex-'));

const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  `--user-data-dir=${profile}`, '--window-size=1280,720',
  `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

const errors = [];
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
  if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push('EXC: ' + (x.exception?.description || x.text || '').split('\n').slice(0, 2).join(' | ')); }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR: ' + (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 240));
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Page.navigate', { url: URL0 });
for (let i = 0; i < 100; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(300); }
await sleep(900);

// 装假输入（一直射击 + 缓慢左右移动，模拟玩家走位）
await ev(`(() => {
  const g = window.__game, inp = g.input;
  const S = { want: { shoot: true }, edge: {}, ax: 0 };
  window.__S = S;
  inp.down = (a) => !!S.want[a];
  inp.pressed = (a) => { const v = !!S.edge[a]; S.edge[a] = false; return v; };
  inp.released = () => false;
  Object.defineProperty(inp, 'axisX', { get: () => S.ax, configurable: true });
  return 'OK';
})()`);

// 从终盘 Boss（芙兰）前开始
console.log('进 EXTRA:', await ev(`(() => {
  const g = window.__game;
  g.lives = 50; g.char = 'reimu'; g.unlockedExtra = true; g.inExtra = true;
  g.carryPower = 0; g.continues = 0;
  g._startExtraStage({ resumeFrom: 'final', skipIntro: true });
  return JSON.stringify({ state: g.state, hasBoss: !!g.stage?.boss });
})()`));

const snaps = [];
let ended = null;
for (let batch = 0; batch < 60; batch++) {
  const out = await ev(`(() => {
    const g = window.__game, S = window.__S;
    for (let i = 0; i < 400; i++) {
      if (g.state === 'dialogue' && g.dialogue.active) g.dialogue.advance();
      // 必须走 damage()：它同时扣「当前符卡血条」和总血，打空符卡才会换卡 / 进 defeat。
      // 直接改 boss.hp 会绕过符卡驱动，符卡一直推进但 Boss 永远不死（假故障）。
      const b = g.stage && g.stage.boss;
      if (b && !b.dead && b.state === 'battle') b.damage(${DPS});
      S.ax = (Math.floor(i / 40) % 2) ? 1 : -1;
      g.loop.update(1/60);
      if (g.state === 'ending' || g.state === 'clear' || g.state === 'menu' || g.state === 'gameover') break;
    }
    const b = g.stage && g.stage.boss;
    return JSON.stringify({
      state: g.state, inExtra: g.inExtra,
      boss: b ? Math.round(b.hp) + '/' + Math.round(b.maxHp) + ' sp' + b.spellIdx + (b.dead ? ' dead' : '') : null,
      pending: !!(g.stage && g.stage.bossPending), started: !!(g.stage && g.stage.bossStarted),
    });
  })()`);
  const o = JSON.parse(out);
  snaps.push(`  ${String(batch * 400 / 60).padStart(5)}s  ${o.state}${o.inExtra ? '(EX)' : ''}  boss=${o.boss ?? '-'}  pending=${o.pending} started=${o.started}`);
  if (o.state === 'ending' || o.state === 'menu' || o.state === 'gameover') { ended = o.state; break; }
  await sleep(30);
}

console.log('\n--- 时间线 ---');
console.log(snaps.filter((_, i) => i % 3 === 0 || i >= snaps.length - 4).join('\n'));

// 若进了结局，把结局演完看是否回到标题
if (ended === 'ending') {
  let adv = 0;
  for (let i = 0; i < 200; i++) {
    const s = await ev('(() => { const g = window.__game; for (let k = 0; k < 40; k++) g.loop.update(1/60); if (g.state === "ending") g.ending.advance(); return g.state; })()');
    adv++;
    if (s !== 'ending') { console.log(`\n结局演完（${adv} 次推进）→ state=${s}`); break; }
  }
} else {
  console.log('\n未进入结局，最终 state =', ended);
}
console.log(errors.length ? '\n控制台错误:\n' + errors.slice(0, 6).join('\n') : '\n控制台: 无错误');
try { proc.kill(); } catch {}
ws.close();
process.exit(0);
