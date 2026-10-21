# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
import numpy as np
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom'
path = BASE + r'\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'
midi = M.parse_midi(path)
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs); bar = 4*60/bpm
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pc(m): return NAMES[m % 12]

def dump(ch, b0, b1, label):
    print('\n##### %s ch%d bars %d-%d' % (label, ch, b0, b1))
    for b in range(b0, b1):
        t0, t1 = b*bar, (b+1)*bar
        ns = [n for n in chans[ch]['notes'] if t0 - 1e-6 <= n['t'] < t1]
        if not ns: print('bar%02d  ---' % b); continue
        ns.sort(key=lambda n: n['t'])
        top = [n for n in ns if n['m'] >= max(x['m'] for x in ns) - 2]
        seq = ' '.join('%s%.2f' % (pc(n['m']), (n['t']-t0)/(bar/16)) for n in top)
        print('bar%02d top | %s' % (b, seq[:150]))
dump(0, 0, 20, 'piano')
dump(0, 32, 48, 'piano')
dump(2, 40, 56, 'lead80')
dump(7, 47, 60, 'lead80#2')
dump(3, 8, 24, 'EP')
