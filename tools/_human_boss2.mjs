/**
 * 真人式冲 Boss（改进版）：EASY + 灵梦，读取子弹/敌人做拟人躲闪，真实键盘事件。
 * eval 只读状态决定移动方向（相当于玩家"看屏幕"），绝不修改游戏数据。
 */
import { launch, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const T = await launch({ port: 9617, headless: true });
const log = (...a) => console.log(...a);
const shot = (n) => T.shot('_pt/human/' + n);
const S = () => T.eval(`(() => {
  const g = window.__game, s = g && g.stage, p = s && s.player;
  if (!p) return { st: g && g.state, noStage: true, dlg: !!(g && g.dialogue && g.dialogue.active) };
  const px = p.x + p.w / 2, py = p.y + p.h / 2;
  const bl = [];
  for (const b of s.bullets.pool) {
    if (!b.active) continue;
    const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);
    if (d < 340) bl.push([Math.round(dx), Math.round(dy), Math.round(d), Math.round(b.vx), Math.round(b.vy)]);
  }
  const en = [];
  for (const e of s.enemies.list) {
    if (!e.alive) continue;
    const dx = e.x - px, dy = e.y - py;
    if (Math.abs(dx) < 460 && Math.abs(dy) < 360) en.push([Math.round(dx), Math.round(dy)]);
  }
  const boss = s.boss ? { hp: Math.round(s.boss.hp), max: Math.round(s.boss.maxHp || 0), x: Math.round((s.boss.x || 0) - px), y: Math.round((s.boss.y || 0) - py) } : null;
  return { st: g.state, x: Math.round(p.x), w: s.level ? s.level.w : null, y: Math.round(p.y),
    vx: Math.round(p.vx), vy: Math.round(p.vy), ground: !!p.onGround, hearts: p.hearts, lives: p.lives,
    power: Math.round(p.power), inv: +(p.invuln || 0).toFixed(2), casting: !!p.casting,
    bl: bl.slice(0, 14), en: en.slice(0, 6), boss,
    dlg: !!(g.dialogue && g.dialogue.active), fps: +(g.loop && g.loop.fps || 0).toFixed(0),
    overlayHidden: document.getElementById('overlay').classList.contains('hidden') };
})()`);

await T.boot({ waitTitle: true }); await sleep(500);
await installFrameProbe(T);
await T.eval(`window.__marks=[]; window.__mark=(n)=>window.__marks.push([n,Math.round(performance.now())]);'ok'`);

/* 选 EASY + 灵梦，进入第 1 面 */
await T.key('Enter', 90); await sleep(600);          // 标题 → 难度
await T.key('KeyE', 90); await sleep(550);          // EASY → 角色选择
await shot('80_charselect_easy.png');
await T.key('Enter', 90); await sleep(900);          // 灵梦 → 开场对话
// 开场对话：快速推进
for (let i = 0; i < 45; i++) { const s = await S(); if (!s.dlg) break; await T.key('Enter', 70); await sleep(160); }
await sleep(900);
let s = await S();
log('STAGE_BEGIN', JSON.stringify(s));
await shot('81_stage_start.png');

/* ---------- 道中：真实按键 + 读屏躲弹 ---------- */
const hold = async (code) => T.keyDown(code);
const rel = async (code) => T.keyUp(code);
const tapKey = async (code, ms = 110) => T.key(code, ms);
let t0 = Date.now(), lastShot = {}, paused = false, focusDone = false, quitDone = false;
let lastX = 0, stuck = 0, dead = false, cleared = false;
let rightHeld = false, leftHeld = false, zHeld = false;

async function setDir(dir) {
  if (dir === 'right') {
    if (leftHeld) { await rel('ArrowLeft'); leftHeld = false; }
    if (!rightHeld) { await hold('ArrowRight'); rightHeld = true; }
  } else if (dir === 'left') {
    if (rightHeld) { await rel('ArrowRight'); rightHeld = false; }
    if (!leftHeld) { await hold('ArrowLeft'); leftHeld = true; }
  } else {
    if (rightHeld) { await rel('ArrowRight'); rightHeld = false; }
    if (leftHeld) { await rel('ArrowLeft'); leftHeld = false; }
  }
}
await setDir('right'); await hold('KeyZ'); zHeld = true;

let lastLog = 0;
while (Date.now() - t0 < 420000) {
  s = await S();
  const el = (Date.now() - t0) / 1000;
  if (!s.noStage && s.st === 'gameover') { dead = true; break; }
  if (!s.noStage && s.st === 'clear') { cleared = true; break; }
  if (s.dlg) {
    await setDir('none'); await sleep(160);
    await T.key('Enter', 70); await sleep(240);
    continue;
  }
  if (s.boss && !paused) {
    paused = true;
    await setDir('none');
    await shot('82_boss_arrive.png');
    log('BOSS_ARRIVE', JSON.stringify(s));
    await T.key('Escape', 90); await sleep(600);
    await shot('83_esc_in_boss.png');
    log('ESC_IN_BOSS', JSON.stringify(await S()));
    await T.key('Escape', 90); await sleep(450);
    await setDir('right');
  }
  // 暂停菜单/退出确认测试一次（道中 ~20s）
  if (!quitDone && el > 20) {
    quitDone = true;
    await setDir('none');
    await T.key('Escape', 90); await sleep(650);
    await shot('84_pause.png');
    // ↓↓ → 退出到标题
    await T.key('ArrowDown', 70); await sleep(180); await T.key('ArrowDown', 70); await sleep(180);
    await T.key('Enter', 80); await sleep(650);
    log('QUIT_CONFIRM_TEXT', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,260)`)));
    await shot('85_quit_confirm.png');
    await T.key('Escape', 90); await sleep(550);  // 取消
    await shot('86_quit_cancelled.png');
    await T.key('Escape', 90); await sleep(500);  // 继续
    if (!zHeld) { await hold('KeyZ'); zHeld = true; }
    await setDir('right');
    log('RESUMED', JSON.stringify(await S()));
  }
  // 判定点/低速演示一次
  if (!focusDone && el > 8) {
    focusDone = true;
    await setDir('none'); await hold('ShiftLeft'); await sleep(650);
    await shot('87_focus_hitbox.png');
    await rel('ShiftLeft'); await setDir('right');
  }
  // —— 拟人躲闪决策 ——
  const near = s.bl.filter(([dx, dy, d]) => Math.abs(dx) < 100 && Math.abs(dy) < 70);
  let dir = 'right';
  if (near.length) {
    const leftRisk = near.filter(([dx]) => dx < 0).length;
    const rightRisk = near.filter(([dx]) => dx > 0).length;
    dir = leftRisk > rightRisk ? 'right' : 'left';
    if (near.some(([, dy]) => dy > -30 && dy < 55)) await tapKey('Space', 130); // 跳过
    if (s.ground && Math.random() < 0.5) await tapKey('Space', 120);
  }
  await setDir(dir);
  if (dir === 'left') { await sleep(140); await setDir('right'); }
  // 卡住/前方有敌人 → 跳
  if (Math.abs(s.x - lastX) < 6) stuck++; else stuck = 0;
  lastX = s.x;
  if (stuck >= 4 || (s.en && s.en.some(([dx, dy]) => dx > 40 && dx < 260 && Math.abs(dy) < 90))) {
    await tapKey('Space', 150); await sleep(150); await tapKey('Space', 120); stuck = 0;
  }
  if (Math.random() < 0.18) await tapKey('KeyK', 80); // 冲刺/撞怪
  // 危险大时放符卡（消耗 24，2 秒无敌清弹）
  if (s.power >= 24 && s.bl.filter(([dx, dy, d]) => d < 200).length >= 5 && !s.casting) {
    await tapKey('KeyX', 90); await sleep(160); await shot('88_spell_cutin_' + Date.now() % 1000 + '.png');
    log('SPELL', JSON.stringify({ x: s.x, power: s.power, bullets: s.bl.length }));
  }
  // 里程碑
  if (s.x > 6000 && !lastShot[6000]) { lastShot[6000] = 1; await shot('89_x6000.png'); }
  if (s.x > 12000 && !lastShot[12000]) { lastShot[12000] = 1; await shot('90_x12000.png'); }
  if (s.x > 17000 && !lastShot[17000]) { lastShot[17000] = 1; await shot('91_x17000.png'); }
  if (s.boss) { await shot('92_boss_fight.png'); log('BOSS_FIGHT', JSON.stringify(s)); break; }
  await sleep(120);
}
await setDir('none'); await rel('KeyZ');
log('LOOP_END', JSON.stringify(await S()));
log('FRAME_PROBE', JSON.stringify(await readFrameProbe(T)));
log('MARKS', JSON.stringify(await T.eval(`window.__marks`)));

/* ---------- Boss 战（若到达）：贴近输出 + 躲闪 + 符卡 ---------- */
if (!dead && !cleared) {
  for (let i = 0; i < 900; i++) {
    const q = await S();
    if (q.st === 'gameover') { dead = true; break; }
    if (q.st === 'clear') { cleared = true; break; }
    if (q.dlg) { await T.key('Enter', 70); await sleep(260); continue; }
    if (q.boss) {
      if (!lastShot.bossCutin && q.power >= 24) { lastShot.bossCutin = 1; await T.key('KeyX', 90); await sleep(180); await shot('93_boss_cutin.png'); await sleep(120); await shot('93b_boss_cutin2.png'); }
      if (!lastShot.boss10 && Date.now() - t0 > 30000) { lastShot.boss10 = 1; await shot('94_boss_10s.png'); }
      await T.key('KeyZ', 90);
      await setDir(q.x < 620 ? 'right' : (q.bl.some(([dx]) => dx > 0 && Math.abs(dx) < 90) ? 'left' : 'right'));
      if (Math.random() < 0.5) await T.key('Space', 120);
      if (Math.random() < 0.15) await T.key('KeyK', 80);
      if (q.boss.hp < 40 && !lastShot.bossLow) { lastShot.bossLow = 1; await shot('95_boss_low.png'); }
      await sleep(260);
      continue;
    }
    await sleep(250);
  }
  log('BOSS_END', JSON.stringify(await S()));
  await shot('96_after_boss.png');
}
if (dead) {
  await shot('97_gameover.png');
  log('GAMEOVER', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,400)`)));
  // 续命（Enter）
  await T.key('Enter', 90); await sleep(1500);
  log('AFTER_CONTINUE', JSON.stringify(await S()));
  await shot('98_continued.png');
  await setDir('right'); await hold('KeyZ');
  const c0 = Date.now();
  while (Date.now() - c0 < 20000) {
    const q = await S();
    if (q.st === 'gameover') break;
    if (q.dlg) { await setDir('none'); await T.key('Enter', 70); await sleep(240); continue; }
    await T.key('Space', 130); await sleep(700);
  }
  await setDir('none'); await rel('KeyZ');
  log('AFTER_CONTINUE_PLAY', JSON.stringify(await S()));
  await shot('99_continue_play.png');
}
log('REPORT', JSON.stringify({ errors: (await T.report()).errors, warns: [], netFails: (await T.report()).netFails }));
await T.close();
