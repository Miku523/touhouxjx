/**
 * 独立复核 flow-chain 的 FC-2：GameOver 面板键盘（Enter/Esc）是否失效。
 *  1) 真实开局 → play
 *  2) 真实走 _onGameOver()（state=gameover，面板按钮 ENTER/ESC）
 *  3) 发真实键盘 Enter → 是否续命回到 play；再走一次 → Esc 是否回标题
 *  4) 对照：鼠标点第一个按钮是否有效
 * 运行：node tools/_pt_lead_gameover.mjs
 */
import { launch, snapshot, makeChecks, saveJson, sleep } from './_pt_core.mjs';

const OUT = '_pt/lead_gameover';
const C = makeChecks();
const notes = [];
const T = await launch({ port: 9447, width: 1280, height: 720 });
const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);

async function startPlay() {
  await T.tap('Enter'); await sleep(250); await T.tap('KeyE'); await sleep(150); await T.tap('Digit1'); await sleep(250);
  for (let i = 0; i < 60; i++) {
    const s = await snapshot(T);
    if (s.state === 'play' && !s.dialogue) return s;
    await T.tap('Enter');
    await sleep(70);
  }
  return snapshot(T);
}

const panel = () => G(`(() => ({
  state: g.state,
  title: document.querySelector('#overlay .panel-title, #overlay h2')?.textContent || '',
  buttons: [...document.querySelectorAll('#overlay .btn')].map(b => ({ text: b.textContent.trim().replace(/\\s+/g,' ').slice(0,24), spec: b._spec ? { key: b._spec.key, hotkey: b._spec.hotkey } : null })),
  active: document.activeElement?.tagName + '.' + (document.activeElement?.className || ''),
}))()`);

try {
  await T.boot();
  await sleep(400);
  let s = await startPlay();
  C.eq(s.state, 'play', '复核：进入 play');

  // 真实 GameOver：把残机清零后触发死亡回调路径
  await G(`(() => { g.runLives = 0; g.lives = 0; g._onGameOver(); return true; })()`);
  await sleep(350);
  let p = await panel();
  notes.push('gameover 面板: ' + JSON.stringify(p));
  C.eq(p.state, 'gameover', '复核：进入 gameover');
  C.chk(p.buttons.length >= 2, '复核：面板有 2 个按钮', JSON.stringify(p.buttons));
  C.chk(p.buttons[0]?.spec?.key === 'ENTER' || /ENTER/.test(p.buttons[0]?.text || ''), '复核：按钮标注 ENTER', JSON.stringify(p.buttons[0]));
  await T.shot(`${OUT}/01-gameover.png`);

  // 键盘 Enter
  const contBefore = await G(`g.continues`);
  await T.tap('Enter');
  await sleep(700);
  const afterEnter = await snapshot(T);
  const contAfter = await G(`g.continues`);
  C.chk(afterEnter.state !== 'gameover', 'Enter 能离开 gameover（续命/再战）', `state=${afterEnter.state} continues ${contBefore}→${contAfter}`);
  notes.push(`Enter: state=${afterEnter.state} continues ${contBefore}→${contAfter}`);
  await T.shot(`${OUT}/02-after-enter.png`);

  // 再来一次 → 键盘 Esc
  await G(`(() => { g._onGameOver(); return true; })()`);
  await sleep(400);
  await T.tap('Escape');
  await sleep(700);
  const afterEsc = await G(`g.state`);
  C.eq(afterEsc, 'menu', 'Esc 能返回标题');
  notes.push(`Esc: state=${afterEsc}`);
  await T.shot(`${OUT}/03-after-esc.png`);

  // 对照：鼠标点第一个按钮
  await startPlay();
  await G(`(() => { g.runLives = 0; g.lives = 0; g._onGameOver(); return true; })()`);
  await sleep(400);
  await T.eval(`(() => { const b = document.querySelector('#overlay .btn'); const r = b.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()`).then(async (pt) => {
    await T.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
    await T.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt[0], y: pt[1], button: 'left', clickCount: 1 });
  });
  await sleep(900);
  const mouseState = await snapshot(T);
  C.chk(mouseState.state !== 'gameover', '对照：鼠标点「再战 Boss」能离开 gameover', `state=${mouseState.state}`);
  notes.push(`鼠标: state=${mouseState.state}`);
} catch (e) {
  C.chk(false, '复核运行异常', String(e && e.message ? e.message : e));
  notes.push('异常: ' + String(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
} finally {
  const rep = await T.report().catch(() => null);
  if (rep) C.chk(rep.errors.length === 0, '复核无 JS 异常', rep.errors.slice(0, 3).join(' | '));
  try { await T.close(); } catch {}
}

const sum = C.sum();
saveJson(`${OUT}/report.json`, { ...sum, notes });
console.log(JSON.stringify({ ...sum, notes }, null, 2));
process.exit(0);
