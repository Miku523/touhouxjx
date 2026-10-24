// 本轮修复的验收：①死亡坠落不再穿地 ②对话中 HUD 数值已接上 ③设置页残机显示数字 ④设置页返回光标保持 ⑤小窗口 HUD 字号下限
import { launch, sleep } from './_pt_core.mjs';

const out = {};
const T = await launch({ port: 9447, headless: true });
try {
  await T.boot({ query: '?v=fixacc' + Date.now(), waitTitle: 15000 });
  await T.tap('Enter'); await sleep(400);
  // 对话中 HUD 是否已经显示 16/64（P2-4）
  const hudDuring = await T.eval(`(() => {
    const el = document.querySelector('#hud');
    return { state: window.__game.state, dlg: window.__game.dialogue.active, text: el ? el.innerText.replace(/\\s+/g, ' ').slice(0, 120) : null };
  })()`);
  out.dialogueHud = hudDuring;

  await T.tap('KeyN'); await sleep(250);
  await T.tap('Digit1'); await sleep(350);
  for (let i = 0; i < 80; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(120);
  }

  // ①死亡坠落：把玩家放到 Boss 场（stage6 尾段地面）后打死，等 1.2s 看是否落回地面而不是穿到底图外
  await T.eval(`(() => { const g = window.__game; g._warpToStage(6); })()`);
  await sleep(900);
  for (let i = 0; i < 40; i++) {
    const s = await T.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await T.tap('Enter'); await sleep(120);
  }
  const groundY = await T.eval(`(() => {
    const p = window.__game.stage.player;
    p.x = window.__game.stage.level.w - 400; p.y = 0; p.vx = 0; p.vy = 0; p.onGround = false;
    return { x: p.x, h: p.h, levelH: window.__game.stage.level.h };
  })()`);
  await sleep(1200);
  const before = await T.eval(`(() => { const p = window.__game.stage.player; return { y: p.y, ground: p.onGround, hearts: p.hearts, lives: p.lives }; })()`);
  await T.eval(`(() => { const p = window.__game.stage.player; p.hearts = 0; p.die(); })()`);
  await sleep(1400);
  const after = await T.eval(`(() => { const p = window.__game.stage.player; return { y: p.y, ground: p.onGround, levelH: window.__game.stage.level.h, state: window.__game.state }; })()`);
  out.deathFall = { groundY, before, after };

  await T.shot('_pt/lead_fix/death_after.png');
} finally { await T.close().catch(() => {}); }

// ③④ 设置页：残机数字 + 光标保持
const S = await launch({ port: 9448, headless: true });
try {
  await S.boot({ query: '?v=setacc' + Date.now(), waitTitle: 15000 });
  await S.tap('Enter'); await sleep(400);
  await S.tap('KeyS'); await sleep(400);
  const set1 = await S.eval(`(() => {
    const rows = [...document.querySelectorAll('.set-row,.set-foot-btn')];
    const i = window.__game.menuIndex;
    return { idx: i, sel: rows[i] ? rows[i].innerText.replace(/\\s+/g, ' ').trim() : null, livesRow: (document.querySelector('.set-row') ? [...document.querySelectorAll('.set-row')].map(r => r.innerText.replace(/\\s+/g,' ').trim()).find(t => t.startsWith('残机')) : null) };
  })()`);
  await S.tap('ArrowDown'); await S.tap('ArrowDown'); await sleep(250);
  const beforeEsc = await S.eval('window.__game.menuIndex');
  await S.tap('Escape'); await sleep(350);
  await S.tap('KeyS'); await sleep(350);
  const afterEsc = await S.eval('window.__game.menuIndex');
  out.settings = { set1, beforeEsc, afterEsc };
  await S.shot('_pt/lead_fix/settings.png');
} finally { await S.close().catch(() => {}); }

// ⑤ 小窗口 HUD 字号
const W = await launch({ port: 9449, headless: true, width: 900, height: 600 });
try {
  await W.boot({ query: '?v=smallhud' + Date.now(), waitTitle: 15000 });
  await W.tap('Enter'); await sleep(350); await W.tap('KeyN'); await sleep(250); await W.tap('Digit1'); await sleep(300);
  for (let i = 0; i < 80; i++) {
    const s = await W.eval('({ s: window.__game.state, d: window.__game.dialogue.active })');
    if (s.s === 'play' && !s.d) break;
    await W.tap('Enter'); await sleep(110);
  }
  const fs = await W.eval(`(() => {
    const q = (sel) => { const el = document.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : null; };
    return { scale: getComputedStyle(document.documentElement).getPropertyValue('--s').trim(), sn: q('.sn'), tm: q('.tm'), ss: q('.ss') };
  })()`);
  out.smallHud = fs;
  await W.shot('_pt/lead_fix/small_hud.png');
} finally { await W.close().catch(() => {}); }

console.log(JSON.stringify(out, null, 1));
