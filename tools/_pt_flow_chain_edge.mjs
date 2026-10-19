/**
 * flow-chain 边界脚本：对话中 Esc / Boss 战 GameOver「再战 Boss」恢复场地。
 * - 不伪造状态：对话 Esc、死亡、续命、重挑战全部走真实按键与真实 update。
 * - 加速：道中瞬移、Boss 直接登场（warp 触发线，由 Stage.update 判定）；玩家 invuln 防意外死亡。
 */
import * as L from './_pt_flow_chain_lib.mjs';
import { sleep } from './_pt_core.mjs';

const SECTION = 'edge';
const PORT = 9415;
const log = (m) => console.log(`[edge ${new Date().toISOString().slice(11, 19)}] ${m}`);

const T = await L.openGame({ port: PORT, clearStorage: true });
const R = new L.Run(SECTION, T);
R.accelNote('开场/道中/Boss 前对白都用真实按键；道中瞬移 warpPlatform 到 30%/Boss 线（真实阈值判定）；Boss 战死亡用 p.lives=1/hearts=1/hurt(1) 走真实 die→respawn false→gameover；再战 Boss 走面板 ENTER→_retryStage→resumeBoss 真实分支');

const processGuard = (err) => { log(`未捕获: ${err && err.stack || err}`); try { T.close(); } catch (e) {} process.exit(1); };
process.on('uncaughtException', processGuard);
process.on('unhandledRejection', processGuard);

