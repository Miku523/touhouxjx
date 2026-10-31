# -*- coding: utf-8 -*-
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, s): open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='').write(s)
src = open(os.path.join(HERE, '_docs.py'), encoding='utf-8').read()
part = src.split('# ---- 1. musicTracks.js ----')[0]
ns = {'__file__': os.path.join(HERE, '_docs.py')}
exec(part, ns)
ZH_TITLE, ZH_ORIG, ZH_NOTE, jsq = ns['ZH_TITLE'], ns['ZH_ORIG'], ns['ZH_NOTE'], ns['jsq']
mt = rd('src/game/musicTracks.js')
pat = re.compile(r"  \{\n    key: 'stage2',.*?\n  \},\n", re.S)
block = ("  {\n    key: 'stage2',\n    no: '05',\n    title: '" + jsq(ZH_TITLE) + "',\n"
         "    sub: '莉格露·奈特巴格',\n    cat: 'STAGE 2',\n    place: '魔法森林 · 萤火夜雾',\n"
         "    orig: '" + jsq(ZH_ORIG) + "',\n    tone: '#8ff0b0',\n    glow: '143, 240, 176',\n"
         "    time: 119.2,\n    note:\n      '" + jsq(ZH_NOTE) + "',\n  },\n")
mt2, n = pat.subn(lambda m: block, mt, count=1)
assert n == 1
wr('src/game/musicTracks.js', mt2)
print('fixed', len(mt2))