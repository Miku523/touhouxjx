/**
 * flow-chain 结局补测：N 难度 + 魔理沙零续命通关 → ENDING 04（TRUE ENDING），并验证 EXTRA 解锁写盘。
 * 验证：6 面链跑通、Boss 名/模式、END 04 / 还给春天的东西、progress {extraUnlocked:true, extraChar:'marisa'}、reload 后仍解锁。
 * 端口 9418（easy=9412 / extra=9413 / normal=9414 / edge=9415 / gokb-fix=9416 / end03=9417 / w2=9419）。
 */
import { sleep } from './_pt_core.mjs';
import * as L from './_pt_flow_chain_lib.mjs';

const SECTION = 'end04';
const PORT = 9412; // 复用 easy 段端口（9418 上遇到 Edge 启动不稳定的 socket error/CDP 超时）
const log = (m) => console.log(`[end04 ${new Date().toISOString().slice(11, 19)}] ${m}`);
const R = new L.Run(SECTION, null);
const T = await L.openGame({ port: PORT, clearStorage: true });
R.T = T;
process.on('uncaughtException', (e) => { log(`未捕获 ${e && e.stack || e}`); try { T.close(); } catch (x) {} process.exit(1); });
process.on('unhandledRejection', (e) => { log(`未处理拒绝 ${e && e.stack || e}`); try { T.close(); } catch (x) {} process.exit(1); });

R.accelNote('玩家 invuln=999 免死；平台关瞬移到 Boss 触发线 / STG 关把 stg.scroll 拨到 Boss 线；Boss 用 boss.damage(spellHp+1) 逐张破符卡（真实 battle→defeat→dead→clear）；道中对话用 g._midShown=[true,true] 跳过（道中对话逐页已在 E/灵梦轮测过），Boss 战/结算/切面/结局/解锁写盘全部真实。');

const PLAY = `s.state === 'play' && s.st && s.st.state === 'play'`;
const steps = [];
const step = async (name, fn) => {
  steps.push(name); log(`开始 ${name}`);
  const t0 = Date.now();
  try { await fn(); log(`完成 ${name}（${((Date.now() - t0) / 1000).toFixed(1)}s）`); }
  catch (e) { log(`异常 ${name}: ${e && e.message}`); R.chk(false, `步骤异常:${name}`, String(e && e.message || e)); try { await R.shot(`err${steps.length}`); } catch (x) {} }
};

const BOSSES = ['rumia', 'wriggle', 'cirno', 'aya', 'yuyuko', 'kaguya'];

