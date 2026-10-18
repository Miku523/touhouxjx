// 地图 / EX 快速验收：关卡长度、崩落砖、游泳、Boss 触发与 EX 数值
// 用法: node tools/_qa_map.mjs [url]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'http://127.0.0.1:8138/index.html';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9372);
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-map-'));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--mute-audio', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
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

let ws, id = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || ''));
  return r.result?.value;
};

const problems = [];
const check = (label, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) problems.push(label);
};

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').split('\n')[0]);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${URL0}?qamap=${Date.now()}` });
  for (let i = 0; i < 80 && !(await ev('!!window.__game')); i++) await sleep(200);
  await sleep(500);

  console.log('[1] 五张平台关长度');
  const stages = await ev(`(async () => {
    const g = window.__game;
    const out = [];
    for (const i of [0,1,2,4,5]) {
      g.startStage(i, { skipIntro: true });
      await new Promise(r => setTimeout(r, 250));
      const lv = g.stage.level;
      const trig = Math.max(200, Math.min(g.stage.goalX - 120, lv.w - 940));
      out.push({ id: lv.id, cols: lv.cols, rows: lv.rows, w: lv.w, sec: Math.round(trig / 380), crumble: lv.crumble.length,
        cp: g.stage.checkpoints.length, enemies: g.stage.enemies.list.length });
    }
    return out;
  })()`);
  for (const s of stages) {
    console.log('   ', JSON.stringify(s));
    check(`${s.id} 长度 >= 3000 列`, s.cols >= 3000, `${s.cols}`);
    check(`${s.id} 纯跑图 >= 5 分钟`, s.sec >= 300, `${s.sec}s`);
    check(`${s.id} 检查点 >= 4`, s.cp >= 4, `${s.cp}`);
    check(`${s.id} 有崩落砖`, s.crumble > 20, `${s.crumble}`);
  }

  console.log('[1b] Stage 4 飞行关');
  await ev(`window.__game.startStage(3, { skipIntro: true })`);
  await sleep(600);
  const stg = await ev(`(() => {
    const st = window.__game.stage;
    return { mode: st.mode, cols: st.level.cols, w: st.level.w, waves: st.stg.waves.length,
      trigger: st.stg.bossTriggerScroll, sec: Math.round(st.stg.bossTriggerScroll / 165) };
  })()`);
  console.log('   ', JSON.stringify(stg));
  check('Stage4 走飞行模式', stg.mode === 'stg');
  check('Stage4 跑图 >= 5 分钟', stg.sec >= 300, `${stg.sec}s`);
  check('Stage4 道中波次足够', stg.waves >= 80, `${stg.waves}`);

  console.log('[2] 崩落砖：踩上去会塌，过几秒复原');
  await ev(`window.__game.startStage(0, { skipIntro: true })`);
  await sleep(500);
  const crumble = await ev(`(async () => {
    const g = window.__game;
    const st = g.stage;
    const c = st.crumbleTiles[0];
    const p = st.player;
    p.x = c.x + 4; p.y = c.y - p.h + 1; p.vx = 0; p.vy = 0; p.onGround = true;
    g.state = 'play'; st.state = 'play';
    const t0 = performance.now();
    let broke = false, restored = false;
    while (performance.now() - t0 < 12000) {
      // 测试窗口里强制保持游戏在 play，否则玩家坠落死亡会让主循环停更关卡
      g.state = 'play'; st.state = 'play';
      await new Promise(r => requestAnimationFrame(r));
      if (st.level.tileAt(c.cx, c.cy) === 0) {
        if (!broke) { broke = true; p.x = -200; p.y = 0; p.vx = 0; p.vy = 0; }
      }
      if (broke && st.level.tileAt(c.cx, c.cy) === 3) { restored = true; break; }
    }
    return { broke, restored, state: c.state, t: +c.t.toFixed(2), tile: st.level.tileAt(c.cx, c.cy), game: g.state };
  })()`);
  console.log('   ', JSON.stringify(crumble));
  check('砖块会塌陷', crumble.broke);
  check('砖块会复原', crumble.restored || crumble.tile === 3);

  console.log('[3] 游泳：水中重力变轻、可以划水');
  await ev(`window.__game.startStage(2, { skipIntro: true })`);
  await sleep(350);
  const swim = await ev(`(async () => {
    const g = window.__game;
    const st = g.stage;
    const lv = st.level;
    let spot = null;
    for (let cy = 0; cy < lv.rows && !spot; cy++) {
      for (let cx = 100; cx < lv.cols - 100; cx++) {
        if (lv.isWaterTile(cx, cy) && lv.isWaterTile(cx, cy + 1)) { spot = { cx, cy }; break; }
      }
    }
    if (!spot) return { noWater: true, stage: lv.id };
    const p = st.player;
    const fake = { axisX: 0, down: () => false, pressed: () => false, released: () => false };
    p.reset(spot.cx * 32 + 6, spot.cy * 32 - 20);
    p.onGround = false;
    const inWater = lv.isInWater(p.x, p.y, p.w, p.h);
    p.vy = 0;
    for (let i = 0; i < 6; i++) p.update(1 / 60, fake);
    const vyWater = p.vy;
    const fakeJump = { axisX: 0, down: () => false, pressed: (k) => k === 'jump', released: () => false };
    p.reset(spot.cx * 32 + 6, spot.cy * 32 - 20);
    p.onGround = false; p.vy = 0; p.swimCd = 0; p.jumpBuffer = 0;
    p.update(1 / 60, fakeJump);
    const stroke = p.vy;
    return { noWater: false, stage: lv.id, inWater, vyWater: +vyWater.toFixed(1), stroke: +stroke.toFixed(1) };
  })()`);
  console.log('   ', JSON.stringify(swim));
  check('能检测到水域', !swim.noWater);
  if (!swim.noWater) {
    check('水中下落明显变慢', swim.vyWater < 120, `${swim.vyWater}`);
    check('划水有向上冲量', swim.stroke < -300, `${swim.stroke}`);
  }

  console.log('[4] Boss 触发与 EX 数值');
  await ev(`(() => { const g = window.__game; g.unlockedExtra = true; g.inExtra = true; g._hidePanel?.(); g._startExtraStage(); })()`);
  await sleep(500);
  const ex = await ev(`(async () => {
    const g = window.__game;
    g.dialogue.stop(); g.state = 'play'; g.stage.state = 'play';
    g.stage.beginBoss();
    const b = g.stage.boss;
    return {
      diff: g.stage.difficulty, extra: g.stage.extra, maxHp: b.maxHp, phases: b.phases ? b.phases.length : 0,
      budget: b.bulletBudget, ring: b.ringLimit, pStart: b.pressureStart, pFloor: b.pressureFloor, wild: b.wildAbort,
      bossHp: b.def.hp,
    };
  })()`);
  console.log('   ', JSON.stringify(ex));
  check('Extra 使用 EX 难度', ex.diff === 'EX', ex.diff);
  check('芙兰有效血量 >= 5 万', ex.maxHp >= 50000, `${ex.maxHp}`);
  check('弹幕预算上调', ex.budget >= 1500, `${ex.budget}`);
  check('环上限放宽', ex.ring >= 64, `${ex.ring}`);
  check('压力下限放宽', ex.pFloor >= 0.6, `${ex.pFloor}`);

  console.log('[4c] EXTRA 开局：零火力 + 锁定解锁时使用的人物');
  const exStart = await ev(`(async () => {
    const g = window.__game;
    g.extraChar = 'marisa';
    g.char = 'reimu';
    g.carryPower = 32;
    g.unlockedExtra = true;
    g._hidePanel?.();
    g.startExtra();
    const atEntry = { char: g.char, carry: g.carryPower, inExtra: g.inExtra };
    g._startExtraStage();            // 等价于开场对话结束后的那一步
    g.state = 'play';
    await new Promise(r => setTimeout(r, 500));
    const st = g.stage;
    st.state = 'play';
    return { atEntry, char: g.char, stageChar: st.char, power: st.player.power, lvl: st.player.fireLevel,
      hudPower: document.getElementById('powerFill')?.getBoundingClientRect().width || 0,
      isExtra: st.extra, diff: st.difficulty, mode: st.mode };
  })()`);
  console.log('   ', JSON.stringify(exStart));
  check('EXTRA 开场就把人物切成解锁时的角色', exStart.atEntry.char === 'marisa', JSON.stringify(exStart.atEntry));
  check('EXTRA 开场火力清零', exStart.atEntry.carry === 0, `${exStart.atEntry.carry}`);
  check('EXTRA 关卡用锁定人物', exStart.stageChar === 'marisa', `${exStart.stageChar}`);
  check('EXTRA 零火力开局', exStart.power === 0 && exStart.lvl === 1, `${exStart.power} / Lv${exStart.lvl}`);
  check('EXTRA 为 stg 且 EX 难度', exStart.isExtra === true && exStart.diff === 'EX' && exStart.mode === 'stg', JSON.stringify(exStart));

  console.log('[4b] EXTRA 时间轴：5:00 雷米莉亚 → 14:00 芙兰');
  await ev(`(() => { const g = window.__game; g.unlockedExtra = true; g.inExtra = true; g._hidePanel?.(); g._startExtraStage(); })()`);
  await sleep(500);
  const exFlow = await ev(`(async () => {
    const g = window.__game;
    g.dialogue?.stop?.(); g.state = 'play';
    const st = g.stage;
    st.state = 'play';
    const w = st.level.w, waves = st.stg.waves.length, trigger = st.stg.bossTriggerScroll;
    // 道中计时正常推进
    const e0 = st.extraT;
    await new Promise(r => setTimeout(r, 700));
    const e1 = st.extraT;
    // 拨到 5:00 前一帧，等时间轴放雷米莉亚；对白逐句点掉，直到 Boss 开战
    st.extraT = 299.4;
    for (let i = 0; i < 500 && !st.boss; i++) {
      if (g.dialogue?.active) g.dialogue.advance();
      await new Promise(r => setTimeout(r, 25));
    }
    const mid = st.boss ? { key: st.boss.key, mid: st.bossMid, hp: st.boss.maxHp, phases: st.boss.phases.length } : null;
    // Boss 战期间 extraT 必须暂停
    const e2 = st.extraT;
    await new Promise(r => setTimeout(r, 600));
    const e3 = st.extraT;
    // 直接击破中途 Boss → 回道中
    if (st.boss) st.boss.state = 'dead';
    for (let i = 0; i < 80 && !st.midbossDone; i++) await new Promise(r => setTimeout(r, 50));
    const afterMid = { done: st.midbossDone, boss: !!st.boss, state: st.state };
    // 拨到终盘时刻（14:00）
    st.extraT = 839.4;
    for (let i = 0; i < 240 && !(st.boss && st.boss.key === 'flandre'); i++) {
      if (g.dialogue?.active) g.dialogue.advance();
      await new Promise(r => setTimeout(r, 25));
    }
    const final = st.boss ? { key: st.boss.key, mid: st.bossMid, hp: st.boss.maxHp, phases: st.boss.phases.length } : null;
    return { w, waves, trigger, sec: Math.round(trigger / 165), tick: +(e1 - e0).toFixed(2), mid, frozen: +(e3 - e2).toFixed(2), afterMid, final };
  })()`);
  console.log('   ', JSON.stringify(exFlow));
  check('Extra 道中滚动长度 >= 14 分钟', exFlow.sec >= 850, `${exFlow.sec}s`);
  check('Extra 道中波次 >= 250', exFlow.waves >= 250, `${exFlow.waves}`);
  check('道中计时正常推进', exFlow.tick > 0.4 && exFlow.tick < 1.2, `${exFlow.tick}s`);
  check('5:00 出现雷米莉亚', exFlow.mid?.key === 'remilia' && exFlow.mid?.mid === true, JSON.stringify(exFlow.mid));
  check('雷米莉亚只有 2 张符卡', exFlow.mid?.phases === 2, `${exFlow.mid?.phases}`);
  check('中途 Boss 血量按 EX 放大', (exFlow.mid?.hp || 0) >= 9000, `${exFlow.mid?.hp}`);
  check('Boss 战期间道中计时暂停', exFlow.frozen < 0.15, `${exFlow.frozen}s`);
  check('击破中途 Boss 后回道中', exFlow.afterMid.done === true && exFlow.afterMid.boss === false && exFlow.afterMid.state === 'play');
  check('终盘为芙兰朵露', exFlow.final?.key === 'flandre' && exFlow.final?.mid === false, JSON.stringify(exFlow.final));
  check('终盘芙兰 EX 血量', (exFlow.final?.hp || 0) >= 50000, `${exFlow.final?.hp}`);

  console.log('[4d] EXTRA 中途失败再战：直接回到芙兰');
  const exRetry = await ev(`(async () => {
    const g = window.__game;
    const st = g.stage;
    st.midbossDone = true;
    if (st.boss) st.boss.state = 'dead';
    await new Promise(r => setTimeout(r, 300));
    g._onGameOver();
    await new Promise(r => setTimeout(r, 200));
    g._retryStage();
    g.dialogue?.stop?.();
    g.state = 'play'; if (g.stage) g.stage.state = 'play';
    await new Promise(r => setTimeout(r, 500));
    const s2 = g.stage;
    return { midDone: s2.midbossDone, extraT: Math.round(s2.extraT), boss: s2.boss ? s2.boss.key : null,
      power: s2.player.power };
  })()`);
  console.log('   ', JSON.stringify(exRetry));
  check('再战直接回到中途 Boss 之后', exRetry.midDone === true && exRetry.extraT >= 830, JSON.stringify(exRetry));
  check('再战仍是芙兰', exRetry.boss === 'flandre', `${exRetry.boss}`);
  check('再战火力不从零开始', exRetry.power >= 90, `${exRetry.power}`);

  console.log('[4e] EXTRA 中途 Boss 战里失败：从 5:00 的雷米莉亚接上');
  const exRetryMid = await ev(`(async () => {
    const g = window.__game;
    g._startExtraStage();
    g.dialogue?.stop?.();
    g.state = 'play'; g.stage.state = 'play';
    const st = g.stage;
    st.extraT = 300; st.midbossDone = false;
    st.pendingBossKey = 'remilia'; st.pendingBossMid = true;
    st.beginBoss();
    await new Promise(r => setTimeout(r, 400));
    g._onGameOver();
    await new Promise(r => setTimeout(r, 200));
    g._retryStage();
    g.dialogue?.stop?.();
    g.state = 'play'; if (g.stage) g.stage.state = 'play';
    await new Promise(r => setTimeout(r, 700));
    const s2 = g.stage;
    return { midDone: s2.midbossDone, extraT: Math.round(s2.extraT),
      boss: s2.boss ? s2.boss.key : null, power: s2.player.power, scroll: Math.round(s2.stg.scroll) };
  })()`);
  console.log('   ', JSON.stringify(exRetryMid));
  check('中途失败再战回到雷米莉亚', exRetryMid.boss === 'remilia' && exRetryMid.midDone === false, JSON.stringify(exRetryMid));
  check('中途失败再战从 5:00 接上', exRetryMid.extraT >= 295 && exRetryMid.extraT <= 315, `${exRetryMid.extraT}`);
  check('中途失败再战火力兜底', exRetryMid.power >= 90, `${exRetryMid.power}`);

  console.log('[5] 重开丢 HUD 回归');
  await ev(`(() => { window.__game.inExtra = false; window.__game.carryPower = 32; window.__game.extraChar = null; return 1; })()`);
  await ev(`window.__game.startStage(0, { skipIntro: true })`);
  await sleep(600);
  await ev(`window.__game._onGameOver()`);
  await sleep(400);
  await ev(`window.__game._retryStage()`);
  await sleep(800);
  const hud = await ev(`(() => {
    const el = document.getElementById('hud');
    const fill = document.getElementById('powerFill');
    return { cls: el.className, display: getComputedStyle(el).display,
      powerW: Math.round(fill.getBoundingClientRect().width), timer: document.getElementById('timer').textContent };
  })()`);
  console.log('   ', JSON.stringify(hud));
  check('重开后 HUD 容器可见', hud.display !== 'none' && !/hidden/.test(hud.cls), JSON.stringify(hud));
  check('重开后 POWER 条有宽度', hud.powerW > 10, `${hud.powerW}px`);
  check('重开后计时归零', hud.timer === '0:00', hud.timer);

  console.log('[5] JS 异常');
  check('无未捕获异常', errors.length === 0, errors.slice(0, 4).join(' | '));

  console.log(problems.length ? `\n${problems.length} 项失败: ${problems.join('; ')}` : '\n地图/EX 检查通过 ✓');
  process.exitCode = problems.length ? 1 : 0;
} catch (e) {
  console.error('PROBE ERROR', e);
  process.exitCode = 1;
} finally {
  try { ws && ws.close(); } catch {}
  try { proc.kill(); } catch {}
}
