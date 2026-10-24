// 审计二轮：状态机 / 音乐房 / 按键 / 存档 / 音频 实机探针（只读，不改 src）。
// 用法: node tools/_audit2_state.mjs [port]
// 依赖 8138 静态服务器（http://127.0.0.1:8138/index.html）。
import { launch, sleep, makeChecks, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2] || 9722);
const T = await launch({ port: PORT });
const { chk, eq, sum } = makeChecks();
const ev = (x) => T.eval(x);
const st = () => ev(`(() => { const g = window.__game; return {
  state: g.state, page: g._page, cap: g._captureAction,
  dlg: !!g.dialogue.active, overlayHidden: document.getElementById('overlay').classList.contains('hidden'),
  musicOn: g.audio.musicOn, song: g.audio.currentSong, ctx: g.audio.ctx ? g.audio.ctx.state : null,
  muted: g.audio.muted, vol: g.audio.musicVolume, mr: !!g.musicRoom.visible, mrPreview: g.musicRoom._preview,
  voices: g.audio._musicVoices ? g.audio._musicVoices.size : -1, timer: g.audio._musicTimer !== null,
  stageTime: g.stage ? +(g.stage.time || 0).toFixed(2) : null, level: g.levelIndex,
  lives: g.runLives, continues: g.continues, power: g.stage && g.stage.player ? g.stage.player.power : null,
}; })()`);

// CDP 的 real modifier 必须显式给（否则 e.shiftKey=false，隐藏跳关不会触发）
const warpTo = async (n) => {
  const vk = 48 + n;
  await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 8 });
  await T.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Digit' + n, key: String(n), windowsVirtualKeyCode: vk, modifiers: 8 });
  await sleep(40);
  await T.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit' + n, key: String(n), windowsVirtualKeyCode: vk, modifiers: 8 });
  await T.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16, modifiers: 0 });
  await sleep(80);
};

const out = { checks: null, notes: [] };
const note = (s) => { out.notes.push(s); console.log('· ' + s); };

