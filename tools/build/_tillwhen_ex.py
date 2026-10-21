# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
f = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\7 - Perfect Cherry Blossom\11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid'
chans, segs, div = M.extract_channels(M.parse_midi(f))
for ch in (0, 6, 7, 10, 11):
    ns = sorted([n for n in chans[ch]['notes'] if 32.4 <= n['t'] < 36.0], key=lambda n: n['t'])
    print('\nch%-2d 32.4-36.0:' % ch, [(round(n['t'],2), n['m'], round(n['d'],2)) for n in ns][:26])
print('\n--- ch0 1.5-8 ---')
ns = sorted([n for n in chans[0]['notes'] if 1.5 <= n['t'] < 8], key=lambda n: n['t'])
print([(round(n['t'],2), n['m'], round(n['d'],2)) for n in ns][:26])
print('\n--- ch5 7.7-12 ---')
ns = sorted([n for n in chans[5]['notes'] if 7.7 <= n['t'] < 12], key=lambda n: n['t'])
print([(round(n['t'],2), n['m'], round(n['d'],2)) for n in ns][:30])
print('\n--- ch1 32.4-40 ---')
ns = sorted([n for n in chans[1]['notes'] if 32.4 <= n['t'] < 40], key=lambda n: n['t'])
print([(round(n['t'],2), n['m'], round(n['d'],2)) for n in ns][:20])
