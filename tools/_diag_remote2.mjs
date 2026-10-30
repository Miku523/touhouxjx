
import { launch } from './_pt_core.mjs';
const T = await launch({ port: 9443, headless: true });
const t0 = Date.now();
await T.send('Network.enable', {});
await T.nav('https://mikuascendlog.com/touhouxjx/').catch(e=>console.log('nav err', e.message));
const poll = async (label) => {
  const s = await T.eval(`({rs:document.readyState, game:!!document.querySelector('#game'), cssReady:document.documentElement.classList.contains('css-ready'), sheets:[...document.styleSheets].map(s=>s.href), boot:document.querySelector('#boot')?getComputedStyle(document.querySelector('#boot')).display:null, hud:document.querySelector('#hud')?getComputedStyle(document.querySelector('#hud')).display:null, state:(window.__hks&&window.__hks.state)||null, res:performance.getEntriesByType('resource').length, transfer:performance.getEntriesByType('resource').reduce((a,b)=>a+(b.transferSize||0),0), nav:performance.getEntriesByType('navigation').map(n=>({dur:Math.round(n.duration),dom:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd)}))[0]})`);
  console.log(label, Math.round((Date.now()-t0)/1000)+'s', JSON.stringify(s));
};
for (const wait of [5000, 15000, 30000, 30000, 30000]) {
  await new Promise(r=>setTimeout(r, wait));
  await poll('poll');
}
await T.shot('tools/shots/_blank/remote_after_110s.png');
const rep = await T.report();
console.log('errors', JSON.stringify(rep.errors).slice(0,1500));
console.log('netFails', JSON.stringify(rep.netFails).slice(0,2000));
console.log('httpBad', JSON.stringify(rep.httpBad).slice(0,800));
await T.close();
