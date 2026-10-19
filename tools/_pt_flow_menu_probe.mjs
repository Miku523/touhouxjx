// 菜单连通性探查脚本（flow-menu 专属，端口 9411）
import { launch, sleep, saveJson } from './_pt_core.mjs';

const OUT = '_pt/flow_menu';
const P = (...a) => console.log(...a);
const J = (o) => JSON.stringify(o);

const MENU_DUMP = `(()=>{
  const g = window.__game;
  const $ = (s) => document.querySelector(s);
  const ov = $('#overlay');
  const buttons = [...document.querySelectorAll('#buttons .btn')].map((b,i)=>{
    const r = b.getBoundingClientRect();
    const spec = b._spec || {};
    return {i, label:(b.querySelector('.label')?.textContent||'').trim(), en:(b.querySelector('.en')?.textContent||'').trim(),
      key:(b.querySelector('.k')?.textContent||'').trim(), val:(b.querySelector('.val')?.textContent||'').trim(),
      cls:b.className, disabled:!!b.disabled, specKey:spec.key, hotkey:spec.hotkey, back:!!spec.back,
      adjust:!!spec.adjust, sel:b.classList.contains('sel'),
      rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
  });
  return {
    state:g.state, page:g._page, menuIndex:g.menuIndex, capture:g._captureAction,
    settingsIndex:g._settingsIndex, settingsOrigin:g._settingsOrigin,
    title:($('#title')?.textContent||'').trim(), subtitle:($('#subtitle')?.textContent||'').trim(),
    hint:($('#hint')?.textContent||'').trim(), hintHidden:$('#hint')?.classList.contains('hidden'),
    overlayCls:ov.className, overlayHidden:ov.classList.contains('hidden'),
    titleMode:ov.classList.contains('title-mode'), docScroll:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight},
    viewport:{w:innerWidth,h:innerHeight}, buttons,
    frameCap:g.loop?.frameCap, audio:{muted:g.audio?.muted, musicOn:g.audio?.musicOn,
      currentSong:g.audio?.currentSong, musicVolume:g.audio?.musicVolume, sfxVolume:g.audio?.sfxVolume, sfxOn:g.audio?.sfxOn},
    mr:{visible:!!g.musicRoom?.visible, index:g.musicRoom?.index, warn:g.musicRoom?._warn, preview:g.musicRoom?._preview},
    ls:{settings:localStorage.getItem('hks.settings.v1'), keybinds:localStorage.getItem('hks.keybinds.v1'),
      progress:localStorage.getItem('hks.progress.v1'), music:localStorage.getItem('hks.music.v1')}
  };
})()`;

async function dump(T, tag) {
  await sleep(120);
  const d = await T.eval(MENU_DUMP);
  P('DUMP ' + tag + ' ' + J(d));
  return d;
}

