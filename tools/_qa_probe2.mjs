// 立绘/音效二次诊断：Boss 战前对话截图 + 真实拾取/命中链路
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9364);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-qa2-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
async function target() {
  for (let i = 0; i < 100; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = list.find((t) => t.type === 'page'); if (p) return p; } catch {}
    await sleep(200);
  }
  throw new Error('no target');
}
let ws, id = 0; const pending = new Map(); const errors = [];
function send(method, params = {}) { return new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); }); }
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
const shot = async (f) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(f, Buffer.from(r.data, 'base64')); };
try {
  const page = await target(); ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}?qa2=${Date.now()}` });
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(100); }
  await sleep(1200);
  await ev(`(() => {
    const g = window.__game;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    window.__audioLog = [];
    const orig = g.audio.play.bind(g.audio);
    g.audio.play = (n, o) => { window.__audioLog.push(n); return orig(n, o); };
    window.dispatchEvent(new PointerEvent('pointerdown')); g.audio.unlock();
    g._onBossTrigger();
    return g.state;
  })()`);
  await sleep(900);
  await shot('_qa_bossdlg1.png');
  // 保持对话 18 秒，等 AI 立绘空闲加载后看是否重绘切换
  await sleep(18000);
  await shot('_qa_bossdlg1b.png');
  console.log('DLG1', await ev(`JSON.stringify({ state: window.__game.state, active: window.__game.dialogue.active, who: window.__game.dialogue.current?.who, speaker: window.__game.dialogue.current?.speaker, idx: window.__game.dialogue.index, leftChar: window.__game.dialogue.leftChar, rightChar: window.__game.dialogue.rightChar, pl: window.__game.dialogue.portraitL ? 'yes' : null })`));
  // 推进到有立绘的角色台词
  for (let k = 0; k < 8; k++) {
    await ev(`window.__game.dialogue.advance()`);
    await sleep(350);
    const st = await ev(`JSON.stringify({ who: window.__game.dialogue.current?.who, sp: window.__game.dialogue.current?.speaker, txt: (window.__game.dialogue.current?.text||'').slice(0,16) })`);
    console.log('STEP', k, st);
    const j = JSON.parse(st);
    if (j.who === 'left' || j.who === 'right' || j.who === 'player') { await shot('_qa_bossdlg_char.png'); break; }
  }

  // ---- 真实金币拾取：把玩家挪到第一枚金币上并跑一帧 ----
  const coin = await ev(`(() => {
    const g = window.__game, s = g.stage;
    // 重新开一关，避免刚才 Boss 触发影响
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play';
    const it = g.stage.pickups.find(p => p.kind === 'coin');
    if (!it) return { err: 'no coin' };
    const p = g.stage.player;
    p.x = it.x - p.w/2; p.y = it.y - p.h/2;
    g.stage._updatePickups(1/60, p);
    return { taken: it.taken, log: window.__audioLog.slice(-5), ev: !!g.stage };
  })()`);
  console.log('COIN_PICKUP', JSON.stringify(coin));

  // ---- 真实子弹命中敌人：生成敌人 / 直接调用 damageWithShots ----
  const enemy = await ev(`(() => {
    const g = window.__game, s = g.stage;
    const list = s.enemies?.list || [];
    const e = list.find(x => x.alive);
    if (!e) return { err: 'no enemy', n: list.length };
    // 把一颗子弹放在敌人身上
    s.shots.fire(e.x + e.w/2 - 40, e.y + e.h/2, 1, 'reimu', 1, 0);
    s.shots.update(1/60, { w: s.level.w, h: s.level.h });
    const before = e.hp;
    s.enemies.damageWithShots(s.shots, s.fx, { onKill: () => {} });
    return { n: list.length, before, after: e.hp, log: window.__audioLog.slice(-5) };
  })()`);
  console.log('ENEMY_HIT', JSON.stringify(enemy));
  console.log('ERRORS', JSON.stringify(errors));
} finally { try { ws?.close(); } catch {} try { proc.kill(); } catch {} await sleep(300); process.exit(0); }
