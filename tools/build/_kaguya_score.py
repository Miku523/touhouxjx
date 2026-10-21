# -*- coding: utf-8 -*-
"""把《竹取飛翔 ～ Lunatic Princess》MIDI 量化成 16 分网格乐谱，供编曲脚本使用。
输出 tools/build/_kaguya_score.json:
{ "bpm_orig":128, "step":0.1172, "bar_sec":1.875, "bars":N, "duration":…,
  "ch": {"0": [[bar, step, midi, len_steps, vel], …], …} }
"""
import json
import os
import sys

import numpy as np

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from midi2js import parse_midi, extract_channels  # noqa: E402

MID = (r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main'
       r'\1 - Shooter Games\8 - Imperishable Night'
       r'\15. Flight in the Bamboo Cutter ~ Lunatic Princess (ZUN).mid')

midi = parse_midi(MID)
chans, segs, div = extract_channels(midi)
bpm = 60.0 / (segs[0][2] / 1e6)
step = 60.0 / bpm / 4
bar_sec = step * 16
dur = max(n['t'] + n['d'] for c in chans.values() for n in c['notes'])
nbars = int(np.ceil(dur / bar_sec))

grid = {}
for ch, c in chans.items():
    g = []
    for n in c['notes']:
        s = round(n['t'] / step)
        b, si = divmod(s, 16)
        ls = max(1, round(n['d'] / step))
        g.append([b, si, n['m'], ls, n['v']])
    g.sort(key=lambda x: (x[0], x[1], -x[2]))
    grid[ch] = g

data = {'bpm_orig': bpm, 'step': step, 'bar_sec': bar_sec, 'bars': nbars,
        'duration': dur, 'ch': {str(k): v for k, v in grid.items()}}
out = os.path.join(ROOT, 'tools', 'build', '_kaguya_score.json')
json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
print('bars %d  bpm %.2f  step %.4f  dur %.2f -> %s' % (nbars, bpm, step, dur, out))
for ch in sorted(grid):
    print('  ch%-3s %5d 音  bar %d-%d' % (ch, len(grid[ch]), grid[ch][0][0] + 1, grid[ch][-1][0] + 1))
