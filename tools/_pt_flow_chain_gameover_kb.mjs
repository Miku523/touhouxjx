/**
 * flow-chain GameOver 键盘通道探针（FC-2 证据，独立复现两次中的第一次）。
 * 观察：gameover 面板出现后 Enter（再战/续命）与 Esc（返回标题）是否响应。
 * 复现方式：固定 seed=12345，E/灵梦，瞬移到 Boss 触发区，真实死亡。
 */
import * as L from './_pt_flow_chain_lib.mjs';
import { sleep } from './_pt_core.mjs';

const SECTION = 'gameover_kb';
const PORT = 9412;
const log = (m) => console.log(`[gokb ${new Date().toISOString().slice(11, 19)}] ${m}`);
const R = new L.Run(SECTION, null);
const T = await L.openGame({ port: PORT, clearStorage: true });
R.T = T;
process.on('uncaughtException', (e) => { log(`未捕获 ${e && e.stack || e}`); try { T.close(); } catch (x) {} process.exit(1); });

try {
  await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  await L.warpPlatform(T, { boss: true });
  await L.drive(T, `s.state === 'play' && s.st.bossStarted === true && s.st.boss && s.st.boss.state !== 'intro'`, { timeout: 90000, label: 'Boss 开战' });
  const go = await L.dieToGameOver(T, { label: 'E Boss 战死亡' });
  const g = go.state;
  R.chk(g.state === 'gameover', '死亡后进入 gameover 面板', g.state);
  R.chk(g.buttons.some((b) => /再战 Boss/.test(b.t)) && g.buttons.some((b) => /返回标题/.test(b.t)), '面板按钮为「再战 Boss / 返回标题」', JSON.stringify(g.buttons));
  R.snap('G1_gameover', g);
  await R.shot('G1_gameover');
  R.info('面板文案', `title=${g.title} subtitle=${await T.eval(`document.getElementById('subtitle').textContent`)}`);

  // —— 键盘 Enter：应触发 _retryStage ——
  await T.key('Enter', 22);
  await sleep(1500);
  const afterEnter = await L.read(T);
  R.snap('G2_after_enter', afterEnter);
  await R.shot('G2_after_enter');
  const enterWorks = afterEnter.state !== 'gameover';
  R.chk(enterWorks, 'gameover 面板按 Enter 能续命/再战（键盘用户可用）', `state 仍为 ${afterEnter.state}，activeElement=${await T.eval(`document.activeElement && document.activeElement.tagName`)}，overlayHidden=${afterEnter.overlayHidden}`);

  // —— 键盘 Esc：应返回标题 ——
  await T.key('Escape', 22);
  await sleep(1500);
  const afterEsc = await L.read(T);
  R.snap('G3_after_esc', afterEsc);
  await R.shot('G3_after_esc');
  const escWorks = afterEsc.state !== 'gameover';
  R.chk(escWorks, 'gameover 面板按 Esc 能返回标题（键盘用户可用）', `state 仍为 ${afterEsc.state}，title=${afterEsc.title}`);

  // —— 鼠标等价操作：click 面板按钮，链路可继续（证明仅键盘通道失效） ——
  const clicked = await L.clickPanelButton(T, 0);
  R.info('按钮点击', JSON.stringify(clicked));
  const resumed = await L.drive(T, `s.state === 'play' && s.st && s.st.bossStarted === true && s.st.boss`, { timeout: 90000, label: '点击按钮续命' });
  R.chk(resumed.continues === 1 && resumed.st.boss.key === 'rumia', '鼠标点击「再战 Boss」后 continues=1 并回到露米娅战', `continues=${resumed.continues} boss=${resumed.st.boss && resumed.st.boss.key}`);
  R.snap('G4_clicked_resume', resumed);
  await R.shot('G4_clicked_resume');

  R.finding({
    id: 'FC-2',
    title: 'GameOver 面板对键盘完全无响应：Enter 不能续命/再战，Esc 不能返回标题（只能鼠标点按钮）',
    severity: 'blocker',
    where: 'src/main.js:416 _onMenuKey 仅在 state===\'menu\'||\'paused\' 时处理；src/main.js:1278 update() 只处理 ending/dialogue/paused/play，gameover 无分支 → _onGameOver（1118）面板按钮的 ENTER/ESC key 标注没有键盘实现',
    steps: [
      '固定 seed=12345，E 难度灵梦开局，瞬移到 Boss 触发线进入露米娅战',
      '让玩家死亡耗尽残机 → 进入 gameover 面板（按钮「再战 Boss / 返回标题」）',
      '按 Enter 1.5s 后观察：state 仍 gameover，无任何变化',
      '按 Esc 1.5s 后观察：state 仍 gameover，无法返回标题',
      '用鼠标等价点击第一个按钮：立即 continues+1 并回到 Boss 战（说明只坏了键盘通道）',
    ],
    expect: 'gameover 面板应像暂停菜单一样响应键盘：Enter 触发选中的「再战 Boss/重新挑战本关」，Esc 返回标题（面板按钮上明确标注了 ENTER/ESC）',
    actual: 'Enter、Esc 均无反应；state 一直停在 gameover，键盘玩家只能看到面板却无法继续',
    evidence: ['_pt/flow_chain/gameover_kb/G1_gameover.png', '_pt/flow_chain/gameover_kb/G2_after_enter.png', '_pt/flow_chain/gameover_kb/G3_after_esc.png', '_pt/flow_chain/gameover_kb/G4_clicked_resume.png'],
    snapshot: { afterEnterState: afterEnter.state, afterEscState: afterEsc.state, buttons: g.buttons, resumed: { continues: resumed.continues, boss: resumed.st.boss && resumed.st.boss.key } },
    accel: '瞬移到 Boss 触发线 + p.lives=1/hearts=1/hurt(1) 触发真实 gameover；键盘/鼠标均为真实输入',
  });

  const rep = await T.report();
  R.chk((rep.errors || []).length === 0, '全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
  const out = await R.write({ section: SECTION, port: PORT, report: rep });
  L.writeCombined(SECTION, out, R.findings);
  await T.close();
  console.log(JSON.stringify({ section: SECTION, pass: out.pass, passCount: out.passCount, failCount: out.failCount, findings: R.findings.length }, null, 2));
} catch (e) {
  log(`脚本异常 ${e && e.stack || e}`);
  try { await R.write({ section: SECTION, port: PORT, error: String(e && e.message || e) }); L.writeCombined(SECTION, { pass: false, failCount: 1, findings: R.findings.length }, R.findings); } catch (x) {}
  try { await T.close(); } catch (x) {}
  process.exit(1);
}
