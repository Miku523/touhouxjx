# -*- coding: utf-8 -*-
"""诊断 D 段铺底：pad 实际音高 vs 该小节和弦（v9）。"""
import importlib.util
import sys

sys.argv = ['x', '--check']
spec = importlib.util.spec_from_file_location('aya', r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py')
m = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(m)
except SystemExit:
    pass

N = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
nm = lambda x: '%s%d' % (N[x % 12], x // 12 - 1)

for bar in range(56, 72):
    ch = m.prog_at(bar)
    pad = [n for n in m.S.tracks['pad']['notes'] if abs(n[0] - bar * m.BAR) < 1e-6]
    print('bar%-3d chord=%-5s tpl=%-12s pad=%s' % (
        bar, ch, m.CHORDS[ch][1], ','.join(nm(n[1]) for n in pad)))
