/**
 * 一次性 QA：验证隐藏跳关「按住 Shift + 1–6 直达主线第 1–6 面」。
 *
 * 前置：python tools/serve_nocache.py 8138
 * 运行：node tools/_pt_warp.mjs [--port 9471]
 */
import { launch, makeChecks, saveJson } from './_pt_core.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (process.argv[i].startsWith('--')) args.set(process.argv[i].slice(2), process.argv[i + 1]);
}
const PORT = Number(args.get('port') || 9471);

const DIGIT = {
  0: ['Digit0', ')', 48], 1: ['Digit1', '!', 49], 2: ['Digit2', '@', 50],
  3: ['Digit3', '#', 51], 4: ['Digit4', '$', 52], 5: ['Digit5', '%', 53],
  6: ['Digit6', '^', 54], 7: ['Digit7', '&', 55], 8: ['Digit8', '*', 56], 9: ['Digit9', '(', 57],
};
const NUM = { 1: ['Numpad1', '1', 97], 2: ['Numpad2', '2', 98], 3: ['Numpad3', '3', 99], 4: ['Numpad4', '4', 100] };

async function rawKey(T, { type, code, key, vk, modifiers = 0, autoRepeat = false }) {
  await T.send('Input.dispatchKeyEvent', {
    type, code, key,
    windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    modifiers, autoRepeat,
  });
}

async function keyDownUp(T, code, key, vk, modifiers = 0) {
  await rawKey(T, { type: 'rawKeyDown', code, key, vk, modifiers });
  await rawKey(T, { type: 'keyUp', code, key, vk, modifiers });
  await T.sleep(60);
}

/** 按住 Shift 再按一个数字键（主键盘 / 小键盘都行） */
async function shiftDigit(T, n, { autoRepeat = false, numpad = false, extraModifiers = 0 } = {}) {
  const [code, key, vk] = (numpad ? NUM : DIGIT)[n];
  const mods = 8 | extraModifiers;
  await rawKey(T, { type: 'rawKeyDown', code: 'ShiftLeft', key: 'Shift', vk: 16, modifiers: 8 });
  await rawKey(T, { type: 'rawKeyDown', code, key, vk, modifiers: mods, autoRepeat });
  await rawKey(T, { type: 'keyUp', code, key, vk, modifiers: mods });
  await rawKey(T, { type: 'keyUp', code: 'ShiftLeft', key: 'Shift', vk: 16, modifiers: 0 });
  await T.sleep(120);
}

const READ = `(() => {
  const g = window.__game;
  const st = g.stage;
  const p = st && st.player;
  return {
    state: g.state,
    level: g.levelIndex,
    hasStage: !!st,
    mode: st ? st.mode : null,
    title: st && st.def ? st.def.title : null,
    inExtra: !!g.inExtra,
    lives: g.lives,
    runLives: g.runLives,
    carryPower: g.carryPower,
    continues: g.continues,
    char: g.char,
    diff: g.difficulty,
    stageTime: st ? +st.time.toFixed(2) : null,
    playerPower: p ? p.power : null,
    dialogue: !!(g.dialogue && g.dialogue.active),
    overlay: !document.getElementById('overlay').classList.contains('hidden'),
    hudHidden: document.getElementById('hud').classList.contains('hidden'),
    stageName: document.getElementById('stageName')?.textContent || '',
    banner: document.getElementById('banner')?.innerHTML || '',
    mainStages: g._mainStages().length,
    capture: g._captureAction || null,
    musicRoom: !!g.musicRoom?.visible,
    slowKey: g.input.keyOf('slow'),
    slowActionOfDigit2: g.input.actionOf('Digit2'),
  };
})()`;

const T = await launch({ port: PORT });
const C = makeChecks();
const g = () => T.eval(READ);
const waitFor = (expr, timeout = 10000) => T.waitFor(expr, timeout);

async function boot() {
  await T.clearCollection();
  await T.boot({ query: '' });
}

