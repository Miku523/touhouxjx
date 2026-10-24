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
import { POWER } from '../src/game/power.js';
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
for (const f of ['triggerFromEnd', 'arenaFromEnd', 'arenaHalf', 'breathDist', 'breathSec']) {
  ok(Number.isFinite(mid?.[f]) && mid[f] > 0, `midboss.${f} 是正数（${mid?.[f]}）`);
}
ok(def?.gen?.midboss === mid, 'gen.midboss 与 def.midboss 是同一份对象（只有一套像素数）');
ok(mid.triggerFromEnd > mid.arenaFromEnd, '触发线在舞台之前');
// 开场准备区：4 枚 P（= 1 级火力）+ 1UP，全部摆在地图上由玩家自己捡
eq(mid?.opening?.power, 4, '开场准备区摆 4 枚 P 点');
eq(mid?.opening?.life, 1, '开场准备区摆 1 枚 1UP');
ok(mid.opening.power * POWER.pickup >= POWER.perLevel,
  `4 枚 P = ${mid.opening.power * POWER.pickup} 点，够开场升一级火力（${POWER.perLevel}/级）`);
eq(mid?.dropLife, 1, '击破妖梦掉落 1 枚 1UP');
// 第一个道中已取消：关卡只由「准备区 + 舞台 + 第二道中 + 关底场」组成
const arenaCenterCol = def.gen.cols - Math.round(mid.arenaFromEnd / T);
const arenaHalfCol = Math.round(mid.arenaHalf / T);
const prepCols = arenaCenterCol - arenaHalfCol;
ok(prepCols >= 24, `舞台左侧留着开场准备区（${prepCols} 列）`);
ok(arenaCenterCol + arenaHalfCol <= def.gen.cols - 54, '舞台右侧仍留出出口缓坡 / 第二道中 / 关底场');
ok(def.gen.cols <= 320, `第一个道中已取消：关卡缩短到 ${def.gen.cols} 列`);

