/**
 * EXTRA 连环战 BGM 续播检查：同一首战斗曲第二次登场时要从上次被换下去的位置接着放。
 *
 * 覆盖三件事：
 *  1. 音频文件曲目（ex_pre）被换成 ex_mid 时记下进度，再切回 ex_pre 时 from 偏移生效，
 *     进度从记下的那一秒继续涨，而不是回到 0（用户报的场景）。
 *  2. 合成曲目（stage1）走 _eventIndexAt 定位起播点：事件指针要落在偏移之后，不能从头排。
 *  3. 回归：同一首正在放时 _playChainMusic 不会把它掐断重播；from 超过曲长按本圈取模。
 *
 * 运行（先起静态服务器，PT_BASE 指向它）：
 *   node tools/_static_server.mjs 8756 &
 *   PT_BASE=http://127.0.0.1:8756 node tools/_check_chain_music_resume.mjs
 *
 * 结果里每条断言打印 OK/FAIL，任何 FAIL 以退出码 1 结束。
 */
import { launch, sleep } from './_pt_core.mjs';

const PORT = Number(process.env.PT_CDP_PORT || 9431);
let pass = 0, fail = 0;
const chk = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail === undefined ? '' : '  →  ' + JSON.stringify(detail)}`); }
};

console.log(`PT_BASE = ${process.env.PT_BASE || '(默认 8138)'}`);
const T = await launch({ port: PORT });
try {
  await T.boot();
  // 解锁音频（eval 带 userGesture，可直接 unlock）；标题曲先接管，随后被测试曲目换掉
  await T.eval(`(() => { const a = __game.audio; a.unlock(); a.setMusic(true); return !!a.ctx; })()`);
  chk('AudioContext 已创建', await T.eval('!!__game.audio.ctx'));

  // ── 1. 音频文件曲目：ex_pre → ex_mid → 回到 ex_pre 要接着放 ──────────────
  console.log('\n[1] 音频文件曲目 ex_pre 的跨场续播');
  await T.eval(`(() => { __game.audio.playMusic('ex_pre'); })()`);
  // 先让它真放一段（模拟第一场打了几十秒），别拿 0.6s 的进度当「第一场结束时的位置」
  const gotAudio = await T.waitFor(`(() => { const p = __game.audio.musicProgress; return !!p && p.elapsed > 3; })()`, 15000);
  chk('ex_pre 起播并拿到进度', gotAudio, await T.eval('__game.audio.musicProgress'));

  const before = await T.eval('({ song: __game.audio.currentSong, ...__game.audio.musicProgress })');
  console.log('     第一场放到的位置：', JSON.stringify(before));

  // 模拟 EXTRA 连环战：第一场咲夜被击破 → 蕾米登场切 ex_mid（记账）
  await T.eval(`(() => {
    __game._levelMusic = { pre: 'ex_pre', mid: 'ex_mid', boss: 'extra' };
    __game._chainMusicPos = new Map();
    __game._playChainMusic('ex_mid');
  })()`);
  const afterSwitch = await T.eval('({ song: __game.audio.currentSong, from: __game._chainMusicPos.get("ex_pre") ?? null })');
  chk('切到 ex_mid 并记下 ex_pre 的进度', afterSwitch.song === 'ex_mid' && afterSwitch.from > 0, afterSwitch);
  const saved = afterSwitch.from;

  await sleep(1200); // 雷米战打一会儿
  // 第二场咲夜登场 → 切回 ex_pre，应从 saved 处接着放
  await T.eval(`(() => { __game._playChainMusic('ex_pre'); })()`);
  const resumed = await T.eval('({ song: __game.audio.currentSong, ...__game.audio.musicProgress })');
  chk('切回 ex_pre', resumed.song === 'ex_pre', resumed.song);
  chk('没有从头重播（进度≈记下的位置）', Math.abs(resumed.elapsed - saved) < 0.6, { saved, resumed: resumed.elapsed });
  chk('进度不是 0 附近', resumed.elapsed > 1, resumed.elapsed);

  await sleep(1200);
  const later = await T.eval('__game.audio.musicProgress');
  chk('之后继续往前走（紧跟第一场，而不是重新开始）', later.elapsed > saved + 0.7, { saved, later: later.elapsed });

  // ── 2. 合成曲目：from 偏移要落对事件指针 ──────────────────────────────
  console.log('\n[2] 合成曲目 stage1 的 from 偏移（_eventIndexAt）');
  await T.eval(`(() => { __game.audio.playMusic('stage1'); })()`);
  await T.waitFor(`(() => { const p = __game.audio.musicProgress; return !!p && p.elapsed > 1.2; })()`, 10000);
  const synBefore = await T.eval('({ ...__game.audio.musicProgress, idx: __game.audio._songIdx })');
  await T.eval(`(() => {
    __game._chainMusicPos.set('stage1', __game.audio.musicProgress.elapsed);
    __game._playChainMusic('ex_mid');
  })()`);
  await sleep(900);
  await T.eval(`(() => { __game._playChainMusic('stage1'); })()`);
  const synResumed = await T.eval('({ ...__game.audio.musicProgress, idx: __game.audio._songIdx, song: __game.audio.currentSong })');
  chk('合成曲目按偏移接上', Math.abs(synResumed.elapsed - synBefore.elapsed) < 0.6, { before: synBefore.elapsed, resumed: synResumed.elapsed });
  chk('事件指针已跳过偏移前的音符', synResumed.idx > 0, synResumed.idx);
  chk('曲目正确', synResumed.song === 'stage1', synResumed.song);

  // ── 3. 回归：同一首正在放时不能掐断重播 ─────────────────────────────
  console.log('\n[3] 回归：同一首正在放时的重复切曲');
  const idle0 = await T.eval('__game.audio.musicProgress.elapsed');
  await T.eval(`(() => { __game._playChainMusic('stage1'); })()`);
  await sleep(300);
  const idle1 = await T.eval('__game.audio.musicProgress.elapsed');
  chk('同一首重复调用不会重置进度', idle1 > idle0, { idle0, idle1 });

  // ── 4. from 超过曲长：按本圈取模，不能静音或越界 ─────────────────────
  console.log('\n[4] from 超过曲长时取模');
  await T.eval(`(() => {
    __game._levelMusic = { pre: 'ex_pre', mid: 'ex_mid', boss: 'extra' };
    __game._playChainMusic('ex_mid');
    __game._chainMusicPos.set('ex_pre', 500); // 500s，曲长 120s → 20s
  })()`);
  await sleep(200);
  await T.eval(`(() => { __game._playChainMusic('ex_pre'); })()`);
  await T.waitFor(`!!__game.audio.musicProgress`, 15000);
  await sleep(200);
  const wrap = await T.eval('__game.audio.musicProgress');
  chk('取模后落在 20s 附近', wrap && Math.abs(wrap.elapsed - 20) < 0.8, wrap);

  // ── 5. 真·EXTRA 连环战：走生产路径（bossTrigger → 过场对白 → beginBoss → bossStart）──
  console.log('\n[5] EXTRA 连环战实机流程（强制造破推进场次）');
  const pump = async (cond, timeout = 45000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await T.eval(cond)) return true; } catch { /* 页面切换瞬间 __game 可能还没就绪 */ }
      try {
        // 过场要按 Enter 推进：state 已是 dialogue 但 active 还是 false 的立绘预热期也要按
        const inDlg = await T.eval("(__game.state === 'dialogue') || !!(__game.dialogue && __game.dialogue.active)");
        if (inDlg) await T.key('Enter');
      } catch { /* 同上 */ }
      await sleep(150);
    }
    return false;
  };
  // 复刻 startExtra() 进 EXTRA 前的状态（inExtra 是链调度与切曲分支的关键标志；
  // 开场对白与解锁记录不影响音乐路径，这里跳过）。
  // skipBossDialogue = true 是游戏「再战」时用的同类开关（stage.resumeExtraChain 会置位）：
  // 场间战前/战后对白整段跳过，链推进改由 _after 计时器接管，headless 下不受立绘预热影响。
  await T.eval(`(() => {
    const g = __game;
    g.inExtra = true; g.char = 'reimu'; g.extraChar = 'reimu';
    g.carryPower = 0; g.continues = 0; g.levelIndex = 0; g.runLives = null;
    g._startExtraStage();
    if (g.stage) g.stage.skipBossDialogue = true;
  })()`);
  const s0 = await pump(`(() => { const s = __game.stage; return !!(s && s.bossStarted && s.boss && __game.audio.currentSong === 'ex_pre'); })()`);
  chk('第一场（咲夜）开打、曲目 ex_pre', s0,
    await T.eval('({ state: __game.state, song: __game.audio.currentSong, boss: __game.stage && __game.stage.boss ? __game.stage.boss.key : null })'));
  await sleep(1500); // 第一场打一会儿，让进度涨起来
  const first = await T.eval('__game.audio.musicProgress ? __game.audio.musicProgress.elapsed : null');

  // 强制造破 → 第二场（雷米莉亚）：ex_mid 接管，ex_pre 被记账
  const forceChain = async () => {
    const ready = await pump(`(() => !!(__game.stage && __game.stage.boss && __game.stage.boss.state === 'battle'))()`, 20000);
    if (ready) await T.eval('__game.stage._forceChainTimeout()');
    return ready;
  };
  chk('第一场 Boss 可战（强制造破前置条件）', await forceChain());
  const s1 = await pump(`(() => !!(__game.stage && __game.stage.bossStarted && __game.audio.currentSong === 'ex_mid'))()`);
  chk('第二场（雷米莉亚）开打、曲目 ex_mid', s1, await T.eval('({ state: __game.state, song: __game.audio.currentSong })'));
  const chainSaved = await T.eval('__game._chainMusicPos.get("ex_pre") ?? null');
  chk("ex_pre 的进度已记账", typeof chainSaved === "number" && chainSaved > 0, { first, saved: chainSaved });

  // 雷米战打一会儿（中间隔了一段别的曲子）→ 强制造破 → 第三场咲夜再登场
  await forceChain();
  await sleep(1000);
  const s2 = await pump(`(() => !!(__game.stage && __game.stage.bossStarted && __game.audio.currentSong === 'ex_pre'))()`, 75000);
  const resumed2 = await T.eval('({ song: __game.audio.currentSong, ...__game.audio.musicProgress })');
  chk('第三场（咲夜再登场）切回 ex_pre', s2 && resumed2.song === 'ex_pre', resumed2);
  chk('从第一场结束的位置接着放，不从头上重来',
    Math.abs(resumed2.elapsed - chainSaved) < 2.5 && resumed2.elapsed > 1,
    { saved: chainSaved, resumed: resumed2.elapsed });
  await sleep(1200);
  const later2 = await T.eval('__game.audio.musicProgress ? __game.audio.musicProgress.elapsed : null');
  chk('之后继续往前放', later2 > resumed2.elapsed + 0.6, { resumed: resumed2.elapsed, later: later2 });

  console.log(`\n结果：${pass} passed, ${fail} failed`);
  const errs = T.errors.filter((e) => !/favicon|AudioContext|autoplay/i.test(e));
  chk('没有页面报错', errs.length === 0, errs.slice(0, 5));
} finally {
  await T.close();
}
process.exit(fail ? 1 : 0);
