#!/usr/bin/env node
/**
 * STAGE5「白玉楼 · 冥界花海」双 Boss 编排自测。
 *
 * 验证链路：道中 → 越过妖梦线 → 妖梦（midboss）登场 → 击破 → 呼吸区 → 幽幽子登场 → 击破 → clear。
 *
 * 不依赖浏览器 / canvas：Stage 在 node 里可以直接构造（canvas 只在 render 里用）。
 * Boss 本体是另一条实现线，这里不碰它的弹幕，只在开战后把该实例的 update / 命中接口替换成
 * 空实现，然后按 stage.js 自己的派发路径（boss.state='dead' → update → _onMidbossDefeated /
 * _onBossDefeated）走完状态机 —— 测的是本文件的编排，不是 Boss 的强度。
 *
 * 用法：node tools/_verify_stage5_youmu.mjs
 */

import { LEVELS } from '../src/assets/levels.js';
import { buildLevelRows } from '../src/assets/levelgen.js';
import { Stage } from '../src/game/stage.js';

let fail = 0;
let pass = 0;
function ok(cond, label, extra) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${extra === undefined ? '' : `  →  ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`}`);
  }
}
function eq(a, b, label) {
  ok(a === b, label, `${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

/** 空输入：所有按键都松开、方向为 0（跑图位置由脚本直接摆） */
const idle = {
  down: () => false,
  pressed: () => false,
  released: () => false,
  axisX: 0,
};

const T = 32;

// ---------------------------------------------------------------------------
console.log('\n[1] 关卡配置');
// ---------------------------------------------------------------------------
const def = LEVELS.find((l) => l.id === 'stage5');
ok(!!def, 'stage5 存在');
const mid = def?.midboss;
ok(!!mid, 'stage5.def.midboss 存在');
eq(mid?.key, 'youmu', 'midboss.key = youmu');
eq(def?.boss, 'yuyuko', '关底仍是 yuyuko');
for (const f of ['triggerFromEnd', 'arenaFromEnd', 'arenaHalf', 'breathDist', 'breathSec', 'directPower']) {
  ok(Number.isFinite(mid?.[f]) && mid[f] > 0, `midboss.${f} 是正数（${mid?.[f]}）`);
}
ok(def?.gen?.midboss === mid, 'gen.midboss 与 def.midboss 是同一份对象（只有一套像素数）');
ok(mid.triggerFromEnd > mid.arenaFromEnd, '触发线在舞台之前');

// ---------------------------------------------------------------------------
console.log('\n[2] levelgen：舞台 / 停怪 / P 补偿');
// ---------------------------------------------------------------------------
const info = buildLevelRows({ ...def.gen, collectStats: true }).debug.midboss;
ok(!!info, 'levelgen 产出了 midbossInfo');
ok(info && info.suppressed > 0, `舞台窗口里取消了小怪（${info?.suppressed} 只）`);
ok(info && info.power >= 2, `至少撒了 2 枚 P（${info?.power} 枚）`);
if (info) {
  const rowsForScan = buildLevelRows({ ...def.gen }).rows;
  let fairies = 0;
  let powerItems = 0;
  for (let c = info.from; c < info.to; c++) {
    for (let r = 0; r < rowsForScan.length; r++) {
      const ch = rowsForScan[r][c];
      if (ch === 's' || ch === 'f') fairies += 1;
      if (ch === 'p') powerItems += 1;
    }
  }
  eq(fairies, 0, '舞台窗口（不含入口缓冲）内没有地面 / 飞行妖精');
  ok(powerItems >= 2, `舞台窗口内有 P 补偿（${powerItems} 枚）`);
  const ground = def.gen.ground;
  let flat = true;
  for (let c = info.from; c < info.to; c++) {
    const ch = rowsForScan[ground][c];
    if (ch !== 'G' && ch !== '#') { flat = false; break; }
  }
  ok(flat, '舞台地面是一整排平地（row ' + ground + '）');
}

// ---------------------------------------------------------------------------
console.log('\n[3] 触发门控（纯函数，不经 update）');
// ---------------------------------------------------------------------------
function newStage(tag) {
  const events = [];
  const st = new Stage({
    def, index: 4, char: 'reimu', lives: 3, difficulty: 'N',
    onEvent: (n, d) => events.push({ n, d }),
  });
  st._tag = tag;
  st._events = events;
  return st;
}

{
  const st = newStage('gates');
  const w = st.level.w;
  const cfg = st.midbossCfg;
  eq(cfg?.key, 'youmu', 'Stage.midbossCfg 来自关卡配置');

  ok(st._checkPlatformBossTrigger(w - cfg.triggerFromEnd - 100) === null,
    '妖梦线之前不触发');

  const q = st._checkPlatformBossTrigger(w - cfg.triggerFromEnd + 100);
  eq(q?.key, 'youmu', '越过妖梦线 → 排队妖梦');
  eq(q?.mid, true, '妖梦是 midboss');
  eq(st.bossPending, true, '排队后 bossPending = true');
  ok(st.pendingBossFromEnd === cfg.arenaFromEnd, '排队时记下了舞台站位');
  // 还原，继续做后面的门控
  st.bossPending = false;
  st.pendingBossKey = null;
  st.pendingBossMid = false;
  st.pendingBossFromEnd = null;

  // 妖梦没打掉之前，关底不参与判定
  st.player.x = w - 100;
  ok(st._checkPlatformBossTrigger(w - 100)?.key === 'youmu',
    '妖梦未击破时，即使站在关底线也只会重复排妖梦（由 bossPending 挡）');

  // 击破后：距离 + 时间双门控
  st.bossPending = false;
  st.midbossDone = true;
  const finalTrigger = Math.max(200, Math.min(st.goalX - 120, w - 520 - 420));
  st._midClearX = finalTrigger - 600;
  st._midClearT = 0;
  ok(st._checkPlatformBossTrigger(finalTrigger + 10) === null,
    '距离不足 breathDist 时不放关底（时间也不够）');
  st._midClearX = finalTrigger - 1000;
  st._midClearT = 0;
  ok(st._checkPlatformBossTrigger(finalTrigger + 10) === null,
    '距离够了但 breathSec 未到，也不放关底');
  st._midClearT = 5;
  const fin = st._checkPlatformBossTrigger(finalTrigger + 10);
  eq(fin?.key, 'yuyuko', '距离 + 时间都满足 → 排队关底');
  eq(fin?.mid, false, '关底不是 midboss');
}

// ---------------------------------------------------------------------------
console.log('\n[4] 整局模拟：道中 → 妖梦 → 呼吸区 → 幽幽子 → clear');
// ---------------------------------------------------------------------------
{
  const st = newStage('play');
  const p = st.player;
  const w = st.level.w;
  const cfg = st.midbossCfg;
  const floorY = def.gen.ground * T;
  const standY = floorY - p.h - 0.5;
  const idleFrame = () => {
    p.vy = 0;
    p.onGround = true;
    p.y = standY;
    st.update(1 / 60, idle);
  };
  /** 把玩家中心摆到 px，跑一帧 */
  const frameAt = (px) => { p.x = px - p.w / 2; idleFrame(); };
  const count = (name, pred) => st._events.filter((e) => e.n === name && (!pred || pred(e.d))).length;

  const midTriggerPx = w - cfg.triggerFromEnd;
  const finalTriggerPx = Math.max(200, Math.min(st.goalX - 120, w - 520 - 420));

  // 道中：妖梦线之前跑 2 秒
  for (let i = 0; i < 120; i++) frameAt(midTriggerPx - 300);
  eq(count('bossTrigger'), 0, '妖梦线之前 2 秒内没有任何 Boss 触发');
  eq(st.midbossDone, false, '道中 midbossDone 仍为 false');

  // 越过妖梦线
  frameAt(midTriggerPx + 30);
  eq(count('bossTrigger'), 1, '越过妖梦线 → 恰一次 bossTrigger');
  const trig = st._events.find((e) => e.n === 'bossTrigger');
  ok(trig?.d?.midboss === true, 'bossTrigger 带 midboss:true');
  eq(trig?.d?.key, 'youmu', 'bossTrigger 带 key=youmu');
  eq(st.bossPending, true, '等待战前对话：bossPending = true');
  ok(count('checkpoint') >= 1, '触发时落地了检查点');
  ok(p.checkpoint && p.checkpoint.x > 0, '玩家检查点已写入');

  // 对话播完 → beginBoss（与 main.js 的 start() 一致：先 state='play' 再 beginBoss）
  const powerBefore = p.power;
  st.state = 'play';
  st.beginBoss();
  const bs = st._events.find((e) => e.n === 'bossStart');
  eq(bs?.d?.key, 'youmu', 'bossStart key=youmu');
  eq(bs?.d?.midboss, true, 'bossStart midboss=true');
  eq(st.state, 'boss', '进入 Boss 状态');
  eq(st.bossMid, true, 'bossMid = true');
  ok(Math.abs(st.boss.x - (w - cfg.arenaFromEnd)) <= 1,
    `妖梦站舞台中心（x=${Math.round(st.boss.x)}）`);
  eq(p.power - powerBefore, cfg.directPower, `进战一次性补火力 +${cfg.directPower}`);

  // 把 Boss 实例的弹幕/命中接口换成空实现，只走 stage 的派发路径
  const youmu = st.boss;
  youmu.update = () => {};
  youmu.damageWithShots = () => {};
  youmu.hitByDash = () => false;
  youmu.stompBy = () => false;

  // 妖梦战里死一次：复活必须回到 Boss 状态，且不重复触发
  const startsBeforeDeath = count('bossStart');
  p.alive = false;
  st.state = 'dead';
  st.deathT = 0.01;            // 真实死亡是 0.9 秒倒计时，这里快速走完
  for (let i = 0; i < 5 && st.state === 'dead'; i++) st.update(1 / 60, idle);
  eq(st.state, 'boss', '妖梦战里死亡 → 复活回到 boss 状态（不死锁）');
  ok(st.boss === youmu && st.bossStarted, '复活后仍是同一场妖梦战');
  eq(count('bossStart'), startsBeforeDeath, '复活不重复触发 bossStart');
  ok(p.alive, '复活后玩家存活');
  // 复活点回到妖梦战前的检查点，不会被直接扔到幽幽子面前
  ok(p.x + p.w / 2 < finalTriggerPx, '复活点在关底触发线之前');

  // 击破妖梦：走 boss.state='dead' → update 的真实派发
  const powerAtMidClear = p.power;
  youmu.state = 'dead';
  st.update(1 / 60, idle);
  const mc = st._events.find((e) => e.n === 'midbossClear');
  eq(mc?.d?.key, 'youmu', 'midbossClear 带 key=youmu');
  eq(count('midbossClear'), 1, 'midbossClear 恰好一次');
  eq(st.boss, null, '击破后 boss 清空');
  eq(st.midbossDone, true, 'midbossDone = true');
  eq(st.state, 'play', '击破后回到 play 继续道中');
  eq(st.finished, false, '妖梦击破不算过关');
  eq(p.power, powerAtMidClear, '妖梦战结束不再重复补火力');

  const midClearX = st._midClearX;
  ok(Math.abs(midClearX - (p.x + p.w / 2)) < 1, '呼吸区基准 = 击破瞬间的玩家位置');

  // 呼吸区：原地 + 小幅前进都不该放幽幽子
  const bossTriggersAfterMid = count('bossTrigger');
  for (let i = 0; i < 180; i++) frameAt(midClearX);   // 3 秒原地
  eq(count('bossTrigger'), bossTriggersAfterMid, '原地 3 秒不放关底');
  for (let i = 0; i < 60; i++) frameAt(midClearX + cfg.breathDist * 0.5); // 1 秒半程
  eq(count('bossTrigger'), bossTriggersAfterMid, `前进不足 breathDist(${cfg.breathDist}px) 不放关底`);

  // 走完全程
  let guard = 0;
  let firstFinal = null;
  let firstFinalPx = 0;
  while (p.x + p.w / 2 < finalTriggerPx + 60 && guard < 2000) {
    const px = p.x + p.w / 2;
    frameAt(Math.min(px + 8, finalTriggerPx + 60));
    const hit = st._events.find((e) => e.n === 'bossTrigger' && !e.d?.midboss);
    if (hit && !firstFinal) { firstFinal = hit; firstFinalPx = px + 8; }
    guard += 1;
  }
  ok(!!firstFinal, '跑完呼吸区后幽幽子被排队');
  eq(count('bossTrigger', (d) => !d?.midboss), 1, '幽幽子 bossTrigger 恰好一次');
  ok(firstFinalPx >= midClearX + cfg.breathDist - 1,
    `幽幽子在 breathDist 之后才触发（${Math.round(firstFinalPx - midClearX)}px）`);
  eq(firstFinal?.d?.key, 'yuyuko', '幽幽子触发带 key=yuyuko');
  eq(st.midbossDone, true, '进入关底时 midbossDone 仍为 true');

  // 关底
  st.state = 'play';
  st.beginBoss();
  const bs2 = st._events.filter((e) => e.n === 'bossStart').pop();
  eq(bs2?.d?.key, 'yuyuko', 'bossStart key=yuyuko');
  eq(bs2?.d?.midboss, false, '幽幽子不是 midboss');
  eq(st.bossMid, false, 'bossMid = false');
  ok(Math.abs(st.boss.x - (w - 520)) <= 1, '幽幽子站关底场地（w-520）');

  const yuyuko = st.boss;
  // 真实流程里 state='dead' 是 boss.update 内部写出来的；stub 必须在 update 里改，
  // 这样 stage.js 的 `before !== 'dead'` 判定才会成立（与真实帧一致）。
  yuyuko.update = () => { yuyuko.state = 'dead'; };
  yuyuko.damageWithShots = () => {};
  yuyuko.hitByDash = () => false;
  yuyuko.stompBy = () => false;
  st.update(1 / 60, idle);
  eq(st.finished, true, '幽幽子击破 → finished = true');
  eq(st.state, 'clear', '进入 clear 状态');
  const clr = st._events.find((e) => e.n === 'clear');
  eq(clr?.d?.boss, 'yuyuko', 'clear 事件带 boss=yuyuko');

  // 收关后继续跑帧：不该再有触发 / 异常
  for (let i = 0; i < 120; i++) st.update(1 / 60, idle);
  eq(count('bossTrigger'), 2, '整局总共只有两次 bossTrigger（妖梦 + 幽幽子）');
  eq(count('bossStart'), 2, '整局总共只有两次 bossStart');
  eq(st.finished, true, '收关后保持 finished');

  // 事件顺序：妖梦先于幽幽子
  const order = st._events.filter((e) => ['bossTrigger', 'midbossClear', 'clear'].includes(e.n))
    .map((e) => `${e.n}${e.d?.midboss ? '(mid)' : ''}`);
  console.log('    事件序列：', order.join(' → '));
  ok(order.join('|') === 'bossTrigger(mid)|midbossClear|bossTrigger|clear',
    '事件顺序：妖梦触发 → midbossClear → 幽幽子触发 → clear');
}

// ---------------------------------------------------------------------------
// Part5：main.js 取对话用的数据契约（story.js 侧）
// ---------------------------------------------------------------------------
{
  console.log('[Part5] 对话数据契约（main.js _midbossStory 的官方入口）');
  const { STORY, midbossPreFor, midbossPostFor } = await import('../src/game/story.js');
  for (const char of ['reimu', 'marisa']) {
    const pre = midbossPreFor(char, 'stage5');
    const post = midbossPostFor(char, 'stage5');
    ok(Array.isArray(pre) && pre.length > 0, `${char} 战前对话非空（${pre.length} 条）`);
    ok(Array.isArray(post) && post.length > 0, `${char} 战后对话非空（${post.length} 条）`);
    ok(pre.every((l) => typeof l.who === 'string' && typeof l.text === 'string'),
      `${char} 战前对话行格式 {who,text}`);
    ok(post.every((l) => typeof l.who === 'string' && typeof l.text === 'string'),
      `${char} 战后对话行格式 {who,text}`);
    ok(!pre.some((l) => /\{(me|partner)\}/.test(l.who)), `${char} who 字段不含占位符`);
  }
  ok(!!STORY.stages.stage5.youmuPre, 'STORY.stages.stage5.youmuPre 存在（顶层不是 STORY.stage5）');
  ok(midbossPreFor('reimu', 'stage9').length === 0, '不存在的关卡 → 返回 []，不抛错');
}

// ---------------------------------------------------------------------------
console.log(`\n结果：${pass} 通过，${fail} 失败\n`);
process.exitCode = fail ? 1 : 0;
