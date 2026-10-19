/**
 * flow_chain / E 难度全程：关卡链（5 面）→ E 结局 END01 → GameOver/续命 → 暂停退出 → 持久化
 * 运行：node tools/_pt_flow_chain_easy.mjs
 */
import { sleep } from './_pt_core.mjs';
import * as L from './_pt_flow_chain_lib.mjs';

const SECTION = 'easy';
const T = await L.openGame({ clearStorage: true });
const R = new L.Run(SECTION, T);
process.on('uncaughtException', async (e) => { console.error('FATAL', e); try { await T.close(); } catch (_) { /* ignore */ } process.exit(1); });
process.on('unhandledRejection', async (e) => { console.error('FATAL-REJECT', e); try { await T.close(); } catch (_) { /* ignore */ } process.exit(1); });
const steps = [];
const log = (m) => console.log(`[easy ${new Date().toISOString().slice(11, 19)}] ${m}`);
const step = async (name, fn) => {
  steps.push(name);
  log(`开始步骤 ${name}`);
  const t0 = Date.now();
  try { await fn(); log(`完成步骤 ${name}（${((Date.now() - t0) / 1000).toFixed(1)}s）`); }
  catch (e) {
    log(`步骤异常 ${name}: ${e && e.message}`);
    R.chk(false, `步骤异常:${name}`, String(e && e.message || e));
    try { await R.shot(`err_${steps.length}_${name.replace(/[^\w\u4e00-\u9fa5]+/g, '_')}`); } catch (e2) { /* ignore */ }
    if (e && e.state) R.snap(`err_${name}`, e.state);
  }
};

R.accelNote('玩家 invuln=999 免死；Boss 用 boss.damage(spellHp+1) 逐张破符卡（state 仍走 battle→defeat→dead→clear 真实路径），defeatT=2.25 跳过 2.2s 击破动画；平台关瞬移到 30%/58%/Boss 线，STG 关拨 stg.scroll 到 30%/55%/Boss 线，触发仍由 Stage.update / _maybeMidDialogue 真实判定；对话全部用真实 Enter 键');

const hudNum = (x) => { const m = String(x == null ? '' : x).match(/\d+/); return m ? +m[0] : NaN; };
const domText = (T, sel) => T.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? String(e.textContent || '').trim() : null; })()`);
const elHidden = (T, id) => T.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return e ? e.classList.contains('hidden') : null; })()`);

/** 每面开始时的统一验收 */
async function verifyStageStart(s, idx) {
  const tag = `stage${idx + 1}`;
  const st = s.st;
  R.chk(!!st, `${tag}: stage 对象存在`, '');
  if (!st) return;
  const p = st.player;
  R.chk(s.level === idx, `${tag}: levelIndex=${idx}`, `level=${s.level}`);
  R.chk(s.state === 'play' && st.state === 'play', `${tag}: 主/关卡状态均为 play`, `${s.state}/${st.state}`);
  R.chk(st.time >= 0 && st.time < 3.0, `${tag}: stage.time 已归零`, `time=${st.time}`);
  R.chk(st.bullets != null && st.bullets < 10, `${tag}: 无上一面残留子弹`, `bullets=${st.bullets}`);
  R.chk(!st.boss && !st.bossStarted, `${tag}: 无上一面残留 Boss`, JSON.stringify({ boss: st.boss && st.boss.key, started: st.bossStarted }));
  R.chk(s.overlayHidden === true, `${tag}: 菜单遮罩已隐藏（进入可玩画面）`, `overlayHidden=${s.overlayHidden}`);
  R.chk(!!p && p.alive === true, `${tag}: 玩家存活`, '');
  if (!p) return;
  R.chk(p.hearts === 3, `${tag}: 玩家 hearts=3（新玩家实例）`, `hearts=${p.hearts}`);
  R.chk(p.invuln === 0, `${tag}: 新玩家 invuln=0（不是上一面残留状态）`, `invuln=${p.invuln}`);
  // 残机是跨面继承的（前一关 clear 时 runLives=剩余残机），第 1 面才是满 3 条。
  const expLives = idx === 0 ? 3 : (s.runLives != null ? s.runLives : 3);
  R.chk(p.lives === expLives, `${tag}: 玩家 lives=${expLives}（跨面继承 runLives）`, `lives=${p.lives}`);
  R.chk(s.runLives === expLives, `${tag}: g.runLives=${expLives}`, `runLives=${s.runLives}`);
  R.chk(s.hud.lives === expLives && s.hud.livesTotal === expLives, `${tag}: HUD 残机显示 ${expLives}/${expLives}`, `${s.hud.lives}/${s.hud.livesTotal}`);
  R.chk(hudNum(s.hud.power) === Math.round(p.power), `${tag}: HUD POWER 与玩家火力一致`, `hud=${s.hud.power} player=${p.power}`);
  R.chk(p.power === s.carryPower, `${tag}: 玩家火力=本局 carryPower(${s.carryPower})`, `power=${p.power}`);
  R.chk(s.hud.stage === `STAGE ${idx + 1}`, `${tag}: HUD 关卡名=STAGE ${idx + 1}`, `hud=${s.hud.stage}`);
  R.chk(/^0:0\d$/.test(String(s.hud.timer || '')), `${tag}: HUD 计时从 0 开始`, `timer=${s.hud.timer}`);
  if (st.mode === 'platform') {
    R.chk(st.enemies != null && st.enemies > 0 && st.enemies < 400, `${tag}: 敌人列表是本面新生成的`, `enemies=${st.enemies}`);
    R.chk(Math.abs(p.x) < 600 && p.y > 200, `${tag}: 玩家回到出生点`, `x=${p.x}, y=${p.y}`);
  } else {
    R.chk(!!st.stg && st.stg.waves > 0, `${tag}: STG 道中波次表已建立`, JSON.stringify(st.stg));
    R.chk(st.stg && st.stg.scroll < 2000, `${tag}: STG 滚动条归零`, `scroll=${st.stg && st.stg.scroll}`);
  }
}

