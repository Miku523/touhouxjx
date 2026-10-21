# -*- coding: utf-8 -*-
import sys, json
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
def dump(ch, b0, b1):
    print('\n===== ch%d bars %d-%d =====' % (ch, b0, b1))
    for b in range(b0, b1):
        t0 = b*bar
        ns = sorted([n for n in chans[ch]['notes'] if t0-1e-6 <= n['t'] < t0+bar], key=lambda n: (n['t'], n['m']))
        s = ' '.join('%d:%s(%s)' % (round((n['t']-t0)/(bar/16), 2), pn(n['m']), n['d']) for n in ns)
        print('b%02d %s' % (b, s))
dump(0, 8, 14)
dump(3, 8, 12)
dump(10, 8, 12)
dump(1, 8, 12)
