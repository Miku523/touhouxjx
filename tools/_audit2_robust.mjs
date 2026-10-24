/**
 * 二轮审计探针：存档健壮性 / 改键 / 状态机续关 / 音频节点。
 * 只读运行时状态，不改 src/。用法：node tools/_audit2_robust.mjs [port]
 */
import { launch, makeChecks, saveJson, sleep } from './_pt_core.mjs';

const PORT = Number(process.argv[2] || 9726);
const C = makeChecks();
const T = await launch({ port: PORT });
const out = {};

async function bootFresh() {
  await T.eval(`(() => { localStorage.clear(); return 1; })()`);
  await T.boot({ waitTitle: true });
}

try {
  await T.boot({ waitTitle: true });

  /* ---------- S1 非法 JSON 存档：应回退默认并正常进标题 ---------- */
  await T.eval(`(() => {
    localStorage.setItem('hks.progress.v1', '{oops');
    localStorage.setItem('hks.settings.v1', 'null');
    localStorage.setItem('hks.keybinds.v1', '["x"]');
    localStorage.setItem('hks.music.v1', '42');
    return 1;
  })()`);
  await T.reload();
  await sleep(2500); // 等新文档落地，避免 waitFor 命中旧页面的 __game
  const okBoot = await T.waitFor('!!window.__game', 20000);
  await T.waitFor('window.__game && window.__game.state === "menu"', 8000);
  const s1 = await T.eval(`(() => { const g = window.__game; return {
    state: g.state, lives: g.lives, jump: g.input.binds.get('jump').primary,
    musicOn: g.musicOn, heard: g._heardSongs ? g._heardSongs.size : -1,
    unlockedExtra: g.unlockedExtra,
  }; })()`);
  out.s1 = s1;
  C.chk(okBoot && s1.state === 'menu', 'S1 非法 JSON 存档仍能进标题', JSON.stringify(s1));
  C.chk(s1.lives === 3 && s1.jump === 'Space', 'S1b 非法存档回退默认设置/键位', JSON.stringify(s1));
  C.chk(s1.heard === 0 && s1.unlockedExtra === false, 'S1c 非法音乐/进度档回退空', JSON.stringify(s1));

  /* ---------- S2 localStorage 写入抛异常：四个保存函数都不得抛出 ---------- */
  const s2 = await T.eval(`(() => {
    const g = window.__game; const proto = Storage.prototype;
    const orig = proto.setItem; const origRm = proto.removeItem;
    proto.setItem = function(){ throw new Error('QuotaExceeded'); };
    proto.removeItem = function(){ throw new Error('SecurityError'); };
    const errs = [];
    const call = (n, f) => { try { f(); } catch (e) { errs.push(n + ': ' + e.message); } };
    call('saveProgress', () => g._saveProgress && g._saveProgress());
    call('saveSettings', () => g._saveSettings && g._saveSettings());
    call('saveMusic', () => g._saveMusicMemory && g._saveMusicMemory());
    call('remember', () => g._rememberSong && g._rememberSong('title'));
    call('resetProgress', () => g._doResetProgress && g._doResetProgress());
    call('resetBinds', () => g.input.resetBinds());
    proto.setItem = orig; proto.removeItem = origRm;
    return { errs, state: g.state, unheard: g._heardSongs ? g._heardSongs.size : -1 };
  })()`);
  out.s2 = s2;
  C.eq(s2.errs.length, 0, 'S2 配额满/禁用 localStorage 时保存不抛异常', JSON.stringify(s2));
  C.chk(s2.state === 'menu', 'S2b 重置进度在写失败时仍回标题', s2.state);

  /* ---------- S3 进入游戏 + 开场对话收尾 ---------- */
  await bootFresh();
  const states = [];
  for (let i = 0; i < 4; i++) {
    await T.key('Enter');
    await sleep(260);
    states.push(await T.eval('window.__game.state'));
    if (['dialogue', 'play'].includes(states.at(-1))) break;
  }
  // 连按 Enter 推进开场对话
  for (let i = 0; i < 40; i++) {
    const st = await T.eval('window.__game.state');
    if (st === 'play') break;
    await T.key('Enter');
    await sleep(60);
  }
  const s3 = await T.eval(`(() => ({ state: window.__game.state, idx: window.__game.levelIndex, lives: window.__game.stage && window.__game.stage.player.lives }))()`);
  out.s3 = { states, after: s3 };
  C.eq(s3.state, 'play', 'S3 开场对话推进后回到 play', JSON.stringify(out.s3));
  C.chk(s3.idx === 0, 'S3b 从第 1 面开始', s3.idx);

  /* ---------- S4 真实 Boss 战 → GameOver → 再战 ---------- */
  await T.eval(`(() => { const g = window.__game; g._warpToStage(1); return 1; })()`);
  await T.waitFor('window.__game.state === "play"', 8000);
  await T.eval(`(() => { const g = window.__game; g.stage.beginBoss(); return 1; })()`);
  await sleep(500);
  const pre = await T.eval(`(() => { const g = window.__game, s = g.stage; return {
    bossStarted: s.bossStarted, bossKey: s.boss && s.boss.key, state: g.state,
    power: s.player.power, lives: s.player.lives, carryPower: g.carryPower,
  }; })()`);
  // 残机只剩 1，直接死透
  await T.eval(`(() => { const p = window.__game.stage.player; p.lives = 1; p.hearts = 0; p.die(); return 1; })()`);
  const gotOver = await T.waitFor('window.__game.state === "gameover"', 6000);
  C.chk(gotOver, 'S4 Boss 战残机耗尽进入 gameover', JSON.stringify(pre));
  if (gotOver) {
    await T.key('Enter');
    await sleep(900);
    const post = await T.eval(`(() => { const g = window.__game, s = g.stage; return {
      state: g.state, bossStarted: s && s.bossStarted, bossKey: s && s.boss && s.boss.key,
      power: s && s.player.power, lives: s && s.player.lives, continues: g.continues,
      checkpointKind: s && s.player.checkpoint ? 'obj' : 'none',
    }; })()`);
    out.s4 = { pre, post };
    C.eq(post.state, 'play', 'S4b 再战后回到 play', JSON.stringify(post));
    C.chk(post.bossStarted === true, 'S4c 再战回到 Boss 战（bossStarted）', JSON.stringify(post));
    C.eq(post.bossKey, pre.bossKey, 'S4d 再战的是同一场 Boss', `${pre.bossKey} vs ${post.bossKey}`);
    C.chk(post.continues === 1, 'S4e 续命次数 +1', post.continues);
    C.chk(post.power > 0, 'S4f 再战火力不是 0', post.power);
  }

  /* ---------- S5 改键：冲突互换 / 自我重复 / Del 恢复 ---------- */
  await T.eval(`(() => { window.__game.showTitle(); return 1; })()`);
  await sleep(200);
  const s5 = await T.eval(`(() => {
    const inp = window.__game.input;
    inp.resetBinds();
    const prim = () => { const o = {}; for (const [a, b] of inp.binds) o[a] = b.primary; return o; };
    const base = prim();
    inp.setBind('jump', 'ArrowLeft');
    const swap = prim();
    const dup = Object.values(swap).filter((v, i, arr) => arr.indexOf(v) !== i);
    inp.setBind('shoot', 'ShiftLeft');
    const swap2 = prim();
    const dup2 = Object.values(swap2).filter((v, i, arr) => arr.indexOf(v) !== i);
    inp.resetBinds();
    const afterReset = prim();
    const raw = localStorage.getItem('hks.keybinds.v1');
    inp.setBind('left', 'KeyA'); // 自己副键改为主键
    const selfB = inp.binds.get('left');
    const self = { primary: selfB.primary, alt: selfB.alt };
    inp.resetBinds();
    return { base, swap, dup, swap2, dup2, afterReset, raw, self };
  })()`);
  out.s5 = s5;
  C.chk(s5.swap.jump === 'ArrowLeft' && s5.swap.left === 'Space', 'S5 冲突键互换不丢键', JSON.stringify(s5.swap));
  C.eq(s5.dup.length, 0, 'S5b 互换后主键唯一', JSON.stringify(s5.dup));
  C.eq(s5.dup2.length, 0, 'S5c 二次互换后主键唯一', JSON.stringify(s5.dup2));
  C.chk(s5.afterReset.jump === 'Space' && s5.afterReset.left === 'ArrowLeft', 'S5d resetBinds 恢复全部默认', JSON.stringify(s5.afterReset));
  C.eq(s5.raw, null, 'S5e resetBinds 清掉持久化键', s5.raw);
  C.chk(s5.self.primary === 'KeyA' && s5.self.alt === 'KeyA', 'S5f 主键改成自身副键 → primary==alt（重复但可触发）', JSON.stringify(s5.self));

  /* ---------- S6 改键捕获态按键泄漏（按 pause 键不应恢复游戏） ---------- */
  await T.eval(`(() => {
    const g = window.__game; g._warpToStage(1);
    g.input.resetBinds();
    return 1;
  })()`);
  await T.waitFor('window.__game.state === "play"', 8000);
  await T.eval(`(() => { const g = window.__game; g._pause(); g.showKeybinds(0); g._captureAction = 'jump'; return 1; })()`);
  await sleep(150);
  await T.key('KeyP'); // 默认 pause 副键
  await sleep(300);
  const s6 = await T.eval(`(() => { const g = window.__game; return {
    state: g.state, capture: g._captureAction, jump: g.input.binds.get('jump').primary,
    page: g._page,
  }; })()`);
  out.s6 = s6;
  C.chk(s6.state === 'paused', 'S6 改键捕获时按 pause 键不会恢复游戏', JSON.stringify(s6));
  C.chk(s6.jump === 'KeyP' && s6.capture === null, 'S6b 捕获态把键绑给当前动作并退出捕获', JSON.stringify(s6));

  /* ---------- S7 音频：切曲后旧节点释放 / 停曲清空 ---------- */
  const s7 = await T.eval(`(async () => {
    const g = window.__game, a = g.audio;
    g.showTitle();
    a.unlock && a.unlock();
    await new Promise(r => setTimeout(r, 120));
    a.playMusic('title'); a.setMusic(true);
    await new Promise(r => setTimeout(r, 350));
    const st1 = { song: a.currentSong, on: a.musicOn, voices: a._musicVoices.size, timer: !!a._musicTimer, ctx: a.ctx && a.ctx.state };
    a.playMusic('stage1'); a.setMusic(true);
    await new Promise(r => setTimeout(r, 500));
    const st2 = { song: a.currentSong, on: a.musicOn, voices: a._musicVoices.size, timer: !!a._musicTimer };
    a.setMusic(false);
    await new Promise(r => setTimeout(r, 250));
    const st3 = { song: a.currentSong, on: a.musicOn, voices: a._musicVoices.size, requested: a._musicRequested };
    // M 静音与音量 0 交互
    a.setMusicVolume(0);
    g._toggleMute(); const m1 = { muted: a.muted, master: a._master ? a._master.gain.value : null };
    g._toggleMute(); const m2 = { muted: a.muted, musicVolume: a.musicVolume };
    a.setMusicVolume(0.8);
    return { st1, st2, st3, m1, m2 };
  })()`);
  out.s7 = s7;
  C.chk(s7.st2.voices <= 2, 'S7 切曲后旧 BGM 节点已释放', JSON.stringify(s7.st2));
  C.eq(s7.st3.voices, 0, 'S7b 停曲后 voices 清空', JSON.stringify(s7.st3));
  C.chk(s7.st3.on === false && s7.st3.requested === false, 'S7c 停曲状态位正确', JSON.stringify(s7.st3));
  C.chk(s7.m2.muted === false && s7.m2.musicVolume === 0.8, 'S7d 静音切换不改音乐音量', JSON.stringify(s7.m2));

  /* ---------- S8 暂停/对话/结局 快捷键不串台 ---------- */
  const s8 = await T.eval(`(() => {
    const g = window.__game; const log = [];
    g.showTitle();
    log.push(['title', g.state]);
    g._playEnding && g._playEnding('bad');
    log.push(['ending', g.state]);
    g.showTitle();
    return log;
  })()`);
  out.s8 = s8;

  const rep = await T.report();
  out.report = { errors: rep.errors.slice(0, 8), warns: rep.warns.slice(0, 8), netFails: rep.netFails.slice(0, 8), httpBad: rep.httpBad.slice(0, 8) };
  out.summary = C.sum();
  saveJson('_pt/audit2/robust.json', out);
  console.log(JSON.stringify(out.summary, null, 1));
  for (const r of C.rows) if (!r.ok) console.log('FAIL', r.name, r.detail);
  console.log('--- report ---');
  console.log(JSON.stringify(out.report, null, 1));
} finally {
  await T.close();
}
