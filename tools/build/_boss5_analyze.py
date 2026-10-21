# -*- coding: utf-8 -*-
"""四首 5 面首领参考曲 + 原曲 MIDI 解剖 → _boss5_features.json"""
import sys, json, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools\build')
import numpy as np
import _ref5_lib as L

DEST = r'C:\Users\GuSheng\AppData\Local\Temp\ghostly_ref_site\boss5'
out = {}
for tag in ('refA', 'refB', 'refC', 'refD'):
    p = os.path.join(DEST, tag + '.mp3')
    d = L.analyze(p, verbose=True)
    d['bars'] = d['bars'][:160]
    out[tag] = d
json.dump(out, open(r'C:\Users\GuSheng\Downloads\HKS\tools\build\_boss5_features.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('saved refs')