/** 可玩性：→ 键应真的让玩家移动（防止黑屏/冻结/输入失效）。平台关看 x，STG 关看屏幕内 sx */
async function verifyPlayable(tag) {
  const a = await L.read(T);
  if (!a.st || !a.st.player || a.state !== 'play') { R.chk(false, `${tag}: 可操作检查前置状态`, `state=${a.state}`); return; }
  const isStg = a.st.mode === 'stg';
  const posExpr = `(() => { const p = window.__game.stage && window.__game.stage.player; if (!p) return null; return ${isStg ? 'Math.round(p.sx)' : 'Math.round(p.x)'}; })()`;
  const p0 = await T.eval(posExpr);
  await T.keyDown('ArrowRight');
  await sleep(420);
  await T.keyUp('ArrowRight');
  await sleep(160);
  const b = await L.read(T);
  const p1 = await T.eval(posExpr);
  const dx = (p0 != null && p1 != null) ? p1 - p0 : NaN;
  R.chk(dx > 4, `${tag}: 进面后可操作（→ 实际移动）`, `dx=${dx}px, ${isStg ? 'sx' : 'x'} ${p0}→${p1}`);
  if (!isStg) R.chk(b.st && b.st.px != null && Math.abs(b.st.px) > 0, `${tag}: 玩家位置可读`, `px=${b.st && b.st.px}`);
  await R.shot(`stage${tag.replace(/[^\d]/g, '')}_play`);
}

/** 道中对话：瞬移到阈值，等 Stage.update 自己触发，再把对话按完 */
async function checkMidDialogue(idx, beat, warp) {
  const tag = `stage${idx + 1}`;
  const before = await L.read(T);
  const w = await warp();
  if (!w || w.ok === false) { R.chk(false, `${tag}: 道中对话 ${beat} 瞬移/拨表成功`, JSON.stringify(w)); return; }
  const d = await L.waitDialogue(T, { timeout: 7000 });
  if (!d) {
    R.chk(false, `${tag}: 道中对话 ${beat} 触发`, `进度=${JSON.stringify(w)}，7s 内未进入 dialogue`);
    return;
  }
  R.chk(true, `${tag}: 道中对话 ${beat} 触发（真实阈值判定）`, `script 行数=${d.dlgLines}，index=${d.dlgIndex}`);
  await R.shot(`stage${idx + 1}_mid${beat}`);
  const after = await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 90000, label: `${tag} 道中对话${beat}按完` });
  const delta = +(after.st.time - before.st.time).toFixed(2);
  R.info(`${tag}: 道中对话${beat}期间关卡时间被冻结`, `time ${before.st.time} → ${after.st.time}（差 ${delta}s，含收尾帧）`);
  R.chk(after.st.state === 'play' && after.level === idx, `${tag}: 道中对话${beat}结束后回到本面 play`, `${after.state}/${after.st.state}`);
}

