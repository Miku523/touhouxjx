// Boss 场地锁验证：1–6 面开战后自机不能退回道中。
//
// 覆盖面：
//   ① 平台关（1/2/3/5/6 面）：beginBoss 后自机被钳在 level.bossArena 内，
//      顶着左边界跑 4 秒也出不去；被击退/瞬移到场地外会被拉回来；
//      复活 / 读档重试用的检查点若留在场地外，复活后人在场地内；
//   ② 5 面妖梦：levegen 舞台（level.midbossArena）左右两侧都锁；击破后结界消失，能走下缓坡；
//      之后打幽幽子重新锁回关底场地（从道中出生点直接 beginBoss 也要被拉进场地）；
//   ③ 4 面（飞行关）：滚动条在 Boss 战冻结，自机世界坐标回不到道中（本来就满足）。
//
// 用法:
//   PT_BASE=http://127.0.0.1:8141 node tools/_verify_boss_arena.mjs [--port 9413] [--keep 1]
//
// 画面证据（结界光幕）落在 _pt/boss_arena/*.png；JSON 报告落在 _pt/boss_arena/report.json。

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './_pt_core.mjs';

const argv = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(args[i]);
  if (!m) continue;
  // 支持 --port 9413 与 --port=9413 两种写法
  argv[m[1]] = m[2] !== undefined ? m[2] : (args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : '1');
}
const PORT = Number(argv.port || 9413);
const SHOT_DIR = '_pt/boss_arena';
const TILE = 32;

const T = await launch({ port: PORT });
const fails = [];
const passes = [];

const ok = (cond, label, detail = '') => {
  if (cond) {
    passes.push(label);
    return true;
  }
  fails.push({ label, detail });
  console.log('FAIL ' + label + (detail ? ' :: ' + detail : ''));
  return false;
};
const near = (a, b, eps = 1.5) => Math.abs(a - b) <= eps;
const j = JSON.parse;

/** 从标题直接进第 index 面（0-based），并跳掉开场对话 */
async function bootStage(index) {
  await T.boot({ query: `?arena=${Date.now()}&s=${index}`, waitTitle: false });
  const r = await T.eval(`(() => {
    const g = window.__game;
    g.difficulty = 'N'; g.char = 'reimu'; g.carryPower = 128; g.musicOn = false;
    g.startStage(${index});
    return g.stage ? 'ok' : 'no-stage';
  })()`);
  if (r !== 'ok') throw new Error(`stage ${index + 1} 没建起来`);
  await T.sleep(120);
}

/**
 * 进入 Boss 战。setup 是插在页面里的语句（设自机位置 + 调 beginBoss）。
 * 自机统一给无敌 + 满残机：验证的是「锁区」而不是打法。
 */
async function startBoss(setup) {
  return j(await T.eval(`(() => {
    const g = window.__game;
    try { g.dialogue?.stop?.(); } catch (e) {}
    g.state = 'play';
    g._skipBeats = true; // 道中剧情节点会让 main 把 state 冻在 dialogue，验证时整段跳掉
    const s = g.stage;
    s.state = 'play';
    s.skipBossDialogue = true; // Boss 战前后对话整段跳过：验证锁区不需要过剧情
    const p = s.player;
    p.alive = true; p.hearts = 999; p.invuln = 9999; p.vy = 0;
    ${setup}
    document.getElementById('overlay')?.classList.add('hidden');
    document.getElementById('dialogue')?.classList.add('hidden');
    return JSON.stringify({
      mode: s.mode, w: s.level.w, h: s.level.h,
      arena: s._bossArena, bossArena: s.level.bossArena, midArena: s.level.midbossArena,
      px: +(Number.isFinite(p.x) ? p.x : p.worldX).toFixed(1),
      cpX: +(Number.isFinite(p.checkpoint && p.checkpoint.x) ? p.checkpoint.x : 0).toFixed(1),
      boss: s.boss ? s.boss.key : null, bossX: s.boss ? Math.round(s.boss.x) : null, st: s.state,
    });
  })()`));
}

/** 按住方向键跑 frames 个逻辑帧（headless 的 rAF 会被节流，所以手动步进） */
async function drive(dir, frames) {
  const code = dir === 'left' ? 'ArrowLeft' : 'ArrowRight';
  if (dir) await T.keyDown(code);
  const raw = await T.eval(`(() => {
    const g = window.__game, s = g.stage, p = s.player;
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < ${frames}; i++) {
      g.update(1 / 60);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
    }
    g.render(0);
    return JSON.stringify({
      x: +p.x.toFixed(1), y: +p.y.toFixed(1), minX: +minX.toFixed(1), maxX: +maxX.toFixed(1),
      st: s.state, boss: s.boss ? s.boss.key : null, arena: s._bossArena,
      cpX: +p.checkpoint.x.toFixed(1), alive: !!p.alive,
    });
  })()`);
  if (dir) await T.keyUp(code);
  return j(raw);
}

