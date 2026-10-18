// 自机弹道验收：灵梦追踪 / 魔理沙扩散穿透双倍伤害
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8137/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9371);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-shots-'));
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
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));

try {
  const page = await target(); ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}?qashots=${Date.now()}` });
  for (let i = 0; i < 80; i++) { if (await ev('!!window.__game')) break; await sleep(100); }
  await sleep(900);

  // 单元级：直接驱动 PlayerShots
  out('UNIT', await ev(`(async () => {
    const { PlayerShots } = await import('./src/game/playerShots.js');
    const step = (s, targets, n = 30) => { for (let i = 0; i < n; i++) s.update(1/60, { w: 1280, h: 720 }, targets); };
    const active = (s) => s.pool.filter(b => b.active);
    const r = {};

    // ① 灵梦追踪：目标在右上方，子弹转向后 vy 必须变负（朝上拐）
    const s1 = new PlayerShots();
    s1.fire(100, 400, 1, 'reimu', 1, 0);
    const tgt = { x: 520, y: 120 };
    step(s1, [{ ref: tgt, x: tgt.x, y: tgt.y }], 24);
    const b1 = active(s1)[0];
    r.reimuHoming = { vy: +b1.vy.toFixed(1), vx: +b1.vx.toFixed(1), y: +b1.y.toFixed(1), turnedUp: b1.vy < -60 };

    // ② 灵梦无目标：直线飞行
    const s2 = new PlayerShots();
    s2.fire(100, 400, 1, 'reimu', 1, 0);
    step(s2, [], 24);
    const b2 = active(s2)[0];
    r.reimuStraight = { vy: +b2.vy.toFixed(2), straight: Math.abs(b2.vy) < 1 };

    // ③ 魔理沙不追踪：同样有目标也必须保持直线
    const s3 = new PlayerShots();
    s3.fire(100, 400, 1, 'marisa', 1, 0);
    step(s3, [{ ref: tgt, x: tgt.x, y: tgt.y }], 24);
    const b3 = active(s3)[0];
    r.marisaNoHoming = { vy: +b3.vy.toFixed(2), straight: Math.abs(b3.vy) < 1, homing: b3.homing, pierce: b3.pierce };

    // ④ 伤害：魔理沙单发 = 灵梦 × 2
    const a = active((() => { const s = new PlayerShots(); s.fire(0, 0, 1, 'reimu', 1, 0); return s; })())[0];
    const m = active((() => { const s = new PlayerShots(); s.fire(0, 0, 1, 'marisa', 1, 0); return s; })())[0];
    r.damage = { reimu: a.damage, marisa: m.damage, ratio: +(m.damage / a.damage).toFixed(3) };

    // ⑤ 穿透：一条弹打穿两个目标，两个都掉血且弹还活着；回头再打同一目标不重复结算
    const s5 = new PlayerShots();
    s5.fire(100, 400, 1, 'marisa', 1, 0);
    const eA = { hp: 100 }, eB = { hp: 100 };
    const bb = active(s5)[0];
    bb.x = 355; bb.y = 400;
    const dmgLog = [];
    s5.hitRect(330, 390, 30, 30, (d, x, y) => { eA.hp -= d; dmgLog.push('A'); }, eA);
    s5.hitRect(340, 390, 30, 30, (d, x, y) => { eB.hp -= d; dmgLog.push('B'); }, eB);
    s5.hitRect(330, 390, 30, 30, (d) => { eA.hp -= d; dmgLog.push('A2'); }, eA);
    r.pierce = { aHp: +eA.hp.toFixed(2), bHp: +eB.hp.toFixed(2), alive: bb.active, log: dmgLog };

    // ⑥ 灵梦不穿透：命中即消失
    const s6 = new PlayerShots();
    s6.fire(100, 400, 1, 'reimu', 1, 0);
    const rb = active(s6)[0];
    rb.x = 300; rb.y = 400;
    const eC = { hp: 100 };
    const hit = s6.hitRect(290, 390, 30, 30, (d) => { eC.hp -= d; }, eC);
    r.reimuConsume = { hit, alive: rb.active, hp: +eC.hp.toFixed(2) };

    // ⑦ 扩散：同一等级、同等条件下魔理沙的扇形比灵梦宽
    const spread = (char) => {
      const s = new PlayerShots();
      s.fire(100, 400, 1, char, 4, 0);
      return active(s).map(b => Math.atan2(b.vy, b.vx));
    };
    const fan = (arr) => +(Math.max(...arr) - Math.min(...arr)).toFixed(4);
    const fr = fan(spread('reimu')), fm = fan(spread('marisa'));
    r.fan = { reimu: fr, marisa: fm, wider: fm > fr * 1.5 };

    return JSON.stringify(r);
  })()`));

  // 集成级：真关卡里开火，确认灵梦弹确实朝最近的敌人拐，且无异常
  out('LIVE', await ev(`(() => {
    const g = window.__game;
    g.char = 'reimu'; g.difficulty = 'N'; g.inExtra = false;
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play';
    const s = g.stage;
    // 造一个固定目标
    const e = s.enemies.list.find(x => x.alive) || s.enemies.list[0];
    if (!e) return JSON.stringify({ err: 'no enemy' });
    const p = s.player;
    p.x = e.x - 260; p.y = e.y + 180;
    s.shots.clear();
    s._tryShoot(null);
    const before = s.shots.pool.filter(b => b.active).map(b => ({ vx: +b.vx.toFixed(1), vy: +b.vy.toFixed(1) }));
    for (let i = 0; i < 20; i++) { s.shots.update(1/60, { w: s.level.w, h: s.level.h }, s._shotTargets()); }
    const after = s.shots.pool.filter(b => b.active).map(b => ({ vx: +b.vx.toFixed(1), vy: +b.vy.toFixed(1) }));
    return JSON.stringify({ enemyHp: e.hp, before, after, target: s._shotTargets().length });
  })()`));

  // 截图：在关卡里连打几帧看渲染
  await ev(`(() => {
    const g = window.__game, s = g.stage;
    g.char = 'marisa';
    g._createStage(g._mainStages()[0], 0, false, { skipIntro: true });
    g.state = 'play';
    const s2 = g.stage, p = s2.player;
    const e = s2.enemies.list.find(x => x.alive);
    if (e) { p.x = e.x - 300; p.y = e.y - 60; }
    for (let i = 0; i < 6; i++) { s2._tryShoot(null); s2.player.shootCd = 0; s2.update(1/60, null); }
    return 'ok';
  })()`);
  await sleep(300);
  await shot('_qa_shots_marisa.png');

  out('ERRORS', errors);
} finally { try { ws?.close(); } catch {} try { proc.kill(); } catch {} await sleep(300); process.exit(0); }