/* ============================== A. 标题 → E/灵梦 → 5 面链 ============================== */
log('boot 完成，开始 A：标题页检查');
let s = await L.read(T);
R.chk(s.state === 'menu' && s.overlayHidden === false, '标题页已就绪', `${s.state}, overlayHidden=${s.overlayHidden}`);
R.chk(s.title === '東方新紀行', '标题文本=東方新紀行', s.title);
R.chk(s.unlockedExtra === false, '清档后 EXTRA 未解锁', `unlockedExtra=${s.unlockedExtra}`);
const extraBtn = (s.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
// flow-menu 修后：锁定态不再 disabled，而是保留锁定视觉 + 可点击/按 E 给解锁提示（noSelect+feedback）
R.chk(!!extraBtn && /locked/.test(String(extraBtn.cls || '')), '标题页「禁忌的祭典」显示为锁定样式', JSON.stringify(extraBtn));
R.chk(!!extraBtn && extraBtn.disabled === false, '锁定 EXTRA 可点击以给出解锁提示（修后行为，disabled=false）', JSON.stringify(extraBtn));
await T.key('KeyE', 22); await sleep(420);
const lockFb = await L.read(T);
const lockHint = await T.eval(`String(document.getElementById('hint').textContent || '').trim()`);
R.chk(lockFb.state === 'menu' && lockFb.inExtra === false, '锁定时按 E 不会进入 EXTRA', `state=${lockFb.state} inExtra=${lockFb.inExtra}`);
R.chk(/EXTRA 尚未解锁/.test(lockHint), '锁定时按 E 给出解锁条件提示', lockHint);
R.chk(s.prog == null, '清档后无 hks.progress.v1', JSON.stringify(s.prog));
R.snap('A1_title', s);
await R.shot('A1_title_locked');

await step('进入难度页并选 E', async () => {
  await T.key('Enter', 22); await sleep(380);
  const d = await L.read(T);
  R.chk(d.title === '选择难度', '标题→难度页（#title=选择难度）', d.title);
  await T.key('KeyE', 22); await sleep(380);
  const c = await L.read(T);
  R.chk(c.diff === 'E', '热键 E 将难度设为 EASY', c.diff);
  R.chk(c.title === '选择主角', '难度页→选人页（#title=选择主角）', c.title);
  R.snap('A2_diff_E', c);
  await R.shot('A2_charselect');
});

await step('选灵梦并测对话逐页推进', async () => {
  await T.key('Digit1', 22);
  const first = await L.observe(T, `s.state === 'dialogue' && s.dlg`, { timeout: 9000, pollMs: 100 });
  R.chk(!!first, '选人后开场对话开始', first ? `lines=${first.dlgLines}, index=${first.dlgIndex}` : '9s 未开始');
  if (first) R.snap('A3_opening', first);
  // 逐次按键：记录每次按键让 dialogue 发生的变化
  const t0 = Date.now();
  const seg = [];
  let cur = null;
  let jumps = [];
  let pressCount = 0;
  let maxIndex = -1;
  while (Date.now() - t0 < 120000) {
    const a = await L.read(T);
    if (a.state === 'play' && a.st && a.st.state === 'play' && !a.dlg) break;
    if (!a.dlg) { await sleep(120); continue; }
    if (cur === null || a.dlgLines !== cur.lines) {
      cur = { lines: a.dlgLines, startIndex: a.dlgIndex, maxIndex: a.dlgIndex };
      seg.push(cur);
    }
    cur.maxIndex = Math.max(cur.maxIndex, a.dlgIndex);
    maxIndex = Math.max(maxIndex, a.dlgIndex);
    const before = a;
    await T.key('Enter', 20);
    pressCount += 1;
    await sleep(150);
    const after = await L.read(T);
    if (after.dlg && before.dlg && after.dlgLines === before.dlgLines) {
      if (after.dlgIndex > before.dlgIndex + 1) jumps.push({ from: before.dlgIndex, to: after.dlgIndex });
    }
  }
  R.info('对话逐次按键统计', `按键 ${pressCount} 次；对话段 ${seg.length} 段；每段 index 峰值 ${seg.map((g) => g.maxIndex + 1).join('/')}（行数上限 ${seg.map((g) => g.lines).join('/')}）`);
  R.chk(jumps.length === 0, '单次 Enter 不会一次跳过整页（index 最多 +1）', JSON.stringify(jumps));
  R.chk(seg.every((g) => g.maxIndex + 1 === g.lines || g.maxIndex < g.lines), '对话行号不越界', JSON.stringify(seg));
});

let sPlay1 = await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 90000, label: 'E run 第一面开始' });
await verifyStageStart(sPlay1, 0);
await verifyPlayable('stage1');
R.snap('A4_stage1_start', sPlay1);
await L.ensureInvuln(T);
R.accelNote('run1：每面开始后把 player.invuln 置 999');

