#!/usr/bin/env python
"""为 index.html 生成 <link rel="modulepreload"> 列表。

国内（尤其中国大陆到 GitHub Pages 东京边缘，RTT ~220ms）首访时，Chromium 的 ES module
瀑布是一条一条波次展开的：main.js 下来后才请求它的直接依赖，直接依赖下来后才请求下一层。
实测 82 个模块分 4 波，每波 ≈1 RTT（350–450ms），光模块排队就吃掉 1.5–2s。

本脚本静态解析入口的 import 图（只跟相对路径、只收 .js），把每个模块都在 head 里
提前声明成 modulepreload，让所有模块从 HTML 解析阶段就开始并行下载。

用法：
    python tools/gen_modulepreload.py            # 只报告：模块数、总字节、当前 index.html 是否一致
    python tools/gen_modulepreload.py --write    # 写回 index.html（用 modulepreload:start/end 标记块）
    python tools/gen_modulepreload.py --check    # 不一致时 exit 1（可当发布前检查）
"""
import argparse
import os
import posixpath
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
START = '<!-- modulepreload:start'
END_MARK = '<!-- modulepreload:end'

SCRIPT_RE = re.compile(r"""<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']""", re.I)
# 静态 import / export ... from（动态 import() 是刻意延后的，不预载）
FROM_RE = re.compile(r"""\b(?:from|import)\s*['"](\.[^'"]*)['"]""")


def entry_specs(html):
    m = SCRIPT_RE.search(html)
    if not m:
        raise SystemExit('index.html 里找不到 <script type="module" src=...>')
    raw = m.group(1)
    path, _, query = raw.partition('?')
    return path, ('?' + query if query else '')


def read_text(rel):
    with open(os.path.join(ROOT, rel.replace('/', os.sep)), 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def deps_of(rel):
    out = []
    for spec in FROM_RE.findall(read_text(rel)):
        spec = spec.split('?')[0].split('#')[0]
        if not spec.endswith('.js'):
            continue
        nxt = posixpath.normpath(posixpath.join(posixpath.dirname(rel), spec))
        if nxt.startswith('..') or not os.path.isfile(os.path.join(ROOT, nxt.replace('/', os.sep))):
            continue
        out.append(nxt)
    return out


def graph(entry):
    """BFS，按依赖顺序返回去重后的模块列表（入口排第一）。"""
    order = [entry]
    seen = {entry}
    i = 0
    while i < len(order):
        for d in deps_of(order[i]):
            if d not in seen:
                seen.add(d)
                order.append(d)
        i += 1
    return order


def render(modules, version_query):
    lines = [START + '（tools/gen_modulepreload.py 生成，勿手改） -->']
    for idx, rel in enumerate(modules):
        query = version_query if idx == 0 else ''
        lines.append('  <link rel="modulepreload" href="./%s%s" />' % (rel, query))
    lines.append('  ' + END_MARK + ' -->')
    return '\n'.join(lines)


def apply(html, block):
    start = html.find(START)
    if start >= 0:
        end = html.find('-->', html.find(END_MARK, start))
        if end < 0:
            raise SystemExit('index.html 里的 modulepreload 块缺少结束标记')
        return html[:start] + block + html[end + 3:]
    head = html.find('</head>')
    if head < 0:
        raise SystemExit('index.html 里找不到 </head>')
    return html[:head] + block + '\n' + html[head:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='写回 index.html')
    ap.add_argument('--check', action='store_true', help='只校验，不一致 exit 1')
    args = ap.parse_args()

    with open(INDEX, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()
    entry_path, version_query = entry_specs(html)
    entry = posixpath.normpath(entry_path.lstrip('./'))
    if not os.path.isfile(os.path.join(ROOT, entry.replace('/', os.sep))):
        raise SystemExit('入口文件不存在: ' + entry)

    modules = graph(entry)
    total = 0
    for rel in modules:
        try:
            total += os.path.getsize(os.path.join(ROOT, rel.replace('/', os.sep)))
        except OSError:
            pass
    block = render(modules, version_query)
    patched = apply(html, block)

    print('入口: ./%s%s' % (entry, version_query))
    print('模块: %d 个，源码 %.1f KB（未压缩）' % (len(modules), total / 1024.0))
    for rel in modules[:8]:
        print('  ./' + rel)
    if len(modules) > 8:
        print('  … 其余 %d 个' % (len(modules) - 8))

    if args.write:
        if patched != html:
            with open(INDEX, 'w', encoding='utf-8', newline='\n') as f:
                f.write(patched)
            print('已写入 index.html（modulepreload:start/end 标记块）')
        else:
            print('index.html 已是最新，无需改动')
        return 0

    same = patched == html
    print('index.html 与当前 import 图一致: %s' % ('是' if same else '否（跑 --write 更新）'))
    if args.check and not same:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