async function clickBtn(T, idx) {
  const pt = await T.eval(`(()=>{const b=document.querySelectorAll('#buttons .btn')[${idx}];if(!b)return null;const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  if (!pt) return false;
  await T.mouse(pt.x, pt.y);
  await sleep(200);
  return true;
}

const T = await launch({ port: 9411, width: 1280, height: 720 });
try {
  await T.boot({ query: '?seed=12345' });
  await T.eval("localStorage.clear()");
  await T.reload();
  await T.waitFor("window.__game && window.__game.state==='menu' && !document.querySelector('#overlay').classList.contains('hidden')", 12000);
  await sleep(500);
  await T.shot(OUT + '/00-probe-title.png');
  const title = await dump(T, 'TITLE-fresh');
  T.clearCollection();

  // 1. 标题 KeyM：音乐室 vs 静音
  await T.key('KeyM');
  await sleep(500);
  const mr = await dump(T, 'AFTER-title-KeyM');
  await T.shot(OUT + '/01-probe-music.png');
  // 音乐室 DOM
  const mrDom = await T.eval(`(()=>{
    const $=(s)=>document.querySelector(s);
    const root=$('#musicRoom');
    const vis=(el)=>!!el && !el.classList.contains('hidden') && el.offsetParent!==null;
    return {exists:!!root, cls:root?.className, visible:vis(root),
      count:(($('.mr-count-num')?.textContent)||'').trim(), all:(($('.mr-count-all')?.textContent)||'').trim(),
      rows:[...document.querySelectorAll('.mr-row')].map((r,i)=>({i,cls:r.className,txt:(r.textContent||'').replace(/\\s+/g,' ').trim(),
        title:(r.querySelector('.mr-row-title')?.textContent||'').trim()})),
      titleTxt:($('.mr-title')?.textContent||'').trim(), sub:($('.mr-subname')?.textContent||'').trim(),
      state:($('.mr-state')?.textContent||'').trim(), vol:($('.mr-vol')?.textContent||'').trim(),
      previewBtn:($('.mr-preview-btn')?.textContent||'').replace(/\\s+/g,' ').trim(),
      warnCls:$('.mr-warn')?.className, warnText:($('.mr-warn-text')?.textContent||'').trim(),
      back:($('.mr-back')?.textContent||'').replace(/\\s+/g,' ').trim(),
      barW:$('.mr-bar-fill')?.style?.width, elapsed:($('.mr-elapsed')?.textContent||'').trim()};
  })()`);
  P('MRDOM ' + J(mrDom));

  // 音乐室 M：静音
  await T.key('KeyM');
  await sleep(300);
  const mrMute = await dump(T, 'MR-KeyM-mute');
  await T.shot(OUT + '/02-probe-mr-mute.png');
  await T.key('KeyM');
  await sleep(200);
  const mrUnmute = await dump(T, 'MR-KeyM-unmute');

  // 播放标题曲（已听过）
  await T.key('Enter');
  await sleep(700);
  const mrPlay = await dump(T, 'MR-play-Enter');
  await T.shot(OUT + '/03-probe-mr-play.png');
  const mrDomPlay = await T.eval(`(()=>{const $=(s)=>document.querySelector(s);return {state:($('.mr-state')?.textContent||'').trim(),vol:($('.mr-vol')?.textContent||'').trim(),bar:$('.mr-bar-fill')?.style?.width,elapsed:($('.mr-elapsed')?.textContent||'').trim(),currentSong:window.__game.audio.currentSong,musicOn:window.__game.audio.musicOn}})()`);
  P('MRPLAY ' + J(mrDomPlay));
  // 再按 Enter 停止
  await T.key('Enter');
  await sleep(400);
  const mrStop = await T.eval(`(()=>{const $=(s)=>document.querySelector(s);return {state:($('.mr-state')?.textContent||'').trim(),currentSong:window.__game.audio.currentSong,musicOn:window.__game.audio.musicOn,bar:$('.mr-bar-fill')?.style?.width}})()`);
  P('MRSTOP ' + J(mrStop));

  // 切到未听过的曲目（index 3 = stage3? 按 tracks 顺序 title,stage1..）用方向键
  await T.eval("window.__game.musicRoom.index = 5");
  await sleep(100);
  await T.key('Enter');
  await sleep(400);
  const warn = await T.eval(`(()=>{const $=(s)=>document.querySelector(s);return {warnCls:$('.mr-warn')?.className,warnText:($('.mr-warn-text')?.textContent||'').trim(),sel:window.__game.musicRoom._warn,play:(document.querySelector('[data-act=play]')?.textContent||'').trim(),cancel:(document.querySelector('[data-act=cancel]')?.textContent||'').trim(),mrIndex:window.__game.musicRoom.index}})()`);
  P('MRWARN ' + J(warn));
  await T.shot(OUT + '/04-probe-mr-warn.png');
  // Esc 取消
  await T.key('Escape');
  await sleep(300);
  const warnCancel = await T.eval(`(()=>{const $=(s)=>document.querySelector(s);return {warnCls:$('.mr-warn')?.className,warn:window.__game.musicRoom._warn,visible:window.__game.musicRoom.visible,heard:localStorage.getItem('hks.music.v1')}})()`);
  P('MRWARN-CANCEL ' + J(warnCancel));

  // 退出音乐室
  await T.key('Escape');
  await sleep(400);
  await dump(T, 'BACK-title-from-MR');

  // 2. 设置页
  await T.key('KeyS');
  await sleep(400);
  const set = await dump(T, 'SETTINGS');
  await T.shot(OUT + '/05-probe-settings.png');

  // 设置页按 M（静音）
  await T.key('KeyM');
  await sleep(250);
  const setM = await dump(T, 'SETTINGS-KeyM');
  await T.shot(OUT + '/06-probe-settings-mute.png');
  await T.key('KeyM');
  await sleep(250);

  // F 帧率
  const cap0 = (await dump(T, 'SETTINGS-beforeF')).frameCap;
  await T.key('KeyF');
  await sleep(250);
  const setF = await dump(T, 'SETTINGS-KeyF');
  P('FRAMECAP ' + J({ before: cap0, after: setF.frameCap, sel: setF.menuIndex }));

  // 音量：选中音乐音量行（index? 从 buttons 找 adjust 第一个），用 End/方向键导航太麻烦，点按钮
  const adjIdx = set.buttons.findIndex((b) => b.adjust);
  P('ADJFIRST ' + J(set.buttons[adjIdx]));
  await clickBtn(T, adjIdx);
  await T.key('ArrowRight');
  await sleep(250);
  const vol = await dump(T, 'SETTINGS-vol-right');
  P('VOL ' + J({ adjIdx, buttons: vol.buttons.map((b) => ({ i: b.i, label: b.label, val: b.val, adjust: b.adjust })), ls: vol.ls.settings, audio: vol.audio }));

  // 残机
  const livesIdx = vol.buttons.findIndex((b) => /残机/.test(b.label));
  await clickBtn(T, livesIdx);
  await T.key('ArrowRight');
  await sleep(250);
  const lives = await dump(T, 'SETTINGS-lives-right');
  P('LIVES ' + J({ idx: livesIdx, val: lives.buttons[livesIdx]?.val, ls: lives.ls.settings }));

  // X 键（重置进度行显示 X）
  await T.key('KeyX');
  await sleep(350);
  const afterX = await dump(T, 'SETTINGS-KeyX');
  P('KEYX ' + J({ title: afterX.title, menuIndex: afterX.menuIndex, page: afterX.page }));

  // 导航到重置进度行：用 End? 先读出 buttons 索引
  const resetIdx = afterX.buttons.findIndex((b) => /重置进度/.test(b.label));
  const resetSpec = afterX.buttons[resetIdx];
  P('RESETROW ' + J({ resetIdx, resetSpec }));
  // 逐个 ArrowDown 到该行
  for (let k = 0; k < 40; k++) {
    const cur = await T.eval('window.__game.menuIndex');
    if (cur === resetIdx) break;
    await T.key('ArrowDown');
    await sleep(60);
  }
  await dump(T, 'SETTINGS-on-reset-row');
  await T.key('Enter');
  await sleep(350);
  const dlg = await dump(T, 'RESET-DIALOG');
  await T.shot(OUT + '/07-probe-reset-dialog.png');
  // Esc 取消
  await T.key('Escape');
  await sleep(350);
  const dlgCancel = await dump(T, 'RESET-DIALOG-cancel');
  P('RESETCANCEL ' + J({ title: dlgCancel.title, page: dlgCancel.page, menuIndex: dlgCancel.menuIndex, progress: dlgCancel.ls.progress }));

  // 返回标题（设置页 Esc）
  await T.key('Escape');
  await sleep(400);
  await dump(T, 'BACK-title-from-settings');

  // 3. 按键设定
  await T.key('KeyS');
  await sleep(300);
  await T.key('KeyK');
  await sleep(400);
  const kb = await dump(T, 'KEYBINDS');
  await T.shot(OUT + '/08-probe-keybinds.png');
  P('KBBUTTONS ' + J(kb.buttons.map((b) => ({ i: b.i, label: b.label, key: b.key, val: b.val, cls: b.cls }))));

  // 捕获取消：点跳跃行
  const jumpIdx = kb.buttons.findIndex((b) => b.label === '跳跃');
  await clickBtn(T, jumpIdx);
  await sleep(200);
  const cap1 = await dump(T, 'KEYBINDS-capturing-jump');
  P('CAPTURE1 ' + J({ jumpIdx, capture: cap1.capture, title: cap1.title, btns: cap1.buttons.filter((b) => b.cls.includes('capturing')).map((b) => ({ i: b.i, label: b.label, val: b.val })) }));
  await T.key('Escape');
  await sleep(300);
  const capEsc = await dump(T, 'KEYBINDS-after-Esc-cancel');
  P('CAPTURE-ESC ' + J({ capture: capEsc.capture, title: capEsc.title, page: capEsc.page, ls: capEsc.ls.keybinds, hint: capEsc.hint }));

  // 捕获绑定 V
  await clickBtn(T, jumpIdx);
  await sleep(200);
  await T.key('KeyV');
  await sleep(300);
  const bound = await dump(T, 'KEYBINDS-after-bindV');
  P('BINDV ' + J({ ls: bound.ls.keybinds, jumpRow: bound.buttons[jumpIdx] }));

  // Esc 返回设置页（非捕获态）
  await T.key('Escape');
  await sleep(400);
  const kbBack = await dump(T, 'SETTINGS-back-from-keybinds');
  P('KBBACK ' + J({ title: kbBack.title, page: kbBack.page, menuIndex: kbBack.menuIndex }));

  // 返回标题
  await T.key('Escape');
  await sleep(400);
  await dump(T, 'TITLE-after-kb');

  // 4. 难度/选人/Esc 链（键盘）
  await T.key('Enter');
  await sleep(400);
  const diff = await dump(T, 'DIFFICULTY');
  await T.shot(OUT + '/09-probe-diff.png');
  await T.key('Escape');
  await sleep(400);
  const diffBack = await dump(T, 'TITLE-from-diff');
  P('DIFFBACK ' + J({ title: diffBack.title, state: diffBack.state, page: diffBack.page }));

  // 再进难度，选 N
  await T.key('Enter');
  await sleep(300);
  const capBefore = (await T.eval('window.__game.audio.currentSong'));
  await T.key('KeyN');
  await sleep(500);
  const chars = await dump(T, 'CHARSELECT');
  await T.shot(OUT + '/10-probe-charselect.png');
  P('CHAR ' + J({ title: chars.title, state: chars.state, audioBefore: capBefore, audio: chars.audio, diff: await T.eval('window.__game.difficulty') }));
  await T.key('Escape');
  await sleep(400);
  const charBack = await dump(T, 'DIFF-from-char');
  P('CHARBACK ' + J({ title: charBack.title, page: charBack.page }));
  await T.key('Escape');
  await sleep(400);
  await dump(T, 'TITLE-from-diff2');

  // 5. 帮助页
  await T.key('Slash');
  await sleep(400);
  const help = await dump(T, 'HELP');
  await T.shot(OUT + '/11-probe-help.png');
  await T.key('KeyK');
  await sleep(200);
  const helpK = await dump(T, 'HELP-after-K');
  await T.key('KeyR');
  await sleep(200);
  await T.key('KeyF');
  await sleep(200);
  const helpKRF = await dump(T, 'HELP-after-KRF');
  P('HELP ' + J({ title: help.title, hint: help.hint, btnCount: help.buttons.length, afterK: { title: helpK.title, sel: helpK.menuIndex }, afterKRF: { title: helpKRF.title, sel: helpKRF.menuIndex, state: helpKRF.state } }));
  await T.key('Escape');
  await sleep(400);
  await dump(T, 'TITLE-from-help');

  // 6. EXTRA locked
  await T.key('KeyE');
  await sleep(400);
  const extraLocked = await dump(T, 'EXTRA-locked-KeyE');
  P('EXTRA-LOCKED ' + J({ title: extraLocked.title, state: extraLocked.state, page: extraLocked.page, buttons: extraLocked.buttons.map((b) => ({ i: b.i, label: b.label, disabled: b.disabled, cls: b.cls })) }));
  // 点击 EXTRA
  const extraIdx = extraLocked.buttons.findIndex((b) => /EXTRA|祭典/.test(b.label + b.en));
  await clickBtn(T, extraIdx);
  await sleep(300);
  const extraClick = await dump(T, 'EXTRA-locked-click');
  P('EXTRA-CLICK ' + J({ idx: extraIdx, title: extraClick.title, state: extraClick.state }));

  // 7. 退出页（最后，可能真的 close）
  await T.key('KeyQ');
  await sleep(400);
  const quit = await dump(T, 'QUIT-PAGE');
  await T.shot(OUT + '/12-probe-quit.png');
  await T.key('Escape');
  await sleep(400);
  const quitBack = await dump(T, 'TITLE-from-quit');
  P('QUITBACK ' + J({ title: quitBack.title, state: quitBack.state, loopRunning: await T.eval('window.__game.loop.running') }));

  await T.key('KeyQ');
  await sleep(300);
  const quit2 = await dump(T, 'QUIT-PAGE-2');
  await clickBtn(T, 0);
  await sleep(800);
  let afterQuit = null;
  try {
    afterQuit = await dump(T, 'AFTER-CONFIRM-QUIT');
  } catch (e) {
    P('AFTER-QUIT-EVAL-ERR ' + e.message);
  }
  await sleep(500);
  let alive = null;
  try {
    alive = await T.eval(`({title:document.title, ready:document.readyState, hasGame:!!window.__game, state:window.__game?.state})`);
  } catch (e) {
    P('AFTER-QUIT-ALIVE-ERR ' + e.message);
  }
  P('AFTER-QUIT ' + J({ afterQuit, alive }));
  try { await T.shot(OUT + '/13-probe-after-quit.png'); } catch (e) { P('SHOT-ERR ' + e.message); }

  P('COLLECT ' + J(T.report ? T.report() : { errors: T.errors, warns: T.warns, httpBad: T.httpBad }));
} finally {
  try { await T.close(); } catch (e) { P('CLOSE-ERR ' + e.message); }
}
