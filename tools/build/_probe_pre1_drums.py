# -*- coding: utf-8 -*-
import sys, os, json, re
ROOT = r'C:\Users\GuSheng\Downloads\HKS'
sys.path.insert(0, os.path.join(ROOT,'tools'))
import midi2js as M
MID = os.path.join(r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games','6 - The Embodiment of Scarlet Devil','2. A Soul that is Red, like a Ground Cherry (ZUN).mid')
midi = M.parse_midi(MID)
chans, segs, div = M.extract_channels(midi)
bpm = M.bpm_of(segs)
e = 60.0/bpm/4.0   # 16分
print('bpm %.2f  16分 %.4fs' % (bpm, e))
dr = sorted([n for n in chans[9]['notes']], key=lambda n:n['t'])
# 只看 bar13-29 (A段) 的鼓型
t0 = 12*4*60.0/bpm  # bar13 起点
t1 = 28*4*60.0/bpm
seg=[n for n in dr if t0<=n['t']<t0+8*60.0/bpm]
print('A段前2小节鼓序列（t, pitch, v）:')
for n in seg:
    print('  %.3f  p%3d  v%3d   %s' % (n['t'], n['m'], n['v'], 'tomskip' if n['m'] in (41,45,48) else ''))
