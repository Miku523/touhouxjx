import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9391;
const profile = mkdtempSync(join(tmpdir(), 'edge-ci2-'));
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
await send('Page.navigate', { url: 'http://127.0.0.1:8137/index.html?p=ci2' + Date.now() });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
for (let i = 0; i < 200; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
// 等 boot 结束
for (let i = 0; i < 200; i++) { const hidden = await ev("(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('hidden') || getComputedStyle(b).opacity === '0' || getComputedStyle(b).display === 'none' || getComputedStyle(b).visibility === 'hidden'; })()"); if (hidden) break; await sleep(200); }
await sleep(1200);
await ev('(() => { window.__game._startExtraStage(); return 1; })()');
await sleep(2500);
await ev(`(() => { const g = window.__game; try { g.dialogue.close(); } catch(e) {} const s = g.stage; if (s) { s.player.alive = true; s.player.hearts = 99; s.player.invuln = 999; } return 1; })()`);
await sleep(3000);
const pre = await ev("(() => { const g = window.__game; return JSON.stringify({ hasCutin: !!g.cutin, boss: g.stage && g.stage.boss && g.stage.boss.key, boot: (() => { const b = document.getElementById('boot'); return b ? getComputedStyle(b).display + '/' + getComputedStyle(b).opacity : 'none'; })() }); })()");
console.log('PRE', pre);
// 直接触发一次，验证视觉
const fired = await ev("(() => { return window.__game.cutin.showBoss('sakuya'); })()");
console.log('FIRED', fired);
for (const [i, d] of [[1, 150], [2, 280], [3, 320]]) {
  await sleep(d);
  const sh = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`_sakuya_design/cutin2-${i}.png`, Buffer.from(sh.data, 'base64'));
}
const post = await ev("(() => { const el = document.getElementById('spellCutin'); const cv = document.getElementById('scPortrait'); const c = cv.getContext('2d'); const d = c.getImageData(0,0,cv.width,cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 0) n++; return JSON.stringify({ show: el.classList.contains('show'), boss: el.classList.contains('boss'), tag: el.querySelector('.sc-tag').textContent, name: el.querySelector('.sc-name').textContent, sub: el.querySelector('.sc-sub').textContent, portraitPixels: n, clearOpacity: getComputedStyle(el.querySelector('.sc-clear')).opacity }); })()");
console.log('POST', post);
ws.close(); proc.kill(); await sleep(200); process.exit(0);
