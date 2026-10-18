"""Dev server: same as http.server but sends no-store so the browser never caches modules."""
import http.server
import socketserver
import sys
import traceback

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8138


class Threaded(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
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

