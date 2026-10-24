// 验证：暂停菜单里的「重新开始本关」按钮 + R 快捷键。
// 用法：node tools/_lead_pause_restart.mjs [port]
import { launch, saveJson } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9423;
const T = await launch({ port: PORT, headless: true });
const out = { checks: [], ok: false };
const ck = (name, pass, info) => out.checks.push({ name, pass: !!pass, info });

try {
  await T.boot({ query: '?v=pausetest', waitTitle: 15000 });
  // 进游戏：Enter → 难度 N → 自机 1 → 循环 Enter 推对话到 play
  await T.key('Enter');
  await T.sleep(300);
  await T.key('KeyN');
  await T.sleep(200);
  await T.key('Digit1');
  await T.sleep(200);
  for (let i = 0; i < 80; i++) {
    const st = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active, has: !!window.__game.stage })');
    if (st.s === 'play' && !st.d && st.has) break;
    await T.tap('Enter');
    await T.sleep(120);
  }
  const entered = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active, has: !!window.__game.stage })');
  ck('进入 play', entered.s === 'play' && !entered.d && entered.has, entered);

  // 暂停
  await T.key('Escape');
  await T.sleep(300);
  const labels = await T.eval(`[...document.querySelectorAll('#overlay .btn, #overlay button')].map(b => b.textContent.trim())`);
  ck('暂停面板含「重新开始本关」', Array.isArray(labels) && labels.some((s) => s.includes('重新开始本关')), labels);
  // 先把玩家挪远，验证重开确实回到关卡起点（而不是原地继续）
  await T.eval('window.__game.stage.player.x = 3000');
  const stageId1 = await T.eval('window.__game.stage && window.__game.stage._uid ? window.__game.stage._uid : (window.__g1 = window.__game.stage, "ref1")');
  const x1 = await T.eval('window.__game.stage.player.x');

  // R 键直接重开
  await T.key('KeyR');
  await T.sleep(600);
  const state2 = await T.eval('window.__game.state');
  const sameStage = await T.eval('window.__game.stage === window.__g1');
  const x2 = await T.eval('window.__game.stage ? window.__game.stage.player.x : null');
  ck('R 后回到 play', state2 === 'play', state2);
  ck('R 后关卡实例已重建', sameStage === false, { sameStage, x1, x2 });
  ck('重开后回到关卡起点附近', typeof x2 === 'number' && x2 < x1, { x1, x2 });

  // 再暂停 → 点按钮重开
  await T.key('Escape');
  await T.sleep(300);
  await T.eval(`window.__g2 = window.__game.stage; 1`);
  const clicked = await T.eval(`(() => {
    const b = [...document.querySelectorAll('#overlay .btn, #overlay button')].find(e => e.textContent.includes('重新开始本关'));
    if (!b) return false; b.click(); return true;
  })()`);
  await T.sleep(600);
  const state3 = await T.eval('window.__game.state');
  const sameStage2 = await T.eval('window.__game.stage === window.__g2');
  ck('按钮可点击', clicked === true, clicked);
  ck('按钮重开后回到 play', state3 === 'play', state3);
  ck('按钮重开后关卡实例已重建', sameStage2 === false, sameStage2);

  // 暂停 → Esc 继续仍正常
  await T.key('Escape');
  await T.sleep(250);
  await T.key('Escape');
  await T.sleep(250);
  ck('Esc 能恢复游戏', (await T.eval('window.__game.state')) === 'play', await T.eval('window.__game.state'));
  ck('无 JS 错误', T.errors.length === 0, T.errors.slice(0, 3));
  out.ok = out.checks.every((c) => c.pass);
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  out.error = String((e && e.message) || e);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  saveJson('_pt/lead_pause_restart.json', out);
  await T.close().catch(() => {});
}
