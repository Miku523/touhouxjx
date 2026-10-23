# -*- coding: utf-8 -*-
import sys, os
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M

BASE = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                    '6 - The Embodiment of Scarlet Devil')
FILES = [
    ('pre1_honou', '2. A Soul that is Red, like a Ground Cherry (ZUN).mid'),
    ('stage1_youma', '3. Apparitions Stalk the Night (ZUN).mid'),
]

for tag, fn in FILES:
    path = os.path.join(BASE, fn)
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    bpm = M.bpm_of(segs)
    print('=' * 70)
    print(tag, '|', fn)
    print('division', div, 'tempo segs', len(segs), 'bpm', bpm)
    for s in segs[:6]:
        print('   seg', s)
    for ch in sorted(chans):
        c = chans[ch]
        ns = c['notes']
        if not ns:
            print('  ch%02d progs=%s EMPTY' % (ch, c.get('progs')))
            continue
        tmax = max(n['t'] for n in ns)
        mmin = min(n['m'] for n in ns)
        mmax = max(n['m'] for n in ns)
        print('  ch%02d n=%4d t=0..%7.2f pitch %d..%d progs=%s' % (ch, len(ns), tmax, mmin, mmax, c.get('progs')))
