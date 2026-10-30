/** Probe: keybind page navigation, click-capture, real keydown. Port 9458. */
import { sleep } from './_pt_core.mjs';
import { bootGame, mk } from './_x_qa_lib.mjs';
import fs from 'node:fs';
const PORT = 9458;
const { add, save } = mk([]);
const log = [];
const L = (s) => { log.push(s); console.log('[probe]', s); };
const { T, bootDone } = await bootGame(PORT);
add('boot', bootDone);
const ev = (x) => T.eval(x);
const wait = (x, ms) => T.waitFor(x, ms);
const rd = () => ev('(() => { const g = window.__game; const rows = [...document.querySelectorAll("#overlay .set-row")]; const sel = document.querySelector("#overlay .set-row.sel, #overlay .sel"); return { idx: g._keybindIndex, cap: g._captureAction, selText: sel ? sel.textContent.replace(/\\s+/g," ").trim() : null, rows: rows.map(r => r.textContent.replace(/\\s+/g," ").trim()), choose: g._panel && g._panel.choose ? g._panel.choose : null }; })()');
try {
  await T.key('KeyS'); await sleep(300);
  await T.key('KeyK'); await sleep(400);
  L('open ' + JSON.stringify(await rd()));
  await T.key('ArrowDown'); await sleep(250);
  L('down1 ' + JSON.stringify(await rd()));
  await T.key('ArrowDown'); await sleep(250);
  L('down2 ' + JSON.stringify(await rd()));
  /* click shoot row directly (DOM) */
  const clicked = await ev('(() => { const rows = [...document.querySelectorAll("#overlay .set-row")]; const i = rows.findIndex(r => /射击/.test(r.textContent)); if (i < 0) return null; rows[i].click(); return i; })()');
  await sleep(400);
  L('afterClick ' + JSON.stringify({ clicked, ...(await rd()) }));
  await T.key('KeyV'); await sleep(350);
  const label = await ev('window.__game.input.labelFor("shoot")');
  const amap = await ev('(() => { const i = window.__game.input; return { v: i.actionOf("KeyV"), z: i.actionOf("KeyZ") }; })()');
  L('bound ' + JSON.stringify({ label, amap }));
  add('probe.boundV', label === 'V / J', { label, amap });
  /* ESC to settings, ESC to title; start run */
  await T.key('Escape'); await sleep(300); await T.key('Escape'); await sleep(400);
  let st = await ev('window.__game.state'); const pg = await ev('window.__game._page');
  add('probe.backTitle', st === 'menu', { st, pg });
  await T.key('Enter'); await sleep(250); await T.key('KeyN'); await sleep(250); await T.key('Digit1'); await sleep(300);
  const pr = await T.waitFor("window.__game.state === 'play' && !!window.__game.stage", 25000);
  for (let i = 0; i < 60; i++) { if (await ev("window.__game.state === 'play'")) break; if (await ev('!!(window.__game.dialogue && window.__game.dialogue.active)')) { await T.key('Enter'); } await sleep(120); }
  add('probe.play', await ev("window.__game.state === 'play'"), { pr });
  await ev('(() => { const p = window.__game.stage.player; p.invuln = 999; return true; })()');
  const count = () => ev('(() => { const s = window.__game.stage; return s && s.shots && s.shots.pool ? s.shots.pool.filter((b) => b.active).length : -1; })()');
  const base = await count();
  await T.keyDown('KeyV'); await sleep(500); const nV = await count(); await T.keyUp('KeyV'); await sleep(400);
  const mid = await count();
  await T.keyDown('KeyZ'); await sleep(500); const nZ = await count(); await T.keyUp('KeyZ'); await sleep(400);
  L('shots ' + JSON.stringify({ base, nV, mid, nZ }));
  add('probe.vShoots', nV > base, { base, nV });
  add('probe.zInactive', nZ <= mid, { mid, nZ });
  await T.shot('tools/shots/_qa_player/e2b_v_shoots.png');
} catch (e) { L('EXC ' + String(e && e.stack || e)); add('probe.exception', false, String(e && e.stack || e)); }
const rep = await T.report();
add('probe.noJsErrors', (rep.errors || []).filter(e => !/ERR_CONNECTION_REFUSED|Failed to load resource|net::ERR_/.test(String(e))).length === 0, (rep.errors || []).slice(0,4));
const { out, json } = save('tools/reports/_runner/qa_probe_keys.log', { log });
fs.writeFileSync('tools/reports/_runner/qa_probe_keys.json', json);
console.log('[probe-keys] ' + JSON.stringify({ checks: out.checks.length, failed: out.failed.map(f => f.name + ':' + JSON.stringify(f.extra)) }));
try { await T.close(); } catch (e) {}
process.exit(0);
