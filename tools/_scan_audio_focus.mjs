// 补测此前完全空白的两块：音频系统 + 切后台恢复
//   1. AudioContext 是否被浏览器 autoplay policy 拦住（需真实手势 unlock）
//   2. unlock() 后 ctx.state、音效/BGM 播放是否报错
//   3. 切后台（大 dt）后是否暴走/穿墙
// 用法: node tools/_scan_audio_focus.mjs [port]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.argv[2] ?? 9530);
const ONLY = process.argv[3] || '';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL0 = 'http://127.0.0.1:8142/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-audio-'));

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
  if (d.method === 'Runtime.exceptionThrown') { const x = d.params.exceptionDetails; errors.push('EXC: ' + (x.exception?.description || x.text || '').split('\n').slice(0, 2).join(' | ')); }
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('ERR: ' + (d.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || '').slice(0, 240));
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');

const results = [];
async function T(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  errors = [];
  try {
    const out = await fn();
    const errs = errors.slice(0);
    const ok = !errs.length && out !== false && !(out && out.fail) && (out == null || out.ok !== false);
    results.push({ name, ok, out, errs });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (out && typeof out === 'object') console.log('      ' + JSON.stringify(out));
    if (errs.length) console.log('      ! ' + errs.join(' | ').slice(0, 240));
  } catch (e) {
    results.push({ name, ok: false, err: String(e).slice(0, 200) });
    console.log(`FAIL  ${name}  ${String(e).slice(0, 200)}`);
  }
}

// ---------- 载入 ----------
await send('Page.navigate', { url: URL0 });
await sleep(3200);
const boot = await ev('(() => { const g = window.__game; return g ? "ok state=" + g.state : "NO_GAME"; })()');
console.log('页面:', boot);
if (boot.startsWith('NO_GAME')) { console.log('FATAL'); proc.kill(); process.exit(1); }

// ---------- 1. 音频：未交互时的状态 ----------
await T('音频-初始未解锁状态', async () => {
  const out = await ev(`(() => {
    const g = window.__game;
    const a = g.audio || g.sound || g.audioEngine || window.__audio;
    if (!a) return JSON.stringify({ fail: 'game 上找不到音频实例', keys: Object.keys(g).filter(k => /aud|sou|bgm|sfx/i.test(k)) });
    const ctx = a.ctx || a.context || null;
    return JSON.stringify({
      hasCtx: !!ctx,
      state: ctx ? ctx.state : null,
      sampleRate: ctx ? ctx.sampleRate : null,
      unlocked: a.unlocked === undefined ? null : !!a.unlocked,
    });
  })()`);
  const r = JSON.parse(out);
  if (r.fail) return { fail: true, msg: JSON.stringify(r) };
  return r;
});

// ---------- 2. 真实手势（CDP 点击）后 unlock ----------
await T('音频-真实手势后 unlock', async () => {
  const before = await ev(`(() => { const a = window.__game.audio || window.__game.sound || window.__audio; const c = a && (a.ctx || a.context); return c ? c.state : 'noctx'; })()`);
  // 真实 CDP 鼠标事件 → 给 user activation
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 400, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 400, button: 'left', clickCount: 1 });
  await sleep(300);
  const out = await ev(`(async () => {
    const a = window.__game.audio || window.__game.sound || window.__audio;
    if (!a) return JSON.stringify({ fail: 'no audio' });
    let err = null;
    try { if (typeof a.unlock === 'function') { await a.unlock(); } } catch (e) { err = String(e).slice(0, 120); }
    await new Promise(r => setTimeout(r, 400));
    const c = a.ctx || a.context;
    return JSON.stringify({ before: '${before}', after: c ? c.state : null, unlockErr: err });
  })()`);
  const r = JSON.parse(out);
  if (r.fail) return { fail: true, msg: JSON.stringify(r) };
  return { ...r, ok: r.after === 'running' && !r.unlockErr };
});