/* ---- 5 面循环 ---- */
const transitionTraces = {};
for (let idx = 0; idx < 5; idx++) {
  const tag = `stage${idx + 1}`;
  log(`进入 ${tag}（第 ${idx + 1}/5 面）`);
  await step(`${tag} 道中对话与 Boss`, async () => {
    let st = (await L.read(T)).st;
    const mode = st.mode;
    for (const [beat, frac] of [[1, 0.30], [2, 0.58]]) {
      // 每次瞬移前确保回到 play
      await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 60000, label: `${tag} 前置 play` });
      await L.ensureInvuln(T);
      await checkMidDialogue(idx, beat, () => (mode === 'platform'
        ? L.warpPlatform(T, { frac })
        : L.warpStg(T, { frac })));
    }
    // 到 Boss 线
    await L.drive(T, `s.state === 'play' && s.st && s.st.state === 'play'`, { timeout: 60000, label: `${tag} 前往 Boss 前置 play` });
    await L.ensureInvuln(T);
    const warpBoss = mode === 'platform' ? await L.warpPlatform(T, { boss: true }) : await L.warpStg(T, { boss: true });
    R.info(`${tag}: 瞬移到 Boss 触发线`, JSON.stringify(warpBoss));
    const b0 = await L.drive(T, `s.st && s.st.bossStarted === true && s.st.boss`, {
      timeout: 90000, label: `${tag} Boss 登场`,
      onTick: (x) => { const k = `${x.state}/${x.st ? x.st.state : '-'}/${x.dlg ? 'dlg' : '-'}`; transitionTraces[tag + '_toBoss'] = transitionTraces[tag + '_toBoss'] || []; if (transitionTraces[tag + '_toBoss'].slice(-1)[0] !== k) transitionTraces[tag + '_toBoss'].push(k); },
    });
    // 等开场演出结束进入 battle（真实 update 推进）
    const b1 = await L.drive(T, `s.st.boss && s.st.boss.state !== 'intro' && s.state === 'play'`, { timeout: 90000, label: `${tag} Boss 开战` });
    const b = b1.st.boss;
    R.info(`${tag}: Boss 登场信息`, `${b.key} maxHp=${b.maxHp} spellCount=${b.spellCount} phase=${b.phaseName}`);
    R.chk(b1.hud.bossVisible === true, `${tag}: Boss 血条显示`, `bossBarVisible=${b1.hud.bossVisible}`);
    R.chk(!!b1.hud.bossName && !!b1.hud.bossPhase, `${tag}: Boss 名称/符卡文本已渲染`, `${b1.hud.bossName} / ${b1.hud.bossPhase}`);
    const firing = await L.observe(T, `s.st.bullets > 0`, { timeout: 6000, pollMs: 120 });
    R.chk(!!firing, `${tag}: Boss 战有弹幕运行`, firing ? `bullets=${firing.st.bullets}` : '6s 内未见子弹');
    log(`${tag} Boss ${b.key} 开战（maxHp=${b.maxHp}, 符卡 ${b.spellCount}），开始逐张破卡`);
    R.snap(`${tag}_boss`, b1);
    await R.shot(`${tag}_boss`);

    const kb = await L.killBoss(T, { label: `${tag} boss`, timeout: 180000 });
    const cleared = kb.state;
    R.chk(cleared.state === 'clear' || cleared.st.state === 'clear', `${tag}: 击破后 main/stage 进入 clear`, `${cleared.state}/${cleared.st.state}`);
    R.chk(cleared.st.bullets != null && cleared.st.bullets < 10, `${tag}: 击破后清空弹幕`, `bullets=${cleared.st.bullets}`);
    R.chk(cleared.carryPower === Math.round(cleared.st.player.power), `${tag}: 结算继承火力 carryPower`, `carry=${cleared.carryPower} player=${cleared.st.player.power}`);
    // 边界：clear 的 1.8s 横幅窗口内乱按（Enter/Space/方向），不应跳面或丢结算对话。
    // 是否吞掉结算对话由下面的 sawSettleDlg 断言兜底。
    const bannerKeys = [];
    for (const k of ['Enter', 'Space', 'ArrowRight', 'Enter']) {
      const a = await L.read(T);
      bannerKeys.push(`${k}@${a.state}/${a.st ? a.st.state : '-'}/lvl=${a.level}`);
      await T.key(k, 16); await sleep(120);
    }
    R.info(`${tag}: clear 横幅窗口按键`, bannerKeys.join(' | '));
    R.snap(`${tag}_clear`, cleared);
    await R.shot(`${tag}_clear`);

    // 结算对话 → 下一面 / 结局
    const nextExpr = idx < 4
      ? `s.state === 'play' && s.level === ${idx + 1} && s.st && s.st.state === 'play'`
      : `s.state === 'ending'`;
    const trace = [];
    const next = await L.drive(T, nextExpr, {
      timeout: 180000, label: `${tag} 结算→${idx < 4 ? '下一面' : '结局'}`,
      onTick: (x) => { const k = `${x.state}/${x.st ? x.st.state : '-'}/${x.dlg ? 'dlg' : '-'}/${x.level}`; if (trace[trace.length - 1] !== k) trace.push(k); },
    });
    transitionTraces[tag + '_afterClear'] = trace;
    const sawClear = trace.some((k) => k.startsWith('clear/'));
    const sawSettleDlg = trace.some((k) => (k.startsWith('dialogue/') || k.includes('/dialogue/')) && k.includes('dlg'));
    R.info(`${tag}: 结算过渡轨迹`, trace.join(' → ').slice(0, 800));
    R.chk(sawClear, `${tag}: clear 阶段被真实观测到`, trace.slice(0, 4).join(' → '));
    if (idx < 4) R.chk(sawSettleDlg, `${tag}: clear 后有结算对话（未黑屏直跳）`, trace.join(' → ').slice(0, 400));
    R.snap(`${tag}_afterClear`, next);
    return next;
  });
  if (idx < 4) {
    const ns = await L.read(T);
    await verifyStageStart(ns, idx + 1);
    await verifyPlayable(`stage${idx + 2}`);
    R.snap(`A5_stage${idx + 2}_start`, ns);
    await L.ensureInvuln(T);
  }
}

