
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
file = r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid'
midi = M.parse_midi(os.path.join(M.SRC_BASE, file))
chans, segs, div = M.extract_channels(midi)
for ch in [1,2,3,4,5,6,8,10,11,12,13,15]:
    notes = chans[ch]['notes']
    seg = [n for n in notes if 20.0 <= n['t'] < 26.0]
    s = ' '.join('%s/%d/%.2f' % (M.num(n['t']), n['m'], n['d']) for n in seg[:26])
    print('ch%-2d prog%-3d %s' % (ch, M.main_prog(chans[ch]['progs']), s))
