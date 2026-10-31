
import sys, os, collections
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/9 - Phantasmagoria of Flower View'
BAR = 60/154*4
for name in ['11. Wind God Girl (rongns_2).mid']:
    m = M2.parse_midi(os.path.join(BASE, name))
    ch, segs, div = M2.extract_channels(m)
    print('===', name, 'BAR=%.4f' % BAR)
    # per-bar counts per channel
    bars = collections.defaultdict(lambda: collections.Counter())
    for ci in sorted(ch):
        for n in ch[ci]['notes']:
            b = int(n['t'] / BAR) + 1
            bars[b][ci] += 1
    chans = sorted(ch)
    print('bar  ' + ' '.join('ch%d' % c for c in chans))
    for b in sorted(bars):
        if b > 130: break
        print('%3d  ' % b + ' '.join('%4d' % bars[b][c] for c in chans))
