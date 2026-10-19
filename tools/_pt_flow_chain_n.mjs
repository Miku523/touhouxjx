/**
 * flow_chain / NORMAL：6 面链 + 难度倍率 + 零续命解锁 END02 + 有续命 END01（解锁差异）
 * 运行：node tools/_pt_flow_chain_n.mjs
 */
import fs from 'node:fs';
import { sleep } from './_pt_core.mjs';
import * as L from './_pt_flow_chain_lib.mjs';

const SECTION = 'normal';
const PORT = 9414;
const T = await L.openGame({ port: PORT, clearStorage: true });
const R = new L.Run(SECTION, T);
process.on('uncaughtException', async (e) => { console.error('FATAL', e); try { await T.close(); } catch (_) { /* ignore */ } process.exit(1); });
process.on('unhandledRejection', async (e) => { console.error('FATAL-REJECT', e); try { await T.close(); } catch (_) { /* ignore */ } process.exit(1); });

const steps = [];
const log = (m) => console.log(`[normal ${new Date().toISOString().slice(11, 19)}] ${m}`);
const step = async (name, fn) => {
  steps.push(name); log(`开始步骤 ${name}`);
  const t0 = Date.now();
  try { await fn(); log(`完成步骤 ${name}（${((Date.now() - t0) / 1000).toFixed(1)}s）`); }
  catch (e) {
    log(`步骤异常 ${name}: ${e && e.message}`);
    R.chk(false, `步骤异常:${name}`, String(e && e.message || e));
    try { await R.shot(`err_${steps.length}_${name.replace(/[^\w\u4e00-\u9fa5]+/g, '_')}`); } catch (e2) { /* ignore */ }
    if (e && e.state) R.snap(`err_${name}`, e.state);
  }
};

R.accelNote('玩家 invuln=999 免死；Boss 用 boss.damage(spellHp+1) 逐张破符卡走真实 battle→defeat→dead→clear；平台关瞬移 30%/58%/Boss 线、STG 拨 stg.scroll 30%/55%/Boss 线，触发仍由 Stage.update/_maybeMidDialogue 判定；run A 仅对第 1/2/6 面测道中对话，第 3-5 面把 g._midShown 预置为 [true,true] 跳过道中对话（E 轮已测过这两段），Boss/结算/切面仍全真实；run B（有续命）全部跳过道中对话，只验证结局与解锁差异');

const hudNum = (x) => { const m = String(x == null ? '' : x).match(/\d+/); return m ? +m[0] : NaN; };
const domText = (T, sel) => T.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? String(e.textContent || '').trim() : null; })()`);
const elHidden = (T, id) => T.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return e ? e.classList.contains('hidden') : null; })()`);
const PLAY = `s.state === 'play' && s.st && s.st.state === 'play'`;
const skipMids = () => T.eval(`(() => { const g = window.__game; if (g.stage) g._midShown = [true, true]; return true; })()`);

/* 从 easy 轮报告里取 E 难度同 Boss 的血量，用于证明 N 倍率 */
function easyBoss(tag) {
  try {
    const r = JSON.parse(fs.readFileSync('_pt/flow_chain/easy/report.json', 'utf8'));
    const s = (r.snaps || {})[`${tag}_boss`];
    return s && s.st && s.st.boss ? s.st.boss : null;
  } catch (e) { return null; }
}

