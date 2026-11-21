# 临时工具：style.css 机械去重（只删「被同作用域同选择器后出现的同属性」覆盖掉的声明）。
# 用法: python tools/_css_merge.py src/style.css out.css
import re
import sys


def parse(text):
    """返回规则列表: [(scope_chain_tuple, selector, [(prop, important, start, end)])]"""
    rules = []

    def scan(start, end, chain):
        i = start
        prelude_start = i
        while i < end:
            ch = text[i]
            if text.startswith('/*', i):
                j = text.find('*/', i + 2)
                i = end if j < 0 else j + 2
                continue
            if ch in '"\'':
                quote = ch
                i += 1
                while i < end and text[i] != quote:
                    i += 2 if text[i] == '\\' else 1
                i += 1
                continue
            if ch == '@' or ch not in '{}':
                i += 1
                continue
            if ch == '}':
                i += 1
                continue
            # ch == '{'
            prelude = re.sub(r'/\*.*?\*/', ' ', text[prelude_start:i], flags=re.S).strip()
            body_start = i + 1
            depth = 1
            j = body_start
            while j < end and depth:
                c = text[j]
                if text.startswith('/*', j):
                    k = text.find('*/', j + 2)
                    j = end if k < 0 else k + 2
                    continue
                if c in '"\'':
                    quote = c
                    j += 1
                    while j < end and text[j] != quote:
                        j += 2 if text[j] == '\\' else 1
                    j += 1
                    continue
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                j += 1
            body_end = j - 1
            if prelude.startswith('@'):
                inner = (chain + (prelude,)) if '{' in text[body_start:body_end + 1] else chain
                scan(body_start, body_end, chain + (prelude,))
                # @keyframes 等内部不再当作选择器
                if re.match(r'@(media|supports|layer|container)', prelude):
                    pass
            else:
                decls = []
                k = body_start
                d_start = k
                depth2 = 0
                while k <= body_end:
                    c = text[k] if k < body_end else ';'
                    if c in '"\'':
                        quote = c
                        k += 1
                        while k < body_end and text[k] != quote:
                            k += 2 if text[k] == '\\' else 1
                        k += 1
                        continue
                    if text.startswith('/*', k):
                        k = text.find('*/', k + 2)
                        k = body_end if k < 0 else k + 2
                        continue
                    if c == '(':
                        depth2 += 1
                    elif c == ')':
                        depth2 -= 1
                    elif c == ';' and depth2 == 0:
                        chunk = text[d_start:k]
                        if chunk.strip() and ':' in chunk:
                            prop = chunk.split(':', 1)[0].strip().lower()
                            decls.append((prop, '!important' in chunk.lower(), d_start, k + 1))
                        d_start = k + 1
                    k += 1
                rules.append((chain, ' '.join(prelude.split()), decls))
            i = body_end + 1
            prelude_start = i

    scan(0, len(text), ())
    return rules


def main(src, dst):
    text = open(src, encoding='utf-8').read()
    rules = parse(text)
    last = {}   # (chain, selector) -> {prop: (important, start, end)}
    dead = []
    for chain, selector, decls in rules:
        bucket = last.setdefault((chain, selector), {})
        for prop, imp, start, end in decls:
            prev = bucket.get(prop)
            if prev is not None:
                prev_imp, pstart, pend = prev
                if prev_imp == imp or imp:
                    dead.append((pstart, pend, prop, selector))
            bucket[prop] = (imp, start, end)
    dead.sort()
    keep = []
    for span in dead:
        if keep and span[0] < keep[-1][1]:
            continue
        keep.append(span)
    dropped = len(dead) - len(keep)
    for start, end, prop, sel in reversed(keep):
        text = text[:start] + text[end:]
    print(f'removed {len(keep)} overridden declarations (skipped {dropped} overlapping)')
    assert text.count('{') == text.count('}'), 'brace imbalance after merge'
    print(f'braces {text.count("{")}/{text.count("}")}')
    open(dst, 'w', encoding='utf-8', newline='\n').write(text)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
