# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
midi = M.parse_midi(f); chans, segs, div = M.extract_channels(midi)
bar = 4*60/163.0
print('通道 | program | 音数 | 音域 | 中位 | 起始-结束 | 音数/秒 | 20-40s 音数')
for ch in sorted(chans):
    ns = chans[ch]['notes']
    if not ns: continue
    t0 = min(n['t'] for n in ns); t1 = max(n['t']+n['d'] for n in ns)
    span = max(1e-6, t1-t0)
    mid = int(np_median := sorted(n['m'] for n in ns)[len(ns)//2])
    in2040 = sum(1 for n in ns if 20 <= n['t'] < 40)
    progs = chans[ch]['progs']
    print('ch%-2d | %-10s | %4d | %d-%d | %d | %6.1f-%6.1f | %.2f | %d' % (ch, str(progs), len(ns), min(n['m'] for n in ns), max(n['m'] for n in ns), mid, t0, t1, len(ns)/span, in2040))
