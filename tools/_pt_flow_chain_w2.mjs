/**
 * flow-chain 结局补测：EXTRA + 魔理沙 → W2（EXTRA ENDING · W2）。
 * 同时复测两处已修缺陷：
 *  - FC-1（已修）：EXTRA Boss 战失败时按钮文案应体现「从 3:00/6:00 检查点继续」（mid/final 两分支）
 *  - FC-2（已修）：EXTRA 的 GameOver 面板应能用 Enter 离开（键盘通道）
 * 端口 9419（easy=9412 / extra=9413 / normal=9414 / edge=9415 / gokb-fix=9416 / end03=9417 / end04=9418）。
 */
import { sleep } from './_pt_core.mjs';
import * as L from './_pt_flow_chain_lib.mjs';

const SECTION = 'w2';
const PORT = 9413; // 复用 extra 段端口（新端口曾遇 Edge 启动不稳定）
const log = (m) => console.log(`[w2 ${new Date().toISOString().slice(11, 19)}] ${m}`);
const R = new L.Run(SECTION, null);
const T = await L.openGame({ port: PORT, clearStorage: true });
R.T = T;
process.on('uncaughtException', (e) => { log(`未捕获 ${e && e.stack || e}`); try { T.close(); } catch (x) {} process.exit(1); });
process.on('unhandledRejection', (e) => { log(`未处理拒绝 ${e && e.stack || e}`); try { T.close(); } catch (x) {} process.exit(1); });

R.accelNote('预置 hks.progress.v1 {extraUnlocked:true, extraChar:"marisa"} 直测 W2；道中用 stage.extraT 快进到 179/359（180/360 由 _updateExtraTimeline 真实触发）；Boss 走 boss.damage(spellHp+1) 逐卡真实击杀；死亡用 p.lives=1/hearts=1/hurt(1) 走真实 gameover；FC-1/FC-2 复测均用真实键盘 Enter。');

const PLAY = `s.state === 'play' && s.st && s.st.state === 'play'`;
const timerOf = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const steps = [];
const step = async (name, fn) => {
  steps.push(name); log(`开始 ${name}`);
  const t0 = Date.now();
  try { await fn(); log(`完成 ${name}（${((Date.now() - t0) / 1000).toFixed(1)}s）`); }
  catch (e) { log(`异常 ${name}: ${e && e.message}`); R.chk(false, `步骤异常:${name}`, String(e && e.message || e)); try { await R.shot(`err${steps.length}`); } catch (x) {} }
};

async function panelSubFootBtn() {
  return {
    sub: String(await T.eval(`String(document.getElementById('subtitle').textContent||'').trim()`)),
    foot: String(await T.eval(`String(document.getElementById('hint').textContent||'').trim()`)),
    btns: (await L.read(T)).buttons || [],
  };
}

async function enterExtra() {
  await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'EXTRA 标题页', press: false });
  await T.key('KeyE', 22); await sleep(260);
  await L.observe(T, `s.inExtra === true`, { timeout: 15000, pollMs: 100 });
  return L.drive(T, PLAY, { timeout: 150000, label: 'EXTRA 道中开始' });
}

