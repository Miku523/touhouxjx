# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import numpy as np, preview_song as P
song = P.load_song(r'C:\Users\GuSheng\Downloads\HKS\src/engine/songs/yuuga_stage5.js', 'YUGA_STAGE5', 'stage5')
y = P.render(song, loops=1)
sr = P.SR
print('--- 每 0.25s RMS（10.5–16.0s）---')
row=[]
for a in np.arange(10.5, 16.0, 0.25):
    i0, i1 = int(a*sr), int((a+0.25)*sr)
    row.append('%.2f %.3f' % (a, float(np.sqrt(np.mean(y[i0:i1]**2)))))
for i in range(0, len(row), 4):
    print('  '.join(row[i:i+4]))
