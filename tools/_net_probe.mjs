// 网络探针：冷缓存加载页面，采集导航/资源瀑布、字节数、协议与连接复用情况。
// 用法: node tools/_net_probe.mjs [--url=...] [--port=9480] [--wait=12000]
//        [--rtt=220] [--down=1.5] [--up=0.8]   (Mbps / ms，给 CDP 网络仿真)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const here = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => { const hit = process.argv.find((a) => a.startsWith('--' + name + '=')); return hit ? hit.slice(name.length + 3) : def; };
const URL_ = arg('url', 'https://mikuascendlog.com/touhouxjx/');
const PORT = Number(arg('port', 9480));
const WAIT = Number(arg('wait', 15000));
const RTT = Number(arg('rtt', 0));
const DOWN = Number(arg('down', 0));
const UP = Number(arg('up', 0));
const OUT = arg('out', '_pt_net_probe.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'edge-net-'));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--window-size=1280,720', '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 80; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/list'); page = (await r.json()).find((t) => t.type === 'page'); if (page) break; } catch {} await sleep(250); }
if (!page) { console.error('edge not ready'); proc.kill(); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map(); const responses = new Map(); const finished = new Map(); const failures = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); return; }
  if (msg.method === 'Network.responseReceived') { const p = msg.params; responses.set(p.requestId, { url: p.response.url, status: p.response.status, mime: p.response.mimeType, protocol: p.response.protocol, fromDiskCache: !!p.response.fromDiskCache, fromServiceWorker: !!p.response.fromServiceWorker, connectionId: p.response.connectionId, connReused: !!p.response.connectionReused }); }
  if (msg.method === 'Network.loadingFinished') { finished.set(msg.params.requestId, msg.params.encodedDataLength); }
  if (msg.method === 'Network.loadingFailed') { const p = msg.params; failures.push({ id: p.requestId, err: p.errorText, blocked: p.blockedReason, type: p.type }); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
if (RTT || DOWN || UP) await send('Network.emulateNetworkConditions', { offline: false, latency: RTT, downloadThroughput: DOWN * 1024 * 1024 / 8, uploadThroughput: UP * 1024 * 1024 / 8 });
await send('Page.navigate', { url: URL_ });
await sleep(WAIT);
const expr = readFileSync(join(here, '_net_probe_expr.js'), 'utf8');
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
const data = JSON.parse(r.result.value);
const meta = [...responses.entries()].map(([rid, v]) => ({ rid, ...v, encoded: finished.get(rid) || 0 }));
writeFileSync(OUT, JSON.stringify({ url: URL_, throttle: { RTT, DOWN, UP }, data, meta, failures }, null, 1));
console.log('NAV', JSON.stringify(data.nav));
console.log('BOOT', JSON.stringify(data.boot), 'game=', data.bootDone, 'pct=', data.bootP);
console.log('REQ', meta.length, 'FAIL', failures.length);
const byProto = {}; let totalEnc = 0;
for (const m of meta) { byProto[m.proto] = (byProto[m.proto] || 0) + 1; totalEnc += m.encoded; }
console.log('PROTO', JSON.stringify(byProto), 'encodedTotalKB', Math.round(totalEnc / 1024));
console.log('TOP BYTES');
for (const m of meta.filter((m) => m.encoded > 40000).sort((a, b) => b.encoded - a.encoded).slice(0, 25)) console.log('  ', (m.encoded / 1024).toFixed(0) + 'KB', m.status, m.proto, m.mime, m.connReused ? 'reuse' : 'newconn', m.url.replace(URL_, ''));
const byStart = [...meta].sort((a, b) => b.encoded - a.encoded).slice(0, 6);
console.log('SLOWEST (network wall by resource finish)');
for (const m of byStart) { const rr = data.res.find((x) => x.n === m.url); console.log('  ', (rr ? rr.d : '?') + 'ms', 'start@' + (rr ? rr.start : '?'), m.url.replace(URL_, '')); }
console.log('FAILURES', JSON.stringify(failures.slice(0, 10)));
ws.close(); proc.kill();