try {
  log('boot，预置 EXTRA 解锁存档（extraChar=marisa）');
  await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '标题页', press: false });
  await T.eval(`(() => { localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'marisa' })); return 1; })()`);
  await T.reload();
  await T.waitFor('!!window.__game', 30000);
  await sleep(500);
  const pre = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '预置存档后标题', press: false });
  R.chk(pre.unlockedExtra === true && pre.extraChar === 'marisa', '预置存档解锁且角色=魔理沙', `unlocked=${pre.unlockedExtra} char=${pre.extraChar}`);
  R.snap('X1_title_unlocked_marisa', pre);
  await R.shot('X1_title_unlocked_marisa');

  await step('EXTRA/魔理沙 进入与零火力', async () => {
    const st = await enterExtra();
    R.chk(st.inExtra === true && st.st.extra === true && st.st.mode === 'stg', 'EXTRA：inExtra/extra/stg', `${st.inExtra}/${st.st.extra}/${st.st.mode}`);
    R.chk(st.char === 'marisa', 'EXTRA 按存档强制角色=魔理沙', `char=${st.char}`);
    R.chk(st.carryPower === 0 && st.st.player.power === 0, '零火力开局（carryPower=0、player.power=0）', `carry=${st.carryPower} power=${st.st.player.power}`);
    R.chk(st.hud.stage === 'EXTRA' && /^0:0\d$/.test(String(st.hud.timer)), 'HUD EXTRA / 计时从 0:00', `${st.hud.stage}/${st.hud.timer}`);
    R.chk(st.st.stg && st.st.stg.waves > 0 && st.st.stg.spawnPaused === false, '6 分钟道中波次表已建立', JSON.stringify(st.st.stg));
    R.snap('X2_extra_start_marisa', st);
    await R.shot('X2_extra_start_marisa');
    await L.ensureInvuln(T);
  });

  let midLabel = null, finalLabel = null;
  await step('3:00 雷米莉亚 + FC-1/FC-2 修后复测（mid）', async () => {
    await L.drive(T, PLAY, { timeout: 30000, label: '快进前 play' });
    await L.warpExtraClock(T, 179);
    await sleep(250);
    const trig = await L.drive(T, `s.st.bossStarted === true && s.st.boss`, { timeout: 120000, label: '3:00 雷米莉亚登场' });
    R.chk(trig.st.boss.key === 'remilia' && trig.st.bossMid === true, '3:00 中途 Boss=remilia', `key=${trig.st.boss.key} mid=${trig.st.bossMid}`);
    R.chk(trig.st.extraT >= 179.9 && trig.st.extraT < 182, '中途 Boss 开战时 extraT≈180', `extraT=${trig.st.extraT}`);
    R.chk(trig.hud.timer === timerOf(trig.st.extraT), 'HUD 计时与 extraT 一致（3:00）', `hud=${trig.hud.timer} extraT=${trig.st.extraT}`);
    await R.shot('W2_mid_boss');
    await L.ensureInvuln(T);

    // 死亡 → GameOver：FC-1 文案 + FC-2 键盘
    const go = await L.dieToGameOver(T, { label: 'EXTRA mid GameOver' });
    const g = go.state;
    R.chk(g.state === 'gameover' && g.inExtra === true, '中途 Boss 死亡 → gameover（EXTRA）', `${g.state}/${g.inExtra}`);
    const p = await panelSubFootBtn();
    const midBtn = p.btns.find((b) => !b.disabled) || p.btns[0];
    midLabel = midBtn && midBtn.t;
    R.chk(p.sub === '残机用尽 · EXTRA STAGE', '副标题=残机用尽 · EXTRA STAGE', p.sub);
    R.chk(/EXTRA 关失败不会触发结局/.test(p.foot), '说明不会触发结局', p.foot);
    R.chk(/从雷米莉亚战继续/.test(String(midLabel || '')), 'FC-1 修后：按钮文案=从雷米莉亚战继续（检查点细节在脚注）', String(midLabel));
    R.chk(/将从 3:00 雷米莉亚战的检查点继续/.test(p.foot), 'FC-1 修后：说明写明将从 3:00 检查点继续', p.foot);
    R.snap('W2_mid_gameover_fixed', g);
    await R.shot('W2_mid_gameover_fixed');

    await T.key('Enter', 22);
    const moved = await L.observe(T, `s.state !== 'gameover'`, { timeout: 3000, pollMs: 100 });
    R.chk(!!moved, 'FC-2 修后：EXTRA GameOver 按 Enter 能离开面板', moved ? `state=${moved.state}` : '3s 内仍在 gameover');
    const resume = await L.drive(T, `s.state === 'play' && s.st && s.st.bossStarted === true && s.st.boss`, { timeout: 90000, label: 'EXTRA 中途再战' });
    R.chk(resume.st.boss.key === 'remilia', '再战回雷米莉亚战（resumeFrom=midboss）', `key=${resume.st.boss.key}`);
    R.chk(Math.abs(resume.st.extraT - 180) < 2, '再战 extraT 拨回 180（同按钮文案一致）', `extraT=${resume.st.extraT}`);
    R.chk(resume.st.player.power >= 12, '再战给到 retryPower=12 火力', `power=${resume.st.player.power}`);
    R.chk(resume.continues === 0, 'EXTRA 失败不计主线续命', `continues=${resume.continues}`);
    R.snap('W2_mid_resume_fixed', resume);
    await R.shot('W2_mid_resume_fixed');
    await L.ensureInvuln(T);

    const kb = await L.killBoss(T, { label: '雷米莉亚', timeout: 180000 });
    const after = kb.state;
    R.chk(after.st.midbossDone === true && !after.st.boss, '击破雷米莉亚：midbossDone=true、boss 清空', `midbossDone=${after.st.midbossDone}`);
    await R.shot('W2_mid_clear');
    const midOut = await L.observe(T, `s.state === 'dialogue' || s.dlg`, { timeout: 12000, pollMs: 120 });
    if (midOut) {
      R.snap('W2_mid_out_dialogue', midOut);
      await L.drive(T, PLAY, { timeout: 90000, label: '中途清关对话收尾' });
      R.chk(true, '中途清关对话正常播完并回到 play', '');
    } else {
      R.info('中途清关对话', '12s 内未出现（窗口错过）');
    }
  });

  await step('6:00 芙兰 + FC-1/FC-2 修后复测（final）', async () => {
    await L.drive(T, PLAY, { timeout: 30000, label: '终盘前 play' });
    await L.warpExtraClock(T, 359);
    await sleep(250);
    const trig = await L.drive(T, `s.st.bossStarted === true && s.st.boss`, { timeout: 120000, label: '6:00 芙兰登场' });
    R.chk(trig.st.extraT >= 359.9 && trig.st.extraT < 362, '终盘 Boss 登场瞬间 extraT≈360', `extraT=${trig.st.extraT}`);
    R.chk(trig.st.boss.key === 'flandre' && trig.st.bossMid === false, '终盘 Boss=flandre', `key=${trig.st.boss.key} mid=${trig.st.bossMid}`);
    R.chk(trig.st.boss.spellCount === 10, '芙兰 10 张符卡', `spellCount=${trig.st.boss.spellCount}`);
    await R.shot('W2_final_boss');
    await L.ensureInvuln(T);

    const go = await L.dieToGameOver(T, { label: 'EXTRA final GameOver' });
    R.chk(go.state.state === 'gameover' && go.state.inExtra === true, '终盘 Boss 死亡 → gameover', `${go.state.state}/${go.state.inExtra}`);
    const p = await panelSubFootBtn();
    const btn = p.btns.find((b) => !b.disabled) || p.btns[0];
    finalLabel = btn && btn.t;
    R.chk(/从芙兰战继续/.test(String(finalLabel || '')), 'FC-1 修后：终盘按钮文案=从芙兰战继续（检查点细节在脚注）', String(finalLabel));
    R.chk(/将从 6:00 芙兰战的检查点继续/.test(p.foot), 'FC-1 修后：说明写明将从 6:00 检查点继续', p.foot);
    R.snap('W2_final_gameover_fixed', go.state);
    await R.shot('W2_final_gameover_fixed');

    await T.key('Enter', 22);
    const moved = await L.observe(T, `s.state !== 'gameover'`, { timeout: 3000, pollMs: 100 });
    R.chk(!!moved, 'FC-2 修后：终盘 GameOver 按 Enter 能离开面板', moved ? `state=${moved.state}` : '3s 内仍在 gameover');
    const resume = await L.drive(T, `s.state === 'play' && s.st && s.st.bossStarted === true && s.st.boss`, { timeout: 90000, label: 'EXTRA 终盘再战' });
    R.chk(resume.st.boss.key === 'flandre', '再战回芙兰战（resumeFrom=final）', `key=${resume.st.boss.key}`);
    R.chk(Math.abs(resume.st.extraT - 360) < 2 && resume.st.midbossDone === true, '再战 extraT=360、midbossDone=true', `extraT=${resume.st.extraT} midbossDone=${resume.st.midbossDone}`);
    R.chk(resume.st.player.power >= 12, '终盘再战给到 retryPower=12 火力', `power=${resume.st.player.power}`);
    R.chk(resume.st.boss.spellCount === 10, '终盘再战仍 10 符卡', `spellCount=${resume.st.boss.spellCount}`);
    R.snap('W2_final_resume_fixed', resume);
    await R.shot('W2_final_resume_fixed');
    await L.ensureInvuln(T);
  });

  await step('击破芙兰 → W2 结局与持久化', async () => {
    const kb = await L.killBoss(T, { label: '芙兰', timeout: 300000 });
    const c = kb.state;
    R.chk(c.state === 'clear' || c.st.state === 'clear', '击破芙兰后进入 clear', `${c.state}/${c.st.state}`);
    R.chk(c.st.bullets != null && c.st.bullets < 10, '芙兰击破后清弹', `bullets=${c.st.bullets}`);
    await R.shot('W2_final_clear');

    const e = await L.drive(T, `s.state === 'ending'`, { timeout: 180000, label: 'EXTRA 结局页' });
    R.chk(e.endingVisible === true, 'EXTRA 结局页可见', '');
    R.chk(e.edChapter === 'EXTRA ENDING · W2', 'EXTRA/魔理沙 → EXTRA ENDING · W2', `edChapter=${e.edChapter}`);
    R.chk(e.char === 'marisa' && e.inExtra === true, '角色=魔理沙、inExtra=true', `${e.char}/${e.inExtra}`);
    R.chk(!!e.prog && e.prog.extraUnlocked === true && e.prog.extraChar === 'marisa', 'EXTRA 通关不改坏进度（extraChar=marisa）', JSON.stringify(e.prog));
    R.chk((await T.eval(`document.getElementById('hud').classList.contains('hidden')`)) === true, 'EXTRA 结局页隐藏 HUD', '');
    R.snap('W2_extra_ending', e);
    await R.shot('W2_extra_ending');

    await T.key('Escape', 22); await sleep(500);
    const card = await L.read(T);
    R.chk(card.edPhase === 'card', 'Esc 跳到 ENDING 卡', `phase=${card.edPhase}`);
    R.chk(card.edCardNo === 'W2', '结局卡编号=W2', `edCardNo=${card.edCardNo}`);
    R.chk(card.edCardKind === 'W ENDING', '结局卡类型=W ENDING', `kind=${card.edCardKind}`);
    R.chk(card.edCardTitle === '第一次送人的宝贝', 'W2 卡标题=第一次送人的宝贝', `title=${card.edCardTitle}`);
    R.chk(card.edCardChar === '雾雨魔理沙 · EXTRA ENDING · W2', '结局卡角色行=雾雨魔理沙 · EXTRA ENDING · W2', `char=${card.edCardChar}`);
    R.snap('W2_extra_card', card);
    await R.shot('W2_extra_card');
    await L.observe(T, `s.edCardT >= 0.8`, { timeout: 15000, pollMs: 100 });
    await T.key('Enter', 20);
    const back = await L.drive(T, `s.state === 'menu'`, { timeout: 30000, label: 'W2 结局返回标题', press: false });
    R.chk(back.title === '東方新紀行' && back.inExtra === false, '结局结束返回标题', `${back.title}/${back.inExtra}`);
    R.chk(back.unlockedExtra === true, 'W2 后 EXTRA 仍解锁', `unlocked=${back.unlockedExtra}`);
    const eb = (back.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
    R.chk(!!eb && eb.disabled === false && !/locked/.test(eb.cls || ''), 'W2 后标题 EXTRA 可点', JSON.stringify(eb));

    await T.reload();
    await T.waitFor('!!window.__game', 30000);
    await sleep(500);
    const r = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'W2 后 reload 标题', press: false });
    R.chk(r.unlockedExtra === true, 'reload 后 EXTRA 解锁仍在', `unlocked=${r.unlockedExtra}`);
    R.chk(!!r.prog && r.prog.extraUnlocked === true && r.prog.extraChar === 'marisa', 'reload 后 progress 未损坏', JSON.stringify(r.prog));
    R.snap('W2_reload_unlocked', r);
    await R.shot('W2_reload_unlocked');
  });

  R.info('FC-1 复测结果', `mid 按钮=${midLabel} / final 按钮=${finalLabel}（修后文案与行为一致）`);
  const rep = await T.report();
  R.chk((rep.errors || []).length === 0, '全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
  R.chk((rep.httpBad || []).length === 0, '全程无 HTTP 4xx/5xx', JSON.stringify((rep.httpBad || []).slice(0, 5)));
  R.info('网络/资源', `resources=${(rep.resources || []).length}, netFails=${(rep.netFails || []).length}, warns=${(rep.warns || []).length}`);
  const out = await R.write({ section: SECTION, port: PORT, accel: R.accel, report: rep, steps, midLabel, finalLabel });
  L.writeCombined(SECTION, out, R.findings);
  await T.close();
  console.log(JSON.stringify({
    section: SECTION, pass: out.pass, passCount: out.passCount, failCount: out.failCount,
    findings: R.findings.length, midLabel, finalLabel, checks: R.checks.filter((c) => !c.ok && !c.info).map((c) => `${c.name} :: ${c.detail}`), ms: out.ms,
  }, null, 2));
} catch (e) {
  log(`脚本异常 ${e && e.stack || e}`);
  try { const rep = await T.report(); await R.write({ section: SECTION, port: PORT, error: String(e && e.message || e), report: rep, steps }); L.writeCombined(SECTION, { pass: false, failCount: 1, findings: R.findings.length }, R.findings); } catch (x) {}
  try { await T.close(); } catch (x) {}
  process.exit(1);
}
