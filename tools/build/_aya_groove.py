# -*- coding: utf-8 -*-
"""打印贝斯(ch10/12)、钢琴(ch2)的 16 格节奏，用于提取律动。"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m): return '%s%d' % (NAMES[m % 12], m//12-1)
MID = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
       r'\1 - Shooter Games\9 - Phantasmagoria of Flower View'
       r'\11. Wind God Girl (Kanade_KND34).mid')
midi = parse_midi(MID); chans, segs, div = extract_channels(midi)
bpm = 60.0/(segs[0][2]/1e6); step = 60.0/bpm/4

def q(ch):
    out = {}
    for n in chans[ch]['notes']:
        s = round(n['t']/step); b, si = divmod(s, 16)
        out.setdefault(b, []).append((si, n['m'], n['v'], round(n['d']/step, 1)))
    return out

def show(ch, b0, b1, label):
    qq = q(ch)
    print('\n### %s ch%d 小节 %d-%d' % (label, ch, b0, b1))
    for b in range(b0, b1):
        ns = sorted(qq.get(b, []))
        if not ns: print('B%03d | (空)' % b); continue
        cells = {}
        for si, m, v, ls in ns:
            cells.setdefault(si, []).append('%s/%d' % (nm(m), v))
        print('B%03d | %s' % (b, ' '.join(('%-7s' % ' '.join(cells.get(i, ['..'])))[:7] for i in range(16))))

show(10, 1, 9, '贝斯')
show(12, 1, 9, '贝斯2')
show(2, 1, 9, '钢琴')
show(9, 1, 9, '低音管风琴')
