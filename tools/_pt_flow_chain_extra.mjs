/**
 * flow-chain EXTRA：零火力 / 3:00 雷米莉亚 / 6:00 芙兰(10 符卡) / W1 结局 /
 * EXTRA 失败后 resumeFrom 重开（midboss、final 两分支）/ 退出重进无残留 / 持久化。
 * 预置 hks.progress.v1 解锁直测 EXTRA（解锁本身由 normal 脚本真实通关验证）。
 */
import * as L from './_pt_flow_chain_lib.mjs';
import { sleep } from './_pt_core.mjs';

const SECTION = 'extra';
const PORT = 9413;
const log = (m) => console.log(`[extra ${new Date().toISOString().slice(11, 19)}] ${m}`);
const steps = [];
const R = new L.Run(SECTION, null);
const T = await L.openGame({ port: PORT, clearStorage: true });
R.T = T;
const processGuard = (err) => { log(`未捕获: ${err && err.stack || err}`); try { T.close(); } catch (e) {} process.exit(1); };
process.on('uncaughtException', processGuard);
process.on('unhandledRejection', processGuard);

const step = async (name, fn) => {
  steps.push(name); log(`开始步骤 ${name}`);
  const t0 = Date.now();
  try { await fn(); log(`完成步骤 ${name}（${((Date.now() - t0) / 1000).toFixed(1)}s）`); }
  catch (e) {
    log(`步骤异常 ${name}: ${e && e.message}`);
    R.chk(false, `步骤异常:${name}`, String(e && e.message || e));
    if (e && e.state) R.snap(`err_${steps.length}`, e.state);
    try { await R.shot(`err_${steps.length}`); } catch (e2) { /* ignore */ }
  }
};

R.accelNote('预置 hks.progress.v1 解锁 EXTRA（解锁写盘由 normal 脚本真实通关验证）；道中用 stage.extraT 快进到 179/359，180/360 的 remilia/flandre 触发仍由 _updateExtraTimeline 真实判定；Boss 击杀走 boss.damage(spellHp+1) 真实逐卡路径（defeatT=2.25 跳过 2.2s 动画）；EXTRA 失败用 p.lives=1/hearts=1/hurt(1) 走真实 gameover→_retryStage→resumeExtra 分支；对白全部真实 Enter。');

const PLAY = `s.state === 'play' && s.st && s.st.state === 'play'`;
const timerOf = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const shotsActive = () => T.eval(`(() => { const st = window.__game.stage; if (!st || !st.shots || !st.shots.pool) return -1; return st.shots.pool.filter((b) => b.active).length; })()`);
const playerSX = () => T.eval(`(() => { const p = window.__game.stage && window.__game.stage.player; return p ? { sx: Math.round(p.sx), worldX: Math.round(p.worldX), power: +(+p.power).toFixed(1) } : null; })()`);

async function enterExtra({ expectZero = true } = {}) {
  await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'EXTRA 标题页', press: false });
  await T.key('KeyE', 22); await sleep(260);
  const started = await L.observe(T, `s.inExtra === true`, { timeout: 15000, pollMs: 100 });
  R.chk(!!started, '标题按 EXTRA 热键进入 EXTRA（inExtra=true）', started ? `state=${started.state}` : '15s 内未进入');
  const st = await L.drive(T, PLAY, { timeout: 150000, label: 'EXTRA 道中开始' });
  if (expectZero) {
    R.chk(st.st.extra === true && st.st.mode === 'stg', 'EXTRA 关卡：extra=true、mode=stg', `${st.st.extra}/${st.st.mode}`);
    R.chk(st.carryPower === 0 && st.st.player.power === 0, 'EXTRA 零火力开局（carryPower=0、player.power=0）', `carry=${st.carryPower} power=${st.st.player.power}`);
    R.chk(String(st.hud.power) === '0', 'HUD POWER 显示 0', `hud=${st.hud.power}`);
    R.chk(st.hud.stage === 'EXTRA', 'HUD 关卡名=EXTRA', `hud=${st.hud.stage}`);
    R.chk(/^0:0\d$/.test(String(st.hud.timer)), 'EXTRA 计时从 0:00 开始', `timer=${st.hud.timer}`);
    R.chk(st.st.extraT < 5 && st.st.stg && st.st.stg.scroll < 3000, 'EXTRA 时间轴/滚动条从 0 开始', `extraT=${st.st.extraT} scroll=${st.st.stg && st.st.stg.scroll}`);
    R.chk(st.st.stg && st.st.stg.waves > 0 && st.st.stg.spawnPaused === false, '6 分钟道中波次表已建立且未暂停', JSON.stringify(st.st.stg));
  }
  return st;
}

