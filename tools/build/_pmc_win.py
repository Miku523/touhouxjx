# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
base = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\6 - Arranges'
p = os.path.join(base, "IOSYS - Cirno's Perfect Math Class (ShinkoNet).mid")
chans, segs, div = M.extract_channels(M.parse_midi(p))
bpm = M.bpm_of(segs); bar=4*60/bpm
t0, t1 = 56*bar, 72*bar
print('窗口 %.1f-%.1f s' % (t0, t1))
for ch in (1, 2, 4, 5, 10, 12, 14):
    ns=[n for n in chans[ch]['notes'] if t0 <= n['t'] < t1]
    if not ns: continue
    mono = M.mono_ize(ns, keep='high')
    print('ch%-2d 音数 %-4d mono后 %-4d 音域 %d-%d 序列: %s' % (ch, len(ns), len(mono), min(n['m'] for n in ns), max(n['m'] for n in ns),
          ' '.join(str(n['m']) for n in mono[:40])))
