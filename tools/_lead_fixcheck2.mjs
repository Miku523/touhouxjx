// 复核（v2）：先确保真正进 play，再测暂停菜单 R / 静音 / 改键。
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: process.argv[2] ? Number(process.argv[2]) : 9490, headless: true, width: 1280, height: 720 });
const checks = [];
const add = (ok, name, detail) => checks.push({ ok, name, detail });
const S = () => T.eval(`(() => { const g = window.__game; return {
  state: g.state, page: g._page, hasStage: !!g.stage, lives: g.lives,
  muted: !!g.audio && !!g.audio.muted, pauseIdx: g._pauseIndex,
  capture: g._captureAction, binds: g.input ? [...g.input.binds].map(([a, b]) => [a, b.primary, b.alt]) : null,
}; })()`);
const labels = () => T.eval(`Array.from(document.querySelectorAll('#overlay .btn')).map((b) => (b.innerText || '').replace(/\\s+/g, ' ').trim())`);
const note = () => T.eval(`(document.querySelector('#subtitle') || {}).textContent || ''`);

try {
  await T.boot({ query: '?v=fixcheck2' + Date.now(), waitTitle: 20000 });
  await T.tap('Enter'); await sleep(300);
  await T.tap('KeyN'); await sleep(200);
  await T.tap('Digit1'); await sleep(350);
  let state = '';
  for (let i = 0; i < 90; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active, pg: window.__game._page })');
    state = s.s;
    if (s.s === 'play' && !s.d) break;
    if (s.s === 'menu' && s.pg === 'charselect') { await T.tap('Digit1'); await sleep(250); continue; }
    await T.tap('Enter'); await sleep(100);
  }
  const start = await S();
  add(start.state === 'play' && start.hasStage, '进入 play', JSON.stringify(start));
  // 记录 stage 引用（用 seed + 对象身份）
  await T.eval('window.__stageRef = window.__game.stage');
  // 1) 暂停菜单四项 + R 重开
  await T.tap('Escape'); await sleep(400);
  const lab = await labels();
  add(lab.some((t) => t.includes('重新开始本关')), '暂停菜单含「重新开始本关」', JSON.stringify(lab));
  await T.tap('KeyR'); await sleep(1200);
  const afterR = await S();
  const isNew = await T.eval('window.__game.stage !== window.__stageRef');
  add(afterR.state === 'play' && afterR.page === '' && isNew, 'R 重开关卡', `isNew=${isNew} state=${afterR.state} page=${afterR.page}`);
  // 2) 暂停中 M 静音
  await T.tap('Escape'); await sleep(350);
  const m0 = (await S()).muted;
  await T.tap('KeyM'); await sleep(250);
  const m1 = (await S()).muted;
  add(m0 !== m1, '暂停中 M 静音', `${m0} -> ${m1}`);
  await T.tap('KeyM'); await sleep(200);
  await T.tap('Escape'); await sleep(350);
  // 3) 改键页
  await T.eval('window.__game.showKeybinds()'); await sleep(500);
  const rows = await T.eval(`Array.from(document.querySelectorAll('.kb-row')).map((b, i) => ({ i, t: b.textContent.replace(/\\s+/g, ' ').trim() }))`);
  const jump = rows.find((r) => r.t.includes('跳跃'));
  const shoot = rows.find((r) => r.t.includes('射击'));
  add(!!jump && !!shoot, '改键页行可定位', JSON.stringify(rows.slice(0, 3)));
  await T.eval(`document.querySelectorAll('.kb-row')[${jump.i}].click()`); await sleep(300);
  await T.tap('F5'); await sleep(300);
  const a5 = await S();
  add(a5.capture === 'jump' && a5.binds.find((b) => b[0] === 'jump')[1] === 'Space', 'F5 被拒绝且仍在捕获', `capture=${a5.capture} note=${await note()}`);
  await T.tap('KeyT'); await sleep(400);
  const aT = await S();
  add(aT.capture === null && aT.binds.find((b) => b[0] === 'jump')[1] === 'KeyT', '跳跃改绑 KeyT', JSON.stringify(aT.binds.find((b) => b[0] === 'jump')));
  await T.eval(`document.querySelectorAll('.kb-row')[${shoot.i}].click()`); await sleep(250);
  await T.tap('KeyJ'); await sleep(400);
  const sb = (await S()).binds.find((b) => b[0] === 'shoot');
  add(sb[1] !== sb[2], '主键≠副键（选副键时对调）', JSON.stringify(sb));
} finally {
  await T.close().catch(() => {});
}
console.log(JSON.stringify({ ok: checks.every((c) => c.ok), checks }, null, 2));
