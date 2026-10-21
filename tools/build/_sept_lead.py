# -*- coding: utf-8 -*-
import os, sys, numpy as np
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
HERE = r'C:\\Users\\GuSheng\\Downloads\\HKS\\tools'
sys.path.insert(0, HERE)
import midi2js as M
MID = os.path.join(r'C:\\Users\\GuSheng\\AppData\\Local\\Temp\\thmidi\\touhou-midi-collection-main\\1 - Shooter Games',
                   '6 - The Embodiment of Scarlet Devil', '13. Septette for a Dead Princess (ZUN).mid')
chans, segs, div = M.extract_channels(M.parse_midi(MID))
alln = [n for c in chans.values() for n in c['notes']]
off = min(n['t'] for n in alln)
lead = sorted(chans[3]['notes'], key=lambda n: n['t'])
print('lead 首音 %.2fs 末音 %.2fs 共 %d 音' % (lead[0]['t']-off, lead[-1]['t']+lead[-1]['d']-off, len(lead)))
# 每 8s lead 音数
dur = lead[-1]['t']+lead[-1]['d']-off
for k in range(0, int(dur)+1, 8):
    c = sum(1 for n in lead if k*0.0 <= (n['t']-off-k) < 8 and (n['t']-off) >= k)
    print('  %3d-%3ds  %d 音' % (k, k+8, c))
print('空档 > 2s：')
prev = None
for n in lead:
    if prev is not None and n['t']-prev > 2.0:
        print('  %.2f -> %.2f (%.2fs)' % (prev-off, n['t']-off, n['t']-prev))
    prev = max(n['t']+n['d'], prev) if prev else n['t']+n['d']
print('首段音高序列：', [n['m'] for n in lead[:20]])
