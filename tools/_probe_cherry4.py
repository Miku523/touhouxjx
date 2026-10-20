
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
file = r'6 - The Embodiment of Scarlet Devil\2. A Soul that is Red, like a Ground Cherry (ZUN).mid'
midi = M.parse_midi(os.path.join(M.SRC_BASE, file))
chans, segs, div = M.extract_channels(midi)
cands = [1,2,3,5,6,7,4,8,10,11,12]
labels = {1:'bass',2:'dist',3:'horn',5:'trump',6:'pianoHi',7:'violin',4:'epHi',8:'marimba',10:'gtA',11:'gtB',12:'pianoX'}
bins = 5
print('bin(s)  ' + '  '.join('%6s' % labels[c] for c in cands))
for b in range(0, 90, bins):
    row = []
    for c in cands:
        n = sum(1 for x in chans[c]['notes'] if b <= x['t'] < b+bins)
        row.append('%6d' % n)
    print('%3d-%3d ' % (b, b+bins) + '  '.join(row))
