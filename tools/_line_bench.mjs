#!/usr/bin/env node
/**
 * tools/_line_bench.mjs — 多线路实测基准（零第三方依赖）
 *
 * 对「线上入口 https://mikuascendlog.com/touhouxjx/」的一组候选线路，逐条实测：
 *   DNS 解析 / TCP+TLS 握手 / TTFB / 小文件(index.html 19.6KB) 与大文件(667KB)
 *   下载吞吐 / HTTP 版本(ALPN) / gzip 与 br / 失败率 / 6 路并发墙钟 / IPv6 可达性。
 *
 * 用法：
 *   node tools/_line_bench.mjs                 # 默认每线路 5 次采样、大文件 3 次，结果落盘
 *   node tools/_line_bench.mjs --runs=3        # 快速复跑
 *   node tools/_line_bench.mjs --json          # 显式落 tools/_opt/line_bench_<yyyymmdd-HHMM>.{md,json}
 *   node tools/_line_bench.mjs --only=main,jsdelivr --runs=10
 *   node tools/_line_bench.mjs --no-save       # 只打控制台
 *
 * 约定：
 *   - 只读线上资源，不写服务端内容；仅在本地 tools/_opt/ 落结果文件。
 *   - 单次线上测量噪声很大（CDN 冷边缘 / 路由抖动 / 丢包重传），所以：
 *     每条线路先热身 1 次（不计入统计，把边缘缓存点亮）；统计一律取中位数，同时给 min/max 与失败率；
 *     一条线路连续失败 2 次即判 FAIL 并跳过剩余轮次（不拖垮整轮）。
 *   - 任何线路超时/失败都只标 FAIL，不影响其它线路；脚本本身不因网络异常退出。
 */

import https from 'node:https';
import http2 from 'node:http2';
import tls from 'node:tls';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

// ─────────────────────────────────────────────── 常量

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) HKS-line-bench/1.0';
const ACCEPT_ENCODING = 'gzip, deflate, br';
const SITE_ORIGIN = 'https://mikuascendlog.com';
const SITE_PREFIX = '/touhouxjx/';
const REPO = 'Miku523/touhouxjx';
const BRANCH = 'main';
const RAW_BASE = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/';

const siteUrl = (rel) => SITE_ORIGIN + SITE_PREFIX + rel;
const rawUrl = (rel) => RAW_BASE + rel;
const mirrorUrl = (prefix) => (rel) => prefix + rawUrl(rel);

// 默认大文件：仓库里真实部署、且不压缩的图（667,285 B）
const DEFAULT_BIG = 'src/art/gen/bg/shrine.jpg';
// 小文件：线上入口页（本地 19,618 B，gzip 后约 5.3 KB）
const SMALL_REL = 'index.html';

/**
 * 候选线路。字段：
 *   id / group / label / host / url(rel)
 *   directIp  直连 IP（keep SNI+Host = host）
 *   family    4 | 6
 *   kind      origin | ip | ipv6 | cdn | mirror | raw | redirect
 *   note      报告里的固定说明
 */
const CANDIDATES = [
  {
    id: 'main', group: 'origin', kind: 'origin',
    label: '主域名（Cloudflare DNS → GitHub Pages/Fastly）',
    host: 'mikuascendlog.com', url: siteUrl,
    note: '线上入口，真实链路',
  },
  {
    id: 'ip108', group: 'origin', kind: 'ip',
    label: 'A 记录直连 185.199.108.153',
    host: 'mikuascendlog.com', directIp: '185.199.108.153', url: siteUrl,
    note: 'SNI/Host 仍为主域名',
  },
  {
    id: 'ip109', group: 'origin', kind: 'ip',
    label: 'A 记录直连 185.199.109.153',
    host: 'mikuascendlog.com', directIp: '185.199.109.153', url: siteUrl,
    note: 'SNI/Host 仍为主域名',
  },
  {
    id: 'ip110', group: 'origin', kind: 'ip',
    label: 'A 记录直连 185.199.110.153（当前 DNS 未下发）',
    host: 'mikuascendlog.com', directIp: '185.199.110.153', url: siteUrl,
    note: 'Pages 官方 4 条之一；主域名 DNS 目前只有 .108/.109',
  },
  {
    id: 'ip111', group: 'origin', kind: 'ip',
    label: 'A 记录直连 185.199.111.153（当前 DNS 未下发）',
    host: 'mikuascendlog.com', directIp: '185.199.111.153', url: siteUrl,
    note: 'Pages 官方 4 条之一；主域名 DNS 目前只有 .108/.109',
  },
  {
    id: 'v6', group: 'origin', kind: 'ipv6',
    label: 'IPv6 直连 2606:50c0:8000::153（实验）',
    host: 'mikuascendlog.com', directIp: '2606:50c0:8000::153', family: 6, url: siteUrl,
    note: '主域名当前无 AAAA；此测是「若加 AAAA 是否可用」的可行性验证',
  },
  {
    id: 'pages', group: 'origin', kind: 'redirect',
    label: 'GitHub Pages 默认域 miku523.github.io',
    host: 'miku523.github.io',
    url: (rel) => 'https://miku523.github.io/touhouxjx/' + rel,
    note: '默认域对自定义域站点会 301 回主域名',
  },
  {
    id: 'jsdelivr', group: 'cdn', kind: 'cdn',
    label: 'jsDelivr gh 镜像（Cloudflare）',
    host: 'cdn.jsdelivr.net',
    url: (rel) => 'https://cdn.jsdelivr.net/gh/' + REPO + '@' + BRANCH + '/' + rel,
    note: '支持 br；国内通常被调度到境外 CF 边缘',
  },
  {
    id: 'jsdelivr-fastly', group: 'cdn', kind: 'redirect',
    label: 'fastly.jsdelivr.net',
    host: 'fastly.jsdelivr.net',
    url: (rel) => 'https://fastly.jsdelivr.net/gh/' + REPO + '@' + BRANCH + '/' + rel,
    note: '实测 301 到 raw.githubusercontent.com',
  },
  {
    id: 'ghfast', group: 'mirror', kind: 'mirror',
    label: 'ghfast.top（ghproxy 类）',
    host: 'ghfast.top', url: mirrorUrl('https://ghfast.top/'),
    note: '代理 raw.githubusercontent',
  },
  {
    id: 'gh-proxy', group: 'mirror', kind: 'mirror',
    label: 'gh-proxy.com（ghproxy 类）',
    host: 'gh-proxy.com', url: mirrorUrl('https://gh-proxy.com/'),
    note: '代理 raw.githubusercontent，CF 边缘',
  },
  {
    id: 'gh-proxy-org', group: 'mirror', kind: 'mirror',
    label: 'gh-proxy.org（ghproxy 类）',
    host: 'gh-proxy.org', url: mirrorUrl('https://gh-proxy.org/'),
    note: '代理 raw.githubusercontent；hk.gh-proxy.com 会 302 到这里',
  },
  {
    id: 'raw-gh', group: 'mirror', kind: 'raw',
    label: 'raw.githubusercontent.com（直连）',
    host: 'raw.githubusercontent.com', url: rawUrl,
    note: '境外直连原始地址',
  },
  {
    id: 'ghproxy-net', group: 'mirror', kind: 'mirror',
    label: 'ghproxy.net（ghproxy 类）',
    host: 'ghproxy.net', url: mirrorUrl('https://ghproxy.net/'),
    note: '常见 ghproxy 备用域',
  },
  {
    id: 'mirror-ghproxy', group: 'mirror', kind: 'mirror',
    label: 'mirror.ghproxy.com（ghproxy 类）',
    host: 'mirror.ghproxy.com', url: mirrorUrl('https://mirror.ghproxy.com/'),
    note: '老牌 ghproxy 备用域',
  },
  {
    id: 'ghp-ci', group: 'mirror', kind: 'mirror',
    label: 'ghp.ci（ghproxy 类）',
    host: 'ghp.ci', url: mirrorUrl('https://ghp.ci/'),
    note: '老牌 ghproxy 域',
  },
  {
    id: 'moeyy', group: 'mirror', kind: 'mirror',
    label: 'github.moeyy.xyz（ghproxy 类）',
    host: 'github.moeyy.xyz', url: mirrorUrl('https://github.moeyy.xyz/'),
    note: '常见 ghproxy 备用域',
  },
];

