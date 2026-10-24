/**
 * 真人式第 1 面冲 Boss：EASY 难度，真实键鼠，重点测暂停菜单/符卡cut-in/判定点/Boss战。
 * eval 只读状态 + 安装帧探针，不改游戏数据。
 */
import { launch, sleep, installFrameProbe, readFrameProbe } from './_pt_core.mjs';

const T = await launch({ port: 9616, headless: true });
const log = (...a) => console.log(...a);
const shot = (n) => T.shot('_pt/human/' + n);
const press = async (code, hold = 90) => { await T.key(code, hold); await sleep(90 + Math.random() * 110); };
const S = () => T.eval(`(() => {
  const g = window.__game, s = g.stage, p = s && s.player, b = s && s.boss;
  return { st: g.state, x: p ? Math.round(p.x) : null, w: s && s.level ? s.level.w : null,
    alive: p ? !!p.alive : null, hearts: p ? p.hearts : null, lives: p ? p.lives : null,
    power: p ? Math.round(p.power) : null, boss: b ? { hp: Math.round(b.hp), state: b.state } : null,
    dlg: !!(g.dialogue && g.dialogue.active), fps: +(g.loop && g.loop.fps || 0).toFixed(0),
    panelTitle: (document.querySelector('#overlay h1, #overlay .panel-title') || {}).innerText || '',
    overlayHidden: document.getElementById('overlay').classList.contains('hidden') }; })()`);
async function advance(tag, max = 40) {
  for (let i = 0; i < max; i++) {
    const s = await S();
    if (!s.dlg) return i;
    if (i === 0) await shot(tag + '_0.png');
    await T.key('Enter', 80); await sleep(260 + Math.random() * 140);
    if (i % 5 === 4) await shot(tag + '_' + i + '.png');
  }
  return -1;
}
await T.boot(); await sleep(600);
await installFrameProbe(T);
// 逐段计时打点（仅性能观测）
await T.eval(`window.__marks = []; window.__mark = (n) => window.__marks.push([n, Math.round(performance.now())]); 'ok'`);

/* 标题 → 难度 → EASY → 角色 → 开场对话 */
await T.eval(`__mark('title')`);
await T.key('Enter', 90); await sleep(600);
await T.key('KeyE', 90); await sleep(600);          // 直接选 EASY
await shot('60_difficulty_easy.png');
log('DIFF_PANEL', JSON.stringify(await T.eval(`document.querySelector('#overlay h1')?.innerText`)));
await T.key('Enter', 90); await sleep(650);          // 难度确认 → 角色
await shot('61_charselect.png');
await T.eval(`__mark('charselect')`);
await T.key('Enter', 90); await sleep(900);          // 选灵梦
await T.eval(`__mark('charEnter')`);
const dlgN = await advance('62_opening', 40);
await T.eval(`__mark('dialogueDone')`);
await sleep(400);
const s1 = await S();
await T.eval(`__mark('playStart')`);
log('OPENING_ADV', dlgN, JSON.stringify(s1));
await shot('63_stage_easy_start.png');

/* Esc 在道中对话里的行为（等第一次道中对话出现时测） */
let midEscTested = false, pauseDone = false, focusDone = false;

const jump = async (h = 150) => T.key('Space', h);
const dash = async () => T.key('KeyK', 85);
await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
let marks = { 6000: false, 12000: false, 17000: false, boss: false, bossFight: false, cutin: false, low: false };
let lastX = 0, stuckT = 0, t0 = Date.now(), lastLog = 0, escBoss = false, gameover = false;
let combat = false;

