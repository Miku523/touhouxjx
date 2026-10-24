// 验收：P2-9 标题进设置 state=menu；P2-1 900×600 暂停菜单 4 项；P2-3 续命只 +1
import { launch, sleep } from './_pt_core.mjs';
const out = {};

const T = await launch({ port: 9463, headless: true });
try {
  await T.boot({ query: '?v=p29' + Date.now(), waitTitle: 15000 });
  await T.tap('KeyS'); await sleep(500);
  out.titleSettings = await T.eval('({ state: window.__game.state, page: window.__game._page, idx: window.__game.menuIndex })');
  await T.tap('Escape'); await sleep(400);
  out.backTitle = await T.eval('({ state: window.__game.state, page: window.__game._page })');
  console.log(JSON.stringify(out, null, 1));
} finally { await T.close().catch(() => {}); }

const S = await launch({ port: 9464, headless: true, width: 900, height: 600 });
try {
  await S.boot({ query: '?v=p21' + Date.now(), waitTitle: 15000 });
  await S.tap('Enter'); await sleep(350); await S.tap('KeyN'); await sleep(250); await S.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 80; i++) {
    const s = await S.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await S.tap('Enter'); await sleep(110);
  }
  await S.tap('Escape'); await sleep(450);
  const pause = await S.eval(`(() => ({
    state: window.__game.state,
    labels: [...document.querySelectorAll('#overlay .btn')].map(b => (b.innerText || '').replace(/\\s+/g, ' ').trim()),
    panelBottom: Math.round(document.querySelector('#overlay .panel').getBoundingClientRect().bottom),
    vh: window.innerHeight,
  }))()`);
  // 暂停里按 R 应重开本关（不计续命）
  await S.tap('KeyR'); await sleep(600);
  const afterR = await S.eval('({ state: window.__game.state, page: window.__game._page, continues: window.__game.continues, x: window.__game.stage ? Math.round(window.__game.stage.player.x) : null })');
  out.pause900 = { pause, afterR };
  await S.shot('_pt/lead_fix/pause900_v2.png');
  console.log(JSON.stringify(out.pause900, null, 1));
} finally { await S.close().catch(() => {}); }

const C = await launch({ port: 9465, headless: true });
try {
  await C.boot({ query: '?v=p23' + Date.now(), waitTitle: 15000 });
  await C.tap('Enter'); await sleep(350); await C.tap('KeyN'); await sleep(250); await C.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 80; i++) {
    const s = await C.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await C.tap('Enter'); await sleep(110);
  }
  const seq = [];
  for (let k = 0; k < 3; k++) {
    await C.eval('(() => { const g = window.__game, p = g.stage.player; p.invuln = 0; p.die(); })()');
    await sleep(1500);
    seq.push(await C.eval('({ state: window.__game.state, lives: window.__game.stage ? window.__game.stage.player.lives : null, continues: window.__game.continues, panel: [...document.querySelectorAll("#overlay .btn")].map(b => (b.innerText||"").replace(/\\s+/g," ").trim()).slice(0,3) })'));
  }
  const before = await C.eval('({ state: window.__game.state, continues: window.__game.continues })');
  await C.tap('Enter'); await sleep(900);
  const after = await C.eval('({ state: window.__game.state, continues: window.__game.continues, lives: window.__game.stage ? window.__game.stage.player.lives : null })');
  await C.tap('Escape'); await sleep(400);
  out.continues = { seq, before, after };
  console.log(JSON.stringify(out.continues, null, 1));
} finally { await C.close().catch(() => {}); }
