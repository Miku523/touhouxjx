import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9636, headless: true });
await T.boot();
await T.key('Enter'); await sleep(600); await T.key('KeyE'); await sleep(400); await T.key('Enter'); await sleep(800);
for (let i = 0; i < 60; i++) { const on = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`); if (!on) break; await T.key('Enter', 40); await sleep(170); }
await sleep(1200);
const shots = () => T.eval(`(() => { const st = window.__game.stage; const p = st ? st.shots.pool.filter(b => b.active) : []; return { n: p.length, x: st && Math.round(st.player.x), st: window.__game.state, bind: window.__game.input.actionOf ? { z: window.__game.input.actionOf('KeyZ'), j: window.__game.input.actionOf('KeyJ'), f: window.__game.input.actionOf('KeyF') } : null }; })()`);
const L = { idle: await shots() };
await T.keyDown('KeyZ'); await sleep(650); await T.keyUp('KeyZ'); await sleep(100); L.afterZ = await shots();
await sleep(900);
await T.keyDown('KeyJ'); await sleep(650); await T.keyUp('KeyJ'); await sleep(100); L.afterJ = await shots();
await sleep(900);
await T.keyDown('KeyF'); await sleep(650); await T.keyUp('KeyF'); await sleep(100); L.afterF = await shots();
await T.shot('_pt/human2/79_shoot_F_check.png');
console.log(JSON.stringify(L, null, 1));
await T.close();