async function verifyStageStart(s, idx, tag) {
  const st = s.st;
  R.chk(!!st, `${tag}: stage 存在`, '');
  if (!st) return;
  const p = st.player;
  R.chk(s.level === idx, `${tag}: levelIndex=${idx}`, `level=${s.level}`);
  R.chk(s.diff === 'N', `${tag}: 难度=N`, s.diff);
  R.chk(s.state === 'play' && st.state === 'play', `${tag}: 主/关卡状态 play`, `${s.state}/${st.state}`);
  R.chk(st.time >= 0 && st.time < 3.0, `${tag}: stage.time 归零`, `time=${st.time}`);
  R.chk(st.bullets != null && st.bullets < 10, `${tag}: 无残留子弹`, `bullets=${st.bullets}`);
  R.chk(!st.boss && !st.bossStarted, `${tag}: 无残留 Boss`, JSON.stringify({ boss: st.boss && st.boss.key, started: st.bossStarted }));
  R.chk(s.overlayHidden === true, `${tag}: 菜单遮罩隐藏`, '');
  R.chk(!!p && p.alive, `${tag}: 玩家存活`, '');
  if (!p) return;
  R.chk(p.hearts === 3 && p.invuln === 0, `${tag}: 新玩家实例（hearts=3,invuln=0）`, `hearts=${p.hearts} invuln=${p.invuln}`);
  // 残机跨面继承：第 1 面满 3 条，之后等于上一面 clear 时的 runLives
  const expLives = idx === 0 ? 3 : (s.runLives != null ? s.runLives : 3);
  R.chk(p.lives === expLives && s.runLives === expLives, `${tag}: 残机=${expLives}（跨面继承）`, `lives=${p.lives} runLives=${s.runLives}`);
  R.chk(s.hud.stage === `STAGE ${idx + 1}`, `${tag}: HUD 关卡名 STAGE ${idx + 1}`, s.hud.stage);
  R.chk(s.hud.lives === expLives && s.hud.livesTotal === expLives, `${tag}: HUD 残机 ${expLives}/${expLives}`, `${s.hud.lives}/${s.hud.livesTotal}`);
  R.chk(hudNum(s.hud.power) === Math.round(p.power), `${tag}: HUD POWER 与玩家一致`, `hud=${s.hud.power} p=${p.power}`);
  R.chk(/^0:0\d$/.test(String(s.hud.timer || '')), `${tag}: HUD 计时归零`, s.hud.timer);
  if (st.mode === 'platform') R.chk(st.enemies > 0 && st.enemies < 400, `${tag}: 敌人列表新生成`, `enemies=${st.enemies}`);
  else R.chk(st.stg && st.stg.waves > 0, `${tag}: STG 波次表存在`, JSON.stringify(st.stg));
}

/** 完成一面：可选测道中对话 → 瞬移 Boss → 逐卡击杀 → clear */
async function playStage(idx, { testMids = false, tagPrefix = 'N0' } = {}) {
  const tag = `${tagPrefix}_S${idx + 1}`;
  const s0 = await L.read(T);
  const mode = s0.st.mode;
  await L.ensureInvuln(T);
  if (testMids) {
    for (const [beat, frac] of [[1, 0.30], [2, 0.58]]) {
      await L.drive(T, PLAY, { timeout: 60000, label: `${tag} 前置 play` });
      await L.ensureInvuln(T);
      const w = mode === 'platform' ? await L.warpPlatform(T, { frac }) : await L.warpStg(T, { frac });
      const d = await L.waitDialogue(T, { timeout: 7000 });
      R.chk(!!d, `${tag}: 道中对话${beat}触发`, d ? `lines=${d.dlgLines}` : `未触发 ${JSON.stringify(w)}`);
      if (d) {
        await R.shot(`${tag}_mid${beat}`);
        await L.drive(T, PLAY, { timeout: 90000, label: `${tag} 对话${beat}按完` });
      }
    }
  } else {
    await skipMids();
  }
  await L.drive(T, PLAY, { timeout: 60000, label: `${tag} 前往 Boss` });
  await L.ensureInvuln(T);
  const warpBoss = mode === 'platform' ? await L.warpPlatform(T, { boss: true }) : await L.warpStg(T, { boss: true });
  const b1 = await L.drive(T, `s.st.bossStarted === true && s.st.boss && s.st.boss.state !== 'intro' && s.state === 'play'`, { timeout: 90000, label: `${tag} Boss 开战` });
  const b = b1.st.boss;
  R.info(`${tag}: Boss 信息`, `${b.key} maxHp=${b.maxHp} spells=${b.spellCount} phase=${b.phaseName} warp=${JSON.stringify(warpBoss)}`);
  await R.shot(`${tag}_boss`);
  R.snap(`${tag}_boss`, b1);
  const kb = await L.killBoss(T, { label: `${tag} boss`, timeout: 180000 });
  const c = kb.state;
  R.chk(c.state === 'clear' || c.st.state === 'clear', `${tag}: 击破后进入 clear`, `${c.state}/${c.st.state}`);
  R.chk(c.st.bullets != null && c.st.bullets < 10, `${tag}: clear 后清弹`, `bullets=${c.st.bullets}`);
  R.chk(c.carryPower === Math.round(c.st.player.power), `${tag}: carryPower 结算`, `carry=${c.carryPower} p=${c.st.player.power}`);
  await R.shot(`${tag}_clear`);
  return c;
}

