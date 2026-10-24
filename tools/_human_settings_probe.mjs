import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9610, headless: true });
await T.boot();
await T.key('KeyS');
await sleep(900);
await T.shot('_pt/human/10_settings.png');
const s = await T.eval(`(() => {
  const ov = document.getElementById('overlay');
  return { state: window.__game.state, text: ov.innerText.slice(0, 2500),
    btns: Array.from(ov.querySelectorAll('.btn')).map((b, i) => ({ i, t: b.innerText.replace(/\\s+/g,' ').slice(0,80), sel: b.classList.contains('sel'), spec: b._spec ? { key: b._spec.key, adjust: b._spec.adjust, onPick: !!b._spec.onPick, back: b._spec.back } : null })),
    settings: JSON.parse(localStorage.getItem('hks.settings.v1') || 'null'),
    bands: JSON.parse(localStorage.getItem('hks.keybinds.v1') || 'null') };
})()`);
console.log(JSON.stringify(s, null, 1));
await T.close();