async function shotDuring() {
  const t0 = Date.now();
  while (Date.now() - t0 < 3000) {
    const n = await shotsActive();
    if (n > 0) return n;
    await sleep(90);
  }
  return 0;
}

try {
  log('boot，预置 EXTRA 解锁存档');
  await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '标题页', press: false });
  await T.eval(`(() => { localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'reimu' })); return 1; })()`);
  await T.reload();
  await T.waitFor('!!window.__game', 30000);
  await sleep(500);
  const pre = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '预置存档后标题', press: false });
  R.chk(pre.unlockedExtra === true && pre.extraChar === 'reimu', '预置存档后 EXTRA 已解锁且角色=灵梦', `unlocked=${pre.unlockedExtra} char=${pre.extraChar}`);
  const preEb = (pre.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
  R.chk(!!preEb && preEb.disabled === false, '标题「禁忌的祭典」可点击', JSON.stringify(preEb));
  R.snap('X1_title_unlocked', pre);
  await R.shot('X1_title_unlocked');

  /* ============ A. 进入 EXTRA：零火力 + 道中可玩内容 ============ */
  let st = null;
  await step('EXTRA 进入与零火力道中', async () => {
    st = await enterExtra();
    R.snap('X2_extra_start', st);
    await R.shot('X2_extra_start');
    // 道中确有敌人 + 零火力仍能开火
    const enemies = await L.observe(T, `s.st.stgEnemies > 0`, { timeout: 8000, pollMs: 120 });
    R.chk(!!enemies, 'EXTRA 道中有实际敌人生成', enemies ? `stgEnemies=${enemies.st.stgEnemies} waveIdx=${enemies.st.stg.waveIdx}` : '8s 内无敌人');
    const sx0 = await playerSX();
    await T.keyDown('ArrowRight');
    await sleep(420);
    const sx1 = await playerSX();
    await T.keyDown('KeyZ');
    const firing = await shotDuring();
    await sleep(380);
    await T.keyUp('KeyZ');
    await T.keyUp('ArrowRight');
    R.chk(sx0 && sx1 && sx1.sx > sx0.sx + 4, 'EXTRA 道中可移动（→ 位移）', `sx ${sx0 && sx0.sx} → ${sx1 && sx1.sx}`);
    R.chk(firing > 0, 'EXTRA 零火力状态下仍可开火（有玩家子弹）', `shots=${firing}`);
    const hud2 = await L.read(T);
    R.info('EXTRA 道中计时', `extraT=${hud2.st.extraT} HUD=${hud2.hud.timer} 期望=${timerOf(hud2.st.extraT)}`);
    R.chk(hud2.hud.timer === timerOf(hud2.st.extraT), 'EXTRA HUD 计时与 extraT 一致', `hud=${hud2.hud.timer} extraT=${hud2.st.extraT}`);
    R.snap('X3_extra_play', hud2);
    await R.shot('X3_extra_play');
  });

  /* ============ B. 暂停退出 EXTRA → 回标题 → 重进（无跨局残留） ============ */
  await step('EXTRA 暂停退出与重进', async () => {
    await T.key('Escape', 22); await sleep(400);
    const pause = await L.read(T);
    R.chk(pause.state === 'paused' && pause.title === '暂停', 'EXTRA 中 Esc 暂停', `${pause.state}/${pause.title}`);
    const psub = await T.eval(`String(document.getElementById('subtitle').textContent||'').trim()`);
    R.chk(/难度 EXTRA/.test(psub), '暂停面板难度显示 EXTRA', psub);
    R.snap('X4_extra_pause', pause);
    await R.shot('X4_extra_pause');
    await T.key('KeyQ', 22);
    await L.drive(T, `document.getElementById('title').textContent === '退出到标题'`, { timeout: 20000, label: '退出确认页', press: false });
    await T.key('KeyQ', 22);
    const title = await L.drive(T, `s.state === 'menu' && s.st === null`, { timeout: 30000, label: 'EXTRA 退出到标题', press: false });
    R.chk(title.inExtra === false && title.st === null, 'EXTRA 退出到标题：inExtra=false、stage=null', `inExtra=${title.inExtra} stage=${title.st}`);
    R.chk((await T.eval(`document.getElementById('hud').classList.contains('hidden')`)) === true, '退出 EXTRA 后 HUD 隐藏', '');
    R.chk(title.unlockedExtra === true, '退出 EXTRA 不损失解锁状态', `unlocked=${title.unlockedExtra}`);

    const again = await enterExtra();
    R.chk(again.st.player.power === 0 && again.carryPower === 0, '重进 EXTRA 仍是零火力（无上一局 carry 残留）', `power=${again.st.player.power} carry=${again.carryPower}`);
    R.chk(!again.st.boss && again.st.bossStarted === false && again.st.state === 'play', '重进 EXTRA 无上一局 Boss/关卡状态残留', `boss=${again.st.boss && again.st.boss.key} started=${again.st.bossStarted}`);
    R.info('重进 EXTRA 道中弹幕', `bullets=${again.st.bullets}（道中波次会自然出生子弹，非跨局残留；time=${again.st.extraT.toFixed(2)}）`);
    await L.ensureInvuln(T);
  });

  /* ============ C. 3:00 中途 Boss 雷米莉亚 ============ */
  let midPendingT = null, midBoss = null;
  await step('3:00 中途 Boss 雷米莉亚', async () => {
    await L.drive(T, PLAY, { timeout: 30000, label: '快进前 play' });
    const w = await L.warpExtraClock(T, 179);
    R.info('EXTRA 道中拨表', JSON.stringify(w));
    await sleep(250);
    const t179 = await L.read(T);
    R.chk(t179.hud.timer === timerOf(t179.st.extraT), '拨表到 179 后 HUD 计时一致（2:59）', `hud=${t179.hud.timer} extraT=${t179.st.extraT}`);
    const trig = await L.drive(T, `s.st.bossStarted === true && s.st.boss`, {
      timeout: 120000, label: '3:00 雷米莉亚登场',
      onTick: (x) => { if (midPendingT == null && x.st && x.st.bossPending) midPendingT = x.st.extraT; },
    });
    midBoss = trig;
    R.chk(midPendingT != null && midPendingT >= 179.5 && midPendingT < 182.5, '3:00 触发点由 extraT 真实达到 180 触发', `pendingExtraT=${midPendingT}`);
    const b = trig.st.boss;
    R.chk(b.key === 'remilia' && trig.st.bossMid === true, '中途 Boss=remilia（bossMid=true）', `key=${b.key} mid=${trig.st.bossMid}`);
    R.chk(trig.st.extraT >= 179.9 && trig.st.extraT < 182, '中途 Boss 开战时 extraT≈180', `extraT=${trig.st.extraT}`);
    R.chk(/^3:0\d$/.test(String(trig.hud.timer)), 'HUD 计时显示 3:00', `timer=${trig.hud.timer}`);
    R.chk(trig.hud.bossVisible === true && !!trig.hud.bossName && !!trig.hud.bossPhase, 'HUD Boss 条/名称/符卡文本显示', `${trig.hud.bossName} / ${trig.hud.bossPhase}`);
    const fire = await L.observe(T, `s.st.bullets > 0`, { timeout: 8000, pollMs: 120 });
    R.chk(!!fire, '雷米莉亚战有弹幕', fire ? `bullets=${fire.st.bullets}` : '8s 内无弹幕');
    R.snap('X5_remilia_boss', trig);
    await R.shot('X5_remilia_boss');
    await L.ensureInvuln(T);
  });

  /* ============ D. EXTRA 失败（中途 Boss 处）→ resumeFrom=midboss ============ */
  await step('EXTRA 失败·中途分支 resumeFrom=midboss', async () => {
    const go = await L.dieToGameOver(T, { label: 'EXTRA 中途 Boss GameOver' });
    const g = go.state;
    R.chk(g.state === 'gameover' && g.inExtra === true, 'EXTRA 中途 Boss 战死亡 → gameover（inExtra=true）', `${g.state}/${g.inExtra}`);
    const sub = await T.eval(`String(document.getElementById('subtitle').textContent||'').trim()`);
    const foot = await T.eval(`String(document.getElementById('hint').textContent||'').trim()`);
    R.chk(sub === '残机用尽 · EXTRA STAGE', 'EXTRA GameOver 副标题=残机用尽 · EXTRA STAGE', sub);
    R.chk(/EXTRA 关失败不会触发结局/.test(foot), 'EXTRA GameOver 说明不会触发结局', foot);
    const btn = (g.buttons || []).find((b) => !b.disabled);
    R.snap('X6_mid_gameover', g);
    await R.shot('X6_mid_gameover');

    await T.key('Enter', 22);
    const kbMoved = await L.observe(T, `s.state !== 'gameover'`, { timeout: 1500 });
    if (!kbMoved) {
      R.info('EXTRA GameOver 键盘通道', 'Enter 无响应（复现 FC-2），改用鼠标等价点击按钮继续');
      await L.clickPanelButton(T, 0);
    }
    const resume = await L.drive(T, `s.state === 'play' && s.st && s.st.bossStarted === true && s.st.boss`, { timeout: 90000, label: 'EXTRA 中途再战' });
    R.chk(resume.st.boss.key === 'remilia' && resume.st.bossMid === true, '中途失败后直接回到雷米莉亚战（resumeFrom=midboss）', `key=${resume.st.boss.key} mid=${resume.st.bossMid}`);
    R.chk(Math.abs(resume.st.extraT - 180) < 2, '中途再战 extraT 拨回 180（不重跑 6 分钟道中）', `extraT=${resume.st.extraT}`);
    R.chk(resume.st.player.power >= 12, '中途再战给到 retryPower=12 火力', `power=${resume.st.player.power}`);
    R.chk(resume.continues === 0, 'EXTRA 失败不计入主线续命次数（continues 仍 0）', `continues=${resume.continues}`);
    R.chk(Math.abs(resume.st.extraT - 180) < 2 && resume.st.midbossDone === false, 'resumeFrom=midboss 时 midbossDone=false', `midbossDone=${resume.st.midbossDone}`);
    R.chk(/^3:0\d$/.test(String(resume.hud.timer)) && resume.hud.bossVisible === true, '中途再战 HUD 计时 3:00、Boss 条显示', `${resume.hud.timer}/${resume.hud.bossVisible}`);
    R.info('EXTRA 中途再战按钮文案', `label=${btn && btn.t}；键盘 Enter 在此面板无响应（FC-2），改用等价鼠标点击`);
    if (btn && /重新挑战本关/.test(btn.t)) {
      R.finding({
        id: 'FC-1',
        title: 'EXTRA 在 Boss 战失败时按钮写「重新挑战本关」，实际却按 resumeFrom 从 3:00/6:00 的 Boss 检查点接上',
        severity: 'minor',
        where: 'src/main.js _onGameOver/_retryStage（inExtra 分支）+ 页面 gameover 面板',
        steps: [
          '预置 EXTRA 解锁存档 → 标题按 E 进入 EXTRA',
          'stage.extraT 快进到 179，等待 3:00 雷米莉亚真实登场',
          '让玩家死亡触发 gameover：面板按钮文本为「重新挑战本关」（GameOver 面板键盘无响应，见 FC-2；用等价的鼠标点击该按钮）',
          '点击后并未从道中重开，而是 extraT=180、power=12、直接回到雷米莉亚战（_retryStage 的 inExtra resumeFrom 分支）',
          '同一局 6:00 芙兰处再死 → 面板同样是「重新挑战本关」→ 点击后 extraT=360、power=12、直接回到芙兰战（resumeFrom=final 分支）',
        ],
        expect: '面板按钮文案应体现「再战 Boss / 从检查点继续」（与主线 Boss 战面板的「再战 Boss」一致），或确实从本关开头重新挑战',
        actual: '按钮写「重新挑战本关」，实际行为是回到 Boss 检查点；中途与终盘两个 resumeFrom 分支都如此',
        evidence: ['_pt/flow_chain/extra/X6_mid_gameover.png', '_pt/flow_chain/extra/X7_mid_resume.png', '_pt/flow_chain/extra/X10_final_gameover.png', '_pt/flow_chain/extra/X11_final_resume.png'],
        snapshot: { buttons: g.buttons, state: resume.state, extraT: resume.st.extraT, boss: resume.st.boss && resume.st.boss.key, power: resume.st.player.power, continues: resume.continues, finalResume: { extraT: 360, boss: 'flandre', power: '>=12' } },
        accel: 'extraT 快进到 179/359 让 180/360 触发真实发生；玩家死亡走真实 hurt→respawn false→gameover；再战因 FC-2 键盘失效，改用鼠标点击面板按钮（等价真实用户操作，走 _retryStage）',
      });
    }
    R.snap('X7_mid_resume', resume);
    await R.shot('X7_mid_resume');
    await L.ensureInvuln(T);

    // 击杀雷米莉亚：midbossDone、boss 清空、弹幕清空、extraT 恢复增长
    const before = await L.read(T);
    const kb = await L.killBoss(T, { label: '雷米莉亚', timeout: 180000 });
    const after = kb.state;
    R.chk(after.st.midbossDone === true && !after.st.boss, '击破雷米莉亚：midbossDone=true、boss 清空', `midbossDone=${after.st.midbossDone} boss=${after.st.boss && after.st.boss.key}`);
    R.chk(after.st.bullets != null && after.st.bullets < 60, '中途 Boss 击破后无大面积残留弹幕（_onMidbossDefeated 清弹，随后道中波次重新刷弹）', `bullets=${after.st.bullets}`);
    R.info('中途 Boss 击破清弹观测', `bullets=${after.st.bullets}（source：_onMidbossDefeated bullets.clear()；轮询间隔内道中波次已生成新弹）`);
    R.chk(after.hud.bossVisible === false, '中途 Boss 击破后 HUD Boss 条隐藏', `bossBarVisible=${after.hud.bossVisible}`);
    const resumed = await L.observe(T, `s.st.extraT > ${after.st.extraT + 0.4}`, { timeout: 8000, pollMs: 120 });
    R.chk(!!resumed, '中途 Boss 击破后 extraT 恢复增长（时间轴回到道中）', resumed ? `extraT ${after.st.extraT} → ${resumed.st.extraT}` : '8s 内未恢复');
    R.info('中途 Boss 清关轨迹', `midbossDone=${after.st.midbossDone} extraT=${after.st.extraT}→${resumed && resumed.st.extraT} bullets=${after.st.bullets} before=${before.st.boss && before.st.boss.key}`);
    await R.shot('X8_mid_clear');

    // midbossClear 的 1.8s 后设计上会播 STORY.extra.midBossOut；等它真实出现并按完，再继续拨表
    const midOut = await L.observe(T, `s.state === 'dialogue' || s.dlg`, { timeout: 12000, pollMs: 120 });
    if (midOut) {
      R.info('中途 Boss 击破后清关对话', `extraT=${midOut.st.extraT} lines=${midOut.dlgLines} index=${midOut.dlgIndex}`);
      R.snap('X8b_mid_out', midOut);
      await R.shot('X8b_mid_out');
      await L.drive(T, PLAY, { timeout: 90000, label: '中途清关对话收尾' });
      R.chk(true, '中途 Boss 击破后的清关对话能正常播完并回到 play', '');
    } else {
      R.info('中途 Boss 击破后清关对话', '12s 内未出现（skipBossDialogue 或视觉窗口错过）');
    }
  });

  /* ============ E. 6:00 终盘 Boss 芙兰（10 符卡） ============ */
  let finalPendingT = null;
  await step('6:00 终盘 Boss 芙兰朵露', async () => {
    await L.drive(T, PLAY, { timeout: 30000, label: '终盘前 play' });
    await L.warpExtraClock(T, 359);
    await sleep(250);
    const t359 = await L.read(T);
    R.chk(t359.hud.timer === timerOf(t359.st.extraT), '拨表到 359 后 HUD 计时一致（5:59）', `hud=${t359.hud.timer} extraT=${t359.st.extraT}`);
    const trig = await L.drive(T, `s.st.bossStarted === true && s.st.boss`, {
      timeout: 120000, label: '6:00 芙兰登场',
      onTick: (x) => { if (finalPendingT == null && x.st && x.st.bossPending) finalPendingT = x.st.extraT; },
    });
    const b = trig.st.boss;
    R.info('终盘触发观测', `pendingExtraT=${finalPendingT}（6:00 无战前对话，bossPending=true 与 onEvent→beginBoss 在同一同步 tick 完成，轮询不可见 pending）`);
    R.chk(trig.st.extraT >= 359.9 && trig.st.extraT < 362, '6:00 触发：Boss 登场瞬间 extraT≈360（时间轴真实推进到点）', `extraT=${trig.st.extraT}`);
    R.chk(b.key === 'flandre' && trig.st.bossMid === false, '终盘 Boss=flandre（bossMid=false）', `key=${b.key} mid=${trig.st.bossMid}`);
    R.chk(b.spellCount === 10, '芙兰 10 张符卡', `spellCount=${b.spellCount}`);
    R.chk(/^6:0\d$/.test(String(trig.hud.timer)), 'HUD 计时显示 6:00', `timer=${trig.hud.timer}`);
    R.chk(/\/10$|\/10 /.test(String(trig.hud.bossPhase)) || String(trig.hud.bossPhase).includes('/10'), 'HUD 符卡显示 x/10', `bossPhase=${trig.hud.bossPhase}`);
    const fire = await L.observe(T, `s.st.bullets > 0`, { timeout: 8000, pollMs: 120 });
    R.chk(!!fire, '芙兰战有弹幕', fire ? `bullets=${fire.st.bullets}` : '8s 内无弹幕');
    R.snap('X9_flandre_boss', trig);
    await R.shot('X9_flandre_boss');
    await L.ensureInvuln(T);
  });

  /* ============ F. EXTRA 失败（终盘 Boss 处）→ resumeFrom=final ============ */
  await step('EXTRA 失败·终盘分支 resumeFrom=final', async () => {
    const go = await L.dieToGameOver(T, { label: 'EXTRA 终盘 Boss GameOver' });
    const g = go.state;
    R.chk(g.state === 'gameover' && g.inExtra === true, 'EXTRA 终盘 Boss 战死亡 → gameover', `${g.state}/${g.inExtra}`);
    const sub = await T.eval(`String(document.getElementById('subtitle').textContent||'').trim()`);
    R.chk(sub === '残机用尽 · EXTRA STAGE', '终盘失败 GameOver 副标题一致', sub);
    R.snap('X10_final_gameover', g);
    await R.shot('X10_final_gameover');

    await T.key('Enter', 22);
    const kbFinal = await L.observe(T, `s.state !== 'gameover'`, { timeout: 1500 });
    if (!kbFinal) {
      R.info('EXTRA 终盘 GameOver 键盘通道', 'Enter 无响应（复现 FC-2），改用鼠标等价点击按钮继续');
      await L.clickPanelButton(T, 0);
    }
    const resume = await L.drive(T, `s.state === 'play' && s.st && s.st.bossStarted === true && s.st.boss`, { timeout: 90000, label: 'EXTRA 终盘再战' });
    R.chk(resume.st.boss.key === 'flandre', '终盘失败后直接回到芙兰战（resumeFrom=final）', `key=${resume.st.boss.key}`);
    R.chk(Math.abs(resume.st.extraT - 360) < 2, '终盘再战 extraT 拨回 360（不重跑道中与中途 Boss）', `extraT=${resume.st.extraT}`);
    R.chk(resume.st.midbossDone === true, 'resumeFrom=final 时 midbossDone=true', `midbossDone=${resume.st.midbossDone}`);
    R.chk(resume.st.player.power >= 12, '终盘再战给到 retryPower=12 火力', `power=${resume.st.player.power}`);
    R.chk(resume.st.boss.spellCount === 10, '终盘再战仍是 10 符卡', `spellCount=${resume.st.boss.spellCount}`);
    R.chk(/^6:0\d$/.test(String(resume.hud.timer)), '终盘再战 HUD 计时 6:00', `timer=${resume.hud.timer}`);
    R.snap('X11_final_resume', resume);
    await R.shot('X11_final_resume');
    await L.ensureInvuln(T);
  });

  /* ============ G. 击破芙兰 → W1 结局 → 回标题 → reload ============ */
  await step('EXTRA W1 结局与持久化', async () => {
    const kb = await L.killBoss(T, { label: '芙兰', timeout: 300000 });
    const c = kb.state;
    R.chk(c.state === 'clear' || c.st.state === 'clear', '击破芙兰后进入 clear', `${c.state}/${c.st.state}`);
    R.chk(c.st.bullets != null && c.st.bullets < 10, '芙兰击破后清弹', `bullets=${c.st.bullets}`);
    await R.shot('X12_final_clear');

    const e = await L.drive(T, `s.state === 'ending'`, { timeout: 180000, label: 'EXTRA 结局页' });
    R.chk(e.endingVisible === true, 'EXTRA 结局页可见', `endingVisible=${e.endingVisible}`);
    R.chk(e.edChapter === 'EXTRA ENDING · W1', 'EXTRA 灵梦结局=EXTRA ENDING · W1', `edChapter=${e.edChapter}`);
    R.chk(e.inExtra === true && e.unlockedExtra === true, 'EXTRA 结局中 inExtra/unlocked 状态正确', `inExtra=${e.inExtra} unlocked=${e.unlockedExtra}`);
    R.chk(!!e.prog && e.prog.extraUnlocked === true && e.prog.extraChar === 'reimu', 'EXTRA 通关不改写坏进度（仍为 extraUnlocked/extraChar=reimu）', JSON.stringify(e.prog));
    R.chk((await T.eval(`document.getElementById('hud').classList.contains('hidden')`)) === true, 'EXTRA 结局页隐藏 HUD', '');
    R.snap('X13_extra_ending', e);
    await R.shot('X13_extra_ending');

    await T.key('Escape', 22); await sleep(500);
    const card = await L.read(T);
    R.chk(card.edPhase === 'card', 'Esc 跳到 EXTRA 结局卡', `phase=${card.edPhase}`);
    R.chk(card.edCardNo === 'W1', 'EXTRA 结局卡编号=W1', `edCardNo=${card.edCardNo}`);
    R.chk(card.edCardKind === 'W ENDING', 'EXTRA 结局卡类型=W ENDING', `edCardKind=${card.edCardKind}`);
    R.chk(card.edCardTitle === '迟到的祭典', 'W1 卡标题=迟到的祭典', `edCardTitle=${card.edCardTitle}`);
    R.info('W1 结局卡角色行', `edCardChar=${card.edCardChar}`);
    R.snap('X14_extra_card', card);
    await R.shot('X14_extra_card');
    await L.observe(T, `s.edCardT >= 0.8`, { timeout: 15000, pollMs: 100 });
    await T.key('Enter', 20);
    const back = await L.drive(T, `s.state === 'menu'`, { timeout: 30000, label: 'EXTRA 结局返回标题', press: false });
    R.chk(back.title === '東方新紀行' && back.inExtra === false, 'EXTRA 结局结束返回标题', `${back.title}/${back.inExtra}`);
    R.chk(back.unlockedExtra === true, 'W1 后 EXTRA 仍解锁', `unlocked=${back.unlockedExtra}`);
    const eb = (back.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
    R.chk(!!eb && eb.disabled === false, 'W1 后标题 EXTRA 仍可点', JSON.stringify(eb));

    await T.reload();
    await T.waitFor('!!window.__game', 30000);
    await sleep(500);
    const r = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'EXTRA 后 reload 标题', press: false });
    R.chk(r.unlockedExtra === true && r.st === null, 'reload 后 EXTRA 解锁仍在', `unlocked=${r.unlockedExtra}`);
    R.chk(!!r.prog && r.prog.extraUnlocked === true && r.prog.extraChar === 'reimu', 'reload 后 progress 未损坏', JSON.stringify(r.prog));
    const eb2 = (r.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
    R.chk(!!eb2 && eb2.disabled === false, 'reload 后 EXTRA 按钮仍可用', JSON.stringify(eb2));
    R.snap('X15_reload_unlocked', r);
    await R.shot('X15_reload_unlocked');
  });

  const rep = await T.report();
  R.chk((rep.errors || []).length === 0, 'EXTRA 全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
  R.chk((rep.httpBad || []).length === 0, 'EXTRA 全程无 HTTP 4xx/5xx', JSON.stringify((rep.httpBad || []).slice(0, 5)));
  R.info('网络/资源', `resources=${(rep.resources || []).length}, netFails=${(rep.netFails || []).length}, warns=${(rep.warns || []).length}`);

  const out = await R.write({ section: SECTION, port: PORT, accel: R.accel, report: rep, steps, midPendingT, finalPendingT });
  L.writeCombined(SECTION, out, R.findings);
  await T.close();
  console.log(JSON.stringify({
    section: SECTION, pass: out.pass, passCount: out.passCount, failCount: out.failCount,
    findings: R.findings.length, checks: R.checks.filter((c) => !c.ok && !c.info).map((c) => `${c.name} :: ${c.detail}`), ms: out.ms,
  }, null, 2));
} catch (e) {
  log(`脚本异常: ${e && e.stack || e}`);
  try {
    const rep = await T.report();
    await R.write({ section: SECTION, port: PORT, error: String(e && e.message || e), report: rep, steps });
    L.writeCombined(SECTION, { pass: false, failCount: 1, findings: R.findings.length }, R.findings);
  } catch (e2) { log(`写报告失败: ${e2 && e2.message}`); }
  try { await T.close(); } catch (e3) {}
  process.exit(1);
}
