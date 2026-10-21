# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
BASE = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
midi = M.parse_midi(BASE + r'\7 - Perfect Cherry Blossom\13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid')
segs = M.build_tempo_map(midi['tracks'], midi['division'])
div = midi['division']
print('div', div, 'bars: 4*div =', 4*div, 'total ticks', max(ev[0] for tr in midi['tracks'] for ev in tr['events']))
# tick-based notes per channel
from collections import defaultdict, Counter
notes = defaultdict(list)
for tr in midi['tracks']:
    pending = defaultdict(list)
    progs = {}
    for ev in tr['events']:
        if ev[1] == 'prog':
            progs[ev[2]] = ev[3]
        elif ev[1] == 'on':
            pending[(ev[2], ev[3])].append((ev[0], ev[4]))
        elif ev[1] == 'off':
            st = pending.get((ev[2], ev[3]))
            if st:
                on, vel = st.pop(0)
                notes[ev[2]].append((on, max(ev[0], on+1), ev[3], vel))
for ch in sorted(notes):
    notes[ch].sort()
def bar_of(tick): return tick / (4*div)
for ch in (1, 3, 4, 7, 10, 14):
    print('ch%d' % ch, 'first bar %.2f last bar %.2f n=%d' % (bar_of(notes[ch][0][0]), bar_of(notes[ch][-1][0]), len(notes[ch])))
print()
print('=== ch4 bass bars per 4 ===')
for b in range(0, 88, 4):
    c = sum(1 for n in notes[4] if b <= bar_of(n[0]) < b+4)
    print('%2d-%2d:%3d' % (b, b+3, c), end='  ')
print()
print()
print('=== bars 32-40 每小节各通道音数 ===')
for b in range(32, 41):
    row = []
    for ch in (0,1,3,4,5,6,7,9,10,11,12,14,15):
        c = sum(1 for n in notes[ch] if b <= bar_of(n[0]) < b+1)
        row.append('c%d:%d' % (ch, c))
    print('b%d ' % b + ' '.join(row))
print()
print('=== ch4 bars 32-40 逐音（低音） ===')
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def pn(m): return NAMES[m%12] + str(m//12-1)
for b in range(32, 40):
    ns = [n for n in notes[4] if b <= bar_of(n[0]) < b+1]
    print('b%d %s' % (b, ' '.join('%s' % pn(n[2]) for n in ns[:16])))
