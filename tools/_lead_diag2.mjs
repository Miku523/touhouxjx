// 诊断 2：warp 到 stage6 后玩家是否从起点的地面掉下去
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9454, headless: true });
try {
  await T.boot({ query: '?v=diag2' + Date.now(), waitTitle: 15000 });
  await T.eval(`window.__errs=[]; window.addEventListener('error', e=>window.__errs.push(String(e.message||e)));`);
  const sample = `(() => { const g=window.__game, st=g.stage, p=st&&st.player; return {
    state:g.state, time: st?+st.time.toFixed(2):null, x: p?+p.x.toFixed(1):null, y: p?+p.y.toFixed(1):null,
    vy: p?+p.vy.toFixed(0):null, ground: p?p.onGround:null, alive: p?p.alive:null, lives: p?p.lives:null,
    startY: st&&st.level?st.level.spawnY:null, errs: window.__errs.slice(0,3) }; })()`;
  // 路径 A：标题直接 warp
  await T.tap('Enter'); await sleep(350); await T.tap('KeyN'); await sleep(250); await T.tap('Digit1'); await sleep(500);
  await T.eval('window.__game._warpToStage(6)');
  const seqA = [];
  for (let i = 0; i < 5; i++) { await sleep(400); seqA.push(await T.eval(sample)); }
  // 路径 B：等 play 后再 warp
  for (let i = 0; i < 60; i++) { const s = await T.eval('({s:window.__game.state,d:window.__game.dialogue.active})'); if (s.s === 'play' && !s.d) break; await T.tap('Enter'); await sleep(110); }
  await T.eval('window.__game._warpToStage(6)');
  const seqB = [];
  for (let i = 0; i < 5; i++) { await sleep(400); seqB.push(await T.eval(sample)); }
  console.log(JSON.stringify({ seqA, seqB }, null, 1));
} finally { await T.close().catch(() => {}); }
