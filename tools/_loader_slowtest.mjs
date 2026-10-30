import { launch, sleep, BASE } from './_pt_core.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '_pt/loader_fix';
mkdirSync(OUT, { recursive: true });
const out = [];
const t0 = Date.now();

async function probe(T) {
  return T.eval(
    '(function(){' +
    'var ready = document.documentElement.classList.contains(\"hks-ready\");' +
    'var kids = Array.prototype.map.call(document.querySelectorAll(\"#ui > *\"), function(el){ return { id: el.id || el.className || el.tagName, disp: getComputedStyle(el).display }; });' +
    'var bad = [];' +
    'if (!ready) { kids.forEach(function(k){ if (k.id !== \"boot\" && k.disp !== \"none\") bad.push(k.id + \"=\" + k.disp); }); }' +
    'var p = document.getElementById(\"hks-boot-error\");' +
    'var h = document.getElementById(\"hks-boot-hint\");' +
    'var b = document.getElementById(\"boot\");' +
    'var g = document.getElementById(\"game\");' +
    'return { ready: ready, cls: document.documentElement.className, bad: bad,' +
    ' panelTitle: p ? ((p.querySelector(\"div div\") || {}).textContent || \"\").slice(0,30) : null,' +
    ' hint: h ? (h.textContent||\"\") : \"\", bootDisp: b ? getComputedStyle(b).display : \"none\",' +
    ' canvasW: g ? g.width : 0, state: window.__game ? window.__game.state : null,' +
    ' st: (window.__hksBootState && window.__hksBootState()) || null };' +
    '})()'
  );
}

function brief(p) {
  var st = p.st || {};
  return { t: Math.round((Date.now() - t0) / 1000), ready: p.ready, bad: p.bad, panel: p.panelTitle, hint: p.hint, boot: p.bootDisp, state: p.state, css: st.cssReady, ui: st.uiReady };
}

// S: 弱网 45KB/s + 500ms RTT 冷加载
{
  const T = await launch({ port: 9484 });
  await T.eval('1');
  await T.send('Network.setCacheDisabled', { cacheDisabled: true });
  await T.send('Network.emulateNetworkConditions', { offline: false, latency: 500, downloadThroughput: 45 * 1024, uploadThroughput: 20 * 1024, connectionType: 'cellular3g' });
  const s0 = Date.now();
  await T.nav(BASE + '/index.html');
  const marks = [3, 8, 12, 16, 20, 25, 30, 40, 50, 65, 80, 100, 120];
  const shots = [8, 16, 25, 40, 65];
  const samples = [];
  let violation = null;
  for (const m of marks) {
    const wait = (s0 + m * 1000) - Date.now();
    if (wait > 0) await sleep(wait);
    if (Date.now() - s0 > 130000) break;
    const p = await probe(T);
    const b = brief(p); b.t = m; samples.push(b);
    if (p.bad.length && !violation) violation = { t: m, bad: p.bad };
    if (shots.indexOf(m) >= 0) await T.shot(OUT + '/S_t' + m + '.png');
    const done = p.ready && p.state === 'menu';
    if (done) { samples.push({ t: m, note: 'menu-ready' }); break; }
  }
  const rep = await T.report();
  out.push({ test: 'S slow3g cold', samples: samples, violation: violation, errors: rep.errors.slice(0, 5), netFails: rep.netFails.slice(0, 8).map(function (f) { return f.url.split('/').pop() + ' ' + f.err; }) });
  await T.close();
}

// J: 屏蔽主脚本 -> 30s 应出现 js 面板
{
  const T = await launch({ port: 9485 });
  await T.eval('1');
  await T.send('Network.setBlockedURLs', { urls: ['*src/main.js*'] });
  await T.nav(BASE + '/index.html');
  const js0 = Date.now();
  const samples = [];
  let violation = null;
  for (const m of [2, 6, 26, 31, 33]) {
    const wait = (js0 + m * 1000) - Date.now();
    if (wait > 0) await sleep(wait);
    const p = await probe(T);
    const b = brief(p); b.t = m; samples.push(b);
    if (p.bad.length && !violation) violation = { t: m, bad: p.bad };
    if (m === 6 || m === 31) await T.shot(OUT + '/J_t' + m + '.png');
  }
  await T.send('Network.setBlockedURLs', { urls: [] });
  await T.nav(BASE + '/index.html');
  const okMenu = await T.waitFor('window.__game && window.__game.state === "menu"', 25000);
  const p2 = await probe(T);
  out.push({ test: 'J main.js blocked', samples: samples, violation: violation, recoveredMenu: okMenu, after: brief(p2) });
  await T.close();
}

writeFileSync('tools/reports/loader_slow_js.json', JSON.stringify(out, null, 1));
for (const r of out) console.log(JSON.stringify(r));
console.log('DONE');