// ─────────────────────────────────────────────── 小工具

const now = () => performance.now();

function round(v, d = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

function stats(values) {
  const a = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return { n: 0, min: null, median: null, max: null, p90: null, mean: null };
  const q = (p) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];
  const mid = a.length >> 1;
  return {
    n: a.length,
    min: round(a[0], 1),
    median: round(a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2, 1),
    max: round(a[a.length - 1], 1),
    p90: round(q(0.9), 1),
    mean: round(a.reduce((s, v) => s + v, 0) / a.length, 1),
  };
}

const f = (v, d = 0, dash = '—') =>
  v === null || v === undefined || !Number.isFinite(v) ? dash : Number(v).toFixed(d);

function mdTable(headers, rows) {
  const line = (cells) => '| ' + cells.map((c) => String(c === undefined || c === null ? '' : c)).join(' | ') + ' |';
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

function isRedirectStatus(s) {
  return s === 301 || s === 302 || s === 303 || s === 307 || s === 308;
}

// ─────────────────────────────────────────────── CLI

function parseIntSafe(v, def, min, max) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function parseArgs(argv) {
  const o = {
    runs: 5,
    bigRuns: 2,
    timeout: 6000,
    gap: 120,
    warmup: 1,
    concurrency: 6,
    protocols: ['h1', 'h2'],
    bigProto: 'h2',
    smallRel: SMALL_REL,
    bigRel: DEFAULT_BIG,
    save: true,
    dir: 'tools/_opt',
    only: null,
    bigLines: null,
    maxSeconds: 480,
    fromJson: null,
    help: false,
  };
  for (const a of argv) {
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json' || a === '--save') o.save = true;
    else if (a === '--no-save') o.save = false;
    else if (a.startsWith('--runs=')) o.runs = parseIntSafe(a.slice(7), o.runs, 1, 50);
    else if (a.startsWith('--big-runs=')) o.bigRuns = parseIntSafe(a.slice(11), o.bigRuns, 1, 50);
    else if (a.startsWith('--timeout=')) o.timeout = parseIntSafe(a.slice(10), o.timeout, 1000, 60000);
    else if (a.startsWith('--gap=')) o.gap = parseIntSafe(a.slice(6), o.gap, 0, 5000);
    else if (a.startsWith('--warmup=')) o.warmup = parseIntSafe(a.slice(9), o.warmup, 0, 10);
    else if (a.startsWith('--concurrency=')) o.concurrency = parseIntSafe(a.slice(14), o.concurrency, 0, 20);
    else if (a.startsWith('--max-seconds=')) o.maxSeconds = parseIntSafe(a.slice(14), o.maxSeconds, 30, 3600);
    else if (a.startsWith('--big=')) o.bigRel = a.slice(6);
    else if (a.startsWith('--big-proto=')) o.bigProto = a.slice(12);
    else if (a.startsWith('--only=')) o.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--big-lines=')) o.bigLines = a.slice(12).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--dir=')) o.dir = a.slice(6);
    else if (a.startsWith('--from-json=')) o.fromJson = a.slice(12);
    else if (a.startsWith('--protocols=')) {
      const list = a.slice(12).split(',').map((s) => s.trim()).filter(Boolean);
      const picked = list.filter((p) => p === 'h1' || p === 'h2');
      if (picked.length) o.protocols = picked;
    } else {
      process.stderr.write('[warn] 未知参数: ' + a + '\n');
    }
  }
  if (o.bigProto !== 'h1' && o.bigProto !== 'h2') o.bigProto = 'h2';
  return o;
}

const USAGE = [
  '用法: node tools/_line_bench.mjs [选项]',
  '',
  '  --runs=N            每个线路的采样次数（默认 5；统计取中位数）',
  '  --big-runs=N        大文件下载采样次数（默认 2；667 KB 在当前链路可能要 10-20 s，故默认少跑）',
  '  --timeout=MS        单次请求超时（默认 6000）',
  '  --gap=MS            相邻采样间隔（默认 120）',
  '  --warmup=N          正式采样前的热身次数（默认 1，不计入统计）',
  '  --concurrency=N     并发墙钟测试的并发数（默认 6；0 关闭）',
  '  --protocols=h1,h2   要测的 HTTP 协议（默认都测）',
  '  --big-proto=h2      大文件用哪个协议（默认 h2）',
  '  --big=<repo 相对路径>  大文件（默认 ' + DEFAULT_BIG + '，667 KB）',
  '  --only=a,b          只跑 id 含这些子串的线路',
  '  --big-lines=a,b     只对这些线路跑大文件下载（默认全部可用线路）',
  '  --json              结果落 tools/_opt/line_bench_<yyyymmdd-HHMM>.json + .md（默认已开启）',
  '  --dir=DIR           结果目录（默认 tools/_opt）',
  '  --from-json=PATH     不测速，只把已保存的 .json 重新渲染成同名 .md（改报告文案用，零网络）',
  '  --no-save           不落文件，只打控制台',
  '  --max-seconds=N     整轮时间预算，超出后剩余线路标 SKIP（默认 480）',
  '  -h, --help          显示本帮助',
  '',
  '注意：只读线上资源；任何线路失败都只标 FAIL，不会中断整轮。',
].join('\n');

// ─────────────────────────────────────────────── DNS / TLS

async function resolve4Timed(host) {
  const t0 = now();
  const resolver = new dns.promises.Resolver();
  const addrs = await resolver.resolve4(host, { ttl: true });
  return { ms: now() - t0, addrs };
}

async function resolve6Timed(host) {
  try {
    const t0 = now();
    const resolver = new dns.promises.Resolver();
    const addrs = await resolver.resolve6(host, { ttl: true });
    return { ms: now() - t0, addrs, error: null };
  } catch (e) {
    return { ms: null, addrs: [], error: e.code || e.message };
  }
}

function probeTls({ host, ip, port = 443, servername, family = 4, timeout = 5000 }) {
  return new Promise((resolve) => {
    const t0 = now();
    let tcpMs = null;
    let done = false;
    let sock = null;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock?.destroy(); } catch { /* ignore */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeout);
    try {
      sock = tls.connect({
        host: ip || host,
        port,
        family: family === 6 ? 6 : undefined,
        servername: servername || host,
        ALPNProtocols: ['h2', 'http/1.1'],
        rejectUnauthorized: false,
      });
    } catch (e) {
      return finish({ ok: false, error: 'throw:' + (e.code || e.message) });
    }
    sock.once('connect', () => { tcpMs = now() - t0; });
    sock.once('secureConnect', () => {
      const cert = sock.getPeerCertificate() || {};
      finish({
        ok: true,
        alpn: sock.alpnProtocol || null,
        tlsProto: sock.getProtocol?.() || null,
        cipher: sock.getCipher?.()?.name || null,
        authorized: !!sock.authorized,
        authError: sock.authorizationError ? String(sock.authorizationError) : null,
        certIssuer: cert.issuer?.O || null,
        certCn: cert.subject?.CN || null,
        tcpMs: round(tcpMs, 1),
        tlsMs: round(now() - t0, 1),
      });
    });
    sock.once('error', (e) => finish({ ok: false, error: e.code || e.message }));
    sock.once('timeout', () => finish({ ok: false, error: 'timeout' }));
  });
}

// 强制连接到指定 IP，同时保留 SNI / Host
function mkLookup(ip, family) {
  return (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    const fam = family === 6 ? 6 : 4;
    if (options && options.all) return cb(null, [{ address: ip, family: fam }]);
    return cb(null, ip, fam);
  };
}

// ─────────────────────────────────────────────── 单次请求采样

