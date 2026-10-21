# -*- coding: utf-8 -*-
import os, sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
p = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                 '8 - Imperishable Night', '16. Voyage 1970 (ZUN).mid')
chans, segs, div = M.extract_channels(M.parse_midi(p))
bar = 4*60/162.0
ch3 = sorted(chans[3]['notes'], key=lambda n: n['t'])
ch9 = sorted(chans[9]['notes'], key=lambda n: n['t'])
ch0 = sorted(chans[0]['notes'], key=lambda n: n['t'])
for b in range(9, 25):
    t0, t1 = b*bar, (b+1)*bar
    ns = [n for n in ch3 if t0 <= n['t'] < t1]
    pcs = collections.Counter(n['m'] % 12 for n in ns)
    bass = [n for n in ch9 if t0 <= n['t'] < t1]
    broot = collections.Counter(n['m'] % 12 for n in bass).most_common(1)
    seq = ' '.join(NAMES[n['m']%12] + str(n['m']//12-1) for n in ns)
    print('bar %2d pcs=%d %s | bass %s' % (b, len(pcs), seq, broot))
print()
print('--- ch0 bar9 ---')
for n in [n for n in ch0 if 9*bar <= n['t'] < 10*bar][:24]:
    print('  ', NAMES[n['m']%12]+str(n['m']//12-1), round(n['t']-9*bar,3))
