/**
 * flow-menu：FC-1 修复回归——EXTRA 内 GameOver 按钮文案与实际检查点恢复一致
 *
 * 覆盖：
 *  - 中途 Boss（雷米莉亚）战失败：按钮写「从雷米莉亚战的检查点继续」，脚注含 3:00；
 *    Enter 再战后 _startExtraStage({resumeFrom:'midboss'}) → extraT≈180、boss=remilia、midbossDone=false、火力≥12。
 *  - 终盘（芙兰）战失败：按钮写「从芙兰战的检查点继续」，脚注含 6:00；
 *    鼠标点按钮后 extraT≈360、boss=flandre、midbossDone=true。
 *  - 两轮互换键盘/鼠标路径；EXTRA 内再次死亡后 Esc / 点击「返回标题」仍正常（FM-1 不回归）。
 *
 * 说明：为控制 headless 时长，用 stage.beginBoss('remilia',{midboss:true}) 与 stage.midbossDone=true
 * 构造与真实战斗相同的 stage 字段；从 _onGameOver() → 按钮 → _retryStage() → _startExtraStage(resumeFrom)
 * 全部走真实代码路径。端口 9411。
 */
import { launch, sleep, saveJson, makeChecks } from './_pt_core.mjs';
import { bootFresh, reloadWait, pageInfo, shot, DIR, advanceToPlay, clickText } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const { chk, rows } = makeChecks();
const sum = () => ({ pass: rows.filter((r) => r.ok).length, fail: rows.filter((r) => !r.ok).length, rows });
const log = (...a) => console.log('[extra-retry]', ...a);

/** 真实残机耗尽：残机压到 1 → die() → 驱动 update 到 gameover */
const killPlayer = `(() => {
  const g = window.__game, p = g.stage && g.stage.player;
  if (!p) return { error: 'no player', state: g.state };
  p.lives = 1; p.invuln = 0; p.die();
  for (let i = 0; i < 500 && g.state === 'play'; i++) g.update(1 / 60);
  return { state: g.state, playerLives: p.lives, alive: p.alive };
})()`;

const extraSnap = `(() => {
  const g = window.__game, s = g.stage;
  return {
    state: g.state, inExtra: !!g.inExtra,
    extraT: s && s.extraT != null ? +s.extraT.toFixed(2) : null,
    midbossDone: s?.midbossDone ?? null, bossStarted: s?.bossStarted ?? null,
    bossKey: s?.boss?.key ?? null, bossName: s?.boss?.def?.name ?? null,
    power: s?.player?.power ?? null, stgScroll: s?.stg?.scroll ?? null,
  };
})()`;

async function enterExtraPlay() {
  const title = await pageInfo(T);
  if (title.title !== '東方新紀行') throw new Error(`不在标题页：${title.title}`);
  await T.mouse(640, 8); await sleep(120);
  await T.key('KeyE'); await sleep(800);
  const ok = await advanceToPlay(T, 140);
  await sleep(350);
  const s = await T.eval(extraSnap);
  chk(ok && s.state === 'play' && s.inExtra === true, 'EXTRA 进入 play（inExtra=true）', s);
  return s;
}

async function setupMidboss() {
  const s = await T.eval(`(() => {
    const g = window.__game, s = g.stage;
    s.beginBoss('remilia', { midboss: true });
    return { bossStarted: s.bossStarted, bossMid: s.bossMid, bossKey: s.boss?.key, midbossDone: s.midbossDone, extraT: +s.extraT.toFixed(2), state: g.state };
  })()`);
  await sleep(250);
  return s;
}

async function setupFinal() {
  const s = await T.eval(`(() => {
    const g = window.__game, s = g.stage;
    s.midbossDone = true; s.bossStarted = false; s.boss = null; s.state = 'play';
    return { bossStarted: s.bossStarted, midbossDone: s.midbossDone, extraT: +s.extraT.toFixed(2), state: g.state };
  })()`);
  await sleep(200);
  return s;
}

async function dieToGameOver() {
  const drv = await T.eval(killPlayer);
  await sleep(750);
  const p = await pageInfo(T);
  const s = await T.eval(extraSnap);
  return { drv, page: p, snap: s };
}

/** 量测首个按钮的 label 与右侧键帽是否重叠（长文案在旧面板 .k 是绝对定位） */
const labelFit = `(() => {
  const b = document.querySelectorAll('#buttons button')[0];
  const l = b && b.querySelector('.label');
  const k = b && b.querySelector('.k');
  if (!l || !k) return null;
  const lr = l.getBoundingClientRect(), kr = k.getBoundingClientRect();
  return { label: l.textContent, labelRight: +lr.right.toFixed(1), kLeft: +kr.left.toFixed(1), gap: +(kr.left - lr.right).toFixed(1), vw: innerWidth };
})()`;