try {
  /* ---------- A. 标题页：普通数字无效、Shift+数字生效 ---------- */
  await boot();
  let s0 = await g();
  C.eq(s0.state, 'menu', 'A0 标题页初始为 menu');
  C.eq(s0.hasStage, false, 'A0 标题页没有 stage');

  await keyDownUp(T, 'Digit3', '3', 51); // 不带 Shift
  await T.sleep(150);
  s0 = await g();
  C.eq(s0.state, 'menu', 'A1 裸按 3 不跳关');
  C.eq(s0.hasStage, false, 'A1 裸按 3 不建关卡');

  await shiftDigit(T, 3);
  C.chk(await waitFor('(() => { const g=window.__game; return g.state==="play" && !!g.stage && g.levelIndex===2; })()'), 'A2 Shift+3 进入第 3 面');
  const s3 = await g();
  C.eq(s3.title, '雾之湖 · 冰蓝晨曦', 'A2 第 3 面标题正确');
  C.eq(s3.dialogue, false, 'A2 跳关后没有卡在对白');
  C.eq(s3.overlay, false, 'A2 标题面板已收起');
  C.eq(s3.hudHidden, false, 'A2 HUD 可见');
  C.eq(s3.stageName, 'STAGE 3', 'A2 HUD 显示 STAGE 3');
  C.chk(/STAGE 3/.test(s3.banner) && /雾之湖/.test(s3.banner), 'A2 关卡横幅带面数与标题', s3.banner);
  C.eq(s3.inExtra, false, 'A2 不在 EXTRA');
  C.eq(s3.continues, 0, 'A2 续命次数清零');
  C.eq(s3.carryPower, 16, 'A2 火力回到 16');
  C.eq(s3.runLives, s3.lives, 'A2 残机取设置值');
  C.chk(s3.stageTime !== null && s3.stageTime < 2, 'A2 关卡从 0 秒附近开始', s3.stageTime);

  /* ---------- B. 游戏中跳关 + 主键盘大数字 ---------- */
  await shiftDigit(T, 6);
  C.chk(await waitFor('(() => { const g=window.__game; return g.state==="play" && g.levelIndex===5; })()'), 'B1 游戏中 Shift+6 进入第 6 面');
  const s6 = await g();
  C.eq(s6.title, '月都 · 永远亭', 'B1 第 6 面标题正确');
  C.eq(s6.stageName, 'STAGE 6', 'B1 HUD 显示 STAGE 6');
  C.eq(s6.continues, 0, 'B1 续命仍为 0');
  await T.shot('_pt/warp_stage6.png');

  /* ---------- C. e.repeat 不重复触发 ---------- */
  await T.eval('window.__game.stage.__warpMark = 1');
  await shiftDigit(T, 5, { autoRepeat: true });
  const sRep = await g();
  C.eq(sRep.level, 5, 'C1 repeat 的 Shift+5 被忽略（仍在第 6 面）');
  C.eq(await T.eval('window.__game.stage.__warpMark === 1'), true, 'C1 关卡实例没有被重建');

  /* ---------- D. 小键盘 / 越界数字 / 带修饰键 ---------- */
  await shiftDigit(T, 1, { numpad: true });
  C.chk(await waitFor('(() => window.__game.levelIndex===0 && window.__game.state==="play")()'), 'D1 小键盘 Shift+1 进入第 1 面');
  const before = await g();
  await shiftDigit(T, 7); // 7 不在范围内
  await shiftDigit(T, 0);
  await shiftDigit(T, 2, { extraModifiers: 2 }); // Ctrl+Shift+2
  await T.sleep(150);
  const afterBad = await g();
  C.eq(afterBad.level, before.level, 'D2 7 / 0 / Ctrl 组合都不触发跳关');
  C.eq(afterBad.hasStage, true, 'D2 关卡仍在');

  /* ---------- E. 暂停中跳关 ---------- */
  await T.key('Escape');
  C.chk(await waitFor('window.__game.state === "paused"'), 'E1 暂停面板打开');
  await shiftDigit(T, 2);
  C.chk(await waitFor('(() => window.__game.state==="play" && window.__game.levelIndex===1)()'), 'E1 暂停中 Shift+2 进入第 2 面');
  const sPause = await g();
  C.eq(sPause.overlay, false, 'E1 暂停面板已收起');
  C.eq(sPause.title, '魔法森林 · 萤火夜雾', 'E1 第 2 面标题正确');

  /* ---------- F. 改键捕获 / 按键设置页让位 ---------- */
  await boot();
  await T.eval('window.__game.showKeybinds(6)'); // slow 行
  await T.sleep(100);
  await T.key('Enter'); // 开始捕获
  C.chk(await waitFor('window.__game._captureAction === "slow"'), 'F1 已进入改键捕获');
  await shiftDigit(T, 4);
  const sCap = await g();
  C.eq(sCap.hasStage, false, 'F1 按键设置页里 Shift+4 不跳关');
  C.eq(sCap.state, 'paused', 'F1 仍停在按键设置页');
  C.eq(sCap.capture, null, 'F1 改键流程消费掉了这次按键');
  C.eq(sCap.slowKey, 'ShiftLeft', 'F1 Shift 没有被跳关抢走');
  await T.eval('window.__game.input.resetBinds()');

  /* ---------- G. 音乐回忆室里让位 ---------- */
  await boot();
  await T.eval('window.__game.showMusicRoom()');
  C.chk(await waitFor('!!window.__game.musicRoom?.visible'), 'G1 进入音乐回忆室');
  await shiftDigit(T, 3);
  const sMr = await g();
  C.eq(sMr.musicRoom, true, 'G1 回忆室里 Shift+3 不跳关');
  C.eq(sMr.hasStage, false, 'G1 回忆室里没有建关卡');
  C.eq(sMr.state, 'menu', 'G1 状态仍是 menu');

  /* ---------- H. EASY 也能跳第 6 面 ---------- */
  await boot();
  await T.eval('window.__game.difficulty = "E"');
  await shiftDigit(T, 6);
  C.chk(await waitFor('(() => window.__game.state==="play" && window.__game.levelIndex===5)()'), 'H1 EASY 下 Shift+6 进入第 6 面');
  const sE = await g();
  C.eq(sE.mainStages, 5, 'H1 EASY 主线仍是 5 面');
  C.eq(sE.title, '月都 · 永远亭', 'H1 EASY 第 6 面标题正确');
  C.eq(sE.diff, 'E', 'H1 难度保持 E');

  const rep = await T.report();
  C.chk(rep.errors.length === 0, '无 console / 运行时报错', rep.errors.join(' | '));
  C.chk(rep.httpBad.length === 0, '无 4xx / 5xx 资源', JSON.stringify(rep.httpBad));
  C.chk(rep.netFails.length === 0, '无失败请求', JSON.stringify(rep.netFails));

  const out = { port: PORT, ...C.sum(), shots: ['_pt/warp_stage6.png'], errors: rep.errors, httpBad: rep.httpBad, netFails: rep.netFails };
  saveJson('_pt/warp_report.json', out);
  console.log(JSON.stringify(out, null, 2));
  if (C.sum().fail > 0) process.exitCode = 1;
} catch (e) {
  console.error('FAILED:', e && e.stack || e);
  process.exitCode = 2;
} finally {
  await T.close();
}
