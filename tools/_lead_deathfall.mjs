// 死亡坠落最小验证：站在出生点（无任何触发区）直接死亡，尸体应停在出生地面而不是穿地掉出关卡
import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9457, headless: true });
try {
  await T.boot({ query: '?v=death' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(350); await T.tap('KeyN'); await sleep(250); await T.tap('Digit1'); await sleep(500);
  const opening = await T.eval(`(() => { const el = document.querySelector('#hud');
    return { state: window.__game.state, hasStage: !!window.__game.stage, hudHidden: !!(el && el.classList.contains('hidden')) }; })()`);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(110);
  }
  const hudAfter = await T.eval(`(() => { const el = document.querySelector('#hud');
    return { hudHidden: !!(el && el.classList.contains('hidden')), power: window.__game.stage.hudState.power, lives: window.__game.stage.hudState.lives }; })()`);
  const before = await T.eval(`(() => { const st = window.__game.stage, p = st.player;
    return { x:+p.x.toFixed(1), y:+p.y.toFixed(1), ground:p.onGround, levelH: st.level.h, x0: st.level.spawnX }; })()`);
  await T.eval('window.__game.stage.player.die()');
  const seq = [];
  for (let i = 0; i < 5; i++) {
    await sleep(240);
    seq.push(await T.eval(`(() => { const st = window.__game.stage, p = st.player;
      return { state: window.__game.state, alive: p.alive, y: +p.y.toFixed(1), vy: +p.vy.toFixed(0), ground: p.onGround, levelH: st.level.h, lives: p.lives }; })()`));
  }
  console.log(JSON.stringify({ opening, hudAfter, before, seq }, null, 1));
} finally { await T.close().catch(() => {}); }
