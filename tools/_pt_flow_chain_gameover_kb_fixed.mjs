/**
 * flow-chain「修后验证」：GameOver 面板键盘通道（原 FC-2）。
 * main.js 已把 state==='gameover' 纳入 _onMenuKey 处理；本脚本验证：
 *   Enter → 续命/再战（continues+1、回 Boss 战、HUD/清弹/火力重置）
 *   Esc   → 返回标题（stage=null、HUD 隐藏）
 * 另验证返回标题后还能再开新局。
 * 端口 9416（easy=9412 / extra=9413 / normal=9414 / edge=9415）。
 */
import * as L from './_pt_flow_chain_lib.mjs';
import { sleep } from './_pt_core.mjs';

const SECTION = 'gameover_kb_fixed';
const PORT = 9416;
const log = (m) => console.log(`[gokb-fix ${new Date().toISOString().slice(11, 19)}] ${m}`);
const R = new L.Run(SECTION, null);
const T = await L.openGame({ port: PORT, clearStorage: true });
R.T = T;
process.on('uncaughtException', (e) => { log(`未捕获 ${e && e.stack || e}`); try { T.close(); } catch (x) {} process.exit(1); });

const PLAY_BOSS = `s.state === 'play' && s.st && s.st.bossStarted === true && s.st.boss`;

try {
  await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  await L.warpPlatform(T, { boss: true });
  await L.drive(T, `s.state === 'play' && s.st.bossStarted === true && s.st.boss && s.st.boss.state !== 'intro'`, { timeout: 90000, label: 'Boss 开战' });

  /* A. Enter → 续命/再战 */
  const go = await L.dieToGameOver(T, { label: 'E Boss 战死亡 1' });
  const g = go.state;
  R.chk(g.state === 'gameover', '死亡后进入 gameover 面板', g.state);
  R.snap('F1_gameover', g);
  await R.shot('F1_gameover');
  await T.key('Enter', 24);
  const c1 = await L.observe(T, `s.state !== 'gameover'`, { timeout: 4000, pollMs: 100 });
  R.chk(!!c1, '修后：gameover 面板按 Enter 能离开（键盘通道生效）', c1 ? `→ state=${c1.state}` : '4s 内仍 gameover');
  const resumed = await L.drive(T, PLAY_BOSS, { timeout: 90000, label: 'Enter 续命回 Boss 战' });
  R.chk(resumed.continues === 1, 'Enter 续命后 continues=1', `continues=${resumed.continues}`);
  R.chk(resumed.st.boss.key === 'rumia', '再战回露米娅战', `boss=${resumed.st.boss.key}`);
  R.chk(resumed.st.boss.hp === resumed.st.boss.maxHp, '再战 Boss 满血', `hp=${resumed.st.boss.hp}/${resumed.st.boss.maxHp}`);
  R.chk(resumed.st.player.alive === true && resumed.st.player.hearts === 3, '再战玩家满 hearts', `alive=${resumed.st.player.alive} hearts=${resumed.st.player.hearts}`);
  R.chk(resumed.hud.bossVisible === true, '再战后 HUD Boss 条可见', `bossBar=${resumed.hud.bossVisible}`);
  R.chk(resumed.st.bullets != null && resumed.st.bullets < 60, '再战后弹幕已重置（无上一命残留）', `bullets=${resumed.st.bullets}`);
  R.snap('F2_enter_resume', resumed);
  await R.shot('F2_enter_resume');
  await L.ensureInvuln(T);

  /* B. 再死一次 → Esc → 返回标题 */
  const go2 = await L.dieToGameOver(T, { label: 'E Boss 战死亡 2' });
  const g2 = go2.state;
  R.chk(g2.state === 'gameover', '第二次死亡仍进入 gameover', g2.state);
  R.chk(g2.continues === 1, '第二次 gameover 时 continues=1（首次续命记录保留）', `continues=${g2.continues}`);
  await R.shot('F3_gameover2');
  await T.key('Escape', 24);
  const back = await L.observe(T, `s.state === 'menu'`, { timeout: 4000, pollMs: 100 });
  R.chk(!!back, '修后：gameover 面板按 Esc 能返回标题', back ? `→ state=${back.state}` : '4s 内仍 gameover');
  const menu = await L.drive(T, `s.state === 'menu' && !s.overlayHidden`, { timeout: 30000, label: 'Esc 回标题', press: false });
  R.chk(menu.title === '東方新紀行' && menu.st === null, 'Esc 后回到标题、stage=null', `${menu.title}/${menu.st}`);
  R.chk((await T.eval(`document.getElementById('hud').classList.contains('hidden')`)) === true, '回标题后 HUD 隐藏', '');
  const btn = (menu.buttons || []).find((b) => /开始游戏/.test(b.t));
  R.chk(!!btn && btn.disabled === false, '回标题后「开始游戏」可用', JSON.stringify(btn));
  R.snap('F4_esc_title', menu);
  await R.shot('F4_esc_title');

  /* C. 还能再开新局（无残留） */
  const again = await L.startRun(T, { diff: 'KeyE', char: 'Digit1' });
  R.chk(again.level === 0 && again.continues === 0 && again.st.player.lives === 3, '回标题后能再开新局（level=0、continues=0、3 残机）', `level=${again.level} continues=${again.continues} lives=${again.st.player.lives}`);
  R.chk(again.st.player.power === 4 && !again.st.boss && (again.st.bullets == null || again.st.bullets < 10), '新局无上一局残留（power=4、无 Boss、无弹幕）', `power=${again.st.player.power} boss=${again.st.boss && again.st.boss.key} bullets=${again.st.bullets}`);
  R.snap('F5_new_run', again);
  await R.shot('F5_new_run');

  const rep = await T.report();
  R.chk((rep.errors || []).length === 0, '修后验证全程无 JS 运行时错误', JSON.stringify((rep.errors || []).slice(0, 5)));
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
