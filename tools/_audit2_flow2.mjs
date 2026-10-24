// 审计二轮：音乐房正确流程 / 静音 / 对话收尾 / 续命重开 / 延迟回调作废（只读）。
// 用法: node tools/_audit2_flow2.mjs [port]
import { launch, sleep, makeChecks, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2] || 9725);
const T = await launch({ port: PORT });
const { chk, eq, sum } = makeChecks();
const ev = (x) => T.eval(x);
const st = () => ev(`(() => { const g = window.__game; return {
  state: g.state, page: g._page, cap: g._captureAction,
  dlg: !!g.dialogue.active, hidden: document.getElementById('overlay').classList.contains('hidden'),
  musicOn: g.audio.musicOn, song: g.audio.currentSong, muted: g.audio.muted,
  mr: !!g.musicRoom.visible, preview: g.musicRoom._preview, idx: g.musicRoom.index,
  stage: !!g.stage, level: g.levelIndex, lives: g.runLives, cont: g.continues,
  pending: g._pendingTimeout ? +g._pendingTimeout.t.toFixed(2) : 0,
}; })()`);
const warpTo = async (n) => {
  await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 8 });
  await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Digit' + n, key: String(n), windowsVirtualKeyCode: 48 + n, modifiers: 8 });
  await sleep(40);
  await T.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit' + n, key: String(n), windowsVirtualKeyCode: 48 + n, modifiers: 8 });
  await T.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 0 });
  await sleep(120);
};

