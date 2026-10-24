// 第三轮验收：①开场对话 HUD 不再显示 0/64（无 stage 时隐藏）②死亡坠落停在地面 ③设置页光标往返保持
import { launch, sleep } from './_pt_core.mjs';

const out = {};
const T = await launch({ port: 9455, headless: true });
try {
  await T.boot({ query: '?v=fixacc3' + Date.now(), waitTitle: 15000 });
  await T.eval(`window.__errs=[]; window.addEventListener('error', e=>window.__errs.push(String(e.message||e)));`);
  await T.tap('Enter'); await sleep(350); await T.tap('KeyN'); await sleep(250); await T.tap('Digit1'); await sleep(600);
  out.opening = await T.eval(`(() => {
    const el = document.querySelector('#hud');
    return { state: window.__game.state, dlg: window.__game.dialogue.active, hasStage: !!window.__game.stage,
             hudHidden: !!(el && el.classList.contains('hidden')) };
  })()`);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(110);
  }
  out.afterEnter = await T.eval(`(() => {
    const el = document.querySelector('#hud');
    return { state: window.__game.state, hudHidden: !!(el && el.classList.contains('hidden')),
             power: window.__game.stage && window.__game.stage.hudState.power };
  })()`);

  // ② 死亡坠落：stage1 中段平地（远离 Boss 触发点）
  await T.eval(`(() => { const st = window.__game.stage, p = st.player;
    p.x = 5200; p.y = 120; p.vx = 0; p.vy = 0; p.onGround = false; p.alive = true; p.hearts = 3; })()`);
  await sleep(900);
  const stand = await T.eval(`(() => { const p = window.__game.stage.player; return { x:+p.x.toFixed(1), y:+p.y.toFixed(1), ground:p.onGround, alive:p.alive }; })()`);
  await T.eval('window.__game.stage.player.die()');
  const fall = [];
  for (let i = 0; i < 4; i++) {
    await sleep(260);
    fall.push(await T.eval(`(() => { const p = window.__game.stage.player; return { alive:p.alive, y:+p.y.toFixed(1), vy:+p.vy.toFixed(0), ground:p.onGround, levelH: window.__game.stage.level.h }; })()`));
  }
  out.deathFall = { stand, fall, standY: stand.y };
  await T.shot('_pt/lead_fix/death_ground.png');
  console.log(JSON.stringify(out, null, 1));
} finally { await T.close().catch(() => {}); }

const S = await launch({ port: 9456, headless: true });
try {
  await S.boot({ query: '?v=setacc3' + Date.now(), waitTitle: 15000 });
  await S.tap('KeyS'); await sleep(600);          // 标题页直接按 S 进设置
  const read = `(() => {
    const rows = [...document.querySelectorAll('#overlay .btn')].filter(b => !b.classList.contains('info'));
    const i = window.__game.menuIndex;
    return { state: window.__game.state, page: window.__game._page, idx: i, n: rows.length,
             selText: rows[i] ? rows[i].innerText.replace(/\\s+/g, ' ').trim().slice(0, 40) : null };
  })()`;
  const first = await S.eval(read);
  await S.tap('ArrowDown'); await S.tap('ArrowDown'); await sleep(250);
  const nav = await S.eval(read);
  await S.tap('Escape'); await sleep(450);
  const backState = await S.eval('({ state: window.__game.state, page: window.__game._page })');
  await S.tap('KeyS'); await sleep(500);
  const reenter = await S.eval(read);
  out.settings = { first, nav, backState, reenter };
  await S.shot('_pt/lead_fix/settings3.png');
  console.log(JSON.stringify({ settings: out.settings }, null, 1));
} finally { await S.close().catch(() => {}); }
