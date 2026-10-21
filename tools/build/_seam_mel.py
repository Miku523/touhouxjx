# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
def show(a, b, label):
    out = []
    for ch in (0,1,2,3):
        for n in chans[ch]['notes']:
            if a <= n['t'] < b: out.append((round(n['t'],2), n['m'], ch))
    out.sort()
    top = {}
    for t, m, ch in out:
        k = round(t,2)
        if k not in top or m > top[k][0]: top[k] = (m, ch)
    seq = [(k, v[0]) for k, v in sorted(top.items())]
    print('%s  %s' % (label, ' '.join('%s:%d' % (k, m) for k, m in seq[:16])))
show(73.25, 76.5, '主体末 73.25-76.5')
show(20.25, 23.5, '候选尾声首 20.25-23.5')
show(21.72, 24.0, '候选尾声首 21.72-24')
show(24.66, 27.61, '候选尾声末 24.66-27.61')
show(4.05, 7.0, '前奏首 4.05-7.0')
