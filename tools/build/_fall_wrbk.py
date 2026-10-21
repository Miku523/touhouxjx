# -*- coding: utf-8 -*-
import sys, os, glob
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith'
for name in ('8. Fall of Fall ~ Autumnal Waterfall (Wrbk).mid',):
    p = os.path.join(base, name)
    if not os.path.exists(p):
        print('缺少', name); continue
    print('==', name)
    chans, segs, div = M.extract_channels(M.parse_midi(p))
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns: continue
        t0 = min(n['t'] for n in ns); t1 = max(n['t']+n['d'] for n in ns)
        print('ch%-2d %-10s %4d 音 %d-%d 起 %.2f 止 %.2f' % (ch, str(chans[ch]['progs']), len(ns), min(n['m'] for n in ns), max(n['m'] for n in ns), t0, t1))
    for ch in sorted(chans)[:8]:
        ns = chans[ch]['notes']
        if len(ns) < 10: continue
        first = sorted(ns, key=lambda n: n['t'])[:10]
        print('  ch%d 前 10 (t,m):' % ch, [(round(n['t'],2), n['m']) for n in first])