// ---------- 3. 音效/BGM 播放不报错 ----------
await T('音频-播放音效与 BGM', async () => {
  const out = await ev(`(async () => {
    const a = window.__game.audio || window.__game.sound || window.__audio;
    if (!a) return JSON.stringify({ fail: 'no audio' });
    // 音效是程序化合成（Web Audio 振荡器），名字硬编码在 _playSfx 的 switch 里
    const names = ['jump','doubleJump','land','coin','hurt','stomp','shotHit','enemyKill',
      'bossHit','die','bossStomp','bossStagger','bossDive','win','spell','extend',
      'checkpoint','dash','menu','select','bounce'];
    const errs = [];
    let played = 0;
    for (const n of names) {
      try { a.play(n, { volume: 0.01 }); played++; } catch (e) { errs.push(n + ': ' + String(e).slice(0, 60)); }
    }
    // 快速连打：检验同一音效高频触发是否会叠爆
    let burstErr = null;
    try { for (let i = 0; i < 40; i++) a.play('shotHit', { volume: 0.01 }); } catch (e) { burstErr = String(e).slice(0, 100); }
    // BGM 切歌（曲库 key 见 songs/index.js）
    const songs = ['title','stage1','stage2','stage3','stage4','stage5','stage6','extra','gameover','ending','endingW'];
    const songErr = [];
    let switched = 0;
    for (const s of songs) {
      try { a.playMusic(s); switched++; } catch (e) { songErr.push(s + ': ' + String(e).slice(0, 60)); }
    }
    await new Promise(r => setTimeout(r, 600));
    const c = a.ctx || a.context;
    return JSON.stringify({
      音效数: names.length, 播放成功: played, 播放错误: errs,
      连打40发: burstErr || 'ok', 曲目数: songs.length, 切歌成功: switched, 切歌错误: songErr,
      ctx: c ? c.state : null,
    });
  })()`);
  const r = JSON.parse(out);
  if (r.fail) return { fail: true, msg: JSON.stringify(r) };
  const clean = !(r.播放错误 || []).length && !(r.切歌错误 || []).length && r.连打40发 === 'ok';
  return { ...r, ok: clean };
});

// ---------- 4. 切后台（模拟 8 秒积压）后不暴走 ----------
await T('切后台-大 dt 不暴走', async () => {
  const out = await ev(`(async () => {
    const g = window.__game;
    g.lives = 99; g.char = 'reimu'; g.startStage(0);
    await new Promise(r => setTimeout(r, 300));
    let n = 0; while (g.state === 'dialogue' && n++ < 60) g.dialogue.advance();
    await new Promise(r => setTimeout(r, 300));
    const s = g.stage, p = s.player, loop = g.loop;
    const x0 = p.x, y0 = p.y;
    const steps0 = loop.stepCount;
    // 模拟切后台 8 秒：把 _last 往前推 8 秒，制造巨大 delta
    // 未触发 visibilitychange，所以考验的是 maxDelta/maxSteps 兜底
    loop._last = performance.now() - 8000;
    await new Promise(r => setTimeout(r, 350));   // 让 rAF 跑几帧
    const dx = Math.abs(p.x - x0), dy = Math.abs(p.y - y0);
    const stepsRan = loop.stepCount - steps0;
    // 8 秒 = 480 步才算暴走；正常应为「首帧跑满 maxSteps + 后续每帧 1 步」
    const 暴走阈值 = 480 * 0.3;
    return JSON.stringify({
      积压秒数: 8, 理论暴走步数: 480,
      实际逻辑步数: stepsRan,
      位移: { dx: Math.round(dx), dy: Math.round(dy) },
      maxDelta: loop.maxDelta, maxSteps: loop.maxSteps,
      判定: stepsRan < 暴走阈值 ? '已钳制（正常）' : '暴走',
      穿墙: Math.abs(p.y - y0) > 200 ? '是' : '否',
    });
  })()`);
  const r = JSON.parse(out);
  if (r.fail) return { fail: true, msg: JSON.stringify(r) };
  return { ...r, ok: r.判定 === '已钳制（正常）' && r.穿墙 === '否' };
});

// ---------- 5. visibilitychange 实际触发后恢复 ----------
await T('切后台-visibilitychange 恢复', async () => {
  const out = await ev(`(async () => {
    const g = window.__game, loop = g.loop;
    const p = g.stage.player;
    const x0 = p.x;
    loop._last = performance.now() - 12000;
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r => setTimeout(r, 300));
    return JSON.stringify({
      acc: +loop.acc.toFixed(4),
      位移: Math.round(Math.abs(p.x - x0)),
      结论: loop.acc < 0.2 ? '积压已清零' : '仍有积压 ' + loop.acc.toFixed(2),
    });
  })()`);
  const r = JSON.parse(out);
  return { ...r, ok: r.acc < 0.2 };
});

console.log('\n===== 汇总 =====');
const pass = results.filter((r) => r.ok).length;
console.log(`${pass}/${results.length} PASS`);
for (const r of results) if (!r.ok) console.log('  未通过: ' + r.name);

proc.kill();
process.exit(0);