/** clear → 下一面 / 结局 */
async function toNext(idx, tagPrefix) {
  const expr = idx < 5
    ? `s.state === 'play' && s.level === ${idx + 1} && s.st && s.st.state === 'play'`
    : `s.state === 'ending'`;
  const trace = [];
  const s = await L.drive(T, expr, {
    timeout: 180000, label: `${tagPrefix} S${idx + 1}→${idx < 5 ? '下一面' : '结局'}`,
    onTick: (x) => { const k = `${x.state}/${x.st ? x.st.state : '-'}/${x.dlg ? 'dlg' : '-'}/${x.level}`; if (trace[trace.length - 1] !== k) trace.push(k); },
  });
  R.info(`${tagPrefix} S${idx + 1} 过渡轨迹`, trace.join(' → ').slice(0, 700));
  R.chk(trace.some((k) => k.startsWith('clear/')), `${tagPrefix} S${idx + 1}: clear 阶段真实出现`, trace.slice(0, 3).join(' → '));
  return s;
}

/* ============================== A. N 零续命：6 面链 + 解锁 ============================== */
log('boot 完成，开始 A：N 零续命六面链');
let s = await L.read(T);
R.chk(s.state === 'menu' && s.overlayHidden === false, '标题页就绪', s.state);
R.chk(s.unlockedExtra === false && s.prog == null, '清档后 EXTRA 未解锁', JSON.stringify(s.prog));
R.snap('A1_title', s);
await R.shot('A1_title_locked');

const nBossHp = {}; // 记录 N 前两面 Boss 血量，与 E 对比
await step('N 零续命 · 第 1-2 面（含道中对话）与倍率', async () => {
  const s0 = await L.startRun(T, { diff: 'KeyN', char: 'Digit1' });
  R.chk(s0.diff === 'N' && s0.continues === 0 && s0.level === 0, '开局：难度 N、续命 0、第 1 面', `${s0.diff}/c=${s0.continues}/lvl=${s0.level}`);
  await verifyStageStart(s0, 0, 'N0_S1');
  R.snap('A2_S1_start', s0);

  const c1 = await playStage(0, { testMids: true, tagPrefix: 'N0' });
  const e1 = easyBoss('stage1');
  nBossHp.stage1 = (R.snaps['N0_S1_boss'] || {}).st?.boss?.maxHp;
  if (e1) {
    R.chk(nBossHp.stage1 > e1.maxHp, 'N 难度第 1 面 Boss 血量 > E（hpScale 1.0 vs 0.85）', `N=${nBossHp.stage1} E=${e1.maxHp}`);
    R.chk((R.snaps['N0_S1_boss'] || {}).st?.boss?.spellCount === e1.spellCount, '第 1 面符卡数与 E 一致（前两面不裁卡）', `N=${(R.snaps['N0_S1_boss'] || {}).st?.boss?.spellCount} E=${e1.spellCount}`);
  } else {
    R.chk(nBossHp.stage1 > 1616, 'N 难度第 1 面 Boss 血量 > E 基线 1616', `N=${nBossHp.stage1}`);
  }
  const s2 = await toNext(0, 'N0');
  R.chk(s2.level === 1 && s2.diff === 'N', '第 1 面→第 2 面 levelIndex=1', `level=${s2.level}`);
  await verifyStageStart(s2, 1, 'N0_S2');
  R.snap('A3_S2_start', s2);
  await R.shot('A3_S2_start');
  const c2 = await playStage(1, { testMids: true, tagPrefix: 'N0' });
  const e2 = easyBoss('stage2');
  nBossHp.stage2 = (R.snaps['N0_S2_boss'] || {}).st?.boss?.maxHp;
  if (e2) R.chk(nBossHp.stage2 > e2.maxHp, 'N 难度第 2 面 Boss 血量 > E', `N=${nBossHp.stage2} E=${e2.maxHp}`);
  else R.info('第 2 面 E 基线缺失', `N=${nBossHp.stage2}`);
});

await step('N 零续命 · 第 3-6 面（6 面链收尾）', async () => {
  const s3 = await toNext(1, 'N0');
  R.chk(s3.level === 2, '第 2 面→第 3 面 levelIndex=2', `level=${s3.level}`);
  await verifyStageStart(s3, 2, 'N0_S3');
  await playStage(2, { testMids: false, tagPrefix: 'N0' });
  const s4 = await toNext(2, 'N0');
  R.chk(s4.level === 3 && s4.st.mode === 'stg', '第 4 面存在且为 STG 模式（第 3→4 面链）', `level=${s4.level} mode=${s4.st && s4.st.mode}`);
  await verifyStageStart(s4, 3, 'N0_S4');
  await R.shot('A4_S4_start');
  await playStage(3, { testMids: false, tagPrefix: 'N0' });
  const s5 = await toNext(3, 'N0');
  R.chk(s5.level === 4, '第 4 面→第 5 面 levelIndex=4', `level=${s5.level}`);
  await verifyStageStart(s5, 4, 'N0_S5');
  await playStage(4, { testMids: false, tagPrefix: 'N0' });
  const s6 = await toNext(4, 'N0');
  R.chk(s6.level === 5, 'N 难度第 6 面存在（levelIndex=5，6 面链）', `level=${s6.level} diff=${s6.diff}`);
  await verifyStageStart(s6, 5, 'N0_S6');
  R.snap('A5_S6_start', s6);
  await R.shot('A5_S6_start');
  await playStage(5, { testMids: true, tagPrefix: 'N0' });
});

