# -*- coding: utf-8 -*-
import sys, os
sys.path.insert(0, os.path.join(os.getcwd(), 'tools'))
import midi2js as M
from collections import Counter
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '12. The Young Descendant of Tepes (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
mel = sorted([n for n in chans[12]['notes'] if n['m'] >= 55], key=lambda n: n['t'])
har = sorted(chans[13]['notes'], key=lambda n: n['t'])
print('mel', len(mel), 'har', len(har))
# 每个主旋律音找最近的 harm 音（时间差 < 0.2s）
inter = Counter(); ex = []
for n in mel:
    best = min(har, key=lambda h: abs(h['t'] - n['t']))
    if abs(best['t'] - n['t']) < 0.25:
        iv = (n['m'] - best['m']) % 12
        inter[iv] += 1
        if iv in (1,2,6,11,5,7) and len(ex) < 12:
            ex.append((round(n['t'],2), n['m'], best['m'], iv))
print('主旋律-和声 音程(mod12) 直方:', dict(sorted(inter.items())))
print('刺耳例子:', ex)
# 同时看 harm 与 和弦ch3 的关系
ch3 = sorted(chans[3]['notes'], key=lambda n: n['t'])
print('harm 前 20 音:', [(round(h['t'],2), h['m'], round(h['d'],2)) for h in har[:20]])
print('ch3 前 12 音:', [(round(c['t'],2), c['m']) for c in ch3[:12]])
