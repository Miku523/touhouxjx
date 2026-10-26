import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9388;
const profile = mkdtempSync(join(tmpdir(), 'edge-ci-'));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--window-size=1280,720',`--remote-debugging-port=${PORT}`,'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let page;
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const l = await r.json(); page = l.find(t => t.type === 'page'); if (page) break; } catch {} await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8137/index.html?p=ci' + Date.now() });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
for (let i = 0; i < 140; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await ev('(() => { window.__game._startExtraStage(); return 1; })()');
await sleep(700);
await ev(`(() => { const g = window.__game, s = g.stage; try { g.dialogue.close(); } catch(e) {} if (s) { s.player.alive = true; s.player.hearts = 99; s.player.invuln = 999; } return 1; })()`);
let seen = false, t0 = 0;
for (let i = 0; i < 260; i++) {
  const st = await ev(`(() => { const el = document.getElementById('spellCutin'); const g = window.__game; try { if (g.dialogue && g.dialogue.el && !g.dialogue.el.classList.contains('hidden')) g.dialogue.close(); } catch(e) {} try { if (g.stage && g.stage.player) { g.stage.player.invuln = 999; g.stage.player.alive = true; } } catch(e) {} return JSON.stringify({ show: !!el && el.classList.contains('show'), boss: !!(g.stage && g.stage.boss), tag: el ? el.querySelector('.sc-tag').textContent : '', name: el ? el.querySelector('.sc-name').textContent : '' }); })()`);
  const o = JSON.parse(st);
  if (o.show) { seen = true; t0 = Date.now(); console.log('CUTIN', st); break; }
  await sleep(60);
}
if (seen) {
  for (const [i, d] of [[1, 120], [2, 380], [3, 760]]) {
    await sleep(d);
    const sh = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`_sakuya_design/cutin-${i}.png`, Buffer.from(sh.data, 'base64'));
  }
}
const info = await ev(`(() => { const el = document.getElementById('spellCutin'); const cs = el ? getComputedStyle(el.querySelector('.sc-rings')) : null; return JSON.stringify({ ringsDisplay: cs ? cs.display : null, bossCls: el ? el.classList.contains('boss') : null, tag: el ? el.querySelector('.sc-tag').textContent : '' }); })()`);
console.log('INFO', info);
ws.close(); proc.kill(); await sleep(200); process.exit(0);
