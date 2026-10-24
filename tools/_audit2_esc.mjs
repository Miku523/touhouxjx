// 小探针：暂停菜单 Esc 行为逐键记录（只读）。
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9723 });
const ev = (x) => T.eval(x);
const st = () => ev(`(() => { const g = window.__game; return { state: g.state, page: g._page, hidden: document.getElementById('overlay').classList.contains('hidden'),
  btns: (g.menuButtons||[]).map(b => (b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,14) + (b.classList.contains('sel')?'[sel]':'')), stage: !!g.stage }; })()`);
try {
  await T.boot();
  await T.holdKeys(['ShiftLeft', 'Digit1'], 90);
  await sleep(400);
  console.log('进关:', JSON.stringify(await st()));
  await T.key('Escape'); await sleep(250);
  console.log('Esc#1:', JSON.stringify(await st()));
  await T.key('Escape'); await sleep(250);
  console.log('Esc#2:', JSON.stringify(await st()));
  await T.key('Escape'); await sleep(250);
  console.log('Esc#3:', JSON.stringify(await st()));
  // 两次连按
  await T.key('Escape', 25); await sleep(60); await T.key('Escape', 25); await sleep(400);
  console.log('连按两次:', JSON.stringify(await st()));
} finally { await T.close(); }
