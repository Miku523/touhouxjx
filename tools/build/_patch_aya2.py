# -*- coding: utf-8 -*-
import os
P = r'C:\Users\GuSheng\Downloads\HKS\tools\aya_stage4.py'
raw = open(P, 'rb').read().decode('utf-8')
t = raw.replace('\r\n', '\n')
a = "'Edim': (4,  [0, 3, 6]),     # 原曲 bar27/40/67（E G A#）\n\n# ----"
b = "'Edim': (4,  [0, 3, 6]),     # 原曲 bar27/40/67（E G A#）\n}\n\n# ----"
assert a in t
t = t.replace(a, b, 1)
c = "          'F#m', 'D', 'E', 'F#m', 'F#m7', 'D', 'E', 'F#m']\n}\n\nFM_PALETTE"
d = "          'F#m', 'D', 'E', 'F#m', 'F#m7', 'D', 'E', 'F#m']\n\nFM_PALETTE"
assert c in t
t = t.replace(c, d, 1)
open(P, 'wb').write(t.replace('\n', '\r\n').encode('utf-8'))
print('fixed brace')
