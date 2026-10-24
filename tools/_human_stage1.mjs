/**
 * 真人式第 1 面试玩：标题 → 难度 → 角色选择 → 开场对话 → 第 1 面操作 → 暂停菜单 →
 * 推进到 Boss → Boss 战（含符卡 cut-in）→ 死亡/续命 → GameOver/结算。
 * 全部用 CDP 真实键盘事件；eval 只读状态，不改游戏数据。
 */
import { launch, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const T = await launch({ port: 9615, headless: true });
const log = (...a) => console.log(...a);
const shot = (n) => T.shot('_pt/human/' + n);
const press = async (code, hold = 90) => { await T.key(code, hold); await sleep(110 + Math.random() * 120); };
const S = () => T.eval(`(() => {
  const g = window.__game, s = g.stage, p = s && s.player, b = s && s.boss;
  return { st: g.state, lv: g.levelIndex, t: s ? +s.time.toFixed(1) : null,
    x: p ? Math.round(p.x) : null, prog: s ? +(s.progress || 0).toFixed(3) : null,
    alive: p ? !!p.alive : null, hearts: p ? p.hearts : null, lives: p ? p.lives : null,
    power: p ? Math.round(p.power) : null, inv: p ? +(p.invuln || 0).toFixed(2) : null,
    boss: b ? { hp: Math.round(b.hp), max: Math.round(b.maxHp || b.hpMax || 0), state: b.state } : null,
    dlg: !!(g.dialogue && g.dialogue.active), fps: +(g.loop && g.loop.fps || 0).toFixed(0),
    panel: (document.getElementById('overlay') || {}).className || '',
    panelTitle: (document.querySelector('#overlay h1, #overlay .panel-title, #overlay .set-title') || {}).innerText || ''
  }; })()`);
const dlgText = () => T.eval(`(window.__game.dialogue?.active ? (document.querySelector('.dlg-text')?.innerText || document.querySelector('[class*=dlg]')?.innerText || '') : '')`);

async function advanceDialogue(tag, max = 40) {
  for (let i = 0; i < max; i++) {
    const s = await S();
    if (!s.dlg) return i;
    if (i === 0) await shot(tag + '_first.png');
    await T.key('Enter', 80);
    await sleep(280 + Math.random() * 160);
    if (i % 4 === 3) await shot(tag + '_progress' + i + '.png');
  }
  return -1;
}

await T.boot(); await sleep(700);
await installFrameProbe(T);

/* ---------- 1. 标题单次 Enter → 难度页（检查输入泄漏） ---------- */
await shot('30_title.png');
await T.key('Enter', 90); await sleep(650);
const p1 = await S();
log('AFTER_TITLE_ENTER', JSON.stringify(p1));
await shot('31_difficulty.png');
log('PANEL_TEXT1', JSON.stringify((await T.eval(`document.getElementById('overlay').innerText.slice(0,400)`))));

/* ---------- 2. 难度：保持默认 N，单次 Enter → 角色选择 ---------- */
await T.key('Enter', 90); await sleep(700);
log('AFTER_DIFF_ENTER', JSON.stringify(await S()));
const p2txt = await T.eval(`document.getElementById('overlay').innerText.slice(0,500)`);
log('PANEL_TEXT2', JSON.stringify(p2txt));
await shot('32_charselect.png');
const chars = await T.eval(`Array.from(document.querySelectorAll('.cc-portrait img')).map(i => ({ src: i.getAttribute('src').split('/').pop(), nw: i.naturalWidth, nh: i.naturalHeight, complete: i.complete }))`);
log('CHAR_PORTRAITS', JSON.stringify(chars));

/* 角色选择：→ 看魔理沙高亮，再 ← 回灵梦，Enter 开始 */
await press('ArrowRight'); await sleep(350); await shot('33_char_marisa_sel.png');
await press('ArrowLeft'); await sleep(350);
await T.key('Enter', 90); await sleep(1200);
const st0 = await S();
log('AFTER_CHAR_ENTER', JSON.stringify(st0));
await shot('34_opening_dialogue.png');
log('DLG0', JSON.stringify((await dlgText()).slice(0, 300)));

/* Esc 在开场对话中的行为 */
await T.key('Escape', 100); await sleep(700);
const escDlg = await S();
log('ESC_DURING_DIALOGUE', JSON.stringify({ st: escDlg.st, dlg: escDlg.dlg, panel: escDlg.panel }));
await shot('35_esc_during_dialogue.png');

/* 推进开场对话直到关卡开始 */
const adv = await advanceDialogue('36_dialogue', 40);
log('DIALOGUE_ADVANCES', adv, JSON.stringify(await S()));
await sleep(1200);
await shot('37_stage1_start.png');
log('STAGE_START', JSON.stringify(await S()));

/* ---------- 3. 开跑：真实按住 → + Z ---------- */
const jump = async (hold = 150) => { await T.key('Space', hold); await sleep(40 + Math.random() * 90); };
const dash = async () => { await T.key('KeyK', 90); await sleep(120 + Math.random() * 120); };
let loggingLast = 0, lastX = -1, stuckT = 0, bossShot = false, midDlgShots = 0, s = null;
let shotAt = { p15: false, p30: false, p50: false, p70: false, boss: false, boss20: false, lowhp: false };
let dead = false, continued = false, pauseDone = false, spellDone = false, slowDone = false, doubleJumpDone = false;
await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
const t0 = Date.now();
while (Date.now() - t0 < 330000) {
  s = await S();
  const el = (Date.now() - t0) / 1000;
  // 对话（道中剧情/战前）→ 释放方向键，逐句推进
  if (s.dlg) {
    await T.keyUp('ArrowRight'); await T.keyUp('KeyZ');
    await T.key('Enter', 80); await sleep(300);
    await T.key('Enter', 80); await sleep(260);
    const d = await S();
    if (!d.dlg) { await T.keyDown('ArrowRight'); await T.keyDown('KeyZ'); }
    else if (midDlgShots < 1) { midDlgShots++; await shot('38_mid_dialogue.png'); }
    continue;
  }
  if (s.st === 'gameover') { dead = true; break; }
  if (s.st === 'clear' || s.st === 'chapterClear') break;
  if (s.prog !== null && s.prog < 0.2) { await jump(); if (!doubleJumpDone) { await jump(120); doubleJumpDone = true; } }
  else if (Math.random() < 0.55) await jump();
  if (Math.random() < 0.28) await dash();
  // 低速/判定点演示一次（道中）
  if (!slowDone && s.prog > 0.22) {
    slowDone = true;
    await T.keyUp('ArrowRight'); await T.keyDown('ShiftLeft'); await T.keyDown('ArrowRight');
    await sleep(900); await shot('39_focus_hitbox.png'); await T.keyUp('ShiftLeft');
  }
  // 暂停菜单测试（道中 ~15%）
  if (!pauseDone && s.prog > 0.15) {
    pauseDone = true;
    await T.keyUp('ArrowRight'); await T.keyUp('KeyZ');
    await T.key('Escape', 100); await sleep(800);
    await shot('40_pause_menu.png');
    log('PAUSE_TEXT', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,300)`)));
    // ↓ 到「设置」再 Enter（暂停来源）
    await press('ArrowDown'); await sleep(250);
    await shot('40b_pause_sel_settings.png');
    await T.key('Enter', 90); await sleep(900);
    const pset = await T.eval(`document.getElementById('overlay').innerText.slice(0,600)`);
    log('PAUSE_SETTINGS_TEXT', JSON.stringify(pset));
    await shot('41_pause_settings.png');
    await T.key('Escape', 100); await sleep(700);
    log('BACK_TO_PAUSE', JSON.stringify(await S()));
    await shot('42_pause_back.png');
    // 返回后 ↓ 到「退出到标题」→ 二次确认
    await T.key('Escape', 100); await sleep(700);
    log('BACK_TO_PAUSE2', JSON.stringify(await S()));
    await press('ArrowDown'); await sleep(200);
    await T.key('Enter', 90); await sleep(800);
    await shot('43_quit_confirm.png');
    log('QUIT_CONFIRM_TEXT', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,300)`)));
    await T.key('Escape', 100); await sleep(700); // 取消（继续游戏）
    log('AFTER_QUIT_CANCEL', JSON.stringify(await S()));
    await T.key('Escape', 100); await sleep(600); // 继续游戏
    log('RESUMED', JSON.stringify(await S()));
    await shot('44_resumed.png');
    await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
  }
  // Boss 触发
  if (s.boss && !bossShot) { bossShot = true; await shot('45_boss_start.png'); log('BOSS_START', JSON.stringify(s)); }
  if (s.boss && !shotAt.boss20) { shotAt.boss20 = true; await sleep(1500); await shot('46_boss_fight.png'); }
  // 符卡 cut-in（Boss 战中后期）
  if (s.boss && !spellDone && s.power >= 24) {
    spellDone = true;
    await T.key('KeyX', 90); await sleep(260); await shot('47_spell_cutin.png');
    await T.key('KeyX', 90); await sleep(400);
    log('SPELL_CAST', JSON.stringify(await S()));
  }
  // 血量低截图
  if (s.hearts === 1 && !shotAt.lowhp) { shotAt.lowhp = true; await shot('48_low_hp.png'); }
  const progPct = s.prog || 0;
  for (const [k, th, name] of [['p15', 0.15, '49_progress15'], ['p30', 0.30, '50_progress30'], ['p50', 0.50, '51_progress50'], ['p70', 0.70, '52_progress70']]) {
    if (!shotAt[k] && progPct >= th) { shotAt[k] = true; await shot(name + '.png'); }
  }
  if (Date.now() - loggingLast > 3000) {
    loggingLast = Date.now();
    log('T' + el.toFixed(0), JSON.stringify({ st: s.st, x: s.x, prog: s.prog, hearts: s.hearts, lives: s.lives, power: s.power, boss: s.boss, fps: s.fps }));
  }
  // 卡住检测
  if (s.x !== null && Math.abs(s.x - lastX) < 12) { stuckT += 700; } else stuckT = 0;
  lastX = s.x;
  if (stuckT >= 2100) { await jump(180); await jump(180); await dash(); stuckT = 0; }
  await sleep(700);
}
await T.keyUp('ArrowRight'); await T.keyUp('KeyZ');
log('LOOP_END', JSON.stringify(await S()));

/* ---------- 4. 死亡/续命 ---------- */
if (dead) {
  await shot('53_gameover.png');
  log('GAMEOVER_TEXT', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,600)`)));
  await T.key('Enter', 90); await sleep(1800);
  continued = true;
  log('AFTER_CONTINUE', JSON.stringify(await S()));
  await shot('54_continued.png');
  // 续命后再打一小段
  await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
  const c0 = Date.now();
  while (Date.now() - c0 < 25000) {
    const q = await S();
    if (q.st === 'gameover') break;
    if (q.dlg) { await T.keyUp('ArrowRight'); await T.keyUp('KeyZ'); await T.key('Enter', 80); await sleep(350); continue; }
    await jump();
    if (Math.random() < 0.3) await dash();
    await sleep(900);
  }
  await T.keyUp('ArrowRight'); await T.keyUp('KeyZ');
  log('AFTER_CONTINUE_PLAY', JSON.stringify(await S()));
  await shot('55_continue_play.png');
}
const fp = await readFrameProbe(T);
log('FRAME_PROBE', JSON.stringify(fp));
log('REPORT', JSON.stringify(await T.report()).slice(0, 3000));
await shot('56_final.png');
await T.close();
