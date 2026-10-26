// tools/_serve_h2.mjs —— 生产近似的本地静态服务：HTTP/2 + gzip + GitHub Pages 风格 MIME。
// 为什么要它：GitHub Pages 走 HTTP/2（多路复用）并对文本资源 gzip；本地
// python http.server 是 HTTP/1.1 且不压缩，用它测首屏会把 85 个 ES module 的
// 瀑布放大好几倍，modulepreload 之类「省 RTT」的改动收益会被彻底淹没。
//
// 用法：
//   node tools/_serve_h2.mjs [--port=8443] [--root=.] [--cert=..] [--key=..]
// 首次先签一张自签证书（_pt/ 已 gitignore）：
//   mkdir -p _pt/certs && MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
//     -keyout _pt/certs/key.pem -out _pt/certs/cert.pem -subj "/CN=127.0.0.1" \
//     -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
// 浏览器必须带 --ignore-certificate-errors（tools/_net_probe.mjs --insecure 已带）。
import { createSecureServer } from 'node:http2';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve } from 'node:path';

const arg = (n, d) => { const hit = process.argv.find((a) => a.startsWith('--' + n + '=')); return hit ? hit.slice(n.length + 3) : d; };
const PORT = Number(arg('port', 8443));
const ROOT = resolve(arg('root', '.'));
const CERT = resolve(arg('cert', '_pt/certs/cert.pem'));
const KEY = resolve(arg('key', '_pt/certs/key.pem'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt']);
const cache = new Map();

/** 读文件；文本类按 GitHub Pages 的做法 gzip 一次后缓存（key 带 mtime+size） */
function load(pathname, gzip) {
  const st = statSync(pathname);
  const key = pathname + '|' + st.mtimeMs + '|' + st.size + '|' + (gzip ? 1 : 0);
  const hit = cache.get(key);
  if (hit) return hit;
  const buf = readFileSync(pathname);
  const ext = extname(pathname).toLowerCase();
  let body = buf, enc = null;
  if (gzip && COMPRESS.has(ext) && buf.length > 512) {
    body = gzipSync(buf, { level: 6 });
    enc = 'gzip';
  }
  const entry = { body, enc, ext };
  cache.set(key, entry);
  if (cache.size > 500) cache.clear();
  return entry;
}

function onStream(stream, headers) {
  const safeEnd = (payload) => { try { stream.end(payload); } catch (e) { /* 客户端已断开 */ } };
  try {
    if (headers[':method'] !== 'GET' && headers[':method'] !== 'HEAD') {
      stream.respond({ ':status': 405 }); return safeEnd();
    }
    let pathname = decodeURIComponent((headers[':path'] || '/').split('?')[0]);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const full = normalize(join(ROOT, pathname));
    if (!full.startsWith(ROOT)) { stream.respond({ ':status': 403 }); return safeEnd(); }
    let target = full;
    if (existsSync(full) && statSync(full).isDirectory()) target = join(full, 'index.html');
    if (!existsSync(target) || !statSync(target).isFile()) {
      stream.respond({ ':status': 404, 'content-type': 'text/plain; charset=utf-8' });
      return safeEnd('404 ' + pathname);
    }
    const gzip = /gzip/.test(String(headers['accept-encoding'] || ''));
    const { body, enc, ext } = load(target, gzip);
    const h = {
      ':status': 200,
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': body.length,
      // 与 Pages 一样允许 10 分钟客户端缓存；探针里会整体关缓存
      'cache-control': 'max-age=600',
      vary: 'Accept-Encoding',
    };
    if (enc) h['content-encoding'] = enc;
    stream.respond(h);
    if (headers[':method'] === 'HEAD') return safeEnd();
    safeEnd(body);
  } catch (e) {
    try { stream.respond({ ':status': 500 }); } catch (e2) { /* ignore */ }
    safeEnd('500 ' + e.message);
  }
}

const server = createSecureServer({ key: readFileSync(KEY), cert: readFileSync(CERT), allowHTTP1: false });
server.on('stream', (stream, headers) => {
  stream.on('error', () => { /* 客户端中途取消：忽略 */ });
  onStream(stream, headers);
});
server.on('sessionError', () => { /* TLS/协议错误忽略 */ });
server.on('error', (e) => { console.error('server error', e.message); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => console.log('h2 serve ' + ROOT + ' -> https://127.0.0.1:' + PORT + '/'));