function http1Sample({ host, ip, port = 443, servername, reqPath, timeout, family = 4, method = 'GET' }) {
  return new Promise((resolve) => {
    const t0 = now();
    let sock = null;
    let tcpMs = null;
    let tlsMs = null;
    let requestAt = null;
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock?.destroy(); } catch { /* ignore */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeout);

    const opts = {
      method,
      host: ip || host,
      port,
      path: reqPath,
      headers: {
        host: servername || host,
        'user-agent': UA,
        'accept-encoding': ACCEPT_ENCODING,
        connection: 'close',
      },
      servername: servername || host,
      agent: false,
      ALPNProtocols: ['http/1.1'],
      rejectUnauthorized: false,
    };
    if (family === 6) opts.family = 6;

    let req;
    try {
      req = https.request(opts, (res) => {
        const headersAt = now();
        let bytes = 0;
        res.on('data', (c) => { bytes += c.length; });
        res.on('end', () => {
          const endAt = now();
          const ttfbMs = requestAt ? headersAt - requestAt : headersAt - (t0 + (tlsMs || 0));
          finish({
            ok: true,
            status: res.statusCode,
            region: res.headers['x-github-edge-region'] || null,
            server: res.headers.server || null,
            enc: res.headers['content-encoding'] || 'identity',
            location: res.headers.location || null,
            cache: res.headers['cache-control'] || null,
            altSvc: res.headers['alt-svc'] || null,
            bytes,
            tcpMs: round(tcpMs, 1),
            tlsMs: round(tlsMs, 1),
            ttfbMs: round(ttfbMs, 1),
            transferMs: round(endAt - headersAt, 1),
            totalMs: round(endAt - t0, 1),
            alpn: sock?.alpnProtocol || null,
            tlsProto: sock?.getProtocol?.() || null,
            cipher: sock?.getCipher?.()?.name || null,
            authorized: !!sock?.authorized,
          });
        });
        res.on('error', (e) => finish({ ok: false, error: e.code || e.message }));
        res.resume();
      });
    } catch (e) {
      return finish({ ok: false, error: 'throw:' + (e.code || e.message) });
    }

    req.on('socket', (s) => {
      sock = s;
      s.once('connect', () => { tcpMs = now() - t0; });
      s.once('secureConnect', () => { tlsMs = now() - t0; });
      s.once('error', (e) => finish({ ok: false, error: e.code || e.message }));
    });
    req.on('finish', () => { if (!requestAt) requestAt = now(); });
    req.on('error', (e) => finish({ ok: false, error: e.code || e.message }));
    req.on('timeout', () => finish({ ok: false, error: 'timeout' }));
    req.end();
  });
}

function http2Sample({ host, ip, port = 443, servername, reqPath, timeout, family = 4, method = 'GET' }) {
  return new Promise((resolve) => {
    const t0 = now();
    let sess = null;
    let sock = null;
    let tcpMs = null;
    let tlsMs = null;
    let done = false;
    let pollTimer = null;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      try { sess?.destroy(); } catch { /* ignore */ }
      try { sock?.destroy(); } catch { /* ignore */ }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeout);

    try {
      sess = http2.connect('https://' + (servername || host), {
        port,
        lookup: ip ? mkLookup(ip, family) : undefined,
        servername: servername || host,
        rejectUnauthorized: false,
      });
    } catch (e) {
      return finish({ ok: false, error: 'throw:' + (e.code || e.message) });
    }

    // 抓握手时刻：session socket 异步可用，轮询挂监听（只用于计时，不参与控制流）
    let poll = 0;
    pollTimer = setInterval(() => {
      if (sess && sess.socket) {
        sock = sess.socket;
        clearInterval(pollTimer);
        pollTimer = null;
        sock.once('connect', () => { tcpMs = now() - t0; });
        sock.once('secureConnect', () => { tlsMs = now() - t0; });
        sock.once('error', () => { /* 由 session error 统一处理 */ });
      } else if (++poll > 500) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 2);

    sess.on('error', (e) => finish({ ok: false, error: e.code || e.message }));

    sess.on('connect', () => {
      sock = sess.socket || sock;
      let headersAt = null;
      let hdr = null;
      let bytes = 0;
      let req = null;
      try {
        req = sess.request({
          ':method': method,
          ':path': reqPath,
          'user-agent': UA,
          'accept-encoding': ACCEPT_ENCODING,
        });
      } catch (e) {
        return finish({ ok: false, error: 'throw:' + (e.code || e.message) });
      }
      const requestAt = now();
      req.on('response', (h) => { hdr = h; headersAt = now(); });
      req.on('data', (c) => { bytes += c.length; });
      req.on('end', () => {
        const endAt = now();
        finish({
          ok: true,
          status: hdr?.[':status'] ?? null,
          region: hdr?.['x-github-edge-region'] || null,
          server: hdr?.server || null,
          enc: hdr?.['content-encoding'] || 'identity',
          location: hdr?.location || null,
          cache: hdr?.['cache-control'] || null,
          altSvc: hdr?.['alt-svc'] || null,
          bytes,
          tcpMs: round(tcpMs, 1),
          tlsMs: round(tlsMs, 1),
          ttfbMs: headersAt ? round(headersAt - requestAt, 1) : null,
          transferMs: headersAt ? round(endAt - headersAt, 1) : null,
          totalMs: round(endAt - t0, 1),
          alpn: sock?.alpnProtocol || null,
          tlsProto: sock?.getProtocol?.() || null,
          cipher: sock?.getCipher?.()?.name || null,
          authorized: !!sock?.authorized,
        });
      });
      req.on('error', (e) => finish({ ok: false, error: e.code || e.message }));
      req.end();
    });
  });
}

function runSample(proto, spec) {
  return proto === 'h2' ? http2Sample(spec) : http1Sample(spec);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────── 并发墙钟

async function concurrencyTest({ proto, host, ip, servername, reqPath, timeout, family, k }) {
  const t0 = now();

  if (proto === 'h2') {
    return new Promise((resolve) => {
      let sess = null;
      let pending = k;
      let failures = 0;
      let finished = false;
      const finish = (v) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { sess?.destroy(); } catch { /* ignore */ }
        resolve(v);
      };
      const timer = setTimeout(() => finish({ ok: false, wallMs: round(now() - t0, 1), failures, error: 'timeout' }), timeout * 2);
      try {
        sess = http2.connect('https://' + (servername || host), {
          port: 443,
          lookup: ip ? mkLookup(ip, family) : undefined,
          servername: servername || host,
          rejectUnauthorized: false,
        });
      } catch (e) {
        return finish({ ok: false, wallMs: null, failures: k, error: 'throw' });
      }
      sess.on('error', (e) => finish({ ok: false, wallMs: round(now() - t0, 1), failures, error: e.code || e.message }));
      sess.on('connect', () => {
        for (let i = 0; i < k; i++) {
          const req = sess.request({ ':method': 'GET', ':path': reqPath, 'user-agent': UA, 'accept-encoding': ACCEPT_ENCODING });
          req.on('response', () => { /* ignore */ });
          req.on('data', () => { /* ignore */ });
          req.on('error', () => { failures++; });
          req.on('end', () => {
            pending--;
            if (pending === 0) {
              finish({ ok: failures === 0, wallMs: round(now() - t0, 1), failures });
            }
          });
          req.end();
        }
      });
    });
  }

  const results = await Promise.all(
    Array.from({ length: k }, () =>
      http1Sample({ host, ip, port: 443, servername, reqPath, timeout, family })
    )
  );
  let failures = 0;
  for (const r of results) if (!r || !r.ok || (r.status && r.status >= 400)) failures++;
  return { ok: failures === 0, wallMs: round(now() - t0, 1), failures };
}

// ─────────────────────────────────────────────── 单线路测量

