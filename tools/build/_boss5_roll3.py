# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
import numpy as np
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
midi = M.parse_midi(BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60/bpm
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pn(m): return NAMES[m%12] + str(m//12-1)
# 前 8 小节所有通道，按时间合并
print('=== bars 0-8 全部事件（每音）===')
for b in range(0, 8):
    t0 = b*bar
    evs = []
    for ch, c in chans.items():
        if ch == 9: continue
        for n in c['notes']:
            if t0-1e-6 <= n['t'] < t0+bar:
                evs.append((n['t'], ch, n['m'], n['d']))
    evs.sort()
    s = ' '.join('%g|ch%d:%s' % (round((t-t0)/(bar/16),1), ch, pn(m)) for t, ch, m, d in evs)
    print('b%02d %s' % (b, s[:400]))
