# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\10 - Mountain of Faith\8. Fall of Fall ~ Autumnal Waterfall (Samidare).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
def ns(ch): return [dict(t=n['t'], m=n['m'], d=n['d'], v=n['v']) for n in chans[ch]['notes']]
m_all = ns(0)+ns(1)+ns(2)+ns(3)
mono = M.mono_ize(m_all, keep='high')
mono.sort(key=lambda n: n['t'])
print('合并 ch0/1/2/3 顶声部：%d 音' % len(mono))
bar = 1.4724
for a in range(24, 80, 4):
    seg = [n for n in mono if a <= n['t'] < a+4]
    print('  %3d-%3ds %2d 音  %s' % (a, a+4, len(seg), ' '.join(str(n['m']) for n in seg[:12])))
print('---- 27.61 之后是否存在 >1.5s 的空洞 ----')
seg = [n for n in mono if n['t'] >= 27.0]
gaps = []
for i in range(1, len(seg)):
    g = seg[i]['t'] - seg[i-1]['t']
    if g > 1.5: gaps.append((round(seg[i-1]['t'],2), round(g,2)))
print(gaps[:12])