await step('N 零续命 · END02 与 EXTRA 解锁写盘', async () => {
  const e = await L.drive(T, `s.state === 'ending'`, { timeout: 120000, label: 'N 结局页' });
  R.chk(e.endingVisible === true, '结局页可见', '');
  R.chk(e.edChapter === 'ENDING 02', 'N 零续命通关进入 ENDING 02（TRUE ENDING）', `edChapter=${e.edChapter}`);
  R.chk(e.unlockedExtra === true, 'N 零续命通关解锁 EXTRA（内存）', `unlocked=${e.unlockedExtra}`);
  R.chk(e.extraChar === 'reimu', 'EXTRA 解锁角色=灵梦', `extraChar=${e.extraChar}`);
  R.chk(!!e.prog && e.prog.extraUnlocked === true && e.prog.extraChar === 'reimu', 'hks.progress.v1 已写盘（extraUnlocked/extraChar）', JSON.stringify(e.prog));
  R.snap('B1_ending_scene', e);
  await R.shot('B1_ending_scene');

  await T.key('Escape', 22); await sleep(500);
  const c = await L.read(T);
  R.chk(c.edPhase === 'card' && c.edCardNo === 'END 02', '结局卡=END 02', `phase=${c.edPhase} no=${c.edCardNo}`);
  R.chk(c.edCardKind === 'TRUE ENDING', '结局卡类型=TRUE ENDING', `kind=${c.edCardKind}`);
  R.chk(c.edCardTitle === '春之尽头', 'END02 卡标题=春之尽头', `title=${c.edCardTitle}`);
  await R.shot('B2_ending_card');
  await L.observe(T, `s.edCardT >= 0.8`, { timeout: 15000, pollMs: 100 });
  await T.key('Enter', 20);
  const back = await L.drive(T, `s.state === 'menu'`, { timeout: 30000, label: '结局返回标题', press: false });
  R.chk(back.title === '東方新紀行', 'END02 后返回标题', back.title);
  const eb = (back.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
  R.chk(!!eb && eb.disabled === false, '标题页 EXTRA 入口解锁（可点击）', JSON.stringify(eb));
  R.snap('B3_title_unlocked', back);
  await R.shot('B3_title_unlocked');
});

await step('N 零续命 · reload 后解锁持久化', async () => {
  await T.reload();
  await T.waitFor('!!window.__game', 30000);
  await sleep(500);
  const r = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'reload 标题', press: false });
  R.chk(r.unlockedExtra === true, 'reload 后 EXTRA 仍解锁', `unlocked=${r.unlockedExtra}`);
  R.chk(!!r.prog && r.prog.extraUnlocked === true && r.prog.extraChar === 'reimu', 'reload 后 progress 与写盘一致', JSON.stringify(r.prog));
  const eb = (r.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
  R.chk(!!eb && eb.disabled === false, 'reload 后标题 EXTRA 入口可用', JSON.stringify(eb));
  R.snap('C1_reload_unlocked', r);
  await R.shot('C1_reload_unlocked');
});

