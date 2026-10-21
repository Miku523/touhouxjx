# -*- coding: utf-8 -*-
import sys, os, collections
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
bar = 60.0*4/163.0
N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def chord(ts, w=1.25):
    c = collections.Counter()
    for ch in (5,7,8):
        for n in chans[ch]['notes']:
            if ts <= n['t'] < ts+w: c[n['m']%12]+=1
    return [N[p] for p,_ in c.most_common(4)]
def mel(ts, w=1.25):
    d={}
    for ch in (0,1,2):
        for n in chans[ch]['notes']:
            if ts <= n['t'] < ts+w:
                k=round(n['t'],2); d[k]=max(d.get(k,0), n['m'])
    return [(k,v) for k,v in sorted(d.items())][:6]
print('主体之后（74.73 起）各小节的和弦 / 旋律：')
for k in range(0, 14):
    t = 74.73 + k*bar
    print('  k=%2d t=%6.2f %s   melody %s' % (k, t, chord(t), mel(t)))