try {
  await bootFresh(T);
  await T.eval("localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'reimu' }))");
  await reloadWait(T);
  const title = await pageInfo(T);
  chk(title.buttons[1] && title.buttons[1].disabled !== true && !String(title.buttons[1].cls || '').includes('locked'),
    'F1 伪造解锁存档后标题 EXTRA 可进入', title.buttons[1]);

  for (const round of [1, 2]) {
    const midPath = round === 1 ? 'keyboard' : 'mouse';
    const finalPath = round === 1 ? 'mouse' : 'keyboard';
    log(`==== round ${round}: mid=${midPath}, final=${finalPath} ====`);

    /* ---------- A. 中途 Boss（雷米莉亚）失败 ---------- */
    await enterExtraPlay();
    const midSetup = await setupMidboss();
    chk(midSetup.bossStarted === true && midSetup.bossKey === 'remilia' && midSetup.midbossDone === false,
      `F2.${round} 构造中途 Boss 战状态（remilia / midboss）`, midSetup);
    const midGo = await dieToGameOver();
    await shot(T, `96-${round}-extra-mid-gameover.png`);
    log('mid gameover:', JSON.stringify({ drv: midGo.drv, title: midGo.page.title, state: midGo.snap.state, btn: midGo.page.buttons[0], hint: midGo.page.hint }));
    chk(midGo.page.title === '游戏结束' && midGo.snap.state === 'gameover',
      `F3.${round} 中途 Boss 战失败 → 游戏结束面板`, { title: midGo.page.title, state: midGo.snap.state, drv: midGo.drv });
    chk(midGo.page.buttons[0] && midGo.page.buttons[0].label === '从雷米莉亚战继续',
      `F4.${round} 中途失败按钮文案 =「从雷米莉亚战继续」`, midGo.page.buttons[0]);
    chk(String(midGo.page.hint || '').includes('3:00') && String(midGo.page.hint || '').includes('雷米莉亚'),
      `F5.${round} 脚注说明从 3:00 雷米莉亚战检查点继续`, midGo.page.hint);
    const midFit = await T.eval(labelFit);
    chk(midFit && midFit.gap >= 2, `F5b.${round} 中途按钮文案不与 ENTER 键帽重叠（1280）`, JSON.stringify(midFit));
    if (round === 1) {
      await T.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
      await sleep(450);
      const f960 = await T.eval(labelFit);
      chk(f960 && f960.gap >= 2, 'F5c.1 960x540 下中途按钮文案仍不与键帽重叠', JSON.stringify(f960));
      await shot(T, '96-1-extra-mid-gameover-960.png');
      await T.send('Emulation.clearDeviceMetricsOverride', {});
      await sleep(450);
    }

    await T.mouse(640, 8); await sleep(140);
    if (midPath === 'keyboard') { await T.key('Enter'); }
    else { const c = await clickText(T, '雷米莉亚战继续'); chk(c.found, `F6.${round} 鼠标找到中途检查点按钮`, JSON.stringify(c)); }
    await sleep(1400);
    const midAfter = await T.eval(extraSnap);
    await shot(T, `96-${round}-extra-mid-retry.png`);
    log('mid retry:', JSON.stringify(midAfter));
    chk(midAfter.state === 'play' && midAfter.inExtra === true, `F7.${round} 中途再战回到 play（inExtra）`, midAfter);
    chk(midAfter.extraT >= 179 && midAfter.extraT <= 181.5, `F8.${round} 中途再战从 3:00 检查点接上`, { extraT: midAfter.extraT });
    chk(midAfter.midbossDone === false && midAfter.bossStarted === true && midAfter.bossKey === 'remilia',
      `F9.${round} 中途再战直接回到雷米莉亚战`, { midbossDone: midAfter.midbossDone, bossStarted: midAfter.bossStarted, bossKey: midAfter.bossKey });
    chk(midAfter.power >= 12, `F10.${round} 中途再战火力 = retryPower(12) 以上`, { power: midAfter.power });

    // 中途再战后再死 → Esc 回标题（EXTRA 内 FM-1 仍正常）
    const midGo2 = await dieToGameOver();
    await T.key('Escape'); await sleep(750);
    const midBack = await pageInfo(T);
    log('mid esc:', JSON.stringify({ reGo: midGo2.page.title, backTitle: midBack.title }));
    chk(midGo2.page.title === '游戏结束' && midBack.title === '東方新紀行', `F11.${round} 中途再战后再死 Esc → 回标题`, { go: midGo2.page.title, title: midBack.title });

    /* ---------- B. 终盘（芙兰）战失败 ---------- */
    await enterExtraPlay();
    const finSetup = await setupFinal();
    chk(finSetup.midbossDone === true && finSetup.bossStarted === false, `F12.${round} 构造终盘阶段状态（midbossDone）`, finSetup);
    const finGo = await dieToGameOver();
    await shot(T, `97-${round}-extra-final-gameover.png`);
    log('final gameover:', JSON.stringify({ drv: finGo.drv, title: finGo.page.title, btn: finGo.page.buttons[0], hint: finGo.page.hint }));
    chk(finGo.page.title === '游戏结束' && finGo.snap.state === 'gameover', `F13.${round} 终盘阶段失败 → 游戏结束面板`, { title: finGo.page.title });
    chk(finGo.page.buttons[0] && finGo.page.buttons[0].label === '从芙兰战继续',
      `F14.${round} 终盘失败按钮文案 =「从芙兰战继续」`, finGo.page.buttons[0]);
    chk(String(finGo.page.hint || '').includes('6:00') && String(finGo.page.hint || '').includes('芙兰'),
      `F15.${round} 脚注说明从 6:00 芙兰战检查点继续`, finGo.page.hint);
    const finFit = await T.eval(labelFit);
    chk(finFit && finFit.gap >= 2, `F15b.${round} 终盘按钮文案不与 ENTER 键帽重叠（1280）`, JSON.stringify(finFit));
    if (round === 2) {
      await T.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
      await sleep(450);
      const f960 = await T.eval(labelFit);
      chk(f960 && f960.gap >= 2, 'F15c.2 960x540 下终盘按钮文案仍不与键帽重叠', JSON.stringify(f960));
      await shot(T, '97-2-extra-final-gameover-960.png');
      await T.send('Emulation.clearDeviceMetricsOverride', {});
      await sleep(450);
    }

    await T.mouse(640, 8); await sleep(140);
    if (finalPath === 'keyboard') { await T.key('Enter'); }
    else { const c = await clickText(T, '芙兰战继续'); chk(c.found, `F16.${round} 鼠标找到终盘检查点按钮`, JSON.stringify(c)); }
    await sleep(1400);
    const finAfter = await T.eval(extraSnap);
    await shot(T, `97-${round}-extra-final-retry.png`);
    log('final retry:', JSON.stringify(finAfter));
    chk(finAfter.state === 'play' && finAfter.inExtra === true, `F17.${round} 终盘再战回到 play（inExtra）`, finAfter);
    chk(finAfter.extraT >= 359.5 && finAfter.extraT <= 361.5, `F18.${round} 终盘再战从 6:00 检查点接上`, { extraT: finAfter.extraT });
    chk(finAfter.midbossDone === true && finAfter.bossStarted === true && finAfter.bossKey === 'flandre',
      `F19.${round} 终盘再战直接回到芙兰战`, { midbossDone: finAfter.midbossDone, bossStarted: finAfter.bossStarted, bossKey: finAfter.bossKey });

    // 终盘再战后再死 → 鼠标点「返回标题」
    const finGo2 = await dieToGameOver();
    await T.mouse(640, 8); await sleep(120);
    const c = await clickText(T, '返回标题'); await sleep(800);
    const finBack = await pageInfo(T);
    log('final mouse back:', JSON.stringify({ reGo: finGo2.page.title, backTitle: finBack.title, click: c }));
    chk(finGo2.page.title === '游戏结束' && finBack.title === '東方新紀行', `F20.${round} 终盘再战后再死 → 鼠标「返回标题」回标题`, { go: finGo2.page.title, title: finBack.title });
  }

  const sumd = sum();
  for (const r of sumd.rows) if (!r.ok) log('FAIL', r.name, JSON.stringify(r.detail));
  saveJson(`${DIR}/part_extra_retry.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows });
  log('RESULT', sumd.pass, 'pass /', sumd.fail, 'fail');
} catch (e) {
  const sumd = sum();
  saveJson(`${DIR}/part_extra_retry.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows, fatal: String(e) });
  console.log('[extra-retry] FATAL', e);
  process.exitCode = 1;
} finally {
  await T.close();
}
