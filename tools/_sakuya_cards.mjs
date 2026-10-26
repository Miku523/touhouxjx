import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9374;
const profile = mkdtempSync(join(tmpdir(), 'edge-cards-'));
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
await send('Page.navigate', { url: 'http://127.0.0.1:8137/index.html?p=cards' + Date.now() });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
for (let i = 0; i < 120; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await ev('(() => { window.__game._startExtraStage(); return 1; })()');
// 等开场对白
let dlgShot = false;
for (let i = 0; i < 40; i++) {
  const d = await ev("(() => { const g = window.__game, d = g.dialogue; return !!(d && d.active); })()");
  if (d) { await sleep(400); const sh = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync('_sakuya_design/dlg-1.png', Buffer.from(sh.data, 'base64')); dlgShot = true; break; }
  await ev('(() => { const g = window.__game; for (let i = 0; i < 30; i++) g.update(1/60); return 1; })()');
  await sleep(120);
}
console.log('dlg shot', dlgShot);
// 关对白，进入战斗
await ev(`(() => { const g = window.__game, s = g.stage; try { g.dialogue.close(); } catch(e) {} g.state='play'; s.state='play'; const b = s.boss; const p = s.player; p.alive=true; p.hearts=99; p.invuln=99999; p.power=128; if (b) { b.invulnerable=false; if (b.state!=='battle') { try { s.beginBoss(); } catch(e) {} } } return b ? b.key : 'none'; })()`);
for (let card = 0; card < 4; card++) {
  const st = await ev(`(() => {
    const g = window.__game, s = g.stage, b = s.boss, p = s.player;
    p.alive = true; p.hearts = 99; p.invuln = 99999;
    for (let i = 0; i < 260; i++) { g.update(1/60); p.invuln = 99999; p.alive = true; }
    g.render(0);
    return JSON.stringify({ card: b ? b.phase : null, name: b ? b.phaseName : null, hp: b ? Math.round(b.hp) : null, max: b ? b.maxHp : null, bullets: s.bullets.activeCount });
  })()`);
  console.log('CARD', card, st);
  const sh = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('_sakuya_design/card-' + (card + 1) + '.png', Buffer.from(sh.data, 'base64'));
  await ev(`(() => { const g = window.__game, s = g.stage, b = s.boss; if (!b) return 0; try { b.damage(b.maxHp * 1.2); } catch(e) {} for (let i = 0; i < 200; i++) { g.update(1/60); const p = s.player; p.alive = true; p.invuln = 99999; } return 1; })()`);
}
ws.close(); proc.kill(); await sleep(200); process.exit(0);