// ---------------------------------------------------------------------------
console.log('\n[2] levelgen：准备区 / 舞台 / 停怪 / 检查点');
// ---------------------------------------------------------------------------
const built = buildLevelRows({ ...def.gen, collectStats: true });
const info = built.debug.midboss;
const rowsForScan = built.rows;
ok(!!info, 'levelgen 产出了 midbossInfo');
ok(info && info.suppressed > 0, `舞台窗口里取消了小怪（${info?.suppressed} 只）`);
/** 统计 [c0,c1) 列内某字符的数量 */
const countCh = (ch, c0, c1) => {
  let n = 0;
  for (let c = c0; c < c1; c++) {
    for (let r = 0; r < rowsForScan.length; r++) if (rowsForScan[r][c] === ch) n++;
  }
  return n;
};
const ground = def.gen.ground;
if (info) {
  // ---- 开场准备区：4P + 1UP 摆在路面上，玩家自己捡 ----
  const prep = info.opening;
  ok(!!prep, 'levelgen 产出了开场准备区信息（opening）');
  eq(prep?.power, mid.opening.power, `准备区实际摆了 ${mid.opening.power} 枚 P 点`);
  eq(prep?.life, mid.opening.life, '准备区实际摆了 1 枚 1UP');
  eq(countCh('p', 0, info.from), mid.opening.power, '准备区的 P 点数量与配置一致');
  eq(countCh('U', 0, info.from), mid.opening.life, '准备区的 1UP 数量与配置一致');
  eq(countCh('s', 0, info.from) + countCh('f', 0, info.from), 0, '准备区没有小怪（纯补给 + 跑图）');
  ok(countCh('C', 0, info.from) === 0, '准备区不设检查点（出生点即复活点）');
  // 出生点：必须落在准备区最左端，玩家要一路向右才能捡到补给
  let spawnC = -1;
  for (let c = 0; c < info.from; c++) {
    for (let r = 0; r < rowsForScan.length; r++) if (rowsForScan[r][c] === 'P') spawnC = c;
  }
  ok(spawnC >= 0 && spawnC < 8, `出生点在准备区左端（col ${spawnC}）`);
  // P 点 / 1UP 都在出生点右边 → 一定得自己走过去
  let minItemC = Infinity;
  let maxItemC = -1;
  for (let c = 0; c < info.from; c++) {
    for (let r = 0; r < rowsForScan.length; r++) {
      if (rowsForScan[r][c] === 'p' || rowsForScan[r][c] === 'U') {
        minItemC = Math.min(minItemC, c);
        maxItemC = Math.max(maxItemC, c);
      }
    }
  }
  ok(minItemC > spawnC + 2, `第一枚补给在出生点右侧（col ${minItemC}）`);
  ok(maxItemC < Math.round(mid.triggerFromEnd ? def.gen.cols - mid.triggerFromEnd / T : 0) + 1,
    `最后一枚补给在妖梦触发线之前（col ${maxItemC}）`);
  // 准备区地形：整段平地，跑过去不会被坑/台阶打断
  let prepFlat = true;
  for (let c = 0; c < info.from; c++) {
    const ch = rowsForScan[ground][c];
    if (ch !== 'G' && ch !== '#') { prepFlat = false; break; }
  }
  ok(prepFlat, '准备区是一整排平地（row ' + ground + '）');

  // ---- 舞台窗口：不刷小怪、不再撒 P / 金币 ----
  let fairies = 0;
  for (let c = info.from; c < info.to; c++) {
    for (let r = 0; r < rowsForScan.length; r++) {
      const ch = rowsForScan[r][c];
      if (ch === 's' || ch === 'f') fairies += 1;
    }
  }
  eq(fairies, 0, '舞台窗口内没有地面 / 飞行妖精');
  eq(info.power, 0, '舞台窗口不再撒补偿 P（火力改由准备区补给）');
  eq(countCh('p', info.from, info.to), 0, '舞台窗口内没有 P 点');
  eq(countCh('U', info.from, info.to), 0, '舞台窗口内没有额外 1UP');
  eq(countCh('o', info.from - 10, info.to + 10), 0, '舞台窗口内没有金币（战斗场地保持干净）');
  let flat = true;
  for (let c = info.from; c < info.to; c++) {
    const ch = rowsForScan[ground][c];
    if (ch !== 'G' && ch !== '#') { flat = false; break; }
  }
  ok(flat, '舞台地面是一整排平地（row ' + ground + '）');

  // ---- 出口缓坡：舞台地面是最低层，接回主路必须是「一列最多抬一格」的阶梯，
  //      而且坡道上方的老地形必须被挖空 —— 否则打完整场后会被一堵高墙堵死（真实回归 bug）。
  const h = rowsForScan.length;
  const SOLID_CH = new Set(['G', '#', 'B']);
  const topOf = (c) => {
    for (let r = 0; r < h; r++) if (SOLID_CH.has(rowsForScan[r][c])) return r;
    return h;
  };
  const me = info.to;
  const rampLen = Math.min(14, rowsForScan[0].length - me - 51);
  let stepOk = true;
  let noOverhang = true;
  for (let c = me; c < me + rampLen; c++) {
    if (Math.abs(topOf(c + 1) - topOf(c)) > 1) stepOk = false;
    if (topOf(c) > topOf(c - 1)) stepOk = false; // 坡道只能往上走
    for (let r = 0; r < topOf(c); r++) if (SOLID_CH.has(rowsForScan[r][c])) noOverhang = false;
  }
  ok(rampLen > 0, `出口坡道长度 ${rampLen} 列`);
  ok(stepOk, '坡道是每列最多抬一格的阶梯（能跳上去）');
  ok(noOverhang, '坡道上方的旧地形已挖空（不会变成一堵墙）');
  ok(topOf(me + rampLen) <= topOf(me) - 4, `坡道抬升了 ${topOf(me) - topOf(me + rampLen)} 格（接到主路）`);
  ok(Math.abs(topOf(me + rampLen) - topOf(me + rampLen + 1)) <= 1, '坡顶与主路地面高差 ≤1 格（能走下去）');

  // ---- 第二道中：短关卡自己补一个检查点 ----
  const cpCols = [];
  for (let c = 0; c < rowsForScan[0].length; c++) {
    for (let r = 0; r < h; r++) if (rowsForScan[r][c] === 'C') cpCols.push({ c, r });
  }
  ok(cpCols.length >= 1, `第二道中补了检查点（${cpCols.length} 个）`);
  const cp = cpCols[0];
  if (cp) {
    ok(cp.c > me + rampLen, `检查点在出口坡道之后（col ${cp.c}）`);
    ok(cp.c * T < def.gen.cols * T - 940, '检查点在关底触发线之前');
    ok(SOLID_CH.has(rowsForScan[cp.r + 1][cp.c]), '检查点脚下是实地（复活不会直接掉下去）');
  }
  // 第二道中：舞台之后到关底场之间仍要有小怪 / 金币（不是一条空跑道）
  const corridorFrom = me + rampLen;
  const corridorTo = def.gen.cols - 50;
  ok(countCh('s', corridorFrom, corridorTo) + countCh('f', corridorFrom, corridorTo) > 0,
    '第二道中仍有小怪');
  ok(countCh('o', corridorFrom, corridorTo) > 0, '第二道中有金币串');
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

  // 开场准备区：从出生点一路往右走过去，4 枚 P + 1 枚 1UP 全部自己捡
  const livesAtStart = p.lives;
  const powerAtStart = p.power;
  let walkGuard = 0;
  while (p.x + p.w / 2 < midTriggerPx - 40 && walkGuard < 2000) {
    frameAt(p.x + p.w / 2 + 8);
    walkGuard += 1;
  }
  eq(count('power'), mid.opening.power, `准备区路上捡到 ${mid.opening.power} 枚 P 点`);
  eq(p.power - powerAtStart, mid.opening.power * POWER.pickup,
    `捡完 P 点火力 +${mid.opening.power * POWER.pickup}（不是系统自动补的）`);
  eq(p.lives - livesAtStart, mid.opening.life, '准备区的 1UP 让残机 +1');
  eq(count('bossTrigger'), 0, '捡补给的过程中还没进妖梦战');

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
  eq(p.power, powerBefore, '开战不再自动补火力（火力只能靠准备区自己捡）');
  eq(count('extend'), mid.opening.life, '开战前后残机只来自准备区那枚 1UP');

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
  const youmuX = youmu.x;
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

  // 击破掉落：一枚 1UP 从空中落到舞台地面，玩家得自己走过去捡（见 midboss.dropLife）
  const lifeBeforeDrop = p.lives;
  const drops = st.pickups.filter((it) => it.kind === 'oneup' && !it.taken);
  eq(drops.length, mid.dropLife, `妖梦击破掉落 ${mid.dropLife} 枚 1UP`);
  const drop = drops[0];
  ok(!!drop && drop.drop === true, '1UP 从空中落下（不是击破即到账）');
  ok(!!drop && Math.abs(drop.x - youmuX) <= 60, '1UP 落在妖梦击破的位置');
  // 人先站远一点，等它掉完：落地前不能捡
  frameAt(youmuX - 400);
  for (let i = 0; i < 90; i++) idleFrame();
  ok(!!drop && drop.drop === false, '1UP 落地后转为可拾取');
  eq(drop?.taken, false, '没有走近就还没被捡走');
  eq(p.lives, lifeBeforeDrop, '没捡之前残机不变（不是击破自动给）');
  frameAt(drop.x);
  eq(drop?.taken, true, '走到掉落位置 → 1UP 被捡起');
  eq(p.lives, lifeBeforeDrop + mid.dropLife, `捡起 1UP 后残机 +${mid.dropLife}`);
  eq(count('extend'), mid.opening.life + mid.dropLife, '两枚 1UP 都走统一的 extend 通道（横幅/音效一致）');

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