/* ============================== B. N 有续命：END01 + 不解锁 ============================== */
await step('N 有续命 · 清档后 1 次续命通关的结局/解锁差异', async () => {
  // 清掉 run A 解锁的进度并 reload，让内存回到未解锁
  await T.eval(`(() => { localStorage.removeItem('hks.progress.v1'); return 1; })()`);
  await T.reload();
  await T.waitFor('!!window.__game', 30000);
  await sleep(400);
  const t0 = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: '清档后标题', press: false });
  R.chk(t0.unlockedExtra === false && t0.prog == null, '清档后 EXTRA 再次锁定', `unlocked=${t0.unlockedExtra}`);

  const s0 = await L.startRun(T, { diff: 'KeyN', char: 'Digit1' });
  R.chk(s0.continues === 0 && s0.level === 0, 'N 新局开始', `c=${s0.continues}`);
  await L.ensureInvuln(T);
  const go = await L.dieToGameOver(T, { label: 'N runB 首次 GameOver' });
  R.chk(go.state.state === 'gameover', 'N runB 耗尽残机→gameover', go.state.state);
  await R.shot('D1_gameover');
  const c1 = await L.continueFromGameOver(T);
  R.chk(c1.continues === 1 && c1.level === 0, '续命 1 次后从第 1 面重开', `continues=${c1.continues} level=${c1.level}`);
  await L.ensureInvuln(T);

  // 六面：跳过道中对话（已测），Boss/结算/切面全真实
  for (let idx = 0; idx < 6; idx++) {
    log(`runB 第 ${idx + 1}/6 面`);
    await skipMids();
    if (idx === 0) {
      // 第 1 面当前已在 play（续命重开），直接打
    } else {
      // 上一面 toNext 已带我们进入本面
    }
    await L.ensureInvuln(T);
    const c = await playStage(idx, { testMids: false, tagPrefix: 'N1' });
    if (idx < 5) {
      const ns = await toNext(idx, 'N1');
      R.chk(ns.level === idx + 1, `runB 第 ${idx + 1}→${idx + 2} 面`, `level=${ns.level}`);
    }
  }
  const e = await L.drive(T, `s.state === 'ending'`, { timeout: 120000, label: 'runB 结局页' });
  R.chk(e.edChapter === 'ENDING 01', 'N 有续命通关进入 ENDING 01（REGRET ENDING，与零续命不同）', `edChapter=${e.edChapter}`);
  R.chk(e.unlockedExtra === false, 'N 有续命通关不解锁 EXTRA', `unlocked=${e.unlockedExtra}`);
  R.chk(e.prog == null, 'N 有续命通关不写 hks.progress.v1', JSON.stringify(e.prog));
  R.snap('D2_ending_bad', e);
  await R.shot('D2_ending_bad');
  await T.key('Escape', 22); await sleep(500);
  const c = await L.read(T);
  R.chk(c.edCardNo === 'END 01' && c.edCardKind === 'REGRET ENDING', '有续命结局卡=END 01/REGRET ENDING', `${c.edCardNo}/${c.edCardKind}`);
  await L.observe(T, `s.edCardT >= 0.8`, { timeout: 15000, pollMs: 100 });
  await T.key('Enter', 20);
  const back = await L.drive(T, `s.state === 'menu'`, { timeout: 30000, label: 'runB 返回标题', press: false });
  R.chk(back.unlockedExtra === false, '返回标题后 EXTRA 仍锁定', `unlocked=${back.unlockedExtra}`);
  const eb2 = (back.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
  // flow-menu 修后：锁定态改为可点击给解锁提示（cls 仍带 locked，disabled=false）
  R.chk(!!eb2 && /locked/.test(String(eb2.cls || '')) && eb2.disabled === false, '标题「禁忌的祭典」仍为锁定样式（可点击给提示）', JSON.stringify(eb2));
  await T.key('KeyE', 22); await sleep(420);
  const lk = await L.read(T);
  R.chk(lk.state === 'menu' && lk.inExtra === false, '有续命通关后按 E 仍不会进入 EXTRA', `state=${lk.state} inExtra=${lk.inExtra}`);
  R.snap('D3_title_locked_feedback', lk);
  await R.shot('D4_title_locked_feedback');
});

/* ============================== 汇总 ============================== */
const rep = await T.report();
R.chk((rep.errors || []).length === 0, '全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
R.chk((rep.httpBad || []).length === 0, '全程无 HTTP 4xx/5xx', JSON.stringify((rep.httpBad || []).slice(0, 5)));
R.info('网络/资源', `resources=${(rep.resources || []).length}, netFails=${(rep.netFails || []).length}, warns=${(rep.warns || []).length}, fps=${(await L.snapshot(T)).fps}`);
const out = await R.write({ section: SECTION, port: PORT, accel: R.accel, report: rep, nBossHp, easyBoss: { stage1: easyBoss('stage1'), stage2: easyBoss('stage2') }, steps });
L.writeCombined(SECTION, out, R.findings);
await T.close();
console.log(JSON.stringify({
  section: SECTION, pass: out.pass, passCount: out.passCount, failCount: out.failCount,
  nBossHp, checks: R.checks.filter((c) => !c.ok && !c.info).map((c) => `${c.name} :: ${c.detail}`), ms: out.ms,
}, null, 2));
