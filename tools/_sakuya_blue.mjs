import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9377;
const profile = mkdtempSync(join(tmpdir(), 'edge-blue-'));
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
await send('Page.navigate', { url: 'http://127.0.0.1:8137/index.html?p=blue' + Date.now() });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
for (let i = 0; i < 120; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await ev('(() => { window.__game._startExtraStage(); return 1; })()');
await sleep(500);
const st = await ev(`(() => {
  const g = window.__game, s = g.stage;
  try { g.dialogue.close(); } catch(e) {}
  g.state = 'play'; s.state = 'play';
  const p = s.player; p.alive = true; p.hearts = 99;
  for (let i = 0; i < 240; i++) { g.update(1/60); p.invuln = 999; p.alive = true; }
  g.render(0);
  return JSON.stringify({ key: s.boss?.key, name: s.boss?.phaseName, hp: s.boss?.hp, bullets: s.bullets?.activeCount });
})()`);
console.log('STATE', st);
await sleep(2600);
await ev("(() => { const g = window.__game, s = g.stage; const p = s.player; p.alive = true; for (let i = 0; i < 90; i++) { g.update(1/60); p.invuln = 999; p.alive = true; } g.render(0); return 1; })()");
await sleep(300);
const sh = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('_sakuya_design/probe-blue.png', Buffer.from(sh.data, 'base64'));
ws.close(); proc.kill(); await sleep(200); process.exit(0);