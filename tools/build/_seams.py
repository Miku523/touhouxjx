# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
def dump(t0, t1, label):
    pc = {}
    for ch in (0,1,2,5,7,8):
        for n in chans[ch]['notes']:
            if t0 <= n['t'] < t1:
                pc.setdefault(ch, []).append((round(n['t'],2), n['m'], round(n['d'],2)))
    print('==', label, '%.2f–%.2f' % (t0,t1))
    for ch, ns in pc.items():
        print('  ch%d %s' % (ch, ns[:14]))
dump(4.05, 6.6, 'intro 第1小节')
dump(8.6, 10.0, 'intro 末小节（第4小节）')
dump(27.61, 29.1, 'body 第1小节')
dump(30.5, 32.0, 'body 第2小节')
dump(56.0, 57.5, 'body 末段（第20小节附近）')
# 贝斯/和弦音级随时间
print('== 每小节和弦（bass+pad 音级）')
bar = 1.4724
import collections
for b in range(16):
    a = 4.05 + b*bar
    pcs = collections.Counter()
    for ch in (5,8,6):
        for n in chans[ch]['notes']:
            if a <= n['t'] < a+bar:
                pcs[n['m']%12] += 1
    print('  原始 %.2fs 小节%2d: %s' % (a, b, sorted(pcs)))
