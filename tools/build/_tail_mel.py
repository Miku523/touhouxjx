# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
def top(t0, t1, chs):
    d = {}
    for ch in chs:
        for n in chans[ch]['notes']:
            if t0 <= n['t'] < t1:
                k = round(n['t'], 2); d[k] = max(d.get(k, 0), n['m'])
    return [(k, v) for k, v in sorted(d.items())]
print('主体末尾 + 尾声区（74.73-86.51），ch2 单声部 vs ch0+ch1+ch2+ch3 顶声部：')
for t0 in range(0, 12, 2):
    a = 74.73 + t0; b = a + 2
    print(' %5.2f-%5.2f  ch2 %s' % (a, b, [v for _, v in top(a, b, [2])]))
    print('              merged %s' % [v for _, v in top(a, b, [0,1,2,3])])
print()
print('主体 52-56 对应原曲时间：', '74.73 之前两小节 = 71.78-74.73')
for t0 in (71.78, 73.25, 74.73, 76.20, 77.67):
    print('  %6.2f  ch2 %s' % (t0, [v for _, v in top(t0, t0+1.47, [2])]))
    print('        merged %s' % [v for _, v in top(t0, t0+1.47, [0,1,2,3])])
