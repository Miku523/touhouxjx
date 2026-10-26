#!/usr/bin/env node
/**
 * EXTRA 终盘战前剧情（extra.preBoss）实测：
 *   真实进入 EXTRA → 真实 Enter 翻完开场 → 用 stage.extraT 快进到 3:00 前 →
 *   由 _updateExtraTimeline 真实判定 bossTrigger → 检查战前对话弹出、句数/首句/说话人 →
 *   真实 Enter 翻完 → 确认对话结束才开战（boss=flandre）→ 再验再战分支不重播。
 *   灵梦线、魔理沙线各跑一遍。
 *
 *   python tools/serve_nocache.py 8138
 *   node tools/_pt_extra_preboss.mjs
 */
import { launch, sleep, makeChecks } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/RE_STORY/artifacts';
mkdirSync(OUT, { recursive: true });
const checks = makeChecks();
const T = await launch();
const G = 'window.__game';

const snap = (expr) => T.eval(`(() => { const s = ${G}; const t = s.stage; return ${expr}; })()`);

/** 按 Enter 翻完当前对话（打字机要先补一句再翻页，所以每句按两次） */
async function throughDialogue(maxPress = 140) {
  for (let i = 0; i < maxPress; i++) {
    const active = await T.eval(`(() => !!(${G}.dialogue && ${G}.dialogue.active))()`).catch(() => false);
    if (!active) return true;
    await T.key('Enter');
    await sleep(60);
  }
  return false;
}

let booted = false;
async function enterExtra(charKey) {
  if (!booted) { await T.boot({ query: '?lang=zh' }); booted = true; }
  await T.eval(`(() => { localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: '${charKey}' })); return 1; })()`);
  await T.reload();
  await sleep(900);
  const boot = await T.waitFor(`!!${G} && ${G}._bootDone === true`, 40000);
  if (!boot) throw new Error('启动幕没退场');
  const titled = await T.waitFor(`${G}.state === 'menu' && !document.getElementById('overlay').classList.contains('hidden')`, 15000);
  if (!titled) throw new Error('标题页没起来');
  await T.key('KeyE'); // 标题页 EXTRA 热键 → EXTRA 选人页
  const cards = await T.waitFor(`document.querySelectorAll('.cc-card').length >= 2`, 15000);
  if (!cards) throw new Error('没进 EXTRA 选人页（EXTRA 未解锁或热键失效）');
  await T.key(charKey === 'reimu' ? 'Digit1' : 'Digit2'); // 选人页热键：1=灵梦 / 2=魔理沙
  const inExtra = await T.waitFor(`${G}.inExtra === true`, 15000);
  if (!inExtra) throw new Error('选人后没进 EXTRA 关卡');
  await T.waitFor(`${G}.dialogue && ${G}.dialogue.active`, 25000);
  await throughDialogue();
  const play = await T.waitFor(`(() => { const s = ${G}; return s.state === 'play' && s.stage && s.stage.state === 'play'; })()`, 60000);
  if (!play) throw new Error('EXTRA 道中没开始');
}

/** 快进到 3:00 前，让时间轴自己触发终盘 bossTrigger */
async function fastForwardFinal() {
  await T.eval(`(() => { const t = ${G}.stage; t.midbossDone = true; t.bossPending = false; t.bossStarted = false; t.extraT = 179.6; return t.extraT; })()`);
  return T.waitFor(`(() => { const s = ${G}; const t = s.stage; return s.state === 'dialogue' && t.extraT >= 180; })()`, 15000, 80);
}

