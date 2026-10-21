# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build')
import midi2js as M, importlib.util
spec = importlib.util.spec_from_file_location('g', r'C:\Users\GuSheng\Downloads\HKS\tools\boss5_yuuga.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
ch = g.load_notes(g.MID)
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pn(m): return NAMES[m%12]+str(m//12-1)
def voice(chs, bars, keep='high'):
    out=[]
    for b in bars:
        for c in chs:
            for n in ch[c]:
                if b <= n['bar'] < b+1: out.append((n['bar'], round(n['dbar'],2), n['m']))
    out.sort(key=lambda x:(x[0],x[1]))
    # 同刻取 top
    from collections import OrderedDict
    d=OrderedDict()
    for bar, db, m in out:
        k=(bar, db)
        d.setdefault(k, []).append(m)
    res=[]
    for k,v in d.items():
        v.sort()
        res.append((k[0], k[1], v[-1] if keep=='high' else v[0], len(v)))
    return res
for b in range(56, 61):
    hi = voice([2,7],[b],'high')
    print('b%d top: %s' % (b, ' '.join(pn(m) for _,_,m,_ in hi)))
    print('     ch2-only %d times, ch7-only %d, both %d' % (
        len(voice([2],[b],'high')), len(voice([7],[b],'high')),
        len([1 for k in set((round(n['bar'],2), round(n['dbar'],2)) for n in ch[2] if b<=n['bar']<b+1)
             & set((round(n['bar'],2), round(n['dbar'],2)) for n in ch[7] if b<=n['bar']<b+1)])))
