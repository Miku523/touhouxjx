// EXTRA 实机流程截图：开场零火力 → 5:00 中途对话 → 雷米莉亚登场 → 击破回道具
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8138/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9374);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-flow-'));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

async function firstPage() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools target');
}
const page = await firstPage();
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${URL0}?flow=${Date.now()}` });

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(name, Buffer.from(s.data, 'base64'));
  console.log('SHOT', name);
};
for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);

// 1) 真流程进 EXTRA：进度里记的是 marisa，当前选的是 reimu
await ev(`(() => {
  const g = window.__game;
  g.unlockedExtra = true; g.extraChar = 'marisa'; g.char = 'reimu';
  g.startExtra();
  return 1;
})()`);
await sleep(900);
console.log('DIALOGUE1', await ev(`(() => { const g = window.__game; return JSON.stringify({ st: g.state, showing: !document.getElementById('dialogue')?.classList.contains('hidden') }); })()`));
await shot('_flow-1-intro.png');

// 2) 跳过开场对话，直接看开场画面（零火力）
await ev(`(() => { const g = window.__game; g.dialogue?.stop?.(); g._startExtraStage(); return 1; })()`);
await sleep(1200);
await ev(`(() => { const g = window.__game; const p = g.stage.player; p.invuln = 99999; return 1; })()`);
await sleep(600);
console.log('OPEN', await ev(`(() => { const g = window.__game; const s = g.stage; return JSON.stringify({
  char: g.char, stageChar: s.player.char, power: s.player.power, lvl: s.player.fireLevel,
  diff: s.difficulty, extraT: +s.extraT.toFixed(1), scroll: Math.round(s.stg.scroll), waves: s.stg.waves.length }); })()`));
await shot('_flow-2-open.png');
// 等 Boss 立绘（AI 图）预加载完，别截到程序化 fallback
await sleep(6000);

// 3) 时间轴推到 5:00 前一刻，让真循环自己触发 bossTrigger
await ev(`(() => { const g = window.__game; g.stage.extraT = 299.2; return 1; })()`);
for (let i = 0; i < 60; i++) {
  const st = await ev(`(() => { const g = window.__game; return g.state; })()`);
  if (st === 'dialogue') break;
  await sleep(100);
}
console.log('MIDDLG', await ev(`(() => { const g = window.__game; return JSON.stringify({ st: g.state, bossPending: g.stage.bossPending, btn: g.stage.pendingBossKey, mid: g.stage.pendingBossMid }); })()`));
await sleep(700);
await ev(`(() => { const g = window.__game; g.dialogue?.advance?.(); return 1; })()`);
await sleep(500);
await ev(`(() => { const g = window.__game; g.dialogue?.advance?.(); return 1; })()`);
await sleep(500);
console.log('MIDLINE', await ev(`(() => { const g = window.__game; return JSON.stringify({ who: g.dialogue?.cur?.who, text: g.dialogue?.cur?.text?.slice(0, 24) }); })()`));
await shot('_flow-3-mid-dialogue.png');

// 4) 一路点掉中途对话，让 Boss 出场
for (let i = 0; i < 40; i++) {
  const done = await ev(`(() => { const g = window.__game; if (!g.dialogue?.active) return true; g.dialogue.advance(); return false; })()`);
  await sleep(120);
  if (done) break;
}
await sleep(1400);
console.log('BOSSON', await ev(`(() => { const g = window.__game; const s = g.stage; return JSON.stringify({ st: g.state, boss: s.boss?.key, mid: !!s.boss?.midboss,
  name: s.boss?.def?.name, spell: s.boss?.phaseName, phases: s.boss?.phases?.length, hp: Math.round(s.boss?.maxHp || 0) }); })()`));
await shot('_flow-4-remilia.png');

// 5) 打掉雷米莉亚 → 抓住「MID BOSS CLEAR」横幅那一下
let cleared = false;
for (let i = 0; i < 160; i++) {
  const st = await ev(`(() => {
    const g = window.__game; const s = g.stage; const b = s.boss;
    if (s.midbossDone) return 'done';
    if (!b) return 'noboss';
    if (b.state === 'battle' && !(b.spellLock > 0)) b.damage(b.spellHp + 60);
    return b.state + ':' + b.phase;
  })()`);
  if (st === 'done') { cleared = true; break; }
  await sleep(120);
}
console.log('MIDCLEAR', await ev(`(() => { const g = window.__game; const s = g.stage; return JSON.stringify({
  cleared: ${cleared}, st: g.state, stageSt: s.state, midDone: s.midbossDone,
  extraT: +s.extraT.toFixed(1), boss: !!s.boss, banner: document.getElementById('banner')?.textContent || '' }); })()`));
await shot('_flow-5-midclear.png');

// 6) 认输台词
await sleep(3200);
console.log('MIDOUT', await ev(`(() => { const g = window.__game; return JSON.stringify({ st: g.state, who: g.dialogue?.cur?.who, text: g.dialogue?.cur?.text?.slice(0, 24) }); })()`));
for (let i = 0; i < 3; i++) {
  await ev(`(() => { const g = window.__game; g.dialogue?.advance?.(); return 1; })()`);
  await sleep(450);
}
await shot('_flow-6-midout.png');
for (let i = 0; i < 40; i++) {
  const done = await ev(`(() => { const g = window.__game; if (!g.dialogue?.active) return true; g.dialogue.advance(); return false; })()`);
  await sleep(120);
  if (done) break;
}
await sleep(1200);

// 6) 再往后推一点：确实回到道中（敌机重新刷、scroll 继续走）
await ev(`(() => { const g = window.__game; g.stage.player.invuln = 99999; return 1; })()`);
await sleep(2500);
console.log('BACK', await ev(`(() => { const g = window.__game; const s = g.stage; return JSON.stringify({
  st: g.state, stageSt: s.state, extraT: +s.extraT.toFixed(1), scroll: Math.round(s.stg.scroll),
  waves: s.stg.waveIdx + '/' + s.stg.waves.length }); })()`));
await shot('_flow-7-back.png');

ws.close();
proc.kill();
await sleep(300);
process.exit(0);