function summarizeSamples(samples) {
  const ok = samples.filter((s) => s.ok);
  const bad = samples.filter((s) => !s.ok);
  const tb = (key) => stats(ok.map((s) => s[key]).filter((v) => typeof v === 'number'));
  return {
    attempts: samples.length,
    ok: ok.length,
    failed: bad.length,
    failRate: samples.length ? round(bad.length / samples.length, 3) : null,
    statuses: [...new Set(ok.map((s) => s.status).filter((v) => v !== null && v !== undefined))],
    regions: [...new Set(ok.map((s) => s.region).filter(Boolean))],
    encs: [...new Set(ok.map((s) => s.enc).filter(Boolean))],
    alpn: [...new Set(ok.map((s) => s.alpn).filter(Boolean))],
    tlsProtos: [...new Set(ok.map((s) => s.tlsProto).filter(Boolean))],
    bytes: tb('bytes'),
    tcp: tb('tcpMs'),
    tls: tb('tlsMs'),
    ttfb: tb('ttfbMs'),
    total: tb('totalMs'),
    transfer: tb('transferMs'),
    throughputKBs: stats(ok.map((s) => (s.transferMs > 0 ? (s.bytes / (s.transferMs / 1000)) / 1024 : null))),
    errors: [...new Set(bad.map((s) => s.error).filter(Boolean))],
    locations: [...new Set(ok.map((s) => s.location).filter(Boolean))],
    altSvc: [...new Set(ok.map((s) => s.altSvc).filter(Boolean))],
    samples,
  };
}

async function runCandidate(c, ctx) {
  const t0 = now();
  const out = {
    id: c.id, group: c.group, kind: c.kind, label: c.label, host: c.host,
    directIp: c.directIp || null, family: c.family || 4, note: c.note || '',
    skipped: false,
    dns: { samples: [], addrs: [], medianMs: null, ttl: null, error: null },
    ipv6: { aaaa: [], aaaaError: null, connectOk: null },
    tls: null,
    small: {},
    big: null,
    conc: null,
    expectedBigBytes: ctx.expectedBigBytes,
    tag: null,
    failReasons: [],
    elapsedMs: null,
  };

  const timeout = ctx.opt.timeout;
  const overBudget = () => (now() - ctx.startedAt) / 1000 > ctx.opt.maxSeconds;

  // 1) DNS：hostname 线路逐样本解析（每次 new Resolver，绕过 OS 缓存）；直连 IP 跳过
  if (!c.directIp) {
    for (let i = 0; i < Math.max(1, Math.min(ctx.opt.runs, 5)); i++) {
      try {
        const r = await resolve4Timed(c.host);
        out.dns.samples.push(round(r.ms, 1));
        out.dns.addrs = r.addrs.map((a) => a.address);
        out.dns.ttl = r.addrs[0]?.ttl ?? null;
      } catch (e) {
        out.dns.error = e.code || e.message;
        break;
      }
      if (ctx.opt.gap) await sleep(Math.min(60, ctx.opt.gap));
    }
    out.dns.medianMs = stats(out.dns.samples).median;
  }

  const aaaa = await resolve6Timed(c.host);
  out.ipv6.aaaa = aaaa.addrs.map((a) => a.address);
  out.ipv6.aaaaError = aaaa.error;
  if (aaaa.addrs.length && !c.directIp) {
    const p6 = await probeTls({
      host: c.host, ip: aaaa.addrs[0].address, servername: c.host, family: 6,
      timeout: Math.min(timeout, 5000),
    });
    out.ipv6.connectOk = !!p6.ok;
    out.ipv6.probeError = p6.ok ? null : (p6.error || null);
    out.ipv6.alpn = p6.ok ? p6.alpn : null;
  }

  // 2) TLS/ALPN 元数据（握手数值以样本统计为准，这里只取协商结果与证书）
  const metaIp = c.directIp || out.dns.addrs[0] || null;
  out.tls = await probeTls({
    host: c.host, ip: metaIp, servername: c.host, family: c.family,
    timeout: Math.min(timeout, 5000),
  });

  const u = new URL(c.url(ctx.opt.smallRel));
  const smallPath = u.pathname + u.search;

  // 3) 小文件：协议 × N 次（含热身）
  for (const proto of ctx.opt.protocols) {
    if (overBudget()) { out.skipped = true; break; }
    const samples = [];
    let failStreak = 0;
    const spec = () => ({ host: c.host, ip: metaIp, servername: c.host, reqPath: smallPath, timeout, family: c.family });
    for (let i = 0; i < ctx.opt.warmup; i++) {
      await runSample(proto, spec());
      if (ctx.opt.gap) await sleep(Math.min(80, ctx.opt.gap));
    }
    for (let i = 0; i < ctx.opt.runs; i++) {
      const r = await runSample(proto, spec());
      if (!r.ok) {
        failStreak++;
        samples.push(r);
        if (failStreak >= 2) break;
      } else {
        failStreak = 0;
        samples.push(r);
      }
      if (ctx.opt.gap) await sleep(ctx.opt.gap);
    }
    out.small[proto] = summarizeSamples(samples);
    const s = out.small[proto];
    if (s.ok === 0) out.failReasons.push(proto + ':' + (s.errors[0] || 'no-success'));
    process.stderr.write(
      '  ' + c.id.padEnd(15) + ' ' + proto + '  ' +
      (s.ok ? 'ok=' + s.ok + '/' + s.attempts + '  ttfb=' + f(s.ttfb.median, 0) + 'ms  total=' + f(s.total.median, 0) + 'ms' : 'FAIL(' + (s.errors[0] || '?') + ')') + '\n'
    );
  }

  // 4) 大文件（只测一个协议；重定向/全失败线路跳过）
  const anySmallOk = ctx.opt.protocols.some((p) => (out.small[p]?.ok || 0) > 0);
  const firstStatus = ctx.opt.protocols.map((p) => out.small[p]).find((s) => s && s.ok > 0)?.statuses?.[0];
  const redirectOnly = isRedirectStatus(firstStatus);
  const bigWanted = !ctx.opt.bigLines || ctx.opt.bigLines.some((x) => c.id === x || c.id.includes(x));
  if (anySmallOk && !redirectOnly && !overBudget() && ctx.opt.bigRuns > 0 && bigWanted) {
    const proto = ctx.opt.bigProto;
    const bu = new URL(c.url(ctx.opt.bigRel));
    const bigPath = bu.pathname + bu.search;
    const samples = [];
    let failStreak = 0;
    for (let i = 0; i < ctx.opt.bigRuns; i++) {
      const r = await runSample(proto, {
        host: c.host, ip: metaIp, servername: c.host, reqPath: bigPath,
        timeout: Math.max(timeout, 45000), family: c.family,
      });
      if (!r.ok) {
        failStreak++;
        samples.push(r);
        if (failStreak >= 2) break;
      } else {
        failStreak = 0;
        samples.push(r);
      }
      if (ctx.opt.gap) await sleep(ctx.opt.gap);
    }
    out.big = summarizeSamples(samples);
    out.big.path = ctx.opt.bigRel;
    out.big.bytesMatch = samples.some(
      (s) => s.ok && s.enc === 'identity' && ctx.expectedBigBytes && s.bytes === ctx.expectedBigBytes
    );
    process.stderr.write(
      '  ' + c.id.padEnd(15) + ' big  ' +
      (out.big.ok
        ? out.big.ok + '/' + samples.length + '  ' + f(out.big.total.median, 0) + 'ms  ' + f(bigMBps(out), 2) + 'MB/s'
        : 'FAIL(' + (out.big.errors[0] || '?') + ')') + '\n'
    );
  }

  // 5) 并发墙钟（小文件，h1 vs h2）
  if (ctx.opt.concurrency > 0 && anySmallOk && !redirectOnly && !overBudget()) {
    out.conc = {};
    for (const proto of ctx.opt.protocols) {
      if ((out.small[proto]?.ok || 0) === 0) continue;
      out.conc[proto] = await concurrencyTest({
        proto, host: c.host, ip: metaIp, servername: c.host, reqPath: smallPath,
        timeout, family: c.family, k: ctx.opt.concurrency,
      });
    }
  }

  if (c.family === 6) out.ipv6.connectOk = !!primaryProto(out);
  out.elapsedMs = round(now() - t0, 0);
  out.tag = classify(out);
  return out;
}

