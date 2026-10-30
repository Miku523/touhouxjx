
import { launch } from './_pt_core.mjs';
const T = await launch({ port: 9444, headless: true, width: 1366, height: 768 });
const t0 = Date.now();
await T.nav('https://mikuascendlog.com/touhouxjx/').catch(e=>console.log('nav err', e.message));
const shots = [[8000,'a_8s'],[15000,'b_15s'],[20000,'c_20s'],[30000,'d_30s'],[60000,'e_60s'],[60000,'f_90s'],[40000,'g_130s']];
for (const [wait,label] of shots) {
  await new Promise(r=>setTimeout(r, wait));
  const s = await T.eval(`({rs:document.readyState, cssReady:document.documentElement.classList.contains('css-ready'), sheets:[...document.styleSheets].map(s=>s.href?1:0), boot:document.querySelector('#boot')?getComputedStyle(document.querySelector('#boot')).display:null, hud:document.querySelector('#hud')?getComputedStyle(document.querySelector('#hud')).display:null, state:(window.__hks&&window.__hks.state)||null, canvasBg:(()=>{const c=document.querySelector('#game'); if(!c) return null; const r=c.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)};})()})`);
  console.log(Math.round((Date.now()-t0)/1000)+'s', label, JSON.stringify(s));
  await T.shot('tools/shots/_blank/remote_' + label + '.png');
}
await T.close();
