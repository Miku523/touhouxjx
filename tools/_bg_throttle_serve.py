"""临时弱网探针服务器：只在 /art/gen/bg/ 上做限速，其它路径全速。

用途：本地并没有用户那条 50KB/s 的烂网络，CDP 限速又会把整个首屏一起压慢、
量出来的数字全是启动阶段的噪声。这里只压背景图（高清档单张 135–460KB、
低清档 30–80KB），就能干净地量出「进关到画面出来」要多久。

用法: python .tmp_shots/_throttle_serve.py 8300 [KB/s]
"""
import http.server
import os
import socketserver
import sys
import time
import traceback

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8300
RATE = (float(sys.argv[2]) if len(sys.argv) > 2 else 50.0) * 1024.0   # 字节/秒
ROOT = sys.argv[3] if len(sys.argv) > 3 else None
LQ_ONLY = len(sys.argv) > 4 and sys.argv[4] == 'lqonly'
SLOW_MARK = '/art/gen/bg/'


class Threaded(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        # lqonly：高清档一律 404，用来单独验证「只有低清档」时的合成结果
        if LQ_ONLY and SLOW_MARK in (self.path or '') and '_lq' not in (self.path or ''):
            self.send_response(404)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        super().do_GET()

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionError, TimeoutError, OSError):
            self.close_connection = True

    def copyfile(self, source, outputfile):
        slow = SLOW_MARK in (self.path or '')
        if not slow:
            try:
                super().copyfile(source, outputfile)
            except (ConnectionError, TimeoutError, OSError):
                pass
            return
        # 分块吐，按 RATE 限速；一块 ~4KB，睡够这一块的发送时间
        chunk = 4096
        try:
            while True:
                data = source.read(chunk)
                if not data:
                    break
                t0 = time.time()
                outputfile.write(data)
                outputfile.flush()
                need = len(data) / RATE - (time.time() - t0)
                if need > 0:
                    time.sleep(need)
        except (ConnectionError, TimeoutError, OSError):
            pass


def serve():
    if ROOT:
        os.chdir(ROOT)
    else:
        os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with Threaded(('127.0.0.1', PORT), Handler) as httpd:
        print(f'serving on http://127.0.0.1:{PORT} (bg {RATE / 1024:.0f}KB/s)', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    try:
        serve()
    except KeyboardInterrupt:
        pass
    except Exception:
        traceback.print_exc()
        sys.exit(1)
