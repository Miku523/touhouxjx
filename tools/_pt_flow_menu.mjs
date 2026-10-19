/**
 * flow-menu 01：标题 / 难度 / 选人 / 开始游戏 / 暂停 / 帮助 / 退出 / 未解锁 EXTRA / 布局
 * 只读游戏、只发真实键鼠事件；不改 src/**。
 */
import { launch, sleep, saveJson, makeChecks } from './_pt_core.mjs';
import {
  DIR, bootFresh, pageInfo, gameSnap, settingsSnap, clickBtn, clickText,
  layoutCheck, setViewport, advanceToPlay, playToTitle, shot, mkPart,
} from './_pt_flow_menu_util.mjs';

const checks = makeChecks();
const { chk } = checks;
const notes = [];
const candidates = [];
const layoutLog = {};
const consolePhases = {};

function log(...a) { console.log('[menu]', ...a); }

/** 阶段落盘：崩溃时也能看到已完成检查 */
function savePhase(tag) {
  const sum = checks.sum();
  saveJson(`${DIR}/part_menu.json`, {
    script: 'tools/_pt_flow_menu.mjs', tag,
    pass: sum.pass, fail: sum.fail, rows: sum.rows, candidates,
    layout: layoutLog, console: consolePhases,
  });
  log('PHASE', tag, 'pass=', sum.pass, 'fail=', sum.fail);
}

