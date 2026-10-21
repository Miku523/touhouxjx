# -*- coding: utf-8 -*-
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
BAR = 4*60/162.0
p = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                 '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
chans, segs, div = M.extract_channels(M.parse_midi(p))
for ch in (6, 7, 15):
    print('== ch%d %d 音' % (ch, len(chans[ch]['notes'])))
    for n in sorted(chans[ch]['notes'], key=lambda n: n['t'])[:60]:
        print('  bar%6.2f  %-4s d=%.2f v=%d' % (n['t']/BAR, NAMES[n['m']%12]+str(n['m']//12-1), n['d'], n['v']))
