# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
midi = M.parse_midi(f); chans, segs, div = M.extract_channels(midi)
bar = 4*60/163.0
for ch in (5, 6, 7, 8):
    ns = chans[ch]['notes']
    per = {}
    for n in ns:
        per.setdefault(int(n['t']/bar)//8, []).append(n)
    row = ' '.join('%d:%d' % (b*8, len(per[b])) for b in sorted(per))
    print('ch%-2d 音数 %4d  每8小节: %s' % (ch, len(ns), row))
# ch0 与 各段的对应：看 4.05-27.6 的 ch5 和弦
import collections
seg = [n for n in chans[5]['notes'] if 4.05 <= n['t'] < 4.05+16*bar]
print('ch5 在 4.05-27.6s 音数', len(seg))
