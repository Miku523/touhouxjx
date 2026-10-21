# -*- coding: utf-8 -*-
import sys, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom\11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def dedupe(i):
    d = {}
    for n in chans[i]['notes']:
        k = round(n['t'], 2)
        d.setdefault(k, []).append((n['m'], round(n['d'], 2)))
    return [(k, sorted(v)) for k, v in sorted(d.items())]
for ch in (0, 6, 1):
    print('\n=== ch%d 去重后（时刻: 音列表）===' % ch)
    dd = dedupe(ch)
    for k, v in dd[:24]:
        print('  %6.2f  %s' % (k, v))
print()
# 各通道音级分布（duration 加权）判断调性
for ch in (0, 3, 5, 6, 1, 2):
    ns = chans[ch]['notes']
    h = collections.Counter()
    for n in ns: h[n['m'] % 12] += n['d']
    tot = sum(h.values()) or 1
    print('ch%-2d 音级: %s' % (ch, '  '.join('%s%.0f%%' % (N[p], 100*v/tot) for p, v in h.most_common(5))))
