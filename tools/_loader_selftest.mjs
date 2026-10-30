import { launch, sleep, BASE } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/loader_fix';
mkdirSync(OUT, { recursive: true });
const results = [];

async function probe(T) {
  return T.eval(
    '(function(){' +
    'var st = (window.__hksBootState && window.__hksBootState()) || null;' +
    'var hud = document.getElementById(\"hud\");' +
    'var kids = Array.prototype.map.call(document.querySelectorAll(\"#ui > *\"), function(el){ return { id: el.id || el.className || el.tagName, disp: getComputedStyle(el).display }; });' +
    'var p = document.getElementById(\"hks-boot-error\");' +
    'var h = document.getElementById(\"hks-boot-hint\");' +
    'var b = document.getElementById(\"boot\");' +
    'return { boot: st, cls: document.documentElement.className,' +
    ' panel: p ? (p.textContent||\"\").replace(/\\s+/g,\" \").slice(0,200) : null,' +
    ' hint: h ? (h.textContent||\"\") : \"\",' +
    ' hudDisp: hud ? getComputedStyle(hud).display : \"n/a\", kids: kids,' +
    ' state: window.__game ? window.__game.state : null,' +
    ' bootDisp: b ? getComputedStyle(b).display : \"none\" };' +
    '})()'
  );
}

function pick(p) {
  return { cls: p.cls, bootDisp: p.bootDisp, state: p.state, panel: p.panel ? p.panel.slice(0, 80) : null, hint: p.hint, hudDisp: p.hudDisp, flags: p.boot && p.boot.flags };
}

// A: 正常加载
{
  const T = await launch({ port: 9481 });
  await T.nav(BASE + '/index.html');
  await sleep(600);
  const a1 = await probe(T); await T.shot(OUT + '/A1_0.6s.png');
  await sleep(1400);
  const a2 = await probe(T); await T.shot(OUT + '/A2_2s.png');
  const okMenu = await T.waitFor('window.__game && window.__game.state === "menu"', 20000);
  const a3 = await probe(T); await T.shot(OUT + '/A3_menu.png');
  const rep = await T.report();
  const styleReqs = (rep.resources || []).filter(function (r) { return /style\.css/.test(r.n); });
  results.push({ test: 'A normal', okMenu: okMenu, a1: pick(a1), a2: pick(a2), a3: pick(a3), styleReqs: styleReqs, errors: rep.errors.slice(0, 6), httpBad: rep.httpBad.slice(0, 6), netFails: rep.netFails.slice(0, 6) });
  await T.close();
}

// B: 屏蔽 style.css
{
  const T = await launch({ port: 9482 });
  await T.eval('1');
  await T.send('Network.setBlockedURLs', { urls: ['*style.css*'] });
  await T.nav(BASE + '/index.html');
  await sleep(800);
  const b1 = await probe(T); await T.shot(OUT + '/B1_blocked_0.8s.png');
  await sleep(3200);
  const b2 = await probe(T); await T.shot(OUT + '/B2_panel.png');
  await T.send('Network.setBlockedURLs', { urls: [] });
  await T.eval('window.__hksRetry ? window.__hksRetry() : "no __hksRetry"');
  await sleep(3500);
  const b3 = await probe(T); await T.shot(OUT + '/B3_recovered.png');
  results.push({ test: 'B css blocked', b1: pick(b1), b2: pick(b2), b3: pick(b3) });
  await T.close();
}

// C: 屏蔽 main.js
{
  const T = await launch({ port: 9483 });
  await T.eval('1');
  await T.send('Network.setBlockedURLs', { urls: ['*src/main.js*'] });
  await T.nav(BASE + '/index.html');
  await sleep(2500);
  const c1 = await probe(T); await T.shot(OUT + '/C1_blockedmain.png');
  await T.send('Network.setBlockedURLs', { urls: [] });
  await T.nav(BASE + '/index.html');
  const okMenu = await T.waitFor('window.__game && window.__game.state === "menu"', 25000);
  const c2 = await probe(T); await T.shot(OUT + '/C2_after_unblock.png');
  results.push({ test: 'C main blocked', c1: pick(c1), okMenu: okMenu, c2: pick(c2) });
  await T.close();
}

writeFileSync('tools/reports/loader_fix_selftest.json', JSON.stringify(results, null, 1));
for (const r of results) console.log(JSON.stringify(r));
console.log('DONE');
