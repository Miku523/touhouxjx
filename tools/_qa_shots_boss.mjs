// Boss 命中验收：穿透弹对 Boss 只结算一次；STG 模式追踪也生效
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9375);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-bossshot-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${profile}`, '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
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
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));

try {
  const page = await target(); ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: `${URL0}?qaboss=${Date.now()}` });
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(100); }
  await sleep(900);

  // 平台关 Boss：一条穿透弹从 Boss 体内横穿，只应结算一次
  out('PLAT_BOSS', await ev(`(() => {
    const g = window.__game;
    g.char = 'marisa'; g.difficulty = 'N'; g.inExtra = false;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play';
    const s = g.stage;
    s.beginBoss();
    const b = s.boss;
    if (!b) return JSON.stringify({ err: 'no boss' });
    b.state = 'battle'; b.alpha = 1; b.spellLock = 0;
    const shots = s.shots;
    s.player.shootCd = 0;
    shots.clear();
    // 手动放一颗魔理沙弹在 Boss 左侧，速度向右，穿过整个命中体
    shots.fire(b.x - 120, b.y - b.h * 0.39, 1, 'marisa', 1, 0);
    const bb = shots.pool.find(x => x.active);
    bb.x = b.x - 120; bb.y = b.y - b.h * 0.39;
    const hp0 = b.hp;
    const seen = [];
    for (let i = 0; i < 24; i++) {
      shots.update(1/60, { w: s.level.w, h: s.level.h }, s._shotTargets());
      b.damageWithShots(shots, s.fx, () => {});
      seen.push(+b.hp.toFixed(2));
    }
    return JSON.stringify({ hp0, hp1: +b.hp.toFixed(2), delta: +(hp0 - b.hp).toFixed(2), bulletAlive: bb.active, trail: seen.filter((v, i) => i < 3 || v !== seen[i-1]).slice(0, 6) });
  })()`));

  // 灵梦在 STG 模式：追踪目标来自 stg.enemies / boss，弹道必须真拐弯
  out('STG_HOMING', await ev(`(() => {
    const g = window.__game;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false;
    const all = g._mainStages();
    const idx = Math.max(0, all.findIndex(d => d.mode === 'stg'));
    g._createStage(all[idx], idx, false, { skipIntro: true });
    g.state = 'play';
    const s = g.stage;
    // 跑一段时间让道中波次生成
    const stub = { axisX: 0, down: () => false, pressed: () => false, released: () => false };
    for (let i = 0; i < 240 && !(s.stg?.enemies || []).some(x => x.alive); i++) s.update(1/60, stub);
    const list = (s.stg?.enemies) || [];
    const e = list.find(x => x.alive);
    if (!e) return JSON.stringify({ err: 'no stg enemy', n: list.length });
    const p = s.player;
    p.worldX = e.x - 300; p.worldY = e.y + 200; p.facing = 1;
    s.shots.clear();
    s._tryShoot(null);
    const before = s.shots.pool.filter(x => x.active).map(x => ({ vx: +x.vx.toFixed(0), vy: +x.vy.toFixed(0) }));
    for (let i = 0; i < 24; i++) s.shots.update(1/60, { w: s.level.w, h: s.level.h }, s._shotTargets());
    const after = s.shots.pool.filter(x => x.active).map(x => ({ vx: +x.vx.toFixed(0), vy: +x.vy.toFixed(0) }));
    // 敌人在右上方 → 至少有一发的 vy 明显变化（另一发可能锁到别的敌人）
    const hung = after.map(v => Math.abs(v.vy) > 120);
    return JSON.stringify({ mode: s.mode, targetCount: s._shotTargets().length, before, after, turned: hung.some(Boolean), flags: hung });
  })()`));

  out('ERRORS', errors);
} finally { try { ws?.close(); } catch {} try { proc.kill(); } catch {} await sleep(300); process.exit(0); }
