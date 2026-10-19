/**
 * flow-menu：FM-1 修复回归——真实残机耗尽路径的 gameover 键盘连通性
 * 覆盖：真实死亡→gameover→↑↓切按钮→Enter 重新挑战→再死亡→Esc 回标题；
 *       鼠标点「返回标题」；伪造 EXTRA 解锁后 EXTRA 内死亡→Enter 再战 / Esc 回标题。
 * 端口 9411。
 */
import { launch, sleep, saveJson, makeChecks } from './_pt_core.mjs';
import { bootFresh, reloadWait, pageInfo, gameSnap, advanceToPlay, clickText, DIR, shot } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const { chk, rows, sum } = makeChecks();
const log = (...a) => console.log('[go-real]', ...a);

// 真实死亡：残机压到 1 → die() → 驱动 update 直到离开 play（stage._respawn 失败 → gameover）
const killPlayer = `(() => {
  const g = window.__game, p = g.stage && g.stage.player;
  if (!p) return { error: 'no player', state: g.state };
  p.lives = 1; p.invuln = 0; p.die();
  for (let i = 0; i < 500 && g.state === 'play'; i++) g.update(1 / 60);
  return { state: g.state, playerLives: p.lives, alive: p.alive };
})()`;

try {
  await bootFresh(T);
  // ---- A. 普通关：真实死亡 → gameover ----
  await T.key('Enter'); await sleep(380);      // 开始游戏 → 难度
  await T.key('Enter'); await sleep(420);      // 默认难度 → 选人
  await T.key('Digit1'); await sleep(500);     // 灵梦
  const toPlay = await advanceToPlay(T, 90);
  const inPlay = await gameSnap(T);
  chk(toPlay && inPlay.state === 'play', 'G0 进入 play 且拿到 stage.player', { state: inPlay.state, level: inPlay.level });

  const drv1 = await T.eval(killPlayer);
  await sleep(700);
  const go1 = await pageInfo(T);
  const go1G = await gameSnap(T);
  await shot(T, '90-real-gameover.png');
  log('A real gameover:', JSON.stringify({ drv1, title: go1.title, state: go1G.state }));
  chk(go1.title === '游戏结束' && go1G.state === 'gameover', 'G1 真实残机耗尽进入「游戏结束」', { title: go1.title, state: go1G.state, drv1 });

  // ↑↓ 切按钮（鼠标先到中性位，避免 pointerenter 改选中）
  await T.mouse(640, 8); await sleep(140);
  const go1Def = await pageInfo(T);
  await T.key('ArrowDown'); await sleep(220);
  const go1Down = await pageInfo(T);
  await T.key('ArrowUp'); await sleep(220);
  const go1Up = await pageInfo(T);
  await shot(T, '90-real-nav.png');
  log('A nav:', JSON.stringify({ def: go1Def.menuIndex, down: go1Down.menuIndex, up: go1Up.menuIndex }));
  chk(go1Def.menuIndex === 0, 'G2 gameover 默认选中「重新挑战本关」', go1Def.menuIndex);
  chk(go1Down.menuIndex === 1, 'G3 gameover ↓ 切到「返回标题」', go1Down.menuIndex);
  chk(go1Up.menuIndex === 0, 'G4 gameover ↑ 切回「重新挑战本关」', go1Up.menuIndex);

  // Enter = 重新挑战本关
  await T.key('Enter'); await sleep(900);
  const retry1 = await gameSnap(T);
  const retry1P = await pageInfo(T);
  await shot(T, '90-real-retry.png');
  log('A retry:', JSON.stringify({ state: retry1.state, level: retry1.level, overlayHidden: retry1P.overlayHidden }));
  chk(retry1.state === 'play', 'G5 真实 gameover 页 Enter 重新挑战 → 回到 play', { state: retry1.state, level: retry1.level });

  // 再真实死亡 → Esc 回标题
  const drv2 = await T.eval(killPlayer);
  await sleep(700);
  const go2 = await pageInfo(T);
  const go2G = await gameSnap(T);
  log('A death2:', JSON.stringify({ drv2, title: go2.title, state: go2G.state }));
  chk(go2.title === '游戏结束' && go2G.state === 'gameover', 'G6 重新挑战后再次真实死亡 → 仍是「游戏结束」', { title: go2.title, state: go2G.state });
  await T.key('Escape'); await sleep(600);
  const escTitle = await pageInfo(T);
  const escTitleG = await gameSnap(T);
  await shot(T, '90-real-esc-title.png');
  log('A esc:', JSON.stringify({ title: escTitle.title, state: escTitleG.state }));
  chk(escTitle.title === '東方新紀行' && escTitleG.state === 'menu', 'G7 真实 gameover 页 Esc → 返回标题', { title: escTitle.title, state: escTitleG.state });

  // ---- B. 鼠标路径：play 中强制 gameover → 点「返回标题」 ----
  await reloadWait(T);
  await T.key('Enter'); await sleep(380);
  await T.key('Enter'); await sleep(420);
  await T.key('Digit1'); await sleep(500);
  await advanceToPlay(T, 90);
  await T.eval('window.__game._onGameOver()');
  await sleep(500);
  const goMouse = await pageInfo(T);
  await shot(T, '90-real-mouse-gameover.png');
  await T.mouse(640, 8); await sleep(120);
  await clickText(T, '返回标题'); await sleep(600);
  const mouseBack = await pageInfo(T);
  await shot(T, '90-real-mouse-title.png');
  log('B mouse:', JSON.stringify({ goTitle: goMouse.title, backTitle: mouseBack.title }));
  chk(goMouse.title === '游戏结束' && mouseBack.title === '東方新紀行', 'G8 鼠标点击 gameover「返回标题」可回标题', { goTitle: goMouse.title, backTitle: mouseBack.title });

  // ---- C. EXTRA 内 gameover：伪造解锁存档 → KeyE → 真实死亡 → Enter 再战 / Esc 回标题 ----
  await T.eval("localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'reimu' }))");
  await reloadWait(T);
  const titleExtra = await pageInfo(T);
  log('C title EXTRA:', JSON.stringify(titleExtra.buttons[1]));
  chk(titleExtra.buttons[1] && titleExtra.buttons[1].disabled !== true && !String(titleExtra.buttons[1].cls || '').includes('locked'),
    'G9 伪造解锁后标题 EXTRA 入口解锁（非 locked）', titleExtra.buttons[1]);
  await T.key('KeyE'); await sleep(700);
  const extraStart = await gameSnap(T);
  const extraStartP = await pageInfo(T);
  log('C startExtra:', JSON.stringify({ state: extraStart.state, inExtra: extraStart.inExtra, title: extraStartP.title }));
  const extraPlay = await advanceToPlay(T, 120);
  const extraPlayG = await gameSnap(T);
  await shot(T, '90-extra-play.png');
  chk(extraPlay && extraPlayG.state === 'play' && extraPlayG.inExtra === true, 'G10 EXTRA 已进入 play（inExtra=true）', { state: extraPlayG.state, inExtra: extraPlayG.inExtra, level: extraPlayG.level });

  const drvE1 = await T.eval(killPlayer);
  await sleep(700);
  const extraGo = await pageInfo(T);
  const extraGoG = await gameSnap(T);
  await shot(T, '90-extra-gameover.png');
  log('C extra gameover:', JSON.stringify({ drvE1, title: extraGo.title, state: extraGoG.state }));
  chk(extraGo.title === '游戏结束' && extraGoG.state === 'gameover', 'G11 EXTRA 内真实死亡 → gameover', { title: extraGo.title, state: extraGoG.state });
  await T.key('Enter'); await sleep(1200);
  const extraRetry = await gameSnap(T);
  const extraRetryP = await pageInfo(T);
  await shot(T, '90-extra-retry.png');
  log('C extra retry:', JSON.stringify({ state: extraRetry.state, inExtra: extraRetry.inExtra, overlayHidden: extraRetryP.overlayHidden }));
  chk(extraRetry.state === 'play', 'G12 EXTRA gameover 页 Enter 再战 → 回到 play', { state: extraRetry.state, inExtra: extraRetry.inExtra });

  const drvE2 = await T.eval(killPlayer);
  await sleep(700);
  const extraGo2 = await pageInfo(T);
  await T.key('Escape'); await sleep(700);
  const extraEscTitle = await pageInfo(T);
  const extraEscG = await gameSnap(T);
  await shot(T, '90-extra-esc-title.png');
  log('C extra esc:', JSON.stringify({ drvE2, go2: extraGo2.title, title: extraEscTitle.title, state: extraEscG.state }));
  chk(extraGo2.title === '游戏结束' && extraEscTitle.title === '東方新紀行' && extraEscG.state === 'menu',
    'G13 EXTRA gameover 页 Esc → 返回标题', { go2: extraGo2.title, title: extraEscTitle.title, state: extraEscG.state });

  const sumd = sum();
  for (const r of sumd.rows) if (!r.ok) log('FAIL', r.name, r.detail);
  saveJson(`${DIR}/part_gameover_real.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows });
  log('RESULT', sumd.pass, 'pass /', sumd.fail, 'fail');
} catch (e) {
  const sumd = sum();
  saveJson(`${DIR}/part_gameover_real.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows, fatal: String(e) });
  console.log('[go-real] FATAL', e);
  process.exitCode = 1;
} finally {
  await T.close();
}
