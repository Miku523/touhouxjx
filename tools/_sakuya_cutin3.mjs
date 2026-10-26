import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9394;
const profile = mkdtempSync(join(tmpdir(), 'edge-ci3-'));
const proc = spawn(EDGE, ['--headless=new','--disable-gpu','--hide-scrollbars','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--window-size=1280,720',`--remote-debugging-port=${PORT}`,'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let page;
for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const l = await r.json(); page = l.find(t => t.type === 'page'); if (page) break; } catch {} await sleep(250); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description).join(' ').slice(0, 200)); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:8137/index.html?p=ci3' + Date.now() });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result?.value; };
for (let i = 0; i < 200; i++) { if (await ev('!!window.__game')) break; await sleep(150); }
for (let i = 0; i < 200; i++) { const hidden = await ev("(() => { const b = document.getElementById('boot'); return !b || b.classList.contains('hidden') || getComputedStyle(b).opacity === '0' || getComputedStyle(b).display === 'none' || getComputedStyle(b).visibility === 'hidden'; })()"); if (hidden) break; await sleep(200); }
await sleep(1500);
// A) 玩家符卡演出回归：boss 类要被摘掉、tag 回到 SPELL CARD
const a = await ev("(() => { const g = window.__game; g.cutin.show('reimu'); const el = document.getElementById('spellCutin'); return JSON.stringify({ bossCls: el.classList.contains('boss'), tag: el.querySelector('.sc-tag').textContent, name: el.querySelector('.sc-name').textContent, sub: el.querySelector('.sc-sub').textContent }); })()");
console.log('A_PLAYER', a);
await sleep(1400);
// B) 再走一次 boss 登场：boss 类回来、tag BOSS、立绘有像素
const b = await ev("(() => { const g = window.__game; const ok = g.cutin.showBoss('sakuya'); const el = document.getElementById('spellCutin'); const cv = document.getElementById('scPortrait'); const c = cv.getContext('2d'); const d = c.getImageData(0,0,cv.width,cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++; return JSON.stringify({ ok, bossCls: el.classList.contains('boss'), tag: el.querySelector('.sc-tag').textContent, name: el.querySelector('.sc-name').textContent, portraitSamples: n, rings: getComputedStyle(el.querySelector('.sc-rings')).display }); })()");
console.log('B_BOSS', b);
await sleep(1400);
// C) 无该 Boss 配置时不炸
const c = await ev("(() => { try { return JSON.stringify({ ret: window.__game.cutin.showBoss('nobody') }); } catch (e) { return 'THROW ' + e.message; } })()");
console.log('C_UNKNOWN', c);
console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
ws.close(); proc.kill(); await sleep(200); process.exit(0);
