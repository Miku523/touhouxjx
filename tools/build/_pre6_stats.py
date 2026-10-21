# -*- coding: utf-8 -*-
# 音域统计 / 调性 / 末小节
import os, sys, collections
import numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
p = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                 '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
chans, segs, div = M.extract_channels(M.parse_midi(p))
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
for ch in (0, 3, 6, 7, 9, 15):
    ns = chans[ch]['notes']
    hist = collections.Counter()
    for n in ns:
        hist[round(n['d'], 3)] += 1
    pc = collections.Counter()
    for n in ns:
        pc[n['m'] % 12] += n['d']
    tot = sum(pc.values())
    print('ch%-2d n=%-4d 音级 %s' % (ch, len(ns), ' '.join('%s%.0f%%' % (NAMES[k], 100*v/tot) for k, v in pc.most_common(5))))
    if ch == 3:
        above = [n for n in ns if n['m'] > 96]
        print('    >96 的音 %d 个 (%.0f%%)' % (len(above), 100.0*len(above)/len(ns)))
        print('    >96 时刻(bar):', sorted({round(n['t']/ (4*60/162), 1) for n in above})[:20])
ns3 = sorted(chans[3]['notes'], key=lambda n: n['t'])
print('末 16 音 ch3:', ' '.join('%s@%.2f' % (NAMES[n['m']%12]+str(n['m']//12-1), n['t']) for n in ns3[-16:]))
print('末 12 音 ch0:', ' '.join('%s@%.2f' % (NAMES[n['m']%12]+str(n['m']//12-1), n['t']) for n in sorted(chans[0]['notes'], key=lambda n: n['t'])[-12:]))
