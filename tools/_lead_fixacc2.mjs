// 第二轮验收：①对话期 HUD 数值 ②死亡坠落停在地面 ③设置页光标往返保持
import { launch, sleep } from './_pt_core.mjs';

const out = {};
const waitPlay = async (T, tries = 90) => {
  for (let i = 0; i < tries; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) return true;
    if (s.s !== 'play' && s.s !== 'clear') await T.tap('Enter');
    await sleep(120);
  }
  return false;
};

const T = await launch({ port: 9451, headless: true });
try {
  await T.boot({ query: '?v=fixacc2' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(400);          // 标题 → 难度
  await T.tap('KeyN'); await sleep(300);            // 难度 → 自机
  await T.tap('Digit1'); await sleep(500);          // 自机 → 开场对话
  const hudDuring = await T.eval(`(() => {
    const el = document.querySelector('#hud');
    return { state: window.__game.state, dlg: window.__game.dialogue.active,
             hudHidden: !!(el && el.classList.contains('hidden')),
             text: el ? el.innerText.replace(/\\s+/g, ' ').slice(0, 90) : null };
  })()`);
  out.dialogueHud = hudDuring;
  const ok = await waitPlay(T);
  out.reachedPlay = ok;

  // ② 死亡坠落：stage6 Boss 场地面
  await T.eval('window.__game._warpToStage(6)');
  await sleep(1000);
  out.warpPlay = await waitPlay(T);
  const prep = await T.eval(`(() => {
    const g = window.__game, st = g.stage, p = st.player;
    p.x = st.level.w - 500; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = false; p.alive = true; p.hearts = 3;
    return { x: p.x, levelH: st.level.h, levelW: st.level.w };
  })()`);
  await sleep(1500);
  const landed = await T.eval(`(() => { const p = window.__game.stage.player; return { y: +p.y.toFixed(1), ground: p.onGround, hearts: p.hearts }; })()`);
  await T.eval(`(() => { const p = window.__game.stage.player; p.die(); })()`);
  await sleep(420);
  const corpse = await T.eval(`(() => { const p = window.__game.stage.player; return { alive: p.alive, y: +p.y.toFixed(1), vy: +p.vy.toFixed(0), ground: p.onGround, levelH: window.__game.stage.level.h }; })()`);
  await sleep(700);
  const corpse2 = await T.eval(`(() => { const p = window.__game.stage.player; return { alive: p.alive, y: +p.y.toFixed(1), vy: +p.vy.toFixed(0), ground: p.onGround }; })()`);
  out.deathFall = { prep, landed, corpse, corpse2 };
  await T.shot('_pt/lead_fix/death_ground.png');
} finally { await T.close().catch(() => {}); }

const S = await launch({ port: 9452, headless: true });
try {
  await S.boot({ query: '?v=setacc2' + Date.now(), waitTitle: 15000 });
  await S.tap('Enter'); await sleep(400);
  await S.tap('KeyS'); await sleep(500);
  const read = `(() => {
    const rows = [...document.querySelectorAll('#overlay .btn')].filter(b => !b.classList.contains('info'));
    const i = window.__game.menuIndex;
    return { idx: i, n: rows.length, selText: rows[i] ? rows[i].innerText.replace(/\\s+/g, ' ').trim() : null };
  })()`;
  const first = await S.eval(read);
  await S.tap('ArrowDown'); await S.tap('ArrowDown'); await sleep(250);
  const nav = await S.eval(read);
  await S.tap('Escape'); await sleep(450);
  const backState = await S.eval('({ state: window.__game.state, page: window.__game._page })');
  await S.tap('KeyS'); await sleep(500);
  const reenter = await S.eval(read);
  out.settings = { first, nav, backState, reenter };
  await S.shot('_pt/lead_fix/settings2.png');
} finally { await S.close().catch(() => {}); }

console.log(JSON.stringify(out, null, 1));
