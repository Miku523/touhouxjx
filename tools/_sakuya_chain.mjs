// EXTRA 连环战流程验证：依次强杀每场 Boss，确认顺序 咲夜→蕾米→咲夜→芙兰，并截一张对话图
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1280, H = 720;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9372;
const profile = mkdtempSync(join(tmpdir(), 'edge-chain-'));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,`--window-size=${W},${H}`,`--remote-debugging-port=${PORT}`,'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getTarget() {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const l = await r.json(); const p = l.find(t => t.type === 'page'); if (p) return p; } catch {} await sleep(250); }
  throw new Error('no target');
}
const page = await getTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:8137/index.html?probe=chain${Date.now()}` });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value; };
for (let i = 0; i < 120; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
await ev(`(() => { const g = window.__game; g._startExtraStage(); return 1; })()`);

const log = [];
let shotDone = false;
for (let step = 0; step < 90; step++) {
  const st = await ev(`(() => {
    const g = window.__game; const s = g.stage; if (!s) return { e: 'nos' };
    const dlg = g.dialogue;
    if (dlg && dlg.active) { return { dlg: true, who: dlg.cur && dlg.cur.who }; }
    for (let i = 0; i < 30; i++) g.update(1/60);
    const b = s.boss;
    if (b) { try { b.damage(b.maxHp * 2); } catch(e) {} }
    for (let i = 0; i < 90; i++) g.update(1/60);
    return { chain: s.chainIdx, key: b ? b.key : null, state: b ? b.state : null, hp: b ? Math.round(b.hp) : null, chainWaiting: !!s.chainWaiting };
  })()`);
  if (st.dlg) {
    if (!shotDone) { shotDone = true; await sleep(300); const sh = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync('_sakuya_design/probe-dialogue.png', Buffer.from(sh.data, 'base64')); }
    await ev(`(() => { const g = window.__game; for (let i = 0; i < 6; i++) { try { g.dialogue.advance(); } catch(e) {} } return 1; })()`);
    log.push('dialogue step, who=' + st.who);
    continue;
  }
  log.push(JSON.stringify(st));
  if (st.e) break;
  await ev(`(() => { const g = window.__game; for (let i = 0; i < 120; i++) g.update(1/60); return 1; })()`);
}
const tail = log.slice(-14).join('\n');
console.log('LOG tail:\n' + tail);
ws.close(); proc.kill(); await sleep(300); process.exit(0);