try {
  /* ---------- 灵梦线 ---------- */
  await enterExtra('reimu');
  const firedR = await fastForwardFinal();
  const dlgR = await snap(`{
    state: s.state,
    active: !!s.dialogue.active,
    lines: s.dialogue.script.length,
    full: s.dialogue.fullText,
    speaker: (document.getElementById('speaker') || {}).textContent,
    bossStarted: !!t.bossStarted,
    extraT: Math.round(t.extraT),
  }`);
  checks.chk(firedR, '3:00 时间轴触发终盘 bossTrigger 后进入对话态', JSON.stringify(dlgR));
  checks.chk(dlgR.active === true, '灵梦线：战前对话真的弹出来了', `active=${dlgR.active}`);
  checks.chk(dlgR.lines === 28, '灵梦线：战前对话 28 句', `lines=${dlgR.lines}`);
  checks.chk(/^走廊到了头/.test(dlgR.full || ''), '灵梦线：首句是地下走廊的旁白', (dlgR.full || '').slice(0, 24));
  checks.chk(dlgR.speaker === '' || /旁白/.test(dlgR.speaker), '灵梦线：首句是旁白（无名牌）', `speaker=${JSON.stringify(dlgR.speaker)}`);
  checks.chk(dlgR.bossStarted === false, '对话期间还没开战（bossStarted=false）', `bossStarted=${dlgR.bossStarted}`);
  await T.shot(`${OUT}/10_extra_preboss_reimu.png`);

  // 翻到芙兰开口的那一句，截一张立绘
  for (let i = 0; i < 8; i++) { await T.key('Enter'); await sleep(70); }
  const mid = await snap(`{ full: s.dialogue.fullText, speaker: (document.getElementById('speaker') || {}).textContent }`);
  checks.chk(/芙兰朵露/.test(mid.speaker || ''), '灵梦线：名牌切到芙兰朵露', mid.speaker);
  await T.shot(`${OUT}/11_extra_preboss_reimu_flandre.png`);

  const closed = await throughDialogue();
  await T.waitFor(`(() => { const s = ${G}; return s.state === 'play' && s.stage.bossStarted; })()`, 12000);
  const afterR = await snap(`{ bossStarted: !!t.bossStarted, bossKey: t.boss && t.boss.key }`);
  checks.chk(closed, '灵梦线：对话可以正常翻完', '');
  checks.chk(afterR.bossStarted === true, '灵梦线：对话结束后才开战', JSON.stringify(afterR));
  checks.chk(afterR.bossKey === 'flandre', '灵梦线：开的是芙兰朵露', `bossKey=${afterR.bossKey}`);

  /* ---------- 再战分支：skipBossDialogue 不重播 ---------- */
  await T.eval(`(() => { const s = ${G}; s.dialogue.stop(); const t = s.stage; t.skipBossDialogue = true; t.bossStarted = false; t.bossPending = false; t.boss = null; t.midbossDone = true; t.extraT = 179.6; s.state = 'play'; return 1; })()`);
  const retryPlay = await T.waitFor(`(() => { const s = ${G}; return s.stage.bossStarted === true && s.state === 'play'; })()`, 15000, 80);
  const retryDlg = await T.eval(`(() => !!(${G}.dialogue && ${G}.dialogue.active))()`);
  checks.chk(retryPlay && retryDlg === false, '再战（skipBossDialogue）：直接开战、不重播战前剧情', `play=${retryPlay} dlg=${retryDlg}`);

  /* ---------- 魔理沙线 ---------- */
  await enterExtra('marisa');
  const firedM = await fastForwardFinal();
  const dlgM = await snap(`{
    lines: s.dialogue.script.length,
    full: s.dialogue.fullText,
    playerChar: s.dialogue.playerChar,
    speaker: (document.getElementById('speaker') || {}).textContent,
    bossStarted: !!t.bossStarted,
  }`);
  checks.chk(firedM, '魔理沙线：3:00 同样触发战前对话', '');
  checks.chk(dlgM.lines === 27, '魔理沙线：战前对话 27 句', `lines=${dlgM.lines}`);
  checks.chk(dlgM.playerChar === 'marisa', '魔理沙线：对话按魔理沙解释 player', dlgM.playerChar);
  checks.chk(/门开着/.test(dlgM.full || ''), '魔理沙线：首句视角不同（门开着/屋里亮着）', (dlgM.full || '').slice(0, 24));
  checks.chk(dlgM.bossStarted === false, '魔理沙线：对话期间还没开战', `bossStarted=${dlgM.bossStarted}`);
  await T.shot(`${OUT}/12_extra_preboss_marisa.png`);
  const closedM = await throughDialogue();
  await T.waitFor(`(() => { const s = ${G}; return s.state === 'play' && s.stage.bossStarted; })()`, 12000);
  const afterM = await snap(`{ bossKey: t.boss && t.boss.key }`);
  checks.chk(closedM && afterM.bossKey === 'flandre', '魔理沙线：翻完开打芙兰朵露', JSON.stringify(afterM));
} catch (e) {
  checks.chk(false, '脚本异常', String((e && e.message) || e).slice(0, 300));
  try { await T.shot(`${OUT}/19_extra_preboss_err.png`); } catch {}
} finally {
  const errs = (T.errors || []).filter((x) => !/favicon|net::ERR_ABORTED/.test(x));
  checks.chk(errs.length === 0, '页面无 JS 异常/报错', errs.slice(0, 3).join(' / '));
  const s = checks.sum();
  for (const r of s.rows) console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? `  —— ${r.detail}` : ''}`);
  console.log(`\n通过 ${s.pass} / 失败 ${s.fail}`);
  try { await T.close(); } catch {}
  process.exit(s.fail ? 1 : 0);
}
