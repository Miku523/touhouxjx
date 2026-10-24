import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9611, headless: true });
await T.boot();
// settings -> keybinds (S then Down x10, Enter)
await T.key('KeyS'); await sleep(700);
for (let i = 0; i < 10; i++) { await T.key('ArrowDown', 40); await sleep(90); }
await T.key('Enter'); await sleep(700);
await T.shot('_pt/human/_kb_probe.png');
const kb = await T.eval(`(() => {
  const ov = document.getElementById('overlay');
  return { state: window.__game.state, text: ov.innerText.slice(0, 2500),
    btns: Array.from(ov.querySelectorAll('.btn')).map((b, i) => ({ i, t: b.innerText.replace(/\\s+/g,' ').slice(0,90), sel: b.classList.contains('sel'), spec: b._spec ? Object.keys(b._spec) : null })),
    kb: JSON.parse(localStorage.getItem('hks.keybinds.v1') || 'null') };
})()`);
console.log('=== KEYBIND ===');
console.log(JSON.stringify(kb, null, 1));
await T.close();
