/**
 * flow-menu 分区 · 音乐回忆室连通性测试
 * 覆盖：进入/退出、曲目列表与锁定状态（hks.music.v1 空/全解锁）、播放停止切换、
 *       未遇曲目警告弹窗（取消/播放/试听）、试听倒计时与自动收针、KeyM/KeyS/KeyQ 冲突、布局。
 * 端口 9411（专属）。只读 src/**，不改内核。
 */
import { launch, sleep, saveJson } from './_pt_core.mjs';
import {
  DIR, bootFresh, pageInfo, gameSnap, settingsSnap, shot, waitMenu,
  reloadWait, layoutCheck, setViewport, mkPart,
} from './_pt_flow_menu_util.mjs';
import { makeChecks } from './_pt_core.mjs';

const T = await launch({ port: 9411, width: 1280, height: 720 });
const checks = makeChecks();
const candidates = [];
const logs = [];
const evidence = [];
let fatal = null;

function log(...a) {
  const s = a.map(String).join(' ');
  logs.push(s);
  console.log('[music]', s);
}
async function snapShot(name) {
  await shot(T, name);
  evidence.push(`${DIR}/${name}`);
}
function chk(ok, name, detail) {
  checks.chk(ok, name, detail);
  if (!ok) log('FAIL', name, detail ? JSON.stringify(detail).slice(0, 300) : '');
  return ok;
}

