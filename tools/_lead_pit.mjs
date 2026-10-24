/**
 * Lead 专测：第 6 面 x≈35520 的 3 列深渊坑，真人式按键能否跳过。
 * 自动玩家（tools/sim_bot.js）在此 100% 掉坑，导致 N/H 全流程无法跑完。
 * 本脚本用真实 CDP 键盘事件（右键+空格）复现人类操作。
 *   node tools/_lead_pit.mjs
 */
import { launch, sleep } from './_pt_core.mjs';

const OUT = '_pt/lead_pit';
const T = await launch({ port: 9421, width: 1280, height: 720, headless: true });
const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);

try {
  await T.boot();
  await sleep(700);
  // 标题 → 难度 N → 自机灵梦 → 跳过开场对话进 play
  await T.tap('Enter'); await sleep(350);
  await T.tap('KeyN'); await sleep(250);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 40; i++) {
    const st = await G('({ state: g.state, dlg: !!g.dialogue?.active })');
    if (st.state === 'play') break;
    await T.tap('Enter');
    await sleep(120);
  }
  // 直达第 6 面（跳关函数本体由 ai-playtester 用带 modifiers 的真实按键覆盖；
  // 这里只为几何测试摆位，直接调跳关入口）
  await T.eval('window.__game._warpToStage(6)');
  await sleep(900);
  const at = await G('({ state: g.state, lv: g.levelIndex, mode: g.stage && g.stage.mode })');
  console.log('warp:', JSON.stringify(at));

  // 把玩家放到坑前的地面上（测试便捷，仅摆位；之后全靠真实按键）
  await T.eval(`(() => { const g = window.__game; const p = g.stage.player;
    p.x = 35280; p.y = 736 - p.h; p.vx = 0; p.vy = 0; p.onGround = true;
    g.stage.camera?.snapTo?.(p.x + p.w / 2); })()`);
  await sleep(400);
  const p0 = await G('({ x: Math.round(g.stage.player.x), y: Math.round(g.stage.player.y), h: g.stage.player.h, lives: g.stage.player.lives, onGround: g.stage.player.onGround })');
  console.log('before:', JSON.stringify(p0));
  await T.shot(`${OUT}/before.png`);

  // 按住右跑，到坑沿前起跳，空格按住 300ms（约等于人类长跳）
  await T.keyDown('ArrowRight');
  let px = 0;
  for (let i = 0; i < 300; i++) {
    px = await G('Math.round(g.stage.player.x)');
    if (px >= 35405) break;
    await sleep(10);
  }
  await T.keyDown('Space');
  await sleep(300);
  await T.keyUp('Space');
  await sleep(650);
  await T.keyUp('ArrowRight');
  await sleep(400);

  const p1 = await G(`({ x: Math.round(g.stage.player.x), y: Math.round(g.stage.player.y),
    lives: g.stage.player.lives, state: g.state, stageState: g.stage.state,
    maxX: Math.round(g.stage.stageMaxX || 0), hp: g.stage.player.hearts })`);
  console.log('after:', JSON.stringify(p1));
  await T.shot(`${OUT}/after.png`);
  console.log(p1.x >= 35620 && p1.state === 'play' ? 'RESULT: 人类式按键成功跳过' : 'RESULT: 未跳过（需进一步分析）');
} catch (e) {
  console.error('ERR', e && e.message);
} finally {
  try { await T.close(); } catch {}
}
