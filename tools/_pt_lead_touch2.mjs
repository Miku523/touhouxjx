/**
 * 触摸板真实手指行为复测（修正上一版 touchEnd 传空数组的 harness 错误）
 *  A. 按住「右」→ 松开后角色必须停住（held 里不能残留 right）
 *  B. 按住「射击」→ PlayerShots 里有活跃弹；松开后停火
 *  C. 点「跳跃」→ 起跳
 *  D. 按住「右」时同屏按「射击」双指可用
 * 运行：node tools/_pt_lead_touch2.mjs
 */
import { launch, snapshot, makeChecks, saveJson, sleep } from './_pt_core.mjs';

const OUT = '_pt/lead_layout';
const C = makeChecks();
const notes = [];
const port = 9446;

const T = await launch({ port, width: 390, height: 844, mobile: true });
await T.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const G = (expr) => T.eval(`(() => { const g = window.__game; return (${expr}); })()`);

const btn = async (k) => T.eval(`(() => {
  const b = document.querySelector('#touch button[data-k="${k}"]');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

const shots = () => G(`(() => { const s = g.stage?.shots; if (!s) return -1; let n = 0; for (const b of s.pool) if (b.active) n++; return n; })()`);
const held = () => T.eval(`(() => { const i = window.__game?.input; return i ? [...i.held.keys()] : []; })()`);

const touch = (type, pts) => T.send('Input.dispatchTouchEvent', { type, touchPoints: pts });

try {
  await T.boot();
  await sleep(400);
  await T.tap('Enter'); await sleep(250); await T.tap('KeyE'); await sleep(150); await T.tap('Digit1'); await sleep(250);
  for (let i = 0; i < 60; i++) {
    const s = await snapshot(T);
    if (s.state === 'play' && !s.dialogue) break;
    await T.tap('Enter');
    await sleep(70);
  }
  const st = await snapshot(T);
  C.eq(st.state, 'play', '触摸设备进入 play');

  /* A. 右移松手停住 */
  const right = await btn('right');
  C.chk(!!right, '找到触摸「右」按钮', JSON.stringify(right));
  let a = await snapshot(T);
  await touch('touchStart', [{ x: right.x, y: right.y, id: 11 }]);
  await sleep(600);
  const b = await snapshot(T);
  await touch('touchEnd', [{ x: right.x, y: right.y, id: 11 }]);
  await sleep(200);
  const c = await snapshot(T);
  await sleep(500);
  const d = await snapshot(T);
  const h = await held();
  C.chk(b.px > a.px + 20, 'A 按住「右」角色前进', `x ${a.px} → ${b.px}`);
  C.chk(Math.abs(d.px - c.px) < 6, 'A 松开后角色停住（不粘键）', `x ${c.px} → ${d.px}（松手后 200/700ms）`);
  C.chk(!h.includes('right'), 'A 松开后 held 不含 right', JSON.stringify(h));
  notes.push(`A: x0=${a.px} x1=${b.px} x2=${c.px} x3=${d.px} held=${JSON.stringify(h)}`);

  /* B. 射击 */
  const shoot = await btn('shoot');
  C.chk(!!shoot, '找到触摸「射击」按钮', JSON.stringify(shoot));
  const s0 = await shots();
  await touch('touchStart', [{ x: shoot.x, y: shoot.y, id: 21 }]);
  await sleep(600);
  const s1 = await shots();
  await touch('touchEnd', [{ x: shoot.x, y: shoot.y, id: 21 }]);
  await sleep(700);
  const s2 = await shots();
  const h2 = await held();
  C.chk(s1 > 0, 'B 按住「射击」有活跃玩家弹', `shots ${s0} → ${s1}`);
  C.chk(!h2.includes('shoot'), 'B 松开后 held 不含 shoot', JSON.stringify(h2));
  notes.push(`B: shots ${s0} → ${s1} → ${s2} held=${JSON.stringify(h2)}`);

  /* C. 跳跃 */
  const jump = await btn('jump');
  const y0 = (await snapshot(T)).py;
  await touch('touchStart', [{ x: jump.x, y: jump.y, id: 31 }]);
  await sleep(120);
  await touch('touchEnd', [{ x: jump.x, y: jump.y, id: 31 }]);
  let minY = y0;
  for (let i = 0; i < 12; i++) {
    await sleep(60);
    const s = await snapshot(T);
    if (s.py < minY) minY = s.py;
  }
  C.chk(minY < y0 - 20, 'C 点「跳跃」角色起跳', `y ${y0} → 最低 ${minY}`);
  notes.push(`C: y ${y0} → ${minY}`);

  /* D. 双指：右 + 射击 */
  const x0 = (await snapshot(T)).px;
  await touch('touchStart', [{ x: right.x, y: right.y, id: 41 }]);
  await sleep(150);
  await touch('touchStart', [{ x: right.x, y: right.y, id: 41 }, { x: shoot.x, y: shoot.y, id: 42 }]);
  await sleep(600);
  const dx = (await snapshot(T)).px;
  const dshots = await shots();
  await touch('touchEnd', [{ x: right.x, y: right.y, id: 41 }, { x: shoot.x, y: shoot.y, id: 42 }]);
  await sleep(400);
  const h3 = await held();
  C.chk(dx > x0 + 20, 'D 双指同时右移+射击：右移生效', `x ${x0} → ${dx}`);
  C.chk(dshots > 0, 'D 双指同时右移+射击：射击生效', `shots=${dshots}`);
  C.chk(h3.length === 0, 'D 双指松开后 held 清空', JSON.stringify(h3));
  notes.push(`D: x ${x0} → ${dx} shots=${dshots} held=${JSON.stringify(h3)}`);
  await T.shot(`${OUT}/N-touch-retest.png`);
} catch (e) {
  C.chk(false, '触摸复测运行异常', String(e && e.message ? e.message : e));
  notes.push('异常: ' + String(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
} finally {
  const rep = await T.report().catch(() => null);
  if (rep) {
    C.chk(rep.errors.length === 0, '触摸复测无 JS 异常', rep.errors.slice(0, 3).join(' | '));
    C.chk(rep.httpBad.length === 0 && rep.netFails.length === 0, '触摸复测无 404/网络失败', JSON.stringify({ bad: rep.httpBad.slice(0, 3), fail: rep.netFails.slice(0, 3) }));
  }
  try { await T.close(); } catch {}
}

const sum = C.sum();
saveJson(`${OUT}/touch2.json`, { ...sum, notes });
console.log(JSON.stringify({ ...sum, notes }, null, 2));
process.exit(0);
