
import sys, os, collections
sys.path.insert(0, r'C:/Users/GuSheng/Downloads/HKS/tools')
import midi2js as M2
BASE = r'C:/Users/GuSheng/AppData/Local/Temp/thmidi/touhou-midi-collection-main/1 - Shooter Games/9 - Phantasmagoria of Flower View'
BAR = 60/154*4
m = M2.parse_midi(os.path.join(BASE, '11. Wind God Girl (Kanade_KND34).mid'))
ch, segs, div = M2.extract_channels(m)
bars = collections.defaultdict(lambda: collections.Counter())
for ci in sorted(ch):
    for n in ch[ci]['notes']:
        b = int(n['t'] / BAR + 1e-6) + 1
        bars[b][ci] += 1
chans = sorted(ch)
print('bar ' + ' '.join('ch%-2d' % c for c in chans) + '  tot')
for b in range(1, 233):
    row = bars.get(b, collections.Counter())
    tot = sum(row.values())
    if b <= 8 or (b % 8 == 1) or b > 220:
        print('%3d  ' % b + ' '.join('%4d' % row[c] for c in chans) + '  %d' % tot)
print()
print('每 8 小节总音数：')
for s in range(0, 232, 8):
    tot = sum(sum(bars.get(b, {}).values()) for b in range(s+1, s+9))
    print(' bars %3d-%3d: %5d' % (s+1, s+8, tot))
