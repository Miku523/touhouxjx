/**
 * flow-menu 补充复现：FM-EXTRA-FEEDBACK（未解锁 EXTRA 无任何反馈）
 * 独立两次实例复现，供 findings.json 使用。端口 9411。
 */
import { launch, sleep, saveJson, makeChecks } from './_pt_core.mjs';
import { bootFresh, reloadWait, pageInfo, clickBtn, settingsSnap, DIR, shot } from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const { chk, rows, sum } = makeChecks();
const log = (...a) => console.log('[repro]', ...a);

try {
  await bootFresh(T);
  const rounds = [];
  for (let r = 1; r <= 2; r++) {
    if (r === 2) await reloadWait(T);
    const before = await pageInfo(T);
    const prog = await settingsSnap(T);
    const extraBefore = before.buttons[1];
    await shot(T, `85-extra-locked-round${r}.png`);
    chk(before.title === '東方新紀行' && before.page === 'title', `R${r}-1 标题页且处于未解锁进度`, {
      title: before.title, page: before.page, progress: prog.progress,
    });
    chk(!!extraBefore && extraBefore.disabled !== true && extraBefore.cls.includes('locked'),
      `R${r}-2 EXTRA 保留 locked 视觉且不再 disabled（修复后可给出反馈）`, extraBefore);

    // 键盘 KeyE：应弹出「尚未解锁」提示，且不进入 EXTRA
    await T.key('KeyE'); await sleep(420);
    const afterE = await pageInfo(T);
    await shot(T, `86-extra-keyE-round${r}.png`);
    const eSnap = {
      title: afterE.title, page: afterE.page, state: afterE.state, hint: afterE.hint,
      overlayHidden: afterE.overlayHidden, menuIndex: afterE.menuIndex,
    };
    chk(afterE.title === '東方新紀行' && afterE.page === 'title' && afterE.state === 'menu',
      `R${r}-3 KeyE 不应进入游戏/EXTRA`, eSnap);
    chk(/尚未解锁/.test(afterE.hint || ''), `R${r}-4 KeyE 未解锁时给出「尚未解锁」提示`, eSnap);
    chk(afterE.menuIndex === 0, `R${r}-5 locked EXTRA 不抢默认选中位（noSelect）`, eSnap);

    // 鼠标点击 locked EXTRA（locked 样式放开点击后）
    const eb = await clickBtn(T, 1);
    await sleep(420);
    const afterClick = await pageInfo(T);
    await shot(T, `87-extra-click-round${r}.png`);
    const clickSnap = {
      hit: eb, title: afterClick.title, page: afterClick.page, state: afterClick.state,
      hint: afterClick.hint, menuIndex: afterClick.menuIndex,
    };
    chk(afterClick.title === '東方新紀行' && afterClick.page === 'title',
      `R${r}-6 点击 locked EXTRA 不应导航`, clickSnap);
    chk(/尚未解锁/.test(afterClick.hint || ''), `R${r}-7 点击 locked EXTRA 应给出「尚未解锁」提示`, clickSnap);

    const rep = await T.report();
    rounds.push({ round: r, progress: prog.progress, extraBefore, afterE: eSnap, afterClick: clickSnap,
      errors: rep.errors, warns: rep.warns, httpBad: rep.httpBad, netFails: rep.netFails });
    log(`round${r}`, JSON.stringify({ afterE: eSnap, afterClick: clickSnap }));
  }

  const sumd = sum();
  for (const x of sumd.rows) if (!x.ok) log('FAIL', x.name, x.detail);
  saveJson(`${DIR}/part_repro.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows, rounds });
  log('RESULT', sumd.pass, 'pass /', sumd.fail, 'fail');
} catch (e) {
  const sumd = sum();
  saveJson(`${DIR}/part_repro.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows, fatal: String(e) });
  console.log('[repro] FATAL', e);
  process.exitCode = 1;
} finally {
  await T.close();
}
