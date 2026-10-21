# -*- coding: utf-8 -*-
"""找出 ch0/ch6 的旋律分段（按 4 小节块统计），并对比游戏内 stage4 覆盖区间。"""
import json, os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels

MID = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
       r'\1 - Shooter Games\9 - Phantasmagoria of Flower View'
       r'\11. Wind God Girl (Kanade_KND34).mid')
midi = parse_midi(MID)
chans, segs, div = extract_channels(midi)
bpm = 60.0 / (segs[0][2] / 1e6)
bar = 240.0 / bpm
print('bpm', round(bpm, 2), 'bar(4/4)', round(bar, 3))

def blocks(ch, bars=4):
    ns = chans[ch]['notes']
    out = {}
    for n in ns:
        b = int(n['t'] / bar / bars)
        out.setdefault(b, []).append(n)
    rows = []
    for b in sorted(out):
        lst = out[b]
        ps = sorted(n['m'] for n in lst)
        rows.append((b, len(lst), ps[0], ps[len(ps)//2], ps[-1]))
    return rows

for ch in (0, 6, 1, 2, 7, 11):
    if ch not in chans: continue
    print('\n--- ch%d (prog %s) 每 %d 小节 ---' % (ch, list(chans[ch]['progs'])[:2], 4))
    for b, c, lo, med, hi in blocks(ch):
        print('  seg%02d  音=%-4d  低%-3d 中%-3d 高%-3d  时间 %5.1f-%5.1f' % (
            b, c, lo, med, hi, b*4*bar, (b+1)*4*bar))