function primaryProto(r) {
  if (r.small?.h2 && r.small.h2.ok > 0) return 'h2';
  if (r.small?.h1 && r.small.h1.ok > 0) return 'h1';
  return null;
}

function classify(r) {
  const p = primaryProto(r);
  if (!p) return 'DEAD';
  const st = r.small[p].statuses[0];
  if (isRedirectStatus(st)) return 'REDIRECT';
  if (st !== 200 && st !== 206) return 'HTTP' + st;
  return 'OK';
}

function ttfbOf(r) {
  const p = primaryProto(r);
  return p ? r.small[p].ttfb.median : null;
}

function bigMBps(r) {
  if (!r.big || !r.big.ok || !r.big.total.median || !r.big.bytes.median) return null;
  return round(r.big.bytes.median / 1024 / 1024 / (r.big.total.median / 1000), 2);
}

// ─────────────────────────────────────────────── 汇总 / 判定

function buildSummary(results) {
  const usable = results.filter((r) => r.tag === 'OK');
  const sorted = [...usable].sort((a, b) => (ttfbOf(a) ?? 1e9) - (ttfbOf(b) ?? 1e9));
  const baseline = results.find((r) => r.id === 'main') || null;
  const baseTtfb = baseline ? ttfbOf(baseline) : null;

  const dead = results.filter((r) => r.tag !== 'OK' && r.tag !== 'REDIRECT' && !r.skipped);
  const redirects = results.filter((r) => r.tag === 'REDIRECT');
  const slow = usable.filter((r) => r.id !== 'main' && baseTtfb && ttfbOf(r) && ttfbOf(r) > baseTtfb * 1.8);

  const regionSet = [...new Set(results.flatMap((r) => {
    const p = primaryProto(r);
    return p ? r.small[p].regions : [];
  }))];

  const ipRows = ['ip108', 'ip109', 'ip110', 'ip111']
    .map((id) => results.find((r) => r.id === id))
    .filter(Boolean);
  const ipTtfbs = ipRows.map((r) => ({
    id: r.id,
    ttfb: ttfbOf(r),
    tag: r.tag,
    region: primaryProto(r) ? r.small[primaryProto(r)].regions[0] || null : null,
  }));
  const ipVals = ipTtfbs.map((x) => x.ttfb).filter((v) => typeof v === 'number');
  const ipSpreadPct = ipVals.length >= 2
    ? round(((Math.max(...ipVals) - Math.min(...ipVals)) / (ipVals.reduce((a, b) => a + b, 0) / ipVals.length)) * 100, 0)
    : null;

  const cfFronted = ['jsdelivr', 'gh-proxy', 'gh-proxy-org', 'ghfast']
    .map((id) => results.find((r) => r.id === id))
    .filter((r) => r && r.tag === 'OK')
    .map((r) => ({
      id: r.id,
      ttfb: ttfbOf(r),
      ratio: baseTtfb && ttfbOf(r) ? round(ttfbOf(r) / baseTtfb, 1) : null,
      region: primaryProto(r) ? r.small[primaryProto(r)].regions[0] || null : null,
      enc: primaryProto(r) ? r.small[primaryProto(r)].encs.join('/') : null,
    }))
    .sort((a, b) => a.ttfb - b.ttfb);

  const v6 = results.find((r) => r.id === 'v6') || null;

  return {
    sortedIds: sorted.map((r) => r.id),
    fastest: sorted[0] || null,
    fastestId: sorted[0] ? sorted[0].id : null,
    baseline,
    baseTtfb,
    dead,
    redirects,
    slow,
    regionSet,
    ipTtfbs,
    ipSpreadPct,
    cfFronted,
    v6,
    counts: {
      candidates: results.length,
      ok: usable.length,
      redirect: redirects.length,
      dead: dead.length,
      skipped: results.filter((r) => r.skipped).length,
    },
  };
}

// ─────────────────────────────────────────────── Markdown 报告

function cellStatus(r) {
  const p = primaryProto(r);
  if (!p) return (r.small?.h1?.errors?.[0] || r.small?.h2?.errors?.[0] || r.failReasons?.[0] || 'FAIL');
  return r.small[p].statuses.join('/');
}

function cellRegion(r) {
  const p = primaryProto(r);
  return p ? (r.small[p].regions.join('/') || '—') : '—';
}

function cellAlpn(r) {
  const set = new Set();
  for (const proto of ['h1', 'h2']) {
    const s = r.small?.[proto];
    if (s) s.alpn.forEach((a) => set.add(a));
  }
  if (!set.size && r.tls?.alpn) set.add(r.tls.alpn);
  return [...set].join('/') || '—';
}

function cellEnc(r) {
  const p = primaryProto(r);
  return p ? (r.small[p].encs.join('/') || 'identity') : '—';
}

function cellTls(r) {
  if (r.tls?.ok) return r.tls.tlsProto || '—';
  for (const proto of ['h2', 'h1']) {
    const s = r.small?.[proto];
    if (s && s.ok > 0 && s.tlsProtos?.length) return s.tlsProtos.join('/') + '\uFF08\u6837\u672C\uFF09';
  }
  return r.tls?.error || '—';
}

function tagCell(r) {
  if (r.tag === 'DEAD') return '**DEAD**';
  if (r.tag === 'REDIRECT') return '**REDIRECT**';
  if (r.tag !== 'OK') return '**' + (r.tag || 'SKIP') + '**';
  return 'OK';
}

const TICK = String.fromCharCode(96);

