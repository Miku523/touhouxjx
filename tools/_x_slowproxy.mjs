// 可控慢网/挂起/错误代理：8139 -> 8138，按 URL 类别注入延迟 / 挂起 / 状态码。
// 控制面：
//   GET /__ctl?cssDelay=12000&cssHang=1&cssStatus=404&jsHang=1&jsDelay=5000&htmlDelay=0&reset=1
//   GET /__log  -> JSON [{t,url,kind,status,bytes,ms,outcome}]
//   GET /__reset-> 清空配置与日志
// 只给 blank-screen 复现用，不参与游戏逻辑。
import { createServer, request } from 'node:http';

const PORT = Number(process.argv[2] || 8139);
const UP = { host: '127.0.0.1', port: Number(process.argv[3] || 8138) };

let cfg = { cssDelay: 0, cssHang: false, cssStatus: 0, jsDelay: 0, jsHang: false, jsStatus: 0, htmlDelay: 0, htmlHang: false, htmlStatus: 0 };
let log = [];
const reset = () => { cfg = { cssDelay: 0, cssHang: false, cssStatus: 0, jsDelay: 0, jsHang: false, jsStatus: 0, htmlDelay: 0, htmlHang: false, htmlStatus: 0 }; log = []; };
const kindOf = (p) => (p.endsWith('.css') ? 'css' : /\.m?js$/.test(p) ? 'js' : p.endsWith('.html') || p === '/' || p === '' ? 'html' : 'other');
const hung = new Set(); // 挂起中的 socket，用来在 reset 时统一释放

function ctl(req, res, u) {
  const q = new URL('http://x' + req.url).searchParams;
  if (u.pathname === '/__log') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify(log)); }
  if (u.pathname === '/__reset') { reset(); res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('reset'); }
  if (u.pathname === '/__ctl') {
    if (q.get('reset')) reset();
    for (const k of Object.keys(cfg)) {
      if (!q.has(k)) continue;
      const v = q.get(k);
      cfg[k] = typeof cfg[k] === 'number' ? Number(v) : (v === '1' || v === 'true');
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(cfg));
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
}

const srv = createServer((req, res) => {
  const u = new URL('http://x' + req.url);
  if (u.pathname.startsWith('/__')) return ctl(req, res, u);
  const kind = kindOf(u.pathname);
  const delay = cfg[kind + 'Delay'] || 0;
  const hang = cfg[kind + 'Hang'];
  const status = cfg[kind + 'Status'] || 0;
  const t0 = Date.now();
  const entry = { t: t0, url: req.url, kind, status: 0, bytes: 0, ms: 0, outcome: 'ok' };
  log.push(entry);
  if (log.length > 1500) log.splice(0, 500);
  const finish = (outcome) => { entry.outcome = outcome; entry.ms = Date.now() - t0; };

  if (hang) {
    finish('hang');
    res.on('close', () => hung.delete(res));
    hung.add(res);
    res.writeHead(200, { 'content-type': kind === 'css' ? 'text/css' : 'application/javascript', 'cache-control': 'no-store' });
    res.write('/* hanging */'); // 头发出去但永不结束 —— 模拟半开连接/极慢尾部
    return;
  }
  const go = () => {
    if (status) {
      entry.status = status; entry.bytes = 0;
      res.writeHead(status, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('proxy-injected ' + status);
      finish('status' + status);
      return;
    }
    const up = request({ host: UP.host, port: UP.port, path: req.url, method: req.method, headers: { ...req.headers, host: UP.host + ':' + UP.port } }, (r) => {
      entry.status = r.statusCode;
      const h = { ...r.headers };
      delete h['content-length'];
      h['cache-control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      res.writeHead(r.statusCode, h);
      r.on('data', (c) => { entry.bytes += c.length; res.write(c); });
      r.on('end', () => { finish('ok'); res.end(); });
    });
    up.on('error', () => { finish('uperr'); try { res.writeHead(502); res.end('upstream error'); } catch {} });
    req.pipe(up);
  };
  if (delay) setTimeout(go, delay); else go();
});

srv.listen(PORT, '127.0.0.1', () => console.log('slowproxy on ' + PORT + ' -> ' + UP.host + ':' + UP.port, flushIfAny()));
function flushIfAny() { return ''; }
