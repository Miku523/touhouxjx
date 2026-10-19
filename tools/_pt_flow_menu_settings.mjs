/**
 * flow-menu c) 设置页持久化 + d) 重置进度双路径
 * 端口 9411（flow-menu 专属）。只读游戏状态、模拟真实键鼠。
 */
import { launch, sleep, saveJson, makeChecks, snapshot } from './_pt_core.mjs';
import {
  bootFresh, reloadWait, pageInfo, settingsSnap, settingsUi, clickText,
  gameSnap, advanceToPlay, DIR, shot, mkPart, layoutCheck,
} from './_pt_flow_menu_util.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const { chk, rows, sum } = makeChecks();
const log = (...a) => console.log('[settings]', ...a);

const enterSettings = async () => { await T.key('KeyS'); await sleep(320); };
const toTitle = async () => { await T.key('Escape'); await sleep(360); };
const uiAt = (ui, i) => ui[i] || {};
const snapShot = async (n) => { await shot(T, n); };

try {
  await bootFresh(T);
  log('booted, title=', (await pageInfo(T)).title);

  // ================= C. 设置持久化 =================
  const initial = await settingsSnap(T);
  const initialSnap = await snapshot(T);
  log('initial:', JSON.stringify(initial));
  chk(initial.frameCap === 0 && initial.lives === 3, 'C0 冷启动默认 frameCap=0 / 残机 3', {
    frameCap: initial.frameCap, lives: initial.lives,
  });

  await enterSettings(T);
  const p = await pageInfo(T);
  const ui0 = await settingsUi(T);
  await snapShot('50-settings-default.png');
  chk(p.title === '设置' && p.page === 'settings' && p.state === 'paused', 'C1 标题 S 进入设置页', {
    title: p.title, page: p.page, state: p.state,
  });
  chk(p.buttons.length === 11, 'C2 设置页 11 个按钮（9 项 + 底部 2 项）', { n: p.buttons.length });
  const wantRows = ['全部静音', '背景音乐', '音乐音量', '音效', '音效音量', '屏幕震动', '帧率上限', '残机', '按键设置', '重置进度', '返回标题'];
  chk(JSON.stringify(p.buttons.map((b) => b.label)) === JSON.stringify(wantRows), 'C3 设置行标签顺序正确', p.buttons.map((b) => b.label));
  chk(ui0[6].seg === '∞' && ui0[7].pips === 3 && ui0[0].sw === false, 'C4 默认 UI：帧率∞ / 3 残机 / 静音关', {
    seg: ui0[6].seg, pips: ui0[7].pips, muteSw: ui0[0].sw,
  });

  // ---- 帧率上限 ----
  await clickText(T, '帧率上限');
  await sleep(250);
  let s = await settingsSnap(T);
  let ui = await settingsUi(T);
  await snapShot('51-frame-cap.png');
  chk(s.frameCap === 60 && s.loopCap === 60 && ui[6].seg === '60', 'C5 点击帧率行 → 60（loop 同步 + UI）', {
    frameCap: s.frameCap, loopCap: s.loopCap, seg: ui[6].seg,
  });
  chk(s.settings?.frameCap === 60, 'C6 帧率 60 立即写盘 hks.settings.v1', s.settings);
  await T.key('KeyF'); await sleep(250);
  s = await settingsSnap(T); ui = await settingsUi(T);
  chk(s.frameCap === 120 && s.loopCap === 120 && ui[6].seg === '120', 'C7 KeyF hotkey → 120', {
    frameCap: s.frameCap, loopCap: s.loopCap, seg: ui[6].seg,
  });
  await T.key('ArrowLeft'); await sleep(250);
  s = await settingsSnap(T); ui = await settingsUi(T);
  chk(s.frameCap === 60 && ui[6].seg === '60', 'C8 ← 调整帧率档位 120→60', { frameCap: s.frameCap, seg: ui[6].seg });

  // ---- 音乐音量 ----
  const mv0 = initial.musicVolume;
  await clickText(T, '音乐音量');
  await sleep(250);
  s = await settingsSnap(T); ui = await settingsUi(T);
  const mv1 = Math.round((mv0 + 0.1) * 10) / 10;
  chk(Math.abs(s.musicVolume - mv1) < 1e-6 && ui[2].sldNum === `${Math.round(mv1 * 100)}%`,
    'C9 点击音乐音量 +10% 且 UI/引擎一致', { before: mv0, after: s.musicVolume, ui: ui[2].sldNum });
  chk(s.settings?.musicVolume === s.musicVolume, 'C10 音乐音量写盘', s.settings);
  await T.key('ArrowLeft'); await sleep(180);
  s = await settingsSnap(T);
  chk(Math.abs(s.musicVolume - mv0) < 1e-6, 'C11 ← 回调音乐音量', { after: s.musicVolume });
  await T.key('ArrowRight'); await sleep(180);
  s = await settingsSnap(T);
  chk(Math.abs(s.musicVolume - mv1) < 1e-6, 'C12 → 再升音乐音量（光标留原行）', { after: s.musicVolume });

  // ---- 音效音量 ----
  const sv0 = initial.sfxVolume;
  const svDown = Math.round((sv0 - 0.1) * 10) / 10;
  await clickText(T, '音效音量'); await sleep(220); // 选中音效音量行（音量已满，点击不改变值）
  await T.key('ArrowLeft'); await sleep(220);
  const svSnap = await settingsSnap(T);
  chk(Math.abs(svSnap.sfxVolume - svDown) < 1e-6, 'C13 ← 音效音量 -10%（上限 100% 时仍可下调）', {
    before: sv0, after: svSnap.sfxVolume,
  });
  await T.key('ArrowRight'); await sleep(220);
  const svBack = await settingsSnap(T);
  chk(Math.abs(svBack.sfxVolume - sv0) < 1e-6, 'C13b → 音效音量回调', { after: svBack.sfxVolume });

  // ---- 残机 ----
  await clickText(T, '残机');
  await sleep(250);
  s = await settingsSnap(T); ui = await settingsUi(T);
  chk(s.lives === 4 && ui[7].pips === 4, 'C14 点击残机 3→4（pips 4）', { lives: s.lives, pips: ui[7].pips });
  chk(s.settings?.lives === 4, 'C15 残机写盘', s.settings);
  await T.key('ArrowLeft'); await sleep(160);
  await T.key('ArrowLeft'); await sleep(200);
  s = await settingsSnap(T); ui = await settingsUi(T);
  chk(s.lives === 2 && ui[7].pips === 2 && s.settings?.lives === 2, 'C16 ←← 残机 4→2（UI+写盘）', {
    lives: s.lives, pips: ui[7].pips, stored: s.settings?.lives,
  });
  await snapShot('52-settings-adjusted.png');

  // ---- 关闭再进 / reload 持久 ----
  await toTitle(T);
  await enterSettings(T);
  let s2 = await settingsSnap(T);
  let ui2 = await settingsUi(T);
  chk(s2.frameCap === 60 && s2.lives === 2 && Math.abs(s2.musicVolume - mv1) < 1e-6,
    'C17 Esc 回标题再进设置：值保持一致', { frameCap: s2.frameCap, lives: s2.lives, musicVolume: s2.musicVolume });
  chk(ui2[6].seg === '60' && ui2[7].pips === 2 && ui2[2].sldNum === `${Math.round(mv1 * 100)}%`,
    'C18 再进设置 UI 一致', { seg: ui2[6].seg, pips: ui2[7].pips, vol: ui2[2].sldNum });

  await reloadWait(T);
  await enterSettings(T);
  s2 = await settingsSnap(T); ui2 = await settingsUi(T);
  await snapShot('53-settings-reloaded.png');
  chk(s2.frameCap === 60 && s2.loopCap === 60, 'C19 reload 后帧率 60 保持（引擎+loop）', { frameCap: s2.frameCap, loopCap: s2.loopCap });
  chk(s2.lives === 2 && Math.abs(s2.musicVolume - mv1) < 1e-6, 'C20 reload 后残机 2 / 音乐音量保持', {
    lives: s2.lives, musicVolume: s2.musicVolume,
  });
  chk(ui2[6].seg === '60' && ui2[7].pips === 2 && ui2[2].sldNum === `${Math.round(mv1 * 100)}%`,
    'C21 reload 后设置 UI 与写盘一致', { seg: ui2[6].seg, pips: ui2[7].pips, vol: ui2[2].sldNum });

  // ---- 设置生效：开局 HUD 残机 / frameCap ----
  await toTitle(T);
  await T.key('Enter'); await sleep(280);   // 难度页
  await T.key('KeyH'); await sleep(280);    // 明日行
  await T.key('Digit2'); await sleep(260);  // 魔理沙
  const started = await gameSnap(T);
  const okPlay = await advanceToPlay(T);
  const play = await gameSnap(T);
  const hudLives = await T.eval(`(() => {
    const l = document.getElementById('lives');
    return {
      life: l.querySelectorAll('.life').length,
      off: l.querySelectorAll('.life.off').length,
      hudHidden: document.getElementById('hud').classList.contains('hidden'),
    };
  })()`);
  await snapShot('54-hud-lives.png');
  chk(okPlay && play.state === 'play', 'C22 开局进入 play', { state: play.state, diff: play.diff, char: play.char });
  chk(started.diff === 'H' || play.diff === 'H', 'C23 难度选择生效（H）', { diff: play.diff });
  chk(play.char === 'marisa', 'C24 选人生效（marisa）', play.char);
  chk(play.lives === 2 && play.stageLives === 2, 'C25 设置残机 2 生效到本局 stage', {
    lives: play.lives, stageLives: play.stageLives,
  });
  chk(hudLives.life === 2 && hudLives.off === 0 && hudLives.hudHidden === false, 'C26 HUD 显示 2 个残机图标', hudLives);
  chk(play.frameCap === 60 && play.loopCap === 60, 'C27 play 中 frameCap 60 实测', { frameCap: play.frameCap, loopCap: play.loopCap });

  // ---- 三处 mute 一致 ----
  await T.key('KeyM'); await sleep(300);
  let sn = await gameSnap(T);
  chk(sn.muted === true, 'C28 play 中 M 静音', { muted: sn.muted });
  const stMuted = await settingsSnap(T);
  chk(stMuted.settings?.muted === true, 'C29 play 静音写盘', { stored: stMuted.settings?.muted });
  await T.key('Escape'); await sleep(300);
  const pauseP = await pageInfo(T);
  chk(pauseP.title === '暂停', 'C30 Esc 打开暂停菜单', { title: pauseP.title });
  await T.key('KeyQ'); await sleep(420);
  await waitTitle(T);
  await enterSettings(T);
  const uiMute = await settingsUi(T);
  sn = await settingsSnap(T);
  chk(uiMute[0].sw === true && sn.muted === true, 'C31 静音后标题→设置页静音行 on', { sw: uiMute[0].sw, muted: sn.muted });
  await snapShot('55-settings-muted.png');

  // 设置页再按 M 取消静音
  await T.key('KeyM'); await sleep(300);
  const uiUnmute = await settingsUi(T);
  sn = await settingsSnap(T);
  chk(uiUnmute[0].sw === false && sn.muted === false && sn.settings?.muted === false,
    'C32 设置页 M 取消静音（UI+写盘）', { sw: uiUnmute[0].sw, muted: sn.muted, stored: sn.settings?.muted });

  // 标题 ↔ 音乐室
  await toTitle(T);
  await T.key('KeyM'); await sleep(460);
  let mp = await pageInfo(T);
  chk(mp.musicVisible === true, 'C33 M 进入音乐室', {
    visible: mp.musicVisible, vol: mp.mr?.vol, state: mp.mr?.state,
  });
  chk(mp.mr?.vol && !mp.mr.vol.includes('静音'), 'C34 未静音时音乐室音量显示', { vol: mp.mr?.vol });
  await T.key('KeyM'); await sleep(320);
  mp = await pageInfo(T);
  const mr = mp.mr || {};
  chk(mr.vol === '静音' && mp.musicVisible, 'C35 音乐室内 M 只切静音不退出', { vol: mr.vol, visible: mp.musicVisible });
  await snapShot('56-music-muted.png');
  await T.key('Escape'); await sleep(360);
  await waitTitle(T);
  await reloadWait(T);
  await enterSettings(T);
  const afterReload = await settingsUi(T);
  sn = await settingsSnap(T);
  chk(afterReload[0].sw === true && sn.muted === true && sn.settings?.muted === true,
    'C36 reload 后静音状态保持（设置行 on）', { sw: afterReload[0].sw, muted: sn.muted });
  chk(sn.frameCap === 60 && sn.lives === 2 && Math.abs(sn.musicVolume - mv1) < 1e-6,
    'C37 reload 后帧率/残机/音量仍为调整后的值', { frameCap: sn.frameCap, lives: sn.lives, musicVolume: sn.musicVolume });
  await T.key('KeyM'); await sleep(250); // 恢复未静音
  await toTitle(T);
  const cEnd = await T.report();

  // ================= D. 重置进度双路径 =================
  await T.eval(`localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'marisa' }));
    localStorage.setItem('hks.music.v1', JSON.stringify({ heard: ['title','stage1','stage2','stage3'] }));`);
  await reloadWait(T);
  let t = await pageInfo(T);
  const extra = t.buttons[1] || {};
  await snapShot('57-extra-unlocked.png');
  chk(extra.disabled === false && String(extra.text || '').includes('禁忌的祭典'), 'D1 伪造进度后 EXTRA 解锁', extra);
  await T.key('KeyM'); await sleep(460);
  let mp2 = await pageInfo(T);
  chk(mp2.mr?.count === '4/11', 'D2 音乐室已回想 4/11', mp2.mr?.count);
  await T.key('Escape'); await sleep(360);
  await waitTitle(T);

  // 取消路径 1：默认高亮取消 + Enter
  await enterSettings(T);
  await clickText(T, '重置进度');
  await sleep(300);
  let rp = await pageInfo(T);
  await snapShot('58-reset-dialog.png');
  chk(rp.title === '重置进度' && rp.buttons.length === 2, 'D3 重置确认框出现（2 按钮）', {
    title: rp.title, buttons: rp.buttons.map((b) => b.text),
  });
  chk(rp.buttons[1]?.sel === true && String(rp.buttons[1]?.text || '').includes('取消'),
    'D4 默认高亮「取消」（误按 Enter 不会删除）', rp.buttons.map((b) => ({ t: b.text, sel: b.sel })));
  await T.key('Enter'); await sleep(380);
  let vp = await pageInfo(T);
  let vs = await settingsSnap(T);
  chk(vp.title === '设置' && vp.page === 'settings', 'D5 取消后回到设置页', { title: vp.title, page: vp.page });
  chk(vs.progress?.extraUnlocked === true && vs.music?.heard?.length === 4, 'D6 取消不删进度/不删音乐记录', {
    progress: vs.progress, heard: vs.music?.heard?.length,
  });

  // 取消路径 2：Esc
  await clickText(T, '重置进度'); await sleep(280);
  await T.key('Escape'); await sleep(360);
  vp = await pageInfo(T);
  vs = await settingsSnap(T);
  chk(vp.title === '设置' && vs.progress?.extraUnlocked === true, 'D7 Esc 取消重置：进度保留', {
    title: vp.title, extraUnlocked: vs.progress?.extraUnlocked,
  });

  // X hotkey 回归（FM-4 修复：重置行此前显示 X 但无 hotkey）
  await T.key('KeyX'); await sleep(320);
  const rpX = await pageInfo(T);
  await snapShot('58b-reset-by-x.png');
  chk(rpX.title === '重置进度' && rpX.buttons.length === 2, 'D7b 设置页按 X 直接打开重置确认框（hotkey 修复）', {
    title: rpX.title, page: rpX.page, buttons: rpX.buttons.map((b) => b.text),
  });
  chk(rpX.buttons[1]?.sel === true, 'D7c 按 X 进入后默认高亮「取消」', rpX.buttons.map((b) => ({ t: b.text, sel: b.sel })));
  chk(String(rpX.hint || '').includes('重置后 EXTRA'), 'D7d 重置框 hint 说明影响范围', rpX.hint);
  await T.key('Enter'); await sleep(360);
  vp = await pageInfo(T);
  vs = await settingsSnap(T);
  chk(vp.title === '设置' && vs.progress?.extraUnlocked === true, 'D7e X→Enter 取消不删档', {
    title: vp.title, extraUnlocked: vs.progress?.extraUnlocked,
  });

  // 确认路径
  await clickText(T, '重置进度'); await sleep(280);
  const clicked = await clickText(T, '确认重置');
  await sleep(500);
  const doneP = await pageInfo(T);
  const doneS = await settingsSnap(T);
  await snapShot('59-reset-done.png');
  chk(clicked.found === true, 'D8 成功点击「确认重置」', clicked);
  chk(doneP.title === '東方新紀行' || doneP.title === '东方新纪行', 'D9 确认后回到标题页', { title: doneP.title });
  chk((doneS.progress) === null, 'D10 hks.progress.v1 已被删除', { progress: doneS.progress });
  const extraLocked = doneP.buttons[1] || {};
  chk(extraLocked.disabled !== true && String(extraLocked.cls || '').includes('locked'),
    'D11 EXTRA 重新锁定（修复后仍带 locked 视觉、可点但给出解锁提示）', extraLocked);
  chk(doneP.hint.includes('已重置进度'), 'D12 标题给出「已重置进度 · EXTRA 重新封闭」提示', { hint: doneP.hint });
  chk(doneS.music?.heard?.length === 4, 'D13 音乐回忆记录保留（4 首）', { heard: doneS.music?.heard?.length });

  // reload 后仍锁定、设置不受影响
  await reloadWait(T);
  t = await pageInfo(T);
  const lockedAfter = t.buttons[1] || {};
  const sAfter = await settingsSnap(T);
  await snapShot('60-reset-locked.png');
  chk(lockedAfter.disabled !== true && String(lockedAfter.cls || '').includes('locked'),
    'D14 reload 后 EXTRA 仍锁定（locked 视觉）', lockedAfter);
  chk(sAfter.progress === null, 'D15 reload 后进度仍为空', { progress: sAfter.progress });
  chk(sAfter.settings?.frameCap === 60 && sAfter.settings?.lives === 2, 'D16 重置不影响设置（帧率/残机保留）', sAfter.settings);
  await T.key('KeyS'); await sleep(320);
  const sUi = await settingsUi(T);
  chk(sUi.length === 9 && sUi[6].seg === '60' && sUi[7].pips === 2, 'D17 重置后设置页 UI 正常', {
    rows: sUi.length, seg: sUi[6].seg, pips: sUi[7].pips,
  });
  await T.key('Escape'); await sleep(340);
  await waitTitle(T);
  await T.key('KeyM'); await sleep(460);
  mp2 = await pageInfo(T);
  chk(mp2.mr?.count === '4/11', 'D18 重置后音乐室仍是 4/11（heard 保留）', mp2.mr?.count);
  await snapShot('61-music-heard-kept.png');
  await T.key('Escape'); await sleep(340);
  await waitTitle(T);

  const lastLayout = await layoutCheck(T);
  log('layout@title:', JSON.stringify(lastLayout));

  const report = await T.report();
  const sumd = sum();
  for (const r of sumd.rows) if (!r.ok) log('FAIL', r.name, JSON.stringify(r.detail));
  const out = {
    pass: sumd.pass, fail: sumd.fail, rows: sumd.rows,
    console: { errors: report.errors, warns: report.warns, httpBad: report.httpBad, netFails: report.netFails },
  };
  saveJson(`${DIR}/part_settings.json`, out);
  log('RESULT', sumd.pass, 'pass /', sumd.fail, 'fail');
  log('CONSOLE', JSON.stringify(out.console));
} catch (e) {
  const sumd = sum();
  saveJson(`${DIR}/part_settings.json`, { pass: sumd.pass, fail: sumd.fail, rows: sumd.rows, fatal: String(e), console: {} });
  console.log('[settings] FATAL', e);
  process.exitCode = 1;
} finally {
  await T.close();
}

/** 等到标题页（state menu + overlay 可见） */
async function waitTitle(T, timeout = 12000) {
  const expr = 'window.__game && window.__game.state === "menu" && !document.getElementById("overlay").classList.contains("hidden")';
  const ok = await T.waitFor(expr, timeout, 100);
  await sleep(220);
  return ok;
}