/* ============================== B. E 结局 ============================== */
await step('E 结局 END01 与返回标题', async () => {
  const e = await L.drive(T, `s.state === 'ending'`, { timeout: 120000, label: '结局页' });
  R.chk(e.endingVisible === true, '结局页 #ending 可见', `endingVisible=${e.endingVisible}`);
  R.chk(e.edChapter === 'ENDING 01', 'E 难度通关进入 ENDING 01（REGRET ENDING）', `edChapter=${e.edChapter}`);
  R.chk(e.inExtra === false, '非 EXTRA', `inExtra=${e.inExtra}`);
  R.chk(e.unlockedExtra === false, 'E 通关不解锁 EXTRA', `unlockedExtra=${e.unlockedExtra}`);
  R.chk(e.prog == null, 'E 通关不写 hks.progress.v1', JSON.stringify(e.prog));
  R.chk((await elHidden(T, 'hud')) === true, '结局页隐藏 HUD', '');
  R.snap('B1_ending_scene', e);
  await R.shot('B1_ending_scene');

  // 逐次 Enter 推进场景（不跳卡）
  let prev = e;
  let progressed = 0;
  for (let i = 0; i < 6; i++) {
    const before = await L.read(T);
    await T.key('Enter', 20); await sleep(320);
    const after = await L.read(T);
    const changed = after.edPhase !== before.edPhase || after.edLine !== before.edLine || after.edShot !== before.edShot;
    if (changed) progressed += 1;
    prev = after;
    R.info(`结局第 ${i + 1} 次 Enter`, `phase=${before.edPhase} line=${before.edLine} → phase=${after.edPhase} line=${after.edLine}`);
  }
  R.chk(progressed >= 1, '结局页 Enter 能逐段推进（场景/台词变化）', `progressed=${progressed}/6`);

  // Esc 跳到结局卡
  await T.key('Escape', 22); await sleep(500);
  const c = await L.read(T);
  R.chk(c.state === 'ending' && c.edPhase === 'card', 'Esc 跳到结局卡（phase=card）', `${c.state}/${c.edPhase}`);
  R.chk(c.edCardVisible === true, '结局卡 #edCard 可见', `edCardVisible=${c.edCardVisible}`);
  R.chk(c.edCardNo === 'END 01', 'E 结局卡编号=END 01', `edCardNo=${c.edCardNo}`);
  R.chk(c.edCardKind === 'REGRET ENDING', 'E 结局卡类型=REGRET ENDING', `edCardKind=${c.edCardKind}`);
  R.chk(c.edCardTitle === '不落之春', 'END01 卡标题=不落之春', `edCardTitle=${c.edCardTitle}`);
  R.chk(c.edPrompt === 'ENTER / 点击返回', '结局卡提示文案', `edPrompt=${c.edPrompt}`);
  // —— 防跳卡：卡刚出现（cardT<0.75）时按 Enter 不应退出 ——
  // 注意：headless 下每次 eval 有 100~300ms RTT，cardT 已接近阈值时不判定（避免把测量延迟误报成 bug）
  const pressAt = c.edCardT;
  await T.key('Enter', 20); await sleep(220);
  const now = await L.read(T);
  R.info('结局卡防跳卡测量', `按 Enter 时 cardT=${pressAt}，按后 state=${now.state} cardT=${now.edCardT}`);
  if (pressAt != null && pressAt < 0.55) {
    R.chk(now.state === 'ending' && now.edPhase === 'card', '结局卡刚出现就按 Enter 不会误退（cardT<0.75 防跳卡）', `按时 cardT=${pressAt}，之后 state=${now.state} cardT=${now.edCardT}`);
  } else {
    R.info('防跳卡测量窗口错过（headless 延迟）', `按 Enter 时 cardT=${pressAt}，本次不判定`);
  }
  R.snap('B2_ending_card', c);
  await R.shot('B2_ending_card');
  // 等卡稳定后 Enter 返回标题
  await L.observe(T, `s.edCardT >= 0.8`, { timeout: 15000, pollMs: 100 });
  await T.key('Enter', 20);
  const back = await L.drive(T, `s.state === 'menu'`, { timeout: 30000, label: '结局返回标题', press: false });
  R.chk(back.title === '東方新紀行' && back.overlayHidden === false, '结局结束后返回标题页', `title=${back.title} hidden=${back.overlayHidden}`);
  R.chk(back.unlockedExtra === false, '完成后 EXTRA 仍未解锁（E 难度）', `unlocked=${back.unlockedExtra}`);
  R.snap('B3_title_after_ending', back);
  await R.shot('B3_title_after_ending');

  // 结局实例收尾：不应残留 ending.active / #ending 可见
  const residue = await L.read(T);
  R.chk(residue.edActive === false, '结局结束后 ending 实例不再 active', `edActive=${residue.edActive}`);
  R.chk((await elHidden(T, 'ending')) === true, '结局结束后 #ending 已隐藏', '');

  // 结局结束后立刻开新局：HUD/关卡/弹幕都不该带上一局残留
  const nr = await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  await verifyStageStart(nr, 0);
  R.chk(nr.state === 'play' && nr.st.state === 'play' && nr.st.bullets < 10 && !nr.st.boss, '结局结束后立刻开新局无残留（HUD/关卡/弹幕/Boss）', `${nr.state}/${nr.st.state} bullets=${nr.st.bullets} boss=${nr.st.boss && nr.st.boss.key}`);
  R.snap('B4_new_run_after_ending', nr);
  await R.shot('B4_new_run_after_ending');
  await L.quitToTitle(T);
});

