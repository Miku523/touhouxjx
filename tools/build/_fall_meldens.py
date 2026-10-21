# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
mel = []
for ch in (0,1,2,3,4,10):
    mel += [dict(t=n['t'], m=n['m'], ch=ch, d=n['d']) for n in chans[ch]['notes']]
mel.sort(key=lambda n: n['t'])
print('每 4 秒的旋律候选音数（ch0/1/2/3/4/10 合计）与最高音：')
for a in range(0, 200, 4):
    seg = [n for n in mel if a <= n['t'] < a+4]
    top = max((n['m'] for n in seg), default=0)
    print('  %3d-%3ds  %2d 音  最高 %d  前几个 %s' % (a, a+4, len(seg), top, ' '.join(str(n['m']) for n in seg[:10])))
