"""启动幕门禁 QA 专用静态服务器：no-store + 可注入 404 的路径子串。

和 tools/serve_nocache.py 同源的实现（多线程、no-store、静默日志、吞浏览器掐连接
的 ConnectionError），额外能力：

  * 指定服务目录（argv / --root / env GATE_ROOT）
  * 对「路径里包含某个子串」的请求返回 404（可多个；--404 / env GATE_404）
  * 打印每条被注入 404 的请求，作为失败场景的证据

用法（等价三种，任选）：

  python tools/_gate_failserver.py --port 8144 --root _gate/qa_after --404 src/game/stage.js
  python tools/_gate_failserver.py 8144 _gate/qa_after src/game/stage.js
  GATE_PORT=8144 GATE_ROOT=_gate/qa_after GATE_404="src/game/stage.js" python tools/_gate_failserver.py

只监听 127.0.0.1；默认不写访问日志。
"""
from __future__ import annotations

import argparse
import functools
import http.server
import os
import socketserver
import sys
import traceback
import urllib.parse

DEFAULT_PORT = 8144
DEFAULT_ROOT = '.'


def _split_patterns(values: list[str]) -> list[str]:
    """--404 可重复；env 里允许逗号 / 分号分隔。"""
    out: list[str] = []
    for raw in values or []:
        for piece in str(raw).replace(';', ',').split(','):
            piece = piece.strip()
            if piece:
                out.append(piece)
    return out


class GateHandler(http.server.SimpleHTTPRequestHandler):
    """静态服务 + 命中 blocklist 的路径直接 404。"""

    # ES module 必须 text/javascript；Windows 注册表可能把 .js 映射成别的 MIME。
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.html': 'text/html; charset=utf-8',
        '.svg': 'image/svg+xml',
    }

    # 多线程 + 长连接：49 个 ES module 并发拉取时不会被串行化拖死。
    protocol_version = 'HTTP/1.1'

    # 由 make_server() 注入
    block_patterns: tuple[str, ...] = ()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def _blocked(self) -> str | None:
        path = urllib.parse.unquote(self.path.split('?', 1)[0].split('#', 1)[0])
        for pat in self.block_patterns:
            if pat in path:
                return pat
        return None

    def _send_404(self, pat: str):
        body = f'gate-failserver: injected 404 for "{pat}"\n'.encode('utf-8')
        try:
            sys.stdout.write(f'[gate-404] {self.command} {self.path} (匹配 {pat!r})\n')
            sys.stdout.flush()
        except Exception:
            pass
        try:
            self.send_response(404)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)
        except (ConnectionError, TimeoutError, OSError):
            self.close_connection = True

    def do_GET(self):
        pat = self._blocked()
        if pat is not None:
            self._send_404(pat)
            return
        super().do_GET()

    def do_HEAD(self):
        pat = self._blocked()
        if pat is not None:
            self._send_404(pat)
            return
        super().do_HEAD()

    # 浏览器导航 / 关标签 / reload 会中途掐断连接，Windows 上会冒成
    # ConnectionAbortedError / ConnectionResetError，不该把整个 server 带走。
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


class Threaded(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(port: int, root: str, patterns: list[str]) -> Threaded:
    root = os.path.abspath(root)

    class BoundGateHandler(GateHandler):
        block_patterns = tuple(patterns)

    handler = functools.partial(BoundGateHandler, directory=root)
    return Threaded(('127.0.0.1', port), handler)


def parse_args(argv: list[str]):
    p = argparse.ArgumentParser(
        description='HKS 启动幕门禁 QA 静态服务器（no-store + 可注入 404）',
        epilog='也支持位置参数：PORT [ROOT] [PATTERN ...]',
    )
    p.add_argument('--port', type=int, default=None, help='监听端口（env GATE_PORT，默认 8144）')
    p.add_argument('--root', default=None, help='服务目录（env GATE_ROOT，默认当前目录）')
    p.add_argument('--404', dest='bads', action='append', default=None,
                   help='命中即返回 404 的路径子串，可重复（env GATE_404，逗号/分号分隔）')
    # 位置参数兼容：PORT [ROOT] [PATTERN ...]
    p.add_argument('positional', nargs='*', help=argparse.SUPPRESS)
    args = p.parse_args(argv)

    pos = list(args.positional)
    port = args.port
    root = args.root
    bads = list(args.bads or [])

    if pos:
        if port is None:
            try:
                port = int(pos.pop(0))
            except ValueError:
                p.error(f'位置参数 PORT 不是整数: {pos[0]!r}')
        if pos and root is None:
            root = pos.pop(0)
        bads.extend(pos)

    if port is None:
        port = int(os.environ.get('GATE_PORT') or DEFAULT_PORT)
    if root is None:
        root = os.environ.get('GATE_ROOT') or DEFAULT_ROOT
    bads = _split_patterns(bads + [os.environ.get('GATE_404') or ''])
    return port, root, bads


def main(argv: list[str] | None = None) -> int:
    port, root, patterns = parse_args(sys.argv[1:] if argv is None else argv)
    if not os.path.isdir(root):
        print(f'[gate-failserver] 目录不存在: {root}', file=sys.stderr, flush=True)
        return 2
    try:
        httpd = make_server(port, root, patterns)
    except OSError as e:
        print(f'[gate-failserver] 端口 {port} 无法监听: {e}', file=sys.stderr, flush=True)
        return 3
    with httpd:
        print(
            f'[gate-failserver] serving http://127.0.0.1:{port} root={os.path.abspath(root)} '
            f'no-store 404={patterns or "[]"}',
            flush=True,
        )
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        pass
    except Exception:
        traceback.print_exc()
        sys.exit(1)
