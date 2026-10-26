import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9373;
const profile = mkdtempSync(join(tmpdir(), 'edge-chain2-'));
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
await send('Page.navigate', { url: 'http://127.0.0.1:8137/index.html?p=' + Date.now() });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
for (let i = 0; i < 120; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await ev('(() => { window.__game._startExtraStage(); return 1; })()');
for (let i = 0; i < 24; i++) {
  const st = await ev(`(() => {
    const g = window.__game, s = g.stage, d = g.dialogue;
    const before = { gs: g.state, ss: s && s.state, dlg: !!(d && d.active), line: d && d.cur ? d.cur.text : null, chain: s && s.chainIdx, boss: s && s.boss ? s.boss.key : null, cw: s && s.chainWaiting };
    if (d && d.active) { d.advance(); }
    for (let k = 0; k < 40; k++) g.update(1/60);
    return before;
  })()`);
  console.log(i, JSON.stringify(st));
  await sleep(120);
}
ws.close(); proc.kill(); await sleep(200); process.exit(0);
