// 验证：Boss 战前「立绘预热等待期」画面不再静止
// 做法：把 preparePortraits 换成永不 resolve 的 Promise，强制进入最长等待期，
//       再手动步进主循环，统计 stage.update 的调用次数。
//   修复前：cnt === 0（画面完全冻结）
//   修复后：cnt ≈ 步进帧数（场景继续推进），且 600ms 兜底超时后对话自动开播
// 用法: node tools/_verify_nofreeze.mjs [stageIndex] [port]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGE = Number(process.argv[2] ?? 0);
const PORT = Number(process.argv[3] ?? 9470);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8141/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-nf-'));

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

await send('Page.navigate', { url: URL0 });
await sleep(2500);
console.log('加载:', await ev('(() => { const g = window.__game; return g ? "GAME_OK state=" + g.state : "NO_GAME"; })()'));

// 1) 进关，手动步进 + 自动推进，把开场对话看完
await ev(`(() => { const g = window.__game; g.lives = 99; g.char = 'reimu'; g.startStage(${STAGE}); return g.state; })()`);
let guard = 0;
while (guard++ < 120) {
  const s = await ev('(() => { const g = window.__game; if (g.dialogue.active) g.dialogue.advance(); for (let i = 0; i < 20; i++) g.loop.update(1/60); return g.state; })()');
  if (s === 'play') break;
  await sleep(40);
}
console.log('开场对话后 state:', await ev('(() => window.__game.state)()'), `(步进轮数 ${guard})`);

// 2) 强制进入立绘预热等待期
console.log('进入等待期:', await ev(`(() => {
  const g = window.__game, s = g.stage;
  if (!s) return 'NO_STAGE';
  window.__cnt = 0;
  const orig = s.update.bind(s);
  s.update = (...a) => { window.__cnt++; return orig(...a); };
  g.dialogue.preparePortraits = () => new Promise(() => {});   // 永不 resolve
  g._onBossTrigger({});
  return JSON.stringify({ state: g.state, active: g.dialogue.active, cnt: window.__cnt });
})()`));

// 3) 等待期内手动步进 18 帧（≈300ms），看场景是否仍在推进
const during = await ev('(() => { const g = window.__game; for (let i = 0; i < 18; i++) g.loop.update(1/60); return JSON.stringify({ state: g.state, active: g.dialogue.active, cnt: window.__cnt }); })()');
console.log('等待期步进 18 帧:', during);

// 4) 真实等待 800ms > 600ms 兜底超时，确认对话最终会开播（不会永久卡住）
await sleep(800);
const after = await ev('(() => { const g = window.__game; for (let i = 0; i < 5; i++) g.loop.update(1/60); return JSON.stringify({ state: g.state, active: g.dialogue.active, cnt: window.__cnt }); })()');
console.log('800ms 兜底超时后:', after);

console.log(errors.length ? '控制台错误: ' + errors.slice(0, 5).join(' | ') : '控制台: 无错误');
try { proc.kill(); } catch {}
ws.close();
process.exit(0);
