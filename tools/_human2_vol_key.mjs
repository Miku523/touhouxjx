import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9635, headless: true });
await T.boot();
const L = [];
const volTxt = () => T.eval(`(() => { const ov = document.getElementById('overlay'); const bs = [...ov.querySelectorAll('.btn')]; const i = bs.findIndex(b => b.classList.contains('sel'));
  const vb = bs.find(b => b.innerText.includes('音乐音量')); return { sel: i, selTxt: bs[i] && bs[i].innerText.replace(/\\s+/g,' ').trim().slice(0,20), vol: vb && vb.innerText.replace(/\\s+/g,' ').trim(), store: (JSON.parse(localStorage.getItem('hks.settings.v1')||'null')||{}).musicVolume }; })()`);

await T.key('KeyS'); await sleep(700);
L.push({ settingsOpen: await volTxt() });
await T.key('ArrowDown'); await sleep(180); await T.key('ArrowDown'); await sleep(350);
L.push({ onVol: await volTxt() });
await T.key('ArrowLeft'); await sleep(350); L.push({ afterLeft1: await volTxt() }); await T.shot('_pt/human2/78_vol_left.png');
await T.key('ArrowLeft'); await sleep(350); L.push({ afterLeft2: await volTxt() });
await T.key('Enter'); await sleep(350); L.push({ afterEnter: await volTxt() });
await T.key('ArrowRight'); await sleep(350); L.push({ afterRight: await volTxt() });
// 还原音量到 80%
for (let i = 0; i < 4; i++) { await T.key('ArrowRight', 30); await sleep(120); }
L.push({ restored: await volTxt() });

// 键位验证：Z(已解绑)/J(副射)/F(新主射) 的子弹
await T.key('Escape'); await sleep(300); await T.key('Escape'); await sleep(400);
await T.key('Enter'); await sleep(600); await T.key('KeyE'); await sleep(400); await T.key('Enter'); await sleep(800);
for (let i = 0; i < 60; i++) { const on = await T.eval(`window.__game.dialogue && window.__game.dialogue.active`); if (!on) break; await T.key('Enter', 40); await sleep(170); }
await sleep(1500);
const pc = () => T.eval(`(() => { const st = window.__game.stage; if (!st) return null; const p = st.bullets.pool.filter(b => b.active);
  return { total: p.length, right: p.filter(b => b.vx > 0).length, left: p.filter(b => b.vx < 0).length, x: Math.round(st.player.x), st: window.__game.state }; })()`);
L.push({ idle: await pc() });
await T.keyDown('KeyZ', 0); await sleep(650); await T.keyUp('KeyZ'); await sleep(80); L.push({ afterZ: await pc() });
await sleep(1200); L.push({ idle2: await pc() });
await T.keyDown('KeyJ', 0); await sleep(650); await T.keyUp('KeyJ'); await sleep(80); L.push({ afterJ: await pc() });
await sleep(1200);
await T.keyDown('KeyF', 0); await sleep(650); await T.keyUp('KeyF'); await sleep(80); L.push({ afterF: await pc() });
await T.shot('_pt/human2/79_shoot_F_check.png');
console.log(JSON.stringify(L, null, 1));
await T.close();