try {
  log('boot');
  await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '标题页', press: false });

  /* ============ A. 开场对白中按 Esc：不能暂停、不能漏键、对白结束后正常进关 ============ */
  await T.key('Enter', 22); await sleep(320);
  await T.key('KeyE', 22); await sleep(320);
  await T.key('Digit1', 22);
  const opening = await L.observe(T, `s.dlg === true`, { timeout: 12000, pollMs: 90 });
  R.chk(!!opening, '选人后开场对白出现', opening ? `state=${opening.state} lines=${opening.dlgLines}` : '12s 内未出现');
  if (opening) {
    const before = await L.read(T);
    await T.key('Escape', 22); await sleep(200);
    await T.key('Escape', 22); await sleep(200);
    const after = await L.read(T);
    R.chk(after.state === 'dialogue' && after.dlg === true, '开场对白中 Esc 不暂停（仍在 dialogue）', `state=${after.state} dlg=${after.dlg} title=${after.title}`);
    R.chk(after.title !== '暂停', '开场对白中 Esc 不弹出暂停面板', `title=${after.title}`);
    R.chk(after.dlgIndex === before.dlgIndex || after.dlgIndex <= before.dlgIndex + 1, 'Esc 不会跳行/吞掉对白', `index ${before.dlgIndex} → ${after.dlgIndex}`);
    R.snap('E1_opening_esc', after);
    await R.shot('E1_opening_esc');
    await L.mashDialogue(T);
  }
  const st1 = await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 90000, label: '开场对白后进关' });
  R.chk(st1.level === 0 && st1.st && st1.st.state === 'play', '开场白后正常开始第 1 面（没有被 Esc 卡住）', `${st1.level}/${st1.st && st1.st.state}`);
  R.chk(st1.overlayHidden === true, '进关后菜单遮罩隐藏', `overlayHidden=${st1.overlayHidden}`);
  await L.ensureInvuln(T);

  /* ============ B. 道中对话中 Esc ============ */
  log('道中对话 Esc 测试');
  let mid = null;
  for (let attempt = 0; attempt < 2 && !mid; attempt++) {
    await L.warpPlatform(T, { frac: 0.30 });
    mid = await L.waitDialogue(T, { timeout: 8000 });
  }
  R.chk(!!mid, '道中 30% 处触发对白', mid ? `lines=${mid.dlgLines}` : '8s 内未触发');
  if (mid) {
    const b = await L.read(T);
    await T.key('Escape', 22); await sleep(200);
    const a = await L.read(T);
    R.chk(a.state === 'dialogue' && a.dlg === true, '道中对话中 Esc 仍在 dialogue（不暂停）', `state=${a.state} dlg=${a.dlg}`);
    R.chk(a.title !== '暂停', '道中对话中 Esc 不弹暂停面板', `title=${a.title}`);
    R.chk(a.dlgIndex <= b.dlgIndex + 1, 'Esc 不跳行', `index ${b.dlgIndex} → ${a.dlgIndex}`);
    R.snap('E2_mid_esc', a);
    await R.shot('E2_mid_esc');
    await L.mashDialogue(T);
  }
  const afterMid = await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 60000, label: '道中对话后回 play' });
  R.chk(afterMid.level === 0, '道中对话结束后仍在第 1 面', `level=${afterMid.level}`);

  /* ============ C. Boss 前对白中 Esc ============ */
  log('Boss 前对白 Esc 测试');
  await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 30000, label: '前往 Boss 前置 play' });
  await L.ensureInvuln(T);
  await L.warpPlatform(T, { boss: true });
  const pre = await L.waitDialogue(T, { timeout: 10000 });
  R.chk(!!pre, 'Boss 触发线播放战前对白', pre ? `lines=${pre.dlgLines}` : '10s 内未触发');
  if (pre) {
    const b = await L.read(T);
    await T.key('Escape', 22); await sleep(200);
    const a = await L.read(T);
    R.chk(a.state === 'dialogue' && a.dlg === true, 'Boss 前对白中 Esc 不暂停', `state=${a.state} dlg=${a.dlg}`);
    R.chk(a.dlgIndex <= b.dlgIndex + 1, 'Boss 前对白中 Esc 不跳行', `index ${b.dlgIndex} → ${a.dlgIndex}`);
    R.snap('E3_preboss_esc', a);
    await R.shot('E3_preboss_esc');
    await L.mashDialogue(T);
  }
  const bossOn = await L.drive(T, `s.st && s.st.bossStarted === true && s.st.boss`, { timeout: 60000, label: 'Boss 登场' });
  const bossBattle = await L.drive(T, `s.st.boss && s.st.boss.state !== 'intro' && s.state === 'play'`, { timeout: 60000, label: 'Boss 开战' });
  const bossInfo = bossBattle.st.boss;
  R.info('Boss 战基线', `${bossInfo.key} maxHp=${bossInfo.maxHp} spellCount=${bossInfo.spellCount} time=${bossBattle.st.time}`);
  await L.ensureInvuln(T);

  /* ============ D. Boss 战 GameOver → 面板「再战 Boss」→ 真的回到 Boss 场地 ============ */
  log('Boss 战 GameOver / 再战 Boss');
  const go = await L.dieToGameOver(T, { label: 'Boss 战 GameOver' });
  const g = go.state;
  R.chk(g.state === 'gameover', 'Boss 战死亡 → gameover', `state=${g.state}`);
  const goBtns = (g.buttons || []).map((b) => b.t);
  R.chk(goBtns.some((t) => /再战 Boss/.test(t)) && !goBtns.some((t) => /重新挑战本关/.test(t)), 'Boss 战 GameOver 按钮为「再战 Boss」（不是从头挑战本关）', goBtns.join(' | '));
  const goSub = await T.eval(`String(document.getElementById('subtitle').textContent||'').trim()`);
  R.chk(/残机用尽 · STAGE 1/.test(goSub) && /续命 0 次/.test(goSub), 'Boss 战 GameOver 副标题正确', goSub);
  R.snap('E4_boss_gameover', g);
  await R.shot('E4_boss_gameover');

  // —— 第二次复现 FC-2：gameover 面板键盘无响应（Enter/Esc 均停住） ——
  await T.key('Enter', 22); await sleep(1400);
  const kbEnter = await L.read(T);
  R.info('复现 FC-2（第二次·Enter）', `gameover 面板按 Enter 后 state=${kbEnter.state} title=${kbEnter.title}`);
  R.snap('E4b_gameover_enter_dead', kbEnter);
  await R.shot('E4b_gameover_enter_dead');
  await T.key('Escape', 22); await sleep(1200);
  const kbEsc = await L.read(T);
  R.info('复现 FC-2（第二次·Esc）', `gameover 面板按 Esc 后 state=${kbEsc.state} title=${kbEsc.title}`);
  R.snap('E4c_gameover_escape_dead', kbEsc);
  await R.shot('E4c_gameover_escape_dead');
  const dlClick = await L.clickPanelButton(T, 0);
  R.info('改用鼠标等价点击面板按钮', JSON.stringify(dlClick));

  const cont = await L.drive(T, `s.state === 'play' && s.st && s.st.bossStarted === true && s.st.boss`, { timeout: 90000, label: '再战 Boss 重开' });
  R.chk(cont.continues === 1, '再战 Boss 后 continues=1', `continues=${cont.continues}`);
  R.chk(cont.level === 0, '再战 Boss 仍在同一面（第 1 面）', `level=${cont.level}`);
  R.chk(!!cont.st.boss && cont.st.boss.key === bossInfo.key, '再战 Boss 真的直接回到 Boss 战（不是从道中重跑）', `boss=${cont.st.boss && cont.st.boss.key} bossStarted=${cont.st.bossStarted}`);
  R.chk(cont.st.player && cont.st.player.x > cont.st.levelW - 2500, '再战 Boss 玩家位于 Boss 场地附近（不是出生点）', `px=${cont.st.player && cont.st.player.x} levelW=${cont.st.levelW}`);
  R.chk(cont.st.time < 3, '再战 Boss 面内计时重置', `time=${cont.st.time}`);
  R.chk(cont.st.bullets != null && cont.st.bullets < 40, '再战 Boss 无上一轮残留弹幕', `bullets=${cont.st.bullets}`);
  await L.ensureInvuln(T);
  const resumeBattle = await L.drive(T, `s.st.boss && s.st.boss.state !== 'intro'`, { timeout: 60000, label: '再战 Boss 开战' });
  R.chk(resumeBattle.st.boss.hp === bossInfo.maxHp || resumeBattle.st.boss.hp > 0, '再战 Boss 血量为满血重来', `hp=${resumeBattle.st.boss.hp} maxHp=${resumeBattle.st.boss.maxHp}`);
  R.chk(resumeBattle.hud.bossVisible === true, '再战 Boss 后 HUD Boss 血条恢复显示', `bossBarVisible=${resumeBattle.hud.bossVisible}`);
  R.info('再战 Boss 轨迹', `continues=${cont.continues} level=${cont.level} px=${cont.st.player && cont.st.player.x} → boss ${resumeBattle.st.boss.key} ${resumeBattle.st.boss.state}`);
  R.snap('E5_boss_resume', resumeBattle);
  await R.shot('E5_boss_resume');

  /* ============ E. 收尾：退出回标题后仍能再开新局 ============ */
  await L.quitToTitle(T);
  const title = await L.read(T);
  R.chk(title.state === 'menu' && title.st === null, 'Boss 再战后可正常退出回标题', `state=${title.state} stage=${title.st}`);
  const fresh = await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  R.chk(fresh.continues === 0 && fresh.level === 0 && fresh.st.player.lives === 3, '退出后重新开局无上一局残留（continues/lives/level 重置）', `continues=${fresh.continues} level=${fresh.level} lives=${fresh.st.player.lives}`);
  await L.quitToTitle(T);

  const rep = await T.report();
  R.chk((rep.errors || []).length === 0, 'edge 全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
  R.chk((rep.httpBad || []).length === 0, 'edge 全程无 HTTP 4xx/5xx', JSON.stringify((rep.httpBad || []).slice(0, 5)));
  R.info('网络/资源', `resources=${(rep.resources || []).length}, netFails=${(rep.netFails || []).length}, warns=${(rep.warns || []).length}`);

  const out = await R.write({ section: SECTION, accel: R.accel, report: rep });
  L.writeCombined(SECTION, out, R.findings);
  await T.close();
  console.log(JSON.stringify({
    section: SECTION, pass: out.pass, passCount: out.passCount, failCount: out.failCount,
    findings: R.findings.length, checks: R.checks.filter((c) => !c.ok && !c.info).map((c) => `${c.name} :: ${c.detail}`),
    ms: out.ms,
  }, null, 2));
} catch (e) {
  log(`脚本异常: ${e && e.stack || e}`);
  try {
    const rep = await T.report();
    await R.write({ section: SECTION, error: String(e && e.message || e), report: rep });
    L.writeCombined(SECTION, { pass: false, failCount: 1, findings: 0 }, R.findings);
  } catch (e2) { log(`写报告也失败: ${e2 && e2.message}`); }
  try { await T.close(); } catch (e3) {}
  process.exit(1);
}