try {
  await T.boot();
  const s0 = await st();
  chk(s0.state === 'menu' && s0.musicOn === true, 'F0 标题 BGM 播放中', JSON.stringify(s0));

  /* ---------- A 音乐房：换一首曲播放 / 试听 / 收针 / 退出恢复 ---------- */
  await T.key('KeyM'); await sleep(300);
  let s = await st();
  chk(s.mr === true, 'A1 M 打开音乐回忆室', JSON.stringify({ mr: s.mr, idx: s.idx }));
  const startIdx = s.idx;
  await T.key('ArrowDown'); await sleep(180);
  await T.key('ArrowDown'); await sleep(180);
  const pickKey = await ev('__game.musicRoom.tracks[__game.musicRoom.index].key');
  await T.key('Enter'); await sleep(250);
  if (await ev('!!__game.musicRoom._warn')) { await T.key('Enter'); await sleep(400); }
  s = await st();
  chk(s.song === pickKey && s.musicOn === true, 'A2 选中另一首 Enter 开始播放', JSON.stringify({ pickKey, song: s.song, on: s.musicOn, start: startIdx }));
  await T.key('KeyT'); await sleep(250);
  const p1 = (await st()).preview;
  await sleep(1100);
  const p2 = (await st()).preview;
  chk(!!p1 && !!p2 && p2.left < p1.left, 'A3 试听倒计时递减（宿主 update 驱动，无 setInterval）', JSON.stringify({ p1, p2 }));
  await T.key('KeyT'); await sleep(250);
  s = await st();
  chk(s.preview === null && s.musicOn === false, 'A4 再按 T 收针停止', JSON.stringify({ preview: s.preview, on: s.musicOn }));
  await T.key('Enter'); await sleep(300); // 重新播放
  s = await st();
  chk(s.musicOn === true && s.song === pickKey, 'A5 停止后再 Enter 重新播放', JSON.stringify({ on: s.musicOn, song: s.song }));
  await T.key('KeyT'); await sleep(200); // 试听中直接退出
  await T.key('Escape'); await sleep(500);
  s = await st();
  chk(s.mr === false && s.state === 'menu' && s.musicOn === true && s.song === 'title',
    'A6 试听中退出音乐房：标题 BGM 恢复（不静音）', JSON.stringify({ mr: s.mr, on: s.musicOn, song: s.song }));
  const errs = T.errors.slice();
  chk(errs.length === 0, 'A7 音乐房流程无 JS 异常', errs.join(' | '));

  /* ---------- B 进关 / 暂停 / 静音 / 对话 ---------- */
  await warpTo(1); await sleep(600);
  s = await st();
  chk(s.state === 'play' && s.stage && s.level === 0, 'B1 Shift+1 跳关进第 1 面', JSON.stringify({ state: s.state, level: s.level }));

  await T.key('Escape'); await sleep(300);
  s = await st();
  chk(s.state === 'paused' && !s.hidden, 'B2 Esc 暂停', JSON.stringify({ state: s.state }));
  await T.key('Escape'); await sleep(300);
  s = await st();
  chk(s.state === 'play' && s.hidden, 'B3 暂停菜单 Esc = 继续（不是退出到标题）', JSON.stringify({ state: s.state, hidden: s.hidden }));

  const m0 = (await st()).muted;
  await T.key('KeyM'); await sleep(250);
  s = await st();
  chk(s.muted === !m0, 'B4 play 中 M 切换静音', `${m0} -> ${s.muted}`);
  chk(s.musicOn === true, 'B5 静音不影响 BGM 开关', JSON.stringify({ on: s.musicOn }));
  await T.key('KeyM'); await sleep(200);

  // 对话：用与生产相同的收尾方式（回调里把 state 拉回 play），确认无残留
  await ev(`window.__dlgEnd = 0; __game._playDialogue([{who:'reimu',text:'审计一'},{who:'reimu',text:'审计二'}], () => { window.__dlgEnd++; if (__game.state === 'dialogue') __game.state = 'play'; });`);
  await sleep(400);
  s = await st();
  chk(s.state === 'dialogue' && s.dlg, 'B6 进入 dialogue', JSON.stringify({ state: s.state }));
  await T.key('Escape'); await sleep(200);
  s = await st();
  chk(s.state === 'dialogue' && s.hidden, 'B7 对话中 Esc 不打开暂停菜单', JSON.stringify({ state: s.state, hidden: s.hidden }));
  for (let i = 0; i < 5; i++) { await T.key('Enter'); await sleep(120); }
  await sleep(300);
  s = await st();
  chk(s.state === 'play' && !s.dlg && s.hidden && (await ev('window.__dlgEnd')) === 1, 'B8 对话结束回到 play，回调一次', JSON.stringify({ state: s.state, end: await ev('window.__dlgEnd') }));

  // 延迟回调：暂停期间冻结；showTitle 清空
  const pend = await ev(`(() => { window.__pendHit = 0; __game._after(0.5, () => { window.__pendHit++; }); return __game._pendingTimeout ? __game._pendingTimeout.t : 0; })()`);
  await T.key('Escape'); await sleep(600); // 暂停 0.6s > 0.5s
  const pendPaused = await ev(`({ hit: window.__pendHit, pending: __game._pendingTimeout ? __game._pendingTimeout.t : 0 })`);
  await T.key('Escape'); await sleep(500);
  const pendAfter = await ev(`({ hit: window.__pendHit, pending: __game._pendingTimeout ? __game._pendingTimeout.t : 0 })`);
  chk(pendPaused.hit === 0 && pendPaused.pending > 0, 'B9 暂停期间延迟回调冻结', JSON.stringify({ set: pend, ...pendPaused }));
  chk(pendAfter.hit === 1, 'B10 恢复后延迟回调补触发一次', JSON.stringify(pendAfter));

  await ev(`__game._after(9, () => { window.__lateHit = (window.__lateHit||0)+1; }); __game.showTitle();`);
  await sleep(400);
  const late = await ev(`({ pending: __game._pendingTimeout ? __game._pendingTimeout.t : 0, state: __game.state })`);
  chk(late.pending === 0 && late.state === 'menu', 'B11 showTitle 清掉未到期的延迟回调（不会把标题拽回关卡）', JSON.stringify(late));

  /* ---------- C 续命重开：残机 / 火力 / 破势 / Boss 状态复位 ---------- */
  await warpTo(1); await sleep(600);
  const pre = await ev(`(() => { const g = __game; g.stage.player.power = 77; g.runLives = 2; g.stage.player.poise = 99; g.stage.bossStarted = true;
    return { lives: g.runLives, power: g.stage.player.power, poise: g.stage.player.poise, cont: g.continues, level: g.levelIndex }; })()`);
  await ev(`__game._onGameOver()`); await sleep(300);
  s = await st();
  chk(s.state === 'gameover' && !s.hidden, 'C1 gameover 面板', JSON.stringify({ state: s.state }));
  await T.key('Enter'); await sleep(800);
  const post = await ev(`(() => { const g = __game; const p = g.stage.player; return { state: g.state, lives: g.runLives, power: p.power, poise: p.poise, poiseMax: p.poiseMax,
    cont: g.continues, level: g.levelIndex, boss: g.stage.bossStarted, bossKey: g.stage.boss ? g.stage.boss.key : null, midbossDone: g.stage.midbossDone }; })()`);
  chk(post.state === 'play' && post.cont === pre.cont + 1, 'C2 Enter 续命：continues+1', JSON.stringify({ pre, post }));
  chk(post.lives === 3, 'C3 续命后残机回到开局值', JSON.stringify(post));
  chk(post.power === 16 && post.poise < pre.poise, 'C4 火力/破势回到开局值（不残留上一局）', JSON.stringify({ pre, post }));
  chk(post.level === pre.level && post.boss === true && post.bossKey, 'C5 在 Boss 战续命：直接回 Boss 场地（不从头跑）', JSON.stringify(post));

  /* ---------- D 跳关组合键与音乐房/设置页冲突 ---------- */
  await ev(`__game.showMusicRoom()`); await sleep(300);
  await warpTo(2); await sleep(400);
  let d = await st();
  chk(d.mr === true && d.level === 0, 'D1 音乐房打开时 Shift+2 不跳关', JSON.stringify({ mr: d.mr, level: d.level }));
  await T.key('Escape'); await sleep(400);
  await ev(`__game.showTitle(); __game.showKeybinds(0)`); await sleep(300);
  await warpTo(3); await sleep(400);
  d = await st();
  chk(d.level === 0 && d.page === 'keybinds', 'D2 改键页 Shift+3 不跳关（不抢按键）', JSON.stringify({ level: d.level, page: d.page }));
  await T.key('Escape'); await sleep(300);

  const out = { checks: sum(), report: await T.report() };
  console.log('\n通过', out.checks.pass, '失败', out.checks.fail);
  for (const r of out.checks.rows) if (!r.ok) console.log('FAIL:', r.name, '-', r.detail);
  saveJson('_pt/audit2/flow2.json', out);
} catch (e) {
  console.error('探针崩溃:', (e && e.stack) || e);
  process.exitCode = 1;
} finally {
  await T.close();
}