/* ============================== C. 持久化：reload 后一致 ============================== */
await step('reload 持久化', async () => {
  await T.reload();
  await T.waitFor('!!window.__game', 30000);
  await sleep(500);
  const r = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 40000, label: 'reload 后标题', press: false });
  R.chk(r.unlockedExtra === false, 'reload 后 EXTRA 仍锁定', `unlocked=${r.unlockedExtra}`);
  R.chk(r.prog == null, 'reload 后无 EXTRA 解锁存档', JSON.stringify(r.prog));
  const eb = (r.buttons || []).find((b) => /禁忌的祭典/.test(b.t));
  R.chk(!!eb && /locked/.test(String(eb.cls || '')) && eb.disabled === false, 'reload 后标题「禁忌的祭典」仍为锁定样式（可点击给提示）', JSON.stringify(eb));
  R.snap('C1_reload_title', r);
  await R.shot('C1_reload_title');
});

/* ============================== D. GameOver / 续命 / 返回标题 ============================== */
await step('GameOver 链', async () => {
  const s0 = await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  R.chk(s0.state === 'play' && s0.continues === 0 && s0.level === 0, '新开一局：state=play、继续次数=0、第 1 面', `${s0.state}/c=${s0.continues}/lvl=${s0.level}`);
  await verifyStageStart(s0, 0);
  await L.ensureInvuln(T);
  R.snap('D1_run2_start', s0);

  const go1 = await L.dieToGameOver(T, { label: '第一次 GameOver' });
  const g1 = go1.state;
  R.chk(g1.state === 'gameover', '玩家耗尽残机 → gameover', `state=${g1.state}`);
  R.chk((await elHidden(T, 'hud')) === true, 'GameOver 页隐藏 HUD', '');
  const sub1 = await domText(T, '#subtitle');
  const hint1 = await domText(T, '#hint');
  R.chk(/残机用尽 · STAGE 1/.test(String(sub1)), 'GameOver 副标题含「残机用尽 · STAGE 1」', sub1);
  R.chk(/续命 0 次/.test(String(sub1)), 'GameOver 副标题续命次数=0', sub1);
  R.chk(/EASY 难度没有真结局/.test(String(hint1)) && /EXTRA/.test(String(hint1)), 'EASY GameOver 提示包含「没有真结局/EXTRA」说明', String(hint1).replace(/\n/g, ' / '));
  const btns1 = (g1.buttons || []).map((b) => b.t);
  R.chk(btns1.some((t) => /重新挑战本关|再战 Boss/.test(t)) && btns1.some((t) => /返回标题/.test(t)), 'GameOver 提供「重新挑战本关/再战 Boss」与「返回标题」', btns1.join(' | '));
  R.snap('D2_gameover1', g1);
  await R.shot('D2_gameover1');

  // 续命再战：continues+1、当前面重开、火力按开局规则给
  const c1 = await L.continueFromGameOver(T);
  R.info('GameOver 键盘 Enter 通道', c1.keyboardWorks ? 'Enter 正常触发续命' : `Enter 无响应（复现 FC-2），改用鼠标等价点击「${c1.clicked && c1.clicked.text}」继续链路`);
  R.chk(c1.continues === 1, '续命后 continues=1', `continues=${c1.continues}`);
  R.chk(c1.level === 0, '续命重开的是当前面（第 1 面）', `level=${c1.level}`);
  R.chk(c1.st.time < 3.0, '续命后面内时间归零', `time=${c1.st.time}`);
  R.chk(c1.st.player.lives === 3 && c1.st.player.hearts === 3, '续命后残机/心数恢复为 3', `lives=${c1.st.player.lives} hearts=${c1.st.player.hearts}`);
  R.chk(c1.st.player.power === 4, '续命后火力按规则给（carryPower=4）', `power=${c1.st.player.power}`);
  R.chk(c1.st.bullets != null && c1.st.bullets < 10 && !c1.st.boss, '续命重开无残留弹幕/Boss', `bullets=${c1.st.bullets} boss=${c1.st.boss && c1.st.boss.key}`);
  R.chk(c1.hud.stage === 'STAGE 1' && c1.hud.lives === 3, '续命后 HUD 正常', `${c1.hud.stage} lives=${c1.hud.lives}`);
  R.snap('D3_after_continue', c1);
  await R.shot('D3_after_continue');
  await L.ensureInvuln(T);

  // 再死一次
  const go2 = await L.dieToGameOver(T, { label: '第二次 GameOver' });
  const g2 = go2.state;
  R.chk(g2.state === 'gameover', '续命后再死 → 再次 gameover', `state=${g2.state}`);
  const sub2 = await domText(T, '#subtitle');
  R.chk(/续命 1 次/.test(String(sub2)), '第二次 GameOver 续命次数累计为 1', sub2);
  R.snap('D4_gameover2', g2);
  await R.shot('D4_gameover2');

  // 返回标题（GameOver 面板键盘通道若失效，用按钮 click 等价继续并记录）
  const back = await L.gameOverToTitle(T);
  R.info('GameOver 键盘 Esc 通道', back.keyboardWorks ? 'Esc 正常返回标题' : `Esc 无响应（复现 FC-2），改用鼠标等价点击「${back.clicked && back.clicked.text}」`);
  R.chk(back.st === null && back.title === '東方新紀行', 'GameOver 页 Esc 返回标题并清空 stage', `state=${back.state} stage=${back.st} title=${back.title}`);
  R.chk(back.unlockedExtra === false, '有续命的流程不解锁 EXTRA', `unlocked=${back.unlockedExtra}`);
  R.snap('D5_title_after_gameover', back);
  await R.shot('D5_title_after_gameover');
});