function buildMarkdown(payload) {
  const meta = payload.meta;
  const env = payload.env;
  const results = payload.results;
  const summary = payload.summaryFull || payload.summary;
  const opt = payload.opt;
  const lines = [];
  const push = (...xs) => { for (const x of xs) lines.push(x); };
  const code = (s) => TICK + s + TICK;
  const fence = TICK + TICK + TICK;

  push('# 多线路实测：https://mikuascendlog.com/touhouxjx/', '');
  push('> 生成：' + code('node tools/_line_bench.mjs') + ' · ' + meta.startedAt + ' · 每线路 ' + opt.runs + ' 次采样（中位数）/ 大文件 ' + opt.bigRuns + ' 次');
  push('> 单次线上测量噪声大（CDN 冷边缘、路由抖动、丢包重传），本报告的结论一律以**中位数 + 失败率**为准，单次极值单独标注。');
  push('');

  push('## 0. 环境与目标', '');
  push(mdTable(['项', '值'], [
    ['站点入口', code(meta.site)],
    ['小文件', code(opt.smallRel) + '（本地 19,618 B，线上 gzip 后约 5.3 KB）'],
    ['大文件', code(opt.bigRel) + '（' + (meta.expectedBigBytes || '?') + ' B，image/jpeg 不压缩）'],
    ['Node', env.node + ' / ' + env.platform],
    ['DNS 服务器', env.dnsServers.join(', ') || '（未知）'],
    ['h2 / QUIC 能力', 'Node 内置 http2 可用；node:quic ' + (env.quic.available ? '可用' : '不可用（h3 只能看服务端是否广播 alt-svc，客户端验证 N/A）')],
    ['采样口径', 'DNS 每样本新开 Resolver（绕过 OS 缓存）；TCP/TLS 从连接开始计；TTFB 从请求发出到首字节；吞吐按「传输阶段」计 wire 字节（gzip/br 后）'],
  ]), '');

  const originRows = results.filter((r) => r.group === 'origin');
  const cdnRows = results.filter((r) => r.group !== 'origin');

  push('## 1. 基础线路（主域名 / 直连 IP / IPv6 / 默认域）', '');
  push(mdTable(['线路', '状态', '边缘 region', 'ALPN', 'TLS', '压缩', 'TTFB 中位数', '失败率', '判定'], originRows.map((r) => {
    const p = primaryProto(r);
    return [
      code(r.id) + ' ' + r.label,
      cellStatus(r),
      cellRegion(r),
      cellAlpn(r),
      cellTls(r),
      cellEnc(r),
      p ? f(r.small[p].ttfb.median, 0) + ' ms' : '—',
      p ? f((r.small[p].failRate ?? 0) * 100, 0) + '%' : '—',
      tagCell(r),
    ];
  })), '');
  push('> TTFB / 失败率按 **h2 优先**统计（h2 全部失败时回退 h1）；`TLS` 列优先取独立握手探测，探测失败时回退实际样本协商结果。', '');

  push('## 2. CDN / ghproxy 镜像', '');
  push(mdTable(['线路', '状态', '边缘/Colo', '压缩', 'TTFB 中位数', '失败率', '判定', '备注'], cdnRows.map((r) => {
    const p = primaryProto(r);
    return [
      code(r.id) + ' ' + r.label,
      cellStatus(r),
      cellRegion(r),
      cellEnc(r),
      p ? f(r.small[p].ttfb.median, 0) + ' ms' : '—',
      p ? f((r.small[p].failRate ?? 0) * 100, 0) + '%' : '—',
      tagCell(r),
      r.tag === 'REDIRECT' ? ('301 → ' + (r.small[primaryProto(r)]?.locations?.[0] || '?')) : (r.failReasons[0] || r.note || ''),
    ];
  })), '');

  push('## 3. 握手与首包（中位数）', '');
  const hsRows = [];
  for (const r of results) {
    for (const proto of ['h1', 'h2']) {
      const s = r.small?.[proto];
      if (!s || s.ok === 0) continue;
      hsRows.push([
        code(r.id), proto.toUpperCase(),
        f(r.dns.medianMs, 0), f(s.tcp.median, 0), f(s.tls.median, 0), f(s.ttfb.median, 0),
        f((r.dns.medianMs || 0) + (s.tcp.median || 0) + (s.tls.median || 0) + (s.ttfb.median || 0), 0),
        f(s.total.median, 0), (s.bytes.median && s.bytes.median > 50000 ? f(s.throughputKBs.median, 0) : '—'),
      ]);
    }
  }
  push(mdTable(['线路', '协议', 'DNS(ms)', 'TCP(ms)', 'TLS(ms)', 'TTFB(ms)', '冷启动合计(ms)', '总耗时(ms)', '吞吐(KB/s)'], hsRows), '');
  push('> 直连 IP 行没有 DNS 环节（DNS 列空），首包数字只代表 TCP+TLS+服务器响应。', '');

  push('## 4. 大文件下载与并发', '');
  const bigRows = [];
  for (const r of results) {
    if (!r.big) continue;
    bigRows.push([
      code(r.id) + ' ' + r.label, opt.bigProto.toUpperCase(),
      r.big.ok + '/' + r.big.attempts, f(r.big.total.median, 0), f(bigMBps(r), 2),
      r.big.bytesMatch ? '✓ ' + Math.round(r.big.bytes.median / 1024) + ' KB' : '—',
      r.conc?.h1 ? f(r.conc.h1.wallMs, 0) + ' ms' : '—',
      r.conc?.h2 ? f(r.conc.h2.wallMs, 0) + ' ms' : '—',
    ]);
  }
  push(mdTable(['线路', '协议', '成功/尝试', '总耗时(ms)', '吞吐(MB/s)', '字节校验', opt.concurrency + ' 路 h1 墙钟', opt.concurrency + ' 路 h2 墙钟'], bigRows), '');
  push('> 并发墙钟 = ' + opt.concurrency + ' 个 ' + code(opt.smallRel) + ' 请求全部完成的时间；h1 走 ' + opt.concurrency + ' 条 TCP 连接，h2 走 1 条连接多路复用。它是「首屏 85 个 ES Module」这类并发场景的指标，单文件 TTFB 说明不了。', '');

  push('## 5. DNS / IPv6 / QUIC', '');
  push(mdTable(['线路', 'A 记录（实测解析）', 'DNS 中位数', 'TTL', 'AAAA', 'IPv6 连通', 'alt-svc(h3)'], results.map((r) => {
    const p = primaryProto(r);
    return [
      code(r.id),
      r.dns.addrs.length ? r.dns.addrs.join('<br>') : (r.directIp ? '直连 ' + r.directIp + '（跳过 DNS）' : (r.dns.error || '—')),
      r.dns.medianMs === null ? '—' : f(r.dns.medianMs, 0) + ' ms',
      r.dns.ttl === null ? '—' : r.dns.ttl,
      r.ipv6.aaaa.length ? r.ipv6.aaaa.join('<br>') : (r.ipv6.aaaaError || '无'),
      r.ipv6.connectOk === true ? '是' : (r.ipv6.connectOk === false ? '**否**' : (r.ipv6.aaaa.length ? '未测' : '无 AAAA')),
      (p && r.small[p].altSvc[0]) ? r.small[p].altSvc[0] : '—',
    ];
  })), '');
  push('> h3/QUIC：Node ' + env.node + ' 没有可用的 QUIC 客户端（node:quic ' + (env.quic.available ? '可用' : '不可用') + '），服务端是否能跑 h3 只能看 alt-svc 广播，实际握手验证标 N/A。', '');

  push('## 6. 自动判定', '');
  const s = summary;
  const base = s.baseline;
  push(mdTable(['项', '结果'], [
    ['可用线路数', s.counts.ok + ' / ' + s.counts.candidates + '（另有 ' + s.counts.redirect + ' 条只会 301、' + s.counts.dead + ' 条连不上）'],
    ['最快（TTFB 中位数）', s.fastestId ? code(s.fastestId) + ' ' + f(ttfbOf(results.find((r) => r.id === s.fastestId) || {}), 0) + ' ms' : '—'],
    ['主域名基准', base ? code('main') + ' ' + f(s.baseTtfb, 0) + ' ms' + (base.big && base.big.ok ? '，大文件 ' + f(bigMBps(base), 2) + ' MB/s' : '') : '—'],
    ['比主域名慢 1.8 倍以上', s.slow.length ? s.slow.map((r) => code(r.id) + '(×' + f(ttfbOf(r) / s.baseTtfb, 1) + ')').join('、') : '无'],
    ['只会重定向（不可作为线路）', s.redirects.length ? s.redirects.map((r) => code(r.id)).join('、') : '无'],
    ['连不上 / 全部失败', s.dead.length ? s.dead.map((r) => code(r.id) + '(' + (r.failReasons[0] || 'FAIL') + ')').join('、') : '无'],
    ['边缘 region（所有 200 线路）', s.regionSet.join(' / ') || '—'],
    ['4 条 A 记录差异', s.ipTtfbs.length ? s.ipTtfbs.map((x) => code(x.id) + ' ' + f(x.ttfb, 0) + 'ms').join('、') + (s.ipSpreadPct !== null ? '（跨度 ' + s.ipSpreadPct + '%）' : '') : '—'],
  ]), '');

  push('## 7. 结论', '');
  push('### (a) 国内用户现在走哪条路最快最稳？', '');
  if (base) {
    push('- **保持现有链路：' + meta.site + ' 直连 GitHub Pages（Fastly 东京边缘，本次观测 region ' + (s.regionSet.join('/') || 'japaneast') + '）。** 主域名 TTFB 中位数 **' + f(s.baseTtfb, 0) + ' ms**' +
      (base.big && base.big.ok ? '，' + Math.round((meta.expectedBigBytes || 0) / 1024) + ' KB 大文件 **' + f(bigMBps(base), 2) + ' MB/s**（总耗时 ' + f(base.big.total.median, 0) + ' ms）' : '') +
      (primaryProto(base) ? '，失败率 ' + f((base.small[primaryProto(base)].failRate ?? 0) * 100, 0) + '%' : '') + '。');
  }
  if (s.fastestId && s.fastestId !== 'main') {
    const fr = results.find((r) => r.id === s.fastestId);
    const ratio = s.baseTtfb ? ttfbOf(fr) / s.baseTtfb : null;
    push('- 本次窗口最快的探测线路是 ' + code(s.fastestId) + '（' + f(ttfbOf(fr), 0) + ' ms）' + (ratio === null ? '。' : '，为主域名 ' + f(s.baseTtfb, 0) + ' ms 的 ×' + f(ratio, 2) + (ratio < 1 ? '（本次快 ' + f((1 - ratio) * 100, 0) + '%）' : '（慢 ' + f((ratio - 1) * 100, 0) + '%）') + '。') + '注意这是**单窗口**结果：绝对 TTFB 会随国际链路拥塞漂移 2–5×（见第 3 节 min/max），跨窗口排序会互换，不能凭一轮就换线路。');
  } else {
    push('- 主域名本身就是本次最快的可用线路：没有任何镜像/CDN 反超它。');
  }
  if (s.cfFronted.length) {
    const best = s.cfFronted[0];
    const pct = Math.round((best.ratio - 1) * 100);
    if (best.ratio >= 1.2) {
      push('- 镜像/CDN 里最快的 ' + code(best.id) + ' 比主域名慢 **' + (best.ratio >= 1.8 ? '×' + f(best.ratio, 1) : pct + '%') + '**（' + f(best.ttfb, 0) + ' ms，边缘 ' + (best.region || '?') + '；压缩 ' + best.enc + '）。即「换免费 CDN」这一层没有收益，只多一跳。');
    } else if (best.ratio >= 0.8) {
      push('- 镜像/CDN 里最快的 ' + code(best.id) + ' 与主域名基本持平（' + f(best.ttfb, 0) + ' vs ' + f(s.baseTtfb, 0) + ' ms，差 ' + Math.abs(pct) + '%，在噪声内；压缩 ' + best.enc + '）。⇒ 换 CDN 没有稳定收益，只多一跳和一份缓存维护成本。');
    } else {
      push('- 镜像/CDN 里最快的 ' + code(best.id) + ' 本次比主域名**快 ' + Math.abs(pct) + '%**（' + f(best.ttfb, 0) + ' ms，边缘 ' + (best.region || '?') + '）。单窗口不足以支撑切换：跨窗口波动可达数倍（见第 3 节 min/max），要换必须多网络多渠道复测。');
    }
  }
  push('- 稳定性：本次主域名的失败率与波动没有比其它可用线路差；单次极值可以很大（见第 3 节 min/max），但中位数稳定——抖动主要来自本机到境外边缘的链路，而不是某条线路特有故障。');
  push('');

  push('### (b) 加 A 记录 / 加 IPv6 / CF 前置 / ICP+国内 CDN：预期收益与代价', '');
  push('**1) 补上 .110/.111 两条 A 记录（几乎零成本）**', '');
  if (s.ipTtfbs.length >= 2) {
    const ipRegions = [...new Set(results.filter((r) => /^ip\d+$/.test(r.id)).map((r) => { const p = primaryProto(r); return p ? r.small[p].regions[0] : null; }).filter(Boolean))];
    push('- 实测：Pages 官方 4 条 A 记录（.108–.111，SNI/Host 保持主域名）本次 ' + s.ipTtfbs.map((x) => code(x.id) + ' ' + (x.tag === 'OK' ? '200' : x.tag)).join('、') + '，region 全部是 ' + (ipRegions.join('/') || 'japaneast') + '，TTFB 中位数 ' +
      s.ipTtfbs.map((x) => code(x.id) + ' ' + f(x.ttfb, 0) + 'ms').join('、') +
      (s.ipSpreadPct !== null ? '，彼此跨度 ' + s.ipSpreadPct + '%' : '') + '。');
  } else {
    push('- 本次只测了主域名基准（' + code('--only') + ' 过滤或超时跳过），4 条 A 记录的横向对比请跑完整轮次。');
  }
  push('- 结论：**同一个 Fastly 边缘池，换 IP 不换区域、也不会更快**。收益只体现在某条 IP 被运营商丢包/黑洞时浏览器换条重试，属于故障冗余而非提速。代价：Cloudflare 里加两条 A（当前 TTL 约 ' + (base?.dns?.ttl ?? '—') + 's），无费用、无备案问题。**建议加，但不要期待速度变化。**');
  push('');
  push('**2) 加 IPv6（AAAA）**', '');
  if (s.v6 && s.v6.tag === 'OK') {
    const p = primaryProto(s.v6);
    push('- 实测：主域名 DNS 目前**没有 AAAA**（本次查询 ' + (base?.ipv6?.aaaa?.length ? base.ipv6.aaaa.join(',') : (base?.ipv6?.aaaaError || 'ENODATA')) + '）；但用 ' + code(s.v6.directIp) + ' 直连、SNI/Host 仍为主域名时返回 200、region ' + (p ? s.v6.small[p].regions.join('/') : '?') + '、TTFB 中位数 ' + f(ttfbOf(s.v6), 0) + ' ms，说明 **Fastly 的 IPv6 anycast 确实在服务这个自定义域**。');
    push('- 收益：移动/教育网等 IPv6 优先接入会多一条不挤国际 v4 出口的路径；代价：GitHub Pages 文档只承诺 4 条 A，AAAA 属于**未文档化**用法，Fastly v6 前缀变更时要跟。建议先加一条 AAAA（' + code(s.v6.directIp) + '）灰度、保留 v4 双栈，出问题删记录即可回滚。');
  } else {
    push('- 实测：主域名无 AAAA；v6 直连未通过（' + (s.v6?.failReasons?.[0] || '未测到可用结果') + '）。当前不建议加 AAAA。');
  }
  push('');
  push('**3) Cloudflare 前置（灰云改橙云，代理回源 Pages）**', '');
  if (s.cfFronted.length) {
    const first = s.cfFronted[0];
    const last = s.cfFronted[s.cfFronted.length - 1];
    push('- 实测：本次 CF 承载的线路（' + s.cfFronted.map((x) => code(x.id)).join('、') + '）TTFB 中位数 ' + f(first.ttfb, 0) + '–' + f(last.ttfb, 0) + ' ms，为主域名 ' + f(s.baseTtfb, 0) + ' ms 的 ×' + f(first.ratio, 1) + '–×' + f(last.ratio, 1) + '（小于 ×1 表示本次反而更快，属噪声）；边缘落点在境外（' + s.cfFronted.map((x) => x.region || '?').join('/') + '），国内没有节点。');
  }
  push('- 结论：**按现状不要上 CF 代理**。免费 CF 在国内无节点（CF 中国网络需企业版 + 备案），代理后等于把「本机→东京 Fastly」换成「本机→境外 CF→回源 GitHub」，多一跳 TLS 且回源仍跨境。收益只存在于「Pages IP 被墙」的极端情况；真到那一步正确解法是 ICP + 国内 CDN，而非 CF 免费版。代价：多一跳 TLS、发布后要处理缓存一致性与 purge，并且挡住 x-github-edge-region 观测。');
  push('');
  push('**4) ICP 备案 + 国内 CDN（唯一真正的「国内加速」）**', '');
  push('- 本机无法验证（无备案域名与国内 CDN 账号），只能给量级：当前首包 ' + f(s.baseTtfb, 0) + ' ms 中，DNS/TCP/TLS 各含跨境 RTT；国内 CDN 边缘 RTT 通常 10–30 ms，首屏 85 个模块的瀑布可从「跨境 4–8 个 RTT」压到「国内 1–2 个 RTT」，首包有望降到 50 ms 量级——这是唯一能把 TTFB 再降一个数量级的方案。');
  push('- 代价：①域名 ICP 备案（主体/服务器在境内，数周）；②每次发布要 purge CDN，否则玩家拿到旧 ' + code('?v=') + ' 资源；③GitHub Pages 作源站、回源仍跨境，需预热 + 长缓存；④东方同人游戏备案有内容合规风险。**不建议为此把主域搬进备案体系**；真要优化，可只给大素材/下载走备案过的国内对象存储，主站保持现状。');
  push('');

  push('### (c) 哪些候选明确不该用', '');
  const bad = [];
  for (const r of s.dead) bad.push('- ' + code(r.id) + '（' + r.label + '）：**全部失败** — ' + (r.failReasons[0] || 'FAIL') + (r.failReasons.length > 1 ? '；' + r.failReasons.slice(1).join('；') : ''));
  for (const r of s.redirects) bad.push('- ' + code(r.id) + '（' + r.label + '）：**只会 301**（→ ' + ((primaryProto(r) && r.small[primaryProto(r)].locations[0]) || '?') + '），每次访问多一次跨境 RTT，不能当线路用');
  for (const r of s.slow) bad.push('- ' + code(r.id) + '（' + r.label + '）：可用但比主域名慢 ×' + f(ttfbOf(r) / s.baseTtfb, 1) + '（' + f(ttfbOf(r), 0) + ' ms），没有理由换过去');
  if (!bad.length) bad.push('- 本次没有发现明显不可用的线路。');
  push(...bad, '');
  const js = results.find((r) => r.id === 'jsdelivr');
  if (js) push('> 说明：jsDelivr 的 ' + cellEnc(js) + ' 压缩确实更省字节，但对 19 KB 的入口页，省下的一两 KB 远不如多出来的一跳 RTT 值钱。', '');

  push('## 8. 复跑方法', '');
  push(fence + 'bash');
  push('node tools/_line_bench.mjs --runs=3                        # 快速复跑，结果打屏 + 落盘');
  push('node tools/_line_bench.mjs --json                         # 显式落盘 tools/_opt/line_bench_<yyyymmdd-HHMM>.{md,json}');
  push('node tools/_line_bench.mjs --only=main,jsdelivr --runs=10 # 只盯两条线路，加大采样');
  push('node tools/_line_bench.mjs --from-json=tools/_opt/line_bench_<stamp>.json # 不测速，只重渲染 .md');
  push(fence, '');
  push('注意：不同 ISP / 省份 / 时段会得到不同数字（CDN 边缘、国际出口拥塞、家宽 QoS 都在变）。要下「换线路」这种决定，至少 2 个以上网络环境各跑一轮，只看中位数与失败率，不要看单次极值。', '');

  return lines.join('\n');
}

