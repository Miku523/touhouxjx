// 复现「别人电脑上紫屏/空画面」：分场景渲染对照（harness 放仓库根，相对路径才对）
import { launch, sleep, BASE } from './_pt_core.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'tools/shots/_blank';
mkdirSync(OUT, { recursive: true });

const src = readFileSync('index.html', 'utf8');
let noCss = src.replace(/\s*<link rel="stylesheet"[^>]*>/g, '');
writeFileSync('_diag_nocss.html', noCss, 'utf8');
let noCssNoJs = noCss.replace(/<script type="module"[^>]*><\/script>/, '');
writeFileSync('_diag_nocss_nojs.html', noCssNoJs, 'utf8');
let noJs = src.replace(/<script type="module"[^>]*><\/script>/, '');
writeFileSync('_diag_nojs.html', noJs, 'utf8');

const T = await launch({ port: 9441, width: 1280, height: 720 });
const shot = async (name) => { await T.shot(OUT + '/' + name + '.png'); return name; };

// 1) 基线：标题
await T.nav(BASE + '/index.html?nosw=1');
await T.waitFor('!!window.__game', 20000);
await sleep(1200);
await shot('01_baseline_title');
console.log('title', await T.eval("JSON.stringify({state: window.__game.state, cssReady: document.documentElement.classList.contains('css-ready'), boot: getComputedStyle(document.getElementById('boot')).display})"));

// 2) 基线：进关（Enter 开始 → Enter 选难度 → 等进关）
await T.key('Enter'); await sleep(600);
console.log('after1', await T.eval("JSON.stringify({state: window.__game.state, panel: document.querySelector('#overlay .panel-title')?.textContent || ''})"));
await T.key('Enter'); await sleep(700);
console.log('after2', await T.eval("JSON.stringify({state: window.__game.state, panel: document.querySelector('#overlay .panel-title')?.textContent || ''})"));
await T.key('Enter'); await sleep(2500);
await T.shot(OUT + '/02_baseline_stage.png');
console.log('stage', await T.eval("JSON.stringify({state: window.__game.state, hud: document.getElementById('hud').className, timer: document.getElementById('timer').textContent, stage: document.getElementById('stageName').textContent})"));

// 3) CSS 失败但 JS 正常
await T.nav(BASE + '/_diag_nocss.html?nosw=1');
await sleep(9000);
await T.shot(OUT + '/03_nocss_js_ok.png');
console.log('nocss', await T.eval("JSON.stringify({cssReady: document.documentElement.classList.contains('css-ready'), boot: getComputedStyle(document.getElementById('boot')).display, hud: getComputedStyle(document.getElementById('hud')).display, canvas: (()=>{const c=document.getElementById('game');const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})(), scrollH: document.documentElement.scrollHeight, innerH: innerHeight})"));

// 4) CSS + JS 都失败
await T.nav(BASE + '/_diag_nocss_nojs.html?nosw=1');
await sleep(9000);
await T.shot(OUT + '/04_nocss_nojs.png');
console.log('nocssnojs', await T.eval("JSON.stringify({cssReady: document.documentElement.classList.contains('css-ready'), boot: getComputedStyle(document.getElementById('boot')).display, hud: getComputedStyle(document.getElementById('hud')).display, scrollH: document.documentElement.scrollHeight})"));

// 5) JS 失败、CSS 正常
await T.nav(BASE + '/_diag_nojs.html?nosw=1');
await sleep(9000);
await T.shot(OUT + '/05_css_ok_nojs.png');
console.log('nojs', await T.eval("JSON.stringify({cssReady: document.documentElement.classList.contains('css-ready'), boot: getComputedStyle(document.getElementById('boot')).display, scrollH: document.documentElement.scrollHeight})"));

// 6) 线上站点真实访问
await T.clearCollection();
await T.nav('https://mikuascendlog.com/touhouxjx/');
await sleep(12000);
await T.shot(OUT + '/06_deployed_fresh.png');
const rep = await T.report();
const dep = await T.eval("JSON.stringify({hasGame: !!window.__game, cssReady: document.documentElement.classList.contains('css-ready'), boot: getComputedStyle(document.getElementById('boot')).display, state: window.__game?.state, hud: document.getElementById('hud').className, sw: !!navigator.serviceWorker.controller})").catch(e=>String(e));
console.log('deployed', dep);
console.log('DEPLOYED REPORT', JSON.stringify({errors: rep.errors.slice(0,15), httpBad: rep.httpBad.slice(0,15), netFails: rep.netFails.slice(0,15)}).slice(0,6000));
await T.close();
