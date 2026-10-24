// 诊断：对话 HUD 与 warp 后 stage 是否仍在推进 / 有无 JS 错误
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9453, headless: true });
try {
  await T.boot({ query: '?v=diag' + Date.now(), waitTitle: 15000 });
  await T.eval(`window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message || e)));
    window.addEventListener('unhandledrejection', e => window.__errs.push('rej:' + String(e.reason)));`);
  await T.tap('Enter'); await sleep(350); await T.tap('KeyN'); await sleep(250); await T.tap('Digit1'); await sleep(600);
  const d1 = await T.eval(`(() => ({
    state: window.__game.state, dlg: window.__game.dialogue.active, hasStage: !!window.__game.stage,
    carryPower: window.__game.carryPower,
    hudText: document.querySelector('#hud')?.innerText.replace(/\\s+/g,' ').slice(0,60),
    errs: window.__errs.slice(0,3),
  }))()`);
  for (let i = 0; i < 60; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(110);
  }
  const playT1 = await T.eval('({ t: window.__game.stage.stageTime, hud: window.__game.stage.hudState.power, state: window.__game.state })');
  await sleep(700);
  const playT2 = await T.eval('({ t: window.__game.stage.stageTime, hud: window.__game.stage.hudState.power, state: window.__game.state })');
  await T.eval('window.__game._warpToStage(6)');
  await sleep(900);
  const w1 = await T.eval('({ t: window.__game.stage.stageTime, state: window.__game.state, dlg: window.__game.dialogue.active, x: window.__game.stage.player.x, errs: window.__errs.slice(0,5) })');
  await sleep(900);
  const w2 = await T.eval('({ t: window.__game.stage.stageTime, state: window.__game.state, x: window.__game.stage.player.x, y: window.__game.stage.player.y, errs: window.__errs.slice(0,5) })');
  console.log(JSON.stringify({ d1, playT1, playT2, w1, w2 }, null, 1));
} finally { await T.close().catch(() => {}); }
