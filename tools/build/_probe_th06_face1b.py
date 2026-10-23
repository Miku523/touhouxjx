# -*- coding: utf-8 -*-
import sys, os
from collections import Counter
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
    midi = M.parse_midi(os.path.join(BASE, fn))
    chans, segs, div = M.extract_channels(midi)
    print('=' * 78)
    print(tag, fn, 'div', div, 'bpm', M.bpm_of(segs), 'segs', len(segs))
    q = 4.0 * div
    total_tick = max(n['t'] for c in chans.values() for n in c['notes'])
    # bar = 4 beats
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns:
            continue
        onsets = sorted(set(round(n['t'], 3) for n in ns))
        durs = [n['d'] for n in ns]
        # polyphony per onset
        by_t = Counter(round(n['t'], 3) for n in ns)
        poly = sum(1 for v in by_t.values() if v > 1) / max(1, len(by_t))
        pcs = Counter(n['m'] % 12 for n in ns)
        top = ' '.join('%02d:%d' % (k, v) for k, v in pcs.most_common(4))
        print('  ch%02d progs=%-6s n=%4d onsets=%4d dur=%.2f poly=%.2f pitch=%d..%d pc[%s]'
              % (ch, chans[ch].get('progs'), len(ns), len(onsets),
                 sum(durs) / len(durs), poly,
                 min(n['m'] for n in ns), max(n['m'] for n in ns), top))
    # section energy: notes per 4-bar window on drums
    print('  -- 每 4 小节内容（lead候选与鼓）--')
