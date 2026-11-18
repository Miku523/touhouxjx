import sys, os, collections
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
import midi2js as M

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')
FILES = [
 ('tillwhen', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'),
 ('border13', '13. Bloom Nobly, Ink-black Cherry Blossom ~ Border of Life (ZUN).mid'),
 ('border14', '14. Border of Life (ZUN).mid'),
]
out = []
for key, fn in FILES:
    path = os.path.join(SRC, fn)
    midi = M.parse_midi(path)
    chans, segs, div = M.extract_channels(midi)
    out.append('######## %s' % key)
    for ch in sorted(chans):
        ns = chans[ch]['notes']
        if not ns: continue
        hist = collections.Counter(n['m'] for n in ns)
        ps = sorted(hist)
        out.append('-- ch%d n=%d progs=%s' % (ch, len(ns), sorted(set(n['p'] for n in ns))))
        out.append('   pitches: %s' % ' '.join('%d:%d' % (p_, c) for p_, c in sorted(hist.items())))
        out.append('   first: %s' % ' '.join('%.2f/%d/%.2f/v%d' % (n['t'], n['m'], n['d'], n['v']) for n in ns[:14]))
        # velocity histogram coarse
        vh = collections.Counter((n['v']//16)*16 for n in ns)
        out.append('   vel: %s' % ' '.join('%d:%d' % (k, vh[k]) for k in sorted(vh)))
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'explore2_out.txt'), 'w', encoding='utf-8').write('\n'.join(out))
print('lines', len(out))
