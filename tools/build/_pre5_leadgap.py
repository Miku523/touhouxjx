# -*- coding: utf-8 -*-
import sys, os
R = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(R, 'tools'))
import midi2js as M
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games',
                   '7 - Perfect Cherry Blossom', '11. Hiroari Shoots a Strange Bird ~ Till When (ZUN).mid')
ch, segs, div = M.extract_channels(M.parse_midi(MID))
t0 = 1.548
notes = sorted((n for n in ch[0]['notes'] if n['t'] >= t0), key=lambda n: n['t'])
# 真实静默空隙（考虑时值）
cur = t0; silent = []
for n in notes:
    if n['t'] > cur + 0.05:
        silent.append((round(cur - t0, 2), round(n['t'] - t0, 2)))
    cur = max(cur, n['t'] + n['d'])
print('静默段（相对秒）:', silent[:20], '共', len(silent))
print('最长静默 %.2fs' % (max([b - a for a, b in silent]) if silent else 0))
# 主体 32.5-48s 的旋律明细
body = [n for n in notes if 32.5 <= n['t'] < 48]
print('32.5-48s 音符 %d 个：' % len(body))
print([(round(n['t']-t0,2), n['m'], round(n['d'],2)) for n in body])
