import { launch, sleep } from './_pt_core.mjs';
const T = await launch({ port: 9613, headless: true });
const press = async (code, hold = 90) => { await T.key(code, hold); await sleep(120 + Math.random() * 130); };
await T.boot();
// quality quick test
await T.key('KeyS', 100); await sleep(800);
for (let i = 0; i < 5; i++) await press('ArrowDown');
await press('ArrowRight'); await sleep(300);
console.log('Q_AFTER_RIGHT', await T.eval(`JSON.stringify(JSON.parse(localStorage.getItem('hks.settings.v1')||'{}').quality)`), await T.eval(`document.querySelector('#overlay .btn.sel')?.innerHTML.replace(/<[^>]+>/g,'|').replace(/\\s+/g,' ').slice(0,200)`));
await T.shot('_pt/human/_quality_probe.png');
await press('ArrowRight'); await sleep(200);
await press('ArrowRight'); await sleep(200);
console.log('Q_AFTER_3', await T.eval(`JSON.stringify(JSON.parse(localStorage.getItem('hks.settings.v1')||'{}').quality)`));
await press('ArrowLeft'); await sleep(200); // back auto
console.log('Q_FINAL', await T.eval(`JSON.stringify(JSON.parse(localStorage.getItem('hks.settings.v1')||'{}').quality)`));
await T.key('Escape', 100); await sleep(500);
// music room
await T.key('KeyM', 100); await sleep(1200);
await T.shot('_pt/human/20_musicroom.png');
const mr = await T.eval(`(() => {
  const ov = document.getElementById('overlay');
  return { state: window.__game.state, text: ov.innerText.slice(0,2500),
    mr: document.querySelector('.mr-root')?.className || null,
    disc: Array.from(document.querySelectorAll('[class*=mr-]')).slice(0,40).map(e=>({c:e.className,t:(e.innerText||'').replace(/\\s+/g,' ').slice(0,60)})),
    btns: Array.from(ov.querySelectorAll('.btn')).map((b,i)=>({i,t:b.innerText.replace(/\\s+/g,' ').slice(0,60),sel:b.classList.contains('sel')})),
    music: localStorage.getItem('hks.music.v1') };
})()`);
console.log('MR', JSON.stringify(mr, null, 1));
await T.close();