/** 飞行关的版本：StgPlayer 没有 x，读 worldX = scroll + sx */
async function driveStg(frames) {
  await T.keyDown('ArrowLeft');
  const raw = await T.eval(`(() => {
    const g = window.__game, s = g.stage, p = s.player;
    let minWX = Infinity;
    for (let i = 0; i < ${frames}; i++) {
      g.update(1 / 60);
      if (p.worldX < minWX) minWX = p.worldX;
    }
    g.render(0);
    return JSON.stringify({ scroll: +s.stg.scroll.toFixed(1), wx: +p.worldX.toFixed(1), minWX: +minWX.toFixed(1) });
  })()`);
  await T.keyUp('ArrowLeft');
  return j(raw);
}

/* ---------------- ① 平台关：关底场地 ---------------- */

const PLATFORM_STAGES = [
  { index: 0, name: 'STAGE 1', key: 'rumia' },
  { index: 1, name: 'STAGE 2', key: 'wriggle' },
  { index: 2, name: 'STAGE 3', key: 'cirno' },
  { index: 4, name: 'STAGE 5', key: 'yuyuko' },
  { index: 5, name: 'STAGE 6', key: 'kaguya' },
];

const arenaReport = {};

for (const st of PLATFORM_STAGES) {
  await bootStage(st.index);
  const entered = await startBoss(`p.x = s.level.w - 900; p.y = s.level.h - 200; s.beginBoss();`);
  arenaReport[st.name] = entered;

  const wantLeft = entered.w - 50 * TILE; // levelgen.BOSS_ARENA_COLS
  ok(entered.arena && entered.arena.left === wantLeft && entered.arena.right === entered.w,
    `${st.name} 关底场地 = 最后 50 列平地`, JSON.stringify(entered.arena));
  ok(entered.boss === st.key, `${st.name} Boss 正常登场`, `boss=${entered.boss}`);
  ok(entered.st === 'boss', `${st.name} 进入 Boss 战状态`, `state=${entered.st}`);

  // 顶左边界跑 4 秒
  const left = await drive('left', 240);
  ok(near(left.x, entered.arena.left) && left.minX >= entered.arena.left - 0.5,
    `${st.name} 往左跑被锁在场地内`, `x=${left.x} min=${left.minX} left=${entered.arena.left}`);
  ok(left.st === 'boss' && left.boss === st.key, `${st.name} 锁区期间 Boss 战仍在进行`,
    `state=${left.st} boss=${left.boss}`);

  // 被击退 / 瞬移出界：一帧内拉回
  const kicked = j(await T.eval(`(() => {
    const g = window.__game, s = g.stage, p = s.player;
    p.x = ${entered.arena.left} - 400; p.vx = -400;
    g.update(1 / 60);
    return JSON.stringify({ x: +p.x.toFixed(1), vx: +p.vx.toFixed(1) });
  })()`));
  ok(kicked.x >= entered.arena.left - 0.5,
    `${st.name} 出界后被拉回场地`, `x=${kicked.x} left=${entered.arena.left}`);

  // 旧检查点在场外 + 落命复活：人必须回到场地里
  const rs = j(await T.eval(`(() => {
    const g = window.__game, s = g.stage, p = s.player;
    p.x = s.level.bossArena.left - 500; p.y = 200; p.checkpoint = { x: p.x, y: p.y };
    p.lives = 3; p.alive = false; s.state = 'dead';
    s._respawn();
    return JSON.stringify({ alive: !!p.alive, x: +p.x.toFixed(1), cpX: +p.checkpoint.x.toFixed(1), st: s.state });
  })()`));
  ok(rs.alive && rs.x >= entered.arena.left - 0.5 && rs.cpX >= entered.arena.left - 0.5,
    `${st.name} 复活后人在场地内（检查点同步）`,
    `alive=${rs.alive} x=${rs.x} cpX=${rs.cpX} left=${entered.arena.left}`);

  // 结界光幕的画面证据（只在第一面存一张，够看效果）
  if (st.index === 0) {
    await T.eval(`(() => {
      const g = window.__game, s = g.stage, p = s.player;
      // 临时收起 Boss：否则镜头按「玩家与 Boss 的中点」取景，边界光幕会跑出画面
      s.boss = null;
      p.x = s._bossArena.left; p.vx = 0;
      s.camera.snapTo(p.x + p.w / 2);
      document.getElementById('boot')?.classList.add('hidden');
      document.getElementById('overlay')?.classList.add('hidden');
      g.render(0);
    })()`);
    await T.sleep(150);
    await T.shot(`${SHOT_DIR}/stage1_wall.png`);
  }
}

