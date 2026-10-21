# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
midi = M.parse_midi(f)
chans, segs, div = M.extract_channels(midi)
bar = 4*60/163.0
ch0 = sorted(chans[0]['notes'], key=lambda n: n['t'])
print('ch0 prog', chans[0]['progs'], '音数', len(ch0), '首', round(ch0[0]['t'],2), '末', round(ch0[-1]['t'],2))
segs8 = {}
for n in ch0:
    b = int(n['t'] / bar) // 8
    segs8.setdefault(b, []).append(n)
for b in sorted(segs8):
    ns = segs8[b]
    print('  小节 %2d-%2d (%5.1f-%5.1fs): %3d 音, 音域 %d-%d' % (b*8, b*8+7, b*8*bar, (b*8+8)*bar, len(ns), min(n['m'] for n in ns), max(n['m'] for n in ns)))
print('前 20 音:', [(round(n['t'],2), n['m'], round(n['d'],2)) for n in ch0[:20]])
late = [n for n in ch0 if n['t'] > 80]
print('80s 后首音:', [(round(n['t'],2), n['m']) for n in late[:10]])