try {
  await T.boot();
  await T.clearCollection();
  let s0 = await st();
  chk(s0.state === 'menu' && !s0.overlayHidden, 'S0 启动进入标题菜单', JSON.stringify(s0));

  /* ---------- S1 音乐房：进入 / 未知曲目确认 / 试听 / 退出恢复标题曲 ---------- */
  await T.key('KeyM');
  await sleep(250);
  let s = await st();
  chk(s.mr === true && s.state === 'menu', 'S1a M 打开音乐回忆室', JSON.stringify(s));
  const mrIndex = await ev('__game.musicRoom.index');
  const mrKey = await ev('__game.musicRoom.tracks[__game.musicRoom.index].key');
  await T.key('Enter');
  await sleep(200);
  let warnOpen = await ev('!!__game.musicRoom._warn');
  const wasHeard = await ev(`__game.musicRoom.isHeard(${JSON.stringify(mrKey)})`);
  note(`音乐房选中 #${mrIndex} ${mrKey}，未听过=${!wasHeard}，确认框=${warnOpen}`);
  if (warnOpen) {
    await T.key('Enter');
    await sleep(350);
  }
  s = await st();
  chk(s.song === mrKey && s.musicOn === true, 'S1b 确认后开始播放该曲', JSON.stringify({ song: s.song, key: mrKey, on: s.musicOn }));
  const musicStore = await ev(`localStorage.getItem('hks.music.v1')`);
  chk(!!musicStore && musicStore.includes(mrKey), 'S1c 听过曲目写入 hks.music.v1', musicStore);

  // 试听：T
  await T.key('KeyT');
  await sleep(300);
  let p1 = (await st()).mrPreview;
  await sleep(1200);
  let p2 = (await st()).mrPreview;
  chk(!!p1 && !!p2 && p2.left < p1.left, 'S1d 试听倒计时在走（无 setInterval，由宿主 update 驱动）', JSON.stringify({ p1, p2 }));
  // 再按 T 收针
  await T.key('KeyT');
  await sleep(250);
  s = await st();
  chk(s.mrPreview === null && s.musicOn === false, 'S1e 再按 T 收针停止播放', JSON.stringify({ preview: s.mrPreview, on: s.musicOn }));

  // 试听 30 秒自然结束（把剩余时间压到 0.2s 加速）
  await ev('__game.musicRoom._startPreview(__game.musicRoom.tracks[__game.musicRoom.index])');
  await ev('__game.musicRoom._preview.left = 0.2');
  await sleep(600);
  s = await st();
  chk(s.mrPreview === null && s.musicOn === false, 'S1f 试听到点自动收针', JSON.stringify({ preview: s.mrPreview, on: s.musicOn }));

  // 退出音乐房 → 标题曲应恢复（main.js showTitle 里 playMusic+setMusic）
  await T.key('Escape');
  await sleep(400);
  s = await st();
  chk(s.mr === false && s.state === 'menu' && s.musicOn === true && s.song === 'title',
    'S1g 试听收针后退出音乐房，标题 BGM 恢复', JSON.stringify({ mr: s.mr, on: s.musicOn, song: s.song }));
  const errs1 = T.errors.slice();
  chk(errs1.length === 0, 'S1h 音乐房流程无 JS 异常', errs1.join(' | '));

  /* ---------- S2 跳关 + 暂停/恢复：输入泄漏 ---------- */
  await warpTo(1);
  await sleep(600);
  s = await st();
  chk(s.state === 'play' && s.level === 0, 'S2a Shift+1 跳关进入第 1 面 play', JSON.stringify({ state: s.state, level: s.level }));
  if (s.state !== 'play') { await ev('__game._warpToStage(1)'); await sleep(500); }

  const t0 = (await st()).stageTime;
  await T.key('Escape');
  await sleep(300);
  let sp = await st();
  chk(sp.state === 'paused' && !sp.overlayHidden, 'S2b Esc 打开暂停菜单', JSON.stringify({ state: sp.state }));
  const t0b = (await st()).stageTime;
  await sleep(700);
  const t0c = (await st()).stageTime;
  chk(t0b === t0c, 'S2c 暂停期间关卡时间冻结', `${t0b} -> ${t0c} (进关时间 ${t0})`);

  await T.key('Escape');
  await sleep(300);
  s = await st();
  chk(s.state === 'play' && s.overlayHidden, 'S2d Esc 恢复 play 且面板关闭', JSON.stringify({ state: s.state, hidden: s.overlayHidden }));
  const tResume1 = s.stageTime;
  await sleep(500);
  const tResume2 = (await st()).stageTime;
  chk(tResume2 > tResume1, 'S2e 恢复后关卡继续推进', `${tResume1} -> ${tResume2}`);

  // 连按两次 Esc（一次进入暂停、一次恢复），不应在同一次恢复里又被暂停
  await T.key('Escape', 25);
  await T.key('Escape', 25);
  await sleep(400);
  s = await st();
  note(`连按两次 Esc 后状态=${s.state}`);
  chk(s.state === 'play' || s.state === 'paused', 'S2f 连按 Esc 状态不越界（play/paused）', s.state);

  /* ---------- S3 对话期间 Esc 不得暂停 / 不得软锁 ---------- */
  await ev(`window.__dlgEnd = 0; __game._playDialogue([{who:'reimu',text:'审计：第一句'},{who:'reimu',text:'审计：第二句'}], () => { window.__dlgEnd++; });`);
  await sleep(400);
  let sd = await st();
  chk(sd.state === 'dialogue' && sd.dlg, 'S3a 进入 dialogue', JSON.stringify({ state: sd.state, dlg: sd.dlg }));
  await T.key('Escape');
  await sleep(250);
  sd = await st();
  chk(sd.state === 'dialogue' && sd.dlg && sd.overlayHidden, 'S3b 对话中 Esc 不会打开暂停菜单', JSON.stringify({ state: sd.state, hidden: sd.overlayHidden }));
  // 连按确认推进到结束
  for (let i = 0; i < 6; i++) { await T.key('Enter'); await sleep(140); }
  await sleep(400);
  sd = await st();
  chk(sd.state === 'play' && !sd.dlg && (await ev('window.__dlgEnd')) === 1, 'S3c 对话正常结束回到 play 且回调只触发一次', JSON.stringify({ state: sd.state, end: await ev('window.__dlgEnd') }));

  /* ---------- S4 静音 M 与音乐开关互不影响 ---------- */
  s = await st();
  const beforeMuted = s.muted;
  await T.key('KeyM');
  await sleep(200);
  s = await st();
  chk(s.muted === !beforeMuted, 'S4a play 中 M 切换静音', `${beforeMuted} -> ${s.muted}`);
  chk(s.musicOn === true, 'S4b 静音不动 BGM 开关状态', JSON.stringify({ on: s.musicOn }));
  await T.key('KeyM');
  await sleep(150);

  /* ---------- S5 快速切曲不叠音 / 停播清空节点 ---------- */
  const fast = await ev(`(() => {
    const a = __game.audio; const keys = ['stage1','stage2','title','stage5'];
    for (const k of keys) a.playMusic(k);
    return { on: a.musicOn, song: a.currentSong, voices: a._musicVoices.size, timer: a._musicTimer !== null };
  })()`);
  await sleep(400);
  const fast2 = await ev(`(() => { const a = __game.audio; return { voices: a._musicVoices.size, song: a.currentSong, on: a.musicOn }; })()`);
  chk(fast2.voices <= 1, 'S5a 快速切曲后活动 BGM 音源 ≤1（无叠音）', JSON.stringify({ fast, fast2 }));
  const stop = await ev(`(() => { const a = __game.audio; a.setMusic(false); return { voices: a._musicVoices.size, on: a.musicOn, timer: a._musicTimer }; })()`);
  chk(stop.voices === 0 && stop.on === false && stop.timer === null, 'S5b setMusic(false) 清空音源与定时器', JSON.stringify(stop));
  // 恢复
  await ev(`__game.audio.playMusic('title'); __game.audio.setMusic(true)`);

  /* ---------- S6 GameOver → 续命重开：状态/残机/火力 ---------- */
  if (!(await ev('!!__game.stage'))) { await ev('__game._warpToStage(1)'); await sleep(500); }
  const pre = await ev(`(() => { const g = __game; g.stage.player.power = 77; g.runLives = 2; return { lives: g.runLives, power: g.stage.player.power, cont: g.continues, level: g.levelIndex }; })()`);
  await ev(`__game._onGameOver()`);
  await sleep(300);
  s = await st();
  chk(s.state === 'gameover' && !s.overlayHidden, 'S6a 残机耗尽进入 gameover 面板', JSON.stringify({ state: s.state }));
  await T.key('Enter');
  await sleep(700);
  s = await st();
  const post = await ev(`(() => { const g = __game; return { lives: g.runLives, power: g.stage.player.power, cont: g.continues, state: g.state, level: g.levelIndex, poise: g.stage.player.poise }; })()`);
  chk(s.state === 'play' && post.cont === pre.cont + 1, 'S6b Enter 续命重开，continues +1', JSON.stringify({ pre, post }));
  chk(post.lives === 3, 'S6c 续命后残机回到开局值（3）', JSON.stringify({ post }));
  chk(post.power === 0, 'S6d 重开后火力清零（不带上一局残留）', JSON.stringify({ post }));

  /* ---------- S7 改键：互换 / 自身副键 / Del 还原 / 捕获取消 ---------- */
  await T.key('Escape');
  await sleep(200);
  await ev(`__game.showKeybinds(0)`);
  await sleep(200);
  s = await st();
  chk(s.page === 'keybinds', 'S7a 打开按键设置页', JSON.stringify({ page: s.page, state: s.state }));
  await ev(`__game._captureAction = 'jump'`);
  await T.key('KeyR');
  await sleep(250);
  const swap = await ev(`(() => ({ jump: __game.input.keyOf('jump'), restart: __game.input.keyOf('restart'), cap: __game._captureAction, store: localStorage.getItem('hks.keybinds.v1') }))()`);
  chk(swap.jump === 'KeyR' && swap.restart === 'Space' && swap.cap === null,
    'S7b 改键冲突时与占用者互换，不丢键', JSON.stringify(swap));

  // 把某动作改到自己的副键上（left.alt = KeyA）
  await ev(`__game._captureAction = 'left'`);
  await T.key('KeyA');
  await sleep(250);
  const self = await ev(`(() => ({ primary: __game.input.keyOf('left'), label: __game.input.labelFor('left'), actionOfA: __game.input.actionOf('KeyA') }))()`);
  chk(self.actionOfA === 'left', 'S7c 改到自身副键仍是 left（不与其他动作冲突）', JSON.stringify(self));

  // Del 还原整对象
  await T.key('Delete');
  await sleep(250);
  const reset = await ev(`(() => ({ left: __game.input.keyOf('left'), jump: __game.input.keyOf('jump'), restart: __game.input.keyOf('restart'), store: localStorage.getItem('hks.keybinds.v1') }))()`);
  chk(reset.left === 'ArrowLeft' && reset.jump === 'Space' && reset.restart === 'KeyR' && reset.store === null,
    'S7d Del 恢复全部默认键并清掉存储', JSON.stringify(reset));

  // 捕获态下 Esc 取消，不残留
  await ev(`__game._captureAction = 'jump'`);
  await T.key('Escape');
  await sleep(250);
  const cancel = await ev(`({ cap: __game._captureAction, page: __game._page, jump: __game.input.keyOf('jump') })`);
  chk(cancel.cap === null && cancel.page === 'keybinds' && cancel.jump === 'Space', 'S7e Esc 取消改键且不误绑', JSON.stringify(cancel));

  // 捕获态下切回标题：capture 必须被清（否则后续按键全被吃）
  await ev(`__game._captureAction = 'jump'`);
  await ev(`__game.showTitle()`);
  await sleep(250);
  const leak = await ev(`({ cap: __game._captureAction, state: __game.state })`);
  chk(leak.cap === null, 'S7f showTitle 后 capture 态不残留', JSON.stringify(leak));

  /* ---------- S8 存档：非法 JSON / getItem 抛异常 / setItem 抛异常 ---------- */
  const inj = await T.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const bad = window.localStorage.getItem.bind(window.localStorage);
      const mode = () => window.__auditStorageMode || 'none';
      window.__auditStorageMode = 'invalid';
      Storage.prototype.getItem = function (k) {
        if (mode() === 'throw' && /^hks\\./.test(k)) throw new DOMException('denied', 'SecurityError');
        return bad(k);
      };
      Storage.prototype.setItem = function (k, v) {
        if (mode() === 'quota' && /^hks\\./.test(k)) throw new DOMException('quota', 'QuotaExceededError');
        return bad.call(window.localStorage, k, v);
      };
      try { window.localStorage.setItem('hks.progress.v1', '{broken json'); } catch (e) {}
    })()`,
  });
  await T.reload();
  await sleep(1200);
  await T.waitFor('!!window.__game', 15000);
  let boot = await ev(`({ game: !!window.__game, state: window.__game && window.__game.state, unlocked: window.__game && window.__game.unlockedExtra, err: window.__lastErr || null })`);
  chk(boot.game === true && boot.state === 'menu' && boot.unlocked === false, 'S8a 非法 JSON 存档不崩溃且不误解锁', JSON.stringify(boot));
  chk(T.errors.length === 0, 'S8a2 非法 JSON 无未捕获异常', T.errors.join(' | '));

  // getItem 抛异常（SecurityError：localStorage 被禁用）
  await ev(`window.__auditStorageMode = 'throw'`);
  await T.reload();
  await sleep(1200);
  await T.waitFor('!!window.__game', 15000);
  boot = await ev(`({ game: !!window.__game, state: window.__game && window.__game.state })`);
  chk(boot.game === true && boot.state === 'menu', 'S8b localStorage 读抛异常仍能启动', JSON.stringify(boot));

  // setItem 抛配额异常：触发写设置
  await ev(`window.__auditStorageMode = 'quota'`);
  await sleep(200);
  const quota = await ev(`(() => { try { __game._toggleMute(); __game._toggleMute(); __game._saveSettings && __game._saveSettings(); return 'ok'; } catch (e) { return 'throw:' + e.message; } })()`);
  chk(quota === 'ok', 'S8c 写存档抛配额异常被吞掉（不影响游戏）', quota);
  chk(T.errors.length === 0, 'S8c2 无未捕获异常', T.errors.slice(-3).join(' | '));
  await T.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inj.identifier });
  await ev(`window.__auditStorageMode = 'none'`);

  /* ---------- S9 旧存档迁移：只有 extraUnlocked / 只有 extraChar ---------- */
  await ev(`localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true }))`);
  await T.reload();
  await sleep(1200);
  await T.waitFor('!!window.__game', 15000);
  let mig = await ev(`({ unlocked: __game.unlockedExtra, chars: __game.extraChars, extraChar: __game.extraChar, stored: JSON.parse(localStorage.getItem('hks.progress.v1') || 'null') })`);
  chk(mig.unlocked === true && mig.chars.reimu && mig.chars.marisa, 'S9a 最老存档（只有 extraUnlocked）迁移为两位都解锁', JSON.stringify(mig));
  chk(Array.isArray(mig.stored && mig.stored.extraChars) && mig.stored.extraChars.length === 2, 'S9b 迁移后回写新格式', JSON.stringify(mig.stored));

  await ev(`localStorage.setItem('hks.progress.v1', JSON.stringify({ extraUnlocked: true, extraChar: 'marisa' }))`);
  await T.reload();
  await sleep(1200);
  await T.waitFor('!!window.__game', 15000);
  mig = await ev(`({ unlocked: __game.unlockedExtra, chars: __game.extraChars, extraChar: __game.extraChar })`);
  chk(mig.unlocked === true && !mig.chars.reimu && mig.chars.marisa === true, 'S9c 旧格式单角色存档只解锁该角色', JSON.stringify(mig));

  // EXTRA 选人页：只有魔理沙时按 E 进选人，灵梦应为锁定不可选
  await T.key('KeyE');
  await sleep(300);
  const ex = await ev(`({ state: __game.state, page: __game._page, title: document.getElementById('panelTitle') && document.getElementById('panelTitle').textContent })`);
  note(`EXTRA 选人页: ${JSON.stringify(ex)}`);
  chk(ex.state === 'menu', 'S9d EXTRA 入口不崩溃', JSON.stringify(ex));

  /* ---------- 收尾 ---------- */
  out.checks = sum();
  out.report = await T.report();
  console.log('\n通过', out.checks.pass, '失败', out.checks.fail);
  for (const r of out.checks.rows) if (!r.ok) console.log('FAIL:', r.name, '-', r.detail);
  saveJson('_pt/audit2/state.json', out);
} catch (e) {
  out.crash = String((e && e.stack) || e);
  console.error('探针崩溃:', out.crash);
  try { saveJson('_pt/audit2/state.json', out); } catch {}
  process.exitCode = 1;
} finally {
  await T.close();
}
