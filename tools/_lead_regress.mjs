import { launch, saveJson, makeChecks } from './_pt_core.mjs';
import { mkdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9486);
const OUT = '_pt/lead_regress';
mkdirSync(OUT, { recursive: true });
const T = await launch({ port: PORT, width: 1280, height: 720 });
const checks = makeChecks();
const c = checks.chk, eq = checks.eq;
const t0 = Date.now();
const log = (m) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(1) + 's] ' + m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const st = () => T.eval('({state:window.__game.state,page:window.__game._page||null,hudHidden:document.getElementById("hud").classList.contains("hidden"),overlayHidden:document.getElementById("overlay").classList.contains("hidden")})');

try {
  await T.boot({ timeout: 40000 });
  log('booted ' + JSON.stringify(await st()));
  eq(await T.eval('document.documentElement.classList.contains("hks-ready")'), true, 'hks-ready set');
  eq(await T.eval('document.documentElement.classList.contains("css-ready")'), true, 'css-ready set');
  eq(await T.eval('!!document.getElementById("hks-boot-error")'), false, 'no error panel');
  await sleep(1800);
  eq(await T.eval('getComputedStyle(document.getElementById("boot")).display'), 'none', 'boot hidden after menu');
  const introGone = await T.waitFor('!document.getElementById("overlay").classList.contains("intro")', 9000);
  c(introGone === true, 'title intro finished (class removed)');
  await sleep(300);
  const btnInfo = await T.eval('(function(){var b=document.querySelectorAll("#buttons .btn,#buttons button");var vis=[];for(var i=0;i<b.length;i++){var cs=getComputedStyle(b[i]);vis.push({t:(b[i].textContent||"").trim().slice(0,10),op:Number(cs.opacity)});}return {n:b.length,vis:vis};})()');
  log('buttons ' + JSON.stringify(btnInfo));
  c(btnInfo.n >= 5 && btnInfo.vis.every(v => v.op >= 0.95), 'menu buttons faded in', JSON.stringify(btnInfo.vis));
  await T.shot(OUT + '/1_menu.png');
  await T.key('Enter'); await sleep(700);
  const s1 = await st(); log('after Enter#1 ' + JSON.stringify(s1));
  c(s1.state === 'menu' && !s1.overlayHidden, 'Enter opens difficulty panel');
  await T.shot(OUT + '/2_difficulty.png');
  await T.key('Enter'); await sleep(700);
  const s2 = await st(); log('after Enter#2 ' + JSON.stringify(s2));
  eq(s2.page, 'charselect', 'difficulty confirm opens charselect');
  await T.shot(OUT + '/3_charselect.png');
  await T.key('Enter');
  const dlg = await T.waitFor('window.__game.state === "dialogue"', 8000);
  c(dlg === true, 'pick heroine starts opening dialogue');
  let presses = 0, state = '';
  for (let i = 0; i < 90; i++) { await T.key('Enter'); presses++; await sleep(180); state = await T.eval('window.__game.state'); if (state === 'play') break; }
  log('after ' + presses + ' Enter presses state=' + state);
  eq(state, 'play', 'opening dialogue reaches play');
  await sleep(1200);
  await T.shot(OUT + '/4_play.png');
  const s4 = await st();
  c(s4.hudHidden === false, 'HUD visible in play');
  c(s4.overlayHidden === true, 'menu overlay hidden in play');
  await T.key('Escape'); await sleep(500);
  const ps = await st(); log('pause ' + JSON.stringify(ps));
  eq(ps.state, 'paused', 'Escape pauses');
  await T.shot(OUT + '/5_paused.png');
  await T.key('Escape'); await sleep(500);
  eq(await T.eval('window.__game.state'), 'play', 'Escape resumes');
  await T.shot(OUT + '/6_resumed.png');
  const r = T.report();
  eq((r.errors || []).length, 0, 'no console errors');
  eq((r.httpBad || []).length, 0, 'no http bad');
  eq((r.netFails || []).length, 0, 'no net fails');
  const s = checks.sum();
  saveJson(OUT + '/result.json', { ok: s.fail === 0, pass: s.pass, fail: s.fail, rows: s.rows, errors: r.errors, httpBad: r.httpBad, netFails: r.netFails, btnInfo });
  console.log(JSON.stringify({ ok: s.fail === 0, pass: s.pass, fail: s.fail, failedRows: s.rows.filter(x => !x.ok) }));
} catch (e) {
  console.error('FAIL', e && e.stack || e);
  process.exitCode = 1;
} finally {
  await T.close();
}
