/**
 * flow-menu e) 帮助页/退出页文案逐字校验 + 资源/console 扫描（含 ending 后回标题）
 * 端口 9411（flow-menu 专属）。
 */
import { launch, sleep, saveJson, makeChecks } from './_pt_core.mjs';
import {
  bootFresh, reloadWait, pageInfo, clickText, findBtn, gameSnap,
  layoutCheck, setViewport, DIR, shot, mkPart,
} from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const { chk, rows, sum } = makeChecks();
const log = (...a) => console.log('[helpquit]', ...a);
const shotN = (n) => shot(T, n);
/** 把鼠标移到窗口顶部中立位置：避免 DOM 重建后 pointerenter 把选中项改掉 */
const parkMouse = async () => { await T.mouse(640, 8); await sleep(130); };

try {
  await bootFresh(T);
  let t = await pageInfo(T);
  log('booted:', t.title, JSON.stringify(t.buttons.map((b) => b.text)));

  // ================= A. 操作说明页逐字校验 =================
  await T.key('Slash'); await sleep(360);
  let h = await pageInfo(T);
  await shotN('70-help.png');
  chk(h.title === '操作说明', 'A1 帮助页标题「操作说明」', h.title);
  chk(h.subtitle === '键位可在「设置 → 按键设置」中修改', 'A2 帮助页副标题逐字校验', h.subtitle);
  chk(h.hint === '设置页内：K 按键设置 F 帧率 M 静音 X 重置进度 ESC 返回', 'A3 帮助页 hint 逐字校验（修复后只列真实可用键）', h.hint);
  chk(h.buttons.length === 14, 'A4 帮助页 14 行（13 说明 + 返回）', { n: h.buttons.length });
  const wantHelp = ['左右移动', '上下移动 / 选择', '跳跃', '低速移动 / 判定点', '射击', '向上射击', '向下射击', '冲刺', '符卡', '暂停菜单', '界面', '静音', '退出游戏', '返回'];
  chk(JSON.stringify(h.buttons.map((b) => b.label)) === JSON.stringify(wantHelp), 'A5 帮助页 13 条说明 + 返回 标签逐字正确', h.buttons.map((b) => b.label));
  chk(h.buttons.slice(0, 13).every((b) => b.cls.includes('info')), 'A6 说明行均为不可选 info 行', h.buttons.slice(0, 13).map((b) => b.cls));
  chk(h.buttons[13].key === 'ESC' && h.buttons[13].back === true && h.buttons[13].text.includes('返回'), 'A7 返回行：ESC 键帽 + back 标记 + 「返回」文案', h.buttons[13]);
  chk(h.buttons[13].sel === true, 'A8 进入帮助页默认高亮「返回」行', { sel: h.buttons[13].sel, idx: h.menuIndex });
  const tips = await T.eval(`(() => [...document.querySelectorAll('#buttons .help-row')].map((r) => (r.querySelector('.set-ctl')?.textContent || '').replace(/\\s+/g, ' ').trim()))()`);
  const wantTips = ['← / A→ / D', '↑ / W↓ / S', '空格二段跳', '左Shift / 右Shift按住显示判定点', 'Z / J', '↑ / W按住打空中', '↓ / S按住打脚下', 'K / C无敌', 'X / L耗 6 · 火力等级下降', 'Esc / P', '↑↓ 选择 · ENTER 确认', 'M', 'Q'];
  chk(JSON.stringify(tips) === JSON.stringify(wantTips), 'A9 帮助页键帽/提示文案逐字正确', tips);

  // 说明行不可选：↑↓ 不改变选择；说明行点击无反应
  await T.key('ArrowUp'); await sleep(200);
  let h2 = await pageInfo(T);
  chk(h2.menuIndex === 13, 'A10 帮助页 ↑ 不进入 info 行（选择仍停在返回）', { idx: h2.menuIndex });
  const infoHit = await findBtn(T, '跳跃');
  await T.mouse(infoHit.x, infoHit.y); await sleep(300);
  const hClick = await pageInfo(T);
  chk(infoHit.found && hClick.title === '操作说明' && hClick.menuIndex === 13, 'A11 点击说明行无动作（非按钮）', {
    title: hClick.title, idx: hClick.menuIndex,
  });
  // 页内 S/K/R/F 实测（对应 hint 文案描述）
  const beforeKeys = JSON.stringify([hClick.title, hClick.menuIndex, hClick.state]);
  const keyResults = [];
  for (const k of ['KeyS', 'KeyK', 'KeyR', 'KeyF']) {
    await T.key(k); await sleep(160);
    const now = await pageInfo(T);
    keyResults.push({ k, title: now.title, idx: now.menuIndex });
  }
  await shotN('71-help-keys.png');
  const afterKeys = JSON.stringify([keyResults[3].title, keyResults[3].idx, (await pageInfo(T)).state]);
  chk(afterKeys === beforeKeys, 'A12 帮助页 S/K/R/F 不产生任何动作', { before: beforeKeys, after: afterKeys, keyResults });
  // 该 hint 与本页行为不符，作为候选文案问题（复现 1）
  const helpHintMismatch1 = { hint: h.hint, keyResults };

  // Esc / 返回行两条返回路径
  await T.key('Escape'); await sleep(340);
  let back1 = await pageInfo(T);
  chk(back1.title === '東方新紀行', 'A13 帮助页 Esc 返回标题', back1.title);
  await T.key('Slash'); await sleep(320);
  await clickText(T, '返回'); await sleep(340);
  let back2 = await pageInfo(T);
  chk(back2.title === '東方新紀行', 'A14 点击「返回」回标题', back2.title);
  // 第二次进入帮助页复现 hint 不符
  await T.key('Slash'); await sleep(340);
  const h3 = await pageInfo(T);
  await T.key('KeyK'); await sleep(180);
  const h4 = await pageInfo(T);
  const helpHintMismatch2 = { hint: h3.hint, afterK: { title: h4.title, idx: h4.menuIndex } };
  chk(h4.title === '操作说明' && h4.hint === h3.hint, 'A15 帮助页二次进入 hint 不变且 S/K/R/F 仍无动作（复现 2）', helpHintMismatch2);
  await T.key('Escape'); await sleep(340);

  // 960x540 布局
  await T.key('Slash'); await sleep(300);
  await setViewport(T, 960, 540);
  const layHelp = await layoutCheck(T);
  await shotN('72-help-960.png');
  log('layout help@960:', JSON.stringify(layHelp));
  chk(layHelp.badCount === 0, 'A16 帮助页 960x540 无按钮出视口/被裁切', { bad: layHelp.badCount });
  await setViewport(T, 1280, 720);
  await T.key('Escape'); await sleep(340);

  // ================= B. 退出页逐字校验 =================
  await T.key('KeyQ'); await sleep(360);
  let q = await pageInfo(T);
  await shotN('73-quit.png');
  chk(q.title === '退出游戏', 'B1 退出页标题「退出游戏」', q.title);
  chk(q.subtitle === '要离开幻想乡吗？', 'B2 退出页副标题逐字校验', q.subtitle);
  chk(q.hint === 'ENTER 确认 ESC 返回', 'B3 退出页 hint 逐字校验（空白归一）', q.hint);
  chk(q.buttons.length === 2 && q.buttons[0].text.includes('退出到桌面') && q.buttons[1].text.includes('返回标题'),
    'B4 退出页两个按钮文案正确', q.buttons.map((b) => b.text));
  chk(q.buttons[0].cls.includes('primary') && q.buttons[0].cls.includes('danger'), 'B5 退出到桌面为 primary danger', q.buttons[0].cls);
  chk(q.buttons[1].back === true && q.buttons[1].key === 'ESC', 'B6 返回标题带 ESC 键帽与 back 标记', q.buttons[1]);
  await T.key('Escape'); await sleep(360);
  let qb = await pageInfo(T);
  const qbG = await gameSnap(T);
  chk(qb.title === '東方新紀行' && qbG.loopRunning === true && qbG.muted === false, 'B7 退出页 Esc 返回标题且游戏循环仍运行、未静音', {
    title: qb.title, loop: qbG.loopRunning, muted: qbG.muted,
  });

  // 进入退出页，点击「返回标题」
  await T.key('KeyQ'); await sleep(320);
  await clickText(T, '返回标题'); await sleep(360);
  chk((await pageInfo(T)).title === '東方新紀行', 'B8 退出页点击「返回标题」回标题');

  // 确认退出：先把鼠标移到中立位置，避免 pointerenter 把默认选中项改到「返回标题」
  await parkMouse();
  // 确认退出：Enter（默认选中「退出到桌面」）
  await T.key('KeyQ'); await sleep(340);
  const qPre = await pageInfo(T);
  chk(qPre.title === '退出游戏' && qPre.buttons[0]?.sel === true, 'B9-pre 重新进入退出页默认选中「退出到桌面」', {
    title: qPre.title, idx: qPre.menuIndex, sel: qPre.buttons.map((b) => b.sel),
  });
  await T.key('Enter'); await sleep(700);
  const fare = await pageInfo(T);
  const fareG = await gameSnap(T);
  const docState = await T.eval('({ ready: document.readyState, closed: !!window.closed, title: document.title, ws: document.documentElement.clientWidth, hs: document.documentElement.clientHeight })');
  await shotN('74-farewell.png');
  chk(fare.title === '已退出游戏', 'B9 确认退出后显示「已退出游戏」收尾页（headless 无法关窗）', fare.title);
  chk(fare.subtitle === '感谢游玩 東方新紀行', 'B10 收尾页副标题逐字校验（全角空格已被页面归一）', fare.subtitle);
  chk(fare.hint === '现在可以关闭此页面了', 'B11 收尾页 hint 逐字校验', fare.hint);
  chk(fare.buttons.length === 1 && fare.buttons[0].text.includes('返回标题') && fare.buttons[0].key === 'ENTER',
    'B12 收尾页单按钮「返回标题」+ ENTER', fare.buttons);
  chk(fareG.loopRunning === false && fareG.muted === true && fareG.musicOn === false, 'B13 收尾页停循环 + 静音 + 停乐', {
    loop: fareG.loopRunning, muted: fareG.muted, musicOn: fareG.musicOn,
  });
  chk(docState.ready === 'complete' && docState.closed === false && docState.ws > 0 && docState.hs > 0,
    'B14 headless 下窗口未关但不白屏/不卡死', docState);
  const warns = await T.report();
  const closeWarn = (warns.warns || []).find((w) => /Scripts may close only the windows/i.test(String(w)));
  chk(!!closeWarn, 'B15 window.close 被浏览器拒绝时产生预期警告（非游戏 bug）', closeWarn || warns.warns);
  await T.key('Enter'); await sleep(600);
  const afterFare = await pageInfo(T);
  const afterFareG = await gameSnap(T);
  await shotN('75-after-farewell-title.png');
  chk(afterFare.title === '東方新紀行' && afterFareG.loopRunning === true && afterFareG.muted === false,
    'B16 收尾页 Enter 返回标题并恢复循环/取消静音', {
    title: afterFare.title, loop: afterFareG.loopRunning, muted: afterFareG.muted,
  });
  chk((await T.eval("document.getElementById('overlay').classList.contains('hidden')")) === false,
    'B17 返回标题后 overlay 恢复可见');

  // 退出页 960x540 布局
  await T.key('KeyQ'); await sleep(340);
  await setViewport(T, 960, 540);
  const layQuit = await layoutCheck(T);
  await shotN('76-quit-960.png');
  log('layout quit@960:', JSON.stringify(layQuit));
  chk(layQuit.badCount === 0, 'B18 退出页 960x540 无按钮出视口/被裁切', { bad: layQuit.badCount });
  await setViewport(T, 1280, 720);
  await T.key('Escape'); await sleep(340);

  // ================= C. ending 后回标题 + 资源/console 扫描 =================
  await T.eval(`window.__game._playEnding('good')`);
  await sleep(900);
  let endState = await T.eval('({ state: window.__game.state, endingHidden: document.getElementById("ending")?.classList.contains("hidden"), endingText: (document.getElementById("ending")?.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120) })');
  await shotN('77-ending.png');
  chk(endState.state === 'ending' && endState.endingHidden === false, 'C1 触发 good ending：状态机与结局层显示', endState);
  let reachedTitle = false;
  for (let i = 0; i < 90; i++) {
    const st = await T.eval('window.__game.state');
    if (st === 'menu') { reachedTitle = true; break; }
    await T.key('Enter');
    await sleep(140);
  }
  const endTitle = await pageInfo(T);
  await shotN('78-ending-back-title.png');
  chk(reachedTitle && endTitle.title === '東方新紀行', 'C2 ending 播放完能回到标题', { reached: reachedTitle, title: endTitle.title });
  chk(endTitle.buttons.length >= 5 && endTitle.overlayHidden === false, 'C3 回到标题后入口按钮完整', { n: endTitle.buttons.length, hidden: endTitle.overlayHidden });

  // gameover 页面（修复后键盘可用：Esc 回标题、↑↓ 切按钮、Enter 执行选中项）
  // 说明：强制 _onGameOver() 时没有 stage，Enter 若落在「重新挑战本关」会走 _retryStage；
  // 真实残机耗尽 + Enter 重挑战 / EXTRA 内的路径由 _pt_flow_menu_gameover_real.mjs 覆盖。
  await T.eval('window.__game._onGameOver()');
  await sleep(420);
  const go = await pageInfo(T);
  await shotN('79-gameover.png');
  chk(go.title === '游戏结束' && go.buttons.length === 2, 'C4 强制 gameover 页结构正常', { title: go.title, buttons: go.buttons.map((b) => b.text) });
  chk(String(go.buttons[1]?.text || '').includes('返回标题'), 'C5 gameover 返回标题按钮存在', go.buttons[1]);
  const armKeys = () => T.eval("window.__kt=[]; window.addEventListener('keydown',(e)=>window.__kt.push(e.code+':'+e.defaultPrevented));");
  // C6：Esc 直接返回标题（FM-1 修复后键盘连通）
  await armKeys();
  await T.key('Escape'); await sleep(420);
  const goEsc1 = await pageInfo(T);
  const goEsc1G = await gameSnap(T);
  const goEsc1Keys = await T.eval('window.__kt.slice()');
  await shotN('79b-gameover-esc.png');
  const c6 = { afterTitle: goEsc1.title, afterState: goEsc1.state, machineState: goEsc1G.state,
    menuIndex: goEsc1.menuIndex, keydownSeen: goEsc1Keys };
  log('gameover Esc:', JSON.stringify(c6));
  chk(goEsc1.title === '東方新紀行' && goEsc1G.state === 'menu',
    'C6 gameover 页 Esc 返回标题（FM-1 修复）', JSON.stringify(c6));

  // C7：鼠标对照仍可用，排除「页面卡死」
  await reloadWait(T);
  await T.eval('window.__game._onGameOver()');
  await sleep(420);
  await clickText(T, '返回标题'); await sleep(420);
  const goMouseBack = await pageInfo(T);
  chk(goMouseBack.title === '東方新紀行', 'C7 gameover 页鼠标点击「返回标题」可用', goMouseBack.title);

  // 复现 2：独立实例重新进入 gameover，验证 ↑↓ 切换 + Enter 走当前选中项（FM-1 修复回归）
  await reloadWait(T);
  await T.eval('window.__game._onGameOver()');
  await sleep(420);
  const go2 = await pageInfo(T);
  chk(go2.title === '游戏结束' && go2.menuIndex === 0,
    'C8 二次进入 gameover 结构一致且默认选中「重新挑战本关」', { title: go2.title, menuIndex: go2.menuIndex });
  await armKeys();
  await T.mouse(640, 8); await sleep(140); // 中性鼠标位，避免 pointerenter 改选中
  await T.key('ArrowDown'); await sleep(220);
  const go2Down = await pageInfo(T);
  await T.key('ArrowUp'); await sleep(220);
  const go2Up = await pageInfo(T);
  await T.key('ArrowDown'); await sleep(160);
  await T.key('Enter'); await sleep(450);
  const go2Enter = await pageInfo(T);
  const go2Keys = await T.eval('window.__kt.slice()');
  await shotN('79d-gameover-nav.png');
  const c10 = { afterDown: go2Down.menuIndex, afterUp: go2Up.menuIndex, afterEnter: go2Enter.title,
    state: go2Enter.state, menuIndex: go2Enter.menuIndex, keydownSeen: go2Keys };
  log('gameover nav:', JSON.stringify(c10));
  chk(go2Down.menuIndex === 1, 'C9 gameover 页 ↓ 可切到「返回标题」', c10);
  chk(go2Up.menuIndex === 0, 'C10 gameover 页 ↑ 可切回「重新挑战本关」', c10);
  chk(go2Enter.title === '東方新紀行', 'C11 gameover 页 Enter 执行当前选中项（修复后不再全灭）', c10);

  // 资源扫描：列出所有已加载资源 + 失败项
  const res = await T.eval(`(() => {
    const list = performance.getEntriesByType('resource').map((r) => ({ name: r.name.replace(location.origin, ''), type: r.initiatorType, size: r.transferSize }));
    return { n: list.length, list };
  })()`);
  const report = await T.report();
  const httpBad = report.httpBad || [];
  const netFails = report.netFails || [];
  const errors = report.errors || [];
  const warnsAll = report.warns || [];
  log('resources:', res.n, JSON.stringify(res.list));
  log('httpBad:', JSON.stringify(httpBad));
  log('netFails:', JSON.stringify(netFails));
  log('errors:', JSON.stringify(errors));
  log('warns:', JSON.stringify(warnsAll));
  await shotN('81-resource-scan.png');
  chk(httpBad.length === 0, 'C13 全程无 HTTP >=400（无 404 资源）', httpBad);
  chk(netFails.length === 0, 'C14 全程无网络失败', netFails);
  chk(errors.length === 0, 'C15 全程无 JS 异常/console error', errors);
  const unexpectedWarn = warnsAll.filter((w) => !/Scripts may close only the windows/i.test(String(w)));
  chk(unexpectedWarn.length === 0, 'C16 除 window.close 预期警告外无其它 console warning', unexpectedWarn);
  chk(res.n >= 10 && res.list.every((r) => r.name.startsWith('/')), 'C17 资源清单可读且均为同源静态文件', { n: res.n, sample: res.list.slice(0, 5) });

  const sumd = sum();
  for (const r of sumd.rows) if (!r.ok) log('FAIL', r.name, JSON.stringify(r.detail));
  const out = {
    pass: sumd.pass, fail: sumd.fail, rows: sumd.rows,
    helpHintMismatch: { first: helpHintMismatch1, second: helpHintMismatch2 },
    gameover: { esc1: c6, nav: c10 },
    console: { errors, warns: warnsAll, httpBad, netFails },
    resources: res.list,
  };
  saveJson(`${DIR}/part_helpquit.json`, out);
  log('RESULT', sumd.pass, 'pass /', sumd.fail, 'fail');
} catch (e) {
  const sumd = sum();
  saveJson(`${DIR}/part_helpquit.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows, fatal: String(e), console: {} });
  console.log('[helpquit] FATAL', e);
  process.exitCode = 1;
} finally {
  await T.close();
}
