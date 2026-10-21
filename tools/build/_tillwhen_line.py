# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom\11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def line(i, t0, t1, take='low'):
    d = {}
    for n in chans[i]['notes']:
        if t0 <= n['t'] < t1:
            k = round(n['t'], 2)
            d.setdefault(k, []).append(n['m'])
    out = []
    for k in sorted(d):
        v = sorted(d[k])
        out.append(N[v[0] % 12] if take == 'low' else N[v[-1] % 12])
    return ' '.join(out)
for ch in (0, 3, 6):
    print('\n=== ch%d 低音线（按 8 秒窗口）===' % ch)
    for t0 in range(0, 108, 8):
        s = line(ch, t0, t0 + 8, 'low')
        if s: print(' %3d-%3d  %s' % (t0, t0 + 8, s[:150]))
