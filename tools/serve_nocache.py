"""Dev server: same as http.server, no-store so the browser never caches modules, and gzip like GitHub Pages.

gzip 很关键：生产站点按 Accept-Encoding 压缩（main.js 211KB → 约 40KB），
不压缩的台架在限速网络下会把加载时间放大三到四倍，测出来的「弱网等待」是假的。
"""
import gzip
import http.server
import socketserver
import sys
import traceback

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8138


class Threaded(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


GZIP_TYPES = ('.js', '.css', '.html', '.json', '.svg', '.webmanifest', '.txt')


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if not path.endswith(GZIP_TYPES):
            return super().do_GET()
        if 'gzip' not in self.headers.get('Accept-Encoding', ''):
            return super().do_GET()
        try:
            f = open(self.translate_path(path), 'rb')
        except OSError:
            return super().do_GET()
        with f:
            raw = f.read()
        body = gzip.compress(raw, 6)
        if len(body) >= len(raw):
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    # 浏览器/无头 Chrome 会中途掐断连接（导航、关标签、reload），
    # 这些在 Windows 上会冒成 ConnectionAbortedError / ConnectionResetError，
    # 不该把整个 dev server 带走。
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionError, TimeoutError, OSError):
            self.close_connection = True

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionError, TimeoutError, OSError):
            pass


# 注意：必须用多线程 server。单线程 TCPServer 遇到浏览器并发拉取十几个
# ES module 时会互相阻塞，导致 "Failed to fetch dynamically imported module"
# 这类假故障（页面白屏，其实是 dev server 扛不住，不是代码问题）。
def serve():
    with Threaded(('127.0.0.1', PORT), Handler) as httpd:
        print(f'serving on http://127.0.0.1:{PORT}', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    try:
        serve()
    except KeyboardInterrupt:
        pass
    except Exception:
        traceback.print_exc()
        sys.exit(1)