const T = await launch({ port: 9411, width: 1280, height: 720 });
try {
  /* ---------------- 0. 冷启动标题 ---------------- */
  await bootFresh(T);
  let p = await pageInfo(T);
  log('title', p.title, p.state, 'buttons=', p.buttons.length);
  chk(p.state === 'menu' && !p.overlayHidden, '冷启动后 state=menu 且菜单层可见', p);
  chk((p.title || '').includes('東方新紀行'), '标题页标题文本正确', p.title);
  chk(p.buttons.length === 6, '标题页 6 个入口', p.buttons.map((b) => b.label || b.text));
  const labels = p.buttons.map((b) => b.label || b.text).join('|');
  chk(['开始游戏', '禁忌的祭典', '操作说明', '音乐回忆室', '设置', '退出游戏'].every((t) => labels.includes(t)),
    '标题页各入口文案齐全', labels);
  chk(p.buttons[1] && !p.buttons[1].disabled && /locked/.test(p.buttons[1].cls || ''),
    '空存档时 EXTRA 保留 locked 视觉，但可交互出解锁提示（不进入键盘选中）', p.buttons[1]);
  const titleDefaultSnap = await settingsSnap(T);
  chk(titleDefaultSnap.frameCap === 0 && titleDefaultSnap.lives === 3,
    '空存档默认设置 frameCap=0 / lives=3', titleDefaultSnap);
  await shot(T, '01-title.png');
  layoutLog['title-1280'] = await layoutCheck(T);
  chk(layoutLog['title-1280'].badCount === 0, '标题页 1280x720 无裁切/出界元素',
    layoutLog['title-1280'].bad);

  /* ---------------- 1. 标题 hotkey：M / S / Q / Slash / E ---------------- */
  await T.clearCollection();
  await T.key('KeyM'); await sleep(650);
  p = await pageInfo(T);
  let muted = await T.eval('window.__game.audio.muted');
  chk(p.musicVisible && p.musicIn && p.overlayHidden, '标题按 M 进入音乐回忆室（overlay 隐藏）', p);
  chk(muted === false, '标题按 M 不会顺带切静音（KeyM 双语义验证）', muted);
  await shot(T, '02-music-from-title.png');
  await T.key('Escape'); await sleep(600);
  p = await pageInfo(T);
  chk(!p.musicVisible && !p.overlayHidden, '音乐室按 Esc 回到标题页', p);

  consolePhases.hotkeyM = await T.report();
  await T.clearCollection();

  await T.key('KeyS'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title === '设置' && p.page === 'settings' && p.state === 'paused', '标题按 S 进入设置页', p);
  chk(p.buttons.length === 13, '设置页共 13 行（含画质/当前渲染、重置进度与返回）', p.buttons.map((b) => b.label));
  chk(p.hint.includes('ESC 返回'), '设置页 hint 提示 Esc 返回', p.hint);
  layoutLog['settings-1280'] = await layoutCheck(T);
  chk(layoutLog['settings-1280'].badCount === 0, '设置页 1280x720 无裁切/出界元素',
    layoutLog['settings-1280'].bad);
  await shot(T, '03-settings-title.png');

  // 在设置页按 M：只切静音，不返回标题、不重新打开音乐室
  await T.key('KeyM'); await sleep(250);
  let s = await settingsSnap(T);
  chk(s.muted === true && (await T.eval('window.__game._page')) === 'settings', '设置页按 M 只切静音，仍停留在设置页', s);
  await T.key('KeyM'); await sleep(250);
  s = await settingsSnap(T);
  chk(s.muted === false, '设置页再按 M 恢复非静音', s.muted);

  await T.key('Escape'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title.includes('東方新紀行') && !p.overlayHidden, '设置页 Esc 返回标题', p);

  await T.key('KeyQ'); await sleep(300);
  p = await pageInfo(T);
  chk(p.title === '退出游戏' && p.state === 'paused', '标题按 Q 打开退出确认页', p);
  chk(p.buttons.length === 2 && /确认/.test(p.hint), '退出确认页有 2 个按钮并提示 ENTER 确认', p);
  layoutLog['quit-1280'] = await layoutCheck(T);
  chk(layoutLog['quit-1280'].badCount === 0, '退出确认页 1280x720 无裁切/出界元素', layoutLog['quit-1280'].bad);
  await shot(T, '04-quit-page.png');
  await T.key('Escape'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title.includes('東方新紀行') && (await T.eval('window.__game.loop.running')) === true,
    '退出确认页 Esc 返回标题且主循环仍在跑', p);

  await T.key('Slash'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title === '操作说明' && p.buttons.length === 14, '标题按 / 打开操作说明（13 信息行+返回）', p);
  chk(p.buttons[13]?.back === true && p.buttons[13]?.sel === true, '操作说明默认选中「返回」', p.buttons[13]);
  chk(/设置页内/.test(p.hint || ''), '操作说明页 hint 文案存在', p.hint);
  layoutLog['help-1280'] = await layoutCheck(T);
  chk(layoutLog['help-1280'].badCount === 0, '操作说明页 1280x720 无裁切/出界元素', layoutLog['help-1280'].bad);
  await shot(T, '05-help.png');
  await T.key('Escape'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title.includes('東方新紀行'), '操作说明页 Esc 返回标题', p);

  // 未解锁 EXTRA：保留 locked 视觉 + 可交互给出「尚未解锁」提示（FM-3 修复回归）
  await T.mouse(640, 8); await sleep(120);
  const beforeExtra = await pageInfo(T);
  const lockedBtn = beforeExtra.buttons[1] || {};
  chk(lockedBtn.disabled !== true && /locked/.test(lockedBtn.cls || ''),
    '未解锁 EXTRA 保留 locked 视觉且可交互（非 disabled）', lockedBtn);
  chk(beforeExtra.menuIndex === 0, '未解锁 EXTRA 不抢默认选中位（默认仍是开始游戏）', beforeExtra.menuIndex);
  await T.key('KeyE'); await sleep(380);
  const afterKeyE = await pageInfo(T);
  chk(afterKeyE.title === beforeExtra.title && afterKeyE.state === 'menu',
    '未解锁 EXTRA 按 E 不会进入游戏或崩溃', { title: afterKeyE.title, state: afterKeyE.state });
  chk(String(afterKeyE.hint || '').includes('尚未解锁'),
    '未解锁 EXTRA 按 E 给出「尚未解锁」提示', { hint: afterKeyE.hint });
  chk(afterKeyE.menuIndex === 0, '按 E 反馈后默认选中位不变（locked 不进选择列表）', afterKeyE.menuIndex);
  const extraClick = await clickBtn(T, 1);
  await sleep(320);
  const afterClick = await pageInfo(T);
  chk(extraClick.found === true, '未解锁 EXTRA 按钮拿到可点击坐标', extraClick);
  chk(afterClick.title === beforeExtra.title && afterClick.state === 'menu' && String(afterClick.hint || '').includes('尚未解锁'),
    '点击未解锁 EXTRA 不导航且给出提示', { title: afterClick.title, hint: afterClick.hint });
  await shot(T, '06-extra-locked.png');
  savePhase('title+hotkeys');

  /* ---------------- 2. 难度 → 选人 → 开始（键盘路径）+ 逐级 Esc ---------------- */
  await T.clearCollection();
  await T.key('Enter'); await sleep(400);
  p = await pageInfo(T);
  chk(p.title === '选择难度' && p.buttons.length === 5, '标题 Enter 进入难度选择（4 卡+返回）', p);
  chk((p.subtitle || '').includes('E / N / H / L'), '难度页副标题提示 E/N/H/L', p.subtitle);
  layoutLog['difficulty-1280'] = await layoutCheck(T);
  chk(layoutLog['difficulty-1280'].badCount === 0, '难度页 1280x720 无裁切/出界元素', layoutLog['difficulty-1280'].bad);
  await shot(T, '07-difficulty.png');
  await T.key('Escape'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title.includes('東方新紀行'), '难度页 Esc 返回标题', p);

  await T.key('Enter'); await sleep(350);
  await T.key('KeyN'); await sleep(400);
  p = await pageInfo(T);
  chk(p.title === '选择主角' && p.buttons.length === 3, '难度页按 N 进入选人页（2 卡+返回）', p);
  chk((p.subtitle || '').includes('现在行'), '选人页副标题显示当前难度（现在行）', p.subtitle);
  layoutLog['char-1280'] = await layoutCheck(T);
  chk(layoutLog['char-1280'].badCount === 0, '选人页 1280x720 无裁切/出界元素', layoutLog['char-1280'].bad);
  await shot(T, '08-char.png');
  await T.key('Escape'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title === '选择难度', '选人页 Esc 返回难度页', p.title);
  await T.key('Escape'); await sleep(350);
  p = await pageInfo(T);
  chk(p.title.includes('東方新紀行'), '难度页再 Esc 返回标题（逐级返回链完整）', p.title);

  await T.key('Enter'); await sleep(350);
  await T.key('KeyH'); await sleep(450);
  p = await pageInfo(T);
  chk(p.title === '选择主角' && (p.subtitle || '').includes('明日行'), '难度 H 进入选人页并显示明日行', p.subtitle);
  await T.key('Digit2'); await sleep(700);
  let g = await gameSnap(T);
  chk(g.state === 'dialogue' || g.state === 'play', '选人后进入对话或游戏', g.state);
  await shot(T, '09-dialogue.png');
  const inPlay = await advanceToPlay(T);
  g = await gameSnap(T);
  chk(inPlay && g.state === 'play', '对话可推进到 play 状态', g);
  chk(g.char === 'marisa' && g.diff === 'H' && g.level === 0, '键盘路径：角色=魔理沙、难度=H、第 1 面', g);
  chk(g.hudHidden === false && (await T.eval('document.getElementById("overlay").classList.contains("hidden")')), '进入 play 后 HUD 显示、菜单层隐藏', g);
  s = await settingsSnap(T);
  chk(s.settings?.difficulty === 'H', '选择难度后 hks.settings.v1 记录 difficulty=H', s.settings);
  await sleep(500);
  await shot(T, '10-play.png');

  // 暂停菜单：Esc 往返、S 进设置、Q 回标题
  await T.key('Escape'); await sleep(450);
  p = await pageInfo(T);
  chk(p.title === '暂停' && p.state === 'paused' && !p.overlayHidden, '游戏中 Esc 打开暂停菜单', p);
  chk((p.subtitle || '').includes('剩余残机'), '暂停页显示剩余残机', p.subtitle);
  layoutLog['pause-1280'] = await layoutCheck(T);
  chk(layoutLog['pause-1280'].badCount === 0, '暂停菜单 1280x720 无裁切/出界元素', layoutLog['pause-1280'].bad);
  await shot(T, '11-pause.png');
  await T.key('Escape'); await sleep(500);
  g = await gameSnap(T);
  chk(g.state === 'play', '暂停菜单 Esc 恢复游戏', g.state);
  await T.key('Escape'); await sleep(400);
  await T.key('KeyS'); await sleep(400);
  p = await pageInfo(T);
  chk(p.title === '设置' && (p.buttons.at(-1)?.label || '').includes('返回暂停菜单'),
    '暂停菜单按 S 进入设置页（来源=pause，返回暂停菜单）', p.buttons.map((b) => b.label));
  await T.key('Escape'); await sleep(400);
  p = await pageInfo(T);
  chk(p.title === '暂停', 'pause 来源的设置页 Esc 返回暂停菜单', p.title);
  await T.key('KeyQ'); await sleep(420);
  p = await pageInfo(T);
  chk(p.title === '退出到标题', '暂停菜单按 Q 先弹二次确认（KeyQ 双语义）', p);
  await T.key('KeyQ'); await sleep(500);
  p = await pageInfo(T);
  chk(p.title.includes('東方新紀行') && !p.overlayHidden, '确认页再按 Q 才退出到标题', p);

  consolePhases.play = await T.report();
  savePhase('difficulty+play+pause');

  /* ---------------- 3. 鼠标路径：标题→难度→选人→开始 及逐级返回 ---------------- */
  await T.clearCollection();
  await clickBtn(T, 0);
  p = await pageInfo(T);
  chk(p.title === '选择难度', '鼠标点「开始游戏」进入难度页', p.title);
  const backDiff = await clickBtn(T, 4);
  await sleep(300);
  p = await pageInfo(T);
  chk(String(backDiff.text || '').includes('返回') && String(p.title || '').includes('東方新紀行'), '难度页点「返回」回到标题', { backDiff, title: p.title });

  await clickBtn(T, 0); await sleep(200);
  await clickBtn(T, 1); // N
  p = await pageInfo(T);
  chk(p.title === '选择主角' && (p.subtitle || '').includes('现在行'), '鼠标点难度卡 N 进入选人页', p.subtitle);
  const backChar = await clickBtn(T, 2);
  await sleep(300);
  p = await pageInfo(T);
  chk(String(backChar.text || '').includes('返回') && p.title === '选择难度', '选人页点「返回」回到难度页', p.title);

  await clickBtn(T, 2); // H
  await sleep(300);
  p = await pageInfo(T);
  chk((p.subtitle || '').includes('明日行'), '鼠标点难度卡 H 后选人页显示明日行', p.subtitle);
  await clickBtn(T, 1); // marisa
  await sleep(700);
  await advanceToPlay(T);
  g = await gameSnap(T);
  chk(g.state === 'play' && g.char === 'marisa' && g.diff === 'H', '鼠标路径：魔理沙 + H 进入游戏', g);
  await shot(T, '12-play-mouse.png');
  await playToTitle(T);

  await clickBtn(T, 3); // 音乐回忆室
  p = await pageInfo(T);
  chk(p.musicVisible, '鼠标点「音乐回忆室」进入音乐室', p.title);
  await T.key('Escape'); await sleep(600);
  await clickBtn(T, 2); // 操作说明
  p = await pageInfo(T);
  chk(p.title === '操作说明', '鼠标点「操作说明」进入帮助页', p.title);
  await T.key('Escape'); await sleep(400);
  await clickBtn(T, 4); // 设置
  p = await pageInfo(T);
  chk(p.title === '设置', '鼠标点「设置」进入设置页', p.title);
  await T.key('Escape'); await sleep(400);
  p = await pageInfo(T);
  chk(p.title.includes('東方新紀行'), '鼠标路径各页 Esc 均能回到标题', p.title);
  savePhase('mouse-path');

  /* ---------------- 4. 退出：取消 → 确认 → 收尾页 → 返回 ---------------- */
  await T.clearCollection();
  await T.key('KeyQ'); await sleep(300);
  const qBack = await clickBtn(T, 1);
  await sleep(350);
  p = await pageInfo(T);
  chk(String(qBack.text || '').includes('返回标题') && p.title.includes('東方新紀行'), '退出页鼠标点「返回标题」回到标题', p.title);

  await T.key('KeyQ'); await sleep(300);
  await clickBtn(T, 0); // 退出到桌面
  await sleep(900);
  p = await pageInfo(T);
  g = await gameSnap(T);
  const docState = await T.eval('({ready:document.readyState,closed:!!window.closed,alive:!!window.__game})');
  chk(p.title === '已退出游戏' && p.buttons.length === 1, 'headless 下 window.close 未生效时显示「已退出游戏」收尾页', p);
  chk((p.hint || '').includes('关闭此页面'), '收尾页提示可以关闭页面', p.hint);
  chk(docState.ready === 'complete' && docState.alive === true && docState.closed === false,
    '确认退出后页面不白屏/不卡死（document 完整、game 仍存活、window 未关）', docState);
  chk(g.loopRunning === false && g.muted === true && g.musicOn === false,
    '收尾页停主循环并静音', { loopRunning: g.loopRunning, muted: g.muted, musicOn: g.musicOn });
  layoutLog['farewell-1280'] = await layoutCheck(T);
  chk(layoutLog['farewell-1280'].badCount === 0, '收尾页 1280x720 无裁切/出界元素', layoutLog['farewell-1280'].bad);
  await shot(T, '13-farewell.png');
  await T.key('Enter'); await sleep(700);
  p = await pageInfo(T);
  g = await gameSnap(T);
  chk(p.title.includes('東方新紀行') && g.loopRunning === true && g.muted === false,
    '收尾页按 Enter 返回标题并恢复主循环/取消静音', { title: p.title, g });
  await shot(T, '14-farewell-back.png');
  consolePhases.quit = await T.report();

  /* ---------------- 5. 小视口布局（960x540） ---------------- */
  await setViewport(T, 960, 540);
  await T.key('Slash'); await sleep(400);
  layoutLog['help-960'] = await layoutCheck(T);
  chk(layoutLog['help-960'].badCount === 0, '操作说明 960x540 无裁切/出界元素（可滚动内容除外）',
    { bad: layoutLog['help-960'].bad, panel: layoutLog['help-960'].panel, over: layoutLog['help-960'].over });
  await shot(T, '15-help-960.png');
  await T.key('Escape'); await sleep(350);
  await T.key('KeyS'); await sleep(400);
  layoutLog['settings-960'] = await layoutCheck(T);
  chk(layoutLog['settings-960'].badCount === 0, '设置页 960x540 无裁切/出界元素（可滚动内容除外）',
    { bad: layoutLog['settings-960'].bad, panel: layoutLog['settings-960'].panel, over: layoutLog['settings-960'].over });
  await shot(T, '16-settings-960.png');
  await T.key('Escape'); await sleep(350);
  await setViewport(T, 1280, 720);

  /* ---------------- 汇总 ---------------- */
  const sum = mkPart(checks);
  const rep = await T.report();
  const part = {
    script: 'tools/_pt_flow_menu.mjs',
    pass: sum.pass, fail: sum.fail, rows: sum.rows,
    candidates, notes,
    layout: layoutLog,
    console: { phases: consolePhases, final: { errors: rep.errors, warns: rep.warns, httpBad: rep.httpBad, netFails: rep.netFails } },
    evidence: ['_pt/flow_menu/01-title.png', '_pt/flow_menu/02-music-from-title.png', '_pt/flow_menu/03-settings-title.png',
      '_pt/flow_menu/04-quit-page.png', '_pt/flow_menu/05-help.png', '_pt/flow_menu/06-extra-locked.png',
      '_pt/flow_menu/07-difficulty.png', '_pt/flow_menu/08-char.png', '_pt/flow_menu/09-dialogue.png',
      '_pt/flow_menu/10-play.png', '_pt/flow_menu/11-pause.png', '_pt/flow_menu/12-play-mouse.png',
      '_pt/flow_menu/13-farewell.png', '_pt/flow_menu/14-farewell-back.png', '_pt/flow_menu/15-help-960.png',
      '_pt/flow_menu/16-settings-960.png'],
  };
  saveJson(`${DIR}/part_menu.json`, part);
  log('CONSOLE', JSON.stringify(part.console.final));
  log('LAYOUT-BAD', JSON.stringify(Object.fromEntries(Object.entries(layoutLog).map(([k, v]) => [k, v.bad]))));
  log('RESULT pass=', sum.pass, 'fail=', sum.fail);
  for (const r of sum.rows.filter((x) => !x.ok)) log('FAIL', r.name, JSON.stringify(r.detail));
} catch (e) {
  log('FATAL', e && e.stack || e);
  saveJson(`${DIR}/part_menu.json`, { script: 'tools/_pt_flow_menu.mjs', fatal: String(e && e.stack || e), ...mkPart(checks), candidates, notes });
  process.exitCode = 1;
} finally {
  await T.close();
}