/** 音乐室 + 关键音频状态 */
async function musicSnap() {
  return T.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const g = window.__game;
    const mr = g.musicRoom;
    const rows = [...document.querySelectorAll('.mr-row')].map((r, i) => {
      const b = r.getBoundingClientRect();
      return {
        i,
        cls: r.className,
        title: (r.querySelector('.mr-row-title') || {}).textContent || '',
        time: (r.querySelector('.mr-row-time') || {}).textContent || '',
        locked: r.classList.contains('is-locked'),
        sel: r.classList.contains('is-sel'),
        playing: r.classList.contains('is-playing'),
        inView: b.top >= -1 && b.bottom <= innerHeight + 1,
        h: Math.round(b.height),
      };
    });
    return {
      exists: !!document.querySelector('.mr'),
      hidden: q('.mr') ? q('.mr').classList.contains('hidden') : null,
      visible: !!mr.visible,
      index: mr.index,
      tracks: mr.tracks.map((t) => t.key),
      countNum: q('.mr-count-num') ? q('.mr-count-num').textContent : '',
      countAll: q('.mr-count-all') ? q('.mr-count-all').textContent : '',
      stateText: q('.mr-state') ? q('.mr-state').textContent : '',
      vol: q('.mr-vol') ? q('.mr-vol').textContent : '',
      previewTag: (() => { const p = q('.mr-preview-tag'); return p && !p.classList.contains('hidden') ? p.textContent : ''; })(),
      warnHidden: q('.mr-warn') ? q('.mr-warn').classList.contains('hidden') : null,
      warnText: q('.mr-warn-text') ? q('.mr-warn-text').textContent : '',
      warnPlay: q('.mr-warn-btn[data-act=play]') ? q('.mr-warn-btn[data-act=play]').textContent : '',
      warnSel: q('.mr-warn-btn.sel') ? q('.mr-warn-btn.sel').dataset.act : null,
      detailTitle: q('.mr-title') ? q('.mr-title').textContent : '',
      detailSub: q('.mr-subname') ? q('.mr-subname').textContent : '',
      detailNote: q('.mr-note') ? q('.mr-note').textContent : '',
      discNo: q('.mr-disc-no') ? q('.mr-disc-no').textContent : '',
      discName: q('.mr-disc-name') ? q('.mr-disc-name').textContent : '',
      bpm: q('.mr-bpm') ? q('.mr-bpm').textContent : '',
      dur: q('.mr-dur') ? q('.mr-dur').textContent : '',
      cutHidden: q('.mr-cut') ? q('.mr-cut').classList.contains('hidden') : null,
      bar: q('.mr-bar-fill') ? q('.mr-bar-fill').style.width : '',
      previewBtn: q('.mr-preview-btn') ? q('.mr-preview-btn').textContent : '',
      backBtn: q('.mr-back') ? q('.mr-back').textContent : '',
      rows,
      playingRows: rows.filter((r) => r.playing).map((r) => r.i),
      overlayHidden: q('#overlay') ? q('#overlay').classList.contains('hidden') : null,
      pageTitle: q('#title') ? q('#title').textContent : '',
      page: g._page, gameState: g.state,
      audio: { musicOn: !!g.audio.musicOn, song: g.audio.currentSong, muted: !!g.audio.muted },
      loopRunning: !!g.loop.running,
    };
  })()`);
}

async function openMusic() {
  await T.key('KeyM');
  await sleep(450);
  const ok = await T.waitFor('window.__game.musicRoom && window.__game.musicRoom.visible', 5000, 80);
  if (!ok) throw new Error('音乐室未打开');
  await sleep(320);
  return musicSnap();
}
async function closeWarnByEsc() {
  await T.key('Escape');
  await sleep(260);
}
async function down(n = 1) {
  for (let i = 0; i < n; i++) { await T.key('ArrowDown'); await sleep(130); }
}
async function up(n = 1) {
  for (let i = 0; i < n; i++) { await T.key('ArrowUp'); await sleep(130); }
}
async function enter() { await T.key('Enter'); await sleep(320); }

try {
  await T.boot({ query: '?seed=12345', timeout: 45000 });
  await T.eval('localStorage.clear()');
  await T.reload();
  await waitMenu(T, 25000);
  await T.clearCollection();
  log('booted, fresh storage cleared');

  // ---------- A. 空存档：标题曲自动记录 + 进入音乐室 ----------
  const storageAtTitle = await settingsSnap(T);
  log('heard@title =', JSON.stringify(storageAtTitle.music));
  chk(storageAtTitle.music === null || Array.isArray(storageAtTitle.music?.heard),
    'A0 空存档启动后 hks.music.v1 为 null 或 heard 数组', storageAtTitle.music);

  const A = await openMusic();
  const storageAfterOpen = await settingsSnap(T);
  chk(Array.isArray(storageAfterOpen.music?.heard) && storageAfterOpen.music.heard.includes('title'),
    'A1 首次手势进入音乐室后标题曲已记入 hks.music.v1.heard', storageAfterOpen.music);
  await snapShot('20-music-fresh.png');
  log('A open: count=' + A.countNum + '/' + A.countAll + ' state=' + A.stateText + ' vol=' + A.vol + ' idx=' + A.index);
  chk(A.visible && A.hidden === false, 'A2 标题按 M 打开音乐室且可见', { visible: A.visible, hidden: A.hidden });
  chk(A.overlayHidden === true, 'A3 音乐室打开时标题 overlay 隐藏', A.overlayHidden);
  chk(A.gameState === 'menu', 'A4 音乐室期间游戏状态仍为 menu', A.gameState);
  chk(A.countAll === '11', 'A5 曲目总数为 11', A.countAll);
  const heardA = Number(A.countNum);
  chk(Number.isFinite(heardA) && heardA >= 1, 'A6 已回想数 >= 1（至少标题曲）', A.countNum);
  chk(A.rows.filter((r) => r.locked).length === 11 - heardA, 'A7 锁定行数 = 11 - 已回想数', {
    locked: A.rows.filter((r) => r.locked).length, heardA,
  });
  chk(A.rows[0] && !A.rows[0].locked && A.rows[0].title !== '？？？？', 'A8 标题曲行未锁定且标题可见', A.rows[0]);
  const lockedRows = A.rows.filter((r) => r.locked);
  chk(lockedRows.length > 0 && lockedRows.every((r) => r.title === '？？？？' && r.time === '--:--'),
    'A9 锁定行显示 ？？？？ 和 --:--', lockedRows.slice(0, 3));
  chk(A.stateText === '再生中' && A.playingRows.length === 1, 'A10 进入即自动播放标题曲（再生中 + 高亮行）', {
    state: A.stateText, playingRows: A.playingRows,
  });
  chk(/^音量 \d+%$/.test(A.vol), 'A11 状态栏显示音量百分比', A.vol);
  chk(A.previewBtn.includes('试听') && A.backBtn.includes('返回标题'), 'A12 底部按钮文案（试听/返回标题）', {
    previewBtn: A.previewBtn, backBtn: A.backBtn,
  });
  chk(A.warnHidden === true, 'A13 初始无未遇提示弹窗', A.warnHidden);

  // ---------- A2. 音乐室内 S/Q/E 冲突：只移动/吞键，不触发标题快捷键 ----------
  const beforeS = A.index;
  await T.key('KeyS'); await sleep(260);
  const afterS = await musicSnap();
  chk(afterS.visible && afterS.index === (beforeS + 1) % 11, 'A14 音乐室内 S 只下移光标（不跳设置页）', { beforeS, after: afterS.index });
  chk(afterS.pageTitle === A.pageTitle && afterS.overlayHidden === true, 'A15 S 未改变标题层/未进设置页', {
    pageTitle: afterS.pageTitle, overlayHidden: afterS.overlayHidden,
  });
  await T.key('KeyQ'); await sleep(260);
  const afterQ = await musicSnap();
  chk(afterQ.visible && afterQ.page === A.page, 'A16 音乐室内 Q 被吞掉（不弹退出页）', { visible: afterQ.visible, page: afterQ.page });
  await T.key('KeyE'); await sleep(220);
  const afterE = await musicSnap();
  chk(afterE.visible && afterE.index === afterQ.index, 'A17 音乐室内 E 不触发 EXTRA/不导航', { visible: afterE.visible, index: afterE.index });

  // ---------- A3. KeyM 在音乐室内只切静音 ----------
  await T.key('KeyM'); await sleep(320);
  const muted = await musicSnap();
  const mutedStore = await settingsSnap(T);
  chk(muted.visible && muted.audio.muted === true && muted.vol === '静音',
    'A18 音乐室内 M 切换静音（不退出）', { visible: muted.visible, muted: muted.audio.muted, vol: muted.vol });
  chk(mutedStore.settings?.muted === true, 'A19 静音写入 hks.settings.v1.muted', mutedStore.settings);
  await snapShot('25-music-mute.png');
  await T.key('KeyM'); await sleep(320);
  const unmuted = await musicSnap();
  const unmutedStore = await settingsSnap(T);
  chk(unmuted.audio.muted === false && /^音量 \d+%$/.test(unmuted.vol), 'A20 再按 M 取消静音并恢复音量显示', unmuted.vol);
  chk(unmutedStore.settings?.muted === false, 'A21 取消静音同步写入存档', unmutedStore.settings?.muted);

  // ---------- A4. 播放/停止切换（同一首再按 = 抬针） ----------
  await up(1); // 回到索引 0（标题曲）
  await sleep(200);
  const at0 = await musicSnap();
  chk(at0.index === 0, 'A22 ↑ 回到标题曲行', at0.index);
  await enter();
  const stopped = await musicSnap();
  chk(stopped.stateText === '停止中' && stopped.audio.musicOn === false && stopped.playingRows.length === 0,
    'A23 同一首再按 Enter = 停止（停止中/无高亮）', { state: stopped.stateText, on: stopped.audio.musicOn });
  await enter();
  const replay = await musicSnap();
  chk(replay.stateText === '再生中' && replay.audio.musicOn === true && replay.playingRows.length === 1,
    'A24 再按 Enter = 恢复播放', { state: replay.stateText, on: replay.audio.musicOn });

  // ---------- A5. Esc 返回标题 ----------
  await T.key('Escape'); await sleep(480);
  const backTitle = await pageInfo(T);
  const backGame = await gameSnap(T);
  await snapShot('27-music-title-return.png');
  chk(backTitle.title === '東方新紀行' && backTitle.overlayHidden === false, 'A25 Esc 从音乐室返回标题页', {
    title: backTitle.title, overlayHidden: backTitle.overlayHidden,
  });
  chk(backGame.state === 'menu' && backGame.loopRunning === true, 'A26 返回后游戏循环仍在运行', backGame);
  chk(backGame.musicOn === true, 'A27 返回标题后标题曲恢复播放', backGame.musicOn);

  // ---------- B. 未遇曲目警告弹窗 ----------
  const B0 = await openMusic();
  const heardBeforeWarn = Number(B0.countNum);
  await down(1);
  const beforeWarn = await musicSnap();
  chk(beforeWarn.index === 1 && beforeWarn.rows[1].locked === true, 'B1 下移到第 2 首（未遇）行', {
    index: beforeWarn.index, locked: beforeWarn.rows[1].locked,
  });
  await enter();
  const warn = await musicSnap();
  await snapShot('21-music-warn.png');
  chk(warn.warnHidden === false, 'B2 未遇曲目按 Enter 弹出确认框', warn.warnHidden);
  chk(warn.warnText.includes('薄雾') && warn.warnText.includes('要现在听吗'), 'B3 弹窗文案为薄雾/提前试听提示', warn.warnText);
  chk(warn.warnSel === 'play' && warn.warnPlay === '播放', 'B4 弹窗默认选中「播放」', {
    sel: warn.warnSel, play: warn.warnPlay,
  });
  chk(Number((await musicSnap()).countNum) === heardBeforeWarn, 'B5 弹窗阶段未提前记入已回想', heardBeforeWarn);
  await closeWarnByEsc();
  const warnEsc = await musicSnap();
  chk(warnEsc.warnHidden === true && warnEsc.visible === true, 'B6 弹窗内 Esc 只取消弹窗，仍留在音乐室', {
    warnHidden: warnEsc.warnHidden, visible: warnEsc.visible,
  });
  const heardAfterEsc = Number(warnEsc.countNum);
  chk(heardAfterEsc === heardBeforeWarn, 'B7 取消后曲目仍未解锁', heardAfterEsc);

  await enter();
  await T.key('ArrowRight'); await sleep(200);
  const selCancel = await musicSnap();
  chk(selCancel.warnSel === 'cancel', 'B8 ←/→ 可把弹窗选择切到「取消」', selCancel.warnSel);
  await enter();
  const cancelled = await musicSnap();
  chk(cancelled.warnHidden === true && cancelled.audio.song === 'title' && cancelled.audio.musicOn === true,
    'B9 选「取消」后不播放，标题曲继续', { warnHidden: cancelled.warnHidden, song: cancelled.audio.song });
  chk(Number(cancelled.countNum) === heardBeforeWarn, 'B10 取消后已回想数不变', cancelled.countNum);

  await enter();
  const warn2 = await musicSnap();
  chk(warn2.warnHidden === false && warn2.warnSel === 'play', 'B11 再次 Enter 弹窗默认仍选「播放」', warn2.warnSel);
  await enter();
  const played = await musicSnap();
  await snapShot('22-music-playing.png');
  chk(played.warnHidden === true && played.audio.song === beforeWarn.tracks[1] && played.audio.musicOn === true,
    'B12 确认播放后切到第 2 首', { song: played.audio.song, want: beforeWarn.tracks[1] });
  chk(played.stateText === '再生中' && played.playingRows.includes(1), 'B13 播放中状态与行高亮正确', {
    state: played.stateText, playingRows: played.playingRows,
  });
  chk(played.rows[1].locked === false && played.rows[1].title !== '？？？？', 'B14 播放后该曲解锁并显示真实标题', played.rows[1]);
  chk(Number(played.countNum) === heardBeforeWarn + 1, 'B15 已回想数 +1', played.countNum);
  const storeAfterPlay = await settingsSnap(T);
  chk(storeAfterPlay.music?.heard?.includes(beforeWarn.tracks[1]), 'B16 已遇记录写入 hks.music.v1', storeAfterPlay.music);

  await enter();
  const stopped2 = await musicSnap();
  chk(stopped2.stateText === '停止中' && stopped2.audio.musicOn === false, 'B17 同曲再按 Enter 停止', stopped2.stateText);
  await enter();
  const replay2 = await musicSnap();
  chk(replay2.stateText === '再生中' && replay2.audio.musicOn === true, 'B18 再按 Enter 恢复播放', replay2.stateText);

  // ---------- B2. T 试听（已遇曲目 30 秒） ----------
  await T.key('KeyT'); await sleep(700);
  const prev = await musicSnap();
  await snapShot('23-music-preview.png');
  chk(prev.stateText === '试听中' && prev.cutHidden === false, 'B19 T 在已遇曲目上启动 30 秒试听（试听中 + 收针标记）', {
    state: prev.stateText, cutHidden: prev.cutHidden,
  });
  chk(/^\d+s$/.test(prev.previewTag), 'B20 试听倒计时标签显示秒数', prev.previewTag);
  const tagNum = parseInt(prev.previewTag, 10);
  await sleep(2200);
  const prev2 = await musicSnap();
  chk(prev2.stateText === '试听中' && parseInt(prev2.previewTag, 10) < tagNum, 'B21 试听倒计时在递减', {
    from: prev.previewTag, to: prev2.previewTag,
  });
  await T.key('KeyT'); await sleep(320);
  const prevStop = await musicSnap();
  chk(prevStop.stateText === '停止中' && prevStop.previewTag === '' && prevStop.cutHidden === true,
    'B22 试听中再按 T 收针停止', { state: prevStop.stateText, tag: prevStop.previewTag });

  // ---------- B3. 试听 30 秒自动结束 ----------
  await T.key('KeyT'); await sleep(600);
  const prevRestart = await musicSnap();
  chk(prevRestart.stateText === '试听中', 'B23 重新开始试听', prevRestart.stateText);
  // headless 下 rAF 会被节流（每次 tick 最多追 4 个 1/60 步），真实等待 30s 不够；
  // 这里直接以固定步长驱动游戏自己的 update()，等价于推进 30 秒逻辑时间。
  log('以固定步长推进 30 秒逻辑时间（headless rAF 节流补偿）…');
  const ff = await T.eval(`(() => {
    const g = window.__game;
    const start = g.musicRoom._preview ? g.musicRoom._preview.left : null;
    for (let i = 0; i < 1900; i++) g.update(1 / 60);
    return { start, end: g.musicRoom._preview ? g.musicRoom._preview.left : null };
  })()`);
  log('fast-forward preview', JSON.stringify(ff));
  await sleep(250);
  const auto = await musicSnap();
  chk(auto && auto.stateText === '试听结束' && auto.audio.musicOn === false && auto.previewTag === '',
    'B24 试听 30 秒到点自动收针并显示「试听结束」', auto && { state: auto.stateText, on: auto.audio.musicOn, cut: auto.cutHidden });

  // ---------- B4. T 在未遇曲目上走弹窗（按钮文案变「试听 30 秒」） ----------
  const at4 = await down(3); // 从 idx1 移到 idx4
  const sn4 = await musicSnap();
  chk(sn4.index === 4 && sn4.rows[4].locked === true, 'B25 移到第 5 首（未遇）', { index: sn4.index, locked: sn4.rows[4]?.locked });
  await T.key('KeyT'); await sleep(320);
  const warnPreview = await musicSnap();
  chk(warnPreview.warnHidden === false && warnPreview.warnPlay === '试听 30 秒', 'B26 未遇曲目按 T 弹窗按钮变「试听 30 秒」', {
    play: warnPreview.warnPlay, hidden: warnPreview.warnHidden,
  });
  await enter();
  const prev5 = await musicSnap();
  chk(prev5.stateText === '试听中' && prev5.cutHidden === false && prev5.audio.song === sn4.tracks[4],
    'B27 确认试听后进入试听中', { state: prev5.stateText, song: prev5.audio.song });
  chk(prev5.rows[4].locked === false, 'B28 试听后该曲解锁', prev5.rows[4].title);
  await T.key('KeyT'); await sleep(300);
  const prev5stop = await musicSnap();
  chk(prev5stop.stateText === '停止中', 'B29 试听中再按 T 收针', prev5stop.stateText);

  // ---------- C. 全解锁存档（hks.music.v1 有值） ----------
  const allKeys = (await musicSnap()).tracks;
  await T.eval(`localStorage.setItem('hks.music.v1', JSON.stringify({heard:${JSON.stringify(allKeys)}}))`);
  await reloadWait(T);
  const allStorage = await settingsSnap(T);
  chk(allStorage.music?.heard?.length === 11, 'C1 预置全解锁存档后 heard 长度为 11', allStorage.music?.heard?.length);
  const C = await openMusic();
  await snapShot('24-music-all-heard.png');
  chk(C.countNum === '11' && C.countAll === '11', 'C2 全解锁存档下计数 11/11', `${C.countNum}/${C.countAll}`);
  chk(C.rows.every((r) => !r.locked), 'C3 全解锁时无锁定行', C.rows.filter((r) => r.locked).length);
  chk(C.rows.every((r) => r.title !== '？？？？' && r.time !== '--:--'), 'C4 全解锁时所有标题/时长可见');
  await down(1);
  const C2s = await musicSnap();
  chk(C2s.rows[1].locked === false, 'C5 全解锁后下移行仍解锁');
  await enter();
  const Cplay = await musicSnap();
  chk(Cplay.warnHidden === true && Cplay.audio.song === C.tracks[1] && Cplay.audio.musicOn === true,
    'C6 已遇曲目直接播放，无警告弹窗', { warnHidden: Cplay.warnHidden, song: Cplay.audio.song });

  // ---------- D. 音乐室 960x540 布局 ----------
  await setViewport(T, 960, 540);
  await sleep(450);
  const lay = await layoutCheck(T);
  await snapShot('26-music-960.png');
  chk(lay.badCount === 0, 'D1 音乐室 960x540 无出视口/被裁按钮或行', lay.bad.slice(0, 5));
  const mrRowsInView = await T.eval("[...document.querySelectorAll('.mr-row')].filter(r=>{const b=r.getBoundingClientRect();return b.top>=-1&&b.bottom<=innerHeight+1}).length");
  chk(mrRowsInView >= 3, 'D2 960x540 下至少 3 行曲目可见/可滚动', mrRowsInView);
  await setViewport(T, 1280, 720);
  await sleep(350);

  // ---------- E. 持久化收尾 ----------
  await T.key('Escape'); await sleep(420);
  await reloadWait(T);
  const persisted = await settingsSnap(T);
  chk(persisted.music?.heard?.length === 11, 'E1 刷新后 hks.music.v1 仍为全解锁', persisted.music?.heard?.length);
  const E = await openMusic();
  chk(E.countNum === '11', 'E2 刷新后再次进入音乐室计数仍 11/11', E.countNum);
  await T.key('Escape'); await sleep(400);

  const report = await T.report();
  chk(report.errors.length === 0, 'F1 全程无 JS 异常', report.errors.slice(0, 3));
  chk(report.httpBad.length === 0, 'F2 全程无 404/5xx', report.httpBad.slice(0, 3));
  chk(report.netFails.length === 0, 'F3 全程无网络失败', report.netFails.slice(0, 3));

  log('RESULT', JSON.stringify(checks.sum().pass), 'pass /', JSON.stringify(checks.sum().fail), 'fail');
  log('CONSOLE', JSON.stringify({ errors: report.errors, warns: report.warns, httpBad: report.httpBad, netFails: report.netFails }));
} catch (e) {
  fatal = String(e && e.stack || e);
  log('FATAL', fatal);
} finally {
  const part = {
    part: 'music', pass: checks.rows.filter((r) => r.ok).length, fail: checks.rows.filter((r) => !r.ok).length,
    ...mkPart(checks), checks: checks.rows, candidates, logs, evidence, fatal,
  };
  try { saveJson(`${DIR}/part_music.json`, part); } catch (e) { console.log('save part failed', e); }
  await T.close().catch(() => {});
  if (fatal) process.exitCode = 1;
}
