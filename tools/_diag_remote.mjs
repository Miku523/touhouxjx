
import { launch } from './_pt_core.mjs';
const T = await launch({ port: 9442, headless: true });
await T.nav('https://mikuascendlog.com/touhouxjx/');
const info = await T.eval(`({url:location.href, rs:document.readyState, title:document.title, hasGame:!!document.querySelector('#game'), htmlLen:document.documentElement.outerHTML.length, cssReady:document.documentElement.classList.contains('css-ready'), sheets:[...document.styleSheets].map(s=>s.href), boot:document.querySelector('#boot')?getComputedStyle(document.querySelector('#boot')).display:null, hud:document.querySelector('#hud')?getComputedStyle(document.querySelector('#hud')).display:null})`);
console.log(JSON.stringify(info, null, 1));
const rep = await T.report();
console.log('errors', JSON.stringify(rep.errors).slice(0,800));
console.log('netFails', JSON.stringify(rep.netFails).slice(0,1500));
console.log('httpBad', JSON.stringify(rep.httpBad).slice(0,800));
console.log('resources', JSON.stringify(rep.resources).slice(0,2500));
await T.close();