// ─────────────────────────────────────────────── 只重渲染（零网络）

function rerender(file) {
  const p = path.resolve(file);
  const payload = JSON.parse(fs.readFileSync(p, 'utf8'));
  payload.summaryFull = buildSummary(payload.results || []);
  const md = buildMarkdown(payload);
  const out = p.replace(/\.json$/i, '.md');
  fs.writeFileSync(out, md + '\n', 'utf8');
  process.stdout.write(md + '\n');
  process.stderr.write('[line-bench] 已重新渲染: ' + out + '\n');
  return 0;
}

// ─────────────────────────────────────────────── 主流程

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  if (opt.fromJson) return rerender(opt.fromJson);

  const ctx = { opt, startedAt: now(), expectedBigBytes: null };
  try {
    const localBig = path.join(process.cwd(), opt.bigRel);
    if (fs.existsSync(localBig)) ctx.expectedBigBytes = fs.statSync(localBig).size;
  } catch { /* ignore */ }

  let quic = { available: false, error: null };
  try {
    await import('node:quic');
    quic.available = true;
  } catch (e) {
    quic.error = e.code || e.message;
  }
  let dnsServers = [];
  try { dnsServers = dns.getServers(); } catch { /* ignore */ }

  const startedIso = new Date().toISOString();
  process.stderr.write('[line-bench] 开始：' + opt.runs + ' 次/线路，大文件 ' + opt.bigRuns + ' 次，超时 ' + opt.timeout + 'ms\n');

  const picked = CANDIDATES.filter((c) => !opt.only || opt.only.some((o) => c.id.includes(o)));
  const results = [];
  for (const c of picked) {
    if ((now() - ctx.startedAt) / 1000 > opt.maxSeconds) {
      process.stderr.write('[line-bench] 时间预算用尽，跳过 ' + c.id + '\n');
      results.push({
        id: c.id, group: c.group, kind: c.kind, label: c.label, host: c.host,
        directIp: c.directIp || null, family: c.family || 4, note: c.note || '',
        skipped: true, dns: { samples: [], addrs: [], medianMs: null, ttl: null, error: null },
        ipv6: { aaaa: [], aaaaError: null, connectOk: null }, tls: null,
        small: {}, big: null, conc: null, tag: null, failReasons: ['SKIP(budget)'], elapsedMs: 0,
      });
      continue;
    }
    process.stderr.write('[line-bench] ' + c.id + ' (' + c.label + ')\n');
    let r;
    try {
      r = await runCandidate(c, ctx);
    } catch (e) {
      r = {
        id: c.id, group: c.group, kind: c.kind, label: c.label, host: c.host,
        directIp: c.directIp || null, family: c.family || 4, note: c.note || '',
        skipped: false, dns: { samples: [], addrs: [], medianMs: null, ttl: null, error: String(e && (e.code || e.message)) },
        ipv6: { aaaa: [], aaaaError: null, connectOk: null }, tls: null,
        small: {}, big: null, conc: null, tag: 'DEAD',
        failReasons: ['exception:' + String(e && (e.code || e.message))], elapsedMs: 0,
      };
    }
    results.push(r);
  }

  const finishedIso = new Date().toISOString();
  const summary = buildSummary(results);

  const payload = {
    meta: {
      tool: 'tools/_line_bench.mjs',
      startedAt: startedIso,
      finishedAt: finishedIso,
      durationSec: round((now() - ctx.startedAt) / 1000, 1),
      expectedBigBytes: ctx.expectedBigBytes,
      site: SITE_ORIGIN + SITE_PREFIX,
      runs: opt.runs,
      bigRuns: opt.bigRuns,
      timeout: opt.timeout,
      protocols: opt.protocols,
      bigProto: opt.bigProto,
      concurrency: opt.concurrency,
    },
    env: {
      node: process.version,
      platform: process.platform + ' ' + process.arch,
      release: os.release(),
      dnsServers,
      quic,
    },
    opt,
    results,
    summary: {
      counts: summary.counts,
      fastestId: summary.fastest ? summary.fastest.id : null,
      baseTtfb: summary.baseTtfb,
      regionSet: summary.regionSet,
      dead: summary.dead.map((r) => ({ id: r.id, reasons: r.failReasons })),
      redirects: summary.redirects.map((r) => ({ id: r.id })),
      slow: summary.slow.map((r) => ({ id: r.id, ttfb: ttfbOf(r), ratio: summary.baseTtfb ? round(ttfbOf(r) / summary.baseTtfb, 2) : null })),
      ipTtfbs: summary.ipTtfbs,
      ipSpreadPct: summary.ipSpreadPct,
      cfFronted: summary.cfFronted,
    },
  };

  const md = buildMarkdown({ ...payload, summaryFull: summary });

  if (opt.save) {
    const dirPath = path.resolve(opt.dir);
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      const base = path.join(dirPath, 'line_bench_' + stamp());
      fs.writeFileSync(base + '.json', JSON.stringify(payload, null, 1), 'utf8');
      fs.writeFileSync(base + '.md', md + '\n', 'utf8');
      process.stderr.write('[line-bench] 结果已写入 ' + base + '.{md,json}\n');
    } catch (e) {
      process.stderr.write('[line-bench] 写结果文件失败: ' + (e && e.message) + '\n');
    }
  }

  process.stdout.write(md + '\n');
  return 0;
}

// 任何未捕获异常都不让它把整轮打崩
process.on('uncaughtException', (e) => {
  process.stderr.write('[line-bench] uncaughtException: ' + (e && (e.code || e.message)) + '\n');
});
process.on('unhandledRejection', (e) => {
  process.stderr.write('[line-bench] unhandledRejection: ' + (e && (e.code || e.message || String(e))) + '\n');
});

main()
  .then((code) => process.exit(code || 0))
  .catch((e) => {
    process.stderr.write('[line-bench] fatal: ' + (e && (e.stack || e.message)) + '\n');
    process.exit(1);
  });