/* ---------------- ①b 读档重试（resumeBoss）：旧检查点在道中 ---------------- */

await bootStage(1);
const resumed = j(await T.eval(`(() => {
  const g = window.__game;
  g._skipBeats = true;
  // 模拟「回到 Boss 前」的续命：检查点还在道中，Boss 直接登场
  g.startStage(1, {
    resumeBoss: true,
    checkpoint: { x: 300, y: 200 },
    bossKey: 'wriggle',
    bossMid: false,
    midbossDone: false,
  });
  const s = g.stage, p = s.player;
  s.skipBossDialogue = true;
  g.state = 'play';
  document.getElementById('boot')?.classList.add('hidden');
  return JSON.stringify({
    arena: s._bossArena, px: +p.x.toFixed(1), cpX: +p.checkpoint.x.toFixed(1),
    boss: s.boss ? s.boss.key : null, st: s.state, alive: !!p.alive,
  });
})()`));
ok(resumed.boss === 'wriggle' && resumed.st === 'boss',
  '读档重试：Boss 直接登场', `boss=${resumed.boss} state=${resumed.st}`);
ok(resumed.alive && resumed.arena && resumed.px >= resumed.arena.left - 0.5
  && resumed.cpX >= resumed.arena.left - 0.5,
  '读档重试：道中检查点被拉进 Boss 场地并同步',
  `px=${resumed.px} cpX=${resumed.cpX} left=${resumed.arena && resumed.arena.left}`);
const resumedLeft = await drive('left', 240);
ok(resumedLeft.minX >= resumed.arena.left - 0.5, '读档重试后仍然锁得住',
  `x=${resumedLeft.x} min=${resumedLeft.minX}`);

/* ---------------- ② STAGE 5：妖梦舞台 + 幽幽子 ---------------- */

await bootStage(4);
const mid = await startBoss(`
  p.x = s.level.midbossArena.left + 400; p.y = s.level.h - 200;
  s.beginBoss('youmu', { midboss: true });
`);
arenaReport['STAGE 5 妖梦'] = mid;
ok(mid.arena && mid.arena.left === 36 * TILE && mid.arena.right === 92 * TILE,
  'STAGE 5 妖梦舞台 = 第 36–92 列', JSON.stringify(mid.arena));
ok(mid.arena && mid.arena.left === mid.midArena.left && mid.arena.right === mid.midArena.right,
  'STAGE 5 妖梦锁区用的是 levelgen 报的舞台', JSON.stringify(mid.midArena));
ok(mid.boss === 'youmu', 'STAGE 5 妖梦正常登场', `boss=${mid.boss}`);

const toLeft = await drive('left', 300);
ok(near(toLeft.x, mid.arena.left) && toLeft.minX >= mid.arena.left - 0.5,
  'STAGE 5 妖梦舞台左边界锁住', `x=${toLeft.x} min=${toLeft.minX} left=${mid.arena.left}`);
const toRight = await drive('right', 320);
const maxRight = mid.arena.right - 28; // 自机宽 28
ok(near(toRight.x, maxRight) && toRight.maxX <= maxRight + 0.5,
  'STAGE 5 妖梦舞台右边界锁住（下不了出口缓坡）', `x=${toRight.x} max=${toRight.maxX} want=${maxRight}`);

// 右侧结界光幕的画面证据（暂时收起 Boss 让镜头对准边界，拍完放回去）
const midBoss = await T.eval(`(() => {
  const g = window.__game, s = g.stage, p = s.player;
  const bk = s.boss;
  s.boss = null;
  p.x = s._bossArena.right - p.w; p.vx = 0;
  s.camera.snapTo(p.x + p.w / 2);
  document.getElementById('boot')?.classList.add('hidden');
  g.render(0);
  window.__midBossBackup = bk;
  return 'ok';
})()`);
await T.sleep(150);
await T.shot(`${SHOT_DIR}/stage5_mid_wall.png`);
await T.eval(`(() => { const s = window.__game.stage; s.boss = window.__midBossBackup; window.__midBossBackup = null; return 'ok'; })()`);

