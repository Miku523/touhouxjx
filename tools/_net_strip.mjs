// A/B 实验：在线截获 index.html，剥掉 / 只保留前 N 条 modulepreload，量 DCL。
// 用法: node tools/_net_strip.mjs --keep=85 --wait=20000 --out=_pt/ab_85.json [--url=...] [--port=9490] [--dump]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const hit = process.argv.find((a) => a.startsWith('--' + name + '=')); return hit ? hit.slice(name.length + 3) : def; };
const BASE = arg('url', 'https://mikuascendlog.com/touhouxjx/index.html');
const KEEP = Number(arg('keep', 85));
const PORT = Number(arg('port', 9490));
const WAIT = Number(arg('wait', 20000));
const OUT = arg('out', '_pt/ab.json');
const DUMP = process.argv.includes('--dump');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-ab-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--window-size=1280,720', '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 80; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); page = (await r.json()).find((t) => t.type === 'page'); if (page) break; } catch {} await sleep(250); }
if (!page) { console.error('edge not ready'); proc.kill(); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const responses = new Map(); const finished = new Map(); const failures = [];
async function onPaused(p) {
  try {
    const bodyRes = await send('Fetch.getResponseBody', { requestId: p.requestId });
    let text = bodyRes.base64Encoded ? Buffer.from(bodyRes.body, 'base64').toString('utf8') : bodyRes.body;
    if (DUMP) { writeFileSync('_pt/ab_dump.html', text); console.log('DUMPED', text.length, 'gzip?', p.responseHeaders ? JSON.stringify(p.responseHeaders).slice(0, 200) : ''); }
    const re = /[ \t]*<link rel="modulepreload"[^>]*>\r?\n?/g;
    const all = text.match(re) || [];
    let n = 0;
    text = text.replace(re, (m) => (++n <= KEEP ? m : ''));
    const headers = (p.responseHeaders || []).filter((h) => !/^(content-length|content-encoding)$/i.test(h.name));
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(text, 'utf8').toString('base64') });
    console.log('PRELOADS total', all.length, 'kept', Math.min(KEEP, all.length));
  } catch (e) { try { await send('Fetch.continueRequest', { requestId: p.requestId }); } catch {} }
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); return; }
  if (msg.method === 'Fetch.requestPaused') { onPaused(msg.params); return; }
  if (msg.method === 'Network.responseReceived') { const p = msg.params; responses.set(p.requestId, { url: p.response.url, status: p.response.status, mime: p.response.mimeType, protocol: p.response.protocol, fromServiceWorker: !!p.response.fromServiceWorker, connectionId: p.response.connectionId, connReused: !!p.response.connectionReused }); }
  if (msg.method === 'Network.loadingFinished') finished.set(msg.params.requestId, msg.params.encodedDataLength);
  if (msg.method === 'Network.loadingFailed') { const p = msg.params; failures.push({ id: p.requestId, err: p.errorText, type: p.type }); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Fetch.enable', { patterns: [{ urlPattern: '*touhouxjx*', resourceType: 'Document', requestStage: 'Response' }] });
await send('Page.navigate', { url: BASE + (BASE.includes('?') ? '&' : '?') + 'nosw=1&ab=' + Date.now() });
await sleep(WAIT);
const r = await send('Runtime.evaluate', { expression: readFileSync(join(here, '_net_probe_expr.js'), 'utf8'), returnByValue: true });
const data = JSON.parse(r.result.value);
const meta = [...responses.entries()].map(([rid, v]) => ({ rid, ...v, encoded: finished.get(rid) || 0 }));
writeFileSync(OUT, JSON.stringify({ keep: KEEP, data, meta, failures }, null, 1));
const js = data.res.filter((x) => x.n.split('?')[0].endsWith('.js'));
const fin = js.map((x) => x.start + x.d).sort((a, b) => a - b);
const q = (p) => Math.round(fin[Math.min(fin.length - 1, Math.floor(fin.length * p))]);
console.log('KEEP', KEEP, 'nav', JSON.stringify(data.nav), 'req', meta.length, 'js', js.length, 'jsFinish p50', q(0.5), 'p90', q(0.9), 'max', q(1), 'FAIL', failures.length);
ws.close(); proc.kill();
