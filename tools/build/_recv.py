# -*- coding: utf-8 -*-
"""本地文件接收器：浏览器把 base64 数据 POST 过来，写入磁盘。

用法：python tools/build/_recv.py 8799
POST /save?name=xxx.mid  body=base64
"""
import base64
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'midi')


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST,OPTIONS')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = (q.get('name') or ['out.bin'])[0]
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n)
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, name)
        with open(path, 'wb') as f:
            f.write(base64.b64decode(body))
        print('saved %s  %d bytes' % (path, os.path.getsize(path)), flush=True)
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok')

    def log_message(self, fmt, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
    print('listening', port, flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
