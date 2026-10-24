import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9636, headless: true });
await T.boot();
const selTxt = () => T.eval(`(() => { const bs = [...document.querySelectorAll('#overlay .btn')]; const i = bs.findIndex(b => b.classList.contains('sel')); return bs[i] ? bs[i].innerText.replace(/\\s+/g,' ').trim().slice(0,24) : null; })()`);
const pick = async (needle) => {
  for (let i = 0; i < 10; i++) { await T.key('ArrowUp', 30); await sleep(60); }
  for (let i = 0; i < 30; i++) { const t = await selTxt(); if (t && t.includes(needle)) { await T.key('Enter'); await sleep(500); return true; } await T.key('ArrowDown', 30); await sleep(90); }
  return false;
};
await T.key('KeyS'); await sleep(600);
await pick('按键设置');
await pick('射击');
await sleep(300);
await T.key('KeyF'); await sleep(400);
const bindInfo = await T.eval(`({ z: window.__game.input.actionOf('KeyZ'), f: window.__game.input.actionOf('KeyF'), j: window.__game.input.actionOf('KeyJ'), kb: localStorage.getItem('hks.keybinds.v1') })`);
await T.key('Escape'); await sleep(300); await T.key('Escape'); await sleep(400);
await T.key('Enter'); await sleep(600); await T.key('KeyE'); await sleep(400); await T.key('Enter'); await sleep(800);
for (let i = 0; i < 60; i++) { const on = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`); if (!on) break; await T.key('Enter', 40); await sleep(170); }
await sleep(1200);
const shots = () => T.eval(`(() => { const st = window.__game.stage; const p = st ? st.shots.pool.filter(b => b.active) : []; return { n: p.length, x: st && Math.round(st.player.x), st: window.__game.state }; })()`);
const L = { bindInfo, idle: await shots() };
await T.keyDown('KeyZ'); await sleep(650); await T.keyUp('KeyZ'); await sleep(100); L.afterZ = await shots();
await sleep(1000);
await T.keyDown('KeyJ'); await sleep(650); await T.keyUp('KeyJ'); await sleep(100); L.afterJ = await shots();
await sleep(1000);
await T.keyDown('KeyF'); await sleep(650); await T.keyUp('KeyF'); await sleep(100); L.afterF = await shots();
await T.shot('_pt/human2/80_shoot_rebound_F.png');
console.log(JSON.stringify(L, null, 1));
await T.close();
