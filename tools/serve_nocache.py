"""Dev server: same as http.server but sends no-store so the browser never caches modules."""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8138


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


# 注意：必须用多线程 server。单线程 TCPServer 遇到浏览器并发拉取十几个
# ES module 时会互相阻塞，导致 "Failed to fetch dynamically imported module"
# 这类假故障（页面白屏，其实是 dev server 扛不住，不是代码问题）。
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as httpd:
    print(f'serving on http://127.0.0.1:{PORT}', flush=True)
    httpd.serve_forever()