/* ============================== E. 暂停 → 退出到标题 → 再开无残留 ============================== */
await step('暂停退出与重开无残留', async () => {
  await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  await verifyStageStart(await L.read(T), 0);
  await L.ensureInvuln(T);
  // 打一点弹幕再暂停，检查重开后无残留
  await T.keyDown('KeyZ');
  await sleep(1200);
  await T.keyUp('KeyZ');
  await sleep(200);
  const shooting = await L.read(T);
  R.info('暂停前场上状态', `bullets=${shooting.st.bullets}, time=${shooting.st.time}`);

  await T.key('Escape', 22); await sleep(400);
  const pause = await L.read(T);
  R.chk(pause.state === 'paused', 'Esc → 暂停（state=paused）', pause.state);
  R.chk(pause.title === '暂停', '暂停面板标题=暂停', pause.title);
  const psub = await domText(T, '#subtitle');
  R.chk(/游戏已暂停/.test(String(psub)), '暂停面板副标题含「游戏已暂停」', psub);
  const pb = (pause.buttons || []).map((b) => b.t);
  R.chk(pb.some((t) => /继续/.test(t)) && pb.some((t) => /退出到标题/.test(t)), '暂停菜单含「继续」「退出到标题」', pb.join(' | '));
  // 暂停时 stage 时间应冻结
  const tA = pause.st.time;
  await sleep(900);
  const pause2 = await L.read(T);
  R.chk(Math.abs(pause2.st.time - tA) < 0.35, '暂停时关卡时间冻结', `time ${tA} → ${pause2.st.time}`);
  R.snap('E1_pause', pause);
  await R.shot('E1_pause');

  await T.key('KeyQ', 22);
  const title = await L.drive(T, `s.state === 'menu' && s.st === null`, { timeout: 30000, label: '暂停退出到标题', press: false });
  R.chk(title.title === '東方新紀行' && title.overlayHidden === false, '暂停→退出到标题成功', `${title.state}/${title.title}`);
  R.chk((await elHidden(T, 'hud')) === true, '退出后 HUD 重新隐藏', '');
  R.snap('E2_title_after_pause_quit', title);
  await R.shot('E2_title_after_pause_quit');

  // 再开一局：不应带上一局的 bullets/boss/火力
  const s2 = await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  await verifyStageStart(s2, 0);
  R.chk(s2.st.bullets != null && s2.st.bullets < 10, '退出后新局无上一局残留子弹', `bullets=${s2.st.bullets}`);
  R.chk(!s2.st.boss && !s2.st.bossStarted, '退出后新局无上一局残留 Boss', `boss=${s2.st.boss && s2.st.boss.key}`);
  R.chk(s2.st.player.power === 4 && s2.st.player.lives === 3, '退出后新局火力/残机为开局值', `power=${s2.st.player.power} lives=${s2.st.player.lives}`);
  R.snap('E3_new_run_clean', s2);
  await R.shot('E3_new_run_clean');
  await L.quitToTitle(T);
});

/* ============================== 汇总 ============================== */
const rep = await T.report();
R.chk((rep.errors || []).length === 0, '全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
R.chk((rep.httpBad || []).length === 0, '全程无 HTTP 4xx/5xx', JSON.stringify((rep.httpBad || []).slice(0, 5)));
R.info('网络/资源', `resources=${(rep.resources || []).length}, netFails=${(rep.netFails || []).length}, warns=${(rep.warns || []).length}`);
const out = await R.write({ section: SECTION, accel: R.accel, report: rep, transitionTraces, steps });
L.writeCombined(SECTION, out, R.findings);
await T.close();
console.log(JSON.stringify({
  section: SECTION, pass: out.pass, passCount: out.passCount, failCount: out.failCount,
  findings: R.findings.length, checks: R.checks.filter((c) => !c.ok && !c.info).map((c) => `${c.name} :: ${c.detail}`),
  ms: out.ms,
}, null, 2));
