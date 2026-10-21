# -*- coding: utf-8 -*-
import sys, os, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
bar = 60.0*4/163.0
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def chord(ts, w=1.30):
    pcs = collections.Counter()
    for ch in (5,7,8):
        for n in chans[ch]['notes']:
            if ts <= n['t'] < ts+w: pcs[n['m']%12] += 1
    return [NAMES[p] for p,_ in pcs.most_common(4)]
def melody(ts, w=1.30):
    out=[]
    for ch in (0,1,2):
        for n in chans[ch]['notes']:
            if ts <= n['t'] < ts+w: out.append((round(n['t'],2), n['m']))
    return sorted(out)[:8]
print('小节边界（4.05 + k*%.4f）上的和弦：' % bar)
for k in range(0, 20):
    t = 4.05 + k*bar
    print('  k=%2d t=%6.2f  %s' % (k, t, chord(t)))
print()
print('主体结束候选（body 27.61 + n 小节）的和弦：')
for n in (28, 30, 31, 32, 33, 34, 36):
    t = 27.61 + n*bar
    print('  n=%2d t=%6.2f  %s   下一小节旋律 %s' % (n, t, chord(t), melody(t, 1.0)[:4]))