while (Date.now() - t0 < 290000) {
  const s = await S();
  const el = (Date.now() - t0) / 1000;
  if (s.st === 'gameover') { gameover = true; break; }
  if (s.dlg) {
    await T.keyUp('ArrowRight'); await T.keyUp('KeyZ');
    if (!midEscTested) {
      midEscTested = true;
      await T.key('Escape', 100); await sleep(450);
      const e = await S();
      log('ESC_IN_MID_DIALOGUE', JSON.stringify({ st: e.st, dlg: e.dlg, panel: e.panelTitle, hidden: e.overlayHidden }));
      await shot('64_esc_mid_dialogue.png');
    }
    await T.key('Enter', 80); await sleep(280);
    await T.key('Enter', 80); await sleep(240);
    const d = await S();
    if (!d.dlg && !combat) { await T.keyDown('ArrowRight'); await T.keyDown('KeyZ'); }
    continue;
  }
  if (s.boss && !combat) {
    combat = true;
    await T.keyUp('ArrowRight');
    await shot('70_boss_arrive.png');
    log('BOSS_ARRIVE', JSON.stringify(s));
  }
  if (!pauseDone && el > 12) {
    pauseDone = true;
    await T.keyUp('ArrowRight'); await T.keyUp('KeyZ');
    await T.key('Escape', 100); await sleep(700);
    await shot('65_pause_menu.png');
    log('PAUSE_TEXT', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,300)`)));
    // 逐项：↓ 设置 Enter
    await press('ArrowDown'); await T.key('Enter', 90); await sleep(800);
    log('PAUSE_SETTINGS', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,700)`)));
    await shot('66_pause_settings.png');
    // 设置里找「重新开始本关」行是否存在
    await T.key('Escape', 100); await sleep(650);
    const backP = await S();
    log('BACK_TO_PAUSE', JSON.stringify({ panel: backP.panelTitle, hidden: backP.overlayHidden }));
    await press('ArrowDown'); await sleep(150);
    await T.key('Enter', 90); await sleep(700);
    log('QUIT_CONFIRM', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,300)`)));
    await shot('67_quit_confirm.png');
    await T.key('Escape', 100); await sleep(600);   // 取消
    const afterCancel = await S();
    log('AFTER_CANCEL', JSON.stringify({ panel: afterCancel.panelTitle }));
    await T.key('Escape', 100); await sleep(600);   // 继续游戏
    const resumed = await S();
    log('RESUMED', JSON.stringify({ st: resumed.st, hidden: resumed.overlayHidden }));
    await shot('68_resumed.png');
    await T.keyDown('ArrowRight'); await T.keyDown('KeyZ');
  }
  if (!focusDone && el > 18) {
    focusDone = true;
    await T.keyUp('ArrowRight'); await T.keyDown('ShiftLeft');
    await sleep(700); await shot('69_focus_hitbox.png');
    await T.keyUp('ShiftLeft'); await T.keyDown('ArrowRight');
    await press('KeyX'); await sleep(220); await shot('69b_spell_cutin_stage.png');
    log('STAGE_SPELL', JSON.stringify(await S()));
  }
  if (combat) {
    // Boss 战：按住射击 + 左右交替 + 跳
    if (!escBoss && Date.now() - t0 > 0) {
      escBoss = true;
      await T.keyUp('ArrowRight'); await T.key('Escape', 100); await sleep(650);
      await shot('71_esc_in_boss.png');
      log('ESC_IN_BOSS', JSON.stringify(await S()));
      await T.key('Escape', 100); await sleep(500);
    }
    await T.keyDown('KeyZ');
    const dir = Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight';
    await T.keyDown(dir); await sleep(320); await T.keyUp(dir);
    if (Math.random() < 0.5) await jump(140);
    if (Math.random() < 0.25) await dash();
    if ((s.power || 0) >= 24) { await T.key('KeyX', 90); await sleep(150); await shot('72_spell_cutin_boss.png'); }
    if (!marks.bossFight) { marks.bossFight = true; await shot('73_boss_fight.png'); }
    if (s.boss && s.boss.hp < 60 && !marks.low) { marks.low = true; await shot('74_boss_lowhp.png'); }
    await sleep(300);
    continue;
  }
  // 道中推进
  if (Math.random() < 0.75) await jump(140 + Math.random() * 80);
  if (Math.random() < 0.3) await dash();
  if ((s.power || 0) >= 24) { await T.key('KeyX', 90); await sleep(200); }
  // 里程碑截图
  if (s.x > 6000 && !marks[6000]) { marks[6000] = true; await shot('75_x6000.png'); }
  if (s.x > 12000 && !marks[12000]) { marks[12000] = true; await shot('76_x12000.png'); }
  if (s.x > 17000 && !marks[17000]) { marks[17000] = true; await shot('77_x17000.png'); }
  if (Date.now() - lastLog > 4000) { lastLog = Date.now(); log('T' + el.toFixed(0), JSON.stringify({ st: s.st, x: s.x, w: s.w, hearts: s.hearts, lives: s.lives, power: s.power, boss: s.boss, fps: s.fps })); }
  if (Math.abs(s.x - lastX) < 12) stuckT += 600; else stuckT = 0;
  lastX = s.x;
  if (stuckT >= 1800) { await jump(180); await jump(180); await dash(); stuckT = 0; }
  await sleep(600);
}
await T.keyUp('ArrowRight'); await T.keyUp('KeyZ');
const fin = await S();
log('END', JSON.stringify(fin));
await shot('78_end.png');
if (fin.st === 'gameover' || gameover) {
  await shot('79_gameover.png');
  log('GAMEOVER_TEXT', JSON.stringify(await T.eval(`document.getElementById('overlay').innerText.slice(0,500)`)));
}
const fp = await readFrameProbe(T);
log('FRAME_PROBE', JSON.stringify(fp));
log('MARKS', JSON.stringify(await T.eval(`window.__marks`)));
log('REPORT_SHORT', JSON.stringify({ errors: (await T.report()).errors, warns: await T.eval(`window.__game ? [] : []`) }));
await T.close();