// 击破妖梦 → 结界消失 → 能走回左侧准备区
// （击破会排一段战后对话，main 会把 state 切到 dialogue 冻结关卡，这里关掉）
const afterMid = j(await T.eval(`(() => {
  const g = window.__game, s = g.stage;
  s._onMidbossDefeated();
  try { g.dialogue?.stop?.(); g.dialogue?.close?.(); } catch (e) {}
  g.state = 'play'; s.state = 'play';
  s.skipBossDialogue = true;
  s.player.x = 1600; s.player.y = s.level.h - 200;
  return JSON.stringify({ arena: s._bossArena, st: s.state, gst: g.state, dlg: !!(g.dialogue && g.dialogue.active), boss: s.boss ? s.boss.key : null });
})()`));
ok(afterMid.arena === null, 'STAGE 5 妖梦击破后结界消失', `arena=${JSON.stringify(afterMid.arena)}`);
ok(afterMid.dlg === false && afterMid.gst === 'play', 'STAGE 5 妖梦击破后关卡恢复可操作',
  `gst=${afterMid.gst} dialogue=${afterMid.dlg}`);
const escaped = await drive('left', 240);
ok(escaped.x < mid.arena.left - 200,
  'STAGE 5 妖梦击破后能回到左侧准备区', `x=${escaped.x} left=${mid.arena.left}`);

// 之后打幽幽子：从道中位置直接 beginBoss，要被拉进关底场地
const final5 = j(await T.eval(`(() => {
  const g = window.__game, s = g.stage, p = s.player;
  try { g.dialogue?.stop?.(); g.dialogue?.close?.(); } catch (e) {}
  g.state = 'play'; s.state = 'play';
  p.alive = true; p.invuln = 9999;
  s.beginBoss();
  return JSON.stringify({
    arena: s._bossArena, px: +p.x.toFixed(1), cpX: +p.checkpoint.x.toFixed(1),
    boss: s.boss ? s.boss.key : null, bossArena: s.level.bossArena,
  });
})()`));
arenaReport['STAGE 5 幽幽子'] = final5;
ok(final5.boss === 'yuyuko' && final5.arena && final5.arena.left === final5.bossArena.left,
  'STAGE 5 幽幽子用关底场地', `arena=${JSON.stringify(final5.arena)}`);
ok(final5.px >= final5.bossArena.left - 0.5 && final5.cpX >= final5.bossArena.left - 0.5,
  'STAGE 5 幽幽子开战时从道中拉进场地（检查点同步）',
  `px=${final5.px} cpX=${final5.cpX} left=${final5.bossArena.left}`);
const finalLeft = await drive('left', 300);
ok(near(finalLeft.x, final5.bossArena.left) && finalLeft.minX >= final5.bossArena.left - 0.5,
  'STAGE 5 幽幽子场地左边界锁住', `x=${finalLeft.x} min=${finalLeft.minX}`);

/* ---------------- ③ STAGE 4：飞行关（滚动条冻结） ---------------- */

await bootStage(3);
const s4 = await startBoss(`
  s.stg.scroll = s.stg.bossTriggerScroll;
  s.stg.reachedBoss = true;
  s.beginBoss();
`);
arenaReport['STAGE 4'] = s4;
ok(s4.mode === 'stg' && s4.arena === null, 'STAGE 4 飞行关不设平台场地锁', `mode=${s4.mode}`);
const retreat = await driveStg(240);
ok(near(retreat.scroll, s4.w - 1280 - 120) || retreat.scroll === 0,
  'STAGE 4 Boss 战滚动条冻结', `scroll=${retreat.scroll}`);
ok(retreat.minWX >= retreat.scroll + 90 - 2 && near(retreat.wx, retreat.scroll + 90, 2),
  'STAGE 4 自机退不回道中（锁在屏幕左缘）',
  `wx=${retreat.wx} minWX=${retreat.minWX} floor=${retreat.scroll + 90}`);

/* ---------------- 收尾：页面错误 / 报告 ---------------- */

const rep = await T.report();
ok(rep.errors.length === 0, '页面无运行时错误', rep.errors.slice(0, 3).join(' | '));

mkdirSync(SHOT_DIR, { recursive: true });
const summary = {
  at: new Date().toISOString(),
  base: process.env.PT_BASE || 'http://127.0.0.1:8138',
  pass: passes.length,
  fail: fails.length,
  fails,
  arena: arenaReport,
  errors: rep.errors,
};
writeFileSync(`${SHOT_DIR}/report.json`, JSON.stringify(summary, null, 2));
console.log(`\nBoss 场地锁验证: ${passes.length} 通过 / ${fails.length} 失败`);
if (fails.length) console.log(JSON.stringify(fails, null, 2));
await T.close();
process.exit(fails.length ? 1 : 0);