try {
  await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '标题页', press: false });
  const s0 = await L.startRun(T, { diff: 'KeyN', char: 'Digit2' });
  R.chk(s0.char === 'marisa' && s0.diff === 'N' && s0.level === 0, 'N 难度魔理沙开局（level=0）', `${s0.char}/${s0.diff}/${s0.level}`);
  R.snap('E1_start', s0);
  await R.shot('E1_start');

  await step('N/魔理沙 6 面链（零续命）', async () => {
    for (let idx = 0; idx < 6; idx++) {
      const tag = `S${idx + 1}`;
      const s = await L.read(T);
      R.chk(s.level === idx && s.state === 'play' && s.st && s.st.state === 'play', `${tag}: 进入第 ${idx + 1} 面（level=${idx}）`, `level=${s.level}/${s.state}/${s.st && s.st.state}`);
      R.chk(s.st.mode === (idx === 3 ? 'stg' : 'platform'), `${tag}: 模式=${idx === 3 ? 'stg' : 'platform'}`, `mode=${s.st.mode}`);
      R.chk(s.st.bullets != null && s.st.bullets < 10 && !s.st.boss, `${tag}: 切面无残留（bullets/boss）`, `bullets=${s.st.bullets} boss=${s.st.boss && s.st.boss.key}`);
      R.chk(/^0:0\d$/.test(String(s.hud.timer || '')), `${tag}: 计时归零`, `timer=${s.hud.timer}`);
      R.info(`${tag}: HUD`, `stage=${s.hud.stage} lives=${s.hud.lives}/${s.hud.livesTotal} power=${s.hud.power}`);
      await T.eval(`(() => { const g = window.__game; if (g.stage) g._midShown = [true, true]; return true; })()`);
      await L.drive(T, PLAY, { timeout: 60000, label: `${tag} 前置 play` });
      await L.ensureInvuln(T);
      if (s.st.mode === 'platform') await L.warpPlatform(T, { boss: true });
      else await L.warpStg(T, { boss: true });
      const b1 = await L.drive(T, `s.state === 'play' && s.st.bossStarted === true && s.st.boss && s.st.boss.state !== 'intro'`, { timeout: 90000, label: `${tag} Boss 开战` });
      R.chk(b1.st.boss.key === BOSSES[idx], `${tag}: Boss=${BOSSES[idx]}`, `key=${b1.st.boss.key}`);
      R.chk(b1.st.boss.maxHp > 0 && b1.st.boss.spellCount >= 1, `${tag}: Boss 血量/符卡数据正常`, `hp=${b1.st.boss.maxHp} spells=${b1.st.boss.spellCount}`);
      await R.shot(`${tag}_boss`);
      const kb = await L.killBoss(T, { label: `${tag} boss`, timeout: 240000 });
      const c = kb.state;
      // 加速：把 STAGE CLEAR 的 1.8s 横幅等待（_pendingTimeout 逻辑计时器）拨到 0.12s，缩短整轮实际耗时；
      // 只是加快计时器，不改变 clear→结算对话→_advanceLevel 的真实代码路径。
      await T.eval(`(() => { const g = window.__game; if (g._pendingTimeout && g._pendingTimeout.t > 0.12) g._pendingTimeout.t = 0.12; return true; })()`);
      R.chk(c.state === 'clear' || c.st.state === 'clear', `${tag}: 击破进入 clear`, `${c.state}/${c.st.state}`);
      R.chk(c.st.bullets != null && c.st.bullets < 10, `${tag}: clear 后清弹`, `bullets=${c.st.bullets}`);
      await R.shot(`${tag}_clear`);
      if (idx < 5) {
        const ns = await L.drive(T, `s.state === 'play' && s.level === ${idx + 1} && s.st && s.st.state === 'play'`, { timeout: 180000, label: `${tag}→下一面` });
        R.chk(ns.level === idx + 1, `${tag}→下一面: level 递增到 ${idx + 1}`, `level=${ns.level}`);
      }
    }
  });

  await step('ENDING 04 / TRUE ENDING 与解锁写盘', async () => {
    const e = await L.drive(T, `s.state === 'ending'`, { timeout: 180000, label: 'N/魔理沙 结局页' });
    R.chk(e.endingVisible === true, '结局页可见', '');
    R.chk(e.edChapter === 'ENDING 04', 'N 零续命/魔理沙 → ENDING 04', `edChapter=${e.edChapter}`);
    R.chk(e.char === 'marisa' && e.inExtra === false, '角色=魔理沙、非 EXTRA', `${e.char}/${e.inExtra}`);
    R.chk(e.unlockedExtra === true, 'N 零续命通关解锁 EXTRA', `unlocked=${e.unlockedExtra}`);
    R.chk(!!e.prog && e.prog.extraUnlocked === true && e.prog.extraChar === 'marisa', 'progress 写入 {extraUnlocked:true, extraChar:"marisa"}', JSON.stringify(e.prog));
    R.chk((await T.eval(`document.getElementById('hud').classList.contains('hidden')`)) === true, '结局页隐藏 HUD', '');
    R.snap('E2_ending', e);
    await R.shot('E2_ending');

    await T.key('Escape', 22); await sleep(500);
    const c = await L.read(T);
    R.chk(c.edPhase === 'card', 'Esc 跳到结局卡', `phase=${c.edPhase}`);
    R.chk(c.edCardNo === 'END 04', '结局卡编号=END 04', `edCardNo=${c.edCardNo}`);
    R.chk(c.edCardKind === 'TRUE ENDING', '结局卡类型=TRUE ENDING', `kind=${c.edCardKind}`);
    R.chk(c.edCardTitle === '还给春天的东西', '结局卡标题=还给春天的东西', `title=${c.edCardTitle}`);
    R.chk(c.edCardChar === '雾雨魔理沙 · ENDING 04', '结局卡角色行=雾雨魔理沙 · ENDING 04', `char=${c.edCardChar}`);
    R.snap('E3_card', c);
    await R.shot('E3_card');
    await L.observe(T, `s.edCardT >= 0.8`, { timeout: 15000, pollMs: 100 });
    await T.key('Enter', 20);
    const back = await L.drive(T, `s.state === 'menu'`, { timeout: 30000, label: '结局返回标题', press: false });
    R.chk(back.title === '東方新紀行' && back.st === null, '结局结束返回标题', `${back.title}/${back.st}`);
    R.chk(back.unlockedExtra === true, '返回标题 EXTRA 已解锁', `unlocked=${back.unlockedExtra}`);
    const eb = (back.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
    R.chk(!!eb && !/locked/.test(eb.cls || '') && eb.disabled === false, '标题「禁忌的祭典」可点（非锁定样式）', JSON.stringify(eb));
    R.snap('E4_title_unlocked', back);
    await R.shot('E4_title_unlocked');

    await T.reload();
    await T.waitFor('!!window.__game', 30000);
    await sleep(500);
    const r = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'reload 标题', press: false });
    R.chk(r.unlockedExtra === true, 'reload 后 EXTRA 解锁保留', `unlocked=${r.unlockedExtra}`);
    R.chk(!!r.prog && r.prog.extraUnlocked === true && r.prog.extraChar === 'marisa', 'reload 后 progress 未损坏（extraChar=marisa）', JSON.stringify(r.prog));
    const rb = (r.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
    R.chk(!!rb && !/locked/.test(rb.cls || '') && rb.disabled === false, 'reload 后 EXTRA 按钮可用', JSON.stringify(rb));
    R.snap('E5_reload_unlocked', r);
    await R.shot('E5_reload_unlocked');
  });

  const rep = await T.report();
  R.chk((rep.errors || []).length === 0, '全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
  R.chk((rep.httpBad || []).length === 0, '全程无 HTTP 4xx/5xx', JSON.stringify((rep.httpBad || []).slice(0, 5)));
  R.info('网络/资源', `resources=${(rep.resources || []).length}, netFails=${(rep.netFails || []).length}, warns=${(rep.warns || []).length}`);
  const out = await R.write({ section: SECTION, port: PORT, accel: R.accel, report: rep, steps });
  L.writeCombined(SECTION, out, R.findings);
  await T.close();
  console.log(JSON.stringify({
    section: SECTION, pass: out.pass, passCount: out.passCount, failCount: out.failCount,
    findings: R.findings.length, checks: R.checks.filter((c) => !c.ok && !c.info).map((c) => `${c.name} :: ${c.detail}`),
  }, null, 2));
} catch (e) {
  log(`脚本异常 ${e && e.stack || e}`);
  try { const rep = await T.report(); await R.write({ section: SECTION, port: PORT, error: String(e && e.message || e), report: rep, steps }); L.writeCombined(SECTION, { pass: false, failCount: 1, findings: R.findings.length }, R.findings); } catch (x) {}
  try { await T.close(); } catch (x) {}
  process.exit(1);
}
