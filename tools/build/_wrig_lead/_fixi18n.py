# -*- coding: utf-8 -*-
import os, json, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, s): open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='').write(s)
src = open(os.path.join(HERE, '_docs.py'), encoding='utf-8').read()
part = src.split('# ---- 1. musicTracks.js ----')[0]
ns = {'__file__': os.path.join(HERE, '_docs.py')}
exec(part, ns)
ZH_TITLE, ZH_ORIG, ZH_NOTE = ns['ZH_TITLE'], ns['ZH_ORIG'], ns['ZH_NOTE']
EN_TITLE, EN_ORIG, EN_NOTE = ns['EN_TITLE'], ns['EN_ORIG'], ns['EN_NOTE']
JA_TITLE, JA_ORIG, JA_NOTE = ns['JA_TITLE'], ns['JA_ORIG'], ns['JA_NOTE']
try:
    from opencc import OpenCC
    cc = OpenCC('s2twp')
    hant = lambda s: cc.convert(s)
except Exception:
    hant = lambda s: s
BAD = {'zh', ZH_TITLE, ZH_ORIG, ZH_NOTE}
KEYRE = re.compile(r'^(\"(?:[^\"\\\\]|\\\\.)*\")\\s*:')
TRIPLES = {'en': (EN_TITLE, EN_ORIG, EN_NOTE), 'ja': (JA_TITLE, JA_ORIG, JA_NOTE),
           'zh-hant': (hant(ZH_TITLE), hant(ZH_ORIG), hant(ZH_NOTE))}
for pack, tri in TRIPLES.items():
    p = 'src/i18n/packs/%s.js' % pack
    s = rd(p)
    out, removed = [], 0
    for line in s.split(chr(10)):
        m = KEYRE.match(line.strip())
        if m:
            try:
                key = json.loads(m.group(1))
            except Exception:
                key = None
            if key in BAD:
                removed += 1
                continue
        out.append(line)
    s = chr(10).join(out)
    add = ''.join(json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) + ',\n'
                  for k, v in zip((ZH_TITLE, ZH_ORIG, ZH_NOTE), tri))
    i = s.rfind('};')
    s = s[:i] + add + s[i:]
    wr(p, s)
    print(pack, 'removed', removed)