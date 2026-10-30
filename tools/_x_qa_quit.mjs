import fs from 'node:fs';
import { sleep } from './_pt_core.mjs';
import { bootGame, info, warp } from './_x_qa_lib.mjs';
const PORT = 9459;
const SHOT = 'tools/shots/_qa_player';
fs.mkdirSync(SHOT, { recursive: true });
const out = { steps: [] };
const snap = async (T, tag) => { const s = await info(T); const extra = await T.eval('(() => { const d = document.getElementById("dialogue"); const ov = document.getElementById("overlay"); return { dlgCls: d ? d.className : null, dlgDisplay: d ? getComputedStyle(d).display : null, ovHidden: ov ? ov.className : null, pauseBtn: [...document.querySelectorAll("#buttons .btn")].map((el) => el.className + "|" + el.textContent.trim().slice(0, 20)) }; })()'); const rec = { tag, state: s.state, page: s.page, title: s.titleText, buttons: s.buttons.map((b) => b.t), sel: s.buttons.findIndex((b) => b.sel), extra }; out.steps.push(rec); await T.shot(SHOT + '/q_' + tag + '.png'); console.log(tag, JSON.stringify(rec)); return rec; };
const { T } = await bootGame(PORT, { width: 1280, height: 720 });
let crash = null;
try {
  T.clearCollection();
  // HUD 残机 DOM 结构
  const okW = await warp(T, 2); await sleep(800);
  const hud = await T.eval('(() => { const l = document.getElementById("lives"); return { cls: l ? l.className : null, html: l ? l.innerHTML.slice(0, 500) : null, childs: l ? l.children.length : null, text: l ? l.textContent.trim() : null, hearts: l ? [...l.children].map((c) => c.className) : null }; })()');
  console.log('HUD lives:', JSON.stringify(hud)); out.hud = hud;
  await snap(T, '01_play');
  // A: 普通 play -> 暂停 -> 退出确认 -> 回标题
  await T.key('Escape'); await sleep(500); await snap(T, '02_pause');
  await T.key('KeyQ'); await sleep(600); await snap(T, '03_quitconfirm');
  await T.key('KeyQ'); await sleep(900); await snap(T, '04_afterQuit');
  const s1 = await info(T);
  out.testA = { ok: s1.state === 'menu' && s1.page === 'title', state: s1.state, page: s1.page };
  // B: 重新开局, 冻结后暂停/退出
  await T.key('Enter'); await sleep(400); await T.key('KeyN'); await sleep(300); await T.key('Digit1'); await sleep(400);
  const adv = async () => { for (let i = 0; i < 120; i++) { const x = await T.eval('(() => { const g = window.__game; return { st: g.state, dlg: !!(g.dialogue && g.dialogue.active) }; })()'); if (x.st === 'play') return true; if (x.dlg) { await T.key(i % 2 ? 'Space' : 'Enter'); await sleep(60); } else await sleep(120); } return false; };
  const advOk = await adv(); await sleep(800);
  const stA = await T.eval('window.__game.state');
  await T.send('Page.setWebLifecycleState', { state: 'frozen' }); await sleep(1800);
  await T.send('Page.setWebLifecycleState', { state: 'active' }); await sleep(1200);
  await snap(T, '05_afterFreeze');
  await T.key('Escape'); await sleep(500); await snap(T, '06_pauseAfterFreeze');
  await T.key('KeyQ'); await sleep(600); await snap(T, '07_quitAfterFreeze');
  await T.key('KeyQ'); await sleep(1200); await snap(T, '08_afterFreezeQuit');
  const s2 = await info(T);
  out.testB = { advOk, beforeFreeze: stA, state: s2.state, page: s2.page, stage: !!s2.stage, continues: s2.continues };
  // C: 回标题按钮的鼠标点击路径（若键盘失败时确认 UI 是否存在）
  if (s2.state !== 'menu') {
    const btn = await T.eval('(() => { const bs = [...document.querySelectorAll("#buttons .btn")]; const i = bs.findIndex((b) => /退出|标题/.test(b.textContent)); if (i < 0) return null; const r = bs[i].getBoundingClientRect(); return { i, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: bs[i].textContent.trim() }; })()');
    out.clickTarget = btn;
    if (btn) { await T.mouse(btn.x, btn.y); await sleep(700); await snap(T, '09_afterMouseClick'); }
    const s3 = await info(T); out.testC = { state: s3.state, page: s3.page, stage: !!s3.stage };
  }
  out.report = await T.report();
} catch (e) { crash = String((e && e.stack) || e); } finally {
  try { fs.writeFileSync('tools/reports/_runner/qa_quit.json', JSON.stringify(out, null, 2)); } catch (e) {}
  console.log('CRASH ' + crash);
  try { await T.close(); } catch (e) {}
}