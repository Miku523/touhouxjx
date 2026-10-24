// 随机按键漫游：在菜单/对话/暂停/结算/游戏中等状态间乱按，检查状态机不变量与 JS 异常。
// 用法：node tools/_lead_fuzzkeys.mjs [port] [iterations]
import { launch, sleep } from './_pt_core.mjs';

const PORT = Number(process.argv[2]) || 9486;
const N = Number(process.argv[3]) || 1200;
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'Space',
  'KeyZ', 'KeyJ', 'KeyX', 'KeyK', 'KeyC', 'ShiftLeft', 'Enter', 'Escape', 'KeyP',
  'KeyR', 'KeyM', 'KeyS', 'KeyQ', 'Digit1', 'Digit2', 'KeyB', 'Slash', 'Delete'];
const STATES = new Set(['menu', 'dialogue', 'play', 'paused', 'gameover', 'clear', 'ending']);
const rand = (n) => Math.floor(Math.random() * n);

const T = await launch({ port: PORT, headless: true, width: 1280, height: 720 });
const bad = [];
const seen = new Map();
let lastErr = '';
try {
  await T.boot({ query: '?v=fuzz' + Date.now(), waitTitle: 20000 });
  await T.eval(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)));`);
  // 进入一局（EASY），让乱按同时覆盖菜单与游戏内
  await T.tap('Enter'); await sleep(300);
  await T.tap('KeyE'); await sleep(250);
  await T.tap('Digit1'); await sleep(400);
  for (let i = 0; i < 40; i++) {
    const d = await T.eval('({ s: window.__game.state, a: window.__game.dialogue.active })');
    if (d.s === 'play' && !d.a) break;
    await T.tap('Enter'); await sleep(110);
  }
  for (let i = 0; i < N; i++) {
    const key = KEYS[rand(KEYS.length)];
    const shift = Math.random() < 0.12 && /^Digit/.test(key);
    try {
      if (shift) await T.keyDown('ShiftLeft');
      await T.keyDown(key);
      await sleep(30 + rand(120));
      await T.keyUp(key);
      if (shift) await T.keyUp('ShiftLeft');
    } catch (e) { lastErr = 'key error: ' + e.message; }
    if (i % 25 === 0) {
      const s = await T.eval(`(() => {
        const g = window.__game, p = g.stage && g.stage.player;
        return {
          state: g.state, page: g._page, inExtra: !!g.inExtra,
          stage: g.stage ? { name: g.stage.name, st: g.stage.state } : null,
          dlg: !!g.dialogue.active, paused: !!g.paused,
          lives: g.lives, continues: g.continues,
          overlay: !!(g.overlay && !g.overlay.classList.contains('hidden')),
          musicRoom: !!document.querySelector('.mr') && !document.querySelector('.mr').classList.contains('hidden'),
          px: p && p.x, py: p && p.y, power: p && p.power,
          errs: window.__errs.slice(-3),
        };
      })()`);
      seen.set(s.state, (seen.get(s.state) || 0) + 1);
      if (!STATES.has(s.state)) bad.push({ i, kind: 'unknown-state', s });
      if (s.state === 'play' && !s.stage) bad.push({ i, kind: 'play-without-stage', s });
      if (s.state === 'play' && s.paused) bad.push({ i, kind: 'play-and-paused', s });
      if (s.state === 'menu' && !s.overlay && !s.dlg && !s.musicRoom) bad.push({ i, kind: 'menu-without-overlay', s });
      if (s.stage && (!Number.isFinite(s.px) || !Number.isFinite(s.py))) bad.push({ i, kind: 'nan-position', s });
      if (s.errs && s.errs.length) { bad.push({ i, kind: 'js-error', s }); await T.eval('window.__errs.length = 0'); }
      if (bad.length > 8) break;
    }
  }
  const finalErrs = await T.eval('window.__errs');
  console.log(JSON.stringify({
    ok: bad.length === 0 && (!finalErrs || !finalErrs.length),
    iterations: N, lastErr,
    statesSeen: Object.fromEntries(seen),
    bad, finalErrs,
  }, null, 2));
} finally {
  await T.close().catch(() => {});
}
